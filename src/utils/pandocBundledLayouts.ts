import { normalizePath, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { PandocLayoutTemplate } from '../types';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { SHARED_CHAPTER_FIELD_PUBLICATION_COPY } from './timelineChapters';
import { getPandocLayoutSortRank } from '../publishing/templateTiering';

interface BundledPandocLayoutTemplate extends PandocLayoutTemplate {
    bundled: true;
    content: string;
}

const BUNDLED_FICTION_SIGNATURE_ID = 'bundled-fiction-signature-literary';
const BUNDLED_FICTION_CLASSIC_ID = 'bundled-fiction-classic-manuscript';
const BUNDLED_FICTION_MODERN_CLASSIC_ID = 'bundled-fiction-modern-classic';
const BUNDLED_FICTION_CONTEMPORARY_ID = 'bundled-fiction-contemporary-literary';

const LEGACY_BUNDLED_LAYOUT_ID_MAP: Record<string, string> = {
    'bundled-novel': BUNDLED_FICTION_SIGNATURE_ID,
    'bundled-novel-signature-literary-rt': BUNDLED_FICTION_SIGNATURE_ID,
};
const LEGACY_BUNDLED_LAYOUT_BASENAME_MAP: Record<string, string> = {
    'signature_literary_rt.tex': BUNDLED_FICTION_SIGNATURE_ID,
};

function basenameOfPath(value: string): string {
    return value.split(/[\\/]/).pop() || value;
}

function isAbsolutePath(value: string): boolean {
    return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

const LEGACY_SIGNATURE_SECTION_SPACING = '\\titlespacing*{\\section}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}';
const LEGACY_SIGNATURE_SUBSECTION_SPACING = '\\titlespacing*{\\subsection}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}';
const FIXED_SIGNATURE_SECTION_SPACING = '\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.2\\textheight}';
const FIXED_SIGNATURE_SUBSECTION_SPACING = '\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.2\\textheight}';
const LEGACY_SIGNATURE_MIRRORED_MARGINS = [
    '  inner=1.05in,',
    '  outer=0.75in'
].join('\n');
const FIXED_SIGNATURE_SYMMETRIC_MARGINS = [
    '  left=0.9in,',
    '  right=0.9in'
].join('\n');

function normalizeLegacySignatureSpacing(content: string): { content: string; changed: boolean } {
    let updated = content;
    updated = updated.replace(LEGACY_SIGNATURE_SECTION_SPACING, FIXED_SIGNATURE_SECTION_SPACING);
    updated = updated.replace(LEGACY_SIGNATURE_SUBSECTION_SPACING, FIXED_SIGNATURE_SUBSECTION_SPACING);
    return { content: updated, changed: updated !== content };
}

function normalizeSignatureSymmetricMargins(content: string): { content: string; changed: boolean } {
    if (!content.includes('% Pandoc LaTeX Template - Signature Literary')) {
        return { content, changed: false };
    }
    const updated = content.replace(LEGACY_SIGNATURE_MIRRORED_MARGINS, FIXED_SIGNATURE_SYMMETRIC_MARGINS);
    return { content: updated, changed: updated !== content };
}

const CORE_SCENE_OPENER_HELPER_LINES = [
    '\\setcounter{secnumdepth}{0}',
    '\\makeatletter',
    '\\newcommand{\\rtSceneOpenerTitle}[1]{%',
    '  \\begingroup',
    '  \\def\\rt@sceneFirst{}%',
    '  \\rt@sceneFirstWord#1 \\@nil',
    '  \\rt@sceneFirst',
    '  \\endgroup',
    '}',
    '\\def\\rt@sceneFirstWord#1 #2\\@nil{\\def\\rt@sceneFirst{#1}}',
    '\\makeatother',
].join('\n');

const STANDARD_MANUSCRIPT_LEGACY_HEADING_BLOCK = [
    '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
    '\\titlespacing*{\\section}{0pt}{0.16\\textheight}{0.12\\textheight}',
    '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
].join('\n');

const STANDARD_MANUSCRIPT_HEADING_BLOCK = [
    CORE_SCENE_OPENER_HELPER_LINES,
    '\\titleformat{\\section}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
    '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
    '\\titlespacing*{\\section}{0pt}{0.16\\textheight}{0.12\\textheight}',
    '\\titleformat{\\subsection}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{\\rtSceneOpenerTitle}',
    '\\titleformat{name=\\subsection,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{\\rtSceneOpenerTitle}',
    '\\titlespacing*{\\subsection}{0pt}{0.16\\textheight}{0.12\\textheight}',
    '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
    '\\preto\\subsection{\\clearpage\\thispagestyle{empty}}',
].join('\n');

const CONTEMPORARY_LITERARY_LEGACY_HEADING_BLOCK = [
    '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
    '\\titlespacing*{\\section}{0pt}{0.18\\textheight}{0.14\\textheight}',
    '\\preto\\chapter{\\clearpage\\thispagestyle{empty}}',
    '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
].join('\n');

const CONTEMPORARY_LITERARY_HEADING_BLOCK = [
    CORE_SCENE_OPENER_HELPER_LINES,
    '\\titleformat{\\chapter}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
    '\\titlespacing*{\\chapter}{0pt}{0.18\\textheight}{0.14\\textheight}',
    '\\titleformat{\\section}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
    '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
    '\\titlespacing*{\\section}{0pt}{0.18\\textheight}{0.14\\textheight}',
    '\\titleformat{\\subsection}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{\\rtSceneOpenerTitle}',
    '\\titleformat{name=\\subsection,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{\\rtSceneOpenerTitle}',
    '\\titlespacing*{\\subsection}{0pt}{0.18\\textheight}{0.14\\textheight}',
    '\\preto\\chapter{\\clearpage\\thispagestyle{empty}}',
    '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
    '\\preto\\subsection{\\clearpage\\thispagestyle{empty}}',
].join('\n');

function normalizeCoreTemplateSceneOpeners(
    content: string,
    layoutId: string
): { content: string; changed: boolean } {
    const isStandard = layoutId === BUNDLED_FICTION_CLASSIC_ID
        && content.includes('% Pandoc LaTeX Template - Standard Manuscript');
    const isContemporary = layoutId === BUNDLED_FICTION_CONTEMPORARY_ID
        && content.includes('% Pandoc LaTeX Template - Contemporary Literary');
    if (!isStandard && !isContemporary) return { content, changed: false };

    const legacyBlock = isStandard
        ? STANDARD_MANUSCRIPT_LEGACY_HEADING_BLOCK
        : CONTEMPORARY_LITERARY_LEGACY_HEADING_BLOCK;
    const fixedBlock = isStandard
        ? STANDARD_MANUSCRIPT_HEADING_BLOCK
        : CONTEMPORARY_LITERARY_HEADING_BLOCK;

    if (content.includes(fixedBlock)) return { content, changed: false };
    const updated = content.includes(legacyBlock)
        ? content.replace(legacyBlock, fixedBlock)
        : content;
    return { content: updated, changed: updated !== content };
}

const LEGACY_MODERN_CLASSIC_TITLE_CAPTURE = [
    '% --- capture Pandoc title/author ---',
    '\\makeatletter',
    '\\newcommand{\\rtBookTitle}{\\@title}',
    '\\newcommand{\\rtBookAuthor}{\\@author}',
    '\\makeatother'
].join('\n');

const MODERN_CLASSIC_TITLE_BINDINGS = [
    '% --- capture Pandoc title/author ---',
    '\\newcommand{\\rtBookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}',
    '\\newcommand{\\rtBookAuthor}{$if(author)$$for(author)$$author$$sep$, $endfor$$else$Author$endif$}'
].join('\n');

const MODERN_CLASSIC_RTPART_BLOCK = [
    '\\newcommand{\\rtPart}[1]{%',
    '  \\cleardoublepage',
    '  \\thispagestyle{rtEmpty}%',
    '  \\vspace*{2.1in}%',
    '  \\begin{center}',
    '    {\\sffamily\\bfseries\\Large PART~#1}',
    '  \\end{center}',
    '  \\vspace*{1.2in}%',
    '  \\cleardoublepage',
    '}'
].join('\n');

const MODERN_CLASSIC_MISSING_MACRO_DEFINITIONS = [
    '',
    '% Epigraph emitted after an RT Part page when configured.',
    '\\newcommand{\\rtEpigraph}[2]{%',
    '  \\thispagestyle{rtEmpty}%',
    '  \\vspace*{1.2in}%',
    '  \\begin{center}',
    '    \\begin{minipage}{0.68\\textwidth}',
    '      \\centering',
    '      {\\itshape #1}\\par',
    '      \\if\\relax\\detokenize{#2}\\relax\\else',
    '        \\vspace{0.25in}{\\small #2}\\par',
    '      \\fi',
    '    \\end{minipage}',
    '  \\end{center}',
    '  \\cleardoublepage',
    '}',
    '',
    '% Chapter opener emitted from RT Chapter frontmatter markers.',
    '\\newcommand{\\rtChapter}[2]{%',
    '  \\cleardoublepage',
    '  \\refstepcounter{chapter}%',
    '  \\thispagestyle{rtEmpty}%',
    '  \\vspace*{1.9in}%',
    '  \\begin{center}',
    '    {\\sffamily\\bfseries\\large Chapter~#1}\\par',
    '    \\vspace{0.35in}%',
    '    {\\rmfamily\\itshape\\Large #2}\\par',
    '  \\end{center}',
    '  \\vspace*{0.9in}%',
    '}'
].join('\n');

function normalizeModernClassicMacroContract(content: string): { content: string; changed: boolean } {
    const isModernClassicBundledTemplate = content.includes('% rt_modern_classic.tex')
        && content.includes('% Modern Classic fiction layout for 6x9 trade')
        && content.includes('\\newcommand{\\rtPart}[1]');
    if (!isModernClassicBundledTemplate) {
        return { content, changed: false };
    }

    let updated = content;
    updated = updated.replace(LEGACY_MODERN_CLASSIC_TITLE_CAPTURE, () => MODERN_CLASSIC_TITLE_BINDINGS);

    const missingRtEpigraph = !/\\newcommand\{\\rtEpigraph\}/.test(updated);
    const missingRtChapter = !/\\newcommand\{\\rtChapter\}/.test(updated);
    if ((missingRtEpigraph || missingRtChapter) && updated.includes(MODERN_CLASSIC_RTPART_BLOCK)) {
        updated = updated.replace(
            MODERN_CLASSIC_RTPART_BLOCK,
            () => `${MODERN_CLASSIC_RTPART_BLOCK}\n${MODERN_CLASSIC_MISSING_MACRO_DEFINITIONS}`
        );
    }

    return { content: updated, changed: updated !== content };
}

function resolveCanonicalBundledLayoutId(layout: PandocLayoutTemplate, canonicalIds: Set<string>): string | null {
    const rawId = (layout.id || '').trim();
    if (canonicalIds.has(rawId)) return rawId;

    const mappedById = LEGACY_BUNDLED_LAYOUT_ID_MAP[rawId];
    if (mappedById && canonicalIds.has(mappedById)) return mappedById;

    const normalizedPath = normalizePath((layout.path || '').trim().replace(/^\/+/, ''));
    const basename = basenameOfPath(normalizedPath).toLowerCase();
    const mappedByPath = LEGACY_BUNDLED_LAYOUT_BASENAME_MAP[basename];
    if (mappedByPath && canonicalIds.has(mappedByPath)) return mappedByPath;

    return null;
}

const BUNDLED_PANDOC_LAYOUT_TEMPLATES: BundledPandocLayoutTemplate[] = [
    {
        id: 'bundled-screenplay',
        name: 'Screenplay',
        preset: 'screenplay',
        path: 'screenplay_template.tex',
        bundled: true,
        tier: 'pro',
        templateKind: 'screenplay',
        description: 'Industry screenplay format with uppercase sluglines, dialogue-first spacing, and production-safe margins. Page numbers run in the header with a Courier-family typewriter look.',
        content: [
            '% Pandoc LaTeX Template - Screenplay Format',
            '% US industry standard: Courier 12pt, specific margins',
            '\\documentclass[12pt,letterpaper]{article}',
            '',
            '\\usepackage[top=1in,bottom=1in,left=1.5in,right=1in]{geometry}',
            '\\usepackage{fontspec}',
            '\\usepackage{parskip}',
            '',
            '% Courier is the screenplay standard',
            '\\setmainfont{Courier New}[',
            '  BoldFont={Courier New Bold},',
            '  ItalicFont={Courier New Italic}',
            ']',
            '',
            '\\pagestyle{plain}',
            '\\setlength{\\parindent}{0pt}',
            '\\setlength{\\parskip}{12pt}',
            '',
            '% Disable hyphenation (screenplay convention)',
            '\\hyphenpenalty=10000',
            '\\exhyphenpenalty=10000',
            '',
            '\\begin{document}',
            '',
            '$body$',
            '',
            '\\end{document}'
        ].join('\n')
    },
    {
        id: 'bundled-podcast',
        name: 'Podcast Script',
        preset: 'podcast',
        path: 'podcast_template.tex',
        bundled: true,
        tier: 'pro',
        templateKind: 'podcast',
        description: 'Narration-first script format with speaker/segment clarity, timing-friendly spacing, and clean cue separation. Header metadata and page numbering are positioned for fast booth or desk reference.',
        content: [
            '% Pandoc LaTeX Template - Podcast Script Format',
            '% Clean sans-serif for audio production scripts',
            '\\documentclass[11pt,letterpaper]{article}',
            '',
            '\\usepackage[top=1in,bottom=1in,left=1in,right=1in]{geometry}',
            '\\usepackage{fontspec}',
            '\\usepackage{parskip}',
            '',
            '% Clean sans-serif for readability',
            '\\setmainfont{Helvetica Neue}[',
            '  BoldFont={Helvetica Neue Bold},',
            '  ItalicFont={Helvetica Neue Italic}',
            ']',
            '',
            '\\pagestyle{plain}',
            '\\setlength{\\parindent}{0pt}',
            '\\setlength{\\parskip}{8pt}',
            '',
            '\\begin{document}',
            '',
            '$body$',
            '',
            '\\end{document}'
        ].join('\n')
    },
    {
        id: BUNDLED_FICTION_SIGNATURE_ID,
        name: 'Signature Literary',
        preset: 'novel',
        path: 'rt_signature_literary.tex',
        bundled: true,
        tier: 'pro',
        templateKind: 'book',
        hasSceneOpenerHeadingOptions: true,
        description: 'Page numbers are header-only: the left-page header pairs page number with author, and the right-page header pairs title with page number. Scene opener pages use generous vertical spacing and suppress headers and folios. Refined serif body typography.',
        content: [
            '% Pandoc LaTeX Template - Signature Literary',
            '% Refined fiction layout with alternating running heads.',
            '\\documentclass[11pt,letterpaper,twoside]{book}',
            '',
            '\\usepackage{fontspec}',
            '\\usepackage{amssymb}',
            '\\usepackage{fancyhdr}',
            '\\usepackage{titlesec}',
            '\\usepackage{geometry}',
            '\\usepackage{setspace}',
            '\\usepackage{graphicx}',
            '\\usepackage{etoolbox}',
            '',
            '\\providecommand{\\tightlist}{%',
            '  \\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}',
            '}',
            '',
            '\\geometry{',
            '  paperwidth=6in,',
            '  paperheight=9in,',
            '  top=0.85in,',
            '  bottom=1.05in,',
            '  left=0.9in,',
            '  right=0.9in',
            '}',
            '',
            '\\defaultfontfeatures{Ligatures=TeX}',
            '\\IfFontExistsTF{Sorts Mill Goudy}{',
            '  \\setmainfont{Sorts Mill Goudy}[ItalicFont={Sorts Mill Goudy Italic}]',
            '  \\newfontface\\headerfont{Sorts Mill Goudy}[LetterSpace=15.0]',
            '}{',
            '  \\IfFontExistsTF{TeX Gyre Pagella}{',
            '    \\setmainfont{TeX Gyre Pagella}',
            '    \\newfontface\\headerfont{TeX Gyre Pagella}[LetterSpace=12.0]',
            '  }{',
            '    \\IfFontExistsTF{Times New Roman}{',
            '      \\setmainfont{Times New Roman}',
            '      \\newfontface\\headerfont{Times New Roman}[LetterSpace=8.0]',
            '    }{',
            '      \\IfFontExistsTF{Times}{',
            '        \\setmainfont{Times}',
            '        \\newfontface\\headerfont{Times}[LetterSpace=8.0]',
            '      }{',
            '        \\setmainfont{Arial}',
            '        \\newfontface\\headerfont{Arial}[LetterSpace=8.0]',
            '      }',
            '    }',
            '  }',
            '}',
            '',
            '\\newcommand{\\BookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}',
            '\\newcommand{\\AuthorName}{$if(author)$$for(author)$$author$$sep$, $endfor$$else$Author$endif$}',
            '',
            '\\fancyhf{}',
            '\\renewcommand{\\headrulewidth}{0pt}',
            '\\renewcommand{\\footrulewidth}{0pt}',
            '\\setlength{\\parskip}{0pt}',
            '\\setlength{\\headsep}{24pt}',
            '\\setlength{\\headheight}{14pt}',
            '',
            '\\newcommand{\\KernedText}[1]{{\\headerfont\\MakeUppercase{#1}}}',
            '\\newcommand{\\PageNumber}[1]{\\raisebox{0.2ex}{#1}}',
            '\\newcommand{\\HeaderSeparator}{\\raisebox{0.2ex}{\\textbar}}',
            '',
            '\\fancyhead[CE]{%',
            '  \\ifnum\\value{page}=1\\relax\\else',
            '    \\PageNumber{\\thepage}\\hspace{1em}\\HeaderSeparator\\hspace{1em}\\KernedText{\\AuthorName}',
            '  \\fi',
            '}',
            '\\fancyhead[CO]{%',
            '  \\ifnum\\value{page}=1\\relax\\else',
            '    \\KernedText{\\BookTitle}\\hspace{1em}\\HeaderSeparator\\hspace{1em}\\PageNumber{\\thepage}',
            '  \\fi',
            '}',
            '\\fancyfoot{}',
            '\\pagestyle{fancy}',
            '',
            '\\setcounter{secnumdepth}{1}',
            '',
            '\\titleformat{\\section}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{\\arabic{section}}{0.2em}{}',
            '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{}{0pt}{}',
            '\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.2\\textheight}',
            '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
            '',
            '\\titleformat{\\subsection}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{\\arabic{subsection}}{0.2em}{}',
            '\\titleformat{name=\\subsection,numberless}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{}{0pt}{}',
            '\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.2\\textheight}',
            '\\preto\\subsection{\\clearpage\\thispagestyle{empty}}',
            '',
            '\\onehalfspacing',
            '\\setlength{\\parindent}{1.5em}',
            '',
            '\\begin{document}',
            '\\setcounter{page}{1}',
            '',
            '$body$',
            '',
            '\\end{document}'
        ].join('\n')
    },
    {
        id: BUNDLED_FICTION_CLASSIC_ID,
        name: 'Standard Manuscript',
        preset: 'novel',
        path: 'rt_classic_manuscript.tex',
        bundled: true,
        tier: 'free',
        templateKind: 'book',
        description: 'Centered running header with book title and bottom-centered page numbers. One-inch margins, 1.5 line spacing, serif body text, and minimal ornamentation.',
        content: [
            '% Pandoc LaTeX Template - Standard Manuscript',
            '% Traditional manuscript layout with simple headers and centered folios.',
            '\\documentclass[11pt,letterpaper,twoside]{book}',
            '',
            '\\usepackage{fontspec}',
            '\\usepackage{fancyhdr}',
            '\\usepackage{titlesec}',
            '\\usepackage{geometry}',
            '\\usepackage{setspace}',
            '\\usepackage{etoolbox}',
            '',
            '\\providecommand{\\tightlist}{%',
            '  \\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}',
            '}',
            '',
            '\\geometry{paperwidth=6in,paperheight=9in,top=1in,bottom=1in,inner=1in,outer=1in}',
            '',
            '\\defaultfontfeatures{Ligatures=TeX}',
            '\\IfFontExistsTF{Sorts Mill Goudy}{',
            '  \\setmainfont{Sorts Mill Goudy}[ItalicFont={Sorts Mill Goudy Italic}]',
            '}{',
            '  \\IfFontExistsTF{TeX Gyre Pagella}{',
            '    \\setmainfont{TeX Gyre Pagella}',
            '  }{',
            '    \\IfFontExistsTF{Times New Roman}{',
            '      \\setmainfont{Times New Roman}',
            '    }{',
            '      \\IfFontExistsTF{Times}{\\setmainfont{Times}}{\\setmainfont{Arial}}',
            '    }',
            '  }',
            '}',
            '',
            '\\newcommand{\\BookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}',
            '',
            '\\fancyhf{}',
            '\\renewcommand{\\headrulewidth}{0pt}',
            '\\renewcommand{\\footrulewidth}{0pt}',
            '\\fancyhead[C]{\\nouppercase{\\BookTitle}}',
            '\\fancyfoot[C]{\\thepage}',
            '\\pagestyle{fancy}',
            '',
            '\\fancypagestyle{plain}{%',
            '  \\fancyhf{}',
            '  \\fancyhead[C]{\\nouppercase{\\BookTitle}}',
            '  \\fancyfoot[C]{\\thepage}',
            '  \\renewcommand{\\headrulewidth}{0pt}',
            '  \\renewcommand{\\footrulewidth}{0pt}',
            '}',
            '',
            STANDARD_MANUSCRIPT_HEADING_BLOCK,
            '',
            '\\onehalfspacing',
            '\\setlength{\\parindent}{1.5em}',
            '',
            '\\begin{document}',
            '',
            '$body$',
            '',
            '\\end{document}'
        ].join('\n')
    },
    {
        id: BUNDLED_FICTION_CONTEMPORARY_ID,
        name: 'Contemporary Literary',
        preset: 'novel',
        path: 'rt_contemporary_literary.tex',
        bundled: true,
        tier: 'free',
        templateKind: 'book',
        description: 'Running headers show book title on even pages and section context on odd pages. Page numbers are centered at the bottom. Chapter and section opener pages suppress headers and page numbers.',
        content: [
            '% Pandoc LaTeX Template - Contemporary Literary',
            '% Running headers: title (left pages) and section title (right pages).',
            '\\documentclass[11pt,letterpaper,twoside]{book}',
            '',
            '\\usepackage{fontspec}',
            '\\usepackage{fancyhdr}',
            '\\usepackage{titlesec}',
            '\\usepackage{geometry}',
            '\\usepackage{setspace}',
            '\\usepackage{etoolbox}',
            '',
            '\\providecommand{\\tightlist}{%',
            '  \\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}',
            '}',
            '',
            '\\geometry{',
            '  paperwidth=6in,',
            '  paperheight=9in,',
            '  top=0.9in,',
            '  bottom=1.0in,',
            '  inner=1.05in,',
            '  outer=0.75in',
            '}',
            '',
            '\\defaultfontfeatures{Ligatures=TeX}',
            '\\IfFontExistsTF{Sorts Mill Goudy}{',
            '  \\setmainfont{Sorts Mill Goudy}[ItalicFont={Sorts Mill Goudy Italic}]',
            '}{',
            '  \\IfFontExistsTF{TeX Gyre Pagella}{',
            '    \\setmainfont{TeX Gyre Pagella}',
            '  }{',
            '    \\IfFontExistsTF{Times New Roman}{',
            '      \\setmainfont{Times New Roman}',
            '    }{',
            '      \\IfFontExistsTF{Times}{\\setmainfont{Times}}{\\setmainfont{Arial}}',
            '    }',
            '  }',
            '}',
            '',
            '\\newcommand{\\BookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}',
            '',
            '\\fancyhf{}',
            '\\renewcommand{\\headrulewidth}{0pt}',
            '\\renewcommand{\\footrulewidth}{0pt}',
            '\\renewcommand{\\sectionmark}[1]{\\markright{#1}}',
            '\\fancyhead[LE]{\\sffamily\\footnotesize\\nouppercase{\\BookTitle}}',
            '\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{\\rightmark}}',
            '\\fancyfoot[C]{\\rmfamily\\footnotesize\\thepage}',
            '\\pagestyle{fancy}',
            '',
            CONTEMPORARY_LITERARY_HEADING_BLOCK,
            '',
            '\\onehalfspacing',
            '\\setlength{\\parindent}{1.5em}',
            '',
            '\\begin{document}',
            '',
            '$body$',
            '',
            '\\end{document}'
        ].join('\n')
    },
    {
        id: BUNDLED_FICTION_MODERN_CLASSIC_ID,
        name: 'Modern Classic',
        preset: 'novel',
        path: 'rt_modern_classic.tex',
        bundled: true,
        tier: 'pro',
        templateKind: 'book',
        usesModernClassicStructure: true,
        hasEpigraphs: true,
        description: `Acts can open with optional epigraphs and Roman numeral PART pages. ${SHARED_CHAPTER_FIELD_PUBLICATION_COPY} Centered headers pair page number with author (even) or title with page number (odd). Scene breaks use lower-case Roman numerals with a short rule.`,
        content: [
            '% rt_modern_classic.tex',
            '% Modern Classic fiction layout for 6x9 trade',
            '% Assumes Pandoc -> LaTeX with raw LaTeX blocks inserted by RT export pipeline.',
            '',
            '\\documentclass[11pt,twoside,openany]{book}',
            '',
            '% --- page geometry (6x9, print-friendly) ---',
            '\\usepackage[',
            '  paperwidth=6in,',
            '  paperheight=9in,',
            '  top=0.95in,',
            '  bottom=1.15in,',
            '  inner=1.10in,',
            '  outer=0.85in',
            ']{geometry}',
            '',
            '\\usepackage{microtype}',
            '\\usepackage[T1]{fontenc}',
            '\\usepackage{lmodern} % safe default; swap later if you prefer a specific serif family',
            '\\usepackage{setspace}',
            '\\setstretch{1.18} % slightly generous leading',
            '',
            '\\usepackage{fancyhdr}',
            '\\usepackage{titlesec}',
            '',
            '% --- Pandoc sometimes uses \\tightlist ---',
            '\\providecommand{\\tightlist}{%',
            '  \\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}}',
            '',
            '% --- capture Pandoc title/author ---',
            '\\newcommand{\\rtBookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}',
            '\\newcommand{\\rtBookAuthor}{$if(author)$$for(author)$$author$$sep$, $endfor$$else$Author$endif$}',
            '',
            '% --- fancyhdr setup ---',
            '\\pagestyle{fancy}',
            '\\fancyhf{} % clear everything',
            '% Even pages: centered page | author',
            '\\fancyhead[CE]{\\rmfamily\\footnotesize \\thepage\\enspace|\\enspace \\MakeUppercase{\\rtBookAuthor}}',
            '% Odd pages: centered title | page',
            '\\fancyhead[CO]{\\rmfamily\\footnotesize \\MakeUppercase{\\rtBookTitle}\\enspace|\\enspace \\thepage}',
            '% No footer',
            '\\fancyfoot{}',
            '\\renewcommand{\\headrulewidth}{0pt}',
            '\\renewcommand{\\footrulewidth}{0pt}',
            '',
            '% --- opener pages: no header/folio ---',
            '\\fancypagestyle{rtEmpty}{%',
            '  \\fancyhf{}',
            '  \\renewcommand{\\headrulewidth}{0pt}',
            '  \\renewcommand{\\footrulewidth}{0pt}',
            '}',
            '',
            '% --- Part macro + chapter styling ---',
            '% PART I (Roman numerals) --- big, centered',
            '\\newcommand{\\rtPart}[1]{%',
            '  \\cleardoublepage',
            '  \\thispagestyle{rtEmpty}%',
            '  \\vspace*{2.1in}%',
            '  \\begin{center}',
            '    {\\sffamily\\bfseries\\Large PART~#1}',
            '  \\end{center}',
            '  \\vspace*{1.2in}%',
            '  \\cleardoublepage',
            '}',
            '',
            '% Epigraph emitted after an RT Part page when configured.',
            '\\newcommand{\\rtEpigraph}[2]{%',
            '  \\thispagestyle{rtEmpty}%',
            '  \\vspace*{1.2in}%',
            '  \\begin{center}',
            '    \\begin{minipage}{0.68\\textwidth}',
            '      \\centering',
            '      {\\itshape #1}\\par',
            '      \\if\\relax\\detokenize{#2}\\relax\\else',
            '        \\vspace{0.25in}{\\small #2}\\par',
            '      \\fi',
            '    \\end{minipage}',
            '  \\end{center}',
            '  \\cleardoublepage',
            '}',
            '',
            '% Chapter opener emitted from RT Chapter frontmatter markers.',
            '\\newcommand{\\rtChapter}[2]{%',
            '  \\cleardoublepage',
            '  \\refstepcounter{chapter}%',
            '  \\thispagestyle{rtEmpty}%',
            '  \\vspace*{1.9in}%',
            '  \\begin{center}',
            '    {\\sffamily\\bfseries\\large Chapter~#1}\\par',
            '    \\vspace{0.35in}%',
            '    {\\rmfamily\\itshape\\Large #2}\\par',
            '  \\end{center}',
            '  \\vspace*{0.9in}%',
            '}',
            '',
            '% CHAPTER headings come from Pandoc H1 headings inserted by RT.',
            '\\titleformat{\\chapter}[display]{\\normalfont}{}{0pt}{%',
            '  \\thispagestyle{rtEmpty}%',
            '  \\vspace*{1.9in}%',
            '  \\begin{center}',
            '    {\\sffamily\\bfseries\\large Chapter~\\thechapter}\\par',
            '    \\vspace{0.35in}%',
            '    {\\rmfamily\\itshape\\Large #1}\\par',
            '  \\end{center}',
            '  \\vspace*{0.9in}%',
            '}',
            '\\titlespacing*{\\chapter}{0pt}{0pt}{0pt}',
            '',
            '% --- scene separator: i. + underline (centered) ---',
            '\\newcounter{rtscene}',
            '\\setcounter{rtscene}{0}',
            '\\newcommand{\\rtSceneSep}{%',
            '  \\par\\bigskip',
            '  \\stepcounter{rtscene}%',
            '  \\begin{center}',
            '    {\\rmfamily\\small\\roman{rtscene}.}\\par',
            '    \\vspace{0.08in}%',
            '    \\rule{1.2in}{0.4pt}%',
            '  \\end{center}',
            '  \\bigskip\\par',
            '}',
            '',
            '% --- keep Pandoc chapter headings, but suppress default section/subsection styling ---',
            '\\titleformat{\\section}{\\normalfont}{}{0pt}{}',
            '\\titlespacing*{\\section}{0pt}{0pt}{0pt}',
            '\\titleformat{\\subsection}{\\normalfont}{}{0pt}{}',
            '\\titlespacing*{\\subsection}{0pt}{0pt}{0pt}',
            '',
            '% --- document begins ---',
            '\\begin{document}',
            '',
            "% Pandoc will insert title/metadata; if you want no title page, remove \\maketitle.",
            '% For Modern Classic, you likely rely on BookMeta/matter pages instead.',
            "% If you don't want Pandoc's title page:",
            '% \\maketitle',
            '',
            '$body$',
            '',
            '\\end{document}'
        ].join('\n')
    }
];

export function getBundledPandocLayouts(): PandocLayoutTemplate[] {
    return BUNDLED_PANDOC_LAYOUT_TEMPLATES.map(layout => ({
        id: layout.id,
        name: layout.name,
        preset: layout.preset,
        path: layout.path,
        bundled: true,
        tier: layout.tier,
        templateKind: layout.templateKind,
        ...(layout.recommendedUse ? { recommendedUse: layout.recommendedUse } : {}),
        ...(layout.description ? { description: layout.description } : {}),
        ...(layout.usesModernClassicStructure === true ? { usesModernClassicStructure: true } : {}),
        ...(layout.hasEpigraphs === true ? { hasEpigraphs: true } : {}),
        ...(layout.hasSceneOpenerHeadingOptions === true ? { hasSceneOpenerHeadingOptions: true } : {})
    })).sort((a, b) => getPandocLayoutSortRank(a) - getPandocLayoutSortRank(b) || a.name.localeCompare(b.name));
}

export function ensureBundledPandocLayoutsRegistered(plugin: RadialTimelinePlugin): boolean {
    const canonicalLayouts = getBundledPandocLayouts();
    const canonicalIds = new Set(canonicalLayouts.map(layout => layout.id));
    const canonicalById = new Map(canonicalLayouts.map(layout => [layout.id, layout]));

    const existing = plugin.settings.pandocLayouts || [];
    const normalized: PandocLayoutTemplate[] = [];
    const seenBundledCanonicalIds = new Set<string>();
    let changed = false;

    for (const layout of existing) {
        if (!layout.bundled) {
            normalized.push(layout);
            continue;
        }

        const canonicalId = resolveCanonicalBundledLayoutId(layout, canonicalIds);
        if (!canonicalId) {
            changed = true;
            continue;
        }

        if (seenBundledCanonicalIds.has(canonicalId)) {
            changed = true;
            continue;
        }

        const canonical = canonicalById.get(canonicalId);
        if (!canonical) {
            changed = true;
            continue;
        }

        const migrated: PandocLayoutTemplate = {
            ...layout,
            id: canonical.id,
            name: canonical.name,
            preset: canonical.preset,
            path: canonical.path,
            bundled: true,
            tier: canonical.tier,
            templateKind: canonical.templateKind,
            recommendedUse: canonical.recommendedUse,
            // Bundled descriptions are authored in code and never user-edited; always refresh
            // from canonical so copy updates propagate on plugin upgrade.
            ...(canonical.description ? { description: canonical.description } : {}),
            ...(canonical.usesModernClassicStructure === true ? { usesModernClassicStructure: true } : {}),
            ...(canonical.hasEpigraphs === true ? { hasEpigraphs: true } : {}),
            ...(canonical.hasSceneOpenerHeadingOptions === true ? { hasSceneOpenerHeadingOptions: true } : {})
        };
        if (
            migrated.id !== layout.id
            || migrated.name !== layout.name
            || migrated.preset !== layout.preset
            || migrated.path !== layout.path
            || migrated.tier !== layout.tier
            || migrated.templateKind !== layout.templateKind
            || migrated.recommendedUse !== layout.recommendedUse
            || migrated.description !== layout.description
            || migrated.usesModernClassicStructure !== layout.usesModernClassicStructure
            || migrated.hasEpigraphs !== layout.hasEpigraphs
            || migrated.hasSceneOpenerHeadingOptions !== layout.hasSceneOpenerHeadingOptions
            || layout.bundled !== true
        ) {
            changed = true;
        }

        normalized.push(migrated);
        seenBundledCanonicalIds.add(canonicalId);
    }

    for (const canonical of canonicalLayouts) {
        if (seenBundledCanonicalIds.has(canonical.id)) continue;
        normalized.push({ ...canonical });
        seenBundledCanonicalIds.add(canonical.id);
        changed = true;
    }

    if (changed) {
        plugin.settings.pandocLayouts = normalized;
    }

    return changed;
}

function getPandocFolder(plugin: RadialTimelinePlugin): string {
    const defaultPandocFolder = normalizePath(DEFAULT_SETTINGS.pandocFolder || 'Radial Timeline/Pandoc');
    return normalizePath((plugin.settings.pandocFolder || defaultPandocFolder).trim() || defaultPandocFolder);
}

function resolveBundledVaultPath(plugin: RadialTimelinePlugin, relativePath: string): string {
    const normalized = normalizePath(relativePath.replace(/^\/+/, ''));
    const pandocFolder = getPandocFolder(plugin);
    return normalizePath(`${pandocFolder}/${normalized}`);
}

async function ensureFolderPath(plugin: RadialTimelinePlugin, folderPath: string): Promise<void> {
    const vault = plugin.app.vault;
    const parts = normalizePath(folderPath).split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (!vault.getAbstractFileByPath(current)) {
            await vault.createFolder(current);
        }
    }
}

export function isBundledPandocLayoutInstalled(plugin: RadialTimelinePlugin, layout: PandocLayoutTemplate): boolean {
    const trimmed = (layout.path || '').trim();
    if (!trimmed) return false;

    if (isAbsolutePath(trimmed)) return false;

    const normalized = normalizePath(trimmed.replace(/^\/+/, ''));
    const direct = plugin.app.vault.getAbstractFileByPath(normalized);
    if (direct instanceof TFile) return true;

    const bundledPath = resolveBundledVaultPath(plugin, normalized);
    const bundledFile = plugin.app.vault.getAbstractFileByPath(bundledPath);
    return bundledFile instanceof TFile;
}

export async function installBundledPandocLayouts(
    plugin: RadialTimelinePlugin,
    layoutIds?: string[]
): Promise<{ installed: string[]; alreadyPresent: string[]; failed: string[] }> {
    const vault = plugin.app.vault;
    const selected = BUNDLED_PANDOC_LAYOUT_TEMPLATES.filter(layout => !layoutIds || layoutIds.includes(layout.id));
    const pandocFolder = getPandocFolder(plugin);

    if (!vault.getAbstractFileByPath(pandocFolder)) {
        await ensureFolderPath(plugin, pandocFolder);
    }

    const installed: string[] = [];
    const alreadyPresent: string[] = [];
    const failed: string[] = [];

    for (const bundled of selected) {
        const targetPath = resolveBundledVaultPath(plugin, bundled.path);
        if (vault.getAbstractFileByPath(targetPath) instanceof TFile) {
            alreadyPresent.push(bundled.name);
            continue;
        }

        try {
            await vault.create(targetPath, bundled.content);
            installed.push(bundled.name);
        } catch {
            failed.push(bundled.name);
        }
    }

    return { installed, alreadyPresent, failed };
}

export async function ensureBundledLayoutInstalledForExport(
    plugin: RadialTimelinePlugin,
    layout: PandocLayoutTemplate
): Promise<{ installed: boolean; failed: boolean }> {
    if (!layout.bundled) return { installed: false, failed: false };

    // Hotfix legacy bundled templates that used invalid titlesec spacing.
    // Older installed files can trigger TeX "Missing number ... \\penalty".
    const vault = plugin.app.vault;
    const normalizedPath = normalizePath((layout.path || '').trim().replace(/^\/+/, ''));
    if (normalizedPath) {
        const direct = vault.getAbstractFileByPath(normalizedPath);
        const bundled = direct instanceof TFile ? direct : vault.getAbstractFileByPath(resolveBundledVaultPath(plugin, normalizedPath));
        if (bundled instanceof TFile) {
            try {
                const raw = await vault.read(bundled);
                const signatureNormalized = normalizeLegacySignatureSpacing(raw);
                const signatureMarginsNormalized = layout.id === BUNDLED_FICTION_SIGNATURE_ID
                    ? normalizeSignatureSymmetricMargins(signatureNormalized.content)
                    : signatureNormalized;
                const coreSceneOpenersNormalized = normalizeCoreTemplateSceneOpeners(
                    signatureMarginsNormalized.content,
                    layout.id
                );
                const modernClassicNormalized = layout.id === BUNDLED_FICTION_MODERN_CLASSIC_ID
                    ? normalizeModernClassicMacroContract(signatureMarginsNormalized.content)
                    : coreSceneOpenersNormalized;
                if (
                    modernClassicNormalized.changed
                    || coreSceneOpenersNormalized.changed
                    || signatureMarginsNormalized.changed
                    || signatureNormalized.changed
                ) {
                    await vault.modify(bundled, modernClassicNormalized.content);
                    if (layout.id === BUNDLED_FICTION_SIGNATURE_ID && signatureMarginsNormalized.changed) {
                        console.info('[Radial Timeline] Updated bundled Signature Literary template margins for symmetric export pages.');
                    }
                    if (layout.id === BUNDLED_FICTION_MODERN_CLASSIC_ID && modernClassicNormalized.changed) {
                        console.info('[Radial Timeline] Updated bundled Modern Classic template macro contract for export compatibility.');
                    }
                    if (coreSceneOpenersNormalized.changed) {
                        console.info(`[Radial Timeline] Updated bundled ${layout.name} template scene opener formatting for export compatibility.`);
                    }
                }
            } catch {
                // Non-fatal: continue with standard install/validation flow.
            }
        }
    }

    if (isBundledPandocLayoutInstalled(plugin, layout)) return { installed: false, failed: false };

    const result = await installBundledPandocLayouts(plugin, [layout.id]);
    return {
        installed: result.installed.length > 0,
        failed: result.failed.length > 0
    };
}
