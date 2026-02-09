/*
 * Longform Plugin Integration – Type Definitions
 *
 * Mirrors the relevant subset of the Longform v2 index-file frontmatter spec:
 * https://github.com/kevboh/longform/blob/main/docs/INDEX_FILE.md
 */

/** Shape of the `longform` YAML block inside a Longform index file. */
export interface LongformFrontmatter {
    format: 'single' | 'scenes';
    title?: string;
    draftNumber?: number;
    workflow?: string;
    sceneFolder?: string;
    scenes?: string[];
    sceneTemplate?: string;
    ignoredFiles?: string[];
}

/** Result returned by the sync operation. */
export interface LongformSyncResult {
    success: boolean;
    indexFile: string | null;
    sceneCount: number;
    message: string;
}
