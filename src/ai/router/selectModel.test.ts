import { describe, expect, it } from 'vitest';
import { selectModel } from './selectModel';
import { BUILTIN_MODELS } from '../registry/builtinModels';

describe('selectModel', () => {
    it('returns pinned alias when eligible', () => {
        const result = selectModel(BUILTIN_MODELS, {
            provider: 'anthropic',
            policy: { type: 'pinned', pinnedAlias: 'claude-sonnet-4.6' },
            requiredCapabilities: ['longContext', 'jsonStrict']
        });
        expect(result.model.alias).toBe('claude-sonnet-4.6');
        expect(result.warnings.length).toBe(0);
    });

    it('falls back with warning when pinned alias is missing', () => {
        const result = selectModel(BUILTIN_MODELS, {
            provider: 'openai',
            policy: { type: 'pinned', pinnedAlias: 'missing-alias' },
            requiredCapabilities: ['jsonStrict']
        });
        expect(result.model.provider).toBe('openai');
        expect(result.warnings.some(w => w.includes('missing-alias'))).toBe(true);
    });

    it('auto policy chooses latest stable model', () => {
        const result = selectModel(BUILTIN_MODELS, {
            provider: 'anthropic',
            policy: { type: 'latestStable' },
            requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong']
        });
        expect(result.model.alias).toBe('claude-sonnet-4.6');
    });

    it('resolves an OpenAI model for high-output inquiry requirements', () => {
        const result = selectModel(BUILTIN_MODELS, {
            provider: 'openai',
            policy: { type: 'latestStable' },
            requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'],
            contextTokensNeeded: 24000,
            outputTokensNeeded: 2000
        });
        expect(result.model.provider).toBe('openai');
        expect(result.model.alias).toBe('gpt-5.4');
        expect(result.model.capabilities.includes('highOutputCap')).toBe(true);
    });

    it('keeps pinned GPT-5.3 selection when explicitly requested', () => {
        const result = selectModel(BUILTIN_MODELS, {
            provider: 'openai',
            policy: { type: 'pinned', pinnedAlias: 'gpt-5.3' },
            requiredCapabilities: ['jsonStrict']
        });
        expect(result.model.alias).toBe('gpt-5.3');
    });

    it('keeps pinned GPT-5.4 selection when explicitly requested', () => {
        const result = selectModel(BUILTIN_MODELS, {
            provider: 'openai',
            policy: { type: 'pinned', pinnedAlias: 'gpt-5.4' },
            requiredCapabilities: ['jsonStrict']
        });
        expect(result.model.alias).toBe('gpt-5.4');
    });

    it('keeps pinned GPT-5.4-pro selection when explicitly requested', () => {
        const result = selectModel(BUILTIN_MODELS, {
            provider: 'openai',
            policy: { type: 'pinned', pinnedAlias: 'gpt-5.4-pro' },
            requiredCapabilities: ['jsonStrict', 'longContext', 'reasoningStrong', 'highOutputCap']
        });
        expect(result.model.alias).toBe('gpt-5.4-pro');
    });

    it('resolves latestPro to the newest OpenAI pro-lane model', () => {
        const result = selectModel(BUILTIN_MODELS, {
            provider: 'openai',
            policy: { type: 'latestPro' },
            requiredCapabilities: ['jsonStrict', 'longContext', 'reasoningStrong', 'highOutputCap']
        });
        expect(result.model.alias).toBe('gpt-5.4-pro');
    });

    it('keeps pinned OpenAI snapshot selections when explicitly requested', () => {
        const standardSnapshot = selectModel(BUILTIN_MODELS, {
            provider: 'openai',
            policy: { type: 'pinned', pinnedAlias: 'gpt-5.4-2026-03-05' },
            requiredCapabilities: ['jsonStrict']
        });
        const proSnapshot = selectModel(BUILTIN_MODELS, {
            provider: 'openai',
            policy: { type: 'pinned', pinnedAlias: 'gpt-5.4-pro-2026-03-05' },
            requiredCapabilities: ['jsonStrict', 'longContext', 'reasoningStrong', 'highOutputCap']
        });
        expect(standardSnapshot.model.alias).toBe('gpt-5.4-2026-03-05');
        expect(proSnapshot.model.alias).toBe('gpt-5.4-pro-2026-03-05');
    });

    it('ignores access tier for OpenAI latestStable resolution', () => {
        const tier1 = selectModel(BUILTIN_MODELS, {
            provider: 'openai',
            policy: { type: 'latestStable' },
            requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'],
            accessTier: 1
        });
        const tier4 = selectModel(BUILTIN_MODELS, {
            provider: 'openai',
            policy: { type: 'latestStable' },
            requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'],
            accessTier: 4
        });
        expect(tier1.model.alias).toBe('gpt-5.4');
        expect(tier4.model.alias).toBe('gpt-5.4');
    });
});
