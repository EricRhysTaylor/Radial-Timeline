import { normalizePath } from 'obsidian';
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

