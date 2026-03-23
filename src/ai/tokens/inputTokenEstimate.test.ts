import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCredential, countAnthropicTokens } = vi.hoisted(() => ({
    getCredential: vi.fn(),
    countAnthropicTokens: vi.fn()
}));

vi.mock('../credentials/credentials', () => ({
    getCredential
}));

vi.mock('../../api/anthropicApi', () => ({
    countAnthropicTokens
}));

import {
    describeTokenEstimateMethod,
    estimateInputTokens
} from './inputTokenEstimate';

describe('estimateInputTokens', () => {
    beforeEach(() => {
        getCredential.mockReset();
        countAnthropicTokens.mockReset();
    });

    it('uses Anthropic provider counts when available', async () => {
        getCredential.mockResolvedValue('test-key');
        countAnthropicTokens.mockResolvedValue({
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            inputTokens: 43210,
            source: 'provider_count'
        });

        const result = await estimateInputTokens({
            plugin: {} as never,
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            systemPrompt: 'system',
            userPrompt: 'user',
            safeInputBudget: 100000
        });

        expect(result).toEqual({
            inputTokens: 43210,
            method: 'anthropic_count',
            uncertaintyTokens: 500
        });
    });

    it('falls back to heuristic estimates when Anthropic counting fails', async () => {
        getCredential.mockResolvedValue('test-key');
        countAnthropicTokens.mockRejectedValue(new Error('counting unavailable'));

        const result = await estimateInputTokens({
            plugin: {} as never,
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            systemPrompt: 'system',
            userPrompt: 'user prompt',
            evidenceDocuments: [{ title: 'Scene 1', content: 'Evidence text' }],
            safeInputBudget: 100000
        });

        expect(result.inputTokens).toBe(11);
        expect(result.method).toBe('heuristic_chars');
        expect(result.uncertaintyTokens).toBe(4000);
        expect(result.error).toBe('counting unavailable');
    });

    it('keeps non-Anthropic providers on the heuristic path', async () => {
        const result = await estimateInputTokens({
            provider: 'openai',
            modelId: 'gpt-5.4-mini',
            systemPrompt: 'system',
            userPrompt: 'user prompt'
        });

        expect(result).toEqual({
            inputTokens: 5,
            method: 'heuristic_chars',
            uncertaintyTokens: 3000
        });
        expect(getCredential).not.toHaveBeenCalled();
        expect(countAnthropicTokens).not.toHaveBeenCalled();
    });
});

describe('describeTokenEstimateMethod', () => {
    it('labels provider counts and heuristic fallbacks clearly', () => {
        expect(describeTokenEstimateMethod('anthropic_count')).toBe('Anthropic provider count');
        expect(describeTokenEstimateMethod('heuristic_chars')).toBe('Heuristic estimate');
    });
});
