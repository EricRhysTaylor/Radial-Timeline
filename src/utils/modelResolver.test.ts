import { describe, expect, it } from 'vitest';
import { getModelDisplayName } from './modelResolver';

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
});

