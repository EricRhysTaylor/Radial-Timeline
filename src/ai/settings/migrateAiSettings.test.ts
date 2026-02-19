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
        expect(result.changed).toBe(true);
    });

    it('warns and falls back when legacy model is unknown', () => {
        const result = migrateAiSettings({
            ...base,
            defaultAiProvider: 'anthropic',
            anthropicModelId: 'unknown-model'
        });

        expect(result.warnings.length).toBeGreaterThan(0);
        expect(result.aiSettings.modelPolicy.type).toBe('pinned');
    });
});
