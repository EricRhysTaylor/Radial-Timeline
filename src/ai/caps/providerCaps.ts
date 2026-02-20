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
        providerMaxOutputTokens: 16000,
        defaultInputTokens: 200000,
        defaultOutputTokens: 8000,
        tiers: {
            1: { maxOutputTokens: 4000, requestPerMinute: 20, retryAttempts: 1, safeUtilization: 0.7 },
            2: { maxOutputTokens: 8000, requestPerMinute: 40, retryAttempts: 2, safeUtilization: 0.8 },
            3: { maxOutputTokens: 16000, requestPerMinute: 60, retryAttempts: 2, safeUtilization: 0.85 },
            4: { maxOutputTokens: 16000, requestPerMinute: 90, retryAttempts: 3, safeUtilization: 0.9 }
        }
    },
    openai: {
        providerMaxOutputTokens: 16000,
        defaultInputTokens: 200000,
        defaultOutputTokens: 6000,
        tiers: {
            1: { maxOutputTokens: 4000, requestPerMinute: 30, retryAttempts: 1, safeUtilization: 0.7 },
            2: { maxOutputTokens: 8000, requestPerMinute: 60, retryAttempts: 2, safeUtilization: 0.8 },
            3: { maxOutputTokens: 16000, requestPerMinute: 80, retryAttempts: 2, safeUtilization: 0.85 },
            4: { maxOutputTokens: 16000, requestPerMinute: 120, retryAttempts: 3, safeUtilization: 0.9 }
        }
    },
    google: {
        providerMaxOutputTokens: 65536,
        defaultInputTokens: 1000000,
        defaultOutputTokens: 12000,
        tiers: {
            1: { maxOutputTokens: 8192, requestPerMinute: 30, retryAttempts: 1, safeUtilization: 0.7 },
            2: { maxOutputTokens: 16384, requestPerMinute: 60, retryAttempts: 2, safeUtilization: 0.8 },
            3: { maxOutputTokens: 32768, requestPerMinute: 100, retryAttempts: 2, safeUtilization: 0.85 },
            4: { maxOutputTokens: 49152, requestPerMinute: 160, retryAttempts: 3, safeUtilization: 0.9 }
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
