/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Resolves "latest" model aliases to human-friendly display names.
 * 
 * When using aliases like "gemini-pro-latest" or "gpt-5.2-chat-latest",
 * this module provides friendly names for UI display while keeping
 * the actual alias for API calls.
 */

// Static fallback mappings for "latest" aliases
// These are updated when we get actual model info from API responses
const LATEST_ALIAS_DISPLAY_NAMES: Record<string, string> = {
    // Gemini
    'gemini-pro-latest': 'Gemini 3.1 Pro Preview',
    'gemini-flash-latest': 'Gemini 2.5 Flash',
    'gemini-flash-lite-latest': 'Gemini Flash Lite',
    
    // OpenAI
    'gpt-5.2-chat-latest': 'GPT-5.2',
    'gpt-5.1-chat-latest': 'GPT-5.1',
    'gpt-5-chat-latest': 'GPT-5',
    'chatgpt-4o-latest': 'ChatGPT-4o',
};

// Runtime cache for resolved model names (updated from API responses)
const resolvedModelCache: Map<string, { resolvedTo: string; displayName: string; updatedAt: number }> = new Map();

/**
 * Get a friendly display name for a model ID.
 * For "latest" aliases, shows what they resolve to if known.
 * 
 * @param modelId The model ID (e.g., "gemini-3.1-pro-preview" or "claude-sonnet-4-6")
 * @returns A user-friendly display name
 */
export function getModelDisplayName(modelId: string): string {
    if (!modelId) return 'Unknown Model';
    
    // Check if we have a cached resolution from a recent API call
    const cached = resolvedModelCache.get(modelId);
    if (cached) {
        // Show the resolved name with indication it's a "latest" alias
        return cached.displayName;
    }
    
    // Check if this is a known "latest" alias
    if (LATEST_ALIAS_DISPLAY_NAMES[modelId]) {
        return LATEST_ALIAS_DISPLAY_NAMES[modelId];
    }
    
    // For specific versioned models, create a friendly name
    return formatModelName(modelId);
}

/**
 * Format a model ID into a more readable display name.
 */
function formatModelName(modelId: string): string {
    // Claude models
    if (modelId.startsWith('claude-')) {
        // claude-sonnet-4-6 -> Claude Sonnet 4.6
        const match = modelId.match(/claude-(\w+)-(\d+)-(\d+)-\d+/);
        if (match) {
            const variant = match[1].charAt(0).toUpperCase() + match[1].slice(1);
            return `Claude ${variant} ${match[2]}.${match[3]}`;
        }
        // claude-opus-4-5-20251101 -> Claude Opus 4.5
        const match2 = modelId.match(/claude-(\w+)-(\d+)-(\d+)/);
        if (match2) {
            const variant = match2[1].charAt(0).toUpperCase() + match2[1].slice(1);
            return `Claude ${variant} ${match2[2]}.${match2[3]}`;
        }
    }
    
    // Gemini models
    if (modelId.startsWith('gemini-')) {
        // gemini-3-pro-preview -> Gemini 3 Pro Preview
        // gemini-2.5-pro -> Gemini 2.5 Pro
        const parts = modelId.replace('gemini-', '').split('-');
        return 'Gemini ' + parts.map(p => 
            p.charAt(0).toUpperCase() + p.slice(1)
        ).join(' ');
    }
    
    // GPT models
    if (modelId.startsWith('gpt-')) {
        // gpt-5.2-chat-latest -> GPT-5.2
        const version = modelId.match(/gpt-(\d+\.?\d*)/)?.[1];
        if (version) return `GPT-${version}`;
    }
    
    // Default: just capitalize and clean up
    return modelId
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Update the cache with the actual model that a "latest" alias resolved to.
 * Call this after receiving an API response that includes the actual model version.
 * 
 * @param aliasId The "latest" alias that was used (e.g., "gemini-pro-latest")
 * @param resolvedModelId The actual model it resolved to (e.g., "gemini-3-pro-preview")
 */
export function cacheResolvedModel(aliasId: string, resolvedModelId: string): void {
    if (!aliasId || !resolvedModelId || aliasId === resolvedModelId) return;
    
    const displayName = `${formatModelName(resolvedModelId)} (via ${aliasId.includes('latest') ? 'latest' : 'alias'})`;
    
    resolvedModelCache.set(aliasId, {
        resolvedTo: resolvedModelId,
        displayName,
        updatedAt: Date.now()
    });
}

/**
 * Get the cached resolved model ID for a "latest" alias.
 * Returns null if not cached.
 */
export function getResolvedModelId(aliasId: string): string | null {
    return resolvedModelCache.get(aliasId)?.resolvedTo ?? null;
}

/**
 * Check if a model ID is a "latest" alias.
 */
export function isLatestAlias(modelId: string): boolean {
    return modelId.includes('latest');
}
