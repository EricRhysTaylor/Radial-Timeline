/*
 * Matter note summary collector.
 *
 * Pure read of the active book's matter notes from the Obsidian metadata
 * cache, normalized for the Book Pages resolver. Shared by:
 *   - Settings → Publish preview UI (`PublishSection.ts`)
 *   - Manuscript export pipeline (`assembleManuscript`)
 *
 * The resolver consumes summaries (already-classified notes) — this collector
 * is the single producer so the preview and export agree on what the matter
 * universe is.
 */

import type RadialTimelinePlugin from '../main';
import { getActiveBookExportContext } from './exportContext';
import { getActiveFrontmatterMappings, normalizeFrontmatterKeys } from './frontmatter';
import { isPathInFolderScope } from './pathScope';
import { normalizeMatterClassValue } from './matterMeta';
import type { MatterNoteSummary } from './bookPagesResolver';

/**
 * Collect matter note summaries for the active book.
 *
 * Walks markdown files in the active book's source folder, filters to notes
 * whose YAML has `Class: Frontmatter | Backmatter`, and returns one summary
 * per note. Sort order is numeric-natural by path so legacy notes whose
 * filename is the only role signal still resolve in author intent order
 * (`0.1 ... < 0.2 ... < 0.10 ...`).
 *
 * Sync — uses the metadata cache only (no file reads).
 */
export function getActiveBookMatterNoteSummaries(plugin: RadialTimelinePlugin): MatterNoteSummary[] {
    const sourceFolder = getActiveBookExportContext(plugin).sourceFolder.trim();
    if (!sourceFolder) return [];
    const mappings = getActiveFrontmatterMappings(plugin.settings);
    const result: MatterNoteSummary[] = [];
    const files = plugin.app.vault.getMarkdownFiles()
        .filter(file => isPathInFolderScope(file.path, sourceFolder))
        .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
    for (const file of files) {
        const cache = plugin.app.metadataCache.getFileCache(file);
        const raw = cache?.frontmatter;
        if (!raw) continue;
        const normalized = normalizeFrontmatterKeys(raw, mappings);
        const matterClass = normalizeMatterClassValue(normalized.Class);
        if (!matterClass) continue;
        // Role may be empty — the resolver will try filename inference, then
        // surface the note as a custom page if no canonical role matches.
        const role = typeof normalized.Role === 'string' ? normalized.Role.trim() : '';
        const bodyMode = typeof normalized.BodyMode === 'string' && normalized.BodyMode.trim().toLowerCase() === 'latex'
            ? 'latex'
            : 'plain';
        const side: 'frontmatter' | 'backmatter' = matterClass === 'backmatter' ? 'backmatter' : 'frontmatter';
        result.push({
            role,
            path: file.path,
            title: file.basename,
            bodyMode,
            side
        });
    }
    return result;
}
