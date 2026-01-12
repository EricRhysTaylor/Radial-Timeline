/*
 * Export format helpers (manuscript + outline + Pandoc)
 */

import { normalizePath, FileSystemAdapter, Vault } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { ManuscriptSceneSelection } from './manuscript';
import * as fs from 'fs'; // SAFE: Node fs required for Pandoc temp files
import * as os from 'os'; // SAFE: Node os required for temp directory resolution
import * as path from 'path'; // SAFE: Node path required for temp/absolute paths

export type ExportType = 'manuscript' | 'outline';
export type ManuscriptPreset = 'screenplay' | 'podcast' | 'novel';
export type OutlinePreset = 'beat-sheet' | 'episode-rundown' | 'shooting-schedule' | 'index-cards-csv' | 'index-cards-json';
export type ExportFormat = 'markdown' | 'docx' | 'pdf' | 'csv' | 'json';

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

export function buildOutlineExport(selection: ManuscriptSceneSelection, preset: OutlinePreset, includeSynopsis = false): OutlineExportResult {
    const titles = selection.titles;
    const whenDates = selection.whenDates;
    const sceneNumbers = selection.sceneNumbers;
    const subplots = selection.subplots;
    const synopses = selection.synopses || [];

    switch (preset) {
        case 'index-cards-csv': {
            const header = includeSynopsis 
                ? ['Scene', 'Title', 'When', 'Subplot', 'Synopsis', 'Path']
                : ['Scene', 'Title', 'When', 'Subplot', 'Path'];
            const rows = titles.map((title, idx) => {
                const sceneLabel = sceneNumbers[idx] || idx + 1;
                const base = [
                    sceneLabel.toString(),
                    formatCsvValue(title),
                    formatCsvValue(whenDates[idx] || ''),
                    formatCsvValue(subplots[idx] || '')
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
                const card: Record<string, unknown> = {
                    scene: sceneNumbers[idx] || idx + 1,
                    title,
                    when: whenDates[idx],
                    subplot: subplots[idx] || null
                };
                if (includeSynopsis) {
                    card.synopsis = synopses[idx] || null;
                }
                card.path = selection.files[idx]?.path || null;
                return card;
            });
            return {
                text: JSON.stringify(cards, null, 2),
                extension: 'json',
                label: 'Index cards (JSON)'
            };
        }
        case 'episode-rundown': {
            const lines = ['# Episode rundown', ''];
            titles.forEach((title, idx) => {
                const sceneLabel = sceneNumbers[idx] || idx + 1;
                const when = whenDates[idx] ? ` · ${whenDates[idx]}` : '';
                lines.push(`${sceneLabel}. ${title}${when}`);
                if (includeSynopsis && synopses[idx]) {
                    lines.push(`   > ${synopses[idx]}`);
                    lines.push('');
                }
            });
            return { text: lines.join('\n'), extension: 'md', label: 'Episode rundown' };
        }
        case 'shooting-schedule': {
            const header = includeSynopsis
                ? ['# Shooting schedule', '', '| Scene | Title | When | Subplot | Synopsis |', '|-------|-------|------|---------|----------|']
                : ['# Shooting schedule', '', '| Scene | Title | When | Subplot |', '|-------|-------|------|---------|'];
            const lines = [...header];
            titles.forEach((title, idx) => {
                const sceneLabel = sceneNumbers[idx] || idx + 1;
                if (includeSynopsis) {
                    const synopsis = (synopses[idx] || '—').replace(/\|/g, '\\|'); // Escape pipes for markdown table
                    lines.push(`| ${sceneLabel} | ${title} | ${whenDates[idx] || '—'} | ${subplots[idx] || '—'} | ${synopsis} |`);
                } else {
                    lines.push(`| ${sceneLabel} | ${title} | ${whenDates[idx] || '—'} | ${subplots[idx] || '—'} |`);
                }
            });
            return { text: lines.join('\n'), extension: 'md', label: 'Shooting schedule' };
        }
        case 'beat-sheet':
        default: {
            const lines = ['# Beat sheet', ''];
            titles.forEach((title, idx) => {
                const sceneLabel = sceneNumbers[idx] || idx + 1;
                lines.push(`${sceneLabel}. ${title}`);
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


