import { describe, expect, it } from 'vitest';
import {
    countSynopsisWords,
    extractSpendCapResetDate,
    formatApiErrorClassification,
    formatApiErrorReason,
    formatAuthorFacingErrorDetail,
    formatAuthorFacingErrorHero,
    formatPendingEditsSuccessMessage,
    formatPendingEditsTargetsTooltip,
    formatSessionOverrides,
    formatSessionProviderModel,
    formatSessionScope,
    formatTokenUsageVisibility,
    getDocumentStatusFields,
    getOrdinalSuffix,
    readFrontmatterWordCount,
    replaceInquiryReferenceTokens,
    renderInquiryBrief,
    resolveInquiryScopeIndicator,
    sanitizeDossierText,
    stripInquiryReferenceArtifacts
} from './inquiryViewText';
import type { InquiryBriefModel } from '../types/inquiryViewTypes';
import type { InquiryResult } from '../state';

describe('inquiryViewText', () => {
    it('splits rendered brief findings into target and context sections', () => {
        const brief: InquiryBriefModel = {
            questionTitle: 'Question',
            questionText: 'What is breaking?',
            scopeIndicator: 'Book B1',
            selectionMode: 'focused',
            roleValidation: 'ok',
            pills: [],
            flowSummary: 'Flow summary',
            depthSummary: 'Depth summary',
            findings: [
                {
                    headline: 'Primary scene issue',
                    sceneLabel: '24 Shail Grounded',
                    role: 'target',
                    lens: 'Flow',
                    bullets: ['Target bullet']
                },
                {
                    headline: 'Supporting context issue',
                    sceneLabel: '50 Long Road Up',
                    role: 'context',
                    lens: 'Depth',
                    bullets: ['Context bullet']
                }
            ],
            sources: [],
            sceneNotes: [],
            sceneReferences: [],
            pendingActions: [],
            logTitle: null
        };

        const content = renderInquiryBrief(brief);

        expect(content).toContain('## Target Findings');
        expect(content).toContain('### Primary scene issue');
        expect(content).toContain('Scene: 24 Shail Grounded');
        expect(content).toContain('## Context Findings');
        expect(content).toContain('### Supporting context issue');
        expect(content).toContain('Scene: 50 Long Road Up');
    });

    it('builds scope indicators from the canonical scopeLabel field', () => {
        const result: InquiryResult = {
            runId: 'run-1',
            scope: 'book',
            scopeLabel: 'B2',
            mode: 'flow',
            selectionMode: 'discover',
            roleValidation: 'ok',
            questionId: 'q-1',
            summary: 'Summary',
            verdict: {
                flow: 0.5,
                depth: 0.5
            },
            findings: []
        };

        expect(resolveInquiryScopeIndicator(result)).toBe('Book B2');
    });

    it('renders a focused-analysis warning when target roles are missing', () => {
        const brief: InquiryBriefModel = {
            questionTitle: 'Question',
            questionText: 'What is breaking?',
            scopeIndicator: 'Book B1',
            selectionMode: 'focused',
            roleValidation: 'missing-target-roles',
            pills: [],
            flowSummary: 'Flow summary',
            depthSummary: 'Depth summary',
            findings: [],
            sources: [],
            sceneNotes: [],
            sceneReferences: [],
            pendingActions: [],
            logTitle: null
        };

        const content = renderInquiryBrief(brief);
        expect(content).toContain('Incomplete Focused Analysis');
    });

    it('strips scene ref ids and markdown anchor links from rendered dossier text', () => {
        expect(stripInquiryReferenceArtifacts('Pressure spike [Jump](#^scene-jump) in (scn_5b3a3162).'))
            .toBe('Pressure spike Jump in.');
        expect(sanitizeDossierText('Scene 11: [[Brief#^scene-11|Open brief]] shows scn_da9872d7 clearly.'))
            .toBe('Open brief shows clearly.');
    });

    it('renders neither citation-integrity banner nor unverified section when a legacy brief has no integrity fields', () => {
        const brief: InquiryBriefModel = {
            questionTitle: 'Question',
            questionText: 'What is breaking?',
            scopeIndicator: 'Book B1',
            selectionMode: 'discover',
            roleValidation: 'ok',
            pills: [],
            flowSummary: 'Flow summary',
            depthSummary: 'Depth summary',
            findings: [],
            sources: [],
            sceneNotes: [],
            sceneReferences: [],
            pendingActions: [],
            logTitle: null
        };

        const content = renderInquiryBrief(brief);
        expect(content).not.toContain('Citation integrity warning');
        expect(content).not.toContain('Evidence compromised');
        expect(content).not.toContain('Unverified AI Citations');
    });

    it('renders the normal integrity warning banner (not the compromised one) when some findings were verified', () => {
        const brief: InquiryBriefModel = {
            questionTitle: 'Question',
            questionText: 'What is breaking?',
            scopeIndicator: 'Book B1',
            selectionMode: 'discover',
            roleValidation: 'ok',
            pills: [],
            flowSummary: 'Flow',
            depthSummary: 'Depth',
            findings: [
                { headline: 'Clean finding', role: 'target', lens: 'Flow', bullets: [] }
            ],
            sources: [],
            sceneNotes: [],
            sceneReferences: [],
            pendingActions: [],
            logTitle: null,
            citationIntegrityWarnings: [
                { stage: 'unresolved_ref', message: 'bad' }
            ],
            unverifiedFindings: [
                { headline: 'Ghost', bullets: [], lens: 'Flow', rawRefId: 'scn_deadbeef', warning: 'nope' }
            ]
        };

        const content = renderInquiryBrief(brief);
        expect(content).toContain('Citation integrity warning');
        expect(content).not.toContain('Evidence compromised');
        expect(content).toContain('Unverified AI Citations');
        expect(content).toContain('should not be trusted as evidence');
    });

    it('renders the "Evidence compromised" banner when the run has no verified findings and some unverified ones', () => {
        const brief: InquiryBriefModel = {
            questionTitle: 'Question',
            questionText: 'What is breaking?',
            scopeIndicator: 'Book B1',
            selectionMode: 'discover',
            roleValidation: 'ok',
            pills: [],
            flowSummary: 'Flow',
            depthSummary: 'Depth',
            findings: [],
            sources: [],
            sceneNotes: [],
            sceneReferences: [],
            pendingActions: [],
            logTitle: null,
            evidenceCompromised: true,
            citationIntegrityWarnings: [
                { stage: 'unresolved_ref', message: 'bad' }
            ],
            unverifiedFindings: [
                { headline: 'Ghost', bullets: [], lens: 'Flow', rawRefId: 'scn_deadbeef', warning: 'nope' }
            ]
        };

        const content = renderInquiryBrief(brief);
        expect(content).toContain('Evidence compromised');
        expect(content).toContain('not trustworthy');
        expect(content).toContain('Unverified AI Citations');
    });

    it('replaces canonical scene ids with readable scene labels before rendering', () => {
        const refs = new Map<string, string>([
            ['scn_70a8d14e', '16 Chae Ban hears about the Homo'],
            ['scn_9329bdc2', '17 Johnsonian'],
            ['s1', '1 Trisan Training'],
            ['s4', '4 Party'],
            ['s5', '5 Aftermath from Ravix Pool'],
            ['s6', '6 Therapist'],
            ['s23', '23 Shail Grounded'],
            ['s34', '34 Stage 3 Volcano']
        ]);

        expect(replaceInquiryReferenceTokens(
            'Revise Scenes 16 (scn_70a8d14e) and 17 (scn_9329bdc2) at this stage',
            refs
        )).toBe('Revise Scenes 16 Chae Ban hears about the Homo and 17 Johnsonian at this stage');
        expect(replaceInquiryReferenceTokens(
            'The jump to scn_9329bdc2 (Johnsonian) lands too abruptly.',
            refs
        )).toBe('The jump to 17 Johnsonian lands too abruptly.');
        expect(replaceInquiryReferenceTokens(
            'nothing in S1-S5 prepares the reader. S6 is the first scene where AEA feels personal.',
            refs
        )).toBe('nothing in 1 Trisan Training - 5 Aftermath from Ravix Pool prepares the reader. 6 Therapist is the first scene where AEA feels personal.');
        expect(replaceInquiryReferenceTokens(
            'Shail\'s hybrid nature must be implied here for S23/S34 revelation to read as payoff.',
            refs
        )).toBe('Shail\'s hybrid nature must be implied here for 23 Shail Grounded / 34 Stage 3 Volcano revelation to read as payoff.');
    });

    describe('getDocumentStatusFields', () => {
        it('reads scalar Status/Due strings and trims them', () => {
            expect(getDocumentStatusFields({ Status: '  Working ', Due: ' 2026-05-18 ' }))
                .toEqual({ statusRaw: 'Working', due: '2026-05-18' });
        });
        it('reads the first element of an array Status', () => {
            expect(getDocumentStatusFields({ Status: ['  Done ', 'Ignored'] }))
                .toEqual({ statusRaw: 'Done', due: undefined });
        });
        it('returns undefined for missing/empty/non-string fields', () => {
            expect(getDocumentStatusFields({})).toEqual({ statusRaw: undefined, due: undefined });
            expect(getDocumentStatusFields({ Status: '   ', Due: 42 }))
                .toEqual({ statusRaw: undefined, due: undefined });
        });
    });

    describe('countSynopsisWords', () => {
        it('counts whitespace/punctuation-separated words', () => {
            expect(countSynopsisWords('The quick brown fox')).toBe(4);
        });
        it('treats apostrophes and hyphens as intra-word', () => {
            expect(countSynopsisWords("Shail's hybrid mother-ship")).toBe(3);
        });
        it('returns 0 for empty or whitespace-only input', () => {
            expect(countSynopsisWords('')).toBe(0);
            expect(countSynopsisWords('   \n\t ')).toBe(0);
        });
    });

    describe('readFrontmatterWordCount', () => {
        it('reads a finite numeric Words field, rounded and clamped', () => {
            expect(readFrontmatterWordCount({ Words: 1234.6 })).toBe(1235);
            expect(readFrontmatterWordCount({ words: -5 })).toBe(0);
        });
        it('parses a comma-formatted string Words field', () => {
            expect(readFrontmatterWordCount({ Words: ' 12,345 ' })).toBe(12345);
        });
        it('returns null when absent or unparseable', () => {
            expect(readFrontmatterWordCount({})).toBeNull();
            expect(readFrontmatterWordCount({ Words: 'n/a' })).toBeNull();
        });
    });

    describe('getOrdinalSuffix', () => {
        it('uses th for the 11-13 teen exception', () => {
            expect(getOrdinalSuffix(11)).toBe('th');
            expect(getOrdinalSuffix(12)).toBe('th');
            expect(getOrdinalSuffix(13)).toBe('th');
            expect(getOrdinalSuffix(113)).toBe('th');
        });
        it('uses st/nd/rd for 1/2/3 and 21/22/23', () => {
            expect(getOrdinalSuffix(1)).toBe('st');
            expect(getOrdinalSuffix(2)).toBe('nd');
            expect(getOrdinalSuffix(3)).toBe('rd');
            expect(getOrdinalSuffix(21)).toBe('st');
            expect(getOrdinalSuffix(22)).toBe('nd');
            expect(getOrdinalSuffix(23)).toBe('rd');
        });
        it('uses th for other days', () => {
            expect(getOrdinalSuffix(4)).toBe('th');
            expect(getOrdinalSuffix(30)).toBe('th');
        });
    });

    const sessionWith = (result: Record<string, unknown>): InquiryResult & Record<string, unknown> =>
        result as unknown as InquiryResult & Record<string, unknown>;

    describe('formatPendingEdits messages', () => {
        it('handles empty and populated target label lists', () => {
            expect(formatPendingEditsTargetsTooltip([])).toBe('No pending edits');
            expect(formatPendingEditsTargetsTooltip(['A', 'B'])).toBe('Write to Pending Edits: A, B');
            expect(formatPendingEditsSuccessMessage(['Scene 1'])).toBe('Pending Edits updated for Scene 1.');
        });
    });

    describe('formatSessionScope', () => {
        it('labels saga vs book and trims missing focus', () => {
            expect(formatSessionScope({ result: sessionWith({ scope: 'saga', scopeLabel: 'My Saga' }) } as never))
                .toBe('Saga My Saga');
            expect(formatSessionScope({ result: sessionWith({ scope: 'book', scopeLabel: '' }) } as never))
                .toBe('Book');
        });
    });

    describe('formatSessionOverrides', () => {
        it('returns null when overrides inactive', () => {
            expect(formatSessionOverrides({ result: sessionWith({ corpusOverridesActive: false }) } as never)).toBeNull();
        });
        it('summarizes class/item counts when present', () => {
            expect(formatSessionOverrides({ result: sessionWith({
                corpusOverridesActive: true,
                corpusOverrideSummary: { classCount: 2, itemCount: 5 }
            }) } as never)).toBe('Overrides 2c/5i');
            expect(formatSessionOverrides({ result: sessionWith({ corpusOverridesActive: true }) } as never))
                .toBe('Overrides on');
        });
    });

    describe('formatSessionProviderModel', () => {
        it('reports Engine unknown when no model is resolved or requested', () => {
            expect(formatSessionProviderModel({ result: sessionWith({}) } as never)).toBe('Engine unknown');
        });
    });

    const resultWith = (r: Record<string, unknown>): InquiryResult =>
        r as unknown as InquiryResult;

    describe('formatTokenUsageVisibility', () => {
        it('returns unknown when usage is not known', () => {
            expect(formatTokenUsageVisibility(false)).toBe('unknown');
            expect(formatTokenUsageVisibility(false, 'full')).toBe('unknown');
        });
        it('maps each known scope', () => {
            expect(formatTokenUsageVisibility(true, 'full')).toBe('full multi-pass');
            expect(formatTokenUsageVisibility(true, 'partial')).toBe('partial multi-pass');
            expect(formatTokenUsageVisibility(true, 'synthesis_only')).toBe('synthesis-only');
            expect(formatTokenUsageVisibility(true)).toBe('known');
        });
    });

    describe('formatApiErrorClassification', () => {
        it('formats status with and without a reason', () => {
            expect(formatApiErrorClassification(resultWith({ aiStatus: 'rejected', aiReason: 'spend_cap' })))
                .toBe('rejected (spend_cap)');
            expect(formatApiErrorClassification(resultWith({ aiStatus: 'timeout' }))).toBe('timeout');
            expect(formatApiErrorClassification(resultWith({}))).toBe('unknown');
        });
        it('appends execution + usage bits when present', () => {
            expect(formatApiErrorClassification(resultWith({
                aiStatus: 'rejected',
                aiReason: 'multi_pass_failed',
                executionState: 'failed',
                executionPath: 'segmented',
                failureStage: 'synthesis',
                tokenUsageKnown: true,
                tokenUsageScope: 'partial'
            }))).toBe('rejected (multi_pass_failed) [state=failed, path=segmented, stage=synthesis, usage=partial multi-pass]');
        });
    });

    describe('formatApiErrorReason', () => {
        it('appends aiErrorDetail on a new line when present', () => {
            expect(formatApiErrorReason(resultWith({ aiStatus: 'auth', aiErrorDetail: 'bad key' })))
                .toBe('auth\nbad key');
        });
        it('returns just the classification when no detail', () => {
            expect(formatApiErrorReason(resultWith({ aiStatus: 'auth' }))).toBe('auth');
        });
    });

    describe('formatAuthorFacingErrorHero', () => {
        it('maps rejected reasons to author-facing copy', () => {
            const hero = (aiStatus: string, aiReason?: string) =>
                formatAuthorFacingErrorHero(resultWith({ aiStatus, aiReason }));
            expect(hero('rejected', 'spend_cap')).toBe('Monthly spend cap reached.');
            expect(hero('rejected', 'quota_exceeded')).toBe('OpenAI API quota exceeded.');
            expect(hero('rejected', 'invalid_response')).toBe('Briefing received with errors.');
            expect(hero('rejected', 'citation_binding_failed')).toBe('AI response could not be matched to this corpus.');
            expect(hero('rejected', 'multi_pass_failed')).toBe('Multi-pass analysis could not complete.');
            expect(hero('rejected', 'unsupported_param')).toBe('Request rejected by provider.');
            expect(hero('rejected')).toBe('Request rejected by provider.');
            expect(hero('auth')).toBe('Authentication failed.');
            expect(hero('timeout')).toBe('Request timed out.');
            expect(hero('rate_limit')).toBe('Rate limit reached. Try again shortly.');
            expect(hero('unavailable')).toBe('Provider unavailable.');
            expect(hero('something-else')).toBe('Inquiry could not complete.');
        });
    });

    describe('extractSpendCapResetDate', () => {
        it('returns null for missing or non-matching detail', () => {
            expect(extractSpendCapResetDate(null)).toBeNull();
            expect(extractSpendCapResetDate('')).toBeNull();
            expect(extractSpendCapResetDate('no date here')).toBeNull();
        });
        it('extracts a bare date and a date+time UTC', () => {
            expect(extractSpendCapResetDate('Resets on 2026-06-01.')).toBe('2026-06-01');
            expect(extractSpendCapResetDate('on 2026-06-01 at 00:00 UTC')).toBe('2026-06-01 00:00 UTC');
        });
    });

    describe('formatAuthorFacingErrorDetail', () => {
        it('explains the spend cap with and without a reset line', () => {
            const withReset = formatAuthorFacingErrorDetail(resultWith({
                aiReason: 'spend_cap', aiErrorDetail: 'on 2026-06-01 at 00:00 UTC'
            }));
            expect(withReset).toContain('Anthropic Console');
            expect(withReset).toContain('Resets 2026-06-01 00:00 UTC.');
            const noReset = formatAuthorFacingErrorDetail(resultWith({ aiReason: 'spend_cap' }));
            expect(noReset).toContain('Anthropic Console');
            expect(noReset).not.toContain('Resets');
        });
        it('covers quota, passthrough, citation, invalid, and empty default', () => {
            expect(formatAuthorFacingErrorDetail(resultWith({ aiReason: 'quota_exceeded' })))
                .toContain('OpenAI API account');
            expect(formatAuthorFacingErrorDetail(resultWith({ aiErrorDetail: 'raw detail' })))
                .toBe('raw detail');
            expect(formatAuthorFacingErrorDetail(resultWith({ aiReason: 'citation_binding_failed' })))
                .toBe('No findings could be placed on the minimap.');
            expect(formatAuthorFacingErrorDetail(resultWith({ aiReason: 'invalid_response' })))
                .toBe('Invalid structured response from AI.');
            expect(formatAuthorFacingErrorDetail(resultWith({}))).toBe('');
        });
    });
});
