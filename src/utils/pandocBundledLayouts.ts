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
        id: 'bundled-novel',
        name: 'Novel Manuscript',
        preset: 'novel',
        path: 'novel_template.tex',
        bundled: true,
        content: [
            '% Pandoc LaTeX Template - Novel Manuscript Format',
            '% Traditional publishing format: Times 12pt, double-spaced',
            '\\documentclass[12pt,letterpaper]{article}',
            '',
            '\\usepackage[top=1in,bottom=1in,left=1in,right=1in]{geometry}',
            '\\usepackage{fontspec}',
            '\\usepackage{setspace}',
            '',
            '% Times New Roman is the publishing standard',
            '\\setmainfont{Times New Roman}[',
            '  BoldFont={Times New Roman Bold},',
            '  ItalicFont={Times New Roman Italic}',
            ']',
            '',
            '% Double spacing (standard for manuscript submissions)',
            '\\doublespacing',
            '',
            '% First line indent',
            '\\setlength{\\parindent}{0.5in}',
            '\\setlength{\\parskip}{0pt}',
            '',
            '% Page numbers top right',
            '\\usepackage{fancyhdr}',
            '\\pagestyle{fancy}',
            '\\fancyhf{}',
            '\\fancyhead[R]{\\thepage}',
            '\\renewcommand{\\headrulewidth}{0pt}',
            '',
            '\\begin{document}',
            '',
            '$body$',
            '',
            '\\end{document}'
        ].join('\n')
    },
    {
        id: 'bundled-novel-signature-literary-rt',
        name: 'Signature Literary (RT)',
        preset: 'novel',
        path: 'signature_literary_rt.tex',
        bundled: true,
        content: [
            '% Pandoc LaTeX Template - Signature Literary (Radial Timeline native)',
            '% Sophisticated print styling without external JS compile layer.',
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
            '% Pandoc compatibility macro for compact lists',
            '\\providecommand{\\tightlist}{%',
            '  \\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}',
            '}',
            '',
            '% Print trim-style page geometry',
            '\\geometry{paperwidth=6in,paperheight=9in,top=1in,bottom=1in,left=1in,right=1in}',
            '',
            '\\defaultfontfeatures{Ligatures=TeX}',
            '\\IfFontExistsTF{Sorts Mill Goudy}{',
            '  \\setmainfont{Sorts Mill Goudy}[ItalicFont={Sorts Mill Goudy Italic}]',
            '  \\newfontface\\headerfont{Sorts Mill Goudy}[LetterSpace=15.0]',
            '}{',
            '  \\setmainfont{TeX Gyre Pagella}',
            '  \\newfontface\\headerfont{TeX Gyre Pagella}[LetterSpace=12.0]',
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
            '% Scene opener pages (new scene starts): headerless, centered, cinematic spacing',
            '\\titleformat{\\section}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{\\arabic{section}}{0.2em}{}',
            '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{}{0pt}{}',
            '\\titlespacing*{\\section}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}',
            '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
            '',
            '% Pandoc may emit subsection headings depending on markdown level/template defaults',
            '\\titleformat{\\subsection}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{\\arabic{subsection}}{0.2em}{}',
            '\\titleformat{name=\\subsection,numberless}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{}{0pt}{}',
            '\\titlespacing*{\\subsection}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}',
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
    }
];

export function getBundledPandocLayouts(): PandocLayoutTemplate[] {
    return BUNDLED_PANDOC_LAYOUT_TEMPLATES.map(layout => ({
        id: layout.id,
        name: layout.name,
        preset: layout.preset,
        path: layout.path,
        bundled: true
    }));
}

export function ensureBundledPandocLayoutsRegistered(plugin: RadialTimelinePlugin): boolean {
    const existing = plugin.settings.pandocLayouts || [];
    const byId = new Map(existing.map(layout => [layout.id, layout]));
    let changed = false;

    for (const bundled of getBundledPandocLayouts()) {
        const current = byId.get(bundled.id);
        if (!current) {
            existing.push({ ...bundled });
            changed = true;
            continue;
        }

        const needsUpdate = current.name !== bundled.name
            || current.preset !== bundled.preset
            || current.path !== bundled.path
            || current.bundled !== true;

        if (needsUpdate) {
            current.name = bundled.name;
            current.preset = bundled.preset;
            current.path = bundled.path;
            current.bundled = true;
            changed = true;
        }
    }

    if (changed) {
        plugin.settings.pandocLayouts = existing;
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
    if (isBundledPandocLayoutInstalled(plugin, layout)) return { installed: false, failed: false };

    const result = await installBundledPandocLayouts(plugin, [layout.id]);
    return {
        installed: result.installed.length > 0,
        failed: result.failed.length > 0
    };
}
