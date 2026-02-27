import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { computeCanonicalOrder, getBaseKeys, getExcludeKeyPredicate } from './yamlTemplateNormalize';

describe('yamlTemplateNormalize', () => {
    it('enforces Pulse Update and Summary Update as required base Scene keys', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            sceneYamlTemplates: {
                base: 'Class: Scene\nAct: {{Act}}\nWhen: {{When}}',
                advanced: ''
            }
        };

        const keys = getBaseKeys('Scene', settings);
        expect(keys).toContain('Pulse Update');
        expect(keys).toContain('Summary Update');
    });

    it('does not exclude deprecated Pulse Last Updated fields from Scene extra-key audits', () => {
        const isExcluded = getExcludeKeyPredicate('Scene');
        expect(isExcluded('Pulse Last Updated')).toBe(false);
        expect(isExcluded('Beats Last Updated')).toBe(false);
        expect(isExcluded('id')).toBe(true);
    });

    it('keeps reference ID first in canonical order', () => {
        const order = computeCanonicalOrder('Scene', DEFAULT_SETTINGS);
        expect(order[0]).toBe('ID');
    });

    it('does not exclude scene triplet analysis fields when AI is disabled', () => {
        const isExcluded = getExcludeKeyPredicate('Scene', { enableAiSceneAnalysis: false });
        expect(isExcluded('previousSceneAnalysis')).toBe(false);
        expect(isExcluded('currentSceneAnalysis')).toBe(false);
        expect(isExcluded('nextSceneAnalysis')).toBe(false);
    });
});
