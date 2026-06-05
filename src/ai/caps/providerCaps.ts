import type { AIProviderId } from '../types';

import type { AccessTier } from '../types';

export interface ProviderTierCap {
    maxOutputTokens: number;
    requestPerMinute: number;
    retryAttempts: number;
    safeUtilization: number;
}

export interface ProviderCapsDefinition {
    providerMaxOutputTokens: number;
    defaultInputTokens: number;
    defaultOutputTokens: number;
    tiers: Record<AccessTier, ProviderTierCap>;
}

export const PROVIDER_CAPS: Record<Exclude<AIProviderId, 'none'>, ProviderCapsDefinition> = {
    anthropic: {
        // Output headroom raised 2026-06-05 for Opus 4.8: 128k is the
        // documented synchronous max output (no beta header). RT caps at
        // 64k — enough to stop truncating large structured replies and to
        // leave room for adaptive-thinking tokens (which count against
        // max_tokens), while keeping a runaway rail below the 128k ceiling.
        // Lower tiers stay smaller as a per-request blast-radius limit.
        providerMaxOutputTokens: 64000,
        defaultInputTokens: 200000,
        defaultOutputTokens: 8000,
        tiers: {
            1: { maxOutputTokens: 16000, requestPerMinute: 20, retryAttempts: 1, safeUtilization: 0.7 },
            2: { maxOutputTokens: 32000, requestPerMinute: 40, retryAttempts: 2, safeUtilization: 0.8 },
            3: { maxOutputTokens: 64000, requestPerMinute: 60, retryAttempts: 2, safeUtilization: 0.85 },
            4: { maxOutputTokens: 64000, requestPerMinute: 90, retryAttempts: 3, safeUtilization: 0.9 }
        }
    },
    openai: {
        providerMaxOutputTokens: 128000,
        defaultInputTokens: 1050000,
        defaultOutputTokens: 12000,
        tiers: {
            1: { maxOutputTokens: 32000, requestPerMinute: 30, retryAttempts: 1, safeUtilization: 0.7 },
            2: { maxOutputTokens: 64000, requestPerMinute: 60, retryAttempts: 2, safeUtilization: 0.8 },
            3: { maxOutputTokens: 128000, requestPerMinute: 80, retryAttempts: 2, safeUtilization: 0.85 },
            4: { maxOutputTokens: 128000, requestPerMinute: 120, retryAttempts: 3, safeUtilization: 0.9 }
        }
    },
    google: {
        // Tier output caps rescaled 2026-05-22 because Gemini 2.5+/3.x have
        // thinking enabled by default and thinking tokens count against
        // maxOutputTokens. The prior table (8k/16k/32k/49k) starved
        // tier-1 Inquiry — thinking burned most of the 8k cap and the
        // visible JSON response was truncated. New caps leave room for
        // ~4-6k of thinking PLUS the structured output across all tiers.
        providerMaxOutputTokens: 65536,
        defaultInputTokens: 1048576,
        defaultOutputTokens: 12000,
        tiers: {
            1: { maxOutputTokens: 16384, requestPerMinute: 30, retryAttempts: 1, safeUtilization: 0.7 },
            2: { maxOutputTokens: 24576, requestPerMinute: 60, retryAttempts: 2, safeUtilization: 0.8 },
            3: { maxOutputTokens: 40960, requestPerMinute: 100, retryAttempts: 2, safeUtilization: 0.85 },
            4: { maxOutputTokens: 57344, requestPerMinute: 160, retryAttempts: 3, safeUtilization: 0.9 }
        }
    },
    ollama: {
        providerMaxOutputTokens: 4000,
        defaultInputTokens: 32000,
        defaultOutputTokens: 2000,
        tiers: {
            1: { maxOutputTokens: 1500, requestPerMinute: 12, retryAttempts: 0, safeUtilization: 0.6 },
            2: { maxOutputTokens: 2500, requestPerMinute: 20, retryAttempts: 1, safeUtilization: 0.7 },
            3: { maxOutputTokens: 3500, requestPerMinute: 30, retryAttempts: 1, safeUtilization: 0.75 },
            4: { maxOutputTokens: 4000, requestPerMinute: 40, retryAttempts: 2, safeUtilization: 0.8 }
        }
    }
};
