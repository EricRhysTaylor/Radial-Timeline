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
});
