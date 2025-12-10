/*
 * Local AI validation helpers
 * Provide lightweight checks for OpenAI-compatible local servers.
 */
import { requestUrl } from 'obsidian';

type LocalModelEntry = { id: string; object?: string };
type LocalModelsResponse = { data?: LocalModelEntry[]; error?: { message?: string } };

function buildEndpoint(baseUrl: string, path: string): string {
    const trimmed = baseUrl.replace(/\/+$/, '');
    if (trimmed.endsWith(path)) return trimmed;
    return `${trimmed}${path}`;
}

export async function fetchLocalModels(baseUrl: string, apiKey?: string): Promise<LocalModelEntry[]> {
    const normalizedBase = baseUrl?.trim();
    if (!normalizedBase) throw new Error('Base URL is required.');
    const url = buildEndpoint(normalizedBase, '/models');
    const headers: Record<string, string> = {};
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    const response = await requestUrl({
        url,
        method: 'GET',
        headers,
        throw: false,
    });
    const json = response.json as LocalModelsResponse;
    if (response.status >= 400) {
        const message = json?.error?.message || `HTTP ${response.status}`;
        throw new Error(message);
    }
    if (!Array.isArray(json?.data)) {
        throw new Error('Local AI server returned an unexpected response.');
    }
    return json.data;
}

export async function validateLocalModelAvailability(baseUrl: string, modelId: string, apiKey?: string): Promise<{
    reachable: boolean;
    hasModel: boolean;
    message?: string;
}> {
    try {
        const models = await fetchLocalModels(baseUrl, apiKey);
        const desired = modelId.trim();
        const hasModel = models.some(model => model.id === desired);
        return {
            reachable: true,
            hasModel,
            message: hasModel ? undefined : `Model "${desired}" was not found on the server.`,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { reachable: false, hasModel: false, message };
    }
}
