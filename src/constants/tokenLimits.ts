/**
 * Output token limits for AI providers.
 * 
 * Gemini: Fetched from API (outputTokenLimit field)
 * Anthropic/OpenAI: Manual - check docs periodically
 * 
 * These are MAX limits. For scene analysis, we use a portion to leave
 * room for thinking/reasoning tokens in thinking models.
 */

// Known max output token limits per provider (as of Dec 2025)
// These should be updated when providers increase limits
export const PROVIDER_MAX_OUTPUT_TOKENS = {
    // Gemini 3 Pro: 65,536 (from API)
    // We use most of it since thinking tokens are separate in newer models
    gemini: 32000,
    
    // Claude 4.x: 8,192 base, up to 64K with extended thinking
    // Extended thinking models use separate "thinking" budget
    anthropic: 16000,
    
    // GPT-5.x: 16,384 for most models
    // Reasoning tokens counted separately in o-series
    openai: 16000,
    
    // Local LLMs vary widely, use conservative default
    local: 4000,
} as const;

// Scene analysis needs structured JSON output
// Use generous limits for thinking models
export function getSceneAnalysisTokenLimit(provider: 'anthropic' | 'openai' | 'gemini' | 'local'): number {
    return PROVIDER_MAX_OUTPUT_TOKENS[provider];
}

