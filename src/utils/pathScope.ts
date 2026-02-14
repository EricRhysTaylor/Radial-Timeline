import { normalizePath } from 'obsidian';

/**
 * True when `path` is the same folder as `folderPath` or is contained under it.
 * Uses segment-aware matching so sibling folders with common prefixes do not match.
 */
export function isPathInFolderScope(path: string, folderPath: string): boolean {
    const normalizedFolder = normalizePath((folderPath || '').trim());
    if (!normalizedFolder || normalizedFolder === '/' || normalizedFolder === '.') {
        return true;
    }

    const normalizedPath = normalizePath(path);
    return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
}
