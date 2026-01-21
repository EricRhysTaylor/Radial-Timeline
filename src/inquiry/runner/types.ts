import type { InquiryMode, InquiryScope, InquiryZone, InquiryResult } from '../state';

export type EvidenceClass = string;

export type InquiryAiProvider = 'openai' | 'anthropic' | 'gemini' | 'local';

export interface InquiryAiEngineInfo {
    provider: InquiryAiProvider;
    modelId: string;
    modelLabel: string;
}

export interface CorpusManifestEntry {
    path: string;
    mtime: number;
    class: EvidenceClass;
    scope?: InquiryScope;
    bookId?: string;
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
    mode: InquiryMode;
    questionId: string;
    questionText: string;
    questionZone: InquiryZone;
    corpus: CorpusManifest;
    rules: EvidenceParticipationRules;
    ai: InquiryAiEngineInfo;
}

export interface InquiryRunner {
    run(input: InquiryRunnerInput): Promise<InquiryResult>;
}
