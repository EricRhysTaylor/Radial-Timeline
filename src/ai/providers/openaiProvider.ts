import type RadialTimelinePlugin from '../../main';
import { callOpenAiResponsesApi } from '../../api/openaiApi';
import { classifyProviderError } from '../../api/providerErrors';
import { extractTokenUsage } from '../usage/providerUsage';
import { getCredential } from '../credentials/credentials';
import { buildDefaultAiSettings } from '../settings/aiSettings';
import { validateAiSettings } from '../settings/validateAiSettings';
import type { AIProvider, Capability, GenerateJsonRequest, GenerateTextRequest, ProviderExecutionResult } from '../types';

const CAPS: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'toolCalling', 'functionCalling', 'streaming'];

export class OpenAIProvider implements AIProvider {
    id = 'openai' as const;

    constructor(private plugin: RadialTimelinePlugin) {}

    supports(capability: Capability): boolean {
        return CAPS.includes(capability);
    }

    private deriveCacheResult(responseData: unknown): Pick<ProviderExecutionResult, 'cacheUsed' | 'cacheStatus'> {
        const usage = extractTokenUsage('openai', responseData);
        const cacheRead = usage?.cacheReadInputTokens ?? 0;
        if (cacheRead > 0) {
            return {
                cacheUsed: true,
                cacheStatus: 'hit'
            };
        }
        return {};
    }

    async generateText(req: GenerateTextRequest): Promise<ProviderExecutionResult> {
        const apiKey = await getCredential(this.plugin, 'openai');
        const aiSettings = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings()).value;
        const promptCacheRetention = req.bypassProviderReuse
            ? undefined
            : aiSettings.cacheWindows?.openaiRetention;
        const result = await callOpenAiResponsesApi(
            apiKey,
            req.modelId,
            req.systemPrompt ?? null,
            req.userPrompt,
            req.maxOutputTokens,
            undefined,
            req.temperature,
            req.topP,
            promptCacheRetention,
            req.promptCacheKey
        );
        const cacheResult = this.deriveCacheResult(result.responseData);
        return result.success
            ? {
                success: true,
                content: result.content,
                responseData: result.responseData,
                requestPayload: result.requestPayload,
                diagnostics: result.adapterNotes?.length ? { adapterNotes: result.adapterNotes } : undefined,
                aiStatus: 'success',
                aiProvider: 'openai',
                aiModelRequested: req.modelId,
                aiModelResolved: req.modelId,
                citations: result.citations,
                aiTransportLane: 'responses',
                ...cacheResult
            }
            : {
                success: false,
                content: result.content,
                responseData: result.responseData,
                requestPayload: result.requestPayload,
                diagnostics: result.adapterNotes?.length ? { adapterNotes: result.adapterNotes } : undefined,
                aiStatus: classifyProviderError(result).aiStatus,
                aiReason: classifyProviderError(result).aiReason,
                aiProvider: 'openai',
                aiModelRequested: req.modelId,
                aiModelResolved: req.modelId,
                error: result.error,
                citations: result.citations,
                aiTransportLane: 'responses',
                ...cacheResult
            };
    }

    async generateJson(req: GenerateJsonRequest): Promise<ProviderExecutionResult> {
        const apiKey = await getCredential(this.plugin, 'openai');
        const aiSettings = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings()).value;
        const promptCacheRetention = req.bypassProviderReuse
            ? undefined
            : aiSettings.cacheWindows?.openaiRetention;
        const result = await callOpenAiResponsesApi(
            apiKey,
            req.modelId,
            req.systemPrompt ?? null,
            req.userPrompt,
            req.maxOutputTokens,
            {
                type: 'json_schema',
                json_schema: {
                    name: 'ai_result',
                    schema: req.jsonSchema
                }
            },
            req.temperature,
            req.topP,
            promptCacheRetention,
            req.promptCacheKey
        );
        const cacheResult = this.deriveCacheResult(result.responseData);
        return result.success
            ? {
                success: true,
                content: result.content,
                responseData: result.responseData,
                requestPayload: result.requestPayload,
                diagnostics: result.adapterNotes?.length ? { adapterNotes: result.adapterNotes } : undefined,
                aiStatus: 'success',
                aiProvider: 'openai',
                aiModelRequested: req.modelId,
                aiModelResolved: req.modelId,
                citations: result.citations,
                aiTransportLane: 'responses',
                ...cacheResult
            }
            : {
                success: false,
                content: result.content,
                responseData: result.responseData,
                requestPayload: result.requestPayload,
                diagnostics: result.adapterNotes?.length ? { adapterNotes: result.adapterNotes } : undefined,
                aiStatus: classifyProviderError(result).aiStatus,
                aiReason: classifyProviderError(result).aiReason,
                aiProvider: 'openai',
                aiModelRequested: req.modelId,
                aiModelResolved: req.modelId,
                error: result.error,
                citations: result.citations,
                aiTransportLane: 'responses',
                ...cacheResult
            };
    }
}
