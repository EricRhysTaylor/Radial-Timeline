import type { RTCorpusTokenEstimate } from '../../ai/types';

export function buildInquiryEngineCorpusSummary(
    estimate: RTCorpusTokenEstimate,
    requestTokens: number,
    formatApproxCorpusTokens: (value: number) => string
): string {
    if (requestTokens <= 0 && estimate.estimatedTokens <= 0) return 'Full request · Estimating…';
    const outlineLabel = estimate.breakdown.outlineTokens > 0
        ? `Outline ${formatApproxCorpusTokens(estimate.breakdown.outlineTokens)}`
        : 'Outline none';
    const referenceLabel = estimate.breakdown.referenceTokens > 0
        ? `References ${formatApproxCorpusTokens(estimate.breakdown.referenceTokens)}`
        : 'References none';
    return [
        requestTokens > 0
            ? `Full request ${formatApproxCorpusTokens(requestTokens)}`
            : 'Full request Estimating…',
        estimate.estimatedTokens > 0
            ? `Corpus ${formatApproxCorpusTokens(estimate.estimatedTokens)}`
            : 'Corpus estimating…',
        `Scenes ${formatApproxCorpusTokens(estimate.breakdown.scenesTokens)}`,
        outlineLabel,
        referenceLabel
    ].join(' · ');
}
