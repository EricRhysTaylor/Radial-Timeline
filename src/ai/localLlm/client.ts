import type RadialTimelinePlugin from '../../main';
import { classifyProviderError } from '../../api/providerErrors';
import { getCredential } from '../credentials/credentials';
import { getLocalLlmBackend } from './backends';
import { runLocalLlmDiagnostics } from './diagnostics';
import { getCanonicalLocalLlmSettings, LOCAL_LLM_BACKEND_LABELS } from './settings';
import { runStructuredJsonPipeline } from './structuredJson';
import type { GenerateJsonRequest, GenerateTextRequest, ProviderExecutionResult } from '../types';

export class LocalLlmClient {
    constructor(private plugin: RadialTimelinePlugin) {}

    private async buildTransport() {
        const localLlm = getCanonicalLocalLlmSettings(this.plugin);
        const apiKey = await getCredential(this.plugin, 'ollama');
        return {
            localLlm,
            backend: getLocalLlmBackend(localLlm.backend),
            transport: {
                baseUrl: localLlm.baseUrl,
                timeoutMs: localLlm.timeoutMs,
                apiKey
            }
        };
    }

    async listModels() {
        const { backend, transport } = await this.buildTransport();
        return backend.listModels(transport);
    }

    async runDiagnostics() {
        return runLocalLlmDiagnostics(this.plugin);
    }

    async generateText(req: GenerateTextRequest): Promise<ProviderExecutionResult> {
        const { localLlm, backend, transport } = await this.buildTransport();
        const modelId = localLlm.defaultModelId.trim() || req.modelId;
        const result = await backend.complete({
            ...transport,
            modelId,
            systemPrompt: req.systemPrompt ?? null,
            userPrompt: req.userPrompt,
            maxOutputTokens: req.maxOutputTokens,
            temperature: req.temperature,
            topP: req.topP
        });
        const classification = classifyProviderError(result);
        return {
            success: result.success,
            content: result.content,
            responseData: result.responseData,
            requestPayload: result.requestPayload,
            aiStatus: result.success ? 'success' : classification.aiStatus,
            aiReason: result.success ? undefined : classification.aiReason,
            aiProvider: 'ollama',
            aiModelRequested: req.modelId,
            aiModelResolved: modelId,
            error: result.error
        };
    }

    async generateJson(req: GenerateJsonRequest): Promise<ProviderExecutionResult> {
        const { localLlm, backend, transport } = await this.buildTransport();
        const modelId = localLlm.defaultModelId.trim() || req.modelId;
        const structured = await runStructuredJsonPipeline({
            providerLabel: LOCAL_LLM_BACKEND_LABELS[localLlm.backend],
            schema: req.jsonSchema,
            jsonMode: localLlm.jsonMode,
            maxRetries: localLlm.maxRetries,
            runner: {
                run: ({ systemPrompt, userPrompt, useResponseFormat }) => backend.complete({
                    ...transport,
                    modelId,
                    systemPrompt,
                    userPrompt,
                    maxOutputTokens: req.maxOutputTokens,
                    temperature: req.temperature,
                    topP: req.topP,
                    responseFormat: useResponseFormat ? { type: 'json_object' } : undefined
                })
            },
            systemPrompt: req.systemPrompt ?? null,
            userPrompt: req.userPrompt
        });
        if (structured.ok) {
            return {
                success: true,
                content: structured.content,
                responseData: structured.responseData,
                requestPayload: structured.requestPayload,
                aiStatus: 'success',
                aiProvider: 'ollama',
                aiModelRequested: req.modelId,
                aiModelResolved: modelId,
                retryCount: structured.repairCount
            };
        }

        const classification = classifyProviderError({
            error: structured.error,
            responseData: structured.responseData
        });
        return {
            success: false,
            content: null,
            responseData: structured.responseData,
            requestPayload: structured.requestPayload,
            aiStatus: classification.aiStatus,
            aiReason: classification.aiReason ?? 'invalid_response',
            aiProvider: 'ollama',
            aiModelRequested: req.modelId,
            aiModelResolved: modelId,
            error: structured.error,
            retryCount: structured.repairCount
        };
    }
}

export function getLocalLlmClient(plugin: RadialTimelinePlugin): LocalLlmClient {
    const target = plugin as unknown as { _localLlmClient?: LocalLlmClient };
    if (!target._localLlmClient) {
        target._localLlmClient = new LocalLlmClient(plugin);
    }
    return target._localLlmClient;
}
