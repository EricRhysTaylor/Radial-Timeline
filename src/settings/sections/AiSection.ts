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
import { BUILTIN_MODELS } from '../../ai/registry/builtinModels';
import { getPickerModelsForProvider, selectLatestModelByReleaseChannel } from '../../ai/registry/releaseChannels';
import { selectModel } from '../../ai/router/selectModel';
import { computeCaps } from '../../ai/caps/computeCaps';
import { getAIClient } from '../../ai/runtime/aiClient';
import type { InquiryAdvisoryContext } from '../../inquiry/services/inquiryAdvisory';
import {
    getCredential,
    getCredentialSecretId,
    migrateLegacyKeysToSecretStorage,
    setCredentialSecretId
} from '../../ai/credentials/credentials';
import { getSecret, hasSecret, isSecretStorageAvailable, setSecret } from '../../ai/credentials/secretStorage';
import type { AccessTier, AIProviderId, Capability } from '../../ai/types';
import { estimateGossamerTokens, estimateInquiryTokens } from '../../ai/forecast/estimateTokensFromVault';

type Provider = 'anthropic' | 'gemini' | 'openai' | 'local';
type GossamerEvidencePreference = 'auto' | 'summaries' | 'bodies';

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
        text: 'Radial Timeline\u2019s AI phylosophy is about helping the author efficiently and effectively prepare their creative work for human editors and a human audience. AI acts as a rigorous, genre-aware editor - analyzing structure, momentum, and continuity across scenes and materials. Use it to stress-test your manuscript, uncover hidden contradictions, and sharpen narrative identity while your voice remains fully your own.'
    });
    const heroOnFeatures = heroOnState.createDiv({
        cls: `${ERT_CLASSES.HERO_FEATURES} ${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}`
    });
    heroOnFeatures.createEl('h5', { text: 'AI HIGHLIGHTS', cls: 'ert-kicker' });
    const heroOnList = heroOnFeatures.createEl('ul', { cls: ERT_CLASSES.STACK });
    [
        { icon: 'waves', text: 'Inquiry - Ask precise, cross-scene questions and receive structured editorial feedback.' },
        { icon: 'activity', text: 'Pulse (Triplet Analysis) - Examine scenes in context using Radial Timeline\u2019s three-scene lens.' },
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
    const largeHandlingSummary = largeHandlingFold.createEl('summary', { text: 'Large Manuscript Handling & Multi-Pass Analysis (Inquiry & Gossamer)' });
    attachAiCollapseButton(largeHandlingFold, largeHandlingSummary);
    const largeHandlingBody = largeHandlingFold.createDiv({ cls: `${ERT_CLASSES.STACK} ert-ai-large-handling-body` });
    largeHandlingBody.createDiv({
        cls: 'ert-section-desc',
        text: 'Requests are handled with safe per-pass limits so structure and references stay clear.'
    });

    const capacitySection = largeHandlingBody.createDiv({ cls: 'ert-ai-capacity-section' });
    capacitySection.createDiv({ cls: 'ert-ai-capacity-title', text: 'Context and forecast' });
    const capacityGrid = capacitySection.createDiv({ cls: 'ert-ai-capacity-grid' });
    const createCapacityCell = (label: string): { cellEl: HTMLElement; valueEl: HTMLElement; labelEl: HTMLElement } => {
        const cell = capacityGrid.createDiv({ cls: 'ert-ai-capacity-cell' });
        const labelEl = cell.createDiv({ cls: 'ert-ai-capacity-label', text: label });
        const valueEl = cell.createDiv({ cls: 'ert-ai-capacity-value' });
        return { cellEl: cell, valueEl, labelEl };
    };
    const setTokenDisplay = (el: HTMLElement, numericText: string, unitText: string): void => {
        el.empty();
        el.createSpan({ cls: 'ert-ai-token-value', text: numericText });
        el.createSpan({ cls: 'ert-ai-token-unit', text: unitText });
    };
    const capacitySafeInput = createCapacityCell('Safe input (per pass)');
    const capacityOutput = createCapacityCell('Response (per pass)');
    const capacityInquiry = createCapacityCell('Inquiry');
    capacityInquiry.labelEl.addClass('ert-ai-capacity-label--forecast');
    const capacityInquiryToken = capacityInquiry.valueEl.createDiv({
        cls: 'ert-ai-capacity-meta',
        text: 'Calculating...'
    });
    const capacityInquiryScope = capacityInquiry.valueEl.createDiv({
        cls: 'ert-ai-capacity-meta',
        text: 'Scanning vault…'
    });
    const capacityInquiryExpected = capacityInquiry.valueEl.createDiv({
        cls: 'ert-ai-capacity-meta',
        text: 'Calculating...'
    });

    const capacityGossamer = createCapacityCell('Gossamer');
    capacityGossamer.labelEl.addClass('ert-ai-capacity-label--forecast');
    const capacityGossamerToken = capacityGossamer.valueEl.createDiv({
        cls: 'ert-ai-capacity-meta',
        text: 'Calculating...'
    });
    const capacityGossamerScope = capacityGossamer.valueEl.createDiv({
        cls: 'ert-ai-capacity-meta',
        text: 'Scanning vault…'
    });
    const capacityGossamerExpected = capacityGossamer.valueEl.createDiv({
        cls: 'ert-ai-capacity-meta',
        text: 'Calculating...'
    });


    // ── Status grid: compact 2-column (label + chip) ──
    const statusGrid = largeHandlingBody.createDiv({ cls: 'ert-ai-status-grid' });
    const createStatusRow = (label: string): { rowEl: HTMLElement; chipEl: HTMLElement } => {
        const row = statusGrid.createDiv({ cls: 'ert-ai-status-row' });
        row.createDiv({ cls: 'ert-ai-status-label', text: label });
        const chipEl = row.createDiv({ cls: 'ert-ai-status-chip' });
        return { rowEl: row, chipEl };
    };
    const singlePassRow = createStatusRow('Single-Pass');
    const multiPassRow = createStatusRow('Multi-Pass');
    const segmentedRow = createStatusRow('Segmented');

    // ── Near-limit indicator ──
    const nearLimitEl = largeHandlingBody.createDiv({ cls: 'ert-ai-near-limit ert-settings-hidden' });
    const nearLimitIcon = nearLimitEl.createSpan({ cls: 'ert-ai-near-limit-icon' });
    setIcon(nearLimitIcon, 'alert-triangle');
    nearLimitEl.createSpan({ text: 'Near context limit \u2014 segmentation may activate (or costs may rise)' });

    // ── Details link → modal ──
    const detailsBtn = largeHandlingBody.createDiv({ cls: 'ert-ai-details-link' });
    detailsBtn.createSpan({ text: 'How analysis passes work \u2192' });
    detailsBtn.addEventListener('click', () => {
        const { AiPassStrategyDetailsModal } = require('../../modals/AiPassStrategyDetailsModal');
        new AiPassStrategyDetailsModal(plugin.app).open();
    });

    // ── Execution preference dropdown ──
    const executionPreferenceSetting = new Settings(largeHandlingBody)
        .setName('Execution Preference')
        .setDesc('Choose how large requests are handled during Inquiry. Automatic is recommended.');
    executionPreferenceSetting.settingEl.setAttr('data-ert-role', 'ai-setting:execution-preference');
    let executionPreferenceDropdown: DropdownComponent | null = null;
    executionPreferenceSetting.addDropdown(dropdown => {
        executionPreferenceDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--lg');
        dropdown.addOption('automatic', 'Automatic');
        dropdown.addOption('singlePassOnly', 'Single-pass only');
        dropdown.addOption('segmented', 'Segmented (always split)');
        dropdown.onChange(async value => {
            if (isSyncingRoutingUi) return;
            const aiSettings = ensureCanonicalAiSettings();
            aiSettings.analysisPackaging =
                value === 'singlePassOnly' ? 'singlePassOnly'
                : value === 'segmented' ? 'segmented'
                : 'automatic';
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
                : mode === 'segmented'
                ? 'Always splits into structured segments, even when content fits in a single pass.'
                : ''
        );
        executionPreferenceNote.toggleClass('ert-settings-hidden', mode === 'automatic');
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

    const configurationFold = aiSettingsGroup.createDiv({
        cls: `ert-ai-fold ert-ai-configuration ${ERT_CLASSES.STACK}`
    });
    configurationFold.createDiv({ cls: 'ert-ai-fold-heading', text: 'Configuration' });
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

    let gossamerEvidenceDropdown: DropdownComponent | null = null;
    const getGossamerEvidencePreference = (): GossamerEvidencePreference => {
        const mode = plugin.settings.gossamerEvidenceMode;
        if (mode === 'summaries' || mode === 'bodies' || mode === 'auto') return mode;
        return 'auto';
    };
    const gossamerEvidenceSetting = new Settings(aiSettingsGroup)
        .setName('Gossamer material')
        .setDesc('Auto sends current manuscript body content to AI and switches to summaries only when the selected model cannot safely accept the full body payload.')
        .addDropdown(dropdown => {
            gossamerEvidenceDropdown = dropdown;
            dropdown.selectEl.addClass('ert-input', 'ert-input--md');
            dropdown.addOption('auto', 'Auto');
            dropdown.addOption('summaries', 'Summaries');
            dropdown.addOption('bodies', 'Scene bodies only');
            dropdown.onChange(async value => {
                if (isSyncingRoutingUi) return;
                plugin.settings.gossamerEvidenceMode = value === 'summaries'
                    ? 'summaries'
                    : value === 'bodies'
                        ? 'bodies'
                        : 'auto';
                await persistCanonical();
                refreshRoutingUi();
            });
            dropdown.setValue(getGossamerEvidencePreference());
        });
    gossamerEvidenceSetting.settingEl.setAttr('data-ert-role', 'ai-setting:gossamer-evidence');
    gossamerEvidenceSetting.settingEl.addClass(ERT_CLASSES.ROW);
    params.addAiRelatedElement(gossamerEvidenceSetting.settingEl);

    const capabilityFloor: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'];
    const providerLabel: Record<AIProviderId, string> = {
        anthropic: 'Anthropic',
        openai: 'OpenAI',
        google: 'Google',
        ollama: 'Ollama',
        none: 'Disabled'
    };

    const formatApproxTokens = (value: number): string => {
        if (!Number.isFinite(value) || value <= 0) return 'n/a';
        if (value >= 1_000_000) {
            const millions = value / 1_000_000;
            const formatted = millions >= 10 ? millions.toFixed(1) : millions.toFixed(2);
            return `~${formatted}M`;
        }
        if (value < 1000) return `~${Math.round(value)}`;
        const rounded = Math.round(value / 1000);
        return `~${rounded}k`;
    };

    const OPENAI_CONTEXT_WINDOW = 1_050_000;
    const GOOGLE_CONTEXT_WINDOW = 1_048_576;

    type PreviewSignalType =
        | 'context'
        | 'response'
        | 'manuscriptCitations'
        | 'contextCompare';

    interface PreviewSignal {
        type: PreviewSignalType;
        text: string;
    }

    const PREVIEW_SIGNAL_PRIORITY: readonly PreviewSignalType[] = [
        'context',
        'response',
        'manuscriptCitations',
        'contextCompare'
    ] as const;
    const MAX_PREVIEW_SIGNALS = 4;

    const resolvePreviewSignals = (state: {
        provider: AIProviderId;
        maxInputTokens: number | null;
        maxOutputTokens: number | null;
    }): string[] => {
        const candidates: PreviewSignal[] = [];
        candidates.push({
            type: 'context',
            text: `Context · ${state.maxInputTokens ? formatApproxTokens(state.maxInputTokens) : 'n/a'}`
        });
        candidates.push({
            type: 'response',
            text: `Response · ${state.maxOutputTokens ? `${formatApproxTokens(state.maxOutputTokens)} / pass` : 'n/a'}`
        });

        if (state.provider === 'anthropic') {
            candidates.push({
                type: 'manuscriptCitations',
                text: 'Manuscript citations'
            });
        }

        if (state.provider === 'openai' || state.provider === 'google') {
            candidates.push({
                type: 'contextCompare',
                text: `Context compare · OpenAI ${formatApproxTokens(OPENAI_CONTEXT_WINDOW)} > Gemini ${formatApproxTokens(GOOGLE_CONTEXT_WINDOW)}`
            });
        }

        const allowed = new Set<PreviewSignalType>(PREVIEW_SIGNAL_PRIORITY);
        const sorted = candidates
            .filter(signal => allowed.has(signal.type))
            .sort((left, right) => PREVIEW_SIGNAL_PRIORITY.indexOf(left.type) - PREVIEW_SIGNAL_PRIORITY.indexOf(right.type))
            .slice(0, MAX_PREVIEW_SIGNALS)
            .map(signal => signal.text);
        return sorted;
    };

    const getProviderAllowedAliases = (provider: AIProviderId): string[] =>
        BUILTIN_MODELS
            .filter(model => model.provider === provider && model.status !== 'deprecated')
            .map(model => model.alias);

    const getProviderPickerAliases = (provider: AIProviderId): string[] => {
        return getPickerModelsForProvider(BUILTIN_MODELS, provider).map(model => model.alias);
    };

    const isOpenAiInternalAlias = (alias: string): boolean =>
        !!alias
        && BUILTIN_MODELS.some(model => model.provider === 'openai' && model.alias === alias)
        && !getProviderPickerAliases('openai').includes(alias);

    const formatOpenAiInternalPinnedLabel = (alias: string): string => {
        const model = BUILTIN_MODELS.find(entry => entry.provider === 'openai' && entry.alias === alias);
        if (!model) return 'Pinned internal model';
        if (model.rollout?.datedVariantOf) {
            const canonical = BUILTIN_MODELS.find(entry => entry.alias === model.rollout?.datedVariantOf);
            const canonicalLabel = canonical?.label || model.label;
            const dated = model.id.match(/(\d{4}-\d{2}-\d{2})$/)?.[1];
            return dated
                ? `${canonicalLabel} Snapshot (${dated}, pinned)`
                : `${canonicalLabel} Snapshot (pinned)`;
        }
        return `${model.label} (Pinned internal)`;
    };

    const getProviderDefaultAlias = (provider: AIProviderId): string | undefined =>
        (provider === 'openai'
            ? selectLatestModelByReleaseChannel(BUILTIN_MODELS, 'openai', 'stable')?.alias
            : undefined)
        ?? getProviderPickerAliases(provider)[0]
        ?? BUILTIN_MODELS.find(model => model.provider === provider && model.status === 'stable')?.alias
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
        plugin.getInquiryService().notifyAiSettingsChanged();
    };

    const providerSetting = new Settings(quickSetupGrid)
        .setName('Provider')
        .setDesc('Select the AI service that powers structural analysis and editorial insight.');
    providerSetting.settingEl.setAttr('data-ert-role', 'ai-setting:provider');
    let providerDropdown: DropdownComponent | null = null;
    providerSetting.addDropdown(dropdown => {
        providerDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md', 'ert-ai-strategy-select');
        dropdown.addOption('anthropic', 'Anthropic');
        dropdown.addOption('openai', 'OpenAI');
        dropdown.addOption('google', 'Google');
        dropdown.addOption('ollama', 'Local');
        dropdown.onChange(async value => {
            if (isSyncingRoutingUi) return;
            const aiSettings = ensureCanonicalAiSettings();
            const nextProvider = value as AIProviderId;
            aiSettings.provider = nextProvider;

            if (aiSettings.modelPolicy.type === 'pinned') {
                const allowed = new Set(getProviderAllowedAliases(nextProvider));
                if (!aiSettings.modelPolicy.pinnedAlias || !allowed.has(aiSettings.modelPolicy.pinnedAlias)) {
                    aiSettings.modelPolicy.pinnedAlias = getProviderDefaultAlias(nextProvider);
                }
            }

            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(providerSetting.settingEl);

    const modelOverrideSetting = new Settings(quickSetupGrid)
        .setName('Model')
        .setDesc('Choose Auto to use the latest stable model, or pick a specific model.');
    modelOverrideSetting.settingEl.setAttr('data-ert-role', 'ai-setting:model-override');
    let modelOverrideDropdown: DropdownComponent | null = null;
    modelOverrideSetting.addDropdown(dropdown => {
        modelOverrideDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md', 'ert-ai-strategy-select');
        dropdown.onChange(async value => {
            if (isSyncingRoutingUi) return;
            const aiSettings = ensureCanonicalAiSettings();
            if (value === 'auto') {
                aiSettings.modelPolicy = { type: 'latestStable' };
            } else {
                aiSettings.modelPolicy = { type: 'pinned', pinnedAlias: value };
            }
            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(modelOverrideSetting.settingEl);

    // Do not rewrite this copy as generic: it reflects limits specifically granted to the author/user by their provider.
    const ACCESS_TIER_COPY = 'Increase available context headroom if your provider has granted you a higher Tier.';

    const accessTierSetting = new Settings(quickSetupGrid)
        .setName('Access')
        .setDesc(ACCESS_TIER_COPY);
    accessTierSetting.settingEl.setAttr('data-ert-role', 'ai-setting:access-level');
    let accessTierDropdown: DropdownComponent | null = null;
    accessTierSetting.addDropdown(dropdown => {
        accessTierDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md', 'ert-ai-strategy-select');
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
            await persistCanonical();
            refreshRoutingUi();
        });
    });
    params.addAiRelatedElement(accessTierSetting.settingEl);

    const applyQuickSetupLayoutOrder = (): void => {
        [providerSetting, modelOverrideSetting, accessTierSetting].forEach(setting => {
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

    const aiModelUpdatesSetting = new Settings(advancedBody)
        .setName('AI Model Updates');
    const formatModelUpdateTimestamp = (timestamp: string): string => {
        const parsed = Date.parse(timestamp);
        if (!Number.isFinite(parsed)) return timestamp;
        try {
            return new Intl.DateTimeFormat(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                timeZoneName: 'short'
            }).format(new Date(parsed));
        } catch {
            return new Date(parsed).toLocaleString();
        }
    };
    const updateAiModelUpdatesDescription = (): void => {
        const lastUpdatedAt = getAIClient(plugin).getLastModelUpdateAt();
        aiModelUpdatesSetting.setDesc(`Last updated: ${lastUpdatedAt ? formatModelUpdateTimestamp(lastUpdatedAt) : 'Never'}`);
    };
    aiModelUpdatesSetting.addButton(button => button
        .setButtonText('Update AI models')
        .onClick(async () => {
            button.setDisabled(true);
            try {
                const refreshed = await getAIClient(plugin).updateModelData(true);
                updateAiModelUpdatesDescription();
                refreshRoutingUi();
                const warnings = [refreshed.registry.warning, refreshed.snapshot.warning]
                    .filter((entry): entry is string => !!entry);
                if (warnings.length) {
                    new Notice('AI models updated with partial availability data.');
                } else {
                    new Notice('AI models updated.');
                }
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                new Notice(`AI model update failed: ${message}`);
            } finally {
                button.setDisabled(false);
            }
        }));
    updateAiModelUpdatesDescription();
    params.addAiRelatedElement(aiModelUpdatesSetting.settingEl);

    const inquiryAdvisoryFrame = quickSetupPreviewSection.createDiv({
        cls: [ERT_CLASSES.PREVIEW_FRAME, ERT_CLASSES.STACK, 'ert-previewFrame--flush', 'ert-ai-inquiry-advisory'],
        attr: { 'data-ert-role': 'ai-setting:inquiry-advisory' }
    });

    interface InquiryAdvisoryPresentation {
        reasonLine: string;
        exampleLines: string[];
        suggestedEngineLine: string;
    }

    const renderInquiryAdvisoryReasonLine = (context: InquiryAdvisoryContext): string => {
        if (context.recommendation.reasonCode === 'sources_preferred') {
            return 'Direct manuscript citations are available with this engine.';
        }
        if (context.recommendation.reasonCode === 'single_pass_preferred') {
            return 'This engine can fit the current corpus in one pass.';
        }
        if (context.recommendation.reasonCode === 'cost_reuse_preferred') {
            return 'This engine supports corpus reuse for repeated runs.';
        }
        return 'Use this when you want deeper reasoning for difficult structural analysis.';
    };

    const renderInquiryAdvisoryExampleLines = (context: InquiryAdvisoryContext): string[] => {
        if (context.recommendation.reasonCode === 'sources_preferred') {
            return [
                'Finding',
                'Continuity drift appears across adjacent scenes.',
                'Source',
                `${context.focusLabel} · scene excerpt`
            ];
        }
        if (context.recommendation.reasonCode === 'single_pass_preferred') {
            const currentPasses = Math.max(1, context.corpus.expectedPassCount);
            return [
                `Current setup · ~${currentPasses} passes`,
                'Suggested engine · 1 pass'
            ];
        }
        if (context.recommendation.reasonCode === 'cost_reuse_preferred') {
            return [
                'Repeated runs resend the corpus',
                'Reuse keeps repeated runs lighter'
            ];
        }
        return [
            'Use for difficult structural tradeoffs.',
            'Deeper reasoning helps with causality checks.'
        ];
    };

    const presentInquiryAdvisory = (context: InquiryAdvisoryContext): InquiryAdvisoryPresentation => ({
        reasonLine: renderInquiryAdvisoryReasonLine(context),
        exampleLines: renderInquiryAdvisoryExampleLines(context),
        suggestedEngineLine: `Suggested engine · ${context.recommendation.providerLabel} · ${context.recommendation.modelLabel}`
    });

    const renderInquiryAdvisoryBanner = (context: InquiryAdvisoryContext | null): void => {
        inquiryAdvisoryFrame.empty();
        if (!context) {
            inquiryAdvisoryFrame.toggleClass('ert-settings-hidden', true);
            inquiryAdvisoryFrame.toggleClass('ert-settings-visible', false);
            return;
        }

        inquiryAdvisoryFrame.toggleClass('ert-settings-hidden', false);
        inquiryAdvisoryFrame.toggleClass('ert-settings-visible', true);
        const presentation = presentInquiryAdvisory(context);

        const header = inquiryAdvisoryFrame.createDiv({ cls: 'ert-ai-inquiry-advisory-header' });
        header.createEl('h4', {
            cls: 'ert-ai-inquiry-advisory-title',
            text: 'Inquiry Advisor'
        });
        const dismissButton = header.createEl('button', {
            cls: 'ert-ai-inquiry-advisory-dismiss',
            text: 'Dismiss',
            attr: { type: 'button', 'aria-label': 'Dismiss Inquiry advisory context' }
        });
        dismissButton.addEventListener('click', () => {
            plugin.clearInquiryAdvisoryHandoffContext();
            renderInquiryAdvisoryBanner(null);
        });

        const body = inquiryAdvisoryFrame.createDiv({ cls: 'ert-ai-inquiry-advisory-body' });
        body.createDiv({ cls: 'ert-ai-inquiry-advisory-reason', text: presentation.reasonLine });
        const example = body.createDiv({ cls: 'ert-ai-inquiry-advisory-example' });
        presentation.exampleLines.forEach(line => {
            example.createDiv({ cls: 'ert-ai-inquiry-advisory-example-line', text: line });
        });
        body.createDiv({ cls: 'ert-ai-inquiry-advisory-suggestion', text: presentation.suggestedEngineLine });
    };

    renderInquiryAdvisoryBanner(plugin.consumeInquiryAdvisoryHandoffContext());

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
    const resolvedPreviewComparator = resolvedPreviewFrame.createDiv({
        cls: 'ert-ai-resolved-preview-comparator ert-settings-hidden'
    });
    const resolvedPreviewComparatorLabel = resolvedPreviewComparator.createDiv({
        cls: 'ert-ai-resolved-preview-comparator-label'
    });
    const resolvedPreviewComparatorValue = resolvedPreviewComparator.createDiv({
        cls: 'ert-ai-resolved-preview-comparator-value'
    });
    const resolvedPreviewPills = resolvedPreviewFrame.createDiv({ cls: 'ert-ai-resolved-preview-pills' });
    params.addAiRelatedElement(resolvedPreviewFrame);

    // Forward-declared; populated after credential helpers are defined.
    let localQuickConfigSection: HTMLElement | null = null;

    applyStrategyRowCopyLayout(providerSetting, 'Select the AI service that powers structural analysis and editorial insight.');
    applyStrategyRowCopyLayout(modelOverrideSetting, 'Use Auto for deterministic latest-stable selection, or pin a specific model.');
    applyStrategyRowCopyLayout(accessTierSetting, ACCESS_TIER_COPY);

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
        provider: AIProviderId;
        modelLabel: string;
        modelAlias: string;
        maxInputTokens: number | null;
        maxOutputTokens: number | null;
    }

    const createResolvedPreviewPill = (container: HTMLElement, text: string): void => {
        container.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM} ert-ai-resolved-preview-pill`,
            text
        });
    };

    const renderResolvedPreviewPills = (pillTexts: string[]): void => {
        resolvedPreviewPills.empty();
        if (!pillTexts.length) return;

        const firstRowEl = resolvedPreviewPills.createDiv({ cls: 'ert-ai-resolved-preview-pill-row' });
        pillTexts.forEach(text => createResolvedPreviewPill(firstRowEl, text));
    };

    const resolveReasoningDepthComparator = (state: ResolvedPreviewRenderState): { label: string; value: string } | null => {
        if (state.provider !== 'openai') return null;
        const hasStandard = BUILTIN_MODELS.some(model => model.provider === 'openai' && model.alias === 'gpt-5.4');
        const hasPro = BUILTIN_MODELS.some(model => model.provider === 'openai' && model.alias === 'gpt-5.4-pro');
        if (!hasStandard || !hasPro) return null;

        const inPair = state.modelAlias === 'gpt-5.4'
            || state.modelAlias === 'gpt-5.4-pro'
            || state.modelAlias === 'gpt-5.4-2026-03-05'
            || state.modelAlias === 'gpt-5.4-pro-2026-03-05';
        if (!inPair) return null;

        return {
            label: 'Reasoning depth',
            value: 'GPT-5.4 < GPT-5.4 Pro'
        };
    };

    const renderResolvedPreview = (state: ResolvedPreviewRenderState): void => {
        resolvedPreviewKicker.setText('PREVIEW (ACTIVE MODEL)');
        resolvedPreviewModel.setText(state.modelLabel);
        const providerDetail = `${providerLabel[state.provider]} · ${state.modelLabel}`;
        resolvedPreviewProvider.setText(providerDetail);

        const comparator = resolveReasoningDepthComparator(state);
        if (comparator) {
            resolvedPreviewComparatorLabel.setText(comparator.label);
            resolvedPreviewComparatorValue.setText(comparator.value);
            resolvedPreviewComparator.toggleClass('ert-settings-hidden', false);
        } else {
            resolvedPreviewComparatorLabel.setText('');
            resolvedPreviewComparatorValue.setText('');
            resolvedPreviewComparator.toggleClass('ert-settings-hidden', true);
        }

        const previewPills = resolvePreviewSignals({
            provider: state.provider,
            maxInputTokens: state.maxInputTokens,
            maxOutputTokens: state.maxOutputTokens
        });

        renderResolvedPreviewPills(previewPills);

    };

    type FeatureForecast = {
        label: string;
        estimatedInputTokens: number;
    };

    const computeVaultForecasts = async (engine?: {
        provider: AIProviderId;
        modelId: string;
    }): Promise<{ inquiry: FeatureForecast; gossamer: FeatureForecast }> => {
        // Prefer the shared estimate snapshot if InquiryView has been opened.
        const snapshot = plugin.getInquiryEstimateService().getSnapshot();
        let inquiryLabel: string;
        let inquiryInputTokens: number;
        if (snapshot) {
            const scopeLabel = snapshot.scope === 'saga' ? 'Saga' : 'Book';
            const countLabel = `${snapshot.corpus.sceneCount} scenes`;
            inquiryLabel = `${scopeLabel} · ${countLabel}`;
            inquiryInputTokens = snapshot.estimate.estimatedInputTokens;
        } else {
            // Cold-start fallback — InquiryView never opened.
            const inquiryEstimate = await estimateInquiryTokens({
                plugin,
                provider: engine?.provider,
                modelId: engine?.modelId,
                questionText: 'Analyze corpus-level flow and depth quality.',
                vault: app.vault,
                metadataCache: app.metadataCache,
                inquirySources: plugin.settings.inquirySources,
                frontmatterMappings: plugin.settings.frontmatterMappings,
                scopeContext: { scope: 'book' }
            });
            inquiryLabel = `${inquiryEstimate.selectionLabel} (${inquiryEstimate.evidenceLabel}) — approximate`;
            inquiryInputTokens = inquiryEstimate.estimatedInputTokens;
        }

        const gossamerPreference = getGossamerEvidencePreference();
        const gossamerEvidenceMode = gossamerPreference === 'summaries' ? 'summaries' : 'bodies';
        const gossamerEstimate = await estimateGossamerTokens({
            plugin,
            vault: app.vault,
            metadataCache: app.metadataCache,
            evidenceMode: gossamerEvidenceMode,
            frontmatterMappings: plugin.settings.frontmatterMappings
        });

        return {
            inquiry: {
                label: inquiryLabel,
                estimatedInputTokens: inquiryInputTokens,
            },
            gossamer: {
                label: gossamerPreference === 'auto'
                    ? `Full manuscript (${gossamerEstimate.evidenceLabel} first, auto summary fallback)`
                    : `Full manuscript (${gossamerEstimate.evidenceLabel})`,
                estimatedInputTokens: gossamerEstimate.estimatedInputTokens,
            },
        };
    };

    const refreshRoutingUi = async (): Promise<void> => {
        const aiSettings = ensureCanonicalAiSettings();
        const provider = aiSettings.provider === 'none' ? 'openai' : aiSettings.provider;
        const providerAllowedAliases = getProviderAllowedAliases(provider);
        const providerPickerAliases = getProviderPickerAliases(provider);

        if (aiSettings.modelPolicy.type === 'pinned') {
            const allowed = new Set(providerAllowedAliases);
            if (!aiSettings.modelPolicy.pinnedAlias || !allowed.has(aiSettings.modelPolicy.pinnedAlias)) {
                aiSettings.modelPolicy.pinnedAlias = getProviderDefaultAlias(provider);
            }
        }

        const policy = aiSettings.modelPolicy;

        const isLocal = provider === 'ollama';

        isSyncingRoutingUi = true;
        try {
            setDropdownValueSafe(providerDropdown, provider, 'openai');

            if (modelOverrideDropdown) {
                modelOverrideDropdown.selectEl.empty();
                if (isLocal) {
                    modelOverrideDropdown.addOption('—', '—');
                    modelOverrideDropdown.setValue('—');
                    modelOverrideDropdown.selectEl.disabled = true;
                } else {
                    modelOverrideDropdown.selectEl.disabled = false;
                    modelOverrideDropdown.addOption('auto', 'Auto');
                    providerPickerAliases.forEach(alias => {
                        const model = BUILTIN_MODELS.find(entry => entry.alias === alias);
                        const label = model?.label || alias;
                        modelOverrideDropdown?.addOption(alias, label);
                    });
                    if (provider === 'openai'
                        && policy.type === 'pinned'
                        && policy.pinnedAlias
                        && isOpenAiInternalAlias(policy.pinnedAlias)
                        && !providerPickerAliases.includes(policy.pinnedAlias)) {
                        modelOverrideDropdown.addOption(
                            policy.pinnedAlias,
                            formatOpenAiInternalPinnedLabel(policy.pinnedAlias)
                        );
                    }
                    const overrideValue = policy.type === 'pinned'
                        ? policy.pinnedAlias || 'auto'
                        : 'auto';
                    setDropdownValueSafe(modelOverrideDropdown, overrideValue, 'auto');
                }
            }

            if (accessTierDropdown) {
                if (isLocal) {
                    accessTierDropdown.selectEl.empty();
                    accessTierDropdown.addOption('—', '—');
                    accessTierDropdown.setValue('—');
                    accessTierDropdown.selectEl.disabled = true;
                } else {
                    accessTierDropdown.selectEl.disabled = false;
                    // Restore tier options if they were replaced by "—"
                    if (!Array.from(accessTierDropdown.selectEl.options).some(o => o.value === '1')) {
                        accessTierDropdown.selectEl.empty();
                        accessTierDropdown.addOption('1', 'Tier 1');
                        accessTierDropdown.addOption('2', 'Tier 2');
                        accessTierDropdown.addOption('3', 'Tier 3');
                        accessTierDropdown.addOption('4', 'Tier 4');
                    }
                }
            }

            setDropdownValueSafe(executionPreferenceDropdown, aiSettings.analysisPackaging, 'automatic');
            setDropdownValueSafe(
                gossamerEvidenceDropdown,
                getGossamerEvidencePreference(),
                'auto'
            );
        } finally {
            isSyncingRoutingUi = false;
        }
        updateExecutionPreferenceNote();
        updateAiModelUpdatesDescription();

        [providerSetting, gossamerEvidenceSetting].forEach(setting => {
            setting.settingEl.toggleClass('ert-settings-hidden', false);
            setting.settingEl.toggleClass('ert-settings-visible', true);
        });
        // Model and Access Tier stay visible but show "—" when local
        modelOverrideSetting.settingEl.toggleClass('ert-settings-hidden', false);
        modelOverrideSetting.settingEl.toggleClass('ert-settings-visible', true);
        accessTierSetting.settingEl.toggleClass('ert-settings-hidden', false);
        accessTierSetting.settingEl.toggleClass('ert-settings-visible', true);

        if (!isLocal) {
            const supportsAccessTier = provider === 'anthropic' || provider === 'openai' || provider === 'google';
            if (supportsAccessTier) {
                accessTierDropdown?.setValue(String(getAccessTier(provider)));
            } else {
                accessTierDropdown?.setValue('1');
            }
        }

        // Toggle local quick-config section visibility
        if (localQuickConfigSection) {
            localQuickConfigSection.toggleClass('ert-settings-hidden', !isLocal);
            localQuickConfigSection.toggleClass('ert-settings-visible', isLocal);
        }

        capacitySafeInput.valueEl.setText('Calculating...');
        capacityOutput.valueEl.setText('Calculating...');
        capacityInquiryToken.setText('Calculating...');
        capacityInquiryScope.setText('Scanning vault…');
        capacityInquiryExpected.setText('Calculating...');
        capacityGossamerToken.setText('Calculating...');
        capacityGossamerScope.setText('Scanning vault…');
        capacityGossamerExpected.setText('Calculating...');

        // Reset status grid chips
        singlePassRow.chipEl.setText('Calculating...');
        multiPassRow.chipEl.setText('Calculating...');
        segmentedRow.chipEl.setText('Calculating...');
        nearLimitEl.toggleClass('ert-settings-hidden', true);

        try {
            const prepared = await getAIClient(plugin).prepareRunEstimate({
                feature: 'InquiryMode',
                task: 'SettingsCapacityPreview',
                requiredCapabilities: capabilityFloor,
                featureModeInstructions: 'Estimate Inquiry capacity for current settings.',
                userInput: 'Capacity preview request.',
                promptText: 'Capacity preview request.',
                returnType: 'json',
                responseSchema: { type: 'object' },
                providerOverride: provider,
                policyOverride: policy,
                overrides: aiSettings.overrides
            });
            if (!prepared.ok) {
                throw new Error(prepared.result.error || prepared.result.reason || 'Unable to resolve AI capacity.');
            }
            const estimate = prepared.estimate;
            const safeBudgetTokens = Math.max(0, Math.floor(estimate.effectiveInputCeiling));
            const formatForecastPasses = (estimatedTokens: number, singlePassOnly: boolean): string => {
                if (estimatedTokens <= 0) return 'No content detected';
                if (estimatedTokens <= safeBudgetTokens) return 'Single pass expected';
                if (singlePassOnly) return 'Exceeds single-pass limit';
                if (safeBudgetTokens <= 0) return 'Forecast unavailable';
                const passes = Math.ceil(estimatedTokens / safeBudgetTokens);
                return `${passes} passes expected`;
            };
            const previewState: ResolvedPreviewRenderState = {
                provider,
                modelLabel: estimate.model.label,
                modelAlias: estimate.model.alias,
                maxInputTokens: estimate.maxInputTokens,
                maxOutputTokens: estimate.maxOutputTokens,
            };
            renderResolvedPreview(previewState);
            setTokenDisplay(capacitySafeInput.valueEl, `~${safeBudgetTokens.toLocaleString()}`, 'tokens (safe window)');
            setTokenDisplay(capacityOutput.valueEl, `~${estimate.maxOutputTokens.toLocaleString()}`, 'tokens');

            const singlePassOnly = aiSettings.analysisPackaging === 'singlePassOnly';
            void computeVaultForecasts({
                provider,
                modelId: estimate.model.id
            }).then(forecasts => {
                capacityInquiryScope.setText(forecasts.inquiry.label);
                setTokenDisplay(capacityInquiryToken, forecasts.inquiry.estimatedInputTokens.toLocaleString(), 'tokens');
                capacityInquiryExpected.setText(formatForecastPasses(forecasts.inquiry.estimatedInputTokens, singlePassOnly));

                capacityGossamerScope.setText(forecasts.gossamer.label);
                setTokenDisplay(capacityGossamerToken, forecasts.gossamer.estimatedInputTokens.toLocaleString(), 'tokens');
                capacityGossamerExpected.setText(formatForecastPasses(forecasts.gossamer.estimatedInputTokens, singlePassOnly));

                // ── Mode-aware status grid chips ──
                const maxEstimate = Math.max(
                    forecasts.inquiry.estimatedInputTokens,
                    forecasts.gossamer.estimatedInputTokens
                );
                const fits = maxEstimate <= safeBudgetTokens;
                const nearLimit = safeBudgetTokens > 0 && maxEstimate > safeBudgetTokens * 0.7;
                const mode = aiSettings.analysisPackaging;

                const clearChip = (el: HTMLElement): void => {
                    el.removeClass('ert-ai-chip--success', 'ert-ai-chip--warning', 'ert-ai-chip--muted');
                };

                // Single-Pass chip
                clearChip(singlePassRow.chipEl);
                if (mode === 'segmented') {
                    singlePassRow.chipEl.setText('Bypassed');
                    singlePassRow.chipEl.addClass('ert-ai-chip--muted');
                } else if (fits) {
                    singlePassRow.chipEl.setText('Fits safely');
                    singlePassRow.chipEl.addClass('ert-ai-chip--success');
                } else {
                    singlePassRow.chipEl.setText('Exceeds safe limit');
                    singlePassRow.chipEl.addClass('ert-ai-chip--warning');
                }

                // Multi-Pass chip
                clearChip(multiPassRow.chipEl);
                if (mode === 'singlePassOnly') {
                    multiPassRow.chipEl.setText('Disabled');
                    multiPassRow.chipEl.addClass('ert-ai-chip--muted');
                } else if (!fits || mode === 'segmented') {
                    const passes = safeBudgetTokens > 0
                        ? Math.ceil(maxEstimate / safeBudgetTokens)
                        : 0;
                    multiPassRow.chipEl.setText(passes > 0 ? `${passes} passes` : 'Unavailable');
                    multiPassRow.chipEl.addClass(passes > 0 ? 'ert-ai-chip--success' : 'ert-ai-chip--warning');
                } else {
                    multiPassRow.chipEl.setText('Not needed');
                    multiPassRow.chipEl.addClass('ert-ai-chip--muted');
                }

                // Segmented chip
                clearChip(segmentedRow.chipEl);
                if (mode === 'segmented') {
                    segmentedRow.chipEl.setText('Forcing split');
                    segmentedRow.chipEl.addClass('ert-ai-chip--success');
                } else {
                    segmentedRow.chipEl.setText('Available');
                    segmentedRow.chipEl.addClass('ert-ai-chip--muted');
                }

                // Near-limit indicator (show whenever >70%, regardless of fit)
                nearLimitEl.toggleClass('ert-settings-hidden', !nearLimit);
            });
        } catch {
            renderResolvedPreview({
                provider,
                modelLabel: 'No eligible model',
                modelAlias: providerLabel[provider],
                maxInputTokens: null,
                maxOutputTokens: null
            });
            capacitySafeInput.valueEl.setText('Unavailable');
            capacityOutput.valueEl.setText('Unavailable');
            capacityInquiryToken.setText('Unavailable');
            capacityInquiryScope.setText('Unavailable');
            capacityInquiryExpected.setText('Unavailable');
            capacityGossamerToken.setText('Unavailable');
            capacityGossamerScope.setText('Unavailable');
            capacityGossamerExpected.setText('Unavailable');
        }

    };

    void refreshRoutingUi();

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

    type LocalKeyStatus = 'saved' | 'not_saved';
    type ProviderKeyUiState = 'ready' | 'not_configured' | 'rejected' | 'network_blocked' | 'checking';
    const configureSensitiveInput = (inputEl: HTMLInputElement): void => {
        inputEl.type = 'password';
        inputEl.autocomplete = 'new-password';
        inputEl.spellcheck = false;
    };
    const buildLocalKeyStatusDesc = (status: LocalKeyStatus): DocumentFragment => {
        const desc = document.createDocumentFragment();
        const row = document.createElement('span');
        row.className = `ert-ai-key-status is-${status}`;
        const icon = row.createSpan({ cls: 'ert-ai-key-status__icon' });
        const text = row.createSpan({ cls: 'ert-ai-key-status__text' });
        if (status === 'saved') {
            setIcon(icon, 'check-circle-2');
            text.setText('Saved');
        } else {
            setIcon(icon, 'alert-triangle');
            text.setText('Not saved');
        }
        desc.appendChild(row);
        return desc;
    };
    const extractStatusCodeFromError = (message: string): number | null => {
        const wrapped = message.match(/\((\d{1,3})\)/);
        if (wrapped) return Number(wrapped[1]);
        const direct = message.match(/\b(?:status|http)\s*(\d{1,3})\b/i);
        if (direct) return Number(direct[1]);
        return null;
    };
    const isAuthError = (message: string, statusCode: number | null): boolean => {
        if (statusCode === 400 || statusCode === 401 || statusCode === 403) return true;
        return /unauthorized|forbidden|invalid (?:api )?key|invalid auth|authentication/i.test(message);
    };
    const buildProviderValidationDetail = (message: string, statusCode: number | null): string => {
        if (statusCode === 429) return 'Provider rate limit reached (HTTP 429). Wait briefly and retry.';
        if (statusCode !== null && statusCode >= 500) return `Provider service error (HTTP ${statusCode}). Try again shortly.`;
        if (statusCode !== null) return `Provider returned HTTP ${statusCode} while validating the key.`;
        return `No HTTP status returned during validation (${message}).`;
    };
    interface ProviderKeyValidationResult {
        state: 'ready' | 'rejected' | 'network_blocked';
        detail: string;
    }
    const SAVED_KEY_ENTRY_COPY = 'Saved privately on this device. Paste a key, then click outside this field or press Enter/Return to save or replace it. Keys are never written to your settings file.';

    const validateProviderKeyQuick = async (
        provider: 'openai' | 'anthropic' | 'google',
        key: string
    ): Promise<ProviderKeyValidationResult> => {
        try {
            if (provider === 'anthropic') await fetchAnthropicModels(key);
            else if (provider === 'google') await fetchGeminiModels(key);
            else await fetchOpenAiModels(key);
            return {
                state: 'ready',
                detail: ''
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const statusCode = extractStatusCodeFromError(message);
            if (isAuthError(message, statusCode)) {
                return {
                    state: 'rejected',
                    detail: ''
                };
            }
            return {
                state: 'network_blocked',
                detail: buildProviderValidationDetail(message, statusCode)
            };
        }
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
            .setDesc('');
        keyStatusSetting.settingEl.addClass('ert-ai-provider-key-status-row');

        let providerState: ProviderKeyUiState = 'not_configured';
        let providerStateDetail = '';
        let replaceRequested = false;
        let revealSecretName = false;
        let secureKeySetting: Settings | null = null;
        let secureKeyInput: HTMLInputElement | null = null;
        const setSettingRowVisible = (setting: Settings, visible: boolean): void => {
            if (visible) {
                setting.settingEl.style.removeProperty('display');
                setting.settingEl.removeAttribute('hidden');
            } else {
                setting.settingEl.style.setProperty('display', 'none', 'important');
                setting.settingEl.setAttribute('hidden', '');
            }
            setting.settingEl.toggleClass('ert-settings-hidden', !visible);
            setting.settingEl.toggleClass('ert-settings-visible', visible);
        };

        const setProviderState = (next: ProviderKeyUiState): void => {
            providerState = next;
            const ai = ensureCanonicalAiSettings();
            const secretId = getCredentialSecretId(ai, options.provider).trim();
            const desc = document.createDocumentFragment();

            const stateBlock = document.createElement('div');
            stateBlock.className = `ert-ai-provider-key-state is-${next}`;
            const icon = stateBlock.createSpan({ cls: 'ert-ai-provider-key-state__icon' });
            setIcon(icon, next === 'ready' ? 'shield-check' : 'shield-alert');
            const body = stateBlock.createSpan({ cls: 'ert-ai-provider-key-state__body' });
            const text = body.createSpan({ cls: 'ert-ai-provider-key-state__text' });
            if (next === 'ready') {
                providerStateDetail = '';
                text.setText('Status: Ready ✓');
            } else if (next === 'rejected') {
                providerStateDetail = '';
                text.setText('Status: Key rejected');
            } else if (next === 'network_blocked') {
                text.setText('Status: Provider validation failed');
            } else if (next === 'checking') {
                providerStateDetail = '';
                text.setText('Status: Checking key...');
            } else {
                providerStateDetail = '';
                text.setText('Status: Not configured');
            }
            desc.appendChild(stateBlock);

            const helper = body.createSpan({ cls: 'ert-ai-provider-key-state__helper' });
            if (next === 'not_configured') {
                helper.textContent = 'Paste a key to enable this provider.';
            } else if (next === 'rejected') {
                helper.textContent = 'Paste a new key to replace the saved one.';
            } else if (next === 'network_blocked') {
                helper.textContent = providerStateDetail || 'Provider could not be reached. You can still replace the key below.';
            } else if (next === 'checking') {
                helper.textContent = 'Validating saved key with the provider...';
            }
            if (!helper.textContent) helper.remove();

            if ((next === 'ready' || next === 'network_blocked') && secretStorageAvailable) {
                const actions = body.createSpan({ cls: 'ert-ai-provider-key-actions' });

                const replaceBtn = document.createElement('button');
                replaceBtn.className = 'ert-ai-provider-key-action';
                replaceBtn.type = 'button';
                replaceBtn.textContent = 'Replace key...';
                replaceBtn.addEventListener('click', () => {
                    replaceRequested = true;
                    setProviderState(providerState);
                    secureKeyInput?.focus();
                });
                actions.appendChild(replaceBtn);

                if (secretId) {
                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'ert-ai-provider-key-action';
                    copyBtn.type = 'button';
                    copyBtn.textContent = 'Copy key name';
                    copyBtn.addEventListener('click', () => {
                        revealSecretName = true;
                        setProviderState(providerState);
                        secretIdSetting.settingEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        void navigator.clipboard.writeText(secretId)
                            .then(() => new Notice('Saved key name copied.'))
                            .catch(() => new Notice('Unable to copy saved key name.'));
                    });
                    actions.appendChild(copyBtn);
                }
            }

            keyStatusSetting.setDesc(desc);

            const showSecretIdRow = !secretStorageAvailable
                || next !== 'ready'
                || revealSecretName;
            setSettingRowVisible(secretIdSetting, showSecretIdRow);

            if (secureKeySetting) {
                const shouldShowInput = replaceRequested || next === 'not_configured' || next === 'rejected';
                setSettingRowVisible(secureKeySetting, shouldShowInput);
                if (!shouldShowInput && secureKeyInput) secureKeyInput.value = '';
            }
            params.refreshProviderDimming();
        };

        const refreshProviderKeyState = async (): Promise<void> => {
            const ai = ensureCanonicalAiSettings();
            if (secretStorageAvailable) {
                const savedKeyName = getCredentialSecretId(ai, options.provider).trim();
                if (!savedKeyName || !(await hasSecret(app, savedKeyName))) {
                    replaceRequested = false;
                    revealSecretName = false;
                    setProviderState('not_configured');
                    return;
                }

                const key = await getCredential(plugin, options.provider);
                if (!key || key.length < 8) {
                    replaceRequested = false;
                    revealSecretName = false;
                    setProviderState('not_configured');
                    return;
                }

                setProviderState('checking');
                const validation = await validateProviderKeyQuick(options.provider, key);
                providerStateDetail = validation.detail;
                if (validation.state === 'ready') {
                    replaceRequested = false;
                    revealSecretName = false;
                }
                setProviderState(validation.state);
                return;
            }

            const legacyValue = options.legacyProvider === 'gemini'
                ? plugin.settings.geminiApiKey
                : options.legacyProvider === 'anthropic'
                ? plugin.settings.anthropicApiKey
                : plugin.settings.openaiApiKey;
            replaceRequested = false;
            revealSecretName = false;
            setProviderState((legacyValue || '').trim() ? 'ready' : 'not_configured');
        };
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
                    await refreshProviderKeyState();
                })();
            });
        });
        secretIdSetting.settingEl.addClass('ert-setting-full-width-input');
        if (secretStorageAvailable) {
            setSettingRowVisible(secretIdSetting, false);
        }

        if (secretStorageAvailable) {
            secureKeySetting = new Settings(options.section)
                .setName(`${options.providerName} API key`)
                .setDesc(SAVED_KEY_ENTRY_COPY);
            secureKeySetting.addText(text => {
                text.inputEl.addClass('ert-input--full');
                configureSensitiveInput(text.inputEl);
                text.setPlaceholder(options.keyPlaceholder);
                secureKeyInput = text.inputEl;
                params.setKeyInputRef(options.legacyProvider, text.inputEl);

                plugin.registerDomEvent(text.inputEl, 'keydown', (event: KeyboardEvent) => {
                    if (event.key === 'Enter') {
                        event.preventDefault();
                        text.inputEl.blur();
                    }
                });

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
                        text.setValue('');
                        setProviderState('checking');
                        const validation = await validateProviderKeyQuick(options.provider, value);
                        providerStateDetail = validation.detail;
                        if (validation.state === 'ready') {
                            replaceRequested = false;
                            revealSecretName = false;
                        }
                        setProviderState(validation.state);
                    })();
                });
            });
            secureKeySetting.settingEl.addClass('ert-setting-full-width-input');
            setSettingRowVisible(secureKeySetting, false);
            setProviderState(providerState);
        }

        void refreshProviderKeyState();

        if (!secretStorageAvailable) {
            const legacyDetails = options.section.createEl('details', {
                cls: 'ert-ai-fold ert-ai-legacy-credentials'
            }) as HTMLDetailsElement;
            legacyDetails.setAttr('open', '');
            const legacySummary = legacyDetails.createEl('summary', {
                text: 'Advanced: Older key fields (not recommended)'
            });
            attachAiCollapseButton(legacyDetails, legacySummary);
            const legacyHost = legacyDetails.createDiv({ cls: ERT_CLASSES.STACK });
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
                        await refreshProviderKeyState();
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

    const localApiDetails = localExtrasStack.createEl('details', { cls: 'ert-ai-fold ert-ai-legacy-credentials' }) as HTMLDetailsElement;
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
        .setDesc(buildLocalKeyStatusDesc('not_saved'));
    const applyLocalKeyStatus = (status: LocalKeyStatus) => {
        localKeyStatusSetting.setDesc(buildLocalKeyStatusDesc(status));
    };
    const refreshLocalKeyStatus = async (): Promise<void> => {
        const savedKeyName = getCredentialSecretId(ensureCanonicalAiSettings(), 'ollama');
        if (secretStorageAvailable) {
            if (!savedKeyName) {
                applyLocalKeyStatus('not_saved');
                return;
            }
            const exists = await hasSecret(app, savedKeyName);
            applyLocalKeyStatus(exists ? 'saved' : 'not_saved');
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
            .setDesc(SAVED_KEY_ENTRY_COPY);
        localSecretSetting.addText(text => {
            text.inputEl.addClass('ert-input--full');
            configureSensitiveInput(text.inputEl);
            text.setPlaceholder('Optional local API key');
            params.setKeyInputRef('local', text.inputEl);

            plugin.registerDomEvent(text.inputEl, 'keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    text.inputEl.blur();
                }
            });

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

    // ── Local quick-config section (appears below preview card when Local is selected) ──
    localQuickConfigSection = quickSetupPreviewSection.createDiv({
        cls: [`${ERT_CLASSES.CARD}`, `${ERT_CLASSES.PANEL}`, `${ERT_CLASSES.STACK}`, 'ert-ai-local-quick-config', 'ert-settings-hidden']
    });
    localQuickConfigSection.createDiv({ cls: 'ert-section-title', text: 'Local LLM Configuration' });
    localQuickConfigSection.createDiv({
        cls: 'ert-section-desc',
        text: 'Configure your local model server. The preview card above will update as you fill in these fields.'
    });
    params.addAiRelatedElement(localQuickConfigSection);

    const localQuickBaseUrlSetting = new Settings(localQuickConfigSection)
        .setName('Base URL')
        .setDesc('The API endpoint for your local server (e.g., Ollama, LM Studio).');
    localQuickBaseUrlSetting.addText(text => {
        text.inputEl.addClass('ert-input--full');
        text
            .setPlaceholder('http://localhost:11434/v1')
            .setValue(plugin.settings.localBaseUrl || 'http://localhost:11434/v1');
        text.onChange(() => {
            text.inputEl.removeClass('ert-setting-input-success', 'ert-setting-input-error');
        });
        plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter') { evt.preventDefault(); text.inputEl.blur(); }
        });
        plugin.registerDomEvent(text.inputEl, 'blur', () => {
            void (async () => {
                plugin.settings.localBaseUrl = text.getValue().trim();
                const aiSettings = ensureCanonicalAiSettings();
                aiSettings.connections = { ...(aiSettings.connections || {}), ollamaBaseUrl: plugin.settings.localBaseUrl };
                await persistCanonical();
                params.scheduleKeyValidation('local');
                void refreshRoutingUi();
            })();
        });
    });
    localQuickBaseUrlSetting.settingEl.addClass('ert-setting-full-width-input');

    let localQuickModelText: TextComponent | null = null;
    const localQuickModelSetting = new Settings(localQuickConfigSection)
        .setName('Model ID')
        .setDesc('The exact model name your server expects (e.g., "llama3", "mistral-7b").');
    localQuickModelSetting.addText(text => {
        text.inputEl.addClass('ert-input--lg');
        localQuickModelText = text;
        text
            .setPlaceholder('llama3')
            .setValue(plugin.settings.localModelId || 'llama3');
        text.onChange(() => {
            text.inputEl.removeClass('ert-setting-input-success', 'ert-setting-input-error');
        });
        plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter') { evt.preventDefault(); text.inputEl.blur(); }
        });
        plugin.registerDomEvent(text.inputEl, 'blur', () => {
            void (async () => {
                plugin.settings.localModelId = text.getValue().trim();
                await persistCanonical();
                params.scheduleKeyValidation('local');
                void refreshRoutingUi();
            })();
        });
    });
    localQuickModelSetting.settingEl.addClass(ERT_CLASSES.ROW);

    localQuickModelSetting.addExtraButton(button => {
        button
            .setIcon('refresh-ccw')
            .setTooltip('Detect installed models and auto-fill')
            .onClick(async () => {
                const baseUrl = plugin.settings.localBaseUrl?.trim();
                if (!baseUrl) {
                    new Notice('Set the Base URL first.');
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
                    const aiSettingsInner = ensureCanonicalAiSettings();
                    if (aiSettingsInner.modelPolicy.type === 'pinned' && aiSettingsInner.provider === 'ollama') {
                        const alias = BUILTIN_MODELS.find(m => m.provider === 'ollama' && m.id === chosen.id)?.alias;
                        if (alias) aiSettingsInner.modelPolicy.pinnedAlias = alias;
                    }
                    await persistCanonical();
                    if (localQuickModelText) localQuickModelText.setValue(chosen.id);
                    params.scheduleKeyValidation('local');
                    const otherModels = models.map(m => m.id).filter(id => id !== chosen.id);
                    const suffix = otherModels.length ? ` Also found: ${otherModels.join(', ')}.` : '';
                    new Notice(`Using detected model "${chosen.id}".${suffix}`);
                    void refreshRoutingUi();
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    new Notice(`Unable to detect local models: ${message}`);
                } finally {
                    button.setDisabled(false);
                    button.setIcon('refresh-ccw');
                }
            });
    });

    const localQuickInstructionsSetting = new Settings(localQuickConfigSection)
        .setName('Custom Instructions')
        .setDesc('Additional instructions prepended to the prompt for local model behavior tuning.');
    localQuickInstructionsSetting.addTextArea(text => {
        text
            .setPlaceholder('e.g. Maintain strict JSON formatting...')
            .setValue(plugin.settings.localLlmInstructions || '')
            .onChange(async (value) => {
                plugin.settings.localLlmInstructions = value;
                await plugin.saveSettings();
            });
        text.inputEl.rows = 4;
        text.inputEl.addClass('ert-textarea');
    });
    localQuickInstructionsSetting.settingEl.addClass('ert-setting-full-width-input');

    const localQuickApiKeyDetails = localQuickConfigSection.createEl('details', {
        cls: 'ert-ai-fold ert-ai-local-quick-key'
    }) as HTMLDetailsElement;
    const localQuickApiKeySummary = localQuickApiKeyDetails.createEl('summary', { text: 'API Key (usually not needed)' });
    attachAiCollapseButton(localQuickApiKeyDetails, localQuickApiKeySummary);
    const localQuickApiKeyBody = localQuickApiKeyDetails.createDiv({ cls: ERT_CLASSES.STACK });

    const localQuickSecretIdSetting = new Settings(localQuickApiKeyBody)
        .setName('Local saved key name')
        .setDesc('Optional saved key name if your local gateway requires a key.');
    localQuickSecretIdSetting.addText(text => {
        text.inputEl.addClass('ert-input--full');
        text.setPlaceholder('ollama-main').setValue(getCredentialSecretId(ensureCanonicalAiSettings(), 'ollama'));
        plugin.registerDomEvent(text.inputEl, 'blur', () => {
            void (async () => {
                const ai = ensureCanonicalAiSettings();
                setCredentialSecretId(ai, 'ollama', text.getValue().trim());
                await persistCanonical();
            })();
        });
    });
    localQuickSecretIdSetting.settingEl.addClass('ert-setting-full-width-input');

    if (secretStorageAvailable) {
        const localQuickSecretSetting = new Settings(localQuickApiKeyBody)
            .setName('Local API key')
            .setDesc(SAVED_KEY_ENTRY_COPY);
        localQuickSecretSetting.addText(text => {
            text.inputEl.addClass('ert-input--full');
            configureSensitiveInput(text.inputEl);
            text.setPlaceholder('Optional local API key');
            plugin.registerDomEvent(text.inputEl, 'keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter') { event.preventDefault(); text.inputEl.blur(); }
            });
            plugin.registerDomEvent(text.inputEl, 'blur', () => {
                void (async () => {
                    const key = text.getValue().trim();
                    if (!key) return;
                    const ai = ensureCanonicalAiSettings();
                    const secretId = getCredentialSecretId(ai, 'ollama');
                    if (!secretId) { new Notice('Set a local saved key name first.'); return; }
                    const stored = await setSecret(app, secretId, key);
                    if (!stored) { new Notice('Unable to save local API key privately.'); return; }
                    plugin.settings.localApiKey = '';
                    await plugin.saveSettings();
                    void params.scheduleKeyValidation('local');
                })();
            });
        });
        localQuickSecretSetting.settingEl.addClass('ert-setting-full-width-input');
    }

    // Final section order in AI tab:
    // 1) AI Strategy
    // 2) Preview (Active Model) + Local Quick Config (when local selected)
    // 3) Role context
    // 4) Gossamer material
    // 5) Large Manuscript Handling
    // 6) Configuration
    // 7) Advanced & Diagnostics
    [
        quickSetupSection,
        quickSetupPreviewSection,
        roleContextSection,
        gossamerEvidenceSetting.settingEl,
        largeHandlingFold,
        configurationFold,
        advancedFold
    ].forEach(section => aiSettingsGroup.appendChild(section));

    // Apply provider dimming on first render
    params.refreshProviderDimming();

    // Set initial visibility state
    params.toggleAiSettingsVisibility(plugin.settings.enableAiSceneAnalysis ?? true);
}
