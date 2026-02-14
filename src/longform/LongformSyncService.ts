/*
 * Longform Plugin Integration – Sync Service
 *
 * Keeps the Longform index file's `scenes` array in sync with Radial Timeline's
 * prefix-number narrative ordering.  One-directional: RT → Longform.
 *
 * The index file is discovered automatically inside the configured source path
 * (book folder): first at top level, then in direct subfolders, to support
 * Longform's default "Create Longform Project" behavior (index inside a named subfolder).
 */

import { TFile, TFolder, parseYaml, stringifyYaml } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getSceneFilesByOrder } from '../utils/manuscript';
import type { LongformSyncResult } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// INDEX FILE DISCOVERY
// ═══════════════════════════════════════════════════════════════════════════════

/** Effective book root for Longform: active book's source folder or legacy source path. */
export function getLongformSourcePath(plugin: RadialTimelinePlugin): string {
    const active = plugin.getActiveBook();
    const fromBook = active?.sourceFolder?.trim();
    if (fromBook) return fromBook;
    return (plugin.settings.sourcePath || '').trim();
}

/**
 * Scan a folder's direct children for a single .md file with longform frontmatter.
 */
function findIndexInFolder(plugin: RadialTimelinePlugin, folder: TFolder): TFile | null {
    for (const child of folder.children) {
        if (child instanceof TFile && child.extension === 'md') {
            const cache = plugin.app.metadataCache.getFileCache(child);
            if (cache?.frontmatter?.longform) return child;
        }
    }
    return null;
}

/**
 * Find the Longform index file inside the current book/source path.
 * Looks at the top level first, then one level down (direct subfolders), so
 * the default Longform "Create Longform Project" layout (index inside a subfolder)
 * is supported without requiring the user to move the index to the book root.
 */
export function findLongformIndex(plugin: RadialTimelinePlugin): TFile | null {
    const sourcePath = getLongformSourcePath(plugin);
    if (!sourcePath) return null;

    const folder = plugin.app.vault.getAbstractFileByPath(sourcePath);
    if (!(folder instanceof TFolder)) return null;

    // 1) Top level (same folder as book)
    const atTop = findIndexInFolder(plugin, folder);
    if (atTop) return atTop;

    // 2) One level down: each direct subfolder (default Longform project layout)
    for (const child of folder.children) {
        if (child instanceof TFolder) {
            const inSub = findIndexInFolder(plugin, child);
            if (inSub) return inSub;
        }
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SYNC OPERATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Escape a string for safe inclusion in a YAML double-quoted scalar.
 * Handles backslashes, double quotes, and other special characters.
 */
function yamlDoubleQuote(value: string): string {
    const escaped = value
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t');
    return `"${escaped}"`;
}

/**
 * Serialise a `scenes` array into YAML list lines using explicit double-quoting.
 * This avoids the Obsidian YAML stringifier bug where apostrophes inside
 * single-quoted scalars are not properly escaped (e.g. `'Jane's Discovery'`).
 */
function buildScenesYaml(sceneNames: string[]): string {
    if (sceneNames.length === 0) return '  scenes: []\n';
    const lines = sceneNames.map(name => `    - ${yamlDoubleQuote(name)}`);
    return `  scenes:\n${lines.join('\n')}\n`;
}

/**
 * Synchronise Radial Timeline's narrative scene order into the Longform
 * index file's `longform.scenes` array.
 *
 * - Reads scenes via `getSceneFilesByOrder('narrative')` (prefix-number order).
 * - Filters to only files that live directly in the source path folder.
 * - Excludes the index file itself from the scene list.
 * - Writes back only the `scenes` key; all other frontmatter is preserved.
 *
 * Uses manual YAML editing (not processFrontMatter) to guarantee correct
 * quoting of scene names that contain apostrophes, colons, or other
 * YAML-special characters.
 */
export async function syncScenesToLongform(plugin: RadialTimelinePlugin): Promise<LongformSyncResult> {
    const sourcePath = getLongformSourcePath(plugin);
    if (!sourcePath) {
        return { success: false, indexFile: null, sceneCount: 0, message: 'No source path configured. Set an active book folder in Settings → General → Books.' };
    }

    // Locate the Longform index file (book folder or one level of subfolders)
    const indexFile = findLongformIndex(plugin);
    if (!indexFile) {
        return { success: false, indexFile: null, sceneCount: 0, message: `No Longform index file found in "${sourcePath}" or its subfolders.` };
    }

    // Get scenes in narrative (prefix-number) order, including front/back matter
    const selection = await getSceneFilesByOrder(plugin.app, plugin, 'narrative', undefined, true);

    // Keep only scenes that live under the book root and are not the index file
    const prefix = sourcePath.endsWith('/') ? sourcePath : sourcePath + '/';
    const sceneNames = selection.files
        .filter(f => f.path.startsWith(prefix) && f.path !== indexFile.path)
        .map(f => f.basename); // Longform expects filenames without .md

    // ── Safe YAML update ────────────────────────────────────────────────────
    // Read the file, locate the longform.scenes block, and replace it with
    // properly double-quoted scene names.  This avoids processFrontMatter's
    // YAML stringifier which can break on apostrophes and other specials.
    const content = await plugin.app.vault.read(indexFile);

    // Split at frontmatter boundaries
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) {
        return { success: false, indexFile: indexFile.path, sceneCount: 0, message: 'Could not parse frontmatter in index file.' };
    }

    const fmRaw = fmMatch[1];

    // Locate the `longform:` block and replace (or insert) its `scenes:` key.
    // Strategy: parse the YAML object, update scenes, then re-serialise the
    // longform block only — preserving everything outside it.
    let yaml: Record<string, any>;
    try {
        yaml = parseYaml(fmRaw);
    } catch {
        return { success: false, indexFile: indexFile.path, sceneCount: 0, message: 'Failed to parse YAML in index file.' };
    }

    if (!yaml?.longform) {
        return { success: false, indexFile: indexFile.path, sceneCount: 0, message: 'No longform block found in index file frontmatter.' };
    }

    // Update the object (for non-scenes keys) and re-serialise longform block
    yaml.longform.scenes = sceneNames;

    // Serialise the full longform block, then surgically replace the scenes
    // array with our safe double-quoted version.
    const longformCopy = { ...yaml.longform };
    delete longformCopy.scenes;
    let longformYaml = stringifyYaml({ longform: longformCopy }).trimEnd();
    // Append our safe scenes array
    longformYaml += '\n' + buildScenesYaml(sceneNames);

    // Replace the longform: block in the raw frontmatter.
    // Match from `longform:` to the next top-level key or end of frontmatter.
    const longformBlockRegex = /^longform:[\s\S]*?(?=^\S|\Z)/m;
    let newFmRaw: string;
    if (longformBlockRegex.test(fmRaw)) {
        // Extract just the "longform:" portion from our serialised YAML
        // (stringifyYaml wraps it in `longform:\n  ...`)
        const longformSection = longformYaml.replace(/^longform:\n?/, 'longform:\n');
        newFmRaw = fmRaw.replace(longformBlockRegex, longformSection + '\n');
    } else {
        // Shouldn't happen (we already checked yaml.longform exists), but append
        newFmRaw = fmRaw + '\n' + longformYaml + '\n';
    }

    const newContent = content.replace(/^---\n[\s\S]*?\n---/, `---\n${newFmRaw.trimEnd()}\n---`);
    await plugin.app.vault.modify(indexFile, newContent);

    return {
        success: true,
        indexFile: indexFile.path,
        sceneCount: sceneNames.length,
        message: `Synced ${sceneNames.length} scenes → ${indexFile.basename}`
    };
}
