import { describe, expect, it } from 'vitest';
import {
    buildUsageCostBreakdown,
    formatUsageCostBreakdownLines,
    resolveContentLogsRoot,
    resolveLogsRoot
} from './log';

describe('log roots', () => {
    it('resolves the shared concise log root', () => {
        expect(resolveLogsRoot()).toBe('Radial Timeline/Logs');
    });

    it('resolves the shared content log root', () => {
        expect(resolveContentLogsRoot()).toBe('Radial Timeline/Logs/Content');
    });
});

describe('buildUsageCostBreakdown', () => {
    it('builds a cache-aware Anthropic cost breakdown from aggregated usage', () => {
        const breakdown = buildUsageCostBreakdown('anthropic', 'claude-sonnet-4-6', {
            inputTokens: 185_581,
            outputTokens: 18_523,
            rawInputTokens: 53_581,
            cacheReadInputTokens: 120_000,
            cacheCreationInputTokens: 12_000,
            cacheCreation5mInputTokens: 10_000,
            cacheCreation1hInputTokens: 2_000
        });

        expect(breakdown?.inputTokens).toBe(185_581);
        expect(breakdown?.outputTokens).toBe(18_523);
        expect(breakdown?.rawInputTokens).toBe(53_581);
        expect(breakdown?.cacheReadInputTokens).toBe(120_000);
        expect(breakdown?.cacheCreationInputTokens).toBe(12_000);
        expect(breakdown?.cacheCreation5mInputTokens).toBe(10_000);
        expect(breakdown?.cacheCreation1hInputTokens).toBe(2_000);
        expect(breakdown?.rawInputCostUSD).toBeCloseTo(0.160743, 6);
        expect(breakdown?.cacheReadCostUSD).toBeCloseTo(0.036, 6);
        expect(breakdown?.cacheCreationCostUSD).toBeCloseTo(0.0495, 6);
        expect(breakdown?.inputCostUSD).toBeCloseTo(0.246243, 6);
        expect(breakdown?.outputCostUSD).toBeCloseTo(0.277845, 6);
        expect(breakdown?.totalCostUSD).toBeCloseTo(0.524088, 6);
    });

    it('formats readable cost breakdown log lines', () => {
        const lines = formatUsageCostBreakdownLines('anthropic', 'claude-sonnet-4-6', {
            inputTokens: 185_581,
            outputTokens: 18_523,
            rawInputTokens: 53_581,
            cacheReadInputTokens: 120_000,
            cacheCreationInputTokens: 12_000,
            cacheCreation5mInputTokens: 10_000,
            cacheCreation1hInputTokens: 2_000
        }, {
            executionInputTokens: 185_581,
            expectedOutputTokens: 18_523,
            expectedPasses: 1
        });

        expect(lines).toContain('## Cost Breakdown');
        expect(lines).toContain('- Billed input total: ~185,581 tokens');
        expect(lines).toContain('- Raw input: ~53,581 tokens');
        expect(lines).toContain('- Cache read: ~120,000 tokens');
        expect(lines).toContain('- Cache write: ~12,000 tokens');
        expect(lines).toContain('- Output: ~18,523 tokens');
        // The "Estimated fresh" line now reflects the 1h cache-write
        // surcharge that Anthropic Inquiry runs actually pay on the
        // priming pass. The old $0.94 value used the 5m rate and
        // under-estimated by ~33%; $1.25 matches the actual 1h pricing
        // that the live run is billed at.
        expect(lines).toContain('- Estimated fresh: $1.25');
        expect(lines).toContain('- Estimated cached: $0.46');
        expect(lines).toContain('- Effective cost: $0.52');
        expect(lines).toContain('## Cost Accuracy');
        expect(lines).toContain('- Estimated: $0.46');
        expect(lines).toContain('- Actual: $0.52');
        expect(lines).toContain('- Delta: -12.5%');
    });

    it('uses the fresh estimate for cost accuracy when Anthropic created cache but did not hit it', () => {
        const lines = formatUsageCostBreakdownLines('anthropic', 'claude-sonnet-4-6', {
            inputTokens: 307_895,
            outputTokens: 3_165,
            rawInputTokens: 26,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 307_869
        }, {
            executionInputTokens: 307_895,
            expectedOutputTokens: 3_165,
            expectedPasses: 1
        });

        const estimatedFreshLine = lines.find(line => line.startsWith('- Estimated fresh: '));
        const estimatedCachedLine = lines.find(line => line.startsWith('- Estimated cached: '));
        const estimatedLine = lines.find(line => line.startsWith('- Estimated: '));
        expect(estimatedFreshLine).toBeTruthy();
        expect(estimatedCachedLine).toBeTruthy();
        expect(estimatedLine).toBe(estimatedFreshLine?.replace('- Estimated fresh: ', '- Estimated: '));
        expect(lines.some(line => line.startsWith('- Actual: $'))).toBe(true);
    });

    it('omits cost accuracy when actual cost is unavailable', () => {
        const lines = formatUsageCostBreakdownLines('anthropic', 'claude-sonnet-4-6', {
            outputTokens: 10_000
        }, {
            executionInputTokens: 100_000,
            expectedOutputTokens: 10_000,
            expectedPasses: 1
        });

        expect(lines).toContain('## Cost Breakdown');
        expect(lines).toContain('- Billed input total: unavailable');
        expect(lines).toContain('- Raw input: unavailable');
        expect(lines).toContain('- Effective cost: unavailable');
        expect(lines).not.toContain('## Cost Accuracy');
    });

    it('returns no log lines when pricing is unavailable', () => {
        const lines = formatUsageCostBreakdownLines('openai', 'missing-model', {
            inputTokens: 100_000,
            outputTokens: 10_000
        }, {
            executionInputTokens: 100_000,
            expectedOutputTokens: 10_000,
            expectedPasses: 1
        });

        expect(lines).toEqual([]);
    });
});
