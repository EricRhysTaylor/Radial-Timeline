import { normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { countContentLogFiles, resolveLogsRoot } from '../ai/log';
import { DEFAULT_SETTINGS } from '../settings/defaults';

export function resolveAiOutputFolder(plugin: RadialTimelinePlugin): string {
    void plugin;
    return resolveLogsRoot();
}

export async function ensureAiOutputFolder(plugin: RadialTimelinePlugin): Promise<string> {
    const folder = resolveAiOutputFolder(plugin);
    try { await plugin.app.vault.createFolder(folder); } catch { /* folder may already exist */ }
    return folder;
}

/** @deprecated Content log counting now targets only `Radial Timeline/Logs/Content`. */
export function countAiLogFiles(plugin: RadialTimelinePlugin): number {
    return countContentLogFiles(plugin);
}

export function resolveManuscriptOutputFolder(plugin: RadialTimelinePlugin): string {
    return resolveExportOutputFolder(plugin);
}

export async function ensureManuscriptOutputFolder(plugin: RadialTimelinePlugin): Promise<string> {
    const folder = resolveManuscriptOutputFolder(plugin);
    try { await plugin.app.vault.createFolder(folder); } catch { /* folder may already exist */ }
    return folder;
}

export function resolveOutlineOutputFolder(plugin: RadialTimelinePlugin): string {
    return resolveExportOutputFolder(plugin);
}

export async function ensureOutlineOutputFolder(plugin: RadialTimelinePlugin): Promise<string> {
    const folder = resolveOutlineOutputFolder(plugin);
    try { await plugin.app.vault.createFolder(folder); } catch { /* folder may already exist */ }
    return folder;
}

export function resolveExportOutputFolder(plugin: RadialTimelinePlugin): string {
    const raw = plugin.settings.manuscriptOutputFolder?.trim()
        || plugin.settings.outlineOutputFolder?.trim()
        || DEFAULT_SETTINGS.manuscriptOutputFolder
        || DEFAULT_SETTINGS.outlineOutputFolder
        || 'Radial Timeline/Export';
    return normalizePath(raw);
}
