import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('inquiryEngineRenderer wording', () => {
    it('uses eligible/validation wording for blocked Local LLM Inquiry state', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/engine/inquiryEngineRenderer.ts'), 'utf8');
        expect(source.includes('No eligible model for Inquiry')).toBe(true);
        expect(source.includes('Local LLM is connected')).toBe(true);
        expect(source.includes('Selected model passes basic validation')).toBe(true);
        expect(source.includes('This model does not meet Inquiry requirements for the current corpus')).toBe(true);
        expect(source.includes('No working model')).toBe(false);
    });
});
