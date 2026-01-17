import type { InquiryMode, InquiryScope, InquiryZone, InquiryResult } from '../state';

export type EvidenceClass = 'scene' | 'outline' | 'character' | 'place' | 'power';

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
}

export interface InquiryRunner {
    run(input: InquiryRunnerInput): Promise<InquiryResult>;
}
