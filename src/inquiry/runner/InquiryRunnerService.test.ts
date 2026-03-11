import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('InquiryRunnerService packaging integrity', () => {
    it('uses scene ids for inquiry evidence citation references', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/runner/InquiryRunnerService.ts'), 'utf8');
        expect(source.includes('"ref_id": "scn_a1b2c3d4"')).toBe(true);
        expect(source.includes('Use scene ref_id values from evidence labels in parentheses')).toBe(true);
        expect(source.includes('(${scene.sceneId})')).toBe(true);
    });

    it('readFileContent delegates stripping to cleanEvidenceBody', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/runner/InquiryRunnerService.ts'), 'utf8');
        expect(source).toContain('cleanEvidenceBody(raw)');
        expect(source).toContain("from '../utils/evidenceCleaning'");
    });

    it('segmented mode forces multi-pass even when content fits (forced-split contract)', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/runner/InquiryRunnerService.ts'), 'utf8');
        // The segmented check must appear BEFORE the exceedsSafeBudget check,
        // using OR logic so it enters the multi-pass path regardless of size.
        expect(source).toContain("analysisPackaging === 'segmented'");
        // getAnalysisPackaging must return 'segmented' when that's the setting
        expect(source).toContain("pkg === 'segmented' ? 'segmented'");
    });

    it('threads userQuestion into trace token estimates so Anthropic document-block estimates include evidence', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/runner/InquiryRunnerService.ts'), 'utf8');
        expect(source).toMatch(/this\.buildTokenEstimate\([\s\S]*this\.getJsonSchema\(\),[\s\S]*input\.questionText/);
        expect(source).toMatch(/this\.buildTokenEstimate\([\s\S]*this\.getOmnibusJsonSchema\(\),[\s\S]*input\.questions\.map\(question => question\.question\)\.join\('\\n'\)/);
        expect(source).toMatch(/this\.prepareInquiryRunEstimate\([\s\S]*userQuestion,[\s\S]*ai,/);
    });
});
