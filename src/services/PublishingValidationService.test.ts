import { describe, expect, it } from 'vitest';
import {
    buildBookDetailsChecklist,
    buildBookPagesChecklist,
    describeMatterReadiness
} from './PublishingValidationService';

describe('PublishingValidationService matter readiness', () => {
    it.each(['copyright', 'title-page', 'about-author'])(
        'marks %s as ready when UseBookMeta is true and Book Details exist',
        (role) => {
            const result = describeMatterReadiness({
                role,
                usesBookMeta: true,
                bookMetaAvailable: true
            });

            expect(result.label).toBe('Ready');
            expect(result.tone).toBe('success');
        }
    );

    it.each(['copyright', 'title-page', 'about-author'])(
        'marks %s as Needs metadata when UseBookMeta is true but Book Details are missing',
        (role) => {
            const result = describeMatterReadiness({
                role,
                usesBookMeta: true,
                bookMetaAvailable: false
            });

            expect(result.label).toBe('Needs metadata');
            expect(result.tone).toBe('error');
        }
    );

    it('marks UseBookMeta on a non-backed role as Uses page content (flag is a no-op)', () => {
        const result = describeMatterReadiness({
            role: 'epigraph',
            usesBookMeta: true,
            bookMetaAvailable: true
        });

        expect(result.label).toBe('Uses page content');
        expect(result.tone).toBe('success');
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

    it('marks duplicate roles as Needs repair', () => {
        const result = describeMatterReadiness({
            role: 'copyright',
            usesBookMeta: true,
            bookMetaAvailable: true,
            issueCodes: ['matter_role_duplicate']
        });

        expect(result.label).toBe('Needs repair');
        expect(result.tone).toBe('warning');
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

    it.each(['copyright', 'title-page', 'about-author'] as const)(
        'marks %s as Ready when Book Details exist',
        (role) => {
            const checklist = buildBookPagesChecklist({
                bookMetaAvailable: true,
                items: [
                    { role, usesBookMeta: true }
                ],
                issueCodes: []
            });

            const entry = checklist.find(item => item.key === role);
            expect(entry?.state).toBe('Ready');
            expect(entry?.tone).toBe('success');
        }
    );

    it('marks title-page as Needs metadata when UseBookMeta is true but Book Details missing', () => {
        const checklist = buildBookPagesChecklist({
            bookMetaAvailable: false,
            items: [
                { role: 'title-page', usesBookMeta: true }
            ],
            issueCodes: []
        });

        const entry = checklist.find(item => item.key === 'title-page');
        expect(entry?.state).toBe('Needs metadata');
        expect(entry?.tone).toBe('error');
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
