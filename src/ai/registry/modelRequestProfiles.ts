import type { AIProviderId } from '../types';

export interface ModelRequestProfile {
    supportsTemperature: boolean;
    supportsTopP: boolean;
    supportsJsonSchema: boolean;
    supportsPromptCache: boolean;
    supportsCitations: boolean;
    supportsEvidenceDocuments: boolean;
    supportsThinkingBudget: boolean;
    supportsDisableThinking: boolean;
    supportsReasoningEffort?: boolean;
    preferredOpenAiEndpoint?: 'responses' | 'chat_completions';
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
        supportsDisableThinking: false,
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
        supportsDisableThinking: false,
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
        supportsDisableThinking: true,
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
        supportsDisableThinking: false,
        supportsReasoningEffort: false
    }
};

const OPENAI_GPT_5_5_OVERRIDE: Partial<ModelRequestProfile> = {
    supportsTemperature: false,
    supportsTopP: false,
    supportsReasoningEffort: true,
    preferredOpenAiEndpoint: 'responses'
};

const REQUEST_PROFILE_OVERRIDES: Partial<Record<Exclude<AIProviderId, 'none'>, Record<string, Partial<ModelRequestProfile>>>> = {
    openai: {
        'gpt-5.5': OPENAI_GPT_5_5_OVERRIDE,
        'gpt-5.5-2026-04-23': OPENAI_GPT_5_5_OVERRIDE
    }
};

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
        ? REQUEST_PROFILE_OVERRIDES[provider]?.[normalized]
        : undefined;
    const familyOverride: Partial<ModelRequestProfile> = provider === 'google' && isGoogleManagedSamplingModel(normalized)
        ? { supportsTemperature: false, supportsTopP: false, supportsDisableThinking: true }
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

export function modelSupportsDisableThinking(
    provider: Exclude<AIProviderId, 'none'>,
    modelId?: string
): boolean {
    return getModelRequestProfile(provider, modelId).supportsDisableThinking === true;
}
