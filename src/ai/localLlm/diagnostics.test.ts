import { beforeEach, describe, expect, it, vi } from 'vitest';

const listModels = vi.fn();
const complete = vi.fn();
const getCredential = vi.fn();

vi.mock('./backends', () => ({
    getLocalLlmBackend: () => ({
        id: 'ollama',
        label: 'Ollama',
        listModels,
        complete
    })
}));

vi.mock('../credentials/credentials', () => ({
    getCredential
}));

describe('runLocalLlmDiagnostics', () => {
    beforeEach(() => {
        listModels.mockReset();
        complete.mockReset();
        getCredential.mockReset();
        getCredential.mockResolvedValue('');
    });

    it('reports backend unavailable explicitly', async () => {
        listModels.mockRejectedValue(new Error('connection refused'));
        const { runLocalLlmDiagnostics } = await import('./diagnostics');

        const report = await runLocalLlmDiagnostics({
            app: {},
            settings: {
                aiSettings: {
                    ...(await import('../settings/aiSettings')).buildDefaultAiSettings()
                }
            }
        } as any);

        expect(report.reachable.ok).toBe(false);
        expect(report.reachable.message).toContain('connection refused');
        expect(report.modelAvailable.ok).toBe(false);
    });

    it('reports missing model when backend is reachable', async () => {
        listModels.mockResolvedValue([{ id: 'other-model' }]);
        complete.mockResolvedValue({
            success: true,
            content: 'READY',
            responseData: {},
            requestPayload: {}
        });
        const { runLocalLlmDiagnostics } = await import('./diagnostics');

        const report = await runLocalLlmDiagnostics({
            app: {},
            settings: {
                aiSettings: {
                    ...(await import('../settings/aiSettings')).buildDefaultAiSettings(),
                    localLlm: {
                        ...(await import('../settings/aiSettings')).buildDefaultAiSettings().localLlm,
                        defaultModelId: 'missing-model'
                    }
                }
            }
        } as any);

        expect(report.reachable.ok).toBe(true);
        expect(report.modelAvailable.ok).toBe(false);
        expect(report.modelAvailable.message).toContain('missing-model');
    });
});
