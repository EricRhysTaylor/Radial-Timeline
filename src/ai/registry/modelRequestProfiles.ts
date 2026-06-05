import type { AIProviderId, ModelInfo } from '../types';
import { BUILTIN_MODELS } from './builtinModels';

export interface ModelRequestProfile {
    supportsTemperature: boolean;
    supportsTopP: boolean;
    supportsJsonSchema: boolean;
    supportsPromptCache: boolean;
    supportsCitations: boolean;
    supportsEvidenceDocuments: boolean;
    supportsThinkingBudget: boolean;
    supportsReasoningEffort?: boolean;
    preferredOpenAiEndpoint?: 'responses' | 'chat_completions';
    /** Adaptive thinking (type:'adaptive' + effort) vs legacy manual budget. */
    supportsAdaptiveThinking?: boolean;
}

const PROVIDER_DEFAULTS: Record<Exclude<AIProviderId, 'none'>, ModelRequestProfile> = {
    openai: {
        supportsTemperature: true,
        supportsTopP: true,
        supportsJsonSchema: true,
        supportsPromptCache: true,
        supportsCitations: false,
        supportsEvidenceDocuments: false,
        supportsThinkingBudget: false,
        supportsReasoningEffort: false,
        preferredOpenAiEndpoint: 'responses'
    },
    anthropic: {
        supportsTemperature: true,
        supportsTopP: true,
        supportsJsonSchema: true,
        supportsPromptCache: true,
        supportsCitations: true,
        supportsEvidenceDocuments: true,
        supportsThinkingBudget: true,
        supportsReasoningEffort: false
    },
    google: {
        supportsTemperature: true,
        supportsTopP: true,
        supportsJsonSchema: true,
        supportsPromptCache: true,
        supportsCitations: true,
        supportsEvidenceDocuments: false,
        supportsThinkingBudget: false,
        supportsReasoningEffort: false
    },
    ollama: {
        supportsTemperature: true,
        supportsTopP: true,
        supportsJsonSchema: true,
        supportsPromptCache: false,
        supportsCitations: false,
        supportsEvidenceDocuments: false,
        supportsThinkingBudget: false,
        supportsReasoningEffort: false
    }
};

// Request-shape facts live on each model record's `constraints`
// (ModelInfo.constraints) — the single source of truth, carried by both
// builtin and remote-fetched model records. We project the profile-relevant
// fields here so there is no parallel hand-maintained override table to
// drift against the catalog (e.g. GPT-5.5 previously declared the same
// sampling facts in both places).
function constraintsToProfileOverride(constraints: ModelInfo['constraints']): Partial<ModelRequestProfile> {
    if (!constraints) return {};
    const override: Partial<ModelRequestProfile> = {};
    if (constraints.supportsTemperature !== undefined) override.supportsTemperature = constraints.supportsTemperature;
    if (constraints.supportsTopP !== undefined) override.supportsTopP = constraints.supportsTopP;
    if (constraints.supportsReasoningEffort !== undefined) override.supportsReasoningEffort = constraints.supportsReasoningEffort;
    if (constraints.preferredOpenAiEndpoint !== undefined) override.preferredOpenAiEndpoint = constraints.preferredOpenAiEndpoint;
    if (constraints.supportsAdaptiveThinking !== undefined) override.supportsAdaptiveThinking = constraints.supportsAdaptiveThinking;
    return override;
}

const PROFILE_OVERRIDES_BY_ID: Map<string, Partial<ModelRequestProfile>> = new Map(
    BUILTIN_MODELS.map(model => [model.id, constraintsToProfileOverride(model.constraints)])
);

function isGoogleManagedSamplingModel(modelId: string): boolean {
    return /\b2\.5\b|\b3\.\d/.test(modelId);
}

export function getModelRequestProfile(
    provider: Exclude<AIProviderId, 'none'>,
    modelId?: string
): ModelRequestProfile {
    const normalized = (modelId || '').trim().replace(/^models\//, '');
    const base = PROVIDER_DEFAULTS[provider];
    const explicitOverride = normalized
        ? PROFILE_OVERRIDES_BY_ID.get(normalized)
        : undefined;
    const familyOverride: Partial<ModelRequestProfile> = provider === 'google' && isGoogleManagedSamplingModel(normalized)
        ? { supportsTemperature: false, supportsTopP: false }
        : {};
    return {
        ...base,
        ...familyOverride,
        ...(explicitOverride ?? {})
    };
}

export function modelSupportsRequestTemperature(
    provider: Exclude<AIProviderId, 'none'>,
    modelId?: string
): boolean {
    return getModelRequestProfile(provider, modelId).supportsTemperature !== false;
}

export function modelSupportsRequestTopP(
    provider: Exclude<AIProviderId, 'none'>,
    modelId?: string
): boolean {
    return getModelRequestProfile(provider, modelId).supportsTopP !== false;
}

export function modelSupportsThinkingBudget(
    provider: Exclude<AIProviderId, 'none'>,
    modelId?: string
): boolean {
    return getModelRequestProfile(provider, modelId).supportsThinkingBudget === true;
}

/**
 * Whether the model uses Anthropic adaptive thinking (thinking:{type:'adaptive'}
 * + output_config.effort). Declared per-model via ModelInfo.constraints rather
 * than pattern-matched on the model id.
 */
export function modelSupportsAdaptiveThinking(
    provider: Exclude<AIProviderId, 'none'>,
    modelId?: string
): boolean {
    return getModelRequestProfile(provider, modelId).supportsAdaptiveThinking === true;
}
