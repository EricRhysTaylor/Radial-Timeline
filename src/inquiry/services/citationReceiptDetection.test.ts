import { describe, expect, it } from 'vitest';
import {
    detectCitationReceipt,
    describeCitationReceiptDetection,
    type DetectCitationReceiptArgs
} from './citationReceiptDetection';

function args(overrides: Partial<DetectCitationReceiptArgs> = {}): DetectCitationReceiptArgs {
    return {
        citationsRequested: true,
        modelSupportsCitations: true,
        citationCount: 0,
        modelLabel: 'Claude Sonnet 4.6',
        ...overrides
    };
}

describe('detectCitationReceipt', () => {
    it('reports the missing case when citations were requested, supported, but none came back', () => {
        const result = detectCitationReceipt(args());
        expect(result.kind).toBe('citations_requested_but_missing');
        if (result.kind === 'citations_requested_but_missing') {
            expect(result.modelLabel).toBe('Claude Sonnet 4.6');
        }
    });

    it('returns citations_disabled when the toggle is off — no warning regardless of count', () => {
        expect(detectCitationReceipt(args({ citationsRequested: false })).kind)
            .toBe('citations_disabled');
        expect(detectCitationReceipt(args({ citationsRequested: false, citationCount: 5 })).kind)
            .toBe('citations_disabled');
    });

    it('returns model_does_not_support_citations when the active model lacks the capability', () => {
        expect(detectCitationReceipt(args({ modelSupportsCitations: false })).kind)
            .toBe('model_does_not_support_citations');
    });

    it('returns the success outcome with count when at least one citation came back', () => {
        const result = detectCitationReceipt(args({ citationCount: 3 }));
        expect(result.kind).toBe('citations_received_as_expected');
        if (result.kind === 'citations_received_as_expected') {
            expect(result.count).toBe(3);
        }
    });

    it('treats citations_disabled as more important than model capability — quiet wins', () => {
        // Both off and unsupported should not produce a warning. The order of
        // checks should not matter for the user-visible outcome (no notice).
        const offAndUnsupported = detectCitationReceipt(args({
            citationsRequested: false,
            modelSupportsCitations: false
        }));
        expect(describeCitationReceiptDetection(offAndUnsupported)).toBeNull();
    });
});

describe('describeCitationReceiptDetection', () => {
    it('returns null for every non-warning outcome', () => {
        expect(describeCitationReceiptDetection({ kind: 'citations_disabled' })).toBeNull();
        expect(describeCitationReceiptDetection({ kind: 'model_does_not_support_citations' })).toBeNull();
        expect(describeCitationReceiptDetection({ kind: 'citations_received_as_expected', count: 5 })).toBeNull();
    });

    it('builds a message that names the model so the user knows where the gap is', () => {
        const message = describeCitationReceiptDetection({
            kind: 'citations_requested_but_missing',
            modelLabel: 'Claude Sonnet 4.6'
        });
        expect(message).toContain('Claude Sonnet 4.6');
        expect(message).toContain('zero anchors');
    });
});
