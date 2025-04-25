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
    // Add other potential fields like id, object, created, model, system_fingerprint
}

// Interface for the expected OpenAI error response
interface OpenAiErrorResponse {
    error: {
        message: string;
        type: string;
        param: string | null;
        code: string | null;
        // Potentially include status if OpenAI adds it here standardly
    };
}

// Interface for the return type of callOpenAiApi
export interface OpenAiApiResponse {
    success: boolean;
    content: string | null;
    responseData: unknown; // The raw JSON response for logging
    error?: string; // Error message if success is false
}


/**
 * Calls the OpenAI Chat Completions API using Obsidian's requestUrl.
 * @param apiKey The OpenAI API key.
 * @param modelId The specific model ID to use (e.g., 'gpt-4o').
 * @param systemPrompt An optional system prompt.
 * @param userPrompt The user's prompt/message.
 * @param maxTokens Optional maximum tokens for the completion.
 * @param temperature Optional temperature setting.
 * @returns An OpenAiApiResponse object containing success status, content/error, and full response data.
 */
export async function callOpenAiApi(
    apiKey: string,
    modelId: string,
    systemPrompt: string | null,
    userPrompt: string,
    maxTokens: number | null = 4000, // Default max tokens if needed
    temperature: number = 0.7
): Promise<OpenAiApiResponse> {

    const apiUrl = 'https://api.openai.com/v1/chat/completions';

    if (!apiKey) {
        // No Notice here, let the calling function handle user feedback
        return { success: false, content: null, responseData: { error: { message: 'API key not configured.', type: 'plugin_error'} }, error: 'OpenAI API key not configured.' };
    }
     if (!modelId) {
        return { success: false, content: null, responseData: { error: { message: 'Model ID not configured.', type: 'plugin_error'} }, error: 'OpenAI Model ID not configured.' };
    }

    const messages = [];
    if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: userPrompt });

    const requestBody: {
        model: string;
        messages: { role: string; content: string }[];
        temperature: number;
        max_tokens?: number;
    } = {
        model: modelId,
        messages: messages,
        temperature: temperature,
    };

    if (maxTokens !== null) {
        requestBody.max_tokens = maxTokens;
    }

    let responseData: unknown; // To store the parsed JSON response for return

    try {
        const response = await requestUrl({
            url: apiUrl,
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            throw: false, // Handle HTTP errors manually
        });

        // Try parsing JSON regardless of status code for logging potential errors
        try {
            responseData = response.json;
        } catch (jsonError) {
            console.error("Failed to parse OpenAI API response as JSON:", jsonError, response.text);
            const errorMsg = `Failed to parse response as JSON (Status: ${response.status})`;
            // Store a structured error for logging
            responseData = { error: { message: errorMsg, type: 'json_parsing_error', status: response.status, raw_response: response.text } };
            return { success: false, content: null, responseData: responseData, error: errorMsg };
        }

        // Check for non-OK status codes (API errors)
        if (response.status >= 400) {
            let errorMessage = `OpenAI API Error (${response.status})`;
            const errorDetails = responseData as OpenAiErrorResponse; // Type assertion
            if (errorDetails?.error?.message) {
                errorMessage += `: ${errorDetails.error.message}`;
            } else if (response.text) {
                 errorMessage += `: ${response.text}`; // Fallback
            }
            console.error('OpenAI API Error Response:', responseData);
            // responseData already contains the error details from parsing
            return { success: false, content: null, responseData: responseData, error: errorMessage };
        }

        // Check for expected successful response structure
        const successData = responseData as OpenAiChatSuccessResponse; // Type assertion
        const content = successData?.choices?.[0]?.message?.content?.trim();

        if (content) {
            if (successData.usage) {
                 console.log(`OpenAI API Success. Input Tokens: ${successData.usage.prompt_tokens}, Output Tokens: ${successData.usage.completion_tokens}`);
            } else {
                 console.log('OpenAI API Success.');
            }
            // responseData contains the full success details
            return { success: true, content: content, responseData: responseData };
        } else {
            console.error('Unexpected OpenAI API response format:', responseData);
            const errorMsg = 'Invalid response structure from OpenAI (missing content).';
            // responseData contains the problematic structure
            return { success: false, content: null, responseData: responseData, error: errorMsg };
        }

    } catch (error) {
        // Catch network errors or other unexpected issues during requestUrl
        console.error('Error calling OpenAI API via requestUrl:', error);
        const errorMsg = error instanceof Error ? error.message : String(error);
         // Create error response data for logging
        responseData = { error: { message: `Network or execution error: ${errorMsg}`, type: 'network_or_execution_error' } };
        return { success: false, content: null, responseData: responseData, error: `Failed to connect to OpenAI API: ${errorMsg}` };
    }
} 

// --- NEW: Function to fetch models ---

// Interface for the model list response from OpenAI
interface OpenAiModel {
    id: string;
    object: string;
    created: number;
    owned_by: string;
    // Add other potential fields like permission, root, parent if needed
}

interface OpenAiListModelsResponse {
    object: string;
    data: OpenAiModel[];
}

/**
 * Fetches the list of available models from the OpenAI API.
 * @param apiKey The OpenAI API key.
 * @returns A promise that resolves to an array of model objects (potentially filtered).
 * @throws An error if the API call fails or returns an unexpected format.
 */
export async function fetchOpenAiModels(apiKey: string): Promise<OpenAiModel[]> {
    const apiUrl = 'https://api.openai.com/v1/models';

    if (!apiKey) {
        // Throw error instead of returning null, as the caller expects a promise or throws
        throw new Error('OpenAI API key is required to fetch models.');
    }

    console.log("Fetching OpenAI models..."); // Add log

    try {
        const response = await requestUrl({
            url: apiUrl,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
            throw: false, // Handle errors manually
        });

        const responseData = response.json;

        if (response.status >= 400) {
            let errorMessage = `OpenAI API Error fetching models (${response.status})`;
            const errorDetails = responseData as OpenAiErrorResponse;
            if (errorDetails?.error?.message) {
                errorMessage += `: ${errorDetails.error.message}`;
            } else if (response.text) {
                errorMessage += `: ${response.text}`;
            }
            console.error('OpenAI Models API Error:', responseData);
            throw new Error(errorMessage); // Throw error to be caught by caller
        }

        const listData = responseData as OpenAiListModelsResponse;
        if (listData?.data && Array.isArray(listData.data)) {
             console.log(`Fetched ${listData.data.length} models from OpenAI.`); // Log total count
            // Optional: Filter the models further if needed
            const relevantModels = listData.data
                // Example: Filter out older/less relevant models if desired
                // .filter(model => !model.id.includes('davinci') && !model.id.includes('curie') && model.owned_by === 'openai')
                .sort((a, b) => a.id.localeCompare(b.id)); // Sort alphabetically

            return relevantModels;
        } else {
            console.error('Unexpected OpenAI Models API response format:', responseData);
            throw new Error('Unexpected response format when fetching OpenAI models.');
        }

    } catch (error) {
        console.error('Error calling OpenAI Models API:', error);
         // Re-throw specific API errors or a generic one
         if (error instanceof Error) {
             throw error;
         } else {
            throw new Error(`Failed to connect to OpenAI API to fetch models: ${String(error)}`);
         }
    }
}