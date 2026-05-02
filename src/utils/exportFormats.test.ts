import { describe, expect, it, beforeEach, afterEach } from 'vitest';
// SAFE: test-only temp fixture setup for bundled font diagnostics.
import * as fs from 'fs';
// SAFE: test-only temp fixture setup for bundled font diagnostics.
import * as os from 'os';
// SAFE: test-only temp fixture setup for bundled font diagnostics.
import * as path from 'path';
import { buildExportFilename, getStructuredFontDiagnostic, renderFontDiagnosticLine } from './exportFormats';
import { setBundledFontPath } from './pandocBundledLayouts';
import { DESIGNED_STYLE_SPEC_VERSION, type DesignedStyleSpec } from '../publishing/designedStyle';
import type { PandocLayoutTemplate } from '../types';

describe('buildExportFilename — manuscript PDF', () => {
    it('appends the layout abbreviation in square brackets before the extension', () => {
        const filename = buildExportFilename({
            exportType: 'manuscript',
            order: 'narrative',
            extension: 'pdf',
            fileStem: 'shail-and-trisan',
            layoutAbbreviation: 'CL',
        });
        // shape: "shail and trisan PDF <timestamp> [CL].pdf"
        // (stemToReadable preserves stem casing — title-casing is intentional book-stem behavior elsewhere.)
        expect(filename).toMatch(/^shail and trisan PDF .+ \[CL\]\.pdf$/);
    });

    it('omits the abbreviation when none is provided', () => {
        const filename = buildExportFilename({
            exportType: 'manuscript',
            order: 'narrative',
            extension: 'pdf',
            fileStem: 'Manuscript',
        });
        expect(filename).toMatch(/^Manuscript PDF .+\.pdf$/);
        expect(filename).not.toMatch(/\[/);
    });

    it('rejects malformed abbreviations rather than embedding garbage in the filename', () => {
        const filename = buildExportFilename({
            exportType: 'manuscript',
            order: 'narrative',
            extension: 'pdf',
            fileStem: 'manuscript',
            // Lowercase or non-2-letter codes are ignored — the helper guards
            // against future callers passing through malformed values that
            // would corrupt the on-disk filename.
            layoutAbbreviation: 'sm',
        });
        expect(filename).not.toMatch(/\[/);
    });

    it('does not apply abbreviation to non-PDF manuscript exports', () => {
        const filename = buildExportFilename({
            exportType: 'manuscript',
            order: 'narrative',
            manuscriptPreset: 'novel',
            extension: 'md',
            layoutAbbreviation: 'CL',
        });
        // markdown branch never reads layoutAbbreviation.
        expect(filename).not.toMatch(/\[CL\]/);
        expect(filename).toMatch(/\.md$/);
    });
});

// ════════════════════════════════════════════════════════════════════════════
// Structured font diagnostic
// ════════════════════════════════════════════════════════════════════════════

const baseSpec: DesignedStyleSpec = {
    specVersion: DESIGNED_STYLE_SPEC_VERSION,
    archetype: 'submission',
    paperSize: 'us-trade-6x9',
    margins: { topIn: 1, bottomIn: 1, leftIn: 1, rightIn: 1 },
    body: { font: 'sorts-mill-goudy', fontFallbackChain: ['TeX Gyre Pagella'], sizePt: 11, lineSpacing: 1.5 },
    runningHeader: { mode: 'centered-title' },
    folio: { position: 'bottom-center' },
    parts: { mode: 'off', pageBreak: false, epigraph: false },
    chapters: { mode: 'off', pageBreak: false, resetSceneCounter: false },
    scene: { opener: 'inline-separator', headingMode: 'scene-number', suppressHeaderFooterOnOpener: true },
    epigraph: { enabled: false, italic: false, attributionStyle: 'plain' },
};

function makeLayout(spec: DesignedStyleSpec): PandocLayoutTemplate {
    return {
        id: 'test-designed-layout',
        name: 'Test Designed Layout',
        preset: 'novel',
        path: 'test.tex',
        origin: 'designed',
        designedSpec: spec,
    };
}

describe('getStructuredFontDiagnostic — Latin Modern', () => {
    it('always returns state: ok regardless of font path / system font catalog', () => {
        // Latin Modern is loaded via \usepackage{lmodern}; XeLaTeX finds it
        // through kpathsea on every TeX install, independent of the system
        // font registry. Diagnostic must reflect this.
        const layout = makeLayout({ ...baseSpec, body: { ...baseSpec.body, font: 'latin-modern' } });
        const diag = getStructuredFontDiagnostic(layout);
        expect(diag.state).toBe('ok');
        expect(diag.primaryFontName).toBe('Latin Modern Roman');
        expect(diag.resolvedFontName).toBe('Latin Modern Roman');
        expect(diag.installHint).toBeUndefined();
    });
});

describe('getStructuredFontDiagnostic — Sorts Mill Goudy (bundled)', () => {
    let tempRoot: string;

    beforeEach(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-fontdiag-'));
    });

    afterEach(() => {
        try {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        } catch { /* noop */ }
        // Reset module-level path so other tests aren't affected.
        setBundledFontPath(undefined);
    });

    it('returns state: ok when bundled .ttf files are present on disk', () => {
        // Mirror the real layout: <root>/sorts-mill-goudy/SortsMillGoudy-{Regular,Italic}.ttf
        const fontDir = path.join(tempRoot, 'sorts-mill-goudy');
        fs.mkdirSync(fontDir, { recursive: true });
        fs.writeFileSync(path.join(fontDir, 'SortsMillGoudy-Regular.ttf'), 'FAKE');
        fs.writeFileSync(path.join(fontDir, 'SortsMillGoudy-Italic.ttf'), 'FAKE');
        setBundledFontPath(tempRoot);

        const layout = makeLayout({ ...baseSpec, body: { ...baseSpec.body, font: 'sorts-mill-goudy' } });
        const diag = getStructuredFontDiagnostic(layout);
        expect(diag.state).toBe('ok');
        expect(diag.primaryFontName).toBe('Sorts Mill Goudy');
        expect(diag.resolvedFontName).toBe('Sorts Mill Goudy');
        expect(diag.installHint).toBeUndefined();
    });

    it('returns state: missing-bundled with reinstall hint when files are absent', () => {
        // Point at a directory that doesn't contain the bundled font files.
        setBundledFontPath(tempRoot);

        const layout = makeLayout({ ...baseSpec, body: { ...baseSpec.body, font: 'sorts-mill-goudy' } });
        const diag = getStructuredFontDiagnostic(layout);
        expect(diag.state).toBe('missing-bundled');
        expect(diag.installHint?.source).toBe('bundled');
        expect(diag.installHint?.message).toMatch(/reinstall/i);
        expect(diag.installHint?.url).toBeUndefined();
    });

    it('returns state: missing-bundled when no bundled-font path is configured', () => {
        setBundledFontPath(undefined);

        const layout = makeLayout({ ...baseSpec, body: { ...baseSpec.body, font: 'sorts-mill-goudy' } });
        const diag = getStructuredFontDiagnostic(layout);
        expect(diag.state).toBe('missing-bundled');
    });
});

describe('getStructuredFontDiagnostic — structured shape', () => {
    it('has the expected shape: state + primaryFontName + resolvedFontName (+ optional installHint)', () => {
        // EB Garamond is non-bundled, non-system-special. On a CI runner
        // without a font catalog (or without EB Garamond installed) we expect
        // either 'ok' (catalog miss → assume installed) or 'fallback' with
        // a Google Fonts hint. Either shape is valid; the test pins the
        // type-shape so future refactors can't accidentally drop fields.
        const layout = makeLayout({ ...baseSpec, body: { ...baseSpec.body, font: 'eb-garamond' } });
        const diag = getStructuredFontDiagnostic(layout);

        expect(['ok', 'fallback', 'missing-bundled']).toContain(diag.state);
        expect(typeof diag.primaryFontName).toBe('string');
        expect(diag.primaryFontName.length).toBeGreaterThan(0);
        expect(typeof diag.resolvedFontName).toBe('string');
        expect(diag.resolvedFontName.length).toBeGreaterThan(0);

        if (diag.state === 'fallback') {
            expect(diag.installHint).toBeDefined();
            expect(['google-fonts', 'ctan']).toContain(diag.installHint!.source);
            if (diag.installHint!.source === 'google-fonts') {
                expect(diag.installHint!.url).toMatch(/^https:\/\/fonts\.google\.com\//);
            }
            expect(typeof diag.installHint!.message).toBe('string');
        }
    });

    it('returns a generic ok diagnostic for layouts without a spec', () => {
        const layoutNoSpec: PandocLayoutTemplate = {
            id: 'custom-no-spec',
            name: 'Custom',
            preset: 'novel',
            path: 'custom.tex',
        };
        const diag = getStructuredFontDiagnostic(layoutNoSpec);
        expect(diag.state).toBe('ok');
        expect(diag.installHint).toBeUndefined();
    });
});

describe('renderFontDiagnosticLine', () => {
    it('returns null for ok state (no line to render)', () => {
        expect(renderFontDiagnosticLine({
            state: 'ok',
            primaryFontName: 'Latin Modern Roman',
            resolvedFontName: 'Latin Modern Roman',
        })).toBeNull();
    });

    it('renders a "Using X — install Y" sentence for fallback state', () => {
        const line = renderFontDiagnosticLine({
            state: 'fallback',
            primaryFontName: 'EB Garamond',
            resolvedFontName: 'TeX Gyre Pagella',
            installHint: {
                source: 'google-fonts',
                url: 'https://fonts.google.com/specimen/EB+Garamond',
                message: 'Install EB Garamond from Google Fonts for the intended look.',
            },
        });
        expect(line).toMatch(/Using TeX Gyre Pagella/);
        expect(line).toMatch(/install EB Garamond/);
    });

    it('renders the bundled-asset reinstall message for missing-bundled', () => {
        const line = renderFontDiagnosticLine({
            state: 'missing-bundled',
            primaryFontName: 'Sorts Mill Goudy',
            resolvedFontName: 'Sorts Mill Goudy',
            installHint: {
                source: 'bundled',
                message: 'Plugin asset missing — reinstall plugin.',
            },
        });
        expect(line).toMatch(/reinstall/i);
    });
});
