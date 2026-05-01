import { describe, expect, it } from 'vitest';
import type { PandocLayoutTemplate } from '../types';
import { getBundledPandocLayouts } from '../utils/pandocBundledLayouts';
import {
    ALL_FICTION_VARIANTS,
    BUILTIN_FICTION_VARIANTS,
    LAYOUT_PREVIEW_BODY_LINES,
    getFictionVariantForLayout,
    getLayoutFeatures,
    getLayoutPictogramRows,
    type FictionLayoutVariant,
} from './layoutVisuals';

function layout(overrides: Partial<PandocLayoutTemplate>): PandocLayoutTemplate {
    return {
        id: 'test-layout',
        name: 'Test Layout',
        preset: 'novel',
        path: 'test.tex',
        ...overrides,
    };
}

describe('getFictionVariantForLayout', () => {
    it('returns generic when no layout supplied', () => {
        expect(getFictionVariantForLayout(undefined)).toBe('generic');
    });

    it('detects modern classic via id', () => {
        expect(getFictionVariantForLayout(layout({ id: 'bundled-fiction-modern-classic' }))).toBe('modernClassic');
    });

    it('detects modern classic via name token', () => {
        expect(getFictionVariantForLayout(layout({ id: 'custom', name: 'My Modern Classic' }))).toBe('modernClassic');
    });

    it('detects classic via name token', () => {
        expect(getFictionVariantForLayout(layout({ id: 'classic-x', name: 'Classic Manuscript' }))).toBe('classic');
    });

    it('detects contemporary via name token', () => {
        expect(getFictionVariantForLayout(layout({ id: 'x', name: 'Contemporary Literary' }))).toBe('contemporary');
    });

    it('detects signature via id', () => {
        expect(getFictionVariantForLayout(layout({ id: 'bundled-fiction-signature-literary' }))).toBe('signature');
    });

    it('detects signature via path token', () => {
        expect(getFictionVariantForLayout(layout({ id: 'x', name: 'Custom', path: 'rt_signature_literary.tex' }))).toBe('signature');
    });

    it('falls back to generic for unknown templates', () => {
        expect(getFictionVariantForLayout(layout({ id: 'foo', name: 'Just A Layout', path: 'foo.tex' }))).toBe('generic');
    });
});

describe('getLayoutFeatures', () => {
    it('returns non-empty rows for every built-in variant', () => {
        for (const variant of BUILTIN_FICTION_VARIANTS) {
            const rows = getLayoutFeatures(variant);
            expect(rows.length).toBeGreaterThan(0);
            for (const row of rows) {
                expect(row.label.length).toBeGreaterThan(0);
                expect(row.value.length).toBeGreaterThan(0);
            }
        }
    });

    it('returns a fallback row set for the generic variant', () => {
        const rows = getLayoutFeatures('generic');
        expect(rows.length).toBeGreaterThan(0);
    });
});

describe('getLayoutPictogramRows', () => {
    it('returns a body spread for every variant including generic', () => {
        for (const variant of ALL_FICTION_VARIANTS) {
            const rows = getLayoutPictogramRows(variant);
            expect(rows.body).toBeDefined();
            expect(rows.body.leftPage || rows.body.rightPage).toBeTruthy();
        }
    });

    it('uses LAYOUT_PREVIEW_BODY_LINES for full body spreads', () => {
        const rows = getLayoutPictogramRows('classic');
        expect(rows.body.leftPage?.bodyLines).toBe(LAYOUT_PREVIEW_BODY_LINES);
        expect(rows.body.rightPage?.bodyLines).toBe(LAYOUT_PREVIEW_BODY_LINES);
    });

    it('marks the signature variant with selectable scene heading modes', () => {
        const rows = getLayoutPictogramRows('signature');
        const sceneModes = rows.special.map(spread => spread.sceneMode).filter(Boolean);
        expect(sceneModes).toEqual(expect.arrayContaining(['scene-number', 'scene-number-title', 'title-only']));
    });

    it('gives the generic variant a labeled body spread instead of nothing', () => {
        const rows = getLayoutPictogramRows('generic');
        expect(rows.body.label).toBe('BODY');
        expect(rows.scene).toBeNull();
        expect(rows.special).toEqual([]);
    });
});

describe('shared variant resolution agrees across consumers', () => {
    it('every bundled fiction layout resolves to a known variant', () => {
        const bundled = getBundledPandocLayouts();
        const fiction = bundled.filter(item => item.preset === 'novel');
        expect(fiction.length).toBeGreaterThan(0);
        for (const item of fiction) {
            const variant = getFictionVariantForLayout(item);
            expect(ALL_FICTION_VARIANTS).toContain<FictionLayoutVariant>(variant);
            // Pictogram + features should both have an answer for the resolved variant.
            expect(getLayoutPictogramRows(variant).body).toBeDefined();
            expect(getLayoutFeatures(variant).length).toBeGreaterThan(0);
        }
    });
});
