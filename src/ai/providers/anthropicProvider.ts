import type RadialTimelinePlugin from '../../main';
import { callAnthropicApi } from '../../api/anthropicApi';
import { classifyProviderError } from '../../api/providerErrors';
import { extractTokenUsage } from '../usage/providerUsage';
import { getCredential } from '../credentials/credentials';
import { ANTHROPIC_REQUESTED_CACHE_TTL, buildDefaultAiSettings } from '../settings/aiSettings';
import { validateAiSettings } from '../settings/validateAiSettings';
import type { AIProvider, AnthropicCacheTtl, Capability, GenerateJsonRequest, GenerateTextRequest, ProviderExecutionResult } from '../types';

const CAPS: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong'];

export class AnthropicProvider implements AIProvider {
    id = 'anthropic' as const;

    constructor(private plugin: RadialTimelinePlugin) {}

    supports(capability: Capability): boolean {
        return CAPS.includes(capability);
    }

    private deriveCacheResult(responseData: unknown): Pick<ProviderExecutionResult, 'cacheUsed' | 'cacheStatus'> {
        const usage = extractTokenUsage('anthropic', responseData);
        const cacheRead = usage?.cacheReadInputTokens ?? 0;
        const cacheWrite = usage?.cacheCreationInputTokens ?? 0;
        if (cacheRead > 0) {
            return {
                cacheUsed: true,
                cacheStatus: 'hit'
            };
        }
        if (cacheWrite > 0) {
            return {
                cacheUsed: false,
                cacheStatus: 'created'
            };
        }
        return {};
    }

    async generateText(req: GenerateTextRequest): Promise<ProviderExecutionResult> {
        const apiKey = await getCredential(this.plugin, 'anthropic');
        validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings());
        const cacheTtl: AnthropicCacheTtl | undefined = req.bypassProviderReuse
            ? undefined
            : ANTHROPIC_REQUESTED_CACHE_TTL;
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
        const cacheResult = this.deriveCacheResult(result.responseData);
        return {
            success: result.success,
            content: result.content,
            responseData: result.responseData,
            requestPayload: result.requestPayload,
            aiStatus: result.success ? 'success' : classification.aiStatus,
            aiReason: result.success ? undefined : classification.aiReason,
            aiProvider: 'anthropic',
            aiModelRequested: req.modelId,
            aiModelResolved: req.modelId,
            error: result.error,
            citations: result.citations,
            ...cacheResult
        };
    }

    async generateJson(req: GenerateJsonRequest): Promise<ProviderExecutionResult> {
        const apiKey = await getCredential(this.plugin, 'anthropic');
        validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings());
        const cacheTtl: AnthropicCacheTtl | undefined = req.bypassProviderReuse
            ? undefined
            : ANTHROPIC_REQUESTED_CACHE_TTL;
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
        const cacheResult = this.deriveCacheResult(result.responseData);
        return {
            success: result.success,
            content: result.content,
            responseData: result.responseData,
            requestPayload: result.requestPayload,
            aiStatus: result.success ? 'success' : classification.aiStatus,
            aiReason: result.success ? undefined : classification.aiReason,
            aiProvider: 'anthropic',
            aiModelRequested: req.modelId,
            aiModelResolved: req.modelId,
            error: result.error,
            citations: result.citations,
            ...cacheResult
        };
    }
}
