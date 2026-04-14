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

    it('buildTokenEstimate throws on failure instead of falling back to heuristic', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/runner/InquiryRunnerService.ts'), 'utf8');
        // Per RT Engineering Doctrine: "Fail clearly instead of falling back."
        // buildTokenEstimate must NOT have try/catch around prepareInquiryRunEstimate.
        // If the estimate fails, the error propagates to the service layer which
        // returns null — the UI shows "Estimate unavailable", never fabricated numbers.
        const buildTokenEstimateBlock = source.slice(
            source.indexOf('private async buildTokenEstimate('),
            source.indexOf('private getOutputTokenCap(')
        );
        expect(buildTokenEstimateBlock).toBeTruthy();
        // Must call prepareInquiryRunEstimate without try/catch wrapping
        expect(buildTokenEstimateBlock).toContain('prepareInquiryRunEstimate');
        // Must NOT contain heuristic fallback via estimateTokensFromChars
        expect(buildTokenEstimateBlock).not.toContain('estimateTokensFromChars');
        // Must throw when prepared is null
        expect(buildTokenEstimateBlock).toContain("throw new Error('Token estimate unavailable");
    });

    it('buildTokenEstimate reads all fields from prepared estimate without defaults', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/inquiry/runner/InquiryRunnerService.ts'), 'utf8');
        // Per RT Engineering Doctrine: "No fabricated numbers."
        // Token estimate fields must come directly from the prepared estimate —
        // no ?? 0, no ?? 'heuristic_chars', no substitute values.
        const buildTokenEstimateBlock = source.slice(
            source.indexOf('private async buildTokenEstimate('),
            source.indexOf('private getOutputTokenCap(')
        );
        expect(buildTokenEstimateBlock).toBeTruthy();
        // All fields sourced from prepared.*
        expect(buildTokenEstimateBlock).toContain('prepared.tokenEstimateInput');
        expect(buildTokenEstimateBlock).toContain('prepared.tokenEstimateMethod');
        expect(buildTokenEstimateBlock).toContain('prepared.tokenEstimateUncertainty');
        expect(buildTokenEstimateBlock).toContain('prepared.effectiveInputCeiling');
        expect(buildTokenEstimateBlock).toContain('prepared.expectedPassCount');
        // No fabricated token defaults (string length ?? 0 guards are fine)
        expect(buildTokenEstimateBlock).not.toContain("?? 'heuristic_chars'");
        expect(buildTokenEstimateBlock).not.toContain('estimateTokensFromChars');
    });
});
