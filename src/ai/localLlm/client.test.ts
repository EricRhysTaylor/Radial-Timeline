import { beforeEach, describe, expect, it, vi } from 'vitest';

const listModels = vi.fn();
const getCredential = vi.fn();
const fetchOllamaModelDetails = vi.fn();
const resolveLocalLlmSelection = vi.fn();
const getCanonicalLocalLlmSettings = vi.fn();

vi.mock('./backends', () => ({
    getLocalLlmBackend: () => ({
        id: 'ollama',
        label: 'Ollama',
        listModels,
        complete: vi.fn()
    })
}));

vi.mock('../credentials/credentials', () => ({
    getCredential
}));

vi.mock('./transport', () => ({
    fetchOllamaModelDetails,
    type: undefined
}));

vi.mock('./settings', () => ({
    LOCAL_LLM_BACKEND_LABELS: {
        ollama: 'Ollama',
        lmStudio: 'LM Studio',
        openaiCompatible: 'OpenAI-Compatible'
    },
    getCanonicalLocalLlmSettings,
    resolveLocalLlmSelection
}));

describe('LocalLlmClient live model selection', () => {
    beforeEach(() => {
        listModels.mockReset();
        getCredential.mockReset();
        fetchOllamaModelDetails.mockReset();
        resolveLocalLlmSelection.mockReset();
        getCanonicalLocalLlmSettings.mockReset();

        getCredential.mockResolvedValue('');
        getCanonicalLocalLlmSettings.mockReturnValue({
            enabled: true,
            backend: 'ollama',
            baseUrl: 'http://localhost:11434/v1',
            defaultModelId: 'mistral-nemo',
            timeoutMs: 30000,
            maxRetries: 0,
            jsonMode: 'response_format'
        });
        resolveLocalLlmSelection.mockReturnValue({
            provider: 'ollama',
            model: {
                provider: 'ollama',
                id: 'mistral-nemo',
                alias: 'ollama-mistral-nemo',
                label: 'mistral-nemo',
                tier: 'LOCAL',
                capabilities: ['jsonStrict'],
                personality: { reasoning: 5, writing: 5, determinism: 4 },
                contextWindow: 32000,
                maxOutput: 4000,
                status: 'stable'
            },
            warnings: [],
            reason: 'Local LLM backend Ollama resolved from canonical localLlm settings.'
        });
    });

    it('merges live backend context and output limits into the selected local model', async () => {
        listModels.mockResolvedValue([{ id: 'mistral-nemo', contextWindow: 65536, maxOutput: 6000 }]);
        fetchOllamaModelDetails.mockResolvedValue({ contextWindow: 131072, maxOutput: 8192 });

        const { getLocalLlmClient } = await import('./client');
        const client = getLocalLlmClient({ settings: { aiSettings: {} } } as any);
        const selection = await client.resolveSelectionFromLiveData();

        expect(selection.model.contextWindow).toBe(131072);
        expect(selection.model.maxOutput).toBe(8192);
        expect(selection.reason).toContain('Live backend limits loaded');
    });

    it('falls back to canonical local model metadata when live lookup fails', async () => {
        listModels.mockRejectedValue(new Error('connection refused'));

        const { getLocalLlmClient } = await import('./client');
        const client = getLocalLlmClient({ settings: { aiSettings: {} } } as any);
        const selection = await client.resolveSelectionFromLiveData();

        expect(selection.model.contextWindow).toBe(32000);
        expect(selection.model.maxOutput).toBe(4000);
    });
});
