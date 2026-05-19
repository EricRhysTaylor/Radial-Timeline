/**
 * Pure cache-status helpers extracted from InquiryView (R1 chunk 1).
 *
 * These are deliberately the smallest, fully-pure seam: no DOM, no timers,
 * no session store, no run lifecycle, no shared mutation. Behaviour is
 * byte-identical to the former InquiryView private methods — InquiryView
 * keeps thin wrappers delegating here so all call sites are unchanged.
 */
import type { AIRunAdvancedContext } from '../../ai/types';
import type { InquiryRunTrace } from '../runner/types';
import type { InquiryResult } from '../state';
import type { InquirySession } from '../sessionTypes';
import type { EngineRecentRunSnapshot, EngineCacheWindowSnapshot } from './inquiryEngineRenderer';
import { estimateUsageCost } from '../../ai/cost/estimateCorpusCost';
import { buildInquirySourcesViewModel } from '../services/inquirySources';

/**
 * Rank a reuse advanced-context for "best available" selection. Only a
 * payload-proven warm context scores above zero (truth-over-optimism).
 */
export function scoreReuseAdvancedContext(context: AIRunAdvancedContext | null): number {
    if (!context || context.reuseState !== 'warm') return 0;
    const ratioScore = typeof context.cachedStableRatio === 'number' && Number.isFinite(context.cachedStableRatio)
        ? Math.max(0, context.cachedStableRatio)
        : 0;
    const tokenScore = typeof context.cachedStableTokens === 'number' && Number.isFinite(context.cachedStableTokens)
        ? Math.max(0, context.cachedStableTokens)
        : 0;
    const inputScore = typeof context.totalInputTokens === 'number' && Number.isFinite(context.totalInputTokens)
        ? Math.max(0, context.totalInputTokens)
        : 0;
    return (ratioScore * 1_000_000) + tokenScore + (inputScore * 0.001);
}

/**
 * Which Anthropic cache TTL the provider actually honoured for a run,
 * derived solely from the returned token-usage payload.
 */
export function getAnthropicAcceptedCacheTtl(
    trace: InquiryRunTrace | null | undefined
): '5m' | '1h' | 'mixed' | 'unknown' {
    const usage = trace?.usage;
    const has5m = !!(usage?.cacheCreation5mInputTokens && usage.cacheCreation5mInputTokens > 0);
    const has1h = !!(usage?.cacheCreation1hInputTokens && usage.cacheCreation1hInputTokens > 0);
    if (has5m && has1h) return 'mixed';
    if (has1h) return '1h';
    if (has5m) return '5m';
    return 'unknown';
}

/** Stable `provider::model` key for a completed run, or null if unknown. */
export function getDispatchEngineKey(result: InquiryResult): string | null {
    const provider = (result.aiProvider ?? '').trim().toLowerCase();
    const model = (result.aiModelResolved || result.aiModelRequested || '').trim().toLowerCase();
    if (!provider || !model) return null;
    return `${provider}::${model}`;
}

/**
 * Usage-based provider cost for a completed run, derived solely from the
 * result's provider/model + token-usage payload. Returns undefined for
 * unsupported providers, missing model/usage, or pricing failures.
 */
export function resolveActualUsageCostForResult(result: InquiryResult): number | undefined {
    const provider = (result.aiProvider ?? '').trim().toLowerCase();
    if (provider !== 'anthropic' && provider !== 'openai' && provider !== 'google') return undefined;
    const modelId = result.aiModelResolved || result.aiModelRequested;
    if (!modelId || !result.tokenUsage) return undefined;
    try {
        const breakdown = estimateUsageCost(provider, modelId, result.tokenUsage);
        return typeof breakdown?.totalCostUSD === 'number' && Number.isFinite(breakdown.totalCostUSD)
            ? breakdown.totalCostUSD
            : undefined;
    } catch {
        return undefined;
    }
}

/**
 * Shape the engine popover's "recent run" snapshot from a completed,
 * non-error result. The caller (InquiryView) owns the null/error guard
 * and resolves `citationsRequested` (settings + engine derived).
 */
export function buildEngineRecentRunSnapshot(
    result: InquiryResult,
    citationsRequested: boolean
): EngineRecentRunSnapshot {
    const sourcesVM = buildInquirySourcesViewModel(
        result.citations,
        result.evidenceDocumentMeta,
        result.findings
    );
    return {
        citationsRequested,
        citationCount: sourcesVM.totalCount,
        tokenUsage: result.tokenUsage,
        actualCostUSD: resolveActualUsageCostForResult(result)
    };
}

/**
 * Shape the cache-window snapshot from an already-resolved session. The
 * caller (InquiryView) owns the session-store lookup and injects `now`.
 * Returns undefined when there is no still-open window.
 */
export function buildEngineCacheWindowSnapshotFromSession(
    session: Pick<InquirySession, 'cacheWindowExpiresAt' | 'cachedStableTokens'> | null | undefined,
    now: number
): EngineCacheWindowSnapshot | undefined {
    if (!session?.cacheWindowExpiresAt || session.cacheWindowExpiresAt <= now) return undefined;
    const cachedTokens = typeof session.cachedStableTokens === 'number' && Number.isFinite(session.cachedStableTokens)
        ? Math.max(0, Math.floor(session.cachedStableTokens))
        : undefined;
    return {
        expiresAt: session.cacheWindowExpiresAt,
        cachedTokens
    };
}
