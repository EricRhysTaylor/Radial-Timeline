import { normalizePath, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { PandocLayoutTemplate } from '../types';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { SHARED_CHAPTER_FIELD_PUBLICATION_COPY } from './timelineChapters';
import { getPandocLayoutSortRank } from '../publishing/templateTiering';
import { generateDesignedStyleTex } from '../publishing/designedStyle';
import { BUNDLED_FICTION_SPECS, type BundledFictionId } from '../publishing/bundledStyleSpecs';

interface BundledPandocLayoutTemplate extends PandocLayoutTemplate {
    bundled: true;
    content: string;
}

/**
 * Memoized generator: derives bundled fiction `.tex` content from each spec
 * exactly once per id. The cache is process-scoped so vitest, build, and
 * runtime all see the same byte-stable output.
 *
 * Spec source of truth: `src/publishing/bundledStyleSpecs.ts`.
 * Reference rollback marker: git tag `pre-spec-export-stable`.
 */
const BUNDLED_GENERATED_CACHE = new Map<BundledFictionId, string>();

function getGeneratedBundledFictionTex(id: BundledFictionId): string {
    const cached = BUNDLED_GENERATED_CACHE.get(id);
    if (cached !== undefined) return cached;
    const tex = generateDesignedStyleTex(BUNDLED_FICTION_SPECS[id], { bundledLayoutId: id });
    BUNDLED_GENERATED_CACHE.set(id, tex);
    return tex;
}

const BUNDLED_FICTION_SIGNATURE_ID = 'bundled-fiction-signature-literary';
const BUNDLED_FICTION_CLASSIC_ID = 'bundled-fiction-classic-manuscript';
const BUNDLED_FICTION_MODERN_CLASSIC_ID = 'bundled-fiction-modern-classic';
const BUNDLED_FICTION_CONTEMPORARY_ID = 'bundled-fiction-contemporary-literary';

// Spec-driven fiction templates whose on-disk content is canonical (generated
// from `BUNDLED_FICTION_SPECS`). Install drift-detects against this set so
// stale legacy on-disk content is auto-overwritten on next Install.
const FICTION_BUNDLED_IDS = new Set<BundledFictionId>([
    BUNDLED_FICTION_SIGNATURE_ID,
    BUNDLED_FICTION_CLASSIC_ID,
    BUNDLED_FICTION_MODERN_CLASSIC_ID,
    BUNDLED_FICTION_CONTEMPORARY_ID,
]);

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
// Pre-tightened bottom-fraction spacing (kept the legacy 0.2/0.2 ratio). Vaults
// installed before the scene-opener bottom-fraction reduction need to be
// rewritten so the scene title sits closer to the body text.
const PRE_TIGHTENED_SIGNATURE_SECTION_SPACING = '\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.2\\textheight}';
const PRE_TIGHTENED_SIGNATURE_SUBSECTION_SPACING = '\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.2\\textheight}';
const FIXED_SIGNATURE_SECTION_SPACING = '\\titlespacing*{\\section}{0pt}{0.2\\textheight}{0.1\\textheight}';
const FIXED_SIGNATURE_SUBSECTION_SPACING = '\\titlespacing*{\\subsection}{0pt}{0.2\\textheight}{0.1\\textheight}';
const LEGACY_SIGNATURE_MIRRORED_MARGINS = [
    '  inner=1.05in,',
    '  outer=0.75in'
].join('\n');
const FIXED_SIGNATURE_SYMMETRIC_MARGINS = [
    '  left=0.9in,',
    '  right=0.9in'
].join('\n');
const LEGACY_MODERN_CLASSIC_MIRRORED_MARGINS = [
    '  inner=1.10in,',
    '  outer=0.85in'
].join('\n');
const FIXED_MODERN_CLASSIC_SYMMETRIC_MARGINS = [
    '  left=0.98in,',
    '  right=0.98in'
].join('\n');

/**
 * @deprecated Legacy normalizer for hand-authored Signature Literary `.tex` files.
 * New installs are spec-driven and never produce legacy spacing. Kept active so
 * pre-cutover vaults still get hotfixed on plugin upgrade.
 *
 * TODO: Remove after one release cycle past the spec-driven cutover (rollback
 * marker: git tag `pre-spec-export-stable`).
 */
function normalizeLegacySignatureSpacing(content: string): { content: string; changed: boolean } {
    let updated = content;
    // Original legacy form (\dimexpr\textheight/5\relax).
    updated = updated.replace(LEGACY_SIGNATURE_SECTION_SPACING, FIXED_SIGNATURE_SECTION_SPACING);
    updated = updated.replace(LEGACY_SIGNATURE_SUBSECTION_SPACING, FIXED_SIGNATURE_SUBSECTION_SPACING);
    // Pre-tightened spec-driven form (0.2/0.2). Rewrite to the new tighter
    // bottom-fraction (0.2/0.1) so existing on-disk Signature templates pick
    // up the reduced title-to-body gap without manual deletion.
    updated = updated.replace(PRE_TIGHTENED_SIGNATURE_SECTION_SPACING, FIXED_SIGNATURE_SECTION_SPACING);
    updated = updated.replace(PRE_TIGHTENED_SIGNATURE_SUBSECTION_SPACING, FIXED_SIGNATURE_SUBSECTION_SPACING);
    return { content: updated, changed: updated !== content };
}

/**
 * @deprecated Legacy normalizer that converts mirrored to symmetric margins on
 * pre-cutover bundled `.tex` files. The spec-driven generator emits symmetric
 * margins natively. Kept active so vaults installed before the cutover still
 * get hotfixed on load.
 *
 * TODO: Remove after one release cycle past the spec-driven cutover.
 */
function normalizeBundledSymmetricMargins(
    content: string,
    layoutId: string
): { content: string; changed: boolean } {
    const isSignature = layoutId === BUNDLED_FICTION_SIGNATURE_ID
        && content.includes('% Pandoc LaTeX Template - Signature Literary');
    const isContemporary = layoutId === BUNDLED_FICTION_CONTEMPORARY_ID
        && content.includes('% Pandoc LaTeX Template - Contemporary Literary');
    const isModernClassic = layoutId === BUNDLED_FICTION_MODERN_CLASSIC_ID
        && content.includes('% rt_modern_classic.tex')
        && content.includes('% Modern Classic fiction layout for 6x9 trade');
    let updated = content;

    if (isSignature || isContemporary) {
        updated = updated.replace(LEGACY_SIGNATURE_MIRRORED_MARGINS, FIXED_SIGNATURE_SYMMETRIC_MARGINS);
    }
    if (isModernClassic) {
        updated = updated.replace(LEGACY_MODERN_CLASSIC_MIRRORED_MARGINS, FIXED_MODERN_CLASSIC_SYMMETRIC_MARGINS);
    }

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
    // The assembler emits scene headings as \section* (latex-section-starred),
    // so titlesec hooks target \section to match. Previous versions hooked
    // \subsection which never fired.
    '\\titleformat{\\section}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{\\rtSceneOpenerTitle}',
    '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{\\rtSceneOpenerTitle}',
    '\\titlespacing*{\\section}{0pt}{0.16\\textheight}{0.12\\textheight}',
    '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
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
    '\\titlespacing*{\\chapter}{0pt}{0.46\\textheight}{0.08\\textheight}',
    // Scene headings use \section* from the assembler (latex-section-starred).
    '\\titleformat{\\section}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{\\rtSceneOpenerTitle}',
    '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\Large}{}{0pt}{\\rtSceneOpenerTitle}',
    '\\titlespacing*{\\section}{0pt}{0.18\\textheight}{0.14\\textheight}',
    '\\preto\\chapter{\\clearpage\\thispagestyle{empty}}',
    '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
].join('\n');

/**
 * @deprecated Legacy normalizer that upgrades pre-cutover Standard Manuscript /
 * Contemporary Literary scene-opener heading blocks. The spec-driven generator
 * emits the modern block natively. Kept active so vaults installed before the
 * cutover still get hotfixed on load.
 *
 * TODO: Remove after one release cycle past the spec-driven cutover.
 */
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
    let updated = content.includes(legacyBlock)
        ? content.replace(legacyBlock, fixedBlock)
        : content;
    if (updated === content) {
        const headingIndexes = [
            updated.indexOf('\\titleformat{\\section}'),
            updated.indexOf('\\titleformat{name=\\section'),
            updated.indexOf('\\titleformat{\\chapter}'),
        ].filter(index => index >= 0);
        const firstHeadingIndex = headingIndexes.length > 0 ? Math.min(...headingIndexes) : -1;
        const sectionHook = '\\preto\\section{\\clearpage\\thispagestyle{empty}}';
        const subsectionHook = '\\preto\\subsection{\\clearpage\\thispagestyle{empty}}';
        const endNeedle = updated.includes(subsectionHook) ? subsectionHook : sectionHook;
        const endIndex = firstHeadingIndex >= 0 ? updated.indexOf(endNeedle, firstHeadingIndex) : -1;
        if (firstHeadingIndex >= 0 && endIndex >= 0) {
            const helperIndex = updated.indexOf('\\setcounter{secnumdepth}{0}');
            const startIndex = helperIndex >= 0 && helperIndex < firstHeadingIndex
                ? helperIndex
                : firstHeadingIndex;
            updated = `${updated.slice(0, startIndex)}${fixedBlock}${updated.slice(endIndex + endNeedle.length)}`;
        }
    }
    return { content: updated, changed: updated !== content };
}

/**
 * @deprecated Legacy normalizer that fixes pre-cutover Contemporary Literary
 * running headers (literal "title"/"scene" labels, missing scene-context macro).
 * The spec-driven generator never produces those bugs. Kept active so vaults
 * installed before the cutover still get hotfixed on load.
 *
 * TODO: Remove after one release cycle past the spec-driven cutover.
 */
function normalizeContemporaryRunningHeader(content: string, layoutId: string): { content: string; changed: boolean } {
    // Match any installed Contemporary Literary template — the legacy hand-coded
    // hotfix gate ('% Pandoc LaTeX Template - Contemporary Literary') misses
    // vaults whose on-disk file was regenerated but still carries the literal
    // 'title'/'scene' running-header corruption from before the spec cutover.
    // The replacements below are no-ops on a clean spec-driven file, so widening
    // the gate to the layout id alone is safe.
    if (layoutId !== BUNDLED_FICTION_CONTEMPORARY_ID) return { content, changed: false };

    let updated = content;
    if (!updated.includes('\\newcommand{\\rtSceneRunningTitle}{}')) {
        updated = updated.replace(
            '\\newcommand{\\BookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}',
            [
                '\\newcommand{\\BookTitle}{$if(title)$$title$$else$Untitled Manuscript$endif$}',
                '\\newcommand{\\rtSceneRunningTitle}{}',
                '\\newcommand{\\rtSetSceneRunningTitle}[1]{\\gdef\\rtSceneRunningTitle{#1}\\markboth{\\BookTitle}{#1}}',
            ].join('\n')
        );
    }
    updated = updated.replace(
        '\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{\\rightmark}}',
        '\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{\\rtSceneRunningTitle}}'
    );
    updated = updated.replace(
        '\\fancyhead[LE]{\\sffamily\\footnotesize\\nouppercase{title}}',
        '\\fancyhead[LE]{\\sffamily\\footnotesize\\nouppercase{\\BookTitle}}'
    );
    updated = updated.replace(
        '\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{scene}}',
        '\\fancyhead[RO]{\\sffamily\\footnotesize\\nouppercase{\\rtSceneRunningTitle}}'
    );
    updated = updated.replace(
        '\\titlespacing*{\\chapter}{0pt}{0.18\\textheight}{0.14\\textheight}',
        '\\titlespacing*{\\chapter}{0pt}{0.46\\textheight}{0.08\\textheight}'
    );
    updated = updated.replace(
        '\\titlespacing*{\\chapter}{0pt}{0.38\\textheight}{0.08\\textheight}',
        '\\titlespacing*{\\chapter}{0pt}{0.46\\textheight}{0.08\\textheight}'
    );
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

const MODERN_CLASSIC_UNSAFE_CHAPTER_TITLEFORMAT_BLOCK = [
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
].join('\n');

const MODERN_CLASSIC_SAFE_CHAPTER_TITLEFORMAT_BLOCK = [
    '\\titleformat{\\chapter}{\\normalfont}{}{0pt}{}',
    '\\titlespacing*{\\chapter}{0pt}{0pt}{0pt}',
].join('\n');

/**
 * @deprecated Legacy normalizer that repairs pre-cutover Modern Classic macro
 * contracts (legacy `\@title`/`\@author` capture, unsafe titleformat, missing
 * `\rtChapter`/`\rtEpigraph`). The spec-driven generator never produces those
 * shapes. Kept active so vaults installed before the cutover still get
 * hotfixed on load.
 *
 * TODO: Remove after one release cycle past the spec-driven cutover.
 */
function normalizeModernClassicMacroContract(content: string): { content: string; changed: boolean } {
    const isModernClassicBundledTemplate = content.includes('% rt_modern_classic.tex')
        && content.includes('% Modern Classic fiction layout for 6x9 trade')
        && content.includes('\\newcommand{\\rtPart}[1]');
    if (!isModernClassicBundledTemplate) {
        return { content, changed: false };
    }

    let updated = content;
    updated = updated.replace(LEGACY_MODERN_CLASSIC_TITLE_CAPTURE, () => MODERN_CLASSIC_TITLE_BINDINGS);
    updated = updated.replace(MODERN_CLASSIC_UNSAFE_CHAPTER_TITLEFORMAT_BLOCK, () => MODERN_CLASSIC_SAFE_CHAPTER_TITLEFORMAT_BLOCK);

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
        get content(): string { return getGeneratedBundledFictionTex(BUNDLED_FICTION_SIGNATURE_ID); },
        get designedSpec() { return BUNDLED_FICTION_SPECS[BUNDLED_FICTION_SIGNATURE_ID]; },
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
        get content(): string { return getGeneratedBundledFictionTex(BUNDLED_FICTION_CLASSIC_ID); },
        get designedSpec() { return BUNDLED_FICTION_SPECS[BUNDLED_FICTION_CLASSIC_ID]; },
    },
    {
        id: BUNDLED_FICTION_CONTEMPORARY_ID,
        name: 'Contemporary Literary',
        preset: 'novel',
        path: 'rt_contemporary_literary.tex',
        bundled: true,
        tier: 'free',
        templateKind: 'book',
        description: 'Running headers show book title on even pages and scene context on odd pages. Page numbers are centered at the bottom. Chapter and scene opener pages suppress headers and page numbers.',
        get content(): string { return getGeneratedBundledFictionTex(BUNDLED_FICTION_CONTEMPORARY_ID); },
        get designedSpec() { return BUNDLED_FICTION_SPECS[BUNDLED_FICTION_CONTEMPORARY_ID]; },
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
        get content(): string { return getGeneratedBundledFictionTex(BUNDLED_FICTION_MODERN_CLASSIC_ID); },
        get designedSpec() { return BUNDLED_FICTION_SPECS[BUNDLED_FICTION_MODERN_CLASSIC_ID]; },
    }
];

/**
 * Test-facing accessor: returns the raw bundled `.tex` content for a given
 * layout id. Returns `null` for unknown ids. For fiction layouts the content
 * is generator-derived from `BUNDLED_FICTION_SPECS`; screenplay/podcast remain
 * hand-coded.
 */
export function getBundledPandocLayoutContent(layoutId: string): string | null {
    const found = BUNDLED_PANDOC_LAYOUT_TEMPLATES.find(layout => layout.id === layoutId);
    return found ? found.content : null;
}

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
        ...(layout.hasSceneOpenerHeadingOptions === true ? { hasSceneOpenerHeadingOptions: true } : {}),
        // Expose the spec on the runtime layout record so getLayoutPictogramRows
        // can derive its preview from the same source as the .tex content.
        ...(layout.designedSpec ? { designedSpec: layout.designedSpec } : {}),
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
        const existing = vault.getAbstractFileByPath(targetPath);
        const isFictionSpecDriven = FICTION_BUNDLED_IDS.has(bundled.id as BundledFictionId);

        if (existing instanceof TFile) {
            // Spec-driven fiction templates: drift-detect against the canonical
            // generated content. If the on-disk file diverges (legacy literal
            // labels, stale spacing, etc.), overwrite — install must be
            // self-healing so users don't have to manually delete files.
            if (isFictionSpecDriven) {
                try {
                    const onDisk = await vault.read(existing);
                    const canonical = bundled.content;
                    if (onDisk === canonical) {
                        alreadyPresent.push(bundled.name);
                        continue;
                    }
                    await vault.modify(existing, canonical);
                    installed.push(bundled.name);
                    continue;
                } catch {
                    failed.push(bundled.name);
                    continue;
                }
            }
            // Non-spec-driven templates (screenplay/podcast): preserve the
            // skip-if-exists behavior so users' edits aren't clobbered.
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
                const marginsNormalized = normalizeBundledSymmetricMargins(signatureNormalized.content, layout.id);
                const coreSceneOpenersNormalized = normalizeCoreTemplateSceneOpeners(
                    marginsNormalized.content,
                    layout.id
                );
                const contemporaryRunningHeaderNormalized = normalizeContemporaryRunningHeader(
                    coreSceneOpenersNormalized.content,
                    layout.id
                );
                const modernClassicNormalized = layout.id === BUNDLED_FICTION_MODERN_CLASSIC_ID
                    ? normalizeModernClassicMacroContract(marginsNormalized.content)
                    : contemporaryRunningHeaderNormalized;
                if (
                    modernClassicNormalized.changed
                    || contemporaryRunningHeaderNormalized.changed
                    || coreSceneOpenersNormalized.changed
                    || marginsNormalized.changed
                    || signatureNormalized.changed
                ) {
                    await vault.modify(bundled, modernClassicNormalized.content);
                    if (marginsNormalized.changed) {
                        console.info(`[Radial Timeline] Updated bundled ${layout.name} template margins for symmetric export pages.`);
                    }
                    if (layout.id === BUNDLED_FICTION_MODERN_CLASSIC_ID && modernClassicNormalized.changed) {
                        console.info('[Radial Timeline] Updated bundled Modern Classic template macro contract for export compatibility.');
                    }
                    if (coreSceneOpenersNormalized.changed) {
                        console.info(`[Radial Timeline] Updated bundled ${layout.name} template scene opener formatting for export compatibility.`);
                    }
                    if (contemporaryRunningHeaderNormalized.changed) {
                        console.info('[Radial Timeline] Updated bundled Contemporary Literary template running headers for scene context.');
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
