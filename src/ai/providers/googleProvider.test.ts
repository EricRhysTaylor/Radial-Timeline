import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../api/geminiApi', () => ({
    callGeminiApi: vi.fn()
}));

vi.mock('../../api/geminiCacheManager', () => ({
    getOrCreateGeminiCache: vi.fn()
}));

vi.mock('../credentials/credentials', () => ({
    getCredential: vi.fn().mockResolvedValue('test-key')
}));

vi.mock('../settings/aiSettings', () => ({
    buildDefaultAiSettings: vi.fn(() => ({
        cacheWindows: {
            googleTtlSeconds: 900
        }
    }))
}));

vi.mock('../settings/validateAiSettings', () => ({
    validateAiSettings: vi.fn(() => ({
        value: {
            cacheWindows: {
                googleTtlSeconds: 900
            }
        }
    }))
}));

import { callGeminiApi } from '../../api/geminiApi';
import { getOrCreateGeminiCache } from '../../api/geminiCacheManager';
import { CACHE_BREAK_DELIMITER } from '../prompts/composeEnvelope';
import { GoogleProvider } from './googleProvider';

describe('GoogleProvider', () => {
    beforeEach(() => {
        vi.mocked(callGeminiApi).mockReset();
        vi.mocked(getOrCreateGeminiCache).mockReset();
    });

    it('fails before dispatch when cached-content setup fails', async () => {
        vi.mocked(getOrCreateGeminiCache).mockRejectedValue(new Error('cache service unavailable'));

        const provider = new GoogleProvider({ settings: {} } as never);
        const result = await provider.generateText({
            modelId: 'gemini-3.1-pro-preview',
            systemPrompt: 'You are precise.',
            userPrompt: `Stable prefix ${'x'.repeat(140000)}${CACHE_BREAK_DELIMITER}Volatile question`,
            citationsEnabled: false
        });

        expect(result.success).toBe(false);
        expect(result.aiStatus).toBe('rejected');
        expect(result.aiReason).toBe('cache_setup_failed');
        expect(result.error).toContain('Gemini cached content setup failed before dispatch');
        expect(result.diagnostics).toEqual(expect.objectContaining({
            cacheSetupFailed: true,
            cacheSetupMode: 'cached_content'
        }));
        expect(callGeminiApi).not.toHaveBeenCalled();
    });
});
