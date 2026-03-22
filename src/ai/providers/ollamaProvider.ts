import type RadialTimelinePlugin from '../../main';
import { callOpenAiApi } from '../../api/openaiApi';
import { classifyProviderError } from '../../api/providerErrors';
import { getCredential } from '../credentials/credentials';
import { getCanonicalAiSettings } from '../runtime/runtimeSelection';
import type { AIProvider, Capability, GenerateJsonRequest, GenerateTextRequest, ProviderExecutionResult } from '../types';

const CAPS: Capability[] = ['jsonStrict'];

export class OllamaProvider implements AIProvider {
    id = 'ollama' as const;

    constructor(private plugin: RadialTimelinePlugin) {}

    supports(capability: Capability): boolean {
        return CAPS.includes(capability);
    }

    async generateText(req: GenerateTextRequest): Promise<ProviderExecutionResult> {
        const aiSettings = getCanonicalAiSettings(this.plugin);
        const apiKey = await getCredential(this.plugin, 'ollama');
        const result = await callOpenAiApi(
            apiKey,
            req.modelId,
            req.systemPrompt ?? null,
            req.userPrompt,
            req.maxOutputTokens,
            aiSettings.connections?.ollamaBaseUrl,
            undefined,
            req.temperature,
            req.topP,
            true,
            true
        );
        const classification = classifyProviderError(result);
        return {
            success: result.success,
            content: result.content,
            responseData: result.responseData,
            aiStatus: result.success ? 'success' : classification.aiStatus,
            aiReason: result.success ? undefined : classification.aiReason,
            aiProvider: 'ollama',
            aiModelRequested: req.modelId,
            aiModelResolved: req.modelId,
            error: result.error,
            citations: result.citations
        };
    }

    async generateJson(req: GenerateJsonRequest): Promise<ProviderExecutionResult> {
        const aiSettings = getCanonicalAiSettings(this.plugin);
        const apiKey = await getCredential(this.plugin, 'ollama');
        const result = await callOpenAiApi(
            apiKey,
            req.modelId,
            req.systemPrompt ?? null,
            req.userPrompt,
            req.maxOutputTokens,
            aiSettings.connections?.ollamaBaseUrl,
            { type: 'json_object' },
            req.temperature,
            req.topP,
            true,
            true
        );
        const classification = classifyProviderError(result);
        return {
            success: result.success,
            content: result.content,
            responseData: result.responseData,
            aiStatus: result.success ? 'success' : classification.aiStatus,
            aiReason: result.success ? undefined : classification.aiReason,
            aiProvider: 'ollama',
            aiModelRequested: req.modelId,
            aiModelResolved: req.modelId,
            error: result.error,
            citations: result.citations
        };
    }
}
