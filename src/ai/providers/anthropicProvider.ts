import type RadialTimelinePlugin from '../../main';
import { callAnthropicApi } from '../../api/anthropicApi';
import { classifyProviderError } from '../../api/providerErrors';
import { getCredential } from '../credentials/credentials';
import type { AIProvider, Capability, GenerateJsonRequest, GenerateTextRequest, ProviderExecutionResult } from '../types';

const CAPS: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong'];

export class AnthropicProvider implements AIProvider {
    id = 'anthropic' as const;

    constructor(private plugin: RadialTimelinePlugin) {}

    supports(capability: Capability): boolean {
        return CAPS.includes(capability);
    }

    async generateText(req: GenerateTextRequest): Promise<ProviderExecutionResult> {
        const apiKey = await getCredential(this.plugin, 'anthropic');
        const result = await callAnthropicApi(
            apiKey,
            req.modelId,
            req.systemPrompt ?? null,
            req.userPrompt,
            req.maxOutputTokens,
            true,
            req.temperature,
            req.topP,
            req.thinkingBudgetTokens,
            req.citationsEnabled,
            req.evidenceDocuments
        );
        const classification = classifyProviderError(result);
        return {
            success: result.success,
            content: result.content,
            responseData: result.responseData,
            aiStatus: result.success ? 'success' : classification.aiStatus,
            aiReason: result.success ? undefined : classification.aiReason,
            aiProvider: 'anthropic',
            aiModelRequested: req.modelId,
            aiModelResolved: req.modelId,
            error: result.error,
            citations: result.citations
        };
    }

    async generateJson(req: GenerateJsonRequest): Promise<ProviderExecutionResult> {
        const apiKey = await getCredential(this.plugin, 'anthropic');
        const result = await callAnthropicApi(
            apiKey,
            req.modelId,
            req.systemPrompt ?? null,
            req.userPrompt,
            req.maxOutputTokens,
            true,
            req.temperature,
            req.topP,
            req.thinkingBudgetTokens,
            req.citationsEnabled,
            req.evidenceDocuments,
            req.jsonSchema
        );
        const classification = classifyProviderError(result);
        return {
            success: result.success,
            content: result.content,
            responseData: result.responseData,
            aiStatus: result.success ? 'success' : classification.aiStatus,
            aiReason: result.success ? undefined : classification.aiReason,
            aiProvider: 'anthropic',
            aiModelRequested: req.modelId,
            aiModelResolved: req.modelId,
            error: result.error,
            citations: result.citations
        };
    }
}
