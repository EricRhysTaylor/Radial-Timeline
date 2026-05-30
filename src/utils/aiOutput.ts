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

/** @deprecated Content log counting now aggregates current feature content folders. */
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
    // Export folder is no longer user-configurable (same treatment as the
    // AI logs folder). All manuscript, outline, and cue-card exports land in
    // the canonical vault location. Legacy `settings.manuscriptOutputFolder`
    // values are ignored.
    void plugin;
    return normalizePath(DEFAULT_SETTINGS.manuscriptOutputFolder || 'Radial Timeline/Export');
}
