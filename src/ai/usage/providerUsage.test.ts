import { describe, expect, it } from 'vitest';
import { extractTokenUsage } from './providerUsage';

describe('extractTokenUsage', () => {
    it('aggregates Anthropic cache-aware input fields into full input totals', () => {
        const usage = extractTokenUsage('anthropic', {
            usage: {
                input_tokens: 196,
                cache_read_input_tokens: 176000,
                cache_creation_input_tokens: 12000,
                output_tokens: 18500
            }
        });

        expect(usage).toEqual({
            inputTokens: 188196,
            outputTokens: 18500,
            totalTokens: 206696,
            rawInputTokens: 196,
            cacheReadInputTokens: 176000,
            cacheCreationInputTokens: 12000
        });
    });

    it('returns Anthropic output usage without inventing input totals when input fields are missing', () => {
        const usage = extractTokenUsage('anthropic', {
            usage: {
                output_tokens: 18500
            }
        });

        expect(usage).toEqual({
            inputTokens: undefined,
            outputTokens: 18500,
            totalTokens: undefined,
            rawInputTokens: undefined,
            cacheReadInputTokens: undefined,
            cacheCreationInputTokens: undefined
        });
    });
});
