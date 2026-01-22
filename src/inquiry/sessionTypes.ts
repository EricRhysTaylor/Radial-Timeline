import type { InquiryResult, InquiryScope, InquiryZone } from './state';

export type InquirySessionStatus = 'saved' | 'unsaved' | 'error' | 'simulated';

export interface InquirySession {
    key: string;
    baseKey: string;
    result: InquiryResult;
    createdAt: number;
    lastAccessed: number;
    stale?: boolean;
    status?: InquirySessionStatus;
    briefPath?: string;
    focusSceneId?: string;
    focusBookId?: string;
    scope?: InquiryScope;
    questionZone?: InquiryZone;
}

export interface InquirySessionCache {
    sessions: InquirySession[];
    max: number;
}
