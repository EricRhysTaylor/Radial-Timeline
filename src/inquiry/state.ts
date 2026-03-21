import type { SourceCitation } from '../ai/types';

export type InquiryScope = 'book' | 'saga';
export type InquiryLens = 'flow' | 'depth';
export type InquirySelectionMode = 'discover' | 'focused';
export type InquiryZone = 'setup' | 'pressure' | 'payoff';

export type InquirySeverity = 'low' | 'medium' | 'high';
export type InquiryConfidence = 'low' | 'medium' | 'high';
export type InquiryAiStatus = 'success' | 'degraded' | 'rejected' | 'unavailable' | 'timeout' | 'auth' | 'rate_limit';
export type InquiryTokenUsageScope = 'full' | 'partial' | 'synthesis_only';
export type FindingRole = 'target' | 'context';
export type InquiryRoleValidation = 'ok' | 'missing-target-roles';

export type InquiryCitation = SourceCitation;

export interface EvidenceDocumentMeta {
    /** Display title (e.g. "The Red Night" or "Book outline"). */
    title: string;
    /** Vault-relative file path for navigation. */
    path?: string;
    /** Scene ID (e.g. "S42"), if a scene document. */
    sceneId?: string;
    /** Evidence class: "scene", "outline", or formatted reference class. */
    evidenceClass: string;
}

export interface InquiryVerdict {
    flow: number;
    depth: number;
    impact: InquirySeverity; // Impact rating (always present).
    assessmentConfidence: InquiryConfidence; // Assessment confidence (always present).
}

export interface InquiryFinding {
    refId: string;
    kind: 'none' | 'loose_end' | 'continuity' | 'escalation' | 'conflict' | 'unclear' | 'error' | 'strength';
    status: 'introduced' | 'escalated' | 'resolved' | 'dropped' | 'unclear';
    impact: InquirySeverity;
    assessmentConfidence: InquiryConfidence;
    headline: string;
    bullets: string[];
    related: string[];
    evidenceType: 'scene' | 'outline' | 'mixed';
    lens?: 'flow' | 'depth' | 'both';
    role?: FindingRole;
}

export interface InquiryResult {
    runId: string;
    scope: InquiryScope;
    scopeLabel: string;
    mode: InquiryLens;
    selectionMode: InquirySelectionMode;
    roleValidation: InquiryRoleValidation;
    questionId: string;
    questionZone?: InquiryZone;
    summary: string;
    summaryFlow?: string;
    summaryDepth?: string;
    verdict: InquiryVerdict;
    findings: InquiryFinding[];
    corpusFingerprint?: string;
    corpusOverridesActive?: boolean;
    corpusOverrideSummary?: {
        classCount: number;
        itemCount: number;
        total: number;
    };
    aiProvider?: string;
    aiModelRequested?: string;
    aiModelResolved?: string;
    aiModelNextRunOnly?: boolean;
    aiStatus?: InquiryAiStatus;
    aiReason?: string;
    executionState?: 'blocked_before_send' | 'dispatched_to_provider' | 'packaging_failed';
    executionPath?: 'one_pass' | 'multi_pass';
    failureStage?: 'preflight' | 'chunk_execution' | 'synthesis' | 'provider_response_parsing';
    tokenUsageKnown?: boolean;
    tokenUsageScope?: InquiryTokenUsageScope;
    tokenEstimateInput?: number;
    tokenEstimateTier?: 'normal' | 'amber' | 'red';
    submittedAt?: string;
    completedAt?: string;
    roundTripMs?: number;
    /** Normalized source attribution from provider runtime (manuscript and tool/file/url forms). */
    citations?: InquiryCitation[];
    /** Ordered metadata for evidence documents sent to the AI. Indices match citation documentIndex. */
    evidenceDocumentMeta?: EvidenceDocumentMeta[];
}

export interface InquiryState {
    scope: InquiryScope;
    targetSceneIds: string[];
    activeBookId?: string;
    mode: InquiryLens;
    selectedPromptIds: Record<InquiryZone, string>;
    activeQuestionId?: string;
    activeSessionId?: string;
    activeZone?: InquiryZone | null;
    activeResult?: InquiryResult | null;
    isRunning: boolean;
    lastError?: string;
    cacheStatus?: 'fresh' | 'stale' | 'missing';
    corpusFingerprint?: string;
    settingsSnapshot?: string;
    isNarrowLayout: boolean;
    reportPreviewOpen?: boolean;
}

export const createDefaultInquiryState = (): InquiryState => ({
    scope: 'book',
    targetSceneIds: [],
    mode: 'flow',
    selectedPromptIds: {
        setup: '',
        pressure: '',
        payoff: ''
    },
    activeZone: null,
    activeResult: null,
    isRunning: false,
    isNarrowLayout: false,
    reportPreviewOpen: false,
});
