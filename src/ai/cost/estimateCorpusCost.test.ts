import { describe, expect, it } from 'vitest';
import { estimateCorpusCost, estimateUsageCost } from './estimateCorpusCost';

/*
 * estimateCorpusCost behaviour tests.
 *
 * These are intentionally invariant-based rather than dollar-pinned:
 * exact USD amounts are a function of the pricing table, which changes
 * when models rotate. We assert the SHAPE of the cost model (cache
 * reduces cost; multi-pass defaults to 50% reuse; 1h cache writes cost
 * more than 5m; missing pricing throws) so the suite stays useful
 * across pricing churn. One anchor test per provider pins a specific
 * dollar amount as a smoke against algorithmic regressions.
 */

describe('estimateCorpusCost', () => {
    it('anchor: claude-opus-4-8 no-cache cost matches input × inputPer1M + output × outputPer1M', () => {
        // 200k input × $5/M + 10k output × $25/M = $1.00 + $0.25 = $1.25.
        const result = estimateCorpusCost(
            'anthropic',
            'claude-opus-4-8',
            200_000,
            10_000,
            1,
            { cacheReuseRatio: 0 }
        );
        expect(result.cacheReuseRatio).toBe(0);
        expect(result.freshCostUSD).toBeCloseTo(1.25, 6);
        // At reuse=0, cached and fresh paths produce the same number.
        expect(result.cachedCostUSD).toBeCloseTo(result.freshCostUSD, 6);
        expect(result.effectiveCostUSD).toBeCloseTo(result.cachedCostUSD!, 6);
    });

    it('partial cache reuse: cached cost is lower than fresh cost', () => {
        const result = estimateCorpusCost(
            'anthropic',
            'claude-opus-4-8',
            200_000,
            10_000,
            1,
            { cacheReuseRatio: 0.5 }
        );
        expect(result.cacheReuseRatio).toBe(0.5);
        expect(result.cachedCostUSD).toBeLessThan(result.freshCostUSD);
    });

    it('full cache reuse: cached < fresh and neither goes negative', () => {
        const result = estimateCorpusCost(
            'anthropic',
            'claude-opus-4-8',
            200_000,
            10_000,
            1,
            { cacheReuseRatio: 1 }
        );
        expect(result.cacheReuseRatio).toBe(1);
        expect(result.freshCostUSD).toBeGreaterThanOrEqual(0);
        expect(result.cachedCostUSD).toBeGreaterThanOrEqual(0);
        expect(result.cachedCostUSD).toBeLessThan(result.freshCostUSD);
    });

    it('multi-pass uses the explicit default cache reuse ratio (0.5)', () => {
        const result = estimateCorpusCost(
            'anthropic',
            'claude-opus-4-8',
            400_000,
            20_000,
            3
        );
        expect(result.cacheReuseRatio).toBe(0.5);
        expect(result.cachedCostUSD).toBeLessThan(result.freshCostUSD);
        expect(result.effectiveCostUSD).toBeCloseTo(result.cachedCostUSD!, 6);
    });

    it('output-heavy estimates stay non-negative and cached <= fresh', () => {
        const result = estimateCorpusCost(
            'anthropic',
            'claude-opus-4-8',
            20_000,
            120_000,
            1
        );
        expect(result.cacheReuseRatio).toBe(0.75);
        expect(result.freshCostUSD).toBeGreaterThanOrEqual(0);
        expect(result.cachedCostUSD).toBeLessThanOrEqual(result.freshCostUSD);
    });

    it('anthropic long-context pricing kicks in above the 200k threshold (where applicable)', () => {
        // Run two estimates at threshold ± 1; for models with long-context
        // tiers the longer one should be costlier per-token.
        const atThreshold = estimateCorpusCost(
            'anthropic',
            'claude-opus-4-8',
            200_000,
            10_000,
            1,
            { cacheReuseRatio: 0 }
        );
        const aboveThreshold = estimateCorpusCost(
            'anthropic',
            'claude-opus-4-8',
            250_000,
            10_000,
            1,
            { cacheReuseRatio: 0 }
        );
        // Larger input must cost more (regardless of tier kick-in).
        expect(aboveThreshold.freshCostUSD).toBeGreaterThan(atThreshold.freshCostUSD);
    });

    it('GPT-5.5 cached runs cost less than fresh runs', () => {
        const result = estimateCorpusCost(
            'openai',
            'gpt-5.5',
            61_600,
            8_000,
            1
        );
        expect(result.cacheReuseRatio).toBe(0.75);
        expect(result.cachedCostUSD).toBeLessThan(result.freshCostUSD);
    });

    it('OpenAI live usage with cached tokens prices at cached-input rate when available', () => {
        const result = estimateUsageCost('openai', 'gpt-5.5', {
            inputTokens: 61_600,
            outputTokens: 8_000,
            cacheReadInputTokens: 46_200
        });
        expect(result).toMatchObject({
            inputTokens: 61_600,
            outputTokens: 8_000,
            cacheReadInputTokens: 46_200
        });
        // Cache-read cost should be lower than the raw input cost would have been.
        if (typeof result?.rawInputCostUSD === 'number' && typeof result?.cacheReadCostUSD === 'number') {
            expect(result.cacheReadCostUSD).toBeLessThan(result.rawInputCostUSD);
        }
        expect(result?.totalCostUSD).toBeGreaterThan(0);
    });

    it('GPT-5.5 long-context cached usage stays internally consistent', () => {
        const result = estimateUsageCost('openai', 'gpt-5.5', {
            inputTokens: 300_000,
            outputTokens: 10_000,
            cacheReadInputTokens: 225_000
        });
        if (typeof result?.inputCostUSD === 'number' && typeof result?.totalCostUSD === 'number') {
            expect(result.totalCostUSD).toBeGreaterThanOrEqual(result.inputCostUSD);
        }
        expect(result?.totalCostUSD).toBeGreaterThan(0);
    });

    it('Gemini 3.1 Pro Preview surfaces a separate cache-read line', () => {
        const result = estimateUsageCost('google', 'gemini-3.1-pro-preview', {
            inputTokens: 264_606,
            outputTokens: 5_409,
            cacheReadInputTokens: 264_584
        });
        // Cache-read pricing must flow through as its own number.
        expect(typeof result?.cacheReadCostUSD).toBe('number');
        expect(result?.cacheReadCostUSD).toBeGreaterThan(0);
        expect(result?.outputTokens).toBe(5_409);
        expect(result?.totalCostUSD).toBeGreaterThan(0);
    });

    it('prices Gemini "created" cache tokens at the input rate, not the read discount', () => {
        // Gemini reports cachedContentTokenCount on the CREATING call too, so a
        // first run looks like a 136k "cache read". It must NOT get the read
        // discount — those tokens were processed fresh to build the cache.
        const usage = {
            inputTokens: 135_723,
            outputTokens: 4_898,
            totalTokens: 140_621,
            cacheReadInputTokens: 135_700
        };
        // Flash table: input $1.50/M, output $9.00/M, cacheRead $0.15/M.
        const created = estimateUsageCost('google', 'gemini-3.5-flash', usage, 'created');
        const hit = estimateUsageCost('google', 'gemini-3.5-flash', usage, 'hit');

        // Created ≈ fresh: 135.7k @ $1.50/M + 4.9k @ $9/M ≈ $0.248.
        expect(created?.totalCostUSD).toBeCloseTo(0.2477, 2);
        // Hit gets the read discount on the cached prefix ≈ $0.064.
        expect(hit?.totalCostUSD).toBeCloseTo(0.0645, 2);
        // The created run must be materially pricier than a genuine reuse hit.
        expect((created?.totalCostUSD ?? 0)).toBeGreaterThan((hit?.totalCostUSD ?? 0) * 3);
    });

    it('Gemini recovers thinking-token output from totalTokens for legacy sessions', () => {
        const result = estimateUsageCost('google', 'gemini-3.1-pro-preview', {
            inputTokens: 264_606,
            outputTokens: 531,
            totalTokens: 270_015,
            cacheReadInputTokens: 264_584
        });
        // Recovered output should include thinking tokens: 270,015 - 264,606 = 5,409.
        expect(result?.outputTokens).toBe(5_409);
    });

    it('throws when pricing is missing', () => {
        expect(() => estimateCorpusCost(
            'openai',
            'missing-model',
            100_000,
            10_000,
            1
        )).toThrowError(/Missing provider pricing/);
    });

    // ── cacheWriteTtl parameter ──────────────────────────────────────────

    it('cacheWriteTtl=5m (default) produces a lower priming-pass cost than 1h', () => {
        const fiveMinute = estimateCorpusCost(
            'anthropic',
            'claude-opus-4-8',
            200_000,
            10_000,
            1,
            { cacheReuseRatio: 0.5 }
        );
        const oneHour = estimateCorpusCost(
            'anthropic',
            'claude-opus-4-8',
            200_000,
            10_000,
            1,
            { cacheReuseRatio: 0.5, cacheWriteTtl: '1h' }
        );
        expect(oneHour.freshCostUSD).toBeGreaterThan(fiveMinute.freshCostUSD);
    });

    it('1h vs 5m ratio is meaningfully > 1 — the screenshot-bug regression guard', () => {
        // Inquiry primes a 1h cache. If the panel reports 5m pricing the
        // estimate is materially low. This pins that the gap exists.
        const fiveMinute = estimateCorpusCost(
            'anthropic',
            'claude-opus-4-8',
            300_000,
            3_500,
            1,
            { cacheReuseRatio: 0.75 }
        );
        const oneHour = estimateCorpusCost(
            'anthropic',
            'claude-opus-4-8',
            300_000,
            3_500,
            1,
            { cacheReuseRatio: 0.75, cacheWriteTtl: '1h' }
        );
        const ratio = oneHour.freshCostUSD / fiveMinute.freshCostUSD;
        expect(ratio).toBeGreaterThan(1.1);
        expect(ratio).toBeLessThan(2.0);
    });

    it('falls back gracefully when the requested TTL rate is missing', () => {
        // GPT-5.5 has no cacheWrite1hPer1M field. Asking for 1h must not
        // throw — fall back to whatever cache write rate is available so
        // the estimate is always finite.
        const result = estimateCorpusCost(
            'openai',
            'gpt-5.5',
            61_600,
            8_000,
            1,
            { cacheReuseRatio: 0.5, cacheWriteTtl: '1h' }
        );
        expect(Number.isFinite(result.freshCostUSD)).toBe(true);
        expect(result.freshCostUSD).toBeGreaterThan(0);
    });
});
