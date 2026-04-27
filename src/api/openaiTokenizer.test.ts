import { describe, expect, it } from 'vitest';
import { countOpenaiTokens } from './openaiTokenizer';

describe('countOpenaiTokens', () => {
    it('returns the canonical TokenCountResult shape', async () => {
        const result = await countOpenaiTokens('gpt-5.4', null, 'hello world');

        expect(result.provider).toBe('openai');
        expect(result.modelId).toBe('gpt-5.4');
        expect(result.source).toBe('provider_count');
        expect(result.inputTokens).toBeGreaterThan(0);
    });

    it('counts a known short string against the known o200k_base value', async () => {
        // "hello world" tokenizes to exactly 2 tokens under o200k_base.
        // If this changes, either the encoding ranks shipped by js-tiktoken
        // moved, or we accidentally swapped the encoder.
        const result = await countOpenaiTokens('gpt-5.4', null, 'hello world');
        expect(result.inputTokens).toBe(2);
    });

    it('sums system and user prompt tokens', async () => {
        const userOnly = await countOpenaiTokens('gpt-5.4', null, 'user prompt body');
        const both = await countOpenaiTokens('gpt-5.4', 'system role', 'user prompt body');
        expect(both.inputTokens).toBeGreaterThan(userOnly.inputTokens);
    });

    it('treats null and empty system prompts identically', async () => {
        const a = await countOpenaiTokens('gpt-5.4', null, 'hi');
        const b = await countOpenaiTokens('gpt-5.4', '', 'hi');
        expect(a.inputTokens).toBe(b.inputTokens);
    });

    it('throws when modelId is missing so the dispatcher can fall back', async () => {
        await expect(countOpenaiTokens('', null, 'hi')).rejects.toThrow(/model ID/);
    });

    it('counts large prompts roughly in line with the chars/4 heuristic for English text', async () => {
        // Sanity check: tiktoken output should be in the same ballpark as
        // chars/4 for plain English. Catches gross encoder misconfiguration
        // (e.g. accidentally encoding bytes instead of text).
        const text = 'The quick brown fox jumps over the lazy dog. '.repeat(100);
        const result = await countOpenaiTokens('gpt-5.4', null, text);
        const heuristic = Math.ceil(text.length / 4);
        // tiktoken on plain English typically lands within +/-50% of chars/4.
        expect(result.inputTokens).toBeGreaterThan(heuristic * 0.4);
        expect(result.inputTokens).toBeLessThan(heuristic * 1.5);
    });
});
