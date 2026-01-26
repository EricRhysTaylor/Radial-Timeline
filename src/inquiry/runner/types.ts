import type { InquiryAiStatus, InquiryMode, InquiryScope, InquiryZone, InquiryResult } from '../state';
import type { InquiryMaterialMode } from '../../types/settings';

export type EvidenceClass = string;

export type InquiryAiProvider = 'openai' | 'anthropic' | 'gemini' | 'local';

export interface InquiryAiEngineInfo {
    provider: InquiryAiProvider;
    modelId: string;
    modelLabel: string;
}

export interface InquiryOmnibusQuestion {
    id: string;
    zone: InquiryZone;
    question: string;
}

export interface CorpusManifestEntry {
    path: string;
    mtime: number;
    class: EvidenceClass;
    scope?: InquiryScope;
    bookId?: string;
    mode?: InquiryMaterialMode;
}

export interface CorpusManifest {
    entries: CorpusManifestEntry[];
    fingerprint: string;
    generatedAt: number;
    resolvedRoots: string[];
    allowedClasses: EvidenceClass[];
    synopsisOnly: boolean;
    classCounts: Record<EvidenceClass, number>;
}

export interface EvidenceParticipationRules {
    sagaOutlineScope: 'saga-only';
    bookOutlineScope: 'book-only';
    crossScopeUsage: 'conflict-only';
}

export interface InquiryRunnerInput {
    scope: InquiryScope;
    focusLabel: string;
    focusSceneId?: string;
    focusBookId?: string;
    // UI emphasis only; inquiry computation must always include both flow + depth regardless of lens.
    mode: InquiryMode;
    questionId: string;
    questionText: string;
    questionZone: InquiryZone;
    corpus: CorpusManifest;
    rules: EvidenceParticipationRules;
    ai: InquiryAiEngineInfo;
}

export interface InquiryOmnibusInput {
    scope: InquiryScope;
    focusLabel: string;
    focusSceneId?: string;
    focusBookId?: string;
    // UI emphasis only; inquiry computation must always include both flow + depth regardless of lens.
    mode: InquiryMode;
    questions: InquiryOmnibusQuestion[];
    corpus: CorpusManifest;
    rules: EvidenceParticipationRules;
    ai: InquiryAiEngineInfo;
}

export interface InquiryRunTrace {
    systemPrompt: string;
    userPrompt: string;
    evidenceText: string;
    requestPayload?: unknown;
    tokenEstimate: {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        inputChars: number;
    };
    outputTokenCap: number;
    retryCount?: number;
    response: {
        content: string | null;
        responseData: unknown;
        aiStatus?: InquiryAiStatus;
        aiReason?: string;
        error?: string;
    } | null;
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
    };
    sanitizationNotes: string[];
    notes: string[];
}

export interface InquiryRunner {
    run(input: InquiryRunnerInput): Promise<InquiryResult>;
}
