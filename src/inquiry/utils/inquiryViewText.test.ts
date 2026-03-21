import { describe, expect, it } from 'vitest';
import { renderInquiryBrief, resolveInquiryScopeIndicator } from './inquiryViewText';
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
                    clarity: 'Unclear',
                    impact: 'High',
                    confidence: 'High',
                    lens: 'Flow',
                    bullets: ['Target bullet']
                },
                {
                    headline: 'Supporting context issue',
                    role: 'context',
                    clarity: 'Introduced',
                    impact: 'Medium',
                    confidence: 'Medium',
                    lens: 'Depth',
                    bullets: ['Context bullet']
                }
            ],
            sources: [],
            sceneNotes: [],
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
                depth: 0.5,
                impact: 'low',
                assessmentConfidence: 'low'
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
            pendingActions: [],
            logTitle: null
        };

        const content = renderInquiryBrief(brief);
        expect(content).toContain('Incomplete Focused Analysis');
    });
});
