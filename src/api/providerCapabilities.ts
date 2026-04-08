// DEPRECATED: Legacy provider adapter; prefer aiClient entrypoints.
import type { OpenAiResponseFormat } from './openaiApi';

export type AiProvider = 'openai' | 'anthropic' | 'google' | 'ollama';

export interface ProviderCallArgs {
    userPrompt: string;
    systemPrompt?: string | null;
    maxTokens?: number | null;
    temperature?: number;
    top_p?: number;
    responseFormat?: OpenAiResponseFormat;
    jsonSchema?: Record<string, unknown>;
    disableThinking?: boolean;
    thinkingBudgetTokens?: number;
    citationsEnabled?: boolean;
    evidenceDocuments?: { title: string; content: string }[];
}

type ProviderCapabilities = {
    supportsTemperature: boolean;
    supportsTopP: boolean;
    supportsResponseFormat: boolean;
    supportsJsonSchema: boolean;
    supportsThinkingConfig: boolean;
    supportsExtendedThinking: boolean;
    supportsCitations: boolean;
    supportsCorpusReuse: boolean;
    supportsBatchApi: boolean;
    supportsSystemRole: boolean;
};

const PROVIDER_CAPABILITIES: Record<AiProvider, ProviderCapabilities> = {
    openai: {
        supportsTemperature: true,
        supportsTopP: true,
        supportsResponseFormat: true,
        supportsJsonSchema: false,
        supportsThinkingConfig: false,
        supportsExtendedThinking: false,
        supportsCitations: false,
        supportsCorpusReuse: true,
        supportsBatchApi: true,
        supportsSystemRole: true
    },
    anthropic: {
        supportsTemperature: true,
        supportsTopP: true,
        supportsResponseFormat: false,
        supportsJsonSchema: true,
        supportsThinkingConfig: false,
        supportsExtendedThinking: true,
        supportsCitations: true,
        supportsCorpusReuse: true,
        supportsBatchApi: true,
        supportsSystemRole: true
    },
    google: {
        supportsTemperature: true,
        supportsTopP: true,
        supportsResponseFormat: false,
        supportsJsonSchema: true,
        supportsThinkingConfig: true,
        supportsExtendedThinking: false,
        supportsCitations: false,
        supportsCorpusReuse: true,
        supportsBatchApi: false,
        supportsSystemRole: true
    },
    ollama: {
        supportsTemperature: true,
        supportsTopP: true,
        supportsResponseFormat: true,
        supportsJsonSchema: false,
        supportsThinkingConfig: false,
        supportsExtendedThinking: false,
        supportsCitations: false,
        supportsCorpusReuse: false,
        supportsBatchApi: false,
        supportsSystemRole: false
    }
};

const MODEL_TEMPERATURE_UNSUPPORTED: Record<AiProvider, Set<string>> = {
    openai: new Set(['o1', 'o1-mini', 'o1-preview']),
    anthropic: new Set(),
    google: new Set(),
    ollama: new Set()
};

const MODEL_SYSTEM_ROLE_UNSUPPORTED: Record<AiProvider, Set<string>> = {
    openai: new Set(['o1', 'o1-mini', 'o1-preview']),
    anthropic: new Set(),
    google: new Set(),
    ollama: new Set()
};

const normalizeModelId = (provider: AiProvider, modelId?: string): string => {
    if (!modelId) return '';
    if (provider === 'google') {
        return modelId.trim().replace(/^models\//, '');
    }
    return modelId.trim();
};

export function getProviderCapabilities(provider: AiProvider): Readonly<ProviderCapabilities> {
    return PROVIDER_CAPABILITIES[provider];
}

export function providerSupportsCitations(provider: AiProvider): boolean {
    return PROVIDER_CAPABILITIES[provider].supportsCitations;
}

export function providerSupportsCorpusReuse(provider: AiProvider): boolean {
    return PROVIDER_CAPABILITIES[provider].supportsCorpusReuse;
}

export function providerSupportsBatchApi(provider: AiProvider): boolean {
    return PROVIDER_CAPABILITIES[provider].supportsBatchApi;
}

/** @deprecated Legacy sanitization — use sanitizeDispatchParams for the modern aiClient path. */
export function sanitizeProviderArgs(
    provider: AiProvider,
    modelId: string | undefined,
    args: ProviderCallArgs
): ProviderCallArgs {
    const capabilities = PROVIDER_CAPABILITIES[provider];
    const normalizedModelId = normalizeModelId(provider, modelId);
    const temperatureAllowed = capabilities.supportsTemperature &&
        !MODEL_TEMPERATURE_UNSUPPORTED[provider].has(normalizedModelId);
    const supportsCitationControl = capabilities.supportsCitations || provider === 'google';

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
    if (capabilities.supportsExtendedThinking && typeof args.thinkingBudgetTokens === 'number') {
        sanitized.thinkingBudgetTokens = args.thinkingBudgetTokens;
    }
    if (supportsCitationControl && args.citationsEnabled) {
        sanitized.citationsEnabled = args.citationsEnabled;
    }
    if (capabilities.supportsCitations && args.evidenceDocuments) {
        sanitized.evidenceDocuments = args.evidenceDocuments;
    }

    return sanitized;
}

// ---------------------------------------------------------------------------
// Modern dispatch sanitization — authoritative enforcement for aiClient.execute()
// ---------------------------------------------------------------------------

/** Parameters flowing through aiClient.execute() to provider adapters. */
export interface ProviderDispatchParams {
    modelId: string;
    systemPrompt?: string | null;
    userPrompt: string;
    maxOutputTokens: number;
    temperature?: number;
    topP?: number;
    jsonSchema?: Record<string, unknown>;
    jsonStrict?: boolean;
    thinkingBudgetTokens?: number;
    citationsEnabled?: boolean;
    evidenceDocuments?: { title: string; content: string }[];
    disableThinking?: boolean;
}

export interface SanitizeDispatchResult {
    params: ProviderDispatchParams;
    notes: string[];
}

/** Whether a Gemini model ID refers to a thinking-capable model (2.5+ series). */
function isGeminiThinkingModel(modelId: string): boolean {
    const clean = modelId.replace(/^models\//, '');
    return /\b2\.5\b|\b3\.\d/.test(clean);
}

/**
 * Central sanitization gate for all provider dispatch parameters.
 * Strips unsupported or conflicting parameters and returns structured notes
 * documenting every strip/coercion with provider + model + reason.
 *
 * This is the authoritative enforcement point invoked in aiClient.execute().
 * Provider-local guards (e.g. geminiApi temperature regex) are retained as
 * secondary safety nets but should never be the only protection.
 */
export function sanitizeDispatchParams(
    provider: AiProvider,
    params: ProviderDispatchParams,
    constraints?: { cacheVsCitationsExclusive?: boolean }
): SanitizeDispatchResult {
    const capabilities = PROVIDER_CAPABILITIES[provider];
    const notes: string[] = [];
    const sanitized: ProviderDispatchParams = { ...params };
    const modelLabel = `${provider}/${params.modelId}`;

    // --- Temperature ---
    if (typeof sanitized.temperature === 'number') {
        const normalizedId = normalizeModelId(provider, params.modelId);
        if (MODEL_TEMPERATURE_UNSUPPORTED[provider]?.has(normalizedId)) {
            notes.push(`Stripped temperature for ${modelLabel}: model does not support temperature`);
            sanitized.temperature = undefined;
        } else if (provider === 'google' && isGeminiThinkingModel(params.modelId)) {
            notes.push(`Stripped temperature for ${modelLabel}: Gemini thinking model rejects custom temperature`);
            sanitized.temperature = undefined;
        }
    }

    // --- topP ---
    if (typeof sanitized.topP === 'number') {
        if (!capabilities.supportsTopP) {
            notes.push(`Stripped topP for ${modelLabel}: unsupported by provider`);
            sanitized.topP = undefined;
        } else if (provider === 'google' && isGeminiThinkingModel(params.modelId)) {
            notes.push(`Stripped topP for ${modelLabel}: Gemini thinking model rejects custom topP`);
            sanitized.topP = undefined;
        }
    }

    // --- thinkingBudgetTokens (Anthropic extended thinking only) ---
    if (typeof sanitized.thinkingBudgetTokens === 'number' && !capabilities.supportsExtendedThinking) {
        notes.push(`Stripped thinkingBudgetTokens for ${modelLabel}: unsupported by provider`);
        sanitized.thinkingBudgetTokens = undefined;
    }

    // --- disableThinking (Google thinkingConfig only) ---
    if (sanitized.disableThinking !== undefined && !capabilities.supportsThinkingConfig) {
        notes.push(`Stripped disableThinking for ${modelLabel}: unsupported by provider`);
        sanitized.disableThinking = undefined;
    }

    // --- citationsEnabled ---
    const supportsCitationControl = capabilities.supportsCitations || provider === 'google';
    if (sanitized.citationsEnabled && !supportsCitationControl) {
        notes.push(`Stripped citationsEnabled for ${modelLabel}: unsupported by provider`);
        sanitized.citationsEnabled = undefined;
    }

    // --- cacheVsCitationsExclusive model constraint ---
    if (constraints?.cacheVsCitationsExclusive && sanitized.citationsEnabled) {
        notes.push(`Stripped citationsEnabled for ${modelLabel}: model constraint cacheVsCitationsExclusive — cache takes precedence`);
        sanitized.citationsEnabled = undefined;
    }

    // --- evidenceDocuments (Anthropic direct manuscript citations only) ---
    if (sanitized.evidenceDocuments?.length && !capabilities.supportsCitations) {
        notes.push(`Stripped evidenceDocuments for ${modelLabel}: provider does not support document citations`);
        sanitized.evidenceDocuments = undefined;
    }

    // --- jsonStrict (no provider API implements this as a toggle) ---
    // The Capability 'jsonStrict' is used for model selection; the request parameter
    // is not consumed by any provider adapter. Strip to avoid fake surface area.
    if (sanitized.jsonStrict !== undefined) {
        sanitized.jsonStrict = undefined;
    }

    return { params: sanitized, notes };
}

/** Capability-driven check for system role support.
 *  Checks provider-level flag, then per-model exclusion set.
 *  Use instead of the deprecated openAiModelSupportsSystemRole heuristic. */
export function modelSupportsSystemRole(provider: AiProvider, modelId?: string): boolean {
    const capabilities = PROVIDER_CAPABILITIES[provider];
    if (!capabilities.supportsSystemRole) return false;
    const normalizedId = normalizeModelId(provider, modelId).toLowerCase();
    if (!normalizedId) return true;
    return !MODEL_SYSTEM_ROLE_UNSUPPORTED[provider].has(normalizedId);
}
