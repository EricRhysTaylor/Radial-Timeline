import { App, stringifyYaml, TFile } from 'obsidian';
import type { NoteType } from './yamlTemplateNormalize';
import { ensureReferenceIdFrontmatter, generateSceneId, readReferenceId } from './sceneIds';
import { buildFrontmatterDocument, extractBodyAfterFrontmatter } from './frontmatterDocument';
import {
    formatAliasConflictMessage,
    prepareFrontmatterRewrite,
    type FrontmatterRewriteInfo,
    verifyFrontmatterRewrite,
} from './frontmatterWriteSafety';

export interface ReferenceIdBackfillOptions {
    app: App;
    files: TFile[];
    noteType?: NoteType;
    onProgress?: (current: number, total: number, filename: string) => void;
    abortSignal?: AbortSignal;
}

export interface ReferenceIdBackfillResult {
    updated: number;
    skipped: number;
    failed: number;
    errors: { file: TFile; error: string }[];
}

export interface ReferenceIdDuplicateRepairResult {
    updated: number;
    skipped: number;
    failed: number;
    errors: { file: TFile; error: string }[];
}

function classFallbackForNoteType(noteType: NoteType | undefined): string | undefined {
    if (noteType === 'Scene') return 'Scene';
    if (noteType === 'Beat') return 'Beat';
    if (noteType === 'Backdrop') return 'Backdrop';
    return undefined;
}

export async function runReferenceIdBackfill(options: ReferenceIdBackfillOptions): Promise<ReferenceIdBackfillResult> {
    const { app, files, noteType, onProgress, abortSignal } = options;
    const classFallback = classFallbackForNoteType(noteType);
    const result: ReferenceIdBackfillResult = {
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: []
    };

    for (let idx = 0; idx < files.length; idx += 1) {
        if (abortSignal?.aborted) break;
        const file = files[idx];
        onProgress?.(idx + 1, files.length, file.basename);

        try {
            const content = await app.vault.read(file);
            const prepared = prepareFrontmatterRewrite(content);
            if (!prepared) {
                result.skipped += 1;
                continue;
            }
            if (prepared.aliasConflicts.length > 0) {
                result.failed += 1;
                result.errors.push({
                    file,
                    error: `Refused rewrite due to duplicate canonical aliases: ${formatAliasConflictMessage(prepared.aliasConflicts)}`
                });
                continue;
            }

            const normalized = ensureReferenceIdFrontmatter(prepared.parsed, { classFallback });
            if (!normalized.changed) {
                result.skipped += 1;
                continue;
            }

            const rebuiltYaml = stringifyYaml(normalized.frontmatter);
            const updatedContent = buildFrontmatterDocument(rebuiltYaml, prepared.body);
            await app.vault.modify(file, updatedContent);
            const verifiedContent = await app.vault.read(file);
            const verification = verifyFrontmatterRewrite(verifiedContent, {
                originalBody: prepared.body,
                verifyParsed: (verifiedFrontmatter) => readReferenceId(verifiedFrontmatter) === normalized.id
            });
            if (!verification.ok) {
                throw new Error(verification.reason ?? 'Reference ID backfill verification failed.');
            }
            result.updated += 1;
        } catch (error) {
            result.failed += 1;
            result.errors.push({
                file,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    return result;
}

export async function runReferenceIdDuplicateRepair(options: ReferenceIdBackfillOptions): Promise<ReferenceIdDuplicateRepairResult> {
    const { app, files, noteType, onProgress, abortSignal } = options;
    const classFallback = classFallbackForNoteType(noteType);
    const result: ReferenceIdDuplicateRepairResult = {
        updated: 0,
        skipped: 0,
        failed: 0,
        errors: []
    };

    type ParsedRecord = {
        file: TFile;
        content: string;
        info: FrontmatterRewriteInfo;
        parsed: Record<string, unknown>;
        referenceId?: string;
    };

    const parsedRecords: ParsedRecord[] = [];

    for (let idx = 0; idx < files.length; idx += 1) {
        if (abortSignal?.aborted) break;
        const file = files[idx];
        onProgress?.(idx + 1, files.length, file.basename);

        try {
            const content = await app.vault.read(file);
            const prepared = prepareFrontmatterRewrite(content);
            if (!prepared) {
                result.skipped += 1;
                continue;
            }
            if (prepared.aliasConflicts.length > 0) {
                result.failed += 1;
                result.errors.push({
                    file,
                    error: `Refused rewrite due to duplicate canonical aliases: ${formatAliasConflictMessage(prepared.aliasConflicts)}`
                });
                continue;
            }

            parsedRecords.push({
                file,
                content,
                info: prepared.info,
                parsed: prepared.parsed,
                referenceId: readReferenceId(prepared.parsed)
            });
        } catch (error) {
            result.failed += 1;
            result.errors.push({
                file,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    const grouped = new Map<string, ParsedRecord[]>();
    const usedIds = new Set<string>();

    for (const record of parsedRecords) {
        if (!record.referenceId) continue;
        usedIds.add(record.referenceId);
        const list = grouped.get(record.referenceId) ?? [];
        list.push(record);
        grouped.set(record.referenceId, list);
    }

    const duplicates = [...grouped.values()].filter(group => group.length > 1);
    if (duplicates.length === 0) {
        return result;
    }

    for (const group of duplicates) {
        const orderedGroup = [...group].sort((a, b) => a.file.path.localeCompare(b.file.path));
        // Keep the first path stable; reassign ids for the rest.
        const reassignTargets = orderedGroup.slice(1);

        for (const target of reassignTargets) {
            if (abortSignal?.aborted) return result;
            try {
                let nextId = generateSceneId();
                while (usedIds.has(nextId)) {
                    nextId = generateSceneId();
                }
                usedIds.add(nextId);

                const normalized = ensureReferenceIdFrontmatter(target.parsed, {
                    classFallback,
                    forceId: nextId
                });
                if (!normalized.changed) {
                    result.skipped += 1;
                    continue;
                }

                const rebuiltYaml = stringifyYaml(normalized.frontmatter);
                const body = extractBodyAfterFrontmatter(target.content, target.info);
                const updatedContent = buildFrontmatterDocument(rebuiltYaml, body);
                await app.vault.modify(target.file, updatedContent);
                const verifiedContent = await app.vault.read(target.file);
                const verification = verifyFrontmatterRewrite(verifiedContent, {
                    originalBody: body,
                    verifyParsed: (verifiedFrontmatter) => readReferenceId(verifiedFrontmatter) === nextId
                });
                if (!verification.ok) {
                    throw new Error(verification.reason ?? 'Duplicate Reference ID repair verification failed.');
                }
                result.updated += 1;
            } catch (error) {
                result.failed += 1;
                result.errors.push({
                    file: target.file,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }

    return result;
}
