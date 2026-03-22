import { describe, expect, it } from 'vitest';
import { CURATED_MODELS } from './aiModels';

describe('AI model catalog vocabulary', () => {
    it('uses canonical provider keys only', () => {
        expect(Object.keys(CURATED_MODELS).sort()).toEqual(['anthropic', 'google', 'openai']);
        expect('gemini' in CURATED_MODELS).toBe(false);
        expect('local' in CURATED_MODELS).toBe(false);
    });

    it('labels the Google lane canonically', () => {
        expect(CURATED_MODELS.google.every(model => model.label.startsWith('Google '))).toBe(true);
    });
});
