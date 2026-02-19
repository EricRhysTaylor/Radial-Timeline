import type { RadialTimelineSettings } from '../../types';
import type { AIProviderId, AiSettingsV1, ModelInfo } from '../types';
import { buildDefaultAiSettings, mapLegacyProviderToAiProvider } from './aiSettings';
import { BUILTIN_MODELS, findBuiltinByProviderModel } from '../registry/builtinModels';

interface MigrationResult {
    aiSettings: AiSettingsV1;
    changed: boolean;
    warnings: string[];
}

function cloneDefault(): AiSettingsV1 {
    return JSON.parse(JSON.stringify(buildDefaultAiSettings())) as AiSettingsV1;
}

function getProviderModelId(settings: RadialTimelineSettings, provider: AIProviderId): string {
    if (provider === 'anthropic') return (settings.anthropicModelId || '').trim();
    if (provider === 'google') return (settings.geminiModelId || '').trim();
    if (provider === 'ollama') return (settings.localModelId || '').trim();
    if (provider === 'openai') return (settings.openaiModelId || '').trim();
    return '';
}

function pickFallbackModel(provider: AIProviderId): ModelInfo | undefined {
    return BUILTIN_MODELS.find(model => model.provider === provider && model.status === 'stable')
        ?? BUILTIN_MODELS.find(model => model.provider === provider);
}

export function migrateAiSettings(settings: RadialTimelineSettings): MigrationResult {
    const warnings: string[] = [];
    const existing = settings.aiSettings;
    if (existing && existing.schemaVersion === 1) {
        return {
            aiSettings: existing,
            changed: false,
            warnings: Array.isArray(existing.migrationWarnings) ? existing.migrationWarnings : []
        };
    }

    const aiSettings = cloneDefault();
    const mappedProvider = mapLegacyProviderToAiProvider(settings.defaultAiProvider);
    aiSettings.provider = mappedProvider;

    const legacyModelId = getProviderModelId(settings, mappedProvider);
    const mappedModel = legacyModelId
        ? findBuiltinByProviderModel(mappedProvider, legacyModelId)
        : undefined;

    if (mappedModel) {
        aiSettings.modelPolicy = {
            type: 'pinned',
            pinnedAlias: mappedModel.alias
        };
    } else {
        const fallback = pickFallbackModel(mappedProvider);
        aiSettings.modelPolicy = fallback
            ? { type: 'pinned', pinnedAlias: fallback.alias }
            : { type: 'latestStable' };
        if (legacyModelId) {
            warnings.push(`Pinned model "${legacyModelId}" not found for ${mappedProvider}; using nearest compatible model.`);
        }
    }

    aiSettings.credentials = {
        openaiSecretId: aiSettings.credentials?.openaiSecretId,
        anthropicSecretId: aiSettings.credentials?.anthropicSecretId,
        googleSecretId: aiSettings.credentials?.googleSecretId,
        ollamaSecretId: aiSettings.credentials?.ollamaSecretId
    };

    aiSettings.connections = {
        ollamaBaseUrl: settings.localBaseUrl || aiSettings.connections?.ollamaBaseUrl || 'http://localhost:11434/v1'
    };

    aiSettings.overrides = {
        ...aiSettings.overrides,
        temperature: undefined,
        topP: undefined,
        maxOutputMode: 'auto',
        reasoningDepth: 'standard',
        jsonStrict: true
    };

    aiSettings.featureProfiles = {
        ...(aiSettings.featureProfiles || {}),
        InquiryMode: {
            modelPolicy: { type: 'profile', profile: 'deepReasoner' },
            overrides: {
                maxOutputMode: 'high',
                reasoningDepth: 'deep',
                jsonStrict: true
            }
        }
    };
    aiSettings.roleTemplateId = settings.activeAiContextTemplateId || aiSettings.roleTemplateId || 'commercial_genre';

    aiSettings.migrationWarnings = warnings;
    aiSettings.upgradedBannerPending = true;

    return {
        aiSettings,
        changed: true,
        warnings
    };
}
