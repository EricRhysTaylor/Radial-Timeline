import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./geminiApi', () => ({
    callGeminiApi: vi.fn()
}));

vi.mock('../ai/credentials/credentials', () => ({
    getCredential: vi.fn()
}));

vi.mock('./geminiCacheManager', () => ({
    getOrCreateGeminiCache: vi.fn()
}));

import { callProvider } from './providerRouter';
import { callGeminiApi } from './geminiApi';
import { getCredential } from '../ai/credentials/credentials';
import { getOrCreateGeminiCache } from './geminiCacheManager';
import { CACHE_BREAK_DELIMITER } from '../ai/prompts/composeEnvelope';

const mockedCallGeminiApi = vi.mocked(callGeminiApi);
const mockedGetCredential = vi.mocked(getCredential);
const mockedGetOrCreateGeminiCache = vi.mocked(getOrCreateGeminiCache);

function buildPlugin() {
    return {
        settings: {
            defaultAiProvider: 'gemini',
            openaiModelId: '',
            anthropicModelId: '',
            geminiModelId: 'gemini-2.5-pro',
            localModelId: '',
            localBaseUrl: 'http://localhost:11434/v1'
        }
    } as never;
}

describe('providerRouter Gemini cache restrictions', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedGetCredential.mockResolvedValue('test-key');
        mockedCallGeminiApi.mockResolvedValue({
            success: true,
            content: '{"ok":true}',
            responseData: { model: 'gemini-2.5-pro' }
        });
        mockedGetOrCreateGeminiCache.mockResolvedValue({
            cacheName: 'cachedContents/test',
            status: 'hit'
        } as never);
    });

    it('bypasses cachedContent when Gemini grounding tools are enabled', async () => {
        const stable = 'Stable manuscript corpus';
        const volatile = 'Focused question text';
        const result = await callProvider(buildPlugin(), {
            provider: 'gemini',
            modelId: 'gemini-2.5-pro',
            systemPrompt: 'System instruction',
            userPrompt: `${stable}${CACHE_BREAK_DELIMITER}${volatile}`,
            citationsEnabled: true
        });

        expect(mockedGetOrCreateGeminiCache).not.toHaveBeenCalled();
        expect(mockedCallGeminiApi).toHaveBeenCalledWith(
            'test-key',
            'gemini-2.5-pro',
            'System instruction',
            `${stable}\n\n${volatile}`,
            4000,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            true,
            true
        );
        expect(result.cacheUsed).toBe(false);
    });
});
