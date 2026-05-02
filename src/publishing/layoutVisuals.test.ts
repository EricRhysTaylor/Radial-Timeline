import { describe, expect, it } from 'vitest';
import type { PandocLayoutTemplate } from '../types';
import { getBundledPandocLayouts } from '../utils/pandocBundledLayouts';
import {
    ALL_FICTION_VARIANTS,
    BUILTIN_FICTION_VARIANTS,
    LAYOUT_PREVIEW_BODY_LINES,
    applySpreadValidation,
    getFictionVariantForLayout,
    getLayoutFeatures,
    getLayoutPictogramRows,
    getPictogramRowsFromSpec,
    type FictionLayoutVariant,
    type LayoutPictogramRows,
    type PictogramSpread,
} from './layoutVisuals';
import { BUNDLED_FICTION_SPECS } from './bundledStyleSpecs';

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

    describe('designed-origin layouts use archetype mapping', () => {
        // Build a minimal DesignedStyleSpec inline rather than depending on its full default surface.
        const baseSpec = {
            specVersion: 1 as const,
            paperSize: 'us-trade-6x9' as const,
            margins: { topIn: 1, bottomIn: 1, leftIn: 1, rightIn: 1 },
            body: { font: 'sorts-mill-goudy' as const, fontFallbackChain: [], sizePt: 11, lineSpacing: 1.5 },
            runningHeader: { mode: 'centered-title' as const },
            folio: { position: 'bottom-center' as const },
            parts: { mode: 'off' as const, pageBreak: false, epigraph: false },
            chapters: { mode: 'off' as const, pageBreak: false, resetSceneCounter: false },
            scene: { opener: 'inline-separator' as const, headingMode: 'scene-number' as const, suppressHeaderFooterOnOpener: true },
            epigraph: { enabled: false, italic: false, attributionStyle: 'plain' as const },
        };

        // Heuristic-misleading id/name/path so we can prove archetype wins.
        const misleadingPath = { id: 'foo', name: 'Modern Classic Look', path: 'rt_modern_classic.tex' };

        it('archetype submission → classic (overrides id/name heuristic)', () => {
            const result = getFictionVariantForLayout(layout({
                ...misleadingPath,
                origin: 'designed',
                designedSpec: { ...baseSpec, archetype: 'submission' as const },
            }));
            expect(result).toBe('classic');
        });

        it('archetype reading-draft → contemporary', () => {
            const result = getFictionVariantForLayout(layout({
                id: 'd1', name: 'Whatever',
                origin: 'designed',
                designedSpec: { ...baseSpec, archetype: 'reading-draft' as const },
            }));
            expect(result).toBe('contemporary');
        });

        it('archetype literary → signature', () => {
            const result = getFictionVariantForLayout(layout({
                id: 'd2', name: 'Whatever',
                origin: 'designed',
                designedSpec: { ...baseSpec, archetype: 'literary' as const },
            }));
            expect(result).toBe('signature');
        });

        it('archetype structured → modernClassic', () => {
            const result = getFictionVariantForLayout(layout({
                id: 'd3', name: 'Whatever',
                origin: 'designed',
                designedSpec: { ...baseSpec, archetype: 'structured' as const },
            }));
            expect(result).toBe('modernClassic');
        });
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

describe('applySpreadValidation', () => {
    function findSpread(rows: LayoutPictogramRows, label: string): PictogramSpread | undefined {
        return rows.special.find(spread => spread.label === label);
    }

    it('stamps a warning on the PART spread when actCount < 2', () => {
        const rows = applySpreadValidation(getLayoutPictogramRows('modernClassic'), {
            actCount: 1,
            chapterFieldCount: 5,
        });
        const part = findSpread(rows, 'PART');
        expect(part?.warningLevel).toBe('warning');
        expect(part?.warningTooltip).toMatch(/fewer than two Acts/);
    });

    it('does NOT stamp the PART spread when actCount >= 2', () => {
        const rows = applySpreadValidation(getLayoutPictogramRows('modernClassic'), {
            actCount: 3,
            chapterFieldCount: 5,
        });
        const part = findSpread(rows, 'PART');
        expect(part?.warningLevel).toBeUndefined();
        expect(part?.warningTooltip).toBeUndefined();
    });

    it('stamps a warning on the CHAPTER spread when chapterFieldCount === 0', () => {
        const rows = applySpreadValidation(getLayoutPictogramRows('modernClassic'), {
            actCount: 3,
            chapterFieldCount: 0,
        });
        const chapter = findSpread(rows, 'CHAPTER');
        expect(chapter?.warningLevel).toBe('warning');
        expect(chapter?.warningTooltip).toMatch(/no scenes have a Chapter field/);
    });

    it('does NOT stamp the CHAPTER spread when chapterFieldCount >= 1', () => {
        const rows = applySpreadValidation(getLayoutPictogramRows('modernClassic'), {
            actCount: 3,
            chapterFieldCount: 1,
        });
        const chapter = findSpread(rows, 'CHAPTER');
        expect(chapter?.warningLevel).toBeUndefined();
    });

    it('never stamps a warning on SCENE / BODY / sceneMode-bearing spreads', () => {
        const ctx = { actCount: 0, chapterFieldCount: 0 };

        // Classic has top-row SCENE + BODY only — no special row entries.
        const classic = applySpreadValidation(getLayoutPictogramRows('classic'), ctx);
        expect(classic.scene?.warningLevel).toBeUndefined();
        expect(classic.body.warningLevel).toBeUndefined();

        // Signature's special spreads all carry a sceneMode — never alerted.
        const signature = applySpreadValidation(getLayoutPictogramRows('signature'), ctx);
        for (const spread of signature.special) {
            expect(spread.sceneMode).toBeTruthy();
            expect(spread.warningLevel).toBeUndefined();
        }
        expect(signature.body.warningLevel).toBeUndefined();

        // Modern Classic has BODY in top row — never alerted regardless of ctx.
        const modern = applySpreadValidation(getLayoutPictogramRows('modernClassic'), ctx);
        expect(modern.scene?.warningLevel).toBeUndefined();
        expect(modern.body.warningLevel).toBeUndefined();
    });

    it('returns a NEW rows object and does not mutate the input', () => {
        const original = getLayoutPictogramRows('modernClassic');
        const originalSpecialRef = original.special;
        const originalPartRef = original.special.find(s => s.label === 'PART');
        expect(originalPartRef?.warningLevel).toBeUndefined();

        const next = applySpreadValidation(original, { actCount: 0, chapterFieldCount: 0 });

        // New top-level rows object.
        expect(next).not.toBe(original);
        // New special array (mapped).
        expect(next.special).not.toBe(originalSpecialRef);
        // Input PART spread unchanged.
        expect(originalPartRef?.warningLevel).toBeUndefined();
        // Output PART spread carries the warning.
        expect(next.special.find(s => s.label === 'PART')?.warningLevel).toBe('warning');
    });

    // ── Pro-feature mismatch checks ──────────────────────────────────
    // Each check fires only when the SPREAD itself advertises the feature
    // (the spread shape encodes whether the spec advertises epigraph /
    // titled-chapter / title-only-scene). This guarantees we never warn on
    // templates that don't promise the feature.

    describe('Part-epigraph populated check', () => {
        it('stamps a warning on PART when the spread advertises epigraph but no act has a quote', () => {
            // Modern Classic: spec.parts.epigraph === true → spread carries epigraphText
            const rows = applySpreadValidation(getLayoutPictogramRows('modernClassic'), {
                actCount: 3,
                chapterFieldCount: 5,
                actEpigraphPopulatedCount: 0,
            });
            const part = findSpread(rows, 'PART');
            expect(part?.warningLevel).toBe('warning');
            expect(part?.warningTooltip).toMatch(/epigraph/i);
        });

        it('does NOT stamp PART when at least one act has an epigraph quote', () => {
            const rows = applySpreadValidation(getLayoutPictogramRows('modernClassic'), {
                actCount: 3,
                chapterFieldCount: 5,
                actEpigraphPopulatedCount: 1,
            });
            const part = findSpread(rows, 'PART');
            expect(part?.warningLevel).toBeUndefined();
        });

        it('does NOT fire on templates that do not advertise epigraphs', () => {
            // Standard Manuscript: spec.parts.mode === 'off' → no PART spread at all.
            const rows = applySpreadValidation(getLayoutPictogramRows('classic'), {
                actCount: 3,
                chapterFieldCount: 5,
                actEpigraphPopulatedCount: 0,
            });
            // No PART spread — nothing to stamp, no warning surfaces.
            expect(findSpread(rows, 'PART')).toBeUndefined();
            // And the existing warnings on what IS present are unaffected.
            expect(rows.body.warningLevel).toBeUndefined();
        });
    });

    describe('Chapter-title populated check', () => {
        it('stamps a warning on CHAPTER when titled-mode advertised but no chapter has a title', () => {
            // Modern Classic: spec.chapters.mode === 'numbered-titled' → spread has specialSubtext
            const rows = applySpreadValidation(getLayoutPictogramRows('modernClassic'), {
                actCount: 3,
                chapterFieldCount: 5,           // markers exist (skips first check)
                chapterTitlePopulatedCount: 0,  // but none have titles
            });
            const chapter = findSpread(rows, 'CHAPTER');
            expect(chapter?.warningLevel).toBe('warning');
            expect(chapter?.warningTooltip).toMatch(/title/i);
        });

        it('does NOT stamp CHAPTER when at least one chapter has a title', () => {
            const rows = applySpreadValidation(getLayoutPictogramRows('modernClassic'), {
                actCount: 3,
                chapterFieldCount: 5,
                chapterTitlePopulatedCount: 2,
            });
            const chapter = findSpread(rows, 'CHAPTER');
            expect(chapter?.warningLevel).toBeUndefined();
        });

        it('does NOT fire on templates that advertise chapters but not TITLES', () => {
            // Contemporary Literary: spec.chapters.mode === 'numbered' → CHAPTER
            // spread renders 'Chapter' with NO specialSubtext. The check is
            // gated on specialSubtext presence, so this template never warns
            // about missing chapter titles.
            const rows = applySpreadValidation(getLayoutPictogramRows('contemporary'), {
                actCount: 3,
                chapterFieldCount: 5,
                chapterTitlePopulatedCount: 0,
            });
            const chapter = findSpread(rows, 'CHAPTER');
            expect(chapter?.warningLevel).toBeUndefined();
        });
    });

    describe('Scene-title heading-mode check', () => {
        it('stamps a warning on the title-only sceneMode spread when no scenes have titles', () => {
            // Signature Literary exposes a 'title-only' scene-mode spread.
            const rows = applySpreadValidation(getLayoutPictogramRows('signature'), {
                actCount: 3,
                chapterFieldCount: 5,
                sceneTitlePopulatedRatio: 0,
            });
            const titleOnly = rows.special.find(s => s.sceneMode === 'title-only');
            expect(titleOnly?.warningLevel).toBe('warning');
            expect(titleOnly?.warningTooltip).toMatch(/title/i);
            // Sibling sceneMode spreads (scene-number / scene-number-title) are unaffected.
            const sceneNumber = rows.special.find(s => s.sceneMode === 'scene-number');
            expect(sceneNumber?.warningLevel).toBeUndefined();
        });

        it('does NOT stamp the title-only spread when most scenes have titles', () => {
            const rows = applySpreadValidation(getLayoutPictogramRows('signature'), {
                actCount: 3,
                chapterFieldCount: 5,
                sceneTitlePopulatedRatio: 0.9,
            });
            const titleOnly = rows.special.find(s => s.sceneMode === 'title-only');
            expect(titleOnly?.warningLevel).toBeUndefined();
        });

        it('does NOT fire on templates without a title-only scene-mode spread', () => {
            // Modern Classic uses 'roman-with-rule' scene opener — no sceneMode spreads.
            const rows = applySpreadValidation(getLayoutPictogramRows('modernClassic'), {
                actCount: 3,
                chapterFieldCount: 5,
                sceneTitlePopulatedRatio: 0,
            });
            // No title-only spread to stamp — so no warning surfaces on the
            // existing PART / CHAPTER spreads from this check (they remain
            // unaffected by the missing scene titles).
            const titleOnly = rows.special.find(s => s.sceneMode === 'title-only');
            expect(titleOnly).toBeUndefined();
        });
    });

    it('omitted optional context fields → existing checks still fire, new ones do not', () => {
        // Backward-compat: callers that don't supply the new fields get the
        // historical behavior (PART/CHAPTER warnings driven only by act/marker counts).
        const rows = applySpreadValidation(getLayoutPictogramRows('modernClassic'), {
            actCount: 3,
            chapterFieldCount: 5,
        });
        // No new warnings (epigraph/title fields are undefined → checks bail out).
        const part = findSpread(rows, 'PART');
        expect(part?.warningLevel).toBeUndefined();
        const chapter = findSpread(rows, 'CHAPTER');
        expect(chapter?.warningLevel).toBeUndefined();
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

describe('getPictogramRowsFromSpec — spec-driven pictograms', () => {
    it('Standard Manuscript spec → classic-shaped rows', () => {
        const rows = getPictogramRowsFromSpec(BUNDLED_FICTION_SPECS['bundled-fiction-classic-manuscript']);
        // Centered title header on both pages.
        expect(rows.body.leftPage?.headerCenter).toBe('TITLE');
        expect(rows.body.rightPage?.headerCenter).toBe('TITLE');
        // Bottom-center folio.
        expect(rows.body.leftPage?.folioBottom).toBe('12');
        expect(rows.body.rightPage?.folioBottom).toBe('13');
        // Scene opener spread present, suppresses chrome.
        expect(rows.scene).not.toBeNull();
        expect(rows.scene?.rightPage?.suppressHeader).toBe(true);
        expect(rows.scene?.rightPage?.suppressFooter).toBe(true);
        expect(rows.scene?.rightPage?.specialText).toBe('3');
        // No PART, no CHAPTER, no scene-mode variants.
        expect(rows.special).toEqual([]);
    });

    it('Contemporary Literary spec → CHAPTER spread with bodyLines === 0', () => {
        const rows = getPictogramRowsFromSpec(BUNDLED_FICTION_SPECS['bundled-fiction-contemporary-literary']);
        // Sans-styled split header (left=title, right=scene-context).
        expect(rows.body.leftPage?.headerLeft).toBe('title');
        expect(rows.body.rightPage?.headerRight).toBe('scene');
        // Bottom-center folio.
        expect(rows.body.leftPage?.folioBottom).toBe('12');
        expect(rows.body.rightPage?.folioBottom).toBe('13');
        // CHAPTER spread is chapter-only-page (the previously divergent case).
        const chapter = rows.special.find(s => s.label === 'CHAPTER');
        expect(chapter).toBeDefined();
        const page = chapter!.rightPage!;
        expect(page.bodyLines).toBe(0);
        expect(page.suppressHeader).toBe(true);
        expect(page.suppressFooter).toBe(true);
        expect(page.specialText).toBe('Chapter');
    });

    it('Signature Literary spec → three scene-mode opener spreads, no PART/CHAPTER', () => {
        const rows = getPictogramRowsFromSpec(BUNDLED_FICTION_SPECS['bundled-fiction-signature-literary']);
        // Split-author headers.
        expect(rows.body.leftPage?.headerCenter).toMatch(/\|/);
        expect(rows.body.rightPage?.headerCenter).toMatch(/\|/);
        // No bottom folio — folio lives in header.
        expect(rows.body.leftPage?.folioBottom).toBeUndefined();
        expect(rows.body.rightPage?.folioBottom).toBeUndefined();
        // No top-row scene spread; the three scene-mode spreads live in special.
        expect(rows.scene).toBeNull();
        const sceneModes = rows.special.map(s => s.sceneMode).filter(Boolean);
        expect(sceneModes).toEqual(['scene-number', 'scene-number-title', 'title-only']);
    });

    it('Modern Classic spec → PART (with epigraph), CHAPTER, and roman-rule scene', () => {
        const rows = getPictogramRowsFromSpec(BUNDLED_FICTION_SPECS['bundled-fiction-modern-classic']);
        // Split-author headers; no bottom folio.
        expect(rows.body.leftPage?.headerCenter).toMatch(/\|/);
        expect(rows.body.rightPage?.headerCenter).toMatch(/\|/);
        // Top-row scene spread is the lowercase Roman rule.
        expect(rows.scene?.rightPage?.separatorText).toBe('ii.');
        // PART spread with an epigraph.
        const part = rows.special.find(s => s.label === 'PART');
        expect(part).toBeDefined();
        expect(part!.rightPage?.specialText).toBe('I');
        expect(part!.rightPage?.epigraphText).toBe('a quote');
        // CHAPTER spread with subtext (numbered-titled).
        const chapter = rows.special.find(s => s.label === 'CHAPTER');
        expect(chapter).toBeDefined();
        expect(chapter!.rightPage?.specialText).toBe('Chapter 1');
        expect(chapter!.rightPage?.specialSubtext).toBe('Boy with a Skull');
    });

    it('getLayoutPictogramRows uses the spec when a bundled layout is supplied', () => {
        const bundled = getBundledPandocLayouts();
        const contemporary = bundled.find(l => l.id === 'bundled-fiction-contemporary-literary')!;
        const rows = getLayoutPictogramRows(getFictionVariantForLayout(contemporary), contemporary);
        const chapter = rows.special.find(s => s.label === 'CHAPTER');
        expect(chapter?.rightPage?.bodyLines).toBe(0);
    });

    // Regression: scene opener pages with specialText + bodyLines > 0 must carry
    // both fields on the same PictogramPageSide. The DOM renderer uses this to
    // place body lines inside the special-text body div (not a second body div
    // that would inherit padding and visually double the first line).
    it('scene opener pages combine specialText and bodyLines on the same page side', () => {
        // Standard Manuscript: dedicated-page scene opener with body preview lines.
        const classic = getPictogramRowsFromSpec(BUNDLED_FICTION_SPECS['bundled-fiction-classic-manuscript']);
        const classicScene = classic.scene?.rightPage;
        expect(classicScene?.specialText).toBe('3');
        expect(classicScene?.bodyLines).toBe(5);

        // Contemporary Literary: same shape.
        const contemp = getPictogramRowsFromSpec(BUNDLED_FICTION_SPECS['bundled-fiction-contemporary-literary']);
        const contempScene = contemp.scene?.rightPage;
        expect(contempScene?.specialText).toBe('3');
        expect(contempScene?.bodyLines).toBe(5);

        // Signature Literary: scene-mode opener spreads also combine special + body.
        const sig = getPictogramRowsFromSpec(BUNDLED_FICTION_SPECS['bundled-fiction-signature-literary']);
        for (const spread of sig.special) {
            if (spread.sceneMode) {
                expect(spread.rightPage?.specialText).toBeTruthy();
                expect(spread.rightPage?.bodyLines).toBeGreaterThan(0);
            }
        }
    });
});
