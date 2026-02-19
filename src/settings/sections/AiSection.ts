import { Setting as Settings, Notice, DropdownComponent } from 'obsidian';
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
import { selectModel } from '../../ai/router/selectModel';
import { computeCaps } from '../../ai/caps/computeCaps';
import { getAIClient } from '../../ai/runtime/aiClient';
import type { AIProviderId, ModelPolicy, ModelProfileName, Capability } from '../../ai/types';

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

        plugin.settings.openaiApiKey = aiSettings.credentials?.openaiApiKey ?? plugin.settings.openaiApiKey;
        plugin.settings.anthropicApiKey = aiSettings.credentials?.anthropicApiKey ?? plugin.settings.anthropicApiKey;
        plugin.settings.geminiApiKey = aiSettings.credentials?.googleApiKey ?? plugin.settings.geminiApiKey;
        plugin.settings.localApiKey = aiSettings.credentials?.ollamaApiKey ?? plugin.settings.localApiKey;
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
                refreshRoutingUi();
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                new Notice(`Model refresh failed: ${message}`);
            } finally {
                button.setDisabled(false);
            }
        }));
    params.addAiRelatedElement(refreshModelsSetting.settingEl);

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

    // Helper to support SecretComponent if available (Obsidian 1.11.4+)
    const addApiKeyInput = (
        setting: Settings,
        placeholder: string,
        value: string,
        save: (val: string) => Promise<void>,
        validate: () => void,
        setRef: (el: HTMLInputElement) => void,
        extraCheck?: (val: string, el: HTMLElement) => boolean
    ) => {
        const configure = (component: TextComponent) => {
            component.inputEl.addClass('ert-input--full');
            component.setPlaceholder(placeholder).setValue(value);

            component.onChange(() => {
                component.inputEl.removeClass('ert-setting-input-success');
                component.inputEl.removeClass('ert-setting-input-error');
            });

            plugin.registerDomEvent(component.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    component.inputEl.blur();
                }
            });

            const handleBlur = async () => {
                const trimmed = component.getValue().trim();
                await save(trimmed);
                setRef(component.inputEl);

                let valid = true;
                if (extraCheck) {
                    valid = extraCheck(trimmed, component.inputEl);
                }

                if (valid && trimmed) {
                    validate();
                }
            };

            plugin.registerDomEvent(component.inputEl, 'blur', () => { void handleBlur(); });
        };

        if ((app as any).SecretComponent) {
            const SecretComponent = (app as any).SecretComponent;
            const sc = new SecretComponent(setting.controlEl);
            configure(sc);
        } else {
            setting.addText(text => configure(text));
        }
        setting.settingEl.addClass('ert-setting-full-width-input');
    };

    // Anthropic API Key
    const anthropicKeySetting = new Settings(anthropicSection)
        .setName('Anthropic API key')
        .setDesc((() => {
            const frag = document.createDocumentFragment();
            const span = document.createElement('span');
            span.textContent = 'Your Anthropic API key for using Claude AI features. ';
            const link = document.createElement('a');
            link.href = 'https://platform.claude.com';
            link.textContent = 'Get key';
            link.target = '_blank';
            link.rel = 'noopener';
            frag.appendChild(span);
            frag.appendChild(link);
            return frag;
        })());

    addApiKeyInput(
        anthropicKeySetting,
        'Enter your Anthropic API key',
        plugin.settings.anthropicApiKey || '',
        async (val) => {
            plugin.settings.anthropicApiKey = val;
            const aiSettings = ensureCanonicalAiSettings();
            aiSettings.credentials = { ...(aiSettings.credentials || {}), anthropicApiKey: val };
            await persistCanonical();
        },
        () => params.scheduleKeyValidation('anthropic'),
        (el) => params.setKeyInputRef('anthropic', el)
    );

    // Gemini API Key
    const geminiKeySetting = new Settings(geminiSection)
        .setName('Gemini API key')
        .setDesc((() => {
            const frag = document.createDocumentFragment();
            const span = document.createElement('span');
            span.textContent = 'Your Gemini API key for using Google Gemini models. ';
            const link = document.createElement('a');
            link.href = 'https://aistudio.google.com';
            link.textContent = 'Get key';
            link.target = '_blank';
            link.rel = 'noopener';
            frag.appendChild(span);
            frag.appendChild(link);
            return frag;
        })());

    addApiKeyInput(
        geminiKeySetting,
        'Enter your Gemini API key',
        plugin.settings.geminiApiKey || '',
        async (val) => {
            plugin.settings.geminiApiKey = val;
            const aiSettings = ensureCanonicalAiSettings();
            aiSettings.credentials = { ...(aiSettings.credentials || {}), googleApiKey: val };
            await persistCanonical();
        },
        () => params.scheduleKeyValidation('gemini'),
        (el) => params.setKeyInputRef('gemini', el)
    );

    // OpenAI API Key
    const openAiKeySetting = new Settings(openaiSection)
        .setName('OpenAI API key')
        .setDesc((() => {
            const frag = document.createDocumentFragment();
            const span = document.createElement('span');
            span.textContent = 'Your OpenAI API key for using ChatGPT AI features. ';
            const link = document.createElement('a');
            link.href = 'https://platform.openai.com';
            link.textContent = 'Get key';
            link.target = '_blank';
            link.rel = 'noopener';
            frag.appendChild(span);
            frag.appendChild(link);
            return frag;
        })());

    addApiKeyInput(
        openAiKeySetting,
        'Enter your API key',
        plugin.settings.openaiApiKey || '',
        async (val) => {
            plugin.settings.openaiApiKey = val;
            const aiSettings = ensureCanonicalAiSettings();
            aiSettings.credentials = { ...(aiSettings.credentials || {}), openaiApiKey: val };
            await persistCanonical();
        },
        () => params.scheduleKeyValidation('openai'),
        (el) => params.setKeyInputRef('openai', el),
        (val, el) => {
            el.removeClass('ert-setting-input-success');
            el.removeClass('ert-setting-input-error');
            // Only validate sk- prefix if NOT using SecretStorage (or strict legacy mode)
            if (!(app as any).SecretComponent && val && !val.startsWith('sk-')) {
                el.addClass('ert-setting-input-error');
                new Notice('This does not look like an OpenAI secret key. Keys start with "sk-".');
                return false;
            }
            return true;
        }
    );

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
                    const models = await fetchLocalModels(baseUrl, plugin.settings.localApiKey?.trim());
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

    const apiKeySetting = new Settings(localExtrasStack)
        .setName('API Key (Optional)')
        .setDesc('Required by some servers. For local tools like Ollama, this is usually ignored.')
    apiKeySetting.settingEl.addClass(ERT_CLASSES.ROW);

    addApiKeyInput(
        apiKeySetting,
        'not-needed',
        plugin.settings.localApiKey || '',
        async (val) => {
            plugin.settings.localApiKey = val;
            const aiSettings = ensureCanonicalAiSettings();
            aiSettings.credentials = { ...(aiSettings.credentials || {}), ollamaApiKey: val };
            await persistCanonical();
        },
        () => params.scheduleKeyValidation('local'),
        (el) => params.setKeyInputRef('local', el)
    );

    // Apply provider dimming on first render
    params.refreshProviderDimming();

    // Set initial visibility state
    params.toggleAiSettingsVisibility(plugin.settings.enableAiSceneAnalysis ?? true);
}
