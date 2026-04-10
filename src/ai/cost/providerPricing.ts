import type { AIProviderId } from '../types';

export type PricingSource = 'remote' | 'cache' | 'builtin';

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

export interface PricingMeta {
    source: PricingSource;
    fetchedAt?: string;
}

export interface ResolvedProviderModelPricing {
    inputPer1M: number;
    outputPer1M: number;
    cacheWrite5mPer1M?: number;
    cacheWrite1hPer1M?: number;
    cacheReadPer1M?: number;
    pricingPhase: 'standard' | 'longContext';
    promo?: PromoPricing;
    meta: PricingMeta;
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
let activeMeta: PricingMeta = { source: 'builtin' };

export function isPromoActive(promo: PromoPricing | undefined): boolean {
    if (!promo) return false;
    if (!promo.expiresAt) return true;
    return Date.now() < Date.parse(promo.expiresAt);
}

export function getActivePricingTable(): ProviderPricingTable {
    return activePricing;
}

export interface ActivePromoInfo {
    provider: AIProviderId;
    modelId: string;
    promo: PromoPricing;
    inputPer1M: number;
    outputPer1M: number;
}

export function getActivePromos(): ActivePromoInfo[] {
    const promos: ActivePromoInfo[] = [];
    for (const [provider, models] of Object.entries(activePricing)) {
        if (!models) continue;
        for (const [modelId, pricing] of Object.entries(models)) {
            if (pricing.promo && isPromoActive(pricing.promo)) {
                promos.push({
                    provider: provider as AIProviderId,
                    modelId,
                    promo: pricing.promo,
                    inputPer1M: pricing.inputPer1M,
                    outputPer1M: pricing.outputPer1M
                });
            }
        }
    }
    return promos;
}

export function getActivePricingMeta(): PricingMeta {
    return activeMeta;
}

export function mergeRemotePricing(remote: ProviderPricingTable, source: PricingSource, fetchedAt?: string): void {
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
    activeMeta = { source, fetchedAt };
}

export function resetPricingToBuiltin(): void {
    activePricing = structuredClone(BUILTIN_PRICING);
    activeMeta = { source: 'builtin' };
}

function formatPricingDate(isoDate: string): string {
    const d = new Date(isoDate);
    if (!Number.isFinite(d.getTime())) return '';
    const month = d.toLocaleString('en-US', { month: 'short' });
    const day = d.getDate();
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    const hour12 = hours % 12 || 12;
    return `${month} ${day}, ${hour12}:${minutes}${ampm}`;
}

export function getPricingFreshnessLabel(meta: PricingMeta): string {
    if (meta.source === 'builtin') return 'Using fallback pricing';
    if (!meta.fetchedAt) return 'Using cached pricing';
    const ageMs = Date.now() - Date.parse(meta.fetchedAt);
    if (!Number.isFinite(ageMs) || ageMs < 0) return 'Using cached pricing';
    const dateStr = formatPricingDate(meta.fetchedAt);
    const THREE_DAYS_MS = 72 * 60 * 60 * 1000;
    if (ageMs <= THREE_DAYS_MS) return `Pricing checked ${dateStr}`;
    return `Using cached pricing from ${dateStr}`;
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

function resolveExpiredPromoRates(pricing: ProviderModelPricing): { inputPer1M: number; outputPer1M: number } {
    const promo = pricing.promo;
    if (!promo) return pricing;
    if (isPromoActive(promo)) return pricing;
    return {
        inputPer1M: promo.standardInputPer1M ?? pricing.inputPer1M,
        outputPer1M: promo.standardOutputPer1M ?? pricing.outputPer1M
    };
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
    const promoActive = isPromoActive(pricing.promo);
    const promo = promoActive ? pricing.promo : undefined;
    const meta = activeMeta;
    const effectiveRates = resolveExpiredPromoRates(pricing);

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
            promo,
            meta
        };
    }

    return {
        inputPer1M: effectiveRates.inputPer1M,
        outputPer1M: effectiveRates.outputPer1M,
        cacheWrite5mPer1M: pricing.cacheWrite5mPer1M,
        cacheWrite1hPer1M: pricing.cacheWrite1hPer1M,
        cacheReadPer1M: pricing.cacheReadPer1M,
        pricingPhase: 'standard',
        promo,
        meta
    };
}
