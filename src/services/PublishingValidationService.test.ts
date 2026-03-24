import { describe, expect, it } from 'vitest';
import { describeMatterReadiness } from './PublishingValidationService';

describe('PublishingValidationService matter readiness', () => {
    it('marks semantic copyright matter as ready when BookMeta is available', () => {
        const result = describeMatterReadiness({
            role: 'copyright',
            usesBookMeta: true,
            bookMetaAvailable: true
        });

        expect(result.label).toBe('Ready');
        expect(result.tone).toBe('success');
    });

    it('marks legacy matter roles as fallback rendering', () => {
        const result = describeMatterReadiness({
            role: 'epigraph',
            usesBookMeta: true,
            bookMetaAvailable: true
        });

        expect(result.label).toBe('Fallback rendering');
        expect(result.tone).toBe('warning');
    });

    it('marks missing BookMeta as missing metadata', () => {
        const result = describeMatterReadiness({
            role: 'copyright',
            usesBookMeta: true,
            bookMetaAvailable: false
        });

        expect(result.label).toBe('Missing metadata');
        expect(result.tone).toBe('error');
    });
});
