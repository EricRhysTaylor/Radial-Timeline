import type { AiProvider, ProviderCallArgs } from './providerCapabilities';

type OpenAiPayload = {
    model: string;
    messages: { role: string; content: string }[];
    max_completion_tokens?: number;
    response_format?: ProviderCallArgs['responseFormat'];
    temperature?: number;
    top_p?: number;
};

type AnthropicPayload = {
    model: string;
    messages: { role: string; content: string }[];
    max_tokens: number;
    system?: string;
};

type GeminiPayload = {
    contents: { role: 'user'; parts: { text: string }[] }[];
    generationConfig: {
        temperature?: number;
        topP?: number;
        maxOutputTokens?: number;
        responseMimeType?: string;
        responseSchema?: Record<string, unknown>;
    };
    systemInstruction?: { parts: { text: string }[] };
};

export function buildProviderRequestPayload(
    provider: AiProvider,
    modelId: string,
    callArgs: ProviderCallArgs
): OpenAiPayload | AnthropicPayload | GeminiPayload {
    if (provider === 'anthropic') {
        const resolvedMaxTokens = typeof callArgs.maxTokens === 'number' ? callArgs.maxTokens : 4000;
        const payload: AnthropicPayload = {
            model: modelId,
            messages: [{ role: 'user', content: callArgs.userPrompt }],
            max_tokens: resolvedMaxTokens
        };
        if (callArgs.systemPrompt) {
            payload.system = callArgs.systemPrompt;
        }
        return payload;
    }

    if (provider === 'gemini') {
        const payload: GeminiPayload = {
            contents: [{ role: 'user', parts: [{ text: callArgs.userPrompt }] }],
            generationConfig: {}
        };
        if (callArgs.systemPrompt) {
            payload.systemInstruction = { parts: [{ text: callArgs.systemPrompt }] };
        }
        if (callArgs.maxTokens !== null && callArgs.maxTokens !== undefined) {
            payload.generationConfig.maxOutputTokens = callArgs.maxTokens;
        }
        if (typeof callArgs.temperature === 'number') {
            payload.generationConfig.temperature = callArgs.temperature;
        }
        if (typeof callArgs.top_p === 'number') {
            payload.generationConfig.topP = callArgs.top_p;
        }
        if (callArgs.jsonSchema) {
            payload.generationConfig.responseMimeType = 'application/json';
            payload.generationConfig.responseSchema = callArgs.jsonSchema;
        }
        return payload;
    }

    const fullPrompt = callArgs.systemPrompt ? `${callArgs.systemPrompt}\n\n${callArgs.userPrompt}` : callArgs.userPrompt;
    const payload: OpenAiPayload = {
        model: modelId,
        messages: [{ role: 'user', content: fullPrompt }]
    };
    if (callArgs.maxTokens !== null && callArgs.maxTokens !== undefined) {
        payload.max_completion_tokens = callArgs.maxTokens;
    }
    if (callArgs.responseFormat) {
        payload.response_format = callArgs.responseFormat;
    }
    if (typeof callArgs.temperature === 'number') {
        payload.temperature = callArgs.temperature;
    }
    if (typeof callArgs.top_p === 'number') {
        payload.top_p = callArgs.top_p;
    }
    return payload;
}
