/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { requestUrl } from 'obsidian';

interface GeminiPart { text?: string }
interface GeminiContent { parts: GeminiPart[] }
interface GeminiCandidate { content: GeminiContent }

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
  error?: string;
}

export async function callGeminiApi(
  apiKey: string,
  modelId: string,
  systemPrompt: string | null,
  userPrompt: string,
  maxTokens: number | null = 4000,
  temperature: number = 0.7,
  jsonSchema?: Record<string, unknown>  // Optional JSON schema for structured output
): Promise<GeminiApiResponse> {
  if (!apiKey) {
    return { success: false, content: null, responseData: { error: { message: 'Gemini API key not configured.' } }, error: 'Gemini API key not configured.' };
  }
  if (!modelId) {
    return { success: false, content: null, responseData: { error: { message: 'Gemini model ID not configured.' } }, error: 'Gemini model ID not configured.' };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  type GeminiRequest = {
    contents: { role: 'user'; parts: { text: string }[] }[];
    generationConfig: { 
      temperature: number; 
      maxOutputTokens?: number;
      responseMimeType?: string;
      responseSchema?: Record<string, unknown>;
    };
    systemInstruction?: { parts: { text: string }[] };
  };
  const body: GeminiRequest = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature,
    },
  };
  if (systemPrompt) {
    // v1beta accepts systemInstruction as top-level
    body.systemInstruction = { parts: [{ text: systemPrompt }] };
  }
  if (maxTokens !== null) {
    body.generationConfig.maxOutputTokens = maxTokens;
  }
  // Enable JSON mode if schema provided
  if (jsonSchema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = jsonSchema;
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
    const text = success?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    if (text) return { success: true, content: text, responseData };
    return { success: false, content: null, responseData, error: 'Invalid response structure from Gemini.' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    responseData = { error: { message: msg } };
    return { success: false, content: null, responseData, error: msg };
  }
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
