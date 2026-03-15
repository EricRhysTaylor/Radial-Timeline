import type { AIProviderId } from '../types';

export interface ProviderModelPricing {
    inputPer1M: number;
    outputPer1M: number;
}

type ProviderPricingTable = Partial<Record<AIProviderId, Record<string, ProviderModelPricing>>>;

export const PROVIDER_PRICING: ProviderPricingTable = {
    anthropic: {
        'claude-sonnet-4-6': {
            inputPer1M: 3.0,
            outputPer1M: 15.0
        },
        'claude-sonnet-4-5-20250929': {
            inputPer1M: 3.0,
            outputPer1M: 15.0
        }
    },
    openai: {
        'gpt-5.4': {
            inputPer1M: 3.0,
            outputPer1M: 10.0
        },
        'gpt-5.4-2026-03-05': {
            inputPer1M: 3.0,
            outputPer1M: 10.0
        },
        'gpt-5.4-pro': {
            inputPer1M: 20.0,
            outputPer1M: 120.0
        },
        'gpt-5.4-pro-2026-03-05': {
            inputPer1M: 20.0,
            outputPer1M: 120.0
        }
    },
    google: {
        'gemini-3.1-pro-preview': {
            inputPer1M: 2.5,
            outputPer1M: 15.0
        },
        'gemini-pro-latest': {
            inputPer1M: 2.5,
            outputPer1M: 15.0
        },
        'gemini-2.5-pro': {
            inputPer1M: 2.5,
            outputPer1M: 15.0
        }
    }
};

export function getProviderPricing(
    provider: AIProviderId,
    modelId: string
): ProviderModelPricing {
    const providerPricing = PROVIDER_PRICING[provider];
    const pricing = providerPricing?.[modelId];
    if (!pricing) {
        throw new Error(`Missing provider pricing for ${provider}:${modelId}`);
    }
    return pricing;
}
