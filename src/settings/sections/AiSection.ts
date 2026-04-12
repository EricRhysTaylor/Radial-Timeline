import { Setting as Settings, Notice, DropdownComponent, TFile, setIcon, setTooltip } from 'obsidian';
import type { App, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { fetchAnthropicModels } from '../../api/anthropicApi';
import { fetchOpenAiModels } from '../../api/openaiApi';
import { fetchGeminiModels as fetchGoogleModels } from '../../api/geminiApi';
import { AiContextModal } from '../AiContextModal';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { ERT_CLASSES } from '../../ui/classes';
import { IMPACT_FULL } from '../SettingImpact';
import { buildDefaultAiSettings } from '../../ai/settings/aiSettings';
import { validateAiSettings } from '../../ai/settings/validateAiSettings';
import { BUILTIN_MODELS } from '../../ai/registry/builtinModels';
import { getPickerModelsForProvider, PROVIDER_DISPLAY_LABELS, selectLatestModelByReleaseChannel } from '../../ai/registry/releaseChannels';
import { selectModel } from '../../ai/router/selectModel';
import { computeCaps } from '../../ai/caps/computeCaps';
import { getModelUiSignals } from '../../ai/caps/engineCapabilities';
import { getAIClient } from '../../ai/runtime/aiClient';
import { getLocalLlmClient } from '../../ai/localLlm/client';
import {
    getCredential,
    getCredentialSecretId,
    migrateLegacyKeysToSecretStorage,
    needsLegacyKeyMigration,
    setCredentialSecretId
} from '../../ai/credentials/credentials';
import { hasSecret, isSecretStorageAvailable, setSecret } from '../../ai/credentials/secretStorage';
import type { AccessTier, AIProviderId, Capability, LocalLlmConfigurationMode, LocalLlmSettings, ModelInfo, RTCorpusTokenBreakdown } from '../../ai/types';
import type { LocalLlmDiagnosticsReport } from '../../ai/localLlm/diagnostics';
import { buildCanonicalExecutionEstimate, estimateGossamerTokens } from '../../ai/forecast/estimateTokensFromVault';
import {
    estimateCorpusCost,
    formatUsdCost
} from '../../ai/cost/estimateCorpusCost';
import { getProviderPricing, getActivePricingMeta, getActivePromos, getPricingFreshnessLabel } from '../../ai/cost/providerPricing';
import { buildOutputRulesText } from '../../ai/prompts/outputRules';
import { buildUnifiedBeatAnalysisPromptParts, getUnifiedBeatAnalysisJsonSchema } from '../../ai/prompts/unifiedBeatAnalysis';
import { resolveActiveRoleTemplate } from '../../ai/roleTemplate';
import { INQUIRY_CANONICAL_ESTIMATE_QUESTION } from '../../inquiry/constants';
import { buildInquiryJsonSchema } from '../../inquiry/jsonSchema';
import type { CorpusManifestEntry } from '../../inquiry/runner/types';
import { buildInquiryPromptParts, INQUIRY_ROLE_TEMPLATE_GUARDRAIL } from '../../inquiry/promptScaffold';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { cleanEvidenceBody } from '../../inquiry/utils/evidenceCleaning';
import { getSortedSceneFiles } from '../../utils/manuscript';
import { t } from '../../i18n';
import { extractBeatOrder } from '../../utils/gossamer';
import { resolveSelectedBeatModelFromSettings } from '../../utils/beatSystemState';
import { getSynopsisGenerationWordLimit, getSynopsisHoverLineLimit } from '../../utils/synopsisLimits';
import { getResolvedModelId } from '../../utils/modelResolver';
import {
    buildLocalLlmModelIdentity,
    buildLocalLlmServerKey,
    getLocalLlmSettings,
    LOCAL_LLM_BACKEND_LABELS,
    normalizeLocalLlmServerBaseUrl,
    resolveLocalLlmModelInfo
} from '../../ai/localLlm/settings';
import { inferLocalLlmCapability } from '../../ai/localLlm/capabilityInference';
import type { LocalLlmCapabilityAssessment, LocalLlmFeatureSupport } from '../../ai/localLlm/capabilityInference';
import type { LocalLlmModelEntry } from '../../ai/localLlm/transport';
import type { LocalLlmBackendId } from '../../ai/types';

type Provider = 'anthropic' | 'google' | 'openai' | 'ollama';
type CapacityItem = string | { text: string; dividerBefore?: boolean };
type PromptRequestBreakdown = {
    roleTemplateTokens: number | null;
    instructionTokens: number | null;
    outputContractTokens: number | null;
    transformTokens: number | null;
};
type DetectedLocalServer = {
    serverKey: string;
    label: string;
    backend: LocalLlmBackendId;
    baseUrl: string;
    models: LocalLlmModelEntry[];
    detectedAt: string;
};

export function renderAiSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    addAiRelatedElement: (el: HTMLElement) => void;
    toggleAiSettingsVisibility: (show: boolean) => void;
    refreshProviderDimming: () => void;
    scheduleKeyValidation: (provider: Provider) => void;
    setProviderSections: (sections: { anthropic?: HTMLElement; google?: HTMLElement; openai?: HTMLElement; ollama?: HTMLElement }) => void;
    setKeyInputRef: (provider: Provider, input: HTMLInputElement | undefined) => void;
    setOllamaConnectionInputs: (refs: { baseInput?: HTMLInputElement; modelInput?: HTMLInputElement }) => void;
}): void {
    const { app, plugin, containerEl } = params;
    containerEl.classList.add(ERT_CLASSES.STACK);

    const getResolvedRoleTemplate = () => resolveActiveRoleTemplate(
        plugin,
        validateAiSettings(plugin.settings.aiSettings ?? buildDefaultAiSettings()).value
    );
    const getActiveTemplateName = (): string => getResolvedRoleTemplate().name;
    const getActiveTemplatePrompt = (): string => getResolvedRoleTemplate().prompt.trim();
    const sumTokenParts = (...parts: Array<number | null | undefined>): number | null => {
        if (parts.some(part => part === null || part === undefined || !Number.isFinite(part))) return null;
        return parts.reduce<number>((sum, part) => sum + (part ?? 0), 0);
    };

    const aiHero = containerEl.createDiv({
        cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.CARD_HERO} ${ERT_CLASSES.STACK} ert-ai-hero-card`
    });
    const heroBadgeRow = aiHero.createDiv({ cls: 'ert-ai-hero-badge-row' });
    const badge = heroBadgeRow.createSpan({ cls: ERT_CLASSES.BADGE_PILL });
    const badgeIcon = badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
    setIcon(badgeIcon, 'cpu');
    badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: t('settings.ai.hero.badgeText') });
    const badgeWikiLink = badge.createEl('a', {
        href: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#ai',
        cls: 'ert-badgePill__inlineLink',
        attr: {
            'aria-label': t('settings.ai.hero.wikiAriaLabel'),
            'target': '_blank',
            'rel': 'noopener'
        }
    });
    setIcon(badgeWikiLink, 'external-link');

    const heroToggleWrap = heroBadgeRow.createDiv({ cls: 'ert-toggle-item ert-ai-hero-toggle' });
    const heroToggleLabel = heroToggleWrap.createSpan({ cls: 'ert-toggle-label', text: t('settings.ai.hero.toggleInactive') });
    const heroToggleInput = heroToggleWrap.createEl('input', {
        cls: 'ert-toggle-input',
        attr: { type: 'checkbox', 'aria-label': t('settings.ai.hero.toggleAriaLabel') }
    }) as HTMLInputElement;

    const heroTitle = aiHero.createEl('h3', {
        cls: `${ERT_CLASSES.SECTION_TITLE} ert-hero-title`,
        text: t('settings.ai.hero.titleActive')
    });
    const heroOnState = aiHero.createDiv({ cls: `${ERT_CLASSES.STACK} ert-ai-hero-state-on` });
    heroOnState.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle`,
        text: t('settings.ai.hero.descriptionActive')
    });
    const heroOnFeatures = heroOnState.createDiv({
        cls: `${ERT_CLASSES.HERO_FEATURES} ${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}`
    });
    heroOnFeatures.createEl('h5', { text: t('settings.ai.hero.highlightsKicker'), cls: 'ert-kicker' });
    const heroOnList = heroOnFeatures.createEl('ul', { cls: ERT_CLASSES.STACK });
    [
        { icon: 'waves', text: t('settings.ai.hero.featureInquiry') },
        { icon: 'activity', text: t('settings.ai.hero.featurePulse') },
        { icon: 'waypoints', text: t('settings.ai.hero.featureGossamer') },
        { icon: 'sparkles', text: t('settings.ai.hero.featureForceMultiplier') }
    ].forEach(item => {
        const li = heroOnList.createEl('li', { cls: `${ERT_CLASSES.INLINE} ert-feature-item` });
        const icon = li.createSpan({ cls: 'ert-feature-icon' });
        setIcon(icon, item.icon);
        li.createSpan({ text: item.text });
    });

    const heroOffState = aiHero.createDiv({ cls: `${ERT_CLASSES.STACK} ert-ai-hero-state-off` });
    heroOffState.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle`,
        text: t('settings.ai.heroOff.descriptionPrimary')
    });
    heroOffState.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle`,
        text: t('settings.ai.heroOff.descriptionSecondary')
    });
    const heroOffFeatures = heroOffState.createDiv({
        cls: `${ERT_CLASSES.HERO_FEATURES} ${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}`
    });
    heroOffFeatures.createEl('h5', { text: t('settings.ai.heroOff.toolsKicker'), cls: 'ert-kicker' });
    const heroOffList = heroOffFeatures.createEl('ul', { cls: ERT_CLASSES.STACK });
    [
        t('settings.ai.heroOff.featureInquiry'),
        t('settings.ai.heroOff.featurePulse'),
        t('settings.ai.heroOff.featureGossamer'),
        t('settings.ai.heroOff.featureEnhanced')
    ].forEach(text => {
        const li = heroOffList.createEl('li', { cls: `${ERT_CLASSES.INLINE} ert-feature-item` });
        const icon = li.createSpan({ cls: 'ert-feature-icon' });
        setIcon(icon, 'x-circle');
        li.createSpan({ text });
    });
    heroOffState.createDiv({
        cls: 'ert-ai-hero-muted',
        text: t('settings.ai.heroOff.muted')
    });

    const promoBannerContainer = containerEl.createDiv({ cls: 'ert-ai-promo-banners' });
    params.addAiRelatedElement(promoBannerContainer);

    const renderPromoBanners = (): void => {
        promoBannerContainer.empty();
        const activePromos = getActivePromos();
        if (!activePromos.length) return;

        for (const promo of activePromos) {
            const modelInfo = BUILTIN_MODELS.find(m => m.provider === promo.provider && m.id === promo.modelId);
            const modelLabel = modelInfo?.label ?? promo.modelId;
            const providerLabel = promo.provider !== 'none'
                ? PROVIDER_DISPLAY_LABELS[promo.provider]
                : promo.provider;
            const isFree = promo.inputPer1M === 0 && promo.outputPer1M === 0;
            const title = isFree
                ? `${modelLabel} — free to use`
                : `${modelLabel} — ${promo.promo.label}`;
            const expiry = promo.promo.expiresAt
                ? `Until ${new Date(promo.promo.expiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`
                : '';
            const body = isFree
                ? `${providerLabel} — no cost for Inquiry runs. ${expiry}`
                : `${providerLabel} — promotional pricing. ${expiry}`;

            const alertEl = promoBannerContainer.createDiv({
                cls: 'ert-refactor-alert ert-refactor-alert--promo'
            });
            const contentSide = alertEl.createDiv({ cls: 'ert-refactor-alert__content' });
            const heading = contentSide.createDiv({ cls: 'ert-refactor-alert__heading' });
            const iconWrapper = heading.createDiv({ cls: 'ert-refactor-alert__icon' });
            setIcon(iconWrapper, 'gift');
            heading.createSpan({ text: title, cls: 'ert-refactor-alert__title' });
            contentSide.createDiv({ cls: 'ert-refactor-alert__description', text: body });
        }
    };

    const aiStateContent = containerEl.createDiv({ cls: ERT_CLASSES.STACK });
    params.addAiRelatedElement(aiStateContent);

    const updateAiHeroState = (enabled: boolean): void => {
        heroToggleInput.checked = enabled;
        heroToggleLabel.setText(enabled ? t('settings.ai.hero.toggleActive') : t('settings.ai.hero.toggleInactive'));
        heroToggleLabel.toggleClass('is-active', enabled);
        heroTitle.setText(enabled
            ? t('settings.ai.hero.titleActive')
            : t('settings.ai.hero.titleInactive'));
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
    quickSetupSection.createDiv({ cls: 'ert-section-title', text: t('settings.ai.strategy.title') });
    quickSetupSection.createDiv({
        cls: 'ert-section-desc',
        text: t('settings.ai.strategy.desc')
    });
    const quickSetupGrid = quickSetupSection.createDiv({
        cls: `${ERT_CLASSES.GRID_FORM} ${ERT_CLASSES.GRID_FORM_3} ert-ai-quick-grid`
    });
    const quickSetupPreviewSection = aiSettingsGroup.createDiv({
        cls: `${ERT_CLASSES.STACK} ert-ai-preview-section`
    });
    const costEstimateSection = aiSettingsGroup.createDiv({
        cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ert-ai-section-card`
    });
    costEstimateSection.createDiv({ cls: 'ert-section-title', text: t('settings.ai.costEstimate.title') });
    costEstimateSection.createDiv({
        cls: 'ert-section-desc',
        text: t('settings.ai.costEstimate.desc')
    });
    const costEstimateCorpusSummary = costEstimateSection.createDiv({ cls: `${ERT_CLASSES.STACK_TIGHT}` });
    const costEstimateCorpusSize = costEstimateCorpusSummary.createDiv({
        cls: 'ert-section-desc',
        text: t('settings.ai.costEstimate.corpusCalculating')
    });
    const costEstimateCorpusStructure = costEstimateCorpusSummary.createDiv({
        cls: 'ert-field-note',
        text: t('settings.ai.costEstimate.corpusScanning')
    });
    const costEstimateTable = costEstimateSection.createDiv({ cls: 'ert-ai-models-table' });
    const costEstimateFreshness = costEstimateSection.createDiv({ cls: 'ert-ai-cost-freshness' });
    const costEstimateFootnote = costEstimateSection.createDiv({ cls: 'ert-ai-cost-footnote' });
    costEstimateFootnote.appendText('* Based on published provider pricing. Actual charges may differ due to caching, credits, or account-level adjustments. ');
    costEstimateFootnote.createSpan({ text: 'See provider pricing: ' });
    [
        { label: 'OpenAI', href: 'https://openai.com/api/pricing/' },
        { label: 'Anthropic', href: 'https://platform.claude.com/docs/en/about-claude/pricing' },
        { label: 'Google', href: 'https://ai.google.dev/' }
    ].forEach((link, index, list) => {
        const anchor = costEstimateFootnote.createEl('a', {
            href: link.href,
            text: link.label,
            cls: 'ert-ai-cost-link',
            attr: {
                'target': '_blank',
                'rel': 'noopener'
            }
        });
        if (index < list.length - 1) {
            anchor.after(document.createTextNode(' · '));
        }
    });
    costEstimateFootnote.appendText('. ');
    costEstimateFootnote.createEl('strong', { text: 'Local LLM' });
    costEstimateFootnote.appendText(' runs on your machine with no API charges.');

    const ensureCanonicalAiSettings = () => {
        if (!plugin.settings.aiSettings) {
            plugin.settings.aiSettings = validateAiSettings(buildDefaultAiSettings()).value;
        }
        const validated = validateAiSettings(plugin.settings.aiSettings);
        Object.assign(plugin.settings.aiSettings, validated.value);
        return plugin.settings.aiSettings;
    };

    const getSelectedProvider = (): Exclude<AIProviderId, 'none'> => {
        const provider = ensureCanonicalAiSettings().provider;
        if (provider === 'anthropic' || provider === 'google' || provider === 'openai' || provider === 'ollama') {
            return provider;
        }
        return 'openai';
    };

    const getOllamaBaseUrl = (): string => (
        getLocalLlmSettings(ensureCanonicalAiSettings()).baseUrl.trim() || 'http://localhost:11434/v1'
    );
    const buildLocalServerOptionLabel = (backend: LocalLlmBackendId, baseUrl: string): string => {
        const normalizedUrl = normalizeLocalLlmServerBaseUrl(baseUrl);
        try {
            const parsed = new URL(normalizedUrl);
            return `${LOCAL_LLM_BACKEND_LABELS[backend]} · ${parsed.host}`;
        } catch {
            return `${LOCAL_LLM_BACKEND_LABELS[backend]} · ${normalizedUrl}`;
        }
    };
    const getConfiguredLocalServerKey = (): string => buildLocalLlmServerKey(getLocalLlmBackendId(), getOllamaBaseUrl());

    const getOllamaModelId = (): string => {
        const aiSettings = ensureCanonicalAiSettings();
        const configured = getLocalLlmSettings(aiSettings).defaultModelId.trim();
        if (configured) return configured;
        if (aiSettings.modelPolicy.type === 'pinned') {
            const pinnedAlias = aiSettings.modelPolicy.pinnedAlias;
            const pinned = BUILTIN_MODELS.find(model =>
                model.provider === 'ollama' && model.alias === pinnedAlias
            );
            if (pinned?.id) return pinned.id;
        }
        return BUILTIN_MODELS.find(model => model.provider === 'ollama' && model.status === 'stable')?.id || 'llama3';
    };

    const setOllamaModelId = (modelId: string): void => {
        const aiSettings = ensureCanonicalAiSettings();
        const normalized = modelId.trim();
        aiSettings.localLlm = {
            ...getLocalLlmSettings(aiSettings),
            defaultModelId: normalized || getLocalLlmSettings(aiSettings).defaultModelId
        };
        const model = BUILTIN_MODELS.find(entry =>
            entry.provider === 'ollama' && (entry.id === normalized || entry.alias === normalized)
        );
        aiSettings.modelPolicy = model
            ? { type: 'pinned', pinnedAlias: model.alias }
            : { type: 'latestStable' };
    };
    const setLocalServerSelection = (backend: LocalLlmBackendId, baseUrl: string): void => {
        const aiSettings = ensureCanonicalAiSettings();
        aiSettings.localLlm = {
            ...getLocalLlmSettings(aiSettings),
            backend,
            baseUrl: normalizeLocalLlmServerBaseUrl(baseUrl)
        };
    };

    const getLocalLlmBackendId = (): LocalLlmBackendId => getLocalLlmSettings(ensureCanonicalAiSettings()).backend;
    const getLocalLlmConfigurationMode = (): LocalLlmConfigurationMode => getLocalLlmSettings(ensureCanonicalAiSettings()).configurationMode;
    const getLocalLlmUiTimeoutMs = (): number => (
        Math.max(4000, Math.min(getLocalLlmSettings(ensureCanonicalAiSettings()).timeoutMs, 10000))
    );
    const getLocalLlmUiOverrides = (): Partial<LocalLlmSettings> => ({
        timeoutMs: getLocalLlmUiTimeoutMs()
    });
    const getLocalStrategyModelOptions = (): Array<{ value: string; label: string }> => {
        const selectedModelId = getOllamaModelId().trim();
        const values = new Set<string>();
        const options: Array<{ value: string; label: string }> = [];

        localLlmLoadedModels.forEach(model => {
            const normalizedId = model.id.trim();
            if (!normalizedId || values.has(normalizedId)) return;
            values.add(normalizedId);
            options.push({ value: normalizedId, label: normalizedId });
        });

        if (selectedModelId && !values.has(selectedModelId)) {
            options.unshift({
                value: selectedModelId,
                label: localLlmLoadedModels.length ? `${selectedModelId} (configured)` : selectedModelId
            });
        }

        if (!options.length) {
            options.push({ value: selectedModelId || 'local-model', label: selectedModelId || 'Local model' });
        }

        return options;
    };
    const formatLocalCapabilitySymbol = (support: LocalLlmFeatureSupport): string => {
        if (support === 'yes') return '✓';
        if (support === 'partial') return '~';
        return '✗';
    };
    const formatLocalCapabilitySupportLabel = (
        feature: 'summary' | 'pulses' | 'gossamer' | 'inquiry',
        support: LocalLlmFeatureSupport
    ): string => {
        if (feature === 'inquiry') {
            if (support === 'yes') return 'Eligible';
            if (support === 'partial') return 'Possibly eligible';
            return 'Not eligible';
        }
        if (support === 'yes') return 'Supported';
        if (support === 'partial') return 'Limited';
        return 'Not supported';
    };
    const buildLocalCapabilityTooltip = (assessment: LocalLlmCapabilityAssessment): string => [
        `${assessment.tierName} — ${assessment.tierSummary}`,
        `Summary — ${formatLocalCapabilitySymbol(assessment.featureSupport.summary)} ${formatLocalCapabilitySupportLabel('summary', assessment.featureSupport.summary)}`,
        `Pulses — ${formatLocalCapabilitySymbol(assessment.featureSupport.pulses)} ${formatLocalCapabilitySupportLabel('pulses', assessment.featureSupport.pulses)}`,
        `Gossamer — ${formatLocalCapabilitySymbol(assessment.featureSupport.gossamer)} ${formatLocalCapabilitySupportLabel('gossamer', assessment.featureSupport.gossamer)}`,
        `Inquiry — ${formatLocalCapabilitySymbol(assessment.featureSupport.inquiry)} ${formatLocalCapabilitySupportLabel('inquiry', assessment.featureSupport.inquiry)}`,
        assessment.explanation
    ].join('\n');
    const buildLocalFeatureSummary = (assessment: LocalLlmCapabilityAssessment): string => {
        const parts: string[] = [];
        if (assessment.featureSupport.summary === 'yes') parts.push('Summary');
        else if (assessment.featureSupport.summary === 'partial') parts.push('Summary (limited)');

        if (assessment.featureSupport.pulses === 'yes') parts.push('Pulses');
        else if (assessment.featureSupport.pulses === 'partial') parts.push('Pulses (limited)');

        if (assessment.featureSupport.gossamer === 'yes') parts.push('Gossamer');
        else if (assessment.featureSupport.gossamer === 'partial') parts.push('Gossamer (limited)');

        if (assessment.featureSupport.inquiry === 'yes') parts.push('Inquiry eligible');
        else if (assessment.featureSupport.inquiry === 'partial') parts.push('Inquiry (possibly eligible)');

        return parts.join(' · ') || 'Summary not supported';
    };
    const setLocalLlmConfigurationMode = (mode: LocalLlmConfigurationMode): void => {
        const aiSettings = ensureCanonicalAiSettings();
        aiSettings.localLlm = {
            ...getLocalLlmSettings(aiSettings),
            configurationMode: mode
        };
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

    const largeHandlingSection = aiSettingsGroup.createDiv({
        cls: `${ERT_CLASSES.STACK} ert-ai-large-handling`
    });
    largeHandlingSection.setAttr('data-ert-role', 'ai-setting:large-manuscript-handling');
    const largeHandlingHeader = new Settings(largeHandlingSection)
        .setName(t('settings.ai.largeHandling.name'))
        .setHeading();
    applyErtHeaderLayout(largeHandlingHeader);
    const capacityGrid = largeHandlingSection.createDiv({ cls: 'ert-ai-capacity-grid' });
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
    const renderCapacitySections = (
        container: HTMLElement,
        sections: Array<{ title: string; items: CapacityItem[] }>
    ): void => {
        container.empty();
        sections.forEach(section => {
            const sectionEl = container.createDiv({ cls: 'ert-ai-capacity-block' });
            sectionEl.createDiv({ cls: 'ert-ai-capacity-block-title', text: section.title });
            const listEl = sectionEl.createEl('ul', { cls: 'ert-ai-capacity-list' });
            section.items.forEach(item => {
                const normalized = typeof item === 'string' ? { text: item } : item;
                if (normalized.dividerBefore) {
                    listEl.createEl('li', { cls: 'ert-ai-capacity-divider' });
                }
                listEl.createEl('li', { cls: 'ert-ai-capacity-item', text: normalized.text });
            });
        });
    };
    const formatInquiryCount = (count: number | null): string => count === null ? '?' : count.toLocaleString();
    const formatCorpusBreakdownToken = (tokens: number | null): string => (
        tokens === null
            ? '~?'
            : `~${(Math.round((Number.isFinite(tokens) ? tokens : 0) / 100) / 10).toFixed(1).replace(/\.0$/, '')}k`
    );
    const estimateTokensFromChars = (chars: number): number => chars > 0 ? Math.ceil(chars / 4) : 0;
    const formatPromptToken = (tokens: number | null): string => (
        tokens === null
            ? '~?'
            : tokens >= 1000
                ? formatCorpusBreakdownToken(tokens)
                : `~${tokens.toLocaleString()}`
    );
    const buildTokenCapacityLine = (label: string, tokens: number | null): string => (
        `${label} (${formatPromptToken(tokens)})`
    );
    const buildScenesCapacityLine = (sceneCount: number | null, scenesTokens: number | null): string => (
        `Scenes (${formatInquiryCount(sceneCount)}) — full text (${formatCorpusBreakdownToken(scenesTokens)})`
    );
    const buildOutlineCapacityLine = (outlineCount: number | null, outlineTokens: number | null): string => (
        outlineCount === null
            ? `Outline (?) — unavailable (${formatCorpusBreakdownToken(outlineTokens)})`
            : outlineCount > 0
                ? `Outline (${formatInquiryCount(outlineCount)}) — full text (${formatCorpusBreakdownToken(outlineTokens)})`
                : 'Outline — none'
    );
    const buildReferenceCapacityLine = (referenceCount: number | null, referenceTokens: number | null): string => (
        referenceCount === null
            ? `References (?) — unavailable (${formatCorpusBreakdownToken(referenceTokens)})`
            : referenceCount > 0
                ? `References (${formatInquiryCount(referenceCount)}) — included (${formatCorpusBreakdownToken(referenceTokens)})`
                : 'References — none'
    );
    const buildInquiryCapacitySections = (counts?: {
        sceneCount: number;
        outlineCount: number;
        referenceCount: number;
        breakdown: RTCorpusTokenBreakdown;
        promptBreakdown?: PromptRequestBreakdown;
    }): Array<{ title: string; items: CapacityItem[] }> => {
        const sceneCount = counts?.sceneCount ?? null;
        const outlineCount = counts?.outlineCount ?? null;
        const referenceCount = counts?.referenceCount ?? null;
        const scenesTokens = counts?.breakdown.scenesTokens ?? null;
        const outlineTokens = counts?.breakdown.outlineTokens ?? null;
        const referenceTokens = counts?.breakdown.referenceTokens ?? null;
        const corpusTokens = counts
            ? counts.breakdown.scenesTokens + counts.breakdown.outlineTokens + counts.breakdown.referenceTokens
            : null;
        const totalTokens = sumTokenParts(
            corpusTokens,
            counts?.promptBreakdown?.roleTemplateTokens,
            counts?.promptBreakdown?.instructionTokens,
            counts?.promptBreakdown?.outputContractTokens,
            counts?.promptBreakdown?.transformTokens
        );
        return [
            {
                title: 'Corpus',
                items: [
                    buildScenesCapacityLine(sceneCount, scenesTokens),
                    buildOutlineCapacityLine(outlineCount, outlineTokens),
                    buildReferenceCapacityLine(referenceCount, referenceTokens)
                ]
            },
            {
                title: 'Prompt',
                items: [
                    buildTokenCapacityLine('AI role template (author-defined)', counts?.promptBreakdown?.roleTemplateTokens ?? null),
                    buildTokenCapacityLine('Editorial analysis instructions', counts?.promptBreakdown?.instructionTokens ?? null)
                ]
            },
            {
                title: 'Output',
                items: [
                    'Scene-linked findings',
                    buildTokenCapacityLine('Strict JSON structure', counts?.promptBreakdown?.outputContractTokens ?? null)
                ]
            },
            {
                title: 'Processing',
                items: [
                    'Multi-pass (if required)',
                    'Provider wrappers',
                    { text: `Total ${formatCorpusBreakdownToken(totalTokens)}`, dividerBefore: true }
                ]
            }
        ];
    };
    const extractSummary = (frontmatter: Record<string, unknown>): string => {
        const raw = frontmatter['Summary'];
        if (Array.isArray(raw)) return raw.map(value => String(value)).join('\n').trim();
        if (typeof raw === 'string') return raw.trim();
        if (raw === null || raw === undefined) return '';
        return String(raw).trim();
    };
    const toBreakdown = (sceneChars: number, outlineChars: number, referenceChars: number): RTCorpusTokenBreakdown => ({
        scenesTokens: sceneChars > 0 ? Math.ceil(sceneChars / 4) : 0,
        outlineTokens: outlineChars > 0 ? Math.ceil(outlineChars / 4) : 0,
        referenceTokens: referenceChars > 0 ? Math.ceil(referenceChars / 4) : 0
    });
    const buildDisplayCorpusEstimateFromManifestEntries = async (entries: CorpusManifestEntry[]) => {
        let sceneCount = 0;
        let outlineCount = 0;
        let referenceCount = 0;
        let sceneChars = 0;
        let outlineChars = 0;
        let referenceChars = 0;

        for (const entry of entries) {
            if (entry.class === 'scene') {
                sceneCount += 1;
            } else if (entry.class === 'outline') {
                outlineCount += 1;
            } else {
                referenceCount += 1;
            }

            const file = app.vault.getAbstractFileByPath(entry.path);
            if (!(file instanceof TFile)) continue;

            let chars = 0;
            if (entry.mode === 'summary') {
                const cache = app.metadataCache.getFileCache(file);
                const rawFrontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
                const frontmatter = rawFrontmatter
                    ? normalizeFrontmatterKeys(rawFrontmatter, plugin.settings.frontmatterMappings)
                    : {};
                chars = extractSummary(frontmatter).length;
            } else if (entry.mode === 'full') {
                const raw = await app.vault.read(file);
                chars = cleanEvidenceBody(raw).length;
            }

            if (entry.class === 'scene') {
                sceneChars += chars;
            } else if (entry.class === 'outline') {
                outlineChars += chars;
            } else {
                referenceChars += chars;
            }
        }

        const breakdown = toBreakdown(sceneChars, outlineChars, referenceChars);
        return {
            sceneCount,
            outlineCount,
            referenceCount,
            evidenceChars: sceneChars + outlineChars + referenceChars,
            estimatedTokens: breakdown.scenesTokens + breakdown.outlineTokens + breakdown.referenceTokens,
            method: 'rt_chars_heuristic' as const,
            breakdown
        };
    };
    const buildGossamerCapacitySections = (
        sceneCount: number,
        breakdown?: RTCorpusTokenBreakdown,
        promptBreakdown?: PromptRequestBreakdown
    ): Array<{ title: string; items: CapacityItem[] }> => [
        {
            title: 'Corpus',
            items: [
                buildScenesCapacityLine(sceneCount, breakdown?.scenesTokens ?? null),
                'Outline — not included',
                'References — not included'
            ]
        },
        {
            title: 'Transform',
            items: [buildTokenCapacityLine('Beat overlay (ordered sequence)', promptBreakdown?.transformTokens ?? null)]
        },
        {
            title: 'Prompt',
            items: [
                buildTokenCapacityLine('AI role template (author-defined)', promptBreakdown?.roleTemplateTokens ?? null),
                buildTokenCapacityLine('Beat scoring instructions', promptBreakdown?.instructionTokens ?? null)
            ]
        },
        {
            title: 'Output',
            items: [
                'Per-beat scores',
                buildTokenCapacityLine('Strict JSON structure', promptBreakdown?.outputContractTokens ?? null)
            ]
        },
        {
            title: 'Processing',
            items: [
                'Single-pass',
                'Provider wrappers',
                {
                    text: `Total ${formatCorpusBreakdownToken(sumTokenParts(
                        breakdown
                            ? breakdown.scenesTokens + breakdown.outlineTokens + breakdown.referenceTokens
                            : null,
                        promptBreakdown?.roleTemplateTokens,
                        promptBreakdown?.instructionTokens,
                        promptBreakdown?.outputContractTokens,
                        promptBreakdown?.transformTokens
                    ))}`,
                    dividerBefore: true
                }
            ]
        }
    ];

    const capacityInquiry = createCapacityCell('Inquiry');
    capacityInquiry.labelEl.addClass('ert-ai-capacity-label--forecast');
    const capacityInquiryToken = capacityInquiry.valueEl.createDiv({
        cls: 'ert-ai-capacity-meta',
        text: 'Calculating...'
    });
    const capacityInquiryExpected = capacityInquiry.valueEl.createDiv({
        cls: 'ert-ai-capacity-meta',
        text: 'Calculating...'
    });
    const capacityInquiryProvider = capacityInquiry.valueEl.createDiv({
        cls: 'ert-ai-capacity-meta',
        text: 'Calculating...'
    });
    const capacityInquirySections = capacityInquiry.valueEl.createDiv({ cls: 'ert-ai-capacity-composition' });
    renderCapacitySections(capacityInquirySections, buildInquiryCapacitySections());

    const capacityGossamer = createCapacityCell('Gossamer');
    capacityGossamer.labelEl.addClass('ert-ai-capacity-label--forecast');
    const capacityGossamerToken = capacityGossamer.valueEl.createDiv({
        cls: 'ert-ai-capacity-meta',
        text: 'Calculating...'
    });
    const capacityGossamerExpected = capacityGossamer.valueEl.createDiv({
        cls: 'ert-ai-capacity-meta',
        text: 'Calculating...'
    });
    const capacityGossamerProvider = capacityGossamer.valueEl.createDiv({
        cls: 'ert-ai-capacity-meta',
        text: 'Calculating...'
    });
    const capacityGossamerSections = capacityGossamer.valueEl.createDiv({ cls: 'ert-ai-capacity-composition' });
    renderCapacitySections(capacityGossamerSections, buildGossamerCapacitySections(0));
    // ── Details link → modal ──
    const detailsBtn = aiSettingsGroup.createDiv({ cls: 'ert-ai-details-link' });
    detailsBtn.createSpan({ text: 'How analysis passes work \u2192' });
    detailsBtn.addEventListener('click', () => {
        const { AiPassStrategyDetailsModal } = require('../../modals/AiPassStrategyDetailsModal');
        new AiPassStrategyDetailsModal(plugin.app).open();
    });

    // ── Execution preference dropdown ──
    const executionPreferenceSetting = new Settings(aiSettingsGroup)
        .setName(t('settings.ai.executionPreference.name'))
        .setDesc(t('settings.ai.executionPreference.desc'));
    executionPreferenceSetting.settingEl.setAttr('data-ert-role', 'ai-setting:execution-preference');
    let executionPreferenceDropdown: DropdownComponent | null = null;
    executionPreferenceSetting.addDropdown(dropdown => {
        executionPreferenceDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--lg');
        dropdown.addOption('automatic', t('settings.ai.executionPreference.optionAutomatic'));
        dropdown.addOption('singlePassOnly', t('settings.ai.executionPreference.optionSinglePass'));
        dropdown.addOption('segmented', t('settings.ai.executionPreference.optionSegmented'));
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
    const executionPreferenceNote = aiSettingsGroup.createDiv({ cls: 'ert-field-note' });
    const updateExecutionPreferenceNote = (): void => {
        const mode = ensureCanonicalAiSettings().analysisPackaging;
        executionPreferenceNote.setText(
            mode === 'singlePassOnly'
                ? t('settings.ai.executionPreference.noteSinglePass')
                : mode === 'segmented'
                ? t('settings.ai.executionPreference.noteSegmented')
                : ''
        );
        executionPreferenceNote.toggleClass('ert-settings-hidden', mode === 'automatic');
    };
    updateExecutionPreferenceNote();
    params.addAiRelatedElement(largeHandlingSection);
    params.addAiRelatedElement(detailsBtn);
    params.addAiRelatedElement(executionPreferenceSetting.settingEl);
    params.addAiRelatedElement(executionPreferenceNote);

    const roleContextSection = aiSettingsGroup.createDiv({
        cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ert-ai-section-card`
    });
    roleContextSection.createDiv({ cls: 'ert-section-title', text: t('settings.ai.roleContext.title') });
    roleContextSection.createDiv({
        cls: 'ert-section-desc',
        text: t('settings.ai.roleContext.desc')
    });

    const apiKeysFold = aiSettingsGroup.createDiv({
        cls: `${ERT_CLASSES.STACK} ert-ai-configuration`
    });
    const apiKeysHeader = new Settings(apiKeysFold)
        .setName(t('settings.ai.apiKeys.name'))
        .setHeading();
    addHeadingIcon(apiKeysHeader, 'key');
    addWikiLink(apiKeysHeader, 'Settings#ai');
    applyErtHeaderLayout(apiKeysHeader);
    const configurationBody = apiKeysFold.createDiv({ cls: [ERT_CLASSES.SECTION_BODY, ERT_CLASSES.STACK] });

    const aiConfigFold = aiSettingsGroup.createDiv({
        cls: ERT_CLASSES.STACK
    });
    aiConfigFold.setAttr('data-ert-role', 'ai-setting:configuration');
    const aiConfigHeader = new Settings(aiConfigFold)
        .setName(t('settings.ai.configuration.name'))
        .setHeading();
    applyErtHeaderLayout(aiConfigHeader);
    const aiConfigBody = aiConfigFold.createDiv({ cls: [ERT_CLASSES.SECTION_BODY, ERT_CLASSES.STACK] });

    const contextTemplateSetting = new Settings(roleContextSection)
        .setName(t('settings.ai.contextTemplate.name'))
        .setDesc(`Active: ${getActiveTemplateName()}`)
        .addExtraButton(button => button
            .setIcon('gear')
            .setTooltip(t('settings.ai.contextTemplate.tooltip'))
            .onClick(() => {
                const modal = new AiContextModal(app, plugin, () => {
                    contextTemplateSetting.setDesc(`Active: ${getActiveTemplateName()}`);
                });
                modal.open();
            }));
    params.addAiRelatedElement(contextTemplateSetting.settingEl);

    const capabilityFloor: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'];
    const providerLabel: Record<AIProviderId, string> = {
        anthropic: t('settings.ai.provider.optionAnthropic'),
        openai: t('settings.ai.provider.optionOpenai'),
        google: t('settings.ai.provider.optionGoogle'),
        ollama: t('settings.ai.provider.optionLocalLlm'),
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

    type PreviewSignalType =
        | 'citation'
        | 'reuse'
        | 'passBehavior';

    interface PreviewSignal {
        type: PreviewSignalType;
        text: string;
    }

    const PREVIEW_SIGNAL_PRIORITY: readonly PreviewSignalType[] = [
        'citation',
        'reuse',
        'passBehavior'
    ] as const;
    const MAX_PREVIEW_SIGNALS = 4;

    const resolvePreviewCitationSignal = (model: ModelInfo): string | null =>
        getModelUiSignals(model).citationLabel;

    const resolvePreviewReuseSignal = (model: ModelInfo): string | null =>
        getModelUiSignals(model).reuseLabel;

    const resolvePreviewSignals = (state: {
        citationLabel: string | null;
        reuseLabel: string | null;
        passBehaviorLabel: string | null;
    }): string[] => {
        const candidates: PreviewSignal[] = [];

        if (state.citationLabel) {
            candidates.push({
                type: 'citation',
                text: state.citationLabel
            });
        }

        if (state.reuseLabel) {
            candidates.push({
                type: 'reuse',
                text: state.reuseLabel
            });
        }

        if (state.passBehaviorLabel) {
            candidates.push({
                type: 'passBehavior',
                text: state.passBehaviorLabel
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

    const getProviderPickerModels = (provider: AIProviderId): ModelInfo[] =>
        getPickerModelsForProvider(BUILTIN_MODELS, provider);

    const getProviderPickerAliases = (provider: AIProviderId): string[] =>
        getProviderPickerModels(provider).map(model => model.alias);

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

    const resolveDisplayModelForLatestAlias = (models: ModelInfo[], selected: ModelInfo): {
        displayModel: ModelInfo;
        resolvedModelId: string | null;
        isPending: boolean;
    } => {
        const aliasId = selected.id.includes('latest')
            ? selected.id
            : (selected.alias.includes('latest') ? selected.alias : '');
        if (!aliasId) {
            return {
                displayModel: selected,
                resolvedModelId: selected.id,
                isPending: false
            };
        }

        const cachedResolvedId = getResolvedModelId(aliasId);
        if (cachedResolvedId) {
            const cached = models.find(model => model.id === cachedResolvedId || model.alias === cachedResolvedId);
            if (cached) {
                return {
                    displayModel: cached,
                    resolvedModelId: cached.id,
                    isPending: false
                };
            }
        }

        return {
            displayModel: selected,
            resolvedModelId: null,
            isPending: true
        };
    };

    const getAccessTier = (provider: AIProviderId): AccessTier => {
        const aiSettings = ensureCanonicalAiSettings();
        if (provider === 'anthropic') return aiSettings.aiAccessProfile.anthropicTier ?? 1;
        if (provider === 'openai') return aiSettings.aiAccessProfile.openaiTier ?? 1;
        if (provider === 'google') return aiSettings.aiAccessProfile.googleTier ?? 1;
        return 1;
    };

    const persistCanonical = async (): Promise<void> => {
        ensureCanonicalAiSettings();
        await plugin.saveSettings();
        params.refreshProviderDimming();
        plugin.getInquiryService().notifyAiSettingsChanged();
    };

    const providerKeyStates: Record<string, string> = {};
    const refreshDropdownKeyIndicators = (): void => {
        if (!providerDropdown) return;
        const selectEl = providerDropdown.selectEl;
        const selectedState = providerKeyStates[selectEl.value];
        selectEl.removeClass('is-ready', 'is-warning', 'is-muted');
        if (selectedState === 'ready') {
            selectEl.addClass('is-ready');
        } else if (selectedState === 'not_configured' || selectedState === 'rejected' || selectedState === 'network_blocked') {
            selectEl.addClass('is-warning');
        } else if (selectedState === 'checking') {
            selectEl.addClass('is-muted');
        }
    };

    const providerSetting = new Settings(quickSetupGrid)
        .setName(t('settings.ai.provider.name'))
        .setDesc(t('settings.ai.provider.desc'));
    providerSetting.settingEl.setAttr('data-ert-role', 'ai-setting:provider');
    let providerDropdown: DropdownComponent | null = null;
    providerSetting.addDropdown(dropdown => {
        providerDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md', 'ert-ai-strategy-select');
        dropdown.addOption('anthropic', t('settings.ai.provider.optionAnthropic'));
        dropdown.addOption('openai', t('settings.ai.provider.optionOpenai'));
        dropdown.addOption('google', t('settings.ai.provider.optionGoogle'));
        dropdown.addOption('ollama', t('settings.ai.provider.optionLocalLlm'));
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
            refreshDropdownKeyIndicators();
            if (nextProvider === 'ollama') {
                markLocalLlmConfigurationDirty();
                queueLocalLlmAutoValidation();
            }
        });
    });
    params.addAiRelatedElement(providerSetting.settingEl);

    const modelOverrideSetting = new Settings(quickSetupGrid)
        .setName(t('settings.ai.modelOverride.name'))
        .setDesc(t('settings.ai.modelOverride.desc'));
    modelOverrideSetting.settingEl.setAttr('data-ert-role', 'ai-setting:model-override');
    let modelOverrideDropdown: DropdownComponent | null = null;
    modelOverrideSetting.addDropdown(dropdown => {
        modelOverrideDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md', 'ert-ai-strategy-select');
        dropdown.onChange(async value => {
            if (isSyncingRoutingUi) return;
            const aiSettings = ensureCanonicalAiSettings();
            if (aiSettings.provider === 'ollama') {
                setOllamaModelId(value);
                if (localLlmModelText) localLlmModelText.setValue(value);
                clearLocalLlmValidationState();
                await persistCanonical();
                params.scheduleKeyValidation('ollama');
                renderLocalLlmModelList();
                renderLocalLlmStatus();
                queueLocalLlmAutoValidation();
                refreshRoutingUi();
                return;
            }
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
    const ACCESS_TIER_COPY = t('settings.ai.accessTier.desc');
    const LOCAL_MODEL_STRATEGY_COPY = 'Select the active local model here. If discovery fails, use the manual fallback in Local LLM Configuration below.';
    const LOCAL_OVERRIDE_COPY = 'Use Auto for standard Local LLM setup. Switch to Custom only when you need to override backend or transport settings.';

    const accessTierSetting = new Settings(quickSetupGrid)
        .setName(t('settings.ai.accessTier.name'))
        .setDesc(ACCESS_TIER_COPY);
    accessTierSetting.settingEl.setAttr('data-ert-role', 'ai-setting:access-level');
    let accessTierDropdown: DropdownComponent | null = null;
    accessTierSetting.addDropdown(dropdown => {
        accessTierDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md', 'ert-ai-strategy-select');
        dropdown.addOption('1', t('settings.ai.accessTier.tier1'));
        dropdown.addOption('2', t('settings.ai.accessTier.tier2'));
        dropdown.addOption('3', t('settings.ai.accessTier.tier3'));
        dropdown.addOption('4', t('settings.ai.accessTier.tier4'));
        dropdown.onChange(async value => {
            if (isSyncingRoutingUi) return;
            const aiSettings = ensureCanonicalAiSettings();
            const provider = aiSettings.provider === 'none' ? 'openai' : aiSettings.provider;
            if (provider === 'ollama') {
                setLocalLlmConfigurationMode(value === 'custom' ? 'custom' : 'auto');
                await persistCanonical();
                renderLocalLlmModelList();
                renderLocalLlmStatus();
                refreshRoutingUi();
                return;
            }
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

    const resolvedPreviewFrame = quickSetupPreviewSection.createDiv({
        cls: [ERT_CLASSES.PREVIEW_FRAME, ERT_CLASSES.STACK, 'ert-previewFrame--center', 'ert-previewFrame--flush', 'ert-ai-resolved-preview'],
        attr: { 'data-ert-role': 'ai-setting:resolved-model-preview' }
    });
    const resolvedPreviewKicker = resolvedPreviewFrame.createDiv({
        cls: 'ert-ai-resolved-preview-kicker',
        text: t('settings.ai.preview.kicker')
    });
    const resolvedPreviewModel = resolvedPreviewFrame.createDiv({
        cls: 'ert-ai-resolved-preview-model',
        text: t('settings.ai.preview.resolving')
    });
    const resolvedPreviewProvider = resolvedPreviewFrame.createDiv({
        cls: 'ert-ai-resolved-preview-provider',
        text: t('settings.ai.preview.providerPlaceholder')
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
    let localLlmConfigSectionEl: HTMLElement | null = null;
    let localLlmStatusSectionEl: HTMLElement | null = null;

    applyStrategyRowCopyLayout(providerSetting, 'Select the AI service or Local LLM runtime that powers structural analysis and editorial insight.');
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
        modelId: string;
        modelLabel: string;
        modelAlias: string;
        idPending: boolean;
        contextWindow: number | null;
        maxInputTokens: number | null;
        maxOutputTokens: number | null;
        citationLabel: string | null;
        reuseLabel: string | null;
        passBehaviorLabel: string | null;
        isPreview: boolean;
    }

    const renderLocalPreviewUnavailable = (title: string, detail: string): void => {
        resolvedPreviewKicker.setText(t('settings.ai.preview.kicker'));
        resolvedPreviewModel.setText(title);
        resolvedPreviewProvider.setText(detail);
        resolvedPreviewComparatorLabel.setText('');
        resolvedPreviewComparatorValue.setText('');
        resolvedPreviewComparator.toggleClass('ert-settings-hidden', true);
        renderResolvedPreviewPills([]);
    };

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

    const renderResolvedPreview = (state: ResolvedPreviewRenderState): void => {
        resolvedPreviewKicker.setText(t('settings.ai.preview.kicker'));
        const previewModelLabel = state.provider === 'ollama'
            ? state.modelLabel.replace(/^Local LLM:\s*/i, '').trim() || state.modelLabel
            : state.modelLabel;
        resolvedPreviewModel.setText(previewModelLabel);
        const labelAlreadySaysPreview = state.modelLabel.toLowerCase().includes('preview');
        const previewSuffix = state.isPreview && !labelAlreadySaysPreview ? ' (Preview)' : '';
        const providerDetail = state.provider === 'ollama'
            ? (state.idPending
                ? `ID pending (${state.modelAlias})`
                : `${state.modelId || previewModelLabel}${previewSuffix}`)
            : (state.idPending
                ? `${providerLabel[state.provider]} · ID pending (${state.modelAlias})`
                : `${providerLabel[state.provider]} · ${(state.modelId || state.modelLabel)}${previewSuffix}`);
        resolvedPreviewProvider.setText(providerDetail);
        resolvedPreviewComparatorLabel.setText('');
        resolvedPreviewComparatorValue.setText('');
        resolvedPreviewComparator.toggleClass('ert-settings-hidden', true);

        const previewPills = resolvePreviewSignals({
            citationLabel: state.citationLabel,
            reuseLabel: state.reuseLabel,
            passBehaviorLabel: state.passBehaviorLabel
        });

        renderResolvedPreviewPills(previewPills);

    };

    type FeatureForecast = {
        available: boolean;
        corpusTokens: number;
        providerExecutionTokens: number;
        totalEstimatedTokens: number;
        sceneCount: number;
        outlineCount: number;
        referenceCount: number;
        breakdown: RTCorpusTokenBreakdown;
        promptBreakdown: PromptRequestBreakdown;
    };

    type CostComparisonModel = {
        provider: AIProviderId;
        modelId: string;
        providerLabel: string;
        modelLabel: string;
    };

    type CostComparisonRow = {
        model: CostComparisonModel;
        freshText: string;
        cachedText: string;
        passesText: string;
        promoLabel?: string;
    };

    const getCostComparisonRowKey = (provider: AIProviderId, modelId: string): string =>
        `${provider}::${modelId}`;

    const COST_PROVIDER_ORDER: ReadonlyArray<Exclude<AIProviderId, 'none' | 'ollama'>> = ['anthropic', 'openai', 'google'];

    const supportsCostComparisonModel = (provider: AIProviderId, modelId: string): boolean => {
        if (provider === 'none' || provider === 'ollama') return false;
        try {
            getProviderPricing(provider, modelId);
            return true;
        } catch {
            return false;
        }
    };

    const getCostComparisonModels = (): CostComparisonModel[] => {
        const cloudModels: CostComparisonModel[] = COST_PROVIDER_ORDER.flatMap(provider => {
            const providerModels = getPickerModelsForProvider(BUILTIN_MODELS, provider)
                .filter(model => !model.id.endsWith('-latest'))
                .filter(model => supportsCostComparisonModel(provider, model.id));

            return providerModels.map(model => ({
                provider,
                modelId: model.id,
                providerLabel: PROVIDER_DISPLAY_LABELS[provider],
                modelLabel: model.label
            }));
        });

        const localModel = resolveLocalLlmModelInfo(ensureCanonicalAiSettings());
        return cloudModels.concat({
            provider: 'ollama',
            modelId: localModel.id,
            providerLabel: PROVIDER_DISPLAY_LABELS.ollama,
            modelLabel: localModel.label
        });
    };

    const createCostTableCell = (rowEl: HTMLElement, text: string, extraCls?: string): void => {
        rowEl.createDiv({
            cls: ['ert-ai-models-cell', extraCls].filter(Boolean).join(' '),
            text
        });
    };

    const formatCorpusStructureSummary = (sceneCount: number, outlineCount: number): string => {
        const parts: string[] = [];
        if (sceneCount > 0 || outlineCount <= 0) {
            parts.push(`${sceneCount} ${sceneCount === 1 ? 'scene' : 'scenes'}`);
        }
        if (outlineCount > 0) {
            parts.push(`${outlineCount} ${outlineCount === 1 ? 'outline' : 'outlines'}`);
        }
        return parts.length ? parts.join(' + ') : 'No scenes or outlines';
    };

    const formatCorpusTokenSummary = (tokens: number): string =>
        `${formatCorpusBreakdownToken(tokens)} tokens`;

    const renderCostEstimateCorpusSummary = (options: {
        sizeText: string;
        structureText: string;
    }): void => {
        costEstimateCorpusSize.setText(options.sizeText);
        costEstimateCorpusStructure.setText(options.structureText);
    };

    let activeCostComparisonRowKey: string | null = null;
    let activeCostRowCredentialState: string | null = null;
    let lastCostComparisonRows: CostComparisonRow[] = [];

    const getCurrentCorpusContext = () => plugin.getInquiryService().getCurrentCorpusContext();

    const buildCurrentInquiryExecutionEstimate = async (params: {
        provider: AIProviderId;
        modelId: string;
        questionText: string;
    }) => {
        const currentCorpus = getCurrentCorpusContext();
        if (!currentCorpus) {
            throw new Error('Inquiry corpus is not available yet. Open Inquiry View to populate estimates.');
        }
        return await buildCanonicalExecutionEstimate({
            plugin,
            provider: params.provider,
            modelId: params.modelId,
            questionText: params.questionText,
            scope: currentCorpus.scope,
            activeBookId: currentCorpus.activeBookId,
            scopeLabel: currentCorpus.scopeLabel,
            manifestEntries: currentCorpus.manifestEntries,
            vault: app.vault,
            metadataCache: app.metadataCache,
            frontmatterMappings: plugin.settings.frontmatterMappings
        });
    };

    const renderCostComparisonRows = (rows: CostComparisonRow[]): void => {
        lastCostComparisonRows = rows;
        costEstimateTable.empty();

        const headerRow = costEstimateTable.createDiv({ cls: 'ert-ai-models-row ert-ai-models-row--header' });
        ['Provider', 'Model', 'Fresh Run*', 'Cached Run', 'Expected Structured Passes'].forEach(text => {
            createCostTableCell(headerRow, text);
        });

        const sorted = [...rows].sort((a, b) => {
            const aPromo = a.promoLabel ? 0 : 1;
            const bPromo = b.promoLabel ? 0 : 1;
            return aPromo - bPromo;
        });

        sorted.forEach(row => {
            const rowEl = costEstimateTable.createDiv({ cls: 'ert-ai-models-row' });
            if (activeCostComparisonRowKey === getCostComparisonRowKey(row.model.provider, row.model.modelId)) {
                rowEl.addClass('ert-ai-models-row--active');
                if (activeCostRowCredentialState === 'ready') {
                    rowEl.addClass('ert-ai-models-row--ready');
                } else if (activeCostRowCredentialState === 'not_configured' || activeCostRowCredentialState === 'rejected') {
                    rowEl.addClass('ert-ai-models-row--warning');
                }
            }
            if (row.promoLabel) {
                rowEl.addClass('ert-ai-models-row--promo');
            }
            createCostTableCell(rowEl, row.model.providerLabel);
            const modelCell = rowEl.createDiv({
                cls: 'ert-ai-models-cell ert-ai-models-cell--model'
            });
            modelCell.createSpan({ text: row.model.modelLabel });
            if (row.promoLabel) {
                modelCell.createSpan({
                    cls: 'ert-ai-cost-promo-badge',
                    text: row.promoLabel
                });
            }
            createCostTableCell(rowEl, row.freshText);
            createCostTableCell(rowEl, row.cachedText);
            createCostTableCell(rowEl, row.passesText);
        });
    };

    const setActiveCostComparisonRow = (provider: AIProviderId | null, modelId: string | null): void => {
        activeCostComparisonRowKey = provider && modelId
            ? getCostComparisonRowKey(provider, modelId)
            : null;
        activeCostRowCredentialState = provider ? (providerKeyStates[provider] ?? null) : null;
        if (lastCostComparisonRows.length > 0) {
            renderCostComparisonRows(lastCostComparisonRows);
        }
    };

    const buildLoadingCostRows = (): CostComparisonRow[] => getCostComparisonModels().map(model => ({
        model,
        freshText: 'Calculating...',
        cachedText: 'Calculating...',
        passesText: 'Calculating...'
    }));

    let costComparisonRequestId = 0;

    const computeCostEstimateCorpusSummary = async (): Promise<{
        sizeText: string;
        structureText: string;
    }> => {
        const currentCorpus = getCurrentCorpusContext();
        if (currentCorpus) {
            return {
                sizeText: `Inquiry Corpus: ${formatCorpusTokenSummary(currentCorpus.corpus.estimatedTokens)}`,
                structureText: formatCorpusStructureSummary(
                    currentCorpus.corpus.sceneCount,
                    currentCorpus.corpus.outlineCount
                )
            };
        }
        return {
            sizeText: 'Open Inquiry View to see corpus estimates and pricing.',
            structureText: ''
        };
    };

    const computeCostComparisonRows = async (): Promise<CostComparisonRow[]> => {
        return await Promise.all(getCostComparisonModels().map(async model => {
            try {
                const executionEstimate = await buildCurrentInquiryExecutionEstimate({
                    provider: model.provider,
                    modelId: model.modelId,
                    questionText: INQUIRY_CANONICAL_ESTIMATE_QUESTION
                });
                if (!executionEstimate?.expectedPassCount || !executionEstimate.maxOutputTokens) {
                    throw new Error('Canonical execution estimate unavailable.');
                }
                if (model.provider === 'ollama') {
                    const passLabel = `${executionEstimate.expectedPassCount} ${executionEstimate.expectedPassCount === 1 ? 'pass' : 'passes'}`;
                    return {
                        model,
                        freshText: 'Local compute',
                        cachedText: 'Local compute',
                        passesText: passLabel
                    };
                }
                const cost = estimateCorpusCost(
                    model.provider,
                    model.modelId,
                    executionEstimate.estimatedTokens,
                    executionEstimate.maxOutputTokens,
                    executionEstimate.expectedPassCount
                );
                const passLabel = `${cost.expectedPasses} ${cost.expectedPasses === 1 ? 'pass' : 'passes'}`;
                const promoLabel = cost.promo?.label;
                return {
                    model,
                    freshText: formatUsdCost(cost.freshCostUSD),
                    cachedText: formatUsdCost(cost.cachedCostUSD),
                    passesText: passLabel,
                    promoLabel
                };
            } catch {
                return {
                    model,
                    freshText: 'No estimate yet',
                    cachedText: 'No estimate yet',
                    passesText: '\u2014'
                };
            }
        }));
    };

    const refreshCostComparisonTable = async (): Promise<void> => {
        const requestId = ++costComparisonRequestId;
        renderCostEstimateCorpusSummary({
            sizeText: 'Inquiry Corpus: Calculating...',
            structureText: 'Scanning corpus...'
        });
        setActiveCostComparisonRow(null, null);
        renderCostComparisonRows(buildLoadingCostRows());
        const [corpusSummary, rows] = await Promise.all([
            computeCostEstimateCorpusSummary(),
            computeCostComparisonRows()
        ]);
        if (requestId !== costComparisonRequestId) return;
        renderCostEstimateCorpusSummary(corpusSummary);
        renderCostComparisonRows(rows);
        costEstimateFreshness.setText(getPricingFreshnessLabel(getActivePricingMeta()));
        renderPromoBanners();
    };

    const computeVaultForecasts = async (engine?: {
        provider: AIProviderId;
        modelId: string;
    }): Promise<{ inquiry: FeatureForecast; gossamer: FeatureForecast }> => {
        const currentCorpus = getCurrentCorpusContext();
        const roleTemplateTokens = estimateTokensFromChars(getActiveTemplatePrompt().length);
        const inquiryPromptParts = buildInquiryPromptParts('');
        const inquiryInstructionTokens = estimateTokensFromChars(
            inquiryPromptParts.systemPrompt.length
            + inquiryPromptParts.instructionText.length
            + INQUIRY_ROLE_TEMPLATE_GUARDRAIL.length
        );
        const inquiryOutputContractTokens = estimateTokensFromChars(
            inquiryPromptParts.schemaText.length
            + buildOutputRulesText({
                returnType: 'json',
                responseSchema: buildInquiryJsonSchema()
            }).length
        );
        const inquiryCorpusTokens = currentCorpus?.corpus.estimatedTokens ?? 0;
        const inquiryProviderTokens = currentCorpus && engine
            ? (await buildCurrentInquiryExecutionEstimate({
                provider: engine.provider,
                modelId: engine.modelId,
                questionText: 'Analyze corpus-level flow and depth quality.'
            }))?.estimatedTokens ?? inquiryCorpusTokens
            : inquiryCorpusTokens;

        const sceneData = await plugin.getSceneData();
        const selectedBeatModel = resolveSelectedBeatModelFromSettings(plugin.settings);
        const beatOrder = extractBeatOrder(
            sceneData as Array<{ itemType?: string; subplot?: string; title?: string; "Beat Model"?: string }>,
            selectedBeatModel
        );
        const gossamerEstimate = await estimateGossamerTokens({
            plugin,
            vault: app.vault,
            metadataCache: app.metadataCache,
            frontmatterMappings: plugin.settings.frontmatterMappings,
            provider: engine?.provider,
            modelId: engine?.modelId,
            beatSystem: selectedBeatModel || 'Save The Cat',
            beats: beatOrder.map((beatName, index) => ({
                beatName,
                beatNumber: index + 1,
                idealRange: '0-100'
            }))
        });
        const { files: gossamerSceneFiles } = await getSortedSceneFiles(plugin);
        const gossamerPromptParts = beatOrder.length > 0
            ? buildUnifiedBeatAnalysisPromptParts(
                '',
                beatOrder.map((beatName, index) => ({
                    beatName,
                    beatNumber: index + 1,
                    idealRange: '0-100'
                })),
                selectedBeatModel || 'Save The Cat'
            )
            : { transformText: '', instructionText: '', prompt: '' };
        const gossamerInstructionTokens = estimateTokensFromChars(gossamerPromptParts.instructionText.length);
        const gossamerTransformTokens = estimateTokensFromChars(gossamerPromptParts.transformText.length);
        const gossamerOutputContractTokens = estimateTokensFromChars(
            buildOutputRulesText({
                returnType: 'json',
                responseSchema: getUnifiedBeatAnalysisJsonSchema() as unknown as Record<string, unknown>
            }).length
        );
        const gossamerDisplayCorpus = await buildDisplayCorpusEstimateFromManifestEntries(
            gossamerSceneFiles.map(file => ({
                path: file.path,
                mtime: file.stat?.mtime ?? Date.now(),
                class: 'scene',
                mode: 'full',
                isTarget: false
            }))
        );
        const gossamerCorpusTokens = gossamerDisplayCorpus.estimatedTokens;
        const gossamerProviderTokens = gossamerEstimate.providerExecutionEstimate.estimatedTokens;
        const inquiryPromptBreakdown: PromptRequestBreakdown = {
            roleTemplateTokens,
            instructionTokens: inquiryInstructionTokens,
            outputContractTokens: inquiryOutputContractTokens,
            transformTokens: 0
        };
        const gossamerPromptBreakdown: PromptRequestBreakdown = {
            roleTemplateTokens,
            instructionTokens: gossamerInstructionTokens,
            outputContractTokens: gossamerOutputContractTokens,
            transformTokens: gossamerTransformTokens
        };

        return {
            inquiry: {
                available: Boolean(currentCorpus),
                corpusTokens: inquiryCorpusTokens,
                providerExecutionTokens: inquiryProviderTokens,
                totalEstimatedTokens: sumTokenParts(
                    inquiryCorpusTokens,
                    inquiryPromptBreakdown.roleTemplateTokens,
                    inquiryPromptBreakdown.instructionTokens,
                    inquiryPromptBreakdown.outputContractTokens,
                    inquiryPromptBreakdown.transformTokens
                ) ?? inquiryCorpusTokens,
                sceneCount: currentCorpus?.corpus.sceneCount ?? 0,
                outlineCount: currentCorpus?.corpus.outlineCount ?? 0,
                referenceCount: currentCorpus?.corpus.referenceCount ?? 0,
                breakdown: currentCorpus?.corpus.breakdown ?? {
                    scenesTokens: 0,
                    outlineTokens: 0,
                    referenceTokens: 0
                },
                promptBreakdown: inquiryPromptBreakdown
            },
            gossamer: {
                available: true,
                corpusTokens: gossamerCorpusTokens,
                providerExecutionTokens: gossamerProviderTokens,
                totalEstimatedTokens: sumTokenParts(
                    gossamerCorpusTokens,
                    gossamerPromptBreakdown.roleTemplateTokens,
                    gossamerPromptBreakdown.instructionTokens,
                    gossamerPromptBreakdown.outputContractTokens,
                    gossamerPromptBreakdown.transformTokens
                ) ?? gossamerCorpusTokens,
                sceneCount: gossamerDisplayCorpus.sceneCount,
                outlineCount: gossamerDisplayCorpus.outlineCount,
                referenceCount: gossamerDisplayCorpus.referenceCount,
                breakdown: gossamerDisplayCorpus.breakdown,
                promptBreakdown: gossamerPromptBreakdown
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

        const isOllama = provider === 'ollama';

        isSyncingRoutingUi = true;
        try {
            setDropdownValueSafe(providerDropdown, provider, 'openai');

            if (modelOverrideDropdown) {
                modelOverrideDropdown.selectEl.empty();
                if (isOllama) {
                    modelOverrideDropdown.selectEl.disabled = false;
                    const localModelOptions = getLocalStrategyModelOptions();
                    localModelOptions.forEach(option => {
                        modelOverrideDropdown?.addOption(option.value, option.label);
                    });
                    const fallbackLocalModel = localModelOptions[0]?.value;
                    setDropdownValueSafe(modelOverrideDropdown, getOllamaModelId().trim(), fallbackLocalModel);
                } else {
                    modelOverrideDropdown.selectEl.disabled = false;
                    modelOverrideDropdown.addOption('auto', 'Auto');
                    getProviderPickerModels(provider).forEach(model => {
                        modelOverrideDropdown?.addOption(model.alias, model.label);
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
                if (isOllama) {
                    accessTierDropdown.selectEl.empty();
                    accessTierDropdown.addOption('auto', 'Auto');
                    accessTierDropdown.addOption('custom', 'Custom');
                    accessTierDropdown.selectEl.disabled = false;
                    setDropdownValueSafe(accessTierDropdown, getLocalLlmConfigurationMode(), 'auto');
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
        } finally {
            isSyncingRoutingUi = false;
        }
        updateExecutionPreferenceNote();

        providerSetting.settingEl.toggleClass('ert-settings-hidden', false);
        providerSetting.settingEl.toggleClass('ert-settings-visible', true);
        // Model and Access Tier stay visible but show "—" when Local LLM is active.
        modelOverrideSetting.settingEl.toggleClass('ert-settings-hidden', false);
        modelOverrideSetting.settingEl.toggleClass('ert-settings-visible', true);
        accessTierSetting.settingEl.toggleClass('ert-settings-hidden', false);
        accessTierSetting.settingEl.toggleClass('ert-settings-visible', true);

        const modelStrategyDesc = modelOverrideSetting.settingEl.querySelector('.ert-ai-strategy-row__desc');
        if (modelStrategyDesc instanceof HTMLElement) {
            modelStrategyDesc.textContent = isOllama ? LOCAL_MODEL_STRATEGY_COPY : 'Use Auto for deterministic latest-stable selection, or pin a specific model.';
        }
        const accessTierDesc = accessTierSetting.settingEl.querySelector('.ert-ai-strategy-row__desc');
        if (accessTierDesc instanceof HTMLElement) {
            accessTierDesc.textContent = isOllama ? LOCAL_OVERRIDE_COPY : ACCESS_TIER_COPY;
        }
        const accessTierName = accessTierSetting.settingEl.querySelector('.setting-item-name');
        if (accessTierName instanceof HTMLElement) {
            accessTierName.textContent = isOllama ? 'Setup' : 'Access';
        }

        if (!isOllama) {
            const supportsAccessTier = provider === 'anthropic' || provider === 'openai' || provider === 'google';
            if (supportsAccessTier) {
                accessTierDropdown?.setValue(String(getAccessTier(provider)));
            } else {
                accessTierDropdown?.setValue('1');
            }
        }

        apiKeysFold.toggleClass('ert-settings-hidden', isOllama);
        apiKeysFold.toggleClass('ert-settings-visible', !isOllama);

        const showLocalLlmStatusDetails = isOllama;
        const showLocalLlmConfigDetails = isOllama && (
            getLocalLlmConfigurationMode() === 'custom'
            || shouldRevealLocalLlmTransportSettings()
            || hasLocalLlmSelectedModelMismatch()
        );

        if (localLlmConfigSectionEl) {
            localLlmConfigSectionEl.toggleClass('ert-settings-hidden', !showLocalLlmConfigDetails);
            localLlmConfigSectionEl.toggleClass('ert-settings-visible', showLocalLlmConfigDetails);
        }
        if (localLlmStatusSectionEl) {
            localLlmStatusSectionEl.toggleClass('ert-settings-hidden', !showLocalLlmStatusDetails);
            localLlmStatusSectionEl.toggleClass('ert-settings-visible', showLocalLlmStatusDetails);
        }
        largeHandlingSection.toggleClass('ert-settings-hidden', isOllama);
        largeHandlingSection.toggleClass('ert-settings-visible', !isOllama);

        capacityInquiryToken.setText('Calculating...');
        capacityInquiryExpected.setText('Calculating...');
        renderCapacitySections(capacityInquirySections, buildInquiryCapacitySections());
        capacityGossamerToken.setText('Calculating...');
        capacityGossamerExpected.setText('Calculating...');
        renderCapacitySections(capacityGossamerSections, buildGossamerCapacitySections(0));
        void refreshCostComparisonTable();

        if (isOllama) {
            if (localLlmServerDetectionPending || localLlmModelLoadPending) {
                renderLocalPreviewUnavailable('Checking Local Server...', 'Looking for a reachable local server and available models.');
                setActiveCostComparisonRow(null, null);
                return;
            }
            if (!localLlmDetectedServers.length) {
                renderLocalPreviewUnavailable('No Local Server Detected', 'Start a local server or switch Setup to Custom.');
                setActiveCostComparisonRow(null, null);
                return;
            }
        }

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
            const registryModels = await getAIClient(plugin).getRegistryModels();
            const latestResolution = resolveDisplayModelForLatestAlias(registryModels, estimate.model);
            const displayModel = latestResolution.displayModel;
            const safeBudgetTokens = Math.max(0, Math.floor(estimate.effectiveInputCeiling));
            const formatExpectedPasses = (providerExecutionTokens: number): string => {
                if (providerExecutionTokens <= 0 || safeBudgetTokens <= 0) return 'Expected structured passes · n/a';
                const passes = providerExecutionTokens <= safeBudgetTokens
                    ? 1
                    : Math.max(2, Math.ceil(providerExecutionTokens / safeBudgetTokens));
                return `Expected structured passes · ${passes}`;
            };
            const formatProviderInput = (providerExecutionTokens: number): string => {
                if (providerExecutionTokens <= 0) return 'Estimated provider input · unavailable';
                return `Estimated provider input · ${formatCorpusBreakdownToken(providerExecutionTokens)}`;
            };
            const previewState: ResolvedPreviewRenderState = {
                provider,
                modelId: latestResolution.resolvedModelId ?? '',
                modelLabel: displayModel.label,
                modelAlias: estimate.model.alias,
                idPending: latestResolution.isPending,
                contextWindow: estimate.model.contextWindow,
                maxInputTokens: estimate.maxInputTokens,
                maxOutputTokens: estimate.maxOutputTokens,
                citationLabel: resolvePreviewCitationSignal(estimate.model),
                reuseLabel: resolvePreviewReuseSignal(estimate.model),
                passBehaviorLabel: null,
                isPreview: estimate.model.status === 'preview'
            };
            const currentCorpus = getCurrentCorpusContext();
            if (currentCorpus) {
                try {
                    const executionEstimate = await buildCurrentInquiryExecutionEstimate({
                        provider,
                        modelId: estimate.model.id,
                        questionText: INQUIRY_CANONICAL_ESTIMATE_QUESTION
                    });
                    if (executionEstimate && executionEstimate.estimatedTokens > 0) {
                        const passes = executionEstimate.expectedPassCount ?? 1;
                        previewState.passBehaviorLabel = passes <= 1
                            ? 'Context · Single-pass at this corpus'
                            : `Context · ${passes}-pass likely at this corpus`;
                    }
                } catch {
                    // Leave pass behavior unset when the current corpus estimate is unavailable.
                }
            }
            renderResolvedPreview(previewState);
            setActiveCostComparisonRow(provider, displayModel.id);
            void computeVaultForecasts({
                provider,
                modelId: estimate.model.id
            }).then(forecasts => {
                if (forecasts.inquiry.available) {
                    setTokenDisplay(capacityInquiryToken, formatCorpusBreakdownToken(forecasts.inquiry.totalEstimatedTokens), 'tokens');
                    capacityInquiryExpected.setText(formatExpectedPasses(forecasts.inquiry.providerExecutionTokens));
                    capacityInquiryProvider.setText(formatProviderInput(forecasts.inquiry.providerExecutionTokens));
                    renderCapacitySections(capacityInquirySections, buildInquiryCapacitySections({
                        sceneCount: forecasts.inquiry.sceneCount,
                        outlineCount: forecasts.inquiry.outlineCount,
                        referenceCount: forecasts.inquiry.referenceCount,
                        breakdown: forecasts.inquiry.breakdown,
                        promptBreakdown: forecasts.inquiry.promptBreakdown
                    }));
                } else {
                    capacityInquiryToken.setText('Unavailable');
                    capacityInquiryExpected.setText('Unavailable');
                    capacityInquiryProvider.setText('Unavailable');
                    renderCapacitySections(capacityInquirySections, buildInquiryCapacitySections());
                }

                setTokenDisplay(capacityGossamerToken, formatCorpusBreakdownToken(forecasts.gossamer.totalEstimatedTokens), 'tokens');
                capacityGossamerExpected.setText(formatExpectedPasses(forecasts.gossamer.providerExecutionTokens));
                capacityGossamerProvider.setText(formatProviderInput(forecasts.gossamer.providerExecutionTokens));
                renderCapacitySections(
                    capacityGossamerSections,
                    buildGossamerCapacitySections(
                        forecasts.gossamer.sceneCount,
                        forecasts.gossamer.breakdown,
                        forecasts.gossamer.promptBreakdown
                    )
                );
            });
        } catch {
            renderResolvedPreview({
                provider,
                modelId: '',
                modelLabel: 'No eligible model',
                modelAlias: providerLabel[provider],
                idPending: false,
                contextWindow: null,
                maxInputTokens: null,
                maxOutputTokens: null,
                citationLabel: null,
                reuseLabel: null,
                passBehaviorLabel: null,
                isPreview: false
            });
            setActiveCostComparisonRow(null, null);
            capacityInquiryToken.setText('Unavailable');
            capacityInquiryExpected.setText('Unavailable');
            capacityInquiryProvider.setText('Unavailable');
            renderCapacitySections(capacityInquirySections, buildInquiryCapacitySections());
            capacityGossamerToken.setText('Unavailable');
            capacityGossamerExpected.setText('Unavailable');
            capacityGossamerProvider.setText('Unavailable');
            renderCapacitySections(capacityGossamerSections, buildGossamerCapacitySections(0));
        }

    };

    // Provider sections
    const anthropicSection = configurationBody.createDiv({
        cls: ['ert-provider-section', 'ert-provider-anthropic', ERT_CLASSES.STACK]
    });
    const googleSection = configurationBody.createDiv({
        cls: ['ert-provider-section', 'ert-provider-google', ERT_CLASSES.STACK]
    });
    const openaiSection = configurationBody.createDiv({
        cls: ['ert-provider-section', 'ert-provider-openai', ERT_CLASSES.STACK]
    });
    params.setProviderSections({ anthropic: anthropicSection, google: googleSection, openai: openaiSection });
    params.addAiRelatedElement(anthropicSection);
    params.addAiRelatedElement(googleSection);
    params.addAiRelatedElement(openaiSection);

    const secretStorageAvailable = isSecretStorageAvailable(app);

    if (!secretStorageAvailable) {
        const warningSetting = new Settings(configurationBody)
            .setName(t('settings.ai.secureKey.unavailableName'))
            .setDesc(t('settings.ai.secureKey.unavailableDesc'));
        params.addAiRelatedElement(warningSetting.settingEl);
    }

    if (secretStorageAvailable && needsLegacyKeyMigration(plugin)) {
        const migrateKeysSetting = new Settings(configurationBody)
            .setName(t('settings.ai.secureKey.migrateName'))
            .setDesc(t('settings.ai.secureKey.migrateDesc'));
        migrateKeysSetting.addButton(button => button
            .setButtonText(t('settings.ai.secureKey.migrateButton'))
            .onClick(async () => {
                button.setDisabled(true);
                try {
                    const migration = await migrateLegacyKeysToSecretStorage(plugin);
                    if (migration.migratedProviders.length) {
                        new Notice(`Secured ${migration.migratedProviders.length} provider key(s).`);
                    } else {
                        new Notice(t('settings.ai.secureKey.noLegacyKeysNotice'));
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

    type ProviderKeyUiState = 'ready' | 'not_configured' | 'rejected' | 'network_blocked' | 'checking';
    const configureSensitiveInput = (inputEl: HTMLInputElement): void => {
        inputEl.type = 'password';
        inputEl.autocomplete = 'new-password';
        inputEl.spellcheck = false;
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
                else if (provider === 'google') await fetchGoogleModels(key);
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
        providerName: string;
        keyPlaceholder: string;
        docsUrl: string;
    }): void => {
        const providerDesc = document.createDocumentFragment();
        const span = document.createElement('span');
        span.textContent = `Choose a name to store your ${options.providerName} API key in this vault's secret storage. `;
        const link = document.createElement('a');
        link.href = options.docsUrl;
        link.textContent = 'Get key';
        link.target = '_blank';
        link.rel = 'noopener';
        providerDesc.appendChild(span);
        providerDesc.appendChild(link);
        providerDesc.appendChild(document.createTextNode(' Use a short name like "openai-main" so you can reuse it later. Note: saved Obsidian Secret Keys (distinct from Provider API keys) can only be used across the plugins you have installed in the same vault.'));

        const secretIdSetting = new Settings(options.section)
            .setName(`Vault secret name (${options.providerName})`)
            .setDesc(providerDesc);
        const keyStatusSetting = new Settings(options.section)
            .setName(`${options.providerName} API key status`)
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
            providerKeyStates[options.provider] = next;
            refreshDropdownKeyIndicators();
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
                text.setText(t('settings.ai.credential.statusReady'));
            } else if (next === 'rejected') {
                providerStateDetail = '';
                text.setText(t('settings.ai.credential.statusRejected'));
            } else if (next === 'network_blocked') {
                text.setText(t('settings.ai.credential.statusNetworkBlocked'));
            } else if (next === 'checking') {
                providerStateDetail = '';
                text.setText(t('settings.ai.credential.statusChecking'));
            } else {
                providerStateDetail = '';
                text.setText(t('settings.ai.credential.statusNotConfigured'));
            }
            desc.appendChild(stateBlock);

            const helper = body.createSpan({ cls: 'ert-ai-provider-key-state__helper' });
            if (next === 'not_configured') {
                helper.textContent = t('settings.ai.credential.helperNotConfigured');
            } else if (next === 'rejected') {
                helper.textContent = t('settings.ai.credential.helperRejected');
            } else if (next === 'network_blocked') {
                helper.textContent = providerStateDetail || t('settings.ai.credential.helperNetworkBlocked');
            } else if (next === 'checking') {
                helper.textContent = t('settings.ai.credential.helperChecking');
            }
            if (!helper.textContent) helper.remove();

            if ((next === 'ready' || next === 'network_blocked') && secretStorageAvailable) {
                const actions = body.createSpan({ cls: 'ert-ai-provider-key-actions' });

                const replaceBtn = document.createElement('button');
                replaceBtn.className = 'ert-ai-provider-key-action';
                replaceBtn.type = 'button';
                replaceBtn.textContent = t('settings.ai.credential.replaceKeyButton');
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
                    copyBtn.textContent = t('settings.ai.credential.copyKeyNameButton');
                    copyBtn.addEventListener('click', () => {
                        revealSecretName = true;
                        setProviderState(providerState);
                        secretIdSetting.settingEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                        void navigator.clipboard.writeText(secretId)
                            .then(() => new Notice(t('settings.ai.credential.keyNameCopiedNotice')))
                            .catch(() => new Notice(t('settings.ai.credential.keyNameCopyFailNotice')));
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
            replaceRequested = false;
            revealSecretName = false;
            setProviderState('not_configured');
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
                params.setKeyInputRef(options.provider, text.inputEl);

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
            options.section.createDiv({
                cls: 'ert-field-note',
                text: `${options.providerName} requires Obsidian secret storage. Older plaintext key fields are no longer supported.`
            });
        }
    };

    renderCredentialSettings({
        section: anthropicSection,
        provider: 'anthropic',
        providerName: PROVIDER_DISPLAY_LABELS.anthropic,
        keyPlaceholder: t('settings.ai.credential.placeholderAnthropic'),
        docsUrl: 'https://platform.claude.com'
    });
    renderCredentialSettings({
        section: googleSection,
        provider: 'google',
        providerName: PROVIDER_DISPLAY_LABELS.google,
        keyPlaceholder: t('settings.ai.credential.placeholderGoogle'),
        docsUrl: 'https://aistudio.google.com'
    });
    renderCredentialSettings({
        section: openaiSection,
        provider: 'openai',
        providerName: PROVIDER_DISPLAY_LABELS.openai,
        keyPlaceholder: t('settings.ai.credential.placeholderOpenai'),
        docsUrl: 'https://platform.openai.com'
    });

    params.setProviderSections({ anthropic: anthropicSection, google: googleSection, openai: openaiSection });

    let localLlmModelText: TextComponent | null = null;
    let localLlmServerDropdown: DropdownComponent | null = null;
    let localLlmLoadedModels: LocalLlmModelEntry[] = [];
    let localLlmDetectedServers: DetectedLocalServer[] = [];
    let localLlmServerDetectionError: string | null = null;
    let localLlmServerDetectionPending = false;
    let localLlmServerDetectionPromise: Promise<void> | null = null;
    let localLlmModelLoadError: string | null = null;
    let localLlmLastLoadedAt: string | null = null;
    let localLlmModelLoadPending = false;
    let localLlmModelLoadPromise: Promise<void> | null = null;
    let localLlmValidationReport: LocalLlmDiagnosticsReport | null = null;
    let localLlmValidationError: string | null = null;
    let localLlmLastValidatedAt: string | null = null;
    let localLlmValidationPending = false;
    let localLlmValidationPromise: Promise<void> | null = null;
    let localLlmAutoValidationTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

    const getDetectedLocalServerCandidates = (): Array<{ backend: LocalLlmBackendId; baseUrl: string; label: string }> => {
        const configured = getLocalLlmSettings(ensureCanonicalAiSettings());
        const candidates: Array<{ backend: LocalLlmBackendId; baseUrl: string; label: string }> = [
            { backend: 'ollama', baseUrl: 'http://localhost:11434/v1', label: buildLocalServerOptionLabel('ollama', 'http://localhost:11434/v1') },
            { backend: 'lmStudio', baseUrl: 'http://localhost:1234/v1', label: buildLocalServerOptionLabel('lmStudio', 'http://localhost:1234/v1') }
        ];
        if (configured.baseUrl.trim()) {
            candidates.push({
                backend: configured.backend,
                baseUrl: configured.baseUrl.trim(),
                label: buildLocalServerOptionLabel(configured.backend, configured.baseUrl)
            });
        }
        const seen = new Set<string>();
        return candidates.filter(candidate => {
            const serverKey = buildLocalLlmServerKey(candidate.backend, candidate.baseUrl);
            if (seen.has(serverKey)) return false;
            seen.add(serverKey);
            return true;
        });
    };
    const getDetectedLocalServerByKey = (serverKey: string): DetectedLocalServer | null =>
        localLlmDetectedServers.find(server => server.serverKey === serverKey) ?? null;

    const hasLocalLlmSelectedModelMismatch = (): boolean => {
        const selectedModelId = getOllamaModelId().trim();
        if (!selectedModelId || !localLlmLoadedModels.length) return false;
        const selectedModelKey = buildLocalLlmModelIdentity(getLocalLlmBackendId(), getOllamaBaseUrl(), selectedModelId);
        return !localLlmLoadedModels.some(model => buildLocalLlmModelIdentity(getLocalLlmBackendId(), getOllamaBaseUrl(), model.id) === selectedModelKey);
    };

    const hasLocalLlmValidationFailure = (): boolean => {
        if (localLlmModelLoadError || localLlmValidationError) return true;
        if (!localLlmValidationReport) return false;
        return !localLlmValidationReport.reachable.ok
            || !localLlmValidationReport.modelAvailable.ok
            || !localLlmValidationReport.basicCompletion.ok
            || !localLlmValidationReport.structuredJson.ok
            || !localLlmValidationReport.repairPath.ok;
    };

    const shouldRevealLocalLlmOverrideSettings = (): boolean =>
        getLocalLlmConfigurationMode() === 'custom' || hasLocalLlmValidationFailure() || hasLocalLlmSelectedModelMismatch();

    const shouldRevealLocalLlmTransportSettings = (): boolean => {
        if (getLocalLlmConfigurationMode() === 'custom') return true;
        if (!localLlmServerDetectionPending && !localLlmDetectedServers.length) return true;
        if (localLlmModelLoadError || localLlmValidationError) return true;
        if (!localLlmValidationReport) return false;
        return !localLlmValidationReport.reachable.ok;
    };
    const shouldRevealLocalLlmActionRow = (): boolean => {
        if (getLocalLlmConfigurationMode() === 'custom') return true;
        if (!localLlmDetectedServers.length) return true;
        if (localLlmModelLoadError || localLlmValidationError) return true;
        if (!localLlmLoadedModels.length) return true;
        if (hasLocalLlmSelectedModelMismatch()) return true;
        if (!localLlmValidationReport) return false;
        return !localLlmValidationReport.reachable.ok
            || !localLlmValidationReport.modelAvailable.ok
            || !localLlmValidationReport.basicCompletion.ok
            || !localLlmValidationReport.structuredJson.ok
            || !localLlmValidationReport.repairPath.ok;
    };
    const getLocalCapabilityAssessment = (
        modelId: string,
        liveEntry?: Partial<LocalLlmModelEntry> | null
    ): LocalLlmCapabilityAssessment => {
        const canonical = BUILTIN_MODELS.find(model =>
            model.provider === 'ollama' && (model.id === modelId || model.alias === modelId)
        );
        const diagnostics = localLlmValidationReport?.modelId === modelId
            ? localLlmValidationReport
            : null;
        return inferLocalLlmCapability({
            modelId,
            contextWindow: liveEntry?.contextWindow ?? canonical?.contextWindow ?? null,
            maxOutput: liveEntry?.maxOutput ?? canonical?.maxOutput ?? null,
            diagnostics
        });
    };

    const localLlmConfigSection = quickSetupPreviewSection.createDiv({
        cls: [`${ERT_CLASSES.CARD}`, `${ERT_CLASSES.PANEL}`, `${ERT_CLASSES.STACK}`, 'ert-ai-local-llm-config', 'ert-settings-hidden']
    });
    localLlmConfigSectionEl = localLlmConfigSection;
    localLlmConfigSection.createDiv({ cls: 'ert-section-title', text: t('settings.ai.localLlm.configTitle') });
    localLlmConfigSection.createDiv({
        cls: 'ert-section-desc',
        text: t('settings.ai.localLlm.configDesc')
    });

    const localLlmStatusSection = quickSetupPreviewSection.createDiv({
        cls: [`${ERT_CLASSES.CARD}`, `${ERT_CLASSES.PANEL}`, `${ERT_CLASSES.STACK}`, 'ert-ai-local-llm-status', 'ert-settings-hidden']
    });
    localLlmStatusSectionEl = localLlmStatusSection;
    localLlmStatusSection.createDiv({ cls: 'ert-section-title', text: t('settings.ai.localLlm.statusTitle') });
    localLlmStatusSection.createDiv({
        cls: 'ert-section-desc',
        text: t('settings.ai.localLlm.statusDesc')
    });
    const localLlmServerSetting = new Settings(localLlmStatusSection)
        .setName(t('settings.ai.localLlm.serverName'))
        .setDesc(t('settings.ai.localLlm.serverDesc'))
        .addDropdown(dropdown => {
            localLlmServerDropdown = dropdown;
            dropdown.onChange((value) => {
                const server = getDetectedLocalServerByKey(value);
                if (!server) return;
                void (async () => {
                    setLocalServerSelection(server.backend, server.baseUrl);
                    localLlmLoadedModels = [...server.models].sort((left, right) => left.id.localeCompare(right.id));
                    localLlmLastLoadedAt = server.detectedAt;
                    clearLocalLlmValidationState();
                    await persistCanonical();
                    renderLocalLlmModelList();
                    renderLocalLlmStatus();
                    queueLocalLlmAutoValidation();
                    void refreshRoutingUi();
                })();
            });
        });
    localLlmServerSetting.settingEl.addClass(ERT_CLASSES.ROW, 'ert-settings-hidden');
    const localLlmStatusGrid = localLlmStatusSection.createDiv({ cls: 'ert-ai-local-llm-status-grid' });
    const localLlmStatusConnection = localLlmStatusGrid.createDiv({ cls: `${ERT_CLASSES.STACK_TIGHT} ert-ai-local-llm-status-column` });
    const localLlmStatusModel = localLlmStatusGrid.createDiv({ cls: `${ERT_CLASSES.STACK_TIGHT} ert-ai-local-llm-status-column` });
    const localLlmStatusChecks = localLlmStatusGrid.createDiv({ cls: `${ERT_CLASSES.STACK_TIGHT} ert-ai-local-llm-status-column` });
    const localLlmModelsSummary = localLlmStatusSection.createDiv({ cls: 'ert-field-note ert-ai-local-llm-model-summary' });
    const localLlmModelsList = localLlmStatusSection.createDiv({ cls: `${ERT_CLASSES.INLINE} ert-ai-local-llm-model-list` });
    const localLlmModelsLegend = localLlmStatusSection.createDiv({ cls: 'ert-field-note ert-ai-local-llm-model-legend' });
    const localLlmStatusTimestamp = localLlmStatusSection.createDiv({ cls: 'ert-field-note ert-ai-local-llm-status-timestamp' });
    const localLlmActionsRow = localLlmStatusSection.createDiv({
        cls: `${ERT_CLASSES.STACK_TIGHT} ert-card-subtle ert-ai-local-llm-actions-row ert-settings-hidden`
    });

    function clearLocalLlmModelLoadState(): void {
        localLlmLoadedModels = [];
        localLlmModelLoadError = null;
        localLlmLastLoadedAt = null;
    }

    function clearLocalLlmDetectedServerState(): void {
        localLlmDetectedServers = [];
        localLlmServerDetectionError = null;
    }

    function clearLocalLlmValidationState(): void {
        localLlmValidationReport = null;
        localLlmValidationError = null;
        localLlmLastValidatedAt = null;
    }

    function markLocalLlmConfigurationDirty(): void {
        clearLocalLlmDetectedServerState();
        clearLocalLlmModelLoadState();
        clearLocalLlmValidationState();
        renderLocalLlmModelList();
        renderLocalLlmStatus();
    }

    async function detectLocalLlmServers(options: { quiet?: boolean } = {}): Promise<void> {
        if (localLlmServerDetectionPromise) return localLlmServerDetectionPromise;
        localLlmServerDetectionPending = true;
        localLlmServerDetectionError = null;
        renderLocalLlmModelList();
        renderLocalLlmStatus();
        localLlmServerDetectionPromise = (async () => {
            const candidates = getDetectedLocalServerCandidates();
            const settled = await Promise.allSettled(candidates.map(async candidate => {
                const models = await getLocalLlmClient(plugin).listModels({
                    backend: candidate.backend,
                    baseUrl: candidate.baseUrl,
                    timeoutMs: getLocalLlmUiTimeoutMs()
                });
                if (!models.length) {
                    throw new Error('No models reported by this local server.');
                }
                return {
                    serverKey: buildLocalLlmServerKey(candidate.backend, candidate.baseUrl),
                    label: candidate.label,
                    backend: candidate.backend,
                    baseUrl: normalizeLocalLlmServerBaseUrl(candidate.baseUrl),
                    models: [...models].sort((left, right) => left.id.localeCompare(right.id)),
                    detectedAt: new Date().toISOString()
                } satisfies DetectedLocalServer;
            }));
            localLlmDetectedServers = settled
                .flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
            localLlmServerDetectionError = localLlmDetectedServers.length
                ? null
                : 'No healthy local servers were detected automatically.';

            if (!localLlmDetectedServers.length) {
                clearLocalLlmModelLoadState();
                clearLocalLlmValidationState();
            }

            if (getLocalLlmConfigurationMode() === 'auto') {
                const configuredServerKey = getConfiguredLocalServerKey();
                const selectedServer = localLlmDetectedServers.length === 1
                    ? localLlmDetectedServers[0]
                    : (getDetectedLocalServerByKey(configuredServerKey) ?? localLlmDetectedServers[0] ?? null);
                if (selectedServer) {
                    const current = getLocalLlmSettings(ensureCanonicalAiSettings());
                    const serverChanged = current.backend !== selectedServer.backend
                        || buildLocalLlmServerKey(current.backend, current.baseUrl) !== selectedServer.serverKey;
                    localLlmLoadedModels = [...selectedServer.models];
                    localLlmModelLoadError = null;
                    localLlmLastLoadedAt = selectedServer.detectedAt;
                    if (serverChanged) {
                        setLocalServerSelection(selectedServer.backend, selectedServer.baseUrl);
                        await persistCanonical();
                    }
                }
            }

            if (!options.quiet) {
                new Notice(
                    localLlmDetectedServers.length
                        ? `Detected ${localLlmDetectedServers.length} healthy local server${localLlmDetectedServers.length === 1 ? '' : 's'}.`
                        : 'No healthy local servers detected automatically.'
                );
            }
        })().finally(() => {
            localLlmServerDetectionPending = false;
            localLlmServerDetectionPromise = null;
            renderLocalLlmModelList();
            renderLocalLlmStatus();
            void refreshRoutingUi();
        });
        return localLlmServerDetectionPromise;
    }

    function queueLocalLlmAutoValidation(): void {
        const aiSettings = ensureCanonicalAiSettings();
        if (aiSettings.provider !== 'ollama' || !getLocalLlmSettings(aiSettings).enabled) return;
        if (localLlmAutoValidationTimer !== null) {
            globalThis.clearTimeout(localLlmAutoValidationTimer);
        }
        localLlmAutoValidationTimer = globalThis.setTimeout(() => {
            localLlmAutoValidationTimer = null;
            if (ensureCanonicalAiSettings().provider !== 'ollama') return;
            void detectLocalLlmServers({ quiet: true }).then(() => validateLocalLlm({ quiet: true }));
        }, 150);
    }

    const localLlmBackendSetting = new Settings(localLlmConfigSection)
        .setName(t('settings.ai.localLlmConfig.serverName'))
        .setDesc(t('settings.ai.localLlmConfig.serverDesc'))
        .addDropdown(dropdown => {
            dropdown
                .addOption('ollama', t('settings.ai.localLlmConfig.optionOllama'))
                .addOption('lmStudio', t('settings.ai.localLlmConfig.optionLmStudio'))
                .addOption('openaiCompatible', t('settings.ai.localLlmConfig.optionOpenaiCompat'))
                .setValue(getLocalLlmBackendId())
                .onChange(async (value) => {
                    const aiSettings = ensureCanonicalAiSettings();
                    aiSettings.localLlm = {
                        ...getLocalLlmSettings(aiSettings),
                        backend: value as LocalLlmBackendId
                    };
                    markLocalLlmConfigurationDirty();
                    await persistCanonical();
                    params.scheduleKeyValidation('ollama');
                    queueLocalLlmAutoValidation();
                    void refreshRoutingUi();
                });
        });
    localLlmBackendSetting.settingEl.addClass(ERT_CLASSES.ROW);

    const localLlmBaseUrlSetting = new Settings(localLlmConfigSection)
        .setName(t('settings.ai.localLlmConfig.baseUrlName'))
        .setDesc(t('settings.ai.localLlmConfig.baseUrlDesc'))
        .addText(text => {
            text.inputEl.addClass('ert-input--full');
            text
                .setPlaceholder('http://localhost:11434/v1')
                .setValue(getOllamaBaseUrl());
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
            plugin.registerDomEvent(text.inputEl, 'blur', () => {
                void (async () => {
                    const aiSettings = ensureCanonicalAiSettings();
                    aiSettings.localLlm = {
                        ...getLocalLlmSettings(aiSettings),
                        baseUrl: text.getValue().trim() || 'http://localhost:11434/v1'
                    };
                    markLocalLlmConfigurationDirty();
                    await persistCanonical();
                    params.scheduleKeyValidation('ollama');
                    queueLocalLlmAutoValidation();
                })();
            });
            params.setOllamaConnectionInputs({ baseInput: text.inputEl });
        });
    localLlmBaseUrlSetting.settingEl.addClass('ert-setting-full-width-input');

    const localLlmModelSetting = new Settings(localLlmConfigSection)
        .setName(t('settings.ai.localLlmConfig.manualModelName'))
        .setDesc(t('settings.ai.localLlmConfig.manualModelDesc'))
        .addText(text => {
            text.inputEl.addClass('ert-input--lg');
            localLlmModelText = text;
            text
                .setPlaceholder('llama3')
                .setValue(getOllamaModelId());
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
            plugin.registerDomEvent(text.inputEl, 'blur', () => {
                void (async () => {
                    setOllamaModelId(text.getValue());
                    markLocalLlmConfigurationDirty();
                    await persistCanonical();
                    params.scheduleKeyValidation('ollama');
                    queueLocalLlmAutoValidation();
                    void refreshRoutingUi();
                })();
            });
            params.setOllamaConnectionInputs({ modelInput: text.inputEl });
        });
    localLlmModelSetting.settingEl.addClass(ERT_CLASSES.ROW);

    const formatLocalTimestamp = (iso: string | null): string | null => {
        if (!iso) return null;
        const parsed = new Date(iso);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    const renderLocalLlmModelList = (): void => {
        const selectedModelId = getOllamaModelId().trim();
        const selectedModelKey = buildLocalLlmModelIdentity(getLocalLlmBackendId(), getOllamaBaseUrl(), selectedModelId);
        const selectedExists = localLlmLoadedModels.some(model =>
            buildLocalLlmModelIdentity(getLocalLlmBackendId(), getOllamaBaseUrl(), model.id) === selectedModelKey
        );
        const showTransportSettings = shouldRevealLocalLlmTransportSettings();
        const showManualModelFallback = getLocalLlmConfigurationMode() === 'custom'
            || !!localLlmModelLoadError
            || (!!localLlmLastLoadedAt && !selectedExists);

        localLlmBackendSetting.settingEl.toggleClass('ert-settings-hidden', !showTransportSettings);
        localLlmBackendSetting.settingEl.toggleClass('ert-settings-visible', showTransportSettings);
        localLlmBaseUrlSetting.settingEl.toggleClass('ert-settings-hidden', !showTransportSettings);
        localLlmBaseUrlSetting.settingEl.toggleClass('ert-settings-visible', showTransportSettings);

        localLlmModelSetting.settingEl.toggleClass('ert-settings-hidden', !showManualModelFallback);
        localLlmModelSetting.settingEl.toggleClass('ert-settings-visible', showManualModelFallback);

        localLlmModelsList.empty();
        localLlmModelsLegend.empty();
        if (localLlmModelLoadPending) {
            localLlmModelsSummary.setText(t('settings.ai.localLlm.modelsLoading'));
            return;
        }

        if (localLlmModelLoadError) {
            localLlmModelsSummary.setText(`Local model list unavailable. ${formatLocalLlmUiError(localLlmModelLoadError)}`);
            return;
        }

        if (!localLlmLoadedModels.length) {
            localLlmModelsSummary.setText(
                getLocalLlmConfigurationMode() === 'auto'
                    ? t('settings.ai.localLlm.noModelsAuto')
                    : t('settings.ai.localLlm.noModelsCustom')
            );
            return;
        }

        const loadStamp = formatLocalTimestamp(localLlmLastLoadedAt);
        const activeServerLabel = buildLocalServerOptionLabel(getLocalLlmBackendId(), getOllamaBaseUrl());
        localLlmModelsSummary.setText(
            `${activeServerLabel}: ${localLlmLoadedModels.length} model${localLlmLoadedModels.length === 1 ? '' : 's'} loaded. ${selectedExists ? 'Selected model found.' : 'Selected model missing from the loaded list.'}${loadStamp ? ` Last loaded ${loadStamp}.` : ''}`
        );
        localLlmModelsLegend.createSpan({ cls: 'ert-ai-local-llm-legend-chip ert-ai-local-llm-legend-chip--tier0', text: t('settings.ai.localLlm.legendNotUsable') });
        localLlmModelsLegend.createSpan({ text: ' · ' });
        localLlmModelsLegend.createSpan({ cls: 'ert-ai-local-llm-legend-chip ert-ai-local-llm-legend-chip--tier1', text: t('settings.ai.localLlm.legendLimited') });
        localLlmModelsLegend.createSpan({ text: ' · ' });
        localLlmModelsLegend.createSpan({ cls: 'ert-ai-local-llm-legend-chip ert-ai-local-llm-legend-chip--tier3', text: t('settings.ai.localLlm.legendStrong') });
        localLlmModelsLegend.createSpan({ text: ' · ' });
        localLlmModelsLegend.createSpan({ cls: 'ert-ai-local-llm-legend-chip ert-ai-local-llm-legend-chip--tier4', text: t('settings.ai.localLlm.legendInquiryEligible') });

        localLlmLoadedModels.forEach(model => {
            const pill = localLlmModelsList.createSpan({
                cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM} ert-ai-resolved-preview-pill ert-ai-local-model-pill`
            });
            const capability = getLocalCapabilityAssessment(model.id, model);
            pill.addClass(`ert-ai-local-model-pill--tier${capability.tier}`);
            const isActiveModel = model.id === selectedModelId;
            if (isActiveModel) {
                pill.addClass(ERT_CLASSES.IS_ACTIVE);
            }
            pill.createSpan({ cls: 'ert-ai-local-model-pill-label', text: model.id });
            if (isActiveModel) {
                pill.createSpan({ cls: 'ert-ai-local-model-pill-active', text: t('settings.ai.localLlm.modelActive') });
            }
            pill.setAttribute('role', 'button');
            pill.setAttribute('tabindex', '0');
            pill.setAttribute('aria-label', `Use local model ${model.id}. ${capability.tierName} ${capability.tierSummary}.`);
            setTooltip(pill, buildLocalCapabilityTooltip(capability), { placement: 'top' });
            const applyModel = async (): Promise<void> => {
                setOllamaModelId(model.id);
                if (localLlmModelText) localLlmModelText.setValue(model.id);
                clearLocalLlmValidationState();
                await persistCanonical();
                params.scheduleKeyValidation('ollama');
                renderLocalLlmModelList();
                renderLocalLlmStatus();
                queueLocalLlmAutoValidation();
                void refreshRoutingUi();
            };
            plugin.registerDomEvent(pill, 'click', () => { void applyModel(); });
            plugin.registerDomEvent(pill, 'keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    void applyModel();
                }
            });
        });
    };

    const formatLocalLlmUiError = (message: string | null | undefined): string => {
        const normalized = (message ?? '').trim();
        if (!normalized) return 'Unknown local server error.';
        if (/ERR_CONNECTION_REFUSED/i.test(normalized)) return 'Connection refused. The local server is not running.';
        if (/timed?\s*out/i.test(normalized)) return 'Timed out while contacting the local server.';
        if (/No models reported by this local server/i.test(normalized)) return 'A local server responded, but no models are loaded.';
        return normalized;
    };

    const buildLocalStatusValue = (): string => {
        const currentLocalLlm = getLocalLlmSettings(ensureCanonicalAiSettings());
        if (!currentLocalLlm.enabled) return 'Local LLM disabled';
        if (localLlmServerDetectionPending || localLlmModelLoadPending) return 'Checking local server';
        if (localLlmValidationPending) return 'Validating';
        if (!localLlmDetectedServers.length) return 'No local server detected';
        if (localLlmValidationError) return 'Needs review';
        if (localLlmValidationReport?.reachable.ok
            && localLlmValidationReport.modelAvailable.ok
            && localLlmValidationReport.basicCompletion.ok
            && localLlmValidationReport.structuredJson.ok) {
            return 'Connected & validated';
        }
        if (localLlmValidationReport?.reachable.ok) return 'Connected';
        if (localLlmValidationReport && !localLlmValidationReport.reachable.ok) return 'Local server offline';
        return 'Connected';
    };

    const buildLocalCheckValue = (
        label: 'Connection' | 'Model availability' | 'Basic validation' | 'Structured validation' | 'Repair validation',
        check: { ok: boolean; message: string } | null,
        selectedExists: boolean
    ): string => {
        const hasHealthyServer = localLlmDetectedServers.length > 0;
        if (localLlmValidationPending) {
            if (label === 'Connection') return 'Checking local server...';
            return 'Validation in progress.';
        }
        if (!hasHealthyServer) {
            if (label === 'Connection') return 'No local server detected.';
            if (label === 'Repair validation') return 'Available once a local server responds.';
            return 'Waiting for a local server.';
        }
        if (label === 'Model availability') {
            if (localLlmModelLoadPending) return 'Loading available models...';
            if (localLlmModelLoadError) return formatLocalLlmUiError(localLlmModelLoadError);
            if (!localLlmLoadedModels.length) return 'No models are loaded on this local server.';
            if (!getOllamaModelId().trim()) return 'Choose a local model.';
            return selectedExists ? 'Selected model is ready.' : 'Selected model is unavailable on this local server.';
        }
        if (!check) {
            if (label === 'Basic validation' || label === 'Structured validation') {
                return selectedExists ? 'Not checked yet.' : 'Waiting for an available model.';
            }
            return 'Not checked yet.';
        }
        if (label === 'Connection') {
            return check.ok ? 'Connected.' : formatLocalLlmUiError(check.message);
        }
        if (label === 'Repair validation' && !check.ok) {
            return 'Repair path needs review.';
        }
        if (!check.ok) {
            return formatLocalLlmUiError(check.message);
        }
        return 'Passed.';
    };

    const renderLocalLlmStatus = (): void => {
        const localLlm = getLocalLlmSettings(ensureCanonicalAiSettings());
        const selectedModelId = localLlm.defaultModelId.trim();
        const selectedExists = localLlmLoadedModels.some(model =>
            buildLocalLlmModelIdentity(localLlm.backend, localLlm.baseUrl, model.id)
                === buildLocalLlmModelIdentity(localLlm.backend, localLlm.baseUrl, selectedModelId)
        );
        const selectedCapability = getLocalCapabilityAssessment(selectedModelId, localLlmLoadedModels.find(model => model.id === selectedModelId) ?? null);
        const multipleDetectedServers = getLocalLlmConfigurationMode() === 'auto' && localLlmDetectedServers.length > 1;

        localLlmStatusConnection.empty();
        localLlmStatusModel.empty();
        localLlmStatusChecks.empty();
        if (localLlmServerDropdown) {
            localLlmServerDropdown.selectEl.empty();
            localLlmDetectedServers.forEach(server => {
                localLlmServerDropdown?.addOption(server.serverKey, server.label);
            });
            if (localLlmDetectedServers.length) {
                localLlmServerDropdown.setValue(getConfiguredLocalServerKey());
            }
        }
        localLlmServerSetting.settingEl.toggleClass('ert-settings-hidden', !multipleDetectedServers);
        localLlmServerSetting.settingEl.toggleClass('ert-settings-visible', multipleDetectedServers);

        const statusValue = buildLocalStatusValue();

        const connectionItems: Array<[string, string]> = [
            ['Status', statusValue],
            ['Local server', localLlmDetectedServers.length
                ? buildLocalServerOptionLabel(localLlm.backend, localLlm.baseUrl)
                : 'No local server detected'],
            ['Base URL', localLlm.baseUrl || 'Not set'],
            ['Last checked', localLlmValidationPending ? 'Validating...' : (formatLocalTimestamp(localLlmLastValidatedAt) || 'Not yet validated')]
        ];
        const modelItems: Array<[string, string]> = [
            ['Models loaded', localLlmModelLoadPending
                ? 'Checking backend'
                : localLlmModelLoadError
                    ? 'Unavailable'
                    : (localLlmLoadedModels.length > 0 ? String(localLlmLoadedModels.length) : 'Not loaded')],
            ['Selected model', localLlmModelLoadPending
                ? 'Checking availability'
                : selectedModelId
                    ? (selectedExists ? `${selectedModelId} ready` : `${selectedModelId} unavailable`)
                    : 'Not set'],
            ['Capability', `${selectedCapability.tierSummary} (${selectedCapability.tierName})${selectedCapability.confidence === 'heuristic' ? ' (heuristic)' : ''}`],
            ['Supports', buildLocalFeatureSummary(selectedCapability)],
            ['Confidence', 'Likely fit for Radial Timeline tasks. Final results still depend on corpus size and complexity.']
        ];

        const appendStatusItem = (container: HTMLElement, label: string, value: string): void => {
            const item = container.createDiv({ cls: 'ert-ai-local-llm-status-item' });
            item.createDiv({ cls: 'ert-ai-local-llm-status-label', text: label });
            item.createDiv({ cls: 'ert-ai-local-llm-status-value', text: value });
        };

        connectionItems.forEach(([label, value]) => appendStatusItem(localLlmStatusConnection, label, value));
        modelItems.forEach(([label, value]) => appendStatusItem(localLlmStatusModel, label, value));

        const checks: Array<[string, { ok: boolean; message: string } | null]> = [
            ['Connection', localLlmValidationReport?.reachable ?? null],
            ['Model availability', localLlmValidationReport?.modelAvailable ?? null],
            ['Basic validation', localLlmValidationReport?.basicCompletion ?? null],
            ['Structured validation', localLlmValidationReport?.structuredJson ?? null],
            ['Repair validation', localLlmValidationReport?.repairPath ?? null]
        ];
        checks.forEach(([label, check]) => {
            const value = buildLocalCheckValue(label as 'Connection' | 'Model availability' | 'Basic validation' | 'Structured validation' | 'Repair validation', check, selectedExists);
            appendStatusItem(localLlmStatusChecks, label, value);
        });

        if (localLlmValidationError) {
            appendStatusItem(localLlmStatusChecks, 'Validation', formatLocalLlmUiError(localLlmValidationError));
        }
        if (localLlmServerDetectionError) {
            appendStatusItem(localLlmStatusChecks, 'Server detection', 'No healthy local servers were detected automatically.');
        }
        localLlmStatusTimestamp.empty();
        const showActions = shouldRevealLocalLlmActionRow();
        localLlmActionsRow.toggleClass('ert-settings-hidden', !showActions);
        localLlmActionsRow.toggleClass('ert-settings-visible', showActions);
    };

    async function loadLocalLlmModels(options: { quiet?: boolean } = {}): Promise<void> {
        if (localLlmModelLoadPromise) return localLlmModelLoadPromise;
        localLlmModelLoadPending = true;
        localLlmModelLoadError = null;
        renderLocalLlmModelList();
        renderLocalLlmStatus();
        localLlmModelLoadPromise = (async () => {
            try {
                const detectedServer = getDetectedLocalServerByKey(getConfiguredLocalServerKey());
                if (detectedServer) {
                    localLlmLoadedModels = [...detectedServer.models];
                    localLlmModelLoadError = null;
                    localLlmLastLoadedAt = detectedServer.detectedAt;
                    if (!options.quiet) {
                        new Notice(`Loaded ${localLlmLoadedModels.length} local model${localLlmLoadedModels.length === 1 ? '' : 's'} from ${detectedServer.label}.`);
                    }
                    return;
                }
                const models = await getLocalLlmClient(plugin).listModels(getLocalLlmUiOverrides());
                localLlmLoadedModels = [...models].sort((left, right) => left.id.localeCompare(right.id));
                localLlmModelLoadError = null;
                localLlmLastLoadedAt = new Date().toISOString();
                if (!options.quiet) {
                    new Notice(localLlmLoadedModels.length
                        ? `Loaded ${localLlmLoadedModels.length} local model${localLlmLoadedModels.length === 1 ? '' : 's'}.`
                        : 'No models reported by the Local LLM backend.');
                }
            } catch (error) {
                localLlmLoadedModels = [];
                localLlmModelLoadError = error instanceof Error ? error.message : String(error);
                if (!options.quiet) {
                    new Notice(`Unable to load local models: ${localLlmModelLoadError}`);
                }
            } finally {
                localLlmModelLoadPending = false;
                localLlmModelLoadPromise = null;
                renderLocalLlmModelList();
                renderLocalLlmStatus();
                void refreshRoutingUi();
            }
        })();
        return localLlmModelLoadPromise;
    }

    async function validateLocalLlm(options: { quiet?: boolean } = {}): Promise<void> {
        if (localLlmValidationPromise) return localLlmValidationPromise;
        localLlmValidationPending = true;
        localLlmValidationError = null;
        renderLocalLlmStatus();
        localLlmValidationPromise = (async () => {
            await detectLocalLlmServers({ quiet: true });
            await loadLocalLlmModels({ quiet: true });
            try {
                localLlmValidationReport = await getLocalLlmClient(plugin).runDiagnostics(getLocalLlmUiOverrides());
                localLlmValidationError = null;
                localLlmLastValidatedAt = new Date().toISOString();
                if (!options.quiet) {
                    new Notice('Local LLM validation complete.');
                }
            } catch (error) {
                localLlmValidationReport = null;
                localLlmValidationError = error instanceof Error ? error.message : String(error);
                localLlmLastValidatedAt = new Date().toISOString();
                if (!options.quiet) {
                    new Notice(`Local LLM validation failed: ${localLlmValidationError}`);
                }
            } finally {
                localLlmValidationPending = false;
                localLlmValidationPromise = null;
                renderLocalLlmStatus();
            }
        })();
        return localLlmValidationPromise;
    }

    localLlmModelSetting.addExtraButton(button => {
        button
            .setIcon('refresh-ccw')
            .setTooltip(t('settings.ai.localLlm.loadModelsTooltip'))
            .onClick(async () => {
                button.setDisabled(true);
                button.setIcon('loader-2');
                try {
                    await loadLocalLlmModels();
                } finally {
                    button.setDisabled(false);
                    button.setIcon('refresh-ccw');
                }
            });
    });

    const localLlmActionsSetting = new Settings(localLlmActionsRow)
        .setName(t('settings.ai.localLlm.actionsName'))
        .setDesc(t('settings.ai.localLlm.actionsDesc'));
    localLlmActionsSetting.addButton(button => button
        .setButtonText(t('settings.ai.localLlm.loadServersButton'))
        .onClick(() => {
            button.setDisabled(true);
            void detectLocalLlmServers().finally(() => button.setDisabled(false));
        }));
    localLlmActionsSetting.addButton(button => button
        .setButtonText(t('settings.ai.localLlm.loadModelsButton'))
        .onClick(() => {
            button.setDisabled(true);
            void loadLocalLlmModels().finally(() => button.setDisabled(false));
        }));
    localLlmActionsSetting.addButton(button => button
        .setButtonText(t('settings.ai.localLlm.validateButton'))
        .setCta()
        .onClick(() => {
            button.setDisabled(true);
            void validateLocalLlm().finally(() => button.setDisabled(false));
        }));

    renderLocalLlmModelList();
    renderLocalLlmStatus();

    // ── AI Configuration settings (moved from Core) ───────────────────────
    const aiConfigCreateRow = (
        parent: HTMLElement,
        options: {
            title: string;
            description: string;
            control: (setting: Settings) => void;
        }
    ): Settings => {
        const row = new Settings(parent)
            .setName(options.title)
            .setDesc(options.description);
        row.settingEl.addClass('ert-settingRow');
        options.control(row);
        return row;
    };
    const aiConfigCreateNumberInput = (
        setting: Settings,
        options: {
            value: number;
            min: number;
            max: number;
            step: number;
            invalidNotice: string;
            onSave: (value: number) => Promise<void> | void;
        }
    ): void => {
        setting.addText(text => {
            text.setValue(String(options.value));
            text.inputEl.type = 'number';
            text.inputEl.min = String(options.min);
            text.inputEl.max = String(options.max);
            text.inputEl.step = String(options.step);
            text.inputEl.addClass('ert-input--xs');

            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });

            const handleBlur = async () => {
                const parsed = parseInt(text.getValue().trim(), 10);
                if (!Number.isFinite(parsed) || parsed < options.min || parsed > options.max) {
                    new Notice(options.invalidNotice);
                    text.setValue(String(options.value));
                    return;
                }
                await options.onSave(Math.round(parsed));
                text.setValue(String(Math.round(parsed)));
            };

            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
        });
    };

    const aiDisplayGroup = aiConfigBody.createDiv({ cls: 'ert-config-group' });
    aiDisplayGroup.createDiv({ cls: 'ert-config-group-title', text: t('settings.ai.config.timelineDisplayTitle') });

    aiConfigCreateRow(aiDisplayGroup, {
        title: t('settings.ai.config.pulseContextName'),
        description: t('settings.ai.config.pulseContextDesc'),
        control: (setting) => {
            setting.addToggle(toggle => toggle
                .setValue(plugin.settings.showFullTripletAnalysis ?? true)
                .onChange(async (value) => {
                    plugin.settings.showFullTripletAnalysis = value;
                    await plugin.saveSettings();
                }));
        }
    });

    aiConfigCreateRow(aiDisplayGroup, {
        title: t('settings.ai.config.synopsisMaxWordsName'),
        description: t('settings.ai.config.synopsisMaxWordsDesc'),
        control: (setting) => {
            aiConfigCreateNumberInput(setting, {
                value: getSynopsisGenerationWordLimit(plugin.settings),
                min: 10,
                max: 300,
                step: 5,
                invalidNotice: t('settings.ai.config.synopsisMaxWordsInvalid'),
                onSave: async (value) => {
                    plugin.settings.synopsisGenerationMaxWords = value;
                    plugin.settings.synopsisHoverMaxLines = getSynopsisHoverLineLimit(plugin.settings);
                    await plugin.saveSettings();
                }
            });
        }
    });

    const summaryRefreshGroup = aiConfigBody.createDiv({ cls: 'ert-config-group' });
    summaryRefreshGroup.createDiv({ cls: 'ert-config-group-title', text: t('settings.ai.config.summaryRefreshTitle') });

    aiConfigCreateRow(summaryRefreshGroup, {
        title: t('settings.ai.config.targetSummaryName'),
        description: t('settings.ai.config.targetSummaryDesc'),
        control: (setting) => {
            aiConfigCreateNumberInput(setting, {
                value: plugin.settings.synopsisTargetWords ?? 200,
                min: 75,
                max: 500,
                step: 25,
                invalidNotice: t('settings.ai.config.targetSummaryInvalid'),
                onSave: async (value) => {
                    plugin.settings.synopsisTargetWords = value;
                    await plugin.saveSettings();
                }
            });
        }
    });

    aiConfigCreateRow(summaryRefreshGroup, {
        title: t('settings.ai.config.weakThresholdName'),
        description: t('settings.ai.config.weakThresholdDesc'),
        control: (setting) => {
            aiConfigCreateNumberInput(setting, {
                value: plugin.settings.synopsisWeakThreshold ?? 75,
                min: 10,
                max: 300,
                step: 5,
                invalidNotice: t('settings.ai.config.weakThresholdInvalid'),
                onSave: async (value) => {
                    plugin.settings.synopsisWeakThreshold = value;
                    await plugin.saveSettings();
                }
            });
        }
    });

    aiConfigCreateRow(summaryRefreshGroup, {
        title: t('settings.ai.config.alsoUpdateSynopsisName'),
        description: t('settings.ai.config.alsoUpdateSynopsisDesc'),
        control: (setting) => {
            setting.addToggle(toggle => toggle
                .setValue(plugin.settings.alsoUpdateSynopsis ?? false)
                .onChange(async (value) => {
                    plugin.settings.alsoUpdateSynopsis = value;
                    await plugin.saveSettings();
                }));
        }
    });

    // Final section order in AI tab:
    // 1) AI Strategy
    // 2) Preview (Active Model)
    // 3) Local LLM Configuration
    // 4) Local LLM Status / Validation
    // 5) AI Cost Estimate
    // 6) Role context
    // 7) AI transparency
    // 8) Execution preference
    // 9) API Keys
    // 10) Configuration
    [
        quickSetupSection,
        quickSetupPreviewSection,
        costEstimateSection,
        roleContextSection,
        largeHandlingSection,
        detailsBtn,
        executionPreferenceSetting.settingEl,
        executionPreferenceNote,
        apiKeysFold,
        aiConfigFold
    ].forEach(section => aiSettingsGroup.appendChild(section));

    // Apply provider dimming on first render
    params.refreshProviderDimming();
    void refreshRoutingUi().then(() => {
        if (ensureCanonicalAiSettings().provider === 'ollama') {
            queueLocalLlmAutoValidation();
        }
    });

    // Set initial visibility state
    params.toggleAiSettingsVisibility(plugin.settings.enableAiSceneAnalysis ?? true);
}
