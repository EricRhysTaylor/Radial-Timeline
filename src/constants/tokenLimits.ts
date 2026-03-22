/**
 * Output token limits for AI providers.
 * 
 * Gemini: Fetched from API (outputTokenLimit field)
 * Anthropic/OpenAI: Manual - check docs periodically
 * 
 * These are MAX limits. For scene analysis, we use a portion to leave
 * room for thinking/reasoning tokens in thinking models.
 */

// Known max output token limits per provider (as of Mar 2026)
// These should be updated when providers increase limits
export const PROVIDER_MAX_OUTPUT_TOKENS = {
    // Google Gemini 3 Pro: 65,536 (from API)
    // We use most of it since thinking tokens are separate in newer models
    google: 32000,
    
    // Claude 4.x: 8,192 base, up to 64K with extended thinking
    // Extended thinking models use separate "thinking" budget
    anthropic: 16000,
    
    // GPT-5.4 / GPT-5.4 Pro: up to 128,000 output tokens
    openai: 128000,
    
    // Local LLMs vary widely, use conservative default
    ollama: 4000,
} as const;

// Scene analysis needs structured JSON output
// Use generous limits for thinking models
export function getSceneAnalysisTokenLimit(provider: 'anthropic' | 'openai' | 'google' | 'ollama'): number {
    return PROVIDER_MAX_OUTPUT_TOKENS[provider];
}
