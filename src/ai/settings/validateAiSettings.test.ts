import { describe, expect, it } from 'vitest';
import { validateAiSettings } from './validateAiSettings';
import type { AiSettingsV1 } from '../types';

describe('validateAiSettings', () => {
    it('falls back invalid provider and bad pinned alias', () => {
        const result = validateAiSettings({
            schemaVersion: 1,
            provider: 'bad-provider' as any,
            modelPolicy: { type: 'pinned', pinnedAlias: 'missing' },
            overrides: {},
            aiAccessProfile: {},
            privacy: { allowTelemetry: false, allowRemoteRegistry: false, allowProviderSnapshot: false }
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
            analysisPackaging: 'bad-value' as unknown as 'automatic',
            overrides: { temperature: 99, topP: 99, maxOutputMode: 'bad' as any },
            aiAccessProfile: { openaiTier: 99 as any },
            privacy: { allowTelemetry: false, allowRemoteRegistry: false, allowProviderSnapshot: false }
        } as any);

        expect(result.value.overrides.temperature).toBe(2);
        expect(result.value.overrides.topP).toBe(1);
        expect(result.value.overrides.maxOutputMode).toBe('auto');
        expect(result.value.analysisPackaging).toBe('automatic');
        expect(result.value.aiAccessProfile.openaiTier).toBe(1);
    });

    it('accepts tier 4 in access profile', () => {
        const result = validateAiSettings({
            schemaVersion: 1,
            provider: 'openai',
            modelPolicy: { type: 'latestStable' },
            overrides: {},
            aiAccessProfile: { openaiTier: 4 },
            privacy: { allowTelemetry: false, allowRemoteRegistry: false, allowProviderSnapshot: false }
        } as unknown as AiSettingsV1);

        expect(result.value.aiAccessProfile.openaiTier).toBe(4);
    });

    it('strips legacy raw credential fields and keeps secret-id credentials only', () => {
        const result = validateAiSettings({
            schemaVersion: 1,
            provider: 'openai',
            modelPolicy: { type: 'latestStable' },
            overrides: {},
            aiAccessProfile: {},
            privacy: { allowTelemetry: false, allowRemoteRegistry: false, allowProviderSnapshot: false },
            credentials: {
                openaiApiKey: 'raw-key-should-not-persist',
                openaiSecretId: 'rt.openai.api-key'
            } as any
        } as any);

        expect((result.value.credentials as any).openaiApiKey).toBeUndefined();
        expect(result.value.credentials?.openaiSecretId).toBe('rt.openai.api-key');
    });

    it('maps legacy analysisMethod to analysisPackaging and drops legacy field', () => {
        const result = validateAiSettings({
            schemaVersion: 1,
            provider: 'openai',
            modelPolicy: { type: 'latestStable' },
            analysisMethod: 'singlePassOnly',
            overrides: {},
            aiAccessProfile: {},
            privacy: { allowTelemetry: false, allowRemoteRegistry: false, allowProviderSnapshot: false }
        } as unknown as AiSettingsV1);

        expect(result.value.analysisPackaging).toBe('singlePassOnly');
        expect((result.value as unknown as Record<string, unknown>).analysisMethod).toBeUndefined();
    });

    it('falls back invalid model policy type to latestStable', () => {
        const result = validateAiSettings({
            schemaVersion: 1,
            provider: 'openai',
            modelPolicy: { type: 'manual' as unknown as AiSettingsV1['modelPolicy']['type'] },
            overrides: {},
            aiAccessProfile: {},
            privacy: { allowTelemetry: false, allowRemoteRegistry: false, allowProviderSnapshot: false }
        } as unknown as AiSettingsV1);

        expect(result.value.modelPolicy.type).toBe('latestStable');
        expect(result.warnings.some(warning => warning.includes('Unknown model policy'))).toBe(true);
    });
});
