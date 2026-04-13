import type RadialTimelinePlugin from '../../main';
import { callAnthropicApi } from '../../api/anthropicApi';
import { classifyProviderError } from '../../api/providerErrors';
import { getCredential } from '../credentials/credentials';
import { buildDefaultAiSettings } from '../settings/aiSettings';
import { validateAiSettings } from '../settings/validateAiSettings';
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
        const aiSettings = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings()).value;
        const cacheTtl = aiSettings.cacheWindows?.anthropicTtl;
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
            undefined,
            cacheTtl
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
        const aiSettings = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings()).value;
        const cacheTtl = aiSettings.cacheWindows?.anthropicTtl;
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
            req.jsonSchema,
            cacheTtl
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
