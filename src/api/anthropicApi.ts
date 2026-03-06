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

export type AnthropicDocumentBlock = {
  type: 'document';
  source: { type: 'text'; media_type: 'text/plain'; data: string };
  title?: string;
  citations: { enabled: true };
  cache_control?: { type: 'ephemeral' };
};

export type AnthropicContentBlock = AnthropicTextBlock | AnthropicDocumentBlock;

export interface BuildAnthropicUserContentInput {
  userPrompt: string;
  citationsEnabled?: boolean;
  evidenceDocuments?: { title: string; content: string }[];
}

interface AnthropicResponseCitation {
  type: string;
  cited_text: string;
  document_index: number;
  document_title?: string;
  start_char_index?: number;
  end_char_index?: number;
}

interface AnthropicSuccessResponse {
  content: { type: string; text?: string; thinking?: string; citations?: AnthropicResponseCitation[] }[];
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
  citations?: { citedText: string; documentIndex: number; documentTitle?: string;
                startCharIndex?: number; endCharIndex?: number }[];
}

export interface AnthropicTokenCountResponse {
  success: boolean;
  inputTokens: number | null;
  responseData: unknown;
  error?: string;
}

export function buildAnthropicUserContent(input: BuildAnthropicUserContentInput): AnthropicContentBlock[] {
  const delimIndex = input.userPrompt.indexOf(CACHE_BREAK_DELIMITER);
  if (delimIndex <= 0) {
    return [{ type: 'text', text: input.userPrompt }];
  }

  const stableText = input.userPrompt.slice(0, delimIndex).trimEnd();
  const volatileText = input.userPrompt.slice(delimIndex + CACHE_BREAK_DELIMITER.length).trimStart();

  if (input.citationsEnabled && input.evidenceDocuments?.length) {
    // Per-scene document blocks with citations enabled.
    // Instructions/rules stay in the stable text block; evidence goes in document blocks.
    // cache_control on last document only — caches entire evidence prefix.
    const docBlocks: AnthropicContentBlock[] = input.evidenceDocuments.map(
      (doc, i) => ({
        type: 'document' as const,
        source: { type: 'text' as const, media_type: 'text/plain' as const, data: doc.content },
        title: doc.title,
        citations: { enabled: true as const },
        ...(i === input.evidenceDocuments!.length - 1
          ? { cache_control: { type: 'ephemeral' as const } } : {})
      })
    );
    return [
      { type: 'text', text: stableText },
      ...docBlocks,
      { type: 'text', text: volatileText },
    ];
  }

  // Standard caching path (no citations)
  return [
    { type: 'text', text: stableText, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: volatileText },
  ];
}
export async function callAnthropicApi(
  apiKey: string,
  modelId: string,
  systemPrompt: string | null,
  userPrompt: string,
  maxTokens: number = 4000,
  internalAdapterAccess?: boolean,
  temperature?: number,
  topP?: number,
  thinkingBudgetTokens?: number,
  citationsEnabled?: boolean,
  evidenceDocuments?: { title: string; content: string }[]
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
  const userContent = buildAnthropicUserContent({ userPrompt, citationsEnabled, evidenceDocuments });

  const thinkingEnabled = typeof thinkingBudgetTokens === 'number' && thinkingBudgetTokens >= 1024;
  const effectiveMaxTokens = thinkingEnabled ? maxTokens + thinkingBudgetTokens : maxTokens;

  const requestBody: {
    model: string;
    messages: { role: string; content: AnthropicContentBlock[] }[];
    max_tokens: number;
    system?: AnthropicTextBlock[];
    temperature?: number;
    top_p?: number;
    thinking?: { type: 'enabled'; budget_tokens: number };
  } = { model: modelId, messages: [{ role: 'user', content: userContent }], max_tokens: effectiveMaxTokens };
  if (systemPrompt) {
    requestBody.system = [{ type: 'text', text: systemPrompt }];
  }
  // When thinking is enabled, Anthropic requires temperature=1 (omit to let API default).
  if (!thinkingEnabled && typeof temperature === 'number') {
    requestBody.temperature = temperature;
  }
  if (typeof topP === 'number') {
    requestBody.top_p = topP;
  }
  if (thinkingEnabled) {
    requestBody.thinking = { type: 'enabled', budget_tokens: thinkingBudgetTokens };
  }

  const betaHeaders = ['prompt-caching-2024-07-31'];
  if (thinkingEnabled) {
    betaHeaders.push('output-128k-2025-02-19');
  }

  let responseData: unknown;
  try {
    const response = await requestUrl({
      url: apiUrl,
      method: 'POST',
      headers: {
        'anthropic-version': apiVersion,
        'anthropic-beta': betaHeaders.join(','),
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
    // Skip thinking blocks — concatenate all text content blocks.
    // Handles both single-block (non-citation) and multi-block (citation) responses.
    const textBlocks = (success?.content ?? []).filter(
      (b: { type: string }) => b.type === 'text'
    ) as { type: string; text?: string; citations?: AnthropicResponseCitation[] }[];
    const content = textBlocks.map(b => b.text ?? '').join('').trim();
    const responseCitations = textBlocks.flatMap(b => b.citations ?? []);
    const mappedCitations = responseCitations.length > 0
      ? responseCitations.map(c => ({
          citedText: c.cited_text,
          documentIndex: c.document_index,
          documentTitle: c.document_title,
          startCharIndex: c.start_char_index,
          endCharIndex: c.end_char_index
        }))
      : undefined;
    if (content) return { success: true, content, responseData, citations: mappedCitations };
    return { success: false, content: null, responseData, error: 'Invalid response structure from Anthropic.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    responseData = { type: 'error', error: { type: 'network_or_execution_error', message: msg } };
    return { success: false, content: null, responseData, error: msg };
  }
}

export async function callAnthropicTokenCount(
  apiKey: string,
  modelId: string,
  systemPrompt: string | null,
  userPrompt: string,
  citationsEnabled?: boolean,
  evidenceDocuments?: { title: string; content: string }[]
): Promise<AnthropicTokenCountResponse> {
  const apiUrl = 'https://api.anthropic.com/v1/messages/count_tokens';
  const apiVersion = '2023-06-01';

  if (!apiKey) {
    return {
      success: false,
      inputTokens: null,
      responseData: { type: 'error', error: { type: 'plugin_config_error', message: 'Anthropic API key not configured.' } },
      error: 'Anthropic API key not configured.'
    };
  }
  if (!modelId) {
    return {
      success: false,
      inputTokens: null,
      responseData: { type: 'error', error: { type: 'plugin_config_error', message: 'Anthropic model ID not configured.' } },
      error: 'Anthropic model ID not configured.'
    };
  }

  const userContent = buildAnthropicUserContent({ userPrompt, citationsEnabled, evidenceDocuments });
  const requestBody: {
    model: string;
    messages: { role: string; content: AnthropicContentBlock[] }[];
    system?: AnthropicTextBlock[];
  } = {
    model: modelId,
    messages: [{ role: 'user', content: userContent }]
  };
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
      const msg = err?.error?.message ?? response.text ?? `Anthropic token count error (${response.status})`;
      return { success: false, inputTokens: null, responseData, error: msg };
    }
    const data = responseData as Record<string, unknown>;
    const inputTokens = typeof data.input_tokens === 'number'
      ? data.input_tokens
      : (typeof data.total_tokens === 'number' ? data.total_tokens : undefined);
    if (typeof inputTokens === 'number' && Number.isFinite(inputTokens)) {
      return { success: true, inputTokens: Math.max(0, Math.floor(inputTokens)), responseData };
    }
    return {
      success: false,
      inputTokens: null,
      responseData,
      error: 'Invalid token count response from Anthropic.'
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    responseData = { type: 'error', error: { type: 'network_or_execution_error', message: msg } };
    return { success: false, inputTokens: null, responseData, error: msg };
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
