import type { AIProviderId, AnthropicCacheTtl } from '../types';
import { resolveProviderModelPricing, isPromoActive, type PromoPricing, type ResolvedProviderModelPricing } from './providerPricing';
import type { TokenUsage } from '../usage/providerUsage';

export interface CorpusCostEstimate {
    provider: AIProviderId;
    modelId: string;
    inputTokens: number;
    outputTokens: number;
    expectedPasses: number;
    cacheReuseRatio: number;
    freshCostUSD: number;
    cachedCostUSD?: number;
    effectiveCostUSD?: number;
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
    /**
     * Which TTL the run will request when priming the provider cache.
     * Anthropic charges 1h writes at ~2× input price and 5m writes at ~1.25×;
     * picking the wrong one produces a ~33% under- or over-estimate on the
     * priming pass. Defaults to '5m' to preserve the historical conservative
     * estimate for non-Anthropic-Inquiry callers; Inquiry-on-Anthropic must
     * pass '1h' to match ANTHROPIC_REQUESTED_CACHE_TTL.
     */
    cacheWriteTtl?: AnthropicCacheTtl;
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

function hasCacheReadPricing(pricing: ResolvedProviderModelPricing): boolean {
    return typeof pricing.cacheReadPer1M === 'number' && Number.isFinite(pricing.cacheReadPer1M);
}

function hasExplicitCacheWritePricing(pricing: ResolvedProviderModelPricing): boolean {
    return (typeof pricing.cacheWrite5mPer1M === 'number' && Number.isFinite(pricing.cacheWrite5mPer1M))
        || (typeof pricing.cacheWrite1hPer1M === 'number' && Number.isFinite(pricing.cacheWrite1hPer1M));
}

/**
 * Pick the per-1M cache-write rate that matches the run's requested TTL.
 * Falls back to the other TTL when the requested one is missing from the
 * pricing table — better an off-by-1.6× estimate than no estimate at all.
 */
function resolveCacheWriteRatePer1M(
    pricing: ResolvedProviderModelPricing,
    cacheWriteTtl: AnthropicCacheTtl
): number | undefined {
    if (cacheWriteTtl === '1h') {
        return pricing.cacheWrite1hPer1M ?? pricing.cacheWrite5mPer1M;
    }
    return pricing.cacheWrite5mPer1M ?? pricing.cacheWrite1hPer1M;
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
    cacheWriteTtl: AnthropicCacheTtl;
}): number | undefined {
    const pricing = resolveProviderModelPricing(params.provider, params.modelId, params.inputTokens);
    const reusedInputTokens = Math.max(0, Math.floor(params.inputTokens * params.cacheReuseRatio));
    const uncachedInputTokens = Math.max(0, params.inputTokens - reusedInputTokens);
    const canReadFromCache = hasCacheReadPricing(pricing);
    const canWriteToCacheExplicitly = hasExplicitCacheWritePricing(pricing);
    if (params.scenario === 'cached' && !canReadFromCache) return undefined;

    const scenarioInputCostUSD = params.scenario === 'cached'
        ? (
            toUsd(uncachedInputTokens, pricing.inputPer1M)
            + toUsd(reusedInputTokens, pricing.cacheReadPer1M)
        )
        : (canReadFromCache && canWriteToCacheExplicitly
            ? (
                toUsd(uncachedInputTokens, pricing.inputPer1M)
                + toUsd(
                    reusedInputTokens,
                    resolveCacheWriteRatePer1M(pricing, params.cacheWriteTtl)
                )
            )
            : toUsd(params.inputTokens, pricing.inputPer1M));
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
    const cacheWriteTtl: AnthropicCacheTtl = options?.cacheWriteTtl ?? '5m';
    const freshCostUSD = buildEstimatedInputCostUSD({
        provider,
        modelId,
        inputTokens,
        outputTokens,
        expectedPasses: passes,
        cacheReuseRatio,
        scenario: 'fresh',
        cacheWriteTtl
    });
    if (typeof freshCostUSD !== 'number' || !Number.isFinite(freshCostUSD)) {
        throw new Error(`Fresh cost estimate unavailable for ${provider}:${modelId}`);
    }
    const cachedCostUSD = buildEstimatedInputCostUSD({
        provider,
        modelId,
        inputTokens,
        outputTokens,
        expectedPasses: passes,
        cacheReuseRatio,
        scenario: 'cached',
        cacheWriteTtl
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
    usage?: TokenUsage | null,
    /**
     * Whether the run REUSED a prior cache ('hit') or CREATED one this run
     * ('created'). Required for providers like Gemini that report
     * `cachedContentTokenCount` on the creating call too: on a 'created' run
     * those tokens were processed fresh, so they must be priced at the input
     * rate, NOT the cache-read discount. Omit when unknown (treated as a read,
     * preserving prior behavior for providers that only report true reuse).
     */
    cacheProvenance?: 'hit' | 'created'
): UsageCostEstimate | null {
    if (!usage) return null;
    const totalInputTokens = typeof usage.inputTokens === 'number'
        ? usage.inputTokens
        : [usage.rawInputTokens, usage.cacheReadInputTokens, usage.cacheCreationInputTokens]
            .filter((value): value is number => typeof value === 'number')
            .reduce((sum, value) => sum + value, 0);
    const pricing = resolveProviderModelPricing(provider, modelId, totalInputTokens);
    const hasExplicitCacheWrite = hasExplicitCacheWritePricing(pricing);
    // On a 'created' run, the "cache read" tokens were processed fresh to build
    // the cache, so they bill at the input rate. On a reuse 'hit' (or unknown),
    // they bill at the discounted cache-read rate.
    const cacheReadRatePer1M = cacheProvenance === 'created'
        ? pricing.inputPer1M
        : pricing.cacheReadPer1M;
    const cacheReadInputTokenCount = typeof usage.cacheReadInputTokens === 'number' ? usage.cacheReadInputTokens : 0;
    const cacheCreationInputTokenCount = typeof usage.cacheCreationInputTokens === 'number' ? usage.cacheCreationInputTokens : 0;
    const cacheCreation5mInputTokens = usage.cacheCreation5mInputTokens;
    const cacheCreation1hInputTokens = usage.cacheCreation1hInputTokens;
    const cacheCreation5mInputTokenCount = typeof cacheCreation5mInputTokens === 'number' ? cacheCreation5mInputTokens : 0;
    const cacheCreation1hInputTokenCount = typeof cacheCreation1hInputTokens === 'number' ? cacheCreation1hInputTokens : 0;
    const hasPositiveCacheRead = cacheReadInputTokenCount > 0;
    const cacheCreationKnownByTtl = cacheCreation5mInputTokenCount + cacheCreation1hInputTokenCount;
    const cacheCreationFallbackTokens = Math.max(0, cacheCreationInputTokenCount - cacheCreationKnownByTtl);
    const hasPositiveCacheCreation = cacheCreationKnownByTtl > 0 || cacheCreationFallbackTokens > 0;
    const inferredRawInputTokens = typeof usage.rawInputTokens === 'number'
        ? usage.rawInputTokens
        : (typeof usage.inputTokens === 'number'
            ? Math.max(0, usage.inputTokens - cacheReadInputTokenCount - cacheCreationInputTokenCount)
            : undefined);
    const hasDetailedInputUsage = typeof inferredRawInputTokens === 'number'
        || typeof usage.cacheReadInputTokens === 'number'
        || typeof usage.cacheCreationInputTokens === 'number'
        || typeof cacheCreation5mInputTokens === 'number'
        || typeof cacheCreation1hInputTokens === 'number';

    const rawInputCostUSD = hasDetailedInputUsage && typeof inferredRawInputTokens === 'number'
        ? toUsd(inferredRawInputTokens, pricing.inputPer1M)
        : undefined;
    const cacheReadCostUSD = typeof usage.cacheReadInputTokens === 'number'
        && typeof cacheReadRatePer1M === 'number' && Number.isFinite(cacheReadRatePer1M)
        ? toUsd(usage.cacheReadInputTokens, cacheReadRatePer1M)
        : undefined;
    const cacheCreationCostUSD = hasExplicitCacheWrite
        ? (
            toUsd(cacheCreation5mInputTokenCount, typeof pricing.cacheWrite5mPer1M === 'number' ? pricing.cacheWrite5mPer1M : pricing.cacheWrite1hPer1M)
            + toUsd(cacheCreation1hInputTokenCount, typeof pricing.cacheWrite1hPer1M === 'number' ? pricing.cacheWrite1hPer1M : pricing.cacheWrite5mPer1M)
            + toUsd(cacheCreationFallbackTokens, typeof pricing.cacheWrite5mPer1M === 'number' ? pricing.cacheWrite5mPer1M : pricing.cacheWrite1hPer1M)
        )
        : undefined;
    const rawInputCostForTotal = typeof rawInputCostUSD === 'number' ? rawInputCostUSD : 0;
    const cacheReadCostForTotal = typeof cacheReadCostUSD === 'number' ? cacheReadCostUSD : 0;
    const cacheCreationCostForTotal = typeof cacheCreationCostUSD === 'number' ? cacheCreationCostUSD : 0;
    const canPriceDetailedInput = hasDetailedInputUsage
        && (typeof inferredRawInputTokens !== 'number' || typeof rawInputCostUSD === 'number')
        && (!hasPositiveCacheRead || typeof cacheReadCostUSD === 'number')
        && (!hasPositiveCacheCreation || typeof cacheCreationCostUSD === 'number');
    const inputCostUSD = hasDetailedInputUsage
        ? (canPriceDetailedInput
            ? (
                rawInputCostForTotal
                + cacheReadCostForTotal
                + cacheCreationCostForTotal
            )
            : undefined)
        : (typeof usage.inputTokens === 'number'
            ? toUsd(usage.inputTokens, pricing.inputPer1M)
            : undefined);
    const billableOutputTokens = typeof usage.outputTokens === 'number'
        ? (provider === 'google' && typeof usage.inputTokens === 'number' && typeof usage.totalTokens === 'number'
            ? Math.max(usage.outputTokens, usage.totalTokens - usage.inputTokens)
            : usage.outputTokens)
        : undefined;
    const outputCostUSD = typeof billableOutputTokens === 'number'
        ? toUsd(billableOutputTokens, pricing.outputPer1M)
        : undefined;
    const totalCostUSD = typeof inputCostUSD === 'number' && typeof outputCostUSD === 'number'
        ? inputCostUSD + outputCostUSD
        : undefined;

    return {
        inputTokens: usage.inputTokens,
        outputTokens: billableOutputTokens,
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

export function formatExactUsdCost(value: number): string {
    if (!Number.isFinite(value) || value < 0) return 'unavailable';
    if (value === 0) return '$0.00';
    if (value >= 1) return `$${value.toFixed(2)}`;
    if (value >= 0.01) return `$${value.toFixed(3)}`;
    if (value >= 0.001) return `$${value.toFixed(4)}`;
    return `$${value.toFixed(6)}`;
}

export function formatApproxUsdCost(value: number): string {
    const digits = value >= 10 ? 0 : 1;
    return `~$${value.toFixed(digits)}`;
}
