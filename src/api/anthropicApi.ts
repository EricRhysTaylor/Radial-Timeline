/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
// DEPRECATED: Legacy provider adapter; prefer aiClient entrypoints.
import { requestUrl } from 'obsidian';
import { warnLegacyAccess } from './legacyAccessGuard';
import { CACHE_BREAK_DELIMITER } from '../ai/prompts/composeEnvelope';

export type AnthropicTextBlock = {
  type: 'text';
  text: string;
  cache_control?: { type: 'ephemeral' };
};

interface AnthropicSuccessResponse {
  content: { type: string; text: string }[];
  usage?: { input_tokens: number; output_tokens: number };
}
interface AnthropicErrorResponse {
  type: string;
  error: { type: string; message: string };
}
export interface AnthropicApiResponse {
  success: boolean;
  content: string | null;
  responseData: unknown;
  error?: string;
}
export async function callAnthropicApi(
  apiKey: string,
  modelId: string,
  systemPrompt: string | null,
  userPrompt: string,
  maxTokens: number = 4000,
  internalAdapterAccess?: boolean,
): Promise<AnthropicApiResponse> {
  warnLegacyAccess('anthropicApi.callAnthropicApi', internalAdapterAccess);
  const apiUrl = 'https://api.anthropic.com/v1/messages';
  const apiVersion = '2023-06-01';
  if (!apiKey) {
    return { success: false, content: null, responseData: { type: 'error', error: { type: 'plugin_config_error', message: 'Anthropic API key not configured.' } }, error: 'Anthropic API key not configured.' };
  }
  if (!modelId) {
    return { success: false, content: null, responseData: { type: 'error', error: { type: 'plugin_config_error', message: 'Anthropic model ID not configured.' } }, error: 'Anthropic model ID not configured.' };  }

  // Always use content blocks for Anthropic (foundation for caching, citations, extended thinking)
  const delimIndex = userPrompt.indexOf(CACHE_BREAK_DELIMITER);
  let userContent: AnthropicTextBlock[];
  if (delimIndex > 0) {
    const stableText = userPrompt.slice(0, delimIndex).trimEnd();
    const volatileText = userPrompt.slice(delimIndex + CACHE_BREAK_DELIMITER.length).trimStart();
    userContent = [
      { type: 'text', text: stableText, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: volatileText },
    ];
  } else {
    userContent = [{ type: 'text', text: userPrompt }];
  }

  const requestBody: {
    model: string;
    messages: { role: string; content: AnthropicTextBlock[] }[];
    max_tokens: number;
    system?: AnthropicTextBlock[];
  } = { model: modelId, messages: [{ role: 'user', content: userContent }], max_tokens: maxTokens };
  if (systemPrompt) {
    requestBody.system = [{ type: 'text', text: systemPrompt }];
  }

  let responseData: unknown;
  try {
    const response = await requestUrl({
      url: apiUrl,
      method: 'POST',
      headers: {
        'anthropic-version': apiVersion,
        'anthropic-beta': 'prompt-caching-2024-07-31',
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      throw: false,
    });
    responseData = response.json;
    if (response.status >= 400) {
      const err = responseData as AnthropicErrorResponse;
      const msg = err?.error?.message ?? response.text ?? `Anthropic error (${response.status})`;
      return { success: false, content: null, responseData, error: msg };
    }
    const success = responseData as AnthropicSuccessResponse;
    const content = success?.content?.[0]?.text?.trim();
    if (content) return { success: true, content, responseData };
    return { success: false, content: null, responseData, error: 'Invalid response structure from Anthropic.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    responseData = { type: 'error', error: { type: 'network_or_execution_error', message: msg } };
    return { success: false, content: null, responseData, error: msg };
  }
}

// --- fetch models ---
interface AnthropicModel { id: string; } // API returns id field
interface AnthropicModelsResponse { models: AnthropicModel[]; }

export async function fetchAnthropicModels(apiKey: string): Promise<AnthropicModel[]> {
  if (!apiKey) throw new Error('Anthropic API key is required to fetch models.');

  const response = await requestUrl({
    url: 'https://api.anthropic.com/v1/models',
    method: 'GET',
    headers: {
      'anthropic-version': '2023-06-01',
      'x-api-key': apiKey,
    },
    throw: false,
  });
  const data = response.json as AnthropicModelsResponse;
  if (response.status >= 400 || !Array.isArray((data as any)?.models)) {
    throw new Error(`Error fetching Anthropic models (${response.status})`);
  }
  return data.models.sort((a, b) => a.id.localeCompare(b.id));
} 
