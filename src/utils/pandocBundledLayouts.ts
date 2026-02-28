import { normalizePath, TFile } from 'obsidian';
import * as path from 'path';
import * as fs from 'fs';
import type RadialTimelinePlugin from '../main';
import type { PandocLayoutTemplate } from '../types';
import { DEFAULT_SETTINGS } from '../settings/defaults';

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

const LEGACY_SIGNATURE_SECTION_SPACING = '\\titlespacing*{\\section}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}';
const LEGACY_SIGNATURE_SUBSECTION_SPACING = '\\titlespacing*{\\subsection}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}';
const FIXED_SIGNATURE_SECTION_SPACING = '\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.2\\textheight}';
const FIXED_SIGNATURE_SUBSECTION_SPACING = '\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.2\\textheight}';

function normalizeLegacySignatureSpacing(content: string): { content: string; changed: boolean } {
    let updated = content;
    updated = updated.replace(LEGACY_SIGNATURE_SECTION_SPACING, FIXED_SIGNATURE_SECTION_SPACING);
    updated = updated.replace(LEGACY_SIGNATURE_SUBSECTION_SPACING, FIXED_SIGNATURE_SUBSECTION_SPACING);
    return { content: updated, changed: updated !== content };
}

function resolveCanonicalBundledLayoutId(layout: PandocLayoutTemplate, canonicalIds: Set<string>): string | null {
    const rawId = (layout.id || '').trim();
    if (canonicalIds.has(rawId)) return rawId;

    const mappedById = LEGACY_BUNDLED_LAYOUT_ID_MAP[rawId];
    if (mappedById && canonicalIds.has(mappedById)) return mappedById;

    const normalizedPath = normalizePath((layout.path || '').trim().replace(/^\/+/, ''));
    const basename = path.basename(normalizedPath).toLowerCase();
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
        hasSceneOpenerHeadingOptions: true,
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
            '  inner=1.05in,',
            '  outer=0.75in',
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
        name: 'Basic Manuscript',
        preset: 'novel',
        path: 'rt_classic_manuscript.tex',
        bundled: true,
        content: [
            '% Pandoc LaTeX Template - Basic Manuscript',
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
            '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
            '\\titlespacing*{\\section}{0pt}{0.16\\textheight}{0.12\\textheight}',
            '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
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
            '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{}',
            '\\titlespacing*{\\section}{0pt}{0.18\\textheight}{0.14\\textheight}',
            '\\preto\\chapter{\\clearpage\\thispagestyle{empty}}',
            '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
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
        usesModernClassicStructure: true,
        hasEpigraphs: true,
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
            '\\usepackage{ifthen}',
            '',
            '% --- Pandoc sometimes uses \\tightlist ---',
            '\\providecommand{\\tightlist}{%',
            '  \\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}}',
            '',
            '% --- capture Pandoc title/author ---',
            '\\makeatletter',
            '\\newcommand{\\rtBookTitle}{\\@title}',
            '\\newcommand{\\rtBookAuthor}{\\@author}',
            '\\makeatother',
            '',
            '% --- running head state ---',
            '\\newcommand{\\rtChapterHead}{}',
            '\\newcommand{\\rtSetChapterHead}[1]{\\renewcommand{\\rtChapterHead}{#1}}',
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
            '% --- Part + Chapter macros (called via raw LaTeX blocks) ---',
            '% PART I (Roman numerals) --- big, centered',
            '\\newcommand{\\rtPart}[1]{%',
            '  \\cleardoublepage',
            '  \\thispagestyle{rtEmpty}%',
            '  \\rtSetChapterHead{}%',
            '  \\vspace*{2.1in}%',
            '  \\begin{center}',
            '    {\\sffamily\\bfseries\\Large PART~#1}',
            '  \\end{center}',
            '  \\vspace*{1.2in}%',
            '  \\cleardoublepage',
            '}',
            '',
            '% CHAPTER I + optional title line',
            '% Usage: \\rtChapter{I}{Boy with a Skull}',
            '\\newcommand{\\rtChapter}[2]{%',
            '  \\cleardoublepage',
            '  \\thispagestyle{rtEmpty}%',
            '  \\rtSetChapterHead{#2}%',
            '  \\vspace*{1.9in}%',
            '  \\begin{center}',
            '    {\\sffamily\\bfseries\\large Chapter~#1}\\par',
            '    \\vspace{0.35in}%',
            '    \\ifthenelse{\\equal{#2}{}}{}{%',
            '      {\\rmfamily\\itshape\\Large #2}\\par',
            '    }%',
            '  \\end{center}',
            '  \\vspace*{0.9in}%',
            '}',
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
            '% --- do not print default chapter/section headings from Pandoc ---',
            '% We want RT-controlled structure (rtPart/rtChapter) and scene separators instead.',
            '\\titleformat{\\chapter}[display]{\\normalfont}{}{0pt}{}',
            '\\titlespacing*{\\chapter}{0pt}{0pt}{0pt}',
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
        ...(layout.usesModernClassicStructure === true ? { usesModernClassicStructure: true } : {}),
        ...(layout.hasEpigraphs === true ? { hasEpigraphs: true } : {}),
        ...(layout.hasSceneOpenerHeadingOptions === true ? { hasSceneOpenerHeadingOptions: true } : {})
    }));
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
            ...(canonical.usesModernClassicStructure === true ? { usesModernClassicStructure: true } : {}),
            ...(canonical.hasEpigraphs === true ? { hasEpigraphs: true } : {}),
            ...(canonical.hasSceneOpenerHeadingOptions === true ? { hasSceneOpenerHeadingOptions: true } : {})
        };
        if (
            migrated.id !== layout.id
            || migrated.name !== layout.name
            || migrated.preset !== layout.preset
            || migrated.path !== layout.path
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

    if (path.isAbsolute(trimmed)) {
        try {
            fs.accessSync(trimmed, fs.constants.R_OK);
            return true;
        } catch {
            return false;
        }
    }

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
                const normalized = normalizeLegacySignatureSpacing(raw);
                if (normalized.changed) {
                    await vault.modify(bundled, normalized.content);
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
