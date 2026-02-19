import { Setting as Settings, Notice, DropdownComponent, setIcon } from 'obsidian';
import type { App, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { fetchAnthropicModels } from '../../api/anthropicApi';
import { fetchOpenAiModels } from '../../api/openaiApi';
import { fetchGeminiModels } from '../../api/geminiApi';
import { fetchLocalModels } from '../../api/localAiApi';
import { AiContextModal } from '../AiContextModal';
import { resolveAiLogFolder } from '../../ai/log';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { ERT_CLASSES } from '../../ui/classes';
import { IMPACT_FULL } from '../SettingImpact';
import { buildDefaultAiSettings, mapAiProviderToLegacyProvider } from '../../ai/settings/aiSettings';
import { validateAiSettings } from '../../ai/settings/validateAiSettings';
import { BUILTIN_MODELS, MODEL_PROFILES } from '../../ai/registry/builtinModels';
import {
    mergeCuratedWithSnapshot,
    formatAvailabilityLabel,
    type AvailabilityStatus,
    type MergedModelInfo
} from '../../ai/registry/mergeModels';
import {
    computeRecommendedPicks,
    getAvailabilityIconName,
    getRecommendationComparisonTag,
    type CurrentResolvedModelRef,
    type RecommendationRow
} from '../../ai/registry/recommendations';
import { selectModel } from '../../ai/router/selectModel';
import { computeCaps } from '../../ai/caps/computeCaps';
import { getAIClient } from '../../ai/runtime/aiClient';
import {
    getCredential,
    getCredentialSecretId,
    migrateLegacyKeysToSecretStorage,
    setCredentialSecretId
} from '../../ai/credentials/credentials';
import { getSecret, isSecretStorageAvailable, setSecret } from '../../ai/credentials/secretStorage';
import type { AIProviderId, ModelPolicy, ModelProfileName, Capability, ModelInfo } from '../../ai/types';

type Provider = 'anthropic' | 'gemini' | 'openai' | 'local';

export function renderAiSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    addAiRelatedElement: (el: HTMLElement) => void;
    toggleAiSettingsVisibility: (show: boolean) => void;
    refreshProviderDimming: () => void;
    scheduleKeyValidation: (provider: Provider) => void;
    setProviderSections: (sections: { anthropic?: HTMLElement; gemini?: HTMLElement; openai?: HTMLElement; local?: HTMLElement }) => void;
    setKeyInputRef: (provider: Provider, input: HTMLInputElement | undefined) => void;
    setLocalConnectionInputs: (refs: { baseInput?: HTMLInputElement; modelInput?: HTMLInputElement }) => void;
}): void {
    const { app, plugin, containerEl } = params;
    containerEl.classList.add(ERT_CLASSES.STACK);

    // --- AI for Scene Analysis ---
    const aiHeading = new Settings(containerEl)
        .setName('AI LLM for scene analysis')
        .setHeading();
    addHeadingIcon(aiHeading, 'cpu');
    addWikiLink(aiHeading, 'Settings#ai');
    applyErtHeaderLayout(aiHeading);

    const stackEl = containerEl.createDiv({ cls: ERT_CLASSES.STACK });

    const getActiveTemplateName = (): string => {
        const templates = plugin.settings.aiContextTemplates || [];
        const activeId = plugin.settings.activeAiContextTemplateId;
        const active = templates.find(t => t.id === activeId);
        return active?.name || 'Generic Editor';
    };

    // Enable/disable scene beats features
    // NOTE: This toggle should always be visible (not added to _aiRelatedElements)
    const aiToggleSetting = new Settings(stackEl)
        .setName('Enable AI LLM features')
        .setDesc('Show command palette options and UI scene analysis colors and hover synopsis. When off, these visuals are hidden, but metadata remains unchanged.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableAiSceneAnalysis ?? true)
            .onChange(async (value) => {
                plugin.settings.enableAiSceneAnalysis = value;
                await plugin.saveSettings();
                params.toggleAiSettingsVisibility(value);
                plugin.setInquiryVisible(value);
                plugin.onSettingChanged(IMPACT_FULL); // Tier 3: changes number square colors + AI pulse elements
                updateAiToggleWarning(value);
            }));

    const aiToggleInfo = aiToggleSetting.settingEl.querySelector('.setting-item-info');
    const aiToggleWarning = (aiToggleInfo ?? aiToggleSetting.settingEl).createDiv({ cls: 'ert-ai-toggle-warning' });
    aiToggleWarning.createDiv({ cls: 'ert-ai-toggle-warning-title', text: 'AI features disabled.' });
    const aiToggleWarningList = aiToggleWarning.createEl('ul', { cls: 'ert-ai-toggle-warning-list' });
    [
        'Inquiry mode (signals, prompt slots, and AI briefings).',
        'Scene Analysis / Pulse (hover synopsis, grades, and triplet context).',
        'Gossamer AI analysis and score generation.',
        'AI processing modals (Inquiry, Scene Analysis, Gossamer, and AI runtime estimation).',
        'AI command palette actions and AI log outputs.'
    ].forEach(item => {
        aiToggleWarningList.createEl('li', { text: item });
    });
    aiToggleWarning.createDiv({
        cls: 'ert-ai-toggle-warning-footer',
        text: 'The Radial Timeline and other core features continue to operate.'
    });

    const updateAiToggleWarning = (enabled: boolean) => {
        aiToggleWarning.toggleClass('ert-settings-hidden', enabled);
        aiToggleWarning.toggleClass('ert-settings-visible', !enabled);
    };
    updateAiToggleWarning(plugin.settings.enableAiSceneAnalysis ?? true);

    const aiSettingsGroup = stackEl.createDiv({ cls: ERT_CLASSES.STACK });
    params.addAiRelatedElement(aiSettingsGroup);

    const contextTemplateSetting = new Settings(aiSettingsGroup)
        .setName('AI prompt role & context template')
        .setDesc(`Active: ${getActiveTemplateName()}`)
        .addExtraButton(button => button
            .setIcon('gear')
            .setTooltip('Manage context templates for AI prompt generation and Gossamer score generation')
            .onClick(() => {
                const modal = new AiContextModal(app, plugin, () => {
                    contextTemplateSetting.setDesc(`Active: ${getActiveTemplateName()}`);
                });
                modal.open();
            }));
    params.addAiRelatedElement(contextTemplateSetting.settingEl);

    const tripletDisplaySetting = new Settings(aiSettingsGroup)
        .setName('Show previous and next scene analysis')
        .setDesc('When enabled, scene hover metadata include the AI pulse for the previous and next scenes. Turn off to display only the current scene for a more compact view.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showFullTripletAnalysis ?? true)
            .onChange(async (value) => {
                plugin.settings.showFullTripletAnalysis = value;
                await plugin.saveSettings();
                // Tier 1: triplet display is read at hover time, no SVG change needed
            }));
    params.addAiRelatedElement(tripletDisplaySetting.settingEl);

    const capabilityFloor: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'];
    const providerLabel: Record<AIProviderId, string> = {
        anthropic: 'Anthropic',
        openai: 'OpenAI',
        google: 'Google',
        ollama: 'Ollama',
        none: 'Disabled'
    };

    const ensureCanonicalAiSettings = () => {
        const validated = validateAiSettings(plugin.settings.aiSettings ?? buildDefaultAiSettings());
        plugin.settings.aiSettings = validated.value;
        return plugin.settings.aiSettings;
    };

    const getProviderAliases = (provider: AIProviderId): string[] =>
        BUILTIN_MODELS
            .filter(model => model.provider === provider && model.status !== 'deprecated')
            .map(model => model.alias);

    const getProviderDefaultAlias = (provider: AIProviderId): string | undefined =>
        BUILTIN_MODELS.find(model => model.provider === provider && model.status === 'stable')?.alias
        ?? BUILTIN_MODELS.find(model => model.provider === provider)?.alias;

    const getAccessTier = (provider: AIProviderId): 1 | 2 | 3 => {
        const aiSettings = ensureCanonicalAiSettings();
        if (provider === 'anthropic') return aiSettings.aiAccessProfile.anthropicTier ?? 1;
        if (provider === 'openai') return aiSettings.aiAccessProfile.openaiTier ?? 1;
        if (provider === 'google') return aiSettings.aiAccessProfile.googleTier ?? 1;
        return 1;
    };

    const setAccessTier = (provider: AIProviderId, tier: 1 | 2 | 3): void => {
        const aiSettings = ensureCanonicalAiSettings();
        if (provider === 'anthropic') aiSettings.aiAccessProfile.anthropicTier = tier;
        if (provider === 'openai') aiSettings.aiAccessProfile.openaiTier = tier;
        if (provider === 'google') aiSettings.aiAccessProfile.googleTier = tier;
    };

    const syncLegacyFromCanonical = (): void => {
        const aiSettings = ensureCanonicalAiSettings();
        const provider = aiSettings.provider === 'none' ? 'openai' : aiSettings.provider;
        const legacyProvider = mapAiProviderToLegacyProvider(provider);
        plugin.settings.defaultAiProvider = legacyProvider;

        const policy = aiSettings.modelPolicy;
        if (policy.type === 'pinned' && policy.pinnedAlias) {
            const pinned = BUILTIN_MODELS.find(model => model.alias === policy.pinnedAlias);
            if (pinned) {
                if (pinned.provider === 'anthropic') plugin.settings.anthropicModelId = pinned.id;
                if (pinned.provider === 'openai') plugin.settings.openaiModelId = pinned.id;
                if (pinned.provider === 'google') plugin.settings.geminiModelId = pinned.id;
                if (pinned.provider === 'ollama') plugin.settings.localModelId = pinned.id;
            }
        }

        plugin.settings.localBaseUrl = aiSettings.connections?.ollamaBaseUrl ?? plugin.settings.localBaseUrl;
    };

    const persistCanonical = async (): Promise<void> => {
        ensureCanonicalAiSettings();
        syncLegacyFromCanonical();
        await plugin.saveSettings();
        params.refreshProviderDimming();
    };

    const aiCoreHeading = new Settings(aiSettingsGroup)
        .setName('AI core routing')
        .setDesc('Provider, policy, and capability-driven routing for Inquiry and other AI features.');
    params.addAiRelatedElement(aiCoreHeading.settingEl);

    const providerSetting = new Settings(aiSettingsGroup)
        .setName('Provider')
        .setDesc('Choose the AI provider. Provider-specific credentials and local connection fields are shown below.');
    let providerDropdown: DropdownComponent | null = null;
    providerSetting.addDropdown(dropdown => {
        providerDropdown = dropdown;
        dropdown.addOption('anthropic', 'Anthropic');
        dropdown.addOption('openai', 'OpenAI');
        dropdown.addOption('google', 'Google');
        dropdown.addOption('ollama', 'Ollama / Local');
        dropdown.onChange(async value => {
            const aiSettings = ensureCanonicalAiSettings();
            const nextProvider = value as AIProviderId;
            aiSettings.provider = nextProvider;

            if (aiSettings.modelPolicy.type === 'pinned') {
                const allowed = new Set(getProviderAliases(nextProvider));
                if (!aiSettings.modelPolicy.pinnedAlias || !allowed.has(aiSettings.modelPolicy.pinnedAlias)) {
                    aiSettings.modelPolicy.pinnedAlias = getProviderDefaultAlias(nextProvider);
                }
            }

            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(providerSetting.settingEl);

    const policySetting = new Settings(aiSettingsGroup)
        .setName('Model policy')
        .setDesc('Pinned keeps an explicit model identity. Profile and latest policies choose from compatible models at runtime.');
    let policyDropdown: DropdownComponent | null = null;
    policySetting.addDropdown(dropdown => {
        policyDropdown = dropdown;
        dropdown.addOption('pinned', 'Pinned model');
        dropdown.addOption('profile', 'Profile');
        dropdown.addOption('latestStable', 'Latest stable');
        dropdown.addOption('latestFast', 'Latest fast');
        dropdown.addOption('latestCheap', 'Latest cheap');
        dropdown.onChange(async value => {
            const aiSettings = ensureCanonicalAiSettings();
            if (value === 'pinned') {
                aiSettings.modelPolicy = {
                    type: 'pinned',
                    pinnedAlias: getProviderDefaultAlias(aiSettings.provider === 'none' ? 'openai' : aiSettings.provider)
                };
            } else if (value === 'profile') {
                aiSettings.modelPolicy = { type: 'profile', profile: 'deepReasoner' };
            } else {
                aiSettings.modelPolicy = { type: value as Exclude<ModelPolicy['type'], 'pinned' | 'profile'> };
            }
            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(policySetting.settingEl);

    const pinnedSetting = new Settings(aiSettingsGroup)
        .setName('Pinned model alias')
        .setDesc('Stable alias preserved across provider model ID churn (example: claude-sonnet-4.5).');
    let pinnedDropdown: DropdownComponent | null = null;
    pinnedSetting.addDropdown(dropdown => {
        pinnedDropdown = dropdown;
        dropdown.onChange(async value => {
            const aiSettings = ensureCanonicalAiSettings();
            if (aiSettings.modelPolicy.type !== 'pinned') return;
            aiSettings.modelPolicy.pinnedAlias = value;
            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(pinnedSetting.settingEl);

    const profileSetting = new Settings(aiSettingsGroup)
        .setName('Model profile')
        .setDesc('Apply qualitative preference scoring after capability-floor filtering.');
    let profileDropdown: DropdownComponent | null = null;
    profileSetting.addDropdown(dropdown => {
        profileDropdown = dropdown;
        dropdown.addOption('deepReasoner', 'deepReasoner');
        dropdown.addOption('deepWriter', 'deepWriter');
        dropdown.addOption('balancedAnalysis', 'balancedAnalysis');
        dropdown.onChange(async value => {
            const aiSettings = ensureCanonicalAiSettings();
            aiSettings.modelPolicy = { type: 'profile', profile: value as ModelProfileName };
            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(profileSetting.settingEl);

    const accessTierSetting = new Settings(aiSettingsGroup)
        .setName('Access tier')
        .setDesc('Controls request throughput, retry behavior, and output caps for the selected provider.');
    let accessTierDropdown: DropdownComponent | null = null;
    accessTierSetting.addDropdown(dropdown => {
        accessTierDropdown = dropdown;
        dropdown.addOption('1', 'Tier 1');
        dropdown.addOption('2', 'Tier 2');
        dropdown.addOption('3', 'Tier 3');
        dropdown.onChange(async value => {
            const aiSettings = ensureCanonicalAiSettings();
            const provider = aiSettings.provider;
            if (provider === 'anthropic' || provider === 'openai' || provider === 'google') {
                setAccessTier(provider, Number(value) as 1 | 2 | 3);
                await persistCanonical();
                refreshRoutingUi();
            }
        });
    });
    params.addAiRelatedElement(accessTierSetting.settingEl);

    const outputModeSetting = new Settings(aiSettingsGroup)
        .setName('Output cap')
        .setDesc('Auto follows safe defaults. High and Max use progressively larger output budgets.');
    let outputModeDropdown: DropdownComponent | null = null;
    outputModeSetting.addDropdown(dropdown => {
        outputModeDropdown = dropdown;
        dropdown.addOption('auto', 'Auto');
        dropdown.addOption('high', 'High');
        dropdown.addOption('max', 'Max');
        dropdown.onChange(async value => {
            const aiSettings = ensureCanonicalAiSettings();
            aiSettings.overrides.maxOutputMode = value as 'auto' | 'high' | 'max';
            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(outputModeSetting.settingEl);

    const reasoningDepthSetting = new Settings(aiSettingsGroup)
        .setName('Reasoning depth')
        .setDesc('Standard for speed; Deep for higher-precision structural analysis.');
    let reasoningDepthDropdown: DropdownComponent | null = null;
    reasoningDepthSetting.addDropdown(dropdown => {
        reasoningDepthDropdown = dropdown;
        dropdown.addOption('standard', 'Standard');
        dropdown.addOption('deep', 'Deep');
        dropdown.onChange(async value => {
            const aiSettings = ensureCanonicalAiSettings();
            aiSettings.overrides.reasoningDepth = value as 'standard' | 'deep';
            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(reasoningDepthSetting.settingEl);

    const remoteRegistrySetting = new Settings(aiSettingsGroup)
        .setName('Remote model registry')
        .setDesc('Optional weekly-refresh model metadata. Built-in aliases are always available offline.');
    let remoteRegistryToggle: { setValue: (value: boolean) => unknown } | null = null;
    remoteRegistrySetting.addToggle(toggle => {
        remoteRegistryToggle = toggle;
        return toggle
            .setValue(ensureCanonicalAiSettings().privacy.allowRemoteRegistry)
            .onChange(async value => {
                const aiSettings = ensureCanonicalAiSettings();
                aiSettings.privacy.allowRemoteRegistry = value;
                await persistCanonical();
                refreshRoutingUi();
            });
    });
    params.addAiRelatedElement(remoteRegistrySetting.settingEl);

    const providerSnapshotSetting = new Settings(aiSettingsGroup)
        .setName('Provider snapshot')
        .setDesc('Optional provider-availability snapshot to show which models are visible to your API key.');
    let providerSnapshotToggle: { setValue: (value: boolean) => unknown } | null = null;
    providerSnapshotSetting.addToggle(toggle => {
        providerSnapshotToggle = toggle;
        return toggle
            .setValue(ensureCanonicalAiSettings().privacy.allowProviderSnapshot)
            .onChange(async value => {
                const aiSettings = ensureCanonicalAiSettings();
                aiSettings.privacy.allowProviderSnapshot = value;
                await persistCanonical();
                refreshRoutingUi();
            });
    });
    params.addAiRelatedElement(providerSnapshotSetting.settingEl);

    const refreshModelsSetting = new Settings(aiSettingsGroup)
        .setName('Refresh models')
        .setDesc('Fetch the latest model registry and update alias-to-model mappings.');
    refreshModelsSetting.addButton(button => button
        .setButtonText('Refresh now')
        .onClick(async () => {
            button.setDisabled(true);
            try {
                const client = getAIClient(plugin);
                await client.refreshRegistry(true);
                new Notice('Model registry refreshed.');
                await refreshModelsTable({ forceRemoteRegistry: true });
                refreshRoutingUi();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                new Notice(`Model refresh failed: ${message}`);
            } finally {
                button.setDisabled(false);
            }
        }));
    params.addAiRelatedElement(refreshModelsSetting.settingEl);

    const refreshAvailabilitySetting = new Settings(aiSettingsGroup)
        .setName('Refresh availability')
        .setDesc('Fetch provider snapshot data for model visibility and provider-reported caps.');
    refreshAvailabilitySetting.addButton(button => button
        .setButtonText('Refresh availability')
        .onClick(async () => {
            const aiSettings = ensureCanonicalAiSettings();
            if (!aiSettings.privacy.allowProviderSnapshot) {
                new Notice('Enable Provider snapshot first to refresh availability.');
                return;
            }
            button.setDisabled(true);
            try {
                await getAIClient(plugin).refreshProviderSnapshot(true);
                await refreshModelsTable({ forceRemoteSnapshot: true });
                new Notice('Provider snapshot refreshed.');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                new Notice(`Availability refresh failed: ${message}`);
            } finally {
                button.setDisabled(false);
            }
        }));
    params.addAiRelatedElement(refreshAvailabilitySetting.settingEl);

    const modelsPanel = aiSettingsGroup.createDiv({ cls: ['ert-panel', ERT_CLASSES.STACK, 'ert-ai-models-panel'] });
    const modelsHeader = modelsPanel.createDiv({ cls: 'ert-inline ert-inline--split' });
    modelsHeader.createDiv({ cls: 'ert-section-title', text: 'Models' });
    const modelsRefreshedEl = modelsHeader.createDiv({ cls: 'ert-ai-models-refreshed' });
    const modelsHintEl = modelsPanel.createDiv({ cls: 'ert-field-note' });
    const recommendationsEl = modelsPanel.createDiv({ cls: 'ert-ai-recommendations ert-stack' });
    const modelsTableEl = modelsPanel.createDiv({ cls: 'ert-ai-models-table ert-stack' });
    const modelDetailsEl = modelsPanel.createDiv({ cls: 'ert-ai-model-details ert-settings-hidden' });
    params.addAiRelatedElement(modelsPanel);

    const matchesProfile = (model: ModelInfo, profileName: ModelProfileName): boolean => {
        const profile = MODEL_PROFILES[profileName];
        if (profile.tier && model.tier !== profile.tier) return false;
        if (typeof profile.minReasoning === 'number' && model.personality.reasoning < profile.minReasoning) return false;
        if (typeof profile.minWriting === 'number' && model.personality.writing < profile.minWriting) return false;
        if (typeof profile.minDeterminism === 'number' && model.personality.determinism < profile.minDeterminism) return false;
        if (profile.requiredCapabilities && !profile.requiredCapabilities.every(capability => model.capabilities.includes(capability))) return false;
        return true;
    };

    const getBestForTags = (model: ModelInfo): string[] => {
        const tags: string[] = [];
        (['deepReasoner', 'deepWriter', 'balancedAnalysis'] as ModelProfileName[]).forEach(profile => {
            if (matchesProfile(model, profile)) tags.push(profile);
        });
        if (model.tier === 'FAST' || model.tier === 'LOCAL') {
            tags.push('fastRewrite');
        }
        return Array.from(new Set(tags)).slice(0, 3);
    };

    const formatContextOutput = (model: MergedModelInfo): string => {
        if (model.providerCaps?.inputTokenLimit || model.providerCaps?.outputTokenLimit) {
            const input = model.providerCaps.inputTokenLimit ? model.providerCaps.inputTokenLimit.toLocaleString() : '—';
            const output = model.providerCaps.outputTokenLimit ? model.providerCaps.outputTokenLimit.toLocaleString() : '—';
            return `${input} / ${output} (provider)`;
        }
        if (model.contextWindow || model.maxOutput) {
            return `${model.contextWindow.toLocaleString()} / ${model.maxOutput.toLocaleString()} (curated)`;
        }
        return 'Unknown';
    };

    const formatRecommendationModel = (row: RecommendationRow): string => {
        if (!row.model) return 'No eligible model';
        const name = row.model.providerLabel || row.model.label;
        return `${providerLabel[row.model.provider]} -> ${name} (${row.model.alias})`;
    };

    const renderRecommendations = (
        rows: RecommendationRow[],
        currentSelection: CurrentResolvedModelRef | null,
        snapshotEnabled: boolean
    ): void => {
        recommendationsEl.empty();
        const title = recommendationsEl.createDiv({ cls: 'ert-ai-recommendations-title' });
        title.setText('Recommended picks');

        rows.forEach(row => {
            const item = recommendationsEl.createDiv({ cls: 'ert-ai-recommendation-row' });
            item.createDiv({ cls: 'ert-ai-recommendation-name', text: row.title });

            const value = item.createDiv({ cls: 'ert-ai-recommendation-value' });
            const iconEl = value.createSpan({ cls: 'ert-ai-recommendation-icon' });
            setIcon(iconEl, getAvailabilityIconName(row.availabilityStatus));
            value.createSpan({ cls: 'ert-ai-recommendation-model', text: formatRecommendationModel(row) });
            value.createSpan({ cls: 'ert-ai-recommendation-why', text: row.shortReason });

            const comparisonTag = getRecommendationComparisonTag(row, currentSelection);
            if (comparisonTag) {
                value.createSpan({
                    cls: 'ert-badgePill ert-badgePill--sm ert-ai-recommendation-status',
                    text: comparisonTag
                });
            }

            if (row.availabilityStatus === 'unknown') {
                const hint = item.createDiv({
                    cls: 'ert-ai-recommendation-hint',
                    text: 'Enable Provider Snapshot for key-based visibility. This only fetches model metadata and availability.'
                });

                if (!snapshotEnabled) {
                    const action = hint.createEl('button', {
                        cls: 'ert-ai-recommendation-action',
                        attr: { type: 'button' },
                        text: 'Enable + refresh'
                    });
                    action.addEventListener('click', async (event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        action.disabled = true;
                        try {
                            const aiSettings = ensureCanonicalAiSettings();
                            if (!aiSettings.privacy.allowProviderSnapshot) {
                                aiSettings.privacy.allowProviderSnapshot = true;
                                await persistCanonical();
                            }
                            await getAIClient(plugin).refreshProviderSnapshot(true);
                            await refreshModelsTable({ forceRemoteSnapshot: true });
                            new Notice('Provider snapshot enabled and refreshed.');
                        } catch (error) {
                            const message = error instanceof Error ? error.message : String(error);
                            new Notice(`Snapshot refresh failed: ${message}`);
                        } finally {
                            action.disabled = false;
                        }
                    });
                }
            }
            if (row.reason) {
                item.setAttr('title', row.reason);
            }
        });
    };

    const renderModelDetails = (
        model: MergedModelInfo,
        selection: { alias: string; reason: string } | null
    ): void => {
        modelDetailsEl.empty();
        modelDetailsEl.removeClass('ert-settings-hidden');
        modelDetailsEl.addClass('ert-settings-visible');

        const heading = modelDetailsEl.createDiv({ cls: 'ert-ai-model-details-title' });
        heading.setText(`${providerLabel[model.provider]} · ${model.label}`);
        modelDetailsEl.createDiv({ cls: 'ert-field-note', text: `Alias: ${model.alias} · Provider ID: ${model.providerModelId}` });

        const statusRow = modelDetailsEl.createDiv({ cls: 'ert-inline' });
        statusRow.createSpan({ cls: 'ert-badgePill ert-badgePill--sm', text: `Status: ${model.status}` });
        statusRow.createSpan({ cls: 'ert-badgePill ert-badgePill--sm', text: `Tier: ${model.tier}` });
        statusRow.createSpan({ cls: 'ert-badgePill ert-badgePill--sm', text: formatAvailabilityLabel(model.availabilityStatus) });

        const providerMeta = modelDetailsEl.createDiv({ cls: 'ert-field-note' });
        providerMeta.setText(
            `Provider label: ${model.providerLabel || '—'} · Created: ${model.providerCreatedAt || '—'} · Context/Output: ${formatContextOutput(model)}`
        );

        const personality = modelDetailsEl.createDiv({ cls: 'ert-field-note' });
        personality.setText(
            `Personality: reasoning ${model.personality.reasoning}/10, writing ${model.personality.writing}/10, determinism ${model.personality.determinism}/10`
        );

        const aiSettings = ensureCanonicalAiSettings();
        const tier = model.provider === 'anthropic' || model.provider === 'openai' || model.provider === 'google'
            ? getAccessTier(model.provider)
            : 1;
        const effective = computeCaps({
            provider: model.provider,
            model,
            accessTier: tier,
            feature: 'InquiryMode',
            overrides: aiSettings.overrides
        });
        modelDetailsEl.createDiv({
            cls: 'ert-field-note',
            text: `Effective caps preview: input=${effective.maxInputTokens.toLocaleString()}, output=${effective.maxOutputTokens.toLocaleString()}, tier=${tier}`
        });

        const why = modelDetailsEl.createDiv({ cls: 'ert-field-note' });
        if (selection && selection.alias === model.alias) {
            why.setText(`Why selected now: ${selection.reason}`);
        } else {
            why.setText('Why selected now: Not the currently resolved model for your active provider/policy.');
        }

        if (model.capsMismatch) {
            const curatedInput = model.capsMismatch.curated?.inputTokenLimit;
            const providerInput = model.capsMismatch.provider?.inputTokenLimit;
            const curatedOutput = model.capsMismatch.curated?.outputTokenLimit;
            const providerOutput = model.capsMismatch.provider?.outputTokenLimit;
            modelDetailsEl.createDiv({
                cls: 'ert-ai-model-warning',
                text: `Caps mismatch (display only): curated input/output ${curatedInput ?? '—'}/${curatedOutput ?? '—'} vs provider ${providerInput ?? '—'}/${providerOutput ?? '—'}.`
            });
        }

        const rawDetails = modelDetailsEl.createEl('details', { cls: 'ert-ai-model-raw' });
        rawDetails.createEl('summary', { text: 'Show raw provider metadata' });
        rawDetails.createEl('pre', { cls: 'ert-ai-model-raw-pre', text: JSON.stringify(model.raw || {}, null, 2) });
    };

    const renderModelsTable = (
        mergedModels: MergedModelInfo[],
        selection: { alias: string; reason: string } | null
    ): void => {
        modelsTableEl.empty();
        const header = modelsTableEl.createDiv({ cls: 'ert-ai-models-row ert-ai-models-row--header' });
        ['Model', 'Availability', 'Context / Output', 'Supports', 'Best for'].forEach(label => {
            header.createDiv({ cls: 'ert-ai-models-cell', text: label });
        });

        const providerOrder: AIProviderId[] = ['anthropic', 'openai', 'google', 'ollama'];
        providerOrder.forEach(provider => {
            const rows = mergedModels.filter(model => model.provider === provider);
            if (!rows.length) return;

            const group = modelsTableEl.createDiv({ cls: 'ert-ai-models-provider' });
            group.setText(providerLabel[provider]);

            rows.forEach(model => {
                const rowButton = modelsTableEl.createEl('button', {
                    cls: 'ert-ai-models-row',
                    attr: { type: 'button' }
                });

                const modelCell = rowButton.createDiv({ cls: 'ert-ai-models-cell ert-ai-models-cell--model' });
                const providerMark = modelCell.createSpan({ cls: 'ert-ai-models-provider-mark' });
                providerMark.setText(model.provider === 'anthropic' ? 'A' : model.provider === 'openai' ? 'O' : model.provider === 'google' ? 'G' : 'L');
                modelCell.createSpan({ cls: 'ert-ai-models-name', text: model.providerLabel || model.label });
                modelCell.createSpan({ cls: 'ert-ai-models-alias', text: model.alias });

                rowButton.createDiv({ cls: 'ert-ai-models-cell', text: formatAvailabilityLabel(model.availabilityStatus) });
                rowButton.createDiv({ cls: 'ert-ai-models-cell', text: formatContextOutput(model) });

                const supportsCell = rowButton.createDiv({ cls: 'ert-ai-models-cell ert-ai-models-tags' });
                ['jsonStrict', 'toolCalling', 'vision', 'streaming', 'longContext'].forEach(capability => {
                    if (!model.capabilities.includes(capability as Capability)) return;
                    supportsCell.createSpan({ cls: 'ert-badgePill ert-badgePill--sm', text: capability });
                });

                const bestForCell = rowButton.createDiv({ cls: 'ert-ai-models-cell ert-ai-models-tags' });
                getBestForTags(model).forEach(tag => {
                    bestForCell.createSpan({ cls: 'ert-badgePill ert-badgePill--sm', text: tag });
                });

                rowButton.addEventListener('click', () => renderModelDetails(model, selection));
            });
        });
    };

    const refreshModelsTable = async (options?: { forceRemoteRegistry?: boolean; forceRemoteSnapshot?: boolean }): Promise<void> => {
        modelsRefreshedEl.setText('Loading...');
        modelsHintEl.setText('Merging curated registry with provider snapshot...');
        recommendationsEl.empty();
        modelsTableEl.empty();

        try {
            const client = getAIClient(plugin);
            const [curatedModels, snapshot] = await Promise.all([
                client.getRegistryModels(options?.forceRemoteRegistry),
                client.getProviderSnapshot(options?.forceRemoteSnapshot)
            ]);

            const curated = curatedModels.filter(model => model.provider !== 'none');
            const merged = mergeCuratedWithSnapshot(curated, snapshot.snapshot);
            const aiSettings = ensureCanonicalAiSettings();
            const selectedProvider = aiSettings.provider === 'none' ? 'openai' : aiSettings.provider;
            let selection: { alias: string; reason: string } | null = null;
            let currentSelection: CurrentResolvedModelRef | null = null;
            try {
                const resolved = selectModel(curated, {
                    provider: selectedProvider,
                    policy: aiSettings.modelPolicy,
                    requiredCapabilities: capabilityFloor,
                    accessTier: getAccessTier(selectedProvider),
                    contextTokensNeeded: 24000,
                    outputTokensNeeded: 2000
                });
                selection = { alias: resolved.model.alias, reason: resolved.reason };
                const mergedCurrent = merged.find(model =>
                    model.provider === resolved.model.provider
                    && (model.alias === resolved.model.alias || model.providerModelId === resolved.model.id)
                );
                const availabilityStatus: AvailabilityStatus = mergedCurrent?.availabilityStatus ?? 'unknown';
                currentSelection = {
                    provider: resolved.model.provider,
                    alias: resolved.model.alias,
                    modelId: resolved.model.id,
                    availabilityStatus
                };
            } catch {
                selection = null;
                currentSelection = null;
            }

            if (snapshot.snapshot) {
                modelsRefreshedEl.setText(`Last refreshed: ${snapshot.snapshot.generatedAt}`);
                modelsHintEl.setText(snapshot.warning || 'Availability reflects the latest provider snapshot.');
            } else {
                modelsRefreshedEl.setText('Last refreshed: unavailable');
                modelsHintEl.setText('Enable Provider Snapshot to show key-based availability.');
            }

            const picks = computeRecommendedPicks({
                models: merged,
                aiSettings,
                includeLocalPrivate: aiSettings.provider === 'ollama'
            });
            renderRecommendations(picks, currentSelection, aiSettings.privacy.allowProviderSnapshot);
            renderModelsTable(merged, selection);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            modelsRefreshedEl.setText('Last refreshed: error');
            modelsHintEl.setText(`Unable to render models table: ${message}`);
            recommendationsEl.empty();
        }
    };

    const resolvedPreviewSetting = new Settings(aiSettingsGroup)
        .setName('Resolved model preview')
        .setDesc('Resolving...');
    params.addAiRelatedElement(resolvedPreviewSetting.settingEl);

    const upgradeBannerSetting = new Settings(aiSettingsGroup)
        .setName('AI settings upgraded')
        .setDesc('Your AI settings were upgraded to capability-based routing. Review and confirm your provider and policy choices.');
    upgradeBannerSetting.addButton(button => button
        .setButtonText('Dismiss')
        .onClick(async () => {
            const aiSettings = ensureCanonicalAiSettings();
            aiSettings.upgradedBannerPending = false;
            await persistCanonical();
            refreshRoutingUi();
        }));
    params.addAiRelatedElement(upgradeBannerSetting.settingEl);

    const refreshRoutingUi = (): void => {
        const aiSettings = ensureCanonicalAiSettings();
        const provider = aiSettings.provider === 'none' ? 'openai' : aiSettings.provider;
        const providerAliases = getProviderAliases(provider);
        const policy = aiSettings.modelPolicy;

        providerDropdown?.setValue(provider);
        policyDropdown?.setValue(policy.type);

        if (pinnedDropdown) {
            pinnedDropdown.selectEl.empty();
            providerAliases.forEach(alias => {
                const model = BUILTIN_MODELS.find(entry => entry.alias === alias);
                const label = model ? `${model.label} (${alias})` : alias;
                pinnedDropdown?.addOption(alias, label);
            });
            const pinnedAlias = policy.type === 'pinned'
                ? policy.pinnedAlias || getProviderDefaultAlias(provider) || providerAliases[0]
                : getProviderDefaultAlias(provider) || providerAliases[0];
            if (policy.type === 'pinned' && pinnedAlias && providerAliases.length) {
                pinnedDropdown.setValue(providerAliases.includes(pinnedAlias) ? pinnedAlias : providerAliases[0]);
            }
        }

        profileDropdown?.setValue(policy.type === 'profile' ? policy.profile : 'deepReasoner');
        outputModeDropdown?.setValue(aiSettings.overrides.maxOutputMode || 'auto');
        reasoningDepthDropdown?.setValue(aiSettings.overrides.reasoningDepth || 'standard');
        remoteRegistryToggle?.setValue(aiSettings.privacy.allowRemoteRegistry);
        providerSnapshotToggle?.setValue(aiSettings.privacy.allowProviderSnapshot);

        const shouldShowPinned = policy.type === 'pinned';
        const shouldShowProfile = policy.type === 'profile';
        pinnedSetting.settingEl.toggleClass('ert-settings-hidden', !shouldShowPinned);
        pinnedSetting.settingEl.toggleClass('ert-settings-visible', shouldShowPinned);
        profileSetting.settingEl.toggleClass('ert-settings-hidden', !shouldShowProfile);
        profileSetting.settingEl.toggleClass('ert-settings-visible', shouldShowProfile);

        const supportsAccessTier = provider === 'anthropic' || provider === 'openai' || provider === 'google';
        accessTierSetting.settingEl.toggleClass('ert-settings-hidden', !supportsAccessTier);
        accessTierSetting.settingEl.toggleClass('ert-settings-visible', supportsAccessTier);
        if (supportsAccessTier) {
            accessTierDropdown?.setValue(String(getAccessTier(provider)));
        }

        upgradeBannerSetting.settingEl.toggleClass('ert-settings-hidden', !aiSettings.upgradedBannerPending);
        upgradeBannerSetting.settingEl.toggleClass('ert-settings-visible', !!aiSettings.upgradedBannerPending);

        try {
            const selection = selectModel(BUILTIN_MODELS, {
                provider,
                policy,
                requiredCapabilities: capabilityFloor,
                accessTier: getAccessTier(provider),
                contextTokensNeeded: 24000,
                outputTokensNeeded: 2000
            });
            const caps = computeCaps({
                provider,
                model: selection.model,
                accessTier: getAccessTier(provider),
                feature: 'InquiryMode',
                overrides: aiSettings.overrides
            });
            const policyLine = policy.type === 'profile'
                ? `Selected via profile: ${policy.profile}`
                : `Selected via policy: ${policy.type}`;
            const profileDetails = policy.type === 'profile'
                ? ` · profile floor: reasoning>=${MODEL_PROFILES[policy.profile].minReasoning ?? 'n/a'}`
                : '';
            const warningLine = selection.warnings.length ? ` Warning: ${selection.warnings[0]}` : '';
            resolvedPreviewSetting.setDesc(
                `${providerLabel[provider]} -> ${selection.model.label}. ${policyLine}${profileDetails}. `
                + `Output cap ${caps.maxOutputTokens}. Reason: ${selection.reason}.${warningLine}`
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            resolvedPreviewSetting.setDesc(`Model resolution failed: ${message}`);
        }

        void refreshModelsTable();
    };

    refreshRoutingUi();

    // Provider sections
    const anthropicSection = aiSettingsGroup.createDiv({
        cls: ['ert-provider-section', 'ert-provider-anthropic', ERT_CLASSES.STACK]
    });
    const geminiSection = aiSettingsGroup.createDiv({
        cls: ['ert-provider-section', 'ert-provider-gemini', ERT_CLASSES.STACK]
    });
    const openaiSection = aiSettingsGroup.createDiv({
        cls: ['ert-provider-section', 'ert-provider-openai', ERT_CLASSES.STACK]
    });
    params.setProviderSections({ anthropic: anthropicSection, gemini: geminiSection, openai: openaiSection });
    params.addAiRelatedElement(anthropicSection);
    params.addAiRelatedElement(geminiSection);
    params.addAiRelatedElement(openaiSection);

    const secretStorageAvailable = isSecretStorageAvailable(app);
    const SecretComponentCtor = (app as any).SecretComponent as (new (containerEl: HTMLElement) => TextComponent) | undefined;

    const hasLegacyKeyMaterial = (): boolean => {
        return !!(
            plugin.settings.openaiApiKey?.trim()
            || plugin.settings.anthropicApiKey?.trim()
            || plugin.settings.geminiApiKey?.trim()
            || plugin.settings.localApiKey?.trim()
        );
    };

    if (!secretStorageAvailable) {
        const warningSetting = new Settings(aiSettingsGroup)
            .setName('Secret storage unavailable')
            .setDesc('Upgrade Obsidian to use secure Secret Storage. Legacy key fields remain available in Advanced sections.');
        params.addAiRelatedElement(warningSetting.settingEl);
    }

    if (secretStorageAvailable && hasLegacyKeyMaterial()) {
        const migrateKeysSetting = new Settings(aiSettingsGroup)
            .setName('Move keys to Secret Storage')
            .setDesc('Migrates legacy API keys out of settings and clears plaintext key fields.');
        migrateKeysSetting.addButton(button => button
            .setButtonText('Move keys now')
            .onClick(async () => {
                button.setDisabled(true);
                try {
                    const migration = await migrateLegacyKeysToSecretStorage(plugin);
                    if (migration.migratedProviders.length) {
                        new Notice(`Moved ${migration.migratedProviders.length} provider key(s) to Secret Storage.`);
                    } else {
                        new Notice('No legacy provider keys were available to migrate.');
                    }
                    if (migration.warnings.length) {
                        new Notice(migration.warnings[0]);
                    }
                    refreshRoutingUi();
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    new Notice(`Key migration failed: ${message}`);
                } finally {
                    button.setDisabled(false);
                }
            }));
        params.addAiRelatedElement(migrateKeysSetting.settingEl);
    }

    const renderCredentialSettings = (options: {
        section: HTMLElement;
        provider: 'openai' | 'anthropic' | 'google';
        legacyProvider: 'openai' | 'anthropic' | 'gemini';
        providerName: string;
        keyPlaceholder: string;
        docsUrl: string;
    }): void => {
        const providerDesc = document.createDocumentFragment();
        const span = document.createElement('span');
        span.textContent = `${options.providerName} credential configuration. `;
        const link = document.createElement('a');
        link.href = options.docsUrl;
        link.textContent = 'Get key';
        link.target = '_blank';
        link.rel = 'noopener';
        providerDesc.appendChild(span);
        providerDesc.appendChild(link);

        const secretIdSetting = new Settings(options.section)
            .setName(`${options.providerName} secret id`)
            .setDesc(providerDesc);
        secretIdSetting.addText(text => {
            const aiSettings = ensureCanonicalAiSettings();
            text.inputEl.addClass('ert-input--full');
            text
                .setPlaceholder(`rt.${options.provider}.api-key`)
                .setValue(getCredentialSecretId(aiSettings, options.provider));
            plugin.registerDomEvent(text.inputEl, 'blur', () => {
                void (async () => {
                    const ai = ensureCanonicalAiSettings();
                    const nextId = text.getValue().trim();
                    setCredentialSecretId(ai, options.provider, nextId);
                    await persistCanonical();
                })();
            });
        });
        secretIdSetting.settingEl.addClass('ert-setting-full-width-input');

        if (secretStorageAvailable && SecretComponentCtor) {
            const secureKeySetting = new Settings(options.section)
                .setName(`${options.providerName} API key (Secret Storage)`)
                .setDesc('Stored encrypted by Obsidian Secret Storage. This value is never written to settings.');
            const secretInput = new SecretComponentCtor(secureKeySetting.controlEl);
            secretInput.inputEl.addClass('ert-input--full');
            secretInput.setPlaceholder(options.keyPlaceholder);
            params.setKeyInputRef(options.legacyProvider, secretInput.inputEl);

            void (async () => {
                const ai = ensureCanonicalAiSettings();
                const currentSecret = await getSecret(app, getCredentialSecretId(ai, options.provider));
                if (currentSecret) {
                    secretInput.setValue(currentSecret);
                }
            })();

            plugin.registerDomEvent(secretInput.inputEl, 'blur', () => {
                void (async () => {
                    const value = secretInput.getValue().trim();
                    if (!value) return;
                    const ai = ensureCanonicalAiSettings();
                    const secretId = getCredentialSecretId(ai, options.provider);
                    if (!secretId) {
                        new Notice(`Set a ${options.providerName} secret id first.`);
                        return;
                    }
                    const stored = await setSecret(app, secretId, value);
                    if (!stored) {
                        new Notice(`Unable to save ${options.providerName} key to Secret Storage.`);
                        return;
                    }
                    if (options.legacyProvider === 'gemini') plugin.settings.geminiApiKey = '';
                    if (options.legacyProvider === 'anthropic') plugin.settings.anthropicApiKey = '';
                    if (options.legacyProvider === 'openai') plugin.settings.openaiApiKey = '';
                    await plugin.saveSettings();
                    void params.scheduleKeyValidation(options.legacyProvider);
                })();
            });
            secureKeySetting.settingEl.addClass('ert-setting-full-width-input');
        }

        const legacyDetails = options.section.createEl('details', {
            cls: 'ert-ai-legacy-credentials'
        });
        if (!secretStorageAvailable) {
            legacyDetails.setAttr('open', '');
        }
        legacyDetails.createEl('summary', {
            text: 'Advanced: legacy key fallback'
        });
        const legacyHost = legacyDetails.createDiv({ cls: ERT_CLASSES.STACK });
        if (secretStorageAvailable) {
            legacyHost.createDiv({
                cls: 'ert-field-note',
                text: 'Legacy key fields are disabled on this Obsidian version to avoid plaintext key storage.'
            });
        } else {
            const legacySetting = new Settings(legacyHost)
                .setName(`${options.providerName} legacy API key`)
                .setDesc('Used only when Secret Storage is unavailable.');
            legacySetting.addText(text => {
                text.inputEl.addClass('ert-input--full');
                const legacyValue = options.legacyProvider === 'gemini'
                    ? plugin.settings.geminiApiKey
                    : options.legacyProvider === 'anthropic'
                    ? plugin.settings.anthropicApiKey
                    : plugin.settings.openaiApiKey;
                text
                    .setPlaceholder(options.keyPlaceholder)
                    .setValue(legacyValue || '');
                params.setKeyInputRef(options.legacyProvider, text.inputEl);
                plugin.registerDomEvent(text.inputEl, 'blur', () => {
                    void (async () => {
                        const next = text.getValue().trim();
                        if (options.legacyProvider === 'gemini') plugin.settings.geminiApiKey = next;
                        if (options.legacyProvider === 'anthropic') plugin.settings.anthropicApiKey = next;
                        if (options.legacyProvider === 'openai') plugin.settings.openaiApiKey = next;
                        await plugin.saveSettings();
                        void params.scheduleKeyValidation(options.legacyProvider);
                    })();
                });
            });
            legacySetting.settingEl.addClass('ert-setting-full-width-input');
        }
    };

    renderCredentialSettings({
        section: anthropicSection,
        provider: 'anthropic',
        legacyProvider: 'anthropic',
        providerName: 'Anthropic',
        keyPlaceholder: 'Enter your Anthropic API key',
        docsUrl: 'https://platform.claude.com'
    });
    renderCredentialSettings({
        section: geminiSection,
        provider: 'google',
        legacyProvider: 'gemini',
        providerName: 'Google Gemini',
        keyPlaceholder: 'Enter your Gemini API key',
        docsUrl: 'https://aistudio.google.com'
    });
    renderCredentialSettings({
        section: openaiSection,
        provider: 'openai',
        legacyProvider: 'openai',
        providerName: 'OpenAI',
        keyPlaceholder: 'Enter your OpenAI API key',
        docsUrl: 'https://platform.openai.com'
    });

    const localWrapper = aiSettingsGroup.createDiv({
        cls: ['ert-provider-section', 'ert-provider-local', ERT_CLASSES.STACK]
    });
    params.setProviderSections({ anthropic: anthropicSection, gemini: geminiSection, openai: openaiSection, local: localWrapper } as any);
    params.addAiRelatedElement(localWrapper);

    const localBaseStack = localWrapper.createDiv({ cls: ERT_CLASSES.STACK });
    let localModelText: TextComponent | null = null;

    const localBaseUrlSetting = new Settings(localBaseStack)
        .setName('Local LLM Base URL')
        .setDesc('The API endpoint. For Ollama, use "http://localhost:11434/v1". For LM Studio, use "http://localhost:1234/v1".')
        .addText(text => {
            text.inputEl.addClass('ert-input--full');
            text
                .setPlaceholder('http://localhost:11434/v1')
                .setValue(plugin.settings.localBaseUrl || 'http://localhost:11434/v1');
            text.onChange(() => {
                text.inputEl.removeClass('ert-setting-input-success');
                text.inputEl.removeClass('ert-setting-input-error');
            });
            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });
            const handleBlur = async () => {
                plugin.settings.localBaseUrl = text.getValue().trim();
                const aiSettings = ensureCanonicalAiSettings();
                aiSettings.connections = { ...(aiSettings.connections || {}), ollamaBaseUrl: plugin.settings.localBaseUrl };
                await persistCanonical();
                params.scheduleKeyValidation('local');
            };
            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
            params.setLocalConnectionInputs({ baseInput: text.inputEl });
        });
    localBaseUrlSetting.settingEl.addClass('ert-setting-full-width-input');

    // Advisory note as separate section
    const localWarningSection = localBaseStack.createDiv({ cls: ['ert-local-llm-advisory', ERT_CLASSES.ROW] });
    localWarningSection.createEl('strong', { text: 'Advisory Note', cls: 'ert-local-llm-advisory-title' });
    const aiLogFolder = resolveAiLogFolder();
    localWarningSection.createSpan({
        text: `By default, no LLM pulses are written to the scene when local transformer is used. Rather it is stored in an AI log file in the local logs output folder (${aiLogFolder}), as the response does not follow directions and breaks the scene hover formatting. You may still write scene hover metadata with local LLM by toggling off the setting "Bypass scene hover metadata yaml writes" below.`
    });

    const localExtrasStack = localWrapper.createDiv({ cls: [ERT_CLASSES.STACK, 'ert-ai-local-extras'] });

    const localModelSetting = new Settings(localExtrasStack)
        .setName('Model ID')
        .setDesc('The exact model name your server expects (e.g., "llama3", "mistral-7b", "local-model").')
        .addText(text => {
            text.inputEl.addClass('ert-input--lg');
            localModelText = text;
            text
                .setPlaceholder('llama3')
                .setValue(plugin.settings.localModelId || 'llama3');
            text.onChange(() => {
                text.inputEl.removeClass('ert-setting-input-success');
                text.inputEl.removeClass('ert-setting-input-error');
            });
            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });
            const handleBlur = async () => {
                plugin.settings.localModelId = text.getValue().trim();
                await persistCanonical();
                params.scheduleKeyValidation('local');
            };
            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
            params.setLocalConnectionInputs({ modelInput: text.inputEl });
        });
    localModelSetting.settingEl.addClass(ERT_CLASSES.ROW);

    localModelSetting.addExtraButton(button => {
        button
            .setIcon('refresh-ccw')
            .setTooltip('Detect installed models and auto-fill this field')
            .onClick(async () => {
                const selectedProvider = (plugin.settings.defaultAiProvider || 'openai') as Provider;
                if (selectedProvider !== 'local') {
                    new Notice('Select "Local / OpenAI Compatible" above to detect models.');
                    return;
                }
                const baseUrl = plugin.settings.localBaseUrl?.trim();
                if (!baseUrl) {
                    new Notice('Set the Local LLM Base URL first.');
                    return;
                }
                button.setDisabled(true);
                button.setIcon('loader-2');
                try {
                    const models = await fetchLocalModels(baseUrl, await getCredential(plugin, 'ollama'));
                    if (!Array.isArray(models) || models.length === 0) {
                        new Notice('No models reported by the local server.');
                        return;
                    }
                    const existing = plugin.settings.localModelId?.trim();
                    const chosen = existing && models.some(m => m.id === existing)
                        ? models.find(m => m.id === existing)!
                        : models[0];
                    plugin.settings.localModelId = chosen.id;
                    const aiSettings = ensureCanonicalAiSettings();
                    if (aiSettings.modelPolicy.type === 'pinned' && aiSettings.provider === 'ollama') {
                        const alias = BUILTIN_MODELS.find(model => model.provider === 'ollama' && model.id === chosen.id)?.alias;
                        if (alias) aiSettings.modelPolicy.pinnedAlias = alias;
                    }
                    await persistCanonical();
                    if (localModelText) {
                        localModelText.setValue(chosen.id);
                    }
                    params.scheduleKeyValidation('local');
                    const otherModels = models.map(m => m.id).filter(id => id !== chosen.id);
                    const suffix = otherModels.length ? ` Also found: ${otherModels.join(', ')}.` : '';
                    new Notice(`Using detected model "${chosen.id}".${suffix}`);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    new Notice(`Unable to detect local models: ${message}`);
                } finally {
                    button.setDisabled(false);
                    button.setIcon('refresh-ccw');
                }
            });
    });

    const customInstructionsSetting = new Settings(localExtrasStack)
        .setName('Custom Instructions')
        .setDesc('Additional instructions added to the start of the prompt. Useful for fine-tuning local model behavior.')
        .addTextArea(text => {
            text
                .setPlaceholder('e.g. Maintain strict JSON formatting...')
                .setValue(plugin.settings.localLlmInstructions || '')
                .onChange(async (value) => {
                    plugin.settings.localLlmInstructions = value;
                    await plugin.saveSettings();
                });
            text.inputEl.rows = 6;
            text.inputEl.addClass('ert-textarea');
        });
    customInstructionsSetting.settingEl.addClass('ert-setting-full-width-input');

    const bypassSetting = new Settings(localExtrasStack)
        .setName('Bypass scene hover metadata yaml writes')
        .setDesc('Default is enabled. Local LLM triplet pulse analysis skips writing to the scene note and saves the results in the AI log report instead. Recommended for local models.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.localSendPulseToAiReport ?? true)
            .onChange(async (value) => {
                plugin.settings.localSendPulseToAiReport = value;
                await plugin.saveSettings();
            }));
    bypassSetting.settingEl.addClass(ERT_CLASSES.ROW);

    const localApiDetails = localExtrasStack.createEl('details', { cls: 'ert-ai-legacy-credentials' });
    if (!secretStorageAvailable) {
        localApiDetails.setAttr('open', '');
    }
    localApiDetails.createEl('summary', { text: 'Advanced: local API key (optional)' });
    const localApiContainer = localApiDetails.createDiv({ cls: ERT_CLASSES.STACK });

    const localSecretIdSetting = new Settings(localApiContainer)
        .setName('Local secret id')
        .setDesc('Optional secret id if your local gateway requires a key.');
    localSecretIdSetting.addText(text => {
        text.inputEl.addClass('ert-input--full');
        text.setPlaceholder('rt.ollama.api-key').setValue(getCredentialSecretId(ensureCanonicalAiSettings(), 'ollama'));
        plugin.registerDomEvent(text.inputEl, 'blur', () => {
            void (async () => {
                const ai = ensureCanonicalAiSettings();
                setCredentialSecretId(ai, 'ollama', text.getValue().trim());
                await persistCanonical();
            })();
        });
    });
    localSecretIdSetting.settingEl.addClass('ert-setting-full-width-input');

    if (secretStorageAvailable && SecretComponentCtor) {
        const localSecretSetting = new Settings(localApiContainer)
            .setName('Local API key (Secret Storage)')
            .setDesc('Only needed when your local endpoint requires authentication.');
        const localSecretInput = new SecretComponentCtor(localSecretSetting.controlEl);
        localSecretInput.inputEl.addClass('ert-input--full');
        localSecretInput.setPlaceholder('Optional local API key');
        params.setKeyInputRef('local', localSecretInput.inputEl);
        plugin.registerDomEvent(localSecretInput.inputEl, 'blur', () => {
            void (async () => {
                const key = localSecretInput.getValue().trim();
                if (!key) return;
                const ai = ensureCanonicalAiSettings();
                const secretId = getCredentialSecretId(ai, 'ollama');
                if (!secretId) {
                    new Notice('Set a local secret id first.');
                    return;
                }
                const stored = await setSecret(app, secretId, key);
                if (!stored) {
                    new Notice('Unable to save local API key to Secret Storage.');
                    return;
                }
                plugin.settings.localApiKey = '';
                await plugin.saveSettings();
                void params.scheduleKeyValidation('local');
            })();
        });
        localSecretSetting.settingEl.addClass('ert-setting-full-width-input');
    }

    if (secretStorageAvailable) {
        localApiContainer.createDiv({
            cls: 'ert-field-note',
            text: 'Legacy local key field is disabled to avoid plaintext key storage.'
        });
    } else {
        const legacyLocalSetting = new Settings(localApiContainer)
            .setName('Legacy local API key')
            .setDesc('Used only when Secret Storage is unavailable.');
        legacyLocalSetting.addText(text => {
            text.inputEl.addClass('ert-input--full');
            text.setPlaceholder('Optional local API key');
            text.setValue(plugin.settings.localApiKey || '');
            params.setKeyInputRef('local', text.inputEl);
            plugin.registerDomEvent(text.inputEl, 'blur', () => {
                void (async () => {
                    plugin.settings.localApiKey = text.getValue().trim();
                    await plugin.saveSettings();
                    void params.scheduleKeyValidation('local');
                })();
            });
        });
        legacyLocalSetting.settingEl.addClass('ert-setting-full-width-input');
    }

    // Apply provider dimming on first render
    params.refreshProviderDimming();

    // Set initial visibility state
    params.toggleAiSettingsVisibility(plugin.settings.enableAiSceneAnalysis ?? true);
}
