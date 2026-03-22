import { describe, expect, it } from 'vitest';
import { BUILTIN_MODELS } from './builtinModels';
import { getPickerModelsForProvider, selectLatestModelByReleaseChannel } from './releaseChannels';

describe('release channel curation', () => {
    it('returns OpenAI picker models in stable/pro/rollback order', () => {
        const picker = getPickerModelsForProvider(BUILTIN_MODELS, 'openai').map(model => model.alias);
        expect(picker).toEqual(['gpt-5.4', 'gpt-5.4-pro', 'gpt-5.3']);
    });

    it('hides google latest compatibility aliases from the normal picker', () => {
        const picker = getPickerModelsForProvider(BUILTIN_MODELS, 'google').map(model => model.alias);
        expect(picker).toEqual(['gemini-2.5-pro', 'gemini-3.1-pro-preview']);
        expect(picker.includes('gemini-pro-latest')).toBe(false);
    });

    it('hides OpenAI snapshot models from the normal picker', () => {
        const picker = getPickerModelsForProvider(BUILTIN_MODELS, 'openai').map(model => model.alias);
        expect(picker.includes('gpt-5.4-2026-03-05')).toBe(false);
        expect(picker.includes('gpt-5.4-pro-2026-03-05')).toBe(false);
    });

    it('selects latest OpenAI models by release channel', () => {
        const stable = selectLatestModelByReleaseChannel(BUILTIN_MODELS, 'openai', 'stable');
        const pro = selectLatestModelByReleaseChannel(BUILTIN_MODELS, 'openai', 'pro');
        const rollback = selectLatestModelByReleaseChannel(BUILTIN_MODELS, 'openai', 'rollback');
        expect(stable?.alias).toBe('gpt-5.4');
        expect(pro?.alias).toBe('gpt-5.4-pro');
        expect(rollback?.alias).toBe('gpt-5.3');
    });
});
