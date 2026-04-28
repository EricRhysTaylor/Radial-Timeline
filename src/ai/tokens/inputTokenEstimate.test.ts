import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getCredential, countAnthropicTokens, countGeminiTokens } = vi.hoisted(() => ({
    getCredential: vi.fn(),
    countAnthropicTokens: vi.fn(),
    countGeminiTokens: vi.fn()
}));

vi.mock('../credentials/credentials', () => ({
    getCredential
}));

vi.mock('../../api/anthropicApi', () => ({
    countAnthropicTokens
}));

vi.mock('../../api/geminiApi', () => ({
    countGeminiTokens
}));

import {
    describeTokenEstimateMethod,
    estimateInputTokens
} from './inputTokenEstimate';

describe('estimateInputTokens', () => {
    beforeEach(() => {
        getCredential.mockReset();
        countAnthropicTokens.mockReset();
        countGeminiTokens.mockReset();
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
        expect(countAnthropicTokens).toHaveBeenCalledWith(
            'test-key',
            'claude-sonnet-4-6',
            'system',
            'user',
            undefined,
            undefined,
            undefined,
            undefined
        );
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

    it('keeps OpenAI on the chars/4 heuristic path — no local tokenizer is shipped', async () => {
        const result = await estimateInputTokens({
            plugin: {} as never,
            provider: 'openai',
            modelId: 'gpt-5.4',
            systemPrompt: 'system',
            userPrompt: 'user prompt'
        });

        expect(result.method).toBe('heuristic_chars');
        expect(getCredential).not.toHaveBeenCalled();
        expect(countAnthropicTokens).not.toHaveBeenCalled();
        expect(countGeminiTokens).not.toHaveBeenCalled();
    });

    it('keeps Ollama on the heuristic path (no remote tokenizer)', async () => {
        const result = await estimateInputTokens({
            plugin: {} as never,
            provider: 'ollama',
            modelId: 'llama-3',
            systemPrompt: 'system',
            userPrompt: 'user prompt'
        });

        expect(result.method).toBe('heuristic_chars');
        expect(getCredential).not.toHaveBeenCalled();
        expect(countAnthropicTokens).not.toHaveBeenCalled();
        expect(countGeminiTokens).not.toHaveBeenCalled();
    });

    it('uses Gemini provider counts for google models when a key is configured', async () => {
        getCredential.mockResolvedValue('test-key');
        countGeminiTokens.mockResolvedValue({
            provider: 'google',
            modelId: 'gemini-3.1-pro-preview',
            inputTokens: 12345,
            source: 'provider_count'
        });

        const result = await estimateInputTokens({
            plugin: {} as never,
            provider: 'google',
            modelId: 'gemini-3.1-pro-preview',
            systemPrompt: 'system',
            userPrompt: 'user',
            safeInputBudget: 100000
        });

        expect(result).toEqual({
            inputTokens: 12345,
            method: 'google_count',
            uncertaintyTokens: 500
        });
        expect(countGeminiTokens).toHaveBeenCalledWith(
            'test-key',
            'gemini-3.1-pro-preview',
            'system',
            'user'
        );
    });

    it('falls back to heuristic when Gemini count fails, surfacing the error', async () => {
        getCredential.mockResolvedValue('test-key');
        countGeminiTokens.mockRejectedValue(new Error('gemini network error'));

        const result = await estimateInputTokens({
            plugin: {} as never,
            provider: 'google',
            modelId: 'gemini-3.1-pro-preview',
            systemPrompt: 'system',
            userPrompt: 'user prompt'
        });

        expect(result.method).toBe('heuristic_chars');
        expect(result.error).toBe('gemini network error');
    });

    it('falls back to heuristic when Gemini API key is missing', async () => {
        getCredential.mockResolvedValue('');

        const result = await estimateInputTokens({
            plugin: {} as never,
            provider: 'google',
            modelId: 'gemini-3.1-pro-preview',
            systemPrompt: 'system',
            userPrompt: 'user prompt'
        });

        expect(result.method).toBe('heuristic_chars');
        expect(result.error).toContain('Gemini API key unavailable');
        expect(countGeminiTokens).not.toHaveBeenCalled();
    });
});

describe('describeTokenEstimateMethod', () => {
    it('labels provider counts and heuristic fallbacks clearly', () => {
        expect(describeTokenEstimateMethod('anthropic_count')).toBe('Anthropic provider count');
        expect(describeTokenEstimateMethod('google_count')).toBe('Gemini provider count');
        expect(describeTokenEstimateMethod('heuristic_chars')).toBe('Heuristic estimate');
    });
});
