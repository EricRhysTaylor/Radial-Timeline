import type { AiSettingsV1, AIProviderId, LocalLlmBackendId, LocalLlmJsonMode } from '../types';
import { buildDefaultAiSettings, cloneBuiltInRoleTemplates } from './aiSettings';
import { BUILTIN_MODELS } from '../registry/builtinModels';

export interface AiSettingsValidationResult {
    value: AiSettingsV1;
    warnings: string[];
}

const VALID_PROVIDERS: AIProviderId[] = ['openai', 'anthropic', 'google', 'ollama', 'none'];
const VALID_LOCAL_LLM_BACKENDS: LocalLlmBackendId[] = ['ollama', 'lmStudio', 'openaiCompatible'];
const VALID_LOCAL_LLM_JSON_MODES: LocalLlmJsonMode[] = ['response_format', 'prompt_only'];

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

    const normalizeRoleTemplates = (): NonNullable<AiSettingsV1['roleTemplates']> => {
        const defaultsList = cloneBuiltInRoleTemplates();
        if (!Array.isArray(input?.roleTemplates) || input.roleTemplates.length === 0) {
            return defaultsList;
        }
        const normalized = input.roleTemplates
            .filter(entry => entry && typeof entry === 'object')
            .map(entry => {
                const template = entry as unknown as Record<string, unknown>;
                const id = typeof template.id === 'string' ? template.id.trim() : '';
                const name = typeof template.name === 'string' ? template.name.trim() : '';
                const prompt = typeof template.prompt === 'string' ? template.prompt.trim() : '';
                if (!id || !prompt) return null;
                return {
                    id,
                    name: name || id,
                    prompt,
                    isBuiltIn: !!template.isBuiltIn
                };
            })
            .filter((entry): entry is NonNullable<AiSettingsV1['roleTemplates']>[number] => !!entry);
        return normalized.length ? normalized : defaultsList;
    };

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
        roleTemplates: normalizeRoleTemplates(),
        localLlm: {
            ...defaults.localLlm,
            ...(((input?.localLlm && typeof input.localLlm === 'object') ? input.localLlm : {}) || {})
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
    value.analysisPackaging =
        incomingPackaging === 'singlePassOnly' ? 'singlePassOnly'
        : incomingPackaging === 'segmented' ? 'segmented'
        : 'automatic';
    const legacyCleanup = value as unknown as Record<string, unknown>;
    if ('analysisMethod' in legacyCleanup) {
        delete legacyCleanup.analysisMethod;
    }

    if (!VALID_PROVIDERS.includes(value.provider)) {
        warnings.push(`Unknown provider "${String(value.provider)}"; using default provider.`);
        value.provider = defaults.provider;
    }

    if (!VALID_LOCAL_LLM_BACKENDS.includes(value.localLlm.backend)) {
        warnings.push(`Unknown Local LLM backend "${String(value.localLlm.backend)}"; using default backend.`);
        value.localLlm.backend = defaults.localLlm.backend;
    }

    if (typeof value.localLlm.baseUrl !== 'string' || !value.localLlm.baseUrl.trim()) {
        value.localLlm.baseUrl = defaults.localLlm.baseUrl;
    } else {
        value.localLlm.baseUrl = value.localLlm.baseUrl.trim();
    }

    if (typeof value.localLlm.defaultModelId !== 'string' || !value.localLlm.defaultModelId.trim()) {
        const pinnedAlias = value.modelPolicy.type === 'pinned' ? value.modelPolicy.pinnedAlias?.trim() : '';
        const pinnedModel = pinnedAlias
            ? BUILTIN_MODELS.find(model => model.provider === 'ollama' && model.alias === pinnedAlias)
            : undefined;
        value.localLlm.defaultModelId = pinnedModel?.id ?? defaults.localLlm.defaultModelId;
    } else {
        value.localLlm.defaultModelId = value.localLlm.defaultModelId.trim();
    }

    if (typeof value.localLlm.instructions !== 'string') {
        value.localLlm.instructions = defaults.localLlm.instructions;
    }

    value.localLlm.sendPulseToAiReport = value.localLlm.sendPulseToAiReport !== false;
    value.localLlm.enabled = value.localLlm.enabled !== false;

    if (typeof value.localLlm.timeoutMs !== 'number' || !Number.isFinite(value.localLlm.timeoutMs)) {
        value.localLlm.timeoutMs = defaults.localLlm.timeoutMs;
    } else {
        value.localLlm.timeoutMs = Math.max(1000, Math.min(120000, Math.floor(value.localLlm.timeoutMs)));
    }

    if (typeof value.localLlm.maxRetries !== 'number' || !Number.isFinite(value.localLlm.maxRetries)) {
        value.localLlm.maxRetries = defaults.localLlm.maxRetries;
    } else {
        value.localLlm.maxRetries = Math.max(0, Math.min(3, Math.floor(value.localLlm.maxRetries)));
    }

    if (!VALID_LOCAL_LLM_JSON_MODES.includes(value.localLlm.jsonMode)) {
        value.localLlm.jsonMode = defaults.localLlm.jsonMode;
    }

    if (typeof value.roleTemplateId !== 'string' || !value.roleTemplateId.trim()) {
        value.roleTemplateId = defaults.roleTemplateId;
    }
    if (!(value.roleTemplates || []).some(template => template.id === value.roleTemplateId)) {
        value.roleTemplateId = (value.roleTemplates || [])[0]?.id ?? defaults.roleTemplateId;
    }

    const sanitizeTier = (tier: unknown): 1 | 2 | 3 | 4 => {
        if (tier === 1 || tier === 2 || tier === 3 || tier === 4) return tier;
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

    const validPolicyTypes = new Set(['pinned', 'latestStable', 'latestPro']);
    if (!validPolicyTypes.has(value.modelPolicy.type)) {
        warnings.push(`Unknown model policy "${String(value.modelPolicy.type)}"; switching to latestStable.`);
        value.modelPolicy = { type: 'latestStable' };
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

    if (
        value.provider === 'ollama'
        && value.modelPolicy.type === 'pinned'
        && 'pinnedAlias' in value.modelPolicy
        && value.modelPolicy.pinnedAlias
    ) {
        const pinnedAlias = value.modelPolicy.pinnedAlias;
        const pinnedModel = BUILTIN_MODELS.find(model =>
            model.provider === 'ollama' && model.alias === pinnedAlias
        );
        if (pinnedModel?.id) {
            value.localLlm.defaultModelId = pinnedModel.id;
        }
    }

    if (typeof value.overrides.temperature === 'number') {
        value.overrides.temperature = Math.max(0, Math.min(2, value.overrides.temperature));
    }

    if (typeof value.overrides.topP === 'number') {
        value.overrides.topP = Math.max(0, Math.min(1, value.overrides.topP));
    }

    if (value.lastThroughputCheck) {
        const check = value.lastThroughputCheck;
        const isValidProvider = check.provider === 'openai'
            || check.provider === 'anthropic'
            || check.provider === 'google'
            || check.provider === 'ollama';
        if (!isValidProvider || typeof check.checkedAt !== 'string' || !check.checkedAt.trim()) {
            value.lastThroughputCheck = undefined;
        } else {
            if (typeof check.endpoint !== 'string') check.endpoint = '';
            if (typeof check.statusCode !== 'number' || !Number.isFinite(check.statusCode)) check.statusCode = 0;
            check.observedHeaders = (check.observedHeaders && typeof check.observedHeaders === 'object')
                ? check.observedHeaders
                : {};
            check.observedFields = (check.observedFields && typeof check.observedFields === 'object')
                ? check.observedFields
                : {};
            check.noLimitInfoAvailable = !!check.noLimitInfoAvailable;
            if (check.heuristicTierSuggestion !== 1
                && check.heuristicTierSuggestion !== 2
                && check.heuristicTierSuggestion !== 3
                && check.heuristicTierSuggestion !== 4) {
                check.heuristicTierSuggestion = undefined;
            }
            if (typeof check.heuristicSummary !== 'string' || !check.heuristicSummary.trim()) {
                check.heuristicSummary = 'No limit info available.';
            }
        }
    }

    value.migrationWarnings = [...new Set([...(value.migrationWarnings || []), ...warnings])];

    return { value, warnings };
}
