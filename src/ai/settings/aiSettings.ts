import type {
    AIProviderId,
    AiSettingsV1,
    LegacyProviderId,
    ModelPolicy
} from '../types';

export const AI_SETTINGS_SCHEMA_VERSION = 1;
export const DEFAULT_CREDENTIAL_SECRET_IDS = {
    openaiSecretId: 'rt.openai.api-key',
    anthropicSecretId: 'rt.anthropic.api-key',
    googleSecretId: 'rt.google.api-key',
    ollamaSecretId: 'rt.ollama.api-key'
} as const;
export type CredentialSecretField = keyof typeof DEFAULT_CREDENTIAL_SECRET_IDS;
export type CredentialSecretProvider = 'openai' | 'anthropic' | 'google' | 'ollama';

export const DEFAULT_MODEL_POLICY: ModelPolicy = { type: 'latestStable' };

export function mapLegacyProviderToAiProvider(provider?: LegacyProviderId | string): AIProviderId {
    if (provider === 'anthropic') return 'anthropic';
    if (provider === 'gemini') return 'google';
    if (provider === 'local') return 'ollama';
    if (provider === 'openai') return 'openai';
    return 'openai';
}

export function mapAiProviderToLegacyProvider(provider: AIProviderId): LegacyProviderId {
    if (provider === 'anthropic') return 'anthropic';
    if (provider === 'google') return 'gemini';
    if (provider === 'ollama') return 'local';
    return 'openai';
}

export function buildDefaultAiSettings(): AiSettingsV1 {
    return {
        schemaVersion: AI_SETTINGS_SCHEMA_VERSION,
        provider: 'openai',
        modelPolicy: { ...DEFAULT_MODEL_POLICY },
        roleTemplateId: 'commercial_genre',
        overrides: {
            maxOutputMode: 'auto',
            reasoningDepth: 'standard',
            jsonStrict: true
        },
        aiAccessProfile: {
            anthropicTier: 1,
            openaiTier: 1,
            googleTier: 1
        },
        privacy: {
            allowTelemetry: false,
            allowRemoteRegistry: false,
            allowProviderSnapshot: false
        },
        featureProfiles: {},
        credentials: {
            ...DEFAULT_CREDENTIAL_SECRET_IDS
        },
        connections: {
            ollamaBaseUrl: 'http://localhost:11434/v1'
        },
        migrationWarnings: [],
        upgradedBannerPending: false
    };
}
