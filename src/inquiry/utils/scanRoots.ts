import { TFolder, Vault, normalizePath } from 'obsidian';

export const MAX_RESOLVED_SCAN_ROOTS = 50;

export type ResolvedScanRoots = {
    resolvedRoots: string[];
    totalMatches: number;
};

const escapeRegExp = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const normalizeScanRootPattern = (raw: string): string => {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '/' || trimmed === '.') return '/';
    const cleaned = trimmed.replace(/^\/+/, '').replace(/\/+$/, '');
    const normalized = normalizePath(cleaned);
    if (!normalized) return '/';
    return `/${normalized}/`;
};

export const normalizeScanRootPatterns = (roots?: string[]): string[] => {
    if (!roots || !roots.length) return [];
    const list = roots.map(normalizeScanRootPattern).filter(Boolean);
    return Array.from(new Set(list));
};

export const parseScanRootInput = (raw: string): string[] => {
    const lines = raw
        .split(/[\n,]/)
        .map(entry => entry.trim())
        .filter(Boolean);
    if (!lines.length) return [];
    return normalizeScanRootPatterns(lines);
};

export const toVaultRoot = (root: string): string => {
    const normalized = normalizeScanRootPattern(root);
    if (normalized === '/') return '';
    return normalized.slice(1, -1);
};

export const toDisplayRoot = (root: string): string => {
    if (!root) return '/';
    const normalized = normalizePath(root);
    return `/${normalized}/`;
};

export const resolveScanRoots = (
    patterns: string[],
    vault: Vault,
    maxRoots = MAX_RESOLVED_SCAN_ROOTS
): ResolvedScanRoots => {
    const normalized = normalizeScanRootPatterns(patterns);
    if (!normalized.length) {
        return { resolvedRoots: [], totalMatches: 0 };
    }
    const folders = vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder);
    const folderPaths = folders.map(folder => folder.path);
    const resolved = new Set<string>();

    normalized.forEach(pattern => {
        if (pattern === '/') {
            resolved.add('');
            return;
        }
        const vaultRoot = toVaultRoot(pattern);
        const segments = vaultRoot.split('/').filter(Boolean);
        const hasWildcard = segments.some(segment => segment.includes('*'));
        if (!hasWildcard) {
            const folder = vault.getAbstractFileByPath(vaultRoot);
            if (folder instanceof TFolder) {
                resolved.add(folder.path);
            }
            return;
        }
        const regex = new RegExp(`^${segments
            .map(segment => escapeRegExp(segment).replace(/\\\*/g, '[^/]*'))
            .join('/')}$`);
        folderPaths.forEach(path => {
            if (regex.test(path)) resolved.add(path);
        });
    });

    const list = Array.from(resolved).sort((a, b) => a.localeCompare(b));
    const totalMatches = list.length;
    const limited = list.slice(0, maxRoots);

    return {
        resolvedRoots: limited.map(toDisplayRoot),
        totalMatches
    };
};
