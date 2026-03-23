/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
// DEPRECATED: Legacy provider adapter; prefer aiClient entrypoints.
import { requestUrl } from 'obsidian';
import { warnLegacyAccess } from './legacyAccessGuard';
import { CACHE_BREAK_DELIMITER } from '../ai/prompts/composeEnvelope';
import type { EvidenceDocument, TokenCountResult } from '../ai/types';

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

type AnthropicToolDefinition = {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
};

type AnthropicToolChoice = {
  type: 'tool';
  name: string;
};

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

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicSuccessResponse {
  content: ({ type: string; text?: string; thinking?: string; citations?: AnthropicResponseCitation[] } | AnthropicToolUseBlock)[];
  usage?: {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_creation?: Record<string, number>;
    cache_read_input_tokens?: number;
    output_tokens?: number;
  };
}
interface AnthropicErrorResponse {
  type: string;
  error: { type: string; message: string };
}

interface AnthropicTokenCountSuccessResponse {
  input_tokens?: number;
  total_tokens?: number;
}
export interface AnthropicApiResponse {
  success: boolean;
  content: string | null;
  responseData: unknown;
  error?: string;
  citations?: { citedText: string; documentIndex: number; documentTitle?: string;
                startCharIndex?: number; endCharIndex?: number }[];
}

function mapAnthropicResponseCitations(
  textBlocks: Array<{ type: string; text?: string; citations?: AnthropicResponseCitation[] }>
): AnthropicApiResponse['citations'] {
  const responseCitations = textBlocks.flatMap(b => b.citations ?? []);
  if (!responseCitations.length) return undefined;
  return responseCitations.map(c => ({
    citedText: c.cited_text,
    documentIndex: c.document_index,
    documentTitle: c.document_title,
    startCharIndex: c.start_char_index,
    endCharIndex: c.end_char_index
  }));
}

interface BuildAnthropicMessageRequestInput {
  mode: 'generate' | 'count';
  modelId: string;
  systemPrompt: string | null;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  thinkingBudgetTokens?: number;
  citationsEnabled?: boolean;
  evidenceDocuments?: EvidenceDocument[];
  jsonSchema?: Record<string, unknown>;
}

type AnthropicMessageRequestBody = {
  model: string;
  messages: { role: string; content: AnthropicContentBlock[] }[];
  system?: AnthropicTextBlock[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  thinking?: { type: 'enabled'; budget_tokens: number };
  tools?: AnthropicToolDefinition[];
  tool_choice?: AnthropicToolChoice;
};

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

function buildAnthropicMessageRequestBody(
  input: BuildAnthropicMessageRequestInput
): AnthropicMessageRequestBody {
  const userContent = buildAnthropicUserContent({
    userPrompt: input.userPrompt,
    citationsEnabled: input.citationsEnabled,
    evidenceDocuments: input.evidenceDocuments
  });

  const requestBody: AnthropicMessageRequestBody = {
    model: input.modelId,
    messages: [{ role: 'user', content: userContent }]
  };

  if (input.systemPrompt) {
    requestBody.system = [{ type: 'text', text: input.systemPrompt }];
  }

  if (input.mode === 'count') {
    return requestBody;
  }

  const forceStructuredTool = !!input.jsonSchema && Object.keys(input.jsonSchema).length > 0;
  const thinkingBudget = typeof input.thinkingBudgetTokens === 'number'
    ? input.thinkingBudgetTokens
    : 0;
  const thinkingEnabled = !forceStructuredTool
    && thinkingBudget >= 1024;
  const baseMaxTokens = typeof input.maxTokens === 'number' ? input.maxTokens : 4000;

  requestBody.max_tokens = thinkingEnabled
    ? baseMaxTokens + thinkingBudget
    : baseMaxTokens;

  // When thinking is enabled, Anthropic requires temperature=1 (omit to let API default).
  if (!thinkingEnabled && typeof input.temperature === 'number') {
    requestBody.temperature = input.temperature;
  }
  if (typeof input.topP === 'number') {
    requestBody.top_p = input.topP;
  }
  if (thinkingEnabled) {
    requestBody.thinking = { type: 'enabled', budget_tokens: thinkingBudget };
  }
  if (forceStructuredTool) {
    requestBody.tools = [{
      name: 'record_structured_response',
      description: 'Return the final structured response via this tool input.',
      input_schema: input.jsonSchema as Record<string, unknown>
    }];
    requestBody.tool_choice = {
      type: 'tool',
      name: 'record_structured_response'
    };
  }

  return requestBody;
}

function buildAnthropicBetaHeader(input: { thinkingEnabled: boolean }): string {
  const betaHeaders = ['prompt-caching-2024-07-31'];
  if (input.thinkingEnabled) {
    betaHeaders.push('output-128k-2025-02-19');
  }
  return betaHeaders.join(',');
}

export function normalizeAnthropicTokenCountResponse(
  responseData: unknown,
  modelId: string
): TokenCountResult | null {
  const data = responseData as AnthropicTokenCountSuccessResponse;
  const inputTokens = typeof data?.input_tokens === 'number'
    ? data.input_tokens
    : (typeof data?.total_tokens === 'number' ? data.total_tokens : undefined);
  if (typeof inputTokens !== 'number' || !Number.isFinite(inputTokens)) {
    return null;
  }
  return {
    provider: 'anthropic',
    modelId,
    inputTokens: Math.max(0, Math.floor(inputTokens)),
    source: 'provider_count'
  };
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
  evidenceDocuments?: { title: string; content: string }[],
  jsonSchema?: Record<string, unknown>
): Promise<AnthropicApiResponse> {
  warnLegacyAccess('anthropicApi.callAnthropicApi', internalAdapterAccess);
  const apiUrl = 'https://api.anthropic.com/v1/messages';
  const apiVersion = '2023-06-01';
  if (!apiKey) {
    return { success: false, content: null, responseData: { type: 'error', error: { type: 'plugin_config_error', message: 'Anthropic API key not configured.' } }, error: 'Anthropic API key not configured.' };
  }
  if (!modelId) {
    return { success: false, content: null, responseData: { type: 'error', error: { type: 'plugin_config_error', message: 'Anthropic model ID not configured.' } }, error: 'Anthropic model ID not configured.' };  }
  const thinkingEnabled = !jsonSchema
    && typeof thinkingBudgetTokens === 'number'
    && thinkingBudgetTokens >= 1024;
  const requestBody = buildAnthropicMessageRequestBody({
    mode: 'generate',
    modelId,
    systemPrompt,
    userPrompt,
    maxTokens,
    temperature,
    topP,
    thinkingBudgetTokens,
    citationsEnabled,
    evidenceDocuments,
    jsonSchema
  });

  let responseData: unknown;
  try {
    const response = await requestUrl({
      url: apiUrl,
      method: 'POST',
      headers: {
        'anthropic-version': apiVersion,
        'anthropic-beta': buildAnthropicBetaHeader({ thinkingEnabled }),
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
    const mappedCitations = mapAnthropicResponseCitations(textBlocks);
    const toolUseBlock = (success?.content ?? []).find(
      (block): block is AnthropicToolUseBlock => block.type === 'tool_use'
    );
    if (toolUseBlock && toolUseBlock.input !== undefined) {
      return {
        success: true,
        content: JSON.stringify(toolUseBlock.input),
        responseData,
        ...(mappedCitations?.length ? { citations: mappedCitations } : {})
      };
    }
    const content = textBlocks.map(b => b.text ?? '').join('').trim();
    if (content) return { success: true, content, responseData, citations: mappedCitations };
    return { success: false, content: null, responseData, error: 'Invalid response structure from Anthropic.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    responseData = { type: 'error', error: { type: 'network_or_execution_error', message: msg } };
    return { success: false, content: null, responseData, error: msg };
  }
}

export async function countAnthropicTokens(
  apiKey: string,
  modelId: string,
  systemPrompt: string | null,
  userPrompt: string,
  citationsEnabled?: boolean,
  evidenceDocuments?: EvidenceDocument[]
): Promise<TokenCountResult> {
  const apiUrl = 'https://api.anthropic.com/v1/messages/count_tokens';
  const apiVersion = '2023-06-01';

  if (!apiKey) {
    throw new Error('Anthropic API key not configured.');
  }
  if (!modelId) {
    throw new Error('Anthropic model ID not configured.');
  }

  const requestBody = buildAnthropicMessageRequestBody({
    mode: 'count',
    modelId,
    systemPrompt,
    userPrompt,
    citationsEnabled,
    evidenceDocuments
  });

  let responseData: unknown;
  try {
    const response = await requestUrl({
      url: apiUrl,
      method: 'POST',
      headers: {
        'anthropic-version': apiVersion,
        'anthropic-beta': buildAnthropicBetaHeader({ thinkingEnabled: false }),
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
      throw new Error(msg);
    }
    const normalized = normalizeAnthropicTokenCountResponse(responseData, modelId);
    if (normalized) return normalized;
    throw new Error('Invalid token count response from Anthropic.');
  } catch (e) {
    throw (e instanceof Error ? e : new Error(String(e)));
  }
}

// --- fetch models ---
interface AnthropicModel { id: string; } // API returns id field
interface AnthropicModelsResponse { data: AnthropicModel[]; }

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
  if (response.status >= 400) {
    throw new Error(`Error fetching Anthropic models (${response.status})`);
  }
  const data = response.json as AnthropicModelsResponse;
  if (!Array.isArray(data?.data)) {
    // HTTP 200 with valid auth but unexpected body — key is valid
    return [];
  }
  return data.data.sort((a, b) => a.id.localeCompare(b.id));
} 
