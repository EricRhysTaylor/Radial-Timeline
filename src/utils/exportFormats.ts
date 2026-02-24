/*
 * Export format helpers (manuscript + outline + Pandoc).
 * Keep this module focused on formatting and process execution.
 */

import { normalizePath, FileSystemAdapter, Vault, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { PandocLayoutTemplate } from '../types';
import type { ManuscriptSceneSelection, ManuscriptOrder } from './manuscript';
import { execFile } from 'child_process'; // SAFE: Node child_process for Pandoc subprocess
import * as fs from 'fs'; // SAFE: Node fs required for Pandoc temp files
import * as os from 'os'; // SAFE: Node os required for temp directory resolution
import * as path from 'path'; // SAFE: Node path required for temp/absolute paths
import { formatRuntimeValue, RuntimeSettings } from './runtimeEstimator';

export type ExportType = 'manuscript' | 'outline';
export type ManuscriptPreset = 'screenplay' | 'podcast' | 'novel';
export type OutlinePreset = 'beat-sheet' | 'episode-rundown' | 'shooting-schedule' | 'index-cards-csv' | 'index-cards-json';
export type ExportFormat = 'markdown' | 'pdf' | 'csv' | 'json';

// ════════════════════════════════════════════════════════════════════════════
// Pandoc Layout Helpers
// ════════════════════════════════════════════════════════════════════════════

/**
 * Strip/replace unsafe filename characters and collapse whitespace to hyphens.
 * Produces a clean stem suitable for PDF filenames.
 */
export function slugifyToFileStem(title: string): string {
    return title
        .replace(/[/\\:*?"<>|]+/g, '')   // strip forbidden chars
        .replace(/\s+/g, '-')            // spaces -> hyphens
        .replace(/-{2,}/g, '-')          // collapse runs
        .replace(/^-|-$/g, '')           // trim leading/trailing hyphens
        || 'Manuscript';                  // fallback
}

/** Look up a layout by its unique ID. */
export function getLayoutById(plugin: RadialTimelinePlugin, id: string | undefined): PandocLayoutTemplate | undefined {
    if (!id) return undefined;
    return (plugin.settings.pandocLayouts || []).find(l => l.id === id);
}

/** Return all layouts scoped to a given preset. */
export function getLayoutsForPreset(plugin: RadialTimelinePlugin, preset: ManuscriptPreset): PandocLayoutTemplate[] {
    return (plugin.settings.pandocLayouts || []).filter(l => l.preset === preset);
}

/**
 * Validate that a layout's .tex file exists.
 * Used by both Pro Settings (flash validation) and the export runner (hard-guard).
 */
export function validatePandocLayout(
    plugin: RadialTimelinePlugin,
    layout: PandocLayoutTemplate
): { valid: boolean; error?: string } {
    if (!layout.path || !layout.path.trim()) {
        return { valid: false, error: 'No template path configured.' };
    }
    const trimmed = layout.path.trim();

    // Absolute path: check via Node fs
    if (path.isAbsolute(trimmed)) {
        try {
            fs.accessSync(trimmed, fs.constants.R_OK);
            return { valid: true };
        } catch {
            return { valid: false, error: `File not found: ${trimmed}` };
        }
    }

    // Vault-relative path
    const file = plugin.app.vault.getAbstractFileByPath(trimmed);
    if (file instanceof TFile) {
        return { valid: true };
    }
    return { valid: false, error: `File not found in vault: ${trimmed}` };
}

/**
 * Convert slugified stem to readable form (hyphens → spaces) for filenames.
 */
export function stemToReadable(stem: string): string {
    return stem.replace(/-+/g, ' ').trim() || 'Manuscript';
}

/**
 * Build the precursor compiled-markdown filename.
 * Pattern: "Manuscript {Preset} {Order} {Timestamp}.md" or "{ReadableStem} {Preset} {Order} {Timestamp}.md"
 * Example: "Working Title Novl Narr Feb 14 @ 11.51AM.md"
 */
export function buildPrecursorFilename(
    fileStem: string,
    preset: ManuscriptPreset,
    order: ManuscriptOrder,
    subplotFilter?: string
): string {
    const presetAcronym = getManuscriptPresetAcronym(preset);
    const orderAcronym = getOrderAcronym(order);
    const hasSubplotFilter = subplotFilter && subplotFilter !== 'All Subplots';
    const orderPart = hasSubplotFilter ? `Sub-${orderAcronym}` : orderAcronym;
    const timestamp = generateFriendlyTimestamp();
    const readableStem = stemToReadable(fileStem);
    const isDefault = fileStem === 'Manuscript' || fileStem === 'Untitled-Manuscript';
    const prefix = isDefault ? 'Manuscript' : readableStem;
    return `${prefix} ${presetAcronym} ${orderPart} ${timestamp}.md`;
}

// ════════════════════════════════════════════════════════════════════════════
// Export Filename Acronyms
// ════════════════════════════════════════════════════════════════════════════

function getOrderAcronym(order: ManuscriptOrder): string {
    switch (order) {
        case 'narrative': return 'Narr';
        case 'reverse-narrative': return 'RevN';
        case 'chronological': return 'Chro';
        case 'reverse-chronological': return 'RevC';
        default: return 'Narr';
    }
}

function getOutlinePresetAcronym(preset: OutlinePreset): string {
    switch (preset) {
        case 'beat-sheet': return 'BtSh';
        case 'episode-rundown': return 'EpRn';
        case 'shooting-schedule': return 'ShSc';
        case 'index-cards-csv': return 'IdxC';
        case 'index-cards-json': return 'IdxJ';
        default: return 'BtSh';
    }
}

function getManuscriptPresetAcronym(preset: ManuscriptPreset): string {
    switch (preset) {
        case 'screenplay': return 'Scrn';
        case 'podcast': return 'Podc';
        case 'novel': return 'Novl';
        default: return 'Novl';
    }
}

export function generateFriendlyTimestamp(): string {
    const now = new Date();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[now.getMonth()];
    const day = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hour12 = hours % 12 || 12;
    return `${month} ${day} @ ${hour12}.${minutes}${ampm}`;
}

export interface ExportFilenameOptions {
    exportType: ExportType;
    order: ManuscriptOrder;
    subplotFilter?: string;
    manuscriptPreset?: ManuscriptPreset;
    outlinePreset?: OutlinePreset;
    extension: string;
    /** When set and format is PDF, filename becomes {fileStem}.{ext}. */
    fileStem?: string;
}

/**
 * Build export filename with acronyms
 * Pattern: "[Category/Title] [Preset] [Sub-][Order] [Timestamp].[ext]"
 * Examples:
 *   - "Manuscript Novl Narr Jan 12 @ 3.32PM.md"
 *   - "Working Title Novl Narr Feb 14 @ 11.51AM.pdf"
 *   - "Outline BtSh RevN Jan 12 @ 3.32PM.md"
 *   - "Outline IdxC Sub-RevC Jan 12 @ 3.32PM.csv"
 */
export function buildExportFilename(options: ExportFilenameOptions): string {
    const timestamp = generateFriendlyTimestamp();
    const orderAcronym = getOrderAcronym(options.order);
    const hasSubplotFilter = options.subplotFilter && options.subplotFilter !== 'All Subplots';
    const orderPart = hasSubplotFilter ? `Sub-${orderAcronym}` : orderAcronym;
    const isPandocExport = options.exportType === 'manuscript' && options.extension === 'pdf';

    // Pandoc exports use readable book-titled filenames for author-facing artifacts.
    if (isPandocExport && options.fileStem) {
        const presetAcronym = getManuscriptPresetAcronym(options.manuscriptPreset || 'novel');
        const isDefault = options.fileStem === 'Manuscript' || options.fileStem === 'Untitled-Manuscript';
        const prefix = isDefault ? 'Manuscript' : stemToReadable(options.fileStem);
        return `${prefix} ${presetAcronym} ${orderPart} ${timestamp}.${options.extension}`;
    }
    
    if (options.exportType === 'outline') {
        const presetAcronym = getOutlinePresetAcronym(options.outlinePreset || 'beat-sheet');
        return `Outline ${presetAcronym} ${orderPart} ${timestamp}.${options.extension}`;
    } else {
        const category = isPandocExport ? 'Pandoc' : 'Manuscript';
        const presetAcronym = getManuscriptPresetAcronym(options.manuscriptPreset || 'novel');
        return `${category} ${presetAcronym} ${orderPart} ${timestamp}.${options.extension}`;
    }
}

export interface PandocOptions {
    targetFormat: 'pdf';
    pandocPath?: string;
    enableFallback?: boolean;
    fallbackPath?: string;
    templatePath?: string;
    workingDir?: string;
}

export interface OutlineExportResult {
    text: string;
    extension: 'md' | 'csv' | 'json';
    label: string;
}

function resolveVaultAbsolutePath(plugin: RadialTimelinePlugin, vaultPath: string): string | null {
    const adapter = plugin.app.vault.adapter; // SAFE: adapter needed to resolve absolute path for Pandoc output
    if (adapter instanceof FileSystemAdapter) {
        const basePath = adapter.getBasePath();
        return path.join(basePath, normalizePath(vaultPath));
    }
    return null;
}

function resolvePandocBinary(options: PandocOptions): string {
    const configured = options.pandocPath && options.pandocPath.trim()
        ? options.pandocPath.trim()
        : options.enableFallback && options.fallbackPath && options.fallbackPath.trim()
            ? options.fallbackPath.trim()
            : 'pandoc';

    // Recover from settings values incorrectly normalized as vault paths
    // (e.g. "/opt/homebrew/bin/pandoc" stored as "opt/homebrew/bin/pandoc").
    if (
        process.platform !== 'win32'
        && configured.includes('/')
        && !configured.startsWith('/')
        && !configured.startsWith('./')
        && !configured.startsWith('../')
    ) {
        const candidate = `/${configured.replace(/^\/+/, '')}`;
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return configured;
}

export type PdfEngine = 'pdflatex' | 'xelatex' | 'lualatex';

export interface PdfEngineSelection {
    engine: PdfEngine;
    path: string | null;
    available: Array<{ engine: PdfEngine; path: string }>;
    templateNeedsUnicode: boolean;
}

function templateNeedsUnicodeEngine(templatePath?: string): boolean {
    if (!templatePath || !templatePath.trim()) return false;
    const trimmed = templatePath.trim();
    if (!path.isAbsolute(trimmed) || !fs.existsSync(trimmed)) return false;
    try {
        const tex = fs.readFileSync(trimmed, 'utf8');
        return /\\usepackage\s*\{fontspec\}|\\setmainfont|\\newfontface|\\defaultfontfeatures/i.test(tex);
    } catch {
        return false;
    }
}

function getEngineCandidatePaths(engine: PdfEngine): string[] {
    if (process.platform === 'win32') {
        const userProfile = process.env.USERPROFILE || 'C:\\Users\\Public';
        const localAppData = process.env.LOCALAPPDATA || `${userProfile}\\AppData\\Local`;
        const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
        const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
        return [
            `${programFiles}\\MiKTeX\\miktex\\bin\\x64\\${engine}.exe`,
            `${programFiles}\\MiKTeX\\miktex\\bin\\${engine}.exe`,
            `${programFilesX86}\\MiKTeX\\miktex\\bin\\${engine}.exe`,
            `${programFiles}\\texlive\\2024\\bin\\win32\\${engine}.exe`,
            `${programFilesX86}\\texlive\\2024\\bin\\win32\\${engine}.exe`,
            `${localAppData}\\Programs\\MiKTeX\\miktex\\bin\\x64\\${engine}.exe`
        ];
    }

    return [
        `/Library/TeX/texbin/${engine}`,
        `/opt/homebrew/bin/${engine}`,
        `/usr/local/bin/${engine}`,
        `/usr/bin/${engine}`
    ];
}

export function getAutoPdfEngineSelection(templatePath?: string): PdfEngineSelection {
    const preferUnicode = templateNeedsUnicodeEngine(templatePath);
    const order: PdfEngine[] = preferUnicode
        ? ['xelatex', 'lualatex', 'pdflatex']
        : ['pdflatex', 'xelatex', 'lualatex'];

    const available: Array<{ engine: PdfEngine; path: string }> = [];
    for (const engine of ['pdflatex', 'xelatex', 'lualatex'] as const) {
        const found = getEngineCandidatePaths(engine).find(candidate => fs.existsSync(candidate));
        if (found) {
            available.push({ engine, path: found });
        }
    }

    for (const engine of order) {
        const found = getEngineCandidatePaths(engine).find(candidate => fs.existsSync(candidate));
        if (found) {
            return {
                engine,
                path: found,
                available,
                templateNeedsUnicode: preferUnicode
            };
        }
    }

    return {
        engine: order[0],
        path: null,
        available,
        templateNeedsUnicode: preferUnicode
    };
}

export async function runPandocOnContent(
    content: string,
    outputAbsolutePath: string,
    options: PandocOptions
): Promise<void> {
    const binary = resolvePandocBinary(options);
    const pdfEngineSelection = getAutoPdfEngineSelection(options.templatePath);
    const pdfEngine = pdfEngineSelection.path || pdfEngineSelection.engine;
    const tmpDir = os.tmpdir();
    const tmpInput = path.join(tmpDir, `rt-pandoc-${Date.now()}.md`);
    const preparedContent = preparePandocContent(content, options);
    await fs.promises.writeFile(tmpInput, preparedContent, 'utf8');

    const args = ['-f', 'markdown', '-t', options.targetFormat, '-o', outputAbsolutePath, tmpInput];
    args.push('--pdf-engine', pdfEngine);
    if (options.templatePath && options.templatePath.trim()) {
        args.push('--template', options.templatePath.trim());
    }

    await new Promise<void>((resolve, reject) => {
        const env = { ...process.env };
        const pathSeparator = process.platform === 'win32' ? ';' : ':';
        const extraPaths = process.platform === 'win32'
            ? ['C:\\Program Files\\MiKTeX\\miktex\\bin\\x64', 'C:\\Program Files\\texlive\\2024\\bin\\win32']
            : ['/Library/TeX/texbin', '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin'];
        env.PATH = [env.PATH, ...extraPaths].filter(Boolean).join(pathSeparator);

        execFile(binary, args, { cwd: options.workingDir, env }, (error, _stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
                return;
            }
            resolve();
        });
    }).finally(async () => {
        try {
            await fs.promises.unlink(tmpInput);
        } catch (e) {
            console.warn('Failed to clean tmp pandoc file', e);
        }
    });
}

function preparePandocContent(content: string, options: PandocOptions): string {
    if (options.targetFormat !== 'pdf') return content;

    const injectLines: string[] = [];

    // Some custom/legacy templates do not define \tightlist, but Pandoc emits it for markdown lists.
    const hasTightlistDefinition = /\\(?:providecommand|newcommand|def)\s*\\tightlist|\\(?:providecommand|newcommand)\s*\{\\tightlist\}/.test(content);
    if (!hasTightlistDefinition) {
        injectLines.push('\\providecommand{\\tightlist}{\\setlength{\\itemsep}{0pt}\\setlength{\\parskip}{0pt}}');
    }

    // Runtime compatibility shim for AJ Finn templates that predate RT-native scene opener formatting.
    const templatePath = options.templatePath?.toLowerCase() || '';
    const isAjFinnTemplate = templatePath.includes('ajfinn');
    if (isAjFinnTemplate) {
        injectLines.push(
            '\\titleformat{\\section}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{\\arabic{section}}{0.2em}{}',
            '\\titleformat{name=\\section,numberless}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{}{0pt}{}',
            '\\titlespacing*{\\section}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}',
            '\\preto\\section{\\clearpage\\thispagestyle{empty}}',
            '\\titleformat{\\subsection}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{\\arabic{subsection}}{0.2em}{}',
            '\\titleformat{name=\\subsection,numberless}[display]{\\normalfont\\bfseries\\centering\\fontsize{30}{34}\\selectfont}{}{0pt}{}',
            '\\titlespacing*{\\subsection}{0pt}{\\dimexpr\\textheight/5\\relax}{\\dimexpr\\textheight/5\\relax}',
            '\\preto\\subsection{\\clearpage\\thispagestyle{empty}}'
        );
    }

    if (injectLines.length === 0) return content;
    return `${injectLines.join('\n')}\n\n${content}`;
}

function formatCsvValue(value: string | null | undefined): string {
    const safe = value ?? '';
    if (safe.includes(',') || safe.includes('"') || safe.includes('\n')) {
        return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
}

export function buildOutlineExport(
    selection: ManuscriptSceneSelection,
    preset: OutlinePreset,
    includeSynopsis = false,
    runtimeSettings?: RuntimeSettings
): OutlineExportResult {
    const titles = selection.titles;
    const whenDates = selection.whenDates;
    const sceneNumbers = selection.sceneNumbers;
    const subplots = selection.subplots;
    const synopses = selection.synopses || [];
    const runtimes = selection.runtimes ?? [];
    const wordCounts = selection.wordCounts ?? [];

    const totalRuntimeSeconds = (runtimes as (number | null)[]).reduce<number>(
        (sum, r) => sum + (r ?? 0),
        0
    );
    const totalFormattedRuntime = formatRuntimeValue(totalRuntimeSeconds);

    const draftingWpm = runtimeSettings?.sessionPlanning?.draftingWpm || 0;
    const dailyMinutes = runtimeSettings?.sessionPlanning?.dailyMinutes || 0;

    const calculateWritingHours = (words: number) => {
        if (!draftingWpm || draftingWpm <= 0) return 0;
        return (words / draftingWpm) / 60;
    };

    const totalWords = (wordCounts as (number | null)[]).reduce<number>(
        (sum, w) => sum + (w ?? 0),
        0
    );
    const totalWritingHours = calculateWritingHours(totalWords);

    const dailyHours = dailyMinutes > 0 ? dailyMinutes / 60 : 0;
    const totalSessions = dailyHours > 0 ? Math.ceil(totalWritingHours / dailyHours) : 0;

    switch (preset) {
        case 'index-cards-csv': {
            const header = includeSynopsis 
                ? ['Scene', 'Title', 'When', 'Subplot', 'Synopsis', 'Runtime', 'Words', 'Path']
                : ['Scene', 'Title', 'When', 'Subplot', 'Runtime', 'Words', 'Path'];
            const rows = titles.map((title, idx) => {
                const sceneLabel = sceneNumbers[idx] || idx + 1;
                const rt = runtimes[idx] ? formatRuntimeValue(runtimes[idx]!) : '';
                const wc = wordCounts[idx] || 0;
                
                const base = [
                    sceneLabel.toString(),
                    formatCsvValue(title),
                    formatCsvValue(whenDates[idx] || ''),
                    formatCsvValue(subplots[idx] || ''),
                    formatCsvValue(rt),
                    wc.toString()
                ];
                if (includeSynopsis) {
                    base.push(formatCsvValue(synopses[idx] || ''));
                }
                base.push(formatCsvValue(selection.files[idx]?.path || ''));
                return base.join(',');
            });
            return {
                text: [header.join(','), ...rows].join('\n'),
                extension: 'csv',
                label: 'Index cards (CSV)'
            };
        }
        case 'index-cards-json': {
            const cards = titles.map((title, idx) => {
                const rt = runtimes[idx];
                const wc = wordCounts[idx] || 0;
                const writingTimeHours = calculateWritingHours(wc);
                
                const card: Record<string, unknown> = {
                    scene: sceneNumbers[idx] || idx + 1,
                    title,
                    when: whenDates[idx],
                    subplot: subplots[idx] || null,
                    runtime: rt ? formatRuntimeValue(rt) : null,
                    runtimeSeconds: rt,
                    words: wc,
                    writingTimeHours: Number(writingTimeHours.toFixed(2))
                };
                if (includeSynopsis) {
                    card.synopsis = synopses[idx] || null;
                }
                card.path = selection.files[idx]?.path || null;
                return card;
            });
            
            const output: Record<string, unknown> = {
                cards,
                summary: {
                    totalScenes: titles.length,
                    totalWords,
                    totalRuntime: totalFormattedRuntime,
                    totalRuntimeSeconds
                }
            };
            
            if (draftingWpm > 0) {
                output.planning = {
                    draftingWpm,
                    dailyMinutes,
                    estimatedWritingHours: Number(totalWritingHours.toFixed(1)),
                    estimatedSessions: totalSessions
                };
            }
            
            return {
                text: JSON.stringify(output, null, 2),
                extension: 'json',
                label: 'Index cards (JSON)'
            };
        }
        case 'episode-rundown': {
            const lines = ['# Episode rundown', ''];
            
            lines.push(`**Total Runtime:** ${totalFormattedRuntime} (${titles.length} scenes)`);
            lines.push('');
            
            titles.forEach((title, idx) => {
                const sceneLabel = sceneNumbers[idx] || idx + 1;
                const when = whenDates[idx] ? ` · ${whenDates[idx]}` : '';
                const rt = runtimes[idx] ? ` [${formatRuntimeValue(runtimes[idx]!)}]` : '';
                
                lines.push(`${sceneLabel}. ${title}${when}${rt}`);
                if (includeSynopsis && synopses[idx]) {
                    lines.push(`   > ${synopses[idx]}`);
                    lines.push('');
                }
            });
            return { text: lines.join('\n'), extension: 'md', label: 'Episode rundown' };
        }
        case 'shooting-schedule': {
            const header = includeSynopsis
                ? ['# Shooting schedule', '', '| Scene | Title | When | Subplot | Runtime | Synopsis |', '|-------|-------|------|---------|---------|----------|']
                : ['# Shooting schedule', '', '| Scene | Title | When | Subplot | Runtime |', '|-------|-------|------|---------|---------|'];
            const lines = [...header];
            titles.forEach((title, idx) => {
                const sceneLabel = sceneNumbers[idx] || idx + 1;
                const rt = runtimes[idx] ? formatRuntimeValue(runtimes[idx]!) : '—';
                
                if (includeSynopsis) {
                    const synopsis = (synopses[idx] || '—').replace(/\|/g, '\\|'); // Escape pipes for markdown table
                    lines.push(`| ${sceneLabel} | ${title} | ${whenDates[idx] || '—'} | ${subplots[idx] || '—'} | ${rt} | ${synopsis} |`);
                } else {
                    lines.push(`| ${sceneLabel} | ${title} | ${whenDates[idx] || '—'} | ${subplots[idx] || '—'} | ${rt} |`);
                }
            });
            
            lines.push('');
            lines.push(`**Total Estimated Runtime:** ${totalFormattedRuntime}`);
            
            if (draftingWpm > 0) {
                lines.push('');
                lines.push('## Session Planning');
                lines.push(`- **Drafting Pace:** ${draftingWpm} wpm`);
                lines.push(`- **Total Word Count:** ${totalWords.toLocaleString()}`);
                lines.push(`- **Est. Drafting Time:** ${totalWritingHours.toFixed(1)} hours`);
                if (dailyMinutes > 0) {
                    lines.push(`- **Daily Availability:** ${dailyMinutes} mins`);
                    lines.push(`- **Est. Sessions:** ~${totalSessions} sessions`);
                }
            }
            
            return { text: lines.join('\n'), extension: 'md', label: 'Shooting schedule' };
        }
        case 'beat-sheet':
        default: {
            const lines = ['# Beat sheet', ''];
            
            if (draftingWpm > 0) {
                lines.push(`> **Planning:** ${totalWords.toLocaleString()} words · ~${totalWritingHours.toFixed(1)}h drafting`);
                lines.push('');
            }
            
            titles.forEach((title, idx) => {
                const sceneLabel = sceneNumbers[idx] || idx + 1;
                const wc = wordCounts[idx] ? ` (${wordCounts[idx]}w)` : '';
                lines.push(`${sceneLabel}. ${title}${wc}`);
                if (includeSynopsis && synopses[idx]) {
                    lines.push(`   > ${synopses[idx]}`);
                    lines.push('');
                }
            });
            return { text: lines.join('\n'), extension: 'md', label: 'Beat sheet' };
        }
    }
}

export function getTemplateForPreset(
    plugin: RadialTimelinePlugin,
    preset: ManuscriptPreset
): string | undefined {
    const templates = plugin.settings.pandocTemplates || {};
    switch (preset) {
        case 'screenplay':
            return templates.screenplay || undefined;
        case 'podcast':
            return templates.podcast || undefined;
        case 'novel':
        default:
            return templates.novel || undefined;
    }
}

/**
 * Check if a template is configured and exists for a preset
 * Returns: { configured: boolean, exists: boolean, path: string | null }
 */
export function validateTemplateForPreset(
    plugin: RadialTimelinePlugin,
    preset: ManuscriptPreset
): { configured: boolean; exists: boolean; path: string | null; isAbsolute: boolean } {
    const templatePath = getTemplateForPreset(plugin, preset);
    
    if (!templatePath || !templatePath.trim()) {
        return { configured: false, exists: false, path: null, isAbsolute: false };
    }
    
    const trimmed = templatePath.trim();
    const isAbsolute = path.isAbsolute(trimmed);
    
    // For vault-relative paths, check if file exists
    if (!isAbsolute) {
        const file = plugin.app.vault.getAbstractFileByPath(trimmed);
        const exists = file instanceof TFile;
        return { configured: true, exists, path: trimmed, isAbsolute: false };
    }
    
    // For absolute paths, we can't verify existence in Obsidian
    // Assume it exists if configured (user responsibility)
    return { configured: true, exists: true, path: trimmed, isAbsolute: true };
}

/**
 * Check if a preset requires a template for PDF export
 */
export function presetRequiresTemplate(preset: ManuscriptPreset, format: ExportFormat): boolean {
    if (format === 'markdown') return false; // Markdown never needs templates
    return preset === 'screenplay' || preset === 'podcast'; // Novel can use defaults
}

export function getExportFormatExtension(format: ExportFormat): string {
    switch (format) {
        case 'pdf':
            return 'pdf';
        case 'csv':
            return 'csv';
        case 'json':
            return 'json';
        case 'markdown':
        default:
            return 'md';
    }
}

export function getVaultAbsolutePath(plugin: RadialTimelinePlugin, vaultPath: string): string | null {
    return resolveVaultAbsolutePath(plugin, vaultPath);
}

/**
 * Resolve a template path to an absolute path for Pandoc.
 * Handles both vault-relative paths and absolute paths.
 * Returns the absolute path, or the original path if resolution fails.
 */
export function resolveTemplatePath(plugin: RadialTimelinePlugin, templatePath: string): string {
    if (!templatePath || !templatePath.trim()) {
        return templatePath;
    }
    
    const trimmed = templatePath.trim();
    
    // If path is already absolute, use it as-is
    if (path.isAbsolute(trimmed)) {
        return trimmed;
    }
    
    // Otherwise, treat as vault-relative and resolve to absolute
    const absolutePath = resolveVaultAbsolutePath(plugin, trimmed);
    return absolutePath || trimmed; // Fallback to original if resolution fails
}

export async function writeTextFile(
    vault: Vault,
    vaultPath: string,
    content: string
): Promise<void> {
    const normalized = normalizePath(vaultPath);
    const adapter = vault.adapter; // SAFE: adapter write used to save generated export content
    await adapter.write(normalized, content);
}
