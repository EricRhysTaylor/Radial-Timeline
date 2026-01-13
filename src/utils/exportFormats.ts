/*
 * Export format helpers (manuscript + outline + Pandoc)
 */

import { normalizePath, FileSystemAdapter, Vault } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { ManuscriptSceneSelection, ManuscriptOrder } from './manuscript';
import * as fs from 'fs'; // SAFE: Node fs required for Pandoc temp files
import * as os from 'os'; // SAFE: Node os required for temp directory resolution
import * as path from 'path'; // SAFE: Node path required for temp/absolute paths
import { formatRuntimeValue, RuntimeSettings } from './runtimeEstimator';

export type ExportType = 'manuscript' | 'outline';
export type ManuscriptPreset = 'screenplay' | 'podcast' | 'novel';
export type OutlinePreset = 'beat-sheet' | 'episode-rundown' | 'shooting-schedule' | 'index-cards-csv' | 'index-cards-json';
export type ExportFormat = 'markdown' | 'docx' | 'pdf' | 'csv' | 'json';

// ════════════════════════════════════════════════════════════════════════════
// Export Filename Acronyms
// ════════════════════════════════════════════════════════════════════════════

/**
 * Get acronym for scene ordering
 */
function getOrderAcronym(order: ManuscriptOrder): string {
    switch (order) {
        case 'narrative': return 'Narr';
        case 'reverse-narrative': return 'RevN';
        case 'chronological': return 'Chro';
        case 'reverse-chronological': return 'RevC';
        default: return 'Narr';
    }
}

/**
 * Get acronym for outline preset
 */
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

/**
 * Get acronym for manuscript preset (only for Pro presets)
 */
function getManuscriptPresetAcronym(preset: ManuscriptPreset): string {
    switch (preset) {
        case 'screenplay': return 'Scrn';
        case 'podcast': return 'Podc';
        case 'novel': return 'Novl';
        default: return 'Novl';
    }
}

/**
 * Generate friendly timestamp: "Jan 12 @ 3.32PM"
 */
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
}

/**
 * Build export filename with acronyms
 * Pattern: "[Category] [Preset] [Sub-][Order] [Timestamp].[ext]"
 * Examples:
 *   - "Manuscript Novl Narr Jan 12 @ 3.32PM.md"
 *   - "Manuscript Scrn Sub-Chro Jan 12 @ 3.32PM.docx"
 *   - "Outline BtSh RevN Jan 12 @ 3.32PM.md"
 *   - "Outline IdxC Sub-RevC Jan 12 @ 3.32PM.csv"
 */
export function buildExportFilename(options: ExportFilenameOptions): string {
    const timestamp = generateFriendlyTimestamp();
    const orderAcronym = getOrderAcronym(options.order);
    const hasSubplotFilter = options.subplotFilter && options.subplotFilter !== 'All Subplots';
    const orderPart = hasSubplotFilter ? `Sub-${orderAcronym}` : orderAcronym;
    
    if (options.exportType === 'outline') {
        const presetAcronym = getOutlinePresetAcronym(options.outlinePreset || 'beat-sheet');
        return `Outline ${presetAcronym} ${orderPart} ${timestamp}.${options.extension}`;
    } else {
        const presetAcronym = getManuscriptPresetAcronym(options.manuscriptPreset || 'novel');
        return `Manuscript ${presetAcronym} ${orderPart} ${timestamp}.${options.extension}`;
    }
}

export interface PandocOptions {
    targetFormat: 'docx' | 'pdf';
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
    if (options.pandocPath && options.pandocPath.trim()) {
        return options.pandocPath.trim();
    }
    if (options.enableFallback && options.fallbackPath && options.fallbackPath.trim()) {
        return options.fallbackPath.trim();
    }
    return 'pandoc';
}

export async function runPandocOnContent(
    content: string,
    outputAbsolutePath: string,
    options: PandocOptions
): Promise<void> {
    const binary = resolvePandocBinary(options);
    const tmpDir = os.tmpdir();
    const tmpInput = path.join(tmpDir, `rt-pandoc-${Date.now()}.md`);
    await fs.promises.writeFile(tmpInput, content, 'utf8');

    const args = ['-f', 'markdown', '-t', options.targetFormat, '-o', outputAbsolutePath, tmpInput];
    if (options.templatePath && options.templatePath.trim()) {
        args.push('--template', options.templatePath.trim());
    }

    const { execFile } = await import('child_process');
    await new Promise<void>((resolve, reject) => {
        execFile(binary, args, { cwd: options.workingDir }, (error, _stdout, stderr) => {
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

    // Calculations for runtime
    const totalRuntimeSeconds = (runtimes as (number | null)[]).reduce<number>(
        (sum, r) => sum + (r ?? 0),
        0
    );
    const totalFormattedRuntime = formatRuntimeValue(totalRuntimeSeconds);

    // Calculations for writing planning
    const draftingWpm = runtimeSettings?.sessionPlanning?.draftingWpm || 0;
    const dailyMinutes = runtimeSettings?.sessionPlanning?.dailyMinutes || 0;
    
    // Estimate writing time (hours)
    // Formula: (WordCount / WPM) / 60
    const calculateWritingHours = (words: number) => {
        if (!draftingWpm || draftingWpm <= 0) return 0;
        return (words / draftingWpm) / 60;
    };
    
    // Total estimated writing hours
    const totalWords = (wordCounts as (number | null)[]).reduce<number>(
        (sum, w) => sum + (w ?? 0),
        0
    );
    const totalWritingHours = calculateWritingHours(totalWords);
    
    // Sessions calculation
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
            
            // Add summary metadata if planning data is available
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

export function getExportFormatExtension(format: ExportFormat): string {
    switch (format) {
        case 'docx':
            return 'docx';
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


