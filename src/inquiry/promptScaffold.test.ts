import { describe, expect, it } from 'vitest';
import { buildInquiryPromptParts, buildInquiryPromptScaffold, INQUIRY_ROLE_TEMPLATE_GUARDRAIL } from './promptScaffold';

describe('buildInquiryPromptParts', () => {
    it('recombines into the canonical inquiry scaffold and isolates the schema block', () => {
        const input = {
            task: 'Assess setup coherence.',
            lens: 'flow' as const,
            selectionMode: 'focused' as const,
            targetSceneIds: ['scn_target_01'],
            corpusManifestLines: ['scn_target_01 | class=scene | mode=full | isTarget=true'],
            evidenceText: 'Evidence body'
        };
        const parts = buildInquiryPromptParts(input);
        const scaffold = buildInquiryPromptScaffold(input);

        expect(parts.userPrompt).toBe(scaffold.userPrompt);
        expect(parts.schemaText.includes('"schema_version"')).toBe(true);
        expect(parts.instructionText.includes('Answer the editorial question using the evidence.')).toBe(true);
        expect(parts.userPrompt.includes('SELECTION MODE:\nfocused')).toBe(true);
        expect(parts.userPrompt.includes('TARGET SCENES:\n- scn_target_01')).toBe(true);
        expect(INQUIRY_ROLE_TEMPLATE_GUARDRAIL.includes('role template')).toBe(true);
    });
});
