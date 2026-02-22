/**
 * YAML Manager engine.
 *
 * Destructive operations on frontmatter: delete fields and canonical reorder.
 * All operations are safety-gated by the yamlSafety scanner.
 *
 * Uses Obsidian's processFrontMatter() for delete operations and raw
 * file rewrite (vault.read/modify) for reorder (key order control).
 *
 * Follows the same patterns as yamlBackfill.ts:
 * - Atomic per-file updates
 * - Per-file try/catch (never abort batch on single failure)
 * - Abort signal support
 * - Progress callbacks
 * - Structured result objects
 */
import { type App, type TFile, parseYaml, stringifyYaml, getFrontMatterInfo } from 'obsidian';
import {
    type FrontmatterSafetyResult,
    scanFrontmatterSafety,
} from './yamlSafety';
import { buildFrontmatterDocument, extractBodyAfterFrontmatter } from './frontmatterDocument';

// ─── Types ──────────────────────────────────────────────────────────────

export interface DeleteFieldsOptions {
    app: App;
    /** Pre-filtered target files. */
    files: TFile[];
    /** Field names to delete. */
    fieldsToDelete: string[];
    /** Known template + dynamic keys — these are protected from deletion. */
    protectedKeys?: Set<string>;
    /** When true, only delete fields that are truly empty. Default: false. */
    onlyEmpty?: boolean;
    /** Pre-computed safety results per file (avoids re-scanning). */
    safetyResults?: Map<TFile, FrontmatterSafetyResult>;
    onProgress?: (current: number, total: number, filename: string) => void;
    abortSignal?: AbortSignal;
}

export interface DeleteResult {
    /** Notes that had at least one field deleted. */
    deleted: number;
    /** Notes skipped (nothing to delete, or safety-blocked). */
    skipped: number;
    /** Notes where processFrontMatter threw. */
    failed: number;
    /** Per-file detail of which fields were actually removed. */
    deletedFields: { file: TFile; fields: string[] }[];
    /** Notes skipped specifically because the safety scanner flagged them. */
    safetySkipped: number;
    errors: { file: TFile; error: string }[];
}

export interface ReorderOptions {
    app: App;
    files: TFile[];
    /** Canonical key order (base + custom keys in template order). */
    canonicalOrder: string[];
    /** Pre-computed safety results per file. */
    safetyResults?: Map<TFile, FrontmatterSafetyResult>;
    onProgress?: (current: number, total: number, filename: string) => void;
    abortSignal?: AbortSignal;
}

export interface ReorderResult {
    /** Notes whose frontmatter was reordered. */
    reordered: number;
    /** Notes skipped (already in order, no frontmatter, or safety-blocked). */
    skipped: number;
    /** Notes where the raw rewrite failed. */
    failed: number;
    /** Notes skipped specifically because the safety scanner flagged them. */
    safetySkipped: number;
    errors: { file: TFile; error: string }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────

function isTrulyEmpty(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

/**
 * Check if a file's safety result allows destructive operations.
 * Returns true if the file is safe to modify; false if it should be skipped.
 */
function isSafeForModification(
    safetyResult: FrontmatterSafetyResult | undefined
): boolean {
    if (!safetyResult) return true;
    return safetyResult.status !== 'dangerous';
}

/**
 * FrontMatterInfo type matching what Obsidian's getFrontMatterInfo returns.
 * Obsidian's type is not fully exported, so we define the shape we need.
 */
interface FMInfo {
    exists: boolean;
    frontmatter: string;
    from: number;
    to: number;
    position?: { end?: { offset?: number } };
}

// ─── Delete operations ──────────────────────────────────────────────────

/**
 * Delete specified frontmatter fields from the supplied files.
 *
 * Safety guarantees:
 * - Never deletes fields in `protectedKeys` (template-defined keys).
 *   Callers MUST populate protectedKeys with at least the merged schema keys
 *   (from `getTemplateParts().merged`) and RESERVED_OBSIDIAN_KEYS.
 * - Dynamic suffix zone keys (Gossamer, Pulse timestamps, scene analysis, etc.)
 *   should be filtered out by the caller using `getExcludeKeyPredicate()` before
 *   passing `fieldsToDelete`.
 * - Skips files flagged as dangerous by the safety scanner
 * - When `onlyEmpty` is true, only removes fields with empty values
 * - Uses processFrontMatter() for atomic updates
 */
export async function runYamlDeleteFields(
    options: DeleteFieldsOptions
): Promise<DeleteResult> {
    const {
        app,
        files,
        fieldsToDelete,
        protectedKeys,
        onlyEmpty = false,
        safetyResults,
        onProgress,
        abortSignal,
    } = options;

    if (fieldsToDelete.length === 0) {
        return {
            deleted: 0,
            skipped: files.length,
            failed: 0,
            deletedFields: [],
            safetySkipped: 0,
            errors: [],
        };
    }

    const result: DeleteResult = {
        deleted: 0,
        skipped: 0,
        failed: 0,
        deletedFields: [],
        safetySkipped: 0,
        errors: [],
    };

    const deleteSet = new Set(fieldsToDelete);

    for (let i = 0; i < files.length; i++) {
        if (abortSignal?.aborted) break;

        const file = files[i];
        onProgress?.(i + 1, files.length, file.basename);

        // Safety gate
        const safety = safetyResults?.get(file);
        if (safety && !isSafeForModification(safety)) {
            result.safetySkipped++;
            result.skipped++;
            continue;
        }

        // If no pre-computed safety, do a quick scan
        if (!safetyResults) {
            const cache = app.metadataCache.getFileCache(file);
            const liveResult = await scanFrontmatterSafety({
                app,
                file,
                cache,
                checkBrokenYaml: true,
            });
            if (!isSafeForModification(liveResult)) {
                result.safetySkipped++;
                result.skipped++;
                continue;
            }
        }

        try {
            const removedFields: string[] = [];

            await app.fileManager.processFrontMatter(file, (fm) => {
                const fmObj = fm as Record<string, unknown>;

                for (const key of Object.keys(fmObj)) {
                    if (!deleteSet.has(key)) continue;
                    if (protectedKeys?.has(key)) continue;
                    if (onlyEmpty && !isTrulyEmpty(fmObj[key])) continue;

                    delete fmObj[key];
                    removedFields.push(key);
                }
            });

            if (removedFields.length > 0) {
                result.deleted++;
                result.deletedFields.push({ file, fields: removedFields });
            } else {
                result.skipped++;
            }
        } catch (error) {
            result.failed++;
            result.errors.push({
                file,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return result;
}

/**
 * Delete empty extra fields — convenience wrapper around runYamlDeleteFields.
 *
 * Targets only fields that are: (a) in `extraKeys`, (b) truly empty,
 * and (c) not in the protected template key set.
 */
export async function runYamlDeleteEmptyExtraFields(
    options: Omit<DeleteFieldsOptions, 'onlyEmpty'>
): Promise<DeleteResult> {
    return runYamlDeleteFields({ ...options, onlyEmpty: true });
}

// ─── Canonical reorder ──────────────────────────────────────────────────

/**
 * Reorder frontmatter fields in the supplied files to match canonical order.
 *
 * Uses raw file read/write because Obsidian's processFrontMatter() does
 * not guarantee key order.
 *
 * Key ordering strategy:
 * 1. Template keys in canonical order
 * 2. Remaining known keys (not in canonical order) in their original order
 * 3. Unknown/extra keys last, in their original order
 *
 * Safety guarantees:
 * - Skips files flagged as dangerous by the safety scanner
 * - Preserves all values exactly (only key order changes)
 * - Falls back gracefully on parse/write errors
 */
export async function runYamlReorder(
    options: ReorderOptions
): Promise<ReorderResult> {
    const {
        app,
        files,
        canonicalOrder,
        safetyResults,
        onProgress,
        abortSignal,
    } = options;

    const result: ReorderResult = {
        reordered: 0,
        skipped: 0,
        failed: 0,
        safetySkipped: 0,
        errors: [],
    };

    for (let i = 0; i < files.length; i++) {
        if (abortSignal?.aborted) break;

        const file = files[i];
        onProgress?.(i + 1, files.length, file.basename);

        // Safety gate
        const safety = safetyResults?.get(file);
        if (safety && !isSafeForModification(safety)) {
            result.safetySkipped++;
            result.skipped++;
            continue;
        }

        if (!safetyResults) {
            const cache = app.metadataCache.getFileCache(file);
            const liveResult = await scanFrontmatterSafety({
                app,
                file,
                cache,
                checkBrokenYaml: true,
            });
            if (!isSafeForModification(liveResult)) {
                result.safetySkipped++;
                result.skipped++;
                continue;
            }
        }

        try {
            const didReorder = await reorderSingleFile(app, file, canonicalOrder);
            if (didReorder) {
                result.reordered++;
            } else {
                result.skipped++;
            }
        } catch (error) {
            result.failed++;
            result.errors.push({
                file,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return result;
}

/**
 * Reorder frontmatter in a single file. Returns true if the file was modified.
 */
async function reorderSingleFile(
    app: App,
    file: TFile,
    canonicalOrder: string[]
): Promise<boolean> {
    const content = await app.vault.read(file);

    const fmInfo = getFrontMatterInfo(content) as unknown as FMInfo;
    if (!fmInfo || !fmInfo.exists || !fmInfo.frontmatter) {
        return false;
    }

    let parsed: Record<string, unknown>;
    try {
        parsed = parseYaml(fmInfo.frontmatter);
    } catch {
        return false;
    }

    if (!parsed || typeof parsed !== 'object') return false;

    const currentKeys = Object.keys(parsed);
    const orderedKeys = buildOrderedKeyList(currentKeys, canonicalOrder);

    // Check if order actually changed
    if (arraysEqual(currentKeys, orderedKeys)) {
        return false;
    }

    // Rebuild frontmatter in the new order
    const reorderedObj: Record<string, unknown> = {};
    for (const key of orderedKeys) {
        reorderedObj[key] = parsed[key];
    }

    const newYamlStr = stringifyYaml(reorderedObj);
    const body = extractBodyAfterFrontmatter(content, fmInfo);
    const newContent = buildFrontmatterDocument(newYamlStr, body);

    await app.vault.modify(file, newContent);
    return true;
}

/**
 * Build the final key list given the current keys and the canonical order.
 *
 * Strategy:
 * 1. **Template zone** – Keys that appear in `canonicalOrder`, placed in that order.
 * 2. **Dynamic suffix zone** – Remaining keys NOT in `canonicalOrder`, preserved in
 *    their original relative order and appended after the template keys.
 *
 * The "dynamic suffix zone" is where AI-generated and plugin-injected fields
 * (Gossamer scores, scene analysis, Pulse timestamps, etc.) naturally reside.
 * Because these keys are never part of the canonical template order, they are
 * always placed at the end and their internal ordering is never disturbed.
 * This contract is critical: callers (delete, reorder, audit) must never
 * include dynamic/excluded keys in `canonicalOrder` to preserve this guarantee.
 */
function buildOrderedKeyList(
    currentKeys: string[],
    canonicalOrder: string[]
): string[] {
    const currentSet = new Set(currentKeys);
    const ordered: string[] = [];
    const placed = new Set<string>();

    // Phase 1: canonical keys that exist in the file
    for (const key of canonicalOrder) {
        if (currentSet.has(key)) {
            ordered.push(key);
            placed.add(key);
        }
    }

    // Phase 2: remaining keys in their original order
    for (const key of currentKeys) {
        if (!placed.has(key)) {
            ordered.push(key);
        }
    }

    return ordered;
}

function arraysEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

// ─── Dry-run helpers ────────────────────────────────────────────────────

/**
 * Preview what a delete operation would do without actually modifying files.
 * Returns a map of file → fields that would be deleted.
 */
export function previewDeleteFields(
    app: App,
    files: TFile[],
    fieldsToDelete: string[],
    protectedKeys?: Set<string>,
    onlyEmpty = false
): Map<TFile, { fields: string[]; values: Record<string, unknown> }> {
    const deleteSet = new Set(fieldsToDelete);
    const preview = new Map<TFile, { fields: string[]; values: Record<string, unknown> }>();

    for (const file of files) {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) continue;

        const fm = cache.frontmatter as Record<string, unknown>;
        const fields: string[] = [];
        const values: Record<string, unknown> = {};

        for (const key of Object.keys(fm)) {
            if (key === 'position') continue;
            if (!deleteSet.has(key)) continue;
            if (protectedKeys?.has(key)) continue;
            if (onlyEmpty && !isTrulyEmpty(fm[key])) continue;

            fields.push(key);
            values[key] = fm[key];
        }

        if (fields.length > 0) {
            preview.set(file, { fields, values });
        }
    }

    return preview;
}

/**
 * Preview what a reorder operation would produce for a single file.
 * Returns null if no reorder is needed, or the before/after key lists.
 */
export function previewReorder(
    app: App,
    file: TFile,
    canonicalOrder: string[]
): { before: string[]; after: string[] } | null {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache?.frontmatter) return null;

    const fm = cache.frontmatter as Record<string, unknown>;
    const currentKeys = Object.keys(fm).filter(k => k !== 'position');
    const orderedKeys = buildOrderedKeyList(currentKeys, canonicalOrder);

    if (arraysEqual(currentKeys, orderedKeys)) return null;
    return { before: currentKeys, after: orderedKeys };
}
