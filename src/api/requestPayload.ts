// DEPRECATED: Legacy provider payload shim; route new call paths through aiClient.
import type { AiProvider, ProviderCallArgs } from './providerCapabilities';
import { openAiModelSupportsSystemRole } from './openaiApi';
import type { AnthropicTextBlock } from './anthropicApi';
import { CACHE_BREAK_DELIMITER } from '../ai/prompts/composeEnvelope';

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
    messages: { role: string; content: AnthropicTextBlock[] }[];
    max_tokens: number;
    system?: AnthropicTextBlock[];
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
        // Always use content blocks for Anthropic (mirrors anthropicApi.ts)
        const delimIndex = callArgs.userPrompt.indexOf(CACHE_BREAK_DELIMITER);
        let userContent: AnthropicTextBlock[];
        if (delimIndex > 0) {
            const stableText = callArgs.userPrompt.slice(0, delimIndex).trimEnd();
            const volatileText = callArgs.userPrompt.slice(delimIndex + CACHE_BREAK_DELIMITER.length).trimStart();
            userContent = [
                { type: 'text', text: stableText, cache_control: { type: 'ephemeral' } },
                { type: 'text', text: volatileText },
            ];
        } else {
            userContent = [{ type: 'text', text: callArgs.userPrompt }];
        }
        const payload: AnthropicPayload = {
            model: modelId,
            messages: [{ role: 'user', content: userContent }],
            max_tokens: resolvedMaxTokens
        };
        if (callArgs.systemPrompt) {
            payload.system = [{ type: 'text', text: callArgs.systemPrompt }];
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

    // Mirror openaiApi.ts: separate system/user when model supports it
    let openAiMessages: { role: string; content: string }[];
    if (callArgs.systemPrompt && openAiModelSupportsSystemRole(modelId)) {
        openAiMessages = [
            { role: 'system', content: callArgs.systemPrompt },
            { role: 'user', content: callArgs.userPrompt },
        ];
    } else {
        const fullPrompt = callArgs.systemPrompt
            ? `${callArgs.systemPrompt}\n\n${callArgs.userPrompt}`
            : callArgs.userPrompt;
        openAiMessages = [{ role: 'user', content: fullPrompt }];
    }
    const payload: OpenAiPayload = { model: modelId, messages: openAiMessages };
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
