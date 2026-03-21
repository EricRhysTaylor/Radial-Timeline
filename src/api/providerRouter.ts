/*
 * Unified provider router
 */
// DEPRECATED: Legacy provider adapter; prefer aiClient entrypoints.
import type RadialTimelinePlugin from '../main';
import { DEFAULT_ANTHROPIC_MODEL_ID, DEFAULT_GEMINI_MODEL_ID, DEFAULT_OPENAI_MODEL_ID } from '../constants/aiDefaults';
import { callOpenAiApi, callOpenAiResponsesApi, type OpenAiApiResponse } from './openaiApi';
import { callAnthropicApi, type AnthropicApiResponse } from './anthropicApi';
import { callGeminiApi, type GeminiApiResponse } from './geminiApi';
import { sanitizeProviderArgs, type AiProvider, type ProviderCallArgs as ProviderCallArgsBase } from './providerCapabilities';
import { buildOpenAiResponsesRequestPayload, buildProviderRequestPayload } from './requestPayload';
import { classifyProviderError, type AiStatus } from './providerErrors';
import type { SourceCitation } from '../ai/types';
import { warnLegacyAccess } from './legacyAccessGuard';
import { getCredential } from '../ai/credentials/credentials';
import { CACHE_BREAK_DELIMITER } from '../ai/prompts/composeEnvelope';
import { getOrCreateGeminiCache } from './geminiCacheManager';
import { resolveOpenAiTransportLane, type OpenAiTransportLane } from './openaiTransport';

export interface ProviderCallArgs extends ProviderCallArgsBase {
  provider?: AiProvider;
  modelId?: string;
  internalAdapterAccess?: boolean;
}

export interface ProviderResult<T = unknown> {
  success: boolean;
  content: string | null;
  responseData: T;
  requestPayload?: unknown;
  provider: AiProvider;
  modelId: string;
  aiProvider: AiProvider;
  aiModelRequested: string;
  aiModelResolved: string;
  aiStatus: AiStatus;
  aiReason?: string;
  error?: string;
  sanitizationNotes?: string[];
  sanitizedParams?: string[];
  retryCount?: number;
  cacheUsed?: boolean;
  cacheStatus?: 'hit' | 'created';
  citations?: SourceCitation[];
  aiTransportLane?: OpenAiTransportLane;
}

export async function callProvider(plugin: RadialTimelinePlugin, args: ProviderCallArgs): Promise<ProviderResult> {
  warnLegacyAccess('providerRouter.callProvider', args.internalAdapterAccess);
  const provider = args.provider || plugin.settings.defaultAiProvider || 'openai';
  const maxTokens = typeof args.maxTokens === 'number'
    ? args.maxTokens
    : args.maxTokens === null ? null : 4000;

  const requestedModelId = args.modelId || (() => {
    if (provider === 'anthropic') return plugin.settings.anthropicModelId || DEFAULT_ANTHROPIC_MODEL_ID;
    if (provider === 'gemini') return plugin.settings.geminiModelId || DEFAULT_GEMINI_MODEL_ID;
    if (provider === 'local') return plugin.settings.localModelId || 'llama3';
    return plugin.settings.openaiModelId || DEFAULT_OPENAI_MODEL_ID;
  })();

  const rawArgs: ProviderCallArgsBase = {
    userPrompt: args.userPrompt,
    systemPrompt: args.systemPrompt ?? null,
    maxTokens,
    temperature: args.temperature,
    top_p: args.top_p,
    responseFormat: args.responseFormat,
    jsonSchema: args.jsonSchema,
    disableThinking: args.disableThinking,
    thinkingBudgetTokens: args.thinkingBudgetTokens,
    citationsEnabled: args.citationsEnabled,
    evidenceDocuments: args.evidenceDocuments
  };
  if (provider === 'local' && !rawArgs.responseFormat) {
    rawArgs.responseFormat = { type: 'json_object' };
  }

  const baseArgs = sanitizeProviderArgs(provider, requestedModelId, rawArgs);
  const sanitizedParams = diffProviderArgs(rawArgs, baseArgs);
  const sanitizationNotes = sanitizedParams.map(param => `Removed unsupported parameter: ${param}.`);

    const runCall = async (callArgs: ProviderCallArgsBase): Promise<ProviderResult> => {
        const isAnthropicStructuredJson = provider === 'anthropic'
          && !!callArgs.jsonSchema
          && Object.keys(callArgs.jsonSchema).length > 0;
        const effectiveCallArgs: ProviderCallArgsBase = isAnthropicStructuredJson
          ? { ...callArgs, thinkingBudgetTokens: undefined }
          : callArgs;
        const resolvedMaxTokens = typeof callArgs.maxTokens === 'number' ? callArgs.maxTokens : 4000;
        const openAiMaxTokens = effectiveCallArgs.maxTokens === null ? null : resolvedMaxTokens;
        const openAiTransportLane = provider === 'openai'
          ? resolveOpenAiTransportLane(requestedModelId)
          : undefined;
        const requestPayload = provider === 'openai' && openAiTransportLane === 'responses'
          ? buildOpenAiResponsesRequestPayload(requestedModelId, effectiveCallArgs)
          : buildProviderRequestPayload(provider, requestedModelId, effectiveCallArgs);
        if (provider === 'anthropic') {
      const apiKey = await getCredential(plugin, 'anthropic');
      const resp: AnthropicApiResponse = await callAnthropicApi(
        apiKey,
        requestedModelId,
        effectiveCallArgs.systemPrompt || null,
        effectiveCallArgs.userPrompt,
        resolvedMaxTokens,
        true,
        effectiveCallArgs.temperature,
        effectiveCallArgs.top_p,
        effectiveCallArgs.thinkingBudgetTokens,
        effectiveCallArgs.citationsEnabled,
        effectiveCallArgs.evidenceDocuments,
        effectiveCallArgs.jsonSchema
      );
      return { ...buildProviderResult(provider, requestedModelId, resp), requestPayload, citations: resp.citations };
    }
    if (provider === 'gemini') {
      const apiKey = await getCredential(plugin, 'google');

      let effectiveUserPrompt = effectiveCallArgs.userPrompt;
      let effectiveSystemPrompt = effectiveCallArgs.systemPrompt || null;
      let cachedContentName: string | undefined;
      let cacheStatus: 'hit' | 'created' | undefined;

      const canUseGeminiCache = !effectiveCallArgs.citationsEnabled;
      const delimIndex = effectiveCallArgs.userPrompt.indexOf(CACHE_BREAK_DELIMITER);
      if (canUseGeminiCache && delimIndex > 0) {
        const stableText = effectiveCallArgs.userPrompt.slice(0, delimIndex).trimEnd();
        const volatileText = effectiveCallArgs.userPrompt
            .slice(delimIndex + CACHE_BREAK_DELIMITER.length).trimStart();
        try {
          const cacheResult = await getOrCreateGeminiCache(
              apiKey, requestedModelId, stableText,
              effectiveCallArgs.systemPrompt || undefined
          );
          if (cacheResult) {
            cachedContentName = cacheResult.cacheName;
            cacheStatus = cacheResult.status;
            effectiveUserPrompt = volatileText;
            effectiveSystemPrompt = null;   // system is inside the cache
          } else {
            // Below min token threshold — recombine, send uncached
            effectiveUserPrompt = stableText + '\n\n' + volatileText;
          }
        } catch {
          // Cache creation failed (rate limit, unsupported model, etc.)
          // Fall back: recombine, send uncached
          effectiveUserPrompt = stableText + '\n\n' + volatileText;
        }
      } else if (delimIndex > 0) {
        const stableText = effectiveCallArgs.userPrompt.slice(0, delimIndex).trimEnd();
        const volatileText = effectiveCallArgs.userPrompt
            .slice(delimIndex + CACHE_BREAK_DELIMITER.length).trimStart();
        effectiveUserPrompt = stableText + '\n\n' + volatileText;
      }

      const resp: GeminiApiResponse = await callGeminiApi(
        apiKey,
        requestedModelId,
        effectiveSystemPrompt,
        effectiveUserPrompt,
        openAiMaxTokens,
        effectiveCallArgs.temperature,
        effectiveCallArgs.jsonSchema,
        effectiveCallArgs.disableThinking,
        cachedContentName,
        effectiveCallArgs.top_p,
        effectiveCallArgs.citationsEnabled,
        true
      );
      return {
        ...buildProviderResult(provider, requestedModelId, resp),
        requestPayload,
        cacheUsed: !!cachedContentName,
        cacheStatus
      };
    }
    if (provider === 'local') {
      const apiKey = await getCredential(plugin, 'ollama');
      const baseUrl = plugin.settings.localBaseUrl || 'http://localhost:11434/v1';
      const resp: OpenAiApiResponse = await callOpenAiApi(
        apiKey,
        requestedModelId,
        effectiveCallArgs.systemPrompt || null,
        effectiveCallArgs.userPrompt,
        openAiMaxTokens,
        baseUrl,
        effectiveCallArgs.responseFormat,
        effectiveCallArgs.temperature,
        effectiveCallArgs.top_p,
        true,
        true
      );
      return { ...buildProviderResult(provider, requestedModelId, resp), requestPayload };
    }
    const apiKey = await getCredential(plugin, 'openai');
    if (openAiTransportLane === 'responses') {
      const resp: OpenAiApiResponse = await callOpenAiResponsesApi(
        apiKey,
        requestedModelId,
        effectiveCallArgs.systemPrompt || null,
        effectiveCallArgs.userPrompt,
        openAiMaxTokens,
        effectiveCallArgs.responseFormat,
        effectiveCallArgs.temperature,
        effectiveCallArgs.top_p,
        true,
        true
      );
      return {
        ...buildProviderResult(provider, requestedModelId, resp),
        requestPayload,
        aiTransportLane: openAiTransportLane
      };
    }
    const resp: OpenAiApiResponse = await callOpenAiApi(
      apiKey,
      requestedModelId,
      effectiveCallArgs.systemPrompt || null,
      effectiveCallArgs.userPrompt,
      openAiMaxTokens,
      undefined,
      effectiveCallArgs.responseFormat,
      effectiveCallArgs.temperature,
      effectiveCallArgs.top_p,
      true,
      true
    );
    return {
      ...buildProviderResult(provider, requestedModelId, resp),
      requestPayload,
      aiTransportLane: openAiTransportLane
    };
  };

  let result = await runCall(baseArgs);
  let retryCount = 0;
  if (result.aiStatus === 'rejected' && result.aiReason === 'unsupported_param') {
    retryCount += 1;
    sanitizationNotes.push('Provider rejected unsupported parameters; retrying without optional controls.');
    const retryArgs = sanitizeProviderArgs(provider, requestedModelId, {
      ...rawArgs,
      temperature: undefined,
      top_p: undefined,
      responseFormat: undefined,
      jsonSchema: undefined,
      disableThinking: undefined
    });
    result = await runCall(retryArgs);
  }

  return { ...result, sanitizationNotes, sanitizedParams, retryCount };
}

function diffProviderArgs(
  requested: ProviderCallArgsBase,
  sanitized: ProviderCallArgsBase
): string[] {
  const removed: string[] = [];
  const keys: (keyof ProviderCallArgsBase)[] = [
    'systemPrompt',
    'maxTokens',
    'temperature',
    'top_p',
    'responseFormat',
    'jsonSchema',
    'disableThinking'
  ];
  keys.forEach((key) => {
    if (requested[key] !== undefined && sanitized[key] === undefined) {
      removed.push(String(key));
    }
  });
  return removed;
}

function buildProviderResult<T extends { success: boolean; content: string | null; responseData: unknown; error?: string; citations?: SourceCitation[] }>(
  provider: AiProvider,
  requestedModelId: string,
  resp: T
): ProviderResult {
  const resolvedModelId = readResolvedModelId(provider, resp.responseData) || requestedModelId;
  const classification = resp.success
    ? { aiStatus: 'success' as AiStatus }
    : classifyProviderError({ error: resp.error, responseData: resp.responseData });

  return {
    success: resp.success,
    content: resp.content,
    responseData: resp.responseData,
    provider,
    modelId: resolvedModelId,
    aiProvider: provider,
    aiModelRequested: requestedModelId,
    aiModelResolved: resolvedModelId,
    aiStatus: classification.aiStatus,
    aiReason: classification.aiReason,
    citations: resp.citations,
    error: resp.error
  };
}

function readResolvedModelId(provider: AiProvider, responseData: unknown): string | null {
  if (!responseData || typeof responseData !== 'object') return null;
  const data = responseData as Record<string, unknown>;
  if ((provider === 'openai' || provider === 'local') && typeof data.model === 'string') {
    return data.model;
  }
  if (provider === 'gemini') {
    if (typeof data.modelVersion === 'string') return data.modelVersion;
    if (typeof data.model === 'string') return data.model;
  }
  if (provider === 'anthropic' && typeof data.model === 'string') {
    return data.model;
  }
  return null;
}
