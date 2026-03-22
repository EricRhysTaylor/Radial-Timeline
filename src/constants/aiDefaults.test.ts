import { describe, expect, it } from 'vitest';
import * as aiDefaults from './aiDefaults';

describe('AI defaults vocabulary', () => {
    it('exports only the canonical Google default model symbol', () => {
        expect(aiDefaults.DEFAULT_GOOGLE_MODEL_ID).toBeDefined();
        expect('DEFAULT_GEMINI_MODEL_ID' in aiDefaults).toBe(false);
    });
});
