import type RadialTimelinePlugin from '../../main';
import { callGeminiApi } from '../../api/geminiApi';
import { getOrCreateGeminiCache } from '../../api/geminiCacheManager';
import { classifyProviderError } from '../../api/providerErrors';
import { extractTokenUsage } from '../usage/providerUsage';
import { getCredential } from '../credentials/credentials';
import { CACHE_BREAK_DELIMITER } from '../prompts/composeEnvelope';
import { buildDefaultAiSettings } from '../settings/aiSettings';
import { normalizeGeminiCacheTtlSeconds } from '../settings/cacheWindows';
import { validateAiSettings } from '../settings/validateAiSettings';
import type { AIProvider, Capability, GenerateJsonRequest, GenerateTextRequest, ProviderExecutionResult } from '../types';

const CAPS: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap', 'streaming'];

export class GoogleProvider implements AIProvider {
    id = 'google' as const;

    constructor(private plugin: RadialTimelinePlugin) {}

    supports(capability: Capability): boolean {
        return CAPS.includes(capability);
    }

    private deriveCacheResult(
        responseData: unknown,
        cachedContentName: string | undefined,
        clientCacheStatus: ProviderExecutionResult['cacheStatus']
    ): Pick<ProviderExecutionResult, 'cacheUsed' | 'cacheStatus'> {
        const usage = extractTokenUsage('google', responseData);
        const cacheRead = usage?.cacheReadInputTokens ?? 0;
        if (cacheRead > 0) {
            return { cacheUsed: true, cacheStatus: 'hit' };
        }
        if (cachedContentName) {
            return { cacheUsed: false, cacheStatus: clientCacheStatus ?? 'created' };
        }
        return {};
    }

    private buildCacheSetupFailure(
        req: GenerateTextRequest,
        ttlSeconds: number,
        stableText: string,
        error: unknown
    ): ProviderExecutionResult {
        const message = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            content: null,
            responseData: {
                error: {
                    message,
                    type: 'cache_setup_error'
                }
            },
            diagnostics: {
                cacheSetupFailed: true,
                cacheSetupMode: 'cached_content',
                stableTextChars: stableText.length,
                ttlSeconds
            },
            aiStatus: 'rejected',
            aiReason: 'cache_setup_failed',
            aiProvider: 'google',
            aiModelRequested: req.modelId,
            aiModelResolved: req.modelId,
            error: `Gemini cached content setup failed before dispatch: ${message}`
        };
    }

    async generateText(req: GenerateTextRequest): Promise<ProviderExecutionResult> {
        const apiKey = await getCredential(this.plugin, 'google');
        const aiSettings = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings()).value;
        const ttlSeconds = normalizeGeminiCacheTtlSeconds(aiSettings.cacheWindows?.googleTtlSeconds);
        let userPrompt = req.userPrompt;
        let cachedContentName: string | undefined;
        let cacheStatus: ProviderExecutionResult['cacheStatus'];
        if (!req.citationsEnabled && !req.bypassProviderReuse) {
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
                        return this.buildCacheSetupFailure(req, ttlSeconds, stableText, error);
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
        const cacheResult = this.deriveCacheResult(result.responseData, cachedContentName, cacheStatus);
        return {
            success: result.success,
            content: result.content,
            responseData: result.responseData,
            requestPayload: result.requestPayload,
            aiStatus: result.success ? 'success' : classification.aiStatus,
            aiReason: result.success ? undefined : classification.aiReason,
            aiProvider: 'google',
            aiModelRequested: req.modelId,
            aiModelResolved: req.modelId,
            error: result.error,
            citations: result.citations,
            ...cacheResult
        };
    }

    async generateJson(req: GenerateJsonRequest): Promise<ProviderExecutionResult> {
        const apiKey = await getCredential(this.plugin, 'google');
        const aiSettings = validateAiSettings(this.plugin.settings.aiSettings ?? buildDefaultAiSettings()).value;
        const ttlSeconds = normalizeGeminiCacheTtlSeconds(aiSettings.cacheWindows?.googleTtlSeconds);
        let userPrompt = req.userPrompt;
        let cachedContentName: string | undefined;
        let cacheStatus: ProviderExecutionResult['cacheStatus'];
        if (!req.citationsEnabled && !req.bypassProviderReuse) {
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
                        return this.buildCacheSetupFailure(req, ttlSeconds, stableText, error);
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
        const cacheResult = this.deriveCacheResult(result.responseData, cachedContentName, cacheStatus);
        return {
            success: result.success,
            content: result.content,
            responseData: result.responseData,
            requestPayload: result.requestPayload,
            aiStatus: result.success ? 'success' : classification.aiStatus,
            aiReason: result.success ? undefined : classification.aiReason,
            aiProvider: 'google',
            aiModelRequested: req.modelId,
            aiModelResolved: req.modelId,
            error: result.error,
            citations: result.citations,
            ...cacheResult
        };
    }
}
