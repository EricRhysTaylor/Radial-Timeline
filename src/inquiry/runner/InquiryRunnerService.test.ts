import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('InquiryRunnerService execution integrity', () => {
    it('uses scene ids for inquiry evidence citation references', () => {
        const runnerSource = readFileSync(resolve(process.cwd(), 'src/inquiry/runner/InquiryRunnerService.ts'), 'utf8');
        const scaffoldSource = readFileSync(resolve(process.cwd(), 'src/inquiry/promptScaffold.ts'), 'utf8');
        expect(runnerSource.includes('"ref_id": "scn_a1b2c3d4"')).toBe(true);
        expect(scaffoldSource.includes('Use scene ref_id values from evidence labels in parentheses')).toBe(true);
        expect(runnerSource.includes('(${scene.sceneId})')).toBe(true);
    });

    it('readFileContent delegates stripping to cleanEvidenceBody', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/runner/InquiryRunnerService.ts'), 'utf8');
        expect(source).toContain('cleanEvidenceBody(raw)');
        expect(source).toContain("from '../utils/evidenceCleaning'");
    });

    it('threads userQuestion into trace token estimates so Anthropic document-block estimates include evidence', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/runner/InquiryRunnerService.ts'), 'utf8');
        expect(source).toMatch(/this\.buildTokenEstimate\([\s\S]*this\.getJsonSchema\(\),[\s\S]*input\.questionText/);
        expect(source).toMatch(/this\.buildTokenEstimate\([\s\S]*this\.getOmnibusJsonSchema\(\),[\s\S]*input\.questions\.map\(question => question\.questionText\)\.join\('\\n'\)/);
        expect(source).toMatch(/this\.prepareInquiryRunEstimate\([\s\S]*userQuestion,[\s\S]*ai,/);
    });

    it('uses planning-budget wording for single-pass rejection while preserving legacy detection', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/runner/InquiryRunnerService.ts'), 'utf8');
        expect(source).toContain('This request exceeds the single-pass planning budget.');
        expect(source).toContain("normalized.includes('single-pass planning budget')");
        expect(source).toContain("normalized.includes('safe limit for a single pass')");
    });

    it('wraps prepareInquiryRunEstimate in try/catch so token estimate falls back on failure', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/runner/InquiryRunnerService.ts'), 'utf8');
        // The buildTokenEstimate method must catch errors from prepareInquiryRunEstimate
        // so that AI client failures (registry, network, model selection) degrade to
        // heuristic estimation instead of killing the estimate snapshot.
        const buildTokenEstimateBlock = source.slice(
            source.indexOf('private async buildTokenEstimate('),
            source.indexOf('private getOutputTokenCap(')
        );
        expect(buildTokenEstimateBlock).toBeTruthy();
        // Must have try/catch around prepareInquiryRunEstimate
        expect(buildTokenEstimateBlock).toContain('try {');
        expect(buildTokenEstimateBlock).toContain('prepareInquiryRunEstimate');
        expect(buildTokenEstimateBlock).toContain('} catch');
        // Must fall back to heuristic on failure
        expect(buildTokenEstimateBlock).toContain('estimateTokensFromChars');
    });
});
