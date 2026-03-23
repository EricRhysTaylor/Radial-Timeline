import { Setting as Settings, Notice, DropdownComponent, TFile, setIcon, setTooltip } from 'obsidian';
import type { App, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { fetchAnthropicModels } from '../../api/anthropicApi';
import { fetchOpenAiModels } from '../../api/openaiApi';
import { fetchGeminiModels as fetchGoogleModels } from '../../api/geminiApi';
import { AiContextModal } from '../AiContextModal';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { resolveAiLogFolder } from '../../ai/log';
import { ERT_CLASSES } from '../../ui/classes';
import { IMPACT_FULL } from '../SettingImpact';
import { buildDefaultAiSettings } from '../../ai/settings/aiSettings';
import { validateAiSettings } from '../../ai/settings/validateAiSettings';
import { BUILTIN_MODELS } from '../../ai/registry/builtinModels';
import { compareNewestModels, getPickerModelsForProvider, selectLatestModelByReleaseChannel } from '../../ai/registry/releaseChannels';
import { selectModel } from '../../ai/router/selectModel';
import { computeCaps } from '../../ai/caps/computeCaps';
import { resolveEngineCapabilities } from '../../ai/caps/engineCapabilities';
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
import type { AccessTier, AIProviderId, Capability, LocalLlmSettings, ModelInfo, ModelStatus, RTCorpusTokenBreakdown } from '../../ai/types';
import type { LocalLlmDiagnosticsReport } from '../../ai/localLlm/diagnostics';
import { buildCanonicalExecutionEstimate, estimateGossamerTokens } from '../../ai/forecast/estimateTokensFromVault';
import {
    estimateCorpusCost,
    formatUsdCost
} from '../../ai/cost/estimateCorpusCost';
import { getProviderPricing } from '../../ai/cost/providerPricing';
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
import { extractBeatOrder } from '../../utils/gossamer';
import { resolveSelectedBeatModelFromSettings } from '../../utils/beatSystemState';
import { getSynopsisGenerationWordLimit, getSynopsisHoverLineLimit } from '../../utils/synopsisLimits';
import { getResolvedModelId } from '../../utils/modelResolver';
import { getLocalLlmSettings, LOCAL_LLM_BACKEND_LABELS, resolveLocalLlmModelInfo } from '../../ai/localLlm/settings';
import type { LocalLlmBackendId } from '../../ai/types';

type Provider = 'anthropic' | 'google' | 'openai' | 'ollama';
type CapacityItem = string | { text: string; dividerBefore?: boolean };
type PromptRequestBreakdown = {
    roleTemplateTokens: number | null;
    instructionTokens: number | null;
    outputContractTokens: number | null;
    transformTokens: number | null;
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
        text: 'Radial Timeline uses AI to help authors prepare their work for editorial review\u2014by beta readers, collaborators, and professional editors. It analyzes structure, momentum, and continuity across scenes, helping the author identify gaps, surface contradictions, and strengthen narrative clarity.'
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
    const costEstimateSection = aiSettingsGroup.createDiv({
        cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ert-ai-section-card`
    });
    costEstimateSection.createDiv({ cls: 'ert-section-title', text: 'AI Cost Estimate' });
    costEstimateSection.createDiv({
        cls: 'ert-section-desc',
        text: 'Cost estimates based on the current Inquiry scope. Includes scenes, outlines, and reference documents according to Inquiry settings.'
    });
    const costEstimateCorpusSummary = costEstimateSection.createDiv({ cls: `${ERT_CLASSES.STACK_TIGHT}` });
    const costEstimateCorpusSize = costEstimateCorpusSummary.createDiv({
        cls: 'ert-section-desc',
        text: 'Inquiry Corpus: Calculating...'
    });
    const costEstimateCorpusStructure = costEstimateCorpusSummary.createDiv({
        cls: 'ert-field-note',
        text: 'Scanning corpus...'
    });
    const costEstimateTable = costEstimateSection.createDiv({ cls: 'ert-ai-models-table' });
    const costEstimateFootnote = costEstimateSection.createDiv({ cls: 'ert-ai-cost-footnote' });
    costEstimateFootnote.appendText('* Cloud-provider rows use published provider pricing. Actual charges may differ due to provider-side billing rules and account-level adjustments such as caching, credits, promos, or contract pricing. ');
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
    costEstimateFootnote.createEl('strong', { text: 'LOCAL PROCESSING' });
    costEstimateFootnote.appendText(' runs on your machine. No API charges. Performance and output depend on your hardware and model.');

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

    const getLocalLlmBackendId = (): LocalLlmBackendId => getLocalLlmSettings(ensureCanonicalAiSettings()).backend;
    const getLocalLlmUiTimeoutMs = (): number => (
        Math.max(4000, Math.min(getLocalLlmSettings(ensureCanonicalAiSettings()).timeoutMs, 10000))
    );
    const getLocalLlmUiOverrides = (): Partial<LocalLlmSettings> => ({
        timeoutMs: getLocalLlmUiTimeoutMs()
    });

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
        .setName('What gets sent to the AI')
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
        .setName('Execution preference')
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
    const executionPreferenceNote = aiSettingsGroup.createDiv({ cls: 'ert-field-note' });
    const updateExecutionPreferenceNote = (): void => {
        const mode = ensureCanonicalAiSettings().analysisPackaging;
        executionPreferenceNote.setText(
            mode === 'singlePassOnly'
                ? 'Runs only when the Inquiry corpus fits one pass. Otherwise reduce scope or switch to Automatic.'
                : mode === 'segmented'
                ? 'Always splits the run into structured passes, even when one pass would fit.'
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
    roleContextSection.createDiv({ cls: 'ert-section-title', text: 'Role context' });
    roleContextSection.createDiv({
        cls: 'ert-section-desc',
        text: 'Active role and context framing used for AI submissions. Applied to Inquiry, Pulse (Triplet Analysis), Gossamer Momentum, Summary Refresh, Runtime AI Estimation.'
    });

    const apiKeysFold = aiSettingsGroup.createDiv({
        cls: `${ERT_CLASSES.STACK} ert-ai-configuration`
    });
    const apiKeysHeader = new Settings(apiKeysFold)
        .setName('API keys')
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
        .setName('Configuration')
        .setHeading();
    applyErtHeaderLayout(aiConfigHeader);
    const aiConfigBody = aiConfigFold.createDiv({ cls: [ERT_CLASSES.SECTION_BODY, ERT_CLASSES.STACK] });

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

    const capabilityFloor: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'];
    const providerLabel: Record<AIProviderId, string> = {
        anthropic: 'Anthropic',
        openai: 'OpenAI',
        google: 'Google',
        ollama: 'Local LLM',
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

    const resolvePreviewCitationSignal = (model: ModelInfo): string | null => {
        const capabilities = resolveEngineCapabilities(model);

        // When cache and citations are mutually exclusive, show a combined pill
        // instead of separate independent pills (doctrine: do not lie to the author).
        if (capabilities.constraints.cacheVsCitationsExclusive
            && capabilities.corpusReuse.availableInRt
            && (capabilities.directManuscriptCitations.availableInRt || capabilities.groundedToolAttribution.availableInRt)) {
            return 'Citation or Cache (exclusive)';
        }

        if (capabilities.directManuscriptCitations.availableInRt) {
            return 'Citation · Direct manuscript';
        }
        if (capabilities.groundedToolAttribution.availableInRt) {
            return model.provider === 'google'
                ? 'Citation · Grounded search'
                : 'Citation · Tool annotations';
        }
        return null;
    };

    const resolvePreviewReuseSignal = (model: ModelInfo): string | null => {
        const capabilities = resolveEngineCapabilities(model);

        // When the combined exclusive pill is shown, suppress the separate reuse pill.
        if (capabilities.constraints.cacheVsCitationsExclusive
            && capabilities.corpusReuse.availableInRt
            && (capabilities.directManuscriptCitations.availableInRt || capabilities.groundedToolAttribution.availableInRt)) {
            return null;
        }

        return capabilities.corpusReuse.availableInRt
            ? 'Reuse · Provider cache'
            : 'Reuse · No provider cache';
    };

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

    const providerSetting = new Settings(quickSetupGrid)
        .setName('Provider')
        .setDesc('Select the AI service or Local LLM runtime that powers structural analysis and editorial insight.');
    providerSetting.settingEl.setAttr('data-ert-role', 'ai-setting:provider');
    let providerDropdown: DropdownComponent | null = null;
    providerSetting.addDropdown(dropdown => {
        providerDropdown = dropdown;
        dropdown.selectEl.addClass('ert-input', 'ert-input--md', 'ert-ai-strategy-select');
        dropdown.addOption('anthropic', 'Anthropic');
        dropdown.addOption('openai', 'OpenAI');
        dropdown.addOption('google', 'Google');
        dropdown.addOption('ollama', 'Local LLM');
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
            if (nextProvider === 'ollama') {
                markLocalLlmConfigurationDirty();
                queueLocalLlmAutoValidation();
            }
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
    const LOCAL_MODEL_STRATEGY_COPY = 'Select models in the Local LLM Configuration section below.';
    const LOCAL_ACCESS_TIER_COPY = 'Cloud access tiers do not apply to Local LLM.';

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
        resolvedPreviewKicker.setText('PREVIEW (ACTIVE MODEL)');
        resolvedPreviewModel.setText(state.modelLabel);
        const labelAlreadySaysPreview = state.modelLabel.toLowerCase().includes('preview');
        const previewSuffix = state.isPreview && !labelAlreadySaysPreview ? ' (Preview)' : '';
        const providerDetail = state.idPending
            ? `${providerLabel[state.provider]} · ID pending (${state.modelAlias})`
            : `${providerLabel[state.provider]} · ${(state.modelId || state.modelLabel)}${previewSuffix}`;
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
    };

    const getCostComparisonRowKey = (provider: AIProviderId, modelId: string): string =>
        `${provider}::${modelId}`;

    const COST_PROVIDER_ORDER: ReadonlyArray<Exclude<AIProviderId, 'none' | 'ollama'>> = ['anthropic', 'openai', 'google'];
    const MODEL_STATUS_ORDER: Record<ModelStatus, number> = {
        stable: 0,
        preview: 1,
        legacy: 2,
        deprecated: 3
    };
    const PROVIDER_LABELS: Record<Exclude<AIProviderId, 'none' | 'ollama'>, string> = {
        anthropic: 'Anthropic',
        openai: 'OpenAI',
        google: 'Google'
    };

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
                .filter(model => supportsCostComparisonModel(provider, model.id))
                .sort((left, right) => {
                    const statusDelta = MODEL_STATUS_ORDER[left.status] - MODEL_STATUS_ORDER[right.status];
                    if (statusDelta !== 0) return statusDelta;
                    return compareNewestModels(left, right);
                });

            return providerModels.map(model => ({
                provider,
                modelId: model.id,
                providerLabel: PROVIDER_LABELS[provider],
                modelLabel: model.label
            }));
        });

        const localModel = resolveLocalLlmModelInfo(ensureCanonicalAiSettings());
        return cloudModels.concat({
            provider: 'ollama',
            modelId: localModel.id,
            providerLabel: 'Local LLM',
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
    let lastCostComparisonRows: CostComparisonRow[] = [];

    const getCurrentCorpusContext = () => plugin.getInquiryService().getCurrentCorpusContext();

    const buildCurrentInquiryExecutionEstimate = async (params: {
        provider: AIProviderId;
        modelId: string;
        questionText: string;
    }) => {
        const currentCorpus = getCurrentCorpusContext();
        if (!currentCorpus) {
            throw new Error('Current Inquiry corpus is unavailable.');
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

        rows.forEach(row => {
            const rowEl = costEstimateTable.createDiv({ cls: 'ert-ai-models-row' });
            if (activeCostComparisonRowKey === getCostComparisonRowKey(row.model.provider, row.model.modelId)) {
                rowEl.addClass('ert-ai-models-row--active');
            }
            createCostTableCell(rowEl, row.model.providerLabel);
            createCostTableCell(rowEl, row.model.modelLabel, 'ert-ai-models-cell--model');
            createCostTableCell(rowEl, row.freshText);
            createCostTableCell(rowEl, row.cachedText);
            createCostTableCell(rowEl, row.passesText);
        });
    };

    const setActiveCostComparisonRow = (provider: AIProviderId | null, modelId: string | null): void => {
        activeCostComparisonRowKey = provider && modelId
            ? getCostComparisonRowKey(provider, modelId)
            : null;
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
            sizeText: 'Inquiry Corpus: Unavailable',
            structureText: 'Open inquiry to calculate the Inquiry corpus'
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
                return {
                    model,
                    freshText: formatUsdCost(cost.freshCostUSD),
                    cachedText: formatUsdCost(cost.cachedCostUSD),
                    passesText: passLabel
                };
            } catch {
                return {
                    model,
                    freshText: 'Estimate unavailable',
                    cachedText: 'Estimate unavailable',
                    passesText: 'Unavailable'
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
            beatSystem: selectedBeatModel || plugin.settings.beatSystem || 'Save The Cat',
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
                selectedBeatModel || plugin.settings.beatSystem || 'Save The Cat'
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
                if (isOllama) {
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
            accessTierDesc.textContent = isOllama ? LOCAL_ACCESS_TIER_COPY : ACCESS_TIER_COPY;
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

        if (localLlmConfigSectionEl) {
            localLlmConfigSectionEl.toggleClass('ert-settings-hidden', !isOllama);
            localLlmConfigSectionEl.toggleClass('ert-settings-visible', isOllama);
        }
        if (localLlmStatusSectionEl) {
            localLlmStatusSectionEl.toggleClass('ert-settings-hidden', !isOllama);
            localLlmStatusSectionEl.toggleClass('ert-settings-visible', isOllama);
        }

        capacityInquiryToken.setText('Calculating...');
        capacityInquiryExpected.setText('Calculating...');
        renderCapacitySections(capacityInquirySections, buildInquiryCapacitySections());
        capacityGossamerToken.setText('Calculating...');
        capacityGossamerExpected.setText('Calculating...');
        renderCapacitySections(capacityGossamerSections, buildGossamerCapacitySections(0));
        void refreshCostComparisonTable();

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
            .setName('Secure key saving unavailable')
            .setDesc('Secure key saving is unavailable in this Obsidian build. Provider API keys cannot be configured until secret storage is available.');
        params.addAiRelatedElement(warningSetting.settingEl);
    }

    if (secretStorageAvailable && needsLegacyKeyMigration(plugin)) {
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
        providerName: 'Anthropic',
        keyPlaceholder: 'Enter your Anthropic API key',
        docsUrl: 'https://platform.claude.com'
    });
    renderCredentialSettings({
        section: googleSection,
        provider: 'google',
        providerName: 'Google',
        keyPlaceholder: 'Enter your Google API key',
        docsUrl: 'https://aistudio.google.com'
    });
    renderCredentialSettings({
        section: openaiSection,
        provider: 'openai',
        providerName: 'OpenAI',
        keyPlaceholder: 'Enter your OpenAI API key',
        docsUrl: 'https://platform.openai.com'
    });

    params.setProviderSections({ anthropic: anthropicSection, google: googleSection, openai: openaiSection });

    const aiLogFolder = resolveAiLogFolder();
    let localLlmModelText: TextComponent | null = null;
    let localLlmLoadedModels: Array<{ id: string }> = [];
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

    const localLlmConfigSection = quickSetupPreviewSection.createDiv({
        cls: [`${ERT_CLASSES.CARD}`, `${ERT_CLASSES.PANEL}`, `${ERT_CLASSES.STACK}`, 'ert-ai-local-llm-config', 'ert-settings-hidden']
    });
    localLlmConfigSectionEl = localLlmConfigSection;
    localLlmConfigSection.createDiv({ cls: 'ert-section-title', text: 'Local LLM Configuration' });
    localLlmConfigSection.createDiv({
        cls: 'ert-section-desc',
        text: 'Configure the Local LLM runtime family here. The active model preview above updates as you change these fields.'
    });

    const localLlmStatusSection = quickSetupPreviewSection.createDiv({
        cls: [`${ERT_CLASSES.CARD}`, `${ERT_CLASSES.PANEL}`, `${ERT_CLASSES.STACK}`, 'ert-ai-local-llm-status', 'ert-settings-hidden']
    });
    localLlmStatusSectionEl = localLlmStatusSection;
    localLlmStatusSection.createDiv({ cls: 'ert-section-title', text: 'Local LLM Status / Validation' });
    localLlmStatusSection.createDiv({
        cls: 'ert-section-desc',
        text: 'Persistent checks for the current Local LLM setup. Use this to confirm model loading, structured JSON, and repair behavior before running Pulse or Inquiry.'
    });
    const localLlmStatusSummary = localLlmStatusSection.createDiv({ cls: `${ERT_CLASSES.STACK_TIGHT} ert-ai-local-llm-status-summary` });
    const localLlmStatusChecks = localLlmStatusSection.createDiv({ cls: `${ERT_CLASSES.STACK_TIGHT} ert-ai-local-llm-status-checks` });
    const localLlmStatusTimestamp = localLlmStatusSection.createDiv({ cls: 'ert-field-note' });

    function clearLocalLlmModelLoadState(): void {
        localLlmLoadedModels = [];
        localLlmModelLoadError = null;
        localLlmLastLoadedAt = null;
    }

    function clearLocalLlmValidationState(): void {
        localLlmValidationReport = null;
        localLlmValidationError = null;
        localLlmLastValidatedAt = null;
    }

    function markLocalLlmConfigurationDirty(): void {
        clearLocalLlmModelLoadState();
        clearLocalLlmValidationState();
        renderLocalLlmModelList();
        renderLocalLlmStatus();
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
            void validateLocalLlm({ quiet: true });
        }, 150);
    }

    const localLlmBackendSetting = new Settings(localLlmConfigSection)
        .setName('Local LLM backend')
        .setDesc('Choose the backend behind the Local LLM runtime family. Backend-specific transport stays below this canonical seam.')
        .addDropdown(dropdown => {
            dropdown
                .addOption('ollama', 'Ollama')
                .addOption('lmStudio', 'LM Studio')
                .addOption('openaiCompatible', 'OpenAI-Compatible')
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
                });
        });
    localLlmBackendSetting.settingEl.addClass(ERT_CLASSES.ROW);

    const localLlmBaseUrlSetting = new Settings(localLlmConfigSection)
        .setName('Base URL')
        .setDesc('The API endpoint for the selected Local LLM backend. For example: Ollama "http://localhost:11434/v1" or LM Studio "http://localhost:1234/v1".')
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
        .setName('Selected model')
        .setDesc('Use the exact model ID expected by your backend. Available models stay empty until the backend responds, then you can pick from the loaded list below.')
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

    const localLlmModelsSummary = localLlmConfigSection.createDiv({ cls: 'ert-field-note' });
    const localLlmModelsList = localLlmConfigSection.createDiv({ cls: `${ERT_CLASSES.INLINE} ert-ai-local-llm-model-list` });

    const formatLocalTimestamp = (iso: string | null): string | null => {
        if (!iso) return null;
        const parsed = new Date(iso);
        if (Number.isNaN(parsed.getTime())) return null;
        return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    const renderLocalLlmModelList = (): void => {
        const selectedModelId = getOllamaModelId().trim();
        const selectedExists = localLlmLoadedModels.some(model => model.id === selectedModelId);

        localLlmModelsList.empty();
        if (localLlmModelLoadPending) {
            localLlmModelsSummary.setText('Checking backend and loading available local models...');
            return;
        }

        if (localLlmModelLoadError) {
            localLlmModelsSummary.setText(`Model list unavailable: ${localLlmModelLoadError}`);
            return;
        }

        if (!localLlmLoadedModels.length) {
            localLlmModelsSummary.setText('No models loaded yet. Click Load Models to query the selected backend.');
            return;
        }

        const loadStamp = formatLocalTimestamp(localLlmLastLoadedAt);
        localLlmModelsSummary.setText(
            `Available local models: ${localLlmLoadedModels.length}. ${selectedExists ? 'Selected model found.' : 'Selected model missing from the loaded list.'}${loadStamp ? ` Last loaded ${loadStamp}.` : ''}`
        );

        localLlmLoadedModels.forEach(model => {
            const pill = localLlmModelsList.createSpan({
                cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM} ert-ai-resolved-preview-pill`
            });
            if (model.id === selectedModelId) {
                pill.addClass(ERT_CLASSES.IS_ACTIVE);
            }
            pill.setText(model.id);
            pill.setAttribute('role', 'button');
            pill.setAttribute('tabindex', '0');
            pill.setAttribute('aria-label', `Use local model ${model.id}`);
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

    const renderLocalLlmStatus = (): void => {
        const localLlm = getLocalLlmSettings(ensureCanonicalAiSettings());
        const selectedModelId = localLlm.defaultModelId.trim();
        const selectedExists = localLlmLoadedModels.some(model => model.id === selectedModelId);

        localLlmStatusSummary.empty();
        localLlmStatusChecks.empty();

        const summaryLines: string[] = [];
        if (!localLlm.enabled) summaryLines.push('Status: Local LLM disabled');
        else if (localLlmValidationPending) summaryLines.push('Status: Validating Local LLM');
        else if (localLlmModelLoadPending) summaryLines.push('Status: Checking backend');
        else if (localLlmValidationError) summaryLines.push('Status: Validation failed');
        else if (localLlmValidationReport?.reachable.ok) summaryLines.push('Status: Connected');
        else if (localLlmValidationReport && !localLlmValidationReport.reachable.ok) summaryLines.push('Status: Backend unreachable');
        else if (localLlmLoadedModels.length > 0) summaryLines.push('Status: Models loaded');
        else summaryLines.push('Status: Not checked yet');

        summaryLines.push(`Backend: ${LOCAL_LLM_BACKEND_LABELS[localLlm.backend]}`);
        summaryLines.push(`Base URL: ${localLlm.baseUrl || 'Not set'}`);
        summaryLines.push(
            localLlmModelLoadPending
                ? 'Models loaded: checking backend'
                :
            localLlmModelLoadError
                ? 'Models loaded: unavailable'
                : `Models loaded: ${localLlmLoadedModels.length > 0 ? String(localLlmLoadedModels.length) : 'not loaded'}`
        );
        summaryLines.push(
            localLlmModelLoadPending
                ? 'Selected model: checking availability'
                :
            selectedModelId
                ? `Selected model: ${selectedExists ? `${selectedModelId} found` : `${selectedModelId} missing`}`
                : 'Selected model: not set'
        );

        summaryLines.forEach(line => {
            localLlmStatusSummary.createDiv({ cls: 'ert-field-note', text: line });
        });

        const checks: Array<[string, { ok: boolean; message: string } | null]> = [
            ['Backend reachability', localLlmValidationReport?.reachable ?? null],
            ['Selected model', localLlmValidationReport?.modelAvailable ?? null],
            ['Basic completion', localLlmValidationReport?.basicCompletion ?? null],
            ['Structured JSON', localLlmValidationReport?.structuredJson ?? null],
            ['Repair path', localLlmValidationReport?.repairPath ?? null]
        ];
        checks.forEach(([label, check]) => {
            const line = localLlmStatusChecks.createDiv({ cls: 'ert-field-note' });
            const statusLabel = localLlmValidationPending
                ? 'Checking...'
                : (check ? (check.ok ? 'Passed' : 'Failed') : 'Not checked');
            line.setText(`${label}: ${statusLabel}`);
            if (check?.message) {
                line.createSpan({ text: ` — ${check.message}` });
            }
        });

        if (localLlmValidationError) {
            localLlmStatusChecks.createDiv({
                cls: 'ert-field-note',
                text: `Validation error: ${localLlmValidationError}`
            });
        }

        const stamp = formatLocalTimestamp(localLlmLastValidatedAt);
        localLlmStatusTimestamp.setText(
            localLlmValidationPending
                ? 'Last checked: validating...'
                : (stamp ? `Last checked: ${stamp}` : 'Last checked: not yet validated')
        );
    };

    async function loadLocalLlmModels(options: { quiet?: boolean } = {}): Promise<void> {
        if (localLlmModelLoadPromise) return localLlmModelLoadPromise;
        localLlmModelLoadPending = true;
        localLlmModelLoadError = null;
        renderLocalLlmModelList();
        renderLocalLlmStatus();
        localLlmModelLoadPromise = (async () => {
            try {
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
            .setTooltip('Load models from the selected Local LLM backend')
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

    const localLlmActionsSetting = new Settings(localLlmStatusSection)
        .setName('Validation actions')
        .setDesc('Auto-checks run when Local LLM is selected or reconfigured. Use these actions to retry model loading or validation on demand.');
    localLlmActionsSetting.addButton(button => button
        .setButtonText('Load Models')
        .onClick(() => {
            button.setDisabled(true);
            void loadLocalLlmModels().finally(() => button.setDisabled(false));
        }));
    localLlmActionsSetting.addButton(button => button
        .setButtonText('Validate Local LLM')
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
    aiDisplayGroup.createDiv({ cls: 'ert-config-group-title', text: 'Timeline Display' });

    aiConfigCreateRow(aiDisplayGroup, {
        title: 'Pulse context',
        description: 'Include previous and next scenes in triplet analysis hover reveal. (Does not affect the underlying scene properties.)',
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
        title: 'Synopsis max words',
        description: 'Cap for generated Synopsis text shown on hover and other compact timeline surfaces.',
        control: (setting) => {
            aiConfigCreateNumberInput(setting, {
                value: getSynopsisGenerationWordLimit(plugin.settings),
                min: 10,
                max: 300,
                step: 5,
                invalidNotice: 'Synopsis length must be between 10 and 300 words.',
                onSave: async (value) => {
                    plugin.settings.synopsisGenerationMaxWords = value;
                    plugin.settings.synopsisHoverMaxLines = getSynopsisHoverLineLimit(plugin.settings);
                    await plugin.saveSettings();
                }
            });
        }
    });

    const summaryRefreshGroup = aiConfigBody.createDiv({ cls: 'ert-config-group' });
    summaryRefreshGroup.createDiv({ cls: 'ert-config-group-title', text: 'Summary Refresh Defaults' });

    aiConfigCreateRow(summaryRefreshGroup, {
        title: 'Target summary length',
        description: 'Default word count used when opening Summary refresh. You can still change it per run.',
        control: (setting) => {
            aiConfigCreateNumberInput(setting, {
                value: plugin.settings.synopsisTargetWords ?? 200,
                min: 75,
                max: 500,
                step: 25,
                invalidNotice: 'Target summary length must be between 75 and 500 words.',
                onSave: async (value) => {
                    plugin.settings.synopsisTargetWords = value;
                    await plugin.saveSettings();
                }
            });
        }
    });

    aiConfigCreateRow(summaryRefreshGroup, {
        title: 'Treat summary as weak if under',
        description: 'Default threshold used to decide which scenes are selected for Summary refresh.',
        control: (setting) => {
            aiConfigCreateNumberInput(setting, {
                value: plugin.settings.synopsisWeakThreshold ?? 75,
                min: 10,
                max: 300,
                step: 5,
                invalidNotice: 'Weak summary threshold must be between 10 and 300 words.',
                onSave: async (value) => {
                    plugin.settings.synopsisWeakThreshold = value;
                    await plugin.saveSettings();
                }
            });
        }
    });

    aiConfigCreateRow(summaryRefreshGroup, {
        title: 'Also update Synopsis',
        description: 'When enabled, Summary refresh also writes Synopsis using the configured Synopsis max words.',
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
