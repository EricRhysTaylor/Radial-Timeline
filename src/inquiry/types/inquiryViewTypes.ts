import type { AIRunAdvancedContext } from '../../ai/types';
import type {
    InquiryClassConfig,
    InquiryMaterialMode,
    InquiryTimingHistoryEntry,
    OmnibusProgressState
} from '../../types/settings';
import type {
    InquiryConfidence,
    InquiryFinding,
    InquiryResult,
    InquiryScope,
    InquirySeverity,
    InquiryZone
} from '../state';
import type { InquirySession } from '../sessionTypes';
import type { SynopsisQuality } from '../../sceneAnalysis/synopsisQuality';

export type InquiryQuestion = {
    id: string;
    label: string;
    question: string;
    zone: InquiryZone;
    icon: string;
};

export type InquiryBriefModel = {
    questionTitle: string;
    questionText: string;
    scopeIndicator?: string | null;
    pills: string[];
    flowSummary: string;
    depthSummary: string;
    findings: Array<{
        headline: string;
        clarity: string;
        impact: string;
        confidence: string;
        lens: string;
        bullets: string[];
    }>;
    sources: Array<{
        title: string;
        excerpt: string;
        classLabel: string;
        path?: string;
        url?: string;
    }>;
    sceneNotes: Array<{
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
    }>;
    pendingActions: string[];
    logTitle?: string | null;
};

export type InquiryPreviewRow = {
    group: SVGGElement;
    bg: SVGRectElement;
    text: SVGTextElement;
    label: string;
};

export type InquirySceneDossier = {
    title: string;
    anchorLine: string;
    bodyLines: string[];
    metaLine?: string;
    sourceLabel?: string;
};

export type InquiryOmnibusPlan = {
    scope: InquiryScope;
    createIndex: boolean;
    resume?: boolean;
};

export type InquiryPurgePreviewItem = {
    label: string;
    path: string;
    lineCount: number;
};

export type InquiryOmnibusModalOptions = {
    initialScope: InquiryScope;
    bookLabel: string;
    questions: InquiryQuestion[];
    providerSummary: string;
    providerLabel: string;
    logsEnabled: boolean;
    runDisabledReason?: string | null;
    priorProgress?: OmnibusProgressState;
    resumeAvailable?: boolean;
    resumeUnavailableReason?: string;
};

export type CorpusCcEntry = {
    id: string;
    entryKey: string;
    label: string;
    filePath: string;
    sceneId?: string;
    bookId?: string;
    bookLabel?: string;
    className: string;
    classKey: string;
    scope?: InquiryScope;
    mode: InquiryMaterialMode;
    sortLabel?: string;
};

export type CorpusCcGroup = {
    key: string;
    className: string;
    items: CorpusCcEntry[];
    count: number;
    mode: InquiryMaterialMode;
    headerLabel?: string;
    headerTooltipLabel?: string;
};

export type CorpusCcSlot = {
    group: SVGGElement;
    base: SVGRectElement;
    fill: SVGRectElement;
    border: SVGRectElement;
    lowSubstanceX: SVGGElement;
    lowSubstanceXPrimary: SVGLineElement;
    lowSubstanceXSecondary: SVGLineElement;
    icon: SVGGElement;
    iconOuter: SVGCircleElement;
    iconInner: SVGCircleElement;
};

export type CorpusCcHeader = {
    group: SVGGElement;
    hit: SVGRectElement;
    icon: SVGGElement;
    iconOuter: SVGCircleElement;
    iconInner: SVGCircleElement;
    text: SVGTextElement;
};

export type CorpusCcStats = {
    bodyWords: number;
    synopsisWords: number;
    synopsisQuality: SynopsisQuality;
    statusRaw?: string;
    due?: string;
    title?: string;
};

export type InquiryWritebackOutcome = 'written' | 'duplicate' | 'skipped';
export type InquiryGuidanceState = 'not-configured' | 'no-scenes' | 'ready' | 'running' | 'results';
export type EngineProvider = 'anthropic' | 'gemini' | 'openai' | 'local';

export type OmnibusProviderChoice = {
    provider: EngineProvider;
    modelId: string;
    modelLabel: string;
    useOmnibus: boolean;
    reason?: string;
};

export type OmnibusProviderPlan = {
    choice: OmnibusProviderChoice | null;
    summary: string;
    label: string;
    disabledReason?: string;
};

export type EngineChoice = {
    provider: EngineProvider;
    providerLabel: string;
    modelId: string;
    modelLabel: string;
    isActive: boolean;
    enabled: boolean;
    disabledReason?: string;
};

export type AiSettingsFocus =
    | 'provider'
    | 'thinking-style'
    | 'access-level'
    | 'pinned-model'
    | 'execution-preference'
    | 'large-manuscript-handling';

export type EngineFailureGuidance = {
    message: string;
};

export type InquiryGlyphSeedSource = 'active' | 'session' | 'empty';

export type InquiryGlyphSeed = {
    source: InquiryGlyphSeedSource;
    flowValue: number;
    depthValue: number;
    flowVisualValue: number;
    depthVisualValue: number;
    impact: InquirySeverity;
    assessmentConfidence: InquiryConfidence;
    session?: InquirySession;
};

export type InquirySceneNoteEntry = {
    headline: string;
    bullets: string[];
    impact: string;
    confidence: string;
    lens: string;
};

export type InquirySceneNoteSection = {
    label: string;
    header: string;
    anchorId?: string;
    entries: InquirySceneNoteEntry[];
};

export type InquiryBriefDependencies = {
    formatMetricDisplay: (value: number) => string;
    formatBriefLabel: (value?: string | null) => string;
    normalizeInquiryHeadline: (headline: string) => string;
};

export type InquiryBriefRenderContext = {
    brief: InquiryBriefModel;
};

export type InquiryCorpusModeDependency = {
    normalizeEvidenceMode: (mode?: InquiryMaterialMode) => 'none' | 'summary' | 'full';
};

export type InquiryClassContributionDependency = {
    normalizeClassContribution: (config: InquiryClassConfig) => InquiryClassConfig;
};

export type InquiryTimingLookup = (provider?: string, model?: string) => InquiryTimingHistoryEntry | null;
export type InquiryAdvancedContext = AIRunAdvancedContext | null;
