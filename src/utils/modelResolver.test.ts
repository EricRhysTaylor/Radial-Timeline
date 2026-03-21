import { beforeEach, describe, expect, it } from 'vitest';
import { cacheResolvedModel, clearResolvedModelCache, getModelDisplayName, getResolvedModelId } from './modelResolver';

beforeEach(() => {
    clearResolvedModelCache();
});

describe('getModelDisplayName snapshot formatting', () => {
    it('shows canonical snapshot label in normal contexts', () => {
        expect(getModelDisplayName('gpt-5.4-2026-03-05')).toBe('GPT-5.4 (snapshot)');
        expect(getModelDisplayName('gpt-5.4-pro-2026-03-05')).toBe('GPT-5.4 Pro (snapshot)');
    });

    it('includes raw snapshot id in debug contexts', () => {
        expect(getModelDisplayName('gpt-5.4-2026-03-05', { debug: true }))
            .toBe('GPT-5.4 (snapshot gpt-5.4-2026-03-05)');
        expect(getModelDisplayName('gpt-5.4-pro-2026-03-05', { debug: true }))
            .toBe('GPT-5.4 Pro (snapshot gpt-5.4-pro-2026-03-05)');
    });

    it('caches concrete resolutions for latest aliases and normalizes provider prefixes', () => {
        cacheResolvedModel('gemini-pro-latest', 'models/gemini-2.5-pro');

        expect(getResolvedModelId('gemini-pro-latest')).toBe('gemini-2.5-pro');
        expect(getResolvedModelId('models/gemini-pro-latest')).toBe('gemini-2.5-pro');
        expect(getModelDisplayName('gemini-pro-latest')).toBe('Gemini 2.5 Pro (via latest)');
    });
});
