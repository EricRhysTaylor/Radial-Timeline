import type { RTCorpusTokenEstimate } from '../../ai/types';
import type { InquiryPayloadStats } from '../types';

export const RT_CORPUS_CHARS_PER_TOKEN = 4;

export function buildRTCorpusEstimate(payloadStats: InquiryPayloadStats): RTCorpusTokenEstimate {
    const evidenceChars = Number.isFinite(payloadStats.evidenceChars)
        ? Math.max(0, Math.floor(payloadStats.evidenceChars))
        : 0;
    const estimatedTokens = evidenceChars > 0
        ? Math.ceil(evidenceChars / RT_CORPUS_CHARS_PER_TOKEN)
        : 0;
    return {
        sceneCount: Math.max(0, Math.floor(payloadStats.sceneTotal || 0)),
        outlineCount: Math.max(0, Math.floor((payloadStats.bookOutlineCount || 0) + (payloadStats.sagaOutlineCount || 0))),
        referenceCount: Math.max(0, Math.floor(payloadStats.referenceCounts?.total || 0)),
        evidenceChars,
        estimatedTokens,
        method: 'rt_chars_heuristic'
    };
}
