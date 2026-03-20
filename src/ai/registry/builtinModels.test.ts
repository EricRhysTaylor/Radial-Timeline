import { describe, expect, it } from 'vitest';
import { BUILTIN_MODELS } from './builtinModels';

function byAlias(alias: string) {
    const model = BUILTIN_MODELS.find(entry => entry.alias === alias);
    expect(model).toBeDefined();
    return model!;
}

describe('BUILTIN_MODELS OpenAI GPT-5.4 metadata', () => {
    it('uses expanded context/output limits for GPT-5.4 variants', () => {
        const aliases = [
            'gpt-5.4',
            'gpt-5.4-pro',
            'gpt-5.4-2026-03-05',
            'gpt-5.4-pro-2026-03-05'
        ];
        aliases.forEach(alias => {
            const model = byAlias(alias);
            expect(model.contextWindow).toBe(1050000);
            expect(model.maxOutput).toBe(128000);
        });
    });

    it('marks OpenAI release channels for stable/pro/rollback/snapshot', () => {
        expect(byAlias('gpt-5.4').rollout?.channel).toBe('stable');
        expect(byAlias('gpt-5.4').rollout?.supersedes).toBe('gpt-5.3');
        expect(byAlias('gpt-5.4-pro').rollout?.channel).toBe('pro');
        expect(byAlias('gpt-5.4-pro').rollout?.supersedes).toBe('gpt-5.3');
        expect(byAlias('gpt-5.3').rollout?.channel).toBe('rollback');
        expect(byAlias('gpt-5.4-2026-03-05').rollout?.channel).toBe('snapshot');
        expect(byAlias('gpt-5.4-2026-03-05').rollout?.hiddenFromPicker).toBe(true);
        expect(byAlias('gpt-5.4-2026-03-05').rollout?.supersedes).toBe('gpt-5.4');
        expect(byAlias('gpt-5.4-pro-2026-03-05').rollout?.channel).toBe('snapshot');
        expect(byAlias('gpt-5.4-pro-2026-03-05').rollout?.hiddenFromPicker).toBe(true);
        expect(byAlias('gpt-5.4-pro-2026-03-05').rollout?.supersedes).toBe('gpt-5.4-pro');
    });
});

describe('BUILTIN_MODELS Anthropic Claude 4.6 metadata', () => {
    it('uses 1M context windows for Claude 4.6 variants', () => {
        const aliases = [
            'claude-opus-4.6',
            'claude-sonnet-4.6'
        ];
        aliases.forEach(alias => {
            const model = byAlias(alias);
            expect(model.contextWindow).toBe(1000000);
            expect(model.maxOutput).toBe(16000);
        });
    });
});

describe('BUILTIN_MODELS Google Gemini metadata', () => {
    it('marks Gemini 2.5 Pro as the stable Google lane and 3.1 Pro Preview as legacy', () => {
        expect(byAlias('gemini-2.5-pro').status).toBe('stable');
        expect(byAlias('gemini-3.1-pro-preview').status).toBe('legacy');
        expect(byAlias('gemini-2.5-pro').contextWindow).toBe(1048576);
        expect(byAlias('gemini-2.5-pro').maxOutput).toBe(65536);
    });
});
