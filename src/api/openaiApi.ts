import { requestUrl, Notice } from 'obsidian'; // Use requestUrl for consistency

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

export async function callOpenAiApi(
    apiKey: string,
    modelId: string,
    systemPrompt: string | null,
    userPrompt: string,
    maxTokens: number | null = 4000,
    temperature: number = 0.7
): Promise<OpenAiApiResponse> {
    const apiUrl = 'https://api.openai.com/v1/chat/completions';
    if (!apiKey) {
        return { success: false, content: null, responseData: { error: { message: 'API key not configured.', type: 'plugin_error'} }, error: 'OpenAI API key not configured.' };
    }
    if (!modelId) {
        return { success: false, content: null, responseData: { error: { message: 'Model ID not configured.', type: 'plugin_error'} }, error: 'OpenAI Model ID not configured.' };
    }

    const messages = [] as { role: string; content: string }[];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: userPrompt });

    const requestBody: {
        model: string;
        messages: { role: string; content: string }[];
        temperature: number;
        max_tokens?: number;
    } = { model: modelId, messages, temperature };
    if (maxTokens !== null) requestBody.max_tokens = maxTokens;

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