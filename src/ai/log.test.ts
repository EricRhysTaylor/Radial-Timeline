import { describe, expect, it } from 'vitest';
import { buildUsageCostBreakdown, formatUsageCostBreakdownLines } from './log';

describe('buildUsageCostBreakdown', () => {
    it('builds a cache-aware Anthropic cost breakdown from aggregated usage', () => {
        const breakdown = buildUsageCostBreakdown('anthropic', 'claude-sonnet-4-6', {
            inputTokens: 173_581,
            outputTokens: 18_523,
            rawInputTokens: 53_581,
            cacheReadInputTokens: 120_000,
            cacheCreationInputTokens: 53_581
        });

        expect(breakdown?.inputTokens).toBe(173_581);
        expect(breakdown?.outputTokens).toBe(18_523);
        expect(breakdown?.rawInputTokens).toBe(53_581);
        expect(breakdown?.cacheReadInputTokens).toBe(120_000);
        expect(breakdown?.cacheCreationInputTokens).toBe(53_581);
        expect(breakdown?.inputCostUSD).toBeCloseTo(0.520743, 6);
        expect(breakdown?.outputCostUSD).toBeCloseTo(0.277845, 6);
        expect(breakdown?.totalCostUSD).toBeCloseTo(0.798588, 6);
    });

    it('formats readable cost breakdown log lines', () => {
        const lines = formatUsageCostBreakdownLines('anthropic', 'claude-sonnet-4-6', {
            inputTokens: 173_581,
            outputTokens: 18_523,
            rawInputTokens: 53_581,
            cacheReadInputTokens: 120_000,
            cacheCreationInputTokens: 53_581
        });

        expect(lines).toContain('## Cost Breakdown');
        expect(lines).toContain('Input tokens: 173,581');
        expect(lines).toContain('Cache read: 120,000');
        expect(lines).toContain('Cache write: 53,581');
        expect(lines).toContain('Input: $0.52');
        expect(lines).toContain('Output: $0.28');
        expect(lines).toContain('Total: $0.80');
    });

    it('returns no log lines when pricing is unavailable', () => {
        const lines = formatUsageCostBreakdownLines('openai', 'missing-model', {
            inputTokens: 100_000,
            outputTokens: 10_000
        });

        expect(lines).toEqual([]);
    });
});
