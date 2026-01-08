/*
 * Unified provider router
 */
import { App } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { DEFAULT_GEMINI_MODEL_ID } from '../constants/aiDefaults';
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
  provider: 'openai' | 'anthropic' | 'gemini' | 'local';
  modelId: string;
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
  const provider = plugin.settings.defaultAiProvider || 'openai';
  const max = typeof args.maxTokens === 'number' ? args.maxTokens : 4000;
  const temp = typeof args.temperature === 'number' ? args.temperature : 0.7;
  
  if (provider === 'anthropic') {
    const rawKey = plugin.settings.anthropicApiKey || '';
    const apiKey = await resolveKey(plugin.app, rawKey);
    const modelId = plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929';
    const resp: AnthropicApiResponse = await callAnthropicApi(apiKey, modelId, args.systemPrompt || null, args.userPrompt, max ?? 4000);
    return { success: resp.success, content: resp.content, responseData: resp.responseData, provider, modelId };
  } else if (provider === 'gemini') {
    const rawKey = plugin.settings.geminiApiKey || '';
    const apiKey = await resolveKey(plugin.app, rawKey);
    const modelId = plugin.settings.geminiModelId || DEFAULT_GEMINI_MODEL_ID;
    const resp: GeminiApiResponse = await callGeminiApi(apiKey, modelId, args.systemPrompt || null, args.userPrompt, max, temp);
    return { success: resp.success, content: resp.content, responseData: resp.responseData, provider, modelId };
  } else if (provider === 'local') {
    const rawKey = plugin.settings.localApiKey || '';
    const apiKey = await resolveKey(plugin.app, rawKey);
    const modelId = plugin.settings.localModelId || 'llama3';
    const baseUrl = plugin.settings.localBaseUrl || 'http://localhost:11434/v1';
    
    // Enforce JSON mode for local models to improve formatting reliability
    // The API client handles fallback if the server doesn't support it.
    const resp: OpenAiApiResponse = await callOpenAiApi(
        apiKey, 
        modelId, 
        args.systemPrompt || null, 
        args.userPrompt, 
        max, 
        baseUrl, 
        { type: 'json_object' }, 
        temp
    );
    return { success: resp.success, content: resp.content, responseData: resp.responseData, provider, modelId };
  } else {
    const rawKey = plugin.settings.openaiApiKey || '';
    const apiKey = await resolveKey(plugin.app, rawKey);
    const modelId = plugin.settings.openaiModelId || 'gpt-4.1';
    const resp: OpenAiApiResponse = await callOpenAiApi(apiKey, modelId, args.systemPrompt || null, args.userPrompt, max, undefined, undefined, temp);
    return { success: resp.success, content: resp.content, responseData: resp.responseData, provider, modelId };
  }
}
