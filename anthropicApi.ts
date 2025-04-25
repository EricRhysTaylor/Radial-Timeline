import { requestUrl, Notice } from 'obsidian';

// Define an interface for the expected successful response structure
interface AnthropicResponse {
    content: { type: string, text: string }[];
    usage?: { input_tokens: number, output_tokens: number }; // Optional usage info
    // Add other potential fields if needed, e.g., id, model, stop_reason
}

// Define an interface for the expected error response structure
interface AnthropicErrorResponse {
    error: {
        type: string;
        message: string;
    };
}

/**
 * Calls the Anthropic Messages API.
 * @param apiKey The Anthropic API key.
 * @param modelId The specific model ID to use (e.g., 'claude-3-5-sonnet-20240620').
 * @param systemPrompt An optional system prompt to guide the model's behavior.
 * @param userPrompt The user's prompt/message.
 * @param maxTokens The maximum number of tokens to generate. Defaults to 1024.
 * @returns The generated text content from the model.
 * @throws An error if the API call fails or returns an unexpected format.
 */
export async function callAnthropicApi(
    apiKey: string,
    modelId: string,
    systemPrompt: string | null,
    userPrompt: string,
    maxTokens: number = 1024
): Promise<string> {

    const apiUrl = 'https://api.anthropic.com/v1/messages';
    const apiVersion = '2023-06-01'; // The required API version header

    if (!apiKey) {
        new Notice('Anthropic API key is not set in settings.');
        throw new Error('Anthropic API key not configured.');
    }
    if (!modelId) {
        // Should default in settings, but good to check
        new Notice('Anthropic model ID is not set in settings.');
        throw new Error('Anthropic model ID not configured.');
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

     // Add system prompt if provided (as a top-level parameter for Messages API)
     if (systemPrompt) {
        requestBody.system = systemPrompt;
    }

    console.log('Calling Anthropic API with:', { model: modelId, max_tokens: maxTokens, system_prompt_present: !!systemPrompt }); // Basic log

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

        const responseData = response.json;

        // Check for API errors indicated by status code or specific error structure
        if (response.status >= 400) {
            let errorMessage = `Anthropic API Error (${response.status})`;
            const errorDetails = responseData as AnthropicErrorResponse;
            if (errorDetails?.error?.message) {
                errorMessage += `: ${errorDetails.error.message}`;
            } else if (response.text) {
                 errorMessage += `: ${response.text}`;
            }
            console.error('Anthropic API Error Response:', responseData);
            new Notice(errorMessage);
            throw new Error(errorMessage);
        }

        // Check for expected successful response structure
        const successData = responseData as AnthropicResponse;
        if (successData?.content?.[0]?.text) {
             if (successData.usage) {
                console.log(`Anthropic API Success. Input Tokens: ${successData.usage.input_tokens}, Output Tokens: ${successData.usage.output_tokens}`);
            } else {
                console.log('Anthropic API Success.');
            }
            return successData.content[0].text;
        } else {
            console.error('Unexpected Anthropic API response format:', responseData);
            new Notice('Failed to parse response from Anthropic API.');
            throw new Error('Unexpected response format from Anthropic API.');
        }

    } catch (error) {
        console.error('Error calling Anthropic API:', error);
        // Show a generic notice if it wasn't an API error already handled
        if (!(error instanceof Error && error.message.startsWith('Anthropic API Error'))) {
             new Notice('An error occurred while contacting the Anthropic API.');
        }
        // Re-throw the error to be handled by the calling function
        throw error;
    }
} 