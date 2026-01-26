import { MetadataCache, TFile, TFolder, Vault, normalizePath } from 'obsidian';
import type { InquiryScope } from '../state';
import type { InquiryClassConfig, InquirySourcesSettings } from '../../types/settings';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { getScenePrefixNumber } from '../../utils/text';
import { MAX_RESOLVED_SCAN_ROOTS, normalizeScanRootPatterns, resolveScanRoots, toVaultRoot } from '../utils/scanRoots';

const BOOK_FOLDER_REGEX = /^Book\s+(\d+)/i;

export type InquiryCorpusItem = {
    id: string;
    displayLabel: string;
    filePaths: string[];
    hasSynopsis?: boolean;
};

export type InquiryBookItem = InquiryCorpusItem & {
    rootPath: string;
    bookNumber?: number;
};

export type InquirySceneItem = InquiryCorpusItem & {
    bookId: string;
    filePath: string;
    sceneNumber?: number;
};

export type InquiryCorpusSnapshot = {
    scope: InquiryScope;
    resolvedRoots: string[];
    books: InquiryBookItem[];
    scenes: InquirySceneItem[];
    activeBookId?: string;
};

export type InquiryCorpusResolveParams = {
    scope: InquiryScope;
    focusBookId?: string;
    sources: InquirySourcesSettings;
};

export class InquiryCorpusResolver {
    private vault: Vault;
    private metadataCache: MetadataCache;
    private frontmatterMappings?: Record<string, string>;

    constructor(vault: Vault, metadataCache: MetadataCache, frontmatterMappings?: Record<string, string>) {
        this.vault = vault;
        this.metadataCache = metadataCache;
        this.frontmatterMappings = frontmatterMappings;
    }

    resolve(params: InquiryCorpusResolveParams): InquiryCorpusSnapshot {
        const sources = params.sources;
        const classScope = this.getClassScopeConfig(sources.classScope);
        if (!classScope.allowAll && classScope.allowed.size === 0) {
            return {
                scope: params.scope,
                resolvedRoots: [],
                books: [],
                scenes: [],
                activeBookId: undefined
            };
        }
        const scanRoots = normalizeScanRootPatterns(sources.scanRoots);
        const resolvedRoots = scanRoots.length
            ? (sources.resolvedScanRoots && sources.resolvedScanRoots.length
                ? sources.resolvedScanRoots
                : resolveScanRoots(scanRoots, this.vault, MAX_RESOLVED_SCAN_ROOTS).resolvedRoots)
            : [];
        const resolvedVaultRoots = resolvedRoots.map(toVaultRoot);

        const books = this.buildBookItems(resolvedVaultRoots);
        const activeBookId = this.getActiveBookId(books, params.focusBookId);
        const scenes = params.scope === 'book' && activeBookId
            ? this.buildSceneItems(activeBookId, resolvedVaultRoots, sources.classes || [], classScope)
            : [];

        return {
            scope: params.scope,
            resolvedRoots,
            books,
            scenes,
            activeBookId
        };
    }

    private buildBookItems(resolvedVaultRoots: string[]): InquiryBookItem[] {
        if (!resolvedVaultRoots.length) return [];

        const bookMap = new Map<string, InquiryBookItem>();
        const hasRootScan = resolvedVaultRoots.some(root => root === '');

        if (hasRootScan) {
            const folders = this.vault.getAllLoadedFiles().filter((file): file is TFolder => file instanceof TFolder);
            folders.forEach(folder => {
                const match = BOOK_FOLDER_REGEX.exec(folder.name);
                if (!match) return;
                const bookNumber = Number(match[1]);
                this.addBookItem(bookMap, folder.path, bookNumber);
            });
        }

        resolvedVaultRoots.forEach(root => {
            if (!root) return;
            const candidate = this.extractBookRoot(root);
            if (candidate) {
                const match = BOOK_FOLDER_REGEX.exec(candidate.split('/').pop() || '');
                const bookNumber = match ? Number(match[1]) : undefined;
                this.addBookItem(bookMap, candidate, bookNumber);
                return;
            }
            this.addBookItem(bookMap, root, undefined);
        });

        const list = Array.from(bookMap.values());
        list.sort((a, b) => {
            const numA = a.bookNumber ?? Number.POSITIVE_INFINITY;
            const numB = b.bookNumber ?? Number.POSITIVE_INFINITY;
            if (numA !== numB) return numA - numB;
            return a.rootPath.localeCompare(b.rootPath);
        });

        return list.map((book, index) => ({
            ...book,
            displayLabel: `B${this.clampLabelNumber(book.bookNumber ?? index + 1)}`
        }));
    }

    private buildSceneItems(
        bookId: string,
        resolvedVaultRoots: string[],
        classConfigs: InquiryClassConfig[],
        classScope: { allowAll: boolean; allowed: Set<string> }
    ): InquirySceneItem[] {
        const classConfig = classConfigs.find(cfg => cfg.className === 'scene');
        if (!classConfig || !classConfig.enabled || classConfig.bookScope === 'none') return [];
        if (!classScope.allowAll && !classScope.allowed.has('scene')) return [];

        const inRoots = (path: string): boolean => {
            return resolvedVaultRoots.some(root => !root || path === root || path.startsWith(`${root}/`));
        };

        const isInBook = (path: string): boolean => {
            return path === bookId || path.startsWith(`${bookId}/`);
        };

        const files = this.vault.getMarkdownFiles();
        const scenes: InquirySceneItem[] = [];

        files.forEach(file => {
            if (!inRoots(file.path)) return;
            if (!isInBook(file.path)) return;
            const frontmatter = this.getFrontmatter(file);
            if (!frontmatter) return;
            const classValues = this.extractClassValues(frontmatter);
            if (!classValues.includes('scene')) return;
            const sceneNumber = this.getSceneNumber(file.basename);
            const hasSynopsis = this.hasSynopsis(frontmatter);
            scenes.push({
                id: file.path,
                bookId,
                filePath: file.path,
                filePaths: [file.path],
                displayLabel: '',
                sceneNumber,
                hasSynopsis
            });
        });

        scenes.sort((a, b) => {
            const numA = a.sceneNumber ?? Number.POSITIVE_INFINITY;
            const numB = b.sceneNumber ?? Number.POSITIVE_INFINITY;
            if (numA !== numB) return numA - numB;
            return a.filePath.localeCompare(b.filePath);
        });

        return scenes.map((scene, index) => ({
            ...scene,
            displayLabel: `S${this.clampLabelNumber(scene.sceneNumber ?? index + 1)}`
        }));
    }

    private getActiveBookId(books: InquiryBookItem[], focusBookId?: string): string | undefined {
        if (!books.length) return undefined;
        if (focusBookId && books.some(book => book.id === focusBookId)) return focusBookId;
        return books[0].id;
    }

    private addBookItem(map: Map<string, InquiryBookItem>, rootPath: string, bookNumber?: number): void {
        const normalized = normalizePath(rootPath);
        if (!normalized) return;
        if (map.has(normalized)) return;
        map.set(normalized, {
            id: normalized,
            rootPath: normalized,
            filePaths: [normalized],
            displayLabel: '',
            bookNumber
        });
    }

    private extractBookRoot(path: string): string | null {
        const segments = normalizePath(path).split('/').filter(Boolean);
        const index = segments.findIndex(segment => BOOK_FOLDER_REGEX.test(segment));
        if (index < 0) return null;
        return segments.slice(0, index + 1).join('/');
    }

    private getFrontmatter(file: TFile): Record<string, unknown> | null {
        const cache = this.metadataCache.getFileCache(file);
        const frontmatter = cache?.frontmatter as Record<string, unknown> | undefined;
        if (!frontmatter) return null;
        return normalizeFrontmatterKeys(frontmatter, this.frontmatterMappings);
    }

    private extractClassValues(frontmatter: Record<string, unknown>): string[] {
        const rawClass = frontmatter['Class'];
        const values = Array.isArray(rawClass) ? rawClass : rawClass ? [rawClass] : [];
        return values
            .map(value => (typeof value === 'string' ? value : String(value)).trim())
            .filter(Boolean)
            .map(value => value.toLowerCase());
    }

    private getSceneNumber(title?: string): number | undefined {
        const prefix = getScenePrefixNumber(title ?? '', undefined);
        if (!prefix) return undefined;
        const parsed = Number(prefix);
        if (!Number.isFinite(parsed)) return undefined;
        return Math.max(1, Math.floor(parsed));
    }

    private getClassScopeConfig(raw?: string[]): { allowAll: boolean; allowed: Set<string> } {
        const list = (raw || []).map(entry => entry.trim().toLowerCase()).filter(Boolean);
        const allowAll = list.includes('/');
        const allowed = new Set(list.filter(entry => entry !== '/'));
        return { allowAll, allowed };
    }

    private hasSynopsis(frontmatter: Record<string, unknown>): boolean {
        const value = frontmatter['Synopsis'];
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'string') return value.trim().length > 0;
        return !!value;
    }

    private clampLabelNumber(value: number): number {
        if (!Number.isFinite(value)) return 1;
        return Math.min(Math.max(Math.floor(value), 1), 999);
    }
}
