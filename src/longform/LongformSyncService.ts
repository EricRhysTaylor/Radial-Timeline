/*
 * Longform Plugin Integration – Sync Service
 *
 * Keeps the Longform index file's `scenes` array in sync with Radial Timeline's
 * prefix-number narrative ordering.  One-directional: RT → Longform.
 *
 * The index file is discovered automatically inside the configured source path
 * by scanning for any markdown file whose frontmatter contains a `longform` key.
 */

import { TFile, TFolder } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getSceneFilesByOrder } from '../utils/manuscript';
import type { LongformSyncResult } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// INDEX FILE DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Find the Longform index file inside the current source path.
 * Scans only the top level of the folder (no recursion) for any `.md` file
 * whose cached frontmatter contains a `longform` key.
 */
export function findLongformIndex(plugin: RadialTimelinePlugin): TFile | null {
    const sourcePath = plugin.settings.sourcePath;
    if (!sourcePath) return null;

    const folder = plugin.app.vault.getAbstractFileByPath(sourcePath);
    if (!(folder instanceof TFolder)) return null;

    for (const child of folder.children) {
        if (child instanceof TFile && child.extension === 'md') {
            const cache = plugin.app.metadataCache.getFileCache(child);
            if (cache?.frontmatter?.longform) {
                return child;
            }
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC OPERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Synchronise Radial Timeline's narrative scene order into the Longform
 * index file's `longform.scenes` array.
 *
 * - Reads scenes via `getSceneFilesByOrder('narrative')` (prefix-number order).
 * - Filters to only files that live directly in the source path folder.
 * - Excludes the index file itself from the scene list.
 * - Writes back only the `scenes` key; all other frontmatter is preserved.
 */
export async function syncScenesToLongform(plugin: RadialTimelinePlugin): Promise<LongformSyncResult> {
    const sourcePath = plugin.settings.sourcePath;
    if (!sourcePath) {
        return { success: false, indexFile: null, sceneCount: 0, message: 'No source path configured in Radial Timeline settings.' };
    }

    // Locate the Longform index file
    const indexFile = findLongformIndex(plugin);
    if (!indexFile) {
        return { success: false, indexFile: null, sceneCount: 0, message: `No Longform index file found in "${sourcePath}".` };
    }

    // Get scenes in narrative (prefix-number) order
    const selection = await getSceneFilesByOrder(plugin.app, plugin, 'narrative');

    // Keep only scenes that live at the source path level and are not the index file
    const prefix = sourcePath.endsWith('/') ? sourcePath : sourcePath + '/';
    const sceneNames = selection.files
        .filter(f => f.path.startsWith(prefix) && f.path !== indexFile.path)
        .map(f => f.basename); // Longform expects filenames without .md

    // Update the longform.scenes array in the index file frontmatter
    await plugin.app.fileManager.processFrontMatter(indexFile, (fm) => {
        if (!fm.longform) return; // safety: should always exist if we found the file
        fm.longform.scenes = sceneNames;
    });

    return {
        success: true,
        indexFile: indexFile.path,
        sceneCount: sceneNames.length,
        message: `Synced ${sceneNames.length} scenes → ${indexFile.basename}`
    };
}
