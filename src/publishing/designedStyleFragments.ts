/*
 * LaTeX fragment producers for the Designed Style generator.
 *
 * Each producer is a pure (spec) => string function that returns one named
 * snippet. The main generator (designedStyle.ts) composes these snippets
 * around a Pandoc $body$ skeleton.
 *
 * The output targets XeLaTeX/pdfLaTeX through Pandoc and is meant to compile,
 * not byte-match the bundled templates. Patterns adapted from
 * src/utils/pandocBundledLayouts.ts.
 */
import type { DesignedHeaderField, DesignedStyleSpec } from './designedStyle';

const DOC_PREAMBLE_LINES = [
    '\\providecommand{\\tightlist}{%',
    '  \\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}',
    '}',
];

const PACKAGES = [
    '\\usepackage{fontspec}',
    '\\usepackage{fancyhdr}',
    '\\usepackage{titlesec}',
    '\\usepackage{geometry}',
    '\\usepackage{setspace}',
    '\\usepackage{etoolbox}',
];

function escapeForLatex(value: string): string {
    return value
        .replace(/\\/g, '\\textbackslash{}')
        .replace(/[{}]/g, '')
        .replace(/[#$%&_^~]/g, m => `\\${m}`);
}

function paperGeometry(spec: DesignedStyleSpec): { width: string; height: string } {
    const paper = spec.paperSize;
    if (typeof paper === 'object') {
        return { width: `${paper.widthIn}in`, height: `${paper.heightIn}in` };
    }
    switch (paper) {
        case 'us-trade-6x9': return { width: '6in', height: '9in' };
        case 'us-letter':    return { width: '8.5in', height: '11in' };
        case 'a4':           return { width: '210mm', height: '297mm' };
        default:             return { width: '6in', height: '9in' };
    }
}

export function renderDocumentClass(spec: DesignedStyleSpec): string {
    // Use 'book' so chapters/parts are available. Twoside is required whenever
    // mirrored margins are on OR the running header is split (different even/odd
    // content) — `oneside` collapses page-side awareness and would break the
    // even/odd header pair.
    const opts = ['11pt'];
    const needsTwoside = spec.margins.mirrored
        || spec.runningHeader.mode === 'split-author-page-title-page'
        || spec.runningHeader.mode === 'left-title-right-context';
    opts.push(needsTwoside ? 'twoside' : 'oneside');
    if (spec.parts.openAny) opts.push('openany');
    return `\\documentclass[${opts.join(',')}]{book}`;
}

export function renderPreamble(spec: DesignedStyleSpec): string {
    const lines: string[] = [];
    lines.push(renderDocumentClass(spec));
    lines.push('');
    lines.push(...PACKAGES);
    lines.push('');
    lines.push(...DOC_PREAMBLE_LINES);
    return lines.join('\n');
}

export function renderGeometry(spec: DesignedStyleSpec): string {
    const { width, height } = paperGeometry(spec);
    const m = spec.margins;
    const innerKey = m.mirrored ? 'inner' : 'left';
    const outerKey = m.mirrored ? 'outer' : 'right';
    return [
        '\\geometry{',
        `  paperwidth=${width},`,
        `  paperheight=${height},`,
        `  top=${m.topIn}in,`,
        `  bottom=${m.bottomIn}in,`,
        `  ${innerKey}=${m.leftIn}in,`,
        `  ${outerKey}=${m.rightIn}in`,
        '}',
    ].join('\n');
}

const FONT_PRIMARY: Record<string, string> = {
    'sorts-mill-goudy': 'Sorts Mill Goudy',
    'latin-modern':     'Latin Modern Roman',
    'eb-garamond':      'EB Garamond',
    'crimson':          'Crimson Text',
    'system-serif':     'TeX Gyre Pagella',
};

export function renderFontspec(spec: DesignedStyleSpec): string {
    const primary = FONT_PRIMARY[spec.body.font] || 'TeX Gyre Pagella';
    const fallbacks = spec.body.fontFallbackChain.length > 0
        ? spec.body.fontFallbackChain
        : ['TeX Gyre Pagella', 'Times New Roman', 'Times'];

    const lines: string[] = [];
    lines.push('\\defaultfontfeatures{Ligatures=TeX}');

    // Build a nested IfFontExistsTF chain: primary -> fallback1 -> fallback2 -> ... -> Arial
    const chain = [primary, ...fallbacks];
    const letterSpacing = spec.runningHeader.letterSpacing;
    const emitHeaderFont = typeof letterSpacing === 'number' && letterSpacing > 0;

    let depth = 0;
    for (let i = 0; i < chain.length; i++) {
        const font = chain[i];
        const indent = '  '.repeat(depth);
        const inner = '  '.repeat(depth + 1);
        if (i === chain.length - 1) {
            // Last — terminal else uses Arial
            if (emitHeaderFont) {
                lines.push(`${indent}\\IfFontExistsTF{${font}}{`);
                lines.push(`${inner}\\setmainfont{${font}}`);
                lines.push(`${inner}\\newfontface\\headerfont{${font}}[LetterSpace=${letterSpacing.toFixed(1)}]`);
                lines.push(`${indent}}{`);
                lines.push(`${inner}\\setmainfont{Arial}`);
                lines.push(`${inner}\\newfontface\\headerfont{Arial}[LetterSpace=${Math.max(8, letterSpacing / 2).toFixed(1)}]`);
                lines.push(`${indent}}`);
            } else {
                lines.push(`${indent}\\IfFontExistsTF{${font}}{\\setmainfont{${font}}}{\\setmainfont{Arial}}`);
            }
        } else {
            lines.push(`${indent}\\IfFontExistsTF{${font}}{`);
            lines.push(`${inner}\\setmainfont{${font}}`);
            if (emitHeaderFont) {
                lines.push(`${inner}\\newfontface\\headerfont{${font}}[LetterSpace=${letterSpacing.toFixed(1)}]`);
            }
            lines.push(`${indent}}{`);
            depth += 1;
        }
    }
    // Close all the open else-branches.
    while (depth > 0) {
        depth -= 1;
        lines.push(`${'  '.repeat(depth)}}`);
    }
    return lines.join('\n');
}

function renderHeaderField(field: DesignedHeaderField | undefined): string {
    if (!field) return '';
    if (typeof field === 'object') {
        if ('literal' in field) return escapeForLatex(field.literal);
        return '';
    }
    switch (field) {
        case 'page':          return '\\thepage';
        case 'author':        return '\\AuthorName';
        case 'title':         return '\\BookTitle';
        case 'scene-context': return '\\rtSceneRunningTitle';
        case 'chapter':       return '\\leftmark';
        case 'empty':         return '';
        default:              return '';
    }
}

export function renderFancyhdr(spec: DesignedStyleSpec): string {
    const rh = spec.runningHeader;
    const lines: string[] = [];
    lines.push('\\newcommand{\\BookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}');
    lines.push('\\newcommand{\\AuthorName}{$if(author)$$for(author)$$author$$sep$, $endfor$$else$Author$endif$}');
    lines.push('\\providecommand{\\rtSceneRunningTitle}{}');
    // Modern Classic / Contemporary set the running scene title via \rtSetSceneRunningTitle.
    // Always emit the setter so manuscript assembly's calls are valid even when
    // the active layout doesn't display the field.
    lines.push('\\providecommand{\\rtSetSceneRunningTitle}[1]{\\gdef\\rtSceneRunningTitle{#1}\\markboth{\\BookTitle}{#1}}');
    lines.push('\\fancyhf{}');
    lines.push('\\renewcommand{\\headrulewidth}{0pt}');
    lines.push('\\renewcommand{\\footrulewidth}{0pt}');

    if (rh.mode === 'none') {
        lines.push('\\pagestyle{empty}');
        return lines.join('\n');
    }

    // Letter-spacing: use \KernedText{\MakeUppercase{...}} via the \headerfont face.
    const ls = rh.letterSpacing;
    const useKerned = typeof ls === 'number' && ls > 0;
    if (useKerned) {
        lines.push('\\newcommand{\\KernedText}[1]{{\\headerfont\\MakeUppercase{#1}}}');
        lines.push('\\newcommand{\\HeaderSeparator}{\\raisebox{0.2ex}{\\textbar}}');
    }
    const sansPrefix = rh.font === 'sans' ? '\\sffamily\\footnotesize\\nouppercase' : '';
    const wrapText = (inner: string): string => {
        if (useKerned) return `\\KernedText{${inner}}`;
        if (sansPrefix) return `${sansPrefix}{${inner}}`;
        return inner;
    };
    const wrapPage = (): string => useKerned ? '\\raisebox{0.2ex}{\\thepage}' : '\\thepage';
    const sep = useKerned ? '\\hspace{1em}\\HeaderSeparator\\hspace{1em}' : '\\hspace{1em}|\\hspace{1em}';

    if (rh.mode === 'centered-title') {
        lines.push(`\\fancyhead[C]{${wrapText('\\BookTitle')}}`);
    } else if (rh.mode === 'split-author-page-title-page') {
        lines.push(`\\fancyhead[CE]{${wrapPage()}${sep}${wrapText('\\AuthorName')}}`);
        lines.push(`\\fancyhead[CO]{${wrapText('\\BookTitle')}${sep}${wrapPage()}}`);
    } else if (rh.mode === 'left-title-right-context') {
        lines.push(`\\fancyhead[LE]{${wrapText('\\BookTitle')}}`);
        lines.push(`\\fancyhead[RO]{${wrapText('\\rtSceneRunningTitle')}}`);
    } else {
        // Custom field-by-field placement.
        const places: Array<[string, DesignedHeaderField | undefined]> = [
            ['LE', rh.evenLeft],   ['CE', rh.evenCenter], ['RE', rh.evenRight],
            ['LO', rh.oddLeft],    ['CO', rh.oddCenter],  ['RO', rh.oddRight],
        ];
        for (const [pos, field] of places) {
            const rendered = renderHeaderField(field);
            if (rendered) lines.push(`\\fancyhead[${pos}]{${wrapText(rendered)}}`);
        }
    }
    lines.push('\\pagestyle{fancy}');
    return lines.join('\n');
}

export function renderFolio(spec: DesignedStyleSpec): string {
    const lines: string[] = [];
    if (spec.folio.position === 'bottom-center') {
        lines.push('\\fancyfoot[C]{\\thepage}');
    } else if (spec.folio.position === 'none') {
        lines.push('\\fancyfoot{}');
    }
    // 'header' position is handled inside renderFancyhdr by including \thepage in headers.
    return lines.join('\n');
}

export function renderPartTitle(spec: DesignedStyleSpec): string {
    if (spec.parts.mode === 'off') return '';
    const lines: string[] = [];
    // Provide \rtPart{N} compatible with src/utils/manuscript.ts macro contract.
    lines.push('\\fancypagestyle{rtEmpty}{\\fancyhf{}\\renewcommand{\\headrulewidth}{0pt}\\renewcommand{\\footrulewidth}{0pt}}');
    lines.push('\\newcommand{\\rtPart}[1]{%');
    if (spec.parts.pageBreak) lines.push('  \\cleardoublepage');
    lines.push('  \\thispagestyle{rtEmpty}%');
    lines.push('  \\vspace*{2.1in}%');
    lines.push('  \\begin{center}');
    lines.push('    {\\sffamily\\bfseries\\Large PART~#1}');
    lines.push('  \\end{center}');
    lines.push('  \\vspace*{1.2in}%');
    if (spec.parts.pageBreak) lines.push('  \\cleardoublepage');
    lines.push('}');

    if (spec.parts.epigraph || spec.epigraph.enabled) {
        lines.push('\\newcommand{\\rtEpigraph}[2]{%');
        // own-page placement starts on a fresh page after PART.
        if (spec.parts.epigraphPlacement === 'own-page') {
            lines.push('  \\cleardoublepage');
        }
        lines.push('  \\thispagestyle{rtEmpty}%');
        lines.push('  \\vspace*{1.2in}%');
        lines.push('  \\begin{center}');
        lines.push('    \\begin{minipage}{0.68\\textwidth}');
        lines.push('      \\centering');
        lines.push(spec.epigraph.italic ? '      {\\itshape #1}\\par' : '      {#1}\\par');
        lines.push('      \\if\\relax\\detokenize{#2}\\relax\\else');
        if (spec.epigraph.attributionStyle === 'em-dash-caps') {
            lines.push('        \\vspace{0.25in}{\\small\\MakeUppercase{---#2}}\\par');
        } else {
            lines.push('        \\vspace{0.25in}{\\small #2}\\par');
        }
        lines.push('      \\fi');
        lines.push('    \\end{minipage}');
        lines.push('  \\end{center}');
        lines.push('  \\cleardoublepage');
        lines.push('}');
    }
    return lines.join('\n');
}

export function renderChapterTitle(spec: DesignedStyleSpec): string {
    if (spec.chapters.mode === 'off') {
        // Chapters off but secnumdepth=1 still needs to apply (Signature numbered scene markers).
        if (spec.chapters.secnumdepth === 1) {
            return '\\setcounter{secnumdepth}{1}';
        }
        return '';
    }
    const lines: string[] = [];
    if (typeof spec.chapters.secnumdepth === 'number') {
        lines.push(`\\setcounter{secnumdepth}{${spec.chapters.secnumdepth}}`);
    }
    // Chapter heading spacing override (Contemporary's deep-page layout).
    const sp = spec.chapters.spacing;
    if (sp && (sp.topFraction != null || sp.bottomFraction != null)) {
        const top = sp.topFraction ?? 0.4;
        const bottom = sp.bottomFraction ?? 0.1;
        lines.push(`\\titleformat{\\chapter}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}`);
        lines.push(`\\titlespacing*{\\chapter}{0pt}{${top}\\textheight}{${bottom}\\textheight}`);
        lines.push('\\preto\\chapter{\\clearpage\\thispagestyle{empty}}');
    }
    lines.push('\\newcommand{\\rtChapter}[2]{%');
    if (spec.chapters.pageBreak) lines.push('  \\cleardoublepage');
    lines.push('  \\refstepcounter{chapter}%');
    lines.push('  \\thispagestyle{rtEmpty}%');
    lines.push('  \\vspace*{1.9in}%');
    lines.push('  \\begin{center}');
    if (spec.chapters.mode === 'numbered' || spec.chapters.mode === 'numbered-titled') {
        lines.push('    {\\sffamily\\bfseries\\large Chapter~#1}\\par');
    }
    if (spec.chapters.mode === 'titled' || spec.chapters.mode === 'numbered-titled') {
        lines.push('    \\vspace{0.35in}%');
        lines.push('    {\\rmfamily\\itshape\\Large #2}\\par');
    }
    lines.push('  \\end{center}');
    lines.push('  \\vspace*{0.9in}%');
    lines.push('}');
    if (spec.chapters.resetSceneCounter) {
        lines.push('\\newcounter{rtSceneCounter}');
    }
    return lines.join('\n');
}

export function renderSceneOpener(spec: DesignedStyleSpec): string {
    const lines: string[] = [];
    const glyph = spec.scene.separatorGlyph
        ? escapeForLatex(spec.scene.separatorGlyph)
        : '* * *';

    // First-word emphasis helper used by Standard / Contemporary.
    if (spec.scene.firstWordEmphasisOnOpener) {
        lines.push('\\setcounter{secnumdepth}{0}');
        lines.push('\\makeatletter');
        lines.push('\\newcommand{\\rtSceneOpenerTitle}[1]{%');
        lines.push('  \\begingroup');
        lines.push('  \\def\\rt@sceneFirst{}%');
        lines.push('  \\rt@sceneFirstWord#1 \\@nil');
        lines.push('  \\rt@sceneFirst');
        lines.push('  \\endgroup');
        lines.push('}');
        lines.push('\\def\\rt@sceneFirstWord#1 #2\\@nil{\\def\\rt@sceneFirst{#1}}');
        lines.push('\\makeatother');
    }

    if (spec.scene.opener === 'inline-separator') {
        lines.push(`\\newcommand{\\rtSceneSep}{\\par\\vspace{1.2em}\\begin{center}${glyph}\\end{center}\\vspace{1.2em}}`);
    } else if (spec.scene.opener === 'dedicated-page') {
        lines.push('\\newcommand{\\rtSceneSep}{%');
        lines.push('  \\cleardoublepage');
        if (spec.scene.suppressHeaderFooterOnOpener) lines.push('  \\thispagestyle{empty}%');
        lines.push('  \\vspace*{2in}%');
        lines.push(`  \\begin{center}{\\Large ${glyph}}\\end{center}`);
        lines.push('  \\vspace*{1in}%');
        lines.push('}');
        // Standard / Contemporary scene openers are emitted by the assembler as
        // \section*{heading} (the latex-section-starred path). Hook \section so
        // titlesec formatting, page breaks, and chrome suppression actually fire.
        // Previous code hooked \subsection — which never matched the assembler's
        // \section* calls, leaving formatting dead.
        if (spec.scene.firstWordEmphasisOnOpener) {
            lines.push('\\titleformat{\\section}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{\\rtSceneOpenerTitle}');
            lines.push('\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{\\rtSceneOpenerTitle}');
            lines.push('\\titlespacing*{\\section}{0pt}{0.16\\textheight}{0.12\\textheight}');
            lines.push('\\preto\\section{\\clearpage\\thispagestyle{empty}}');
        }
    } else if (spec.scene.opener === 'roman-with-rule') {
        lines.push('\\newcounter{rtscene}');
        lines.push('\\setcounter{rtscene}{0}');
        lines.push('\\newcommand{\\rtSceneSep}{%');
        lines.push('  \\par\\bigskip');
        lines.push('  \\stepcounter{rtscene}%');
        lines.push('  \\begin{center}');
        lines.push('    {\\rmfamily\\small\\roman{rtscene}.}\\par');
        lines.push('    \\vspace{0.08in}%');
        lines.push('    \\rule{1.2in}{0.4pt}%');
        lines.push('  \\end{center}');
        lines.push('  \\bigskip\\par');
        lines.push('}');
    }

    // Signature Literary's three-mode scene opener heading: emit numbered scene
    // sections via titlesec hooks. The actual mode (number / number+title /
    // title-only) is selected at export time by the assembler emitting either
    // \section{N} or \section*{Title} — these formatters render either correctly.
    if (spec.scene.openerHeadingModes && spec.scene.openerHeadingModes.length > 0) {
        const openerTop = spec.scene.openerSpacing?.topFraction ?? 0.2;
        const openerBottom = spec.scene.openerSpacing?.bottomFraction ?? 0.2;
        lines.push('\\titleformat{\\section}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{\\arabic{section}}{0.2em}{}');
        lines.push('\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{}{0pt}{}');
        lines.push(`\\titlespacing*{\\section}{0pt}{${openerTop}\\textheight}{${openerBottom}\\textheight}`);
        lines.push('\\preto\\section{\\clearpage\\thispagestyle{empty}}');
        lines.push('\\titleformat{\\subsection}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{\\arabic{subsection}}{0.2em}{}');
        lines.push('\\titleformat{name=\\subsection,numberless}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{}{0pt}{}');
        lines.push(`\\titlespacing*{\\subsection}{0pt}{${openerTop}\\textheight}{${openerBottom}\\textheight}`);
        lines.push('\\preto\\subsection{\\clearpage\\thispagestyle{empty}}');
    }
    return lines.join('\n');
}

export function renderEpigraphMacros(spec: DesignedStyleSpec): string {
    if (!spec.epigraph.enabled) return '';
    // \rtEpigraph is emitted alongside parts when parts are on; emit a standalone
    // version only when parts are off so the macro is still defined.
    if (spec.parts.mode !== 'off') return '';
    const lines: string[] = [];
    lines.push('\\newcommand{\\rtEpigraph}[2]{%');
    lines.push('  \\begin{center}');
    lines.push('    \\begin{minipage}{0.68\\textwidth}');
    lines.push('      \\centering');
    lines.push(spec.epigraph.italic ? '      {\\itshape #1}\\par' : '      {#1}\\par');
    lines.push('      \\if\\relax\\detokenize{#2}\\relax\\else');
    if (spec.epigraph.attributionStyle === 'em-dash-caps') {
        lines.push('        \\vspace{0.25in}{\\small\\MakeUppercase{---#2}}\\par');
    } else {
        lines.push('        \\vspace{0.25in}{\\small #2}\\par');
    }
    lines.push('      \\fi');
    lines.push('    \\end{minipage}');
    lines.push('  \\end{center}');
    lines.push('}');
    return lines.join('\n');
}

export function renderBodySetup(spec: DesignedStyleSpec): string {
    const lines: string[] = [];
    if (spec.body.microtype) {
        lines.push('\\usepackage{microtype}');
    }
    const ls = spec.body.lineSpacing;
    if (Math.abs(ls - 1.5) < 0.001) {
        lines.push('\\onehalfspacing');
    } else if (Math.abs(ls - 2.0) < 0.001) {
        lines.push('\\doublespacing');
    } else {
        lines.push(`\\setstretch{${ls}}`);
    }
    if (spec.body.paragraphIndentEm != null) {
        lines.push(`\\setlength{\\parindent}{${spec.body.paragraphIndentEm}em}`);
    }
    if (spec.folio.format === 'roman-frontmatter') {
        // No-op; pandoc-driven frontmatter not modelled here.
    }
    return lines.join('\n');
}
