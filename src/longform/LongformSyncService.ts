/*
 * Longform Plugin Integration – Sync Service
 *
 * Keeps the Longform index file's `scenes` array in sync with Radial Timeline's
 * prefix-number narrative ordering.  One-directional: RT → Longform.
 *
 * The index file is discovered automatically inside the configured source path
 * by scanning for any markdown file whose frontmatter contains a `longform` key.
 */

import { TFile, TFolder, parseYaml, stringifyYaml } from 'obsidian';
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
    const sourcePath = plugin.settings.sourcePath;
    if (!sourcePath) {
        return { success: false, indexFile: null, sceneCount: 0, message: 'No source path configured in Radial Timeline settings.' };
    }

    // Locate the Longform index file
    const indexFile = findLongformIndex(plugin);
    if (!indexFile) {
        return { success: false, indexFile: null, sceneCount: 0, message: `No Longform index file found in "${sourcePath}".` };
    }

    // Get scenes in narrative (prefix-number) order, including front/back matter
    const selection = await getSceneFilesByOrder(plugin.app, plugin, 'narrative', undefined, true);

    // Keep only scenes that live at the source path level and are not the index file
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
