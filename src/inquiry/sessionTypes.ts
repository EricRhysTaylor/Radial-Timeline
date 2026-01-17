import type { InquiryResult } from './state';

export interface InquirySession {
    key: string;
    baseKey: string;
    result: InquiryResult;
    createdAt: number;
    lastAccessed: number;
    stale?: boolean;
}

export interface InquirySessionCache {
    sessions: InquirySession[];
    max: number;
}
