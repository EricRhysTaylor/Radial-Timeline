import type { AIProviderId } from '../types';

export interface PromoPricing {
    label: string;
    expiresAt?: string;
    standardInputPer1M?: number;
    standardOutputPer1M?: number;
}

export interface ProviderModelPricing {
    inputPer1M: number;
    outputPer1M: number;
    cacheWrite5mPer1M?: number;
    cacheWrite1hPer1M?: number;
    cacheReadPer1M?: number;
    longContext?: {
        thresholdInputTokens: number;
        inputPer1M: number;
        outputPer1M: number;
        cacheWrite5mPer1M?: number;
        cacheWrite1hPer1M?: number;
        cacheReadPer1M?: number;
    };
    promo?: PromoPricing;
}

export type ProviderPricingTable = Partial<Record<AIProviderId, Record<string, ProviderModelPricing>>>;

export interface ResolvedProviderModelPricing {
    inputPer1M: number;
    outputPer1M: number;
    cacheWrite5mPer1M?: number;
    cacheWrite1hPer1M?: number;
    cacheReadPer1M?: number;
    pricingPhase: 'standard' | 'longContext';
    promo?: PromoPricing;
}

export const BUILTIN_PRICING: ProviderPricingTable = {
    anthropic: {
        'claude-opus-4-1-20250805': {
            inputPer1M: 15.0,
            outputPer1M: 75.0,
            cacheWrite5mPer1M: 18.75,
            cacheWrite1hPer1M: 30.0,
            cacheReadPer1M: 1.5
        },
        'claude-sonnet-4-6': {
            inputPer1M: 3.0,
            outputPer1M: 15.0,
            cacheWrite5mPer1M: 3.75,
            cacheWrite1hPer1M: 6.0,
            cacheReadPer1M: 0.3
        },
        'claude-sonnet-4-5-20250929': {
            inputPer1M: 3.0,
            outputPer1M: 15.0,
            cacheWrite5mPer1M: 3.75,
            cacheWrite1hPer1M: 6.0,
            cacheReadPer1M: 0.3,
            longContext: {
                thresholdInputTokens: 200_000,
                inputPer1M: 6.0,
                outputPer1M: 22.5,
                cacheWrite5mPer1M: 7.5,
                cacheWrite1hPer1M: 12.0,
                cacheReadPer1M: 0.6
            }
        },
        'claude-opus-4-6': {
            inputPer1M: 5.0,
            outputPer1M: 25.0,
            cacheWrite5mPer1M: 6.25,
            cacheWrite1hPer1M: 10.0,
            cacheReadPer1M: 0.5
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

let activePricing: ProviderPricingTable = structuredClone(BUILTIN_PRICING);

export function isPromoActive(promo: PromoPricing | undefined): boolean {
    if (!promo) return false;
    if (!promo.expiresAt) return true;
    return Date.now() < Date.parse(promo.expiresAt);
}

export function getActivePricingTable(): ProviderPricingTable {
    return activePricing;
}

export function mergeRemotePricing(remote: ProviderPricingTable): void {
    const merged: ProviderPricingTable = structuredClone(BUILTIN_PRICING);
    for (const provider of Object.keys(remote) as AIProviderId[]) {
        const remoteModels = remote[provider];
        if (!remoteModels) continue;
        if (!merged[provider]) merged[provider] = {};
        for (const [modelId, pricing] of Object.entries(remoteModels)) {
            merged[provider]![modelId] = pricing;
        }
    }
    activePricing = merged;
}

export function resetPricingToBuiltin(): void {
    activePricing = structuredClone(BUILTIN_PRICING);
}

export function getProviderPricing(
    provider: AIProviderId,
    modelId: string
): ProviderModelPricing {
    const providerPricing = activePricing[provider];
    const pricing = providerPricing?.[modelId];
    if (!pricing) {
        throw new Error(`Missing provider pricing for ${provider}:${modelId}`);
    }
    return pricing;
}

export function resolveProviderModelPricing(
    provider: AIProviderId,
    modelId: string,
    totalInputTokens: number
): ResolvedProviderModelPricing {
    const pricing = getProviderPricing(provider, modelId);
    const normalizedInputTokens = Number.isFinite(totalInputTokens)
        ? Math.max(0, Math.floor(totalInputTokens))
        : 0;
    const longContext = pricing.longContext;
    const promo = isPromoActive(pricing.promo) ? pricing.promo : undefined;

    if (
        provider === 'anthropic'
        && longContext
        && normalizedInputTokens > longContext.thresholdInputTokens
    ) {
        return {
            inputPer1M: longContext.inputPer1M,
            outputPer1M: longContext.outputPer1M,
            cacheWrite5mPer1M: longContext.cacheWrite5mPer1M,
            cacheWrite1hPer1M: longContext.cacheWrite1hPer1M,
            cacheReadPer1M: longContext.cacheReadPer1M,
            pricingPhase: 'longContext',
            promo
        };
    }

    return {
        inputPer1M: pricing.inputPer1M,
        outputPer1M: pricing.outputPer1M,
        cacheWrite5mPer1M: pricing.cacheWrite5mPer1M,
        cacheWrite1hPer1M: pricing.cacheWrite1hPer1M,
        cacheReadPer1M: pricing.cacheReadPer1M,
        pricingPhase: 'standard',
        promo
    };
}
