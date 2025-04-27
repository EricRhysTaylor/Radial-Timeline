import { requestUrl, Notice } from 'obsidian';

// Define an interface for the expected successful response structure
interface AnthropicSuccessResponse {
    content: { type: string, text: string }[];
    usage?: { input_tokens: number, output_tokens: number }; // Optional usage info
    id?: string;
    model?: string;
    role?: string;
    stop_reason?: string;
    stop_sequence?: string | null;
    type?: string; // e.g., 'message'
}

// Define an interface for the expected error response structure
interface AnthropicErrorResponse {
    type: string; // Typically 'error'
    error: {
        type: string; // e.g., 'invalid_request_error', 'api_error'
        message: string;
    };
}

// <<< NEW: Interface for the return type of callAnthropicApi >>>
export interface AnthropicApiResponse {
    success: boolean;
    content: string | null;
    responseData: unknown; // The raw JSON response for logging
    error?: string; // Error message if success is false
}


/**
 * Calls the Anthropic Messages API.
 * @param apiKey The Anthropic API key.
 * @param modelId The specific model ID to use (e.g., 'claude-3-5-sonnet-20240620').
 * @param systemPrompt An optional system prompt to guide the model's behavior.
 * @param userPrompt The user's prompt/message.
 * @param maxTokens The maximum number of tokens to generate. Defaults to 4000.
 * @returns An AnthropicApiResponse object containing success status, content/error, and full response data.
 */
export async function callAnthropicApi(
    apiKey: string,
    modelId: string,
    systemPrompt: string | null,
    userPrompt: string,
    maxTokens: number = 4000 // Default to higher token limit consistent with BeatsCommands
): Promise<AnthropicApiResponse> { // <<< CHANGED return type

    const apiUrl = 'https://api.anthropic.com/v1/messages';
    const apiVersion = '2023-06-01'; // The required API version header

    if (!apiKey) {
        const errorMsg = 'Anthropic API key not configured.';
        // Return structured error, don't throw or use Notice here
        return { success: false, content: null, responseData: { type: 'error', error: { type: 'plugin_config_error', message: errorMsg } }, error: errorMsg };
    }
    if (!modelId) {
        const errorMsg = 'Anthropic model ID not configured.';
         // Return structured error
        return { success: false, content: null, responseData: { type: 'error', error: { type: 'plugin_config_error', message: errorMsg } }, error: errorMsg };
    }

    const messages = [
        { role: 'user', content: userPrompt }
    ];

    // Base request body structure
    const requestBody: {
        model: string;
        messages: { role: string; content: string }[];
        max_tokens: number;
        system?: string; // System prompt is optional and top-level
    } = {
        model: modelId,
        messages: messages,
        max_tokens: maxTokens,
    };

     // Add system prompt if provided
     if (systemPrompt) {
        requestBody.system = systemPrompt;
    }

    console.log('[API][Anthropic] Calling Anthropic API with:', { model: modelId, max_tokens: maxTokens, system_prompt_present: !!systemPrompt });

    let responseData: unknown;

    try {
        const response = await requestUrl({
            url: apiUrl,
            method: 'POST',
            headers: {
                'anthropic-version': apiVersion,
                'x-api-key': apiKey,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody),
            throw: false, // Handle HTTP errors manually
        });

        // Try parsing JSON regardless of status code
        try {
            responseData = response.json;
        } catch (jsonError) {
            console.error("[API][Anthropic] Failed to parse API response as JSON:", jsonError, response.text);
            const errorMsg = `Failed to parse response as JSON (Status: ${response.status})`;
             // Store structured error for logging
            responseData = { type: 'error', error: { type: 'json_parsing_error', message: errorMsg, status: response.status, raw_response: response.text } };
            // Don't show Notice here, let caller handle it
            return { success: false, content: null, responseData: responseData, error: errorMsg };
        }

        // Check for non-OK status codes (API errors)
        if (response.status >= 400) {
            let errorMessage = `Anthropic API Error (${response.status})`;
            // Use type assertion for potentially structured error
            const errorDetails = responseData as AnthropicErrorResponse;
            if (errorDetails?.error?.message) {
                errorMessage += `: ${errorDetails.error.message} (Type: ${errorDetails.error.type})`;
            } else if (response.text) {
                 errorMessage += `: ${response.text}`; // Fallback
            }
            console.error('[API][Anthropic] API Error Response:', responseData);
             // responseData already contains the error details from parsing
             // Don't show Notice here
            return { success: false, content: null, responseData: responseData, error: errorMessage };
        }

        // Check for expected successful response structure
        const successData = responseData as AnthropicSuccessResponse;
        const content = successData?.content?.[0]?.text?.trim();

        if (content) {
            if (successData.usage) {
                 console.log(`[API][Anthropic] Success. Input Tokens: ${successData.usage.input_tokens}, Output Tokens: ${successData.usage.output_tokens}`);
            } else {
                 console.log('[API][Anthropic] Success (Usage data missing from response).');
            }
            // responseData contains the full success details including usage
            return { success: true, content: content, responseData: responseData };
        } else {
            console.error('[API][Anthropic] Unexpected API response format:', responseData);
            const errorMsg = 'Invalid response structure from Anthropic (missing content).';
            // responseData contains the problematic structure
            // Don't show Notice here
            return { success: false, content: null, responseData: responseData, error: errorMsg };
        }

    } catch (error) {
        // Catch network errors or other unexpected issues during requestUrl
        console.error('[API][Anthropic] Error calling API via requestUrl:', error);
        const errorMsg = error instanceof Error ? error.message : String(error);
         // Create error response data for logging
        responseData = { type: 'error', error: { type: 'network_or_execution_error', message: `Network or execution error: ${errorMsg}` } };
         // Don't show Notice here
        return { success: false, content: null, responseData: responseData, error: `Failed to connect to Anthropic API: ${errorMsg}` };
    }
} 