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
        expect(parts.instructionText.includes('Respond strictly in the JSON schema')).toBe(true);
    });
});
