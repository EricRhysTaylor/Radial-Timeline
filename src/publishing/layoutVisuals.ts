/*
 * Shared layout visual system for the Radial Timeline publishing pipeline.
 *
 * Single source of truth for:
 *   - Fiction layout variants
 *   - Pictogram preview data (page sides, spreads, rows)
 *   - Feature-list data
 *   - DOM renderers for pictogram spreads/pages
 *
 * Consumed by both the Settings PDF Style panel and the Manuscript Export modal.
 * Render helpers are pure DOM builders — no plugin state, no settings access.
 *
 * RT terminology → export structure:
 *   Parts    = Acts (Act count → \rtPart{I})
 *   Chapters = Timeline notes carrying a Chapter field
 *   Scenes   = Scene notes (primary unit; \rtSceneSep separators)
 */
import type { PandocLayoutTemplate } from '../types';
import type { ManuscriptSceneHeadingMode } from '../utils/manuscript';
import { SHARED_CHAPTER_FIELD_SOURCE_LABEL_TITLE } from '../utils/timelineChapters';

// ── Variant identification ────────────────────────────────────────────
export type FictionLayoutVariant = 'classic' | 'modernClassic' | 'signature' | 'contemporary' | 'generic';

export const BUILTIN_FICTION_VARIANTS: readonly FictionLayoutVariant[] = [
    'classic',
    'modernClassic',
    'signature',
    'contemporary',
];

export const ALL_FICTION_VARIANTS: readonly FictionLayoutVariant[] = [
    ...BUILTIN_FICTION_VARIANTS,
    'generic',
];

export function getFictionVariantForLayout(layout?: PandocLayoutTemplate): FictionLayoutVariant {
    if (!layout) return 'generic';
    const source = `${layout.id} ${layout.name} ${layout.path}`.toLowerCase();
    if (
        source.includes('modern classic') ||
        source.includes('modern-classic') ||
        source.includes('modern_classic') ||
        source.includes('rt_modern_classic') ||
        layout.id === 'bundled-fiction-modern-classic'
    ) return 'modernClassic';
    if (source.includes('classic') || source.includes('traditional')) return 'classic';
    if (source.includes('contemporary')) return 'contemporary';
    if (
        source.includes('signature') ||
        source.includes('signature_literary_rt') ||
        source.includes('rt_signature_literary') ||
        layout.id === 'bundled-fiction-signature-literary' ||
        layout.id === 'bundled-novel'
    ) return 'signature';
    return 'generic';
}

// ── Pictogram data types ──────────────────────────────────────────────
export type PictogramPageSide = {
    headerLeft?: string;
    headerCenter?: string;
    headerRight?: string;
    folioBottom?: string;
    bodyLines: number;
    suppressHeader?: boolean;
    suppressFooter?: boolean;
    specialText?: string;
    specialSubtext?: string;
    /** Short rule rendered below specialText (like a scene separator rule) */
    specialRule?: boolean;
    /** Italic epigraph quote below the special block */
    epigraphText?: string;
    /** Attribution line below epigraph — rendered all-caps with em-dash prefix */
    epigraphAttribution?: string;
    /** Body lines before a scene separator, separator, then more body lines */
    separatorText?: string;
    linesBeforeSeparator?: number;
    linesAfterSeparator?: number;
};

export type PictogramSpread = {
    label: string;
    leftPage: PictogramPageSide | null;
    rightPage: PictogramPageSide | null;
    /** When set, this spread represents a selectable scene heading mode */
    sceneMode?: ManuscriptSceneHeadingMode;
};

export type LayoutPictogramRows = {
    /** Primary row: scene-opener spread (optional) + body spread */
    scene: PictogramSpread | null;
    body: PictogramSpread;
    /** Secondary row: PART, CHAPTER, or scene-heading-mode variants */
    special: PictogramSpread[];
};

export type LayoutFeatureRow = { label: string; value: string };

// Shared body-line count for full-page body previews.
export const LAYOUT_PREVIEW_BODY_LINES = 14;

// ── Feature list data ─────────────────────────────────────────────────
export function getLayoutFeatures(variant: FictionLayoutVariant): LayoutFeatureRow[] {
    switch (variant) {
        case 'classic':
            return [
                { label: 'Headers', value: 'Title centered (both pages)' },
                { label: 'Folios', value: 'Bottom center' },
                { label: 'Font', value: 'Sorts Mill Goudy (serif)' },
                { label: 'Spacing', value: '1.5 lines' },
                { label: 'Scenes', value: 'New page — centered scene number only' },
            ];
        case 'modernClassic':
            return [
                { label: 'Headers', value: 'Centered: Page|Author (even) · Title|Page (odd)' },
                { label: 'Folios', value: 'In headers' },
                { label: 'Font', value: 'Latin Modern (serif)' },
                { label: 'Spacing', value: '1.18×' },
                { label: 'Parts', value: 'Act opener — Roman numeral with optional epigraph' },
                { label: 'Chapters', value: SHARED_CHAPTER_FIELD_SOURCE_LABEL_TITLE },
                { label: 'Scenes', value: 'Lowercase Roman numeral (i. ii.) with short rule' },
            ];
        case 'signature':
            return [
                { label: 'Headers', value: 'Centered: Page|Author (even) · Title|Page (odd)' },
                { label: 'Folios', value: 'Header-only, letter-spaced' },
                { label: 'Font', value: 'Sorts Mill Goudy (serif)' },
                { label: 'Spacing', value: '1.5 lines' },
                { label: 'Scenes', value: 'Opener page — 30pt bold, suppresses headers' },
                { label: 'Scene #', value: 'Number only' },
                { label: 'Scene #+T', value: 'Number + title (in parentheses)' },
                { label: 'Scene T', value: 'Title only' },
            ];
        case 'contemporary':
            return [
                { label: 'Headers', value: 'Book title (left) · Scene context (right), sans' },
                { label: 'Folios', value: 'Bottom center (serif)' },
                { label: 'Font', value: 'Sorts Mill Goudy body, sans headers' },
                { label: 'Spacing', value: '1.5 lines' },
                { label: 'Scenes', value: 'New page — centered scene number only' },
                { label: 'Chapters', value: SHARED_CHAPTER_FIELD_SOURCE_LABEL_TITLE },
            ];
        default:
            return [
                { label: 'Layout', value: 'Custom template' },
                { label: 'Preview', value: 'Two-page body spread' },
            ];
    }
}

// ── Pictogram row data ────────────────────────────────────────────────
//
// Pictograms model the physical PDF page layout for each variant.
// Scene separators appear inline within body text (not on dedicated pages).
// "Special" spreads represent dedicated opener pages:
//   PART    = Act opener page (\rtPart)
//   CHAPTER = Chapter heading from the shared Chapter field
//   SCENE # / #+TITLE / TITLE = Scene heading modes (Signature only)
export function getLayoutPictogramRows(variant: FictionLayoutVariant): LayoutPictogramRows {
    switch (variant) {
        case 'classic':
            return {
                // Scene opener: suppresses headers/footers (\thispagestyle{empty})
                scene: {
                    label: 'SCENE',
                    leftPage: null,
                    rightPage: {
                        bodyLines: 5,
                        suppressHeader: true,
                        suppressFooter: true,
                        specialText: '3',
                    },
                },
                body: {
                    label: 'BODY',
                    leftPage: { headerCenter: 'TITLE', folioBottom: '12', bodyLines: LAYOUT_PREVIEW_BODY_LINES },
                    rightPage: { headerCenter: 'TITLE', folioBottom: '13', bodyLines: LAYOUT_PREVIEW_BODY_LINES },
                },
                special: [],
            };
        case 'modernClassic':
            return {
                scene: {
                    label: 'SCENE',
                    leftPage: null,
                    rightPage: {
                        bodyLines: 0,
                        separatorText: 'ii.',
                        linesBeforeSeparator: 0,
                        linesAfterSeparator: 5,
                    },
                },
                body: {
                    label: 'BODY',
                    leftPage: { headerCenter: '12 | AUTH', bodyLines: LAYOUT_PREVIEW_BODY_LINES },
                    rightPage: { headerCenter: 'TITLE | 13', bodyLines: LAYOUT_PREVIEW_BODY_LINES },
                },
                special: [
                    {
                        label: 'PART',
                        leftPage: null,
                        rightPage: {
                            bodyLines: 0,
                            suppressHeader: true,
                            suppressFooter: true,
                            specialText: 'I',
                            specialRule: true,
                            epigraphText: 'a quote',
                            epigraphAttribution: '—J. Name',
                        },
                    },
                    {
                        label: 'CHAPTER',
                        leftPage: null,
                        rightPage: {
                            bodyLines: 0,
                            suppressHeader: true,
                            suppressFooter: true,
                            specialText: 'Chapter 1',
                            specialSubtext: 'Boy with a Skull',
                        },
                    },
                ],
            };
        case 'signature':
            return {
                scene: null,
                body: {
                    label: 'BODY',
                    leftPage: { headerCenter: '12 | AUTH', bodyLines: LAYOUT_PREVIEW_BODY_LINES },
                    rightPage: { headerCenter: 'TITLE | 13', bodyLines: LAYOUT_PREVIEW_BODY_LINES },
                },
                special: [
                    {
                        label: 'SCENE #',
                        sceneMode: 'scene-number',
                        leftPage: null,
                        rightPage: {
                            bodyLines: 4,
                            suppressHeader: true,
                            suppressFooter: true,
                            specialText: '3',
                        },
                    },
                    {
                        label: '#+TITLE',
                        sceneMode: 'scene-number-title',
                        leftPage: null,
                        rightPage: {
                            bodyLines: 4,
                            suppressHeader: true,
                            suppressFooter: true,
                            specialText: '3',
                            specialSubtext: '(The Escape)',
                        },
                    },
                    {
                        label: 'TITLE',
                        sceneMode: 'title-only',
                        leftPage: null,
                        rightPage: {
                            bodyLines: 4,
                            suppressHeader: true,
                            suppressFooter: true,
                            specialText: 'The Escape',
                        },
                    },
                ],
            };
        case 'contemporary':
            return {
                scene: {
                    label: 'SCENE',
                    leftPage: null,
                    rightPage: {
                        bodyLines: 5,
                        suppressHeader: true,
                        suppressFooter: true,
                        specialText: '3',
                    },
                },
                body: {
                    label: 'BODY',
                    leftPage: { headerLeft: 'title', folioBottom: '12', bodyLines: LAYOUT_PREVIEW_BODY_LINES },
                    rightPage: { headerRight: 'scene', folioBottom: '13', bodyLines: LAYOUT_PREVIEW_BODY_LINES },
                },
                special: [
                    {
                        label: 'CHAPTER',
                        leftPage: null,
                        rightPage: {
                            bodyLines: 5,
                            suppressHeader: true,
                            suppressFooter: true,
                            specialText: 'Chapter',
                        },
                    },
                ],
            };
        default:
            // Generic fallback — labeled body spread so unknown templates still
            // get a basic visual preview rather than rendering nothing.
            return {
                scene: null,
                body: {
                    label: 'BODY',
                    leftPage: { folioBottom: '12', bodyLines: LAYOUT_PREVIEW_BODY_LINES },
                    rightPage: { folioBottom: '13', bodyLines: LAYOUT_PREVIEW_BODY_LINES },
                },
                special: [],
            };
    }
}

// ── DOM renderers (pure) ──────────────────────────────────────────────
// These build the same DOM tree for both consumers. They depend only on
// the standard HTMLElement API plus Obsidian's createDiv/createSpan
// augmentations (active wherever 'obsidian' is imported in the consumer).

export function renderLayoutPage(parent: HTMLElement, side: PictogramPageSide, sideClass: string): void {
    const page = parent.createDiv({ cls: `ert-layout-page ${sideClass}` });

    const hdr = page.createDiv({ cls: 'ert-layout-page-header' });
    if (side.suppressHeader) hdr.addClass('is-suppressed');
    if (side.headerCenter) {
        hdr.addClass('is-centered');
        hdr.createSpan({ cls: 'ert-layout-page-hdr-center', text: side.headerCenter });
    } else {
        if (side.headerLeft) hdr.createSpan({ cls: 'ert-layout-page-hdr-left', text: side.headerLeft });
        if (side.headerRight) hdr.createSpan({ cls: 'ert-layout-page-hdr-right', text: side.headerRight });
    }

    const body = page.createDiv({ cls: 'ert-layout-page-body' });

    if (side.separatorText != null) {
        // Scene separator: lines → separator → lines.
        // Use ?? (not ||) so 0 is respected as "no lines above".
        for (let i = 0; i < (side.linesBeforeSeparator ?? 3); i++) {
            body.createDiv({ cls: 'ert-layout-page-line' });
        }
        const sep = body.createDiv({ cls: 'ert-layout-page-separator' });
        sep.createSpan({ cls: 'ert-layout-page-separator-text', text: side.separatorText });
        sep.createDiv({ cls: 'ert-layout-page-separator-rule' });
        for (let i = 0; i < (side.linesAfterSeparator ?? 3); i++) {
            body.createDiv({ cls: 'ert-layout-page-line' });
        }
    } else if (side.specialText) {
        body.addClass('is-special');
        body.createSpan({ cls: 'ert-layout-page-special-text', text: side.specialText });
        if (side.specialRule) {
            body.createDiv({ cls: 'ert-layout-page-separator-rule' });
        }
        if (side.specialSubtext) {
            body.createSpan({ cls: 'ert-layout-page-special-subtext', text: side.specialSubtext });
        }
        if (side.epigraphText) {
            body.createSpan({ cls: 'ert-layout-page-epigraph-text', text: side.epigraphText });
        }
        if (side.epigraphAttribution) {
            body.createSpan({ cls: 'ert-layout-page-epigraph-attr', text: side.epigraphAttribution });
        }
        if (side.bodyLines > 0) {
            const bodyBelow = page.createDiv({ cls: 'ert-layout-page-body' });
            bodyBelow.style.flex = '0 0 auto';
            for (let i = 0; i < side.bodyLines; i++) {
                bodyBelow.createDiv({ cls: 'ert-layout-page-line' });
            }
        }
    } else {
        for (let i = 0; i < side.bodyLines; i++) {
            body.createDiv({ cls: 'ert-layout-page-line' });
        }
    }

    const ftr = page.createDiv({ cls: 'ert-layout-page-footer' });
    if (side.suppressFooter) ftr.addClass('is-suppressed');
    if (side.folioBottom) {
        ftr.createSpan({ cls: 'ert-layout-page-folio', text: side.folioBottom });
    }
}

export function renderLayoutSpread(parent: HTMLElement, spread: PictogramSpread): HTMLElement {
    const spreadEl = parent.createDiv({ cls: 'ert-layout-spread' });
    const pagesEl = spreadEl.createDiv({ cls: 'ert-layout-spread-pages' });

    if (spread.leftPage && spread.rightPage) {
        renderLayoutPage(pagesEl, spread.leftPage, 'is-left');
        pagesEl.createDiv({ cls: 'ert-layout-spread-spine' });
        renderLayoutPage(pagesEl, spread.rightPage, 'is-right');
    } else if (spread.rightPage) {
        renderLayoutPage(pagesEl, spread.rightPage, 'is-single');
    } else if (spread.leftPage) {
        renderLayoutPage(pagesEl, spread.leftPage, 'is-single');
    }

    if (spread.label) {
        spreadEl.createSpan({ cls: 'ert-layout-spread-label', text: spread.label });
    }
    return spreadEl;
}

/**
 * Render the pictogram column (primary row + optional special row). Both
 * the settings panel and the export modal compose this column the same way;
 * they differ only in what surrounds it.
 */
export function renderLayoutPictograms(
    parent: HTMLElement,
    rows: LayoutPictogramRows,
    activeSceneMode?: ManuscriptSceneHeadingMode,
): void {
    const pictoCol = parent.createDiv({ cls: 'ert-layout-visual-pictograms' });

    const primaryRow = pictoCol.createDiv({ cls: 'ert-layout-picto-row' });
    if (rows.scene) renderLayoutSpread(primaryRow, rows.scene);
    renderLayoutSpread(primaryRow, rows.body);

    const hasSceneModes = rows.special.some(spread => spread.sceneMode);
    if (rows.special.length > 0) {
        const specialRow = pictoCol.createDiv({ cls: 'ert-layout-picto-row' });
        for (const spread of rows.special) {
            const spreadEl = renderLayoutSpread(specialRow, spread);
            if (hasSceneModes && spread.sceneMode && activeSceneMode) {
                spreadEl.addClass(spread.sceneMode === activeSceneMode ? 'is-scene-active' : 'is-scene-dimmed');
            }
        }
    }
}

export function renderLayoutFeatureList(parent: HTMLElement, features: LayoutFeatureRow[]): HTMLElement {
    const featureCol = parent.createDiv({ cls: 'ert-layout-visual-features' });
    for (const feat of features) {
        const row = featureCol.createDiv({ cls: 'ert-layout-feature-row' });
        row.createSpan({ cls: 'ert-layout-feature-label', text: feat.label });
        row.createSpan({ cls: 'ert-layout-feature-value', text: feat.value });
    }
    return featureCol;
}
