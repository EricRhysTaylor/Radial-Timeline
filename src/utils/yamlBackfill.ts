/**
 * YAML Backfill engine.
 *
 * Inserts missing custom YAML fields into existing notes using
 * Obsidian's processFrontMatter() for safe, atomic updates.
 *
 * Guarantees:
 * - Never overwrites existing key values
 * - Normalizes undefined/null defaults to '' to prevent `key: null` writes
 */
import type { App, TFile } from 'obsidian';
import type { FieldEntryValue } from './yamlTemplateNormalize';

// ─── Types ──────────────────────────────────────────────────────────────

export interface BackfillOptions {
    app: App;
    /** Pre-filtered target files (only notes that need backfill). */
    files: TFile[];
    /** Keys to insert → default values from template.  */
    fieldsToInsert: Record<string, FieldEntryValue>;
    onProgress?: (current: number, total: number, filename: string) => void;
    abortSignal?: AbortSignal;
}

export interface BackfillResult {
    /** Notes that had at least one missing field inserted. */
    updated: number;
    /** Notes that already had all fields (nothing to do). */
    skipped: number;
    /** Notes where processFrontMatter threw. */
    failed: number;
    errors: { file: TFile; error: string }[];
}

export interface FillEmptyValuesResult {
    /** Notes where at least one empty key received a default value. */
    updated: number;
    /** Total number of fields filled across all notes. */
    filledFields: number;
    /** Notes where no eligible empty keys were found. */
    skipped: number;
    /** Notes where processFrontMatter threw. */
    failed: number;
    errors: { file: TFile; error: string }[];
}

export interface BeatPurposeMigrationResult {
    /** Notes where at least one migration change was applied. */
    updated: number;
    /** Purpose values copied from legacy Description values. */
    movedToPurpose: number;
    /** Description keys removed after migration or when empty. */
    removedDescription: number;
    /** Notes with no applicable legacy change. */
    skipped: number;
    /** Notes where processFrontMatter threw. */
    failed: number;
    errors: { file: TFile; error: string }[];
}

export interface BackdropContextMigrationResult {
    /** Notes where at least one migration change was applied. */
    updated: number;
    /** Context values copied from legacy Synopsis values. */
    movedToContext: number;
    /** Synopsis keys removed after migration or when empty. */
    removedSynopsis: number;
    /** Notes with no applicable legacy change. */
    skipped: number;
    /** Notes where processFrontMatter threw. */
    failed: number;
    errors: { file: TFile; error: string }[];
}

interface LegacyFieldMigrationResult {
    updated: number;
    movedToCanonical: number;
    removedLegacy: number;
    skipped: number;
    failed: number;
    errors: { file: TFile; error: string }[];
}

// ─── Helpers ────────────────────────────────────────────────────────────

/**
 * Normalize a default value so we never write `null` or `undefined`.
 * - `undefined` / `null` → `''`
 * - Arrays are preserved (empty arrays stay empty).
 * - Strings are preserved.
 */
function normalizeDefault(value: FieldEntryValue | undefined | null): string | string[] {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) return value;
    return value;
}

function isTrulyEmpty(value: unknown): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

// ─── Main backfill function ─────────────────────────────────────────────

/**
 * Insert missing YAML fields into the supplied files.
 *
 * For each file, uses `app.fileManager.processFrontMatter()` to inspect
 * the live frontmatter and add any keys from `fieldsToInsert` that are
 * absent. Existing values are never touched.
 */
export async function runYamlBackfill(options: BackfillOptions): Promise<BackfillResult> {
    const { app, files, fieldsToInsert, onProgress, abortSignal } = options;

    const keysToInsert = Object.keys(fieldsToInsert);
    if (keysToInsert.length === 0) {
        return { updated: 0, skipped: files.length, failed: 0, errors: [] };
    }

    const result: BackfillResult = {
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: [],
    };

    for (let i = 0; i < files.length; i++) {
        // Abort check
        if (abortSignal?.aborted) break;

        const file = files[i];
        onProgress?.(i + 1, files.length, file.basename);

        try {
            let didInsert = false;

            await app.fileManager.processFrontMatter(file, (fm) => {
                const fmObj = fm as Record<string, unknown>;

                for (const key of keysToInsert) {
                    // Only insert if the key is truly absent
                    if (!(key in fmObj)) {
                        fmObj[key] = normalizeDefault(fieldsToInsert[key]);
                        didInsert = true;
                    }
                }
            });

            if (didInsert) {
                result.updated++;
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
 * Beat legacy migration helper:
 * - If Purpose is missing/empty and Description has content, move content to Purpose.
 * - Remove empty Description keys (and remove moved Description keys).
 */
export async function runBeatDescriptionToPurposeMigration(options: {
    app: App;
    files: TFile[];
    onProgress?: (current: number, total: number, filename: string) => void;
    abortSignal?: AbortSignal;
}): Promise<BeatPurposeMigrationResult> {
    const migrated = await runLegacyFieldMigration({
        app: options.app,
        files: options.files,
        legacyKey: 'Description',
        canonicalKey: 'Purpose',
        onProgress: options.onProgress,
        abortSignal: options.abortSignal,
    });
    return {
        updated: migrated.updated,
        movedToPurpose: migrated.movedToCanonical,
        removedDescription: migrated.removedLegacy,
        skipped: migrated.skipped,
        failed: migrated.failed,
        errors: migrated.errors,
    };
}

/**
 * Backdrop legacy migration helper:
 * - If Context is missing/empty and Synopsis has content, move content to Context.
 * - Remove empty Synopsis keys (and remove moved Synopsis keys).
 */
export async function runBackdropSynopsisToContextMigration(options: {
    app: App;
    files: TFile[];
    onProgress?: (current: number, total: number, filename: string) => void;
    abortSignal?: AbortSignal;
}): Promise<BackdropContextMigrationResult> {
    const migrated = await runLegacyFieldMigration({
        app: options.app,
        files: options.files,
        legacyKey: 'Synopsis',
        canonicalKey: 'Context',
        onProgress: options.onProgress,
        abortSignal: options.abortSignal,
    });
    return {
        updated: migrated.updated,
        movedToContext: migrated.movedToCanonical,
        removedSynopsis: migrated.removedLegacy,
        skipped: migrated.skipped,
        failed: migrated.failed,
        errors: migrated.errors,
    };
}

async function runLegacyFieldMigration(options: {
    app: App;
    files: TFile[];
    legacyKey: string;
    canonicalKey: string;
    onProgress?: (current: number, total: number, filename: string) => void;
    abortSignal?: AbortSignal;
}): Promise<LegacyFieldMigrationResult> {
    const { app, files, legacyKey, canonicalKey, onProgress, abortSignal } = options;
    const result: LegacyFieldMigrationResult = {
        updated: 0,
        movedToCanonical: 0,
        removedLegacy: 0,
        skipped: 0,
        failed: 0,
        errors: [],
    };

    for (let i = 0; i < files.length; i++) {
        if (abortSignal?.aborted) break;

        const file = files[i];
        onProgress?.(i + 1, files.length, file.basename);

        try {
            let didChange = false;

            await app.fileManager.processFrontMatter(file, (fm) => {
                const fmObj = fm as Record<string, unknown>;
                const hasLegacy = Object.prototype.hasOwnProperty.call(fmObj, legacyKey);
                const legacyRaw = typeof fmObj[legacyKey] === 'string' ? String(fmObj[legacyKey]) : undefined;
                const legacyValue = (legacyRaw ?? '').trim();
                const canonicalRaw = typeof fmObj[canonicalKey] === 'string' ? String(fmObj[canonicalKey]) : undefined;
                const hasCanonicalValue = typeof canonicalRaw === 'string' && canonicalRaw.trim().length > 0;

                if (!hasCanonicalValue && legacyValue.length > 0) {
                    fmObj[canonicalKey] = legacyRaw;
                    delete fmObj[legacyKey];
                    result.movedToCanonical += 1;
                    result.removedLegacy += 1;
                    didChange = true;
                    return;
                }

                if (hasLegacy && legacyValue.length === 0) {
                    delete fmObj[legacyKey];
                    result.removedLegacy += 1;
                    didChange = true;
                }
            });

            if (didChange) {
                result.updated += 1;
            } else {
                result.skipped += 1;
            }
        } catch (error) {
            result.failed += 1;
            result.errors.push({
                file,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return result;
}

/**
 * Fill empty existing frontmatter keys with defaults.
 *
 * Safety guarantees:
 * - Never creates missing keys
 * - Never overwrites non-empty values
 * - Never deletes keys
 */
export async function runYamlFillEmptyValues(options: BackfillOptions): Promise<FillEmptyValuesResult> {
    const { app, files, fieldsToInsert, onProgress, abortSignal } = options;
    const keysToConsider = Object.keys(fieldsToInsert);

    if (keysToConsider.length === 0) {
        return { updated: 0, filledFields: 0, skipped: files.length, failed: 0, errors: [] };
    }

    const result: FillEmptyValuesResult = {
        updated: 0,
        filledFields: 0,
        skipped: 0,
        failed: 0,
        errors: [],
    };

    for (let i = 0; i < files.length; i++) {
        if (abortSignal?.aborted) break;

        const file = files[i];
        onProgress?.(i + 1, files.length, file.basename);

        try {
            let fileFilledCount = 0;

            await app.fileManager.processFrontMatter(file, (fm) => {
                const fmObj = fm as Record<string, unknown>;

                for (const key of keysToConsider) {
                    // Only mutate keys that already exist and are truly empty
                    if (!(key in fmObj)) continue;
                    if (!isTrulyEmpty(fmObj[key])) continue;

                    const defaultValue = normalizeDefault(fieldsToInsert[key]);
                    // Skip no-op defaults (empty string or empty list)
                    if (
                        (typeof defaultValue === 'string' && defaultValue.trim().length === 0)
                        || (Array.isArray(defaultValue) && defaultValue.length === 0)
                    ) {
                        continue;
                    }

                    fmObj[key] = defaultValue;
                    fileFilledCount++;
                }
            });

            if (fileFilledCount > 0) {
                result.updated++;
                result.filledFields += fileFilledCount;
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
