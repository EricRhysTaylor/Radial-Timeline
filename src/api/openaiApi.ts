/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
// DEPRECATED: Legacy provider adapter; prefer aiClient entrypoints.
import { requestUrl } from 'obsidian'; // Use requestUrl for consistency
import { warnLegacyAccess } from './legacyAccessGuard';
import { modelSupportsSystemRole } from './providerCapabilities';

/** @deprecated Use modelSupportsSystemRole(provider, modelId) from providerCapabilities.
 *  Retained as thin wrapper for backward compat and evidence pattern validation. */
export function openAiModelSupportsSystemRole(modelId: string): boolean {
    return modelSupportsSystemRole('openai', modelId);
}

// Interface for the expected successful OpenAI Chat Completion response
interface OpenAiChatSuccessResponse {
    choices: {
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

// Interface for the expected OpenAI error response
interface OpenAiErrorResponse {
    error: {
        message: string;
        type: string;
        param: string | null;
        code: string | null;
    };
}

export interface OpenAiApiResponse {
    success: boolean;
    content: string | null;
    responseData: unknown;
    error?: string;
}

export type OpenAiResponseFormat =
    | { type: 'json_object' }
    | { type: 'json_schema'; json_schema: Record<string, unknown> };

interface OpenAiResponsesTextPart {
    text?: string;
    output_text?: string;
    [key: string]: unknown;
}

interface OpenAiResponsesOutputItem {
    type?: string;
    content?: OpenAiResponsesTextPart[];
    text?: string;
    output_text?: string;
    [key: string]: unknown;
}

type OpenAiResponsesTextFormat =
    | { type: 'json_object' }
    | { type: 'json_schema'; name: string; schema: Record<string, unknown> };

function normalizeBaseUrl(baseUrl: string | undefined, endpointPath: '/chat/completions' | '/responses'): string {
    if (!baseUrl) return `https://api.openai.com/v1${endpointPath}`;
    const base = baseUrl.replace(/\/$/, '');
    if (base.endsWith(endpointPath)) return base;
    return `${base}${endpointPath}`;
}

function buildOpenAiChatMessages(
    modelId: string,
    systemPrompt: string | null,
    userPrompt: string,
    baseUrl?: string
): { role: string; content: string }[] {
    const supportsSystem = !baseUrl && openAiModelSupportsSystemRole(modelId);
    if (systemPrompt && supportsSystem) {
        return [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ];
    }

    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
    return [{ role: 'user', content: fullPrompt }];
}

function buildOpenAiResponsesInput(
    modelId: string,
    systemPrompt: string | null,
    userPrompt: string
): { role: 'system' | 'user'; content: { type: 'input_text'; text: string }[] }[] {
    const supportsSystem = openAiModelSupportsSystemRole(modelId);
    if (systemPrompt && supportsSystem) {
        return [
            { role: 'system', content: [{ type: 'input_text', text: systemPrompt }] },
            { role: 'user', content: [{ type: 'input_text', text: userPrompt }] }
        ];
    }
    const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${userPrompt}` : userPrompt;
    return [{ role: 'user', content: [{ type: 'input_text', text: fullPrompt }] }];
}

function toResponsesTextFormat(responseFormat: OpenAiResponseFormat): OpenAiResponsesTextFormat {
    if (responseFormat.type === 'json_object') {
        return { type: 'json_object' };
    }
    const schemaEnvelope = responseFormat.json_schema && typeof responseFormat.json_schema === 'object'
        ? responseFormat.json_schema as Record<string, unknown>
        : {};
    const rawName = schemaEnvelope.name;
    const rawSchema = schemaEnvelope.schema;
    return {
        type: 'json_schema',
        name: typeof rawName === 'string' && rawName.trim() ? rawName.trim() : 'ai_result',
        schema: rawSchema && typeof rawSchema === 'object' ? rawSchema as Record<string, unknown> : {}
    };
}

function firstString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
        for (const item of value) {
            if (typeof item === 'string' && item.trim()) return item.trim();
        }
    }
    return null;
}

export function extractOpenAiResponsesContent(responseData: unknown): string | null {
    if (!responseData || typeof responseData !== 'object') return null;
    const data = responseData as Record<string, unknown>;
    const chunks: string[] = [];
    const pushChunk = (value: unknown) => {
        const text = firstString(value);
        if (text) chunks.push(text);
    };

    pushChunk(data.output_text);

    const output = Array.isArray(data.output) ? data.output as OpenAiResponsesOutputItem[] : [];
    for (const item of output) {
        pushChunk(item.output_text);
        pushChunk(item.text);
        const contentParts = Array.isArray(item.content) ? item.content : [];
        for (const part of contentParts) {
            pushChunk(part.output_text);
            pushChunk(part.text);
        }
    }

    if (!chunks.length) return null;
    return chunks.join('\n\n').trim() || null;
}

function extractResponsesFinishReason(responseData: unknown): string | null {
    if (!responseData || typeof responseData !== 'object') return null;
    const data = responseData as Record<string, unknown>;
    const status = typeof data.status === 'string' ? data.status : null;
    if (status === 'completed') return 'stop';
    if (status === 'incomplete') {
        const incomplete = data.incomplete_details;
        if (incomplete && typeof incomplete === 'object') {
            const reason = (incomplete as Record<string, unknown>).reason;
            if (typeof reason === 'string') {
                if (reason === 'max_output_tokens') return 'length';
                return reason;
            }
        }
        return 'incomplete';
    }
    return null;
}

function extractResponsesErrorReason(responseData: unknown): string | null {
    if (!responseData || typeof responseData !== 'object') return null;
    const data = responseData as Record<string, unknown>;
    const status = typeof data.status === 'string' ? data.status : null;
    if (status !== 'incomplete') return null;
    const incomplete = data.incomplete_details;
    if (!incomplete || typeof incomplete !== 'object') return 'incomplete';
    const reason = (incomplete as Record<string, unknown>).reason;
    return typeof reason === 'string' ? reason : 'incomplete';
}

export function normalizeOpenAiResponsesUsage(usageValue: unknown): {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
} | null {
    if (!usageValue || typeof usageValue !== 'object') return null;
    const usage = usageValue as Record<string, unknown>;
    const prompt = typeof usage.prompt_tokens === 'number'
        ? usage.prompt_tokens
        : (typeof usage.input_tokens === 'number' ? usage.input_tokens : undefined);
    const completion = typeof usage.completion_tokens === 'number'
        ? usage.completion_tokens
        : (typeof usage.output_tokens === 'number' ? usage.output_tokens : undefined);
    const total = typeof usage.total_tokens === 'number'
        ? usage.total_tokens
        : (prompt !== undefined && completion !== undefined ? prompt + completion : undefined);
    if (prompt === undefined && completion === undefined && total === undefined) return null;
    return {
        prompt_tokens: prompt,
        completion_tokens: completion,
        total_tokens: total
    };
}

export function normalizeOpenAiResponsesResponseData(
    responseData: unknown,
    modelId: string,
    content: string | null
): unknown {
    if (!responseData || typeof responseData !== 'object') return responseData;
    const data = responseData as Record<string, unknown>;
    const normalized: Record<string, unknown> = { ...data };
    if (typeof normalized.model !== 'string') {
        normalized.model = modelId;
    }

    const normalizedUsage = normalizeOpenAiResponsesUsage(data.usage);
    if (normalizedUsage) {
        const usageBase = data.usage && typeof data.usage === 'object'
            ? data.usage as Record<string, unknown>
            : {};
        normalized.usage = {
            ...usageBase,
            ...normalizedUsage
        };
    }

    if (content && !Array.isArray(normalized.choices)) {
        normalized.choices = [{
            message: {
                role: 'assistant',
                content
            },
            finish_reason: extractResponsesFinishReason(data) ?? 'stop'
        }];
    }

    return normalized;
}

export async function callOpenAiApi(
    apiKey: string,
    modelId: string,
    systemPrompt: string | null,
    userPrompt: string,
    maxTokens: number | null = 4000,
    baseUrl?: string,
    responseFormat?: OpenAiResponseFormat,
    temperature?: number,
    topP?: number,
    allowFormatFallback = true,
    internalAdapterAccess?: boolean
): Promise<OpenAiApiResponse> {
    warnLegacyAccess('openaiApi.callOpenAiApi', internalAdapterAccess);
    const apiUrl = normalizeBaseUrl(baseUrl, '/chat/completions');

    if (!apiKey && !baseUrl) {
        return { success: false, content: null, responseData: { error: { message: 'API key not configured.', type: 'plugin_error' } }, error: 'OpenAI API key not configured.' };
    }
    if (!modelId) {
        return { success: false, content: null, responseData: { error: { message: 'Model ID not configured.', type: 'plugin_error' } }, error: 'OpenAI Model ID not configured.' };
    }

    const messages = buildOpenAiChatMessages(modelId, systemPrompt, userPrompt, baseUrl);

    const requestBody: {
        model: string;
        messages: { role: string; content: string }[];
        max_completion_tokens?: number;
        response_format?: OpenAiResponseFormat;
        temperature?: number;
        top_p?: number;
    } = { model: modelId, messages };

    if (maxTokens !== null) {
        requestBody.max_completion_tokens = maxTokens;
    }
    if (responseFormat) {
        requestBody.response_format = responseFormat;
    }
    if (typeof temperature === 'number') {
        requestBody.temperature = temperature;
    }
    if (typeof topP === 'number') {
        requestBody.top_p = topP;
    }

    let responseData: unknown;

    try {
        const response = await requestUrl({
            url: apiUrl,
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            throw: false,
        });
        responseData = response.json;
        if (response.status >= 400) {
            const errorDetails = responseData as OpenAiErrorResponse;
            const msg = errorDetails?.error?.message ?? response.text ?? `OpenAI error (${response.status})`;
            // Broaden check to catch "JSON mode" errors from various local servers (Ollama, etc.)
            if (responseFormat && allowFormatFallback && /(response_format|json)/i.test(msg)) {
                console.warn('[OpenAI API] JSON mode not supported by server/model, retrying without enforcement.');
                return callOpenAiApi(apiKey, modelId, systemPrompt, userPrompt, maxTokens, baseUrl, undefined, temperature, topP, false, internalAdapterAccess);
            }
            return { success: false, content: null, responseData, error: msg };
        }
        const success = responseData as OpenAiChatSuccessResponse;
        const content = success?.choices?.[0]?.message?.content?.trim();
        if (content) return { success: true, content, responseData };
        return { success: false, content: null, responseData, error: 'Invalid response structure from OpenAI.' };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        responseData = { error: { message: msg, type: 'network_or_execution_error' } };
        return { success: false, content: null, responseData, error: msg };
    }
}

export async function callOpenAiResponsesApi(
    apiKey: string,
    modelId: string,
    systemPrompt: string | null,
    userPrompt: string,
    maxTokens: number | null = 4000,
    responseFormat?: OpenAiResponseFormat,
    temperature?: number,
    topP?: number,
    allowFormatFallback = true,
    internalAdapterAccess?: boolean
): Promise<OpenAiApiResponse> {
    warnLegacyAccess('openaiApi.callOpenAiResponsesApi', internalAdapterAccess);
    const apiUrl = normalizeBaseUrl(undefined, '/responses');

    if (!apiKey) {
        return {
            success: false,
            content: null,
            responseData: { error: { message: 'API key not configured.', type: 'plugin_error' } },
            error: 'OpenAI API key not configured.'
        };
    }
    if (!modelId) {
        return {
            success: false,
            content: null,
            responseData: { error: { message: 'Model ID not configured.', type: 'plugin_error' } },
            error: 'OpenAI Model ID not configured.'
        };
    }

    const requestBody: {
        model: string;
        input: { role: 'system' | 'user'; content: { type: 'input_text'; text: string }[] }[];
        max_output_tokens?: number;
        text?: { format: OpenAiResponsesTextFormat };
        temperature?: number;
        top_p?: number;
    } = {
        model: modelId,
        input: buildOpenAiResponsesInput(modelId, systemPrompt, userPrompt)
    };

    if (maxTokens !== null) {
        requestBody.max_output_tokens = maxTokens;
    }
    if (responseFormat) {
        requestBody.text = { format: toResponsesTextFormat(responseFormat) };
    }
    if (typeof temperature === 'number') {
        requestBody.temperature = temperature;
    }
    if (typeof topP === 'number') {
        requestBody.top_p = topP;
    }

    let responseData: unknown;

    try {
        const response = await requestUrl({
            url: apiUrl,
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            throw: false
        });
        responseData = response.json;
        if (response.status >= 400) {
            const errorDetails = responseData as OpenAiErrorResponse;
            const msg = errorDetails?.error?.message ?? response.text ?? `OpenAI error (${response.status})`;
            if (responseFormat && allowFormatFallback && /(response_format|json|text\.format)/i.test(msg)) {
                console.warn('[OpenAI API] Responses text format not supported by model, retrying without enforcement.');
                return callOpenAiResponsesApi(
                    apiKey,
                    modelId,
                    systemPrompt,
                    userPrompt,
                    maxTokens,
                    undefined,
                    temperature,
                    topP,
                    false,
                    internalAdapterAccess
                );
            }
            return { success: false, content: null, responseData, error: msg };
        }

        const content = extractOpenAiResponsesContent(responseData);
        const normalizedResponseData = normalizeOpenAiResponsesResponseData(responseData, modelId, content);
        if (content) {
            return { success: true, content, responseData: normalizedResponseData };
        }

        const incompleteReason = extractResponsesErrorReason(responseData);
        if (incompleteReason) {
            return {
                success: false,
                content: null,
                responseData: normalizedResponseData,
                error: `OpenAI Responses returned incomplete output (${incompleteReason}).`
            };
        }

        return {
            success: false,
            content: null,
            responseData: normalizedResponseData,
            error: 'Invalid response structure from OpenAI Responses API.'
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        responseData = { error: { message: msg, type: 'network_or_execution_error' } };
        return { success: false, content: null, responseData, error: msg };
    }
}

// --- fetch models ---
interface OpenAiModel { id: string; object: string; created: number; owned_by: string; }
interface OpenAiListModelsResponse { object: string; data: OpenAiModel[]; }
export async function fetchOpenAiModels(apiKey: string): Promise<OpenAiModel[]> {
    if (!apiKey) throw new Error('OpenAI API key is required to fetch models.');
    const response = await requestUrl({
        url: 'https://api.openai.com/v1/models',
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
        throw: false,
    });
    const data = response.json as OpenAiListModelsResponse;
    if (response.status >= 400 || !Array.isArray(data?.data)) {
        throw new Error(`Error fetching models (${response.status})`);
    }
    return data.data.sort((a, b) => a.id.localeCompare(b.id));
} 
