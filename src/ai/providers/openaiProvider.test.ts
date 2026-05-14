import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/openaiApi', () => ({
    callOpenAiResponsesApi: vi.fn()
}));

vi.mock('../credentials/credentials', () => ({
    getCredential: vi.fn().mockResolvedValue('test-key')
}));

vi.mock('../settings/aiSettings', () => ({
    buildDefaultAiSettings: vi.fn(() => ({
        cacheWindows: {
            openaiRetention: '24h'
        }
    }))
}));

vi.mock('../settings/validateAiSettings', () => ({
    validateAiSettings: vi.fn(() => ({
        value: {
            cacheWindows: {
                openaiRetention: 'in_memory'
            }
        }
    }))
}));

import { callOpenAiResponsesApi } from '../../api/openaiApi';
import { OpenAIProvider } from './openaiProvider';

describe('OpenAIProvider', () => {
    beforeEach(() => {
        vi.mocked(callOpenAiResponsesApi).mockReset();
    });

    it('passes the configured OpenAI prompt cache retention through to Responses', async () => {
        vi.mocked(callOpenAiResponsesApi).mockResolvedValue({
            success: true,
            content: 'ok',
            responseData: {}
        });

        const provider = new OpenAIProvider({ settings: {} } as never);
        await provider.generateText({
            modelId: 'gpt-5.5',
            systemPrompt: 'You are precise.',
            userPrompt: 'Return a short answer.'
        });

        expect(callOpenAiResponsesApi).toHaveBeenCalledWith(
            'test-key',
            'gpt-5.5',
            'You are precise.',
            'Return a short answer.',
            undefined,
            undefined,
            undefined,
            undefined,
            'in_memory',
            undefined
        );
    });

    it('passes prompt cache keys through to the OpenAI Responses adapter', async () => {
        vi.mocked(callOpenAiResponsesApi).mockResolvedValue({
            success: true,
            content: 'ok',
            responseData: {}
        });

        const provider = new OpenAIProvider({ settings: {} } as never);
        await provider.generateText({
            modelId: 'gpt-5.5',
            systemPrompt: 'You are precise.',
            userPrompt: 'Return a short answer.',
            promptCacheKey: 'rt:inquiry:book-b1'
        });

        expect(callOpenAiResponsesApi).toHaveBeenCalledWith(
            'test-key',
            'gpt-5.5',
            'You are precise.',
            'Return a short answer.',
            undefined,
            undefined,
            undefined,
            undefined,
            'in_memory',
            'rt:inquiry:book-b1'
        );
    });

    it('marks OpenAI cache hits only when cached token usage is present', async () => {
        vi.mocked(callOpenAiResponsesApi).mockResolvedValue({
            success: true,
            content: '{"ok":true}',
            responseData: {
                usage: {
                    input_tokens: 1200,
                    output_tokens: 300,
                    input_tokens_details: {
                        cached_tokens: 900
                    }
                }
            }
        });

        const provider = new OpenAIProvider({ settings: {} } as never);
        const result = await provider.generateJson({
            modelId: 'gpt-5.5',
            systemPrompt: 'You are precise.',
            userPrompt: 'Return JSON.',
            jsonSchema: {
                type: 'object',
                properties: {
                    ok: { type: 'boolean' }
                },
                required: ['ok'],
                additionalProperties: false
            }
        });

        expect(result.success).toBe(true);
        expect(result.cacheUsed).toBe(true);
        expect(result.cacheStatus).toBe('hit');
    });
});
