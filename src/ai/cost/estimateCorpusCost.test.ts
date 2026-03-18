import { describe, expect, it } from 'vitest';
import { estimateCorpusCost } from './estimateCorpusCost';

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

    it('throws when pricing is missing', () => {
        expect(() => estimateCorpusCost(
            'openai',
            'missing-model',
            100_000,
            10_000,
            1
        )).toThrowError(/Missing provider pricing/);
    });
});
