import { describe, expect, it } from 'vitest';
import { buildInquiryPromptParts, buildInquiryPromptScaffold, INQUIRY_ROLE_TEMPLATE_GUARDRAIL } from './promptScaffold';

describe('buildInquiryPromptParts', () => {
    it('recombines into the canonical inquiry scaffold and isolates the schema block', () => {
        const parts = buildInquiryPromptParts('Evidence body');
        const scaffold = buildInquiryPromptScaffold('Evidence body');

        expect(parts.userPrompt).toBe(scaffold.userPrompt);
        expect(parts.schemaText.includes('"schema_version"')).toBe(true);
        expect(parts.instructionText.includes('Answer the editorial question using the evidence.')).toBe(true);
        expect(INQUIRY_ROLE_TEMPLATE_GUARDRAIL.includes('role template')).toBe(true);
    });
});
