/**
 * Bundled fiction spec smoke tests.
 *
 * For each of the four bundled fiction layouts:
 *   - The spec exists, is non-null, and has its archetype set.
 *   - The generator produces a non-empty .tex string.
 *   - The output contains the Pandoc variables ($body$, $title$, $author$).
 *   - The output carries the spec-version header comment.
 *   - The output passes RTTS template validation (no errors).
 *
 * These tests structurally guarantee that bundled fiction templates remain
 * compilable through the spec-driven cutover.
 */
import { describe, expect, it } from 'vitest';
import {
    BUNDLED_FICTION_IDS,
    BUNDLED_FICTION_SPECS,
    type BundledFictionId,
} from './bundledStyleSpecs';
import { DESIGNED_STYLE_SPEC_VERSION, generateDesignedStyleTex } from './designedStyle';
import { validateRttsTemplateContent } from './rttsValidation';

describe('BUNDLED_FICTION_SPECS', () => {
    it('exports a spec for every bundled fiction id', () => {
        for (const id of BUNDLED_FICTION_IDS) {
            expect(BUNDLED_FICTION_SPECS[id]).toBeDefined();
            expect(BUNDLED_FICTION_SPECS[id].archetype).toBeTruthy();
            expect(BUNDLED_FICTION_SPECS[id].specVersion).toBe(DESIGNED_STYLE_SPEC_VERSION);
        }
    });

    const archetypeById: Record<BundledFictionId, string> = {
        'bundled-fiction-classic-manuscript':     'submission',
        'bundled-fiction-contemporary-literary':  'reading-draft',
        'bundled-fiction-signature-literary':     'literary',
        'bundled-fiction-modern-classic':         'structured',
    };

    for (const id of BUNDLED_FICTION_IDS) {
        describe(id, () => {
            const spec = BUNDLED_FICTION_SPECS[id];
            const tex = generateDesignedStyleTex(spec, { bundledLayoutId: id });

            it(`maps to expected archetype ${archetypeById[id]}`, () => {
                expect(spec.archetype).toBe(archetypeById[id]);
            });

            it('generates a non-empty .tex string', () => {
                expect(tex.length).toBeGreaterThan(0);
            });

            it('contains the spec-version header comment', () => {
                expect(tex).toContain(`% Generated from DesignedStyleSpec v${DESIGNED_STYLE_SPEC_VERSION} — ${id}`);
            });

            it('contains the Pandoc body, title, and author variables', () => {
                expect(tex).toContain('$body$');
                expect(tex).toContain('$title$');
                expect(tex).toContain('$author$');
            });

            it('passes RTTS template validation with no errors', () => {
                const result = validateRttsTemplateContent(tex);
                const errors = result.issues.filter(i => i.level === 'error');
                expect(errors).toEqual([]);
                expect(result.variables.hasBody).toBe(true);
                expect(result.variables.hasTitle).toBe(true);
                expect(result.variables.hasAuthor).toBe(true);
            });

            it('is byte-stable across regenerations (deterministic)', () => {
                const second = generateDesignedStyleTex(spec, { bundledLayoutId: id });
                expect(second).toBe(tex);
            });
        });
    }

    // Typography overflow relief — every spec emits microtype + emergencystretch
    // unconditionally, so user PDFs no longer overflow the right margin even on
    // plain prose. Assertion is on the SEMANTIC tokens (regex), not byte-equality.
    for (const id of BUNDLED_FICTION_IDS) {
        it(`${id}: emits typography overflow relief floor (microtype + emergencystretch)`, () => {
            const spec = BUNDLED_FICTION_SPECS[id];
            const tex = generateDesignedStyleTex(spec, { bundledLayoutId: id });
            expect(tex).toMatch(/\\usepackage\{microtype\}/);
            expect(tex).toMatch(/\\setlength\{\\emergencystretch\}/);
        });
    }

    // Page numbering hierarchy — every spec defines \rtBeginMainArabic and
    // \ifrtMainStarted so arabic numbering starts at the first opener
    // (Part > Chapter > Scene). The flag-guard pattern is present in
    // \rtPart, \rtChapter, AND \rtSceneOpener (when those macros are emitted).
    for (const id of BUNDLED_FICTION_IDS) {
        it(`${id}: defines \\rtBeginMainArabic and guards every opener with \\ifrtMainStarted`, () => {
            const spec = BUNDLED_FICTION_SPECS[id];
            const tex = generateDesignedStyleTex(spec, { bundledLayoutId: id });
            // Macro definition + flag declaration must always be present.
            expect(tex).toMatch(/\\newcommand\{\\rtBeginMainArabic\}/);
            expect(tex).toMatch(/\\newif\\ifrtMainStarted/);
            // Flag-guard appears at the top of each opener that the spec emits.
            const guard = /\\ifrtMainStarted\\else\\rtBeginMainArabic\\fi/;
            if (spec.parts.mode !== 'off') {
                // \rtPart body should contain the flag-guard.
                expect(tex).toMatch(/\\newcommand\{\\rtPart\}\[1\]\{%[\s\S]*?\\ifrtMainStarted\\else\\rtBeginMainArabic\\fi/);
            }
            if (spec.chapters.mode !== 'off') {
                expect(tex).toMatch(/\\newcommand\{\\rtChapter\}\[2\]\{%[\s\S]*?\\ifrtMainStarted\\else\\rtBeginMainArabic\\fi/);
            }
            if (spec.scene.opener === 'dedicated-page') {
                expect(tex).toMatch(/\\newcommand\{\\rtSceneOpener\}\[1\]\{%[\s\S]*?\\ifrtMainStarted\\else\\rtBeginMainArabic\\fi/);
            }
            // Sanity: at least one occurrence of the guard exists somewhere.
            expect(tex).toMatch(guard);
        });
    }

    // Regression: Signature Literary's scene-opener bottom-fraction was reduced
    // from 0.2 to 0.1 to tighten the title-to-body gap. Confirm the reduced
    // spacing flows through the generator for the bundled spec.
    it('Signature Literary emits the reduced scene-opener bottom spacing (0.2 / 0.1)', () => {
        const spec = BUNDLED_FICTION_SPECS['bundled-fiction-signature-literary'];
        const tex = generateDesignedStyleTex(spec, { bundledLayoutId: 'bundled-fiction-signature-literary' });
        expect(tex).toContain('\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.1\\textheight}');
        expect(tex).toContain('\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.1\\textheight}');
    });

    // Regression: Standard / Contemporary firstWordEmphasisOnOpener defines
    // a \rtSceneOpener macro (the assembler's contract surface) that owns
    // page break + chrome suppression + centered title typography. The old
    // \titleformat{\section} + \preto\section hooks NEVER FIRED on the
    // assembler's \section*{} calls; the macro form fires for every scene.
    for (const id of [
        'bundled-fiction-classic-manuscript',
        'bundled-fiction-contemporary-literary',
    ] as const) {
        it(`${id} defines \\rtSceneOpener macro for firstWordEmphasisOnOpener`, () => {
            const spec = BUNDLED_FICTION_SPECS[id];
            expect(spec.scene.firstWordEmphasisOnOpener).toBe(true);
            const tex = generateDesignedStyleTex(spec, { bundledLayoutId: id });
            // The macro form is the contract surface; the assembler invokes it.
            expect(tex).toContain('\\newcommand{\\rtSceneOpener}[1]');
            expect(tex).toContain('\\rtSceneOpenerTitle{#1}');
            expect(tex).toMatch(/\\rtSceneOpener\}\[1\]\{%[\s\S]*?\\cleardoublepage[\s\S]*?\\thispagestyle\{empty\}/);
            // Must NOT use the dead \titleformat{\section}/\preto\section path.
            expect(tex).not.toMatch(/\\preto\\section\{/);
            expect(tex).not.toMatch(/\\titleformat\{\\subsection\}/);
            expect(tex).not.toMatch(/\\preto\\subsection/);
        });
    }
});
