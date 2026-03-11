import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./openaiApi', () => ({
    callOpenAiApi: vi.fn(),
    callOpenAiResponsesApi: vi.fn()
}));

vi.mock('../ai/credentials/credentials', () => ({
    getCredential: vi.fn()
}));

import { callProvider } from './providerRouter';
import { callOpenAiApi, callOpenAiResponsesApi } from './openaiApi';
import { getCredential } from '../ai/credentials/credentials';

const mockedCallOpenAiApi = vi.mocked(callOpenAiApi);
const mockedCallOpenAiResponsesApi = vi.mocked(callOpenAiResponsesApi);
const mockedGetCredential = vi.mocked(getCredential);

function buildPlugin() {
    return {
        settings: {
            defaultAiProvider: 'openai',
            openaiModelId: 'gpt-5.4',
            anthropicModelId: '',
            geminiModelId: '',
            localModelId: '',
            localBaseUrl: 'http://localhost:11434/v1'
        }
    } as never;
}

describe('providerRouter OpenAI transport routing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedGetCredential.mockResolvedValue('test-key');
        mockedCallOpenAiApi.mockResolvedValue({
            success: true,
            content: 'chat-ok',
            responseData: { model: 'gpt-5.4' }
        });
        mockedCallOpenAiResponsesApi.mockResolvedValue({
            success: true,
            content: 'responses-ok',
            responseData: { model: 'gpt-5.4-pro' }
        });
    });

    it('routes GPT-5.4 Pro through Responses lane', async () => {
        const result = await callProvider(buildPlugin(), {
            provider: 'openai',
            modelId: 'gpt-5.4-pro',
            userPrompt: 'hello',
            systemPrompt: 'sys'
        });

        expect(mockedCallOpenAiResponsesApi).toHaveBeenCalledTimes(1);
        expect(mockedCallOpenAiApi).not.toHaveBeenCalled();
        expect(result.aiTransportLane).toBe('responses');
        expect(result.requestPayload).toMatchObject({
            model: 'gpt-5.4-pro'
        });
        expect((result.requestPayload as Record<string, unknown>).input).toBeDefined();
    });

    it('routes GPT-5.4 stable through Chat Completions lane', async () => {
        const result = await callProvider(buildPlugin(), {
            provider: 'openai',
            modelId: 'gpt-5.4',
            userPrompt: 'hello'
        });

        expect(mockedCallOpenAiApi).toHaveBeenCalledTimes(1);
        expect(mockedCallOpenAiResponsesApi).not.toHaveBeenCalled();
        expect(result.aiTransportLane).toBe('chat_completions');
    });

    it('keeps GPT-5.3 on Chat Completions lane', async () => {
        const result = await callProvider(buildPlugin(), {
            provider: 'openai',
            modelId: 'gpt-5.3',
            userPrompt: 'hello'
        });

        expect(mockedCallOpenAiApi).toHaveBeenCalledTimes(1);
        expect(mockedCallOpenAiResponsesApi).not.toHaveBeenCalled();
        expect(result.aiTransportLane).toBe('chat_completions');
    });

    it('routes pinned GPT-5.4 Pro snapshot through Responses lane', async () => {
        const result = await callProvider(buildPlugin(), {
            provider: 'openai',
            modelId: 'gpt-5.4-pro-2026-03-05',
            userPrompt: 'hello'
        });

        expect(mockedCallOpenAiResponsesApi).toHaveBeenCalledTimes(1);
        expect(mockedCallOpenAiApi).not.toHaveBeenCalled();
        expect(result.aiTransportLane).toBe('responses');
    });
});
