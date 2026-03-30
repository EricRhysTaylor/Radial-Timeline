import { describe, expect, it } from 'vitest';
import type { TFile } from 'obsidian';
import { parseAuditAiResponse, runTimelineAuditFromInputs } from './AuditPipeline';
import type { TimelineAuditSceneInput } from './types';

function makeFile(path: string): TFile {
    const basename = path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
    return { path, basename } as TFile;
}

function makeInput(params: Partial<TimelineAuditSceneInput> & { path: string; manuscriptOrderIndex: number }): TimelineAuditSceneInput {
    const rawWhen = params.rawWhen ?? null;
    const parsedWhen = params.parsedWhen ?? (rawWhen ? new Date(rawWhen.replace(' ', 'T')) : null);
    return {
        file: params.file ?? makeFile(params.path),
        sceneId: params.sceneId ?? params.path,
        title: params.title ?? params.path.split('/').pop()?.replace(/\.md$/i, '') ?? params.path,
        path: params.path,
        manuscriptOrderIndex: params.manuscriptOrderIndex,
        rawWhen,
        parsedWhen,
        whenValid: params.whenValid ?? Boolean(parsedWhen),
        whenParseIssue: params.whenParseIssue ?? (rawWhen === null ? 'missing_when' : parsedWhen ? null : 'invalid_when'),
        whenSource: params.whenSource,
        whenConfidence: params.whenConfidence,
        summary: params.summary ?? '',
        synopsis: params.synopsis ?? '',
        bodyExcerpt: params.bodyExcerpt ?? ''
    };
}

describe('timeline audit pipeline', () => {
    it('flags missing and invalid When values as first-class issues', async () => {
        const result = await runTimelineAuditFromInputs([
            makeInput({ path: 'Story/1 Missing.md', manuscriptOrderIndex: 0, rawWhen: null, parsedWhen: null, whenValid: false, whenParseIssue: 'missing_when' }),
            makeInput({ path: 'Story/2 Invalid.md', manuscriptOrderIndex: 1, rawWhen: 'not-a-date', parsedWhen: null, whenValid: false, whenParseIssue: 'invalid_when' })
        ], {
            runDeterministicPass: true,
            runContinuityPass: false,
            runAiInference: false
        });

        expect(result.findings[0].issues.some((issue) => issue.type === 'missing_when')).toBe(true);
        expect(result.findings[1].issues.some((issue) => issue.type === 'invalid_when')).toBe(true);
    });

    it('detects direct body vs YAML time-of-day conflict and offers a safe suggestion', async () => {
        const result = await runTimelineAuditFromInputs([
            makeInput({
                path: 'Story/1 Evening Conflict.md',
                manuscriptOrderIndex: 0,
                rawWhen: '2026-01-01 08:00',
                bodyExcerpt: 'By evening the house was silent.'
            })
        ], {
            runDeterministicPass: true,
            runContinuityPass: false,
            runAiInference: false
        });

        const finding = result.findings[0];
        expect(finding.issues.some((issue) => issue.type === 'time_of_day_conflict')).toBe(true);
        expect(finding.suggestedWhen).not.toBeNull();
        expect(finding.safeApplyEligible).toBe(true);
    });

    it('detects relative-order conflict for "next morning" against the previous chronology neighbor', async () => {
        const result = await runTimelineAuditFromInputs([
            makeInput({
                path: 'Story/1 Prior.md',
                manuscriptOrderIndex: 0,
                rawWhen: '2026-01-01 08:00',
                bodyExcerpt: 'They leave town.'
            }),
            makeInput({
                path: 'Story/2 Next Morning.md',
                manuscriptOrderIndex: 1,
                rawWhen: '2026-01-01 09:00',
                bodyExcerpt: 'The next morning, she returned to the station.'
            })
        ], {
            runDeterministicPass: true,
            runContinuityPass: true,
            runAiInference: false
        });

        const finding = result.findings.find((entry) => entry.path.endsWith('Next Morning.md'));
        expect(finding?.issues.some((issue) => issue.type === 'relative_order_conflict' || issue.type === 'impossible_sequence')).toBe(true);
    });

    it('treats large chronology jumps as suspicious when not justified', async () => {
        const result = await runTimelineAuditFromInputs([
            makeInput({ path: 'Story/1 Early.md', manuscriptOrderIndex: 0, rawWhen: '2026-01-01 08:00', bodyExcerpt: 'Breakfast on the road.' }),
            makeInput({ path: 'Story/2 Jump.md', manuscriptOrderIndex: 1, rawWhen: '2026-01-10 08:00', bodyExcerpt: 'She opens the same notebook.' }),
            makeInput({ path: 'Story/3 Later.md', manuscriptOrderIndex: 2, rawWhen: '2026-01-11 08:00', bodyExcerpt: 'Another breakfast.' })
        ], {
            runDeterministicPass: true,
            runContinuityPass: true,
            runAiInference: false
        });

        const finding = result.findings.find((entry) => entry.path.endsWith('Jump.md'));
        expect(finding?.issues.some((issue) => issue.type === 'continuity_conflict')).toBe(true);
    });

    it('does not flag a large jump when the manuscript explicitly justifies it', async () => {
        const result = await runTimelineAuditFromInputs([
            makeInput({ path: 'Story/1 Early.md', manuscriptOrderIndex: 0, rawWhen: '2026-01-01 08:00', bodyExcerpt: 'Breakfast on the road.' }),
            makeInput({ path: 'Story/2 Jump.md', manuscriptOrderIndex: 1, rawWhen: '2026-01-08 08:00', bodyExcerpt: 'The following week, she came back with witnesses.' })
        ], {
            runDeterministicPass: true,
            runContinuityPass: true,
            runAiInference: false
        });

        const finding = result.findings.find((entry) => entry.path.endsWith('Jump.md'));
        expect(finding?.issues.some((issue) => issue.type === 'continuity_conflict')).toBe(false);
    });

    it('flags summary and body disagreement', async () => {
        const result = await runTimelineAuditFromInputs([
            makeInput({
                path: 'Story/1 Disagree.md',
                manuscriptOrderIndex: 0,
                rawWhen: '2026-01-01 08:00',
                summary: 'That evening they meet in the square.',
                bodyExcerpt: 'In the morning fog, he arrives alone.'
            })
        ], {
            runDeterministicPass: true,
            runContinuityPass: false,
            runAiInference: false
        });

        expect(result.findings[0].issues.some((issue) => issue.type === 'summary_body_disagree')).toBe(true);
    });

    it('keeps ambiguous cues as warnings without enabling safe apply', async () => {
        const result = await runTimelineAuditFromInputs([
            makeInput({
                path: 'Story/1 Ambiguous.md',
                manuscriptOrderIndex: 0,
                rawWhen: '2026-01-01 08:00',
                bodyExcerpt: 'Later, the carriage finally arrives.'
            })
        ], {
            runDeterministicPass: true,
            runContinuityPass: false,
            runAiInference: false
        });

        const finding = result.findings[0];
        expect(finding.issues.some((issue) => issue.type === 'ambiguous_time_signal')).toBe(true);
        expect(finding.safeApplyEligible).toBe(false);
    });

    it('validates AI response parsing conservatively', () => {
        expect(parseAuditAiResponse('not json')).toBeNull();
        expect(parseAuditAiResponse('{"rationale":"Mixed signals","evidenceQuotes":["later that night"],"evidenceTier":"ambiguous"}')?.evidenceTier).toBe('ambiguous');
    });
});
