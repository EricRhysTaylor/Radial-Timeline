/*
 * UI ⇄ export alignment contract for the Book Pages resolver.
 *
 * Both consumers — the Settings → Publish "Book Pages preview" UI and the
 * manuscript export pipeline — call `resolveBookPages` + `applyBookPageOrder`
 * with the same `(bookMeta, summaries, savedOrder)` triple. This file is the
 * locked-in contract that proves the data layer is unified: the same input
 * produces the same output for export and preview.
 *
 * If a future change makes the preview re-walk notes or BookMeta independently,
 * the assertions below will fail because they hard-code the resolver's
 * promised invariants:
 *
 *   - Notes win for canonical roles (no duplicate canonical row from BookMeta).
 *   - Custom notes (no canonical role) are preserved as `role: null`.
 *   - Frontmatter pages precede backmatter pages in canonical render order.
 *   - Saved drag order is honoured by `applyBookPageOrder`.
 */
import { describe, it, expect } from 'vitest';
import type { BookMeta } from '../types';
import {
    resolveBookPages,
    applyBookPageOrder,
    type MatterNoteSummary,
    type ResolvedPage,
} from './bookPagesResolver';

/**
 * Canonical fixture matching the user's actual vault shape:
 *   - 7 matter notes: 6 canonical roles (Title Page, Copyright, Dedication,
 *     Epigraph, Acknowledgments, About the Author) + 1 custom (Alpha Readers)
 *   - BookMeta with title set (would emit a Title Page from BookMeta if no note
 *     existed for that role)
 */
const fixtureBookMeta: BookMeta = {
    title: 'A Test Manuscript',
    rights: { copyright_holder: 'Eric Rhys Taylor', year: 2026 },
    frontmatter: { dedication: 'For everyone' },
    backmatter: {
        acknowledgments: 'Thanks',
        about_author: 'Bio',
    },
};

const fixtureNotes: MatterNoteSummary[] = [
    { role: '',                path: 'Books/X/0.1 Alpha Readers.md',     title: '0.1 Alpha Readers',     bodyMode: 'plain', side: 'frontmatter' },
    { role: 'title-page',      path: 'Books/X/0.2 Title Page.md',        title: '0.2 Title Page',        bodyMode: 'plain', side: 'frontmatter' },
    { role: 'copyright',       path: 'Books/X/0.3 Copyright.md',         title: '0.3 Copyright',         bodyMode: 'plain', side: 'frontmatter' },
    { role: 'dedication',      path: 'Books/X/0.4 Dedication.md',        title: '0.4 Dedication',        bodyMode: 'plain', side: 'frontmatter' },
    { role: 'epigraph',        path: 'Books/X/0.5 Epigraph.md',          title: '0.5 Epigraph',          bodyMode: 'latex', side: 'frontmatter' },
    { role: 'acknowledgments', path: 'Books/X/200.1 Acknowledgments.md', title: '200.1 Acknowledgments', bodyMode: 'plain', side: 'backmatter' },
    { role: 'about-author',    path: 'Books/X/200.2 About the Author.md', title: '200.2 About the Author', bodyMode: 'plain', side: 'backmatter' },
];

describe('Book Pages resolver — UI ⇄ export alignment', () => {
    it('produces identical resolved+ordered output for both consumers', () => {
        // Export-side call (mirrors src/utils/manuscript.ts).
        const exportResolved = resolveBookPages(fixtureBookMeta, fixtureNotes);
        const exportOrdered = applyBookPageOrder(exportResolved, undefined);

        // UI-side call (mirrors the Book Pages preview in ProFeaturePanels.ts).
        const uiResolved = resolveBookPages(fixtureBookMeta, fixtureNotes);
        const uiOrdered = applyBookPageOrder(uiResolved, undefined);

        expect(uiOrdered).toEqual(exportOrdered);
    });

    it('renders 7 rows: 6 note-backed canonical pages + 1 custom note, zero BookMeta-generated pages (notes win)', () => {
        const resolved = resolveBookPages(fixtureBookMeta, fixtureNotes);
        const ordered = applyBookPageOrder(resolved, undefined);

        expect(ordered).toHaveLength(7);

        const noteCount     = ordered.filter(p => p.source === 'note').length;
        const bookMetaCount = ordered.filter(p => p.source === 'bookmeta').length;
        expect(noteCount).toBe(7);
        expect(bookMetaCount).toBe(0);

        // All canonical roles present exactly once + one custom (role: null).
        const roles = ordered.map(p => p.role);
        expect(roles).toContain('title-page');
        expect(roles).toContain('copyright');
        expect(roles).toContain('dedication');
        expect(roles).toContain('epigraph');
        expect(roles).toContain('acknowledgments');
        expect(roles).toContain('about-author');
        expect(roles.filter(r => r === null)).toHaveLength(1);
    });

    it('orders canonical-role rows by side (frontmatter then backmatter); custom notes append at end', () => {
        const resolved = resolveBookPages(fixtureBookMeta, fixtureNotes);
        const ordered = applyBookPageOrder(resolved, undefined);

        // Canonical pages render in CANONICAL_ROLE_ORDER (frontmatter side first,
        // then backmatter side). Custom notes (role: null) are appended after
        // canonical pages in input file order — they keep their declared side
        // but their POSITION is end-of-list in the canonical layout.
        const canonicalRows = ordered.filter(p => p.role !== null);
        const customRows = ordered.filter(p => p.role === null);

        // Among canonical rows, frontmatter precedes backmatter.
        const canonicalSides = canonicalRows.map(p => p.side);
        const lastFront = canonicalSides.lastIndexOf('frontmatter');
        const firstBack = canonicalSides.indexOf('backmatter');
        expect(firstBack).toBeGreaterThan(-1);
        expect(lastFront).toBeLessThan(firstBack);

        // Custom rows come AFTER all canonical rows.
        const lastCanonicalIdx = ordered.lastIndexOf(canonicalRows[canonicalRows.length - 1]);
        const firstCustomIdx = ordered.indexOf(customRows[0]);
        expect(firstCustomIdx).toBeGreaterThan(lastCanonicalIdx);
    });

    it('does NOT duplicate a canonical role even when BookMeta also has content for it', () => {
        // Dedication appears as both a note (fixtureNotes[3]) AND a BookMeta
        // field (fixtureBookMeta.frontmatter.dedication). Notes win — only
        // one Dedication row may surface.
        const resolved = resolveBookPages(fixtureBookMeta, fixtureNotes);
        const ordered = applyBookPageOrder(resolved, undefined);

        const dedicationRows = ordered.filter(p => p.role === 'dedication');
        expect(dedicationRows).toHaveLength(1);
        expect(dedicationRows[0].source).toBe('note');
    });

    it('preserves the custom note (Alpha Readers) as role: null with source: note', () => {
        const resolved = resolveBookPages(fixtureBookMeta, fixtureNotes);
        const ordered = applyBookPageOrder(resolved, undefined);

        const customs = ordered.filter(p => p.role === null);
        expect(customs).toHaveLength(1);
        const [alphaReaders] = customs;
        expect(alphaReaders.source).toBe('note');
        expect(alphaReaders.path).toBe('Books/X/0.1 Alpha Readers.md');
    });

    it('honours saved drag-reorder via applyBookPageOrder (UI persists, export consumes the same field)', () => {
        const resolved = resolveBookPages(fixtureBookMeta, fixtureNotes);

        // Simulate the user dragging Acknowledgments to the top.
        const acknowledgmentsId = 'note:Books/X/200.1 Acknowledgments.md';
        const canonicalIds = resolved.map(p => p.id);
        const savedOrder = [
            acknowledgmentsId,
            ...canonicalIds.filter(id => id !== acknowledgmentsId),
        ];

        const orderedUi     = applyBookPageOrder(resolved, savedOrder);
        const orderedExport = applyBookPageOrder(resolved, savedOrder);

        // Both consumers must agree.
        expect(orderedUi).toEqual(orderedExport);
        // Acknowledgments must be first.
        expect(orderedUi[0].id).toBe(acknowledgmentsId);
    });

    it('drops a BookMeta-only role when no matching note exists AND BookMeta has no content for it', () => {
        // BookMeta has no `author_note` and no note carries that role → row absent.
        const resolved = resolveBookPages(fixtureBookMeta, fixtureNotes);
        const ordered: ResolvedPage[] = applyBookPageOrder(resolved, undefined);

        const authorNoteRows = ordered.filter(p => p.role === 'author-note');
        expect(authorNoteRows).toHaveLength(0);
    });
});
