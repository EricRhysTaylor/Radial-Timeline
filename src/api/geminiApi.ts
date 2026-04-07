/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
// DEPRECATED: Legacy provider adapter; prefer aiClient entrypoints.
import { requestUrl } from 'obsidian';
import { warnLegacyAccess } from './legacyAccessGuard';
import type { SourceCitation } from '../ai/types';

interface GeminiPart { text?: string }
interface GeminiContent { parts?: GeminiPart[]; role?: string }
interface GeminiSearchTool {
  google_search: Record<string, never>;
}

interface GeminiGroundingWebSource {
  uri?: string;
  title?: string;
}

interface GeminiGroundingChunk {
  web?: GeminiGroundingWebSource;
  retrievedContext?: GeminiGroundingWebSource;
}

interface GeminiGroundingSupport {
  segment?: {
    text?: string;
    startIndex?: number;
    endIndex?: number;
  };
  groundingChunkIndices?: number[];
}

interface GeminiGroundingMetadata {
  groundingChunks?: GeminiGroundingChunk[];
  groundingSupports?: GeminiGroundingSupport[];
}

interface GeminiCandidate {
  content: GeminiContent;
  finishReason?: string;
  groundingMetadata?: GeminiGroundingMetadata;
}

interface GeminiGenerateSuccess {
  candidates?: GeminiCandidate[];
  promptFeedback?: { blockReason?: string };
}

interface GeminiErrorResponse {
  error?: { message?: string; status?: string };
}

export interface GeminiApiResponse {
  success: boolean;
  content: string | null;
  responseData: unknown;
  citations?: SourceCitation[];
  error?: string;
}

function dedupeGeminiCitations(citations: SourceCitation[]): SourceCitation[] {
  const seen = new Set<string>();
  const deduped: SourceCitation[] = [];
  citations.forEach(citation => {
    const key = [
      citation.attributionType,
      'sourceId' in citation ? citation.sourceId ?? '' : '',
      'url' in citation ? citation.url ?? '' : '',
      'sourceLabel' in citation ? citation.sourceLabel : '',
      citation.citedText ?? '',
      citation.startCharIndex ?? '',
      citation.endCharIndex ?? ''
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(citation);
  });
  return deduped;
}

export function extractGeminiGroundingCitations(responseData: unknown): SourceCitation[] {
  if (!responseData || typeof responseData !== 'object') return [];
  const data = responseData as GeminiGenerateSuccess;
  const citations: SourceCitation[] = [];

  const candidates = Array.isArray(data.candidates) ? data.candidates : [];
  candidates.forEach(candidate => {
    const metadata = candidate.groundingMetadata;
    const chunks = Array.isArray(metadata?.groundingChunks) ? metadata.groundingChunks : [];
    const supports = Array.isArray(metadata?.groundingSupports) ? metadata.groundingSupports : [];

    const buildCitation = (
      chunk: GeminiGroundingChunk | undefined,
      support?: GeminiGroundingSupport
    ): SourceCitation | null => {
      const source = chunk?.web ?? chunk?.retrievedContext;
      const url = typeof source?.uri === 'string' && source.uri.trim() ? source.uri.trim() : undefined;
      const title = typeof source?.title === 'string' && source.title.trim() ? source.title.trim() : undefined;
      if (!url && !title) return null;
      const citedText = typeof support?.segment?.text === 'string' && support.segment.text.trim()
        ? support.segment.text.trim()
        : undefined;
      const startCharIndex = typeof support?.segment?.startIndex === 'number' ? support.segment.startIndex : undefined;
      const endCharIndex = typeof support?.segment?.endIndex === 'number' ? support.segment.endIndex : undefined;
      return {
        attributionType: 'grounded',
        sourceLabel: title ?? url ?? 'Grounded source',
        sourceId: url ?? title,
        url,
        title,
        citedText,
        startCharIndex,
        endCharIndex
      };
    };

    if (supports.length) {
      supports.forEach(support => {
        const indices = Array.isArray(support.groundingChunkIndices)
          ? support.groundingChunkIndices
          : [];
        indices.forEach(index => {
          const citation = buildCitation(chunks[index], support);
          if (citation) citations.push(citation);
        });
      });
    } else {
      chunks.forEach(chunk => {
        const citation = buildCitation(chunk);
        if (citation) citations.push(citation);
      });
    }
  });

  return dedupeGeminiCitations(citations);
}

export async function callGeminiApi(
  apiKey: string,
  modelId: string,
  systemPrompt: string | null,
  userPrompt: string,
  maxTokens: number | null = 4000,
  temperature?: number,
  jsonSchema?: Record<string, unknown>,  // Optional JSON schema for structured output
  disableThinking: boolean = false,  // Disable extended thinking mode (for 2.5-pro models)
  cachedContentName?: string, // Optional: name of cached content resource (e.g. "cachedContents/...")
  topP?: number,
  citationsEnabled?: boolean,
  internalAdapterAccess?: boolean
): Promise<GeminiApiResponse> {
  warnLegacyAccess('geminiApi.callGeminiApi', internalAdapterAccess);
  if (!apiKey) {
    return { success: false, content: null, responseData: { error: { message: 'Gemini API key not configured.' } }, error: 'Gemini API key not configured.' };
  }
  if (!modelId) {
    return { success: false, content: null, responseData: { error: { message: 'Gemini model ID not configured.' } }, error: 'Gemini model ID not configured.' };
  }

  // Handle potential "models/" prefix in the modelId to prevent double prefixing
  const cleanModelId = modelId.startsWith('models/') ? modelId.slice(7) : modelId;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cleanModelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  type GeminiRequest = {
    contents: { role: 'user'; parts: { text: string }[] }[];
    generationConfig: { 
      temperature?: number; 
      topP?: number;
      maxOutputTokens?: number;
      responseMimeType?: string;
      responseSchema?: Record<string, unknown>;
      thinkingConfig?: { mode: string };
    };
    systemInstruction?: { parts: { text: string }[] };
    cachedContent?: string;
    tools?: GeminiSearchTool[];
  };
  const body: GeminiRequest = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {},
  };
  if (cachedContentName) {
    body.cachedContent = cachedContentName;
  }
  if (systemPrompt && !cachedContentName) {
    // v1beta accepts systemInstruction as top-level.
    // When cachedContentName is set, systemInstruction is already inside the
    // cached content — Gemini rejects the combination. // SAFE: Gemini restriction
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  if (maxTokens !== null) {
    body.generationConfig.maxOutputTokens = maxTokens;
  }
  // Gemini 2.5+ thinking models reject custom temperature/topP — omit them.
  const isThinkingModel = /\b2\.5\b|\b3\.\d/.test(cleanModelId);
  if (typeof temperature === 'number' && !isThinkingModel) {
    body.generationConfig.temperature = temperature;
  }
  if (typeof topP === 'number' && !isThinkingModel) {
    body.generationConfig.topP = topP;
  }
  // Disable thinking mode if requested (for 2.5-pro models)
  if (disableThinking) {
    // Only set thinking_config if explicitly required, otherwise don't send it at all
    // Some models (like 2.5-pro or non-thinking models) might reject unknown fields
    // body.generationConfig.thinkingConfig = { mode: "NONE" };
  }
  // Enable JSON mode if schema provided
  if (jsonSchema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = jsonSchema;
  }
  // Gemini rejects tools + responseMimeType 'application/json' in the same request.
  // When structured output is required, skip Search grounding.
  if (citationsEnabled && !jsonSchema) {
    body.tools = [{ google_search: {} }];
  }

  let responseData: unknown;
  try {
    const resp = await requestUrl({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      throw: false,
    });
    responseData = resp.json;
    if (resp.status >= 400) {
      const err = responseData as GeminiErrorResponse;
      const msg = err?.error?.message ?? resp.text ?? `Gemini error (${resp.status})`;
      return { success: false, content: null, responseData, error: msg };
    }
    const success = responseData as GeminiGenerateSuccess;
    // Detect safety block explicitly
    if (success?.promptFeedback && success.promptFeedback.blockReason) {
      const reason = success.promptFeedback.blockReason;
      return { success: false, content: null, responseData, error: `Gemini safety blocked: ${reason}` };
    }
    
    // Check for finish reasons that indicate incomplete response
    const candidate = success?.candidates?.[0];
    if (candidate?.finishReason) {
      if (candidate.finishReason === 'MAX_TOKENS') {
        return { 
          success: false, 
          content: null, 
          responseData, 
          error: 'Response exceeded maximum token limit. The output was truncated before completion. Try reducing the manuscript size or increasing maxOutputTokens.' 
        };
      }
      if (candidate.finishReason === 'SAFETY') {
        return { 
          success: false, 
          content: null, 
          responseData, 
          error: 'Response blocked by Gemini safety filters.' 
        };
      }
      if (candidate.finishReason === 'RECITATION') {
        return { 
          success: false, 
          content: null, 
          responseData, 
          error: 'Response blocked due to recitation concerns.' 
        };
      }
      // STOP is the normal finish reason, continue processing
    }
    
    const text = candidate?.content?.parts?.map(p => p.text || '').join('').trim();
    if (text) {
      const citations = extractGeminiGroundingCitations(responseData);
      return { success: true, content: text, responseData, ...(citations.length ? { citations } : {}) };
    }
    
    // Invalid response structure - log minimal debug info
    console.error('[Gemini API] Invalid response structure:', {
      hasCandidates: !!success?.candidates,
      candidatesLength: success?.candidates?.length || 0,
      finishReason: candidate?.finishReason
    });
    
    return { success: false, content: null, responseData, error: 'Invalid response structure from Gemini.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    responseData = { error: { message: msg } };
    return { success: false, content: null, responseData, error: msg };
  }
}

/**
 * Create a cached content resource for Gemini
 * @param apiKey Gemini API key
 * @param modelId Model ID to associate with cache (e.g. "gemini-1.5-pro-001")
 * @param content Full text content to cache (as user-role contents)
 * @param ttlSeconds Time to live in seconds (default 3600 = 1 hour)
 * @param systemInstruction Optional system instruction to include in the cached content.
 *   When provided, the generate request must NOT also set systemInstruction
 *   (Gemini rejects the combination).
 * @returns Name of the cached content resource (e.g. "cachedContents/123...")
 */
export async function createGeminiCache(
  apiKey: string,
  modelId: string,
  content: string,
  ttlSeconds: number = 3600,
  systemInstruction?: string
): Promise<string> {
  if (!apiKey) throw new Error('Gemini API key is required to create cache.');

  const cleanModelId = modelId.startsWith('models/') ? modelId.slice(7) : modelId;
  const url = `https://generativelanguage.googleapis.com/v1beta/cachedContents?key=${encodeURIComponent(apiKey)}`;

  const body: Record<string, unknown> = {
    model: `models/${cleanModelId}`,
    contents: [
      {
        role: 'user',
        parts: [{ text: content }]
      }
    ],
    ttl: `${ttlSeconds}s`
  };
  if (systemInstruction) {
    body.systemInstruction = { parts: [{ text: systemInstruction }] };
  }

  const resp = await requestUrl({
    url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    throw: false
  });

  if (resp.status >= 400) {
    const err = resp.json as GeminiErrorResponse;
    throw new Error(err?.error?.message ?? `Failed to create cache (${resp.status})`);
  }

  const data = resp.json as { name: string };
  if (!data.name) {
    throw new Error('Cache creation response missing name field');
  }
  
  return data.name;
}

// --- fetch models ---
interface GoogleModel { name: string; displayName?: string }
interface GoogleModelsResponse { models?: GoogleModel[] }

export async function fetchGeminiModels(apiKey: string): Promise<{ id: string; name: string }[]> {
  if (!apiKey) throw new Error('Gemini API key is required to fetch models.');
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const resp = await requestUrl({ url, method: 'GET', throw: false });
  const data = resp.json as GoogleModelsResponse;
  if (resp.status >= 400 || !Array.isArray(data?.models)) {
    throw new Error(`Error fetching Gemini models (${resp.status})`);
  }
  // Map to simple ids (strip the 'models/' prefix)
  const mapped = data.models.map(m => {
    const id = m.name?.includes('/') ? m.name.split('/').pop() || m.name : m.name;
    return { id, name: m.displayName || id };
  });
  return mapped.sort((a, b) => a.id.localeCompare(b.id));
}
