import { MetadataCache, TFolder, Vault, normalizePath } from 'obsidian';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';

const BOOK_FOLDER_REGEX = /^Book\s+(\d+)/i;

const DRAFT_VARIANT_PATTERNS: RegExp[] = [
    /\bdraft(?:\s*\d+)?\b/i,
    /\balt(?:ernate)?\b/i,
    /\brevision(?:s)?\b/i,
    /\brev\b/i,
    /(^|[\s._-])v\d+($|[\s._-])/i,
    /\bvariant\b/i
];

export type InquiryBookStatus =
    | 'included'
    | 'excluded_variant'
    | 'excluded_nested'
    | 'excluded_manual';

export interface DiscoveredInquiryBookRoot {
    rootPath: string;
    bookNumber?: number;
    detectedByName: boolean;
    detectedByOutline: boolean;
}

export interface InquiryResolvedBook {
    id: string;
    rootPath: string;
    bookNumber?: number;
    detectedBy: 'name' | 'outline' | 'name+outline';
    isVariant: boolean;
    isNested: boolean;
    nestedUnder?: string;
    defaultIncluded: boolean;
    included: boolean;
    status: InquiryBookStatus;
    statusLabel: string;
    overrideIncluded?: boolean;
}

export interface InquiryBookResolution {
    candidates: InquiryResolvedBook[];
    includedBooks: InquiryResolvedBook[];
    excludedBooks: InquiryResolvedBook[];
    includedRoots: string[];
    excludedRoots: string[];
    hasVariantExclusions: boolean;
    hasNestedExclusions: boolean;
}

const normalizeMaybeRootPath = (value: string): string => {
    const trimmed = (value || '').trim();
    if (!trimmed || trimmed === '/' || trimmed === '.') return '';
    const normalized = normalizePath(trimmed);
    if (!normalized || normalized === '/' || normalized === '.') return '';
    return normalized;
};

export const normalizeInquiryBookInclusion = (raw?: Record<string, unknown>): Record<string, boolean> => {
    if (!raw || typeof raw !== 'object') return {};
    const normalized: Record<string, boolean> = {};
    Object.entries(raw).forEach(([key, value]) => {
        const path = normalizeMaybeRootPath(key || '');
        if (!path) return;
        if (typeof value !== 'boolean') return;
        normalized[path] = value;
    });
    return normalized;
};

export function resolveInquiryBookResolution(params: {
    vault: Vault;
    metadataCache: MetadataCache;
    resolvedVaultRoots: string[];
    frontmatterMappings?: Record<string, string>;
    bookInclusion?: Record<string, unknown>;
}): InquiryBookResolution {
    const discovered = discoverInquiryBookRoots(params);
    return finalizeInquiryBookResolution(discovered, params.bookInclusion);
}

export function finalizeInquiryBookResolution(
    discoveredRoots: DiscoveredInquiryBookRoot[],
    rawOverrides?: Record<string, unknown>
): InquiryBookResolution {
    if (!discoveredRoots.length) {
        return {
            candidates: [],
            includedBooks: [],
            excludedBooks: [],
            includedRoots: [],
            excludedRoots: [],
            hasVariantExclusions: false,
            hasNestedExclusions: false
        };
    }

    const overrides = normalizeInquiryBookInclusion(rawOverrides);
    const sorted = [...discoveredRoots].sort((a, b) => {
        const numA = a.bookNumber ?? Number.POSITIVE_INFINITY;
        const numB = b.bookNumber ?? Number.POSITIVE_INFINITY;
        if (numA !== numB) return numA - numB;
        return a.rootPath.localeCompare(b.rootPath);
    });

    const roots = sorted.map(item => item.rootPath);

    const candidates = sorted.map(item => {
        const nestedUnder = findContainingRoot(item.rootPath, roots);
        const isNested = !!nestedUnder;
        const isVariant = isDraftVariantPath(item.rootPath);
        const defaultIncluded = !isVariant && !isNested;
        const overrideIncluded = overrides[item.rootPath];

        let included = defaultIncluded;
        let status: InquiryBookStatus = 'included';
        let statusLabel = 'Included';

        if (typeof overrideIncluded === 'boolean') {
            included = overrideIncluded;
            if (included) {
                status = 'included';
                statusLabel = defaultIncluded ? 'Included' : 'Included (manual override)';
            } else {
                status = 'excluded_manual';
                statusLabel = 'Excluded (manual)';
            }
        } else if (isNested) {
            included = false;
            status = 'excluded_nested';
            statusLabel = 'Excluded (nested draft)';
        } else if (isVariant) {
            included = false;
            status = 'excluded_variant';
            statusLabel = 'Excluded (duplicate/variant)';
        }

        const detectedBy = item.detectedByName && item.detectedByOutline
            ? 'name+outline'
            : item.detectedByName
                ? 'name'
                : 'outline';

        return {
            id: item.rootPath,
            rootPath: item.rootPath,
            bookNumber: item.bookNumber,
            detectedBy,
            isVariant,
            isNested,
            nestedUnder,
            defaultIncluded,
            included,
            status,
            statusLabel,
            overrideIncluded
        } satisfies InquiryResolvedBook;
    });

    const includedBooks = candidates.filter(book => book.included);
    const excludedBooks = candidates.filter(book => !book.included);

    return {
        candidates,
        includedBooks,
        excludedBooks,
        includedRoots: includedBooks.map(book => book.rootPath),
        excludedRoots: excludedBooks.map(book => book.rootPath),
        hasVariantExclusions: candidates.some(book => !book.included && book.status === 'excluded_variant'),
        hasNestedExclusions: candidates.some(book => !book.included && book.status === 'excluded_nested')
    };
}

export function findInquiryBookForPath(path: string, candidates: Pick<InquiryResolvedBook, 'rootPath'>[]): Pick<InquiryResolvedBook, 'rootPath'> | undefined {
    const normalizedPath = normalizeMaybeRootPath(path);
    if (!normalizedPath) return undefined;

    let match: Pick<InquiryResolvedBook, 'rootPath'> | undefined;
    let bestLen = -1;
    candidates.forEach(candidate => {
        const root = normalizeMaybeRootPath(candidate.rootPath || '');
        if (!root) return;
        if (normalizedPath !== root && !normalizedPath.startsWith(`${root}/`)) return;
        if (root.length > bestLen) {
            bestLen = root.length;
            match = candidate;
        }
    });

    return match;
}

export function isPathIncludedByInquiryBooks(path: string, candidates: InquiryResolvedBook[]): boolean {
    const owner = findInquiryBookForPath(path, candidates);
    if (!owner) return true;
    const full = candidates.find(candidate => candidate.rootPath === owner.rootPath);
    return !!full?.included;
}

export function isDraftVariantPath(path: string): boolean {
    const normalized = normalizeMaybeRootPath(path);
    if (!normalized) return false;

    const segments = normalized.split('/').filter(Boolean);
    if (!segments.length) return false;

    const bookIndex = segments.findIndex(segment => BOOK_FOLDER_REGEX.test(segment));
    if (bookIndex >= 0) {
        const indexes = [bookIndex - 1, bookIndex, bookIndex + 1].filter(idx => idx >= 0 && idx < segments.length);
        return indexes.some(idx => DRAFT_VARIANT_PATTERNS.some(pattern => pattern.test(segments[idx])));
    }

    const leaf = segments[segments.length - 1];
    return DRAFT_VARIANT_PATTERNS.some(pattern => pattern.test(leaf));
}

function discoverInquiryBookRoots(params: {
    vault: Vault;
    metadataCache: MetadataCache;
    resolvedVaultRoots: string[];
    frontmatterMappings?: Record<string, string>;
}): DiscoveredInquiryBookRoot[] {
    const resolvedVaultRoots = Array.from(new Set(
        (params.resolvedVaultRoots || []).map(root => normalizeMaybeRootPath(root))
    ));

    if (!resolvedVaultRoots.length) return [];

    const map = new Map<string, DiscoveredInquiryBookRoot>();
    const outlineBookFolders = collectOutlineBookFolders(params.vault, params.metadataCache, params.frontmatterMappings);

    const addDiscoveredRoot = (rootPath: string, reason: 'name' | 'outline', bookNumber?: number) => {
        const normalizedRoot = normalizeMaybeRootPath(rootPath);
        if (!normalizedRoot) return;
        const prior = map.get(normalizedRoot);
        if (prior) {
            prior.detectedByName = prior.detectedByName || reason === 'name';
            prior.detectedByOutline = prior.detectedByOutline || reason === 'outline';
            if (bookNumber !== undefined && prior.bookNumber === undefined) {
                prior.bookNumber = bookNumber;
            }
            return;
        }

        map.set(normalizedRoot, {
            rootPath: normalizedRoot,
            bookNumber,
            detectedByName: reason === 'name',
            detectedByOutline: reason === 'outline'
        });
    };

    const hasRootScan = resolvedVaultRoots.some(root => root === '');
    if (hasRootScan) {
        const folders = params.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder);

        folders.forEach(folder => {
            const match = BOOK_FOLDER_REGEX.exec(folder.name);
            if (!match) return;
            addDiscoveredRoot(folder.path, 'name', Number(match[1]));
        });

        folders.forEach(folder => {
            if (folder.path.includes('/')) return;
            if (!outlineBookFolders.has(normalizeMaybeRootPath(folder.path))) return;
            addDiscoveredRoot(folder.path, 'outline');
        });
    }

    resolvedVaultRoots.forEach(root => {
        if (!root) return;
        const candidate = extractBookRootByName(root);
        if (candidate) {
            const match = BOOK_FOLDER_REGEX.exec(candidate.split('/').pop() || '');
            addDiscoveredRoot(candidate, 'name', match ? Number(match[1]) : undefined);
            return;
        }
        if (outlineBookFolders.has(root)) {
            addDiscoveredRoot(root, 'outline');
        }
    });

    return Array.from(map.values());
}

function collectOutlineBookFolders(
    vault: Vault,
    metadataCache: MetadataCache,
    frontmatterMappings?: Record<string, string>
): Set<string> {
    const folders = new Set<string>();
    const files = vault.getMarkdownFiles();

    files.forEach(file => {
        const cache = metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return;
        const normalized = normalizeFrontmatterKeys(frontmatter, frontmatterMappings);

        const rawClass = normalized['Class'];
        const classValues = Array.isArray(rawClass) ? rawClass : rawClass ? [rawClass] : [];
        const hasOutlineClass = classValues
            .map(value => (typeof value === 'string' ? value : String(value)).trim().toLowerCase())
            .includes('outline');
        if (!hasOutlineClass) return;

        const scope = normalized['Scope'];
        if (typeof scope !== 'string' || scope.trim().toLowerCase() !== 'book') return;

        const pathSegments = file.path.split('/').filter(Boolean);
        if (pathSegments.length <= 1) return;
        for (let idx = 1; idx < pathSegments.length; idx += 1) {
            const folderPath = pathSegments.slice(0, idx).join('/');
            if (folderPath) folders.add(normalizeMaybeRootPath(folderPath));
        }
    });

    return folders;
}

function extractBookRootByName(path: string): string | null {
    const normalizedPath = normalizeMaybeRootPath(path);
    if (!normalizedPath) return null;
    const segments = normalizedPath.split('/').filter(Boolean);
    const index = segments.findIndex(segment => BOOK_FOLDER_REGEX.test(segment));
    if (index < 0) return null;
    return segments.slice(0, index + 1).join('/');
}

function findContainingRoot(rootPath: string, sortedRoots: string[]): string | undefined {
    let containing: string | undefined;
    sortedRoots.forEach(candidate => {
        if (!candidate || candidate === rootPath) return;
        if (!rootPath.startsWith(`${candidate}/`)) return;
        if (!containing || candidate.length > containing.length) {
            containing = candidate;
        }
    });
    return containing;
}
