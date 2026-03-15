import type { AIProviderId } from '../types';
import { getProviderPricing } from './providerPricing';

export interface CorpusCostEstimate {
    provider: AIProviderId;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    expectedPasses: number;
    freshCostUSD: number;
    cachedCostUSD: number;
}

const TOKENS_PER_MILLION = 1_000_000;
const CACHE_REUSE_RATIO = 0.7;

export function estimateCorpusCost(
    provider: AIProviderId,
    modelId: string,
    executionInputTokens: number,
    expectedOutputTokens: number,
    expectedPasses: number
): CorpusCostEstimate {
    const pricing = getProviderPricing(provider, modelId);
    const inputTokens = Math.max(0, Math.floor(executionInputTokens));
    const outputTokens = Math.max(0, Math.floor(expectedOutputTokens));
    const passes = Math.max(1, Math.floor(expectedPasses));

    // Fresh run models the first request before prefix reuse is available.
    // Cached run models subsequent requests by discounting the reusable prefix.
    const freshPerPass = (
        (inputTokens / TOKENS_PER_MILLION) * pricing.inputPer1M
        + (outputTokens / TOKENS_PER_MILLION) * pricing.outputPer1M
    );
    const cachedInputTokens = inputTokens * (1 - CACHE_REUSE_RATIO);
    const cachedPerPass = (
        (cachedInputTokens / TOKENS_PER_MILLION) * pricing.inputPer1M
        + (outputTokens / TOKENS_PER_MILLION) * pricing.outputPer1M
    );

    return {
        provider,
        modelId,
        inputTokens,
        outputTokens,
        expectedPasses: passes,
        freshCostUSD: freshPerPass * passes,
        cachedCostUSD: cachedPerPass * passes
    };
}

export function formatUsdCost(value: number): string {
    return `$${value.toFixed(2)}`;
}

export function formatApproxUsdCost(value: number): string {
    const digits = value >= 10 ? 0 : 1;
    return `~$${value.toFixed(digits)}`;
}
