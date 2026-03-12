import { describe, expect, it } from 'vitest';
import { buildRTCorpusEstimate } from './buildRTCorpusEstimate';
import type { InquiryPayloadStats } from '../types';

function makeStats(overrides: Partial<InquiryPayloadStats> = {}): InquiryPayloadStats {
    return {
        scope: 'book',
        focusBookId: 'Book 1',
        sceneTotal: 53,
        sceneSynopsisUsed: 0,
        sceneSynopsisAvailable: 0,
        sceneFullTextCount: 53,
        bookOutlineCount: 1,
        bookOutlineSummaryCount: 0,
        bookOutlineFullCount: 1,
        sagaOutlineCount: 0,
        sagaOutlineSummaryCount: 0,
        sagaOutlineFullCount: 0,
        referenceCounts: { character: 0, place: 0, power: 0, other: 0, total: 0 },
        referenceByClass: {},
        evidenceChars: 588965,
        resolvedRoots: [],
        manifestFingerprint: 'fp',
        ...overrides
    };
}

describe('buildRTCorpusEstimate', () => {
    it('returns deterministic corpus estimate without prompt overhead', () => {
        const estimate = buildRTCorpusEstimate(makeStats());
        expect(estimate.sceneCount).toBe(53);
        expect(estimate.outlineCount).toBe(1);
        expect(estimate.referenceCount).toBe(0);
        expect(estimate.evidenceChars).toBe(588965);
        expect(estimate.estimatedTokens).toBe(Math.ceil(588965 / 4));
        expect(estimate.method).toBe('rt_chars_heuristic');
    });

    it('normalizes invalid values to zero', () => {
        const estimate = buildRTCorpusEstimate(makeStats({
            sceneTotal: Number.NaN as unknown as number,
            bookOutlineCount: -1,
            sagaOutlineCount: Number.NaN as unknown as number,
            referenceCounts: { character: 0, place: 0, power: 0, other: 0, total: -3 },
            evidenceChars: Number.NaN as unknown as number
        }));
        expect(estimate.sceneCount).toBe(0);
        expect(estimate.outlineCount).toBe(0);
        expect(estimate.referenceCount).toBe(0);
        expect(estimate.evidenceChars).toBe(0);
        expect(estimate.estimatedTokens).toBe(0);
    });
});
