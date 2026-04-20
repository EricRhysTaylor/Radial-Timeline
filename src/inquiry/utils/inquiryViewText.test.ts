import { describe, expect, it } from 'vitest';
import {
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
                    role: 'target',
                    lens: 'Flow',
                    bullets: ['Target bullet']
                },
                {
                    headline: 'Supporting context issue',
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
        expect(content).toContain('## Context Findings');
        expect(content).toContain('### Supporting context issue');
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
});
