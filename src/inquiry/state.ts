export type InquiryScope = 'book' | 'saga';
export type InquiryMode = 'flow' | 'depth';
export type InquiryZone = 'setup' | 'pressure' | 'payoff';

export type InquirySeverity = 'low' | 'medium' | 'high';
export type InquiryConfidence = 'low' | 'medium' | 'high';

export interface InquiryVerdict {
    flow: number;
    depth: number;
    severity: InquirySeverity;
    confidence: InquiryConfidence;
}

export interface InquiryFinding {
    refId: string;
    kind: 'none' | 'loose_end' | 'continuity' | 'escalation' | 'conflict' | 'unclear' | 'error';
    status: 'introduced' | 'escalated' | 'resolved' | 'dropped' | 'unclear';
    severity: InquirySeverity;
    confidence: InquiryConfidence;
    headline: string;
    bullets: string[];
    related: string[];
    evidenceType: 'scene' | 'outline' | 'mixed';
}

export interface InquiryResult {
    runId: string;
    scope: InquiryScope;
    focusId: string;
    mode: InquiryMode;
    questionId: string;
    summary: string;
    verdict: InquiryVerdict;
    findings: InquiryFinding[];
    corpusFingerprint?: string;
}

export interface InquiryState {
    scope: InquiryScope;
    focusSceneId?: string;
    focusBookId?: string;
    mode: InquiryMode;
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
    focusSceneId: '1',
    focusBookId: '1',
    mode: 'flow',
    activeZone: null,
    activeResult: null,
    isRunning: false,
    isNarrowLayout: false,
    reportPreviewOpen: false,
});
