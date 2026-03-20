import type { RTCorpusTokenEstimate } from '../../ai/types';

export function buildInquiryEngineCorpusSummary(
    estimate: RTCorpusTokenEstimate,
    formatApproxCorpusTokens: (value: number) => string
): string {
    if (estimate.estimatedTokens <= 0) return 'Corpus · Estimating…';
    const outlineLabel = estimate.breakdown.outlineTokens > 0
        ? `Outline ${formatApproxCorpusTokens(estimate.breakdown.outlineTokens)}`
        : 'Outline none';
    const referenceLabel = estimate.breakdown.referenceTokens > 0
        ? `References ${formatApproxCorpusTokens(estimate.breakdown.referenceTokens)}`
        : 'References none';
    return [
        `Corpus · Total ${formatApproxCorpusTokens(estimate.estimatedTokens)}`,
        `Scenes ${formatApproxCorpusTokens(estimate.breakdown.scenesTokens)}`,
        outlineLabel,
        referenceLabel
    ].join(' · ');
}
