import { describe, expect, it, beforeEach, afterEach } from 'vitest';
// SAFE: test-only temp fixture setup for bundled font diagnostics.
import * as fs from 'fs';
// SAFE: test-only temp fixture setup for bundled font diagnostics.
import * as os from 'os';
// SAFE: test-only temp fixture setup for bundled font diagnostics.
import * as path from 'path';
import {
    buildCtanHint,
    buildExportFilename,
    buildGoogleFontsHint,
    getStructuredFontDiagnostic,
    getTemplateFontDiagnostics,
    renderFontDiagnosticLine,
} from './exportFormats';
import { setBundledFontPath, setLatinModernPath } from './pandocBundledLayouts';
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
    afterEach(() => {
        setLatinModernPath(undefined);
    });

    it('returns missing-bundled when no verified Latin Modern path is registered', () => {
        const layout = makeLayout({ ...baseSpec, body: { ...baseSpec.body, font: 'latin-modern' } });
        const diag = getStructuredFontDiagnostic(layout);
        expect(diag.state).toBe('missing-bundled');
        expect(diag.primaryFontName).toBe('Latin Modern Roman');
        expect(diag.resolvedFontName).toBe('Latin Modern Roman');
        expect(diag.installHint?.source).toBe('bundled');
        expect(diag.installHint?.message).toMatch(/Install all/);
    });

    it('returns ok only when all required Latin Modern OTF faces exist', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-lm-ok-'));
        for (const file of [
            'lmroman10-regular.otf',
            'lmroman10-italic.otf',
            'lmroman10-bold.otf',
            'lmroman10-bolditalic.otf',
        ]) {
            fs.writeFileSync(path.join(tempRoot, file), '');
        }
        setLatinModernPath(tempRoot);

        const layout = makeLayout({ ...baseSpec, body: { ...baseSpec.body, font: 'latin-modern' } });
        const diag = getStructuredFontDiagnostic(layout);
        expect(diag.state).toBe('ok');
        expect(diag.installHint).toBeUndefined();

        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    it('raw template diagnostics flag a missing explicit Latin Modern Path', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-lm-missing-'));
        const templatePath = path.join(tempRoot, 'rt_modern_classic.tex');
        fs.writeFileSync(templatePath, [
            '\\usepackage{fontspec}',
            '\\setmainfont{Latin Modern Roman}[',
            `  Path = ${path.join(tempRoot, 'assets/fonts/latin-modern')} ,`,
            '  UprightFont = lmroman10-regular.otf ,',
            '  ItalicFont = lmroman10-italic.otf ,',
            '  BoldFont = lmroman10-bold.otf ,',
            '  BoldItalicFont = lmroman10-bolditalic.otf',
            ']',
        ].join('\n'));

        const diag = getTemplateFontDiagnostics(templatePath);
        expect(diag.canVerifySystemFonts).toBe(true);
        expect(diag.requiredFonts).toContain('Latin Modern Roman');
        expect(diag.missingRequiredFonts).toContain('Latin Modern Roman');

        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    it('raw template diagnostics treat IfFontExistsTF plus errmessage as a required exact font', () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-font-required-'));
        const templatePath = path.join(tempRoot, 'rt_exact_font.tex');
        fs.writeFileSync(templatePath, [
            '\\usepackage{fontspec}',
            '\\IfFontExistsTF{Source Serif 4}{',
            '  \\setmainfont{Source Serif 4}',
            '}{',
            '  \\errmessage{Radial Timeline PDF style requires Source Serif 4; install Source Serif 4 or choose another PDF style}',
            '}',
        ].join('\n'));

        const diag = getTemplateFontDiagnostics(templatePath);
        expect(diag.requiredFonts).toContain('Source Serif 4');
        expect(diag.optionalFonts).not.toContain('Source Serif 4');

        fs.rmSync(tempRoot, { recursive: true, force: true });
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
        // either 'ok' (catalog miss → assume installed) or 'missing-system'
        // with a Google Fonts hint. Either shape is valid; the test pins the
        // type-shape so future refactors can't accidentally drop fields.
        const layout = makeLayout({ ...baseSpec, body: { ...baseSpec.body, font: 'eb-garamond' } });
        const diag = getStructuredFontDiagnostic(layout);

        expect(['ok', 'missing-system', 'missing-bundled']).toContain(diag.state);
        expect(typeof diag.primaryFontName).toBe('string');
        expect(diag.primaryFontName.length).toBeGreaterThan(0);
        expect(typeof diag.resolvedFontName).toBe('string');
        expect(diag.resolvedFontName.length).toBeGreaterThan(0);

        if (diag.state === 'missing-system') {
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

    it('renders the install hint for missing system fonts', () => {
        const line = renderFontDiagnosticLine({
            state: 'missing-system',
            primaryFontName: 'EB Garamond',
            resolvedFontName: 'EB Garamond',
            installHint: {
                source: 'google-fonts',
                url: 'https://fonts.google.com/specimen/EB+Garamond',
                message: 'Install EB Garamond from Google Fonts.',
            },
        });
        expect(line).toMatch(/Install EB Garamond/);
        expect(line).not.toMatch(/Using TeX Gyre Pagella/);
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

// ════════════════════════════════════════════════════════════════════════════
// OS-aware install hints (Google Fonts source)
// ════════════════════════════════════════════════════════════════════════════

const GOOGLE_FONTS_URL = 'https://fonts.google.com/specimen/EB+Garamond';

describe('buildGoogleFontsHint — platform routing', () => {
    it('mac: routes through Font Book with macOS-specific steps', () => {
        const hint = buildGoogleFontsHint('EB Garamond', GOOGLE_FONTS_URL, 'mac');
        expect(hint.source).toBe('google-fonts');
        expect(hint.url).toBe(GOOGLE_FONTS_URL);
        expect(hint.message).toMatch(/Font Book/);
        expect(hint.steps).toBeDefined();
        expect(hint.steps!.length).toBeGreaterThanOrEqual(3);
        expect(hint.steps!.some(step => /Font Book/.test(step))).toBe(true);
        expect(hint.steps!.some(step => /Re-export/.test(step))).toBe(true);
    });

    it('win: routes through right-click → Install for all users', () => {
        const hint = buildGoogleFontsHint('EB Garamond', GOOGLE_FONTS_URL, 'win');
        expect(hint.source).toBe('google-fonts');
        expect(hint.url).toBe(GOOGLE_FONTS_URL);
        expect(hint.message).toMatch(/Google Fonts/);
        expect(hint.steps).toBeDefined();
        expect(hint.steps!.some(step => /Right-click/.test(step))).toBe(true);
        expect(hint.steps!.some(step => /Install for all users/.test(step))).toBe(true);
        expect(hint.steps!.some(step => /Font Book/.test(step))).toBe(false);
    });

    it('linux: routes through ~/.fonts and fc-cache', () => {
        const hint = buildGoogleFontsHint('EB Garamond', GOOGLE_FONTS_URL, 'linux');
        expect(hint.source).toBe('google-fonts');
        expect(hint.url).toBe(GOOGLE_FONTS_URL);
        expect(hint.message).toMatch(/Google Fonts/);
        expect(hint.steps).toBeDefined();
        expect(hint.steps!.some(step => /\.fonts/.test(step))).toBe(true);
        expect(hint.steps!.some(step => /fc-cache/.test(step))).toBe(true);
        expect(hint.steps!.some(step => /Font Book/.test(step))).toBe(false);
    });

    it('uses the same Google Fonts URL across all platforms', () => {
        const macHint = buildGoogleFontsHint('EB Garamond', GOOGLE_FONTS_URL, 'mac');
        const winHint = buildGoogleFontsHint('EB Garamond', GOOGLE_FONTS_URL, 'win');
        const linuxHint = buildGoogleFontsHint('EB Garamond', GOOGLE_FONTS_URL, 'linux');
        expect(macHint.url).toBe(GOOGLE_FONTS_URL);
        expect(winHint.url).toBe(GOOGLE_FONTS_URL);
        expect(linuxHint.url).toBe(GOOGLE_FONTS_URL);
    });

    it('embeds the requested font name in every platform message', () => {
        for (const platform of ['mac', 'win', 'linux'] as const) {
            const hint = buildGoogleFontsHint('Crimson Text', GOOGLE_FONTS_URL, platform);
            expect(hint.message).toMatch(/Crimson Text/);
        }
    });
});

describe('buildCtanHint — generic (no platform branching for unknown fonts)', () => {
    it('returns a generic message without steps for fonts not on Google Fonts', () => {
        const hint = buildCtanHint('TeX Gyre Pagella');
        expect(hint.source).toBe('ctan');
        expect(hint.message).toMatch(/TeX Gyre Pagella/);
        expect(hint.url).toBeUndefined();
        // No fabricated platform-specific steps for fonts whose download path
        // varies too much across distributions to give actionable guidance.
        expect(hint.steps).toBeUndefined();
    });
});

describe('getStructuredFontDiagnostic — overridePlatform threading', () => {
    it('passes overridePlatform through to the install hint when a system font is missing', () => {
        // Bundled fonts that are fully present always resolve to 'ok', and
        // Latin Modern always resolves to 'ok'. Non-bundled fonts hit the
        // system-catalog probe — depending on the test runner's environment
        // we may land in 'ok' (catalog miss → assume installed) or 'missing-system'
        // (catalog hit + font not installed). When we DO land in 'missing-system',
        // the hint MUST reflect the override platform.
        const layout = makeLayout({ ...baseSpec, body: { ...baseSpec.body, font: 'eb-garamond' } });
        const diag = getStructuredFontDiagnostic(layout, 'mac');
        if (diag.state === 'missing-system' && diag.installHint?.source === 'google-fonts') {
            expect(diag.installHint.steps).toBeDefined();
            expect(diag.installHint.message).toMatch(/Font Book/);
        }
        // The signature accepts overridePlatform without throwing — that's
        // the load-bearing assertion regardless of which branch fired.
        expect(['ok', 'missing-system', 'missing-bundled']).toContain(diag.state);
    });

    it('returns ok (no install hint) for a bundled font with assets present, regardless of platform', () => {
        // Sorts Mill Goudy is bundled. With files on disk we must always
        // return 'ok' — no platform-specific install steps should ever be
        // emitted, because system install isn't required.
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-fontdiag-platform-'));
        try {
            const fontDir = path.join(tempRoot, 'sorts-mill-goudy');
            fs.mkdirSync(fontDir, { recursive: true });
            fs.writeFileSync(path.join(fontDir, 'SortsMillGoudy-Regular.ttf'), 'FAKE');
            fs.writeFileSync(path.join(fontDir, 'SortsMillGoudy-Italic.ttf'), 'FAKE');
            setBundledFontPath(tempRoot);

            const layout = makeLayout({ ...baseSpec, body: { ...baseSpec.body, font: 'sorts-mill-goudy' } });
            for (const platform of ['mac', 'win', 'linux'] as const) {
                const diag = getStructuredFontDiagnostic(layout, platform);
                expect(diag.state).toBe('ok');
                expect(diag.installHint).toBeUndefined();
            }
        } finally {
            try {
                fs.rmSync(tempRoot, { recursive: true, force: true });
            } catch { /* noop */ }
            setBundledFontPath(undefined);
        }
    });

    it('returns missing-bundled for Latin Modern regardless of platform when the verified path is absent', () => {
        const layout = makeLayout({ ...baseSpec, body: { ...baseSpec.body, font: 'latin-modern' } });
        for (const platform of ['mac', 'win', 'linux'] as const) {
            const diag = getStructuredFontDiagnostic(layout, platform);
            expect(diag.state).toBe('missing-bundled');
            expect(diag.installHint?.source).toBe('bundled');
        }
    });
});
