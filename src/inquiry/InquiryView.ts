import {
    App,
    ButtonComponent,
    ItemView,
    Menu,
    Notice,
    Platform,
    setIcon,
    setTooltip,
    TAbstractFile,
    TFile,
    TFolder,
    WorkspaceLeaf,
    normalizePath
} from 'obsidian';
import type RadialTimelinePlugin from '../main';
import {
    INQUIRY_MAX_OUTPUT_TOKENS,
    INQUIRY_SCHEMA_VERSION,
    INQUIRY_VIEW_DISPLAY_TEXT,
    INQUIRY_VIEW_TYPE
} from './constants';
import {
    createDefaultInquiryState,
    FindingRole,
    InquiryConfidence,
    InquiryFinding,
    InquiryLens,
    InquiryRoleValidation,
    InquiryResult,
    InquiryPromptFormOverride,
    InquirySelectionMode,
    InquiryScope,
    InquirySeverity,
    InquiryTokenUsageScope,
    InquiryZone
} from './state';
import type {
    InquiryCanonicalQuestionTier,
    InquiryClassConfig,
    InquiryPromptConfig,
    InquiryPromptSlot,
    SceneInclusion,
    InquiryTimingHistoryEntry,
    OmnibusProgressState
} from '../types/settings';
import {
    buildDefaultInquiryPromptConfig,
    getCanonicalQuestionForSlot,
    getPromptSlotQuestion,
    normalizeInquiryPromptConfig
} from './prompts';
import {
    createInquiryBriefingPanel,
    createInquiryDesktopShell,
    createInquiryEnginePanel,
    createInquiryPromptPreviewPanel
} from './dom/inquiryDomFactory';
import {
    bindInquiryBriefingPanelEvents,
    bindInquiryBriefingSessionItemEvents,
    bindInquiryDetailsToggleEvent,
    bindInquiryDesktopShellEvents,
    bindInquiryEngineActionButtons,
    bindInquiryEnginePanelEvents,
    bindInquiryMobileGateEvents,
    bindInquiryPreviewPanelEvents,
    bindInquiryZonePodEvents
} from './interactions/inquiryEventBinder';
import { buildInquiryBriefingSections } from './briefing/inquiryBriefingGrouping';
import { renderInquiryBriefingSessionItem } from './briefing/inquiryBriefingRenderer';
import {
    buildFocusedCustomPrompt,
    resolveQuestionPrompt,
    resolveQuestionPromptForm,
    type InquiryQuestionPromptForm
} from './questions/resolveQuestionPrompt';
import { ensureInquiryArtifactFolder, getMostRecentArtifactFile, resolveInquiryArtifactFolder } from './utils/artifacts';
import { buildInquiryDossierPresentation } from './utils/inquiryDossierPresentation';
import { cleanEvidenceBody } from './utils/evidenceCleaning';
import { ensureInquiryContentLogFolder, ensureInquiryLogFolder, resolveInquiryLogFolder } from './utils/logs';
import { openOrRevealFile, openOrRevealFileAtSubpath } from '../utils/fileUtils';
import {
    extractTokenUsage,
    formatDuration,
} from '../ai/log';
import { getCredentialSecretId } from '../ai/credentials/credentials';
import { hasSecret, isSecretStorageAvailable } from '../ai/credentials/secretStorage';
import {
    InquiryGlyph,
    FLOW_RADIUS,
    FLOW_STROKE,
    ZONE_RING_THICKNESS,
    ZONE_SEGMENT_RADIUS,
    ZONE_SEGMENT_HALF_HEIGHT
} from './components/InquiryGlyph';
import { ZONE_LAYOUT } from './zoneLayout';
import { InquiryRunnerService } from './runner/InquiryRunnerService';
import { getLastAiAdvancedContext } from '../ai/runtime/aiClient';
// computeCaps, INPUT_TOKEN_GUARD_FACTOR: now used in inquiryReadinessBuilder.ts
import { BUILTIN_MODELS } from '../ai/registry/builtinModels';
import { selectModel } from '../ai/router/selectModel';
import { buildDefaultAiSettings } from '../ai/settings/aiSettings';
import { validateAiSettings } from '../ai/settings/validateAiSettings';
import type { AIProviderId, AiSettingsV1, ModelInfo, AccessTier, RTCorpusTokenEstimate } from '../ai/types';
import type {
    CorpusManifest,
    CorpusManifestEntry,
    EvidenceParticipationRules,
    InquiryAiProvider,
    InquiryOmnibusInput,
    InquiryRunProgressEvent,
    InquiryRunTrace,
    InquiryRunnerInput
} from './runner/types';
import { InquirySessionStore } from './InquirySessionStore';
import type { InquirySession, InquirySessionStatus } from './sessionTypes';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import type { InquirySourcesSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';
import { InquiryCorpusResolver, InquiryCorpusSnapshot, InquiryCorpusItem, InquirySceneItem, InquiryBookItem } from './services/InquiryCorpusResolver';
import {
    isPathIncludedByInquiryBooks,
    resolveBookManagerInquiryBooks
} from './services/bookResolution';
import { getModelDisplayName } from '../utils/modelResolver';
import { resolveInquiryEngine, type ResolvedInquiryEngine } from './services/inquiryModelResolver';
import { buildInquirySourcesViewModel } from './services/inquirySources';
import { computeInquiryAdvisoryContext, type InquiryAdvisoryContext } from './services/inquiryAdvisory';
import type { InquiryEstimateSnapshot } from './services/inquiryEstimateSnapshot';
import { scopeEntriesToActiveInquiryTarget } from './services/canonicalInquiryCorpus';
import type {
    TokenTier,
    InquiryCurrentCorpusContext,
    InquiryPayloadStats,
    InquiryReadinessUiState,
    InquiryEnginePopoverState,
    PassPlanResult
} from './types';
import {
    buildReadinessUiState as buildReadinessUiStatePure,
    buildRunScopeLabel as buildRunScopeLabelPure,
    resolveEnginePopoverState as resolveEnginePopoverStatePure,
    getCurrentPassPlan as getCurrentPassPlanPure,
    buildAdvisoryInputKey,
    formatTokenEstimate as formatTokenEstimatePure,
    getTokenTier as getTokenTierPure,
    getTokenTierFromSnapshot as getTokenTierFromSnapshotPure,
    INQUIRY_INPUT_TOKENS_AMBER,
    INQUIRY_INPUT_TOKENS_RED
} from './services/inquiryReadinessBuilder';
import { buildRTCorpusEstimate } from './services/buildRTCorpusEstimate';
import {
    InquiryCorpusService,
    isSynopsisCapableClass as isSynopsisCapableClassPure,
    normalizeEvidenceMode as normalizeEvidenceModePure,
    isModeActive as isModeActivePure,
    normalizeContributionMode as normalizeContributionModePure,
    normalizeMaterialMode as normalizeMaterialModePure,
    normalizeClassContribution as normalizeClassContributionPure,
    resolveContributionMode as resolveContributionModePure,
    getDefaultMaterialMode as getDefaultMaterialModePure,
    hashString as hashStringPure,
    getCorpusGroupKey as getCorpusGroupKeyPure,
    getCorpusGroupBaseClass as getCorpusGroupBaseClassPure,
    getCorpusItemKey as getCorpusItemKeyPure,
    parseCorpusItemKey as parseCorpusItemKeyPure,
    getCorpusCycleModes as getCorpusCycleModesPure,
    getNextCorpusMode as getNextCorpusModePure,
    getCorpusGroupKeys as getCorpusGroupKeysPure,
    getClassScopeConfig as getClassScopeConfigPure,
    extractClassValues as extractClassValuesPure,
    getFrontmatterScope as getFrontmatterScopePure,
    normalizeInquirySources as normalizeInquirySourcesPure
} from './services/InquiryCorpusService';
import { createSvgElement, createSvgGroup, createSvgText, clearSvgChildren, SVG_NS } from './minimap/svgUtils';
import {
    InquiryMinimapRenderer,
    MINIMAP_GROUP_Y,
    MIN_PROCESSING_MS,
    toRgbString,
    getExecutionColorValue,
    getBackboneStartColors,
} from './minimap/InquiryMinimapRenderer';
import { addTooltipData, balanceTooltipText, setupTooltipsFromDataAttributes } from '../utils/tooltip';
import { classifySynopsis, type SynopsisQuality } from '../sceneAnalysis/synopsisQuality';
import { readSceneId } from '../utils/sceneIds';
import { buildSceneRefIndex, isStableSceneId, normalizeSceneRef } from '../ai/references/sceneRefNormalizer';
import {
    DEFAULT_CHARS_PER_TOKEN,
    estimateTokensFromChars as estimateTokensFromCharsHeuristic,
    estimateUncertaintyTokens
} from '../ai/tokens/inputTokenEstimate';
import {
    estimateCorpusCost,
    formatApproxUsdCost
} from '../ai/cost/estimateCorpusCost';
import { resolveInquirySourceRoots } from './utils/sourceRoots';
import { renderInquiryCorpusStrip } from './corpus/inquiryCorpusStripRenderer';
import { applyInquiryCorpusCcSlotViewModel, buildInquiryCorpusCcSlotViewModel } from './corpus/inquiryCorpusStripSlotRenderer';
import { createInquirySceneDossierLayer, renderInquirySceneDossier } from './render/inquiryDossierRenderer';
import { createInquiryEngineActionButtons } from './engine/inquiryEngineDom';
import { renderInquiryEngineAdvisoryCard, renderInquiryEngineReadinessStrip } from './engine/inquiryEngineRenderer';
import { buildInquiryEngineCorpusSummary } from './engine/inquiryEngineViewModel';
import {
    renderInquiryPromptPreviewLayout,
    renderInquiryRunningHud,
    updateInquiryPreviewClickTargetLayout,
    updateInquiryPreviewShimmerLayout,
    updateInquiryPreviewShimmerText,
    updateInquiryResultsFooterPosition
} from './render/inquiryHudRenderer';
import { buildInquiryContentLogContent, buildInquiryLogContent } from './render/inquiryLogBuilders';
import {
    CC_PAGE_BASE_SIZE,
    DEPTH_FINDING_ORDER,
    FLOW_FINDING_ORDER,
    GLYPH_EMPTY_STATE_STUB,
    GLYPH_OFFSET_Y,
    GLYPH_PLACEHOLDER_DEPTH,
    GLYPH_PLACEHOLDER_FLOW,
    GUIDANCE_ALERT_LINE_HEIGHT,
    GUIDANCE_LINE_HEIGHT,
    GUIDANCE_TEXT_Y,
    MODE_ICON_OFFSET_Y,
    MODE_ICON_VIEWBOX,
    PREVIEW_FOOTER_HEIGHT,
    PREVIEW_PANEL_MINIMAP_GAP,
    PREVIEW_PANEL_WIDTH,
    PREVIEW_PILL_HEIGHT,
    SCENE_DOSSIER_ANCHOR_BODY_GAP,
    SCENE_DOSSIER_ANCHOR_LINE_HEIGHT,
    SCENE_DOSSIER_ANCHOR_MAX_WIDTH,
    SCENE_DOSSIER_BODY_PRIMARY_LINE_HEIGHT,
    SCENE_DOSSIER_BODY_ROW_GAP,
    SCENE_DOSSIER_BODY_SECONDARY_LINE_HEIGHT,
    SCENE_DOSSIER_BRACE_BASELINE_OFFSET,
    SCENE_DOSSIER_BRACE_INSET,
    SCENE_DOSSIER_BRACE_SIZE,
    SCENE_DOSSIER_CANVAS_Y,
    SCENE_DOSSIER_CENTER_Y,
    SCENE_DOSSIER_FOCUS_RADIUS,
    SCENE_DOSSIER_FOOTER_GAP,
    SCENE_DOSSIER_FOOTER_LINE_HEIGHT,
    SCENE_DOSSIER_FOOTER_SIZE,
    SCENE_DOSSIER_FOOTER_Y_OFFSET,
    SCENE_DOSSIER_HEADER_LINE_HEIGHT,
    SCENE_DOSSIER_HEADER_SIZE,
    SCENE_DOSSIER_HEADER_Y_OFFSET,
    SCENE_DOSSIER_HIDE_DELAY_MS,
    SCENE_DOSSIER_HOVER_DELAY_MS,
    SCENE_DOSSIER_MIN_HEIGHT,
    SCENE_DOSSIER_PADDING_Y,
    SCENE_DOSSIER_SECONDARY_DIVIDER_WIDTH_RATIO,
    SCENE_DOSSIER_SIDE_PADDING,
    SCENE_DOSSIER_SOURCE_GAP,
    SCENE_DOSSIER_SOURCE_LINE_HEIGHT,
    SCENE_DOSSIER_SOURCE_Y_OFFSET,
    SCENE_DOSSIER_TEXT_GROUP_Y,
    SCENE_DOSSIER_TEXT_MAX_WIDTH,
    SCENE_DOSSIER_TITLE_ANCHOR_GAP,
    SCENE_DOSSIER_TITLE_MAX_WIDTH,
    SCENE_DOSSIER_UNBOUNDED_WRAP_LINES,
    SCENE_DOSSIER_WIDTH,
    VIEWBOX_MAX,
    VIEWBOX_MIN,
    VIEWBOX_SIZE
} from './constants/inquiryLayout';
import {
    BRIEFING_HIDE_DELAY_MS,
    BRIEFING_SESSION_LIMIT,
    DEPTH_ICON_PATHS,
    DUPLICATE_PULSE_MS,
    FLOW_ICON_PATHS,
    INQUIRY_CONTEXT_CLASSES,
    INQUIRY_GUIDANCE_DOC_URL,
    INQUIRY_HELP_CONFIG_TOOLTIP,
    INQUIRY_HELP_CORPUS_TOOLTIP,
    INQUIRY_HELP_NO_SCENES_TOOLTIP,
    INQUIRY_HELP_ONBOARDING_TOOLTIP,
    INQUIRY_HELP_RESULTS_TOOLTIP,
    INQUIRY_HELP_RUNNING_SINGLE_TOOLTIP,
    INQUIRY_HELP_RUNNING_TOOLTIP,
    INQUIRY_HELP_TOOLTIP,
    INQUIRY_NOTES_MAX,
    INQUIRY_PROMPT_OVERHEAD_CHARS,
    INQUIRY_REQUIRED_CAPABILITIES,
    REHYDRATE_HIGHLIGHT_MS,
    REHYDRATE_PULSE_MS,
    SIGMA_CHAR,
    SIMULATION_DURATION_MS
} from './constants/inquiryUi';
import {
    InquiryCancelRunModal,
    InquiryOmnibusModal,
    InquiryPurgeConfirmationModal
} from './modals/InquiryViewModals';
import type {
    AiSettingsFocus,
    CorpusCcEntry,
    CorpusCcGroup,
    CorpusCcHeader,
    CorpusCcSlot,
    CorpusCcStats,
    EngineChoice,
    EngineFailureGuidance,
    EngineProvider,
    InquiryBriefModel,
    InquiryGlyphSeed,
    InquiryGuidanceState,
    InquiryOmnibusPlan,
    InquiryOmnibusModalOptions,
    InquiryPurgePreviewItem,
    InquiryPreviewRow,
    InquiryQuestion,
    InquirySceneDossier,
    InquiryWritebackOutcome,
    OmnibusProviderChoice,
    OmnibusProviderPlan
} from './types/inquiryViewTypes';
import {
    buildManifestTocLines,
    buildSceneDossierBodyLines,
    buildSceneDossierHeader,
    formatBriefLabel,
    formatInquiryBriefLink,
    getPendingInquiryActions,
    getSceneNoteSortOrder,
    normalizeInquiryHeadline,
    parseCorpusLabelNumber,
    renderInquiryBrief,
    resolveInquiryScopeIndicator,
    sanitizeDossierText,
    stripInquiryReferenceArtifacts,
    stripNumericTitlePrefix
} from './utils/inquiryViewText';
export class InquiryView extends ItemView {
    static readonly viewType = INQUIRY_VIEW_TYPE;

    public readonly perfCounters = {
        hudTextWrites: 0,
        hudAttrWrites: 0,
        progressUpdateCalls: 0,
        progressDomPatches: 0,
        sweepAttrWrites: 0,
        refreshUICalls: 0,
        refreshCorpusCalls: 0,
        corpusRefreshMs: 0,
        svgTextWrites: 0,
        svgNodeCreates: 0,
        svgNodeReuses: 0,
        svgClearCalls: 0,
        svgAttrWrites: 0
    };

    private setTextIfChanged(el: Element | null | undefined, text: string, counterKey?: keyof InquiryView['perfCounters']): void {
        if (!el || el.textContent === text) return;
        el.textContent = text;
        if (counterKey) this.perfCounters[counterKey]++;
    }

    private toggleClassIfChanged(el: Element | null | undefined, cls: string, force: boolean, counterKey?: keyof InquiryView['perfCounters']): void {
        if (!el || el.classList.contains(cls) === force) return;
        el.classList.toggle(cls, force);
        if (counterKey) this.perfCounters[counterKey]++;
    }

    private updateRunningClockInterval?: number;

    private plugin: RadialTimelinePlugin;
    private state = createDefaultInquiryState();

    private rootSvg?: SVGSVGElement;
    private scopeToggleButton?: SVGGElement;
    private scopeToggleIcon?: SVGUseElement;
    private modeToggleButton?: SVGGElement;
    private modeToggleIcon?: SVGUseElement;
    private artifactButton?: SVGGElement;
    private apiSimulationButton?: SVGGElement;
    private briefingPanelEl?: HTMLDivElement;
    private briefingListEl?: HTMLDivElement;
    private briefingFooterEl?: HTMLDivElement;
    private briefingSaveButton?: HTMLButtonElement;
    private briefingClearButton?: HTMLButtonElement;
    private briefingResetButton?: HTMLButtonElement;
    private briefingPurgeButton?: HTMLButtonElement;
    private briefingEmptyEl?: HTMLDivElement;
    private briefingPinned = false;
    private briefingHideTimer?: number;
    private briefingPurgeAvailabilityKey = '';
    private briefingPurgeAvailable = false;
    private briefingPurgeScanPending = false;
    private briefingPurgeScanToken = 0;
    private engineBadgeGroup?: SVGGElement;
    private enginePanelEl?: HTMLDivElement;
    private enginePanelAllLabelEl?: HTMLDivElement;
    private enginePanelGuardEl?: HTMLDivElement;
    private enginePanelGuardNoteEl?: HTMLDivElement;
    private enginePanelGuardTokenEl?: HTMLElement;
    private enginePanelListEl?: HTMLDivElement;
    private enginePanelMetaEl?: HTMLDivElement;
    private enginePanelReadinessEl?: HTMLDivElement;
    private enginePanelReadinessStatusEl?: HTMLDivElement;
    private enginePanelReadinessCorpusEl?: HTMLDivElement;
    private enginePanelReadinessMessageEl?: HTMLDivElement;
    private enginePanelReadinessActionsEl?: HTMLDivElement;
    private enginePanelReadinessScopeEl?: HTMLDivElement;
    private enginePanelHideTimer?: number;
    private pendingGuardQuestion?: InquiryQuestion;
    private enginePanelFailureGuidance: EngineFailureGuidance | null = null;
    private lastReadinessUiState?: InquiryReadinessUiState;
    private lastEngineAdvisoryContext: InquiryAdvisoryContext | null = null;
    private lastEngineAdvisoryInputKey = '';
    /** Memoized per-refresh-cycle. Invalidated at top of refreshUI(). */
    private _resolvedEngine: ResolvedInquiryEngine | null = null;
    /** Memoized per-refresh-cycle. Invalidated at top of refreshUI(). */
    private _currentCorpusContext: InquiryCurrentCorpusContext | null = null;
    private omnibusAbortRequested = false;
    private activeOmnibusModal?: InquiryOmnibusModal;
    private activeCancelRunModal?: InquiryCancelRunModal;
    private readonly minimap = new InquiryMinimapRenderer();
    private wasRunning = false;
    private zonePromptElements = new Map<InquiryZone, {
        group: SVGGElement;
        bg: SVGRectElement;
        glow: SVGRectElement;
        text: SVGTextElement;
    }>();
    private glyphAnchor?: SVGGElement;
    private glyph?: InquiryGlyph;
    private glyphHit?: SVGRectElement;
    private flowRingHit?: SVGCircleElement;
    private depthRingHit?: SVGCircleElement;
    private flowModeIconEl?: SVGSVGElement;
    private depthModeIconEl?: SVGSVGElement;
    private modeIconToggleHit?: SVGRectElement;
    private findingsTitleEl?: SVGTextElement;
    private summaryEl?: SVGTextElement;
    private verdictEl?: SVGTextElement;
    private findingsListEl?: SVGGElement;
    private detailsToggle?: SVGGElement;
    private detailsIcon?: SVGUseElement;
    private detailsEl?: SVGGElement;
    private detailRows: SVGTextElement[] = [];
    private artifactPreviewEl?: SVGGElement;
    private artifactPreviewBg?: SVGRectElement;
    private hoverTextEl?: SVGTextElement;
    private sceneDossierGroup?: SVGGElement;
    private sceneDossierComposition?: SVGGElement;
    private sceneDossierFocusCore?: SVGCircleElement;
    private sceneDossierFocusGlow?: SVGCircleElement;
    private sceneDossierFocusOutline?: SVGCircleElement;
    private sceneDossierBg?: SVGRectElement;
    private sceneDossierBraceLeft?: SVGTextElement;
    private sceneDossierBraceRight?: SVGTextElement;
    private sceneDossierTextGroup?: SVGGElement;
    private sceneDossierCoreGroup?: SVGGElement;
    private sceneDossierHeader?: SVGTextElement;
    private sceneDossierAnchor?: SVGTextElement;
    private sceneDossierBody?: SVGTextElement;
    private sceneDossierBodySecondary?: SVGTextElement;
    private sceneDossierBodyDivider?: SVGLineElement;
    private sceneDossierFooter?: SVGTextElement;
    private sceneDossierSource?: SVGTextElement;
    private sceneDossierShowTimer?: number;
    private sceneDossierHideTimer?: number;
    private sceneDossierActiveKey?: string;
    private sceneDossierVisible = false;
    private previewGroup?: SVGGElement;
    private previewHero?: SVGTextElement;
    private previewMeta?: SVGTextElement;
    private previewRunningNote?: SVGTextElement;
    private previewFooter?: SVGTextElement;
    private previewClickTarget?: SVGRectElement;
    private previewRows: InquiryPreviewRow[] = [];
    private previewRowDefaultLabels: string[] = [];
    private previewHideTimer?: number;
    private previewLast?: { zone: InquiryZone; question: string };
    private previewLocked = false;
    private previewShimmerGroup?: SVGGElement;
    private previewShimmerMask?: SVGMaskElement;
    private previewShimmerMaskRect?: SVGRectElement;
    private previewPanelHeight = 0;
    private payloadStats?: InquiryPayloadStats;
    private entryBodyCharCache = new Map<string, { mtime: number; chars: number }>();
    private entryBodyCharLoads = new Map<string, Promise<void>>();
    private payloadStatsRefreshTimer?: number;
    private duplicatePulseTimer?: number;
    private rehydratePulseTimer?: number;
    private rehydrateHighlightTimer?: number;
    private rehydrateTargetKey?: string;
    private ccGroup?: SVGGElement;
    private ccLabelGroup?: SVGGElement;
    private ccLabelHit?: SVGRectElement;
    private ccLabel?: SVGTextElement;
    private ccLabelHint?: SVGGElement;
    private ccLabelHintIcon?: SVGUseElement;
    private ccEmptyText?: SVGTextElement;
    private ccClassLabels: CorpusCcHeader[] = [];
    private ccEntries: CorpusCcEntry[] = [];
    private ccSlots: CorpusCcSlot[] = [];
    private ccUpdateId = 0;
    private ccLayout?: { pageWidth: number; pageHeight: number; gap: number };
    private ccWordCache = new Map<string, {
        mtime: number;
        bodyWords: number;
        synopsisWords: number;
        synopsisQuality: SynopsisQuality;
        statusRaw?: string;
        due?: string;
        title?: string;
    }>();
    private corpusService = new InquiryCorpusService();
    private corpusWarningActive = false;
    private apiSimulationTimer?: number;
    private navPrevButton?: SVGGElement;
    private navNextButton?: SVGGElement;
    private navPrevIcon?: SVGUseElement;
    private navNextIcon?: SVGUseElement;
    private navSessionLabel?: SVGTextElement;
    private engineTimerLabel?: SVGTextElement;
    private helpToggleButton?: SVGGElement;
    private helpTipsEnabled = false;
    private iconSymbols = new Set<string>();
    private svgDefs?: SVGDefsElement;
    private providerSecretPresence: Partial<Record<AIProviderId, boolean>> = {};
    private providerSecretProbePending = new Set<AIProviderId>();
    private lastTargetSceneIdsByBookId = new Map<string, string[]>();
    private corpusResolver: InquiryCorpusResolver;
    private corpus?: InquiryCorpusSnapshot;
    private targetPersistTimer?: number;
    private runner: InquiryRunnerService;
    private sessionStore: InquirySessionStore;
    private minimapResultPreviewActive = false;
    private guidanceState: InquiryGuidanceState = 'ready';
    private inquiryRunTokenCounter = 0;
    private activeInquiryRunToken = 0;
    private cancelledInquiryRunTokens = new Set<number>();
    private currentRunProgress: InquiryRunProgressEvent | null = null;
    private currentRunElapsedMs = 0;
    private currentRunEstimatedMaxMs = 0;

    constructor(leaf: WorkspaceLeaf, plugin: RadialTimelinePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.runner = new InquiryRunnerService(this.plugin, this.app.vault, this.app.metadataCache, this.plugin.settings.frontmatterMappings);
        const lastMode = this.plugin.settings.inquiryLastMode;
        if (lastMode === 'flow' || lastMode === 'depth') {
            this.state.mode = lastMode;
        }
        this.ensurePromptConfig();
        this.state.selectedPromptIds = this.buildDefaultSelectedPromptIds();
        this.sessionStore = new InquirySessionStore(plugin);
        this.corpusResolver = new InquiryCorpusResolver(this.app.vault, this.app.metadataCache, this.plugin.settings.frontmatterMappings);
    }

    private registerSvgEvent<TEvent extends Event>(
        element: SVGElement | undefined,
        event: string,
        handler: (event: TEvent) => void,
        options?: boolean | AddEventListenerOptions
    ): void {
        if (!element) return;
        const listener = handler as unknown as EventListener;
        element.addEventListener(event, listener, options);
        this.register(() => element.removeEventListener(event, listener, options));
    }

    private registerBoundDomEvent(
        element: HTMLElement | undefined,
        event: string,
        handler: EventListener,
        options?: boolean | AddEventListenerOptions
    ): void {
        if (!element) return;
        this.registerDomEvent(element, event, handler, options);
    }

    // Lifecycle
    getViewType(): string {
        return INQUIRY_VIEW_TYPE;
    }

    getDisplayText(): string {
        return INQUIRY_VIEW_DISPLAY_TEXT;
    }

    getIcon(): string {
        return 'waves';
    }

    async onOpen(): Promise<void> {
        this.contentEl.empty();
        if (Platform.isMobile) { // SAFE: Platform imported from obsidian at top of file
            this.renderMobileGate();
            return;
        }
        this.loadTargetCache();
        this.renderDesktopLayout();
        this.refreshUI();
    }

    async onClose(): Promise<void> {
        console.log('[InquiryView Performance Counters]', this.perfCounters);
        if (this.updateRunningClockInterval) {
            window.clearInterval(this.updateRunningClockInterval);
            this.updateRunningClockInterval = undefined;
        }
        if (this.targetPersistTimer) {
            window.clearTimeout(this.targetPersistTimer);
            this.targetPersistTimer = undefined;
        }
        if (this.apiSimulationTimer) {
            window.clearTimeout(this.apiSimulationTimer);
            this.apiSimulationTimer = undefined;
        }
        if (this.briefingHideTimer) {
            window.clearTimeout(this.briefingHideTimer);
            this.briefingHideTimer = undefined;
        }
        if (this.enginePanelHideTimer) {
            window.clearTimeout(this.enginePanelHideTimer);
            this.enginePanelHideTimer = undefined;
        }
        if (this.sceneDossierShowTimer) {
            window.clearTimeout(this.sceneDossierShowTimer);
            this.sceneDossierShowTimer = undefined;
        }
        if (this.sceneDossierHideTimer) {
            window.clearTimeout(this.sceneDossierHideTimer);
            this.sceneDossierHideTimer = undefined;
        }
        this.contentEl.empty();
    }

    // Shell Composition
    private renderMobileGate(): void {
        const wrapper = this.contentEl.createDiv({ cls: 'ert-inquiry-mobile ert-ui' });
        wrapper.createDiv({ cls: 'ert-inquiry-mobile-title', text: 'Desktop required' });
        wrapper.createDiv({
            cls: 'ert-inquiry-mobile-subtitle',
            text: 'Inquiry is available on desktop only. Briefs remain readable on mobile.'
        });

        const actions = wrapper.createDiv({ cls: 'ert-inquiry-mobile-actions' });
        const openFolderBtn = actions.createEl('button', { cls: 'ert-inquiry-mobile-btn', text: 'Open Briefs folder' });
        const openLatestBtn = actions.createEl('button', { cls: 'ert-inquiry-mobile-btn', text: 'View most recent Brief' });

        bindInquiryMobileGateEvents({
            registerDomEvent: (element, event, handler, options) => this.registerBoundDomEvent(element, event, handler as EventListener, options),
            openFolderButton: openFolderBtn,
            openLatestButton: openLatestBtn,
            onOpenFolder: () => { void this.openArtifactsFolder(); },
            onOpenLatest: () => { void this.openMostRecentArtifact(); }
        });
    }

    private renderDesktopLayout(): void {
        const shell = createInquiryDesktopShell({
            contentEl: this.contentEl,
            populateDefs: defs => {
                this.svgDefs = defs;
                this.buildIconSymbols(defs);
                this.buildZoneGradients(defs);
                this.buildSceneDossierResources(defs);
            },
            createIconButton: this.createIconButton.bind(this),
            getBackgroundHref: () => this.getInquiryAssetHref('radial_texture.png'),
            buildDebugOverlay: this.buildDebugOverlay.bind(this)
        });
        this.rootSvg = shell.rootSvg;
        this.scopeToggleButton = shell.scopeToggleButton;
        this.scopeToggleIcon = shell.scopeToggleIcon;
        this.artifactButton = shell.artifactButton;
        this.apiSimulationButton = shell.apiSimulationButton;
        this.helpToggleButton = shell.helpToggleButton;
        this.engineBadgeGroup = shell.engineBadgeGroup;
        this.engineTimerLabel = shell.engineTimerLabel;
        this.navPrevButton = shell.navPrevButton;
        this.navNextButton = shell.navNextButton;
        this.navPrevIcon = shell.navPrevIcon;
        this.navNextIcon = shell.navNextIcon;
        this.navSessionLabel = shell.navSessionLabel;

        setupTooltipsFromDataAttributes(this.rootSvg, this.registerDomEvent.bind(this), { rtOnly: true });
        this.minimap.initElements(shell.minimapGroup, VIEWBOX_SIZE);
        this.renderModeIcons(shell.minimapGroup);

        this.glyphAnchor = shell.glyphAnchor;
        const glyphSeed = this.resolveGlyphSeed();
        this.glyph = new InquiryGlyph(this.glyphAnchor, {
            scopeLabel: this.getScopeLabel(),
            flowValue: glyphSeed.flowValue,
            depthValue: glyphSeed.depthValue,
            flowVisualValue: glyphSeed.flowVisualValue,
            depthVisualValue: glyphSeed.depthVisualValue,
            impact: glyphSeed.impact,
            assessmentConfidence: glyphSeed.assessmentConfidence
        });

        this.flowRingHit = this.glyph.flowRingHit;
        this.depthRingHit = this.glyph.depthRingHit;
        this.glyphHit = this.glyph.labelHit;

        this.buildPromptPreviewPanel(shell.canvasGroup);
        this.buildSceneDossierLayer(this.rootSvg, SCENE_DOSSIER_CANVAS_Y);
        bindInquiryDesktopShellEvents({
            registerDomEvent: (element, event, handler, options) => this.registerBoundDomEvent(element, event, handler as EventListener, options),
            registerSvgEvent: this.registerSvgEvent.bind(this),
            contentEl: this.contentEl,
            scopeToggleButton: this.scopeToggleButton,
            apiSimulationButton: this.apiSimulationButton,
            helpToggleButton: this.helpToggleButton,
            artifactButton: this.artifactButton,
            engineBadgeGroup: this.engineBadgeGroup,
            glyphHit: this.glyphHit,
            flowRingHit: this.flowRingHit,
            depthRingHit: this.depthRingHit,
            modeIconToggleHit: this.modeIconToggleHit,
            navPrevButton: this.navPrevButton,
            navNextButton: this.navNextButton,
            onBackgroundClick: (event: MouseEvent) => {
                if (!this.isErrorState()) return;
                const target = event.target;
                if (!(target instanceof Element)) return;
                const backgroundTarget = target.closest('.ert-inquiry-bg, .ert-inquiry-bg-image');
                if (!backgroundTarget) return;
                this.dismissError();
            },
            onScopeToggle: () => this.handleScopeChange(this.state.scope === 'book' ? 'saga' : 'book'),
            onApiSimulation: () => this.startApiSimulation(),
            onHelpToggle: () => this.handleGuidanceHelpClick(),
            onArtifactEnter: () => this.showBriefingPanel(),
            onArtifactLeave: () => this.scheduleBriefingHide(),
            onArtifactClick: () => this.toggleBriefingPanel(),
            onEngineEnter: () => this.showEnginePanel(),
            onEngineLeave: () => this.scheduleEnginePanelHide(),
            onEngineClick: () => this.openAiSettings(),
            onGlyphClick: () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.handleGlyphClick();
            },
            onFlowRingClick: () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.handleRingClick('flow');
            },
            onDepthRingClick: () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.handleRingClick('depth');
            },
            onModeIconClick: () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.handleModeIconToggleClick();
            },
            onModeIconEnter: () => {
                if (this.isInquiryGuidanceLockout() || this.state.isRunning) return;
                this.setModeIconHoverState(true);
                this.setHoverText(this.buildModeToggleHoverText());
            },
            onModeIconLeave: () => {
                this.setModeIconHoverState(false);
                if (this.isInquiryGuidanceLockout()) return;
                this.clearHoverText();
            },
            onModeIconKeydown: (event: KeyboardEvent) => {
                if (this.isInquiryGuidanceLockout()) return;
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                this.handleModeIconToggleClick();
            },
            onGlyphEnter: () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.setHoverText(this.buildScopeHoverText());
            },
            onGlyphLeave: () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.clearHoverText();
            },
            onFlowRingEnter: () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.setHoverText(this.buildRingHoverText('flow'));
            },
            onFlowRingLeave: () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.clearHoverText();
            },
            onDepthRingEnter: () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.setHoverText(this.buildRingHoverText('depth'));
            },
            onDepthRingLeave: () => {
                if (this.isInquiryGuidanceLockout()) return;
                this.clearHoverText();
            },
            onNavPrev: () => this.shiftFocus(-1),
            onNavNext: () => this.shiftFocus(1)
        });

        this.buildBriefingPanel();
        this.buildEnginePanel();
    }

    private buildPromptPreviewPanel(parent: SVGGElement): void {
        const refs = createInquiryPromptPreviewPanel({
            parent,
            ensurePreviewShimmerResources: (panel) => {
                this.ensurePreviewShimmerResources(panel);
                return {
                    mask: this.previewShimmerMask,
                    maskRect: this.previewShimmerMaskRect
                };
            }
        });
        this.previewGroup = refs.previewGroup;
        this.previewRunningNote = refs.previewRunningNote;
        this.previewHero = refs.previewHero;
        this.previewMeta = refs.previewMeta;
        this.previewFooter = refs.previewFooter;
        this.previewClickTarget = refs.previewClickTarget;
        this.previewRows = refs.previewRows;
        this.previewRowDefaultLabels = refs.previewRowDefaultLabels;
        this.previewShimmerGroup = refs.previewShimmerGroup;

        bindInquiryPreviewPanelEvents({
            registerSvgEvent: this.registerSvgEvent.bind(this),
            previewGroup: this.previewGroup,
            onClick: (event: MouseEvent) => {
                if (this.state.isRunning) {
                    event.stopPropagation();
                    void this.handleRunningPreviewCancelClick();
                    return;
                }
                if (this.isErrorState()) {
                    event.stopPropagation();
                    void this.openInquiryErrorLog();
                    return;
                }
                if (!this.isResultsState()) return;
                event.stopPropagation();
                this.dismissResults();
            }
        });

        this.updatePromptPreview('setup', this.state.mode, 'Hover a question to preview its payload.', undefined, undefined, { hideEmpty: true });
        this.hidePromptPreview(true);
    }

    private buildBriefingPanel(): void {
        if (this.briefingPanelEl) return;
        const refs = createInquiryBriefingPanel(this.contentEl);
        this.briefingPanelEl = refs.briefingPanelEl;
        this.briefingListEl = refs.briefingListEl;
        this.briefingEmptyEl = refs.briefingEmptyEl;
        this.briefingFooterEl = refs.briefingFooterEl;
        this.briefingSaveButton = refs.briefingSaveButton;
        this.briefingClearButton = refs.briefingClearButton;
        this.briefingResetButton = refs.briefingResetButton;
        this.briefingPurgeButton = refs.briefingPurgeButton;

        bindInquiryBriefingPanelEvents({
            registerDomEvent: (element, event, handler, options) => this.registerBoundDomEvent(element, event, handler as EventListener, options),
            briefingPanelEl: this.briefingPanelEl,
            briefingSaveButton: this.briefingSaveButton,
            briefingClearButton: this.briefingClearButton,
            briefingResetButton: this.briefingResetButton,
            briefingPurgeButton: this.briefingPurgeButton,
            onSaveClick: (event: MouseEvent) => {
                event.stopPropagation();
                void this.handleBriefingSaveClick();
            },
            onClearClick: (event: MouseEvent) => {
                event.stopPropagation();
                this.handleBriefingClearClick();
            },
            onResetClick: (event: MouseEvent) => {
                event.stopPropagation();
                this.handleBriefingResetCorpusClick();
            },
            onPurgeClick: (event: MouseEvent) => {
                event.stopPropagation();
                void this.handleBriefingPurgeClick();
            },
            onPointerEnter: () => this.cancelBriefingHide(),
            onPointerLeave: () => this.scheduleBriefingHide()
        });
        this.refreshBriefingPanel();
        void this.refreshBriefingPurgeAvailability();
    }

    private buildEnginePanel(): void {
        if (this.enginePanelEl) return;
        const refs = createInquiryEnginePanel(this.contentEl);
        this.enginePanelEl = refs.enginePanelEl;
        this.enginePanelMetaEl = refs.enginePanelMetaEl;
        this.enginePanelReadinessEl = refs.enginePanelReadinessEl;
        this.enginePanelReadinessStatusEl = refs.enginePanelReadinessStatusEl;
        this.enginePanelReadinessCorpusEl = refs.enginePanelReadinessCorpusEl;
        this.enginePanelReadinessMessageEl = refs.enginePanelReadinessMessageEl;
        this.enginePanelReadinessScopeEl = refs.enginePanelReadinessScopeEl;
        this.enginePanelReadinessActionsEl = refs.enginePanelReadinessActionsEl;
        this.enginePanelGuardEl = refs.enginePanelGuardEl;
        this.enginePanelGuardNoteEl = refs.enginePanelGuardNoteEl;
        this.enginePanelListEl = refs.enginePanelListEl;
        bindInquiryEnginePanelEvents({
            registerDomEvent: (element, event, handler, options) => this.registerBoundDomEvent(element, event, handler as EventListener, options),
            enginePanelEl: this.enginePanelEl,
            onPointerEnter: () => this.cancelEnginePanelHide(),
            onPointerLeave: () => this.scheduleEnginePanelHide()
        });
        this.refreshEnginePanel();
    }

    // Engine Orchestration
    private showEnginePanel(): void {
        if (!this.enginePanelEl) return;
        this.cancelEnginePanelHide();
        this.refreshEnginePanel();
        if (this.engineBadgeGroup) this.positionPanelNearButton(this.enginePanelEl, this.engineBadgeGroup, 'left');
        this.enginePanelEl.classList.remove('ert-hidden');
    }

    private hideEnginePanel(): void {
        if (!this.enginePanelEl) return;
        this.cancelEnginePanelHide();
        this.enginePanelEl.classList.add('ert-hidden');
    }

    private scheduleEnginePanelHide(): void {
        this.cancelEnginePanelHide();
        this.enginePanelHideTimer = window.setTimeout(() => {
            this.hideEnginePanel();
        }, BRIEFING_HIDE_DELAY_MS);
    }

    private cancelEnginePanelHide(): void {
        if (this.enginePanelHideTimer) {
            window.clearTimeout(this.enginePanelHideTimer);
            this.enginePanelHideTimer = undefined;
        }
    }

    /**
     * Render the engine panel as a read-only status/diagnostics display.
     *
     * Shows the resolved engine from canonical AI Strategy (not a model picker).
     * Inquiry does not choose models — it reports the resolved engine.
     */
    private refreshEnginePanel(): void {
        if (!this.enginePanelListEl) return;
        this.enginePanelListEl.empty();

        const engine = this.getResolvedEngine();
        const readinessUi = this.buildReadinessUiState();
        this.lastReadinessUiState = readinessUi;
        const advisoryContext = this.buildInquiryAdvisoryContext(readinessUi);
        this.lastEngineAdvisoryContext = advisoryContext;

        const failureGuidance = this.getEngineFailureGuidance();
        this.enginePanelFailureGuidance = failureGuidance;

        // ── 1. Header summary (non-repeated) ──
        if (this.enginePanelMetaEl) {
            this.enginePanelMetaEl.setText(`${engine.providerLabel} · ${engine.modelLabel}`);
        }

        // ── 2. Status card (readiness strip) ──
        renderInquiryEngineReadinessStrip({
            readinessEl: this.enginePanelReadinessEl,
            readinessStatusEl: this.enginePanelReadinessStatusEl,
            readinessCorpusEl: this.enginePanelReadinessCorpusEl,
            readinessMessageEl: this.enginePanelReadinessMessageEl,
            readinessActionsEl: this.enginePanelReadinessActionsEl,
            readinessScopeEl: this.enginePanelReadinessScopeEl,
            popoverState: this.resolveEnginePopoverState(readinessUi),
            blocked: !!engine.blocked,
            corpusSummary: buildInquiryEngineCorpusSummary(this.getRTCorpusEstimate(), this.formatApproxCorpusTokens.bind(this)),
            passPlan: this.getCurrentPassPlan(readinessUi),
            readinessCause: readinessUi.readiness.cause,
            readinessReason: readinessUi.reason,
            runScopeLabel: this.getEngineRunScopeLabel(readinessUi.runScopeLabel)
        });

        // ── Guard (error/failure guidance) ──
        if (this.enginePanelGuardEl) {
            const showGuard = Boolean(failureGuidance);
            this.enginePanelGuardEl.classList.toggle('ert-hidden', !showGuard);
            this.enginePanelGuardEl.classList.toggle('is-error-guidance', Boolean(failureGuidance));
            if (this.enginePanelGuardNoteEl && failureGuidance) {
                this.enginePanelGuardNoteEl.empty();
                this.enginePanelGuardTokenEl = undefined;
                this.enginePanelGuardNoteEl.setText(failureGuidance.message);
            }
        }

        // ── 3. Advisor slot ──
        const advisorSlot = this.enginePanelListEl.createDiv({ cls: 'ert-inquiry-engine-advisor-slot' });
        if (advisoryContext) {
            renderInquiryEngineAdvisoryCard(advisorSlot, advisoryContext);
        }

        // ── 4. Action row ──
        const { settingsButton, logButton } = createInquiryEngineActionButtons(this.enginePanelListEl);
        bindInquiryEngineActionButtons({
            registerDomEvent: (element, event, handler, options) => this.registerBoundDomEvent(element, event, handler as EventListener, options),
            settingsButton,
            logButton,
            onSettingsClick: (event: MouseEvent) => {
                event.stopPropagation();
                this.hideEnginePanel();
                this.openAiSettings(['provider']);
            },
            onLogClick: (event: MouseEvent) => {
                event.stopPropagation();
                this.hideEnginePanel();
                void this.openInquiryErrorLog();
            }
        });
    }

    private openAiSettings(targets: AiSettingsFocus[] = []): void {
        if (this.plugin.settingsTab) {
            this.plugin.settingsTab.setActiveTab('ai');
        }
        // SAFE: any type used for accessing Obsidian's internal settings API
        const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
        if (setting) {
            setting.open();
            setting.openTabById('radial-timeline');
        }
        window.setTimeout(() => {
            const uniqueTargets = Array.from(new Set(targets));
            uniqueTargets.forEach((target, index) => {
                window.setTimeout(() => this.scrollAndPulseAiSetting(target, index === 0), index * 120);
            });
        }, 180);
    }

    private scrollAndPulseAiSetting(target: AiSettingsFocus, shouldScroll: boolean): void {
        const el = document.querySelector(`[data-ert-role="ai-setting:${target}"]`);
        if (!(el instanceof HTMLElement)) return;
        if (shouldScroll) {
            el.scrollIntoView({ block: 'center' });
        }
        el.classList.remove('is-attention-pulse');
        void el.offsetWidth;
        el.classList.add('is-attention-pulse');
        window.setTimeout(() => {
            el.classList.remove('is-attention-pulse');
        }, 2600);
    }

    private getEngineFailureGuidance(): EngineFailureGuidance | null {
        const result = this.state.activeResult;
        if (!result) return null;
        if (!this.isErrorResult(result)) return null;
        const reason = this.formatApiErrorReason(result);
        const reasonSuffix = reason ? ` (${reason})` : '';
        return {
            message: `Inquiry failed${reasonSuffix}. Use Open Inquiry Log in the footer for the detailed error report.`
        };
    }

    private getEngineContextQuestion(): string | null {
        if (this.pendingGuardQuestion) {
            return this.resolveQuestionPromptForRun(
                this.pendingGuardQuestion,
                this.getSelectionMode(this.getActiveTargetSceneIds())
            );
        }
        const activeQuestion = this.getQuestionTextById(this.state.activeQuestionId);
        return activeQuestion ?? null;
    }

    private buildEnginePayloadSummary(): {
        text: string;
        inputTokens: number;
        tier: TokenTier;
    } {
        const currentCorpus = this.getCurrentCorpusContext();
        return {
            text: currentCorpus.corpus.estimatedTokens > 0
                ? `Inquiry Corpus: ~${this.formatTokenEstimate(currentCorpus.corpus.estimatedTokens)}`
                : 'Inquiry Corpus: Estimating…',
            inputTokens: currentCorpus.corpus.estimatedTokens,
            tier: this.getTokenTier(currentCorpus.corpus.estimatedTokens)
        };
    }

    private getRTCorpusEstimate(): RTCorpusTokenEstimate {
        return this.getCurrentCorpusContext().corpus;
    }

    public getCurrentCorpusContext(): InquiryCurrentCorpusContext {
        if (this._currentCorpusContext) {
            return this._currentCorpusContext;
        }
        const entryList = this.buildCorpusEntryList('current-corpus', {
            contextRequired: false,
            includeInactive: false,
            applyOverrides: true
        });
        const fingerprintSource = entryList.entries
            .map(entry => `${entry.path}:${entry.sceneId ?? ''}:${entry.mtime}:${entry.mode}:${entry.isTarget ? 1 : 0}`)
            .sort()
            .join('|');
        const manifestFingerprint = this.hashString(`current-corpus|${fingerprintSource}`);
        const stats = this.buildPayloadStatsFromEntries(entryList.entries, entryList.resolvedRoots, manifestFingerprint, false);
        this._currentCorpusContext = {
            scope: this.state.scope,
            activeBookId: stats.activeBookId,
            scopeLabel: this.getScopeLabel(),
            corpus: buildRTCorpusEstimate(stats),
            manifestEntries: entryList.entries.map(entry => ({ ...entry }))
        };
        return this._currentCorpusContext;
    }

    private buildInquiryAdvisoryContext(
        readinessUi: InquiryReadinessUiState
    ): InquiryAdvisoryContext | null {
        if (readinessUi.pending) return null;
        const snapshot = this.plugin.getInquiryEstimateService().getSnapshot();
        if (!snapshot) return null;

        const engine = this.getResolvedEngine();
        const currentModel = readinessUi.model
            ?? BUILTIN_MODELS.find(model => model.provider === engine.provider && model.id === engine.modelId)
            ?? null;
        if (!currentModel) return null;

        const advancedContext = getLastAiAdvancedContext(this.plugin, 'InquiryMode');
        const corpusFingerprint = snapshot.corpus.corpusFingerprint || this.state.corpusFingerprint || 'unknown';
        const corpusFingerprintReused = advancedContext?.reuseState === 'warm';
        const overrideSummary = this.getCorpusOverrideSummary();
        const estimatedInputTokens = snapshot.estimate.estimatedInputTokens;
        const advisoryInputKey = buildAdvisoryInputKey({
            scope: this.state.scope,
            scopeLabel: this.getScopeLabel(),
            provider: engine.provider,
            modelId: engine.modelId,
            packaging: readinessUi.packaging,
            estimatedInputTokens,
            estimateMethod: readinessUi.estimateMethod,
            estimateUncertaintyTokens: readinessUi.estimateUncertaintyTokens,
            corpusFingerprint,
            overrideSummary,
            corpusFingerprintReused
        });
        if (this.lastEngineAdvisoryInputKey === advisoryInputKey) {
            return this.lastEngineAdvisoryContext;
        }

        const advisory = computeInquiryAdvisoryContext({
            scope: this.state.scope,
            scopeLabel: this.getScopeLabel(),
            resolvedEngine: engine,
            currentModel,
            models: BUILTIN_MODELS,
            analysisPackaging: readinessUi.packaging,
            estimatedInputTokens,
            currentSafeInputBudget: readinessUi.safeInputBudget,
            estimationMethod: readinessUi.estimateMethod,
            estimateUncertaintyTokens: readinessUi.estimateUncertaintyTokens,
            corpusFingerprint,
            corpusFingerprintReused,
            overrideSummary,
            previousContext: this.lastEngineAdvisoryContext
        });
        this.lastEngineAdvisoryInputKey = advisoryInputKey;
        return advisory;
    }

    private getCurrentPromptQuestion(): string | null {
        const activeZone = this.state.activeZone ?? 'setup';
        const activePrompt = this.getActivePrompt(activeZone);
        if (activePrompt) {
            return this.resolveQuestionPromptForRun(activePrompt, this.getSelectionMode(this.getActiveTargetSceneIds())).trim();
        }
        const fallback = this.getPromptOptions('setup')[0];
        return fallback
            ? this.resolveQuestionPromptForRun(fallback, this.getSelectionMode(this.getActiveTargetSceneIds())).trim()
            : null;
    }

    private getCanonicalActiveBookId(): string | undefined {
        if (this.state.scope !== 'book') return undefined;
        return this.corpus?.activeBookId ?? this.state.activeBookId ?? this.corpus?.books?.[0]?.id;
    }

    private getCanonicalAiSettings(): AiSettingsV1 {
        const validated = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings());
        this.plugin.settings.aiSettings = validated.value;
        return validated.value;
    }

    private getAccessTierForProvider(provider: AIProviderId, aiSettings: AiSettingsV1): AccessTier {
        if (provider === 'anthropic') return aiSettings.aiAccessProfile.anthropicTier ?? 1;
        if (provider === 'openai') return aiSettings.aiAccessProfile.openaiTier ?? 1;
        if (provider === 'google') return aiSettings.aiAccessProfile.googleTier ?? 1;
        return 1;
    }

    private buildReadinessUiState(): InquiryReadinessUiState {
        const engine = this.getResolvedEngine();
        const provider = engine.provider === 'none' ? 'openai' as const : engine.provider;
        const aiSettings = this.getCanonicalAiSettings();
        return buildReadinessUiStatePure({
            snapshot: this.plugin.getInquiryEstimateService().getSnapshot(),
            scope: this.state.scope,
            scopeLabel: this.getScopeLabel(),
            aiSettings,
            resolvedEngine: engine,
            hasCredential: engine.provider !== 'none' && this.getProviderAvailability(provider).enabled,
            accessTier: this.getAccessTierForProvider(provider, aiSettings),
            payloadStats: this.getPayloadStats(),
            selectedSceneOverrideCount: this.getSelectedSceneOverrideEntries().length,
            hasAnyBodyEvidence: this.hasAnyBodyEvidence(),
            estimateSummaryOnlyTokens: this.estimateSummaryOnlyTokens('')
        });
    }

    private buildRunScopeLabel(stats: InquiryPayloadStats, selectedSceneCount: number): string {
        return buildRunScopeLabelPure(stats, selectedSceneCount, this.state.scope, this.getScopeLabel());
    }

    private resolveEnginePopoverState(readinessUi: InquiryReadinessUiState): InquiryEnginePopoverState {
        return resolveEnginePopoverStatePure(readinessUi);
    }

    private getCurrentPassPlan(readinessUi: InquiryReadinessUiState): PassPlanResult {
        return getCurrentPassPlanPure(readinessUi, getLastAiAdvancedContext(this.plugin, 'InquiryMode'));
    }

    private getEngineRunScopeLabel(runScopeLabel: string): string {
        if (this.state.scope !== 'book') return runScopeLabel;
        if (/^Run on \d+ scenes \(/.test(runScopeLabel)) return runScopeLabel;
        const bookTitle = this.getActiveBookTitleForMessages()?.trim();
        if (!bookTitle) return runScopeLabel;
        return runScopeLabel.replace(/^Run on Book\s+.+?\s+\(/, `Run on ${bookTitle} (`);
    }

    private hasAnyBodyEvidence(): boolean {
        const stats = this.getPayloadStats();
        return stats.sceneFullTextCount > 0 || stats.bookOutlineFullCount > 0 || stats.sagaOutlineFullCount > 0;
    }

    private estimateSummaryOnlyTokens(questionText: string): number {
        const manifest = this.buildCorpusManifest('payload-preview', {
            questionZone: this.previewLast?.zone,
            applyOverrides: true
        });
        const summaryChars = manifest.entries.reduce((sum, entry) => {
            const isSynopsisCapable = entry.class === 'scene' || entry.class === 'outline';
            if (!isSynopsisCapable) {
                return sum + this.getEntryContentLength(entry);
            }
            const summary = this.getEntrySummary(entry.path);
            if (summary.length > 0) {
                return sum + summary.length;
            }
            return sum + this.getEntryContentLength(entry);
        }, 0);
        return this.estimateTokensFromChars(summaryChars + (questionText?.length ?? 0) + INQUIRY_PROMPT_OVERHEAD_CHARS);
    }

    private getSelectedSceneOverrideEntries(): Array<{ entryKey: string; mode: SceneInclusion }> {
        const entries = this.getCorpusCcEntries().filter(entry => entry.classKey === 'scene');
        const selected: Array<{ entryKey: string; mode: SceneInclusion }> = [];
        entries.forEach(entry => {
            const override = this.getCorpusItemOverride(entry.classKey, entry.filePath, entry.scope, entry.sceneId);
            if (!override || !this.isModeActive(override)) return;
            selected.push({ entryKey: entry.entryKey, mode: override });
        });
        return selected;
    }

    /** Position an HTML panel near an SVG trigger button, anchored left or right. */
    private positionPanelNearButton(panel: HTMLElement, button: SVGElement, align: 'left' | 'right'): void {
        const containerRect = this.contentEl.getBoundingClientRect();
        const btnRect = (button as unknown as Element).getBoundingClientRect();
        if (align === 'right') {
            // Align panel's right edge with the button's right edge
            const rightOffset = containerRect.right - btnRect.right;
            panel.style.left = '';
            panel.style.right = `${Math.max(0, rightOffset)}px`;
        } else {
            // Align panel's left edge with the button's left edge
            const leftOffset = btnRect.left - containerRect.left;
            panel.style.right = '';
            panel.style.left = `${Math.max(0, leftOffset)}px`;
        }
    }

    // Briefing Orchestration
    private showBriefingPanel(): void {
        if (!this.briefingPanelEl) return;
        this.cancelBriefingHide();
        this.refreshBriefingPanel();
        void this.refreshBriefingPurgeAvailability();
        if (this.artifactButton) this.positionPanelNearButton(this.briefingPanelEl, this.artifactButton, 'right');
        this.briefingPanelEl.classList.remove('ert-hidden');
    }

    private hideBriefingPanel(force = false): void {
        if (!this.briefingPanelEl) return;
        if (this.briefingPinned && !force) return;
        this.cancelBriefingHide();
        this.briefingPanelEl.classList.add('ert-hidden');
    }

    private toggleBriefingPanel(): void {
        if (!this.briefingPanelEl) return;
        if (this.briefingPinned) {
            this.briefingPinned = false;
            this.hideBriefingPanel(true);
            return;
        }
        this.briefingPinned = true;
        this.showBriefingPanel();
    }

    private scheduleBriefingHide(): void {
        if (this.briefingPinned) return;
        this.cancelBriefingHide();
        this.briefingHideTimer = window.setTimeout(() => {
            this.hideBriefingPanel(true);
        }, BRIEFING_HIDE_DELAY_MS);
    }

    private cancelBriefingHide(): void {
        if (this.briefingHideTimer) {
            window.clearTimeout(this.briefingHideTimer);
            this.briefingHideTimer = undefined;
        }
    }

    private refreshBriefingPanel(): void {
        if (!this.briefingListEl || !this.briefingEmptyEl || !this.briefingFooterEl) return;
        this.briefingListEl.empty();
        const sessions = this.sessionStore.getRecentSessions(BRIEFING_SESSION_LIMIT);
        const hasSessions = sessions.length > 0;
        const blocked = this.isInquiryBlocked();
        if (!hasSessions) {
            this.briefingEmptyEl.classList.remove('ert-hidden');
        } else {
            this.briefingEmptyEl.classList.add('ert-hidden');
            const sections = buildInquiryBriefingSections(sessions);
            sections.forEach(section => {
                if (!section.sessions.length) return;
                const groupEl = this.briefingListEl?.createDiv({ cls: 'ert-inquiry-briefing-group' });
                if (!groupEl) return;
                groupEl.createDiv({ cls: 'ert-inquiry-briefing-group-label', text: section.label });
                const groupList = groupEl.createDiv({ cls: 'ert-inquiry-briefing-group-list' });
                section.sessions.forEach(session => this.renderBriefingSessionItem(groupList, session, blocked));
            });
        }

        this.briefingClearButton?.classList.remove('ert-hidden');
        this.briefingFooterEl.classList.remove('ert-hidden');
        this.updateBriefingFooterActionStates();
    }

    private renderBriefingSessionItem(container: HTMLElement, session: InquirySession, blocked: boolean): void {
        const zoneId = session.questionZone ?? this.findPromptZoneById(session.result.questionId) ?? 'setup';
        const overrideLabel = this.formatSessionOverrides(session);
        const metaText = `${this.formatSessionScope(session)} · ${this.formatSessionProviderModel(session)} · ${this.formatSessionTime(session)}${overrideLabel ? ` · ${overrideLabel}` : ''}`;
        const status = this.resolveSessionStatus(session);
        const pendingEditsApplied = !!session.pendingEditsApplied;
        const autoPopulateEnabled = this.plugin.settings.inquiryActionNotesAutoPopulate ?? false;
        const fieldLabel = this.resolveInquiryActionNotesFieldLabel();
        const refs = renderInquiryBriefingSessionItem({
            container,
            zoneId,
            isRehydrateTarget: session.key === this.rehydrateTargetKey,
            isActive: session.key === this.state.activeSessionId,
            questionLabel: this.resolveSessionQuestionLabel(session),
            metaText,
            status,
            blocked,
            pendingEditsApplied,
            autoPopulateEnabled,
            fieldLabel,
            hasBriefPath: !!session.briefPath
        });
        bindInquiryBriefingSessionItemEvents({
            registerDomEvent: (element, event, handler, options) => this.registerBoundDomEvent(element, event, handler as EventListener, options),
            item: refs.item,
            updateButton: refs.updateButton,
            openButton: refs.openButton,
            onItemClick: () => {
                this.activateSession(session);
                this.briefingPinned = false;
                this.hideBriefingPanel(true);
            },
            onUpdateClick: (event: MouseEvent) => {
                event.stopPropagation();
                if (pendingEditsApplied) return;
                void this.handleBriefingPendingEditsClick(session);
            },
            onOpenClick: (event: MouseEvent) => {
                event.stopPropagation();
                void this.openBriefFromSession(session);
            }
        });
    }

    // Session / Briefing Helpers

    private resolveSessionStatus(session: InquirySession, options?: { simulated?: boolean }): InquirySessionStatus {
        if (options?.simulated) return 'simulated';
        if (session.status) return session.status;
        if (this.isErrorResult(session.result)) return 'error';
        if (session.briefPath) return 'saved';
        return 'unsaved';
    }

    private resolveSessionStatusFromResult(result: InquiryResult, options?: { simulated?: boolean }): InquirySessionStatus {
        if (options?.simulated) return 'simulated';
        if (this.isErrorResult(result)) return 'error';
        return 'unsaved';
    }

    private resolveSessionZoneLabel(session: InquirySession): string {
        const zone = session.questionZone ?? this.findPromptZoneById(session.result.questionId) ?? 'setup';
        return zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
    }

    private resolveSessionLensLabel(session: InquirySession, zoneLabel: string): string {
        const promptLabel = this.findPromptLabelById(session.result.questionId);
        if (promptLabel && promptLabel.toLowerCase() !== zoneLabel.toLowerCase()) {
            return promptLabel;
        }
        return session.result.mode === 'depth' ? 'Depth' : 'Flow';
    }

    private resolveSessionQuestionLabel(session: InquirySession): string {
        const zoneLabel = this.resolveSessionZoneLabel(session);
        const promptLabel = this.findPromptLabelById(session.result.questionId)?.trim();
        if (promptLabel) return `${zoneLabel}: ${promptLabel}`;
        if (session.result.questionId?.trim()) return `${zoneLabel}: ${session.result.questionId.trim()}`;
        return `${zoneLabel}: ${this.resolveSessionLensLabel(session, zoneLabel)}`;
    }

    private formatSessionProviderModel(session: InquirySession): string {
        const providerRaw = session.result.aiProvider?.trim().toLowerCase();
        const model = (session.result.aiModelResolved || session.result.aiModelRequested || '').trim();
        if (!providerRaw && !model) return 'Engine unknown';
        const provider = providerRaw === 'openai'
            ? 'OpenAI'
            : providerRaw === 'anthropic'
                ? 'Anthropic'
                : providerRaw === 'google'
                    ? 'Google'
                    : providerRaw === 'ollama'
                        ? 'Ollama'
                        : (providerRaw ? providerRaw.charAt(0).toUpperCase() + providerRaw.slice(1) : 'Provider unknown');
        return model ? `${provider}/${model}` : provider;
    }

    private formatSessionTime(session: InquirySession): string {
        const timestamp = session.createdAt || session.lastAccessed;
        const date = new Date(timestamp);
        const raw = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        return raw.replace(/\s+/g, '').toLowerCase();
    }

    private formatSessionScope(session: InquirySession): string {
        const scopeLabel = session.result.scope === 'saga' ? 'Saga' : 'Book';
        const focus = session.result.scopeLabel || '';
        return `${scopeLabel} ${focus}`.trim();
    }

    private formatSessionOverrides(session: InquirySession): string | null {
        const result = session.result;
        if (!result?.corpusOverridesActive) return null;
        const summary = result.corpusOverrideSummary;
        if (!summary) return 'Overrides on';
        return `Overrides ${summary.classCount}c/${summary.itemCount}i`;
    }

    private updateBriefingButtonState(): void {
        if (!this.artifactButton) return;
        const activeSession = this.state.activeSessionId
            ? this.sessionStore.peekSession(this.state.activeSessionId)
            : undefined;
        const status = activeSession ? this.resolveSessionStatus(activeSession) : null;
        this.artifactButton.classList.toggle('is-briefing-pulse', status === 'unsaved');
        this.artifactButton.classList.toggle('is-briefing-saved', status === 'saved');
        this.artifactButton.classList.toggle('is-briefing-error', status === 'error');
        // Briefing manager has its own full panel on hover/click; keep this icon tooltip-free.
        this.artifactButton.removeAttribute('data-rt-tip');
        this.artifactButton.removeAttribute('data-rt-tip-placement');
    }

    private shouldAutoSaveBriefs(): boolean {
        return this.plugin.settings.inquiryAutoSave ?? true;
    }

    private canManuallySaveActiveBrief(): boolean {
        if (this.shouldAutoSaveBriefs()) return false;
        const activeSession = this.state.activeSessionId
            ? this.sessionStore.peekSession(this.state.activeSessionId)
            : undefined;
        return !!activeSession && this.resolveSessionStatus(activeSession) === 'unsaved';
    }

    private getBriefingPurgeAvailabilityKey(): string {
        const scenes = this.corpus?.scenes ?? [];
        if (!scenes.length) return '';
        const sceneKey = scenes.map(scene => scene.filePath || scene.displayLabel).join('\u001f');
        return [
            this.state.scope,
            this.corpus?.activeBookId ?? '',
            this.resolveInquiryActionNotesFieldLabel(),
            sceneKey
        ].join('::');
    }

    private invalidateBriefingPurgeAvailability(): void {
        this.briefingPurgeAvailabilityKey = '';
        this.briefingPurgeAvailable = false;
        this.briefingPurgeScanPending = false;
        this.briefingPurgeScanToken++;
    }

    private updateBriefingFooterActionStates(): void {
        const blocked = this.isInquiryBlocked();
        const lockout = this.isInquiryGuidanceLockout();
        const running = this.state.isRunning;
        const canSave = this.canManuallySaveActiveBrief();
        const canPurge = this.briefingPurgeAvailable;

        if (this.briefingSaveButton) {
            this.briefingSaveButton.disabled = blocked || lockout || running || !canSave;
        }
        if (this.briefingClearButton) {
            this.briefingClearButton.disabled = lockout || running;
        }
        if (this.briefingResetButton) {
            this.briefingResetButton.disabled = lockout || running || !this.hasCorpusOverrides();
        }
        if (this.briefingPurgeButton) {
            this.briefingPurgeButton.disabled = lockout || running || !canPurge;
            this.briefingPurgeButton.classList.toggle('is-inert', !canPurge);
        }
    }

    private async refreshBriefingPurgeAvailability(): Promise<void> {
        const scanKey = this.getBriefingPurgeAvailabilityKey();
        if (!scanKey) {
            this.briefingPurgeAvailabilityKey = '';
            this.briefingPurgeAvailable = false;
            this.briefingPurgeScanPending = false;
            this.updateBriefingFooterActionStates();
            return;
        }
        if (this.briefingPurgeAvailabilityKey === scanKey && !this.briefingPurgeScanPending) {
            this.updateBriefingFooterActionStates();
            return;
        }

        this.briefingPurgeAvailabilityKey = scanKey;
        this.briefingPurgeAvailable = false;
        this.briefingPurgeScanPending = true;
        const scanToken = ++this.briefingPurgeScanToken;
        this.updateBriefingFooterActionStates();

        const affectedScenes = await this.scanForInquiryActionItems(this.corpus?.scenes ?? []);
        if (scanToken !== this.briefingPurgeScanToken || this.briefingPurgeAvailabilityKey !== scanKey) {
            return;
        }

        this.briefingPurgeScanPending = false;
        this.briefingPurgeAvailable = affectedScenes.length > 0;
        this.updateBriefingFooterActionStates();
    }

    private async handleBriefingSaveClick(): Promise<void> {
        if (this.isInquiryBlocked()) return;
        if (!this.canManuallySaveActiveBrief()) {
            if (this.shouldAutoSaveBriefs()) {
                this.notifyInteraction('Auto-save Inquiry briefs is enabled in settings.');
            } else if (this.state.activeResult) {
                const activeSession = this.state.activeSessionId
                    ? this.sessionStore.peekSession(this.state.activeSessionId)
                    : undefined;
                const status = activeSession ? this.resolveSessionStatus(activeSession) : null;
                this.notifyInteraction(status === 'saved'
                    ? 'Current brief is already saved.'
                    : 'Current result is not available for manual save.');
            } else {
                new Notice('Run an inquiry before saving a brief.');
            }
            return;
        }
        const result = this.state.activeResult;
        if (!result) {
            new Notice('Run an inquiry before saving a brief.');
            return;
        }
        await this.saveBrief(result, {
            openFile: true,
            silent: false,
            sessionKey: this.state.activeSessionId
        });
    }

    private async handleBriefingPendingEditsClick(session: InquirySession): Promise<void> {
        if (this.isInquiryBlocked()) return;
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        if (session.pendingEditsApplied) {
            const fieldLabel = this.resolveInquiryActionNotesFieldLabel();
            this.notifyInteraction(`${fieldLabel} already updated for this session.`);
            return;
        }
        await this.writeInquiryPendingEdits(session, session.result, { notify: true });
    }

    private handleBriefingClearClick(): void {
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait to clear recent sessions.');
            return;
        }
        this.sessionStore.clearSessions();
        this.rehydrateTargetKey = undefined;
        if (this.rehydrateHighlightTimer) {
            window.clearTimeout(this.rehydrateHighlightTimer);
            this.rehydrateHighlightTimer = undefined;
        }
        if (this.rehydratePulseTimer) {
            window.clearTimeout(this.rehydratePulseTimer);
            this.rehydratePulseTimer = undefined;
        }
        this.artifactButton?.classList.remove('is-rehydrate-pulse');
        this.clearActiveResultState();
        this.clearResultPreview();
        this.unlockPromptPreview();
        this.setApiStatus('idle');
        this.refreshUI({ skipCorpus: true });
    }

    private handleBriefingResetCorpusClick(): void {
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait to reset corpus overrides.');
            return;
        }
        if (!this.hasCorpusOverrides()) {
            this.notifyInteraction('Corpus overrides already match settings.');
            return;
        }
        this.resetCorpusOverrides();
        this.notifyInteraction('Corpus overrides reset to settings; sessions, logs, and briefs untouched.');
    }

    private async handleBriefingPurgeClick(): Promise<void> {
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        if (!this.corpus) {
            this.notifyInteraction('No corpus available.');
            return;
        }
        const scenes = this.corpus.scenes ?? [];
        if (!scenes.length) {
            this.notifyInteraction('No scenes found in current scope.');
            return;
        }
        const scopeBookLabel = this.getActiveBookTitleForMessages() || this.getActiveBookLabel();
        const scopeLabel = this.state.scope === 'saga' ? 'saga' : `book "${scopeBookLabel}"`;
        const affectedScenes = await this.scanForInquiryActionItems(scenes);
        this.briefingPurgeAvailabilityKey = this.getBriefingPurgeAvailabilityKey();
        this.briefingPurgeAvailable = affectedScenes.length > 0;
        this.briefingPurgeScanPending = false;
        this.updateBriefingFooterActionStates();
        if (!affectedScenes.length) {
            this.notifyInteraction('No Inquiry action items found to purge.');
            return;
        }
        const modal = new InquiryPurgeConfirmationModal(
            this.app,
            scenes.length,
            affectedScenes,
            scopeLabel,
            async () => {
                const result = await this.purgeInquiryActionItems(scenes);
                this.invalidateBriefingPurgeAvailability();
                this.refreshBriefingPanel();
                void this.refreshBriefingPurgeAvailability();
                if (result.purgedCount > 0) {
                    new Notice(`Purged Inquiry action items from ${result.purgedCount} scene${result.purgedCount !== 1 ? 's' : ''}.`);
                } else {
                    new Notice('No Inquiry action items found to purge.');
                }
            }
        );
        modal.open();
    }

    private async scanForInquiryActionItems(
        scenes: InquirySceneItem[]
    ): Promise<InquiryPurgePreviewItem[]> {
        const targetField = this.resolveInquiryActionNotesFieldLabel();
        const inquiryLinkToken = '[[Inquiry Brief —';
        const isInquiryLine = (line: string): boolean => line.includes(inquiryLinkToken);
        const results: InquiryPurgePreviewItem[] = [];

        for (const scene of scenes) {
            const filePath = scene.filePath;
            if (!filePath) continue;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) continue;

            try {
                const cache = this.app.metadataCache.getFileCache(file);
                const frontmatter = cache?.frontmatter;
                if (!frontmatter) continue;

                const rawValue = frontmatter[targetField];
                if (rawValue === undefined || rawValue === null) continue;

                let rawText = '';
                if (typeof rawValue === 'string') {
                    rawText = rawValue;
                } else if (Array.isArray(rawValue)) {
                    rawText = rawValue.map(entry => (typeof entry === 'string' ? entry : String(entry))).join('\n');
                } else {
                    rawText = String(rawValue);
                }

                if (!rawText.trim()) continue;

                const lines = rawText.split(/\r?\n/);
                const inquiryLines = lines.filter(line => isInquiryLine(line));
                if (inquiryLines.length > 0) {
                    results.push({
                        label: scene.displayLabel,
                        path: filePath,
                        lineCount: inquiryLines.length
                    });
                }
            } catch (error) {
                console.warn('[Inquiry] Error scanning scene for action items:', filePath, error);
            }
        }

        return results;
    }

    private async purgeInquiryActionItems(
        scenes: InquirySceneItem[]
    ): Promise<{ purgedCount: number; totalScenes: number }> {
        const targetField = this.resolveInquiryActionNotesFieldLabel();
        const inquiryLinkToken = '[[Inquiry Brief —';
        const isInquiryLine = (line: string): boolean => line.includes(inquiryLinkToken);
        let purgedCount = 0;

        for (const scene of scenes) {
            const filePath = scene.filePath;
            if (!filePath) continue;
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (!file || !(file instanceof TFile)) continue;

            try {
                let hadInquiryLines = false;
                await this.app.fileManager.processFrontMatter(file, (fm) => {
                    const frontmatter = fm as Record<string, unknown>;
                    const rawValue = frontmatter[targetField];
                    if (rawValue === undefined || rawValue === null) return;

                    let rawText = '';
                    if (typeof rawValue === 'string') {
                        rawText = rawValue;
                    } else if (Array.isArray(rawValue)) {
                        rawText = rawValue.map(entry => (typeof entry === 'string' ? entry : String(entry))).join('\n');
                    } else {
                        rawText = String(rawValue);
                    }

                    if (!rawText.trim()) return;

                    const newline = rawText.includes('\r\n') ? '\r\n' : '\n';
                    const lines = rawText.split(/\r?\n/);
                    const filteredLines = lines.filter(line => !isInquiryLine(line));

                    if (filteredLines.length < lines.length) {
                        hadInquiryLines = true;
                        const nextText = filteredLines.join(newline).trim();
                        // Preserve the YAML key even when all inquiry lines are removed.
                        // Only the inquiry-inserted content is purged; user text and the key itself stay.
                        frontmatter[targetField] = nextText || '';
                    }
                });

                if (hadInquiryLines) {
                    purgedCount++;
                }
            } catch (error) {
                console.warn('[Inquiry] Error purging action items from scene:', filePath, error);
            }
        }

        return { purgedCount, totalScenes: scenes.length };
    }

    private activateSession(session: InquirySession): void {
        if (this.isInquiryBlocked()) return;
        this.clearErrorStateForAction();
        if (this.state.isRunning) return;
        this.state.scope = session.scope ?? session.result.scope;
        this.state.activeBookId = session.activeBookId ?? this.state.activeBookId;
        this.state.targetSceneIds = this.normalizeTargetSceneIds(session.targetSceneIds ?? this.state.targetSceneIds);
        this.applySession({
            result: session.result,
            key: session.key,
            activeBookId: session.activeBookId,
            targetSceneIds: session.targetSceneIds,
            scope: session.scope,
            questionZone: session.questionZone
        }, 'fresh');
        if (this.isErrorResult(session.result)) {
            this.setApiStatus('error', this.formatApiErrorReason(session.result));
        } else {
            this.setApiStatus('success');
        }
        this.sessionStore.updateSession(session.key, { lastAccessed: Date.now() });
    }

    private async openBriefFromSession(session: InquirySession, anchorId?: string): Promise<void> {
        if (this.isInquiryBlocked()) return;
        if (!session.briefPath) return;
        const file = this.app.vault.getAbstractFileByPath(session.briefPath);
        if (!(file instanceof TFile)) {
            new Notice('Brief not found. It may have been moved or deleted.');
            return;
        }
        if (!anchorId) {
            await openOrRevealFile(this.app, file);
            return;
        }
        await openOrRevealFileAtSubpath(this.app, file, `#^${anchorId}`);
    }

    private getMostRecentInquiryLogFile(): TFile | null {
        const folderPath = resolveInquiryLogFolder();
        const folder = this.app.vault.getAbstractFileByPath(folderPath);
        if (!(folder instanceof TFolder)) return null;

        let latest: TFile | null = null;
        const scan = (node: TAbstractFile): void => {
            if (node instanceof TFile) {
                if (node.extension !== 'md') return;
                if (!latest || node.stat.mtime > latest.stat.mtime) {
                    latest = node;
                }
                return;
            }
            if (node instanceof TFolder) {
                node.children.forEach(child => scan(child));
            }
        };
        scan(folder);
        return latest;
    }

    private async openLatestInquiryLogForContext(): Promise<boolean> {
        const activeSession = this.state.activeSessionId
            ? this.sessionStore.peekSession(this.state.activeSessionId)
            : undefined;
        const sessionLogPath = activeSession?.logPath;
        if (sessionLogPath) {
            const sessionLog = this.app.vault.getAbstractFileByPath(sessionLogPath);
            if (sessionLog instanceof TFile) {
                await openOrRevealFile(this.app, sessionLog);
                return true;
            }
        }
        const fallback = this.getMostRecentInquiryLogFile();
        if (!fallback) return false;
        await openOrRevealFile(this.app, fallback);
        return true;
    }

    private getInquiryAssetHref(fileName: string): string {
        const configDir = (this.app.vault as unknown as { configDir?: string }).configDir ?? '.obsidian';
        const pluginId = this.plugin.manifest.id;
        const assetPath = normalizePath(`${configDir}/plugins/${pluginId}/inquiry/assets/${fileName}`);
        // SAFE: vault.adapter.getResourcePath is required for converting vault paths to asset URLs (no Vault API alternative)
        const adapter = this.app.vault.adapter as unknown as { getResourcePath?: (path: string) => string };
        return adapter.getResourcePath ? adapter.getResourcePath(assetPath) : assetPath;
    }

    private loadTargetCache(): void {
        const cache = this.plugin.settings.inquiryTargetCache;
        if (cache?.lastTargetSceneIdsByBookId) {
            this.lastTargetSceneIdsByBookId = new Map(
                Object.entries(cache.lastTargetSceneIdsByBookId).map(([bookId, sceneIds]) => [
                    bookId,
                    this.normalizeTargetSceneIds(sceneIds)
                ])
            );
        }
        if (cache?.lastBookId) {
            this.state.activeBookId = cache.lastBookId;
            this.state.targetSceneIds = this.lastTargetSceneIdsByBookId.get(cache.lastBookId) ?? [];
        }
        if (this.targetPersistTimer) {
            window.clearTimeout(this.targetPersistTimer);
            this.targetPersistTimer = undefined;
        }
    }

    private scheduleTargetPersist(): void {
        if (this.targetPersistTimer) {
            window.clearTimeout(this.targetPersistTimer);
        }
        this.targetPersistTimer = window.setTimeout(() => {
            const cache = {
                lastBookId: this.state.activeBookId,
                lastTargetSceneIdsByBookId: Object.fromEntries(this.lastTargetSceneIdsByBookId)
            };
            this.plugin.settings.inquiryTargetCache = cache;
            void this.plugin.saveSettings();
        }, 300);
    }

    private buildIconSymbols(defs: SVGDefsElement): void {
        this.iconSymbols.clear();
        [
            'waves',
            'waves-arrow-down',
            'columns-2',
            'cpu',
            'aperture',
            'chevron-left',
            'chevron-right',
            'chevron-up',
            'chevron-down',
            'help-circle',
            'activity',
            'arrow-big-up',
            'check-circle',
            'sigma',
            'x',
            'circle',
            'circle-dot',
            'disc'
        ].forEach(icon => {
            const symbolId = this.createIconSymbol(defs, icon);
            if (symbolId) {
                this.iconSymbols.add(symbolId);
            }
        });
    }

    private buildZoneGradients(defs: SVGDefsElement): void {
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        const zoneAnchors: Record<InquiryZone, { cx: string; cy: string; r: string }> = {
            setup: { cx: '1', cy: '0', r: '1.42' },
            pressure: { cx: '0', cy: '0', r: '1.42' },
            payoff: { cx: '0.5', cy: '0', r: '1' }
        };
        const zoneStopOpacity = '0.35';
        const createStop = (offset: string, color: string, opacity?: string): SVGStopElement => {
            const stop = createSvgElement('stop');
            stop.setAttribute('offset', offset);
            stop.setAttribute('stop-color', color);
            if (opacity) {
                stop.setAttribute('stop-opacity', opacity);
            }
            return stop;
        };
        const createGradient = (
            id: string,
            stops: Array<[string, string]>,
            anchor: { cx: string; cy: string; r: string },
            stopOpacity?: string
        ): SVGRadialGradientElement => {
            const gradient = createSvgElement('radialGradient');
            gradient.setAttribute('id', id);
            gradient.setAttribute('cx', anchor.cx);
            gradient.setAttribute('cy', anchor.cy);
            gradient.setAttribute('fx', anchor.cx);
            gradient.setAttribute('fy', anchor.cy);
            gradient.setAttribute('r', anchor.r);
            stops.forEach(([offset, color]) => {
                gradient.appendChild(createStop(offset, color, stopOpacity));
            });
            return gradient;
        };

        const glassGradient = createSvgElement('radialGradient');
        glassGradient.setAttribute('id', 'ert-inquiry-zone-glass');
        glassGradient.setAttribute('gradientUnits', 'userSpaceOnUse');
        glassGradient.setAttribute('cx', '0');
        glassGradient.setAttribute('cy', '0');
        glassGradient.setAttribute('fx', '0');
        glassGradient.setAttribute('fy', '0');
        glassGradient.setAttribute('r', String(VIEWBOX_MAX));
        const toPercent = (radius: number): string => {
            const clamped = Math.min(Math.max(radius / VIEWBOX_MAX, 0), 1);
            return `${(clamped * 100).toFixed(2)}%`;
        };
        const zoneInner = ZONE_SEGMENT_RADIUS - (ZONE_RING_THICKNESS / 2);
        const zoneOuter = ZONE_SEGMENT_RADIUS + (ZONE_RING_THICKNESS / 2);
        const bandInset = ZONE_RING_THICKNESS * 0.18;
        const innerFade = Math.max(0, zoneInner - (ZONE_RING_THICKNESS * 0.22));
        const outerFade = zoneOuter + (ZONE_RING_THICKNESS * 0.22);
        [
            [toPercent(innerFade), '#ffffff', '0.015'],
            [toPercent(zoneInner), '#ffffff', '0.03'],
            [toPercent(zoneInner + bandInset), '#ffffff', '0.12'],
            [toPercent(zoneInner + (ZONE_RING_THICKNESS * 0.5)), '#ffffff', '0.26'],
            [toPercent(zoneOuter - bandInset), '#ffffff', '0.12'],
            [toPercent(zoneOuter), '#ffffff', '0.03'],
            [toPercent(outerFade), '#ffffff', '0.015']
        ].forEach(([offset, color, opacity]) => {
            glassGradient.appendChild(createStop(offset, color, opacity));
        });
        defs.appendChild(glassGradient);

        zones.forEach(zone => {
            const zoneVar = `var(--ert-inquiry-zone-${zone})`;
            const anchor = zoneAnchors[zone];
            defs.appendChild(createGradient(
                `ert-inquiry-zone-${zone}-raised`,
                [
                    ['0%', `color-mix(in srgb, ${zoneVar} 55%, #ffffff)`],
                    ['50%', zoneVar],
                    ['100%', `color-mix(in srgb, ${zoneVar} 55%, #000000)`]
                ],
                anchor,
                zoneStopOpacity
            ));
            defs.appendChild(createGradient(
                `ert-inquiry-zone-${zone}-pressed`,
                [
                    ['0%', `color-mix(in srgb, ${zoneVar} 55%, #000000)`],
                    ['60%', zoneVar],
                    ['100%', `color-mix(in srgb, ${zoneVar} 55%, #ffffff)`]
                ],
                anchor,
                zoneStopOpacity
            ));
        });

        // Neumorphic filters for zone pill states.
        const pillOutFilter = createSvgElement('filter');
        pillOutFilter.setAttribute('id', 'ert-inquiry-zone-pill-out');
        pillOutFilter.setAttribute('x', '-50%');
        pillOutFilter.setAttribute('y', '-50%');
        pillOutFilter.setAttribute('width', '200%');
        pillOutFilter.setAttribute('height', '200%');
        pillOutFilter.setAttribute('color-interpolation-filters', 'sRGB');
        const pillOutLight = createSvgElement('feDropShadow');
        pillOutLight.setAttribute('dx', '-2');
        pillOutLight.setAttribute('dy', '-2');
        pillOutLight.setAttribute('stdDeviation', '1.6');
        pillOutLight.setAttribute('flood-color', '#ffffff');
        pillOutLight.setAttribute('flood-opacity', '0.28');
        const pillOutDark = createSvgElement('feDropShadow');
        pillOutDark.setAttribute('dx', '2');
        pillOutDark.setAttribute('dy', '2');
        pillOutDark.setAttribute('stdDeviation', '1.8');
        pillOutDark.setAttribute('flood-color', '#000000');
        pillOutDark.setAttribute('flood-opacity', '0.35');
        pillOutFilter.appendChild(pillOutLight);
        pillOutFilter.appendChild(pillOutDark);
        defs.appendChild(pillOutFilter);

        const pillInFilter = createSvgElement('filter');
        pillInFilter.setAttribute('id', 'ert-inquiry-zone-pill-in');
        pillInFilter.setAttribute('x', '-50%');
        pillInFilter.setAttribute('y', '-50%');
        pillInFilter.setAttribute('width', '200%');
        pillInFilter.setAttribute('height', '200%');
        pillInFilter.setAttribute('color-interpolation-filters', 'sRGB');
        const pillInOffsetDark = createSvgElement('feOffset');
        pillInOffsetDark.setAttribute('in', 'SourceAlpha');
        pillInOffsetDark.setAttribute('dx', '1.6');
        pillInOffsetDark.setAttribute('dy', '1.6');
        pillInOffsetDark.setAttribute('result', 'pill-in-offset-dark');
        const pillInBlurDark = createSvgElement('feGaussianBlur');
        pillInBlurDark.setAttribute('in', 'pill-in-offset-dark');
        pillInBlurDark.setAttribute('stdDeviation', '1.2');
        pillInBlurDark.setAttribute('result', 'pill-in-blur-dark');
        const pillInCompositeDark = createSvgElement('feComposite');
        pillInCompositeDark.setAttribute('in', 'pill-in-blur-dark');
        pillInCompositeDark.setAttribute('in2', 'SourceAlpha');
        pillInCompositeDark.setAttribute('operator', 'arithmetic');
        pillInCompositeDark.setAttribute('k2', '-1');
        pillInCompositeDark.setAttribute('k3', '1');
        pillInCompositeDark.setAttribute('result', 'pill-in-inner-dark');
        const pillInFloodDark = createSvgElement('feFlood');
        pillInFloodDark.setAttribute('flood-color', '#000000');
        pillInFloodDark.setAttribute('flood-opacity', '0.35');
        pillInFloodDark.setAttribute('result', 'pill-in-flood-dark');
        const pillInShadowDark = createSvgElement('feComposite');
        pillInShadowDark.setAttribute('in', 'pill-in-flood-dark');
        pillInShadowDark.setAttribute('in2', 'pill-in-inner-dark');
        pillInShadowDark.setAttribute('operator', 'in');
        pillInShadowDark.setAttribute('result', 'pill-in-shadow-dark');

        const pillInOffsetLight = createSvgElement('feOffset');
        pillInOffsetLight.setAttribute('in', 'SourceAlpha');
        pillInOffsetLight.setAttribute('dx', '-1.6');
        pillInOffsetLight.setAttribute('dy', '-1.6');
        pillInOffsetLight.setAttribute('result', 'pill-in-offset-light');
        const pillInBlurLight = createSvgElement('feGaussianBlur');
        pillInBlurLight.setAttribute('in', 'pill-in-offset-light');
        pillInBlurLight.setAttribute('stdDeviation', '1.2');
        pillInBlurLight.setAttribute('result', 'pill-in-blur-light');
        const pillInCompositeLight = createSvgElement('feComposite');
        pillInCompositeLight.setAttribute('in', 'pill-in-blur-light');
        pillInCompositeLight.setAttribute('in2', 'SourceAlpha');
        pillInCompositeLight.setAttribute('operator', 'arithmetic');
        pillInCompositeLight.setAttribute('k2', '-1');
        pillInCompositeLight.setAttribute('k3', '1');
        pillInCompositeLight.setAttribute('result', 'pill-in-inner-light');
        const pillInFloodLight = createSvgElement('feFlood');
        pillInFloodLight.setAttribute('flood-color', '#ffffff');
        pillInFloodLight.setAttribute('flood-opacity', '0.22');
        pillInFloodLight.setAttribute('result', 'pill-in-flood-light');
        const pillInShadowLight = createSvgElement('feComposite');
        pillInShadowLight.setAttribute('in', 'pill-in-flood-light');
        pillInShadowLight.setAttribute('in2', 'pill-in-inner-light');
        pillInShadowLight.setAttribute('operator', 'in');
        pillInShadowLight.setAttribute('result', 'pill-in-shadow-light');

        const pillInMerge = createSvgElement('feMerge');
        const pillInMergeGraphic = createSvgElement('feMergeNode');
        pillInMergeGraphic.setAttribute('in', 'SourceGraphic');
        const pillInMergeDark = createSvgElement('feMergeNode');
        pillInMergeDark.setAttribute('in', 'pill-in-shadow-dark');
        const pillInMergeLight = createSvgElement('feMergeNode');
        pillInMergeLight.setAttribute('in', 'pill-in-shadow-light');
        pillInMerge.appendChild(pillInMergeGraphic);
        pillInMerge.appendChild(pillInMergeDark);
        pillInMerge.appendChild(pillInMergeLight);

        pillInFilter.appendChild(pillInOffsetDark);
        pillInFilter.appendChild(pillInBlurDark);
        pillInFilter.appendChild(pillInCompositeDark);
        pillInFilter.appendChild(pillInFloodDark);
        pillInFilter.appendChild(pillInShadowDark);
        pillInFilter.appendChild(pillInOffsetLight);
        pillInFilter.appendChild(pillInBlurLight);
        pillInFilter.appendChild(pillInCompositeLight);
        pillInFilter.appendChild(pillInFloodLight);
        pillInFilter.appendChild(pillInShadowLight);
        pillInFilter.appendChild(pillInMerge);
        defs.appendChild(pillInFilter);

        // Neumorphic "up" filter for zone dot buttons.
        const dotUpFilter = createSvgElement('filter');
        dotUpFilter.setAttribute('id', 'ert-inquiry-zone-dot-up');
        dotUpFilter.setAttribute('x', '-50%');
        dotUpFilter.setAttribute('y', '-50%');
        dotUpFilter.setAttribute('width', '200%');
        dotUpFilter.setAttribute('height', '200%');
        dotUpFilter.setAttribute('color-interpolation-filters', 'sRGB');

        const dotUpFlood = createSvgElement('feFlood');
        dotUpFlood.setAttribute('flood-opacity', '0');
        dotUpFlood.setAttribute('result', 'BackgroundImageFix');
        const dotUpAlphaDark = createSvgElement('feColorMatrix');
        dotUpAlphaDark.setAttribute('in', 'SourceAlpha');
        dotUpAlphaDark.setAttribute('type', 'matrix');
        dotUpAlphaDark.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
        dotUpAlphaDark.setAttribute('result', 'hardAlpha');
        const dotUpOffsetDark = createSvgElement('feOffset');
        dotUpOffsetDark.setAttribute('dx', '2');
        dotUpOffsetDark.setAttribute('dy', '2');
        const dotUpBlurDark = createSvgElement('feGaussianBlur');
        dotUpBlurDark.setAttribute('stdDeviation', '2');
        const dotUpCompositeDark = createSvgElement('feComposite');
        dotUpCompositeDark.setAttribute('in2', 'hardAlpha');
        dotUpCompositeDark.setAttribute('operator', 'out');
        const dotUpColorDark = createSvgElement('feColorMatrix');
        dotUpColorDark.setAttribute('type', 'matrix');
        dotUpColorDark.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.3 0');
        const dotUpBlendDark = createSvgElement('feBlend');
        dotUpBlendDark.setAttribute('mode', 'normal');
        dotUpBlendDark.setAttribute('in2', 'BackgroundImageFix');
        dotUpBlendDark.setAttribute('result', 'effect1_dropShadow');

        const dotUpAlphaLight = createSvgElement('feColorMatrix');
        dotUpAlphaLight.setAttribute('in', 'SourceAlpha');
        dotUpAlphaLight.setAttribute('type', 'matrix');
        dotUpAlphaLight.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
        dotUpAlphaLight.setAttribute('result', 'hardAlpha');
        const dotUpOffsetLight = createSvgElement('feOffset');
        dotUpOffsetLight.setAttribute('dx', '-2');
        dotUpOffsetLight.setAttribute('dy', '-2');
        const dotUpBlurLight = createSvgElement('feGaussianBlur');
        dotUpBlurLight.setAttribute('stdDeviation', '3');
        const dotUpCompositeLight = createSvgElement('feComposite');
        dotUpCompositeLight.setAttribute('in2', 'hardAlpha');
        dotUpCompositeLight.setAttribute('operator', 'out');
        const dotUpColorLight = createSvgElement('feColorMatrix');
        dotUpColorLight.setAttribute('type', 'matrix');
        dotUpColorLight.setAttribute('values', '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.11 0');
        const dotUpBlendLight = createSvgElement('feBlend');
        dotUpBlendLight.setAttribute('mode', 'normal');
        dotUpBlendLight.setAttribute('in2', 'effect1_dropShadow');
        dotUpBlendLight.setAttribute('result', 'effect2_dropShadow');
        const dotUpBlendShape = createSvgElement('feBlend');
        dotUpBlendShape.setAttribute('mode', 'normal');
        dotUpBlendShape.setAttribute('in', 'SourceGraphic');
        dotUpBlendShape.setAttribute('in2', 'effect2_dropShadow');
        dotUpBlendShape.setAttribute('result', 'shape');

        const dotUpAlphaInnerDark = createSvgElement('feColorMatrix');
        dotUpAlphaInnerDark.setAttribute('in', 'SourceAlpha');
        dotUpAlphaInnerDark.setAttribute('type', 'matrix');
        dotUpAlphaInnerDark.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
        dotUpAlphaInnerDark.setAttribute('result', 'hardAlpha');
        const dotUpOffsetInnerDark = createSvgElement('feOffset');
        dotUpOffsetInnerDark.setAttribute('dx', '-2');
        dotUpOffsetInnerDark.setAttribute('dy', '-2');
        const dotUpBlurInnerDark = createSvgElement('feGaussianBlur');
        dotUpBlurInnerDark.setAttribute('stdDeviation', '1');
        const dotUpCompositeInnerDark = createSvgElement('feComposite');
        dotUpCompositeInnerDark.setAttribute('in2', 'hardAlpha');
        dotUpCompositeInnerDark.setAttribute('operator', 'arithmetic');
        dotUpCompositeInnerDark.setAttribute('k2', '-1');
        dotUpCompositeInnerDark.setAttribute('k3', '1');
        const dotUpColorInnerDark = createSvgElement('feColorMatrix');
        dotUpColorInnerDark.setAttribute('type', 'matrix');
        dotUpColorInnerDark.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.17 0');
        const dotUpBlendInnerDark = createSvgElement('feBlend');
        dotUpBlendInnerDark.setAttribute('mode', 'normal');
        dotUpBlendInnerDark.setAttribute('in2', 'shape');
        dotUpBlendInnerDark.setAttribute('result', 'effect3_innerShadow');

        const dotUpAlphaInnerLight = createSvgElement('feColorMatrix');
        dotUpAlphaInnerLight.setAttribute('in', 'SourceAlpha');
        dotUpAlphaInnerLight.setAttribute('type', 'matrix');
        dotUpAlphaInnerLight.setAttribute('values', '0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0');
        dotUpAlphaInnerLight.setAttribute('result', 'hardAlpha');
        const dotUpOffsetInnerLight = createSvgElement('feOffset');
        dotUpOffsetInnerLight.setAttribute('dx', '2');
        dotUpOffsetInnerLight.setAttribute('dy', '2');
        const dotUpBlurInnerLight = createSvgElement('feGaussianBlur');
        dotUpBlurInnerLight.setAttribute('stdDeviation', '1');
        const dotUpCompositeInnerLight = createSvgElement('feComposite');
        dotUpCompositeInnerLight.setAttribute('in2', 'hardAlpha');
        dotUpCompositeInnerLight.setAttribute('operator', 'arithmetic');
        dotUpCompositeInnerLight.setAttribute('k2', '-1');
        dotUpCompositeInnerLight.setAttribute('k3', '1');
        const dotUpColorInnerLight = createSvgElement('feColorMatrix');
        dotUpColorInnerLight.setAttribute('type', 'matrix');
        dotUpColorInnerLight.setAttribute('values', '0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 0.17 0');
        const dotUpBlendInnerLight = createSvgElement('feBlend');
        dotUpBlendInnerLight.setAttribute('mode', 'color-dodge');
        dotUpBlendInnerLight.setAttribute('in2', 'effect3_innerShadow');
        dotUpBlendInnerLight.setAttribute('result', 'effect4_innerShadow');

        dotUpFilter.appendChild(dotUpFlood);
        dotUpFilter.appendChild(dotUpAlphaDark);
        dotUpFilter.appendChild(dotUpOffsetDark);
        dotUpFilter.appendChild(dotUpBlurDark);
        dotUpFilter.appendChild(dotUpCompositeDark);
        dotUpFilter.appendChild(dotUpColorDark);
        dotUpFilter.appendChild(dotUpBlendDark);
        dotUpFilter.appendChild(dotUpAlphaLight);
        dotUpFilter.appendChild(dotUpOffsetLight);
        dotUpFilter.appendChild(dotUpBlurLight);
        dotUpFilter.appendChild(dotUpCompositeLight);
        dotUpFilter.appendChild(dotUpColorLight);
        dotUpFilter.appendChild(dotUpBlendLight);
        dotUpFilter.appendChild(dotUpBlendShape);
        dotUpFilter.appendChild(dotUpAlphaInnerDark);
        dotUpFilter.appendChild(dotUpOffsetInnerDark);
        dotUpFilter.appendChild(dotUpBlurInnerDark);
        dotUpFilter.appendChild(dotUpCompositeInnerDark);
        dotUpFilter.appendChild(dotUpColorInnerDark);
        dotUpFilter.appendChild(dotUpBlendInnerDark);
        dotUpFilter.appendChild(dotUpAlphaInnerLight);
        dotUpFilter.appendChild(dotUpOffsetInnerLight);
        dotUpFilter.appendChild(dotUpBlurInnerLight);
        dotUpFilter.appendChild(dotUpCompositeInnerLight);
        dotUpFilter.appendChild(dotUpColorInnerLight);
        dotUpFilter.appendChild(dotUpBlendInnerLight);
        defs.appendChild(dotUpFilter);

        // Neumorphic "down" filter for zone dot buttons.
        const dotDownFilter = createSvgElement('filter');
        dotDownFilter.setAttribute('id', 'ert-inquiry-zone-dot-down');
        dotDownFilter.setAttribute('x', '-50%');
        dotDownFilter.setAttribute('y', '-50%');
        dotDownFilter.setAttribute('width', '200%');
        dotDownFilter.setAttribute('height', '200%');
        dotDownFilter.setAttribute('color-interpolation-filters', 'sRGB');

        const dotDownOffsetDark = createSvgElement('feOffset');
        dotDownOffsetDark.setAttribute('in', 'SourceAlpha');
        dotDownOffsetDark.setAttribute('dx', '3.2');
        dotDownOffsetDark.setAttribute('dy', '3.2');
        dotDownOffsetDark.setAttribute('result', 'dot-down-offset-dark');
        const dotDownBlurDark = createSvgElement('feGaussianBlur');
        dotDownBlurDark.setAttribute('in', 'dot-down-offset-dark');
        dotDownBlurDark.setAttribute('stdDeviation', '2.4');
        dotDownBlurDark.setAttribute('result', 'dot-down-blur-dark');
        const dotDownCompositeDark = createSvgElement('feComposite');
        dotDownCompositeDark.setAttribute('in', 'dot-down-blur-dark');
        dotDownCompositeDark.setAttribute('in2', 'SourceAlpha');
        dotDownCompositeDark.setAttribute('operator', 'arithmetic');
        dotDownCompositeDark.setAttribute('k2', '-1');
        dotDownCompositeDark.setAttribute('k3', '1');
        dotDownCompositeDark.setAttribute('result', 'dot-down-inner-dark');
        const dotDownFloodDark = createSvgElement('feFlood');
        dotDownFloodDark.setAttribute('flood-color', '#000000');
        dotDownFloodDark.setAttribute('flood-opacity', '0.35');
        dotDownFloodDark.setAttribute('result', 'dot-down-flood-dark');
        const dotDownShadowDark = createSvgElement('feComposite');
        dotDownShadowDark.setAttribute('in', 'dot-down-flood-dark');
        dotDownShadowDark.setAttribute('in2', 'dot-down-inner-dark');
        dotDownShadowDark.setAttribute('operator', 'in');
        dotDownShadowDark.setAttribute('result', 'dot-down-shadow-dark');

        const dotDownOffsetLight = createSvgElement('feOffset');
        dotDownOffsetLight.setAttribute('in', 'SourceAlpha');
        dotDownOffsetLight.setAttribute('dx', '-3.2');
        dotDownOffsetLight.setAttribute('dy', '-3.2');
        dotDownOffsetLight.setAttribute('result', 'dot-down-offset-light');
        const dotDownBlurLight = createSvgElement('feGaussianBlur');
        dotDownBlurLight.setAttribute('in', 'dot-down-offset-light');
        dotDownBlurLight.setAttribute('stdDeviation', '2.4');
        dotDownBlurLight.setAttribute('result', 'dot-down-blur-light');
        const dotDownCompositeLight = createSvgElement('feComposite');
        dotDownCompositeLight.setAttribute('in', 'dot-down-blur-light');
        dotDownCompositeLight.setAttribute('in2', 'SourceAlpha');
        dotDownCompositeLight.setAttribute('operator', 'arithmetic');
        dotDownCompositeLight.setAttribute('k2', '-1');
        dotDownCompositeLight.setAttribute('k3', '1');
        dotDownCompositeLight.setAttribute('result', 'dot-down-inner-light');
        const dotDownFloodLight = createSvgElement('feFlood');
        dotDownFloodLight.setAttribute('flood-color', '#ffffff');
        dotDownFloodLight.setAttribute('flood-opacity', '0.22');
        dotDownFloodLight.setAttribute('result', 'dot-down-flood-light');
        const dotDownShadowLight = createSvgElement('feComposite');
        dotDownShadowLight.setAttribute('in', 'dot-down-flood-light');
        dotDownShadowLight.setAttribute('in2', 'dot-down-inner-light');
        dotDownShadowLight.setAttribute('operator', 'in');
        dotDownShadowLight.setAttribute('result', 'dot-down-shadow-light');

        const dotDownMerge = createSvgElement('feMerge');
        const dotDownMergeGraphic = createSvgElement('feMergeNode');
        dotDownMergeGraphic.setAttribute('in', 'SourceGraphic');
        const dotDownMergeDark = createSvgElement('feMergeNode');
        dotDownMergeDark.setAttribute('in', 'dot-down-shadow-dark');
        const dotDownMergeLight = createSvgElement('feMergeNode');
        dotDownMergeLight.setAttribute('in', 'dot-down-shadow-light');
        dotDownMerge.appendChild(dotDownMergeGraphic);
        dotDownMerge.appendChild(dotDownMergeDark);
        dotDownMerge.appendChild(dotDownMergeLight);

        dotDownFilter.appendChild(dotDownOffsetDark);
        dotDownFilter.appendChild(dotDownBlurDark);
        dotDownFilter.appendChild(dotDownCompositeDark);
        dotDownFilter.appendChild(dotDownFloodDark);
        dotDownFilter.appendChild(dotDownShadowDark);
        dotDownFilter.appendChild(dotDownOffsetLight);
        dotDownFilter.appendChild(dotDownBlurLight);
        dotDownFilter.appendChild(dotDownCompositeLight);
        dotDownFilter.appendChild(dotDownFloodLight);
        dotDownFilter.appendChild(dotDownShadowLight);
        dotDownFilter.appendChild(dotDownMerge);
        defs.appendChild(dotDownFilter);

        const backboneGradient = createSvgElement('linearGradient');
        backboneGradient.setAttribute('id', 'ert-inquiry-minimap-backbone-grad');
        backboneGradient.setAttribute('x1', '0%');
        backboneGradient.setAttribute('y1', '0%');
        backboneGradient.setAttribute('x2', '100%');
        backboneGradient.setAttribute('y2', '0%');
        const startColors = getBackboneStartColors(this.getStyleSource());
        const gradientStart = startColors.gradient[0] ?? { r: 255, g: 153, b: 0 };
        const gradientMid = startColors.gradient[1] ?? { r: 255, g: 211, b: 106 };
        const gradientEnd = startColors.gradient[2] ?? { r: 255, g: 94, b: 0 };
        const backboneGradientStops = [
            createStop('0%', toRgbString(gradientStart)),
            createStop('50%', toRgbString(gradientMid)),
            createStop('100%', toRgbString(gradientEnd))
        ];
        backboneGradientStops.forEach(stop => backboneGradient.appendChild(stop));
        this.minimap.setGradientStops(backboneGradientStops);
        defs.appendChild(backboneGradient);

        const backboneShine = createSvgElement('linearGradient');
        backboneShine.setAttribute('id', 'ert-inquiry-minimap-backbone-shine');
        backboneShine.setAttribute('x1', '0%');
        backboneShine.setAttribute('y1', '0%');
        backboneShine.setAttribute('x2', '100%');
        backboneShine.setAttribute('y2', '0%');
        const shineStart = startColors.shine[0] ?? { r: 255, g: 242, b: 207 };
        const shinePeak = startColors.shine[1] ?? { r: 255, g: 247, b: 234 };
        const shineWarm = startColors.shine[2] ?? { r: 255, g: 179, b: 77 };
        const shineEnd = startColors.shine[3] ?? { r: 255, g: 242, b: 207 };
        const backboneShineStops = [
            createStop('0%', toRgbString(shineStart), '0'),
            createStop('40%', toRgbString(shinePeak), '1'),
            createStop('60%', toRgbString(shineWarm), '0.9'),
            createStop('100%', toRgbString(shineEnd), '0')
        ];
        backboneShineStops.forEach(stop => backboneShine.appendChild(stop));
        this.minimap.setShineStops(backboneShineStops);
        defs.appendChild(backboneShine);

        this.minimap.initBackboneClip(defs);

        // Hatched pattern for cached portion overlay on token cap bar
        const cachedPattern = createSvgElement('pattern');
        cachedPattern.setAttribute('id', 'ert-inquiry-minimap-cached-hatch');
        cachedPattern.setAttribute('width', '4');
        cachedPattern.setAttribute('height', '4');
        cachedPattern.setAttribute('patternUnits', 'userSpaceOnUse');
        cachedPattern.setAttribute('patternTransform', 'rotate(45)');
        const hatchLine = createSvgElement('line');
        hatchLine.setAttribute('x1', '0');
        hatchLine.setAttribute('y1', '0');
        hatchLine.setAttribute('x2', '0');
        hatchLine.setAttribute('y2', '4');
        hatchLine.classList.add('ert-inquiry-minimap-cached-hatch-stroke');
        cachedPattern.appendChild(hatchLine);
        defs.appendChild(cachedPattern);
    }

    private createIconSymbol(defs: SVGDefsElement, iconName: string): string | null {
        const holder = document.createElement('span');
        setIcon(holder, iconName);
        const source = holder.querySelector('svg');
        if (!source) {
            if (iconName !== 'sigma') return null;
            const symbol = createSvgElement('symbol');
            const symbolId = `ert-icon-${iconName}`;
            symbol.setAttribute('id', symbolId);
            symbol.setAttribute('viewBox', '0 0 24 24');
            const text = createSvgElement('text');
            text.setAttribute('x', '12');
            text.setAttribute('y', '13');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('font-size', '16');
            text.setAttribute('font-weight', '700');
            text.textContent = String.fromCharCode(931);
            symbol.appendChild(text);
            defs.appendChild(symbol);
            return symbolId;
        }
        const symbol = createSvgElement('symbol');
        const symbolId = `ert-icon-${iconName}`;
        symbol.setAttribute('id', symbolId);
        symbol.setAttribute('viewBox', source.getAttribute('viewBox') || '0 0 24 24');
        Array.from(source.children).forEach(child => {
            if (child.tagName.toLowerCase() === 'title') return;
            symbol.appendChild(child.cloneNode(true));
        });
        if (iconName === 'circle-dot') {
            const circles = Array.from(symbol.querySelectorAll('circle'));
            if (circles.length >= 2) {
                const sorted = circles
                    .slice()
                    .sort((a, b) => (Number(a.getAttribute('r')) || 0) - (Number(b.getAttribute('r')) || 0));
                const inner = sorted[0];
                const outer = sorted[sorted.length - 1];
                const outerCx = outer.getAttribute('cx');
                const outerCy = outer.getAttribute('cy');
                if (outerCx) inner.setAttribute('cx', outerCx);
                if (outerCy) inner.setAttribute('cy', outerCy);
                const innerRadius = Number(inner.getAttribute('r'));
                if (Number.isFinite(innerRadius) && innerRadius > 0) {
                    inner.setAttribute('r', String(Math.max(1, innerRadius * 0.7)));
                }
                inner.setAttribute('fill', 'currentColor');
                inner.setAttribute('stroke', 'none');
            }
        }
        defs.appendChild(symbol);
        return symbolId;
    }

    private createIconButton(
        parent: SVGElement,
        x: number,
        y: number,
        size: number,
        iconName: string,
        _label: string,
        extraClass = ''
    ): SVGGElement {
        const group = createSvgGroup(parent, `ert-inquiry-icon-btn ${extraClass}`.trim(), x, y);
        group.setAttribute('role', 'button');
        group.setAttribute('tabindex', '0');
        const rect = createSvgElement('rect');
        rect.classList.add('ert-inquiry-icon-btn-bg');
        rect.setAttribute('width', String(size));
        rect.setAttribute('height', String(size));
        rect.setAttribute('rx', String(Math.round(size * 0.3)));
        rect.setAttribute('ry', String(Math.round(size * 0.3)));
        group.appendChild(rect);
        const iconSize = Math.round(size * 0.5);
        const icon = this.createIconUse(iconName, (size - iconSize) / 2, (size - iconSize) / 2, iconSize);
        icon.classList.add('ert-inquiry-icon');
        group.appendChild(icon);
        return group;
    }

    private createIconUse(iconName: string, x: number, y: number, size: number): SVGUseElement {
        const use = createSvgElement('use');
        use.setAttribute('x', String(x));
        use.setAttribute('y', String(y));
        use.setAttribute('width', String(size));
        use.setAttribute('height', String(size));
        this.setIconUse(use, iconName);
        return use;
    }

    private setIconUse(use: SVGUseElement | undefined, iconName: string): void {
        if (!use) return;
        const symbolId = `ert-icon-${iconName}`;
        use.setAttribute('href', `#${symbolId}`);
        use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', `#${symbolId}`);
    }

    private buildDefaultSelectedPromptIds(): Record<InquiryZone, string> {
        const config = this.getPromptConfig();
        const pickFirstAvailable = (zone: InquiryZone): string => {
            const slots = config[zone] ?? [];
            const firstAvailable = slots.find(slot => this.getQuestionTextForSlot(zone, slot).trim().length > 0);
            return firstAvailable?.id ?? slots[0]?.id ?? zone;
        };
        return {
            setup: pickFirstAvailable('setup'),
            pressure: pickFirstAvailable('pressure'),
            payoff: pickFirstAvailable('payoff')
        };
    }

    private ensurePromptConfig(): void {
        if (!this.plugin.settings.inquiryPromptConfig) {
            this.plugin.settings.inquiryPromptConfig = buildDefaultInquiryPromptConfig();
            void this.plugin.saveSettings();
        }
    }

    private getPromptConfig(): InquiryPromptConfig {
        return normalizeInquiryPromptConfig(this.plugin.settings.inquiryPromptConfig);
    }

    private getQuestionTextForSlot(_zone: InquiryZone, slot: InquiryPromptSlot): string {
        return getPromptSlotQuestion(slot);
    }

    private getFocusedPromptForSlot(
        _zone: InquiryZone,
        slot: InquiryPromptSlot,
        standardPrompt: string
    ): string | undefined {
        const canonical = getCanonicalQuestionForSlot(slot);
        if (canonical?.focusedPrompt?.trim().length) {
            return canonical.focusedPrompt.trim();
        }
        if (slot.builtIn && canonical) {
            return undefined;
        }
        const focusedPrompt = buildFocusedCustomPrompt(standardPrompt);
        return focusedPrompt.trim().length ? focusedPrompt : undefined;
    }

    private resolveSlotTier(slotIndex: number): InquiryCanonicalQuestionTier {
        return slotIndex >= 4 ? 'signature' : 'core';
    }

    private buildInquiryQuestion(
        zone: InquiryZone,
        slot: InquiryPromptSlot,
        icon: string,
        slotIndex: number
    ): InquiryQuestion | null {
        const standardPrompt = this.getQuestionTextForSlot(zone, slot).trim();
        if (!standardPrompt) return null;
        return {
            id: slot.id,
            label: slot.label || (zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff'),
            standardPrompt,
            focusedPrompt: this.getFocusedPromptForSlot(zone, slot, standardPrompt),
            zone,
            icon,
            tier: this.resolveSlotTier(slotIndex)
        };
    }

    private resolveQuestionPromptForRun(
        question: InquiryQuestion,
        selectionMode: InquirySelectionMode,
        override?: InquiryQuestionPromptForm
    ): string {
        return resolveQuestionPrompt(question, selectionMode, override);
    }

    private resolveQuestionPromptFormForRun(
        question: InquiryQuestion,
        selectionMode: InquirySelectionMode,
        override?: InquiryQuestionPromptForm
    ): InquiryQuestionPromptForm {
        return resolveQuestionPromptForm(question, selectionMode, override);
    }

    private getPromptOptions(zone: InquiryZone): InquiryQuestion[] {
        const config = this.getPromptConfig();
        const icon = zone === 'setup' ? 'help-circle' : zone === 'pressure' ? 'activity' : 'check-circle';
        return (config[zone] ?? [])
            .map((slot, slotIndex) => this.buildInquiryQuestion(zone, slot, icon, slotIndex))
            .filter((question): question is InquiryQuestion => !!question);
    }

    private getActivePrompt(zone: InquiryZone): InquiryQuestion | undefined {
        const options = this.getPromptOptions(zone);
        if (!options.length) return undefined;
        const activeId = this.state.selectedPromptIds[zone];
        const match = options.find(prompt => prompt.id === activeId);
        if (match) return match;
        const fallback = options[0];
        this.state.selectedPromptIds[zone] = fallback.id;
        return fallback;
    }

    private getProcessedPromptState(): { id: string | null; status: 'success' | 'error' | null } {
        const result = this.state.activeResult;
        if (!result || this.state.isRunning) return { id: null, status: null };
        if (result.scope !== this.state.scope) return { id: null, status: null };
        const scopeLabel = this.getScopeLabel();
        if (result.scopeLabel && result.scopeLabel !== scopeLabel) return { id: null, status: null };
        const status = this.isErrorResult(result) ? 'error' : 'success';
        return { id: result.questionId, status };
    }

    private updateZonePrompts(): void {
        this.syncSelectedPromptIds();
        const paddingX = 24;
        const pillHeight = 40;
        const processed = this.getProcessedPromptState();
        this.zonePromptElements.forEach((elements, zone) => {
            const prompt = this.getActivePrompt(zone);
            if (!prompt) {
                if (elements.text.textContent !== '') {
                    this.perfCounters.svgTextWrites++;
                    elements.text.textContent = '';
                    elements.bg.setAttribute('width', '0');
                    elements.bg.setAttribute('height', '0');
                    elements.glow.setAttribute('width', '0');
                    elements.glow.setAttribute('height', '0');
                    elements.group.classList.remove('is-active', 'is-processed', 'is-processed-success', 'is-processed-error', 'is-locked');
                    elements.group.removeAttribute('data-prompt-id');
                }
                return;
            }

            if (elements.text.textContent !== prompt.standardPrompt) {
                this.perfCounters.svgTextWrites++;
                elements.text.textContent = prompt.standardPrompt;
                const textLength = elements.text.getComputedTextLength();
                const width = Math.max(textLength + (paddingX * 2), 180);
                const widthFixed = width.toFixed(2);
                
                elements.bg.setAttribute('width', widthFixed);
                elements.bg.setAttribute('height', String(pillHeight));
                elements.bg.setAttribute('x', String(-width / 2));
                elements.bg.setAttribute('y', String(-pillHeight / 2));
                elements.bg.setAttribute('rx', String(pillHeight / 2));
                elements.bg.setAttribute('ry', String(pillHeight / 2));
                
                elements.glow.setAttribute('width', widthFixed);
                elements.glow.setAttribute('height', String(pillHeight));
                elements.glow.setAttribute('x', String(-width / 2));
                elements.glow.setAttribute('y', String(-pillHeight / 2));
                elements.glow.setAttribute('rx', String(pillHeight / 2));
                elements.glow.setAttribute('ry', String(pillHeight / 2));
            }

            this.toggleClassIfChanged(elements.group, 'is-active', this.state.selectedPromptIds[zone] === prompt.id, 'svgAttrWrites');
            const isProcessed = processed.id === prompt.id;
            this.toggleClassIfChanged(elements.group, 'is-processed', isProcessed, 'svgAttrWrites');
            this.toggleClassIfChanged(elements.group, 'is-processed-success', isProcessed && processed.status === 'success', 'svgAttrWrites');
            this.toggleClassIfChanged(elements.group, 'is-processed-error', isProcessed && processed.status === 'error', 'svgAttrWrites');
            this.toggleClassIfChanged(elements.group, 'is-locked', this.state.isRunning && this.state.activeZone === zone, 'svgAttrWrites');
            
            const currentPromptId = elements.group.getAttribute('data-prompt-id');
            if (currentPromptId !== prompt.id) {
                this.perfCounters.svgAttrWrites++;
                elements.group.setAttribute('data-prompt-id', prompt.id);
            }
            if (elements.group.hasAttribute('aria-label')) {
                this.perfCounters.svgAttrWrites++;
                elements.group.removeAttribute('aria-label');
            }
        });
    }

    private updateGlyphPromptState(): void {
        if (!this.glyph) return;
        this.syncSelectedPromptIds();
        const processed = this.getProcessedPromptState();
        const selectionMode = this.getSelectionMode(this.getActiveTargetSceneIds());
        const promptsByZone = {
            setup: this.getPromptOptions('setup').map(prompt => ({ id: prompt.id, question: prompt.standardPrompt, tier: prompt.tier })),
            pressure: this.getPromptOptions('pressure').map(prompt => ({ id: prompt.id, question: prompt.standardPrompt, tier: prompt.tier })),
            payoff: this.getPromptOptions('payoff').map(prompt => ({ id: prompt.id, question: prompt.standardPrompt, tier: prompt.tier }))
        };
        const focusedFormIds = new Set<string>();
        for (const zone of ['setup', 'pressure', 'payoff'] as const) {
            for (const prompt of this.getPromptOptions(zone)) {
                const effective = this.getEffectivePromptOverride(prompt.id);
                if (resolveQuestionPromptForm(prompt, selectionMode, effective) === 'focused') {
                    focusedFormIds.add(prompt.id);
                }
            }
        }
        this.glyph.updatePromptState({
            promptsByZone,
            selectedPromptIds: this.state.selectedPromptIds,
            processedPromptId: processed.id,
            processedStatus: processed.status,
            lockedPromptId: this.state.isRunning ? this.state.activeQuestionId : null,
            focusedFormIds,
            onPromptSelect: (zone, promptId) => {
                if (this.isInquiryRunDisabled()) return;
                if (this.state.isRunning) {
                    this.notifyInteraction('Inquiry running. Please wait.');
                    return;
                }
                const prompt = this.getPromptOptions(zone)
                    .find(item => item.id === promptId);
                if (prompt && this.isErrorState() && this.state.activeResult?.questionId === prompt.id) {
                    void this.openInquiryErrorLog();
                    return;
                }
                this.clearErrorStateForAction();
                this.setSelectedPrompt(zone, promptId);
                if (prompt) {
                    void this.handleQuestionClick(prompt);
                } else {
                    this.notifyInteraction('No question configured for this slot.');
                }
            },
            onPromptContextMenu: (zone, promptId, event) => {
                const prompt = this.getPromptOptions(zone).find(item => item.id === promptId);
                if (!prompt) {
                    this.notifyInteraction('No question configured for this slot.');
                    return;
                }
                this.showQuestionRunMenu(prompt, event);
            },
            onPromptHover: (zone, promptId, promptText) => {
                if (this.isInquiryRunDisabled()) return;
                const prompt = this.getPromptOptions(zone).find(item => item.id === promptId);
                this.showPromptPreview(
                    zone,
                    this.state.mode,
                    prompt
                        ? this.resolveQuestionPromptForRun(prompt, this.getSelectionMode(this.getActiveTargetSceneIds()), this.getEffectivePromptOverride(promptId))
                        : promptText
                );
            },
            onPromptHoverEnd: () => {
                if (this.isInquiryRunDisabled()) return;
                this.hidePromptPreview();
            }
        });
    }

    private syncSelectedPromptIds(): void {
        const config = this.getPromptConfig();
        (['setup', 'pressure', 'payoff'] as InquiryZone[]).forEach(zone => {
            const slots = config[zone] ?? [];
            const available = slots.filter(slot => this.getQuestionTextForSlot(zone, slot).trim().length > 0);
            const desired = available[0]?.id ?? slots[0]?.id ?? zone;
            if (!desired) return;
            const current = this.state.selectedPromptIds[zone];
            const currentValid = available.some(slot => slot.id === current);
            if (!currentValid) {
                this.state.selectedPromptIds[zone] = desired;
            }
        });
    }

    private setSelectedPrompt(zone: InquiryZone, promptId: string): void {
        if (this.state.isRunning) return;
        if (this.state.selectedPromptIds[zone] === promptId) return;
        this.state.selectedPromptIds[zone] = promptId;
        this.updateZonePrompts();
        this.updateGlyphPromptState();
    }

    private handlePromptClick(zone: InquiryZone): void {
        if (this.isInquiryRunDisabled()) return;
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        const options = this.getPromptOptions(zone);
        if (!options.length) {
            this.notifyInteraction('No questions configured for this zone.');
            return;
        }
        const currentId = this.state.selectedPromptIds[zone];
        const currentIdx = options.findIndex(prompt => prompt.id === currentId);
        const nextIdx = options.length > 1
            ? (currentIdx >= 0 ? (currentIdx + 1) % options.length : 0)
            : (currentIdx >= 0 ? currentIdx : 0);
        const nextPrompt = options[nextIdx] ?? options[0];
        if (!nextPrompt) {
            this.notifyInteraction('No questions configured for this zone.');
            return;
        }
        if (this.isErrorState() && this.state.activeResult?.questionId === nextPrompt.id) {
            void this.openInquiryErrorLog();
            return;
        }
        this.clearErrorStateForAction();
        if (nextPrompt.id !== currentId) {
            this.setSelectedPrompt(zone, nextPrompt.id);
        }
        void this.handleQuestionClick(nextPrompt);
    }

    private showQuestionRunMenu(question: InquiryQuestion, event: MouseEvent): void {
        const menu = new Menu();
        const current = this.state.promptFormOverrides[question.id] ?? 'auto';
        const options: Array<{ label: string; value: InquiryPromptFormOverride }> = [
            { label: 'Auto', value: 'auto' },
            { label: 'Standard', value: 'standard' },
            { label: 'Focused', value: 'focused' }
        ];
        for (const opt of options) {
            menu.addItem(item => {
                item.setTitle(opt.value === current ? `${opt.label}  \u2713` : opt.label);
                item.onClick(() => {
                    this.setPromptFormOverride(question.id, opt.value);
                });
            });
        }
        menu.showAtMouseEvent(event);
    }

    private setPromptFormOverride(questionId: string, override: InquiryPromptFormOverride): void {
        if (override === 'auto') {
            delete this.state.promptFormOverrides[questionId];
        } else {
            this.state.promptFormOverrides[questionId] = override;
        }
        this.updateGlyphPromptState();
    }

    private getEffectivePromptOverride(questionId: string): InquiryQuestionPromptForm | undefined {
        const override = this.state.promptFormOverrides[questionId];
        if (!override || override === 'auto') return undefined;
        return override;
    }

    private renderZonePods(parent: SVGGElement): void {
        const rZone = FLOW_RADIUS + FLOW_STROKE + 90;
        const zones: Array<{ id: InquiryZone; angle: number }> = [
            { id: 'setup', angle: 210 },
            { id: 'pressure', angle: 330 },
            { id: 'payoff', angle: 90 }
        ];

        this.zonePromptElements.clear();

        zones.forEach(zone => {
            const pos = this.polarToCartesian(rZone, zone.angle);
            const zoneEl = createSvgGroup(parent, `ert-inquiry-zone-pod ert-inquiry-zone--${zone.id}`, pos.x, pos.y);
            zoneEl.setAttribute('role', 'button');
            zoneEl.setAttribute('tabindex', '0');
            const bg = createSvgElement('rect');
            bg.classList.add('ert-inquiry-zone-pill');
            zoneEl.appendChild(bg);
            const glow = createSvgElement('rect');
            glow.classList.add('ert-inquiry-zone-pill-glow');
            zoneEl.appendChild(glow);

            const text = createSvgText(zoneEl, 'ert-inquiry-zone-pill-text', '', 0, 0);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('alignment-baseline', 'middle');

            this.zonePromptElements.set(zone.id, { group: zoneEl, bg, glow, text });
            bindInquiryZonePodEvents({
                registerSvgEvent: this.registerSvgEvent.bind(this),
                zoneEl,
                onClick: () => this.handlePromptClick(zone.id),
                onContextMenu: (event) => {
                    if (this.isInquiryRunDisabled()) return;
                    const prompt = this.getActivePrompt(zone.id);
                    if (!prompt) {
                        this.notifyInteraction('No questions configured for this zone.');
                        return;
                    }
                    this.showQuestionRunMenu(prompt, event);
                },
                onPointerEnter: () => {
                    if (this.isInquiryRunDisabled()) return;
                    const prompt = this.getActivePrompt(zone.id);
                    if (prompt) {
                        this.showPromptPreview(
                            zone.id,
                            this.state.mode,
                            this.resolveQuestionPromptForRun(prompt, this.getSelectionMode(this.getActiveTargetSceneIds()), this.getEffectivePromptOverride(prompt.id))
                        );
                    }
                    this.setHoverText(this.buildZoneHoverText(zone.id));
                },
                onPointerLeave: () => {
                    if (this.isInquiryRunDisabled()) return;
                    this.clearHoverText();
                    this.hidePromptPreview();
                }
            });
        });
    }

    private polarToCartesian(radius: number, degrees: number): { x: number; y: number } {
        const radians = (degrees * Math.PI) / 180;
        return {
            x: radius * Math.cos(radians),
            y: radius * Math.sin(radians)
        };
    }

    private buildDebugOverlay(parent: SVGElement): void {
        const debugGroup = createSvgGroup(parent, 'ert-inquiry-debug');
        debugGroup.setAttribute('id', 'inq-debug');

        const rect = createSvgElement('rect');
        rect.classList.add('ert-inquiry-debug-frame');
        rect.setAttribute('x', String(VIEWBOX_MIN));
        rect.setAttribute('y', String(VIEWBOX_MIN));
        rect.setAttribute('width', String(VIEWBOX_SIZE));
        rect.setAttribute('height', String(VIEWBOX_SIZE));
        debugGroup.appendChild(rect);

        const xAxis = createSvgElement('line');
        xAxis.classList.add('ert-inquiry-debug-axis');
        xAxis.setAttribute('x1', String(VIEWBOX_MIN));
        xAxis.setAttribute('y1', '0');
        xAxis.setAttribute('x2', String(VIEWBOX_MAX));
        xAxis.setAttribute('y2', '0');
        debugGroup.appendChild(xAxis);

        const yAxis = createSvgElement('line');
        yAxis.classList.add('ert-inquiry-debug-axis');
        yAxis.setAttribute('x1', '0');
        yAxis.setAttribute('y1', String(VIEWBOX_MIN));
        yAxis.setAttribute('x2', '0');
        yAxis.setAttribute('y2', String(VIEWBOX_MAX));
        debugGroup.appendChild(yAxis);

        const tickOffsets = [VIEWBOX_MAX * 0.25, VIEWBOX_MAX * 0.5];
        const tickHalf = 12;
        tickOffsets.forEach(offset => {
            [offset, -offset].forEach(position => {
                const xTick = createSvgElement('line');
                xTick.classList.add('ert-inquiry-debug-tick');
                xTick.setAttribute('x1', String(position));
                xTick.setAttribute('y1', String(-tickHalf));
                xTick.setAttribute('x2', String(position));
                xTick.setAttribute('y2', String(tickHalf));
                debugGroup.appendChild(xTick);

                const yTick = createSvgElement('line');
                yTick.classList.add('ert-inquiry-debug-tick');
                yTick.setAttribute('x1', String(-tickHalf));
                yTick.setAttribute('y1', String(position));
                yTick.setAttribute('x2', String(tickHalf));
                yTick.setAttribute('y2', String(position));
                debugGroup.appendChild(yTick);
            });
        });

        const label = createSvgText(debugGroup, 'ert-inquiry-debug-label', 'ORIGIN', 0, 0);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
    }

    private buildSceneDossierResources(defs: SVGDefsElement): void {
        if (defs.querySelector('#ert-inquiry-scene-dossier-focus-grad')) return;
        const gradient = createSvgElement('radialGradient');
        gradient.setAttribute('id', 'ert-inquiry-scene-dossier-focus-grad');
        gradient.setAttribute('cx', '50%');
        gradient.setAttribute('cy', '46%');
        gradient.setAttribute('fx', '50%');
        gradient.setAttribute('fy', '42%');
        gradient.setAttribute('r', '54%');
        ['0%', '32%', '70%', '100%'].forEach(offset => {
            const stop = createSvgElement('stop');
            stop.setAttribute('offset', offset);
            gradient.appendChild(stop);
        });
        defs.appendChild(gradient);
    }

    private renderModeIcons(parent: SVGGElement): void {
        const iconOffsetY = MODE_ICON_OFFSET_Y;
        const iconSize = Math.round(VIEWBOX_SIZE * 0.25 * 0.7);
        const iconX = Math.round(-iconSize / 2);
        const viewBoxHalf = MODE_ICON_VIEWBOX / 2;
        const iconGroup = createSvgGroup(parent, 'ert-inquiry-mode-icons', 0, iconOffsetY);

        const createIcon = (cls: string, paths: string[], rotateDeg = 0): SVGSVGElement => {
            const group = createSvgElement('svg');
            group.classList.add('ert-inquiry-mode-icon', 'ert-inquiry-mode-icon-btn', cls);
            group.setAttribute('x', String(iconX));
            group.setAttribute('y', '0');
            group.setAttribute('width', String(iconSize));
            group.setAttribute('height', String(iconSize));
            group.setAttribute('viewBox', `${-viewBoxHalf} ${-viewBoxHalf} ${MODE_ICON_VIEWBOX} ${MODE_ICON_VIEWBOX}`);
            group.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            group.setAttribute('pointer-events', 'none');
            const transformGroup = createSvgElement('g');
            if (rotateDeg) {
                transformGroup.setAttribute('transform', `rotate(${rotateDeg})`);
            }
            const pathGroup = createSvgElement('g');
            pathGroup.setAttribute('transform', `translate(${-viewBoxHalf} ${-viewBoxHalf})`);
            paths.forEach(d => {
                const path = createSvgElement('path');
                path.setAttribute('d', d);
                pathGroup.appendChild(path);
            });
            transformGroup.appendChild(pathGroup);
            group.appendChild(transformGroup);
            iconGroup.appendChild(group);
            return group as SVGSVGElement;
        };

        this.flowModeIconEl = createIcon('ert-inquiry-mode-icon--flow', FLOW_ICON_PATHS);
        this.depthModeIconEl = createIcon('ert-inquiry-mode-icon--depth', DEPTH_ICON_PATHS, 90);

        const hit = createSvgElement('rect');
        hit.classList.add('ert-inquiry-mode-icon-hit');
        const hitHeight = Math.round(iconSize * 0.4);
        const hitY = Math.round((iconSize - hitHeight) / 2);
        hit.setAttribute('x', String(iconX));
        hit.setAttribute('y', String(hitY));
        hit.setAttribute('width', String(iconSize));
        hit.setAttribute('height', String(hitHeight));
        hit.setAttribute('rx', String(Math.round(iconSize * 0.2)));
        hit.setAttribute('ry', String(Math.round(iconSize * 0.2)));
        hit.setAttribute('pointer-events', 'all');
        hit.setAttribute('tabindex', '0');
        hit.setAttribute('role', 'button');
        iconGroup.appendChild(hit);
        this.modeIconToggleHit = hit;
    }

    private buildSceneDossierLayer(parent: SVGElement, y: number): void {
        const refs = createInquirySceneDossierLayer(parent, y);
        this.sceneDossierGroup = refs.group;
        this.sceneDossierComposition = refs.composition;
        this.sceneDossierFocusCore = refs.focusCore;
        this.sceneDossierFocusGlow = refs.focusGlow;
        this.sceneDossierFocusOutline = refs.focusOutline;
        this.sceneDossierBg = refs.bg;
        this.sceneDossierBraceLeft = refs.braceLeft;
        this.sceneDossierBraceRight = refs.braceRight;
        this.sceneDossierTextGroup = refs.textGroup;
        this.sceneDossierCoreGroup = refs.coreGroup;
        this.sceneDossierHeader = refs.header;
        this.sceneDossierAnchor = refs.anchor;
        this.sceneDossierBody = refs.body;
        this.sceneDossierBodySecondary = refs.bodySecondary;
        this.sceneDossierBodyDivider = refs.bodyDivider;
        this.sceneDossierFooter = refs.footer;
        this.sceneDossierSource = refs.source;
    }

    private renderWaveHeader(parent: SVGElement): void {
        const flowWidth = 2048;
        const flowOffsetY = 740;
        const targetWidth = VIEWBOX_SIZE * 0.5;
        const scale = targetWidth / flowWidth;
        const y = VIEWBOX_MIN + 50;
        const group = createSvgGroup(parent, 'ert-inquiry-wave-header');
        group.setAttribute('transform', `translate(0 ${y}) scale(${scale.toFixed(4)}) translate(${-flowWidth / 2} ${-flowOffsetY})`);
        group.setAttribute('pointer-events', 'none');

        // Path data is internal to the inquiry renderer.
        const paths = [
            'M1873.99,900.01c.23,1.74-2.27.94-3.48.99-14.3.59-28.74-.35-43.05-.04-2.37.05-4.55,1.03-6.92,1.08-124.15,2.86-248.6,8.35-373,4.92-91.61-2.53-181.2-15.53-273.08-17.92-101.98-2.65-204.05,7.25-305.95.95-83.2-5.14-164.18-24.05-247.02-31.98-121.64-11.65-245.9-13.5-368.04-15.96-2.37-.05-4.55-1.04-6.92-1.08-17.31-.34-34.77.75-52.05.04-1.22-.05-3.72.75-3.48-.99,26.49-.25,53.03.28,79.54.03,144.74-1.38,289.81-5.3,433.95,8.97,18.67,1.85,37.34,5.16,56.01,6.99,165.31,16.18,330.85-3.46,495.99,14.01,118.64,12.56,236.15,30.42,355.97,28.03,87.15,0,174.3,2.45,261.54,1.97Z',
            'M1858.99,840.01c.23,1.74-2.27.94-3.48.99-15.63.64-31.41-.36-47.05-.04-2.37.05-4.55,1.03-6.92,1.08-127.12,2.74-254.28,9.03-381.05,2.97-86.31-4.13-170.32-17.4-256.98-20.02-110.96-3.36-222.13,6.92-333-1-62.18-4.44-123.32-15.98-185.14-22.86-130.81-14.57-267.28-16.86-398.92-19.08-2.36-.04-4.55-1.04-6.92-1.08-20.56-.33-41.57.88-62.05.04-1.22-.05-3.72.75-3.48-.99,27.83-.25,55.7.28,83.54.03,110.53-1,221.67-2.9,331.92,2,82.52,3.67,164.67,14.08,247,17,120.4,4.27,240.84-7.91,361.03,1.97,68.04,5.59,135.16,18.98,203.02,25.98,102.05,10.53,205.5,10.76,307.95,12.05,50.17.63,100.37.51,150.54.97Z',
            'M1842.99,961.01c.23,1.74-2.27.94-3.48.99-25.56,1.05-51.45.11-77.05.96l-79.92,3.08c-11.35.14-22.73-.31-34.08-.08-75.38,1.5-150.52,3.23-225.92,0-70.84-3.04-141.24-10.76-212.08-12.92-110.8-3.38-221.44,7.94-331.95.95-87.75-5.56-170.98-27.28-258.02-35.98-121.12-12.11-248.16-13.39-370.03-15.97-2.37-.05-4.55-1.03-6.92-1.08-16.64-.35-33.43.72-50.05.04-1.22-.05-3.72.75-3.48-.99,21.16-.25,42.37.28,63.54.03,120.89-1.45,244.31-4.94,364.95,1.97,92.31,5.29,182.02,23.64,274.97,26.03,97.61,2.52,194.76-4.98,292.08-1.08,102.89,4.12,204.72,22.93,307.92,28.08,108.68,5.42,217.3,1.72,326.08,4.92,7.47.22,15.65,1.96,23.45,1.05Z',
            'M1892.99,1020.01c.23,1.74-2.27.94-3.48.99-16.61.68-33.41-.29-50.05-.04-2.36.04-4.55,1.04-6.92,1.08-127.73,2.28-255.33,8.29-383,4.92-71.58-1.89-142.68-9.43-214.03-11.97-125.84-4.47-251.12,11.24-377,0-78-6.96-152.8-27.94-231.01-35.99-132.21-13.59-267.3-12.99-400.03-16.97l-19.45-2.03c31.83-.25,63.7.28,95.54.03,135.4-1.07,273.36-5.92,407.82,11.1,42.78,5.42,85.05,13.34,128.15,16.85,139.4,11.34,279.58-5.96,418.98,5.02,46.43,3.66,92.62,10.85,139.01,14.99,108.66,9.68,220.94,10.96,329.95,12.05,55.16.55,110.38-.5,165.54-.03Z',
            'M1846.99,1081.01c.23,1.74-2.27.94-3.48.99-16.29.67-32.74-.35-49.05-.04-126.07,2.42-250.52,8.4-376.97,3.05-54.11-2.29-108-7.25-162.03-8.97-147.59-4.7-291.2,17.69-438.82-4.18-44.08-6.53-87.24-17.93-131.31-24.69-118.91-18.24-240.1-17.95-359.79-24.21l-138.05-1.96-3.48-.99c45.84-.3,91.68-.55,137.54-.97,118.46-1.08,241.16-3.52,358.95,8.96,49.25,5.22,97.78,15.79,147.01,20.99,134.9,14.23,269.26-2.37,404,4,115.35,5.45,230.26,23.7,345.95,24.05l269.54,3.97Z',
            'M1886.99,1140.01c.23,1.74-2.27.94-3.48.99-18.28.75-36.75-.35-55.05-.04-2.36.04-4.55,1.04-6.92,1.08-124.58,2.26-249.4,6.27-374,2.92-79.23-2.13-157.79-10.68-237-9.92-111.01,1.07-222.29,15.23-333.04,4.95-80.02-7.42-157.13-29.72-237.13-38.87-109.52-12.53-220.11-13.58-329.83-18.17-30.26-1.04-60.82.28-91.05-.96-1.22-.05-3.72.75-3.48-.99,33.41-1.66,66.99-.63,100.54-.97,132.12-1.34,266.81-5.51,397.79,13.13,35.16,5,70.02,12.4,105.29,16.71,163.13,19.92,325.43-6.76,489.87,7.13,25.01,2.11,50.01,5.78,75.01,7.99,124.74,11,249.78,13.86,374.95,15.05,42.5.4,85.05-.39,127.54-.03Z',
            'M1827.99,1201.01c.23,1.74-2.27.94-3.48.99-14.29.59-28.74-.28-43.05-.04-115.65,1.92-231.19,6.1-346.92,2-86.12-3.05-168.46-11.59-255-8.92-104.04,3.22-205.73,15.8-310.04,4.95-74.39-7.74-146.25-28.95-221.13-37.87-128.28-15.28-263.63-17.56-392.83-20.17-16.64-.34-33.43.72-50.05.04-1.22-.05-3.72.75-3.48-.99,32.01-2.07,64.38-.68,96.54-.97,143.23-1.26,287.89-5.92,429.79,15.13,72.64,10.78,132.72,21.01,207.21,22.79,120.32,2.88,237.35-12.3,357.95-2.95,126.6,9.81,252.83,24.46,379.97,24.03l154.54,1.97Z',
            'M1866.99,1260.01c.23,1.74-2.27.94-3.48.99-14.95.61-30.07-.28-45.05-.04-2.36.04-4.55,1.04-6.92,1.08-130.78,2.42-262.55,7.17-393.05.97-74.88-3.56-146.78-13.43-221.95-10.97-102.42,3.35-199.73,18.19-303.03,9.95-86.01-6.86-168.89-32.27-255.13-41.87-122.3-13.61-249.91-14.58-372.92-17.08-2.37-.05-4.55-1.04-6.92-1.08-14.31-.24-28.76.63-43.05.04-1.22-.05-3.72.75-3.48-.99,15.16-.25,30.37.28,45.54.03,2.62-.04,5.06-1.05,7.91-1.09,130.55-1.8,270.66-5.74,400.04,7.06,71.51,7.08,141.22,24.72,213.02,29.98,60.88,4.46,121.1,1.83,181.95-1.03,82.54-3.88,157.04-9.61,240.04-1.95,42.37,3.91,84.57,10.5,127.01,13.99,95.85,7.88,192.07,8.57,287.95,12.05l151.54-.03Z',
            'M1844.99,780.01c.23,1.74-2.27.94-3.48.99-13.96.57-28.07-.3-42.05-.04-141.3,2.57-283.58,13.37-424.95,1.04-43.21-3.77-85.9-11.58-129.01-15.99-177.25-18.1-353.26,10.99-529.98-14.02l-187.5-24.98c22.83,1.11,45.69,1.89,68.54,2.95,110.04,5.09,214.45,8.65,324.92,6,86.75-2.08,173.41-7.14,260.03.05,62.88,5.22,124.66,18.79,187.15,26.85,142.22,18.35,285.65,13.88,428.91,16.09,2.85.04,5.29,1.04,7.91,1.09,13.16.25,26.38-.28,39.54-.03Z',
            'M1432.99,1309.01c.23,1.74-2.27.94-3.48.99-5.14.21-10.9.2-16.05.04-95.06-2.94-189.84-5.29-284.95,1.97-64.76,4.95-127.67,14.31-193.05,12.03-95.43-3.32-186.63-31.93-281.08-42.92-123.44-14.36-254.58-17.15-378.83-19.17-15.64-.25-31.43.68-47.05.04-1.22-.05-3.72.75-3.48-.99,8.82-.24,17.71.28,26.54.03,2.37-.07,4.55-1.03,6.92-1.08,128.74-2.8,269.19-5.78,397.03,5.05,70.2,5.95,137.58,23.09,207.02,29.98,53.73,5.33,106.29,4.52,160,2.02,82.26-3.83,161.4-14.61,243.99-7.01,55.59,5.12,110.68,16.34,166.5,19.01Z'
        ];

        paths.forEach(d => {
            const path = createSvgElement('path');
            path.classList.add('ert-inquiry-wave-path');
            path.setAttribute('d', d);
            group.appendChild(path);
        });
    }


    private buildFindingsPanel(findingsGroup: SVGGElement, width: number, height: number): void {
        const bg = createSvgElement('rect');
        bg.classList.add('ert-inquiry-panel-bg');
        bg.setAttribute('width', String(width));
        bg.setAttribute('height', String(height));
        bg.setAttribute('rx', '22');
        bg.setAttribute('ry', '22');
        findingsGroup.appendChild(bg);

        this.findingsTitleEl = createSvgText(findingsGroup, 'ert-inquiry-findings-title', 'Findings', 24, 36);
        this.detailsToggle = this.createIconButton(findingsGroup, width - 88, 14, 32, 'chevron-down', 'Toggle details', 'ert-inquiry-details-toggle');
        this.detailsIcon = this.detailsToggle.querySelector('.ert-inquiry-icon') as SVGUseElement;
        bindInquiryDetailsToggleEvent({
            registerSvgEvent: this.registerSvgEvent.bind(this),
            detailsToggle: this.detailsToggle,
            onClick: () => this.toggleDetails()
        });

        this.detailsEl = createSvgGroup(findingsGroup, 'ert-inquiry-details ert-hidden', 24, 64);
        this.detailRows = [
            createSvgText(this.detailsEl, 'ert-inquiry-detail-row', 'Corpus fingerprint: not available', 0, 0),
            createSvgText(this.detailsEl, 'ert-inquiry-detail-row', 'Recent inquiry sessions: not available', 0, 20)
        ];

        this.summaryEl = createSvgText(findingsGroup, 'ert-inquiry-summary', 'No inquiry run yet.', 24, 120);
        this.verdictEl = createSvgText(findingsGroup, 'ert-inquiry-verdict', 'Run an inquiry to see verdicts.', 24, 144);

        this.findingsListEl = createSvgGroup(findingsGroup, 'ert-inquiry-findings-list', 24, 176);

        const previewY = height - 210;
        this.artifactPreviewEl = createSvgGroup(findingsGroup, 'ert-inquiry-report-preview ert-hidden', 24, previewY);
        this.artifactPreviewBg = createSvgElement('rect');
        this.artifactPreviewBg.classList.add('ert-inquiry-report-preview-bg');
        this.artifactPreviewBg.setAttribute('width', String(width - 48));
        this.artifactPreviewBg.setAttribute('height', '180');
        this.artifactPreviewBg.setAttribute('rx', '14');
        this.artifactPreviewBg.setAttribute('ry', '14');
        this.artifactPreviewEl.appendChild(this.artifactPreviewBg);
    }

    private getResolvedEngine(): ResolvedInquiryEngine {
        if (!this._resolvedEngine) {
            // resolveInquiryEngine never throws — it returns a blocked DTO
            // with honest zeros when the provider lacks required capabilities.
            this._resolvedEngine = resolveInquiryEngine(this.plugin, BUILTIN_MODELS);
        }
        return this._resolvedEngine;
    }

    /** Called externally (e.g. from Settings) when AI strategy changes. */
    onAiSettingsChanged(): void {
        this._resolvedEngine = null;
        this.updateEngineBadge();
        this.refreshEnginePanel();
        this.updateMinimapPressureGauge();
    }

    /** Called externally when Inquiry prompt settings change. */
    onPromptSettingsChanged(): void {
        this.refreshUI({ skipCorpus: true, reason: 'prompt settings changed' });
    }

    /** Called externally when Book Manager settings or order change. */
    onBookSettingsChanged(): void {
        this.refreshUI({ reason: 'book settings changed' });
    }

    private refreshUI(options?: { skipCorpus?: boolean, reason?: string }): void {
        this.perfCounters.refreshUICalls++;
        if (options?.reason) {
            console.debug(`[InquiryView] refreshUI triggered: ${options.reason} (skipCorpus: ${options.skipCorpus ?? false})`);
        }
        this.invalidateRefreshCycleCaches();
        this.refreshDataDependencies(options?.skipCorpus);
        this.refreshDerivedViewState();
        this.refreshVisualChrome();
    }

    private invalidateRefreshCycleCaches(): void {
        this._resolvedEngine = null;
        this._currentCorpusContext = null;
    }

    private refreshDataDependencies(skipCorpus = false): void {
        if (skipCorpus) return;
        this.perfCounters.refreshCorpusCalls++;
        const start = performance.now();
        this.refreshCorpus();
        this.perfCounters.corpusRefreshMs += (performance.now() - start);
    }

    private refreshDerivedViewState(): void {
        this.guidanceState = this.resolveGuidanceState();
        this.renderMinimapTicks();
        this.updateRings();
        this.updateFindingsIndicators();
        this.updateZonePrompts();
        this.updateScopeGlyph();
        void this.requestEstimateSnapshot();
    }

    private refreshVisualChrome(): void {
        this.refreshPrimaryChrome();
        this.refreshSessionChrome();
        this.refreshPanelChrome();
    }

    private refreshPrimaryChrome(): void {
        this.updateScopeToggle();
        this.updateModeToggle();
        this.updateModeClass();
        this.updateActiveZoneStyling();
        this.updateEngineBadge();
        this.updateGlyphPromptState();
    }

    private refreshSessionChrome(): void {
        this.updateFooterStatus();
        this.updateNavigationIcons();
        this.updateNavSessionLabel();
        this.updateRunningState();
    }

    private refreshPanelChrome(): void {
        this.updateBriefingButtonState();
        this.refreshBriefingPanel();
        this.updateFindingsPanel();
        this.updateGuidance();
    }

    private refreshCorpus(): void {
        this.invalidateBriefingPurgeAvailability();
        this.corpusResolver = new InquiryCorpusResolver(this.app.vault, this.app.metadataCache, this.plugin.settings.frontmatterMappings);
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        this.corpus = this.corpusResolver.resolve({
            scope: this.state.scope,
            activeBookId: this.state.activeBookId,
            sources,
            bookProfiles: this.plugin.settings.books
        });

        let shouldPersist = false;
        if (this.corpus.activeBookId) {
            if (this.state.activeBookId !== this.corpus.activeBookId) {
                this.state.activeBookId = this.corpus.activeBookId;
                shouldPersist = true;
            }
        } else {
            if (this.state.activeBookId) {
                this.state.activeBookId = undefined;
                shouldPersist = true;
            }
        }

        if (this.state.scope === 'book') {
            const nextTargetSceneIds = this.resolveTargetSceneIds(this.corpus.activeBookId, this.corpus.scenes);
            if (!this.areTargetSceneIdsEqual(this.state.targetSceneIds, nextTargetSceneIds)) {
                this.state.targetSceneIds = nextTargetSceneIds;
                shouldPersist = true;
            }
            if (this.corpus.activeBookId) {
                const prior = this.lastTargetSceneIdsByBookId.get(this.corpus.activeBookId) ?? [];
                if (!this.areTargetSceneIdsEqual(prior, nextTargetSceneIds)) {
                    this.lastTargetSceneIdsByBookId.set(this.corpus.activeBookId, [...nextTargetSceneIds]);
                    shouldPersist = true;
                }
            }
        }

        this.refreshPayloadStats();

        if (shouldPersist) {
            this.scheduleTargetPersist();
        }
    }

    private updateModeClass(): void {
        if (!this.rootSvg) return;
        this.rootSvg.classList.toggle('is-mode-flow', this.state.mode === 'flow');
        this.rootSvg.classList.toggle('is-mode-depth', this.state.mode === 'depth');
    }

    private setModeIconHoverState(active: boolean): void {
        if (!this.rootSvg) return;
        const canHover = !this.isInquiryGuidanceLockout() && !this.state.isRunning;
        this.rootSvg.classList.toggle('is-mode-icon-hover', active && canHover);
    }

    private getZoneColorVar(zone: InquiryZone): string {
        if (zone === 'pressure') return 'var(--ert-inquiry-zone-pressure)';
        if (zone === 'payoff') return 'var(--ert-inquiry-zone-payoff)';
        return 'var(--ert-inquiry-zone-setup)';
    }

    private updateActiveZoneStyling(): void {
        if (!this.rootSvg) return;
        const zone = this.state.activeZone ?? 'setup';
        const zoneColor = this.getZoneColorVar(zone);
        this.rootSvg.style.setProperty('--ert-inquiry-active-zone-color', zoneColor);
        this.rootSvg.style.setProperty('--ert-inquiry-finding-color', zoneColor);
    }

    private updateScopeToggle(): void {
        this.updateToggleButton(this.scopeToggleButton, this.state.scope === 'saga');
        if (this.scopeToggleIcon) {
            const icon = this.state.scope === 'saga' ? 'sigma' : 'columns-2';
            if (this.scopeToggleIcon instanceof SVGUseElement) {
                this.setIconUse(this.scopeToggleIcon, icon);
            }
        }
    }

    private updateModeToggle(): void {
        this.updateToggleButton(this.modeToggleButton, this.state.mode === 'depth');
        if (this.modeToggleIcon) {
            const icon = this.state.mode === 'depth' ? 'waves-arrow-down' : 'waves';
            this.setIconUse(this.modeToggleIcon, icon);
        }
    }

    private updateToggleButton(button: SVGElement | undefined, isActive: boolean): void {
        if (!button) return;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }

    private setIconButtonDisabled(button: SVGGElement | undefined, disabled: boolean): void {
        if (!button) return;
        button.classList.toggle('is-disabled', disabled);
        button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        button.setAttribute('tabindex', disabled ? '-1' : '0');
    }

    private updateEngineBadge(): void {
        if (!this.engineBadgeGroup) return;
        const engine = this.getResolvedEngine();
        const modelLabel = engine.modelLabel;
        const providerLabel = engine.providerLabel;
        if (this.enginePanelMetaEl) {
            const payloadSummary = this.buildEnginePayloadSummary();
            this.enginePanelMetaEl.setText(`Active: ${providerLabel} · ${modelLabel} · ${payloadSummary.text}`);
        }
        this.syncEngineBadgePulse();
        this.refreshEnginePanel();
    }

    private syncEngineBadgePulse(): void {
        if (!this.engineBadgeGroup) return;
        const readinessUi = this.buildReadinessUiState();
        // While the estimate is still loading, stay neutral — don't flash red for unknown state.
        if (readinessUi.pending) {
            this.engineBadgeGroup.classList.remove('is-engine-pulse-amber', 'is-engine-pulse-red');
            return;
        }
        const hasError = this.isErrorState();
        const red = hasError
            || readinessUi.readiness.state === 'blocked'
            || (readinessUi.packaging === 'singlePassOnly' && readinessUi.readiness.exceedsBudget);
        this.engineBadgeGroup.classList.remove('is-engine-pulse-amber');
        this.engineBadgeGroup.classList.toggle('is-engine-pulse-red', red);
    }

    /**
     * Resolve the engine selection for a run submission.
     * Delegates to the shared canonical resolver — no legacy settings read.
     */
    private resolveEngineSelectionForRun(): {
        provider: AIProviderId;
        modelId: string;
        modelLabel: string;
    } {
        const engine = this.getResolvedEngine();
        return {
            provider: engine.provider,
            modelId: engine.modelId,
            modelLabel: engine.modelLabel
        };
    }

    private getClassScopeConfig(raw?: string[]): { allowAll: boolean; allowed: Set<string> } {
        return getClassScopeConfigPure(raw);
    }

    private getCurrentItems(): InquiryCorpusItem[] {
        if (!this.corpus) return [];
        return this.state.scope === 'saga' ? this.corpus.books : this.corpus.scenes;
    }

    private getMinimapItemFilePath(item: InquiryCorpusItem): string | undefined {
        const scenePath = (item as { filePath?: string }).filePath;
        if (scenePath) return scenePath;
        const bookPath = (item as { rootPath?: string }).rootPath;
        if (bookPath) return bookPath;
        return item.filePaths?.[0];
    }

    private getMinimapItemTitle(item: InquiryCorpusItem): string {
        const filePath = this.getMinimapItemFilePath(item);
        if (filePath) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file && this.isTFile(file)) {
                return this.getDocumentTitle(file);
            }
            const segments = filePath.split('/').filter(Boolean);
            return segments[segments.length - 1] || filePath;
        }
        return item.displayLabel;
    }

    private normalizeTargetSceneIds(value: unknown): string[] {
        const raw = Array.isArray(value)
            ? value
            : (typeof value === 'string' && value.trim().length > 0 ? [value] : []);
        return Array.from(new Set(raw.map(entry => String(entry).trim()).filter(Boolean)));
    }

    private resolveTargetSceneIds(bookId: string | undefined, scenes: InquiryCorpusItem[]): string[] {
        if (!bookId || !scenes.length) return [];
        const candidateIds = [
            ...(this.lastTargetSceneIdsByBookId.get(bookId) ?? []),
            ...this.state.targetSceneIds
        ];
        const next = candidateIds.filter(candidate => (
            scenes.some(scene => this.matchesSceneSelectionId(scene, candidate))
        ));
        return Array.from(new Set(next));
    }

    private areTargetSceneIdsEqual(left: string[], right: string[]): boolean {
        if (left.length !== right.length) return false;
        return left.every((value, index) => value === right[index]);
    }

    private matchesSceneSelectionId(item: InquiryCorpusItem, selectionId: string): boolean {
        const target = selectionId.toLowerCase();
        if (item.id.toLowerCase() === target) return true;
        if (typeof item.sceneId === 'string' && item.sceneId.toLowerCase() === target) return true;
        if (item.filePaths?.some(path => path.toLowerCase() === target)) return true;
        const scenePath = (item as { filePath?: string }).filePath;
        if (scenePath && scenePath.toLowerCase() === target) return true;
        return false;
    }

    private isSceneFile(file: TFile): boolean {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return false;
        const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
        const classValues = this.extractClassValues(normalized);
        return classValues.includes('scene');
    }

    private async refreshMinimapEmptyStates(items: InquiryCorpusItem[]): Promise<void> {
        const updateId = this.minimap.nextEmptyUpdateId();
        if (!items.length) return;
        const thresholds = this.getCorpusThresholds();
        const emptyMax = thresholds.emptyMax;
        const markdownFiles = this.app.vault.getMarkdownFiles();
        const sceneFiles = markdownFiles.filter(file => this.isSceneFile(file));
        const scenePathsByRoot = new Map<string, string[]>();

        const getScenePathsForBook = (rootPath: string): string[] => {
            const cached = scenePathsByRoot.get(rootPath);
            if (cached) return cached;
            const prefix = `${rootPath}/`;
            const paths = sceneFiles
                .filter(file => file.path === rootPath || file.path.startsWith(prefix))
                .map(file => file.path);
            scenePathsByRoot.set(rootPath, paths);
            return paths;
        };

        const wordCounts = await Promise.all(items.map(async item => {
            const scenePath = (item as { filePath?: string }).filePath;
            if (scenePath) {
                const stats = await this.loadCorpusCcStatsByPath(scenePath);
                return stats.bodyWords;
            }

            const rootPath = (item as { rootPath?: string }).rootPath;
            if (rootPath) {
                const rootFile = this.app.vault.getAbstractFileByPath(rootPath);
                if (rootFile && this.isTFile(rootFile)) {
                    const stats = await this.loadCorpusCcStatsByPath(rootPath);
                    return stats.bodyWords;
                }
                const scenePaths = getScenePathsForBook(rootPath);
                if (!scenePaths.length) return 0;
                const stats = await Promise.all(scenePaths.map(path => this.loadCorpusCcStatsByPath(path)));
                return stats.reduce((sum, stat) => sum + stat.bodyWords, 0);
            }

            const fallbackPaths = item.filePaths ?? [];
            if (!fallbackPaths.length) return 0;
            const stats = await Promise.all(fallbackPaths.map(path => this.loadCorpusCcStatsByPath(path)));
            return stats.reduce((sum, stat) => sum + stat.bodyWords, 0);
        }));

        if (!this.minimap.isCurrentEmptyUpdate(updateId)) return;

        this.minimap.applyEmptyStates(wordCounts, emptyMax);
    }

    private renderMinimapTicks(): void {
        const items = this.getCurrentItems();
        const result = this.minimap.renderTicks(items, this.state.scope, VIEWBOX_SIZE, this.buildMinimapRenderCallbacks());
        this.applyMinimapRenderOutcome(items, result);
    }

    private buildMinimapRenderCallbacks(): Parameters<InquiryMinimapRenderer['renderTicks']>[3] {
        return {
            getItemTitle: (item) => this.getMinimapItemTitle(item),
            balanceTooltipText,
            registerDomEvent: (el, event, handler) => this.registerDomEvent(el, event, handler),
            onTickClick: (item, event) => {
                this.clearResultPreview();
                this.clearErrorStateForAction();
                if (this.state.isRunning) {
                    this.notifyInteraction('Inquiry running. Please wait.');
                    return;
                }
                if (this.state.scope === 'book') {
                    if (event.shiftKey) {
                        if (item.sceneId) {
                            this.toggleTargetScene(item.sceneId, { announce: true });
                        } else {
                            this.notifyInteraction('Only scene ticks can be targeted.');
                        }
                        return;
                    }
                    void this.openActiveBriefForItem(item);
                    return;
                }
                this.drillIntoBook(item.id);
            },
            onTickContextMenu: (item, event) => {
                this.handleMinimapTickContextMenu(item, event);
            },
            onTickHover: (item, label, fullLabel) => {
                if (this.state.isRunning) return;
                this.handleMinimapHover(item, label, fullLabel);
            },
            onTickLeave: () => {
                this.clearHoverText();
                const hadPreview = this.minimapResultPreviewActive;
                this.hideSceneDossier();
                if (!hadPreview || this.previewLocked) return;
                this.hidePromptPreview(true);
            }
        };
    }

    private applyMinimapRenderOutcome(
        items: InquiryCorpusItem[],
        result: ReturnType<InquiryMinimapRenderer['renderTicks']>
    ): void {
        if (!result) {
            this.refreshMinimapAfterEmptyRender();
            return;
        }

        this.updatePreviewPanelPosition();
        this.minimap.buildSweepLayer(result.tickLayouts, result.tickWidth, this.minimap.layoutLength ?? 0);
        void this.refreshMinimapEmptyStates(items);
        this.renderCorpusCcStrip();
        this.applyMinimapSubsetShading(items);
        this.updateMinimapTargetStates(this.state.activeResult);
        this.updateMinimapPressureGauge();
    }

    private refreshMinimapAfterEmptyRender(): void {
        this.renderCorpusCcStrip();
        this.updateMinimapTargetStates(this.state.activeResult);
        this.updateMinimapPressureGauge();
        this.updatePreviewPanelPosition();
    }

    private updatePreviewPanelPosition(): void {
        if (!this.previewGroup || !this.minimap.hasGroup) return;
        const targetY = this.minimap.getPreviewPanelTargetY();
        if (!Number.isFinite(targetY)) return;
        this.previewGroup.setAttribute('transform', `translate(0 ${targetY})`);
        this.updateResultsFooterPosition(targetY);
    }

    private applyMinimapSubsetShading(items: InquiryCorpusItem[]): void {
        const manifest = this.buildCorpusManifest('minimap-subset', {
            questionZone: this.state.activeZone ?? undefined,
            applyOverrides: true
        });
        this.minimap.applySubsetShading(items, this.state.scope, manifest);
    }

    private updateMinimapPressureGauge(): void {
        const readinessUi = this.buildReadinessUiState();
        const effectiveReadinessUi = readinessUi.pending
            ? (this.lastReadinessUiState ?? readinessUi)
            : readinessUi;
        // While the estimate is still loading and there is no prior stable state, skip rendering.
        if (effectiveReadinessUi.pending) {
            this.minimap.resetPressureGauge();
            this.updateMinimapReuseStatus();
            return;
        }
        this.lastReadinessUiState = effectiveReadinessUi;
        const basePassPlan = this.getCurrentPassPlan(effectiveReadinessUi);
        const passPlan = this.getDisplayedPassPlan(basePassPlan);
        const styleSource = this.getStyleSource();
        const isPro = isProfessionalActive(this.plugin);
        const advancedContext = getLastAiAdvancedContext(this.plugin, 'InquiryMode') ?? null;
        this.minimap.updatePressureGauge(
            effectiveReadinessUi,
            passPlan,
            styleSource,
            isPro,
            advancedContext,
            this.currentRunProgress,
            (value) => this.formatTokenEstimate(value),
            balanceTooltipText
        );
        this.updateMinimapReuseStatus();
    }

    private getDisplayedPassPlan(passPlan: PassPlanResult): PassPlanResult {
        const progress = this.currentRunProgress;
        if (!this.state.isRunning || !progress || progress.totalPasses <= 1) {
            return passPlan;
        }
        return {
            ...passPlan,
            packagingExpected: true,
            recentExactPassCount: progress.totalPasses,
            displayPassCount: progress.totalPasses,
            packagingTriggerReason: this.describeRunningPassPlan(progress)
        };
    }

    private describeRunningPassPlan(progress: InquiryRunProgressEvent): string {
        if (progress.phase === 'finalizing') {
            return `Finalizing after pass ${progress.totalPasses} of ${progress.totalPasses}.`;
        }
        return `Pass ${progress.currentPass} of ${progress.totalPasses} is in progress.`;
    }

    private updateMinimapReuseStatus(): void {
        const advanced = getLastAiAdvancedContext(this.plugin, 'InquiryMode') ?? null;
        this.minimap.updateReuseStatus(advanced);
    }

    private renderCorpusCcStrip(): void {
        if (!this.rootSvg) return;
        const entries = this.getCorpusCcEntries();
        const entriesByClass = new Map<string, CorpusCcEntry[]>();
        entries.forEach(entry => {
            const list = entriesByClass.get(entry.className) ?? [];
            list.push(entry);
            entriesByClass.set(entry.className, list);
        });
        entriesByClass.forEach(items => {
            items.sort((a, b) => this.compareCorpusCcEntries(a, b));
        });
        const classGroups = this.getCorpusCcClassGroups(entriesByClass);
        const rendered = renderInquiryCorpusStrip({
            rootSvg: this.rootSvg,
            refs: {
                ccGroup: this.ccGroup,
                ccLabelGroup: this.ccLabelGroup,
                ccLabelHit: this.ccLabelHit,
                ccLabel: this.ccLabel,
                ccLabelHint: this.ccLabelHint,
                ccLabelHintIcon: this.ccLabelHintIcon,
                ccEmptyText: this.ccEmptyText,
                ccClassLabels: this.ccClassLabels,
                ccSlots: this.ccSlots
            },
            entries,
            classGroups,
            createIconUse: this.createIconUse.bind(this),
            registerSvgEvent: this.registerSvgEvent.bind(this),
            getScopeLabel: this.getCorpusCcScopeLabel.bind(this),
            getModeMeta: this.getCorpusCcModeMeta.bind(this),
            getHeaderLabelVariants: this.getCorpusCcHeaderLabelVariants.bind(this),
            getHeaderTooltip: this.getCorpusCcHeaderTooltip.bind(this),
            onGlobalToggle: this.handleCorpusGlobalToggle.bind(this),
            onGroupToggle: this.handleCorpusGroupToggle.bind(this),
            onItemToggle: this.handleCorpusItemToggle.bind(this),
            onItemShiftAction: this.handleCorpusItemShiftAction.bind(this),
            onItemContextMenu: this.handleCorpusItemContextMenu.bind(this),
            onItemHover: this.handleCorpusItemHover.bind(this),
            onItemLeave: this.handleCorpusItemLeave.bind(this),
            openEntryPath: (filePath: string) => {
                if (this.state.isRunning) return;
                const file = this.app.vault.getAbstractFileByPath(filePath);
                if (file && this.isTFile(file)) {
                    void openOrRevealFile(this.app, file);
                }
            }
        });
        this.ccGroup = rendered.ccGroup;
        this.ccLabelGroup = rendered.ccLabelGroup;
        this.ccLabelHit = rendered.ccLabelHit;
        this.ccLabel = rendered.ccLabel;
        this.ccLabelHint = rendered.ccLabelHint;
        this.ccLabelHintIcon = rendered.ccLabelHintIcon;
        this.ccEmptyText = rendered.ccEmptyText;
        this.ccClassLabels = rendered.ccClassLabels;
        this.ccSlots = rendered.ccSlots;
        this.ccEntries = rendered.ccEntries;
        this.ccLayout = rendered.ccLayout;
        if (rendered.ccEntries.length) {
            void this.updateCorpusCcData(rendered.ccEntries);
        }
    }

    private getCorpusCcScopeLabel(): string {
        const scopeLabel = this.getScopeLabel();
        const targetLabel = this.getTargetSceneStatusLabel();
        if (this.state.scope === 'saga') {
            return `Corpus · Saga ${scopeLabel} · ${targetLabel}`;
        }
        return `Corpus · Book ${scopeLabel} · ${targetLabel}`;
    }

    private getCorpusGroupBaseClass(className: string): string {
        return getCorpusGroupBaseClassPure(className);
    }

    private getCorpusGroupKey(className: string, scope?: InquiryScope): string {
        return getCorpusGroupKeyPure(className, scope);
    }

    private getSceneBookGroupKey(bookId: string): string {
        return `scene-book:${bookId}`;
    }

    private parseSceneBookGroupKey(groupKey: string): string | null {
        const prefix = 'scene-book:';
        if (!groupKey.startsWith(prefix)) return null;
        const bookId = groupKey.slice(prefix.length).trim();
        return bookId.length ? bookId : null;
    }

    private getCorpusItemKey(className: string, filePath: string, scope?: InquiryScope, sceneId?: string): string {
        return getCorpusItemKeyPure(className, filePath, scope, sceneId);
    }

    private parseCorpusItemKey(entryKey: string): { className: string; scope?: InquiryScope; path: string; sceneId?: string } {
        return parseCorpusItemKeyPure(entryKey);
    }

    private getCorpusItemOverride(
        className: string,
        filePath: string,
        scope?: InquiryScope,
        sceneId?: string
    ): SceneInclusion | undefined {
        return this.corpusService.getItemOverride(className, filePath, scope, sceneId);
    }

    private getCorpusCycleModes(className: string): SceneInclusion[] {
        return getCorpusCycleModesPure(className);
    }

    private getCorpusGroupBaseMode(
        className: string,
        configMap: Map<string, InquiryClassConfig>
    ): SceneInclusion {
        return this.corpusService.getGroupBaseMode(className, configMap, this.state.scope, this.ccEntries);
    }

    private getCorpusGroupEffectiveMode(
        className: string,
        configMap: Map<string, InquiryClassConfig>
    ): SceneInclusion {
        return this.corpusService.getGroupEffectiveMode(className, configMap, this.state.scope, this.ccEntries);
    }

    private getCorpusItemEffectiveMode(
        entry: CorpusManifestEntry,
        configMap: Map<string, InquiryClassConfig>
    ): SceneInclusion {
        return this.corpusService.getItemEffectiveMode(entry, configMap, this.state.scope, this.ccEntries);
    }

    private getCorpusGroupKeys(sources: InquirySourcesSettings): string[] {
        return getCorpusGroupKeysPure(sources, this.ccEntries);
    }

    private getCorpusGlobalMode(
        groupKeys: string[],
        configMap: Map<string, InquiryClassConfig>
    ): SceneInclusion | 'mixed' {
        return this.corpusService.getGlobalMode(groupKeys, configMap, this.state.scope, this.ccEntries);
    }

    private getNextCorpusMode(current: SceneInclusion, modes: SceneInclusion[]): SceneInclusion {
        return getNextCorpusModePure(current, modes);
    }

    private clearItemOverridesForGroup(groupKey: string): void {
        this.corpusService.clearItemOverridesForGroup(groupKey);
    }

    private hasCorpusOverrides(): boolean {
        return this.corpusService.hasOverrides();
    }

    private getCorpusOverrideSummary(): { active: boolean; classCount: number; itemCount: number; total: number } {
        return this.corpusService.getOverrideSummary();
    }

    private applyCorpusOverrideSummary(result: InquiryResult): InquiryResult {
        return this.corpusService.applyOverrideSummary(result);
    }

    private resetCorpusOverrides(): void {
        this.corpusService.resetOverrides();
        this.corpusWarningActive = false;
        this.refreshUI();
    }

    private handleCorpusGroupToggle(groupKey: string): void {
        if (this.state.isRunning) return;
        const sceneBookId = this.parseSceneBookGroupKey(groupKey);
        if (sceneBookId) {
            this.handleCorpusSceneBookGroupToggle(sceneBookId);
            return;
        }
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const configMap = new Map((sources.classes || []).map(config => [config.className, config]));
        const currentMode = this.getCorpusGroupEffectiveMode(groupKey, configMap);
        const modes = this.getCorpusCycleModes(groupKey);
        const nextMode = this.getNextCorpusMode(currentMode, modes);
        const baseMode = this.getCorpusGroupBaseMode(groupKey, configMap);
        const normalizedNext = this.normalizeContributionMode(nextMode, this.getCorpusGroupBaseClass(groupKey));
        if (normalizedNext === baseMode) {
            this.corpusService.deleteClassOverride(groupKey);
        } else {
            this.corpusService.setClassOverride(groupKey, normalizedNext);
        }
        this.clearItemOverridesForGroup(groupKey);
        this.corpusWarningActive = false;
        this.refreshUI();
    }

    private getSceneBookEffectiveMode(entries: CorpusCcEntry[]): SceneInclusion | 'mixed' {
        if (!entries.length) return 'excluded';
        const modes = entries.map(entry => this.normalizeContributionMode(entry.mode ?? 'excluded', 'scene'));
        const first = modes[0];
        if (modes.every(mode => mode === first)) return first;
        return 'mixed';
    }

    private getSceneBookDisplayMode(entries: CorpusCcEntry[]): SceneInclusion {
        const mode = this.getSceneBookEffectiveMode(entries);
        if (mode === 'mixed') {
            const hasFull = entries.some(entry => this.normalizeContributionMode(entry.mode ?? 'excluded', 'scene') === 'full');
            return hasFull ? 'full' : 'summary';
        }
        return mode;
    }

    private handleCorpusSceneBookGroupToggle(bookId: string): void {
        const entries = this.ccEntries.filter(entry => entry.className === 'scene' && entry.bookId === bookId);
        if (!entries.length) return;

        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const configMap = new Map((sources.classes || []).map(config => [config.className, config]));
        const classMode = this.getCorpusGroupEffectiveMode('scene', configMap);
        const currentMode = this.getSceneBookEffectiveMode(entries);
        const modes = this.getCorpusCycleModes('scene');
        const nextMode = currentMode === 'mixed' ? 'excluded' : this.getNextCorpusMode(currentMode, modes);
        const normalizedNext = this.normalizeContributionMode(nextMode, 'scene');

        entries.forEach(entry => {
            if (normalizedNext === classMode) {
                this.corpusService.deleteItemOverrideByKey(entry.entryKey);
            } else {
                this.corpusService.setItemOverrideByKey(entry.entryKey, normalizedNext);
            }
        });

        this.corpusWarningActive = false;
        this.refreshUI();
    }

    private handleCorpusItemToggle(entryKey: string): void {
        if (this.state.isRunning) return;
        const entry = this.ccEntries.find(candidate => candidate.entryKey === entryKey);
        if (!entry) return;
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const configMap = new Map((sources.classes || []).map(config => [config.className, config]));
        const groupKey = this.getCorpusGroupKey(entry.classKey, entry.scope);
        const classMode = this.getCorpusGroupEffectiveMode(groupKey, configMap);
        const currentMode = this.normalizeContributionMode(entry.mode, this.getCorpusGroupBaseClass(groupKey));
        const modes = this.getCorpusCycleModes(groupKey);
        const nextMode = this.getNextCorpusMode(currentMode, modes);
        const normalizedNext = this.normalizeContributionMode(nextMode, this.getCorpusGroupBaseClass(groupKey));
        if (normalizedNext === classMode) {
            this.corpusService.deleteItemOverrideByKey(entryKey);
        } else {
            this.corpusService.setItemOverrideByKey(entryKey, normalizedNext);
        }
        this.corpusWarningActive = false;
        this.refreshUI();
    }

    private setCorpusItemInclusion(entryKey: string, mode: SceneInclusion): void {
        const entry = this.ccEntries.find(candidate => candidate.entryKey === entryKey);
        if (!entry) return;
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const configMap = new Map((sources.classes || []).map(config => [config.className, config]));
        const groupKey = this.getCorpusGroupKey(entry.classKey, entry.scope);
        const classMode = this.getCorpusGroupEffectiveMode(groupKey, configMap);
        const normalizedMode = this.normalizeContributionMode(mode, this.getCorpusGroupBaseClass(groupKey));
        if (normalizedMode === classMode) {
            this.corpusService.deleteItemOverrideByKey(entryKey);
        } else {
            this.corpusService.setItemOverrideByKey(entryKey, normalizedMode);
        }
        this.corpusWarningActive = false;
        this.refreshUI();
    }

    private toggleTargetScene(sceneId: string, options?: { announce?: boolean }): void {
        if (this.state.scope !== 'book') {
            if (options?.announce) {
                this.notifyInteraction('Target Scenes are available only in Book scope.');
            }
            return;
        }
        const normalizedId = String(sceneId || '').trim();
        if (!normalizedId) return;

        const existing = this.normalizeTargetSceneIds(this.state.targetSceneIds);
        const isTarget = existing.includes(normalizedId);
        const next = isTarget
            ? existing.filter(candidate => candidate !== normalizedId)
            : [...existing, normalizedId];
        this.state.targetSceneIds = next;

        const activeBookId = this.corpus?.activeBookId ?? this.state.activeBookId;
        if (activeBookId) {
            this.lastTargetSceneIdsByBookId.set(activeBookId, [...next]);
        }

        this.scheduleTargetPersist();
        this.refreshUI();

        if (options?.announce) {
            this.notifyInteraction(isTarget ? 'Removed from Target Scenes.' : 'Added to Target Scenes.');
        }
    }

    private handleCorpusItemShiftAction(entryKey: string, filePath: string, event: MouseEvent): void {
        if (this.state.isRunning) return;
        event.preventDefault();
        const entry = this.ccEntries.find(candidate => candidate.entryKey === entryKey);
        if (!entry) return;
        if (entry.classKey === 'scene' && entry.sceneId) {
            this.toggleTargetScene(entry.sceneId, { announce: true });
            return;
        }
        if (filePath) {
            const file = this.app.vault.getAbstractFileByPath(filePath);
            if (file && this.isTFile(file)) {
                void openOrRevealFile(this.app, file);
            }
        }
    }

    private showSceneEntryMenu(options: {
        entryKey: string;
        filePath: string;
        sceneId?: string;
        isTarget: boolean;
        event: MouseEvent;
    }): void {
        const menu = new Menu();
        menu.addItem(item => {
            item.setTitle(options.sceneId ? 'Open Scene' : 'Open Note');
            item.onClick(() => {
                const file = this.app.vault.getAbstractFileByPath(options.filePath);
                if (file && this.isTFile(file)) {
                    void openOrRevealFile(this.app, file);
                }
            });
        });
        menu.addSeparator();
        ([
            ['excluded', 'Set Inclusion: Exclude'],
            ['summary', 'Set Inclusion: Summary'],
            ['full', 'Set Inclusion: Full Scene']
        ] as const).forEach(([mode, title]) => {
            menu.addItem(item => {
                item.setTitle(title);
                item.onClick(() => this.setCorpusItemInclusion(options.entryKey, mode));
            });
        });
        menu.addSeparator();
        menu.addItem(item => {
            const bookOnly = this.state.scope !== 'book';
            item.setTitle(options.isTarget ? 'Remove from Target Scenes' : 'Add to Target Scenes');
            if (bookOnly || !options.sceneId) {
                item.setDisabled(true);
                return;
            }
            item.onClick(() => this.toggleTargetScene(options.sceneId!, { announce: true }));
        });
        menu.showAtMouseEvent(options.event);
    }

    private handleCorpusItemContextMenu(entryKey: string, filePath: string, event: MouseEvent): void {
        if (this.state.isRunning) return;
        event.preventDefault();
        const entry = this.ccEntries.find(candidate => candidate.entryKey === entryKey);
        if (!entry) return;
        this.showSceneEntryMenu({
            entryKey,
            filePath,
            sceneId: entry.classKey === 'scene' ? entry.sceneId : undefined,
            isTarget: entry.isTarget,
            event
        });
    }

    private handleCorpusItemHover(entryKey: string): void {
        if (this.state.isRunning) return;
        const entry = this.ccEntries.find(candidate => candidate.entryKey === entryKey);
        if (!entry?.sceneId) {
            this.minimap.updateLinkedHoverState();
            return;
        }
        this.minimap.updateLinkedHoverState(entry.sceneId);
    }

    private handleCorpusItemLeave(): void {
        this.minimap.updateLinkedHoverState();
    }

    private handleCorpusGlobalToggle(): void {
        if (this.state.isRunning) return;
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const configMap = new Map((sources.classes || []).map(config => [config.className, config]));
        const groupKeys = this.getCorpusGroupKeys(sources);
        if (!groupKeys.length) return;
        const current = this.getCorpusGlobalMode(groupKeys, configMap);
        const next = current === 'excluded'
            ? 'summary'
            : current === 'summary'
                ? 'full'
                : 'excluded';

        this.corpusService.resetOverrides();
        groupKeys.forEach(groupKey => {
            const baseClass = this.getCorpusGroupBaseClass(groupKey);
            const normalizedTarget = this.normalizeContributionMode(next, baseClass);
            const baseMode = this.getCorpusGroupBaseMode(groupKey, configMap);
            if (normalizedTarget !== baseMode) {
                this.corpusService.setClassOverride(groupKey, normalizedTarget);
            }
        });
        this.corpusWarningActive = false;
        this.refreshUI();
    }

    private isCorpusEmpty(): boolean {
        const stats = this.getPayloadStats();
        const total = stats.sceneTotal
            + stats.bookOutlineCount
            + stats.sagaOutlineCount
            + stats.referenceCounts.total;
        return total === 0;
    }

    private handleEmptyCorpusRun(): void {
        this.corpusWarningActive = true;
        this.updateGuidanceHelpTooltip(this.guidanceState);
        this.notifyInteraction('Corpus disabled. Enable corpus to run Inquiry.');
    }

    private getCorpusCcModeMeta(mode: SceneInclusion): {
        label: string;
        short: string;
        icon: string;
        isActive: boolean;
    } {
        if (mode === 'summary') {
            return { label: 'Summary', short: 'SUM', icon: 'circle-dot', isActive: true };
        }
        if (mode === 'full') {
            return { label: 'Full Scene', short: 'FULL', icon: 'disc', isActive: true };
        }
        return { label: 'Exclude', short: 'EXCL', icon: 'circle', isActive: false };
    }

    private getCorpusCcHeaderLabelVariants(className: string, count: number, overrideLabel?: string): string[] {
        if (overrideLabel && overrideLabel.trim().length > 0) {
            return [overrideLabel.trim()];
        }
        if (className === 'outline-saga') {
            return [`${SIGMA_CHAR}`];
        }
        const base = this.getCorpusClassLabelVariants(className);
        return base.map(label => `${label} ${count}`);
    }

    private getCorpusCcHeaderTooltip(
        className: string,
        mode: SceneInclusion,
        count: number,
        overrideLabel?: string
    ): string {
        const meta = this.getCorpusCcModeMeta(mode);
        const label = (overrideLabel && overrideLabel.trim().length > 0)
            ? overrideLabel.trim()
            : this.getCorpusCcHeaderDisplayLabel(className);
        const parts = [label, meta.label];
        if (meta.isActive || count > 0) {
            parts.push(String(count));
        }
        return parts.join(' · ');
    }

    private getCorpusCcHeaderDisplayLabel(className: string): string {
        if (className === 'outline-saga') return 'Saga Outline';
        const variants = this.getCorpusClassLabelVariants(className);
        return variants[0] ?? 'Class';
    }

    private getCorpusClassLabelVariants(className: string): string[] {
        const normalized = className.trim();
        if (!normalized) return ['Class', 'Cls', 'C'];
        if (normalized === 'outline-saga') {
            return [`${SIGMA_CHAR}`, 'Saga', 'S'];
        }
        const words = normalized
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[^a-zA-Z0-9]+/g, ' ')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        const title = words.length
            ? words.map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
            : normalized.charAt(0).toUpperCase() + normalized.slice(1);
        const acronym = words.length > 1
            ? words.map(word => word.charAt(0).toUpperCase()).join('').slice(0, 3)
            : title.slice(0, 3).toUpperCase();
        const letter = title.charAt(0).toUpperCase();
        const variants = [title, acronym, letter];
        return Array.from(new Set(variants.filter(Boolean)));
    }

    private getSceneBookMetaFromEntry(entry: CorpusCcEntry): { bookId: string; bookLabel: string; order: number } {
        const books = this.corpus?.books ?? [];
        if (entry.bookId) {
            const match = books.find(book => book.id === entry.bookId);
            if (match) {
                const index = books.findIndex(book => book.id === match.id);
                return {
                    bookId: match.id,
                    bookLabel: entry.bookLabel || match.displayLabel,
                    order: index >= 0 ? index : Number.POSITIVE_INFINITY
                };
            }
            return {
                bookId: entry.bookId,
                bookLabel: entry.bookLabel || '?',
                order: Number.POSITIVE_INFINITY
            };
        }

        const byPath = books.find(book => entry.filePath === book.rootPath || entry.filePath.startsWith(`${book.rootPath}/`));
        if (byPath) {
            const index = books.findIndex(book => book.id === byPath.id);
            return {
                bookId: byPath.id,
                bookLabel: byPath.displayLabel,
                order: index >= 0 ? index : Number.POSITIVE_INFINITY
            };
        }

        const fallback = entry.filePath.split('/').filter(Boolean);
        const folder = fallback.length > 1 ? fallback[0] : 'book';
        const numeric = this.getCorpusCcOrderNumber(folder, 'outline');
        const fallbackLabel = numeric !== null ? `B${numeric}` : '?';
        return {
            bookId: folder || entry.filePath,
            bookLabel: fallbackLabel,
            order: numeric !== null ? numeric : Number.POSITIVE_INFINITY
        };
    }

    private buildSagaSceneGroups(
        sceneEntries: CorpusCcEntry[],
        sceneMode: SceneInclusion
    ): CorpusCcGroup[] {
        if (!sceneEntries.length) {
            return [{
                key: 'scene',
                className: 'scene',
                items: [],
                count: 0,
                mode: sceneMode
            }];
        }

        const groups = new Map<string, { items: CorpusCcEntry[]; label: string; order: number }>();
        sceneEntries.forEach(entry => {
            const meta = this.getSceneBookMetaFromEntry(entry);
            const bucket = groups.get(meta.bookId);
            if (bucket) {
                bucket.items.push(entry);
                return;
            }
            groups.set(meta.bookId, { items: [entry], label: meta.bookLabel, order: meta.order });
        });

        const orderedGroups = Array.from(groups.entries())
            .map(([bookId, value]) => ({
                key: this.getSceneBookGroupKey(bookId),
                className: 'scene' as const,
                items: value.items,
                count: value.items.length,
                mode: this.getSceneBookDisplayMode(value.items),
                headerLabel: value.label,
                headerTooltipLabel: `${value.label} Scenes`,
                order: value.order
            }))
            .sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return a.headerLabel!.localeCompare(b.headerLabel!, undefined, { numeric: true, sensitivity: 'base' });
            });

        return orderedGroups.map(({ order: _order, ...group }) => group);
    }

    private getCorpusCcClassGroups(entriesByClass: Map<string, CorpusCcEntry[]>): CorpusCcGroup[] {
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const classScope = this.getClassScopeConfig(sources.classScope);
        const configMap = new Map((sources.classes || []).map(config => [config.className, config]));
        const configs = (sources.classes || [])
            .filter(config => classScope.allowAll || classScope.allowed.has(config.className));
        const groups: CorpusCcGroup[] = [];
        const ensureGroup = (className: string, mode: SceneInclusion) => {
            const items = entriesByClass.get(className) ?? [];
            groups.push({ key: className, className, items, count: items.length, mode });
        };

        configs.forEach(config => {
            if (!config) return;
            const normalizedName = config.className;
            if (normalizedName === 'scene' && this.state.scope === 'saga') {
                const sceneMode = this.getCorpusGroupEffectiveMode('scene', configMap);
                const sceneItems = entriesByClass.get('scene') ?? [];
                groups.push(...this.buildSagaSceneGroups(sceneItems, sceneMode));
                return;
            }
            if (normalizedName === 'outline') {
                const outlineMode = this.getCorpusGroupEffectiveMode('outline', configMap);
                ensureGroup('outline', outlineMode);
                if (this.state.scope === 'saga') {
                    const sagaMode = this.getCorpusGroupEffectiveMode('outline-saga', configMap);
                    const sagaItems = entriesByClass.get('outline-saga') ?? [];
                    groups.push({
                        key: 'outline-saga',
                        className: 'outline-saga',
                        items: sagaItems,
                        count: sagaItems.length,
                        mode: sagaMode,
                        headerLabel: `${SIGMA_CHAR}`,
                        headerTooltipLabel: 'Saga Outline'
                    });
                }
                return;
            }

            const normalizedMode = this.getCorpusGroupEffectiveMode(normalizedName, configMap);
            ensureGroup(normalizedName, normalizedMode);
        });

        entriesByClass.forEach((items, className) => {
            if (groups.some(group => group.key === className || group.className === className)) return;
            const override = this.corpusService.getClassOverride(className);
            const mode = override ?? items[0]?.mode ?? 'excluded';
            groups.push({
                key: className,
                className,
                items,
                count: items.length,
                mode: this.normalizeContributionMode(mode, this.getCorpusGroupBaseClass(className))
            });
        });

        const order = ['scene', 'outline', 'outline-saga', 'character', 'place', 'power'];
        groups.sort((a, b) => {
            const aIndex = order.indexOf(a.className);
            const bIndex = order.indexOf(b.className);
            if (aIndex !== -1 || bIndex !== -1) {
                return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
            }
            return a.className.localeCompare(b.className);
        });

        return groups;
    }

    private resolveCorpusBookForPath(path: string): { id: string; label: string } | undefined {
        const books = this.corpus?.books ?? [];
        const match = books.find(book => path === book.rootPath || path.startsWith(`${book.rootPath}/`));
        if (match) {
            return {
                id: match.id,
                label: match.displayLabel
            };
        }

        const segments = path.split('/').filter(Boolean);
        const bookSegmentIndex = segments.findIndex(segment => /^book\s+\d+/i.test(segment));
        if (bookSegmentIndex >= 0) {
            const segment = segments[bookSegmentIndex];
            const numberMatch = segment.match(/^book\s+(\d+)/i);
            const number = numberMatch ? Number.parseInt(numberMatch[1], 10) : Number.NaN;
            return {
                id: segments.slice(0, bookSegmentIndex + 1).join('/'),
                label: Number.isFinite(number) ? `B${number}` : '?'
            };
        }

        const fallbackRoot = segments[0] || path;
        const numeric = this.getCorpusCcOrderNumber(fallbackRoot, 'outline');
        return {
            id: fallbackRoot,
            label: numeric !== null ? `B${numeric}` : '?'
        };
    }

    private getCorpusCcEntries(): CorpusCcEntry[] {
        // No corpus entries when book scope is unresolved.
        if (this.state.scope === 'book' && this.corpus && !this.corpus.bookResolved) {
            return [];
        }
        const manifest = this.buildCorpusEntryList(this.state.activeQuestionId ?? 'cc-preview', {
            questionZone: this.state.activeZone ?? undefined,
            includeInactive: true,
            applyOverrides: true
        });
        const sceneEntries = manifest.entries.filter(entry => entry.class === 'scene');
        const outlineEntries = manifest.entries.filter(entry => entry.class === 'outline');
        const referenceEntries = manifest.entries.filter(entry => entry.class !== 'scene' && entry.class !== 'outline');
        const bookOutlineEntries = outlineEntries
            .filter(entry => entry.scope !== 'saga');
        const sagaOutlineEntries = this.state.scope === 'saga'
            ? outlineEntries.filter(entry => entry.scope === 'saga')
            : [];

        const scopedEntries = [
            ...sceneEntries,
            ...bookOutlineEntries,
            ...sagaOutlineEntries,
            ...referenceEntries
        ];

        return scopedEntries.map(entry => {
            const fallbackLabel = entry.path.split('/').pop() || entry.path;
            const file = this.app.vault.getAbstractFileByPath(entry.path);
            const label = file && this.isTFile(file) ? this.getDocumentTitle(file) : fallbackLabel;
            const className = entry.class === 'outline' && entry.scope === 'saga'
                ? 'outline-saga'
                : entry.class;
            const entryKey = this.getCorpusItemKey(entry.class, entry.path, entry.scope, entry.sceneId);
            const resolvedSceneBook = entry.class === 'scene' ? this.resolveCorpusBookForPath(entry.path) : undefined;
            const sceneBook = entry.class === 'scene'
                ? {
                    id: entry.bookId || resolvedSceneBook?.id || '',
                    label: resolvedSceneBook?.label || '?'
                }
                : undefined;
            return {
                id: `${entry.class}:${entry.path}`,
                entryKey,
                label,
                filePath: entry.path,
                sceneId: entry.sceneId,
                bookId: sceneBook?.id || undefined,
                bookLabel: sceneBook?.label,
                className,
                classKey: entry.class,
                scope: entry.scope,
                mode: this.normalizeContributionMode(entry.mode ?? 'excluded', entry.class),
                isTarget: entry.isTarget,
                sortLabel: label
            };
        });
    }

    private compareCorpusCcEntries(a: CorpusCcEntry, b: CorpusCcEntry): number {
        const aLabel = (a.sortLabel ?? a.label).trim();
        const bLabel = (b.sortLabel ?? b.label).trim();
        const aNumber = this.getCorpusCcOrderNumber(aLabel, a.className);
        const bNumber = this.getCorpusCcOrderNumber(bLabel, b.className);
        const aHasNumber = aNumber !== null;
        const bHasNumber = bNumber !== null;

        if (aHasNumber && bHasNumber && aNumber !== bNumber) {
            return aNumber - bNumber;
        }
        if (aHasNumber !== bHasNumber) {
            return aHasNumber ? -1 : 1;
        }

        const labelCompare = aLabel.localeCompare(bLabel, undefined, { numeric: false, sensitivity: 'base' });
        if (labelCompare !== 0) return labelCompare;
        return a.filePath.localeCompare(b.filePath);
    }

    private getCorpusCcOrderNumber(label: string, className: string): number | null {
        const normalized = label.toLowerCase();
        const patterns: RegExp[] = [];
        const isOutline = className === 'outline' || className === 'outline-saga';

        if (className === 'scene') {
            patterns.push(/^\s*(?:scene|sc)\s*#?\s*(\d+)/);
            patterns.push(/^\s*s(\d+)\b/);
            patterns.push(/^\s*(\d+)\b/);
            patterns.push(/\bscene\s*#?\s*(\d+)/);
        } else if (isOutline) {
            patterns.push(/^\s*(?:book|bk)\s*#?\s*(\d+)/);
            patterns.push(/\bbook\s*#?\s*(\d+)/);
            patterns.push(/^\s*(\d+)\b/);
        } else {
            patterns.push(/^\s*(\d+)\b/);
        }

        for (const pattern of patterns) {
            const match = normalized.match(pattern);
            if (!match) continue;
            const num = Number.parseInt(match[1], 10);
            if (Number.isFinite(num)) return num;
        }

        return null;
    }

    private buildSagaCcEntries(corpus: InquiryCorpusSnapshot): CorpusCcEntry[] {
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const classScope = this.getClassScopeConfig(sources.classScope);
        const outlineConfig = (sources.classes || []).find(cfg => cfg.className === 'outline');
        if (!outlineConfig?.enabled) {
            return [];
        }
        const includeBookOutlines = this.isModeActive(outlineConfig.bookScope);
        const includeSagaOutlines = this.isModeActive(outlineConfig.sagaScope);
        const outlineAllowed = includeBookOutlines || includeSagaOutlines;
        if (!outlineAllowed || (!classScope.allowAll && !classScope.allowed.has('outline'))) {
            return [];
        }

        const outlineFiles = this.getOutlineFiles();
        const bookOutlines = outlineFiles.filter(file => (this.getOutlineScope(file) ?? 'book') === 'book');
        const sagaOutlines = outlineFiles.filter(file => this.getOutlineScope(file) === 'saga');

        const entries: CorpusCcEntry[] = [];
        if (includeBookOutlines) {
            entries.push(...corpus.books.map(book => {
                const outline = bookOutlines.find(file => file.path === book.rootPath || file.path.startsWith(`${book.rootPath}/`));
                const filePath = outline?.path || '';
                return {
                    id: outline?.path || book.id,
                    entryKey: this.getCorpusItemKey('outline', filePath || book.id, 'book'),
                    label: book.displayLabel,
                    filePath,
                    className: 'outline',
                    classKey: 'outline',
                    mode: this.normalizeContributionMode(outlineConfig.bookScope, 'outline'),
                    isTarget: false
                };
            }));
        }

        if (includeSagaOutlines) {
            const sagaOutline = sagaOutlines[0];
            const filePath = sagaOutline?.path || '';
            entries.push({
                id: sagaOutline?.path || 'saga-outline',
                entryKey: this.getCorpusItemKey('outline', filePath || 'saga-outline', 'saga'),
                label: 'Saga',
                filePath,
                className: 'outline',
                classKey: 'outline',
                mode: this.normalizeContributionMode(outlineConfig.sagaScope, 'outline'),
                isTarget: false
            });
        }

        return entries;
    }

    private getOutlineFiles(): TFile[] {
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const classScope = this.getClassScopeConfig(sources.classScope);
        const outlineConfig = (sources.classes || []).find(cfg => cfg.className === 'outline');
        if (!outlineConfig?.enabled) return [];
        if (!this.isModeActive(outlineConfig.bookScope) && !this.isModeActive(outlineConfig.sagaScope)) return [];
        if (!classScope.allowAll && !classScope.allowed.has('outline')) return [];

        const { resolvedVaultRoots } = resolveInquirySourceRoots(this.app.vault, sources, this.plugin.settings.books);
        const bookResolution = resolveBookManagerInquiryBooks(this.plugin.settings.books);

        const inRoots = (path: string) => {
            return resolvedVaultRoots.some(root => !root || path === root || path.startsWith(`${root}/`));
        };

        const files = this.app.vault.getMarkdownFiles();
        return files.filter(file => {
            if (!inRoots(file.path)) return false;
            if (!isPathIncludedByInquiryBooks(file.path, bookResolution.candidates, this.state.scope)) return false;
            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
            if (!frontmatter) return false;
            const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
            const classValues = this.extractClassValues(normalized);
            return classValues.includes('outline');
        });
    }

    private getOutlineScope(file: TFile): InquiryScope | undefined {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return undefined;
        return this.getFrontmatterScope(frontmatter);
    }

    // Corpus Async Coordination
    private async updateCorpusCcData(entries: CorpusCcEntry[]): Promise<void> {
        const updateId = ++this.ccUpdateId;
        const stats = await Promise.all(entries.map(entry => this.loadCorpusCcStats(entry)));
        if (updateId !== this.ccUpdateId) return;
        const thresholds = this.getCorpusThresholds();
        const pageHeight = this.ccLayout?.pageHeight ?? Math.round(CC_PAGE_BASE_SIZE * 1.45);
        stats.forEach((entryStats, idx) => {
            const slot = this.ccSlots[idx];
            const entry = entries[idx];
            if (!slot || !entry) return;
            const viewModel = buildInquiryCorpusCcSlotViewModel({
                entry,
                stats: entryStats,
                thresholds,
                pageHeight
            });
            applyInquiryCorpusCcSlotViewModel(slot, viewModel);
        });
    }

    private getCorpusThresholds(): { emptyMax: number; sketchyMin: number; mediumMin: number; substantiveMin: number } {
        const defaults = DEFAULT_SETTINGS.inquiryCorpusThresholds || {
            emptyMax: 10,
            sketchyMin: 100,
            mediumMin: 300,
            substantiveMin: 1000
        };
        const raw = this.plugin.settings.inquiryCorpusThresholds || defaults;
        return {
            emptyMax: Number.isFinite(raw.emptyMax) ? raw.emptyMax : defaults.emptyMax,
            sketchyMin: Number.isFinite(raw.sketchyMin) ? raw.sketchyMin : defaults.sketchyMin,
            mediumMin: Number.isFinite(raw.mediumMin) ? raw.mediumMin : defaults.mediumMin,
            substantiveMin: Number.isFinite(raw.substantiveMin) ? raw.substantiveMin : defaults.substantiveMin
        };
    }

    private async loadCorpusCcStats(entry: CorpusCcEntry): Promise<CorpusCcStats> {
        const filePath = entry.filePath;
        if (!filePath) {
            return { bodyWords: 0, synopsisWords: 0, synopsisQuality: 'missing' };
        }
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file || !this.isTFile(file)) {
            return { bodyWords: 0, synopsisWords: 0, synopsisQuality: 'missing' };
        }
        const mtime = file.stat.mtime ?? 0;
        const title = this.getDocumentTitle(file);
        const frontmatter = this.getNormalizedFrontmatter(file) ?? {};
        const { statusRaw, due } = this.getDocumentStatusFields(frontmatter);
        const cached = this.ccWordCache.get(filePath);
        if (cached && cached.mtime === mtime && cached.statusRaw === statusRaw && cached.due === due && cached.title === title) {
            return {
                bodyWords: cached.bodyWords,
                synopsisWords: cached.synopsisWords,
                synopsisQuality: cached.synopsisQuality,
                statusRaw: cached.statusRaw,
                due: cached.due,
                title: cached.title
            };
        }
        const content = await this.app.vault.cachedRead(file);
        const body = this.stripFrontmatter(content);
        const bodyWords = this.countWords(body);
        const summary = this.extractSummary(frontmatter);
        const synopsisWords = this.countWords(summary);
        const synopsisQuality = classifySynopsis(summary);
        this.ccWordCache.set(filePath, {
            mtime,
            bodyWords,
            synopsisWords,
            synopsisQuality,
            statusRaw,
            due,
            title
        });
        return {
            bodyWords,
            synopsisWords,
            synopsisQuality,
            statusRaw,
            due,
            title
        };
    }

    private async loadCorpusCcStatsByPath(filePath: string): Promise<CorpusCcStats> {
        return this.loadCorpusCcStats({
            id: filePath,
            entryKey: this.getCorpusItemKey('', filePath),
            label: filePath,
            filePath,
            className: '',
            classKey: '',
            mode: 'full',
            isTarget: false
        });
    }

    private getDocumentStatusFields(frontmatter: Record<string, unknown>): { statusRaw?: string; due?: string } {
        const rawStatus = frontmatter['Status'];
        const statusCandidate = Array.isArray(rawStatus)
            ? String(rawStatus[0] ?? '').trim()
            : (typeof rawStatus === 'string' ? rawStatus.trim() : '');

        const rawDue = frontmatter['Due'];
        const due = typeof rawDue === 'string' ? rawDue.trim() : '';

        return {
            statusRaw: statusCandidate || undefined,
            due: due || undefined
        };
    }

    private getDocumentTitle(file: TFile): string {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        if (frontmatter) {
            const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
            const rawTitle = normalized['Title'] ?? normalized['title'];
            if (typeof rawTitle === 'string' && rawTitle.trim()) {
                return rawTitle.trim();
            }
        }
        return file.basename;
    }

    private stripFrontmatter(content: string): string {
        if (!content.startsWith('---')) return content;
        const match = content.match(/^---\s*\n[\s\S]*?\n---\s*\n?/);
        if (!match) return content;
        return content.slice(match[0].length);
    }

    private countWords(content: string): number {
        const trimmed = content.trim();
        if (!trimmed) return 0;
        const matches = trimmed.match(/[A-Za-z0-9]+(?:['\u2019'-][A-Za-z0-9]+)*/g);
        return matches ? matches.length : 0;
    }

    private getStyleSource(): Element {
        return this.contentEl ?? this.rootSvg ?? document.documentElement;
    }

    private isTFile(file: TAbstractFile | null): file is TFile {
        return !!file && file instanceof TFile;
    }

    private updateScopeGlyph(): void {
        this.glyph?.update({ scopeLabel: this.getScopeLabel() });
        this.glyph?.root.classList.remove('is-expanded');
        this.updateScopeGlyphTooltip();
    }

    private updateScopeGlyphTooltip(): void {
        if (!this.glyphHit) return;
        this.glyphHit.classList.toggle('is-tooltip-only', this.state.scope === 'book');
        if (this.state.scope !== 'book') {
            this.glyphHit.removeAttribute('data-rt-tip');
            this.glyphHit.removeAttribute('data-rt-tip-placement');
            return;
        }
        const bookTitle = this.getActiveBookTitleForMessages() || this.getActiveBookLabel();
        const tooltipText = bookTitle?.trim();
        if (!tooltipText) {
            this.glyphHit.removeAttribute('data-rt-tip');
            this.glyphHit.removeAttribute('data-rt-tip-placement');
            return;
        }
        addTooltipData(this.glyphHit, balanceTooltipText(tooltipText), 'top');
    }

    private updateRings(): void {
        const glyphSeed = this.resolveGlyphSeed();
        const result = this.state.activeResult;
        const hasError = this.isErrorResult(result);
        const errorRing = hasError ? this.state.mode : null;
        const ringOverrideColor = this.isInquiryRunDisabled() ? this.getInquiryAlertColor() : undefined;

        this.glyph?.update({
            scopeLabel: this.getScopeLabel(),
            flowValue: glyphSeed.flowValue,
            depthValue: glyphSeed.depthValue,
            flowVisualValue: glyphSeed.flowVisualValue,
            depthVisualValue: glyphSeed.depthVisualValue,
            impact: glyphSeed.impact,
            assessmentConfidence: glyphSeed.assessmentConfidence,
            errorRing,
            ringOverrideColor
        });
    }

    private updateFindingsIndicators(): void {
        const result = this.state.activeResult;
        if (this.rootSvg) {
            if (this.state.isRunning) {
                this.rootSvg.classList.remove('is-error');
            } else {
                this.rootSvg.classList.toggle('is-error', this.isErrorResult(result));
            }
        }
        this.updateMinimapFindingStates(result);
    }

    private isErrorResult(result: InquiryResult | null | undefined): boolean {
        if (!result) return false;
        if (result.aiStatus && result.aiStatus !== 'success' && result.aiStatus !== 'degraded') return true;
        return result.findings.some(finding => finding.kind === 'error');
    }

    private isDegradedResult(result: InquiryResult | null | undefined): boolean {
        return !!result && (result.aiStatus === 'degraded' || result.aiReason === 'recovered_invalid_response');
    }

    private hasBindableInquiryHits(result: InquiryResult): boolean {
        return this.buildFindingMap(result, this.getResultItems(result)).size > 0;
    }

    private shouldRejectUnboundHitResult(result: InquiryResult): boolean {
        if (this.isErrorResult(result)) return false;
        if (result.scope !== 'book') return false;
        if (!result.findings.some(finding => this.isFindingHit(finding))) return false;
        return !this.hasBindableInquiryHits(result);
    }

    private withCitationBindingFailure(result: InquiryResult): InquiryResult {
        const message = 'Inquiry completed its passes, but no finding could be matched to this corpus. No minimap findings were available.';
        return {
            ...result,
            aiStatus: 'rejected',
            aiReason: 'citation_binding_failed',
            summary: message,
            summaryFlow: message,
            summaryDepth: message,
            findings: [{
                refId: '',
                kind: 'error',
                status: 'unclear',
                impact: 'medium',
                assessmentConfidence: 'high',
                headline: 'Inquiry citations could not be matched to this corpus.',
                bullets: [message],
                related: [],
                evidenceType: 'mixed',
                lens: 'both'
            }]
        };
    }

    private isErrorState(): boolean {
        return !this.state.isRunning && this.isErrorResult(this.state.activeResult);
    }

    private isResultsState(): boolean {
        return !this.state.isRunning && !!this.state.activeResult && !this.isErrorResult(this.state.activeResult);
    }

    private clearErrorStateForAction(): void {
        if (!this.isErrorState()) return;
        this.dismissError();
    }

    private notifyInteraction(message: string): void {
        new Notice(message);
    }

    private pulseZonePrompt(zone: InquiryZone, promptId: string): void {
        const elements = this.zonePromptElements.get(zone);
        if (elements) {
            elements.group.classList.add('is-duplicate-pulse');
        }
        if (this.glyph) {
            this.glyph.setPromptPulse(promptId, true);
        }
        if (this.duplicatePulseTimer) {
            window.clearTimeout(this.duplicatePulseTimer);
        }
        this.duplicatePulseTimer = window.setTimeout(() => {
            elements?.group.classList.remove('is-duplicate-pulse');
            this.glyph?.setPromptPulse(promptId, false);
            this.duplicatePulseTimer = undefined;
        }, DUPLICATE_PULSE_MS);
    }

    private pulseRehydrateButton(zone: InquiryZone): void {
        if (!this.artifactButton) return;
        this.state.activeZone = zone;
        this.updateActiveZoneStyling();
        this.artifactButton.classList.add('is-rehydrate-pulse');
        if (this.rehydratePulseTimer) {
            window.clearTimeout(this.rehydratePulseTimer);
        }
        this.rehydratePulseTimer = window.setTimeout(() => {
            this.artifactButton?.classList.remove('is-rehydrate-pulse');
            this.rehydratePulseTimer = undefined;
        }, REHYDRATE_PULSE_MS);
    }

    private highlightRehydrateSession(sessionKey?: string): void {
        if (!sessionKey) return;
        this.rehydrateTargetKey = sessionKey;
        this.refreshBriefingPanel();
        if (this.rehydrateHighlightTimer) {
            window.clearTimeout(this.rehydrateHighlightTimer);
        }
        this.rehydrateHighlightTimer = window.setTimeout(() => {
            this.rehydrateTargetKey = undefined;
            this.refreshBriefingPanel();
            this.rehydrateHighlightTimer = undefined;
        }, REHYDRATE_HIGHLIGHT_MS);
    }

    private handleDuplicateRunFeedback(question: InquiryQuestion, sessionKey?: string): void {
        this.state.activeZone = question.zone;
        this.updateActiveZoneStyling();
        this.pulseZonePrompt(question.zone, question.id);
        this.pulseRehydrateButton(question.zone);
        this.highlightRehydrateSession(sessionKey);
        this.notifyInteraction('Inquiry already run. Open Recent Inquiry Sessions to reopen.');
    }

    private showErrorPreview(result: InquiryResult): void {
        if (!this.previewGroup || !this.previewHero) return;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        const zone = result.questionZone ?? this.findPromptZoneById(result.questionId) ?? 'setup';
        const reason = this.formatApiErrorReason(result);
        const meta = reason ? `Error: ${reason}` : 'Error';
        const emptyRows = Array(this.previewRows.length || 6).fill('');
        this.previewLocked = true;
        this.previewGroup.classList.add('is-visible', 'is-error');
        this.previewGroup.classList.remove('is-locked', 'is-results');
        this.setPreviewRunningNoteText('');
        this.resetPreviewRowLabels();
        this.setPreviewFooterText('Click panel to open the Inquiry Log.');
        this.updatePromptPreview(zone, this.state.mode, 'Inquiry paused.', emptyRows, meta, { hideEmpty: true });
    }

    private updateMinimapFindingStates(result: InquiryResult | null | undefined): void {
        const resultItems = result ? this.getResultItems(result) : [];
        const findingMap = this.buildFindingMap(result, resultItems);
        this.minimap.updateFindingStates(
            this.state.isRunning,
            this.isErrorResult(result),
            findingMap,
            balanceTooltipText
        );
    }

    private updateArtifactPreview(): void {
        // No-op while findings panel is removed.
    }

    private updateFooterStatus(): void {
        // Legacy diagnostics removed from footer by design.
    }

    private setApiStatus(_state: 'idle' | 'running' | 'success' | 'error', _reason?: string): void {
        this.updateFooterStatus();
    }

    private updateNavigationIcons(): void {
        if (!this.navPrevButton || !this.navNextButton || !this.navPrevIcon || !this.navNextIcon) return;
        this.setIconUse(this.navPrevIcon, 'chevron-left');
        this.setIconUse(this.navNextIcon, 'chevron-right');

        const books = this.getNavigationBooks();
        const current = this.getNavigationBookIndex(books);
        const hasPrev = books.length > 1 && current > 0;
        const hasNext = books.length > 1 && current >= 0 && current < books.length - 1;
        const lockout = this.isInquiryGuidanceLockout();
        const running = this.state.isRunning;

        this.setIconButtonDisabled(this.navPrevButton, running || lockout || !hasPrev);
        this.setIconButtonDisabled(this.navNextButton, running || lockout || !hasNext);

        const prevBook = hasPrev ? books[current - 1] : undefined;
        const nextBook = hasNext ? books[current + 1] : undefined;
        const prevTooltip = prevBook
            ? `Previous book: ${this.getBookTitleForId(prevBook.id) || prevBook.displayLabel || 'Book'}`
            : 'No previous book.';
        const nextTooltip = nextBook
            ? `Next book: ${this.getBookTitleForId(nextBook.id) || nextBook.displayLabel || 'Book'}`
            : 'No next book.';

        addTooltipData(this.navPrevButton, balanceTooltipText(prevTooltip), 'top');
        addTooltipData(this.navNextButton, balanceTooltipText(nextTooltip), 'top');
    }

    private updateNavSessionLabel(): void {
        if (!this.navSessionLabel) return;
        this.toggleClassIfChanged(this.navSessionLabel, 'is-welcome', false, 'hudAttrWrites');
        if (this.state.scope === 'book' && this.corpus && !this.corpus.bookResolved) {
            this.setTextIfChanged(this.navSessionLabel, 'Book scope unresolved. Check Inquiry sources.', 'hudTextWrites');
            return;
        }
        if (this.state.isRunning) {
            this.setTextIfChanged(this.navSessionLabel, this.buildRunningStageLabel(this.currentRunProgress) || 'Waiting for the provider response.', 'hudTextWrites');
            return;
        }
        const sessionId = this.state.activeSessionId;
        if (!sessionId) {
            const glyphSeed = this.resolveGlyphSeed();
            if (glyphSeed.source === 'session' && glyphSeed.session) {
                this.setTextIfChanged(this.navSessionLabel, this.formatSessionNavLabel(glyphSeed.session), 'hudTextWrites');
                return;
            }
            this.toggleClassIfChanged(this.navSessionLabel, 'is-welcome', true, 'hudAttrWrites');
            this.setTextIfChanged(this.navSessionLabel, 'Welcome to Inquiry View', 'hudTextWrites');
            return;
        }
        const session = this.sessionStore.peekSession(sessionId);
        if (!session) {
            const glyphSeed = this.resolveGlyphSeed();
            if (glyphSeed.source === 'session' && glyphSeed.session) {
                this.setTextIfChanged(this.navSessionLabel, this.formatSessionNavLabel(glyphSeed.session), 'hudTextWrites');
                return;
            }
            this.toggleClassIfChanged(this.navSessionLabel, 'is-welcome', true, 'hudAttrWrites');
            this.setTextIfChanged(this.navSessionLabel, 'Welcome to Inquiry View', 'hudTextWrites');
            return;
        }
        this.setTextIfChanged(this.navSessionLabel, this.formatSessionNavLabel(session), 'hudTextWrites');
    }

    private formatSessionNavLabel(session: InquirySession): string {
        const timestamp = session.createdAt || session.lastAccessed;
        const date = new Date(timestamp);
        const formatted = date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
        return `ID: ${formatted.replace(/\s+(AM|PM)/i, (_, m) => m.toLowerCase())}`;
    }

    private updateRunningState(): void {
        if (!this.rootSvg) return;
        const isRunning = this.state.isRunning;
        const wasRunning = this.wasRunning;
        const runDisabled = this.isInquiryRunDisabled();
        this.wasRunning = isRunning;
        this.rootSvg.classList.toggle('is-running', isRunning);
        this.previewGroup?.classList.toggle('is-running', isRunning);
        this.glyph?.setZoneInteractionsEnabled(!isRunning && !runDisabled);
        const isError = this.rootSvg.classList.contains('is-error');
        const hasResult = !!this.state.activeResult && !isError;
        this.rootSvg.classList.toggle('is-results', !isRunning && hasResult);
        if (wasRunning && !isRunning) {
            (['setup', 'pressure', 'payoff'] as InquiryZone[]).forEach(zone => {
                this.glyph?.setZoneScaleLocked(zone, false);
            });
        }
        if (isRunning) {
            this.startRunningAnimations();
            this.updateMinimapPressureGauge();
            if (!this.updateRunningClockInterval) {
                this.updateRunningClockInterval = window.setInterval(() => this.updateRunningHud(), 1000);
            }
        } else {
            this.stopRunningAnimations();
            if (this.updateRunningClockInterval) {
                window.clearInterval(this.updateRunningClockInterval);
                this.updateRunningClockInterval = undefined;
            }
            if (wasRunning) {
                this.startBackboneFadeOut();
            }
            this.updateMinimapPressureGauge();
        }
        this.updateRunningHud();
        this.updateNavSessionLabel();
    }

    private resolveGuidanceState(): InquiryGuidanceState {
        if (this.state.isRunning) return 'running';
        if (!this.isInquiryConfigured()) return 'not-configured';
        if (this.getInquirySceneCount() === 0) return 'no-scenes';
        if (this.isResultsState()) return 'results';
        return 'ready';
    }

    private isInquiryConfigured(): boolean {
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const hasBooks = (this.plugin.settings.books || []).some(book => (book.sourceFolder || '').trim().length > 0);
        return hasBooks && (sources.classScope?.length ?? 0) > 0;
    }

    private getInquirySceneCount(): number {
        if (!this.isInquiryConfigured()) return 0;
        const entryList = this.buildCorpusEntryList('scene-count', {
            includeInactive: true,
            applyOverrides: false
        });
        return entryList.entries.filter(entry => entry.class === 'scene').length;
    }

    private hasInquirySessions(): boolean {
        return this.sessionStore.getSessionCount() > 0;
    }

    private isInquiryRunDisabled(): boolean {
        return this.guidanceState === 'not-configured' || this.guidanceState === 'no-scenes';
    }

    private isInquiryGuidanceLockout(): boolean {
        return this.guidanceState === 'no-scenes';
    }

    private isInquiryBlocked(): boolean {
        return this.guidanceState === 'not-configured';
    }

    private getInquiryAlertColor(): string {
        const styleSource = this.getStyleSource();
        if (!this.rootSvg) return getExecutionColorValue(styleSource, '--rt-ai-error', '#ff4d4d');
        const color = getComputedStyle(this.rootSvg).getPropertyValue('--ert-inquiry-alert').trim();
        return color || getExecutionColorValue(styleSource, '--rt-ai-error', '#ff4d4d');
    }

    private updateGuidance(): void {
        const state = this.guidanceState;
        const runDisabled = this.isInquiryRunDisabled();
        const blocked = this.isInquiryBlocked();
        const lockout = this.isInquiryGuidanceLockout();
        const running = this.state.isRunning;

        if (this.rootSvg) {
            this.rootSvg.classList.toggle('is-inquiry-blocked', runDisabled);
            this.rootSvg.classList.toggle('is-run-locked', runDisabled || running);
            this.rootSvg.classList.toggle('is-no-scenes', state === 'no-scenes');
            this.rootSvg.classList.toggle('is-guidance-lockout', lockout);
        }
        if (lockout || running) {
            this.setModeIconHoverState(false);
        }
        this.contentEl.classList.toggle('is-inquiry-blocked', blocked);
        this.contentEl.classList.toggle('is-guidance-lockout', lockout);

        this.zonePromptElements.forEach(({ group }) => {
            const disabled = runDisabled || running;
            group.setAttribute('aria-disabled', disabled ? 'true' : 'false');
            group.setAttribute('tabindex', disabled ? '-1' : '0');
        });

        this.setIconButtonDisabled(this.apiSimulationButton, runDisabled || running);
        this.setIconButtonDisabled(this.scopeToggleButton, lockout || running);
        this.setIconButtonDisabled(this.engineBadgeGroup, lockout || running);
        this.setIconButtonDisabled(this.artifactButton, lockout || running);
        this.setIconButtonDisabled(this.detailsToggle, lockout || running);

        this.updateBriefingFooterActionStates();
        if (lockout || running) {
            this.hideBriefingPanel(true);
            this.hideEnginePanel();
        }

        this.updateGuidanceText(state);
        this.updateGuidanceHelpTooltip(state);
        this.updateNavigationIcons();
    }

    private updateGuidanceText(state: InquiryGuidanceState): void {
        if (!this.hoverTextEl) return;
        if (state === 'running') {
            this.hoverTextEl.classList.add('ert-hidden');
            this.hoverTextEl.classList.remove('is-guidance', 'is-guidance-alert', 'is-guidance-results');
            clearSvgChildren(this.hoverTextEl);
            return;
        }

        const isNoScenes = state === 'no-scenes';
        const isAlert = state === 'not-configured' || isNoScenes;
        if (!isAlert) {
            this.hoverTextEl.classList.add('ert-hidden');
            this.hoverTextEl.classList.remove('is-guidance', 'is-guidance-alert', 'is-guidance-results');
            clearSvgChildren(this.hoverTextEl);
            return;
        }

        const guidanceLines = state === 'not-configured'
            ? ['Inquiry is not configured.', 'Set scan roots and class scope in Settings → Radial Timeline → Inquiry.']
            : ['No Scenes Found', 'Check scan roots and class scope in Settings → Radial Timeline → Inquiry.'];
        const lineHeight = isAlert
            ? (isNoScenes ? GUIDANCE_ALERT_LINE_HEIGHT + 14 : GUIDANCE_ALERT_LINE_HEIGHT)
            : GUIDANCE_LINE_HEIGHT;

        this.hoverTextEl.classList.remove('ert-hidden');
        this.hoverTextEl.classList.toggle('is-guidance', true);
        this.hoverTextEl.classList.toggle('is-guidance-alert', isAlert);
        this.hoverTextEl.classList.toggle('is-guidance-results', false);
        this.hoverTextEl.setAttribute('x', '0');
        this.hoverTextEl.setAttribute('y', String(GUIDANCE_TEXT_Y));
        this.hoverTextEl.setAttribute('text-anchor', 'middle');
        this.setGuidanceTextLines(
            guidanceLines,
            lineHeight,
            isNoScenes
                ? { primaryClass: 'ert-inquiry-guidance-primary', primarySize: 40, primaryWeight: 800 }
                : undefined
        );
    }

    private setGuidanceTextLines(
        lines: string[],
        lineHeight: number,
        options?: { primaryClass?: string; primarySize?: number; primaryWeight?: number }
    ): void {
        const hoverTextEl = this.hoverTextEl;
        if (!hoverTextEl) return;
        clearSvgChildren(hoverTextEl);
        const x = hoverTextEl.getAttribute('x') ?? '0';
        const primaryClass = options?.primaryClass;
        const primarySize = options?.primarySize;
        const primaryWeight = options?.primaryWeight;
        lines.forEach((line, index) => {
            const tspan = createSvgElement('tspan');
            tspan.setAttribute('x', x);
            tspan.setAttribute('dy', index === 0 ? '0' : String(lineHeight));
            if (index === 0 && primaryClass) {
                tspan.classList.add(primaryClass);
                if (primarySize) {
                    tspan.setAttribute('font-size', String(primarySize));
                }
                if (primaryWeight) {
                    tspan.setAttribute('font-weight', String(primaryWeight));
                }
            }
            tspan.textContent = line;
            hoverTextEl.appendChild(tspan);
        });
    }

    private updateGuidanceHelpTooltip(state: InquiryGuidanceState): void {
        if (!this.helpToggleButton) return;
        const hasSessions = this.hasInquirySessions();
        const corpusAlert = this.corpusWarningActive && this.isCorpusEmpty();
        const isAlert = state === 'not-configured' || state === 'no-scenes' || corpusAlert;
        const isResults = state === 'results';
        const isRunning = state === 'running';
        const tooltip = isRunning
            ? (this.activeInquiryRunToken
                ? INQUIRY_HELP_RUNNING_SINGLE_TOOLTIP
                : INQUIRY_HELP_RUNNING_TOOLTIP)
            : (corpusAlert
                ? INQUIRY_HELP_CORPUS_TOOLTIP
                : (isAlert
                    ? (state === 'not-configured' ? INQUIRY_HELP_CONFIG_TOOLTIP : INQUIRY_HELP_NO_SCENES_TOOLTIP)
                    : (isResults ? INQUIRY_HELP_RESULTS_TOOLTIP : (hasSessions ? INQUIRY_HELP_TOOLTIP : INQUIRY_HELP_ONBOARDING_TOOLTIP))));
        const balancedTooltip = balanceTooltipText(tooltip);

        this.helpToggleButton.removeAttribute('aria-pressed');
        this.helpToggleButton.setAttribute('aria-disabled', isRunning ? 'true' : 'false');
        this.helpToggleButton.classList.toggle('is-help-onboarding', !hasSessions && !isAlert && !isResults);
        this.helpToggleButton.classList.toggle('is-help-results', isResults && !corpusAlert);
        this.helpToggleButton.classList.toggle('is-guidance-alert', isAlert);
        addTooltipData(this.helpToggleButton, balancedTooltip, 'left');
    }

    private handleGuidanceHelpClick(): void {
        const state = this.resolveGuidanceState();
        this.guidanceState = state;
        if (state === 'running') {
            return;
        }
        if (state === 'not-configured') {
            this.openInquirySettings('sources');
            return;
        }
        if (state === 'no-scenes') {
            this.openInquirySettings('sources');
            return;
        }
        window.open(INQUIRY_GUIDANCE_DOC_URL, '_blank');
    }

    private openInquirySettings(
        focus: 'overview' | 'sources' | 'class-scope' | 'scan-roots' | 'class-presets'
    ): void {
        if (this.plugin.settingsTab) {
            this.plugin.settingsTab.setActiveTab('inquiry');
        }
        // SAFE: any type used for accessing Obsidian's internal settings API
        const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
        if (setting) {
            setting.open();
            setting.openTabById('radial-timeline');
        }
        window.setTimeout(() => {
            if (focus === 'overview') {
                return;
            }
            if (focus === 'sources') {
                this.scrollInquirySetting('class-scope');
                window.setTimeout(() => this.scrollInquirySetting('scan-roots'), 80);
                return;
            }
            this.scrollInquirySetting(focus);
        }, 160);
    }

    private scrollInquirySetting(target: 'class-scope' | 'scan-roots' | 'class-presets'): void {
        const el = document.querySelector(`[data-ert-role="inquiry-setting:${target}"]`);
        if (!(el instanceof HTMLElement)) return;
        el.scrollIntoView({ block: 'center' });
    }

    private startRunningAnimations(): void {
        const styleSource: Element = this.contentEl ?? this.rootSvg ?? document.documentElement;
        const isPro = isProfessionalActive(this.plugin);
        this.minimap.startRunningAnimations(
            styleSource,
            isPro,
            () => this.state.isRunning,
            (elapsedMs) => this.updateRunningHudFrame(elapsedMs)
        );
    }

    private stopRunningAnimations(): void {
        this.minimap.stopRunningAnimations();
        this.updateRunningHud();
    }

    private startBackboneFadeOut(): void {
        this.minimap.startFadeOut();
    }

    private cancelBackboneFadeOut(): void {
        this.minimap.cancelFadeOut();
    }

    private handleScopeChange(scope: InquiryScope): void {
        this.clearErrorStateForAction();
        if (!scope || scope === this.state.scope) return;
        this.state.scope = scope;
        if (scope === 'saga' && this.state.targetSceneIds.length) {
            this.notifyInteraction('Target Scenes are book-only. They remain saved and become inactive in Saga scope.');
        }
        if (this.state.activeResult) {
            this.clearActiveResultState();
            this.unlockPromptPreview();
            this.setApiStatus('idle');
        }
        this.refreshUI();
    }

    private setActiveLens(mode: InquiryLens): void {
        if (!mode || mode === this.state.mode) return;
        // Lens is UI emphasis only; inquiry computation must always include flow + depth.
        this.state.mode = mode;
        this.plugin.settings.inquiryLastMode = mode;
        void this.plugin.saveSettings();
        this.updateModeClass();
        this.updateRings();
        if (this.isResultsState() && this.state.activeResult) {
            this.showResultsPreview(this.state.activeResult);
        }
        if (!this.previewLocked && this.previewGroup?.classList.contains('is-visible') && this.previewLast) {
            this.updatePromptPreview(this.previewLast.zone, mode, this.previewLast.question, undefined, undefined, { hideEmpty: true });
        }
    }

    private handleRingClick(mode: InquiryLens): void {
        if (this.isInquiryGuidanceLockout()) return;
        this.clearErrorStateForAction();
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        if (mode === this.state.mode) {
            if (this.isResultsState() && this.state.activeResult) {
                this.showResultsPreview(this.state.activeResult);
            }
            this.notifyInteraction(`${mode === 'flow' ? 'Flow' : 'Depth'} lens already active.`);
            return;
        }
        this.setActiveLens(mode);
    }

    private handleModeIconToggleClick(): void {
        const nextMode: InquiryLens = this.state.mode === 'flow' ? 'depth' : 'flow';
        this.handleRingClick(nextMode);
    }

    private buildModeToggleHoverText(): string {
        const nextMode = this.state.mode === 'flow' ? 'Depth' : 'Flow';
        return `Switch to ${nextMode} lens.`;
    }

    private handleGlyphClick(): void {
        if (this.isInquiryGuidanceLockout()) return;
        this.clearErrorStateForAction();
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        if (this.state.scope === 'saga') {
            this.state.scope = 'book';
            this.refreshUI();
            return;
        }
    }

    private beginInquiryRunToken(): number {
        const token = ++this.inquiryRunTokenCounter;
        this.activeInquiryRunToken = token;
        this.cancelledInquiryRunTokens.delete(token);
        return token;
    }

    private finishInquiryRunToken(token: number): void {
        this.cancelledInquiryRunTokens.delete(token);
        if (this.activeInquiryRunToken === token) {
            this.activeInquiryRunToken = 0;
        }
    }

    private shouldDiscardInquiryRunOutcome(token: number): boolean {
        if (!token) return false;
        if (this.cancelledInquiryRunTokens.has(token)) return true;
        return this.activeInquiryRunToken !== token;
    }

    private requestActiveInquiryCancellation(): void {
        if (!this.state.isRunning) return;
        const token = this.activeInquiryRunToken;
        if (!token) {
            this.notifyInteraction('This run cannot be cancelled from the preview panel.');
            return;
        }
        this.cancelledInquiryRunTokens.add(token);
        if (this.activeInquiryRunToken === token) {
            this.activeInquiryRunToken = 0;
        }
        this.state.isRunning = false;
        this.currentRunProgress = null;
        this.pendingGuardQuestion = undefined;
        this.unlockPromptPreview();
        this.setApiStatus('idle');
        this.refreshUI({ skipCorpus: true });
        this.notifyInteraction('Inquiry cancel requested. Inquiry will stop after the current pass returns. The active provider request may still complete.');
    }

    private async openInquiryErrorLog(): Promise<void> {
        const opened = await this.openLatestInquiryLogForContext();
        if (!opened) {
            new Notice('No Inquiry log found for this run.');
        }
    }

    private async handleQuestionClick(
        question: InquiryQuestion,
        options?: { promptOverride?: InquiryQuestionPromptForm }
    ): Promise<void> {
        if (this.isErrorState() && this.state.activeResult?.questionId === question.id) {
            await this.openInquiryErrorLog();
            return;
        }
        await this.runInquiry(question, options);
    }

    private async runInquiry(
        question: InquiryQuestion,
        options?: { bypassTokenGuard?: boolean; promptOverride?: InquiryQuestionPromptForm }
    ): Promise<void> {
        if (this.isInquiryRunDisabled()) return;
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        if (this.state.scope === 'book' && this.corpus && !this.corpus.bookResolved) {
            this.notifyInteraction('Book scope unresolved. Configure a book in settings before running Inquiry.');
            return;
        }
        this.clearErrorStateForAction();
        this.state.activeZone = question.zone;
        this.updateActiveZoneStyling();

        const scopeLabel = this.getScopeLabel();
        const scopeKey = this.getScopeKey();
        const targetSceneIds = this.getActiveTargetSceneIds();
        const selectionMode = this.getSelectionMode(targetSceneIds);
        const effectiveOverride = options?.promptOverride ?? this.getEffectivePromptOverride(question.id);
        const questionText = this.resolveQuestionPromptForRun(question, selectionMode, effectiveOverride);
        const questionPromptForm = this.resolveQuestionPromptFormForRun(question, selectionMode, effectiveOverride);
        const activeBookId = this.state.scope === 'saga' ? this.state.activeBookId : this.state.activeBookId;

        const engineSelection = this.resolveEngineSelectionForRun();
        const manifest = this.buildCorpusManifest(question.id, {
            modelId: engineSelection.modelId,
            questionZone: question.zone
        });
        if (!manifest.entries.length) {
            this.handleEmptyCorpusRun();
            return;
        }
        const baseKey = this.sessionStore.buildBaseKey({
            questionId: question.id,
            questionPromptForm,
            scope: this.state.scope,
            scopeKey,
            targetSceneIds
        });
        const key = this.sessionStore.buildKey(baseKey, manifest.fingerprint);
        if (this.state.activeSessionId === key && this.state.activeResult && !this.isErrorResult(this.state.activeResult)) {
            this.handleDuplicateRunFeedback(question, key);
            this.showResultsPreview(this.state.activeResult);
            return;
        }
        let cacheStatus: 'fresh' | 'stale' | 'missing' = 'missing';
        let cachedSession: InquirySession | undefined;
        const cached = this.sessionStore.getSession(key);
        if (cached) {
            cachedSession = cached;
            cacheStatus = 'fresh';
        }
        if (!cachedSession) {
            const prior = this.sessionStore.getLatestByBaseKey(baseKey);
            if (prior && prior.result.corpusFingerprint !== manifest.fingerprint) {
                cacheStatus = 'stale';
                this.sessionStore.markStaleByBaseKey(baseKey);
            }
        }
        if (cachedSession && this.isErrorResult(cachedSession.result)) {
            cachedSession = undefined;
            cacheStatus = 'missing';
        }
        if (cachedSession) {
            this.state.cacheStatus = cacheStatus;
            this.handleDuplicateRunFeedback(question, cachedSession.key);
            this.activateSession(cachedSession);
            return;
        }

        if (!options?.bypassTokenGuard) {
            const readinessUi = this.buildReadinessUiState();
            this.lastReadinessUiState = readinessUi;
            if (readinessUi.readiness.state === 'blocked') {
                this.pendingGuardQuestion = question;
                this.showEnginePanel();
                return;
            }
        }

        this.clearActiveResultState();
        this.currentRunProgress = null;
        this.currentRunElapsedMs = 0;
        this.currentRunEstimatedMaxMs = this.estimateRunDurationRange(questionText).maxSeconds * 1000;
        this.state.activeQuestionId = question.id;
        this.state.activeZone = question.zone;
        this.lockPromptPreview(question, questionText);
        this.state.cacheStatus = cacheStatus;

        const startTime = Date.now();
        this.state.isRunning = true;
        this.setApiStatus('running');
        this.refreshUI({ skipCorpus: true });
        let result: InquiryResult;
        let runTrace: InquiryRunTrace | null = null;
        new Notice('Inquiry: contacting AI provider.');
        const submittedAt = new Date();
        const simulationProvider: InquiryAiProvider = engineSelection.provider === 'none'
            ? 'openai'
            : engineSelection.provider;
        const runnerInput: InquiryRunnerInput = {
            scope: this.state.scope,
            scopeLabel,
            targetSceneIds,
            selectionMode,
            activeBookId: this.state.scope === 'saga' ? this.state.activeBookId : this.state.activeBookId,
            mode: this.state.mode,
            questionId: question.id,
            questionText,
            questionPromptForm,
            questionZone: question.zone,
            corpus: manifest,
            rules: this.getEvidenceRules(),
            ai: {
                provider: simulationProvider,
                modelId: engineSelection.modelId,
                modelLabel: engineSelection.modelLabel
            }
        };
        const runToken = this.beginInquiryRunToken();
        try {
            try {
                // Lens selection is UI-only; do not vary question, evidence, or verdict structure by lens.
                // Each inquiry produces two compressed answers (flow + depth). Keep this dual-answer model intact.
                const runOutput = await this.runner.runWithTrace(runnerInput, {
                    onProgress: progress => this.updateRunProgress(progress),
                    shouldAbort: () => this.shouldDiscardInquiryRunOutcome(runToken)
                });
                result = runOutput.result;
                runTrace = runOutput.trace;
                const progressState = this.currentRunProgress as InquiryRunProgressEvent | null;
                const progressPassCount = progressState?.totalPasses;
                const finalPassCount = Math.max(1, runOutput.trace.executionPassCount ?? progressPassCount ?? 1);
                this.updateRunProgress({
                    phase: 'finalizing',
                    currentPass: finalPassCount,
                    totalPasses: finalPassCount,
                    detail: 'Provider response received. Saving the result.'
                });
            } catch (error) {
                result = this.buildErrorFallback(question, questionText, questionPromptForm, scopeLabel, manifest.fingerprint, error);
                const message = error instanceof Error ? error.message : String(error);
                runTrace = await this.buildFallbackTrace(runnerInput, `Runner exception: ${message}`);
            }
            if (this.shouldDiscardInquiryRunOutcome(runToken)) {
                return;
            }
            const completedAt = new Date();
            result.submittedAt = submittedAt.toISOString();
            result.completedAt = completedAt.toISOString();
            result.roundTripMs = completedAt.getTime() - submittedAt.getTime();
            this.applyTokenEstimateFromTrace(result, runTrace);
            result.aiModelNextRunOnly = false; // Legacy field — always false.
            result = this.applyCorpusOverrideSummary(result);
            const rawResult = result;
            result = this.normalizeLegacyResult(result);
            const normalizationNotes = this.collectNormalizationNotes(rawResult, result);
            result = this.applyExecutionObservabilityFromTrace(result, runTrace);
            void this.recordInquiryTimingSample(result, runTrace);
            if (this.shouldRejectUnboundHitResult(result)) {
                runTrace?.notes.push('Inquiry result rejected after execution: no finding could be matched to the active corpus.');
                result = this.withCitationBindingFailure(result);
            }

            if (!this.isErrorResult(result)) {
                cacheStatus = 'fresh';
            } else {
                cacheStatus = 'missing';
            }

            let session: InquirySession = {
                key,
                baseKey,
                result,
                createdAt: Date.now(),
                lastAccessed: Date.now(),
                status: this.resolveSessionStatusFromResult(result),
                activeBookId,
                targetSceneIds,
                scope: this.state.scope,
                questionZone: question.zone
            };
            this.sessionStore.setSession(session);
            const traceForLog = runTrace
                ?? await this.buildFallbackTrace(runnerInput, 'Trace unavailable; log created without prompt capture.');
            await this.saveInquiryLog(result, traceForLog, manifest, {
                sessionKey: session.key,
                normalizationNotes
            });
            if (this.shouldDiscardInquiryRunOutcome(runToken)) {
                return;
            }
            session = this.sessionStore.peekSession(session.key) ?? session;

            const autoSaveEnabled = this.plugin.settings.inquiryAutoSave ?? true;
            const shouldAutoSave = autoSaveEnabled
                && !this.isErrorResult(result)
                && session.status !== 'simulated'
                && session.status !== 'saved'
                && !session.briefPath;
            if (shouldAutoSave) {
                await this.saveBrief(result, {
                    openFile: false,
                    silent: true,
                    sessionKey: session.key
                });
                session = this.sessionStore.peekSession(session.key) ?? session;
            }

            const elapsed = Date.now() - startTime;
            if (elapsed < MIN_PROCESSING_MS) {
                await new Promise(resolve => window.setTimeout(resolve, MIN_PROCESSING_MS - elapsed));
            }

            if (this.shouldDiscardInquiryRunOutcome(runToken)) {
                return;
            }

            this.applySession({
                result,
                key: session.key,
                activeBookId: session.activeBookId,
                targetSceneIds: session.targetSceneIds,
                scope: session.scope,
                questionZone: session.questionZone
            }, cacheStatus);
            if (this.isErrorResult(result)) {
                this.setApiStatus('error', this.formatApiErrorReason(result));
            } else {
                this.setApiStatus('success');
            }
            if (this.shouldAutoPopulatePendingEdits()) {
                void this.writeInquiryPendingEdits(session, result);
            }
        } finally {
            this.currentRunElapsedMs = 0;
            this.currentRunEstimatedMaxMs = 0;
            this.finishInquiryRunToken(runToken);
        }
    }

    public reopenSessionByKey(sessionKey: string): boolean {
        if (!sessionKey || this.state.isRunning || this.isInquiryBlocked()) return false;
        const session = this.sessionStore.peekSession(sessionKey);
        if (!session) return false;
        this.activateSession(session);
        return true;
    }

    public async runOmnibusPass(): Promise<void> {
        if (Platform.isMobile) { // SAFE: Platform imported from obsidian at top of file
            new Notice('Inquiry omnibus pass is available on desktop only.');
            return;
        }

        this.refreshCorpus();
        this.guidanceState = this.resolveGuidanceState();

        const questions = this.getOmnibusQuestions();
        const providerPlan = this.buildOmnibusProviderPlan();
        const runDisabledReason = this.getOmnibusRunDisabledReason(questions, providerPlan);

        const priorProgress = this.plugin.settings.inquiryOmnibusProgress;
        const resumeCheck = priorProgress
            ? this.checkOmnibusResumeEligibility(priorProgress, questions, providerPlan)
            : { available: false };

        const plan = await this.promptOmnibusPlan({
            initialScope: this.state.scope,
            bookLabel: this.getActiveBookLabel(),
            questions,
            providerSummary: providerPlan.summary,
            providerLabel: providerPlan.label,
            logsEnabled: this.plugin.settings.logApiInteractions ?? true,
            runDisabledReason,
            priorProgress: priorProgress ?? undefined,
            resumeAvailable: resumeCheck.available,
            resumeUnavailableReason: resumeCheck.reason
        });
        if (!plan) return;

        if (this.state.isRunning) {
            new Notice('Inquiry running. Please wait.');
            return;
        }

        if (plan.scope !== this.state.scope) {
            this.handleScopeChange(plan.scope);
        } else {
            this.refreshCorpus();
        }
        this.guidanceState = this.resolveGuidanceState();
        if (this.isInquiryRunDisabled()) {
            const message = this.isInquiryBlocked()
                ? 'Inquiry is not configured yet.'
                : 'No scenes available for Inquiry.';
            new Notice(message);
            return;
        }

        let nextQuestions = this.getOmnibusQuestions();
        if (!nextQuestions.length) {
            new Notice('No enabled Inquiry questions found.');
            return;
        }

        // Filter to remaining questions if resuming
        if (plan.resume && priorProgress) {
            const completed = new Set(priorProgress.completedQuestionIds);
            nextQuestions = nextQuestions.filter(q => !completed.has(q.id));
            if (!nextQuestions.length) {
                new Notice('All questions already completed. Nothing to resume.');
                return;
            }
        } else {
            // Fresh run: clear any prior progress
            this.clearOmnibusProgress();
        }

        const nextProviderPlan = this.buildOmnibusProviderPlan();
        if (!nextProviderPlan.choice) {
            const reason = nextProviderPlan.disabledReason || 'Provider unavailable';
            new Notice(`Omnibus unavailable: ${reason}.`);
            return;
        }

        this.omnibusAbortRequested = false;
        const allQuestions = this.getOmnibusQuestions();
        const providerChoice = nextProviderPlan.choice;
        try {
            if (!providerChoice.useOmnibus) {
                await this.runOmnibusSequential(nextQuestions, providerChoice, plan.createIndex, allQuestions.length);
                return;
            }
            await this.runOmnibusCombined(nextQuestions, providerChoice, plan.createIndex, allQuestions.length);
        } finally {
            this.activeOmnibusModal = undefined;
        }
    }

    private async runOmnibusCombined(
        questions: InquiryQuestion[],
        providerChoice: OmnibusProviderChoice,
        createIndex: boolean,
        totalForProgress?: number
    ): Promise<void> {
        const total = totalForProgress ?? questions.length;
        const scopeLabel = this.getScopeLabel();
        const scopeKey = this.getScopeKey();
        const targetSceneIds = this.getActiveTargetSceneIds();
        const selectionMode = this.getSelectionMode(targetSceneIds);
        const activeBookId = this.state.activeBookId ?? this.corpus?.books?.[0]?.id;
        const contextRequired = this.isContextRequiredForQuestions(questions);
        const manifest = this.buildCorpusManifest('omnibus', {
            modelId: providerChoice.modelId,
            contextRequired
        });
        if (!manifest.entries.length) {
            this.handleEmptyCorpusRun();
            return;
        }
        const submittedAt = new Date();

        const omnibusInput: InquiryOmnibusInput = {
            scope: this.state.scope,
            scopeLabel,
            targetSceneIds,
            selectionMode,
            activeBookId,
            mode: this.state.mode,
            questions: questions.map(question => ({
                id: question.id,
                zone: question.zone,
                questionText: this.resolveQuestionPromptForRun(question, selectionMode),
                questionPromptForm: this.resolveQuestionPromptFormForRun(question, selectionMode)
            })),
            corpus: manifest,
            rules: this.getEvidenceRules(),
            ai: {
                provider: providerChoice.provider,
                modelId: providerChoice.modelId,
                modelLabel: providerChoice.modelLabel
            }
        };

        this.state.isRunning = true;
        this.setApiStatus('running');
        this.refreshUI({ skipCorpus: true });

        const modal = this.activeOmnibusModal;
        if (modal) modal.updateProgress(1, total, '', 'Combined run in progress...', 'Processing all questions in a single pass...');

        const briefPaths: string[] = [];
        const completedIds: string[] = [];
        let lastSession: InquirySession | null = null;
        let lastResult: InquiryResult | null = null;
        let traceForLogs: InquiryRunTrace | null = null;

        try {
            const runOutput = await this.runner.runOmnibusWithTrace(omnibusInput);
            traceForLogs = runOutput.trace;
            if (modal) {
                modal.setAiAdvancedContext(getLastAiAdvancedContext(this.plugin, 'InquiryMode'));
            }
            const completedAt = new Date();
            const questionsById = new Map(questions.map(question => [question.id, question]));

            for (let i = 0; i < runOutput.results.length; i += 1) {
                const result = runOutput.results[i];
                const question = questionsById.get(result.questionId) ?? questions[i];
                if (!question) continue;

                if (modal) {
                    const zoneLabel = question.zone === 'setup' ? 'Setup' : question.zone === 'pressure' ? 'Pressure' : 'Payoff';
                    modal.updateProgress(i + 1, total, zoneLabel, question.label, 'Writing brief/log...');
                }

                const questionManifest = this.buildCorpusManifest(question.id, {
                    modelId: providerChoice.modelId,
                    questionZone: question.zone
                });
                const trace = traceForLogs ? this.cloneTrace(traceForLogs) : await this.buildFallbackTrace({
                    scope: this.state.scope,
                    scopeLabel,
                    targetSceneIds,
                    selectionMode,
                    activeBookId,
                    mode: this.state.mode,
                    questionId: question.id,
                    questionText: this.resolveQuestionPromptForRun(question, selectionMode),
                    questionPromptForm: this.resolveQuestionPromptFormForRun(question, selectionMode),
                    questionZone: question.zone,
                    corpus: questionManifest,
                    rules: this.getEvidenceRules(),
                    ai: omnibusInput.ai
                }, 'Omnibus trace unavailable; log created without prompt capture.');

                const persisted = await this.persistOmnibusResult({
                    question,
                    result,
                    trace,
                    manifest: questionManifest,
                    scopeKey,
                    activeBookId,
                    targetSceneIds,
                    submittedAt,
                    completedAt
                });
                if (persisted.briefPath) {
                    briefPaths.push(persisted.briefPath);
                }
                completedIds.push(question.id);
                lastSession = persisted.session;
                lastResult = persisted.normalized;
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            new Notice(`Inquiry omnibus failed: ${message}`);
        } finally {
            const indexPath = (createIndex && briefPaths.length > 1)
                ? await this.saveOmnibusIndexNote(briefPaths, scopeLabel)
                : undefined;
            const allQuestionIds = this.getOmnibusQuestions().map(q => q.id);
            const isComplete = completedIds.length >= questions.length;
            if (isComplete) {
                this.clearOmnibusProgress();
            } else {
                this.saveOmnibusProgress({
                    totalQuestions: allQuestionIds.length,
                    completedQuestionIds: this.mergeCompletedIds(completedIds),
                    scope: this.state.scope,
                    questionIds: allQuestionIds,
                    useOmnibus: true,
                    corpusSettingsFingerprint: this.buildCorpusSettingsFingerprint(),
                    indexNotePath: indexPath ?? undefined,
                    abortedAt: new Date().toISOString()
                });
            }
            if (modal) modal.showResult(completedIds.length, total, !isComplete);
            if (lastSession && lastResult) {
                this.applySession({
                    result: lastResult,
                    key: lastSession.key,
                    activeBookId: lastSession.activeBookId,
                    targetSceneIds: lastSession.targetSceneIds,
                    scope: lastSession.scope,
                    questionZone: lastSession.questionZone
                }, 'missing');
                if (this.isErrorResult(lastResult)) {
                    this.setApiStatus('error', this.formatApiErrorReason(lastResult));
                } else {
                    this.setApiStatus('success');
                }
            } else {
                this.state.isRunning = false;
                this.setApiStatus('idle');
                this.refreshUI();
            }
            this.updateBriefingButtonState();
            this.refreshBriefingPanel();
        }
    }

    private async runOmnibusSequential(
        questions: InquiryQuestion[],
        providerChoice: OmnibusProviderChoice,
        createIndex: boolean,
        totalForProgress?: number
    ): Promise<void> {
        const total = totalForProgress ?? questions.length;
        const scopeLabel = this.getScopeLabel();
        const scopeKey = this.getScopeKey();
        const targetSceneIds = this.getActiveTargetSceneIds();
        const selectionMode = this.getSelectionMode(targetSceneIds);
        const activeBookId = this.state.activeBookId ?? this.corpus?.books?.[0]?.id;
        const briefPaths: string[] = [];
        const completedIds: string[] = [];
        let lastSession: InquirySession | null = null;
        let lastResult: InquiryResult | null = null;
        let aborted = false;

        const modal = this.activeOmnibusModal;

        this.state.isRunning = true;
        this.setApiStatus('running');
        this.refreshUI({ skipCorpus: true });

        try {
            for (let qi = 0; qi < questions.length; qi += 1) {
                // Check abort before starting each question
                if (this.omnibusAbortRequested || (modal && modal.isAbortRequested())) {
                    aborted = true;
                    break;
                }

                const question = questions[qi];
                const questionIndex = qi + 1;
                const zoneLabel = question.zone === 'setup' ? 'Setup' : question.zone === 'pressure' ? 'Pressure' : 'Payoff';

                if (modal) modal.updateProgress(questionIndex, total, zoneLabel, question.label);

                const manifest = this.buildCorpusManifest(question.id, {
                    modelId: providerChoice.modelId,
                    questionZone: question.zone
                });
                if (!manifest.entries.length) {
                    this.handleEmptyCorpusRun();
                    break;
                }
                const runnerInput: InquiryRunnerInput = {
                    scope: this.state.scope,
                    scopeLabel,
                    targetSceneIds,
                    selectionMode,
                    activeBookId,
                    mode: this.state.mode,
                    questionId: question.id,
                    questionText: this.resolveQuestionPromptForRun(question, selectionMode),
                    questionPromptForm: this.resolveQuestionPromptFormForRun(question, selectionMode),
                    questionZone: question.zone,
                    corpus: manifest,
                    rules: this.getEvidenceRules(),
                    ai: {
                        provider: providerChoice.provider,
                        modelId: providerChoice.modelId,
                        modelLabel: providerChoice.modelLabel
                    }
                };
                const submittedAt = new Date();
                let result: InquiryResult;
                let trace: InquiryRunTrace;
                try {
                    const runOutput = await this.runner.runWithTrace(runnerInput);
                    result = runOutput.result;
                    trace = runOutput.trace;
                    if (modal) {
                        modal.setAiAdvancedContext(getLastAiAdvancedContext(this.plugin, 'InquiryMode'));
                    }
                } catch (error) {
                    result = this.buildErrorFallback(
                        question,
                        this.resolveQuestionPromptForRun(question, selectionMode),
                        this.resolveQuestionPromptFormForRun(question, selectionMode),
                        scopeLabel,
                        manifest.fingerprint,
                        error
                    );
                    const message = error instanceof Error ? error.message : String(error);
                    trace = await this.buildFallbackTrace(runnerInput, `Runner exception: ${message}`);
                }

                if (modal) modal.updateProgress(questionIndex, total, zoneLabel, question.label, 'Writing brief/log...');

                const completedAt = new Date();
                const persisted = await this.persistOmnibusResult({
                    question,
                    result,
                    trace,
                    manifest,
                    scopeKey,
                    activeBookId,
                    targetSceneIds,
                    submittedAt,
                    completedAt
                });
                if (persisted.briefPath) {
                    briefPaths.push(persisted.briefPath);
                }
                completedIds.push(question.id);
                lastSession = persisted.session;
                lastResult = persisted.normalized;
            }
        } finally {
            const indexPath = (createIndex && briefPaths.length > 1)
                ? await this.saveOmnibusIndexNote(briefPaths, scopeLabel)
                : undefined;
            const allQuestionIds = this.getOmnibusQuestions().map(q => q.id);
            const isComplete = !aborted && completedIds.length >= questions.length;
            if (isComplete) {
                this.clearOmnibusProgress();
            } else {
                this.saveOmnibusProgress({
                    totalQuestions: allQuestionIds.length,
                    completedQuestionIds: this.mergeCompletedIds(completedIds),
                    scope: this.state.scope,
                    questionIds: allQuestionIds,
                    useOmnibus: false,
                    corpusSettingsFingerprint: this.buildCorpusSettingsFingerprint(),
                    indexNotePath: indexPath ?? undefined,
                    abortedAt: new Date().toISOString()
                });
            }
            if (modal) modal.showResult(completedIds.length, total, !isComplete);
            if (lastSession && lastResult) {
                this.applySession({
                    result: lastResult,
                    key: lastSession.key,
                    activeBookId: lastSession.activeBookId,
                    targetSceneIds: lastSession.targetSceneIds,
                    scope: lastSession.scope,
                    questionZone: lastSession.questionZone
                }, 'missing');
                if (this.isErrorResult(lastResult)) {
                    this.setApiStatus('error', this.formatApiErrorReason(lastResult));
                } else {
                    this.setApiStatus('success');
                }
            } else {
                this.state.isRunning = false;
                this.setApiStatus('idle');
                this.refreshUI();
            }
            this.updateBriefingButtonState();
            this.refreshBriefingPanel();
        }
    }

    private async persistOmnibusResult(options: {
        question: InquiryQuestion;
        result: InquiryResult;
        trace: InquiryRunTrace;
        manifest: CorpusManifest;
        scopeKey: string;
        activeBookId?: string;
        targetSceneIds: string[];
        submittedAt: Date;
        completedAt: Date;
    }): Promise<{ session: InquirySession; briefPath?: string; normalized: InquiryResult }> {
        const timedResult: InquiryResult = {
            ...options.result,
            questionId: options.result.questionId || options.question.id,
            questionZone: options.result.questionZone || options.question.zone,
            submittedAt: options.submittedAt.toISOString(),
            completedAt: options.completedAt.toISOString(),
            roundTripMs: options.completedAt.getTime() - options.submittedAt.getTime(),
            corpusFingerprint: options.manifest.fingerprint
        };
        this.applyCorpusOverrideSummary(timedResult);
        this.applyTokenEstimateFromTrace(timedResult, options.trace);
        if (typeof timedResult.aiModelNextRunOnly !== 'boolean') {
            timedResult.aiModelNextRunOnly = false;
        }
        const tracedResult = this.applyExecutionObservabilityFromTrace(timedResult, options.trace);
        void this.recordInquiryTimingSample(tracedResult, options.trace);

        const normalized = this.normalizeLegacyResult(tracedResult);
        const normalizationNotes = this.collectNormalizationNotes(tracedResult, normalized);
        const baseKey = this.sessionStore.buildBaseKey({
            questionId: normalized.questionId,
            scope: normalized.scope,
            scopeKey: options.scopeKey,
            targetSceneIds: options.targetSceneIds
        });
        const key = this.sessionStore.buildKey(baseKey, options.manifest.fingerprint);

        const session: InquirySession = {
            key,
            baseKey,
            result: normalized,
            createdAt: Date.now(),
            lastAccessed: Date.now(),
            status: this.resolveSessionStatusFromResult(normalized),
            activeBookId: options.activeBookId,
            targetSceneIds: options.targetSceneIds,
            scope: normalized.scope,
            questionZone: options.question.zone
        };
        this.sessionStore.setSession(session);

        const logPath = await this.saveInquiryLog(normalized, options.trace, options.manifest, {
            sessionKey: session.key,
            normalizationNotes,
            silent: true
        });
        const briefPath = await this.saveBrief(normalized, {
            openFile: false,
            silent: true,
            sessionKey: session.key,
            logPath: logPath ?? undefined
        });
        const updated = this.sessionStore.peekSession(session.key) ?? session;
        return {
            session: updated,
            briefPath: briefPath ?? undefined,
            normalized
        };
    }

    private cloneTrace(trace: InquiryRunTrace): InquiryRunTrace {
        return {
            ...trace,
            tokenEstimate: { ...trace.tokenEstimate },
            response: trace.response ? { ...trace.response } : null,
            usage: trace.usage ? { ...trace.usage } : undefined,
            sanitizationNotes: [...(trace.sanitizationNotes || [])],
            notes: [...(trace.notes || [])]
        };
    }

    private async saveOmnibusIndexNote(briefPaths: string[], scopeLabel: string): Promise<string | null> {
        const folder = await ensureInquiryArtifactFolder(this.app, this.plugin.settings);
        if (!folder) return null;
        const timestamp = this.formatInquiryBriefTimestamp(new Date());
        const scopeTitle = this.state.scope === 'saga' ? 'Saga' : `Book ${scopeLabel}`;
        const title = `Inquiry Omnibus — ${scopeTitle} ${timestamp}`;
        const filePath = this.getAvailableArtifactPath(folder.path, title);
        const links = briefPaths
            .map(path => path.split('/').pop())
            .filter((basename): basename is string => typeof basename === 'string' && basename.length > 0)
            .map(basename => basename.replace(/\.md$/, ''))
            .map(name => `- [[${name}]]`);
        const content = [...links, ''].join('\n');
        try {
            const file = await this.app.vault.create(filePath, content);
            return file.path;
        } catch {
            return null;
        }
    }

    private async promptOmnibusPlan(options: InquiryOmnibusModalOptions): Promise<InquiryOmnibusPlan | null> {
        return new Promise(resolve => {
            const modal = new InquiryOmnibusModal(this.app, options, result => {
                this.activeOmnibusModal = modal;
                resolve(result);
            });
            modal.open();
        });
    }

    private saveOmnibusProgress(progress: OmnibusProgressState): void {
        this.plugin.settings.inquiryOmnibusProgress = progress;
        void this.plugin.saveSettings();
    }

    private clearOmnibusProgress(): void {
        this.plugin.settings.inquiryOmnibusProgress = undefined;
        void this.plugin.saveSettings();
    }

    private mergeCompletedIds(newIds: string[]): string[] {
        const prior = this.plugin.settings.inquiryOmnibusProgress;
        if (!prior) return [...newIds];
        const merged = new Set(prior.completedQuestionIds);
        newIds.forEach(id => merged.add(id));
        return [...merged];
    }

    private buildCorpusSettingsFingerprint(): string {
        const sources = this.plugin.settings.inquirySources;
        const classes = sources?.classes ?? [];
        const parts = classes
            .filter(c => c.enabled)
            .map(c => `${c.className}:${c.bookScope}:${c.sagaScope}:${c.referenceScope}`)
            .sort();
        return parts.join('|');
    }

    private checkOmnibusResumeEligibility(
        prior: OmnibusProgressState,
        currentQuestions: InquiryQuestion[],
        providerPlan: OmnibusProviderPlan
    ): { available: boolean; reason?: string } {
        if (prior.completedQuestionIds.length >= prior.totalQuestions) {
            return { available: false, reason: 'Previous run already completed.' };
        }
        if (prior.scope !== this.state.scope) {
            return { available: false, reason: 'Scope changed since last run.' };
        }
        const currentIds = currentQuestions.map(q => q.id).sort().join(',');
        const priorIds = [...prior.questionIds].sort().join(',');
        if (currentIds !== priorIds) {
            return { available: false, reason: 'Question set changed since last run.' };
        }
        const currentFingerprint = this.buildCorpusSettingsFingerprint();
        if (currentFingerprint !== prior.corpusSettingsFingerprint) {
            return { available: false, reason: 'Corpus contribution settings changed.' };
        }
        if (providerPlan.choice && providerPlan.choice.useOmnibus !== prior.useOmnibus) {
            // Allow sequential fallback from combined, but not the reverse
            if (prior.useOmnibus && !providerPlan.choice.useOmnibus) {
                // OK: falling back to sequential
            } else {
                return { available: false, reason: 'Provider strategy changed.' };
            }
        }
        return { available: true };
    }

    private getOmnibusQuestions(): InquiryQuestion[] {
        const config = this.getPromptConfig();
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        const questions: InquiryQuestion[] = [];
        const seen = new Set<string>();

        zones.forEach(zone => {
            const slots = config[zone] ?? [];
            if (!slots.length) return;
            const zoneLabel = zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
            const icon = zone === 'setup' ? 'help-circle' : zone === 'pressure' ? 'activity' : 'check-circle';
            slots.forEach((slot, slotIndex) => {
                if (!slot.enabled) return;
                if (seen.has(slot.id)) return;
                const question = this.buildInquiryQuestion(zone, slot, icon, slotIndex);
                if (!question) return;
                questions.push({
                    ...question,
                    label: question.label || zoneLabel
                });
                seen.add(slot.id);
            });
        });

        return questions;
    }

    private buildOmnibusProviderPlan(): OmnibusProviderPlan {
        const googleAvailability = this.getProviderAvailability('google');
        if (googleAvailability.enabled) {
            const modelId = this.getInquiryModelIdForProvider('google');
            const modelLabel = this.getInquiryModelLabelForProvider('google');
            return {
                choice: {
                    provider: 'google',
                    modelId,
                    modelLabel,
                    useOmnibus: true
                },
                summary: `Prefers Google for a combined omnibus run when available. Google is available, so this run will use Google · ${modelLabel}.`,
                label: 'Google omnibus'
            };
        }

        const fallbackProvider: EngineProvider = this.getResolvedEngine().provider === 'none'
            ? 'openai'
            : this.getResolvedEngine().provider as EngineProvider;
        const fallbackAvailability = this.getProviderAvailability(fallbackProvider);
        const googleReason = googleAvailability.reason || 'Google not configured';
        if (!fallbackAvailability.enabled) {
            const providerLabel = this.getInquiryProviderLabel(fallbackProvider);
            const reason = fallbackAvailability.reason || 'Provider unavailable';
            return {
                choice: null,
                summary: `Prefers Google for a combined omnibus run when available. Google is unavailable (${googleReason}); ${providerLabel} is also unavailable (${reason}).`,
                label: 'Unavailable',
                disabledReason: `${providerLabel} ${reason}`
            };
        }

        const providerLabel = this.getInquiryProviderLabel(fallbackProvider);
        const modelLabel = this.getInquiryModelLabelForProvider(fallbackProvider);
        return {
            choice: {
                provider: fallbackProvider,
                modelId: this.getInquiryModelIdForProvider(fallbackProvider),
                modelLabel,
                useOmnibus: false,
                reason: googleReason
            },
            summary: `Prefers Google for a combined omnibus run when available. Google is unavailable (${googleReason}), so this run will execute sequentially with ${providerLabel} · ${modelLabel}.`,
            label: `Sequential · ${providerLabel}`
        };
    }

    private getOmnibusRunDisabledReason(questions: InquiryQuestion[], providerPlan: OmnibusProviderPlan): string | null {
        if (this.state.isRunning) return 'Inquiry is already running.';
        if (this.isInquiryBlocked()) return 'Inquiry is not configured yet.';
        if (this.guidanceState === 'no-scenes') return 'No scenes available for Inquiry.';
        if (!questions.length) return 'No enabled Inquiry questions found.';
        if (!providerPlan.choice) return providerPlan.disabledReason || 'Provider unavailable';
        return null;
    }

    private getInquiryProviderLabel(provider: EngineProvider): string {
        const labels: Record<EngineProvider, string> = {
            anthropic: 'Anthropic',
            google: 'Google',
            openai: 'OpenAI',
            ollama: 'Ollama'
        };
        return labels[provider] || 'OpenAI';
    }

    private getInquiryModelIdForProvider(provider: EngineProvider): string {
        const aiSettings = this.getCanonicalAiSettings();
        const policy = provider === this.getResolvedEngine().provider
            ? (aiSettings.featureProfiles?.InquiryMode?.modelPolicy ?? aiSettings.modelPolicy)
            : { type: 'latestStable' as const };
        const selection = selectModel(BUILTIN_MODELS, {
            provider,
            policy,
            requiredCapabilities: INQUIRY_REQUIRED_CAPABILITIES,
            accessTier: this.getAccessTierForProvider(provider, aiSettings)
        });
        return selection.model.id;
    }

    private getInquiryModelLabelForProvider(provider: EngineProvider): string {
        const modelId = this.getInquiryModelIdForProvider(provider);
        return modelId ? getModelDisplayName(modelId.replace(/^models\//, '')) : 'Unknown model';
    }

    private probeSecretPresence(provider: AIProviderId, secretId: string): void {
        if (!secretId.trim()) return;
        if (this.providerSecretProbePending.has(provider)) return;
        this.providerSecretProbePending.add(provider);
        void hasSecret(this.app, secretId)
            .then(exists => {
                this.providerSecretPresence[provider] = exists;
            })
            .finally(() => {
                this.providerSecretProbePending.delete(provider);
                if (this.enginePanelEl && !this.enginePanelEl.classList.contains('ert-hidden')) {
                    this.refreshEnginePanel();
                }
            });
    }

    private getProviderAvailability(provider: EngineProvider): { enabled: boolean; reason?: string } {
        if (provider === 'ollama') {
            const baseUrl = this.getCanonicalAiSettings().connections?.ollamaBaseUrl?.trim();
            return baseUrl ? { enabled: true } : { enabled: false, reason: 'Ollama URL missing' };
        }
        const aiSettings = this.getCanonicalAiSettings();
        const secretId = getCredentialSecretId(aiSettings, provider);
        if (!secretId || !isSecretStorageAvailable(this.app)) {
            return { enabled: false, reason: 'Saved key missing' };
        }

        const cachedPresence = this.providerSecretPresence[provider];
        if (cachedPresence === true) {
            return { enabled: true };
        }
        if (cachedPresence === false) {
            return { enabled: false, reason: 'Saved key not found' };
        }
        this.probeSecretPresence(provider, secretId);
        return { enabled: true };
    }

    private applySession(
        session: {
            result: InquiryResult;
            key?: string;
            activeBookId?: string;
            targetSceneIds?: string[];
            scope?: InquiryScope;
            questionZone?: InquiryZone;
        },
        cacheStatus: 'fresh' | 'stale' | 'missing'
    ): void {
        const normalized = this.normalizeLegacyResult(session.result);
        const resolvedZone = session.questionZone ?? this.findPromptZoneById(normalized.questionId);
        this.state.scope = session.scope ?? normalized.scope;
        this.state.mode = normalized.mode;
        this.state.activeQuestionId = normalized.questionId;
        this.state.activeZone = resolvedZone ?? this.state.activeZone;
        if (resolvedZone && normalized.questionId) {
            const options = this.getPromptOptions(resolvedZone);
            if (options.some(option => option.id === normalized.questionId)) {
                this.state.selectedPromptIds[resolvedZone] = normalized.questionId;
            }
        }
        if (session.activeBookId !== undefined) {
            this.state.activeBookId = session.activeBookId;
        }
        if (session.targetSceneIds !== undefined) {
            this.state.targetSceneIds = this.normalizeTargetSceneIds(session.targetSceneIds);
        }
        this.state.activeSessionId = session.key;
        this.state.activeResult = normalized;
        this.state.corpusFingerprint = normalized.corpusFingerprint;
        this.state.cacheStatus = cacheStatus;
        this.state.isRunning = false;
        this.hideSceneDossier(true);
        if (this.isErrorResult(normalized)) {
            this.showErrorPreview(normalized);
        } else {
            this.showResultsPreview(normalized);
        }
        this.updateMinimapTargetStates(normalized);
        this.refreshUI({ skipCorpus: true });
    }

    private clearActiveResultState(): void {
        this.cachedRunningStatusStatic = undefined;
        this.state.activeResult = null;
        this.state.activeSessionId = undefined;
        this.state.corpusFingerprint = undefined;
        this.state.cacheStatus = undefined;
    }

    private dismissResults(): void {
        if (!this.isResultsState()) return;
        this.rehydrateTargetKey = undefined;
        if (this.rehydrateHighlightTimer) {
            window.clearTimeout(this.rehydrateHighlightTimer);
            this.rehydrateHighlightTimer = undefined;
        }
        if (this.rehydratePulseTimer) {
            window.clearTimeout(this.rehydratePulseTimer);
            this.rehydratePulseTimer = undefined;
        }
        this.artifactButton?.classList.remove('is-rehydrate-pulse');
        this.clearActiveResultState();
        this.clearResultPreview();
        this.unlockPromptPreview();
        this.setApiStatus('idle');
        this.refreshUI({ skipCorpus: true });
    }

    private dismissError(): void {
        if (!this.isErrorState()) return;
        this.clearActiveResultState();
        this.unlockPromptPreview();
        this.setApiStatus('idle');
        this.refreshUI({ skipCorpus: true });
    }

    private normalizeLegacyResult(result: InquiryResult): InquiryResult {
        const verdict = result.verdict as InquiryResult['verdict'] & {
            severity?: InquirySeverity;
            confidence?: InquiryConfidence;
        };
        const impact = verdict.impact ?? verdict.severity ?? 'low';
        const assessmentConfidence = verdict.assessmentConfidence ?? verdict.confidence ?? 'low';
        const findings = result.findings.map(finding => {
            const legacy = finding as InquiryFinding & { severity?: InquirySeverity; confidence?: InquiryConfidence };
            const normalizedRefId = this.normalizeResultRefId(legacy.refId);
            const role: InquiryFinding['role'] = legacy.role === 'target'
                ? 'target'
                : legacy.role === 'context'
                    ? 'context'
                    : undefined;
            return {
                refId: normalizedRefId,
                kind: legacy.kind,
                status: legacy.status,
                impact: legacy.impact ?? legacy.severity ?? 'low',
                assessmentConfidence: legacy.assessmentConfidence ?? legacy.confidence ?? 'low',
                headline: legacy.headline,
                bullets: legacy.bullets,
                related: legacy.related,
                evidenceType: legacy.evidenceType,
                lens: legacy.lens,
                role
            };
        });
        const normalized: InquiryResult = {
            ...result,
            summaryFlow: result.summaryFlow ?? result.summary,
            summaryDepth: result.summaryDepth ?? result.summary,
            selectionMode: result.selectionMode === 'focused' ? 'focused' : 'discover',
            roleValidation: this.computeRoleValidation(
                result.selectionMode === 'focused' ? 'focused' : 'discover',
                findings,
                result.roleValidation
            ),
            questionText: result.questionText?.trim() || this.getQuestionTextById(result.questionId) || undefined,
            questionPromptForm: result.questionPromptForm === 'focused' ? 'focused' : 'standard',
            verdict: {
                flow: verdict.flow,
                depth: verdict.depth,
                impact,
                assessmentConfidence
            },
            findings
        };
        const inquiryId = this.formatInquiryIdFromResult(normalized);
        if (inquiryId && (!normalized.runId || normalized.runId.startsWith('run-'))) {
            normalized.runId = inquiryId;
        }
        return normalized;
    }

    private normalizeResultRefId(refId: string | undefined): string {
        const trimmed = typeof refId === 'string' ? refId.trim() : '';
        if (!trimmed) return '';
        if (!this.corpus?.scenes?.length) {
            return isStableSceneId(trimmed) ? trimmed.toLowerCase() : '';
        }

        const index = buildSceneRefIndex(this.corpus.scenes
            .filter(scene => isStableSceneId(scene.sceneId))
            .map(scene => ({
                sceneId: String(scene.sceneId).trim().toLowerCase(),
                path: scene.filePath,
                label: scene.displayLabel,
                sceneNumber: scene.sceneNumber,
                aliases: [scene.id, ...(scene.filePaths || [])]
            })));
        const normalized = normalizeSceneRef({ ref_id: trimmed }, index);
        if (normalized.warning) {
            console.warn(`[Inquiry] ${normalized.warning}`);
        }
        return normalized.ref.ref_id || '';
    }

    private collectNormalizationNotes(raw: InquiryResult, normalized: InquiryResult): string[] {
        const notes: string[] = [];
        if (!raw.summaryFlow && normalized.summaryFlow) {
            notes.push('Filled summaryFlow from summary.');
        }
        if (!raw.summaryDepth && normalized.summaryDepth) {
            notes.push('Filled summaryDepth from summary.');
        }
        const rawVerdict = raw.verdict as InquiryResult['verdict'] & {
            severity?: InquirySeverity;
            confidence?: InquiryConfidence;
        };
        if (rawVerdict.impact == null) {
            if (rawVerdict.severity != null) {
                notes.push('Mapped verdict severity to impact.');
            } else {
                notes.push('Defaulted verdict impact.');
            }
        }
        if (rawVerdict.assessmentConfidence == null) {
            if (rawVerdict.confidence != null) {
                notes.push('Mapped verdict confidence to assessmentConfidence.');
            } else {
                notes.push('Defaulted verdict assessmentConfidence.');
            }
        }
        const missingImpact = raw.findings.filter(finding => {
            const legacy = finding as InquiryFinding & { severity?: InquirySeverity };
            return legacy.impact == null && legacy.severity == null;
        }).length;
        const mappedImpact = raw.findings.filter(finding => {
            const legacy = finding as InquiryFinding & { severity?: InquirySeverity };
            return legacy.impact == null && legacy.severity != null;
        }).length;
        if (mappedImpact > 0) {
            notes.push(`Mapped finding severity to impact for ${mappedImpact} finding${mappedImpact === 1 ? '' : 's'}.`);
        }
        if (missingImpact > 0) {
            notes.push(`Defaulted finding impact for ${missingImpact} finding${missingImpact === 1 ? '' : 's'}.`);
        }
        const missingConfidence = raw.findings.filter(finding => {
            const legacy = finding as InquiryFinding & { confidence?: InquiryConfidence };
            return legacy.assessmentConfidence == null && legacy.confidence == null;
        }).length;
        const mappedConfidence = raw.findings.filter(finding => {
            const legacy = finding as InquiryFinding & { confidence?: InquiryConfidence };
            return legacy.assessmentConfidence == null && legacy.confidence != null;
        }).length;
        if (mappedConfidence > 0) {
            notes.push(`Mapped finding confidence to assessmentConfidence for ${mappedConfidence} finding${mappedConfidence === 1 ? '' : 's'}.`);
        }
        if (missingConfidence > 0) {
            notes.push(`Defaulted finding assessmentConfidence for ${missingConfidence} finding${missingConfidence === 1 ? '' : 's'}.`);
        }
        if (raw.runId !== normalized.runId && normalized.runId) {
            notes.push('Normalized runId to inquiry id.');
        }
        return notes;
    }

    private resolveInquiryActionNotesFieldLabel(): string {
        const fallback = DEFAULT_SETTINGS.inquiryActionNotesTargetField || 'Pending Edits';
        return (this.plugin.settings.inquiryActionNotesTargetField ?? fallback).trim() || fallback;
    }

    private shouldAutoPopulatePendingEdits(): boolean {
        return this.plugin.settings.inquiryActionNotesAutoPopulate ?? false;
    }

    private async writeInquiryPendingEdits(
        session: InquirySession,
        result: InquiryResult,
        options?: { notify?: boolean }
    ): Promise<boolean> {
        if (session.pendingEditsApplied) return true;
        if (session.status === 'simulated' || result.aiReason === 'simulated') {
            if (options?.notify) {
                const fieldLabel = this.resolveInquiryActionNotesFieldLabel();
                this.notifyInteraction(`${fieldLabel} writeback is disabled for simulated runs.`);
            }
            return false;
        }

        const normalized = this.normalizeLegacyResult(result);
        if (this.isErrorResult(normalized)) return false;
        if (normalized.scope !== 'book') return false;
        if (!this.corpus) return false;

        const briefTitle = this.formatInquiryBriefTitle(normalized);
        const notesByMaterial = this.buildInquiryActionNotes(normalized, briefTitle, session.activeBookId);
        if (!notesByMaterial.size) return false;

        const defaultField = DEFAULT_SETTINGS.inquiryActionNotesTargetField || 'Pending Edits';
        const targetField = (this.plugin.settings.inquiryActionNotesTargetField ?? defaultField).trim() || 'Pending Edits';
        let wroteAny = false;
        let duplicateAny = false;

        for (const [path, notes] of notesByMaterial.entries()) {
            const file = this.app.vault.getAbstractFileByPath(path);
            if (!file || !(file instanceof TFile)) continue;
            try {
                const outcome = await this.appendInquiryNotesToFrontmatter(file, targetField, briefTitle, notes);
                if (outcome === 'written') wroteAny = true;
                if (outcome === 'duplicate') duplicateAny = true;
            } catch (error) {
                console.warn('[Inquiry] Unable to write Pending Edits.', { path, error });
            }
        }

        const applied = wroteAny || duplicateAny;
        if (applied && session.key) {
            session.pendingEditsApplied = true;
            this.sessionStore.updateSession(session.key, { pendingEditsApplied: true });
            this.invalidateBriefingPurgeAvailability();
            this.refreshBriefingPanel();
            void this.refreshBriefingPurgeAvailability();
        }
        return applied;
    }

    private buildInquiryActionNotes(
        result: InquiryResult,
        briefTitle: string,
        activeBookId?: string
    ): Map<string, string[]> {
        const notesByPath = new Map<string, Set<string>>();
        const addNote = (path: string, note: string) => {
            let bucket = notesByPath.get(path);
            if (!bucket) {
                bucket = new Set<string>();
                notesByPath.set(path, bucket);
            }
            bucket.add(note);
        };

        const sceneByLabel = new Map<string, string>();
        const sceneById = new Map<string, string>();
        const sceneBySceneId = new Map<string, string>();
        const sceneByPath = new Map<string, string>();
        if (this.corpus?.scenes?.length) {
            this.corpus.scenes.forEach(scene => {
                sceneByLabel.set(scene.displayLabel, scene.filePath);
                sceneById.set(scene.id, scene.filePath);
                if (scene.sceneId) {
                    sceneBySceneId.set(scene.sceneId, scene.filePath);
                }
                scene.filePaths?.forEach(path => sceneByPath.set(path, scene.filePath));
            });
        }

        const outlinePath = this.resolveBookOutlinePath(activeBookId);
        const minimumRank = this.getImpactRank('medium');
        const handledScenes = new Set<string>();

        result.findings.forEach(finding => {
            if (!this.isFindingHit(finding)) return;
            if (this.getImpactRank(finding.impact) < minimumRank) return;
            const note = this.formatInquiryActionNote(finding, briefTitle);
            if (!note) return; // Skip findings that didn't produce an actionable suggestion.
            const refId = finding.refId?.trim();
            const filePath = refId
                ? (sceneByLabel.get(refId)
                    ?? sceneBySceneId.get(refId)
                    ?? sceneById.get(refId)
                    ?? sceneByPath.get(refId))
                : undefined;
            if (filePath && !handledScenes.has(filePath)) {
                addNote(filePath, note);
                handledScenes.add(filePath);
            }
            if (outlinePath) {
                addNote(outlinePath, note);
            }
        });

        const notesByMaterial = new Map<string, string[]>();
        notesByPath.forEach((notes, path) => {
            const list = Array.from(notes);
            if (list.length) {
                notesByMaterial.set(path, list);
            }
        });

        return notesByMaterial;
    }

    private resolveBookOutlinePath(activeBookId?: string): string | null {
        if (!this.corpus?.bookResolved || !this.corpus.books.length) return null;
        const resolvedBookId = activeBookId ?? this.corpus.activeBookId;
        if (!resolvedBookId) return null;
        const book = this.corpus.books.find(entry => entry.id === resolvedBookId) ?? this.corpus.books[0];
        if (!book) return null;
        const outlineFiles = this.getOutlineFiles();
        const bookOutlines = outlineFiles.filter(file => (this.getOutlineScope(file) ?? 'book') === 'book');
        const outline = bookOutlines.find(file => file.path === book.rootPath || file.path.startsWith(`${book.rootPath}/`));
        return outline?.path ?? null;
    }

    private async appendInquiryNotesToFrontmatter(
        file: TFile,
        fieldKey: string,
        briefTitle: string,
        notes: string[]
    ): Promise<InquiryWritebackOutcome> {
        if (!notes.length) return 'skipped';
        const briefLinkNeedle = `[[${briefTitle}`;
        let outcome: InquiryWritebackOutcome = 'skipped';
        const inquiryLinkToken = '[[Inquiry Brief —';
        const isInquiryLine = (line: string): boolean => line.includes(inquiryLinkToken);
        const normalizeInquiryLinkLine = (line: string): string => {
            if (!line) return line;
            return line
                .replace(/^\\?"(\[\[[^\]]+\]\])"\\?(\s+—\s+)/, '$1$2')
                .replace(/^\\?"(\[\[[^\]]+\]\])"\\?$/, '$1');
        };

        await this.app.fileManager.processFrontMatter(file, (fm) => {
            const frontmatter = fm as Record<string, unknown>;
            const rawValue = frontmatter[fieldKey];
            let rawText = '';
            if (typeof rawValue === 'string') {
                rawText = rawValue;
            } else if (Array.isArray(rawValue)) {
                rawText = rawValue.map(entry => (typeof entry === 'string' ? entry : String(entry))).join('\n');
            } else if (rawValue !== undefined && rawValue !== null) {
                rawText = String(rawValue);
            }

            const newline = rawText.includes('\r\n') ? '\r\n' : '\n';
            const lines = rawText === '' ? [] : rawText.split(/\r?\n/);
            const normalizedLines = lines.map(line => normalizeInquiryLinkLine(line));
            const normalizedExisting = normalizedLines.some((line, index) => line !== lines[index]);
            const inquiryIndices = normalizedLines.reduce<number[]>((acc, line, index) => {
                if (isInquiryLine(line)) acc.push(index);
                return acc;
            }, []);

            if (inquiryIndices.some(index => normalizedLines[index].includes(briefLinkNeedle))) {
                if (!normalizedExisting) {
                    outcome = 'duplicate';
                    return;
                }
                const normalizedText = normalizedLines.join(newline);
                frontmatter[fieldKey] = normalizedText;
                outcome = 'written';
                return;
            }

            const nextNotes = notes.map(note => normalizeInquiryLinkLine(note));
            let nextLines = [...normalizedLines, ...nextNotes];

            const nextInquiryIndices = nextLines.reduce<number[]>((acc, line, index) => {
                if (isInquiryLine(line)) acc.push(index);
                return acc;
            }, []);
            if (nextInquiryIndices.length > INQUIRY_NOTES_MAX) {
                const dropCount = nextInquiryIndices.length - INQUIRY_NOTES_MAX;
                const dropIndices = new Set(nextInquiryIndices.slice(0, dropCount));
                nextLines = nextLines.filter((_, index) => !dropIndices.has(index));
            }

            const nextText = nextLines.join(newline);
            frontmatter[fieldKey] = nextText;
            outcome = 'written';
        });
        return outcome;
    }

    private formatApiErrorReason(result: InquiryResult): string {
        const status = result.aiStatus || 'unknown';
        const reason = result.aiReason;
        const reasonText = reason ? `${status} (${reason})` : status;
        const executionBits: string[] = [];
        if (result.executionState) executionBits.push(`state=${result.executionState}`);
        if (result.executionPath) executionBits.push(`path=${result.executionPath}`);
        if (result.failureStage) executionBits.push(`stage=${result.failureStage}`);
        if (typeof result.tokenUsageKnown === 'boolean') {
            executionBits.push(`usage=${this.formatTokenUsageVisibility(result.tokenUsageKnown, result.tokenUsageScope)}`);
        }
        if (!executionBits.length) return reasonText;
        return `${reasonText} [${executionBits.join(', ')}]`;
    }

    private formatTokenUsageVisibility(
        known: boolean,
        scope?: InquiryTokenUsageScope
    ): string {
        if (!known) return 'unknown';
        if (scope === 'full') return 'full multi-pass';
        if (scope === 'partial') return 'partial multi-pass';
        if (scope === 'synthesis_only') return 'synthesis-only';
        return 'known';
    }

    private applyExecutionObservabilityFromTrace(
        result: InquiryResult,
        trace?: InquiryRunTrace | null
    ): InquiryResult {
        if (!trace) return result;
        const usageKnown = typeof trace.tokenUsageKnown === 'boolean'
            ? trace.tokenUsageKnown
            : !!trace.usage;
        return {
            ...result,
            executionState: trace.executionState,
            executionPath: trace.executionPath,
            failureStage: trace.failureStage,
            tokenUsageKnown: usageKnown,
            tokenUsageScope: trace.tokenUsageScope
        };
    }

    private applyTokenEstimateFromTrace(result: InquiryResult, trace?: InquiryRunTrace | null): void {
        const inputTokens = trace?.tokenEstimate?.inputTokens;
        if (typeof inputTokens === 'number' && Number.isFinite(inputTokens)) {
            result.tokenEstimateInput = inputTokens;
            result.tokenEstimateTier = this.getTokenTier(inputTokens);
            return;
        }
        result.tokenEstimateInput = undefined;
        result.tokenEstimateTier = undefined;
    }

    private getFiniteTokenEstimateInput(
        trace?: InquiryRunTrace | null,
        result?: InquiryResult | null
    ): number | null {
        const traceInput = trace?.tokenEstimate?.inputTokens;
        if (typeof traceInput === 'number' && Number.isFinite(traceInput)) {
            return traceInput;
        }
        const resultInput = result?.tokenEstimateInput;
        if (typeof resultInput === 'number' && Number.isFinite(resultInput)) {
            return resultInput;
        }
        return null;
    }

    private buildInquiryLogCostEstimateInput(
        trace: InquiryRunTrace,
        result: InquiryResult
    ): {
        executionInputTokens: number;
        expectedOutputTokens: number;
        expectedPasses: number;
        cacheReuseRatio?: number;
    } | null {
        const executionInputTokens = this.getFiniteTokenEstimateInput(trace, result);
        if (typeof executionInputTokens !== 'number' || !Number.isFinite(executionInputTokens) || executionInputTokens <= 0) {
            return null;
        }
        const expectedOutputTokens = Number.isFinite(trace.outputTokenCap)
            ? Math.max(0, Math.floor(trace.outputTokenCap))
            : 0;
        const expectedPasses = Number.isFinite(trace.tokenEstimate?.expectedPassCount)
            ? Math.max(1, Math.floor(trace.tokenEstimate.expectedPassCount as number))
            : (Number.isFinite(trace.executionPassCount) ? Math.max(1, Math.floor(trace.executionPassCount as number)) : 1);
        const cacheReuseRatio = typeof trace.cachedStableRatio === 'number' && Number.isFinite(trace.cachedStableRatio)
            ? Math.min(1, Math.max(0, trace.cachedStableRatio))
            : undefined;
        return {
            executionInputTokens,
            expectedOutputTokens,
            expectedPasses,
            cacheReuseRatio
        };
    }

    private startApiSimulation(): void {
        if (this.isInquiryRunDisabled()) return;
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        if (this.state.scope === 'book' && this.corpus && !this.corpus.bookResolved) {
            this.notifyInteraction('Book scope unresolved. Configure a book in settings before running Inquiry.');
            return;
        }
        this.clearErrorStateForAction();
        if (this.apiSimulationTimer) {
            window.clearTimeout(this.apiSimulationTimer);
            this.apiSimulationTimer = undefined;
        }
        const prompt = this.pickSimulationPrompt();
        const fallbackPrompt: InquiryQuestion = {
            id: 'simulation',
            label: 'Simulation',
            standardPrompt: 'Simulated inquiry run.',
            focusedPrompt: 'Simulated inquiry run.',
            zone: this.state.activeZone ?? 'setup',
            icon: 'activity'
        };
        const selectedPrompt = prompt ?? fallbackPrompt;
        this.clearActiveResultState();
        this.state.activeQuestionId = selectedPrompt.id;
        this.state.activeZone = selectedPrompt.zone;
        const targetSceneIds = this.getActiveTargetSceneIds();
        const selectionMode = this.getSelectionMode(targetSceneIds);
        const questionText = this.resolveQuestionPromptForRun(selectedPrompt, selectionMode);
        const questionPromptForm = this.resolveQuestionPromptFormForRun(selectedPrompt, selectionMode);
        this.lockPromptPreview(selectedPrompt, questionText);

        const manifest = this.buildCorpusManifest(selectedPrompt.id, {
            questionZone: selectedPrompt.zone
        });
        if (!manifest.entries.length) {
            this.unlockPromptPreview();
            this.handleEmptyCorpusRun();
            return;
        }
        const scopeLabel = this.getScopeLabel();
        const scopeKey = this.getScopeKey();
        const baseKey = this.sessionStore.buildBaseKey({
            questionId: selectedPrompt.id,
            questionPromptForm,
            scope: this.state.scope,
            scopeKey,
            targetSceneIds
        });
        const key = this.sessionStore.buildKey(baseKey, manifest.fingerprint);
        const activeBookId = this.state.scope === 'saga' ? this.state.activeBookId : this.state.activeBookId;
        const resolvedEngine = this.getResolvedEngine();
        const simulationProvider: InquiryAiProvider = resolvedEngine.provider === 'none'
            ? 'openai'
            : resolvedEngine.provider;
        const runnerInput: InquiryRunnerInput = {
            scope: this.state.scope,
            scopeLabel,
            targetSceneIds,
            selectionMode,
            activeBookId: this.state.scope === 'saga' ? this.state.activeBookId : this.state.activeBookId,
            mode: this.state.mode,
            questionId: selectedPrompt.id,
            questionText,
            questionPromptForm,
            questionZone: selectedPrompt.zone,
            corpus: manifest,
            rules: this.getEvidenceRules(),
            ai: {
                provider: simulationProvider,
                modelId: resolvedEngine.modelId,
                modelLabel: resolvedEngine.modelLabel
            }
        };
        const submittedAt = new Date();
        this.state.isRunning = true;
        this.setApiStatus('running');
        this.refreshUI({ skipCorpus: true });
        this.apiSimulationTimer = window.setTimeout(async () => {
            this.apiSimulationTimer = undefined;
            const completedAt = new Date();
            let result = this.buildSimulationResult(selectedPrompt, questionText, questionPromptForm, scopeLabel, manifest.fingerprint);
            result.submittedAt = submittedAt.toISOString();
            result.completedAt = completedAt.toISOString();
            result.roundTripMs = completedAt.getTime() - submittedAt.getTime();
            const simSnapshot = this.plugin.getInquiryEstimateService().getSnapshot();
            if (typeof simSnapshot?.estimate.estimatedInputTokens === 'number'
                && Number.isFinite(simSnapshot.estimate.estimatedInputTokens)) {
                result.tokenEstimateInput = simSnapshot.estimate.estimatedInputTokens;
                result.tokenEstimateTier = this.getTokenTier(simSnapshot.estimate.estimatedInputTokens);
            } else {
                result.tokenEstimateInput = undefined;
                result.tokenEstimateTier = undefined;
            }
            result.aiModelNextRunOnly = false;
            result = this.applyCorpusOverrideSummary(result);
            const rawResult = result;
            result = this.normalizeLegacyResult(result);
            const normalizationNotes = this.collectNormalizationNotes(rawResult, result);

            const session: InquirySession = {
                key,
                baseKey,
                result,
                createdAt: Date.now(),
                lastAccessed: Date.now(),
                status: 'simulated',
                activeBookId,
                targetSceneIds,
                scope: this.state.scope,
                questionZone: selectedPrompt.zone
            };
            this.sessionStore.setSession(session);
            const trace = await this.buildFallbackTrace(runnerInput, 'Simulated run: no provider call.');
            await this.saveInquiryLog(result, trace, manifest, {
                sessionKey: session.key,
                normalizationNotes
            });
            this.applySession({
                result,
                key: session.key,
                activeBookId: session.activeBookId,
                targetSceneIds: session.targetSceneIds,
                scope: session.scope,
                questionZone: session.questionZone
            }, 'missing');
            this.setApiStatus('success');
        }, SIMULATION_DURATION_MS);
    }

    private pickSimulationPrompt(): InquiryQuestion | undefined {
        const preferredZone = this.state.activeZone ?? 'setup';
        return this.getActivePrompt(preferredZone)
            ?? this.getActivePrompt('setup')
            ?? this.getActivePrompt('pressure')
            ?? this.getActivePrompt('payoff');
    }

    private buildErrorFallback(
        question: InquiryQuestion,
        questionText: string,
        questionPromptForm: InquiryQuestionPromptForm,
        scopeLabel: string,
        fingerprint: string,
        error: unknown
    ): InquiryResult {
        const message = error instanceof Error ? error.message : 'Runner error';
        return {
            runId: `run-${Date.now()}`,
            scope: this.state.scope,
            scopeLabel,
            mode: this.state.mode,
            selectionMode: this.getSelectionMode(this.getActiveTargetSceneIds()),
            roleValidation: this.computeRoleValidation(this.getSelectionMode(this.getActiveTargetSceneIds()), []),
            questionId: question.id,
            questionText,
            questionPromptForm,
            questionZone: question.zone,
            summary: 'Inquiry failed; fallback result returned.',
            summaryFlow: 'Inquiry failed; fallback result returned.',
            summaryDepth: 'Inquiry failed; fallback result returned.',
            verdict: {
                flow: 0,
                depth: 0,
                impact: 'high',
                assessmentConfidence: 'low'
            },
            aiStatus: 'unavailable',
            aiReason: 'exception',
            findings: [{
                refId: scopeLabel,
                kind: 'error',
                status: 'unclear',
                impact: 'high',
                assessmentConfidence: 'low',
                headline: 'Inquiry runner error.',
                bullets: [message],
                related: [],
                evidenceType: 'mixed',
                lens: 'both'
            }],
            corpusFingerprint: fingerprint
        };
    }

    private buildSimulationResult(
        question: InquiryQuestion,
        questionText: string,
        questionPromptForm: InquiryQuestionPromptForm,
        scopeLabel: string,
        fingerprint: string
    ): InquiryResult {
        return {
            runId: `run-${Date.now()}`,
            scope: this.state.scope,
            scopeLabel,
            mode: this.state.mode,
            selectionMode: this.getSelectionMode(this.getActiveTargetSceneIds()),
            roleValidation: this.computeRoleValidation(this.getSelectionMode(this.getActiveTargetSceneIds()), []),
            questionId: question.id,
            questionText,
            questionPromptForm,
            questionZone: question.zone,
            summary: 'Simulated inquiry session.',
            summaryFlow: 'Simulated inquiry session.',
            summaryDepth: 'Simulated inquiry session.',
            verdict: {
                flow: GLYPH_PLACEHOLDER_FLOW,
                depth: GLYPH_PLACEHOLDER_DEPTH,
                impact: 'low',
                assessmentConfidence: 'low'
            },
            aiStatus: 'success',
            aiReason: 'simulated',
            findings: [],
            corpusFingerprint: fingerprint
        };
    }

    private getEvidenceRules(): EvidenceParticipationRules {
        return {
            sagaOutlineScope: 'saga-only',
            bookOutlineScope: 'book-only',
            crossScopeUsage: 'conflict-only'
        };
    }

    private buildCorpusEntryList(
        questionId: string,
        options?: {
            modelId?: string;
            questionZone?: InquiryZone;
            contextRequired?: boolean;
            includeInactive?: boolean;
            applyOverrides?: boolean;
        }
    ): { entries: CorpusManifestEntry[]; resolvedRoots: string[] } {
        const activeBookId = this.getCanonicalActiveBookId();
        const sources = this.normalizeInquirySources(this.plugin.settings.inquirySources);
        const entries: CorpusManifestEntry[] = [];
        const now = Date.now();
        const includeInactive = options?.includeInactive ?? false;
        const applyOverrides = options?.applyOverrides ?? true;
        const classConfigMap = new Map(
            (sources.classes || []).map(config => [config.className, config])
        );
        const classScope = this.getClassScopeConfig(sources.classScope);
        const contextRequired = typeof options?.contextRequired === 'boolean'
            ? options.contextRequired
            : this.isContextRequiredForQuestion(questionId, options?.questionZone);
        const rootResolution = resolveInquirySourceRoots(this.app.vault, sources, this.plugin.settings.books);
        const { resolvedRoots, resolvedVaultRoots } = rootResolution;
        const bookResolution = resolveBookManagerInquiryBooks(this.plugin.settings.books);

        if (!classScope.allowAll && classScope.allowed.size === 0) {
            return { entries, resolvedRoots };
        }

        const inRoots = (path: string) => {
            return resolvedVaultRoots.some(root => !root || path === root || path.startsWith(`${root}/`));
        };

        const targetSceneIds = new Set(this.getActiveTargetSceneIds());
        const files = this.app.vault.getMarkdownFiles();
        files.forEach(file => {
            if (!inRoots(file.path)) return;
            if (!isPathIncludedByInquiryBooks(file.path, bookResolution.candidates, this.state.scope)) return;
            const cache = this.app.metadataCache.getFileCache(file);
            const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
            if (!frontmatter) return;
            const normalized = normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
            const classValues = this.extractClassValues(normalized);
            if (!classValues.length) return;

            classValues.forEach(className => {
                if (!classScope.allowAll && !classScope.allowed.has(className)) return;
                const config = classConfigMap.get(className);
                const isContextClass = INQUIRY_CONTEXT_CLASSES.has(className);
                const contextOverride = contextRequired && isContextClass;
                if (!config && !contextOverride) return;

                let mode: SceneInclusion = 'excluded';
                if (className === 'outline') {
                    const outlineScope = this.getFrontmatterScope(frontmatter) ?? 'book';
                    if (config && config.enabled) {
                        mode = this.normalizeContributionMode(
                            outlineScope === 'saga' ? config.sagaScope : config.bookScope,
                            className
                        );
                    }
                    if (contextOverride) {
                        mode = 'full';
                    }
                    if (applyOverrides) {
                        const groupKey = this.getCorpusGroupKey(className, outlineScope);
                        const classOverride = this.corpusService.getClassOverride(groupKey);
                        const itemOverride = this.getCorpusItemOverride(className, file.path, outlineScope);
                        mode = itemOverride ?? classOverride ?? mode;
                        mode = this.normalizeContributionMode(mode, className);
                    }
                    if (!includeInactive && !this.isModeActive(mode)) return;
                    const inclusionMode = this.normalizeEvidenceMode(mode);
                    entries.push({
                        path: file.path,
                        mtime: file.stat.mtime ?? now,
                        class: className,
                        scope: outlineScope,
                        mode: inclusionMode,
                        isTarget: false
                    });
                    return;
                }

                if (!this.isSynopsisCapableClass(className)) {
                    if (config && config.enabled) {
                        mode = this.normalizeContributionMode(config.referenceScope, className);
                    }
                    if (contextOverride) {
                        mode = 'full';
                    }
                    if (applyOverrides) {
                        const groupKey = this.getCorpusGroupKey(className);
                        const classOverride = this.corpusService.getClassOverride(groupKey);
                        const itemOverride = this.getCorpusItemOverride(className, file.path);
                        mode = itemOverride ?? classOverride ?? mode;
                        mode = this.normalizeContributionMode(mode, className);
                    }
                    if (!includeInactive && !this.isModeActive(mode)) return;
                    const inclusionMode = this.normalizeEvidenceMode(mode);
                    entries.push({
                        path: file.path,
                        mtime: file.stat.mtime ?? now,
                        class: className,
                        mode: inclusionMode,
                        isTarget: false
                    });
                    return;
                }

                if (config && config.enabled) {
                    mode = this.normalizeContributionMode(
                        this.state.scope === 'book' ? config.bookScope : config.sagaScope,
                        className
                    );
                }
                const sceneId = className === 'scene' ? readSceneId(normalized) : undefined;
                if (applyOverrides) {
                    const groupKey = this.getCorpusGroupKey(className);
                    const classOverride = this.corpusService.getClassOverride(groupKey);
                    const itemOverride = this.getCorpusItemOverride(className, file.path, undefined, sceneId);
                    mode = itemOverride ?? classOverride ?? mode;
                    mode = this.normalizeContributionMode(mode, className);
                }
                const isTarget = !!sceneId && targetSceneIds.has(sceneId);
                if (isTarget) {
                    mode = 'full';
                }
                if (!includeInactive && !this.isModeActive(mode)) return;
                const inclusionMode = this.normalizeEvidenceMode(mode);

                entries.push({
                    path: file.path,
                    sceneId,
                    mtime: file.stat.mtime ?? now,
                    class: className,
                    mode: inclusionMode,
                    isTarget
                });
            });
        });

        return {
            entries: scopeEntriesToActiveInquiryTarget({
                entries,
                scope: this.state.scope,
                activeBookId
            }),
            resolvedRoots
        };
    }

    private buildCorpusManifest(
        questionId: string,
        options?: { modelId?: string; questionZone?: InquiryZone; contextRequired?: boolean; applyOverrides?: boolean }
    ): CorpusManifest {
        const now = Date.now();
        const modelIdOverride = options?.modelId;
        const applyOverrides = options?.applyOverrides ?? true;
        const entryResult = this.buildCorpusEntryList(questionId, {
            modelId: modelIdOverride,
            questionZone: options?.questionZone,
            contextRequired: options?.contextRequired,
            includeInactive: false,
            applyOverrides
        });
        const entries = entryResult.entries.map(entry => ({
            ...entry,
            mode: entry.mode ?? 'excluded',
            isTarget: entry.class === 'scene' && !!entry.sceneId && entry.isTarget
        }));
        const resolvedRoots = entryResult.resolvedRoots;

        const fingerprintSource = entries
            .map(entry => `${entry.path}:${entry.sceneId ?? ''}:${entry.mtime}:${entry.mode}:${entry.isTarget ? 1 : 0}`)
            .sort()
            .join('|');
        const modelId = modelIdOverride ?? this.getResolvedEngine().modelId;
        const fingerprintRaw = `${INQUIRY_SCHEMA_VERSION}|${questionId}|${modelId}|${fingerprintSource}`;
        const fingerprint = this.hashString(fingerprintRaw);

        const classCounts = entries.reduce<Record<string, number>>((acc, entry) => {
            acc[entry.class] = (acc[entry.class] || 0) + 1;
            return acc;
        }, {});
        const allowedClasses = Array.from(new Set(entries.map(entry => entry.class)));
        const synopsisOnly = !entries.some(entry => entry.mode === 'full');

        return {
            entries,
            fingerprint,
            generatedAt: now,
            resolvedRoots,
            allowedClasses,
            synopsisOnly,
            classCounts
        };
    }

    private getDefaultMaterialMode(className: string): SceneInclusion {
        return getDefaultMaterialModePure(className);
    }

    private isSynopsisCapableClass(className: string): boolean {
        return isSynopsisCapableClassPure(className);
    }

    private normalizeContributionMode(mode: SceneInclusion, className: string): SceneInclusion {
        return normalizeContributionModePure(mode, className);
    }

    private normalizeMaterialMode(value: unknown, className: string): SceneInclusion {
        return normalizeMaterialModePure(value, className);
    }

    private resolveContributionMode(config: InquiryClassConfig): SceneInclusion {
        return resolveContributionModePure(config);
    }

    private normalizeClassContribution(config: InquiryClassConfig): InquiryClassConfig {
        return normalizeClassContributionPure(config);
    }

    private normalizeEvidenceMode(mode?: SceneInclusion | CorpusManifestEntry['mode']): 'excluded' | 'summary' | 'full' {
        return normalizeEvidenceModePure(mode);
    }

    private isModeActive(mode?: SceneInclusion | CorpusManifestEntry['mode']): boolean {
        return isModeActivePure(mode);
    }

    private normalizeInquirySources(raw?: InquirySourcesSettings): InquirySourcesSettings {
        return normalizeInquirySourcesPure(raw);
    }

    private extractClassValues(frontmatter: Record<string, unknown>): string[] {
        return extractClassValuesPure(frontmatter);
    }

    private getFrontmatterScope(frontmatter: Record<string, unknown>): InquiryScope | undefined {
        return getFrontmatterScopePure(frontmatter, this.plugin.settings.frontmatterMappings);
    }

    private hashString(value: string): string {
        return hashStringPure(value);
    }

    private getBriefSceneAnchorId(source: string): string {
        return `inquiry-${this.hashString(source || 'scene')}`;
    }

    private setFocusByIndex(index: number): void {
        const books = this.getNavigationBooks();
        const book = books[index - 1];
        if (!book) return;
        this.state.activeBookId = book.id;
        if (this.state.scope === 'book') {
            this.state.targetSceneIds = this.lastTargetSceneIdsByBookId.get(book.id) ?? [];
        }
        this.scheduleTargetPersist();
        this.refreshUI();
    }

    private async openActiveBrief(anchorId?: string): Promise<void> {
        const sessionId = this.state.activeSessionId;
        if (!sessionId) {
            new Notice('No active inquiry brief.');
            return;
        }
        const session = this.sessionStore.peekSession(sessionId);
        if (!session?.briefPath) {
            new Notice('No brief saved for the active inquiry.');
            return;
        }
        await this.openBriefFromSession(session, anchorId);
    }

    private async openSceneFromMinimap(sceneId: string): Promise<void> {
        const file = this.app.vault.getAbstractFileByPath(sceneId);
        if (file && this.isTFile(file)) {
            await openOrRevealFile(this.app, file);
            return;
        }
        new Notice('Scene file not found.');
    }

    private async openActiveBriefForItem(item: InquiryCorpusItem): Promise<void> {
        const anchorSource = this.getMinimapItemFilePath(item) || item.id || item.displayLabel;
        const anchorId = this.getBriefSceneAnchorId(anchorSource);
        await this.openActiveBrief(anchorId);
    }

    private handleMinimapTickContextMenu(item: InquiryCorpusItem, event: MouseEvent): void {
        if (this.state.isRunning) return;
        event.preventDefault();
        if (this.state.scope !== 'book') {
            this.notifyInteraction('Target Scenes are available only in Book scope.');
            return;
        }
        const filePath = this.getMinimapItemFilePath(item);
        if (!filePath) return;
        const entryKey = this.getCorpusItemKey('scene', filePath, undefined, item.sceneId);
        const isTarget = !!item.sceneId && this.getActiveTargetSceneIds().includes(item.sceneId);
        this.showSceneEntryMenu({
            entryKey,
            filePath,
            sceneId: item.sceneId,
            isTarget,
            event
        });
    }

    private drillIntoBook(bookId: string): void {
        if (!bookId) return;
        const wasScope = this.state.scope;
        this.state.activeBookId = bookId;
        this.scheduleTargetPersist();
        if (wasScope === 'saga') {
            this.handleScopeChange('book');
            return;
        }
        this.refreshUI();
    }

    private shiftFocus(delta: number): void {
        if (this.state.isRunning) {
            this.notifyInteraction('Inquiry running. Please wait.');
            return;
        }
        this.clearErrorStateForAction();
        const books = this.getNavigationBooks();
        const count = books.length;
        if (!count) return;
        const current = this.getNavigationBookIndex(books) + 1;
        const next = Math.min(Math.max(current + delta, 1), count);
        if (next === current) return;
        this.setFocusByIndex(next);
    }

    private getFocusIndex(): number {
        const books = this.getNavigationBooks();
        if (!books.length) return 1;
        return this.getNavigationBookIndex(books) + 1;
    }

    private getNavigationBooks(): InquiryBookItem[] {
        return this.corpus?.books ?? [];
    }

    private getNavigationBookIndex(books: InquiryBookItem[]): number {
        if (!books.length) return 0;
        const activeBookId = this.state.activeBookId ?? this.corpus?.activeBookId;
        const index = activeBookId ? books.findIndex(book => book.id === activeBookId) : -1;
        return index >= 0 ? index : 0;
    }

    private getActiveBookLabel(): string {
        if (!this.corpus?.bookResolved) return '?';
        const books = this.corpus?.books ?? [];
        if (this.state.activeBookId) {
            const match = books.find(book => book.id === this.state.activeBookId);
            if (match) return match.displayLabel;
        }
        return books[0]?.displayLabel ?? '?';
    }

    private getActiveBookTitleForMessages(): string | null {
        if (!this.corpus?.bookResolved) return null;
        const activeBookId = this.state.activeBookId ?? this.corpus?.activeBookId;
        return this.getBookTitleForId(activeBookId);
    }

    private getBookTitleForId(bookId: string | undefined): string | null {
        if (!bookId) return null;
        const normalizedBookId = normalizePath(bookId);
        if (!normalizedBookId) return null;
        const match = (this.plugin.settings.books || []).find(book =>
            normalizePath((book.sourceFolder || '').trim()) === normalizedBookId
        );
        const title = match?.title?.trim();
        return title && title.length > 0 ? title : null;
    }

    private getScopeLabel(): string {
        if (this.guidanceState === 'not-configured') return '?';
        if (this.guidanceState === 'no-scenes') return '?';
        if (this.state.scope === 'saga') {
            return String.fromCharCode(931);
        }
        return this.getActiveBookLabel();
    }

    private getActiveTargetSceneIds(): string[] {
        return this.state.scope === 'book' ? [...this.state.targetSceneIds] : [];
    }

    private getSelectionMode(targetSceneIds: string[] = this.state.targetSceneIds): InquirySelectionMode {
        return targetSceneIds.length > 0 ? 'focused' : 'discover';
    }

    private getResultSelectionMode(result: InquiryResult | null | undefined): InquirySelectionMode {
        return result?.selectionMode === 'focused' ? 'focused' : 'discover';
    }

    private getResultRoleValidation(result: InquiryResult | null | undefined): InquiryRoleValidation {
        return result?.roleValidation === 'missing-target-roles' ? 'missing-target-roles' : 'ok';
    }

    private computeRoleValidation(
        selectionMode: InquirySelectionMode,
        findings: InquiryFinding[],
        persisted?: InquiryRoleValidation
    ): InquiryRoleValidation {
        if (selectionMode !== 'focused') return 'ok';
        if (persisted === 'ok' || persisted === 'missing-target-roles') return persisted;
        return findings.some(finding => finding.role === 'target') ? 'ok' : 'missing-target-roles';
    }

    private updateMinimapTargetStates(result?: InquiryResult | null): void {
        const targetSceneIds = this.getActiveTargetSceneIds();
        const selectionMode = result ? this.getResultSelectionMode(result) : this.getSelectionMode(targetSceneIds);
        const roleValidation = result ? this.getResultRoleValidation(result) : 'ok';
        this.minimap.updateTargetStates(targetSceneIds, { selectionMode, roleValidation });
    }

    private getTargetSceneKey(sceneIds: string[] | undefined | null): string {
        if (!Array.isArray(sceneIds) || !sceneIds.length) return '';
        return this.normalizeTargetSceneIds(sceneIds).sort().join(',');
    }

    private getPersistedResultTargetSceneIds(result: InquiryResult | null | undefined): string[] {
        if (!result || !this.state.activeSessionId) return [];
        const session = this.sessionStore.peekSession(this.state.activeSessionId);
        if (!session) return [];
        return this.normalizeTargetSceneIds(session.targetSceneIds);
    }

    private getTargetSceneStatusLabel(): string {
        const activeTargetCount = this.getActiveTargetSceneIds().length;
        const storedTargetCount = this.state.targetSceneIds.length;
        const count = this.state.scope === 'book' ? activeTargetCount : storedTargetCount;
        if (!count) {
            return this.state.scope === 'saga'
                ? 'Discover · Target Scenes available only in Book scope'
                : 'Discover';
        }
        const noun = count === 1 ? 'Target Scene' : 'Target Scenes';
        if (this.state.scope === 'saga') {
            return `${count} ${noun} saved · Book-only`;
        }
        return `${count} ${noun}`;
    }

    private getScopeKey(): string {
        if (this.state.scope === 'saga') return 'saga';
        if (this.state.activeBookId) return this.state.activeBookId;
        return this.corpus?.activeBookId ?? 'unresolved';
    }

    private buildScopeHoverText(): string {
        const label = this.getScopeLabel();
        const scopeLabel = this.state.scope === 'saga' ? 'Saga scope' : 'Book scope';
        if (this.state.activeResult) {
            const targetNote = this.state.scope === 'saga' && this.state.targetSceneIds.length
                ? ' Target Scenes are saved for Book scope and inactive here.'
                : '';
            return `${scopeLabel}: ${label}. ${this.getTargetSceneStatusLabel()}.${targetNote}`;
        }
        const glyphSeed = this.resolveGlyphSeed();
        if (glyphSeed.source === 'session') {
            return `${scopeLabel}: ${label}. ${this.getTargetSceneStatusLabel()}. Rings seeded from the latest saved inquiry for this selection.`;
        }
        return `${scopeLabel}: ${label}. ${this.getTargetSceneStatusLabel()}. No inquiry run yet.`;
    }

    private buildRingHoverText(ring: InquiryLens): string {
        const label = ring === 'flow' ? 'Flow' : 'Depth';
        if (this.state.activeResult) {
            const verdict = this.state.activeResult.verdict;
            const score = ring === 'flow' ? verdict.flow : verdict.depth;
            return `${label} score ${this.formatMetricDisplay(score)}. Impact ${verdict.impact}. Assessment confidence ${verdict.assessmentConfidence}.`;
        }
        const glyphSeed = this.resolveGlyphSeed();
        if (glyphSeed.source === 'session') {
            const score = ring === 'flow' ? glyphSeed.flowValue : glyphSeed.depthValue;
            return `${label} score ${this.formatMetricDisplay(score)} from the latest saved inquiry for this selection. Run an inquiry to refresh it.`;
        }
        return `${label} verdict unavailable. Run an inquiry.`;
    }

    private resolveGlyphSeed(): InquiryGlyphSeed {
        const activeResult = this.state.activeResult;
        if (activeResult) {
            const flowValue = this.normalizeMetricValue(activeResult.verdict.flow);
            const depthValue = this.normalizeMetricValue(activeResult.verdict.depth);
            return {
                source: 'active',
                flowValue,
                depthValue,
                flowVisualValue: flowValue,
                depthVisualValue: depthValue,
                impact: activeResult.verdict.impact,
                assessmentConfidence: activeResult.verdict.assessmentConfidence
            };
        }

        const session = this.getLatestSessionForCurrentFocus();
        if (session) {
            const result = this.normalizeLegacyResult(session.result);
            const flowValue = this.normalizeMetricValue(result.verdict.flow);
            const depthValue = this.normalizeMetricValue(result.verdict.depth);
            return {
                source: 'session',
                flowValue,
                depthValue,
                flowVisualValue: flowValue,
                depthVisualValue: depthValue,
                impact: result.verdict.impact,
                assessmentConfidence: result.verdict.assessmentConfidence,
                session
            };
        }

        return {
            source: 'empty',
            flowValue: 0,
            depthValue: 0,
            flowVisualValue: GLYPH_EMPTY_STATE_STUB,
            depthVisualValue: GLYPH_EMPTY_STATE_STUB,
            impact: 'low',
            assessmentConfidence: 'low'
        };
    }

    private getLatestSessionForCurrentFocus(): InquirySession | undefined {
        const scope = this.state.scope;
        const scopeKey = this.getScopeKey();
        const activeTargetKey = this.getTargetSceneKey(this.getActiveTargetSceneIds());
        if (scope === 'book' && (!scopeKey || scopeKey === 'unresolved')) {
            return undefined;
        }
        return this.sessionStore
            .getRecentSessions(this.sessionStore.getSessionCount())
            .find(session => {
                const sessionScope = session.scope ?? session.result.scope;
                if (sessionScope !== scope) return false;
                if (this.isErrorResult(session.result)) return false;
                if (scope === 'saga') return true;
                if (this.getSessionScopeKey(session) !== scopeKey) return false;
                return this.getTargetSceneKey(session.targetSceneIds) === activeTargetKey;
            });
    }

    private getSessionScopeKey(session: InquirySession): string | undefined {
        if (session.activeBookId?.trim()) {
            return session.activeBookId;
        }
        const [, , ...focusParts] = session.baseKey.split('::');
        const fallback = focusParts.join('::').trim();
        return fallback || undefined;
    }

    private buildZoneHoverText(zone: InquiryZone): string {
        const label = zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
        if (!this.state.activeResult) {
            return `${label} verdict unavailable. Run an inquiry.`;
        }
        if (this.state.activeZone !== zone) {
            return `${label} verdict unavailable for the current inquiry.`;
        }
        return `${label}: ${this.getResultSummaryForMode(this.state.activeResult, this.state.mode)}`;
    }

    private buildMinimapHoverText(label: string): string {
        return label;
    }

    private handleMinimapHover(item: InquiryCorpusItem, label: string, displayLabel?: string): void {
        const hoverLabel = displayLabel || label;
        const result = this.state.activeResult;
        if (!result || this.isErrorResult(result)) {
            this.hideSceneDossier(true);
            this.setHoverText(this.buildMinimapHoverText(hoverLabel));
            return;
        }
        const finding = this.resolveFindingForMinimapHover(item, label, hoverLabel, result);
        if (!finding) {
            this.hideSceneDossier();
            this.setHoverText(this.buildMinimapHoverText(hoverLabel));
            return;
        }
        this.setHoverText('');
        this.queueSceneDossier(
            this.buildSceneDossierHoverKey(item, label, finding),
            this.buildSceneDossierModel(item, label, hoverLabel, finding, result)
        );
    }

    private buildSceneDossierHoverKey(item: InquiryCorpusItem, label: string, finding: InquiryFinding): string {
        return [
            item.id,
            item.sceneId ?? '',
            label,
            finding.refId ?? '',
            finding.headline ?? ''
        ].join('::');
    }

    private resolveFindingForMinimapHover(
        item: InquiryCorpusItem,
        label: string,
        hoverLabel: string,
        result: InquiryResult
    ): InquiryFinding | null {
        const items = this.getResultItems(result);
        const findingMap = this.buildFindingMap(result, items);
        const directMatch = findingMap.get(label)
            || findingMap.get(hoverLabel)
            || findingMap.get(item.displayLabel);
        if (directMatch) return directMatch;

        const ordered = this.getOrderedFindings(result, result.mode || this.state.mode);
        const candidateKeys = new Set<string>([
            label.toLowerCase(),
            hoverLabel.toLowerCase(),
            item.displayLabel.toLowerCase(),
            item.id.toLowerCase(),
            ...(item.sceneId ? [item.sceneId.toLowerCase()] : []),
            ...(item.filePaths ?? []).map(path => path.toLowerCase())
        ]);
        for (const finding of ordered) {
            if (!this.isFindingHit(finding)) continue;
            const refId = finding.refId?.trim().toLowerCase();
            if (refId && candidateKeys.has(refId)) {
                return finding;
            }
            const resolvedLabel = this.resolveFindingChipLabel(finding, result, items)?.toLowerCase();
            if (resolvedLabel && candidateKeys.has(resolvedLabel)) {
                return finding;
            }
        }
        return null;
    }

    private clearResultPreview(): void {
        const hadPreview = this.minimapResultPreviewActive;
        this.hideSceneDossier(true);
        if (!hadPreview) return;
        this.minimapResultPreviewActive = false;
        if (this.previewLocked) return;
        this.hidePromptPreview(true);
    }

    private buildSceneDossierModel(
        item: InquiryCorpusItem,
        label: string,
        hoverLabel: string,
        finding: InquiryFinding,
        result: InquiryResult
    ): InquirySceneDossier {
        const fallbackTitle = buildSceneDossierHeader({
            label,
            itemDisplayLabel: item.displayLabel,
            itemTitle: this.getMinimapItemTitle(item),
            hoverLabel
        });
        return buildInquiryDossierPresentation({
            finding,
            sceneNumber: parseCorpusLabelNumber(item.displayLabel) ?? parseCorpusLabelNumber(label),
            sceneTitle: stripNumericTitlePrefix(this.getMinimapItemTitle(item)),
            fallbackTitle,
            runId: result.runId,
            selectionMode: result.selectionMode,
            roleValidation: result.roleValidation
        });
    }

    private queueSceneDossier(hoverKey: string, dossier: InquirySceneDossier): void {
        if (!this.sceneDossierGroup) return;
        this.cancelSceneDossierHide();
        this.cancelSceneDossierShow();
        const showImmediately = this.sceneDossierVisible || this.sceneDossierActiveKey === hoverKey;
        if (showImmediately) {
            this.showSceneDossier(dossier, hoverKey);
            return;
        }
        this.sceneDossierShowTimer = window.setTimeout(() => {
            this.sceneDossierShowTimer = undefined;
            this.showSceneDossier(dossier, hoverKey);
        }, SCENE_DOSSIER_HOVER_DELAY_MS);
    }

    private cancelSceneDossierShow(): void {
        if (!this.sceneDossierShowTimer) return;
        window.clearTimeout(this.sceneDossierShowTimer);
        this.sceneDossierShowTimer = undefined;
    }

    private cancelSceneDossierHide(): void {
        if (!this.sceneDossierHideTimer) return;
        window.clearTimeout(this.sceneDossierHideTimer);
        this.sceneDossierHideTimer = undefined;
    }

    private showSceneDossier(dossier: InquirySceneDossier, hoverKey: string): void {
        if (
            !this.sceneDossierGroup
            || !this.sceneDossierComposition
            || !this.sceneDossierFocusCore
            || !this.sceneDossierFocusGlow
            || !this.sceneDossierFocusOutline
            || !this.sceneDossierBg
            || !this.sceneDossierBraceLeft
            || !this.sceneDossierBraceRight
            || !this.sceneDossierTextGroup
            || !this.sceneDossierCoreGroup
            || !this.sceneDossierHeader
            || !this.sceneDossierAnchor
            || !this.sceneDossierBody
            || !this.sceneDossierBodySecondary
            || !this.sceneDossierBodyDivider
            || !this.sceneDossierFooter
            || !this.sceneDossierSource
        ) {
            return;
        }
        this.cancelSceneDossierHide();
        renderInquirySceneDossier({
            refs: {
                group: this.sceneDossierGroup,
                composition: this.sceneDossierComposition,
                focusCore: this.sceneDossierFocusCore,
                focusGlow: this.sceneDossierFocusGlow,
                focusOutline: this.sceneDossierFocusOutline,
                bg: this.sceneDossierBg,
                braceLeft: this.sceneDossierBraceLeft,
                braceRight: this.sceneDossierBraceRight,
                textGroup: this.sceneDossierTextGroup,
                coreGroup: this.sceneDossierCoreGroup,
                header: this.sceneDossierHeader,
                anchor: this.sceneDossierAnchor,
                body: this.sceneDossierBody,
                bodySecondary: this.sceneDossierBodySecondary,
                bodyDivider: this.sceneDossierBodyDivider,
                footer: this.sceneDossierFooter,
                source: this.sceneDossierSource
            },
            dossier,
            rootSvg: this.rootSvg,
            previewGroup: this.previewGroup,
            computeBalancedSvgLines: this.computeBalancedSvgLines.bind(this),
            setPositionedDossierTextBlock: this.setPositionedDossierTextBlock.bind(this)
        });
        this.sceneDossierActiveKey = hoverKey;
        this.sceneDossierVisible = true;
        this.minimapResultPreviewActive = true;
    }

    private setPositionedWrappedSvgText(
        textEl: SVGTextElement,
        text: string,
        maxWidth: number,
        maxLines: number,
        lineHeight: number,
        startDy: number
    ): number {
        textEl.setAttribute('y', '0');
        const lineCount = this.setWrappedSvgText(textEl, text, maxWidth, maxLines, lineHeight);
        const firstLine = textEl.firstElementChild;
        if (firstLine instanceof SVGTSpanElement) {
            firstLine.setAttribute('dy', String(startDy));
        }
        return lineCount;
    }

    private computeBalancedSvgLines(
        textEl: SVGTextElement,
        text: string,
        maxWidth: number,
        options?: {
            maxLines?: number;
            preferFrontLoaded?: boolean;
            minNonFinalFillRatio?: number;
        }
    ): string[] {
        const words = text.split(/\s+/).filter(Boolean);
        if (!words.length) return [];
        const maxLines = Math.max(options?.maxLines ?? words.length, 1);
        const minNonFinalFillRatio = Math.max(0, Math.min(options?.minNonFinalFillRatio ?? 0, 0.95));

        const widthCache = new Map<string, number>();
        const measureWidth = (content: string): number => {
            const cached = widthCache.get(content);
            if (cached !== undefined) return cached;
            this.perfCounters.svgTextWrites++;
            textEl.textContent = content;
            const measured = textEl.getComputedTextLength();
            widthCache.set(content, measured);
            return measured;
        };

        const solveMemo = new Map<string, { cost: number; lines: string[] }>();
        const solve = (startIndex: number, linesRemaining: number): { cost: number; lines: string[] } => {
            if (startIndex >= words.length) {
                return { cost: 0, lines: [] };
            }
            if (linesRemaining <= 0) {
                return { cost: Number.POSITIVE_INFINITY, lines: [] };
            }
            const memoKey = `${startIndex}:${linesRemaining}`;
            const cached = solveMemo.get(memoKey);
            if (cached) return cached;

            let line = '';
            let best = { cost: Number.POSITIVE_INFINITY, lines: [words.slice(startIndex).join(' ')] };

            for (let endIndex = startIndex; endIndex < words.length; endIndex += 1) {
                line = line ? `${line} ${words[endIndex]}` : words[endIndex];
                const width = measureWidth(line);
                if (width > maxWidth) {
                    if (endIndex === startIndex) continue;
                    break;
                }

                const remaining = solve(endIndex + 1, linesRemaining - 1);
                if (!Number.isFinite(remaining.cost)) continue;

                const isLast = endIndex === words.length - 1;
                const fillRatio = Math.min(1, width / maxWidth);
                const slackRatio = Math.max(0, 1 - fillRatio);
                let linePenalty = slackRatio * slackRatio;
                if (!isLast && fillRatio < 0.52) {
                    linePenalty += (0.52 - fillRatio) * 1.4;
                }
                if (!isLast && minNonFinalFillRatio > 0 && fillRatio < minNonFinalFillRatio) {
                    linePenalty += (minNonFinalFillRatio - fillRatio) * 6.5;
                }
                if (isLast) {
                    linePenalty += slackRatio * slackRatio * 0.45;
                    if (fillRatio < 0.72 && startIndex > 0) {
                        linePenalty += (0.72 - fillRatio) * 3.6;
                    }
                }

                const candidateLines = [line, ...remaining.lines];
                let shapePenalty = 0;
                if (options?.preferFrontLoaded && candidateLines.length > 1) {
                    const widths = candidateLines.map(candidateLine => measureWidth(candidateLine));
                    for (let i = 1; i < widths.length; i += 1) {
                        const prev = widths[i - 1];
                        const curr = widths[i];
                        if (curr > prev) {
                            shapePenalty += ((curr - prev) / maxWidth) * 4.2;
                        }
                    }
                    const firstWidth = widths[0];
                    const lastWidth = widths[widths.length - 1];
                    if (lastWidth > firstWidth) {
                        shapePenalty += ((lastWidth - firstWidth) / maxWidth) * 5.4;
                    }
                }

                const candidateCost = linePenalty + remaining.cost + shapePenalty;
                if (candidateCost < best.cost) {
                    best = {
                        cost: candidateCost,
                        lines: candidateLines
                    };
                }
            }

            solveMemo.set(memoKey, best);
            return best;
        };

        const best = solve(0, maxLines);
        textEl.textContent = '';
        return best.lines.length ? best.lines : [words.join(' ')];
    }

    private setPositionedDossierTextBlock(
        textEl: SVGTextElement,
        text: string,
        maxWidth: number,
        lineHeight: number,
        startDy: number,
        options?: {
            align?: 'center' | 'start';
            justify?: boolean;
            preferFrontLoaded?: boolean;
            minNonFinalFillRatio?: number;
        }
    ): number {
        const align = options?.align ?? 'center';
        const x = align === 'start' ? -maxWidth / 2 : 0;
        textEl.setAttribute('y', '0');
        textEl.setAttribute('x', String(x));
        textEl.setAttribute('text-anchor', align === 'start' ? 'start' : 'middle');

        const lines = this.computeBalancedSvgLines(textEl, text, maxWidth, {
            preferFrontLoaded: options?.preferFrontLoaded,
            minNonFinalFillRatio: options?.minNonFinalFillRatio
        });
        this.perfCounters.svgClearCalls++;
        clearSvgChildren(textEl);

        lines.forEach((line, index) => {
            this.perfCounters.svgNodeCreates++;
            const tspan = createSvgElement('tspan');
            tspan.setAttribute('x', String(x));
            tspan.setAttribute('dy', index === 0 ? String(startDy) : String(lineHeight));
            tspan.textContent = line;
            if (
                options?.justify
                && align === 'start'
                && index < lines.length - 1
                && /\s/.test(line)
            ) {
                tspan.setAttribute('textLength', String(maxWidth));
                tspan.setAttribute('lengthAdjust', 'spacing');
            }
            textEl.appendChild(tspan);
        });

        return Math.max(lines.length, 1);
    }

    private hideSceneDossier(immediate = false): void {
        this.cancelSceneDossierShow();
        if (!this.sceneDossierGroup) {
            this.minimapResultPreviewActive = false;
            return;
        }
        const hide = () => {
            this.sceneDossierHideTimer = undefined;
            this.sceneDossierGroup?.classList.remove('is-visible');
            this.previewGroup?.classList.remove('is-dossier-muted');
            this.sceneDossierVisible = false;
            this.sceneDossierActiveKey = undefined;
            this.minimapResultPreviewActive = false;
        };
        if (immediate) {
            this.cancelSceneDossierHide();
            hide();
            return;
        }
        if (!this.sceneDossierVisible) {
            this.minimapResultPreviewActive = false;
            return;
        }
        this.cancelSceneDossierHide();
        this.sceneDossierHideTimer = window.setTimeout(hide, SCENE_DOSSIER_HIDE_DELAY_MS);
    }

    private buildFindingMap(
        result: InquiryResult | null | undefined,
        items: InquiryCorpusItem[]
    ): Map<string, InquiryFinding> {
        const map = new Map<string, InquiryFinding>();
        if (!result) return map;
        const ordered = this.getOrderedFindings(result, result.mode || this.state.mode);
        ordered.forEach(finding => {
            if (!this.isFindingHit(finding)) return;
            const label = this.resolveFindingChipLabel(finding, result, items);
            if (!label) return;
            if (map.has(label)) return;
            map.set(label, finding);
        });
        return map;
    }

    private isFindingHit(finding: InquiryFinding): boolean {
        return finding.kind !== 'none' && finding.kind !== 'strength';
    }

    private getImpactRank(impact: InquirySeverity): number {
        if (impact === 'high') return 3;
        if (impact === 'medium') return 2;
        return 1;
    }

    private formatMetricDisplay(value: number): string {
        if (!Number.isFinite(value)) return '0';
        if (value > 1) return String(Math.round(value));
        return String(Math.round(value * 100));
    }

    private normalizeMetricValue(value: number): number {
        if (!Number.isFinite(value)) return 0;
        if (value > 1) {
            const clamped = Math.min(Math.max(value, 5), 100);
            return clamped / 100;
        }
        return Math.min(Math.max(value, 0), 1);
    }

    private setHoverText(text: string): void {
        if (this.guidanceState !== 'running') return;
        if (this.hoverTextEl) {
            this.hoverTextEl.textContent = text;
        }
    }

    private clearHoverText(): void {
        if (this.guidanceState !== 'running') return;
        if (this.hoverTextEl) {
            this.hoverTextEl.textContent = '';
        }
    }

    private showPromptPreview(zone: InquiryZone, mode: InquiryLens, question: string): void {
        if (this.previewLocked) return;
        if (!this.previewGroup) return;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        this.previewGroup.classList.remove('is-error');
        this.setPreviewShimmerEnabled(false);
        this.setPreviewRunningNoteText('');
        this.previewLast = { zone, question };
        this.updatePromptPreview(zone, mode, question, undefined, undefined, { hideEmpty: true });
        this.previewGroup.classList.add('is-visible');
        this.lastReadinessUiState = this.buildReadinessUiState();
        this.updateMinimapPressureGauge();
    }

    /**
     * Request an estimate snapshot from the service.
     *
     * This is the single entry point for triggering an estimate rebuild.
     * Called on scope change, focus book change, engine change, corpus
     * override toggle, vault file change, and view open.
     *
     * While the snapshot is building, UI shows "Estimating…" via the
     * pending flag in buildReadinessUiState().
     */
    private async requestEstimateSnapshot(): Promise<void> {
        const stats = this.getPayloadStats();
        const engine = this.getResolvedEngine();

        // Blocked engines (e.g. ollama) cannot produce estimates — skip the
        // snapshot request entirely and refresh displays to show the blocked state.
        if (engine.blocked) {
            this.refreshEstimateDisplays();
            return;
        }

        const overrides = this.getCorpusOverrideSummary();
        const manifest = this.buildCorpusManifest('estimate-snapshot');
        const targetSceneIds = this.getActiveTargetSceneIds();

        this.refreshEstimateDisplays(); // Shows "Estimating…" if snapshot is null

        const service = this.plugin.getInquiryEstimateService();
        const aiSettings = this.getCanonicalAiSettings();
        const snapshot = await service.requestSnapshot({
            scope: this.state.scope,
            activeBookId: this.state.activeBookId ?? this.corpus?.books?.[0]?.id,
            targetSceneIds,
            scopeLabel: this.getScopeLabel(),
            manifest,
            payloadStats: {
                sceneCount: stats.sceneTotal,
                outlineCount: stats.bookOutlineCount + stats.sagaOutlineCount,
                referenceCount: stats.referenceCounts.total,
                evidenceChars: stats.evidenceChars
            },
            runner: this.runner,
            engine,
            overrideSummary: overrides,
            rules: this.getEvidenceRules(),
            mode: this.state.mode,
            selectionMode: this.getSelectionMode(targetSceneIds),
            analysisPackaging: aiSettings.analysisPackaging,
        });

        if (!snapshot) return; // stale or failed
        this.refreshEstimateDisplays(); // Renders once with final values
    }

    /**
     * Refresh all estimate-consuming UI elements from the service snapshot.
     *
     * Reads the snapshot (or null) and updates:
     *   - Engine panel (readiness strip, popover)
     *   - Minimap pressure gauge
     *   - Preview panel pills (if visible)
     */
    private refreshEstimateDisplays(): void {
        if (this.activeCancelRunModal) return;
        this.syncEngineBadgePulse();
        this.updateMinimapPressureGauge();
        if (this.enginePanelEl && !this.enginePanelEl.classList.contains('ert-hidden')) {
            this.refreshEnginePanel();
        }
        if (!this.previewLocked
            && this.previewGroup?.classList.contains('is-visible')
            && this.previewLast) {
            this.updatePromptPreview(
                this.previewLast.zone,
                this.state.mode,
                this.previewLast.question,
                undefined,
                undefined,
                { hideEmpty: true }
            );
        }
    }

    private hidePromptPreview(immediate = false): void {
        if (this.previewLocked) return;
        if (!this.previewGroup) return;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        const hide = () => {
            this.setPreviewShimmerEnabled(false);
            this.previewGroup?.classList.remove('is-visible');
        };
        if (immediate) {
            hide();
            return;
        }
        this.previewHideTimer = window.setTimeout(hide, 140);
    }

    private setPreviewRowLabels(labels: string[]): void {
        if (!this.previewRows.length) return;
        this.previewRows.forEach((row, idx) => {
            row.label = labels[idx] ?? row.label;
        });
    }

    private resetPreviewRowLabels(): void {
        if (!this.previewRowDefaultLabels.length) return;
        this.previewRows.forEach((row, idx) => {
            row.label = this.previewRowDefaultLabels[idx] ?? row.label;
        });
    }

    private clearPreviewShimmerText(): void {
        if (!this.previewShimmerGroup) return;
        clearSvgChildren(this.previewShimmerGroup);
    }

    private setPreviewShimmerEnabled(enabled: boolean): void {
        if (!this.previewShimmerGroup) return;
        if (enabled) {
            this.previewShimmerGroup.removeAttribute('display');
            return;
        }
        this.clearPreviewShimmerText();
        this.previewShimmerGroup.setAttribute('display', 'none');
    }

    private getInquiryTimingHistoryKey(provider?: string, model?: string): string | null {
        const providerKey = provider?.trim().toLowerCase();
        const modelKey = model?.trim().toLowerCase();
        if (!providerKey || !modelKey) return null;
        return `${providerKey}::${modelKey}`;
    }

    private getInquiryTimingHistoryEntry(provider?: string, model?: string): InquiryTimingHistoryEntry | null {
        const key = this.getInquiryTimingHistoryKey(provider, model);
        if (!key) return null;
        return this.plugin.settings.inquiryTimingHistory?.[key] ?? null;
    }

    private buildTimingEstimateFromHistory(
        estimatedInputTokens: number,
        provider?: string,
        model?: string
    ): { minSeconds: number; maxSeconds: number } | null {
        const entry = this.getInquiryTimingHistoryEntry(provider, model);
        if (!entry || !Number.isFinite(entry.avgMsPerInputToken) || entry.avgMsPerInputToken <= 0) {
            return null;
        }
        const predictedMs = Math.max(4000, estimatedInputTokens * entry.avgMsPerInputToken);
        const variance = entry.samples >= 6 ? 0.2 : entry.samples >= 3 ? 0.32 : 0.45;
        return {
            minSeconds: Math.max(4, (predictedMs * (1 - variance)) / 1000),
            maxSeconds: Math.max(6, (predictedMs * (1 + variance)) / 1000)
        };
    }

    private async recordInquiryTimingSample(result: InquiryResult, trace: InquiryRunTrace | null | undefined): Promise<void> {
        if (!result || this.isErrorResult(result) || result.aiReason === 'simulated' || result.aiReason === 'stub') return;
        const provider = result.aiProvider?.trim();
        const model = (result.aiModelResolved || result.aiModelRequested || '').trim();
        const key = this.getInquiryTimingHistoryKey(provider, model);
        if (!key) return;
        const durationMs = typeof result.roundTripMs === 'number' && Number.isFinite(result.roundTripMs)
            ? result.roundTripMs
            : null;
        if (!durationMs || durationMs <= 0) return;

        const usage = trace?.usage
            ?? (trace?.response?.responseData && provider
                ? extractTokenUsage(provider, trace.response.responseData)
                : null);
        const inputTokens = (() => {
            if (typeof usage?.inputTokens === 'number' && Number.isFinite(usage.inputTokens) && usage.inputTokens > 0) {
                return usage.inputTokens;
            }
            if (typeof result.tokenEstimateInput === 'number' && Number.isFinite(result.tokenEstimateInput) && result.tokenEstimateInput > 0) {
                return result.tokenEstimateInput;
            }
            return null;
        })();
        if (!inputTokens) return;

        const history = this.plugin.settings.inquiryTimingHistory ?? {};
        const previous = history[key];
        const sampleRate = durationMs / inputTokens;
        const previousSamples = Math.min(previous?.samples ?? 0, 19);
        const samples = previousSamples + 1;
        const avgMsPerInputToken = previous
            ? (((previous.avgMsPerInputToken * previousSamples) + sampleRate) / Math.max(samples, 1))
            : sampleRate;

        history[key] = {
            samples,
            avgMsPerInputToken,
            lastDurationMs: durationMs,
            lastInputTokens: inputTokens,
            updatedAt: new Date().toISOString()
        };
        this.plugin.settings.inquiryTimingHistory = history;
        await this.plugin.saveSettings();
    }

    private setPreviewFooterText(text: string): void {
        if (this.previewFooter) {
            this.setTextIfChanged(this.previewFooter, text, 'hudTextWrites');
        }
    }

    private setPreviewRunningNoteText(text: string): void {
        if (!this.previewRunningNote) return;
        const note = text.trim();
        this.setTextIfChanged(this.previewRunningNote, note, 'hudTextWrites');
        this.toggleClassIfChanged(this.previewRunningNote, 'ert-hidden', !note, 'hudAttrWrites');
    }

    private updateRunProgress(progress: InquiryRunProgressEvent | null): void {
        this.perfCounters.progressUpdateCalls++;
        this.currentRunProgress = progress;
        if (!this.shouldApplyRunningProgressUpdates()) return;
        this.applyRunningProgressPreviewState(progress);
        this.refreshRunningProgressChrome();
    }

    private shouldApplyRunningProgressUpdates(): boolean {
        return this.state.isRunning && !this.activeCancelRunModal;
    }

    private applyRunningProgressPreviewState(progress: InquiryRunProgressEvent | null): void {
        this.reconcileRunningEstimate(progress);
        const questionText = this.previewLast?.question || this.getCurrentPromptQuestion() || '';
        this.setPreviewRunningNoteText(this.buildRunningStatusNote(questionText));
        this.setPreviewFooterText('');
    }

    private refreshRunningProgressChrome(): void {
        this.updateMinimapPressureGauge();
        this.updateRunningHud();
        this.perfCounters.progressDomPatches++;
        this.updateRunningState();
    }

    private formatRunDurationEstimate(minSeconds: number, maxSeconds: number): string {
        const min = Math.max(1, Math.round(minSeconds));
        const max = Math.max(min, Math.round(maxSeconds));
        if (max < 60) {
            if (min === max) {
                return `${min} ${min === 1 ? 'second' : 'seconds'}`;
            }
            return `${min}-${max} seconds`;
        }
        const minMinutes = Math.max(1, Math.round(min / 60));
        const maxMinutes = Math.max(minMinutes, Math.round(max / 60));
        if (minMinutes === maxMinutes) {
            return `${minMinutes} ${minMinutes === 1 ? 'minute' : 'minutes'}`;
        }
        return `${minMinutes}-${maxMinutes} minutes`;
    }

    private estimateRunDurationRange(questionText: string): { minSeconds: number; maxSeconds: number } {
        const readinessUi = this.buildReadinessUiState();
        const passPlan = this.getCurrentPassPlan(readinessUi);
        const estimatedTokens = Math.max(0, readinessUi.estimateInputTokens || 0);
        const totalPasses = Math.max(1, passPlan.displayPassCount || 1);
        const perPassTokens = estimatedTokens > 0
            ? estimatedTokens / totalPasses
            : 0;
        const questionComplexityBoost = Math.min(4, Math.max(0, Math.round((questionText?.trim().length ?? 0) / 90)));
        const perPassMin = 6 + (perPassTokens / 900) + (questionComplexityBoost * 0.5);
        const perPassMax = 12 + (perPassTokens / 550) + questionComplexityBoost;
        const multiPassOverheadMin = Math.max(0, totalPasses - 1) * 5;
        const multiPassOverheadMax = Math.max(0, totalPasses - 1) * 9;
        const minSeconds = Math.max(6, (perPassMin * totalPasses) + multiPassOverheadMin);
        const maxSeconds = Math.max(minSeconds + 6, (perPassMax * totalPasses) + multiPassOverheadMax);
        const timingEstimate = this.buildTimingEstimateFromHistory(
            estimatedTokens,
            readinessUi.provider,
            readinessUi.model?.id
        );
        if (!timingEstimate) {
            return {
                minSeconds,
                maxSeconds
            };
        }
        return {
            minSeconds: Math.max(4, Math.min(minSeconds, timingEstimate.minSeconds)),
            maxSeconds: Math.max(
                Math.max(minSeconds + 2, timingEstimate.maxSeconds),
                Math.min(maxSeconds, timingEstimate.maxSeconds * 1.1)
            )
        };
    }

    private buildRunningProgressLabel(progress: InquiryRunProgressEvent | null): string {
        if (!progress || progress.totalPasses <= 1) return '';
        return `Pass ${progress.currentPass} of ${progress.totalPasses}.`;
    }

    private buildRunningStageLabel(progress: InquiryRunProgressEvent | null): string {
        if (!progress) return '';
        if (progress.detail?.trim()) return progress.detail.trim();
        if (progress.phase === 'finalizing') return 'Finalizing the result.';
        return 'Waiting for the provider response.';
    }

    private cachedRunningStatusStatic?: string;
    private cachedRunningStatusQuestion?: string;

    private buildRunningStatusNote(questionText: string): string {
        if (!this.cachedRunningStatusStatic || this.cachedRunningStatusQuestion !== questionText) {
            const estimate = this.estimateRunDurationRange(questionText);
            const estimateLabel = this.formatRunDurationEstimate(estimate.minSeconds, estimate.maxSeconds);
            const evidenceMode = this.describeRunEvidenceMode();
            this.cachedRunningStatusStatic = `Running now (${evidenceMode}). Rough ETA ${estimateLabel}.`;
            this.cachedRunningStatusQuestion = questionText;
        }

        const progressLabel = this.buildRunningProgressLabel(this.currentRunProgress);
        return [
            this.cachedRunningStatusStatic,
            progressLabel
        ].filter(Boolean).join(' ');
    }

    private formatElapsedRunClock(elapsedMs: number): string {
        const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    private reconcileRunningEstimate(progress: InquiryRunProgressEvent | null): void {
        if (!progress || this.currentRunElapsedMs <= 0) return;
        if (progress.phase === 'finalizing') {
            this.currentRunEstimatedMaxMs = Math.max(this.currentRunElapsedMs, 1000);
            return;
        }
        const completedPasses = Math.max(0, Math.min(progress.totalPasses, progress.currentPass - 1));
        if (completedPasses <= 0 || progress.totalPasses <= 0) return;
        const observedMsPerPass = this.currentRunElapsedMs / completedPasses;
        const remainingPasses = Math.max(1, progress.totalPasses - completedPasses);
        const projectedTotalMs = this.currentRunElapsedMs + (observedMsPerPass * remainingPasses);
        this.currentRunEstimatedMaxMs = Math.max(this.currentRunElapsedMs + 1000, Math.round(projectedTotalMs));
    }

    private getRunningBackboneProgressRatio(elapsedMs: number): number {
        const estimateMaxMs = Math.max(1000, this.currentRunEstimatedMaxMs || 0);
        const timeRatio = estimateMaxMs > 0 ? Math.min(1, Math.max(0, elapsedMs / estimateMaxMs)) : 0;
        const progress = this.currentRunProgress;
        if (!progress) return timeRatio;
        if (progress.phase === 'finalizing') return 1;
        const completedPassRatio = progress.totalPasses > 0
            ? Math.max(0, Math.min(1, (progress.currentPass - 1) / progress.totalPasses))
            : 0;
        return Math.max(timeRatio, completedPassRatio);
    }

    private updateRunningHudFrame(elapsedMs: number): void {
        if (!this.state.isRunning) return;
        this.currentRunElapsedMs = elapsedMs;
        // HUD text updates are now managed by a decoupled setInterval to prevent 60fps layout thrash
        this.minimap.setRunningBackboneProgress(this.getRunningBackboneProgressRatio(elapsedMs));
    }

    private updateRunningHud(): void {
        renderInquiryRunningHud({
            engineTimerLabel: this.engineTimerLabel,
            navSessionLabel: this.navSessionLabel,
            isRunning: this.state.isRunning,
            currentRunElapsedMs: this.currentRunElapsedMs,
            currentRunProgress: this.currentRunProgress,
            formatElapsedRunClock: this.formatElapsedRunClock.bind(this),
            buildRunningStageLabel: this.buildRunningStageLabel.bind(this),
            setTextIfChanged: (el, text) => this.setTextIfChanged(el, text, 'hudTextWrites'),
            toggleClassIfChanged: (el, cls, force) => this.toggleClassIfChanged(el, cls, force, 'hudAttrWrites')
        });
    }

    private describeRunEvidenceMode(): string {
        const stats = this.getPayloadStats();
        const summaryCount = stats.sceneSynopsisUsed + stats.bookOutlineSummaryCount + stats.sagaOutlineSummaryCount;
        const bodyCount = stats.sceneFullTextCount + stats.bookOutlineFullCount + stats.sagaOutlineFullCount;
        if (summaryCount > 0 && bodyCount === 0) return 'Summary evidence';
        if (bodyCount > 0 && summaryCount === 0) return 'Full Scene evidence';
        if (summaryCount > 0 && bodyCount > 0) return 'Mixed evidence';
        return 'Corpus evidence';
    }

    private async promptCancelInquiryRun(questionText: string): Promise<boolean> {
        const estimate = this.estimateRunDurationRange(questionText);
        const estimateLabel = this.formatRunDurationEstimate(estimate.minSeconds, estimate.maxSeconds);
        return await new Promise<boolean>(resolve => {
            const modal = new InquiryCancelRunModal(
                this.app,
                estimateLabel,
                confirmed => resolve(confirmed),
                () => {
                    if (this.activeCancelRunModal === modal) {
                        this.activeCancelRunModal = undefined;
                    }
                    this.refreshEstimateDisplays();
                    if (this.state.isRunning) {
                        this.updateRunProgress(this.currentRunProgress);
                    }
                }
            );
            this.activeCancelRunModal = modal;
            modal.open();
        });
    }

    private async handleRunningPreviewCancelClick(): Promise<void> {
        if (!this.state.isRunning) return;
        if (!this.activeInquiryRunToken) {
            this.notifyInteraction('Cancel is available for active single-question Inquiry runs.');
            return;
        }
        const questionText = this.previewLast?.question
            || this.getCurrentPromptQuestion()
            || '';
        const confirmed = await this.promptCancelInquiryRun(questionText);
        if (!confirmed) return;
        this.requestActiveInquiryCancellation();
    }

    private updatePromptPreview(
        zone: InquiryZone,
        mode: InquiryLens,
        question: string,
        rowsOverride?: string[],
        metaOverride?: string,
        layoutOptions?: { hideEmpty?: boolean }
    ): void {
        this.previewPanelHeight = renderInquiryPromptPreviewLayout({
            refs: {
                previewGroup: this.previewGroup,
                previewHero: this.previewHero,
                previewMeta: this.previewMeta,
                previewFooter: this.previewFooter,
                previewClickTarget: this.previewClickTarget,
                previewRows: this.previewRows,
                previewRunningNote: this.previewRunningNote,
                previewShimmerGroup: this.previewShimmerGroup,
                previewShimmerMask: this.previewShimmerMask,
                previewShimmerMaskRect: this.previewShimmerMaskRect,
                previewPanelHeight: this.previewPanelHeight
            },
            zone,
            mode,
            question,
            rows: rowsOverride ?? this.getPreviewPayloadRows(),
            metaOverride,
            hideEmpty: layoutOptions?.hideEmpty,
            isRunning: this.state.isRunning,
            minimapLayoutLength: this.minimap.layoutLength,
            setBalancedHeroText: this.setBalancedHeroText.bind(this),
            setWrappedSvgText: this.setWrappedSvgText.bind(this),
            onSvgClear: () => {
                this.perfCounters.svgClearCalls++;
            },
            onSvgNodeCreate: () => {
                this.perfCounters.svgNodeCreates++;
            }
        });
        this.updatePreviewShimmerLayout();
        if (this.previewShimmerGroup) {
            if (this.previewGroup?.classList.contains('is-locked')) {
                this.setPreviewShimmerEnabled(true);
                this.updatePreviewShimmerText();
            } else {
                this.setPreviewShimmerEnabled(false);
            }
        }
        this.syncTokensPillState();
        if (this.enginePanelEl && !this.enginePanelEl.classList.contains('ert-hidden')) {
            this.refreshEnginePanel();
        }
    }

    private showResultsPreview(result: InquiryResult): void {
        if (!this.previewGroup || !this.previewHero) return;
        if (this.isErrorResult(result)) return;
        this.hideSceneDossier(true);
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        const zone = result.questionZone ?? this.findPromptZoneById(result.questionId) ?? 'setup';
        const mode = this.state.mode;
        this.previewLocked = true;
        this.previewGroup.classList.add('is-visible', 'is-results');
        this.previewGroup.classList.remove('is-locked', 'is-error');
        this.setPreviewShimmerEnabled(false);
        this.setPreviewRunningNoteText('');
        const hero = this.buildResultsHeroText(result, mode);
        const meta = this.buildResultsMetaText(result, mode, zone);
        const emptyRows = Array(this.previewRows.length || 6).fill('');
        this.resetPreviewRowLabels();
        this.updatePromptPreview(zone, mode, hero, emptyRows, meta, { hideEmpty: true });
        const scopeTypeLabel = result.scope === 'saga' ? 'Saga' : 'Book';
        const resultScopeLabel = result.scopeLabel || this.getScopeLabel();
        this.setPreviewFooterText(`${scopeTypeLabel} ${resultScopeLabel} · Click to dismiss.`);
        this.updateResultsFooterPosition();
    }

    private buildResultsHeroText(result: InquiryResult, mode: InquiryLens): string {
        return this.getResultSummaryForMode(result, mode);
    }

    private buildResultsMetaText(result: InquiryResult, mode: InquiryLens, zone: InquiryZone): string {
        const zoneLabel = zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
        const selectionText = this.getResultSelectionMode(result) === 'focused' ? 'Focused' : 'Discover';
        const flowText = `Flow ${this.formatMetricDisplay(result.verdict.flow)}`;
        const depthText = `Depth ${this.formatMetricDisplay(result.verdict.depth)}`;
        const ordered = mode === 'flow' ? [flowText, depthText] : [depthText, flowText];
        return `${zoneLabel} · ${selectionText} · ${ordered.join(' · ')}`.toUpperCase();
    }

    private getResultItems(result: InquiryResult): InquiryCorpusItem[] {
        if (!this.corpus) return [];
        if (result.scope === 'book' && !this.corpus.bookResolved) return [];
        return result.scope === 'saga' ? this.corpus.books : this.corpus.scenes;
    }

    private resolveFindingChipLabel(
        finding: InquiryFinding,
        result: InquiryResult,
        items: InquiryCorpusItem[]
    ): string | null {
        const refId = finding.refId?.trim();
        if (!refId) return null;
        const refLower = refId.toLowerCase();

        const displayMatch = items.find(item => item.displayLabel.toLowerCase() === refLower);
        if (displayMatch) return displayMatch.displayLabel;

        const idMatch = items.find(item => item.id === refId || item.id.toLowerCase() === refLower);
        if (idMatch) return idMatch.displayLabel;

        const sceneIdMatch = items.find(item => typeof item.sceneId === 'string' && item.sceneId.toLowerCase() === refLower);
        if (sceneIdMatch) return sceneIdMatch.displayLabel;

        const pathMatch = items.find(item => item.filePaths?.some(path => path === refId));
        if (pathMatch) return pathMatch.displayLabel;

        const scopePrefix = result.scope === 'saga' ? 'B' : 'S';
        const pattern = new RegExp(`^${scopePrefix}\\d+$`, 'i');
        if (pattern.test(refId)) {
            return refId.toUpperCase();
        }

        return null;
    }

    private sanitizeInquirySummary(rawSummary?: string | null): string {
        const fallback = 'Summary unavailable.';
        if (!rawSummary) return fallback;
        let text = stripInquiryReferenceArtifacts(rawSummary).replace(/\s+/g, ' ').trim();
        if (!text) return fallback;
        const prefixes: RegExp[] = [
            /^(summary(?: of)?|executive summary)\s*/i,
            /^(here(?:'s| is) (?:a )?(?:summary|overview)(?: of)?)\s*/i,
            /^(a (?:summary|overview) of)\s*/i,
            /^(in summary|overall|in conclusion|to summarize|to sum up|in short|in brief|in essence|in overview)\s*/i,
            /^(this (?:inquiry|analysis|assessment|report|result)s?)(?:\s+(?:suggests|shows|indicates|points|implies|reveals|finds|highlights|notes))?(?:\s+that)?\s*/i,
            /^(the (?:inquiry|analysis|assessment|results?) (?:suggests|shows|indicates|points|implies|reveals|finds|highlights|notes))(?:\s+that)?\s*/i,
            /^(based on (?:the|this) (?:inquiry|analysis|assessment|results?))\s*/i,
            /^(it (?:appears|seems|looks))(?:\s+that)?\s*/i
        ];

        let changed = true;
        while (changed) {
            changed = false;
            for (const prefix of prefixes) {
                const next = text.replace(prefix, '').trim();
                if (next !== text) {
                    text = next.replace(/^[^\w\s]+/, '').trim();
                    changed = true;
                    break;
                }
            }
        }

        return text || fallback;
    }

    private getResultSummaryForMode(result: InquiryResult, mode: InquiryLens): string {
        const raw = mode === 'flow'
            ? (result.summaryFlow || result.summary)
            : (result.summaryDepth || result.summary);
        return this.sanitizeInquirySummary(raw);
    }

    private getOrderedFindings(result: InquiryResult, mode: InquiryLens): InquiryFinding[] {
        const findings = result.findings.filter(finding => this.isFindingHit(finding));
        const order = mode === 'flow' ? FLOW_FINDING_ORDER : DEPTH_FINDING_ORDER;
        const rankForRole = (role: InquiryFinding['role'] | undefined): number => role === 'target' ? 0 : 1;
        const rankForLens = (lens: InquiryFinding['lens'] | undefined): number => {
            if (!lens) return 2;
            if (lens === 'both') return 1;
            return lens === mode ? 0 : 3;
        };
        const rankForKind = (kind: InquiryFinding['kind']): number => {
            const idx = order.indexOf(kind);
            return idx >= 0 ? idx : order.length + 1;
        };
        return findings.slice().sort((a, b) => {
            const roleDelta = rankForRole(a.role) - rankForRole(b.role);
            if (roleDelta !== 0) return roleDelta;
            const lensDelta = rankForLens(a.lens) - rankForLens(b.lens);
            if (lensDelta !== 0) return lensDelta;
            const kindDelta = rankForKind(a.kind) - rankForKind(b.kind);
            if (kindDelta !== 0) return kindDelta;
            const impactDelta = this.getImpactRank(b.impact) - this.getImpactRank(a.impact);
            if (impactDelta !== 0) return impactDelta;
            const confidenceDelta = this.getConfidenceRank(b.assessmentConfidence) - this.getConfidenceRank(a.assessmentConfidence);
            if (confidenceDelta !== 0) return confidenceDelta;
            return normalizeInquiryHeadline(a.headline).localeCompare(normalizeInquiryHeadline(b.headline));
        });
    }

    private getFindingRole(finding: InquiryFinding): FindingRole {
        return finding.role === 'target' ? 'target' : 'context';
    }

    private updateFindingsPanel(): void {
        if (!this.findingsTitleEl || !this.summaryEl || !this.verdictEl || !this.findingsListEl) return;
        const findingsListEl = this.findingsListEl;
        clearSvgChildren(this.findingsListEl);

        const result = this.state.activeResult;
        if (!result) {
            const activeTargetCount = this.getActiveTargetSceneIds().length;
            const storedTargetCount = this.state.targetSceneIds.length;
            const focusedCount = this.state.scope === 'book' ? activeTargetCount : storedTargetCount;
            const targetCountLabel = focusedCount === 1 ? '1 Target Scene' : `${focusedCount} Target Scenes`;
            this.findingsTitleEl.textContent = focusedCount > 0 ? `Findings · ${targetCountLabel}` : 'Findings';
            this.findingsTitleEl.classList.remove('is-role-validation-warning');
            this.summaryEl.classList.remove('is-role-validation-warning');
            this.verdictEl.classList.remove('is-role-validation-warning');
            this.summaryEl.textContent = 'No inquiry run yet.';
            this.verdictEl.textContent = this.state.scope === 'saga' && storedTargetCount > 0
                ? `${targetCountLabel} saved for Book scope. Switch to Book to use focused inquiry.`
                : 'Run an inquiry to see verdicts.';
            return;
        }

        const selectionMode = this.getResultSelectionMode(result);
        const roleValidation = this.getResultRoleValidation(result);
        const persistedTargetSceneIds = this.getPersistedResultTargetSceneIds(result);
        const focusedCount = persistedTargetSceneIds.length;
        const targetCountLabel = focusedCount === 1 ? '1 Target Scene' : `${focusedCount} Target Scenes`;
        this.findingsTitleEl.textContent = selectionMode === 'focused'
            ? `Findings · ${targetCountLabel}`
            : 'Findings';
        this.findingsTitleEl.classList.toggle('is-role-validation-warning', roleValidation === 'missing-target-roles');
        this.summaryEl.classList.toggle('is-role-validation-warning', roleValidation === 'missing-target-roles');
        this.verdictEl.classList.toggle('is-role-validation-warning', roleValidation === 'missing-target-roles');

        const orderedFindings = this.getOrderedFindings(result, result.mode || this.state.mode);
        const targetFindings = orderedFindings.filter(finding => this.getFindingRole(finding) === 'target');
        const contextFindings = orderedFindings.filter(finding => this.getFindingRole(finding) === 'context');

        this.summaryEl.textContent = this.getResultSummaryForMode(result, result.mode || this.state.mode);
        const selectionText = selectionMode === 'focused'
            ? `Selection Mode · Focused · ${targetFindings.length} target · ${contextFindings.length} context`
            : 'Selection Mode · Discover';
        const validationNote = roleValidation === 'missing-target-roles'
            ? ' · Warning: Focused run returned no target-specific findings.'
            : '';
        const scopeNote = this.state.scope === 'saga' && this.state.targetSceneIds.length > 0
            ? ' · Target Scenes are book-only and inactive in Saga scope.'
            : '';
        this.verdictEl.textContent = `${selectionText}${validationNote}${scopeNote}`;

        let cursorY = 0;
        const renderSection = (title: string, findings: InquiryFinding[]) => {
            createSvgText(findingsListEl, 'ert-inquiry-finding-section', title, 0, cursorY);
            cursorY += 18;
            if (!findings.length) {
                createSvgText(findingsListEl, 'ert-inquiry-finding-meta', 'None.', 0, cursorY);
                cursorY += 18;
                return;
            }
            findings.forEach(finding => {
                const role = this.getFindingRole(finding);
                const roleLabel = role === 'target' ? '[Target]' : '[Context]';
                createSvgText(
                    findingsListEl,
                    `ert-inquiry-finding-head is-role-${role}`,
                    `${roleLabel} ${normalizeInquiryHeadline(finding.headline)}`,
                    0,
                    cursorY
                );
                cursorY += 16;
                const lensLabel = finding.lens === 'both'
                    ? 'Flow / Depth'
                    : formatBriefLabel(finding.lens || result.mode || 'flow');
                createSvgText(
                    findingsListEl,
                    'ert-inquiry-finding-meta',
                    `Impact ${formatBriefLabel(finding.impact)} · Confidence ${formatBriefLabel(finding.assessmentConfidence)} · Lens ${lensLabel}`,
                    0,
                    cursorY
                );
                cursorY += 14;
                (finding.bullets || []).filter(Boolean).slice(0, 2).forEach(bullet => {
                    createSvgText(findingsListEl, 'ert-inquiry-finding-bullet', `• ${bullet}`, 12, cursorY);
                    cursorY += 14;
                });
                cursorY += 8;
            });
        };

        renderSection('Target Findings', targetFindings);
        renderSection('Context Findings', contextFindings);
    }

    private getConfidenceRank(confidence: InquiryConfidence): number {
        if (confidence === 'high') return 3;
        if (confidence === 'medium') return 2;
        return 1;
    }

    private truncatePreviewValue(value: string, maxChars: number): string {
        const trimmed = value.trim();
        if (trimmed.length <= maxChars) return trimmed;
        return `${trimmed.slice(0, Math.max(0, maxChars - 3)).trim()}...`;
    }

    private setBalancedHeroText(
        textEl: SVGTextElement,
        text: string,
        maxWidth: number,
        lineHeight: number,
        maxLines = 2
    ): number {
        const cacheKey = `${text}|${maxWidth}|${lineHeight}`;
        if (textEl.getAttribute('data-rt-hero-cache') === cacheKey) {
            return Number(textEl.getAttribute('data-rt-hero-lines')) || 1;
        }
        
        // Wipe existing content for measuring pass.
        // Invalidate the wrapped-text cache since measurement destroys tspans —
        // without this, a subsequent setWrappedSvgText fallback would hit a stale
        // cache and return without re-creating the DOM, leaving only the last
        // measurement string visible (the "ghost fragment" bug).
        this.perfCounters.svgClearCalls++;
        clearSvgChildren(textEl);
        textEl.removeAttribute('data-rt-wrap-cache');
        
        const words = text.split(/\s+/).filter(Boolean);
        if (!words.length) return 0;
        const fullLine = words.join(' ');
        textEl.textContent = fullLine;
        const fullWidth = textEl.getComputedTextLength();
        if (fullWidth <= maxWidth) {
            textEl.setAttribute('data-rt-hero-cache', cacheKey);
            textEl.setAttribute('data-rt-hero-lines', '1');
            return 1;
        }
        if (maxLines <= 1) {
            return this.setWrappedSvgText(textEl, text, maxWidth, 1, lineHeight);
        }

        const minWordsPerLine = 3;
        let bestIndex = -1;
        let bestScore = Number.POSITIVE_INFINITY;
        let bestWidths: { width1: number; width2: number } | null = null;
        for (let i = minWordsPerLine; i <= words.length - minWordsPerLine; i += 1) {
            const line1 = words.slice(0, i).join(' ');
            const line2 = words.slice(i).join(' ');
            textEl.textContent = line1;
            const width1 = textEl.getComputedTextLength();
            textEl.textContent = line2;
            const width2 = textEl.getComputedTextLength();
            const overflow = Math.max(0, width1 - maxWidth) + Math.max(0, width2 - maxWidth);
            const score = Math.abs(width1 - width2) + (overflow * 3);
            if (score < bestScore) {
                bestScore = score;
                bestIndex = i;
                bestWidths = { width1, width2 };
            }
        }

        if (bestIndex < 0 || !bestWidths) {
            return this.setWrappedSvgText(textEl, text, maxWidth, maxLines, lineHeight);
        }

        if (bestWidths.width1 > maxWidth || bestWidths.width2 > maxWidth) {
            return this.setWrappedSvgText(textEl, text, maxWidth, maxLines, lineHeight);
        }

        // Final layout achieved - attach the fixed lines via tspans
        this.perfCounters.svgClearCalls++;
        clearSvgChildren(textEl);
        const x = textEl.getAttribute('x') ?? '0';
        const appendTspan = (content: string, isFirst: boolean): SVGTSpanElement => {
            this.perfCounters.svgNodeCreates++;
            const tspan = createSvgElement('tspan');
            tspan.setAttribute('x', x);
            tspan.setAttribute('dy', isFirst ? '0' : String(lineHeight));
            tspan.textContent = content;
            textEl.appendChild(tspan);
            return tspan;
        };

        const line1Out = words.slice(0, bestIndex).join(' ');
        const line2Out = words.slice(bestIndex).join(' ');
        appendTspan(line1Out, true);
        appendTspan(line2Out, false);
        
        textEl.setAttribute('data-rt-hero-cache', cacheKey);
        textEl.setAttribute('data-rt-hero-lines', '2');
        return 2;
    }

    private ensurePreviewShimmerResources(panel: SVGGElement): void {
        if (this.previewShimmerMask) return;

        // Gradient for the shimmer band
        // Gradients usually live in defs, which is fine. CSS addressing of the rect using the url(#grad) doesn't require the gradient to be in the same scope, just available.
        if (this.svgDefs && !this.svgDefs.querySelector('#ert-inquiry-preview-shimmer-grad')) {
            const gradient = createSvgElement('linearGradient');
            gradient.setAttribute('id', 'ert-inquiry-preview-shimmer-grad');
            gradient.setAttribute('x1', '0%');
            gradient.setAttribute('y1', '0%');
            gradient.setAttribute('x2', '100%');
            gradient.setAttribute('y2', '0%');
            const stops = [
                { offset: '0%', opacity: '0' },
                { offset: '10%', opacity: '0.08' },
                { offset: '25%', opacity: '0.4' },
                { offset: '50%', opacity: '1' },
                { offset: '75%', opacity: '0.4' },
                { offset: '90%', opacity: '0.08' },
                { offset: '100%', opacity: '0' }
            ];
            stops.forEach(stopDef => {
                const stop = createSvgElement('stop');
                stop.setAttribute('offset', stopDef.offset);
                stop.setAttribute('stop-color', '#fff'); // White mask = reveal
                stop.setAttribute('stop-opacity', stopDef.opacity);
                gradient.appendChild(stop);
            });
            this.svgDefs.appendChild(gradient);
        }

        // Mask that contains the moving/animating rect
        const mask = createSvgElement('mask');
        mask.setAttribute('id', 'ert-inquiry-preview-shimmer-mask');
        mask.setAttribute('maskUnits', 'userSpaceOnUse');

        // The moving band
        const band = createSvgElement('rect');
        band.classList.add('ert-inquiry-preview-shimmer-band'); // New class for the band
        band.setAttribute('fill', 'url(#ert-inquiry-preview-shimmer-grad)');
        // Initial values, will be updated by layout
        band.setAttribute('x', '0');
        band.setAttribute('y', '0');
        band.setAttribute('width', '100');
        band.setAttribute('height', '100');

        mask.appendChild(band);
        this.previewShimmerMask = mask;
        this.previewShimmerMaskRect = band;
        // Append mask to panel so its children can be targeted by CSS selectors scoped to the panel
        panel.appendChild(mask);
    }

    private updatePreviewShimmerText(): void {
        updateInquiryPreviewShimmerText({
            previewShimmerGroup: this.previewShimmerGroup,
            previewHero: this.previewHero
        });
    }

    private updatePreviewShimmerLayout(): void {
        updateInquiryPreviewShimmerLayout({
            refs: {
                previewGroup: this.previewGroup,
                previewHero: this.previewHero,
                previewMeta: this.previewMeta,
                previewFooter: this.previewFooter,
                previewClickTarget: this.previewClickTarget,
                previewRows: this.previewRows,
                previewRunningNote: this.previewRunningNote,
                previewShimmerGroup: this.previewShimmerGroup,
                previewShimmerMask: this.previewShimmerMask,
                previewShimmerMaskRect: this.previewShimmerMaskRect,
                previewPanelHeight: this.previewPanelHeight
            },
            isRunning: this.state.isRunning
        });
    }

    private updateResultsFooterPosition(targetY?: number): void {
        const panelY = targetY ?? this.minimap.getPreviewPanelTargetY();
        if (!Number.isFinite(panelY)) return;
        updateInquiryResultsFooterPosition({
            refs: {
                previewGroup: this.previewGroup,
                previewHero: this.previewHero,
                previewMeta: this.previewMeta,
                previewFooter: this.previewFooter,
                previewClickTarget: this.previewClickTarget,
                previewRows: this.previewRows,
                previewRunningNote: this.previewRunningNote,
                previewShimmerGroup: this.previewShimmerGroup,
                previewShimmerMask: this.previewShimmerMask,
                previewShimmerMaskRect: this.previewShimmerMaskRect,
                previewPanelHeight: this.previewPanelHeight
            },
            isRunning: this.state.isRunning,
            panelY,
            backboneBottom: this.minimap.backboneBottomEdge
        });
    }

    private updatePreviewClickTargetLayout(): void {
        updateInquiryPreviewClickTargetLayout({
            refs: {
                previewGroup: this.previewGroup,
                previewHero: this.previewHero,
                previewMeta: this.previewMeta,
                previewFooter: this.previewFooter,
                previewClickTarget: this.previewClickTarget,
                previewRows: this.previewRows,
                previewRunningNote: this.previewRunningNote,
                previewShimmerGroup: this.previewShimmerGroup,
                previewShimmerMask: this.previewShimmerMask,
                previewShimmerMaskRect: this.previewShimmerMaskRect,
                previewPanelHeight: this.previewPanelHeight
            },
            isRunning: this.state.isRunning
        });
    }

    private lockPromptPreview(question: InquiryQuestion, questionText: string): void {
        if (!this.previewGroup) return;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        const rows = this.getPreviewPayloadRows();
        this.previewLocked = true;
        this.previewGroup.classList.add('is-visible', 'is-locked');
        this.previewGroup.classList.remove('is-results');
        this.previewGroup.classList.remove('is-error');
        this.setPreviewShimmerEnabled(true);
        this.setPreviewRunningNoteText(this.buildRunningStatusNote(questionText));
        this.setPreviewFooterText('');
        this.resetPreviewRowLabels();
        this.updatePromptPreview(question.zone, this.state.mode, questionText, rows, undefined, { hideEmpty: true });
        this.lastReadinessUiState = this.buildReadinessUiState();
        this.updateMinimapPressureGauge();
    }

    private unlockPromptPreview(): void {
        this.previewLocked = false;
        this.currentRunProgress = null;
        if (this.previewHideTimer) {
            window.clearTimeout(this.previewHideTimer);
            this.previewHideTimer = undefined;
        }
        if (this.previewGroup) {
            this.previewGroup.classList.remove('is-locked', 'is-visible', 'is-results');
            this.previewGroup.classList.remove('is-error');
        }
        this.resetPreviewRowLabels();
        this.setPreviewShimmerEnabled(false);
        this.setPreviewRunningNoteText('');
        this.setPreviewFooterText('');
        this.lastReadinessUiState = undefined;
        this.updateMinimapPressureGauge();
    }

    private syncTokensPillState(): void {
        if (!this.previewRows.length) return;
        this.previewRows.forEach(row => {
            row.group.classList.remove('is-token-amber', 'is-token-red');
            row.group.removeAttribute('data-rt-tip');
            row.group.removeAttribute('data-rt-tip-placement');
        });
        if (this.previewGroup?.classList.contains('is-results')) return;
        const tokensRow = this.previewRows.find(row => row.group.classList.contains('is-tokens-slot'));
        if (!tokensRow) return;
    }

    private setWrappedSvgText(
        textEl: SVGTextElement,
        text: string,
        maxWidth: number,
        maxLines: number,
        lineHeight: number
    ): number {
        const cacheKey = `${text}|${maxWidth}|${maxLines}|${lineHeight}`;
        if (textEl.getAttribute('data-rt-wrap-cache') === cacheKey) {
            return Number(textEl.getAttribute('data-rt-wrap-lines')) || 1;
        }

        // Invalidate sibling cache — setBalancedHeroText may have left a stale
        // hero-cache attribute from a previous render path.
        textEl.removeAttribute('data-rt-hero-cache');

        Array.from(textEl.childNodes).forEach(node => {
            if (node.nodeName !== 'tspan') {
                this.perfCounters.svgClearCalls++;
                textEl.removeChild(node);
            }
        });

        const words = text.split(/\s+/).filter(Boolean);
        const x = textEl.getAttribute('x') ?? '0';
        const existingTspans = Array.from(textEl.childNodes).filter(n => n.nodeName === 'tspan') as SVGTSpanElement[];
        let tspanCount = 0;

        const getNextTspan = (isFirst: boolean): SVGTSpanElement => {
            let tspan: SVGTSpanElement;
            if (tspanCount < existingTspans.length) {
                this.perfCounters.svgNodeReuses++;
                tspan = existingTspans[tspanCount];
            } else {
                this.perfCounters.svgNodeCreates++;
                tspan = createSvgElement('tspan');
                textEl.appendChild(tspan);
            }
            tspan.setAttribute('x', x);
            tspan.setAttribute('dy', isFirst ? '0' : String(lineHeight));
            tspanCount++;
            return tspan;
        };

        const balancedLines = maxLines > 1
            ? this.computeBalancedSvgLines(textEl, text, maxWidth, { maxLines })
            : [];
        if (balancedLines.length > 0 && balancedLines.length <= maxLines) {
            balancedLines.forEach((lineText, index) => {
                const nextTspan = getNextTspan(index === 0);
                nextTspan.textContent = lineText;
            });

            while (textEl.childNodes.length > tspanCount) {
                if (textEl.lastChild) {
                    this.perfCounters.svgClearCalls++;
                    textEl.removeChild(textEl.lastChild);
                }
            }

            const exactLines = Math.max(balancedLines.length, 1);
            textEl.setAttribute('data-rt-wrap-cache', cacheKey);
            textEl.setAttribute('data-rt-wrap-lines', String(exactLines));
            return exactLines;
        }

        let line = '';
        let lineIndex = 0;
        let tspan = getNextTspan(true);
        let truncated = false;

        for (const word of words) {
            const testLine = line ? `${line} ${word}` : word;
            this.perfCounters.svgTextWrites++;
            tspan.textContent = testLine;
            if (tspan.getComputedTextLength() > maxWidth && line) {
                tspan.textContent = line;
                lineIndex += 1;
                if (lineIndex >= maxLines) {
                    truncated = true;
                    break;
                }
                line = word;
                tspan = getNextTspan(false);
            } else {
                line = testLine;
            }
        }

        if (!truncated) {
            tspan.textContent = line;
        } else {
            tspan.textContent = line;
            this.applyEllipsis(tspan, maxWidth);
        }

        // Clean up unused pooled tspans to prevent ghosting
        while (textEl.childNodes.length > tspanCount) {
            if (textEl.lastChild) {
                this.perfCounters.svgClearCalls++;
                textEl.removeChild(textEl.lastChild);
            }
        }

        Array.from(textEl.childNodes).forEach(node => {
            if (node.nodeName !== 'tspan') {
                this.perfCounters.svgClearCalls++;
                textEl.removeChild(node);
            }
        });

        const exactLines = Math.max(truncated ? maxLines : lineIndex + 1, 1);
        textEl.setAttribute('data-rt-wrap-cache', cacheKey);
        textEl.setAttribute('data-rt-wrap-lines', String(exactLines));
        return exactLines;
    }

    private applyEllipsis(tspan: SVGTSpanElement, maxWidth: number): void {
        let content = tspan.textContent ?? '';
        if (!content.length) return;
        let next = `${content}…`;
        tspan.textContent = next;
        while (tspan.getComputedTextLength() > maxWidth && content.length > 1) {
            content = content.slice(0, -1).trimEnd();
            next = `${content}…`;
            tspan.textContent = next;
        }
    }

    private refreshPayloadStats(): void {
        this.payloadStats = this.buildPayloadStats();
        if (this.corpusWarningActive) {
            const stats = this.payloadStats;
            const total = stats.sceneTotal
                + stats.bookOutlineCount
                + stats.sagaOutlineCount
                + stats.referenceCounts.total;
            if (total > 0) {
                this.corpusWarningActive = false;
            }
        }
        if (!this.previewLocked
            && this.previewGroup?.classList.contains('is-visible')
            && this.previewLast) {
            this.updatePromptPreview(
                this.previewLast.zone,
                this.state.mode,
                this.previewLast.question,
                undefined,
                undefined,
                { hideEmpty: true }
            );
        }
    }

    private schedulePayloadStatsRefresh(): void {
        if (this.payloadStatsRefreshTimer !== undefined) return;
        this.payloadStatsRefreshTimer = window.setTimeout(() => {
            this.payloadStatsRefreshTimer = undefined;
            this.payloadStats = undefined;
            this._currentCorpusContext = null;
            this.refreshPayloadStats();
            this.refreshEstimateDisplays();
            void this.requestEstimateSnapshot();
        }, 0);
    }

    private getPayloadStats(): InquiryPayloadStats {
        const activeBookId = this.state.activeBookId ?? this.corpus?.books?.[0]?.id;
        if (!this.payloadStats
            || this.payloadStats.scope !== this.state.scope
            || this.payloadStats.activeBookId !== activeBookId) {
            this.payloadStats = this.buildPayloadStats();
        }
        return this.payloadStats;
    }

    private buildPayloadStats(): InquiryPayloadStats {
        const manifest = this.buildCorpusManifest('payload-preview', {
            questionZone: this.previewLast?.zone
        });
        return this.buildPayloadStatsFromEntries(manifest.entries, manifest.resolvedRoots, manifest.fingerprint, true);
    }

    private buildPayloadStatsFromEntries(
        entries: CorpusManifestEntry[],
        resolvedRoots: string[],
        manifestFingerprint: string,
        preservePriorEvidenceChars: boolean
    ): InquiryPayloadStats {
        const scope = this.state.scope;
        const activeBookId = this.getCanonicalActiveBookId();
        const sceneEntries = entries.filter(entry => entry.class === 'scene');
        const outlineEntries = entries.filter(entry => entry.class === 'outline');
        const referenceEntries = entries.filter(entry => entry.class !== 'scene' && entry.class !== 'outline');

        const bookOutlineEntries = outlineEntries
            .filter(entry => entry.scope !== 'saga');
        const sagaOutlineEntries = scope === 'saga'
            ? outlineEntries.filter(entry => entry.scope === 'saga')
            : [];

        const sceneStats = this.collectSceneStats(sceneEntries);
        const bookOutlineStats = this.collectEntryStats(bookOutlineEntries);
        const sagaOutlineStats = this.collectEntryStats(sagaOutlineEntries);
        const referenceStats = this.collectReferenceStats(referenceEntries);

        const estimatedEvidenceChars = sceneStats.chars + bookOutlineStats.chars + sagaOutlineStats.chars + referenceStats.chars;
        const priorStats = preservePriorEvidenceChars
            && this.payloadStats
            && this.payloadStats.manifestFingerprint === manifestFingerprint
            && this.payloadStats.scope === scope
            && this.payloadStats.activeBookId === activeBookId
            ? this.payloadStats
            : undefined;
        const evidenceChars = priorStats?.evidenceChars ?? estimatedEvidenceChars;

        return {
            scope,
            activeBookId,
            sceneTotal: sceneStats.total,
            sceneSynopsisUsed: sceneStats.synopsisUsed,
            sceneSynopsisAvailable: sceneStats.synopsisAvailable,
            sceneFullTextCount: sceneStats.fullCount,
            sceneChars: sceneStats.chars,
            bookOutlineCount: bookOutlineStats.count,
            bookOutlineSummaryCount: bookOutlineStats.summaryCount,
            bookOutlineFullCount: bookOutlineStats.fullCount,
            sagaOutlineCount: sagaOutlineStats.count,
            sagaOutlineSummaryCount: sagaOutlineStats.summaryCount,
            sagaOutlineFullCount: sagaOutlineStats.fullCount,
            outlineChars: bookOutlineStats.chars + sagaOutlineStats.chars,
            referenceCounts: referenceStats.counts,
            referenceByClass: referenceStats.byClass,
            referenceChars: referenceStats.chars,
            evidenceChars,
            resolvedRoots,
            manifestFingerprint
        };
    }

    private collectSceneStats(entries: CorpusManifestEntry[]): {
        total: number;
        synopsisUsed: number;
        synopsisAvailable: number;
        fullCount: number;
        chars: number;
    } {
        let synopsisUsed = 0;
        let synopsisAvailable = 0;
        let fullCount = 0;
        let chars = 0;
        entries.forEach(entry => {
            const summary = this.getEntrySummary(entry.path);
            if (summary) {
                synopsisAvailable += 1;
            }
            const mode = this.normalizeEvidenceMode(entry.mode);
            if (mode === 'summary') {
                if (!summary) return;
                synopsisUsed += 1;
                chars += summary.length;
                return;
            }
            if (mode === 'full') {
                fullCount += 1;
                chars += this.getEntryCharCount(entry.path);
            }
        });
        return {
            total: entries.length,
            synopsisUsed,
            synopsisAvailable,
            fullCount,
            chars
        };
    }

    private collectEntryStats(entries: CorpusManifestEntry[]): {
        count: number;
        summaryCount: number;
        fullCount: number;
        chars: number;
    } {
        let summaryCount = 0;
        let fullCount = 0;
        let chars = 0;
        entries.forEach(entry => {
            const mode = this.normalizeEvidenceMode(entry.mode);
            if (mode === 'summary') {
                const summary = this.getEntrySummary(entry.path);
                if (!summary) return;
                summaryCount += 1;
                chars += summary.length;
                return;
            }
            if (mode === 'full') {
                fullCount += 1;
                chars += this.getEntryCharCount(entry.path);
            }
        });
        return {
            count: summaryCount + fullCount,
            summaryCount,
            fullCount,
            chars
        };
    }

    private collectReferenceStats(entries: CorpusManifestEntry[]): {
        counts: { character: number; place: number; power: number; other: number; total: number };
        byClass: Record<string, number>;
        chars: number;
    } {
        const byClass: Record<string, number> = {};
        let chars = 0;
        entries.forEach(entry => {
            if (!this.hasEntryEvidence(entry)) return;
            chars += this.getEntryContentLength(entry);
            byClass[entry.class] = (byClass[entry.class] || 0) + 1;
        });
        const character = byClass['character'] ?? 0;
        const place = byClass['place'] ?? 0;
        const power = byClass['power'] ?? 0;
        const total = Object.values(byClass).reduce((sum, value) => sum + value, 0);
        const other = Math.max(0, total - character - place - power);
        return { counts: { character, place, power, other, total }, byClass, chars };
    }

    private getEntryCharCount(path: string): number {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !this.isTFile(file)) return 0;
        const mtime = file.stat.mtime ?? 0;
        const cached = this.entryBodyCharCache.get(path);
        if (cached && cached.mtime === mtime) {
            return cached.chars;
        }
        this.ensureEntryBodyCharCount(file, mtime);
        return 0;
    }

    private getEntrySummary(path: string): string {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (!file || !this.isTFile(file)) return '';
        const frontmatter = this.getNormalizedFrontmatter(file);
        if (!frontmatter) return '';
        return this.extractSummary(frontmatter);
    }

    private getEntryContentLength(entry: CorpusManifestEntry): number {
        const mode = this.normalizeEvidenceMode(entry.mode);
        if (mode === 'summary') {
            const summary = this.getEntrySummary(entry.path);
            return summary.length;
        }
        if (mode === 'full') {
            return this.getEntryCharCount(entry.path);
        }
        return 0;
    }

    private hasEntryEvidence(entry: CorpusManifestEntry): boolean {
        const mode = this.normalizeEvidenceMode(entry.mode);
        if (mode === 'summary') {
            return this.getEntrySummary(entry.path).length > 0;
        }
        if (mode === 'full') {
            const file = this.app.vault.getAbstractFileByPath(entry.path);
            return !!file && this.isTFile(file);
        }
        return false;
    }

    private ensureEntryBodyCharCount(file: TFile, mtime: number): void {
        if (this.entryBodyCharLoads.has(file.path)) return;
        const load = (async () => {
            try {
                const raw = await this.app.vault.cachedRead(file);
                const chars = cleanEvidenceBody(raw).length;
                const currentMtime = file.stat.mtime ?? mtime;
                const previous = this.entryBodyCharCache.get(file.path);
                this.entryBodyCharCache.set(file.path, { mtime: currentMtime, chars });
                if (!previous || previous.mtime !== currentMtime || previous.chars !== chars) {
                    this.schedulePayloadStatsRefresh();
                }
            } catch {
                this.entryBodyCharCache.delete(file.path);
            } finally {
                this.entryBodyCharLoads.delete(file.path);
            }
        })();
        this.entryBodyCharLoads.set(file.path, load);
    }

    private getNormalizedFrontmatter(file: TFile): Record<string, unknown> | null {
        const cache = this.app.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return null;
        return normalizeFrontmatterKeys(frontmatter, this.plugin.settings.frontmatterMappings);
    }

    /**
     * Extract extended Summary from frontmatter for Inquiry context.
     * Reads exclusively from frontmatter["Summary"]. Synopsis is never used.
     */
    private extractSummary(frontmatter: Record<string, unknown>): string {
        const raw = frontmatter['Summary'];
        if (Array.isArray(raw)) {
            return raw.map(value => String(value)).join('\n').trim();
        }
        if (typeof raw === 'string') return raw.trim();
        if (raw === null || raw === undefined) return '';
        return String(raw).trim();
    }

    private getPreviewPayloadRows(): string[] {
        return [
            this.getPreviewScopeValue(),
            this.getPreviewScenesValue(),
            this.getPreviewOutlinesValue(),
            this.getPreviewModelValue(),
            this.getPreviewTokensValue(),
            this.getPreviewCostValue()
        ];
    }

    private getPreviewScopeValue(): string {
        if (this.state.scope === 'saga') return `${SIGMA_CHAR} Saga`;
        return `Book ${this.getScopeLabel()}`;
    }

    private getPreviewScenesValue(): string {
        const stats = this.getPayloadStats();
        if (stats.sceneFullTextCount > 0) {
            return `Scenes · ${stats.sceneFullTextCount} (Full Scene)`;
        }
        if (stats.sceneSynopsisUsed > 0) {
            return `Scenes · ${stats.sceneSynopsisUsed} (Summary)`;
        }
        return '';
    }

    private getPreviewOutlinesValue(): string {
        const stats = this.getPayloadStats();
        const summaryCount = stats.bookOutlineSummaryCount + stats.sagaOutlineSummaryCount;
        const fullCount = stats.bookOutlineFullCount + stats.sagaOutlineFullCount;
        if (fullCount > 0) {
            return `Outline · ${fullCount} (Full)`;
        }
        if (summaryCount > 0) {
            return `Outline · ${summaryCount} (Summary)`;
        }
        return '';
    }

    private getPreviewModelValue(): string {
        return `Model · ${this.getResolvedEngine().modelLabel}`;
    }

    private getPreviewTokensValue(): string {
        const estimate = this.getRTCorpusEstimate();
        if (estimate.estimatedTokens <= 0) return 'Inquiry Corpus · Estimating…';
        return `Inquiry Corpus · ~${this.formatTokenEstimate(estimate.estimatedTokens)}`;
    }

    private getPreviewCostValue(): string {
        const snapshot = this.plugin.getInquiryEstimateService().getSnapshot();
        const engine = this.getResolvedEngine();
        if (engine.blocked || !snapshot) {
            return 'Cost · Estimating…';
        }
        try {
            const cost = estimateCorpusCost(
                engine.provider,
                engine.modelId,
                snapshot.estimate.estimatedInputTokens,
                snapshot.estimate.maxOutputTokens,
                snapshot.estimate.expectedPassCount
            );
            const freshLabel = formatApproxUsdCost(cost.freshCostUSD);
            const cachedLabel = formatApproxUsdCost(cost.cachedCostUSD);
            const corpusWasRun = snapshot.corpus.corpusFingerprint === this.state.corpusFingerprint;
            return corpusWasRun
                ? `Cost · ${freshLabel} / ${cachedLabel} cached`
                : `Cost · ${freshLabel}`;
        } catch {
            return 'Cost · Estimate unavailable';
        }
    }


    private getTokenTier(inputTokens: number): TokenTier {
        return getTokenTierPure(inputTokens);
    }

    private getTokenTierFromSnapshot(): TokenTier {
        return getTokenTierFromSnapshotPure(this.plugin.getInquiryEstimateService().getSnapshot());
    }

    private estimateTokensFromChars(chars: number): number {
        return estimateTokensFromCharsHeuristic(chars, DEFAULT_CHARS_PER_TOKEN);
    }

    private formatTokenEstimate(value: number): string {
        return formatTokenEstimatePure(value);
    }

    private formatApproxCorpusTokens(value: number): string {
        return `~${this.formatTokenEstimate(value)}`;
    }

    private toggleDetails(): void {
        if (!this.detailsEl || !this.detailsToggle) return;
        const isOpen = !this.detailsEl.classList.contains('ert-hidden');
        this.detailsEl.classList.toggle('ert-hidden', isOpen);
        this.setIconUse(this.detailsIcon, isOpen ? 'chevron-down' : 'chevron-up');
    }

    private toggleHelpTips(): void {
        this.helpTipsEnabled = !this.helpTipsEnabled;
        this.applyHelpTips();
    }

    private applyHelpTips(): void {
        if (this.helpToggleButton) {
            this.helpToggleButton.classList.toggle('is-active', this.helpTipsEnabled);
            this.helpToggleButton.setAttribute('aria-pressed', this.helpTipsEnabled ? 'true' : 'false');
        }
        this.syncHelpTooltips();
    }

    private syncHelpTooltips(): void {
        const targets = this.getHelpTooltipTargets();
        targets.forEach(({ element, text, placement }) => {
            if (!element) return;
            const balancedText = balanceTooltipText(text);
            if (this.helpTipsEnabled) {
                addTooltipData(element, balancedText, placement ?? 'bottom');
                return;
            }
            const rtTooltipValue = element.getAttribute('data-rt-tip');
            if (rtTooltipValue === text || rtTooltipValue === balancedText) {
                element.removeAttribute('data-rt-tip');
            }
            element.removeAttribute('data-rt-tip-placement');
        });
    }

    private getHelpTooltipTargets(): Array<{ element?: SVGElement; text: string; placement?: 'top' | 'bottom' | 'left' | 'right' }> {
        return [
            {
                element: this.scopeToggleButton,
                text: 'Toggle between Book and Saga scope.',
                placement: 'bottom'
            },
            {
                element: this.flowRingHit,
                text: 'Switch to Flow lens.',
                placement: 'top'
            },
            {
                element: this.depthRingHit,
                text: 'Switch to Depth lens.',
                placement: 'top'
            },
            {
                element: this.modeIconToggleHit,
                text: 'Toggle flow and depth lens.',
                placement: 'top'
            },
            {
                element: this.glyphHit,
                text: 'Toggle focus ring expansion.',
                placement: 'top'
            },
            {
                element: this.navPrevButton,
                text: 'Previous book.',
                placement: 'top'
            },
            {
                element: this.navNextButton,
                text: 'Next book.',
                placement: 'top'
            }
        ];
    }

    private openReportPreview(): void {
        if (!this.state.activeResult) {
            new Notice('Run an inquiry before previewing a report.');
            return;
        }
        this.state.reportPreviewOpen = true;
        this.updateArtifactPreview();
    }

    private async saveArtifact(): Promise<void> {
        const result = this.state.activeResult;
        if (!result) {
            new Notice('Run an inquiry before saving a brief.');
            return;
        }
        await this.saveBrief(result, {
            openFile: true,
            silent: false,
            sessionKey: this.state.activeSessionId
        });
    }

    private async saveBrief(
        result: InquiryResult,
        options: { openFile: boolean; silent: boolean; sessionKey?: string; logPath?: string }
    ): Promise<string | null> {
        const folder = await ensureInquiryArtifactFolder(this.app, this.plugin.settings);
        if (!folder) {
            if (!options.silent) {
                new Notice('Unable to create brief folder.');
            }
            return null;
        }

        const briefTitle = this.formatInquiryBriefTitle(result);
        const baseName = briefTitle;
        const filePath = this.getAvailableArtifactPath(folder.path, baseName);
        const sessionLogPath = options.logPath
            ?? (options.sessionKey ? this.sessionStore.peekSession(options.sessionKey)?.logPath : undefined);
        const content = this.buildArtifactContent(result, sessionLogPath);

        try {
            const file = await this.app.vault.create(filePath, content);
            if (options.openFile) {
                await openOrRevealFile(this.app, file);
            }
            if (!options.silent) {
                new Notice('Inquiry brief saved.');
            }
            if (options.sessionKey) {
                this.sessionStore.updateSession(options.sessionKey, {
                    status: 'saved',
                    briefPath: file.path
                });
            }
            this.updateBriefingButtonState();
            this.refreshBriefingPanel();
            return file.path;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!options.silent) {
                new Notice(`Unable to save brief: ${message}`);
            }
            return null;
        }
    }

    private async buildFallbackTrace(
        input: InquiryRunnerInput,
        note?: string
    ): Promise<InquiryRunTrace> {
        try {
            const trace = await this.runner.buildTrace(input);
            if (note) {
                trace.notes.push(note);
            }
            return trace;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const notes = note ? [note] : [];
            if (message) {
                notes.push(`Trace build error: ${message}`);
            }
            return {
                systemPrompt: '',
                userPrompt: '',
                evidenceText: '',
                tokenEstimate: {
                    inputTokens: Number.NaN,
                    outputTokens: INQUIRY_MAX_OUTPUT_TOKENS,
                    totalTokens: Number.NaN,
                    inputChars: 0,
                    uncertaintyTokens: estimateUncertaintyTokens('heuristic_chars')
                },
                outputTokenCap: INQUIRY_MAX_OUTPUT_TOKENS,
                response: null,
                sanitizationNotes: [],
                notes
            };
        }
    }

    private async saveInquiryLog(
        result: InquiryResult,
        trace: InquiryRunTrace,
        manifest: CorpusManifest | null,
        options?: { sessionKey?: string; normalizationNotes?: string[]; silent?: boolean }
    ): Promise<string | null> {
        const folder = await ensureInquiryLogFolder(this.app);
        const silent = options?.silent ?? true;
        if (!folder) {
            if (!silent) {
                new Notice('Unable to create log folder.');
            }
            return null;
        }

        const logTitle = this.formatInquiryLogTitle(result);
        const filePath = this.getAvailableArtifactPath(folder.path, logTitle);
        const shouldWriteContent = this.plugin.settings.logApiInteractions || this.isErrorResult(result);
        const content = this.buildInquiryLogContent(result, trace, manifest, logTitle, shouldWriteContent);

        let summaryPath: string | null = null;
        try {
            const file = await this.app.vault.create(filePath, content);
            if (options?.sessionKey) {
                this.sessionStore.updateSession(options.sessionKey, {
                    logPath: file.path
                });
            }
            summaryPath = file.path;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                new Notice(`Unable to save inquiry log: ${message}`);
            }
        }

        if (shouldWriteContent) {
            await this.saveInquiryContentLog(result, trace, manifest, {
                normalizationNotes: options?.normalizationNotes,
                silent
            });
        }
        return summaryPath;
    }

    private async saveInquiryContentLog(
        result: InquiryResult,
        trace: InquiryRunTrace,
        manifest: CorpusManifest | null,
        options?: { normalizationNotes?: string[]; silent?: boolean }
    ): Promise<void> {
        const silent = options?.silent ?? true;
        const folder = await ensureInquiryContentLogFolder(this.app);
        if (!folder) {
            if (!silent) {
                new Notice('Unable to create inquiry content log folder.');
            }
            return;
        }

        const logTitle = this.formatInquiryContentLogTitle(result);
        const filePath = this.getAvailableArtifactPath(folder.path, logTitle);
        const content = this.buildInquiryContentLogContent(result, trace, manifest, logTitle, options?.normalizationNotes);

        try {
            await this.app.vault.create(filePath, content);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!silent) {
                new Notice(`Unable to save inquiry content log: ${message}`);
            }
        }
    }

    private buildArtifactContent(
        result: InquiryResult,
        logPath?: string
    ): string {
        const brief = this.buildInquiryBriefModel(result, logPath);
        return renderInquiryBrief(brief);
    }

    private buildInquiryBriefModel(result: InquiryResult, logPath?: string): InquiryBriefModel {
        const questionTitle = this.findPromptLabelById(result.questionId) || 'Inquiry Question';
        const questionTextRaw = result.questionText?.trim() || this.getQuestionTextById(result.questionId);
        const questionText = questionTextRaw && questionTextRaw.trim().length > 0
            ? questionTextRaw
            : 'Question text unavailable.';
        const scopeIndicator = resolveInquiryScopeIndicator(result);

        const pills: string[] = [
            `Flow ${this.formatMetricDisplay(result.verdict.flow)}`,
            `Depth ${this.formatMetricDisplay(result.verdict.depth)}`,
            `Impact ${formatBriefLabel(result.verdict.impact)}`,
            `Assessment confidence ${formatBriefLabel(result.verdict.assessmentConfidence)}`,
            `Selection ${formatBriefLabel(result.selectionMode)}`
        ];

        if (result.mode) {
            pills.push(`Mode ${formatBriefLabel(result.mode)}`);
        }

        const modelLabel = this.getBriefModelLabel(result);
        if (modelLabel) pills.push(modelLabel);

        const flowSummary = this.getResultSummaryForMode(result, 'flow') || 'No flow summary available.';
        const depthSummary = this.getResultSummaryForMode(result, 'depth') || 'No depth summary available.';

        const orderedFindings = this.getOrderedFindings(result, result.mode);
        const findings = orderedFindings
            .filter(finding => this.isFindingHit(finding))
            .map(finding => ({
                headline: normalizeInquiryHeadline(finding.headline),
                role: this.getFindingRole(finding),
                clarity: formatBriefLabel(finding.status || 'unclear'),
                impact: formatBriefLabel(finding.impact),
                confidence: formatBriefLabel(finding.assessmentConfidence),
                lens: finding.lens === 'both'
                    ? 'Flow / Depth'
                    : formatBriefLabel(finding.lens || result.mode || 'flow'),
                bullets: (finding.bullets || []).filter(Boolean).slice(0, 3)
            }));

        const sourcesVM = buildInquirySourcesViewModel(result.citations, result.evidenceDocumentMeta);
        const sources = sourcesVM.items.map(item => ({
            title: item.title,
            excerpt: item.excerpt,
            classLabel: item.classLabel,
            path: item.path,
            url: item.url,
            citationCount: item.citationCount
        }));

        const sceneNotes = this.buildInquirySceneNotes(result);
        const pendingActions = getPendingInquiryActions(result);
        const logTitle = this.resolveInquiryLogLinkTitle(result, logPath);

        return {
            questionTitle,
            questionText,
            scopeIndicator,
            selectionMode: result.selectionMode,
            roleValidation: result.roleValidation,
            pills,
            flowSummary,
            depthSummary,
            findings,
            sources,
            sceneNotes,
            pendingActions,
            logTitle
        };
    }

    private getBriefModelLabel(result: InquiryResult): string | null {
        const raw = result.aiModelResolved || result.aiModelRequested;
        if (!raw) return null;
        const label = getModelDisplayName(raw.replace(/^models\//, ''));
        return label.replace(/\s*\(.*\)\s*$/, '').trim() || null;
    }

    private buildInquirySceneNotes(result: InquiryResult): Array<{
        label: string;
        header: string;
        anchorId?: string;
        entries: Array<{
            headline: string;
            bullets: string[];
            impact: string;
            confidence: string;
            lens: string;
        }>;
    }> {
        if (result.scope !== 'book') return [];
        const items = this.getResultItems(result);
        const orderedFindings = this.getOrderedFindings(result, result.mode);
        const notes = new Map<string, {
            label: string;
            header: string;
            anchorId?: string;
            order: number;
            entries: Array<{
                headline: string;
                bullets: string[];
                impact: string;
                confidence: string;
                lens: string;
            }>;
        }>();

        orderedFindings.forEach(finding => {
            if (!this.isFindingHit(finding)) return;
            const label = this.resolveFindingChipLabel(finding, result, items)
                ?? (finding.refId && /^s\d+$/i.test(finding.refId.trim()) ? finding.refId.trim().toUpperCase() : null);
            if (!label) return;
            const labelLower = label.toLowerCase();
            const match = items.find(item => {
                if (item.displayLabel.toLowerCase() === labelLower) return true;
                if (item.id.toLowerCase() === labelLower) return true;
                if (item.sceneId && item.sceneId.toLowerCase() === labelLower) return true;
                return item.filePaths?.some(path => path.toLowerCase() === labelLower) ?? false;
            });
            const anchorSource = match
                ? (this.getMinimapItemFilePath(match) || match.id || label)
                : label;
            const anchorId = anchorSource ? this.getBriefSceneAnchorId(anchorSource) : undefined;
            const existing = notes.get(label);
            const headerTitle = match
                ? stripNumericTitlePrefix(this.getMinimapItemTitle(match))
                : '';
            const header = headerTitle ? `${label.toUpperCase()} · ${headerTitle}` : label.toUpperCase();
            const entry = {
                headline: sanitizeDossierText(finding.headline) || 'Finding text unavailable.',
                bullets: buildSceneDossierBodyLines(finding)
                    .filter(line => line.startsWith('• '))
                    .map(line => line.replace(/^•\s*/, '')),
                impact: formatBriefLabel(finding.impact),
                confidence: formatBriefLabel(finding.assessmentConfidence),
                lens: finding.lens === 'both'
                    ? 'Flow / Depth'
                    : formatBriefLabel(finding.lens || result.mode || 'flow')
            };
            if (existing) {
                existing.entries.push(entry);
                return;
            }
            const order = match
                ? items.indexOf(match)
                : getSceneNoteSortOrder(label);
            notes.set(label, {
                label,
                header,
                anchorId,
                order: order >= 0 ? order : Number.MAX_SAFE_INTEGER,
                entries: [entry]
            });
        });

        return Array.from(notes.values())
            .sort((a, b) => {
                if (a.order !== b.order) return a.order - b.order;
                return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
            })
            .map(entry => ({
                label: entry.label,
                header: entry.header,
                anchorId: entry.anchorId,
                entries: entry.entries
            }));
    }

    private resolveSceneLogLabel(frontmatter: Record<string, unknown> | null, file: TFile): string {
        const rawSceneNumber = frontmatter ? frontmatter['Scene Number'] : undefined;
        const parsedNumber = Number(typeof rawSceneNumber === 'string' ? rawSceneNumber.trim() : rawSceneNumber);
        const sceneNumber = Number.isFinite(parsedNumber) ? Math.max(1, Math.floor(parsedNumber)) : null;
        const rawTitle = frontmatter ? (frontmatter['Title'] ?? frontmatter['title']) : undefined;
        const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
        if (sceneNumber && title) return `${title} (S${sceneNumber})`;
        if (sceneNumber) return `S${sceneNumber}`;
        if (title) return title;
        return file.basename;
    }

    private resolveManifestEntryLabel(entry: CorpusManifestEntry): string {
        const file = this.app.vault.getAbstractFileByPath(entry.path);
        if (file && this.isTFile(file)) {
            const frontmatter = this.getNormalizedFrontmatter(file);
            if (entry.class === 'scene') {
                return this.resolveSceneLogLabel(frontmatter, file);
            }
            const rawTitle = frontmatter ? (frontmatter['Title'] ?? frontmatter['title']) : undefined;
            if (typeof rawTitle === 'string' && rawTitle.trim()) {
                return rawTitle.trim();
            }
            return file.basename;
        }
        const fallback = entry.path.split('/').pop();
        return fallback || entry.path;
    }

    private buildInquiryLogContent(
        result: InquiryResult,
        trace: InquiryRunTrace,
        manifest: CorpusManifest | null,
        logTitle?: string,
        contentLogWritten?: boolean
    ): string {
        return buildInquiryLogContent({
            result,
            trace,
            manifest,
            logTitle: logTitle ?? this.formatInquiryLogTitle(result),
            contentLogWritten,
            deps: {
                getQuestionLabel: (currentResult) => this.findPromptLabelById(currentResult.questionId)
                    || this.getQuestionTextById(currentResult.questionId)
                    || currentResult.questionId
                    || 'Inquiry Question',
                getBriefModelLabel: this.getBriefModelLabel.bind(this),
                getInquiryProviderLabel: this.getInquiryProviderLabel.bind(this),
                getFiniteTokenEstimateInput: this.getFiniteTokenEstimateInput.bind(this),
                getTokenTier: this.getTokenTier.bind(this),
                buildInquiryLogCostEstimateInput: this.buildInquiryLogCostEstimateInput.bind(this),
                formatTokenUsageVisibility: this.formatTokenUsageVisibility.bind(this),
                isErrorResult: this.isErrorResult.bind(this),
                isDegradedResult: this.isDegradedResult.bind(this),
                formatMetricDisplay: this.formatMetricDisplay.bind(this),
                resolveManifestEntryLabel: this.resolveManifestEntryLabel.bind(this),
                normalizeEvidenceMode: this.normalizeEvidenceMode.bind(this),
                normalizeLegacyResult: this.normalizeLegacyResult.bind(this),
                resolveInquiryBriefZoneLabel: this.resolveInquiryBriefZoneLabel.bind(this),
                resolveInquiryBriefLensLabel: this.resolveInquiryBriefLensLabel.bind(this),
                formatInquiryIdFromResult: this.formatInquiryIdFromResult.bind(this),
                pluginVersion: this.plugin.manifest.version,
                estimateSnapshot: this.plugin.getInquiryEstimateService().getSnapshot()
            }
        });
    }

    private buildInquiryContentLogContent(
        result: InquiryResult,
        trace: InquiryRunTrace,
        manifest: CorpusManifest | null,
        logTitle?: string,
        normalizationNotes?: string[]
    ): string {
        return buildInquiryContentLogContent({
            result,
            trace,
            manifest,
            logTitle: logTitle ?? this.formatInquiryContentLogTitle(result),
            normalizationNotes,
            deps: {
                getQuestionLabel: (currentResult) => this.findPromptLabelById(currentResult.questionId)
                    || this.getQuestionTextById(currentResult.questionId)
                    || currentResult.questionId
                    || 'Inquiry Question',
                getBriefModelLabel: this.getBriefModelLabel.bind(this),
                getInquiryProviderLabel: this.getInquiryProviderLabel.bind(this),
                getFiniteTokenEstimateInput: this.getFiniteTokenEstimateInput.bind(this),
                getTokenTier: this.getTokenTier.bind(this),
                buildInquiryLogCostEstimateInput: this.buildInquiryLogCostEstimateInput.bind(this),
                formatTokenUsageVisibility: this.formatTokenUsageVisibility.bind(this),
                isErrorResult: this.isErrorResult.bind(this),
                isDegradedResult: this.isDegradedResult.bind(this),
                formatMetricDisplay: this.formatMetricDisplay.bind(this),
                resolveManifestEntryLabel: this.resolveManifestEntryLabel.bind(this),
                normalizeEvidenceMode: this.normalizeEvidenceMode.bind(this),
                normalizeLegacyResult: this.normalizeLegacyResult.bind(this),
                resolveInquiryBriefZoneLabel: this.resolveInquiryBriefZoneLabel.bind(this),
                resolveInquiryBriefLensLabel: this.resolveInquiryBriefLensLabel.bind(this),
                formatInquiryIdFromResult: this.formatInquiryIdFromResult.bind(this),
                pluginVersion: this.plugin.manifest.version,
                estimateSnapshot: this.plugin.getInquiryEstimateService().getSnapshot()
            }
        });
    }

    private formatInquiryLogTitle(result: InquiryResult): string {
        const timestampSource = this.getInquiryTimestamp(result, true) ?? new Date();
        const timestamp = this.formatInquiryBriefTimestamp(timestampSource);
        const zoneLabel = this.resolveInquiryBriefZoneLabel(result);
        const lensLabel = this.resolveInquiryBriefLensLabel(result, zoneLabel);
        const parts: string[] = [];
        if (result.aiReason === 'simulated' || result.aiReason === 'stub') {
            parts.push('TEST RUN');
        }
        if (result.scope === 'saga') {
            parts.push('Saga');
        }
        parts.push(zoneLabel, lensLabel);
        return `Inquiry Log — ${parts.join(' · ')} ${timestamp}`;
    }

    private formatInquiryContentLogTitle(result: InquiryResult): string {
        const timestampSource = this.getInquiryTimestamp(result, true) ?? new Date();
        const timestamp = this.formatInquiryBriefTimestamp(timestampSource);
        const zoneLabel = this.resolveInquiryBriefZoneLabel(result);
        const lensLabel = this.resolveInquiryBriefLensLabel(result, zoneLabel);
        const parts: string[] = [];
        if (result.aiReason === 'simulated' || result.aiReason === 'stub') {
            parts.push('TEST RUN');
        }
        if (result.scope === 'saga') {
            parts.push('Saga');
        }
        parts.push(zoneLabel, lensLabel);
        return `Inquiry Content Log — ${parts.join(' · ')} ${timestamp}`;
    }

    private resolveInquiryLogLinkTitle(result: InquiryResult, logPath?: string): string {
        if (logPath) {
            const basename = logPath.split('/').pop();
            if (basename) {
                return basename.replace(/\.md$/, '');
            }
        }
        return this.formatInquiryLogTitle(result);
    }

    private formatInquiryBriefTitle(result: InquiryResult): string {
        const timestampSource = this.getInquiryTimestamp(result, true) ?? new Date();
        const timestamp = this.formatInquiryBriefTimestamp(timestampSource);
        const zoneLabel = this.resolveInquiryBriefZoneLabel(result);
        const lensLabel = this.resolveInquiryBriefLensLabel(result, zoneLabel);
        const parts: string[] = [];
        if (result.scope === 'saga') {
            parts.push('Saga');
        }
        parts.push(zoneLabel, lensLabel);
        return `Inquiry Brief — ${parts.join(' · ')} ${timestamp}`;
    }

    private resolveInquiryBriefZoneLabel(result: InquiryResult): string {
        const zone = result.questionZone ?? this.findPromptZoneById(result.questionId) ?? 'setup';
        return zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
    }

    private resolveInquiryBriefLensLabel(result: InquiryResult, zoneLabel: string): string {
        const promptLabel = this.findPromptLabelById(result.questionId);
        if (promptLabel && promptLabel.toLowerCase() !== zoneLabel.toLowerCase()) {
            return promptLabel;
        }
        return result.mode === 'depth' ? 'Depth' : 'Flow';
    }

    private findPromptLabelById(questionId: string): string | null {
        if (!questionId) return null;
        const config = this.getPromptConfig();
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        for (const zone of zones) {
            const slot = (config[zone] || []).find(entry => entry.id === questionId);
            if (slot?.label?.trim()) {
                return slot.label.trim();
            }
        }
        return null;
    }

    private findPromptZoneById(questionId: string): InquiryZone | null {
        if (!questionId) return null;
        const config = this.getPromptConfig();
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        for (const zone of zones) {
            if ((config[zone] || []).some(entry => entry.id === questionId)) {
                return zone;
            }
        }
        return null;
    }

    private isContextRequiredForQuestion(questionId: string, questionZone?: InquiryZone): boolean {
        if (!questionId) return false;
        const config = this.getPromptConfig();
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        for (const zone of zones) {
            const slot = (config[zone] || []).find(entry => entry.id === questionId);
            if (slot?.requiresContext) return true;
        }
        if (questionZone) {
            const slots = config[questionZone] || [];
            return slots.some(entry => entry.id === questionId && entry.requiresContext);
        }
        return false;
    }

    private isContextRequiredForQuestions(questions: InquiryQuestion[]): boolean {
        return questions.some(question => this.isContextRequiredForQuestion(question.id, question.zone));
    }

    private getQuestionTextById(questionId?: string): string | null {
        if (!questionId) return null;
        const config = this.getPromptConfig();
        const zones: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        for (const zone of zones) {
            const slot = (config[zone] || []).find(entry => entry.id === questionId);
            if (!slot) continue;
            const questionText = this.getQuestionTextForSlot(zone, slot);
            if (questionText.trim()) return questionText;
        }
        return null;
    }

    private formatInquiryBriefTimestamp(date: Date, options?: { includeSeconds?: boolean }): string {
        if (!Number.isFinite(date.getTime())) {
            return 'Unknown date';
        }
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const month = months[date.getMonth()];
        const day = date.getDate();
        const year = date.getFullYear();
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        const am = hours < 12;
        hours = hours % 12;
        if (hours === 0) hours = 12;
        const minuteText = String(minutes).padStart(2, '0');
        const includeSeconds = options?.includeSeconds ?? false;
        const secondText = includeSeconds ? `.${String(seconds).padStart(2, '0')}` : '';
        return `${month} ${day} ${year} @ ${hours}.${minuteText}${secondText}${am ? 'am' : 'pm'}`;
    }

    private stringifyLogValue(value: unknown): string {
        if (value === undefined) return 'undefined';
        try {
            return JSON.stringify(value, null, 2);
        } catch {
            return String(value);
        }
    }

    private getInquiryTimestamp(result: InquiryResult, fallbackToNow = false): Date | null {
        const completedAt = result.completedAt ? new Date(result.completedAt) : null;
        if (completedAt && Number.isFinite(completedAt.getTime())) {
            return completedAt;
        }
        const submittedAt = result.submittedAt ? new Date(result.submittedAt) : null;
        if (submittedAt && Number.isFinite(submittedAt.getTime())) {
            return submittedAt;
        }
        if (fallbackToNow) return new Date();
        return null;
    }

    private formatInquiryId(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}.${minutes}.${seconds}`;
    }

    private formatInquiryIdFromResult(result: InquiryResult): string | null {
        const timestamp = this.getInquiryTimestamp(result);
        if (!timestamp) return null;
        return this.formatInquiryId(timestamp);
    }

    private formatInquiryActionNote(
        finding: InquiryFinding,
        briefTitle: string
    ): string | null {
        const suggestion = this.buildInquiryActionSuggestion(finding);
        if (!suggestion) return null;
        const briefLink = formatInquiryBriefLink(briefTitle);
        return `${briefLink} — ${suggestion}`;
    }

    private buildInquiryActionSuggestion(finding: InquiryFinding): string | null {
        // Non-actionable kinds never produce edit suggestions.
        if (finding.kind === 'none' || finding.kind === 'strength') return null;

        const source = (finding.bullets?.find(entry => entry?.trim()) || finding.headline || '').replace(/\s+/g, ' ').trim();
        if (!source) return null;
        const cleaned = source.replace(/[.?!]+$/, '').trim();
        const lowered = cleaned.toLowerCase();
        const imperativeStarts = [
            'add', 'adjust', 'align', 'anchor', 'balance', 'clarify', 'condense', 'confirm', 'connect',
            'deepen', 'define', 'emphasize', 'ensure', 'establish', 'expand', 'foreshadow', 'highlight',
            'introduce', 'move', 'reframe', 'reorder', 'revisit', 'revise', 'seed', 'sharpen', 'show',
            'simplify', 'streamline', 'strengthen', 'tighten', 'trim', 'resolve', 'rework', 'shift'
        ];
        if (imperativeStarts.some(prefix => lowered.startsWith(`${prefix} `))) {
            return cleaned;
        }
        if (lowered.startsWith('it is unclear ')) {
            return `Clarify ${cleaned.slice('it is unclear '.length)}`;
        }
        if (lowered.startsWith('unclear whether ')) {
            return `Clarify whether ${cleaned.slice('unclear whether '.length)}`;
        }
        if (lowered.startsWith('unclear if ')) {
            return `Clarify if ${cleaned.slice('unclear if '.length)}`;
        }
        if (lowered.startsWith('unclear ')) {
            return `Clarify ${cleaned.slice('unclear '.length)}`;
        }
        if (lowered.startsWith('lacks ')) {
            return `Add ${cleaned.slice('lacks '.length)}`;
        }
        if (lowered.startsWith('missing ')) {
            return `Add ${cleaned.slice('missing '.length)}`;
        }
        if (lowered.startsWith('needs ')) {
            return `Strengthen ${cleaned.slice('needs '.length)}`;
        }
        const verbMatch = cleaned.match(/\b(is|are|was|were|feels|seems|appears|looks|drags|lags|sags|rushes|stalls|slows|reads)\b/i);
        if (verbMatch?.index !== undefined && verbMatch.index > 0) {
            const subject = cleaned.slice(0, verbMatch.index).replace(/^(the|this|that|these|those|a|an)\s+/i, '').trim();
            const remainder = cleaned.slice(verbMatch.index + verbMatch[0].length).trim();
            const locationMatch = remainder.match(/\b(in|during|at|by|within|around)\s+.+$/i);
            if (subject) {
                const location = locationMatch ? ` ${locationMatch[0].trim()}` : '';
                return `Revise ${subject}${location}`;
            }
        }
        // No actionable pattern detected — skip rather than fabricating a suggestion.
        return null;
    }

    private formatRoundTripDuration(ms: number): string {
        if (!Number.isFinite(ms) || ms <= 0) return '0s';
        const seconds = ms / 1000;
        if (seconds < 1) return `${Math.round(ms)}ms`;
        const rounded = seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2);
        return `${rounded.replace(/\.0+$/, '')}s`;
    }

    private getAvailableArtifactPath(folderPath: string, baseName: string): string {
        const sanitizedFolder = normalizePath(folderPath);
        let attempt = 0;
        while (attempt < 50) {
            const suffix = attempt === 0 ? '' : `-${attempt}`;
            const filePath = `${sanitizedFolder}/${baseName}${suffix}.md`;
            if (!this.app.vault.getAbstractFileByPath(filePath)) {
                return filePath;
            }
            attempt += 1;
        }
        return `${sanitizedFolder}/${baseName}-${Date.now()}.md`;
    }

    private async openArtifactsFolder(): Promise<void> {
        const folderPath = resolveInquiryArtifactFolder(this.plugin.settings);
        const folder = await ensureInquiryArtifactFolder(this.app, this.plugin.settings);
        if (!folder) {
            new Notice(`Unable to access folder: ${folderPath}`);
            return;
        }
        this.revealInFileExplorer(folder);
    }

    private async openMostRecentArtifact(): Promise<void> {
        const file = getMostRecentArtifactFile(this.app, this.plugin.settings);
        if (!file) {
            new Notice('No briefs found.');
            return;
        }
        await openOrRevealFile(this.app, file);
    }

    private revealInFileExplorer(file: TAbstractFile): void {
        const explorerLeaf = this.app.workspace.getLeavesOfType('file-explorer')[0];
        if (!explorerLeaf?.view) {
            new Notice('File explorer not available.');
            return;
        }
        const explorerView = explorerLeaf.view as unknown as { revealInFolder?: (target: TAbstractFile) => void };
        if (!explorerView.revealInFolder) {
            new Notice('Unable to reveal folder.');
            return;
        }
        explorerView.revealInFolder(file);
        this.app.workspace.revealLeaf(explorerLeaf);
    }
}
