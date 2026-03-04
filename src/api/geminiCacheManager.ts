/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
/**
 * In-memory cache store for Gemini context caching.
 *
 * Maps SHA-256 content fingerprints to Gemini cached content resource names.
 * Enables cross-question reuse within a session: same corpus + same model
 * + same system prompt → same cache resource → no re-upload.
 */
import { createHash } from 'crypto';
import { createGeminiCache } from './geminiApi';

interface GeminiCacheEntry {
    cacheName: string;      // e.g. "cachedContents/abc123..."
    expiresAt: number;      // Date.now() + ttl
}

/** In-memory store: content fingerprint → cache resource */
const cacheStore = new Map<string, GeminiCacheEntry>();

/** Gemini context caching requires a minimum input token count (~32K). */
const GEMINI_MIN_CACHE_TOKENS = 32_768;
/** Rough chars-per-token estimate (same formula used by aiClient.estimateTokens). */
const CHARS_PER_TOKEN = 4;
const GEMINI_MIN_CACHE_CHARS = GEMINI_MIN_CACHE_TOKENS * CHARS_PER_TOKEN;

/** Default cache TTL: 15 minutes. Long enough for multi-question sessions. */
const DEFAULT_TTL_SECONDS = 900;

/**
 * SHA-256 fingerprint of modelId + systemPrompt + stableContent.
 * Collision-proof — safe for cache key identity.
 */
function hashCacheKey(modelId: string, systemPrompt: string, stableContent: string): string {
    return createHash('sha256')
        .update(modelId).update('\n')
        .update(systemPrompt).update('\n')
        .update(stableContent)
        .digest('hex').slice(0, 16);
}

/** Remove expired entries from the store. */
export function pruneGeminiCacheStore(): void {
    const now = Date.now();
    for (const [key, entry] of cacheStore) {
        if (entry.expiresAt <= now) cacheStore.delete(key);
    }
}

/**
 * Get or create a Gemini cached content resource for the stable prefix.
 *
 * Returns the cache resource name (e.g. "cachedContents/...") if caching is
 * viable and successful, or `null` if the stable prefix is too small for
 * Gemini's minimum token threshold.
 *
 * @throws if cache creation fails (caller should catch and fall back to uncached).
 */
export async function getOrCreateGeminiCache(
    apiKey: string,
    modelId: string,
    stableContent: string,
    systemPrompt?: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<string | null> {
    // Housekeeping: prune expired entries on each call
    pruneGeminiCacheStore();

    // Guard: skip cache for small stable prefixes (below Gemini min threshold)
    const estimatedTokens = Math.ceil(stableContent.length / CHARS_PER_TOKEN);
    if (estimatedTokens < GEMINI_MIN_CACHE_TOKENS) return null;

    const fp = hashCacheKey(modelId, systemPrompt ?? '', stableContent);
    const hit = cacheStore.get(fp);
    // 30-second safety margin — avoids racing the API expiration
    if (hit && hit.expiresAt - 30_000 > Date.now()) return hit.cacheName;
    cacheStore.delete(fp);      // expired or missing

    const cacheName = await createGeminiCache(
        apiKey, modelId, stableContent, ttlSeconds, systemPrompt
    );
    cacheStore.set(fp, {
        cacheName,
        expiresAt: Date.now() + (ttlSeconds * 1000),
    });
    return cacheName;
}
