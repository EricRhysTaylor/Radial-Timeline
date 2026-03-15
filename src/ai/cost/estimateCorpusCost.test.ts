import { describe, expect, it } from 'vitest';
import { estimateCorpusCost } from './estimateCorpusCost';

describe('estimateCorpusCost', () => {
    it('calculates anthropic sonnet cost', () => {
        const result = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-6',
            1_000_000,
            100_000,
            1
        );

        expect(result.freshCostUSD).toBeCloseTo(4.5, 6);
        expect(result.cachedCostUSD).toBeCloseTo(2.4, 6);
    });

    it('keeps cached cost below fresh cost', () => {
        const result = estimateCorpusCost(
            'openai',
            'gpt-5.4',
            600_000,
            40_000,
            1
        );

        expect(result.cachedCostUSD).toBeLessThan(result.freshCostUSD);
    });

    it('charges more for multi-pass runs', () => {
        const singlePass = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-6',
            400_000,
            20_000,
            1
        );
        const multiPass = estimateCorpusCost(
            'anthropic',
            'claude-sonnet-4-6',
            400_000,
            20_000,
            3
        );

        expect(multiPass.freshCostUSD).toBeCloseTo(singlePass.freshCostUSD * 3, 6);
        expect(multiPass.cachedCostUSD).toBeCloseTo(singlePass.cachedCostUSD * 3, 6);
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
