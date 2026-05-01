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

    // Regression: Signature Literary's scene-opener bottom-fraction was reduced
    // from 0.2 to 0.1 to tighten the title-to-body gap. Confirm the reduced
    // spacing flows through the generator for the bundled spec.
    it('Signature Literary emits the reduced scene-opener bottom spacing (0.2 / 0.1)', () => {
        const spec = BUNDLED_FICTION_SPECS['bundled-fiction-signature-literary'];
        const tex = generateDesignedStyleTex(spec, { bundledLayoutId: 'bundled-fiction-signature-literary' });
        expect(tex).toContain('\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.1\\textheight}');
        expect(tex).toContain('\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.1\\textheight}');
    });

    // Regression: Standard / Contemporary firstWordEmphasisOnOpener hooks must
    // target \section (matching the assembler's \section* output), not \subsection.
    // Previously the hooks targeted \subsection which never fired, leaving scene-
    // opener formatting dead in the PDF.
    for (const id of [
        'bundled-fiction-classic-manuscript',
        'bundled-fiction-contemporary-literary',
    ] as const) {
        it(`${id} hooks \\section for firstWordEmphasisOnOpener (not \\subsection)`, () => {
            const spec = BUNDLED_FICTION_SPECS[id];
            expect(spec.scene.firstWordEmphasisOnOpener).toBe(true);
            const tex = generateDesignedStyleTex(spec, { bundledLayoutId: id });
            expect(tex).toContain('\\titleformat{\\section}[display]');
            expect(tex).toContain('\\titleformat{name=\\section,numberless}');
            expect(tex).toContain('\\titlespacing*{\\section}');
            expect(tex).toContain('\\preto\\section{\\clearpage\\thispagestyle{empty}}');
            // Must NOT hook \subsection — the assembler emits \section*, not \subsection.
            expect(tex).not.toMatch(/\\titleformat\{\\subsection\}/);
            expect(tex).not.toMatch(/\\preto\\subsection/);
        });
    }
});
