/*
 * Export format helpers (manuscript + outline + Pandoc)
 */

import { normalizePath, FileSystemAdapter, Vault } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { ManuscriptSceneSelection } from './manuscript';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

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
    const adapter = plugin.app.vault.adapter;
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

export function buildOutlineExport(selection: ManuscriptSceneSelection, preset: OutlinePreset): OutlineExportResult {
    const titles = selection.titles;
    const whenDates = selection.whenDates;
    const sceneNumbers = selection.sceneNumbers;
    const subplots = selection.subplots;

    switch (preset) {
        case 'index-cards-csv': {
            const header = ['Scene', 'Title', 'When', 'Subplot', 'Path'];
            const rows = titles.map((title, idx) => {
                const sceneLabel = sceneNumbers[idx] || idx + 1;
                return [
                    sceneLabel.toString(),
                    formatCsvValue(title),
                    formatCsvValue(whenDates[idx] || ''),
                    formatCsvValue(subplots[idx] || ''),
                    formatCsvValue(selection.files[idx]?.path || '')
                ].join(',');
            });
            return {
                text: [header.join(','), ...rows].join('\n'),
                extension: 'csv',
                label: 'Index cards (CSV)'
            };
        }
        case 'index-cards-json': {
            const cards = titles.map((title, idx) => ({
                scene: sceneNumbers[idx] || idx + 1,
                title,
                when: whenDates[idx],
                subplot: subplots[idx] || null,
                path: selection.files[idx]?.path || null
            }));
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
            });
            return { text: lines.join('\n'), extension: 'md', label: 'Episode rundown' };
        }
        case 'shooting-schedule': {
            const lines = ['# Shooting schedule', '', '| Scene | Title | When | Subplot |', '|-------|-------|------|---------|'];
            titles.forEach((title, idx) => {
                const sceneLabel = sceneNumbers[idx] || idx + 1;
                lines.push(`| ${sceneLabel} | ${title} | ${whenDates[idx] || '—'} | ${subplots[idx] || '—'} |`);
            });
            return { text: lines.join('\n'), extension: 'md', label: 'Shooting schedule' };
        }
        case 'beat-sheet':
        default: {
            const lines = ['# Beat sheet', ''];
            titles.forEach((title, idx) => {
                const sceneLabel = sceneNumbers[idx] || idx + 1;
                lines.push(`${sceneLabel}. ${title}`);
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

export async function writeTextFile(
    vault: Vault,
    vaultPath: string,
    content: string
): Promise<void> {
    const normalized = normalizePath(vaultPath);
    const adapter = vault.adapter;
    await adapter.write(normalized, content);
}


