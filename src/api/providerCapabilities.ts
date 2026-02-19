// TODO: DEPRECATED — migrate to aiClient
import type { OpenAiResponseFormat } from './openaiApi';

export type AiProvider = 'openai' | 'anthropic' | 'gemini' | 'local';

export interface ProviderCallArgs {
    userPrompt: string;
    systemPrompt?: string | null;
    maxTokens?: number | null;
    temperature?: number;
    top_p?: number;
    responseFormat?: OpenAiResponseFormat;
    jsonSchema?: Record<string, unknown>;
    disableThinking?: boolean;
}

type ProviderCapabilities = {
    supportsTemperature: boolean;
    supportsTopP: boolean;
    supportsResponseFormat: boolean;
    supportsJsonSchema: boolean;
    supportsThinkingConfig: boolean;
};

const PROVIDER_CAPABILITIES: Record<AiProvider, ProviderCapabilities> = {
    openai: {
        supportsTemperature: true,
        supportsTopP: true,
        supportsResponseFormat: true,
        supportsJsonSchema: false,
        supportsThinkingConfig: false
    },
    anthropic: {
        supportsTemperature: false,
        supportsTopP: false,
        supportsResponseFormat: false,
        supportsJsonSchema: false,
        supportsThinkingConfig: false
    },
    gemini: {
        supportsTemperature: true,
        supportsTopP: true,
        supportsResponseFormat: false,
        supportsJsonSchema: true,
        supportsThinkingConfig: true
    },
    local: {
        supportsTemperature: true,
        supportsTopP: true,
        supportsResponseFormat: true,
        supportsJsonSchema: false,
        supportsThinkingConfig: false
    }
};

const MODEL_TEMPERATURE_UNSUPPORTED: Record<AiProvider, Set<string>> = {
    openai: new Set(),
    anthropic: new Set(),
    gemini: new Set(),
    local: new Set()
};

const normalizeModelId = (provider: AiProvider, modelId?: string): string => {
    if (!modelId) return '';
    if (provider === 'gemini') {
        return modelId.trim().replace(/^models\//, '');
    }
    return modelId.trim();
};

export function sanitizeProviderArgs(
    provider: AiProvider,
    modelId: string | undefined,
    args: ProviderCallArgs
): ProviderCallArgs {
    const capabilities = PROVIDER_CAPABILITIES[provider];
    const normalizedModelId = normalizeModelId(provider, modelId);
    const temperatureAllowed = capabilities.supportsTemperature &&
        !MODEL_TEMPERATURE_UNSUPPORTED[provider].has(normalizedModelId);

    const sanitized: ProviderCallArgs = {
        userPrompt: args.userPrompt
    };

    if (args.systemPrompt !== undefined) {
        sanitized.systemPrompt = args.systemPrompt;
    }
    if (args.maxTokens !== undefined) {
        sanitized.maxTokens = args.maxTokens;
    }
    if (temperatureAllowed && typeof args.temperature === 'number') {
        sanitized.temperature = args.temperature;
    }
    if (capabilities.supportsTopP && typeof args.top_p === 'number') {
        sanitized.top_p = args.top_p;
    }
    if (capabilities.supportsResponseFormat && args.responseFormat) {
        sanitized.responseFormat = args.responseFormat;
    }
    if (capabilities.supportsJsonSchema && args.jsonSchema) {
        sanitized.jsonSchema = args.jsonSchema;
    }
    if (capabilities.supportsThinkingConfig && args.disableThinking !== undefined) {
        sanitized.disableThinking = args.disableThinking;
    }

    return sanitized;
}
