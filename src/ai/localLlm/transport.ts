import { requestUrl } from 'obsidian';

export interface LocalLlmTransportRequest {
    baseUrl: string;
    timeoutMs: number;
    apiKey?: string;
}

export interface LocalLlmModelEntry {
    id: string;
    object?: string;
}

export interface LocalLlmCompletionResponse {
    success: boolean;
    content: string | null;
    responseData: unknown;
    requestPayload: unknown;
    error?: string;
}

type OpenAiCompatibleMessage = {
    role: 'system' | 'user';
    content: string;
};

type OpenAiCompatibleTextPart = {
    type?: string;
    text?: string;
    output_text?: string;
    [key: string]: unknown;
};

type OpenAiCompatibleChoice = {
    message?: {
        content?: unknown;
    };
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
        promise.then(
            value => {
                globalThis.clearTimeout(timer);
                resolve(value);
            },
            error => {
                globalThis.clearTimeout(timer);
                reject(error);
            }
        );
    });
}

function normalizeBaseUrl(baseUrl: string, path: string): string {
    const trimmed = baseUrl.trim().replace(/\/+$/, '');
    if (trimmed.endsWith(path)) return trimmed;
    return `${trimmed}${path}`;
}

function extractString(value: unknown): string | null {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (!Array.isArray(value)) return null;
    const chunks = value
        .map(part => {
            if (!part || typeof part !== 'object') return null;
            const record = part as OpenAiCompatibleTextPart;
            return typeof record.output_text === 'string' && record.output_text.trim()
                ? record.output_text.trim()
                : (typeof record.text === 'string' && record.text.trim() ? record.text.trim() : null);
        })
        .filter((chunk): chunk is string => !!chunk);
    return chunks.length ? chunks.join('\n\n') : null;
}

function buildHeaders(apiKey?: string): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };
    if (apiKey?.trim()) {
        headers.Authorization = `Bearer ${apiKey.trim()}`;
    }
    return headers;
}

function buildMessages(systemPrompt: string | null | undefined, userPrompt: string): OpenAiCompatibleMessage[] {
    if (systemPrompt && systemPrompt.trim()) {
        return [
            { role: 'system', content: systemPrompt.trim() },
            { role: 'user', content: userPrompt }
        ];
    }
    return [{ role: 'user', content: userPrompt }];
}

export async function fetchOpenAiCompatibleLocalModels(
    request: LocalLlmTransportRequest
): Promise<LocalLlmModelEntry[]> {
    const url = normalizeBaseUrl(request.baseUrl, '/models');
    const response = await withTimeout(requestUrl({
        url,
        method: 'GET',
        headers: buildHeaders(request.apiKey),
        throw: false
    }), request.timeoutMs, 'Local LLM model list request timed out.');
    const responseData = response.json as { data?: LocalLlmModelEntry[]; error?: { message?: string } };
    if (response.status >= 400) {
        throw new Error(responseData?.error?.message || `HTTP ${response.status}`);
    }
    if (!Array.isArray(responseData?.data)) {
        throw new Error('Local LLM backend returned an unexpected model list response.');
    }
    return responseData.data;
}

export async function callOpenAiCompatibleLocalCompletion(input: {
    transport: LocalLlmTransportRequest;
    modelId: string;
    systemPrompt?: string | null;
    userPrompt: string;
    maxOutputTokens?: number;
    temperature?: number;
    topP?: number;
    responseFormat?: { type: 'json_object' };
}): Promise<LocalLlmCompletionResponse> {
    const requestPayload: Record<string, unknown> = {
        model: input.modelId,
        messages: buildMessages(input.systemPrompt, input.userPrompt)
    };
    if (typeof input.maxOutputTokens === 'number') {
        requestPayload.max_completion_tokens = input.maxOutputTokens;
    }
    if (typeof input.temperature === 'number') {
        requestPayload.temperature = input.temperature;
    }
    if (typeof input.topP === 'number') {
        requestPayload.top_p = input.topP;
    }
    if (input.responseFormat) {
        requestPayload.response_format = input.responseFormat;
    }

    try {
        const response = await withTimeout(requestUrl({
            url: normalizeBaseUrl(input.transport.baseUrl, '/chat/completions'),
            method: 'POST',
            headers: buildHeaders(input.transport.apiKey),
            body: JSON.stringify(requestPayload),
            throw: false
        }), input.transport.timeoutMs, 'Local LLM completion request timed out.');
        const responseData = response.json;
        if (response.status >= 400) {
            const message = (responseData as { error?: { message?: string } })?.error?.message
                || response.text
                || `HTTP ${response.status}`;
            return {
                success: false,
                content: null,
                responseData,
                requestPayload,
                error: message
            };
        }
        const choices = Array.isArray((responseData as { choices?: OpenAiCompatibleChoice[] })?.choices)
            ? (responseData as { choices: OpenAiCompatibleChoice[] }).choices
            : [];
        const content = extractString(choices[0]?.message?.content);
        if (!content) {
            return {
                success: false,
                content: null,
                responseData,
                requestPayload,
                error: 'Local LLM backend returned no completion content.'
            };
        }
        return {
            success: true,
            content,
            responseData,
            requestPayload
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            content: null,
            responseData: { error: { message } },
            requestPayload,
            error: message
        };
    }
}
