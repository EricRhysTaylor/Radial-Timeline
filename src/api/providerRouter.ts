/*
 * Unified provider router
 */
import { App } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { DEFAULT_ANTHROPIC_MODEL_ID, DEFAULT_GEMINI_MODEL_ID, DEFAULT_OPENAI_MODEL_ID } from '../constants/aiDefaults';
import { callOpenAiApi, type OpenAiApiResponse } from './openaiApi';
import { callAnthropicApi, type AnthropicApiResponse } from './anthropicApi';
import { callGeminiApi, type GeminiApiResponse } from './geminiApi';
import { sanitizeProviderArgs, type AiProvider, type ProviderCallArgs as ProviderCallArgsBase } from './providerCapabilities';
import { buildProviderRequestPayload } from './requestPayload';
import { classifyProviderError, type AiStatus } from './providerErrors';

export interface ProviderCallArgs extends ProviderCallArgsBase {
  provider?: AiProvider;
  modelId?: string;
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
}

export async function resolveKey(app: App, key: string): Promise<string> {
    if (!key) return '';
    if (app.secretStorage && app.secretStorage.get) {
        try {
            const secret = await app.secretStorage.get(key);
            return secret || key;
        } catch (e) {
            // Fallback to raw key if lookup fails
            return key;
        }
    }
    return key;
}

export async function callProvider(plugin: RadialTimelinePlugin, args: ProviderCallArgs): Promise<ProviderResult> {
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
    disableThinking: args.disableThinking
  };
  if (provider === 'local' && !rawArgs.responseFormat) {
    rawArgs.responseFormat = { type: 'json_object' };
  }

  const baseArgs = sanitizeProviderArgs(provider, requestedModelId, rawArgs);
  const sanitizedParams = diffProviderArgs(rawArgs, baseArgs);
  const sanitizationNotes = sanitizedParams.map(param => `Removed unsupported parameter: ${param}.`);

  const runCall = async (callArgs: ProviderCallArgsBase): Promise<ProviderResult> => {
    const resolvedMaxTokens = typeof callArgs.maxTokens === 'number' ? callArgs.maxTokens : 4000;
    const openAiMaxTokens = callArgs.maxTokens === null ? null : resolvedMaxTokens;
    const requestPayload = buildProviderRequestPayload(provider, requestedModelId, callArgs);
    if (provider === 'anthropic') {
      const rawKey = plugin.settings.anthropicApiKey || '';
      const apiKey = await resolveKey(plugin.app, rawKey);
      const resp: AnthropicApiResponse = await callAnthropicApi(
        apiKey,
        requestedModelId,
        callArgs.systemPrompt || null,
        callArgs.userPrompt,
        resolvedMaxTokens
      );
      return { ...buildProviderResult(provider, requestedModelId, resp), requestPayload };
    }
    if (provider === 'gemini') {
      const rawKey = plugin.settings.geminiApiKey || '';
      const apiKey = await resolveKey(plugin.app, rawKey);
      const resp: GeminiApiResponse = await callGeminiApi(
        apiKey,
        requestedModelId,
        callArgs.systemPrompt || null,
        callArgs.userPrompt,
        openAiMaxTokens,
        callArgs.temperature,
        callArgs.jsonSchema,
        callArgs.disableThinking,
        undefined,
        callArgs.top_p
      );
      return { ...buildProviderResult(provider, requestedModelId, resp), requestPayload };
    }
    if (provider === 'local') {
      const rawKey = plugin.settings.localApiKey || '';
      const apiKey = await resolveKey(plugin.app, rawKey);
      const baseUrl = plugin.settings.localBaseUrl || 'http://localhost:11434/v1';
      const resp: OpenAiApiResponse = await callOpenAiApi(
        apiKey,
        requestedModelId,
        callArgs.systemPrompt || null,
        callArgs.userPrompt,
        openAiMaxTokens,
        baseUrl,
        callArgs.responseFormat,
        callArgs.temperature,
        callArgs.top_p
      );
      return { ...buildProviderResult(provider, requestedModelId, resp), requestPayload };
    }
    const rawKey = plugin.settings.openaiApiKey || '';
    const apiKey = await resolveKey(plugin.app, rawKey);
    const resp: OpenAiApiResponse = await callOpenAiApi(
      apiKey,
      requestedModelId,
      callArgs.systemPrompt || null,
      callArgs.userPrompt,
      openAiMaxTokens,
      undefined,
      callArgs.responseFormat,
      callArgs.temperature,
      callArgs.top_p
    );
    return { ...buildProviderResult(provider, requestedModelId, resp), requestPayload };
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

function buildProviderResult<T extends { success: boolean; content: string | null; responseData: unknown; error?: string }>(
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
