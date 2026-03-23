import { describe, expect, it } from 'vitest';
import { migrateAiSettings } from './migrateAiSettings';

const base = {
    books: [],
    sourcePath: '',
    validFolderPaths: [],
    publishStageColors: { Zero: '#000', Author: '#111', House: '#222', Press: '#333' },
    subplotColors: [],
    logApiInteractions: true,
    enableAiSceneAnalysis: true
} as any;

describe('migrateAiSettings', () => {
    it('maps legacy gemini provider to google and pins alias', () => {
        const result = migrateAiSettings({
            ...base,
            defaultAiProvider: 'gemini',
            geminiModelId: 'gemini-pro-latest'
        });

        expect(result.aiSettings.provider).toBe('google');
        expect(result.aiSettings.modelPolicy.type).toBe('pinned');
        expect((result.aiSettings.modelPolicy as any).pinnedAlias).toBe('gemini-pro-latest');
        expect(result.aiSettings.analysisPackaging).toBe('automatic');
        expect((result.aiSettings.credentials as any).googleApiKey).toBeUndefined();
        expect(result.aiSettings.credentials?.googleSecretId).toBeTruthy();
        expect(result.changed).toBe(true);
    });

    it('warns and falls back when legacy model is unknown', () => {
        const result = migrateAiSettings({
            ...base,
            defaultAiProvider: 'anthropic',
            anthropicModelId: 'unknown-model'
        });

        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.aiSettings.provider).toBe('openai');
        expect(result.aiSettings.modelPolicy.type).toBe('latestStable');
    });

    it('keeps canonical aiSettings without re-reading legacy fields', () => {
        const result = migrateAiSettings({
            ...base,
            aiSettings: {
                schemaVersion: 1,
                provider: 'anthropic',
                modelPolicy: { type: 'pinned', pinnedAlias: 'claude-sonnet-4.6' },
                analysisPackaging: 'automatic',
                roleTemplateId: 'commercial_genre',
                roleTemplates: [
                    { id: 'commercial_genre', name: 'Commercial', prompt: 'Prompt', isBuiltIn: true }
                ],
                overrides: { maxOutputMode: 'auto', reasoningDepth: 'standard', jsonStrict: true },
                aiAccessProfile: { anthropicTier: 1, openaiTier: 1, googleTier: 1 },
                privacy: { allowTelemetry: false, allowRemoteRegistry: false, allowProviderSnapshot: false },
                localLlm: {
                    enabled: true,
                    backend: 'ollama',
                    baseUrl: 'http://localhost:11434/v1',
                    defaultModelId: 'llama3',
                    instructions: '',
                    sendPulseToAiReport: true,
                    timeoutMs: 45000,
                    maxRetries: 1,
                    jsonMode: 'response_format'
                },
                featureProfiles: {},
                credentials: { openaiSecretId: 'a', anthropicSecretId: 'b', googleSecretId: 'c', ollamaSecretId: 'd' },
                connections: {}
            },
            defaultAiProvider: 'gemini',
            geminiModelId: 'gemini-pro-latest'
        } as any);

        expect(result.aiSettings.provider).toBe('anthropic');
        expect(result.aiSettings.modelPolicy).toEqual({ type: 'pinned', pinnedAlias: 'claude-sonnet-4.6' });
    });

    it('migrates legacy local settings into canonical localLlm', () => {
        const result = migrateAiSettings({
            ...base,
            defaultAiProvider: 'local',
            localModelId: 'mistral-local',
            localBaseUrl: 'http://localhost:1234/v1',
            localLlmInstructions: 'Return strict JSON.',
            localSendPulseToAiReport: false
        } as any);

        expect(result.aiSettings.provider).toBe('openai');
        expect(result.aiSettings.localLlm.baseUrl).toBe('http://localhost:1234/v1');
        expect(result.aiSettings.localLlm.defaultModelId).toBe('mistral-local');
        expect(result.aiSettings.localLlm.instructions).toBe('Return strict JSON.');
        expect(result.aiSettings.localLlm.sendPulseToAiReport).toBe(false);
    });
});
