import { describe, expect, it } from 'vitest';
import { computeCaps } from './computeCaps';
import { BUILTIN_MODELS } from '../registry/builtinModels';

describe('computeCaps', () => {
    it('increases output cap for higher access tiers', () => {
        const model = BUILTIN_MODELS.find(entry => entry.alias === 'claude-sonnet-4.5');
        expect(model).toBeDefined();
        const tier1 = computeCaps({
            provider: 'anthropic',
            model: model!,
            accessTier: 1,
            feature: 'InquiryMode',
            overrides: { maxOutputMode: 'high' }
        });
        const tier3 = computeCaps({
            provider: 'anthropic',
            model: model!,
            accessTier: 3,
            feature: 'InquiryMode',
            overrides: { maxOutputMode: 'high' }
        });
        const tier4 = computeCaps({
            provider: 'anthropic',
            model: model!,
            accessTier: 4,
            feature: 'InquiryMode',
            overrides: { maxOutputMode: 'high' }
        });
        expect(tier3.maxOutputTokens).toBeGreaterThan(tier1.maxOutputTokens);
        expect(tier4.requestPerMinute).toBeGreaterThan(tier3.requestPerMinute);
        expect(tier4.safeChunkThreshold).toBeGreaterThanOrEqual(tier3.safeChunkThreshold);
    });

    it('uses deeper reasoning defaults for inquiry when requested', () => {
        const model = BUILTIN_MODELS.find(entry => entry.alias === 'gpt-5.2-latest');
        expect(model).toBeDefined();
        const standard = computeCaps({
            provider: 'openai',
            model: model!,
            accessTier: 2,
            feature: 'InquiryMode',
            overrides: { reasoningDepth: 'standard' }
        });
        const deep = computeCaps({
            provider: 'openai',
            model: model!,
            accessTier: 2,
            feature: 'InquiryMode',
            overrides: { reasoningDepth: 'deep' }
        });
        expect(deep.temperature).toBeLessThanOrEqual(standard.temperature);
    });
});
