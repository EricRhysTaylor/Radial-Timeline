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

    it('keeps canonical internal refs for Local LLM validation inputs without old local provider fields', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/SettingsTab.ts'), 'utf8');
        expect(source.includes('google?: HTMLElement')).toBe(true);
        expect(source.includes('ollama?: HTMLElement')).toBe(true);
        expect(source.includes('_localBaseUrlInput')).toBe(false);
        expect(source.includes('_localModelIdInput')).toBe(false);
    });
});

describe('settings section navigation anchors', () => {
    it('uses concise Core quick-link labels', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/settings/SettingsTab.ts'), 'utf8');
        expect(source.includes("{ label: 'Beats', target: beatsStorySection }")).toBe(true);
        expect(source.includes("{ label: 'Properties', target: scenePropertiesSection }")).toBe(true);
        expect(source.includes("{ label: 'Readme', target: readmeSection }")).toBe(false);
        expect(source.includes("{ label: 'Story beats', target: beatsStorySection }")).toBe(false);
        expect(source.includes("{ label: 'Scene properties', target: scenePropertiesSection }")).toBe(false);
    });

    it('anchors timeline Settings Alert clicks to Core alerts instead of the remembered tab', () => {
        const settingsSource = readFileSync(resolve(process.cwd(), 'src/settings/SettingsTab.ts'), 'utf8');
        const controllerSource = readFileSync(resolve(process.cwd(), 'src/view/interactions/VersionIndicatorController.ts'), 'utf8');

        expect(settingsSource.includes('CORE_ALERTS_SECTION_KEY')).toBe(true);
        expect(settingsSource.includes('_hasExplicitTabRequest')).toBe(true);
        expect(settingsSource.includes('updateRenderedTabState')).toBe(true);
        expect(settingsSource.includes('this.updateRenderedTabState();')).toBe(true);
        expect(settingsSource.includes("[ERT_DATA.SECTION]: CORE_ALERTS_SECTION_KEY")).toBe(true);
        expect(controllerSource.includes("revealSettingsSection('core', CORE_ALERTS_SECTION_KEY)")).toBe(true);
        expect(controllerSource.includes('lastSettingsTab')).toBe(false);
    });
});
