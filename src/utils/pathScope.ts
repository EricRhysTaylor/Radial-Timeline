import { normalizePath } from 'obsidian';

/**
 * Strict folder-scope check.
 * Returns true only when `folderPath` is explicitly set and `path` is inside it.
 * Uses segment-aware matching so sibling folders with common prefixes do not match.
 */
export function isPathInExplicitFolderScope(path: string, folderPath: string): boolean {
    const normalizedFolder = normalizePath((folderPath || '').trim());
    if (!normalizedFolder || normalizedFolder === '/' || normalizedFolder === '.') {
        return false;
    }

    const normalizedPath = normalizePath(path);
    return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
}

/**
 * Backward-compatible permissive scope check.
 * Empty/invalid `folderPath` means "whole vault".
 * Use only for intentionally global read-only contexts.
 */
export function isPathInFolderScopeOrVault(path: string, folderPath: string): boolean {
    const normalizedFolder = normalizePath((folderPath || '').trim());
    if (!normalizedFolder || normalizedFolder === '/' || normalizedFolder === '.') {
        return true;
    }

    const normalizedPath = normalizePath(path);
    return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}/`);
}

/**
 * Alias retained for compatibility.
 * IMPORTANT: this is now strict. Empty folder path is NOT in scope.
 */
export const isPathInFolderScope = isPathInExplicitFolderScope;
