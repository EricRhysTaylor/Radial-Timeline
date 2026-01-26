import { normalizePath, TFile, TFolder } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { DEFAULT_SETTINGS } from '../settings/defaults';

export function resolveAiOutputFolder(plugin: RadialTimelinePlugin): string {
    const raw = plugin.settings.aiOutputFolder?.trim() || DEFAULT_SETTINGS.aiOutputFolder || 'AI';
    return normalizePath(raw);
}

export async function ensureAiOutputFolder(plugin: RadialTimelinePlugin): Promise<string> {
    const folder = resolveAiOutputFolder(plugin);
    try { await plugin.app.vault.createFolder(folder); } catch { /* folder may already exist */ }
    return folder;
}

/**
 * Count all markdown files in the AI output folder and its subfolders.
 * Returns 0 if folder doesn't exist.
 */
export function countAiLogFiles(plugin: RadialTimelinePlugin): number {
    const folderPath = resolveAiOutputFolder(plugin);
    const abstractFile = plugin.app.vault.getAbstractFileByPath(folderPath);
    
    if (!abstractFile || !(abstractFile instanceof TFolder)) {
        return 0;
    }
    
    let count = 0;
    const countRecursive = (folder: TFolder) => {
        for (const child of folder.children) {
            if (child instanceof TFile && child.extension === 'md') {
                count++;
            } else if (child instanceof TFolder) {
                countRecursive(child);
            }
        }
    };
    
    countRecursive(abstractFile);
    return count;
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
