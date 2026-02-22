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

    it('uses profile ranking deterministically', () => {
        const result = selectModel(BUILTIN_MODELS, {
            provider: 'anthropic',
            policy: { type: 'profile', profile: 'deepReasoner' },
            requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong']
        });
        expect(result.model.alias).toContain('claude-opus');
    });

    it('resolves an OpenAI model for high-output inquiry requirements', () => {
        const result = selectModel(BUILTIN_MODELS, {
            provider: 'openai',
            policy: { type: 'profile', profile: 'deepReasoner' },
            requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'],
            contextTokensNeeded: 24000,
            outputTokensNeeded: 2000
        });
        expect(result.model.provider).toBe('openai');
        expect(result.model.capabilities.includes('highOutputCap')).toBe(true);
    });
});
