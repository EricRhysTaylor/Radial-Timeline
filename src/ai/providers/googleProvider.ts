import type RadialTimelinePlugin from '../../main';
import { callGeminiApi } from '../../api/geminiApi';
import { getOrCreateGeminiCache } from '../../api/geminiCacheManager';
import { classifyProviderError } from '../../api/providerErrors';
import { getCredential } from '../credentials/credentials';
import { CACHE_BREAK_DELIMITER } from '../prompts/composeEnvelope';
import { buildDefaultAiSettings } from '../settings/aiSettings';
import { validateAiSettings } from '../settings/validateAiSettings';
import type { AIProvider, Capability, GenerateJsonRequest, GenerateTextRequest, ProviderExecutionResult } from '../types';

const CAPS: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap', 'streaming'];

export class GoogleProvider implements AIProvider {
    id = 'google' as const;

    constructor(private plugin: RadialTimelinePlugin) {}

    supports(capability: Capability): boolean {
        return CAPS.includes(capability);
    }

    async generateText(req: GenerateTextRequest): Promise<ProviderExecutionResult> {
        const apiKey = await getCredential(this.plugin, 'google');
        const aiSettings = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings()).value;
        const ttlSeconds = aiSettings.cacheWindows?.googleTtlSeconds ?? 900;
        let userPrompt = req.userPrompt;
        let cachedContentName: string | undefined;
        let cacheStatus: ProviderExecutionResult['cacheStatus'];
        if (!req.citationsEnabled) {
            const delimIndex = userPrompt.indexOf(CACHE_BREAK_DELIMITER);
            if (delimIndex > 0) {
                const stableText = userPrompt.slice(0, delimIndex).trimEnd();
                const volatileText = userPrompt.slice(delimIndex + CACHE_BREAK_DELIMITER.length).trimStart();
                if (stableText) {
                    try {
                        const cache = await getOrCreateGeminiCache(
                            apiKey,
                            req.modelId,
                            stableText,
                            req.systemPrompt ?? undefined,
                            ttlSeconds
                        );
                        if (cache) {
                            cachedContentName = cache.cacheName;
                            cacheStatus = cache.status;
                            userPrompt = volatileText;
                        }
                    } catch (error) {
                        console.warn('[Gemini cache] Falling back to uncached request:', error);
                    }
                }
            }
        }
        const result = await callGeminiApi(
            apiKey,
            req.modelId,
            req.systemPrompt ?? null,
            userPrompt,
            req.maxOutputTokens ?? 4000,
            req.temperature,
            undefined,
            req.disableThinking ?? false,
            cachedContentName,
            req.topP,
            req.citationsEnabled,
            true
        );
        const classification = classifyProviderError(result);
        return {
            success: result.success,
            content: result.content,
            responseData: result.responseData,
            aiStatus: result.success ? 'success' : classification.aiStatus,
            aiReason: result.success ? undefined : classification.aiReason,
            aiProvider: 'google',
            aiModelRequested: req.modelId,
            aiModelResolved: req.modelId,
            error: result.error,
            citations: result.citations,
            cacheUsed: !!cachedContentName,
            cacheStatus
        };
    }

    async generateJson(req: GenerateJsonRequest): Promise<ProviderExecutionResult> {
        const apiKey = await getCredential(this.plugin, 'google');
        const aiSettings = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings()).value;
        const ttlSeconds = aiSettings.cacheWindows?.googleTtlSeconds ?? 900;
        let userPrompt = req.userPrompt;
        let cachedContentName: string | undefined;
        let cacheStatus: ProviderExecutionResult['cacheStatus'];
        if (!req.citationsEnabled) {
            const delimIndex = userPrompt.indexOf(CACHE_BREAK_DELIMITER);
            if (delimIndex > 0) {
                const stableText = userPrompt.slice(0, delimIndex).trimEnd();
                const volatileText = userPrompt.slice(delimIndex + CACHE_BREAK_DELIMITER.length).trimStart();
                if (stableText) {
                    try {
                        const cache = await getOrCreateGeminiCache(
                            apiKey,
                            req.modelId,
                            stableText,
                            req.systemPrompt ?? undefined,
                            ttlSeconds
                        );
                        if (cache) {
                            cachedContentName = cache.cacheName;
                            cacheStatus = cache.status;
                            userPrompt = volatileText;
                        }
                    } catch (error) {
                        console.warn('[Gemini cache] Falling back to uncached request:', error);
                    }
                }
            }
        }
        const result = await callGeminiApi(
            apiKey,
            req.modelId,
            req.systemPrompt ?? null,
            userPrompt,
            req.maxOutputTokens ?? 4000,
            req.temperature,
            req.jsonSchema,
            req.disableThinking ?? false,
            cachedContentName,
            req.topP,
            req.citationsEnabled,
            true
        );
        const classification = classifyProviderError(result);
        return {
            success: result.success,
            content: result.content,
            responseData: result.responseData,
            aiStatus: result.success ? 'success' : classification.aiStatus,
            aiReason: result.success ? undefined : classification.aiReason,
            aiProvider: 'google',
            aiModelRequested: req.modelId,
            aiModelResolved: req.modelId,
            error: result.error,
            citations: result.citations,
            cacheUsed: !!cachedContentName,
            cacheStatus
        };
    }
}
