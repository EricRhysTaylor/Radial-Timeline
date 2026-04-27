/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Local OpenAI tokenizer adapter using the `o200k_base` BPE encoding.
 *
 * Why local instead of an HTTP countTokens call?
 *   OpenAI does not expose a free pre-flight token-counting endpoint.
 *   Their tokenizer (tiktoken) is open-source, so the canonical count is
 *   produced client-side by running the same BPE that the server runs.
 *   No network roundtrip, no quota cost, and the bundle ships exactly one
 *   rank file (`o200k_base`, ~2.2 MB) — the encoding used by every modern
 *   OpenAI model (gpt-4o, gpt-4.1, gpt-4.5, gpt-5.x).
 *
 * Older models (gpt-3.5-turbo, gpt-4 non-o) use `cl100k_base`. We do not
 * currently ship that rank; if the pricing table grows to include such a
 * model, add the encoding here and dispatch by name.
 */

import { Tiktoken } from 'js-tiktoken/lite';
import o200k_base from 'js-tiktoken/ranks/o200k_base';
import type { TokenCountResult } from '../ai/types';

let cachedEncoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
    if (!cachedEncoder) {
        cachedEncoder = new Tiktoken(o200k_base);
    }
    return cachedEncoder;
}

/**
 * Count input tokens for an OpenAI request using the local `o200k_base`
 * encoder. Returns the canonical TokenCountResult.
 *
 * Synchronous tokenizer; the async signature matches the other
 * `count*Tokens` adapters so the dispatcher can call them uniformly.
 *
 * Throws on invalid input so callers can fall back to a heuristic.
 */
export async function countOpenaiTokens(
    modelId: string,
    systemPrompt: string | null,
    userPrompt: string
): Promise<TokenCountResult> {
    if (!modelId) {
        throw new Error('OpenAI model ID not configured.');
    }

    const encoder = getEncoder();
    let tokens = 0;
    if (systemPrompt && systemPrompt.length > 0) {
        tokens += encoder.encode(systemPrompt).length;
    }
    if (userPrompt && userPrompt.length > 0) {
        tokens += encoder.encode(userPrompt).length;
    }

    return {
        provider: 'openai',
        modelId,
        inputTokens: tokens,
        source: 'provider_count'
    };
}
