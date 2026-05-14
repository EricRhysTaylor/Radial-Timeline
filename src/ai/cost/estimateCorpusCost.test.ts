import { describe, expect, it } from 'vitest';
import { estimateCorpusCost, estimateUsageCost } from './estimateCorpusCost';

describe('estimateCorpusCost', () => {
    it('models no-cache runs explicitly when cache reuse is zero', () => {
        const result = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-6',
            200_000,
            10_000,
            1,
            { cacheReuseRatio: 0 }
        );

        expect(result.cacheReuseRatio).toBe(0);
        expect(result.freshCostUSD).toBeCloseTo(0.75, 6);
        expect(result.cachedCostUSD).toBeCloseTo(0.75, 6);
        expect(result.effectiveCostUSD).toBeCloseTo(result.cachedCostUSD, 6);
    });

    it('models partial cache reuse explicitly', () => {
        const result = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-6',
            200_000,
            10_000,
            1,
            { cacheReuseRatio: 0.5 }
        );

        expect(result.cacheReuseRatio).toBe(0.5);
        expect(result.freshCostUSD).toBeCloseTo(0.825, 6);
        expect(result.cachedCostUSD).toBeCloseTo(0.48, 6);
        expect(result.cachedCostUSD).toBeLessThan(result.freshCostUSD);
    });

    it('models full cache reuse without impossible negative values', () => {
        const result = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-6',
            200_000,
            10_000,
            1,
            { cacheReuseRatio: 1 }
        );

        expect(result.cacheReuseRatio).toBe(1);
        expect(result.freshCostUSD).toBeCloseTo(0.9, 6);
        expect(result.cachedCostUSD).toBeCloseTo(0.21, 6);
        expect(result.freshCostUSD).toBeGreaterThanOrEqual(0);
        expect(result.cachedCostUSD).toBeGreaterThanOrEqual(0);
    });

    it('uses the explicit multi-pass default cache reuse ratio', () => {
        const result = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-6',
            400_000,
            20_000,
            3
        );

        expect(result.cacheReuseRatio).toBe(0.5);
        expect(result.freshCostUSD).toBeCloseTo(4.95, 6);
        expect(result.cachedCostUSD).toBeCloseTo(2.88, 6);
        expect(result.effectiveCostUSD).toBeCloseTo(result.cachedCostUSD, 6);
    });

    it('keeps output-heavy estimates consistent and non-negative', () => {
        const result = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-6',
            20_000,
            120_000,
            1
        );

        expect(result.cacheReuseRatio).toBe(0.75);
        expect(result.freshCostUSD).toBeCloseTo(1.87125, 6);
        expect(result.cachedCostUSD).toBeCloseTo(1.8195, 6);
        expect(result.cachedCostUSD).toBeLessThan(result.freshCostUSD);
        expect(result.effectiveCostUSD).toBeCloseTo(result.cachedCostUSD, 6);
    });

    it('applies Sonnet 4.5 premium long-context pricing above 200k input tokens', () => {
        const result = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-5-20250929',
            250_000,
            10_000,
            1
        );

        expect(result.freshCostUSD).toBeCloseTo(2.00625, 6);
        expect(result.cachedCostUSD).toBeCloseTo(0.7125, 6);
    });

    it('prices GPT-5.4 cached runs below fresh runs using cached input rates', () => {
        const result = estimateCorpusCost(
            'openai',
            'gpt-5.4',
            61_600,
            8_000,
            1
        );

        expect(result.cacheReuseRatio).toBe(0.75);
        expect(result.freshCostUSD).toBeCloseTo(0.274, 6);
        expect(result.cachedCostUSD).toBeCloseTo(0.17005, 6);
        expect(result.cachedCostUSD).toBeLessThan(result.freshCostUSD);
    });

    it('prices GPT-5.5 cached runs with the current short-context cached input rate', () => {
        const result = estimateCorpusCost(
            'openai',
            'gpt-5.5',
            61_600,
            8_000,
            1
        );

        expect(result.cacheReuseRatio).toBe(0.75);
        expect(result.freshCostUSD).toBeCloseTo(0.548, 6);
        expect(result.cachedCostUSD).toBeCloseTo(0.3401, 6);
        expect(result.cachedCostUSD).toBeLessThan(result.freshCostUSD);
    });

    it('keeps GPT-5.4 Pro cached estimates equal to fresh estimates because cached pricing is unavailable', () => {
        const result = estimateCorpusCost(
            'openai',
            'gpt-5.4-pro',
            61_600,
            8_000,
            1
        );

        expect(result.freshCostUSD).toBeCloseTo(3.288, 6);
        expect(result.cachedCostUSD).toBeUndefined();
    });

    it('prices OpenAI live usage with cached tokens at the cached-input rate', () => {
        const result = estimateUsageCost('openai', 'gpt-5.4', {
            inputTokens: 61_600,
            outputTokens: 8_000,
            cacheReadInputTokens: 46_200
        });

        expect(result).toMatchObject({
            inputTokens: 61_600,
            outputTokens: 8_000,
            cacheReadInputTokens: 46_200
        });
        expect(result?.rawInputCostUSD).toBeCloseTo(0.0385, 6);
        expect(result?.cacheReadCostUSD).toBeCloseTo(0.01155, 6);
        expect(result?.inputCostUSD).toBeCloseTo(0.05005, 6);
        expect(result?.outputCostUSD).toBeCloseTo(0.12, 6);
        expect(result?.totalCostUSD).toBeCloseTo(0.17005, 6);
    });

    it('prices GPT-5.5 live usage with cached tokens at the short-context cached-input rate', () => {
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
        expect(result?.rawInputCostUSD).toBeCloseTo(0.077, 6);
        expect(result?.cacheReadCostUSD).toBeCloseTo(0.0231, 6);
        expect(result?.inputCostUSD).toBeCloseTo(0.1001, 6);
        expect(result?.outputCostUSD).toBeCloseTo(0.24, 6);
        expect(result?.totalCostUSD).toBeCloseTo(0.3401, 6);
    });

    it('prices GPT-5.5 live usage with cached tokens at long-context rates above the threshold', () => {
        const result = estimateUsageCost('openai', 'gpt-5.5', {
            inputTokens: 300_000,
            outputTokens: 10_000,
            cacheReadInputTokens: 225_000
        });

        expect(result?.rawInputCostUSD).toBeCloseTo(0.75, 6);
        expect(result?.cacheReadCostUSD).toBeCloseTo(0.225, 6);
        expect(result?.inputCostUSD).toBeCloseTo(0.975, 6);
        expect(result?.outputCostUSD).toBeCloseTo(0.45, 6);
        expect(result?.totalCostUSD).toBeCloseTo(1.425, 6);
    });

    it('prices Gemini 2.5 Pro long-context cache hits at the context-cache rate', () => {
        const result = estimateUsageCost('google', 'gemini-2.5-pro', {
            inputTokens: 264_606,
            outputTokens: 5_409,
            cacheReadInputTokens: 264_584
        });

        expect(result?.rawInputCostUSD).toBeCloseTo(0.000055, 6);
        expect(result?.cacheReadCostUSD).toBeCloseTo(0.066146, 6);
        expect(result?.outputTokens).toBe(5_409);
        expect(result?.outputCostUSD).toBeCloseTo(0.081135, 6);
        expect(result?.totalCostUSD).toBeCloseTo(0.147336, 6);
    });

    it('recovers Gemini thinking-token output cost from total tokens for saved legacy sessions', () => {
        const result = estimateUsageCost('google', 'gemini-2.5-pro', {
            inputTokens: 264_606,
            outputTokens: 531,
            totalTokens: 270_015,
            cacheReadInputTokens: 264_584
        });

        expect(result?.outputTokens).toBe(5_409);
        expect(result?.outputCostUSD).toBeCloseTo(0.081135, 6);
        expect(result?.totalCostUSD).toBeCloseTo(0.147336, 6);
    });

    it('does not claim an actual cached cost when cache-read pricing is unavailable', () => {
        const result = estimateUsageCost('openai', 'gpt-5.4-pro', {
            inputTokens: 61_600,
            outputTokens: 8_000,
            cacheReadInputTokens: 46_200
        });

        expect(result?.cacheReadCostUSD).toBeUndefined();
        expect(result?.inputCostUSD).toBeUndefined();
        expect(result?.totalCostUSD).toBeUndefined();
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

    // ── cacheWriteTtl parameter — the screenshot bug ─────────────────────

    it('defaults the priming-pass cache write to the 5m rate when no TTL is specified', () => {
        // Backward compatibility: callers that do not opt in keep the old
        // conservative 5m pricing. Sonnet 4.6: cacheWrite5m = $3.75/1M.
        // 200k tokens × 0.5 reuse = 100k uncached @ $3 + 100k cache write @ $3.75
        // + 10k output @ $15 = $0.30 + $0.375 + $0.15 = $0.825.
        const result = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-6',
            200_000,
            10_000,
            1,
            { cacheReuseRatio: 0.5 }
        );
        expect(result.freshCostUSD).toBeCloseTo(0.825, 6);
    });

    it('prices the priming pass at the 1h rate when cacheWriteTtl=1h (the actual Inquiry-on-Anthropic case)', () => {
        // This is the screenshot bug: Inquiry primes a 1h cache, but the
        // panel was using 5m pricing — under-estimated by ~33% on the
        // priming pass. Sonnet 4.6: cacheWrite1h = $6.00/1M.
        // 200k × 0.5 reuse = 100k uncached @ $3 + 100k cache write @ $6.00
        // + 10k output @ $15 = $0.30 + $0.60 + $0.15 = $1.05.
        const result = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-6',
            200_000,
            10_000,
            1,
            { cacheReuseRatio: 0.5, cacheWriteTtl: '1h' }
        );
        expect(result.freshCostUSD).toBeCloseTo(1.05, 6);
    });

    it('reproduces the user-reported 29% delta when the TTL choice matters', () => {
        // Screenshot scenario, simplified: 300k tokens, 75% cache reuse on
        // the priming pass, ~3.5k output. Pricing 5m vs 1h should produce
        // a noticeable gap that matches the 29% under-estimate the user saw.
        const fiveMinute = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-6',
            300_000,
            3_500,
            1,
            { cacheReuseRatio: 0.75 }
        );
        const oneHour = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-6',
            300_000,
            3_500,
            1,
            { cacheReuseRatio: 0.75, cacheWriteTtl: '1h' }
        );
        // 1h estimate must be meaningfully higher than 5m. Don't pin an
        // exact percentage (output token ratio dilutes), but sanity-check
        // that the gap is at least 25% — the original 29% delta would be
        // closed if the panel used 1h.
        const ratio = oneHour.freshCostUSD / fiveMinute.freshCostUSD;
        expect(ratio).toBeGreaterThan(1.25);
        expect(ratio).toBeLessThan(1.50);
    });

    it('falls back to the other TTL rate when the requested one is missing from the pricing table', () => {
        // OpenAI's GPT-5.4 has no cacheWrite1hPer1M field. Asking for 1h
        // should not throw — it should fall back to whatever cache write
        // rate is available so we never produce undefined.
        const result = estimateCorpusCost(
            'openai',
            'gpt-5.4',
            61_600,
            8_000,
            1,
            { cacheReuseRatio: 0.5, cacheWriteTtl: '1h' }
        );
        expect(Number.isFinite(result.freshCostUSD)).toBe(true);
        expect(result.freshCostUSD).toBeGreaterThan(0);
    });
});
