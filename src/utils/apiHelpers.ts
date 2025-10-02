import { requestUrl } from 'obsidian';

/**
 * Common API response structure
 */
export interface ApiResponse<T = unknown> {
    success: boolean;
    content: string | null;
    responseData: T;
    error?: string;
}

/**
 * Configuration for making API requests
 */
export interface ApiRequestConfig {
    url: string;
    method: string;
    headers: Record<string, string>;
    body: string;
}

/**
 * Function to extract success content from provider-specific response data
 */
export type SuccessParser<T> = (data: T) => string | null | undefined;

/**
 * Function to extract error message from provider-specific response data
 */
export type ErrorParser<T> = (data: T, statusCode: number, statusText: string) => string;

/**
 * Make an API request with common error handling
 * @param config - Request configuration (url, method, headers, body)
 * @param parseSuccess - Function to extract content from successful response
 * @param parseError - Function to extract error message from failed response
 * @returns Promise with standardized API response
 */
export async function makeApiRequest<T = unknown>(
    config: ApiRequestConfig,
    parseSuccess: SuccessParser<T>,
    parseError: ErrorParser<T>
): Promise<ApiResponse<T>> {
    let responseData: unknown;

    try {
        const response = await requestUrl({
            url: config.url,
            method: config.method,
            headers: config.headers,
            body: config.body,
            throw: false,
        });

        responseData = response.json as T;

        if (response.status >= 400) {
            const errorMsg = parseError(responseData as T, response.status, response.text);
            return { success: false, content: null, responseData: responseData as T, error: errorMsg };
        }

        const content = parseSuccess(responseData as T);
        if (content) {
            return { success: true, content: content.trim(), responseData: responseData as T };
        }

        return {
            success: false,
            content: null,
            responseData: responseData as T,
            error: 'Invalid response structure from API.'
        };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        responseData = { error: { message: msg, type: 'network_or_execution_error' } };
        return { success: false, content: null, responseData: responseData as T, error: msg };
    }
}

