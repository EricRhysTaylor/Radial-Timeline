import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Local LLM contract cleanup', () => {
    it('removes loose local settings reads from scene analysis and AI settings UI', () => {
        const processor = readFileSync(new URL('./Processor.ts', import.meta.url), 'utf8');
        const service = readFileSync(new URL('../services/SceneAnalysisService.ts', import.meta.url), 'utf8');
        const aiSection = readFileSync(new URL('../settings/sections/AiSection.ts', import.meta.url), 'utf8');

        expect(processor.includes('localLlmInstructions')).toBe(false);
        expect(processor.includes('localSendPulseToAiReport')).toBe(false);
        expect(service.includes('localSendPulseToAiReport')).toBe(false);
        expect(aiSection.includes('localLlmInstructions')).toBe(false);
        expect(aiSection.includes('localSendPulseToAiReport')).toBe(false);
        expect(aiSection.includes('aiSettings.localLlm')).toBe(true);
    });
});
