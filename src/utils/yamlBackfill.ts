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
