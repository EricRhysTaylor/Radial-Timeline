import { describe, expect, it } from 'vitest';
import {
    appendInquiryNotesToPendingEdits,
    purgeInquiryNotesFromPendingEdits,
    validatePendingEditsValue,
} from './pendingEditsSafety';

describe('pendingEditsSafety', () => {
    it('refuses malformed non-string structures', () => {
        const result = validatePendingEditsValue({ notes: 'bad' });
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('not stored as text');
    });

    it('refuses non-string array entries', () => {
        const result = validatePendingEditsValue(['safe', 42]);
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('non-string list value');
    });

    it('refuses malformed inquiry markers', () => {
        const result = appendInquiryNotesToPendingEdits(
            'Keep this\n[[Inquiry Brief — Test]] broken tail',
            'Inquiry Brief — New',
            ['[[Inquiry Brief — New]] — Add this'],
            5
        );
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('malformed Inquiry lines');
    });

    it('refuses duplicate inquiry markers', () => {
        const result = appendInquiryNotesToPendingEdits(
            '[[Inquiry Brief — Test]] — One\n[[Inquiry Brief — Test]] — Two',
            'Inquiry Brief — New',
            ['[[Inquiry Brief — New]] — Add this'],
            5
        );
        expect(result.ok).toBe(false);
        expect(result.reason).toContain('duplicate Inquiry markers');
    });

    it('appends a valid inquiry note', () => {
        const result = appendInquiryNotesToPendingEdits(
            'Existing line',
            'Inquiry Brief — New',
            ['[[Inquiry Brief — New]] — Add this'],
            5
        );
        expect(result.ok).toBe(true);
        expect(result.outcome).toBe('written');
        expect(result.value).toContain('Existing line');
        expect(result.value).toContain('[[Inquiry Brief — New]] — Add this');
    });

    it('purges only RT-owned inquiry lines', () => {
        const result = purgeInquiryNotesFromPendingEdits(
            'Keep this\n[[Inquiry Brief — Test]] — Remove this'
        );
        expect(result.ok).toBe(true);
        expect(result.outcome).toBe('written');
        expect(result.value).toBe('Keep this');
    });
});
