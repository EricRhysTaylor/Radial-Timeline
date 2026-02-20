import type { AiSettingsV1, AIProviderId } from '../types';
import { buildDefaultAiSettings } from './aiSettings';
import { BUILTIN_MODELS } from '../registry/builtinModels';

export interface AiSettingsValidationResult {
    value: AiSettingsV1;
    warnings: string[];
}

const VALID_PROVIDERS: AIProviderId[] = ['openai', 'anthropic', 'google', 'ollama', 'none'];

function hasAlias(alias?: string): boolean {
    if (!alias) return false;
    return BUILTIN_MODELS.some(model => model.alias === alias);
}

export function validateAiSettings(input?: AiSettingsV1 | null): AiSettingsValidationResult {
    const warnings: string[] = [];
    const defaults = buildDefaultAiSettings();
    const pickSecretId = (value: unknown): string | undefined => {
        if (typeof value !== 'string') return undefined;
        const trimmed = value.trim();
        return trimmed.length ? trimmed : undefined;
    };

    const inputCredentials = (input?.credentials && typeof input.credentials === 'object')
        ? input.credentials as Record<string, unknown>
        : {};

    const value: AiSettingsV1 = {
        ...defaults,
        ...(input || {}),
        overrides: {
            ...defaults.overrides,
            ...(input?.overrides || {})
        },
        aiAccessProfile: {
            ...defaults.aiAccessProfile,
            ...(input?.aiAccessProfile || {})
        },
        privacy: {
            ...defaults.privacy,
            ...(input?.privacy || {})
        },
        featureProfiles: {
            ...(input?.featureProfiles || defaults.featureProfiles || {})
        },
        credentials: {
            openaiSecretId: pickSecretId(inputCredentials.openaiSecretId) ?? defaults.credentials?.openaiSecretId,
            anthropicSecretId: pickSecretId(inputCredentials.anthropicSecretId) ?? defaults.credentials?.anthropicSecretId,
            googleSecretId: pickSecretId(inputCredentials.googleSecretId) ?? defaults.credentials?.googleSecretId,
            ollamaSecretId: pickSecretId(inputCredentials.ollamaSecretId) ?? defaults.credentials?.ollamaSecretId
        },
        connections: {
            ...defaults.connections,
            ...(input?.connections || {})
        }
    };

    const legacyAnalysisMethod = (input as unknown as { analysisMethod?: string } | undefined)?.analysisMethod;
    const rawAnalysisPackaging = (input as unknown as { analysisPackaging?: string } | undefined)?.analysisPackaging;
    const incomingPackaging = typeof rawAnalysisPackaging === 'string'
        ? rawAnalysisPackaging
        : legacyAnalysisMethod;
    value.analysisPackaging = incomingPackaging === 'singlePassOnly' ? 'singlePassOnly' : 'automatic';
    const legacyCleanup = value as unknown as Record<string, unknown>;
    if ('analysisMethod' in legacyCleanup) {
        delete legacyCleanup.analysisMethod;
    }

    if (!VALID_PROVIDERS.includes(value.provider)) {
        warnings.push(`Unknown provider "${String(value.provider)}"; using default provider.`);
        value.provider = defaults.provider;
    }

    if (typeof value.roleTemplateId !== 'string' || !value.roleTemplateId.trim()) {
        value.roleTemplateId = defaults.roleTemplateId;
    }

    const sanitizeTier = (tier: unknown): 1 | 2 | 3 => {
        if (tier === 1 || tier === 2 || tier === 3) return tier;
        return 1;
    };
    value.aiAccessProfile.anthropicTier = sanitizeTier(value.aiAccessProfile.anthropicTier);
    value.aiAccessProfile.openaiTier = sanitizeTier(value.aiAccessProfile.openaiTier);
    value.aiAccessProfile.googleTier = sanitizeTier(value.aiAccessProfile.googleTier);

    if (value.modelPolicy.type === 'pinned') {
        if (!hasAlias(value.modelPolicy.pinnedAlias)) {
            warnings.push(`Pinned alias "${value.modelPolicy.pinnedAlias || 'unknown'}" was not found; switching to latestStable.`);
            value.modelPolicy = { type: 'latestStable' };
        }
    }

    if (value.modelPolicy.type === 'profile') {
        const validProfiles = new Set(['deepWriter', 'deepReasoner', 'balancedAnalysis']);
        if (!validProfiles.has(value.modelPolicy.profile)) {
            warnings.push(`Unknown model profile "${value.modelPolicy.profile}"; switching to latestStable.`);
            value.modelPolicy = { type: 'latestStable' };
        }
    }

    const mode = value.overrides.maxOutputMode;
    if (mode !== 'auto' && mode !== 'high' && mode !== 'max') {
        value.overrides.maxOutputMode = 'auto';
    }

    const depth = value.overrides.reasoningDepth;
    if (depth !== 'standard' && depth !== 'deep') {
        value.overrides.reasoningDepth = 'standard';
    }

    value.privacy.allowTelemetry = !!value.privacy.allowTelemetry;
    value.privacy.allowRemoteRegistry = !!value.privacy.allowRemoteRegistry;
    value.privacy.allowProviderSnapshot = !!value.privacy.allowProviderSnapshot;

    if (typeof value.overrides.temperature === 'number') {
        value.overrides.temperature = Math.max(0, Math.min(2, value.overrides.temperature));
    }

    if (typeof value.overrides.topP === 'number') {
        value.overrides.topP = Math.max(0, Math.min(1, value.overrides.topP));
    }

    value.migrationWarnings = [...new Set([...(value.migrationWarnings || []), ...warnings])];

    return { value, warnings };
}
