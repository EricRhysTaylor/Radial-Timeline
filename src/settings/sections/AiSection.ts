import { Setting as Settings, Notice, DropdownComponent, setIcon, setTooltip } from 'obsidian';
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
import type { AccessTier, AIProviderId, ModelPolicy, ModelProfileName, Capability, ModelInfo } from '../../ai/types';

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
        text: 'Radial Timeline’s AI phylosophy is not to rewrite your work, but to act as a rigorous, genre-aware editor - analyzing structure, momentum, and continuity across scenes and materials. Use it to stress-test your manuscript, uncover hidden contradictions, and sharpen narrative identity while your voice remains fully your own.'
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
    const quickSetupPreviewSection = aiSettingsGroup.createDiv({
        cls: `${ERT_CLASSES.STACK} ert-ai-preview-section`
    });

    const ensureCanonicalAiSettings = () => {
        if (!plugin.settings.aiSettings) {
            plugin.settings.aiSettings = validateAiSettings(buildDefaultAiSettings()).value;
        }
        const validated = validateAiSettings(plugin.settings.aiSettings);
        Object.assign(plugin.settings.aiSettings, validated.value);
        return plugin.settings.aiSettings;
    };

    let isSyncingRoutingUi = false;

    const attachAiCollapseButton = (detailsEl: HTMLDetailsElement, summaryEl: HTMLElement): void => {
        const summaryLabel = summaryEl.textContent?.trim() || 'section';
        detailsEl.addClass('ert-ai-collapsible');
        summaryEl.empty();
        summaryEl.addClass('ert-ai-collapsible-summary');
        summaryEl.createSpan({ cls: 'ert-ai-collapsible-summary-label', text: summaryLabel });
        const toggleButton = summaryEl.createEl('button', {
            cls: `${ERT_CLASSES.ICON_BTN} ert-ai-fold-toggle`,
            attr: { type: 'button' }
        });

        const refreshToggle = (): void => {
            const expanded = detailsEl.open;
            const action = expanded ? 'Collapse' : 'Expand';
            setIcon(toggleButton, expanded ? 'chevron-down' : 'chevron-right');
            setTooltip(toggleButton, `${action} ${summaryLabel}`);
            toggleButton.setAttribute('aria-label', `${action} ${summaryLabel}`);
            toggleButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
            summaryEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        };

        toggleButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            detailsEl.open = !detailsEl.open;
            refreshToggle();
        });
        detailsEl.addEventListener('toggle', refreshToggle);
        refreshToggle();
    };

    const largeHandlingFold = aiSettingsGroup.createEl('details', { cls: 'ert-ai-fold ert-ai-large-handling' }) as HTMLDetailsElement;
    largeHandlingFold.setAttr('open', '');
    largeHandlingFold.setAttr('data-ert-role', 'ai-setting:large-manuscript-handling');
    const largeHandlingSummary = largeHandlingFold.createEl('summary', { text: 'Large Manuscript Handling & Multi-Pass Analysis' });
    attachAiCollapseButton(largeHandlingFold, largeHandlingSummary);
    const largeHandlingBody = largeHandlingFold.createDiv({ cls: `${ERT_CLASSES.STACK} ert-ai-large-handling-body` });
    largeHandlingBody.createDiv({
        cls: 'ert-section-desc',
        text: 'Requests are handled with safe per-pass limits so structure and references stay clear.'
    });

    const capacitySection = largeHandlingBody.createDiv({ cls: 'ert-ai-capacity-section' });
    capacitySection.createDiv({ cls: 'ert-ai-capacity-title', text: 'Context and forecast' });
    const capacityGrid = capacitySection.createDiv({ cls: 'ert-ai-capacity-grid' });
    const createCapacityCell = (label: string): { cellEl: HTMLElement; valueEl: HTMLElement } => {
        const cell = capacityGrid.createDiv({ cls: 'ert-ai-capacity-cell' });
        cell.createDiv({ cls: 'ert-ai-capacity-label', text: label });
        const valueEl = cell.createDiv({ cls: 'ert-ai-capacity-value', text: '—' });
        return { cellEl: cell, valueEl };
    };
    const capacitySafeInput = createCapacityCell('Safe input (per pass)');
    const capacityOutput = createCapacityCell('Response (per pass)');
    const capacityExample500k = createCapacityCell('Example A - 500,000 tokens');
    const capacityExample500kScope = capacityExample500k.valueEl.createDiv({
        cls: 'ert-ai-capacity-subcopy',
        text: 'Outline + scene summaries across the full manuscript'
    });
    const capacityExample500kEstimate = capacityExample500k.valueEl.createDiv({
        cls: 'ert-ai-capacity-estimate',
        text: 'Estimated: —'
    });

    const capacityExample1m = createCapacityCell('Example B - 1,000,000 tokens');
    const capacityExample1mScope = capacityExample1m.valueEl.createDiv({
        cls: 'ert-ai-capacity-subcopy',
        text: 'Full scene bodies + outline + character bios'
    });
    const capacityExample1mEstimate = capacityExample1m.valueEl.createDiv({
        cls: 'ert-ai-capacity-estimate',
        text: 'Estimated: —'
    });


    const packagingSection = largeHandlingBody.createDiv({
        cls: `${ERT_CLASSES.HERO_FEATURES} ${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}`
    });
    const analysisModes = packagingSection.createDiv({ cls: `${ERT_CLASSES.STACK} ert-ai-analysis-modes` });
    const createAnalysisModeBlock = (config: {
        icon: string;
        title: string;
        body: string;
        example?: string;
        questions: string[];
        note?: string;
        support?: string;
    }): void => {
        const block = analysisModes.createDiv({ cls: `${ERT_CLASSES.STACK} ert-ai-analysis-mode` });
        const content = block.createDiv({ cls: `${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT} ert-ai-analysis-mode-content` });
        content.createDiv({ cls: 'ert-ai-analysis-mode-title', text: config.title });
        content.createDiv({ cls: 'ert-ai-analysis-mode-body', text: config.body });
        if (config.example) {
            content.createDiv({ cls: 'ert-ai-analysis-mode-example', text: config.example });
        }

        const questionRow = block.createDiv({ cls: 'ert-ai-analysis-mode-question-row' });
        const icon = questionRow.createSpan({ cls: 'ert-ai-analysis-mode-icon' });
        setIcon(icon, config.icon);
        const questionList = questionRow.createDiv({ cls: `${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT} ert-ai-analysis-mode-questions` });
        config.questions.forEach(question => {
            const row = questionList.createDiv({ cls: 'ert-ai-analysis-mode-question' });
            const questionIcon = row.createSpan({ cls: 'ert-ai-analysis-mode-question-icon' });
            setIcon(questionIcon, 'message-circle-question-mark');
            row.createSpan({ cls: 'ert-ai-analysis-mode-question-text', text: question });
        });
        if (config.note) {
            block.createDiv({ cls: 'ert-ai-analysis-mode-note', text: config.note });
        }
        if (config.support) {
            block.createDiv({ cls: 'ert-ai-analysis-mode-support', text: config.support });
        }
    };

    createAnalysisModeBlock({
        icon: 'arrow-right',
        title: 'Single-Pass Analysis',
        body: 'Entire manuscript analyzed in one request. Best suited for deeply global thematic questions that depend on the full manuscript being considered at once.',
        questions: [
            'What is the central moral argument of this book?',
            'Does the ending fulfill the thematic promise of the opening?',
            'Is the protagonist’s transformation coherent across all acts?',
            'How does the midpoint reframe the final resolution?'
        ]
    });

    analysisModes.createDiv({ cls: 'ert-ai-analysis-mode-divider' });

    createAnalysisModeBlock({
        icon: 'git-fork',
        title: 'Multi-Pass Analysis',
        body: 'Large manuscripts are split into structured segments. Each segment is evaluated independently, and the findings are combined into one unified response. These questions evaluate structural patterns that can be analyzed segment by segment.',
        questions: [
            'Identify unresolved character arcs across the manuscript.',
            'Where does tension stall or repeat structurally?',
            'Detect timeline inconsistencies or continuity errors.',
            'Compare scene-level pacing patterns across acts.'
        ]
    });

    const executionPreferenceSetting = new Settings(largeHandlingBody)
        .setName('Execution Preference')
        .setDesc('Choose how large requests are handled during Inquiry. Tradeoff: single-pass can add nuance for highly global thematic interpretation, while multi-pass remains strong for structural diagnostics at scale. Automatic is recommended.');
    executionPreferenceSetting.settingEl.setAttr('data-ert-role', 'ai-setting:execution-preference');
    let executionPreferenceDropdown: DropdownComponent | null = null;
    executionPreferenceSetting.addDropdown(dropdown => {
        executionPreferenceDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--lg');
        dropdown.addOption('automatic', 'Automatic');
        dropdown.addOption('singlePassOnly', 'Single-pass only');
        dropdown.onChange(async value => {
            if (isSyncingRoutingUi) return;
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
    capacityExample500kScope.setText('Outline + scene summaries across the full manuscript');
    capacityExample1mScope.setText('Full scene bodies + outline + character bios');
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

    const aiDisplaySection = aiSettingsGroup.createDiv({
        cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ert-ai-section-card`
    });
    aiDisplaySection.createDiv({ cls: 'ert-section-title', text: 'Scene Hover Fields' });
    aiDisplaySection.createDiv({
        cls: 'ert-section-desc',
        text: 'Display preferences for Pulse triplet analysis visibility.'
    });

    const configurationFold = aiSettingsGroup.createEl('details', { cls: 'ert-ai-fold ert-ai-configuration' }) as HTMLDetailsElement;
    configurationFold.setAttr('open', '');
    const configurationSummary = configurationFold.createEl('summary', { text: 'Configuration' });
    attachAiCollapseButton(configurationFold, configurationSummary);
    const configurationBody = configurationFold.createDiv({ cls: ERT_CLASSES.STACK });

    const advancedFold = aiSettingsGroup.createEl('details', { cls: 'ert-ai-fold' }) as HTMLDetailsElement;
    const advancedSummary = advancedFold.createEl('summary', { text: 'Advanced & Diagnostics' });
    attachAiCollapseButton(advancedFold, advancedSummary);
    const advancedBody = advancedFold.createDiv({ cls: ERT_CLASSES.STACK });
    advancedBody.createDiv({
        cls: 'ert-section-desc',
        text: 'Infrastructure and troubleshooting tools. Most authors can ignore this section.'
    });

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

    const tripletDisplaySetting = new Settings(aiDisplaySection)
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

    const thinkingStyleLabel: Record<ThinkingStyleId, string> = {
        deepStructuralEdit: 'Deep Structural Edit',
        balancedEditorialReview: 'Balanced Editorial Review',
        quickStructuralPass: 'Quick Structural Pass'
    };

    const strategyLabel = (policy: ModelPolicy): string => {
        if (policy.type === 'pinned') return 'Manual Selection';
        return 'Auto (best match)';
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

    type ThinkingStyleId = 'deepStructuralEdit' | 'balancedEditorialReview' | 'quickStructuralPass';
    let thinkingStyleDropdown: DropdownComponent | null = null;

    const thinkingStyleToProfile = (style: ThinkingStyleId): ModelProfileName => {
        if (style === 'deepStructuralEdit') return 'deepReasoner';
        if (style === 'quickStructuralPass') return 'deepWriter';
        return 'balancedAnalysis';
    };

    const profileToThinkingStyle = (profile: ModelProfileName): ThinkingStyleId => {
        if (profile === 'deepReasoner') return 'deepStructuralEdit';
        if (profile === 'deepWriter') return 'quickStructuralPass';
        return 'balancedEditorialReview';
    };

    const inferThinkingStyleForAlias = (alias: string): ThinkingStyleId => {
        const model = BUILTIN_MODELS.find(m => m.alias === alias);
        if (!model) return 'balancedEditorialReview';
        const profiles: ModelProfileName[] = ['deepReasoner', 'balancedAnalysis', 'deepWriter'];
        let bestProfile: ModelProfileName = 'balancedAnalysis';
        let bestScore = -Infinity;
        for (const name of profiles) {
            const p = MODEL_PROFILES[name];
            const w = p.weighting ?? { reasoning: 0.34, writing: 0.33, determinism: 0.33 };
            const score = model.personality.reasoning * w.reasoning
                + model.personality.writing * w.writing
                + model.personality.determinism * w.determinism;
            if (score > bestScore) { bestScore = score; bestProfile = name; }
        }
        return profileToThinkingStyle(bestProfile);
    };

    const thinkingStyleToReasoningDepth = (style: ThinkingStyleId): 'standard' | 'deep' =>
        style === 'deepStructuralEdit' ? 'deep' : 'standard';

    const thinkingStyleToOutputMode = (
        style: ThinkingStyleId,
        tier: AccessTier
    ): 'auto' | 'high' | 'max' => {
        if (style === 'deepStructuralEdit') return tier >= 3 ? 'max' : 'high';
        if (style === 'quickStructuralPass') return 'auto';
        return tier >= 2 ? 'high' : 'auto';
    };

    const inferThinkingStyle = (): ThinkingStyleId => {
        const aiSettings = ensureCanonicalAiSettings();
        const policy = aiSettings.modelPolicy;
        if (policy.type === 'profile') {
            if (policy.profile === 'deepReasoner') return 'deepStructuralEdit';
            if (policy.profile === 'deepWriter') return 'quickStructuralPass';
            return 'balancedEditorialReview';
        }
        if (aiSettings.overrides.reasoningDepth === 'deep') return 'deepStructuralEdit';
        if (aiSettings.overrides.maxOutputMode === 'auto') return 'quickStructuralPass';
        return 'balancedEditorialReview';
    };

    const getThinkingStyleFromUiOrState = (): ThinkingStyleId => {
        const value = thinkingStyleDropdown?.selectEl.value;
        if (value === 'deepStructuralEdit' || value === 'balancedEditorialReview' || value === 'quickStructuralPass') {
            return value;
        }
        return inferThinkingStyle();
    };

    const applyThinkingStyleInternals = (
        aiSettings: ReturnType<typeof ensureCanonicalAiSettings>,
        provider: AIProviderId,
        style: ThinkingStyleId,
        options?: { forceProfile?: boolean }
    ): void => {
        const tier: AccessTier = (() => {
            if (provider === 'anthropic') return aiSettings.aiAccessProfile.anthropicTier ?? 1;
            if (provider === 'openai') return aiSettings.aiAccessProfile.openaiTier ?? 1;
            if (provider === 'google') return aiSettings.aiAccessProfile.googleTier ?? 1;
            return 1;
        })() as AccessTier;
        aiSettings.overrides.reasoningDepth = thinkingStyleToReasoningDepth(style);
        aiSettings.overrides.maxOutputMode = thinkingStyleToOutputMode(style, tier);
        if (options?.forceProfile || aiSettings.modelPolicy.type === 'profile') {
            aiSettings.modelPolicy = { type: 'profile', profile: thinkingStyleToProfile(style) };
        }
    };

    const providerSetting = new Settings(quickSetupGrid)
        .setName('Provider')
        .setDesc('Select the AI service that powers structural analysis and editorial insight.');
    providerSetting.settingEl.setAttr('data-ert-role', 'ai-setting:provider');
    let providerDropdown: DropdownComponent | null = null;
    providerSetting.addDropdown(dropdown => {
        providerDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md');
        dropdown.addOption('anthropic', 'Anthropic');
        dropdown.addOption('openai', 'OpenAI');
        dropdown.addOption('google', 'Google');
        dropdown.addOption('ollama', 'Local');
        dropdown.onChange(async value => {
            if (isSyncingRoutingUi) return;
            const aiSettings = ensureCanonicalAiSettings();
            const nextProvider = value as AIProviderId;
            const currentStyle = getThinkingStyleFromUiOrState();
            aiSettings.provider = nextProvider;
            applyThinkingStyleInternals(aiSettings, nextProvider, currentStyle, { forceProfile: aiSettings.modelPolicy.type !== 'pinned' });

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

    const thinkingStyleSetting = new Settings(quickSetupGrid)
        .setName('Thinking Style')
        .setDesc('Choose the depth and intensity of analysis. Radial Timeline automatically applies the strongest safe settings for the selected style.');
    thinkingStyleSetting.settingEl.setAttr('data-ert-role', 'ai-setting:thinking-style');
    thinkingStyleSetting.addDropdown(dropdown => {
        thinkingStyleDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md');
        dropdown.addOption('deepStructuralEdit', 'Deep Structural Edit');
        dropdown.addOption('balancedEditorialReview', 'Balanced Editorial Review');
        dropdown.addOption('quickStructuralPass', 'Quick Structural Pass');
        dropdown.onChange(async value => {
            if (isSyncingRoutingUi) return;
            const aiSettings = ensureCanonicalAiSettings();
            const provider = aiSettings.provider === 'none' ? 'openai' : aiSettings.provider;
            applyThinkingStyleInternals(aiSettings, provider, value as ThinkingStyleId, { forceProfile: true });
            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(thinkingStyleSetting.settingEl);

    const modelOverrideSetting = new Settings(quickSetupGrid)
        .setName('Model Override')
        .setDesc('Override the model selected by your thinking style. Most authors should leave this set to Auto.');
    modelOverrideSetting.settingEl.setAttr('data-ert-role', 'ai-setting:model-override');
    let modelOverrideDropdown: DropdownComponent | null = null;
    modelOverrideSetting.addDropdown(dropdown => {
        modelOverrideDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md');
        dropdown.onChange(async value => {
            if (isSyncingRoutingUi) return;
            const aiSettings = ensureCanonicalAiSettings();
            const provider = aiSettings.provider === 'none' ? 'openai' : aiSettings.provider;
            if (value === 'auto') {
                const style = getThinkingStyleFromUiOrState();
                aiSettings.modelPolicy = { type: 'profile', profile: thinkingStyleToProfile(style) };
                applyThinkingStyleInternals(aiSettings, provider, style, { forceProfile: true });
            } else {
                aiSettings.modelPolicy = { type: 'pinned', pinnedAlias: value };
                const snappedStyle = inferThinkingStyleForAlias(value);
                applyThinkingStyleInternals(aiSettings, provider, snappedStyle);
            }
            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(modelOverrideSetting.settingEl);

    const accessTierSetting = new Settings(quickSetupGrid)
        .setName('Access Tier')
        // Do not rewrite this copy as generic: it reflects limits specifically granted to the author/user by their provider.
        .setDesc('Increase available context headroom if your provider has granted you higher limits.');
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
            if (isSyncingRoutingUi) return;
            const aiSettings = ensureCanonicalAiSettings();
            const provider = aiSettings.provider === 'none' ? 'openai' : aiSettings.provider;
            const numTier = Number(value) as AccessTier;
            if (provider === 'anthropic') aiSettings.aiAccessProfile.anthropicTier = numTier;
            else if (provider === 'openai') aiSettings.aiAccessProfile.openaiTier = numTier;
            else if (provider === 'google') aiSettings.aiAccessProfile.googleTier = numTier;
            applyThinkingStyleInternals(aiSettings, provider, getThinkingStyleFromUiOrState());
            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(accessTierSetting.settingEl);

    const applyQuickSetupLayoutOrder = (): void => {
        [providerSetting, thinkingStyleSetting, modelOverrideSetting, accessTierSetting].forEach(setting => {
            quickSetupGrid.appendChild(setting.settingEl);
            setting.settingEl.addClass('ert-ai-grid-item');
        });
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

    const modelsPanel = advancedBody.createDiv({ cls: ['ert-panel', ERT_CLASSES.STACK, 'ert-ai-models-panel'] });
    const modelsHeader = modelsPanel.createDiv({ cls: 'ert-inline ert-inline--split' });
    modelsHeader.createDiv({ cls: 'ert-section-title', text: 'Models' });
    const modelsRefreshedEl = modelsHeader.createDiv({ cls: 'ert-ai-models-refreshed' });
    const modelsHintEl = modelsPanel.createDiv({ cls: 'ert-field-note' });
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

        const rawDetails = modelDetailsEl.createEl('details', { cls: 'ert-ai-model-raw' }) as HTMLDetailsElement;
        const rawSummary = rawDetails.createEl('summary', { text: 'Raw provider details' });
        attachAiCollapseButton(rawDetails, rawSummary);
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
            } catch {
                selection = null;
            }

            if (snapshot.snapshot) {
                modelsRefreshedEl.setText(`Last checked: ${snapshot.snapshot.generatedAt}`);
                modelsHintEl.setText(snapshot.warning || 'Availability reflects the latest provider snapshot.');
            } else if (!aiSettings.privacy.allowProviderSnapshot) {
                modelsRefreshedEl.setText('Availability: Disabled');
                modelsHintEl.setText('Enable Provider Snapshot above to show key-based model availability.');
            } else {
                modelsRefreshedEl.setText('Availability: Not checked yet');
                modelsHintEl.setText('Use Refresh Availability to fetch provider data.');
            }

            renderModelsTable(merged, selection);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            modelsRefreshedEl.setText('Availability: Check failed');
            modelsHintEl.setText(`Unable to render models table: ${message}`);
        }
    };

    const resolvedPreviewFrame = quickSetupPreviewSection.createDiv({
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


    applyStrategyRowCopyLayout(providerSetting, 'Select the AI service that powers structural analysis and editorial insight.');
    applyStrategyRowCopyLayout(thinkingStyleSetting, 'Choose the depth and intensity of analysis. Radial Timeline automatically applies the strongest safe settings for the selected style.');
    applyStrategyRowCopyLayout(modelOverrideSetting, 'Override the model selected by your thinking style. Most authors should leave this set to Auto.');
    applyStrategyRowCopyLayout(accessTierSetting, 'Increase available context headroom if your provider grants higher limits.');

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
        thinkingStylePill: string;
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
        const providerDetail = state.modelId && state.modelId !== 'unresolved'
            ? `${providerLabel[state.provider]} · ${state.modelId}`
            : `${providerLabel[state.provider]} · ${state.modelAlias}`;
        resolvedPreviewProvider.setText(providerDetail);
        resolvedPreviewPills.empty();

        createResolvedPreviewPill(state.strategyPill);
        createResolvedPreviewPill(state.thinkingStylePill);
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
        const thinkingStyle = inferThinkingStyle();

        if (aiSettings.modelPolicy.type === 'pinned') {
            const allowed = new Set(providerAliases);
            if (!aiSettings.modelPolicy.pinnedAlias || !allowed.has(aiSettings.modelPolicy.pinnedAlias)) {
                aiSettings.modelPolicy.pinnedAlias = getProviderDefaultAlias(provider);
            }
        }

        const policy = aiSettings.modelPolicy;

        isSyncingRoutingUi = true;
        try {
            setDropdownValueSafe(providerDropdown, provider, 'openai');
            setDropdownValueSafe(thinkingStyleDropdown, thinkingStyle, 'balancedEditorialReview');

            if (modelOverrideDropdown) {
                modelOverrideDropdown.selectEl.empty();
                modelOverrideDropdown.addOption('auto', 'Auto (recommended)');
                providerAliases.forEach(alias => {
                    const model = BUILTIN_MODELS.find(entry => entry.alias === alias);
                    const label = model ? `${model.label} (${alias})` : alias;
                    modelOverrideDropdown?.addOption(alias, label);
                });
                const overrideValue = policy.type === 'pinned'
                    ? policy.pinnedAlias || 'auto'
                    : 'auto';
                setDropdownValueSafe(modelOverrideDropdown, overrideValue, 'auto');
            }

            setDropdownValueSafe(executionPreferenceDropdown, aiSettings.analysisPackaging === 'singlePassOnly' ? 'singlePassOnly' : 'automatic', 'automatic');
        } finally {
            isSyncingRoutingUi = false;
        }
        updateExecutionPreferenceNote();
        remoteRegistryToggle?.setValue(aiSettings.privacy.allowRemoteRegistry);
        providerSnapshotToggle?.setValue(aiSettings.privacy.allowProviderSnapshot);

        [providerSetting, thinkingStyleSetting, modelOverrideSetting, accessTierSetting].forEach(setting => {
            setting.settingEl.toggleClass('ert-settings-hidden', false);
            setting.settingEl.toggleClass('ert-settings-visible', true);
        });

        const supportsAccessTier = provider === 'anthropic' || provider === 'openai' || provider === 'google';
        if (supportsAccessTier) {
            accessTierDropdown?.setValue(String(getAccessTier(provider)));
        } else {
            accessTierDropdown?.setValue('1');
        }

        const inquiryAdvanced = getLastAiAdvancedContext(plugin, 'InquiryMode');
        const passCount = typeof inquiryAdvanced?.executionPassCount === 'number' && inquiryAdvanced.executionPassCount > 1
            ? inquiryAdvanced.executionPassCount
            : null;

        capacitySafeInput.valueEl.setText('Calculating...');
        capacityOutput.valueEl.setText('Calculating...');
        capacityExample500kEstimate.setText('Estimated: Calculating...');
        capacityExample1mEstimate.setText('Estimated: Calculating...');

        try {
            const selection = selectModel(BUILTIN_MODELS, {
                provider,
                policy,
                requiredCapabilities: capabilityFloor,
                accessTier: supportsAccessTier ? getAccessTier(provider) : 1,
                contextTokensNeeded: 24000,
                outputTokensNeeded: 2000
            });
            const caps = computeCaps({
                provider,
                model: selection.model,
                accessTier: supportsAccessTier ? getAccessTier(provider) : 1,
                feature: 'InquiryMode',
                overrides: aiSettings.overrides
            });
            const safeBudgetTokens = Math.max(0, Math.floor(caps.maxInputTokens));
            const formatForecastPasses = (exampleTokens: number): string => {
                if (aiSettings.analysisPackaging === 'singlePassOnly') return 'Not possible — exceeds safe limit';
                if (safeBudgetTokens <= 0) return 'Unavailable';
                const passes = Math.ceil(exampleTokens / safeBudgetTokens);
                return `${passes} structured passes (Automatic)`;
            };
            const previewState: ResolvedPreviewRenderState = {
                modelKey: `${provider}:${selection.model.id}`,
                provider,
                modelId: selection.model.id,
                modelLabel: selection.model.label,
                modelAlias: selection.model.alias,
                strategyPill: strategyLabel(policy),
                thinkingStylePill: thinkingStyleLabel[thinkingStyle],
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
            capacitySafeInput.valueEl.setText(`~${safeBudgetTokens.toLocaleString()} tokens (safe window)`);
            capacityOutput.valueEl.setText(`~${caps.maxOutputTokens.toLocaleString()} tokens`);
            capacityExample500kEstimate.setText(`Estimated: ${formatForecastPasses(500000)}`);
            capacityExample1mEstimate.setText(`Estimated: ${formatForecastPasses(1000000)}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            renderResolvedPreview({
                modelKey: `${provider}:unresolved`,
                provider,
                modelId: 'unresolved',
                modelLabel: 'No eligible model',
                modelAlias: providerLabel[provider],
                strategyPill: strategyLabel(policy),
                thinkingStylePill: thinkingStyleLabel[thinkingStyle],
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
            capacitySafeInput.valueEl.setText('Unavailable');
            capacityOutput.valueEl.setText('Unavailable');
            capacityExample500kEstimate.setText('Estimated: Unavailable');
            capacityExample1mEstimate.setText('Estimated: Unavailable');
        }

        void refreshModelsTable();
    };

    refreshRoutingUi();

    // Provider sections
    const anthropicSection = configurationBody.createDiv({
        cls: ['ert-provider-section', 'ert-provider-anthropic', ERT_CLASSES.STACK]
    });
    const geminiSection = configurationBody.createDiv({
        cls: ['ert-provider-section', 'ert-provider-gemini', ERT_CLASSES.STACK]
    });
    const openaiSection = configurationBody.createDiv({
        cls: ['ert-provider-section', 'ert-provider-openai', ERT_CLASSES.STACK]
    });
    params.setProviderSections({ anthropic: anthropicSection, gemini: geminiSection, openai: openaiSection });
    params.addAiRelatedElement(anthropicSection);
    params.addAiRelatedElement(geminiSection);
    params.addAiRelatedElement(openaiSection);

    const secretStorageAvailable = isSecretStorageAvailable(app);

    const hasLegacyKeyMaterial = (): boolean => {
        return !!(
            plugin.settings.openaiApiKey?.trim()
            || plugin.settings.anthropicApiKey?.trim()
            || plugin.settings.geminiApiKey?.trim()
            || plugin.settings.localApiKey?.trim()
        );
    };

    if (!secretStorageAvailable) {
        const warningSetting = new Settings(configurationBody)
            .setName('Secure key saving unavailable')
            .setDesc('Secure key saving is unavailable in this Obsidian build. Older key fields remain available as fallback.');
        params.addAiRelatedElement(warningSetting.settingEl);
    }

    if (secretStorageAvailable && hasLegacyKeyMaterial()) {
        const migrateKeysSetting = new Settings(configurationBody)
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

    type KeyStatus = 'saved' | 'saved_not_tested' | 'not_saved';
    const configureSensitiveInput = (inputEl: HTMLInputElement): void => {
        inputEl.type = 'password';
        inputEl.autocomplete = 'new-password';
        inputEl.spellcheck = false;
    };
    const buildKeyStatusDesc = (status: KeyStatus): DocumentFragment => {
        const desc = document.createDocumentFragment();
        const row = document.createElement('span');
        row.className = `ert-ai-key-status is-${status}`;
        const icon = row.createSpan({ cls: 'ert-ai-key-status__icon' });
        const text = row.createSpan({ cls: 'ert-ai-key-status__text' });
        if (status === 'saved') {
            setIcon(icon, 'check-circle-2');
            text.setText('Saved');
        } else if (status === 'saved_not_tested') {
            setIcon(icon, 'shield-check');
            text.setText('Saved (not tested)');
        } else {
            setIcon(icon, 'alert-triangle');
            text.setText('Not saved');
        }
        desc.appendChild(row);
        return desc;
    };

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
            .setDesc(buildKeyStatusDesc('not_saved'));
        const applyKeyStatus = (status: KeyStatus) => {
            keyStatusSetting.setDesc(buildKeyStatusDesc(status));
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

        if (secretStorageAvailable) {
            const secureKeySetting = new Settings(options.section)
                .setName(`${options.providerName} API key`)
                .setDesc('Saved privately on this device. Paste a key and leave the field to save or replace it. Keys are never written to your settings file.');
            secureKeySetting.addText(text => {
                text.inputEl.addClass('ert-input--full');
                configureSensitiveInput(text.inputEl);
                text.setPlaceholder(options.keyPlaceholder);
                params.setKeyInputRef(options.legacyProvider, text.inputEl);

                void (async () => {
                    const ai = ensureCanonicalAiSettings();
                    const currentSecret = await getSecret(app, getCredentialSecretId(ai, options.provider));
                    if (currentSecret) {
                        text.setValue(currentSecret);
                    }
                })();

                plugin.registerDomEvent(text.inputEl, 'blur', () => {
                    void (async () => {
                        const value = text.getValue().trim();
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
            });
            secureKeySetting.settingEl.addClass('ert-setting-full-width-input');
        }

        const legacyDetails = options.section.createEl('details', {
            cls: 'ert-ai-legacy-credentials'
        }) as HTMLDetailsElement;
        if (!secretStorageAvailable) {
            legacyDetails.setAttr('open', '');
        }
        const legacySummary = legacyDetails.createEl('summary', {
            text: 'Advanced: Older key fields (not recommended)'
        });
        attachAiCollapseButton(legacyDetails, legacySummary);
        const legacyHost = legacyDetails.createDiv({ cls: ERT_CLASSES.STACK });
        if (secretStorageAvailable) {
            legacyHost.createDiv({
                cls: 'ert-field-note',
                text: 'Older key fields are disabled while secure key saving is enabled.'
            });
        } else {
            const legacySetting = new Settings(legacyHost)
                .setName(`${options.providerName} older API key`)
                .setDesc('Used only when secure key saving is unavailable.');
            legacySetting.addText(text => {
                text.inputEl.addClass('ert-input--full');
                configureSensitiveInput(text.inputEl);
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

    const localWrapper = configurationBody.createDiv({
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

    const localApiDetails = localExtrasStack.createEl('details', { cls: 'ert-ai-legacy-credentials' }) as HTMLDetailsElement;
    if (!secretStorageAvailable) {
        localApiDetails.setAttr('open', '');
    }
    const localApiSummary = localApiDetails.createEl('summary', { text: 'Advanced: local saved key (optional)' });
    attachAiCollapseButton(localApiDetails, localApiSummary);
    const localApiContainer = localApiDetails.createDiv({ cls: ERT_CLASSES.STACK });

    const localSecretIdSetting = new Settings(localApiContainer)
        .setName('Local saved key name')
        .setDesc('Optional saved key name if your local gateway requires a key.');
    const localKeyStatusSetting = new Settings(localApiContainer)
        .setName('Local key status')
        .setDesc(buildKeyStatusDesc('not_saved'));
    const applyLocalKeyStatus = (status: KeyStatus) => {
        localKeyStatusSetting.setDesc(buildKeyStatusDesc(status));
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

    if (secretStorageAvailable) {
        const localSecretSetting = new Settings(localApiContainer)
            .setName('Local API key')
            .setDesc('Saved privately on this device. Paste a key and leave the field to save or replace it.');
        localSecretSetting.addText(text => {
            text.inputEl.addClass('ert-input--full');
            configureSensitiveInput(text.inputEl);
            text.setPlaceholder('Optional local API key');
            params.setKeyInputRef('local', text.inputEl);

            void (async () => {
                const ai = ensureCanonicalAiSettings();
                const currentSecret = await getSecret(app, getCredentialSecretId(ai, 'ollama'));
                if (currentSecret) {
                    text.setValue(currentSecret);
                }
            })();

            plugin.registerDomEvent(text.inputEl, 'blur', () => {
                void (async () => {
                    const key = text.getValue().trim();
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
        });
        localSecretSetting.settingEl.addClass('ert-setting-full-width-input');
    }

    if (secretStorageAvailable) {
        localApiContainer.createDiv({
            cls: 'ert-field-note',
            text: 'Older local key field is disabled while secure key saving is enabled.'
        });
    } else {
        const legacyLocalSetting = new Settings(localApiContainer)
            .setName('Older local API key')
            .setDesc('Used only when secure key saving is unavailable.');
        legacyLocalSetting.addText(text => {
            text.inputEl.addClass('ert-input--full');
            configureSensitiveInput(text.inputEl);
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

    // Final section order in AI tab:
    // 1) AI Display (Pulse toggle)
    // 2) Role context
    // 3) Preview
    // 4) AI Strategy
    // 5) Large Manuscript Handling
    // 6) Configuration
    // 7) Advanced & Diagnostics
    [
        aiDisplaySection,
        roleContextSection,
        quickSetupPreviewSection,
        quickSetupSection,
        largeHandlingFold,
        configurationFold,
        advancedFold
    ].forEach(section => aiSettingsGroup.appendChild(section));

    // Apply provider dimming on first render
    params.refreshProviderDimming();

    // Set initial visibility state
    params.toggleAiSettingsVisibility(plugin.settings.enableAiSceneAnalysis ?? true);
}
