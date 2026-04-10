import { describe, expect, it, afterEach } from 'vitest';
import {
    getProviderPricing,
    resolveProviderModelPricing,
    isPromoActive,
    mergeRemotePricing,
    resetPricingToBuiltin,
    getActivePricingTable
} from './providerPricing';

describe('providerPricing', () => {
    afterEach(() => {
        resetPricingToBuiltin();
    });

    it('stores an explicit Sonnet 4.5 pricing row', () => {
        const pricing = getProviderPricing('anthropic', 'claude-sonnet-4-5-20250929');

        expect(pricing.inputPer1M).toBe(3);
        expect(pricing.outputPer1M).toBe(15);
        expect(pricing.cacheWrite5mPer1M).toBe(3.75);
        expect(pricing.cacheWrite1hPer1M).toBe(6);
        expect(pricing.cacheReadPer1M).toBe(0.3);
    });

    it('stores an explicit Sonnet 4.6 pricing row', () => {
        const pricing = getProviderPricing('anthropic', 'claude-sonnet-4-6');

        expect(pricing.inputPer1M).toBe(3);
        expect(pricing.outputPer1M).toBe(15);
        expect(pricing.cacheWrite5mPer1M).toBe(3.75);
        expect(pricing.cacheWrite1hPer1M).toBe(6);
        expect(pricing.cacheReadPer1M).toBe(0.3);
    });

    it('stores an explicit Opus 4.1 pricing row', () => {
        const pricing = getProviderPricing('anthropic', 'claude-opus-4-1-20250805');

        expect(pricing.inputPer1M).toBe(15);
        expect(pricing.outputPer1M).toBe(75);
        expect(pricing.cacheWrite5mPer1M).toBe(18.75);
        expect(pricing.cacheWrite1hPer1M).toBe(30);
        expect(pricing.cacheReadPer1M).toBe(1.5);
    });

    it('stores an explicit Opus 4.6 pricing row', () => {
        const pricing = getProviderPricing('anthropic', 'claude-opus-4-6');

        expect(pricing.inputPer1M).toBe(5);
        expect(pricing.outputPer1M).toBe(25);
        expect(pricing.cacheWrite5mPer1M).toBe(6.25);
        expect(pricing.cacheWrite1hPer1M).toBe(10);
        expect(pricing.cacheReadPer1M).toBe(0.5);
    });

    it('does not assume newer Anthropic versions are more expensive', () => {
        const sonnet45 = getProviderPricing('anthropic', 'claude-sonnet-4-5-20250929');
        const sonnet46 = getProviderPricing('anthropic', 'claude-sonnet-4-6');
        const opus41 = getProviderPricing('anthropic', 'claude-opus-4-1-20250805');
        const opus46 = getProviderPricing('anthropic', 'claude-opus-4-6');

        expect(sonnet46.inputPer1M).toBe(sonnet45.inputPer1M);
        expect(sonnet46.outputPer1M).toBe(sonnet45.outputPer1M);
        expect(opus46.inputPer1M).toBeLessThan(opus41.inputPer1M);
        expect(opus46.outputPer1M).toBeLessThan(opus41.outputPer1M);
    });

    it('switches Sonnet 4.5 to premium long-context rates above 200k input tokens', () => {
        const standard = resolveProviderModelPricing('anthropic', 'claude-sonnet-4-5-20250929', 200_000);
        const longContext = resolveProviderModelPricing('anthropic', 'claude-sonnet-4-5-20250929', 200_001);

        expect(standard.pricingPhase).toBe('standard');
        expect(standard.inputPer1M).toBe(3);
        expect(standard.outputPer1M).toBe(15);
        expect(longContext.pricingPhase).toBe('longContext');
        expect(longContext.inputPer1M).toBe(6);
        expect(longContext.outputPer1M).toBe(22.5);
        expect(longContext.cacheWrite5mPer1M).toBe(7.5);
        expect(longContext.cacheReadPer1M).toBe(0.6);
    });

    it('isPromoActive returns true for promo without expiresAt', () => {
        expect(isPromoActive({ label: 'Free preview' })).toBe(true);
    });

    it('isPromoActive returns false for expired promo', () => {
        expect(isPromoActive({ label: 'Expired', expiresAt: '2020-01-01T00:00:00Z' })).toBe(false);
    });

    it('isPromoActive returns true for future-dated promo', () => {
        const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        expect(isPromoActive({ label: 'Active', expiresAt: future })).toBe(true);
    });

    it('isPromoActive returns false for undefined', () => {
        expect(isPromoActive(undefined)).toBe(false);
    });

    it('mergeRemotePricing adds new models to active pricing', () => {
        mergeRemotePricing({
            google: {
                'gemini-4-flash-preview': {
                    inputPer1M: 0,
                    outputPer1M: 0,
                    promo: { label: 'Free preview' }
                }
            }
        });

        const pricing = getProviderPricing('google', 'gemini-4-flash-preview');
        expect(pricing.inputPer1M).toBe(0);
        expect(pricing.promo?.label).toBe('Free preview');
    });

    it('mergeRemotePricing overrides existing model pricing', () => {
        mergeRemotePricing({
            openai: {
                'gpt-5.4': {
                    inputPer1M: 2.0,
                    outputPer1M: 8.0
                }
            }
        });

        const pricing = getProviderPricing('openai', 'gpt-5.4');
        expect(pricing.inputPer1M).toBe(2.0);
        expect(pricing.outputPer1M).toBe(8.0);
    });

    it('mergeRemotePricing preserves builtin models not in remote', () => {
        mergeRemotePricing({
            openai: {
                'gpt-5.4': { inputPer1M: 2.0, outputPer1M: 8.0 }
            }
        });

        // Anthropic models should still be available from builtin
        const pricing = getProviderPricing('anthropic', 'claude-sonnet-4-6');
        expect(pricing.inputPer1M).toBe(3);
    });

    it('resetPricingToBuiltin restores original pricing', () => {
        mergeRemotePricing({
            openai: {
                'gpt-5.4': { inputPer1M: 0, outputPer1M: 0 }
            }
        });
        resetPricingToBuiltin();

        const pricing = getProviderPricing('openai', 'gpt-5.4');
        expect(pricing.inputPer1M).toBe(3);
    });

    it('resolveProviderModelPricing surfaces active promo', () => {
        mergeRemotePricing({
            google: {
                'gemini-2.5-pro': {
                    inputPer1M: 0,
                    outputPer1M: 0,
                    promo: { label: 'Launch promo', expiresAt: new Date(Date.now() + 86400000).toISOString() }
                }
            }
        });

        const resolved = resolveProviderModelPricing('google', 'gemini-2.5-pro', 50_000);
        expect(resolved.inputPer1M).toBe(0);
        expect(resolved.promo?.label).toBe('Launch promo');
    });

    it('resolveProviderModelPricing omits expired promo', () => {
        mergeRemotePricing({
            google: {
                'gemini-2.5-pro': {
                    inputPer1M: 0,
                    outputPer1M: 0,
                    promo: { label: 'Expired promo', expiresAt: '2020-01-01T00:00:00Z' }
                }
            }
        });

        const resolved = resolveProviderModelPricing('google', 'gemini-2.5-pro', 50_000);
        expect(resolved.promo).toBeUndefined();
    });
});
