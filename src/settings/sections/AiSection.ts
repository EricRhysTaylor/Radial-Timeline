import { Setting as Settings, Notice, DropdownComponent, TFile, setIcon, setTooltip } from 'obsidian';
import type { App, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { fetchAnthropicModels } from '../../api/anthropicApi';
import { fetchOpenAiModels } from '../../api/openaiApi';
import { fetchGeminiModels } from '../../api/geminiApi';
import { fetchLocalModels } from '../../api/localAiApi';
import { AiContextModal } from '../AiContextModal';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { resolveAiLogFolder } from '../../ai/log';
import { ERT_CLASSES } from '../../ui/classes';
import { IMPACT_FULL } from '../SettingImpact';
import { buildDefaultAiSettings, mapAiProviderToLegacyProvider } from '../../ai/settings/aiSettings';
import { validateAiSettings } from '../../ai/settings/validateAiSettings';
import { BUILTIN_MODELS } from '../../ai/registry/builtinModels';
import { compareNewestModels, getPickerModelsForProvider, selectLatestModelByReleaseChannel } from '../../ai/registry/releaseChannels';
import { selectModel } from '../../ai/router/selectModel';
import { computeCaps } from '../../ai/caps/computeCaps';
import { resolveEngineCapabilities } from '../../ai/caps/engineCapabilities';
import { getAIClient } from '../../ai/runtime/aiClient';
import {
    getCredential,
    getCredentialSecretId,
    migrateLegacyKeysToSecretStorage,
    setCredentialSecretId
} from '../../ai/credentials/credentials';
import { getSecret, hasSecret, isSecretStorageAvailable, setSecret } from '../../ai/credentials/secretStorage';
import type { AccessTier, AIProviderId, Capability, ModelInfo, ModelStatus, RTCorpusTokenBreakdown } from '../../ai/types';
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
import { resolveSelectedBeatModel } from '../../utils/beatsInputNormalize';
import { getSynopsisGenerationWordLimit, getSynopsisHoverLineLimit } from '../../utils/synopsisLimits';
import { getResolvedModelId } from '../../utils/modelResolver';

type Provider = 'anthropic' | 'gemini' | 'openai' | 'local';
type CapacityItem = string | { text: string; dividerBefore?: boolean };
type LocalRequestBreakdown = {
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
    setProviderSections: (sections: { anthropic?: HTMLElement; gemini?: HTMLElement; openai?: HTMLElement; local?: HTMLElement }) => void;
    setKeyInputRef: (provider: Provider, input: HTMLInputElement | undefined) => void;
    setLocalConnectionInputs: (refs: { baseInput?: HTMLInputElement; modelInput?: HTMLInputElement }) => void;
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
    costEstimateSection.createDiv({
        cls: 'ert-ai-cost-footnote',
        text: '* Estimates use published provider pricing. Actual charges may differ due to provider-side billing rules and account-level adjustments such as caching, credits, promos, or contract pricing.'
    });
    const costEstimateLinks = costEstimateSection.createDiv({ cls: 'ert-ai-cost-links' });
    costEstimateLinks.createSpan({ text: 'See provider pricing: ' });
    [
        { label: 'OpenAI', href: 'https://openai.com/api/pricing/' },
        { label: 'Anthropic', href: 'https://platform.claude.com/docs/en/about-claude/pricing' },
        { label: 'Gemini', href: 'https://ai.google.dev/gemini-api/docs/pricing' }
    ].forEach((link, index, list) => {
        const anchor = costEstimateLinks.createEl('a', {
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
        localBreakdown?: LocalRequestBreakdown;
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
            counts?.localBreakdown?.roleTemplateTokens,
            counts?.localBreakdown?.instructionTokens,
            counts?.localBreakdown?.outputContractTokens,
            counts?.localBreakdown?.transformTokens
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
                    buildTokenCapacityLine('AI role template (author-defined)', counts?.localBreakdown?.roleTemplateTokens ?? null),
                    buildTokenCapacityLine('Editorial analysis instructions', counts?.localBreakdown?.instructionTokens ?? null)
                ]
            },
            {
                title: 'Output',
                items: [
                    'Scene-linked findings',
                    buildTokenCapacityLine('Strict JSON structure', counts?.localBreakdown?.outputContractTokens ?? null)
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
        localBreakdown?: LocalRequestBreakdown
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
            items: [buildTokenCapacityLine('Beat overlay (ordered sequence)', localBreakdown?.transformTokens ?? null)]
        },
        {
            title: 'Prompt',
            items: [
                buildTokenCapacityLine('AI role template (author-defined)', localBreakdown?.roleTemplateTokens ?? null),
                buildTokenCapacityLine('Beat scoring instructions', localBreakdown?.instructionTokens ?? null)
            ]
        },
        {
            title: 'Output',
            items: [
                'Per-beat scores',
                buildTokenCapacityLine('Strict JSON structure', localBreakdown?.outputContractTokens ?? null)
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
                        localBreakdown?.roleTemplateTokens,
                        localBreakdown?.instructionTokens,
                        localBreakdown?.outputContractTokens,
                        localBreakdown?.transformTokens
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

        const stableCandidates = models
            .filter(model => model.provider === selected.provider)
            .filter(model => model.status === 'stable')
            .filter(model => model.line === selected.line)
            .filter(model => !model.id.includes('latest') && !model.alias.includes('latest'))
            .sort(compareNewestModels);
        return {
            displayModel: stableCandidates[0] ?? selected,
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
        localTotalTokens: number;
        sceneCount: number;
        outlineCount: number;
        referenceCount: number;
        breakdown: RTCorpusTokenBreakdown;
        localBreakdown: LocalRequestBreakdown;
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

    const getCostComparisonModels = (): CostComparisonModel[] => COST_PROVIDER_ORDER.flatMap(provider => {
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

        const gossamerEstimate = await estimateGossamerTokens({
            plugin,
            vault: app.vault,
            metadataCache: app.metadataCache,
            frontmatterMappings: plugin.settings.frontmatterMappings
        });
        const { files: gossamerSceneFiles } = await getSortedSceneFiles(plugin);
        const sceneData = await plugin.getSceneData();
        const selectedBeatModel = resolveSelectedBeatModel(plugin.settings.beatSystem, plugin.settings.customBeatSystemName);
        const beatOrder = extractBeatOrder(
            sceneData as Array<{ itemType?: string; subplot?: string; title?: string; "Beat Model"?: string }>,
            selectedBeatModel
        );
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
        const inquiryLocalBreakdown: LocalRequestBreakdown = {
            roleTemplateTokens,
            instructionTokens: inquiryInstructionTokens,
            outputContractTokens: inquiryOutputContractTokens,
            transformTokens: 0
        };
        const gossamerLocalBreakdown: LocalRequestBreakdown = {
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
                localTotalTokens: sumTokenParts(
                    inquiryCorpusTokens,
                    inquiryLocalBreakdown.roleTemplateTokens,
                    inquiryLocalBreakdown.instructionTokens,
                    inquiryLocalBreakdown.outputContractTokens,
                    inquiryLocalBreakdown.transformTokens
                ) ?? inquiryCorpusTokens,
                sceneCount: currentCorpus?.corpus.sceneCount ?? 0,
                outlineCount: currentCorpus?.corpus.outlineCount ?? 0,
                referenceCount: currentCorpus?.corpus.referenceCount ?? 0,
                breakdown: currentCorpus?.corpus.breakdown ?? {
                    scenesTokens: 0,
                    outlineTokens: 0,
                    referenceTokens: 0
                },
                localBreakdown: inquiryLocalBreakdown
            },
            gossamer: {
                available: true,
                corpusTokens: gossamerCorpusTokens,
                providerExecutionTokens: gossamerProviderTokens,
                localTotalTokens: sumTokenParts(
                    gossamerCorpusTokens,
                    gossamerLocalBreakdown.roleTemplateTokens,
                    gossamerLocalBreakdown.instructionTokens,
                    gossamerLocalBreakdown.outputContractTokens,
                    gossamerLocalBreakdown.transformTokens
                ) ?? gossamerCorpusTokens,
                sceneCount: gossamerDisplayCorpus.sceneCount,
                outlineCount: gossamerDisplayCorpus.outlineCount,
                referenceCount: gossamerDisplayCorpus.referenceCount,
                breakdown: gossamerDisplayCorpus.breakdown,
                localBreakdown: gossamerLocalBreakdown
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
        } finally {
            isSyncingRoutingUi = false;
        }
        updateExecutionPreferenceNote();

        providerSetting.settingEl.toggleClass('ert-settings-hidden', false);
        providerSetting.settingEl.toggleClass('ert-settings-visible', true);
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
                    setTokenDisplay(capacityInquiryToken, formatCorpusBreakdownToken(forecasts.inquiry.localTotalTokens), 'tokens');
                    capacityInquiryExpected.setText(formatExpectedPasses(forecasts.inquiry.providerExecutionTokens));
                    capacityInquiryProvider.setText(formatProviderInput(forecasts.inquiry.providerExecutionTokens));
                    renderCapacitySections(capacityInquirySections, buildInquiryCapacitySections({
                        sceneCount: forecasts.inquiry.sceneCount,
                        outlineCount: forecasts.inquiry.outlineCount,
                        referenceCount: forecasts.inquiry.referenceCount,
                        breakdown: forecasts.inquiry.breakdown,
                        localBreakdown: forecasts.inquiry.localBreakdown
                    }));
                } else {
                    capacityInquiryToken.setText('Unavailable');
                    capacityInquiryExpected.setText('Unavailable');
                    capacityInquiryProvider.setText('Unavailable');
                    renderCapacitySections(capacityInquirySections, buildInquiryCapacitySections());
                }

                setTokenDisplay(capacityGossamerToken, formatCorpusBreakdownToken(forecasts.gossamer.localTotalTokens), 'tokens');
                capacityGossamerExpected.setText(formatExpectedPasses(forecasts.gossamer.providerExecutionTokens));
                capacityGossamerProvider.setText(formatProviderInput(forecasts.gossamer.providerExecutionTokens));
                renderCapacitySections(
                    capacityGossamerSections,
                    buildGossamerCapacitySections(
                        forecasts.gossamer.sceneCount,
                        forecasts.gossamer.breakdown,
                        forecasts.gossamer.localBreakdown
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
        .setName('Local LLM base URL')
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
        text: `By default, no LLM pulses are written to the scene when local transformer is used. Rather it is stored in an AI log file in the local logs output folder (${aiLogFolder}), as the response does not follow directions and breaks scene hover formatting. You may still write scene hover fields with local LLM by toggling off the setting "Bypass scene hover fields writes" below.`
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
                    new Notice('Set the local LLM base URL first.');
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
        .setName('Custom instructions')
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
        .setName('Bypass scene hover fields writes')
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
        .setName('Custom instructions')
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
    // 2) Preview (Active Model) + Local Quick Config (when local selected)
    // 3) Role context
    // 4) AI transparency
    // 5) Execution preference
    // 6) API Keys
    // 7) Configuration
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
    void refreshRoutingUi();

    // Set initial visibility state
    params.toggleAiSettingsVisibility(plugin.settings.enableAiSceneAnalysis ?? true);
}
