/*
 * Bundled fiction template specs.
 *
 * One DesignedStyleSpec per bundled fiction layout. The .tex content shipped in
 * pandocBundledLayouts.ts is generated from these specs, so the spec is the
 * authoritative description of each bundled template — the .tex file is a
 * derived artifact.
 *
 * Pictogram previews and feature lists also derive from these specs (via
 * getPictogramRowsFromSpec) so visual previews and PDF output cannot drift.
 *
 * Screenplay and podcast templates remain hand-coded in pandocBundledLayouts.ts.
 *
 * Reference: tag `pre-spec-export-stable` (commit 8504e382) is the rollback
 * marker for the pre-cutover hand-authored bundled .tex blobs.
 */
import { DESIGNED_STYLE_SPEC_VERSION, type DesignedStyleSpec } from './designedStyle';

export type BundledFictionId =
    | 'bundled-fiction-classic-manuscript'
    | 'bundled-fiction-contemporary-literary'
    | 'bundled-fiction-signature-literary'
    | 'bundled-fiction-modern-classic';

export const BUNDLED_FICTION_IDS: readonly BundledFictionId[] = [
    'bundled-fiction-classic-manuscript',
    'bundled-fiction-contemporary-literary',
    'bundled-fiction-signature-literary',
    'bundled-fiction-modern-classic',
];

const SHARED_FONT_FALLBACK_CHAIN = ['TeX Gyre Pagella', 'Times New Roman', 'Times'];

const STANDARD_MANUSCRIPT_SPEC: DesignedStyleSpec = {
    specVersion: DESIGNED_STYLE_SPEC_VERSION,
    archetype: 'submission',
    paperSize: 'us-trade-6x9',
    margins: { topIn: 1.0, bottomIn: 1.0, leftIn: 1.0, rightIn: 1.0, mirrored: false },
    body: {
        font: 'sorts-mill-goudy',
        fontFallbackChain: SHARED_FONT_FALLBACK_CHAIN,
        sizePt: 11,
        lineSpacing: 1.5,
        paragraphIndentEm: 1.5,
    },
    runningHeader: { mode: 'centered-title' },
    folio: { position: 'bottom-center' },
    parts:    { mode: 'off', pageBreak: false, epigraph: false },
    chapters: { mode: 'off', pageBreak: false, resetSceneCounter: false },
    scene: {
        opener: 'dedicated-page',
        headingMode: 'scene-number',
        suppressHeaderFooterOnOpener: true,
        firstWordEmphasisOnOpener: true,
    },
    epigraph: { enabled: false, italic: false, attributionStyle: 'plain' },
};

const CONTEMPORARY_LITERARY_SPEC: DesignedStyleSpec = {
    specVersion: DESIGNED_STYLE_SPEC_VERSION,
    archetype: 'reading-draft',
    paperSize: 'us-trade-6x9',
    margins: { topIn: 0.9, bottomIn: 1.0, leftIn: 0.9, rightIn: 0.9, mirrored: false },
    body: {
        font: 'sorts-mill-goudy',
        fontFallbackChain: SHARED_FONT_FALLBACK_CHAIN,
        sizePt: 11,
        lineSpacing: 1.5,
        paragraphIndentEm: 1.5,
    },
    runningHeader: { mode: 'left-title-right-context', font: 'sans' },
    folio: { position: 'bottom-center' },
    parts: { mode: 'off', pageBreak: false, epigraph: false },
    chapters: {
        mode: 'numbered',
        pageBreak: true,
        resetSceneCounter: false,
        spacing: { topFraction: 0.46, bottomFraction: 0.08 },
    },
    scene: {
        opener: 'dedicated-page',
        headingMode: 'scene-number',
        suppressHeaderFooterOnOpener: true,
        firstWordEmphasisOnOpener: true,
    },
    epigraph: { enabled: false, italic: false, attributionStyle: 'plain' },
};

const SIGNATURE_LITERARY_SPEC: DesignedStyleSpec = {
    specVersion: DESIGNED_STYLE_SPEC_VERSION,
    archetype: 'literary',
    paperSize: 'us-trade-6x9',
    margins: { topIn: 0.85, bottomIn: 1.05, leftIn: 0.9, rightIn: 0.9, mirrored: false },
    body: {
        font: 'sorts-mill-goudy',
        fontFallbackChain: SHARED_FONT_FALLBACK_CHAIN,
        sizePt: 11,
        lineSpacing: 1.5,
        paragraphIndentEm: 1.5,
    },
    runningHeader: { mode: 'split-author-page-title-page', letterSpacing: 15.0 },
    folio: { position: 'header' },
    parts:    { mode: 'off', pageBreak: false, epigraph: false },
    chapters: { mode: 'off', pageBreak: false, resetSceneCounter: false, secnumdepth: 1 },
    scene: {
        opener: 'dedicated-page',
        headingMode: 'scene-number',
        suppressHeaderFooterOnOpener: true,
        openerHeadingModes: ['scene-number', 'scene-number-title', 'title-only'],
        // Reduce the gap between the scene-opener title and the body text.
        // Legacy default was 0.2/0.2 (top/bottom of \textheight). Halving the
        // bottom fraction tightens the title-to-body gap without crowding.
        openerSpacing: { topFraction: 0.2, bottomFraction: 0.1 },
    },
    epigraph: { enabled: false, italic: false, attributionStyle: 'plain' },
};

const MODERN_CLASSIC_SPEC: DesignedStyleSpec = {
    specVersion: DESIGNED_STYLE_SPEC_VERSION,
    archetype: 'structured',
    paperSize: 'us-trade-6x9',
    margins: { topIn: 0.95, bottomIn: 1.15, leftIn: 0.98, rightIn: 0.98, mirrored: false },
    body: {
        font: 'latin-modern',
        fontFallbackChain: SHARED_FONT_FALLBACK_CHAIN,
        sizePt: 11,
        lineSpacing: 1.18,
        microtype: true,
    },
    runningHeader: { mode: 'split-author-page-title-page' },
    folio: { position: 'header' },
    parts: {
        mode: 'roman',
        pageBreak: true,
        epigraph: true,
        epigraphPlacement: 'inline',
        openAny: true,
    },
    chapters: { mode: 'numbered-titled', pageBreak: true, resetSceneCounter: false },
    scene: {
        opener: 'roman-with-rule',
        headingMode: 'scene-number',
        suppressHeaderFooterOnOpener: false,
    },
    epigraph: { enabled: true, italic: true, attributionStyle: 'em-dash-caps' },
};

export const BUNDLED_FICTION_SPECS: Record<BundledFictionId, DesignedStyleSpec> = {
    'bundled-fiction-classic-manuscript':     STANDARD_MANUSCRIPT_SPEC,
    'bundled-fiction-contemporary-literary':  CONTEMPORARY_LITERARY_SPEC,
    'bundled-fiction-signature-literary':     SIGNATURE_LITERARY_SPEC,
    'bundled-fiction-modern-classic':         MODERN_CLASSIC_SPEC,
};

export function isBundledFictionId(id: string): id is BundledFictionId {
    return (BUNDLED_FICTION_IDS as readonly string[]).includes(id);
}
