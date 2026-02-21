import { Setting as Settings, Notice, DropdownComponent, setIcon } from 'obsidian';
import type { App, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { fetchAnthropicModels } from '../../api/anthropicApi';
import { fetchOpenAiModels } from '../../api/openaiApi';
import { fetchGeminiModels } from '../../api/geminiApi';
import { fetchLocalModels } from '../../api/localAiApi';
import { AiContextModal } from '../AiContextModal';
import { resolveAiLogFolder } from '../../ai/log';
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
import { getAIClient, getLastAiAdvancedContext } from '../../ai/runtime/aiClient';
import {
    getCredential,
    getCredentialSecretId,
    migrateLegacyKeysToSecretStorage,
    setCredentialSecretId
} from '../../ai/credentials/credentials';
import { getSecret, hasSecret, isSecretStorageAvailable, setSecret } from '../../ai/credentials/secretStorage';
import { PROVIDER_CAPS } from '../../ai/caps/providerCaps';
import type { AccessTier, AIProviderId, AIThroughputCheckResult, ModelPolicy, ModelProfileName, Capability, ModelInfo } from '../../ai/types';

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

    const getActiveTemplateName = (): string => {
        const templates = plugin.settings.aiContextTemplates || [];
        const activeId = plugin.settings.activeAiContextTemplateId;
        const active = templates.find(t => t.id === activeId);
        return active?.name || 'Generic Editor';
    };

    const aiHero = containerEl.createDiv({
        cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.CARD_HERO} ${ERT_CLASSES.STACK} ert-ai-hero-card`
    });
    const heroBadgeRow = aiHero.createDiv({ cls: 'ert-ai-hero-badge-row' });
    const badge = heroBadgeRow.createSpan({ cls: ERT_CLASSES.BADGE_PILL });
    const badgeIcon = badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
    setIcon(badgeIcon, 'cpu');
    badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'AI' });
    const badgeWikiLink = badge.createEl('a', {
        href: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#ai',
        cls: 'ert-badgePill__inlineLink',
        attr: {
            'aria-label': 'Read more in the Wiki',
            'target': '_blank',
            'rel': 'noopener'
        }
    });
    setIcon(badgeWikiLink, 'external-link');

    const heroToggleWrap = heroBadgeRow.createDiv({ cls: 'ert-toggle-item ert-ai-hero-toggle' });
    const heroToggleLabel = heroToggleWrap.createSpan({ cls: 'ert-toggle-label', text: 'Inactive' });
    const heroToggleInput = heroToggleWrap.createEl('input', {
        cls: 'ert-toggle-input',
        attr: { type: 'checkbox', 'aria-label': 'Enable AI features' }
    }) as HTMLInputElement;

    const heroTitle = aiHero.createEl('h3', {
        cls: `${ERT_CLASSES.SECTION_TITLE} ert-hero-title`,
        text: 'A deep editorial lens for your manuscript.'
    });
    const heroOnState = aiHero.createDiv({ cls: `${ERT_CLASSES.STACK} ert-ai-hero-state-on` });
    heroOnState.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle`,
        text: 'Radial Timeline’s AI does not rewrite your work. It acts as a rigorous, genre-aware editor - analyzing structure, momentum, and continuity across scenes. Use it to stress-test your manuscript, uncover hidden contradictions, and sharpen narrative force while your voice remains fully your own.'
    });
    const heroOnFeatures = heroOnState.createDiv({
        cls: `${ERT_CLASSES.HERO_FEATURES} ${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}`
    });
    heroOnFeatures.createEl('h5', { text: 'AI HIGHLIGHTS', cls: 'ert-kicker' });
    const heroOnList = heroOnFeatures.createEl('ul', { cls: ERT_CLASSES.STACK });
    [
        { icon: 'waves', text: 'Inquiry - Ask precise, cross-scene questions and receive structured editorial feedback.' },
        { icon: 'activity', text: 'Pulse (Triplet Analysis) - Examine scenes in context using Radial Timeline’s three-scene lens.' },
        { icon: 'waypoints', text: 'Gossamer Momentum - Measure beat-level tension and narrative drive.' },
        { icon: 'sparkles', text: 'Force multiplier - Expand analytical reach while saving time with contextual, actionable insight.' }
    ].forEach(item => {
        const li = heroOnList.createEl('li', { cls: `${ERT_CLASSES.INLINE} ert-feature-item` });
        const icon = li.createSpan({ cls: 'ert-feature-icon' });
        setIcon(icon, item.icon);
        li.createSpan({ text: item.text });
    });

    const heroOffState = aiHero.createDiv({ cls: `${ERT_CLASSES.STACK} ert-ai-hero-state-off` });
    heroOffState.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle`,
        text: 'Your manuscript is being shaped through human judgment, revision, and creative instinct. Radial Timeline continues to support structure, sequencing, and story architecture without automated analysis.'
    });
    heroOffState.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle`,
        text: 'AI in Radial Timeline is editorial - never generative. It does not replace your voice or substitute machine-written prose. It can be enabled at any time when you want an additional layer of structured insight.'
    });
    const heroOffFeatures = heroOffState.createDiv({
        cls: `${ERT_CLASSES.HERO_FEATURES} ${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}`
    });
    heroOffFeatures.createEl('h5', { text: 'AI TOOLS AVAILABLE WHEN ENABLED', cls: 'ert-kicker' });
    const heroOffList = heroOffFeatures.createEl('ul', { cls: ERT_CLASSES.STACK });
    [
        'Inquiry - Cross-scene structural analysis via custom inquiry questions.',
        'Pulse (Triplet Analysis) - Context-aware scene evaluation.',
        'Gossamer Momentum - Beat-level narrative momentum mapping.',
        'Enhanced features such as scene summaries & runtime estimates - Tools that speed workflow.'
    ].forEach(text => {
        const li = heroOffList.createEl('li', { cls: `${ERT_CLASSES.INLINE} ert-feature-item` });
        const icon = li.createSpan({ cls: 'ert-feature-icon' });
        setIcon(icon, 'x-circle');
        li.createSpan({ text });
    });
    heroOffState.createDiv({
        cls: 'ert-ai-hero-muted',
        text: 'Your voice leads. AI supports.'
    });

    const aiStateContent = containerEl.createDiv({ cls: ERT_CLASSES.STACK });
    params.addAiRelatedElement(aiStateContent);

    const updateAiHeroState = (enabled: boolean): void => {
        heroToggleInput.checked = enabled;
        heroToggleLabel.setText(enabled ? 'Active' : 'Inactive');
        heroToggleLabel.toggleClass('is-active', enabled);
        heroTitle.setText(enabled
            ? 'A deep editorial lens for your manuscript.'
            : 'AI guidance is currently paused.');
        heroOnState.toggleClass('ert-settings-hidden', !enabled);
        heroOnState.toggleClass('ert-settings-visible', enabled);
        heroOffState.toggleClass('ert-settings-hidden', enabled);
        heroOffState.toggleClass('ert-settings-visible', !enabled);
    };

    const onAiToggleChanged = async (value: boolean): Promise<void> => {
        plugin.settings.enableAiSceneAnalysis = value;
        await plugin.saveSettings();
        params.toggleAiSettingsVisibility(value);
        plugin.setInquiryVisible(value);
        plugin.onSettingChanged(IMPACT_FULL); // Tier 3: number square colors + AI pulse elements
        updateAiHeroState(value);
    };

    heroToggleInput.checked = plugin.settings.enableAiSceneAnalysis ?? true;
    plugin.registerDomEvent(heroToggleInput, 'change', () => {
        void onAiToggleChanged(heroToggleInput.checked);
    });
    updateAiHeroState(plugin.settings.enableAiSceneAnalysis ?? true);

    const aiSettingsGroup = aiStateContent.createDiv({ cls: ERT_CLASSES.STACK });
    params.addAiRelatedElement(aiSettingsGroup);

    const quickSetupSection = aiSettingsGroup.createDiv({
        cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ert-ai-section-card`
    });
    quickSetupSection.createDiv({ cls: 'ert-section-title', text: 'AI Strategy' });
    quickSetupSection.createDiv({
        cls: 'ert-section-desc',
        text: 'Set how AI selects its model and how deeply it analyzes your manuscript.'
    });
    const quickSetupGrid = quickSetupSection.createDiv({
        cls: `${ERT_CLASSES.GRID_FORM} ${ERT_CLASSES.GRID_FORM_3} ert-ai-quick-grid`
    });

    const stepsRow = quickSetupSection.createDiv({ cls: 'ert-ai-steps-row' });
    const step1Card = stepsRow.createDiv({
        cls: `ert-ai-step-card ert-ai-step-primary ${ERT_CLASSES.STACK}`
    });
    step1Card.createDiv({ cls: 'ert-ai-step-label', text: 'STEP 1 · Model Selection' });
    step1Card.createDiv({
        cls: 'ert-ai-step-desc',
        text: 'Choose how the active model is selected for analysis.'
    });

    const step2Card = stepsRow.createDiv({
        cls: `ert-ai-step-card ert-ai-step-primary ${ERT_CLASSES.STACK}`
    });
    step2Card.createDiv({ cls: 'ert-ai-step-label', text: 'STEP 2 · Thinking Style' });
    step2Card.createDiv({
        cls: 'ert-ai-step-desc',
        text: 'Select a thinking style suited to your task — deep structural analysis, balanced review, or faster iteration.'
    });

    const step3Card = quickSetupSection.createDiv({
        cls: `ert-ai-step-card ert-ai-step-secondary ${ERT_CLASSES.STACK}`
    });
    step3Card.createDiv({ cls: 'ert-ai-step-label', text: 'STEP 3 · Analysis Tuning' });
    const step3Grid = step3Card.createDiv({ cls: 'ert-ai-step3-grid' });

    const ensureCanonicalAiSettings = () => {
        const validated = validateAiSettings(plugin.settings.aiSettings ?? buildDefaultAiSettings());
        plugin.settings.aiSettings = validated.value;
        return plugin.settings.aiSettings;
    };

    const largeHandlingFold = aiSettingsGroup.createEl('details', { cls: 'ert-ai-fold ert-ai-large-handling' });
    largeHandlingFold.setAttr('open', '');
    largeHandlingFold.setAttr('data-ert-role', 'ai-setting:large-manuscript-handling');
    largeHandlingFold.createEl('summary', { text: 'Large Manuscript Handling' });
    const largeHandlingBody = largeHandlingFold.createDiv({ cls: `${ERT_CLASSES.STACK} ert-ai-large-handling-body` });
    largeHandlingBody.createDiv({
        cls: 'ert-section-desc',
        text: 'Radial Timeline automatically adjusts how large manuscripts are prepared for AI. When a request exceeds safe context limits, it processes the material in structured segments to preserve accuracy and scene-level references.'
    });

    const capacitySection = largeHandlingBody.createDiv({ cls: 'ert-ai-capacity-section' });
    capacitySection.createDiv({ cls: 'ert-ai-capacity-title', text: 'Current context capacity' });
    const capacityGrid = capacitySection.createDiv({ cls: 'ert-ai-capacity-grid' });
    const createCapacityCell = (label: string): { valueEl: HTMLElement } => {
        const cell = capacityGrid.createDiv({ cls: 'ert-ai-capacity-cell' });
        cell.createDiv({ cls: 'ert-ai-capacity-label', text: label });
        const valueEl = cell.createDiv({ cls: 'ert-ai-capacity-value', text: '—' });
        return { valueEl };
    };
    const capacityProvider = createCapacityCell('Provider');
    const capacitySafeInput = createCapacityCell('Safe input budget');
    const capacityOutput = createCapacityCell('Output allowance');
    const capacityMode = createCapacityCell('Current packaging preference');


    const packagingSection = largeHandlingBody.createDiv({
        cls: `${ERT_CLASSES.HERO_FEATURES} ${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}`
    });
    packagingSection.createEl('h5', { text: 'HOW LARGE REQUESTS ARE PROCESSED', cls: 'ert-kicker' });
    const packagingList = packagingSection.createEl('ul', { cls: ERT_CLASSES.STACK });
    [
        { icon: 'zap', text: 'Uses a single request when the selected content fits safely.' },
        { icon: 'layers', text: 'For large submissions, analyzes the manuscript in structured segments and combines the results.' },
        { icon: 'anchor', text: 'Stable scene IDs keep references aligned and consistent over time.' }
    ].forEach(item => {
        const li = packagingList.createEl('li', { cls: `${ERT_CLASSES.INLINE} ert-feature-item` });
        const icon = li.createSpan({ cls: 'ert-feature-icon' });
        setIcon(icon, item.icon);
        li.createSpan({ text: item.text });
    });

    const executionPreferenceSetting = new Settings(largeHandlingBody)
        .setName('Execution Preference')
        .setDesc('Choose how large requests are handled during Inquiry.');
    executionPreferenceSetting.settingEl.setAttr('data-ert-role', 'ai-setting:execution-preference');
    let executionPreferenceDropdown: DropdownComponent | null = null;
    executionPreferenceSetting.addDropdown(dropdown => {
        executionPreferenceDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--lg');
        dropdown.addOption('automatic', 'Automatic');
        dropdown.addOption('singlePassOnly', 'Single-pass only');
        dropdown.onChange(async value => {
            const aiSettings = ensureCanonicalAiSettings();
            aiSettings.analysisPackaging = value === 'singlePassOnly' ? 'singlePassOnly' : 'automatic';
            await persistCanonical();
            refreshRoutingUi();
        });
    });
    const executionPreferenceNote = largeHandlingBody.createDiv({ cls: 'ert-field-note' });
    const updateExecutionPreferenceNote = (): void => {
        const mode = ensureCanonicalAiSettings().analysisPackaging;
        executionPreferenceNote.setText(
            mode === 'singlePassOnly'
                ? 'Send the full request as one pass. If it exceeds safe limits, reduce scope or adjust settings.'
                : ''
        );
        executionPreferenceNote.toggleClass('ert-settings-hidden', mode !== 'singlePassOnly');
    };
    updateExecutionPreferenceNote();
    params.addAiRelatedElement(largeHandlingFold);
    params.addAiRelatedElement(executionPreferenceSetting.settingEl);

    const roleContextSection = aiSettingsGroup.createDiv({
        cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ert-ai-section-card`
    });
    roleContextSection.createDiv({ cls: 'ert-section-title', text: 'Role context' });
    roleContextSection.createDiv({
        cls: 'ert-section-desc',
        text: 'Active role and context framing used for AI submissions. Applied to Inquiry, Pulse (Triplet Analysis), Gossamer Momentum, Summary Refresh, Runtime AI Estimation.'
    });

    const featureDefaultsSection = aiSettingsGroup.createDiv({
        cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ert-ai-section-card`
    });
    featureDefaultsSection.createDiv({ cls: 'ert-section-title', text: 'Feature defaults' });
    featureDefaultsSection.createDiv({
        cls: 'ert-section-desc',
        text: 'Compact default behavior for Inquiry, Gossamer, Pulse, Summary refresh, and Runtime.'
    });
    const featureDefaultsGrid = featureDefaultsSection.createDiv({
        cls: `${ERT_CLASSES.GRID_FORM} ${ERT_CLASSES.GRID_FORM_3} ert-ai-feature-grid`
    });

    const modelDetailsFold = aiSettingsGroup.createEl('details', { cls: 'ert-ai-fold' });
    modelDetailsFold.createEl('summary', { text: 'Model details' });
    const modelDetailsBody = modelDetailsFold.createDiv({ cls: ERT_CLASSES.STACK });

    const advancedFold = aiSettingsGroup.createEl('details', { cls: 'ert-ai-fold' });
    advancedFold.createEl('summary', { text: 'Advanced' });
    const advancedBody = advancedFold.createDiv({ cls: ERT_CLASSES.STACK });

    const contextTemplateSetting = new Settings(roleContextSection)
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

    const tripletDisplaySetting = new Settings(featureDefaultsSection)
        .setName('Pulse: Show previous and next scene triplet analysis')
        .setDesc('When enabled, scene hover fields include the AI pulse for the previous and next scenes. Turn off to display only the current scene for a more compact view.')
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

    const profileLabel: Record<ModelProfileName, string> = {
        deepReasoner: 'Deep Structural Analysis',
        deepWriter: 'Narrative Craft',
        balancedAnalysis: 'Balanced Editorial'
    };

    const strategyLabel = (policy: ModelPolicy): string => {
        if (policy.type === 'profile') {
            return profileLabel[policy.profile] ?? 'Balanced Editorial';
        }
        if (policy.type === 'pinned') return 'Manual Selection';
        if (policy.type === 'latestFast') return 'Fast Iteration';
        if (policy.type === 'latestCheap') return 'Efficient Drafting';
        return 'Stable Default';
    };

    const formatApproxTokens = (value: number): string => {
        if (!Number.isFinite(value) || value <= 0) return 'n/a';
        if (value < 1000) return `~${Math.round(value)}`;
        const rounded = Math.round(value / 1000);
        return `~${rounded}k`;
    };

    const availabilityPillText = (status: AvailabilityStatus): string => {
        if (status === 'visible') return 'Availability · Visible';
        if (status === 'not_visible') return 'Availability · Not visible';
        return 'Availability · Unknown';
    };

    const getProviderAliases = (provider: AIProviderId): string[] =>
        BUILTIN_MODELS
            .filter(model => model.provider === provider && model.status !== 'deprecated')
            .map(model => model.alias);

    const getProviderDefaultAlias = (provider: AIProviderId): string | undefined =>
        BUILTIN_MODELS.find(model => model.provider === provider && model.status === 'stable')?.alias
        ?? BUILTIN_MODELS.find(model => model.provider === provider)?.alias;

    const getAccessTier = (provider: AIProviderId): AccessTier => {
        const aiSettings = ensureCanonicalAiSettings();
        if (provider === 'anthropic') return aiSettings.aiAccessProfile.anthropicTier ?? 1;
        if (provider === 'openai') return aiSettings.aiAccessProfile.openaiTier ?? 1;
        if (provider === 'google') return aiSettings.aiAccessProfile.googleTier ?? 1;
        return 1;
    };

    const setAccessTier = (provider: AIProviderId, tier: AccessTier): void => {
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

    const providerSetting = new Settings(quickSetupGrid)
        .setName('Provider')
        .setDesc('Select the AI service that powers structural analysis and editorial insight across your manuscript.');
    providerSetting.settingEl.setAttr('data-ert-role', 'ai-setting:provider');
    let providerDropdown: DropdownComponent | null = null;
    providerSetting.addDropdown(dropdown => {
        providerDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md');
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

    const policySetting = new Settings(quickSetupGrid)
        .setName('Model strategy')
        .setDesc('Select how the system chooses the active model.');
    policySetting.settingEl.setAttr('data-ert-role', 'ai-setting:model-strategy');
    let policyDropdown: DropdownComponent | null = null;
    policySetting.addDropdown(dropdown => {
        policyDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md');
        dropdown.addOption('pinned', 'Manual (Pinned)');
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

    const pinnedSetting = new Settings(quickSetupGrid)
        .setName('Pinned model')
        .setDesc('Select a specific model instead of automatic selection.');
    pinnedSetting.settingEl.setAttr('data-ert-role', 'ai-setting:pinned-model');
    let pinnedDropdown: DropdownComponent | null = null;
    pinnedSetting.addDropdown(dropdown => {
        pinnedDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md');
        dropdown.onChange(async value => {
            const aiSettings = ensureCanonicalAiSettings();
            if (aiSettings.modelPolicy.type !== 'pinned') return;
            aiSettings.modelPolicy.pinnedAlias = value;
            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(pinnedSetting.settingEl);

    const profileSetting = new Settings(quickSetupGrid)
        .setName('Profile')
        .setDesc('Select a thinking style suited to your task — deep structural analysis, balanced review, or faster iteration.');
    profileSetting.settingEl.setAttr('data-ert-role', 'ai-setting:profile');
    let profileDropdown: DropdownComponent | null = null;
    profileSetting.addDropdown(dropdown => {
        profileDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md');
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

    const accessTierSetting = new Settings(quickSetupGrid)
        .setName('Access level')
        .setDesc('Adjust request scale and available output capacity.');
    accessTierSetting.settingEl.setAttr('data-ert-role', 'ai-setting:access-level');
    let accessTierDropdown: DropdownComponent | null = null;
    accessTierSetting.addDropdown(dropdown => {
        accessTierDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--sm');
        dropdown.addOption('1', 'Tier 1');
        dropdown.addOption('2', 'Tier 2');
        dropdown.addOption('3', 'Tier 3');
        dropdown.addOption('4', 'Tier 4');
        dropdown.onChange(async value => {
            const aiSettings = ensureCanonicalAiSettings();
            const provider = aiSettings.provider;
            if (provider === 'anthropic' || provider === 'openai' || provider === 'google') {
                setAccessTier(provider, Number(value) as AccessTier);
                await persistCanonical();
                refreshRoutingUi();
            }
        });
    });
    params.addAiRelatedElement(accessTierSetting.settingEl);

    const outputModeSetting = new Settings(quickSetupGrid)
        .setName('Output cap')
        .setDesc('Control how much response space AI can use.');
    let outputModeDropdown: DropdownComponent | null = null;
    outputModeSetting.addDropdown(dropdown => {
        outputModeDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--sm');
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

    const reasoningDepthSetting = new Settings(quickSetupGrid)
        .setName('Depth')
        .setDesc('Standard reasoning depth favors speed. Deep increases structural precision.');
    let reasoningDepthDropdown: DropdownComponent | null = null;
    reasoningDepthSetting.addDropdown(dropdown => {
        reasoningDepthDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--sm');
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

    const applyQuickSetupLayoutOrder = (): void => {
        quickSetupSection.insertBefore(providerSetting.settingEl, stepsRow);

        step1Card.appendChild(policySetting.settingEl);
        step1Card.appendChild(pinnedSetting.settingEl);

        step2Card.appendChild(profileSetting.settingEl);

        [outputModeSetting, reasoningDepthSetting, accessTierSetting].forEach(setting => {
            step3Grid.appendChild(setting.settingEl);
            setting.settingEl.addClass('ert-ai-grid-item');
        });

        quickSetupGrid.addClass('ert-settings-hidden');
    };

    const applyStrategyRowCopyLayout = (setting: Settings, description: string): void => {
        setting.setDesc('');
        setting.settingEl.addClass('ert-ai-strategy-row', 'ert-setting-two-row');
        const nativeDesc = setting.settingEl.querySelector('.setting-item-description');
        if (nativeDesc) nativeDesc.remove();
        const existing = setting.settingEl.querySelector('.ert-ai-strategy-row__desc');
        if (!existing) {
            setting.settingEl.createDiv({ cls: 'ert-ai-strategy-row__desc', text: description });
        } else {
            existing.setText(description);
        }
    };

    const sanitizeEndpointForDisplay = (endpoint: string): string => {
        try {
            const parsed = new URL(endpoint);
            if (parsed.searchParams.has('key')) {
                parsed.searchParams.set('key', '***');
            }
            return parsed.toString();
        } catch {
            return endpoint;
        }
    };

    const isRateLikeKey = (key: string): boolean => {
        const normalized = key.toLowerCase();
        return normalized.includes('ratelimit')
            || normalized.includes('rate-limit')
            || normalized.includes('rate_limit')
            || normalized.includes('quota')
            || normalized === 'retry-after';
    };

    const extractRelevantHeaders = (headers: Headers): Record<string, string> => {
        const observed: Record<string, string> = {};
        headers.forEach((value, key) => {
            if (!isRateLikeKey(key)) return;
            const cleaned = value.trim();
            if (!cleaned) return;
            observed[key.toLowerCase()] = cleaned;
        });
        return observed;
    };

    const extractRelevantFields = (value: unknown): Record<string, string> => {
        const observed: Record<string, string> = {};
        if (!value || typeof value !== 'object') return observed;

        const queue: Array<{ path: string; value: unknown; depth: number }> = [{ path: '', value, depth: 0 }];
        const maxDepth = 2;
        const maxFields = 16;

        while (queue.length > 0 && Object.keys(observed).length < maxFields) {
            const current = queue.shift();
            if (!current) break;
            if (current.depth > maxDepth) continue;

            if (current.value && typeof current.value === 'object' && !Array.isArray(current.value)) {
                const entries = Object.entries(current.value as Record<string, unknown>);
                for (const [key, child] of entries) {
                    const path = current.path ? `${current.path}.${key}` : key;
                    const keyForMatch = key.toLowerCase();
                    const isRelevant = isRateLikeKey(keyForMatch)
                        || keyForMatch.includes('limit')
                        || keyForMatch.includes('retry')
                        || keyForMatch.includes('requests');
                    if (isRelevant && (typeof child === 'string' || typeof child === 'number' || typeof child === 'boolean')) {
                        observed[path] = String(child);
                    } else if (current.depth < maxDepth && child && typeof child === 'object') {
                        queue.push({ path, value: child, depth: current.depth + 1 });
                    }
                    if (Object.keys(observed).length >= maxFields) break;
                }
            }
        }

        return observed;
    };

    const parseNumericLimit = (raw: string | undefined): number | null => {
        if (!raw) return null;
        const match = raw.match(/(\d{1,9})/);
        if (!match) return null;
        const parsed = Number(match[1]);
        return Number.isFinite(parsed) ? parsed : null;
    };

    const getObservedRpm = (
        observedHeaders: Record<string, string>,
        observedFields: Record<string, string>
    ): number | null => {
        const candidates: Array<string | undefined> = [
            observedHeaders['x-ratelimit-limit-requests'],
            observedHeaders['ratelimit-limit-requests'],
            observedHeaders['x-ratelimit-limit'],
            observedHeaders['ratelimit-limit'],
            observedFields.requests_per_minute,
            observedFields.rpm,
            observedFields.rate_limit_requests,
            observedFields.rate_limit_per_minute,
            observedFields.limits_requests_per_minute
        ];
        for (const candidate of candidates) {
            const parsed = parseNumericLimit(candidate);
            if (parsed && parsed > 0) return parsed;
        }
        return null;
    };

    const inferTierSuggestion = (
        provider: Exclude<AIProviderId, 'none'>,
        currentTier: AccessTier,
        observedRpm: number | null
    ): { heuristicTierSuggestion?: AccessTier; heuristicSummary: string; noLimitInfoAvailable: boolean } => {
        if (!observedRpm) {
            return {
                noLimitInfoAvailable: true,
                heuristicSummary: 'No limit info available from the provider response. This check could not estimate throughput.'
            };
        }

        const tierOrder: AccessTier[] = [1, 2, 3, 4];
        const tierCaps = PROVIDER_CAPS[provider].tiers;
        let closestTier: AccessTier = currentTier;
        let smallestDelta = Number.POSITIVE_INFINITY;

        for (const tier of tierOrder) {
            const delta = Math.abs(tierCaps[tier].requestPerMinute - observedRpm);
            if (delta < smallestDelta) {
                smallestDelta = delta;
                closestTier = tier;
            }
        }

        if (closestTier === currentTier) {
            return {
                noLimitInfoAvailable: false,
                heuristicTierSuggestion: currentTier,
                heuristicSummary: `Observed throughput appears around ${observedRpm}/min and appears consistent with Tier ${currentTier}.`
            };
        }

        return {
            noLimitInfoAvailable: false,
            heuristicTierSuggestion: closestTier,
            heuristicSummary: `Observed throughput appears around ${observedRpm}/min. This suggests Tier ${closestTier} may match better than Tier ${currentTier}.`
        };
    };

    const runThroughputProbe = async (): Promise<AIThroughputCheckResult> => {
        const aiSettings = ensureCanonicalAiSettings();
        const providerCandidate = aiSettings.provider === 'none' ? 'openai' : aiSettings.provider;
        const provider: Exclude<AIProviderId, 'none'> = providerCandidate;
        const currentTier = getAccessTier(provider);
        const timeoutController = new AbortController();
        const timeout = window.setTimeout(() => timeoutController.abort(), 12000);

        let endpoint = '';
        const requestHeaders: Record<string, string> = {};

        try {
            if (provider === 'openai') {
                const key = await getCredential(plugin, 'openai');
                if (!key) throw new Error('No saved key found for OpenAI.');
                endpoint = 'https://api.openai.com/v1/models';
                requestHeaders.Authorization = `Bearer ${key}`;
            } else if (provider === 'anthropic') {
                const key = await getCredential(plugin, 'anthropic');
                if (!key) throw new Error('No saved key found for Anthropic.');
                endpoint = 'https://api.anthropic.com/v1/models?limit=1';
                requestHeaders['x-api-key'] = key;
                requestHeaders['anthropic-version'] = '2023-06-01';
            } else if (provider === 'google') {
                const key = await getCredential(plugin, 'google');
                if (!key) throw new Error('No saved key found for Google.');
                endpoint = `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(key)}`;
            } else {
                const base = (aiSettings.connections?.ollamaBaseUrl || plugin.settings.localBaseUrl || 'http://localhost:11434/v1').trim();
                const trimmedBase = base.replace(/\/+$/, '');
                endpoint = trimmedBase.endsWith('/models') ? trimmedBase : `${trimmedBase}/models`;
                const key = await getCredential(plugin, 'ollama');
                if (key) requestHeaders.Authorization = `Bearer ${key}`;
            }

            const response = await fetch(endpoint, {
                method: 'GET',
                headers: requestHeaders,
                signal: timeoutController.signal
            });

            const observedHeaders = extractRelevantHeaders(response.headers);
            let observedFields: Record<string, string> = {};

            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                try {
                    const payload = await response.json() as unknown;
                    observedFields = extractRelevantFields(payload);
                } catch {
                    observedFields = {};
                }
            } else {
                try { await response.text(); } catch { /* ignore */ }
            }

            const observedRpm = getObservedRpm(observedHeaders, observedFields);
            const inference = inferTierSuggestion(provider, currentTier, observedRpm);

            return {
                checkedAt: new Date().toISOString(),
                provider,
                endpoint: sanitizeEndpointForDisplay(endpoint),
                statusCode: response.status,
                observedHeaders,
                observedFields,
                noLimitInfoAvailable: inference.noLimitInfoAvailable,
                heuristicTierSuggestion: inference.heuristicTierSuggestion,
                heuristicSummary: inference.heuristicSummary
            };
        } finally {
            window.clearTimeout(timeout);
        }
    };

    const remoteRegistrySetting = new Settings(advancedBody)
        .setName('Remote model registry')
        .setDesc('Optional weekly-refresh model catalog. Built-in aliases are always available offline.');
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

    const providerSnapshotSetting = new Settings(advancedBody)
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

    const refreshModelsSetting = new Settings(advancedBody)
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

    const refreshAvailabilitySetting = new Settings(advancedBody)
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

    const throughputCheckSetting = new Settings(advancedBody)
        .setName('Check throughput')
        .setDesc('Runs a small test to estimate limits for your current provider.');
    const throughputResultSetting = new Settings(advancedBody)
        .setName('Last throughput check')
        .setDesc('No throughput checks have been run yet.');

    const renderThroughputResult = (): void => {
        const result = ensureCanonicalAiSettings().lastThroughputCheck;
        if (!result) {
            throughputResultSetting.setDesc('No throughput checks have been run yet.');
            return;
        }
        const observedHeaderCount = Object.keys(result.observedHeaders || {}).length;
        const observedFieldCount = Object.keys(result.observedFields || {}).length;
        const observedTotal = observedHeaderCount + observedFieldCount;
        const timestamp = new Date(result.checkedAt).toLocaleString();
        const suggestion = result.heuristicTierSuggestion
            ? ` Suggested tier: ${result.heuristicTierSuggestion}.`
            : '';
        const observedText = observedTotal > 0
            ? ` Observed ${observedTotal} limit signal${observedTotal === 1 ? '' : 's'}.`
            : ' No limit info available.';
        const sampleSignals = [
            ...Object.entries(result.observedHeaders || {}),
            ...Object.entries(result.observedFields || {})
        ]
            .slice(0, 3)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
        const sampleText = sampleSignals ? ` Signals: ${sampleSignals}.` : '';
        throughputResultSetting.setDesc(
            `${timestamp} · ${result.provider.toUpperCase()} (${result.statusCode}). ${result.heuristicSummary}${suggestion}${observedText}${sampleText}`
        );
    };

    throughputCheckSetting.addButton(button => button
        .setButtonText('Run check')
        .onClick(async () => {
            button.setDisabled(true);
            try {
                const result = await runThroughputProbe();
                const aiSettings = ensureCanonicalAiSettings();
                aiSettings.lastThroughputCheck = result;
                await persistCanonical();
                renderThroughputResult();
                new Notice('Throughput check completed.');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const aiSettings = ensureCanonicalAiSettings();
                const provider = (aiSettings.provider === 'none' ? 'openai' : aiSettings.provider) as Exclude<AIProviderId, 'none'>;
                aiSettings.lastThroughputCheck = {
                    checkedAt: new Date().toISOString(),
                    provider,
                    endpoint: 'unavailable',
                    statusCode: 0,
                    observedHeaders: {},
                    observedFields: {},
                    noLimitInfoAvailable: true,
                    heuristicSummary: `No limit info available. The check suggests verifying your provider key and trying again (${message}).`
                };
                await persistCanonical();
                renderThroughputResult();
                new Notice(`Throughput check failed: ${message}`);
            } finally {
                button.setDisabled(false);
            }
        }));
    params.addAiRelatedElement(throughputCheckSetting.settingEl);
    params.addAiRelatedElement(throughputResultSetting.settingEl);
    renderThroughputResult();

    const modelsPanel = modelDetailsBody.createDiv({ cls: ['ert-panel', ERT_CLASSES.STACK, 'ert-ai-models-panel'] });
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

    const renderFeatureDefaultsCards = (): void => {
        featureDefaultsGrid.empty();
        const aiSettings = ensureCanonicalAiSettings();
        const policySummary = aiSettings.modelPolicy.type === 'profile'
            ? `Profile: ${aiSettings.modelPolicy.profile}`
            : `Policy: ${aiSettings.modelPolicy.type}`;
        const cards: Array<{ title: string; body: string }> = [
            {
                title: 'Inquiry',
                body: `${policySummary}. Full-manuscript analysis with structured output focus.`
            },
            {
                title: 'Gossamer',
                body: 'Narrative momentum and prose sensitivity with deep analysis weighting.'
            },
            {
                title: 'Pulse',
                body: plugin.settings.showFullTripletAnalysis
                    ? 'Triplet lens enabled: previous, focus, and next scenes.'
                    : 'Triplet lens reduced: focus scene only.'
            },
            {
                title: 'Summary refresh',
                body: 'Uses current routing defaults for compact update passes.'
            },
            {
                title: 'Runtime',
                body: `Resolved by the same provider policy with output cap ${aiSettings.overrides.maxOutputMode || 'auto'}.`
            }
        ];

        cards.forEach(card => {
            const cardEl = featureDefaultsGrid.createDiv({ cls: 'ert-ai-feature-card' });
            cardEl.createDiv({ cls: 'ert-ai-feature-card-title', text: card.title });
            cardEl.createDiv({ cls: 'ert-ai-feature-card-body', text: card.body });
        });
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
                    text: 'Enable Provider Snapshot for key-based visibility. This only fetches model details and availability.'
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

        const providerDetails = modelDetailsEl.createDiv({ cls: 'ert-field-note' });
        providerDetails.setText(
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
        rawDetails.createEl('summary', { text: 'Show raw provider details' });
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

    const resolvedPreviewFrame = quickSetupSection.createDiv({
        cls: [ERT_CLASSES.PREVIEW_FRAME, ERT_CLASSES.STACK, 'ert-previewFrame--center', 'ert-previewFrame--flush', 'ert-ai-resolved-preview'],
        attr: { 'data-ert-role': 'ai-setting:resolved-model-preview' }
    });
    const resolvedPreviewKicker = resolvedPreviewFrame.createDiv({
        cls: 'ert-ai-resolved-preview-kicker',
        text: 'PREVIEW (ACTIVE MODEL)'
    });
    const resolvedPreviewModel = resolvedPreviewFrame.createDiv({
        cls: 'ert-ai-resolved-preview-model',
        text: 'Resolving...'
    });
    const resolvedPreviewProvider = resolvedPreviewFrame.createDiv({
        cls: 'ert-ai-resolved-preview-provider',
        text: 'Provider: —'
    });
    const resolvedPreviewPills = resolvedPreviewFrame.createDiv({ cls: 'ert-ai-resolved-preview-pills' });
    params.addAiRelatedElement(resolvedPreviewFrame);


    applyStrategyRowCopyLayout(providerSetting, 'Select the AI service that powers structural analysis and editorial insight across your manuscript.');
    applyStrategyRowCopyLayout(policySetting, 'Select how the system chooses the active model.');
    applyStrategyRowCopyLayout(pinnedSetting, 'Select a specific model instead of automatic selection.');
    applyStrategyRowCopyLayout(profileSetting, 'Select a thinking style suited to your task — deep structural analysis, balanced review, or faster iteration.');
    applyStrategyRowCopyLayout(outputModeSetting, 'Control how much response space AI can use.');
    applyStrategyRowCopyLayout(reasoningDepthSetting, 'Standard favors speed. Deep increases structural precision.');
    applyStrategyRowCopyLayout(accessTierSetting, 'Adjust request scale and available output capacity.');

    applyQuickSetupLayoutOrder();

    const dropdownHasValue = (dropdown: DropdownComponent | null, value: string): boolean => {
        if (!dropdown) return false;
        return Array.from(dropdown.selectEl.options).some(option => option.value === value);
    };

    const setDropdownValueSafe = (dropdown: DropdownComponent | null, preferred: string, fallback?: string): void => {
        if (!dropdown) return;
        if (dropdownHasValue(dropdown, preferred)) {
            dropdown.setValue(preferred);
            return;
        }
        if (fallback && dropdownHasValue(dropdown, fallback)) {
            dropdown.setValue(fallback);
        }
    };

    interface ResolvedPreviewRenderState {
        modelKey: string;
        provider: AIProviderId;
        modelId: string;
        modelLabel: string;
        modelAlias: string;
        strategyPill: string;
        analysisPackaging: 'automatic' | 'singlePassOnly';
        maxInputTokens: number | null;
        maxOutputTokens: number | null;
        reasonDetails: string;
        warnings: string[];
        availabilityStatus: AvailabilityStatus;
        showAvailabilityPill: boolean;
        passCount: number | null;
        errorMessage?: string;
    }

    let activeResolvedPreviewKey = '';
    let resolvedPreviewState: ResolvedPreviewRenderState | null = null;

    const createResolvedPreviewPill = (text: string): void => {
        resolvedPreviewPills.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM} ert-ai-resolved-preview-pill`,
            text
        });
    };

    const renderResolvedPreview = (state: ResolvedPreviewRenderState): void => {
        resolvedPreviewState = state;
        activeResolvedPreviewKey = state.modelKey;

        resolvedPreviewKicker.setText('PREVIEW (ACTIVE MODEL)');
        resolvedPreviewModel.setText(state.modelLabel);
        resolvedPreviewProvider.setText(`${providerLabel[state.provider]} · ${state.modelAlias}`);
        resolvedPreviewPills.empty();

        createResolvedPreviewPill(state.strategyPill);
        createResolvedPreviewPill(state.analysisPackaging === 'singlePassOnly' ? 'Single-pass only' : 'Automatic Packaging');
        createResolvedPreviewPill(`Input · ${state.maxInputTokens ? formatApproxTokens(state.maxInputTokens) : 'n/a'}`);
        createResolvedPreviewPill(`Response · ${state.maxOutputTokens ? `${formatApproxTokens(state.maxOutputTokens)} / pass` : 'n/a'}`);

        if (state.passCount && state.passCount > 1) {
            createResolvedPreviewPill(`Passes · ${state.passCount}`);
        }

        if (state.showAvailabilityPill && state.availabilityStatus !== 'unknown') {
            createResolvedPreviewPill(availabilityPillText(state.availabilityStatus));
        }

    };

    const snapshotProviderFor = (provider: AIProviderId): 'openai' | 'anthropic' | 'google' | null => {
        if (provider === 'openai' || provider === 'anthropic' || provider === 'google') return provider;
        return null;
    };

    const refreshResolvedPreviewAvailability = async (state: ResolvedPreviewRenderState): Promise<void> => {
        if (!state.showAvailabilityPill) return;
        const snapshotProvider = snapshotProviderFor(state.provider);
        if (!snapshotProvider) return;

        try {
            const snapshotResult = await getAIClient(plugin).getProviderSnapshot(false);
            if (activeResolvedPreviewKey !== state.modelKey || !resolvedPreviewState) return;
            const status: AvailabilityStatus = !snapshotResult.snapshot
                ? 'unknown'
                : snapshotResult.snapshot.models.some(model =>
                    model.provider === snapshotProvider && model.id === state.modelId
                )
                ? 'visible'
                : 'not_visible';

            renderResolvedPreview({
                ...state,
                availabilityStatus: status
            });
        } catch {
            // Ignore availability lookup failures; preview stays in a known-safe state.
        }
    };

    const refreshRoutingUi = (): void => {
        const aiSettings = ensureCanonicalAiSettings();
        const provider = aiSettings.provider === 'none' ? 'openai' : aiSettings.provider;
        const providerAliases = getProviderAliases(provider);
        const policy = aiSettings.modelPolicy;
        const policyType = (
            policy.type === 'pinned'
            || policy.type === 'profile'
            || policy.type === 'latestStable'
            || policy.type === 'latestFast'
            || policy.type === 'latestCheap'
        ) ? policy.type : 'latestStable';

        setDropdownValueSafe(providerDropdown, provider, 'openai');
        setDropdownValueSafe(policyDropdown, policyType, 'latestStable');

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

        const profileValue = (policy.type === 'profile' && (
            policy.profile === 'deepReasoner'
            || policy.profile === 'deepWriter'
            || policy.profile === 'balancedAnalysis'
        )) ? policy.profile : 'deepReasoner';

        setDropdownValueSafe(profileDropdown, profileValue, 'deepReasoner');
        setDropdownValueSafe(outputModeDropdown, aiSettings.overrides.maxOutputMode || 'auto', 'auto');
        setDropdownValueSafe(reasoningDepthDropdown, aiSettings.overrides.reasoningDepth || 'standard', 'standard');
        setDropdownValueSafe(executionPreferenceDropdown, aiSettings.analysisPackaging === 'singlePassOnly' ? 'singlePassOnly' : 'automatic', 'automatic');
        updateExecutionPreferenceNote();
        remoteRegistryToggle?.setValue(aiSettings.privacy.allowRemoteRegistry);
        providerSnapshotToggle?.setValue(aiSettings.privacy.allowProviderSnapshot);

        [providerSetting, policySetting, outputModeSetting, reasoningDepthSetting].forEach(setting => {
            setting.settingEl.toggleClass('ert-settings-hidden', false);
            setting.settingEl.toggleClass('ert-settings-visible', true);
        });

        const shouldShowPinned = policy.type === 'pinned';
        const shouldShowProfile = policy.type === 'profile';
        pinnedSetting.settingEl.toggleClass('ert-settings-hidden', !shouldShowPinned);
        pinnedSetting.settingEl.toggleClass('ert-settings-visible', shouldShowPinned);
        profileSetting.settingEl.toggleClass('ert-settings-hidden', !shouldShowProfile);
        profileSetting.settingEl.toggleClass('ert-settings-visible', shouldShowProfile);
        step2Card.toggleClass('ert-settings-hidden', !shouldShowProfile);
        step2Card.toggleClass('ert-settings-visible', shouldShowProfile);

        const supportsAccessTier = provider === 'anthropic' || provider === 'openai' || provider === 'google';
        accessTierSetting.settingEl.toggleClass('ert-settings-hidden', !supportsAccessTier);
        accessTierSetting.settingEl.toggleClass('ert-settings-visible', supportsAccessTier);
        if (supportsAccessTier) {
            accessTierDropdown?.setValue(String(getAccessTier(provider)));
        }

        const inquiryAdvanced = getLastAiAdvancedContext(plugin, 'InquiryMode');
        const passCount = typeof inquiryAdvanced?.executionPassCount === 'number' && inquiryAdvanced.executionPassCount > 1
            ? inquiryAdvanced.executionPassCount
            : null;

        capacityProvider.valueEl.setText(providerLabel[provider]);
        capacitySafeInput.valueEl.setText('Calculating...');
        capacityOutput.valueEl.setText('Calculating...');
        capacityMode.valueEl.setText(aiSettings.analysisPackaging === 'singlePassOnly' ? 'Single-pass only' : 'Automatic');

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
            const safetyPct = Math.round(caps.safeChunkThreshold * 100);
            const previewState: ResolvedPreviewRenderState = {
                modelKey: `${provider}:${selection.model.id}`,
                provider,
                modelId: selection.model.id,
                modelLabel: selection.model.label,
                modelAlias: selection.model.alias,
                strategyPill: strategyLabel(policy),
                analysisPackaging: aiSettings.analysisPackaging,
                maxInputTokens: caps.maxInputTokens,
                maxOutputTokens: caps.maxOutputTokens,
                reasonDetails: selection.reason,
                warnings: selection.warnings,
                availabilityStatus: 'unknown',
                showAvailabilityPill: aiSettings.privacy.allowProviderSnapshot,
                passCount
            };
            renderResolvedPreview(previewState);
            void refreshResolvedPreviewAvailability(previewState);
            capacityProvider.valueEl.setText(`${providerLabel[provider]} · ${selection.model.label}`);
            capacitySafeInput.valueEl.setText(`${caps.maxInputTokens.toLocaleString()} tokens (${safetyPct}% safe window)`);
            capacityOutput.valueEl.setText(`${caps.maxOutputTokens.toLocaleString()} tokens`);
            capacityMode.valueEl.setText(aiSettings.analysisPackaging === 'singlePassOnly' ? 'Single-pass only' : 'Automatic');
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            renderResolvedPreview({
                modelKey: `${provider}:unresolved`,
                provider,
                modelId: 'unresolved',
                modelLabel: 'No eligible model',
                modelAlias: providerLabel[provider],
                strategyPill: strategyLabel(policy),
                analysisPackaging: aiSettings.analysisPackaging,
                maxInputTokens: null,
                maxOutputTokens: null,
                reasonDetails: message,
                warnings: [],
                availabilityStatus: 'unknown',
                showAvailabilityPill: false,
                passCount,
                errorMessage: message
            });
            capacityProvider.valueEl.setText(providerLabel[provider]);
            capacitySafeInput.valueEl.setText('Unavailable');
            capacityOutput.valueEl.setText('Unavailable');
            capacityMode.valueEl.setText(aiSettings.analysisPackaging === 'singlePassOnly' ? 'Single-pass only' : 'Automatic');
        }

        renderFeatureDefaultsCards();
        void refreshModelsTable();
    };

    refreshRoutingUi();

    // Provider sections
    const anthropicSection = advancedBody.createDiv({
        cls: ['ert-provider-section', 'ert-provider-anthropic', ERT_CLASSES.STACK]
    });
    const geminiSection = advancedBody.createDiv({
        cls: ['ert-provider-section', 'ert-provider-gemini', ERT_CLASSES.STACK]
    });
    const openaiSection = advancedBody.createDiv({
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
        const warningSetting = new Settings(advancedBody)
            .setName('Secure key saving unavailable')
            .setDesc('Secure key saving isn’t available in this Obsidian version. Older key fields remain available in Advanced sections.');
        params.addAiRelatedElement(warningSetting.settingEl);
    }

    if (secretStorageAvailable && hasLegacyKeyMaterial()) {
        const migrateKeysSetting = new Settings(advancedBody)
            .setName('Secure my saved keys')
            .setDesc('Moves older provider key fields into private saved keys and clears plaintext values.');
        migrateKeysSetting.addButton(button => button
            .setButtonText('Secure now')
            .onClick(async () => {
                button.setDisabled(true);
                try {
                    const migration = await migrateLegacyKeysToSecretStorage(plugin);
                    if (migration.migratedProviders.length) {
                        new Notice(`Secured ${migration.migratedProviders.length} provider key(s).`);
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
        span.textContent = `${options.providerName} key setup. `;
        const link = document.createElement('a');
        link.href = options.docsUrl;
        link.textContent = 'Get key';
        link.target = '_blank';
        link.rel = 'noopener';
        providerDesc.appendChild(span);
        providerDesc.appendChild(link);
        providerDesc.appendChild(document.createTextNode(' Use a short name like "openai-main" so you can reuse it later.'));

        const secretIdSetting = new Settings(options.section)
            .setName(`${options.providerName} saved key name`)
            .setDesc(providerDesc);
        const keyStatusSetting = new Settings(options.section)
            .setName(`${options.providerName} key status`)
            .setDesc('Not saved ⚠️');
        const applyKeyStatus = (status: 'saved' | 'saved_not_tested' | 'not_saved') => {
            if (status === 'saved') {
                keyStatusSetting.setDesc('Saved ✅');
                return;
            }
            if (status === 'saved_not_tested') {
                keyStatusSetting.setDesc('Saved (not tested)');
                return;
            }
            keyStatusSetting.setDesc('Not saved ⚠️');
        };
        const refreshKeyStatus = async (): Promise<void> => {
            const ai = ensureCanonicalAiSettings();
            if (secretStorageAvailable) {
                const savedKeyName = getCredentialSecretId(ai, options.provider);
                if (!savedKeyName) {
                    applyKeyStatus('not_saved');
                    return;
                }
                const exists = await hasSecret(app, savedKeyName);
                applyKeyStatus(exists ? 'saved_not_tested' : 'not_saved');
                return;
            }
            const legacyValue = options.legacyProvider === 'gemini'
                ? plugin.settings.geminiApiKey
                : options.legacyProvider === 'anthropic'
                ? plugin.settings.anthropicApiKey
                : plugin.settings.openaiApiKey;
            applyKeyStatus((legacyValue || '').trim() ? 'saved' : 'not_saved');
        };
        void refreshKeyStatus();
        secretIdSetting.addText(text => {
            const aiSettings = ensureCanonicalAiSettings();
            text.inputEl.addClass('ert-input--full');
            text
                .setPlaceholder(`${options.provider}-main`)
                .setValue(getCredentialSecretId(aiSettings, options.provider));
            plugin.registerDomEvent(text.inputEl, 'blur', () => {
                void (async () => {
                    const ai = ensureCanonicalAiSettings();
                    const nextId = text.getValue().trim();
                    setCredentialSecretId(ai, options.provider, nextId);
                    await persistCanonical();
                    await refreshKeyStatus();
                })();
            });
        });
        secretIdSetting.settingEl.addClass('ert-setting-full-width-input');

        if (secretStorageAvailable && SecretComponentCtor) {
            const secureKeySetting = new Settings(options.section)
                .setName(`${options.providerName} API key`)
                .setDesc('Keys are saved privately on this device. Radial Timeline never writes keys into your settings file.');
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
                        new Notice(`Set a ${options.providerName} saved key name first.`);
                        return;
                    }
                    const stored = await setSecret(app, secretId, value);
                    if (!stored) {
                        new Notice(`Unable to save ${options.providerName} key privately.`);
                        return;
                    }
                    if (options.legacyProvider === 'gemini') plugin.settings.geminiApiKey = '';
                    if (options.legacyProvider === 'anthropic') plugin.settings.anthropicApiKey = '';
                    if (options.legacyProvider === 'openai') plugin.settings.openaiApiKey = '';
                    await plugin.saveSettings();
                    await refreshKeyStatus();
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
            text: 'Advanced: Older key fields (not recommended)'
        });
        const legacyHost = legacyDetails.createDiv({ cls: ERT_CLASSES.STACK });
        if (secretStorageAvailable) {
            legacyHost.createDiv({
                cls: 'ert-field-note',
                text: 'Older key fields are disabled on this Obsidian version.'
            });
        } else {
            const legacySetting = new Settings(legacyHost)
                .setName(`${options.providerName} older API key`)
                .setDesc('Used only when secure key saving is unavailable.');
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
                        await refreshKeyStatus();
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

    const localWrapper = advancedBody.createDiv({
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
        text: `By default, no LLM pulses are written to the scene when local transformer is used. Rather it is stored in an AI log file in the local logs output folder (${aiLogFolder}), as the response does not follow directions and breaks scene hover formatting. You may still write scene hover Fields with local LLM by toggling off the setting "Bypass scene hover Fields writes" below.`
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
        .setName('Bypass scene hover Fields writes')
        .setDesc('Default is enabled. Local LLM triplet pulse analysis skips writing to the scene note and saves results in the AI log report instead. Recommended for local models.')
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
    localApiDetails.createEl('summary', { text: 'Advanced: local saved key (optional)' });
    const localApiContainer = localApiDetails.createDiv({ cls: ERT_CLASSES.STACK });

    const localSecretIdSetting = new Settings(localApiContainer)
        .setName('Local saved key name')
        .setDesc('Optional saved key name if your local gateway requires a key.');
    const localKeyStatusSetting = new Settings(localApiContainer)
        .setName('Local key status')
        .setDesc('Not saved ⚠️');
    const applyLocalKeyStatus = (status: 'saved' | 'saved_not_tested' | 'not_saved') => {
        if (status === 'saved') {
            localKeyStatusSetting.setDesc('Saved ✅');
            return;
        }
        if (status === 'saved_not_tested') {
            localKeyStatusSetting.setDesc('Saved (not tested)');
            return;
        }
        localKeyStatusSetting.setDesc('Not saved ⚠️');
    };
    const refreshLocalKeyStatus = async (): Promise<void> => {
        const savedKeyName = getCredentialSecretId(ensureCanonicalAiSettings(), 'ollama');
        if (secretStorageAvailable) {
            if (!savedKeyName) {
                applyLocalKeyStatus('not_saved');
                return;
            }
            const exists = await hasSecret(app, savedKeyName);
            applyLocalKeyStatus(exists ? 'saved_not_tested' : 'not_saved');
            return;
        }
        applyLocalKeyStatus((plugin.settings.localApiKey || '').trim() ? 'saved' : 'not_saved');
    };
    void refreshLocalKeyStatus();
    localSecretIdSetting.addText(text => {
        text.inputEl.addClass('ert-input--full');
        text.setPlaceholder('ollama-main').setValue(getCredentialSecretId(ensureCanonicalAiSettings(), 'ollama'));
        plugin.registerDomEvent(text.inputEl, 'blur', () => {
            void (async () => {
                const ai = ensureCanonicalAiSettings();
                setCredentialSecretId(ai, 'ollama', text.getValue().trim());
                await persistCanonical();
                await refreshLocalKeyStatus();
            })();
        });
    });
    localSecretIdSetting.settingEl.addClass('ert-setting-full-width-input');

    if (secretStorageAvailable && SecretComponentCtor) {
        const localSecretSetting = new Settings(localApiContainer)
            .setName('Local API key')
            .setDesc('Keys are saved privately on this device. Radial Timeline never writes keys into your settings file.');
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
                    new Notice('Set a local saved key name first.');
                    return;
                }
                const stored = await setSecret(app, secretId, key);
                if (!stored) {
                    new Notice('Unable to save local API key privately.');
                    return;
                }
                plugin.settings.localApiKey = '';
                await plugin.saveSettings();
                await refreshLocalKeyStatus();
                void params.scheduleKeyValidation('local');
            })();
        });
        localSecretSetting.settingEl.addClass('ert-setting-full-width-input');
    }

    if (secretStorageAvailable) {
        localApiContainer.createDiv({
            cls: 'ert-field-note',
            text: 'Older local key field is disabled on this Obsidian version.'
        });
    } else {
        const legacyLocalSetting = new Settings(localApiContainer)
            .setName('Older local API key')
            .setDesc('Used only when secure key saving is unavailable.');
        legacyLocalSetting.addText(text => {
            text.inputEl.addClass('ert-input--full');
            text.setPlaceholder('Optional local API key');
            text.setValue(plugin.settings.localApiKey || '');
            params.setKeyInputRef('local', text.inputEl);
            plugin.registerDomEvent(text.inputEl, 'blur', () => {
                void (async () => {
                    plugin.settings.localApiKey = text.getValue().trim();
                    await plugin.saveSettings();
                    await refreshLocalKeyStatus();
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
