import { describe, expect, it } from 'vitest';
import { buildUnifiedBeatAnalysisPrompt, buildUnifiedBeatAnalysisPromptParts } from './unifiedBeatAnalysis';

describe('buildUnifiedBeatAnalysisPromptParts', () => {
    it('recombines into the canonical unified beat prompt', () => {
        const beats = [
            { beatName: 'Opening Image', beatNumber: 1, idealRange: '0-10' },
            { beatName: 'Catalyst', beatNumber: 2, idealRange: '10-20' }
        ];
        const parts = buildUnifiedBeatAnalysisPromptParts('Scene body', beats, 'Save The Cat');

        expect(parts.prompt).toBe(buildUnifiedBeatAnalysisPrompt('Scene body', beats, 'Save The Cat'));
        expect(parts.transformText.includes('Story beats:')).toBe(true);
        expect(parts.instructionText.includes('Respond strictly in the provided JSON schema')).toBe(true);
    });

    it('falls back to `N. Name` when placement is absent', () => {
        const beats = [
            { beatName: 'Opening Image', beatNumber: 1, idealRange: '0-10' }
        ];
        const { transformText } = buildUnifiedBeatAnalysisPromptParts('Scene body', beats, 'Save The Cat');
        expect(transformText).toContain('1. Opening Image');
        expect(transformText).not.toContain('[');
        expect(transformText).not.toContain(' — ');
    });

    it('uses placement-only prefix (no duplicated ordinal) when placement is provided', () => {
        const beats = [
            {
                beatName: 'Opening Image',
                beatNumber: 1,
                idealRange: '0-10',
                placement: '1.01',
                description: 'Mrs Bennet pushes for a wealthy suitor.'
            }
        ];
        const { transformText } = buildUnifiedBeatAnalysisPromptParts('Scene body', beats, 'Save The Cat');
        expect(transformText).toContain('[1.01] Opening Image — Mrs Bennet pushes for a wealthy suitor.');
        expect(transformText).not.toContain('1. [1.01]');
    });

    it('does not send idealRange to the AI (anchoring guard)', () => {
        const beats = [
            { beatName: 'Midpoint', beatNumber: 1, idealRange: '40-60' }
        ];
        const { prompt } = buildUnifiedBeatAnalysisPromptParts('Scene body', beats, 'Save The Cat');
        expect(prompt).not.toContain('40-60');
        expect(prompt).not.toContain('idealRange');
    });
});
