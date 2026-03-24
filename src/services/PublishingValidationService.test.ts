import { describe, expect, it } from 'vitest';
import {
    buildBookDetailsChecklist,
    buildBookPagesChecklist,
    describeMatterReadiness
} from './PublishingValidationService';

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

    it('marks legacy matter roles as using page content', () => {
        const result = describeMatterReadiness({
            role: 'epigraph',
            usesBookMeta: true,
            bookMetaAvailable: true
        });

        expect(result.label).toBe('Uses page content');
        expect(result.tone).toBe('success');
    });

    it('marks missing BookMeta as needing metadata', () => {
        const result = describeMatterReadiness({
            role: 'copyright',
            usesBookMeta: true,
            bookMetaAvailable: false
        });

        expect(result.label).toBe('Needs metadata');
        expect(result.tone).toBe('error');
    });

    it('marks unsupported roles as excluded by layout', () => {
        const result = describeMatterReadiness({
            role: 'appendix',
            usesBookMeta: false,
            bookMetaAvailable: true,
            issueCodes: ['matter_role_unsupported']
        });

        expect(result.label).toBe('Excluded by layout');
        expect(result.tone).toBe('warning');
    });

    it('treats Role: other as a valid custom page', () => {
        const result = describeMatterReadiness({
            role: 'other',
            usesBookMeta: false,
            bookMetaAvailable: true
        });

        expect(result.label).toBe('Custom page');
        expect(result.tone).toBe('success');
    });
});

describe('PublishingValidationService checklists', () => {
    it('summarizes missing Book Details fields', () => {
        const checklist = buildBookDetailsChecklist(null);

        expect(checklist.find(item => item.key === 'title')?.state).toBe('Needs setup');
        expect(checklist.find(item => item.key === 'author')?.state).toBe('Needs setup');
        expect(checklist.find(item => item.key === 'copyright-holder')?.state).toBe('Needs setup');
    });

    it('marks completed Book Details fields as ready', () => {
        const checklist = buildBookDetailsChecklist({
            title: 'Example Title',
            author: 'Example Author',
            rights: {
                copyright_holder: 'Example Author',
                year: 2026
            },
            identifiers: {
                isbn_paperback: '9780000000000'
            },
            publisher: {
                name: 'Example Press'
            }
        });

        expect(checklist.find(item => item.key === 'title')?.state).toBe('Ready');
        expect(checklist.find(item => item.key === 'author')?.state).toBe('Ready');
        expect(checklist.find(item => item.key === 'publisher')?.state).toBe('Ready');
    });

    it('surfaces missing Book Pages as setup needed', () => {
        const checklist = buildBookPagesChecklist({
            bookMetaAvailable: false,
            items: [],
            issueCodes: []
        });

        expect(checklist.find(item => item.key === 'title-page')?.state).toBe('Needs setup');
        expect(checklist.find(item => item.key === 'copyright')?.state).toBe('Needs setup');
    });

    it('marks copyright as ready when Book Details exist', () => {
        const checklist = buildBookPagesChecklist({
            bookMetaAvailable: true,
            items: [
                { role: 'copyright', usesBookMeta: true }
            ],
            issueCodes: []
        });

        expect(checklist.find(item => item.key === 'copyright')?.state).toBe('Ready');
        expect(checklist.find(item => item.key === 'copyright')?.tone).toBe('success');
    });

    it('labels unsupported book pages as excluded by layout', () => {
        const checklist = buildBookPagesChecklist({
            bookMetaAvailable: true,
            items: [
                { role: 'title-page', usesBookMeta: false }
            ],
            issueCodes: [
                { field: 'title-page', code: 'matter_role_unsupported', level: 'warning' }
            ]
        });

        expect(checklist.find(item => item.key === 'title-page')?.state).toBe('Excluded by layout');
    });

});
