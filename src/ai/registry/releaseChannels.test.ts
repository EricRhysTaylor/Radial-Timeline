import { describe, expect, it } from 'vitest';
import { BUILTIN_MODELS } from './builtinModels';
import { getPickerModelsForProvider, selectLatestModelByReleaseChannel } from './releaseChannels';

describe('release channel curation', () => {
    it('returns OpenAI picker models in stable/rollback order (pro is hidden from the picker)', () => {
        const picker = getPickerModelsForProvider(BUILTIN_MODELS, 'openai').map(model => model.alias);
        expect(picker).toEqual(['gpt-5.5', 'gpt-5.4']);
    });

    it('hides google latest compatibility aliases from the normal picker', () => {
        const picker = getPickerModelsForProvider(BUILTIN_MODELS, 'google').map(model => model.alias);
        expect(picker).toEqual(['gemini-3.5-flash', 'gemini-2.5-pro', 'gemini-3.1-pro-preview']);
        expect(picker.includes('gemini-pro-latest')).toBe(false);
    });

    it('keeps Anthropic picker order stable-first while still exposing Opus 4.7', () => {
        const picker = getPickerModelsForProvider(BUILTIN_MODELS, 'anthropic').map(model => model.alias);
        expect(picker).toEqual(['claude-sonnet-4.6', 'claude-opus-4.7', 'claude-opus-4.6', 'claude-sonnet-4.5']);
    });

    it('hides OpenAI snapshot models from the normal picker', () => {
        const picker = getPickerModelsForProvider(BUILTIN_MODELS, 'openai').map(model => model.alias);
        expect(picker.includes('gpt-5.5-2026-04-23')).toBe(false);
        expect(picker.includes('gpt-5.4-2026-03-05')).toBe(false);
        expect(picker.includes('gpt-5.4-pro-2026-03-05')).toBe(false);
    });

    it('selects latest OpenAI models by release channel', () => {
        const stable = selectLatestModelByReleaseChannel(BUILTIN_MODELS, 'openai', 'stable');
        const pro = selectLatestModelByReleaseChannel(BUILTIN_MODELS, 'openai', 'pro');
        const rollback = selectLatestModelByReleaseChannel(BUILTIN_MODELS, 'openai', 'rollback');
        expect(stable?.alias).toBe('gpt-5.5');
        expect(pro?.alias).toBe('gpt-5.4-pro');
        expect(rollback?.alias).toBe('gpt-5.4');
    });

    it('selects latest Anthropic models by release channel', () => {
        const stable = selectLatestModelByReleaseChannel(BUILTIN_MODELS, 'anthropic', 'stable');
        const pro = selectLatestModelByReleaseChannel(BUILTIN_MODELS, 'anthropic', 'pro');
        expect(stable?.alias).toBe('claude-sonnet-4.6');
        expect(pro?.alias).toBe('claude-opus-4.7');
    });
});
