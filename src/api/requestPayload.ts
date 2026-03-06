// DEPRECATED: Legacy provider payload shim; route new call paths through aiClient.
import type { AiProvider, ProviderCallArgs } from './providerCapabilities';
import { modelSupportsSystemRole } from './providerCapabilities';
import { buildAnthropicUserContent, type AnthropicTextBlock, type AnthropicContentBlock } from './anthropicApi';
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
    messages: { role: string; content: AnthropicContentBlock[] }[];
    max_tokens: number;
    system?: AnthropicTextBlock[];
    temperature?: number;
    top_p?: number;
    thinking?: { type: 'enabled'; budget_tokens: number };
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
    cachedContent?: string;
};

export function buildProviderRequestPayload(
    provider: AiProvider,
    modelId: string,
    callArgs: ProviderCallArgs
): OpenAiPayload | AnthropicPayload | GeminiPayload {
    if (provider === 'anthropic') {
        const resolvedMaxTokens = typeof callArgs.maxTokens === 'number' ? callArgs.maxTokens : 4000;
        // Keep Anthropic payload shaping aligned with the runtime adapter.
        const userContent = buildAnthropicUserContent({
            userPrompt: callArgs.userPrompt,
            citationsEnabled: callArgs.citationsEnabled,
            evidenceDocuments: callArgs.evidenceDocuments
        });
        const payload: AnthropicPayload = {
            model: modelId,
            messages: [{ role: 'user', content: userContent }],
            max_tokens: resolvedMaxTokens
        };
        if (callArgs.systemPrompt) {
            payload.system = [{ type: 'text', text: callArgs.systemPrompt }];
        }
        if (typeof callArgs.temperature === 'number') {
            payload.temperature = callArgs.temperature;
        }
        if (typeof callArgs.top_p === 'number') {
            payload.top_p = callArgs.top_p;
        }
        if (typeof callArgs.thinkingBudgetTokens === 'number' && callArgs.thinkingBudgetTokens >= 1024) {
            payload.thinking = { type: 'enabled', budget_tokens: callArgs.thinkingBudgetTokens };
            payload.max_tokens = payload.max_tokens + callArgs.thinkingBudgetTokens;
        }
        return payload;
    }

    if (provider === 'gemini') {
        // Mirror providerRouter: split on delimiter when present
        const delimIndex = callArgs.userPrompt.indexOf(CACHE_BREAK_DELIMITER);
        let userText = callArgs.userPrompt;
        let cachedContentNote: string | undefined;
        let includeSystem = true;
        if (delimIndex > 0) {
            const stableText = callArgs.userPrompt.slice(0, delimIndex).trimEnd();
            userText = callArgs.userPrompt
                .slice(delimIndex + CACHE_BREAK_DELIMITER.length).trimStart();
            cachedContentNote = `[cached: ${stableText.length} chars stable prefix]`;
            includeSystem = false;  // system goes in cache, not in request
        }
        const payload: GeminiPayload = {
            contents: [{ role: 'user', parts: [{ text: userText }] }],
            generationConfig: {}
        };
        if (cachedContentNote) {
            payload.cachedContent = cachedContentNote;
        }
        if (callArgs.systemPrompt && includeSystem) {
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
    if (callArgs.systemPrompt && modelSupportsSystemRole(provider, modelId)) {
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
