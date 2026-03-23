import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('AI settings tab vocabulary', () => {
    it('uses canonical Ollama refs and no legacy local provider fields', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/SettingsTab.ts'), 'utf8');
        expect(source.includes('_ollamaBaseUrlInput')).toBe(true);
        expect(source.includes('_ollamaModelIdInput')).toBe(true);
        expect(source.includes('getLocalLlmBackend')).toBe(true);
        expect(source.includes('_localBaseUrlInput')).toBe(false);
        expect(source.includes('_localModelIdInput')).toBe(false);
    });

    it('keeps Google and Ollama as the active UI provider labels', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/SettingsTab.ts'), 'utf8');
        expect(source.includes('google?: HTMLElement')).toBe(true);
        expect(source.includes('ollama?: HTMLElement')).toBe(true);
        expect(source.includes('Local LLM')).toBe(false);
    });
});
