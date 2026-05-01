import { describe, expect, it } from 'vitest';
import {
    DESIGNED_STYLE_SPEC_VERSION,
    type DesignArchetype,
    type DesignedStyleSpec,
    generateDesignedStyleTex,
    getVariantForArchetype,
} from './designedStyle';
import type { FictionLayoutVariant } from './layoutVisuals';

function buildSpec(overrides: Partial<DesignedStyleSpec> = {}): DesignedStyleSpec {
    const base: DesignedStyleSpec = {
        specVersion: DESIGNED_STYLE_SPEC_VERSION,
        archetype: 'submission',
        paperSize: 'us-trade-6x9',
        margins: { topIn: 1, bottomIn: 1, leftIn: 1, rightIn: 1, mirrored: false },
        body: {
            font: 'sorts-mill-goudy',
            fontFallbackChain: ['TeX Gyre Pagella', 'Times New Roman'],
            sizePt: 11,
            lineSpacing: 1.5,
            paragraphIndentEm: 1.5,
        },
        runningHeader: { mode: 'centered-title' },
        folio: { position: 'bottom-center' },
        parts: { mode: 'roman', pageBreak: true, epigraph: true },
        chapters: { mode: 'numbered-titled', pageBreak: true, resetSceneCounter: false },
        scene: {
            opener: 'inline-separator',
            headingMode: 'scene-number',
            suppressHeaderFooterOnOpener: true,
        },
        epigraph: { enabled: true, italic: true, attributionStyle: 'em-dash-caps' },
    };
    return { ...base, ...overrides };
}

describe('getVariantForArchetype', () => {
    const cases: Array<[DesignArchetype, FictionLayoutVariant]> = [
        ['submission', 'classic'],
        ['reading-draft', 'contemporary'],
        ['literary', 'signature'],
        ['structured', 'modernClassic'],
    ];
    for (const [archetype, expected] of cases) {
        it(`maps ${archetype} → ${expected}`, () => {
            expect(getVariantForArchetype(archetype)).toBe(expected);
        });
    }
});

describe('generateDesignedStyleTex', () => {
    it('returns a non-empty .tex string', () => {
        const tex = generateDesignedStyleTex(buildSpec());
        expect(tex.length).toBeGreaterThan(0);
    });

    it('includes core preamble packages', () => {
        const tex = generateDesignedStyleTex(buildSpec());
        expect(tex).toContain('\\documentclass');
        expect(tex).toContain('\\usepackage{geometry}');
        expect(tex).toContain('\\usepackage{fontspec}');
        expect(tex).toContain('\\usepackage{fancyhdr}');
    });

    it('includes the Pandoc body hook and document boundaries', () => {
        const tex = generateDesignedStyleTex(buildSpec());
        expect(tex).toContain('\\begin{document}');
        expect(tex).toContain('$body$');
        expect(tex).toContain('\\end{document}');
    });

    it('defines \\rtPart when parts.mode is not off', () => {
        const tex = generateDesignedStyleTex(buildSpec({
            parts: { mode: 'roman', pageBreak: true, epigraph: true },
        }));
        expect(tex).toContain('\\newcommand{\\rtPart}');
    });

    it('does not define \\rtPart when parts.mode is off', () => {
        const tex = generateDesignedStyleTex(buildSpec({
            parts: { mode: 'off', pageBreak: false, epigraph: false },
        }));
        expect(tex).not.toContain('\\newcommand{\\rtPart}');
    });

    it('defines \\rtChapter when chapters.mode is not off', () => {
        const tex = generateDesignedStyleTex(buildSpec({
            chapters: { mode: 'numbered', pageBreak: true, resetSceneCounter: false },
        }));
        expect(tex).toContain('\\newcommand{\\rtChapter}');
    });

    it('does not define \\rtChapter when chapters.mode is off', () => {
        const tex = generateDesignedStyleTex(buildSpec({
            chapters: { mode: 'off', pageBreak: false, resetSceneCounter: false },
        }));
        expect(tex).not.toContain('\\newcommand{\\rtChapter}');
    });

    it('defines \\rtSceneSep for the scene opener', () => {
        const tex = generateDesignedStyleTex(buildSpec());
        expect(tex).toContain('\\newcommand{\\rtSceneSep}');
    });

    it('honors us-trade-6x9 paper size', () => {
        const tex = generateDesignedStyleTex(buildSpec({ paperSize: 'us-trade-6x9' }));
        expect(tex).toContain('paperwidth=6in');
        expect(tex).toContain('paperheight=9in');
    });

    it('honors us-letter paper size', () => {
        const tex = generateDesignedStyleTex(buildSpec({ paperSize: 'us-letter' }));
        expect(tex).toContain('paperwidth=8.5in');
        expect(tex).toContain('paperheight=11in');
    });

    it('honors a4 paper size', () => {
        const tex = generateDesignedStyleTex(buildSpec({ paperSize: 'a4' }));
        expect(tex).toContain('paperwidth=210mm');
        expect(tex).toContain('paperheight=297mm');
    });

    it('honors a custom paper size', () => {
        const tex = generateDesignedStyleTex(buildSpec({
            paperSize: { widthIn: 5.5, heightIn: 8.5 },
        }));
        expect(tex).toContain('paperwidth=5.5in');
        expect(tex).toContain('paperheight=8.5in');
    });

    it('emits inner/outer margin keys when mirrored is true and twoside class option', () => {
        const tex = generateDesignedStyleTex(buildSpec({
            margins: { topIn: 1, bottomIn: 1, leftIn: 1.2, rightIn: 0.8, mirrored: true },
        }));
        expect(tex).toContain('inner=1.2in');
        expect(tex).toContain('outer=0.8in');
        expect(tex).toContain('twoside');
    });

    it('emits left/right margin keys and oneside when mirrored is false', () => {
        const tex = generateDesignedStyleTex(buildSpec({
            margins: { topIn: 1, bottomIn: 1, leftIn: 1.2, rightIn: 0.8, mirrored: false },
        }));
        expect(tex).toContain('left=1.2in');
        expect(tex).toContain('right=0.8in');
        expect(tex).toContain('oneside');
    });

    it('emits \\thispagestyle{empty} on the scene opener when suppression is on', () => {
        const tex = generateDesignedStyleTex(buildSpec({
            scene: {
                opener: 'dedicated-page',
                headingMode: 'scene-number',
                suppressHeaderFooterOnOpener: true,
            },
        }));
        expect(tex).toContain('\\thispagestyle{empty}');
    });

    it('uses IfFontExistsTF fallback chain', () => {
        const tex = generateDesignedStyleTex(buildSpec());
        expect(tex).toContain('\\IfFontExistsTF{Sorts Mill Goudy}');
        expect(tex).toContain('\\setmainfont{Arial}'); // terminal fallback
    });

    describe('archetype smoke specs', () => {
        const archetypes: Array<{ archetype: DesignArchetype; variant: FictionLayoutVariant; structuralMarker: string }> = [
            { archetype: 'submission',    variant: 'classic',       structuralMarker: '\\fancyhead[C]' },
            { archetype: 'reading-draft', variant: 'contemporary',  structuralMarker: '\\fancyhead' },
            { archetype: 'literary',      variant: 'signature',     structuralMarker: '\\fancyhead' },
            { archetype: 'structured',    variant: 'modernClassic', structuralMarker: '\\rtPart' },
        ];
        for (const { archetype, variant, structuralMarker } of archetypes) {
            it(`${archetype} → ${variant}: generates and contains "${structuralMarker}"`, () => {
                const spec = buildSpec({ archetype });
                expect(getVariantForArchetype(archetype)).toBe(variant);
                const tex = generateDesignedStyleTex(spec);
                expect(tex).toContain(structuralMarker);
            });
        }

        it('structured archetype emits \\rtPart and \\rtChapter when parts and chapters are on', () => {
            const tex = generateDesignedStyleTex(buildSpec({
                archetype: 'structured',
                parts: { mode: 'roman', pageBreak: true, epigraph: true },
                chapters: { mode: 'numbered-titled', pageBreak: true, resetSceneCounter: false },
            }));
            expect(tex).toContain('\\newcommand{\\rtPart}');
            expect(tex).toContain('\\newcommand{\\rtChapter}');
            expect(tex).toContain('\\newcommand{\\rtEpigraph}');
        });
    });

    // Regression: Contemporary Literary's running header must emit the
    // \BookTitle / \rtSceneRunningTitle macros, not the literal lowercase
    // 'title' / 'scene' label strings (which the pictogram uses as visual
    // labels). Pre-cutover hand-coded templates had this bug and the
    // pictogram label strings could be mistaken for the LaTeX value.
    describe('left-title-right-context running header (Bug 1 regression)', () => {
        it('emits \\BookTitle on even-page left and \\rtSceneRunningTitle on odd-page right', () => {
            const tex = generateDesignedStyleTex(buildSpec({
                archetype: 'reading-draft',
                runningHeader: { mode: 'left-title-right-context', font: 'sans' },
            }));
            expect(tex).toMatch(/\\fancyhead\[LE\]\{[^}]*\\BookTitle[^}]*\}/);
            expect(tex).toMatch(/\\fancyhead\[RO\]\{[^}]*\\rtSceneRunningTitle[^}]*\}/);
        });

        it('does not contain the literal lowercase label strings inside \\fancyhead[', () => {
            const tex = generateDesignedStyleTex(buildSpec({
                archetype: 'reading-draft',
                runningHeader: { mode: 'left-title-right-context', font: 'sans' },
            }));
            // Match every \fancyhead[...] block and assert none of them contain
            // the bare lowercase words `title` or `scene` as standalone tokens.
            const fancyheadBlocks = tex.match(/\\fancyhead\[[^\]]+\]\{[^}]*\}/g) || [];
            expect(fancyheadBlocks.length).toBeGreaterThan(0);
            for (const block of fancyheadBlocks) {
                // Allow matches that are part of a macro name (\BookTitle, \rtSceneRunningTitle)
                // Strip backslash-prefixed tokens, then check for the bare words.
                const withoutMacros = block.replace(/\\[A-Za-z]+/g, '');
                expect(withoutMacros).not.toMatch(/\btitle\b/i);
                expect(withoutMacros).not.toMatch(/\bscene\b/i);
            }
        });

        it('applies \\sffamily\\footnotesize\\nouppercase wrapping when font is sans', () => {
            const tex = generateDesignedStyleTex(buildSpec({
                archetype: 'reading-draft',
                runningHeader: { mode: 'left-title-right-context', font: 'sans' },
            }));
            expect(tex).toContain('\\fancyhead[LE]{\\sffamily\\footnotesize\\nouppercase{\\BookTitle}}');
            expect(tex).toContain('\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{\\rtSceneRunningTitle}}');
        });

        it('declares the \\rtSceneRunningTitle macro and its setter so manuscript assembly compiles', () => {
            const tex = generateDesignedStyleTex(buildSpec({
                archetype: 'reading-draft',
                runningHeader: { mode: 'left-title-right-context', font: 'sans' },
            }));
            expect(tex).toContain('\\providecommand{\\rtSceneRunningTitle}{}');
            expect(tex).toContain('\\providecommand{\\rtSetSceneRunningTitle}');
        });
    });

    // Regression: Contemporary's chapters.spacing must produce a \titlespacing*
    // rule that pushes the chapter heading down to ~46% of textheight. Without
    // this rule the chapter title lands near the top of the page despite
    // \preto\chapter{\clearpage}.
    describe('chapter heading spacing (Bug 2 regression)', () => {
        it('emits \\titlespacing* with the spec\'s topFraction and bottomFraction', () => {
            const tex = generateDesignedStyleTex(buildSpec({
                archetype: 'reading-draft',
                chapters: {
                    mode: 'numbered',
                    pageBreak: true,
                    resetSceneCounter: false,
                    spacing: { topFraction: 0.46, bottomFraction: 0.08 },
                },
            }));
            expect(tex).toContain('\\titlespacing*{\\chapter}{0pt}{0.46\\textheight}{0.08\\textheight}');
        });

        it('emits \\preto\\chapter{\\clearpage\\thispagestyle{empty}} so chapters start on their own page', () => {
            const tex = generateDesignedStyleTex(buildSpec({
                archetype: 'reading-draft',
                chapters: {
                    mode: 'numbered',
                    pageBreak: true,
                    resetSceneCounter: false,
                    spacing: { topFraction: 0.46, bottomFraction: 0.08 },
                },
            }));
            expect(tex).toContain('\\preto\\chapter{\\clearpage\\thispagestyle{empty}}');
        });

        it('does not emit \\titlespacing* when chapters.spacing is omitted', () => {
            const tex = generateDesignedStyleTex(buildSpec({
                archetype: 'submission',
                chapters: { mode: 'numbered-titled', pageBreak: true, resetSceneCounter: false },
            }));
            expect(tex).not.toMatch(/\\titlespacing\*\{\\chapter\}/);
        });
    });

    // Regression: Signature Literary's scene-opener bottom space was too tall
    // (legacy 0.2\textheight). The spec now exposes scene.openerSpacing so the
    // gap can be reduced. Confirm the override flows through to all four
    // \titlespacing* emit lines (section + subsection, numbered + numberless).
    describe('scene opener spacing (Signature Literary)', () => {
        it('emits \\titlespacing* with custom topFraction and bottomFraction when scene.openerSpacing is set', () => {
            const tex = generateDesignedStyleTex(buildSpec({
                archetype: 'literary',
                scene: {
                    opener: 'dedicated-page',
                    headingMode: 'scene-number',
                    suppressHeaderFooterOnOpener: true,
                    openerHeadingModes: ['scene-number', 'scene-number-title', 'title-only'],
                    openerSpacing: { topFraction: 0.2, bottomFraction: 0.1 },
                },
            }));
            expect(tex).toContain('\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.1\\textheight}');
            expect(tex).toContain('\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.1\\textheight}');
        });

        it('falls back to the documented 0.2/0.2 default when scene.openerSpacing is omitted', () => {
            const tex = generateDesignedStyleTex(buildSpec({
                archetype: 'literary',
                scene: {
                    opener: 'dedicated-page',
                    headingMode: 'scene-number',
                    suppressHeaderFooterOnOpener: true,
                    openerHeadingModes: ['scene-number', 'scene-number-title', 'title-only'],
                },
            }));
            expect(tex).toContain('\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.2\\textheight}');
            expect(tex).toContain('\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.2\\textheight}');
        });
    });
});
