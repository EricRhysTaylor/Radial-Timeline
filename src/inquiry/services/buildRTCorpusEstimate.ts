import type { RTCorpusTokenEstimate } from '../../ai/types';
import type { InquiryPayloadStats } from '../types';

export const RT_CORPUS_CHARS_PER_TOKEN = 4;

const normalizeChars = (value: number | undefined): number => (
    typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.floor(value))
        : 0
);

export function buildRTCorpusEstimate(payloadStats: InquiryPayloadStats): RTCorpusTokenEstimate {
    const sceneChars = normalizeChars(payloadStats.sceneChars);
    const outlineChars = normalizeChars(payloadStats.outlineChars);
    const referenceChars = normalizeChars(payloadStats.referenceChars);
    const normalizedEvidenceChars = normalizeChars(payloadStats.evidenceChars);
    const breakdownCharsTotal = sceneChars + outlineChars + referenceChars;
    const evidenceChars = breakdownCharsTotal > 0 ? breakdownCharsTotal : normalizedEvidenceChars;
    const breakdown = breakdownCharsTotal > 0
        ? {
            scenesTokens: sceneChars > 0 ? Math.ceil(sceneChars / RT_CORPUS_CHARS_PER_TOKEN) : 0,
            outlineTokens: outlineChars > 0 ? Math.ceil(outlineChars / RT_CORPUS_CHARS_PER_TOKEN) : 0,
            referenceTokens: referenceChars > 0 ? Math.ceil(referenceChars / RT_CORPUS_CHARS_PER_TOKEN) : 0
        }
        : {
            scenesTokens: evidenceChars > 0 ? Math.ceil(evidenceChars / RT_CORPUS_CHARS_PER_TOKEN) : 0,
            outlineTokens: 0,
            referenceTokens: 0
        };
    const estimatedTokens = breakdown.scenesTokens + breakdown.outlineTokens + breakdown.referenceTokens;
    return {
        sceneCount: Math.max(0, Math.floor(payloadStats.sceneTotal || 0)),
        outlineCount: Math.max(0, Math.floor((payloadStats.bookOutlineCount || 0) + (payloadStats.sagaOutlineCount || 0))),
        referenceCount: Math.max(0, Math.floor(payloadStats.referenceCounts?.total || 0)),
        evidenceChars,
        estimatedTokens,
        method: 'rt_chars_heuristic',
        breakdown
    };
}
