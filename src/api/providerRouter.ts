/*
 * Unified provider router
 */
import type RadialTimelinePlugin from '../main';
import { callOpenAiApi, OpenAiApiResponse } from './openaiApi';
import { callAnthropicApi, AnthropicApiResponse } from './anthropicApi';
import { callGeminiApi, GeminiApiResponse } from './geminiApi';

export interface ProviderCallArgs {
  userPrompt: string;
  systemPrompt?: string | null;
  maxTokens?: number | null;
  temperature?: number;
}

export interface ProviderResult<T = unknown> {
  success: boolean;
  content: string | null;
  responseData: T;
  provider: 'openai' | 'anthropic' | 'gemini';
  modelId: string;
}

export async function callProvider(plugin: RadialTimelinePlugin, args: ProviderCallArgs): Promise<ProviderResult> {
  const provider = plugin.settings.defaultAiProvider || 'openai';
  const max = typeof args.maxTokens === 'number' ? args.maxTokens : 4000;
  const temp = typeof args.temperature === 'number' ? args.temperature : 0.7;
  if (provider === 'anthropic') {
    const apiKey = plugin.settings.anthropicApiKey || '';
    const modelId = plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929';
    const resp: AnthropicApiResponse = await callAnthropicApi(apiKey, modelId, args.systemPrompt || null, args.userPrompt, max ?? 4000);
    return { success: resp.success, content: resp.content, responseData: resp.responseData, provider, modelId };
  } else if (provider === 'gemini') {
    const apiKey = plugin.settings.geminiApiKey || '';
    const modelId = plugin.settings.geminiModelId || 'gemini-2.5-pro';
    const resp: GeminiApiResponse = await callGeminiApi(apiKey, modelId, args.systemPrompt || null, args.userPrompt, max, temp);
    return { success: resp.success, content: resp.content, responseData: resp.responseData, provider, modelId };
  } else {
    const apiKey = plugin.settings.openaiApiKey || '';
    const modelId = plugin.settings.openaiModelId || 'gpt-4.1';
    const resp: OpenAiApiResponse = await callOpenAiApi(apiKey, modelId, args.systemPrompt || null, args.userPrompt, max, temp);
    return { success: resp.success, content: resp.content, responseData: resp.responseData, provider, modelId };
  }
}

