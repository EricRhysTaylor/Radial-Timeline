import type { AIProviderId } from '../types';
import { resolveProviderModelPricing, isPromoActive, type PromoPricing } from './providerPricing';
import type { TokenUsage } from '../usage/providerUsage';

export interface CorpusCostEstimate {
    provider: AIProviderId;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    expectedPasses: number;
    cacheReuseRatio: number;
    freshCostUSD: number;
    cachedCostUSD: number;
    effectiveCostUSD: number;
    promo?: PromoPricing;
}

export interface UsageCostEstimate {
    inputTokens?: number;
    outputTokens?: number;
    rawInputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheCreation5mInputTokens?: number;
    cacheCreation1hInputTokens?: number;
    rawInputCostUSD?: number;
    cacheReadCostUSD?: number;
    cacheCreationCostUSD?: number;
    inputCostUSD?: number;
    outputCostUSD?: number;
    totalCostUSD?: number;
}

export interface EstimateCorpusCostOptions {
    /** 0-1 fraction of input expected to be served from provider cache on repeat/multi-pass execution. */
    cacheReuseRatio?: number;
}

const TOKENS_PER_MILLION = 1_000_000;
const DEFAULT_MULTI_PASS_CACHE_REUSE_RATIO = 0.5;
const DEFAULT_REPEAT_RUN_CACHE_REUSE_RATIO = 0.75;

function toUsd(tokens: number, ratePer1M: number | undefined): number {
    if (!Number.isFinite(tokens) || typeof ratePer1M !== 'number' || !Number.isFinite(ratePer1M)) return 0;
    return (tokens / TOKENS_PER_MILLION) * ratePer1M;
}

function clampCacheReuseRatio(value: number | undefined): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.min(1, Math.max(0, value));
}

export function resolveEstimatedCacheReuseRatio(
    expectedPasses: number,
    override?: number
): number {
    const explicit = clampCacheReuseRatio(override);
    if (typeof explicit === 'number') return explicit;
    return expectedPasses > 1
        ? DEFAULT_MULTI_PASS_CACHE_REUSE_RATIO
        : DEFAULT_REPEAT_RUN_CACHE_REUSE_RATIO;
}

function buildEstimatedInputCostUSD(params: {
    provider: AIProviderId;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    expectedPasses: number;
    cacheReuseRatio: number;
    scenario: 'fresh' | 'cached';
}): number {
    const pricing = resolveProviderModelPricing(params.provider, params.modelId, params.inputTokens);
    const reusedInputTokens = Math.max(0, Math.floor(params.inputTokens * params.cacheReuseRatio));
    const uncachedInputTokens = Math.max(0, params.inputTokens - reusedInputTokens);
    const hasExplicitCachePricing = params.provider === 'anthropic'
        && typeof pricing.cacheWrite5mPer1M === 'number'
        && typeof pricing.cacheReadPer1M === 'number';
    const scenarioInputCostUSD = hasExplicitCachePricing
        ? (
            toUsd(uncachedInputTokens, pricing.inputPer1M)
            + toUsd(
                reusedInputTokens,
                params.scenario === 'fresh'
                    ? pricing.cacheWrite5mPer1M
                    : pricing.cacheReadPer1M
            )
        )
        : toUsd(params.inputTokens, pricing.inputPer1M);
    const outputCostUSD = toUsd(params.outputTokens, pricing.outputPer1M);
    return (scenarioInputCostUSD + outputCostUSD) * params.expectedPasses;
}

export function estimateCorpusCost(
    provider: AIProviderId,
    modelId: string,
    executionInputTokens: number,
    expectedOutputTokens: number,
    expectedPasses: number,
    options?: EstimateCorpusCostOptions
): CorpusCostEstimate {
    const inputTokens = Math.max(0, Math.floor(executionInputTokens));
    const outputTokens = Math.max(0, Math.floor(expectedOutputTokens));
    const passes = Math.max(1, Math.floor(expectedPasses));
    const cacheReuseRatio = resolveEstimatedCacheReuseRatio(passes, options?.cacheReuseRatio);
    const freshCostUSD = buildEstimatedInputCostUSD({
        provider,
        modelId,
        inputTokens,
        outputTokens,
        expectedPasses: passes,
        cacheReuseRatio,
        scenario: 'fresh'
    });
    const cachedCostUSD = buildEstimatedInputCostUSD({
        provider,
        modelId,
        inputTokens,
        outputTokens,
        expectedPasses: passes,
        cacheReuseRatio,
        scenario: 'cached'
    });

    const pricing = resolveProviderModelPricing(provider, modelId, inputTokens);
    const promo = isPromoActive(pricing.promo) ? pricing.promo : undefined;

    return {
        provider,
        modelId,
        inputTokens,
        outputTokens,
        expectedPasses: passes,
        cacheReuseRatio,
        freshCostUSD,
        cachedCostUSD,
        effectiveCostUSD: cachedCostUSD,
        promo
    };
}

export function estimateUsageCost(
    provider: AIProviderId,
    modelId: string,
    usage?: TokenUsage | null
): UsageCostEstimate | null {
    if (!usage) return null;
    const totalInputTokens = typeof usage.inputTokens === 'number'
        ? usage.inputTokens
        : [usage.rawInputTokens, usage.cacheReadInputTokens, usage.cacheCreationInputTokens]
            .filter((value): value is number => typeof value === 'number')
            .reduce((sum, value) => sum + value, 0);
    const pricing = resolveProviderModelPricing(provider, modelId, totalInputTokens);
    const hasAnthropicCachePricing = provider === 'anthropic'
        && typeof pricing.cacheWrite5mPer1M === 'number'
        && typeof pricing.cacheReadPer1M === 'number';
    const cacheCreation5mInputTokens = usage.cacheCreation5mInputTokens;
    const cacheCreation1hInputTokens = usage.cacheCreation1hInputTokens;
    const cacheCreationKnownByTtl = (cacheCreation5mInputTokens ?? 0) + (cacheCreation1hInputTokens ?? 0);
    const cacheCreationFallbackTokens = Math.max(0, (usage.cacheCreationInputTokens ?? 0) - cacheCreationKnownByTtl);
    const hasDetailedAnthropicInputUsage = typeof usage.rawInputTokens === 'number'
        || typeof usage.cacheReadInputTokens === 'number'
        || typeof usage.cacheCreationInputTokens === 'number'
        || typeof cacheCreation5mInputTokens === 'number'
        || typeof cacheCreation1hInputTokens === 'number';

    const rawInputCostUSD = hasAnthropicCachePricing && typeof usage.rawInputTokens === 'number'
        ? toUsd(usage.rawInputTokens, pricing.inputPer1M)
        : undefined;
    const cacheReadCostUSD = hasAnthropicCachePricing && typeof usage.cacheReadInputTokens === 'number'
        ? toUsd(usage.cacheReadInputTokens, pricing.cacheReadPer1M)
        : undefined;
    const cacheCreationCostUSD = hasAnthropicCachePricing
        ? (
            toUsd(cacheCreation5mInputTokens ?? 0, pricing.cacheWrite5mPer1M)
            + toUsd(cacheCreation1hInputTokens ?? 0, pricing.cacheWrite1hPer1M ?? pricing.cacheWrite5mPer1M)
            + toUsd(cacheCreationFallbackTokens, pricing.cacheWrite5mPer1M)
        )
        : undefined;
    const inputCostUSD = hasAnthropicCachePricing
        ? (hasDetailedAnthropicInputUsage
            ? (
                (rawInputCostUSD ?? 0)
                + (cacheReadCostUSD ?? 0)
                + (cacheCreationCostUSD ?? 0)
            )
            : undefined)
        : (typeof usage.inputTokens === 'number'
            ? toUsd(usage.inputTokens, pricing.inputPer1M)
            : undefined);
    const outputCostUSD = typeof usage.outputTokens === 'number'
        ? toUsd(usage.outputTokens, pricing.outputPer1M)
        : undefined;
    const totalCostUSD = typeof inputCostUSD === 'number' && typeof outputCostUSD === 'number'
        ? inputCostUSD + outputCostUSD
        : undefined;

    return {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        rawInputTokens: usage.rawInputTokens,
        cacheReadInputTokens: usage.cacheReadInputTokens,
        cacheCreationInputTokens: usage.cacheCreationInputTokens,
        cacheCreation5mInputTokens,
        cacheCreation1hInputTokens,
        rawInputCostUSD,
        cacheReadCostUSD,
        cacheCreationCostUSD,
        inputCostUSD,
        outputCostUSD,
        totalCostUSD
    };
}

export function formatUsdCost(value: number): string {
    return `$${value.toFixed(2)}`;
}

export function formatApproxUsdCost(value: number): string {
    const digits = value >= 10 ? 0 : 1;
    return `~$${value.toFixed(digits)}`;
}
