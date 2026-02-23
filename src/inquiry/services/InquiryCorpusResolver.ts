import { MetadataCache, TFile, Vault } from 'obsidian';
import type { InquiryScope } from '../state';
import type { InquiryClassConfig, InquirySourcesSettings } from '../../types/settings';
import { normalizeFrontmatterKeys } from '../../utils/frontmatter';
import { getScenePrefixNumber } from '../../utils/text';
import { MAX_RESOLVED_SCAN_ROOTS, normalizeScanRootPatterns, resolveScanRoots, toVaultRoot } from '../utils/scanRoots';
import { readSceneId } from '../../utils/sceneIds';
import { resolveInquiryBookResolution } from './bookResolution';

export type InquiryCorpusItem = {
    id: string;
    displayLabel: string;
    filePaths: string[];
    sceneId?: string;
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

        const bookResolution = resolveInquiryBookResolution({
            vault: this.vault,
            metadataCache: this.metadataCache,
            resolvedVaultRoots,
            frontmatterMappings: this.frontmatterMappings,
            bookInclusion: sources.bookInclusion
        });

        const books = this.buildBookItems(bookResolution.includedBooks.map(book => ({
            rootPath: book.rootPath,
            bookNumber: book.bookNumber
        })));
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

    private buildBookItems(books: Array<{ rootPath: string; bookNumber?: number }>): InquiryBookItem[] {
        return books
            .sort((a, b) => {
                const numA = a.bookNumber ?? Number.POSITIVE_INFINITY;
                const numB = b.bookNumber ?? Number.POSITIVE_INFINITY;
                if (numA !== numB) return numA - numB;
                return a.rootPath.localeCompare(b.rootPath);
            })
            .map((book, index) => ({
                id: book.rootPath,
                rootPath: book.rootPath,
                filePaths: [book.rootPath],
                displayLabel: `B${this.clampLabelNumber(book.bookNumber ?? index + 1)}`,
                bookNumber: book.bookNumber
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
            const sceneId = readSceneId(frontmatter);
            const stableId = sceneId && sceneId.trim().length > 0 ? sceneId.trim() : file.path;
            scenes.push({
                id: stableId,
                bookId,
                filePath: file.path,
                filePaths: [file.path],
                displayLabel: '',
                sceneId,
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

    /**
     * Returns true when frontmatter["Summary"] exists.
     * Synopsis is not used by Inquiry.
     * Legacy name kept for type compatibility with InquiryCorpusItem.hasSynopsis.
     */
    private hasSynopsis(frontmatter: Record<string, unknown>): boolean {
        const value = frontmatter['Summary'];
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'string') return value.trim().length > 0;
        return !!value;
    }

    /** Alias for hasSynopsis — prefer in new code to prevent semantic drift. */
    private hasSummary(frontmatter: Record<string, unknown>): boolean {
        return this.hasSynopsis(frontmatter);
    }

    private clampLabelNumber(value: number): number {
        if (!Number.isFinite(value)) return 1;
        return Math.min(Math.max(Math.floor(value), 1), 999);
    }
}
