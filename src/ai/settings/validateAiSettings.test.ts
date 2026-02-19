import { describe, expect, it } from 'vitest';
import { validateAiSettings } from './validateAiSettings';

describe('validateAiSettings', () => {
    it('falls back invalid provider and bad pinned alias', () => {
        const result = validateAiSettings({
            schemaVersion: 1,
            provider: 'bad-provider' as any,
            modelPolicy: { type: 'pinned', pinnedAlias: 'missing' },
            overrides: {},
            aiAccessProfile: {},
            privacy: { allowTelemetry: false, allowRemoteRegistry: false }
        } as any);

        expect(result.value.provider).toBe('openai');
        expect(result.value.modelPolicy.type).toBe('latestStable');
        expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('normalizes tiers and override bounds', () => {
        const result = validateAiSettings({
            schemaVersion: 1,
            provider: 'openai',
            modelPolicy: { type: 'latestStable' },
            overrides: { temperature: 99, topP: 99, maxOutputMode: 'bad' as any },
            aiAccessProfile: { openaiTier: 99 as any },
            privacy: { allowTelemetry: false, allowRemoteRegistry: false }
        } as any);

        expect(result.value.overrides.temperature).toBe(2);
        expect(result.value.overrides.topP).toBe(1);
        expect(result.value.overrides.maxOutputMode).toBe('auto');
        expect(result.value.aiAccessProfile.openaiTier).toBe(1);
    });
});
