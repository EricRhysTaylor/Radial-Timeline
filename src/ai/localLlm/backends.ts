import { LOCAL_LLM_BACKEND_LABELS } from './settings';
import {
    callOpenAiCompatibleLocalCompletion,
    fetchOpenAiCompatibleLocalModels,
    type LocalLlmCompletionResponse,
    type LocalLlmModelEntry,
    type LocalLlmTransportRequest
} from './transport';
import type { LocalLlmBackendId } from '../types';

export interface LocalLlmBackend {
    id: LocalLlmBackendId;
    label: string;
    listModels(request: LocalLlmTransportRequest): Promise<LocalLlmModelEntry[]>;
    complete(request: LocalLlmTransportRequest & {
        modelId: string;
        systemPrompt?: string | null;
        userPrompt: string;
        maxOutputTokens?: number;
        temperature?: number;
        topP?: number;
        responseFormat?: { type: 'json_object' };
    }): Promise<LocalLlmCompletionResponse>;
}

function createOpenAiCompatibleBackend(id: LocalLlmBackendId): LocalLlmBackend {
    return {
        id,
        label: LOCAL_LLM_BACKEND_LABELS[id],
        listModels: fetchOpenAiCompatibleLocalModels,
        complete: request => callOpenAiCompatibleLocalCompletion({
            transport: {
                baseUrl: request.baseUrl,
                timeoutMs: request.timeoutMs,
                apiKey: request.apiKey
            },
            modelId: request.modelId,
            systemPrompt: request.systemPrompt,
            userPrompt: request.userPrompt,
            maxOutputTokens: request.maxOutputTokens,
            temperature: request.temperature,
            topP: request.topP,
            responseFormat: request.responseFormat
        })
    };
}

const BACKENDS: Record<LocalLlmBackendId, LocalLlmBackend> = {
    ollama: createOpenAiCompatibleBackend('ollama'),
    lmStudio: createOpenAiCompatibleBackend('lmStudio'),
    openaiCompatible: createOpenAiCompatibleBackend('openaiCompatible')
};

export function getLocalLlmBackend(id: LocalLlmBackendId): LocalLlmBackend {
    return BACKENDS[id];
}
