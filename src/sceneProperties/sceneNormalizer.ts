import type { TFile } from 'obsidian';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import { collectFilesForAuditWithScope, runYamlAudit } from '../utils/yamlAudit';
import type { BackfillResult } from '../utils/yamlBackfill';
import { runYamlBackfill } from '../utils/yamlBackfill';
import type { DeleteResult, ReorderResult } from '../utils/yamlManager';
import { runYamlDeleteFields, runYamlReorder } from '../utils/yamlManager';
import {
    runReferenceIdBackfill,
    runReferenceIdDuplicateRepair,
    type ReferenceIdBackfillResult,
    type ReferenceIdDuplicateRepairResult,
} from '../utils/referenceIdBackfill';
import { getExcludeKeyPredicate, RESERVED_OBSIDIAN_KEYS } from '../utils/yamlTemplateNormalize';
import { readReferenceId } from '../utils/sceneIds';
import { buildScenePropertyDefinitions } from './scenePropertyAdapter';
import {
    computeSceneOrderDriftWhenAdvancedDisabled,
    resolveSceneExpectedKeys,
    resolveScenePropertyPolicy,
    splitSceneMissingKeys,
} from './scenePropertyPolicy';
import type {
    SceneNormalizationAudit,
    SceneNormalizationNote,
    SceneNormalizerContext,
} from './types';

function buildReason(note: SceneNormalizationNote): string {
    const reasons: string[] = [];
    if (note.missingCoreKeys.length > 0) {
        reasons.push(`missing core: ${note.missingCoreKeys.join(', ')}`);
    }
    if (note.missingAdvancedKeys.length > 0) {
        reasons.push(`missing advanced: ${note.missingAdvancedKeys.join(', ')}`);
    }
    if (note.missingSceneId) {
        reasons.push('missing scene id');
    }
    if (note.duplicateSceneId) {
        reasons.push(`duplicate scene id: ${note.duplicateSceneId}`);
    }
    if (note.extraKeys.length > 0) {
        reasons.push(`extra: ${note.extraKeys.join(', ')}`);
    }
    if (note.orderDrift) {
        reasons.push('field order differs from expected scene layout');
    }
    if (note.semanticWarnings.length > 0) {
        reasons.push(`warnings: ${note.semanticWarnings.join(' | ')}`);
    }
    if (note.safetyResult && note.safetyResult.status !== 'safe') {
        const label = note.safetyResult.status === 'dangerous' ? 'UNSAFE' : 'review';
        reasons.push(`safety: ${label} (${note.safetyResult.issues.length} issue${note.safetyResult.issues.length !== 1 ? 's' : ''})`);
    }
    return reasons.join(' | ');
}

async function resolveSceneFiles(ctx: SceneNormalizerContext): Promise<TFile[]> {
    if (ctx.files) return ctx.files;
    return collectFilesForAuditWithScope(ctx.app, 'Scene', ctx.settings).files;
}

export async function analyzeScenes(
    ctx: SceneNormalizerContext
): Promise<SceneNormalizationAudit> {
    const files = await resolveSceneFiles(ctx);
    const rawAudit = await runYamlAudit({
        app: ctx.app,
        settings: ctx.settings,
        noteType: 'Scene',
        files,
        includeSafetyScan: ctx.includeSafetyScan ?? true,
    });

    const definitions = buildScenePropertyDefinitions(ctx.settings);
    const policy = resolveScenePropertyPolicy(ctx.settings);
    const expected = resolveSceneExpectedKeys(ctx.settings, definitions, policy);
    const advancedKeySet = new Set(expected.advancedKeys);
    const rawNotesByPath = new Map(rawAudit.notes.map((note) => [note.file.path, note]));
    const mappings = ctx.settings.enableCustomMetadataMapping ? ctx.settings.frontmatterMappings : undefined;
    const notes: SceneNormalizationNote[] = [];

    for (const file of files) {
        if (rawAudit.unreadFiles.some((entry) => entry.path === file.path)) continue;

        const cache = ctx.app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) continue;

        const rawFrontmatter = cache.frontmatter as Record<string, unknown>;
        const normalizedFrontmatter = mappings
            ? normalizeFrontmatterKeys(rawFrontmatter, mappings)
            : rawFrontmatter;
        const noteKeys = Object.keys(normalizedFrontmatter).filter((key) => key !== 'position');
        const rawNote = rawNotesByPath.get(file.path);
        const splitMissing = splitSceneMissingKeys(rawNote?.missingFields ?? [], expected, policy);
        const toleratedInactiveAdvancedKeys = policy.advancedEnabled
            ? []
            : noteKeys.filter((key) => advancedKeySet.has(key));
        const orderDrift = policy.advancedEnabled
            ? (rawNote?.orderDrift ?? false)
            : splitMissing.missingCoreKeys.length === 0
                ? computeSceneOrderDriftWhenAdvancedDisabled(noteKeys, expected)
                : false;
        const note: SceneNormalizationNote = {
            file,
            missingCoreKeys: splitMissing.missingCoreKeys,
            missingAdvancedKeys: splitMissing.missingAdvancedKeys,
            toleratedInactiveAdvancedKeys,
            extraKeys: rawNote?.extraKeys ?? [],
            orderDrift,
            missingSceneId: rawNote?.missingReferenceId ?? !readReferenceId(rawFrontmatter),
            duplicateSceneId: rawNote?.duplicateReferenceId,
            semanticWarnings: rawNote?.semanticWarnings ?? [],
            reason: '',
            safetyResult: rawNote?.safetyResult ?? rawAudit.safetyResults?.get(file),
        };
        note.reason = buildReason(note);

        const hasSchemaIssues = note.missingCoreKeys.length > 0
            || note.missingAdvancedKeys.length > 0
            || note.missingSceneId
            || !!note.duplicateSceneId
            || note.extraKeys.length > 0
            || note.orderDrift
            || note.semanticWarnings.length > 0;
        const hasSafetyIssues = note.safetyResult && note.safetyResult.status !== 'safe';
        if (hasSchemaIssues || hasSafetyIssues) {
            notes.push(note);
        }
    }

    return {
        notes,
        unreadFiles: rawAudit.unreadFiles,
        summary: {
            totalScenes: files.length,
            unreadScenes: rawAudit.unreadFiles.length,
            scenesWithMissingCore: notes.filter((note) => note.missingCoreKeys.length > 0).length,
            scenesWithMissingAdvanced: notes.filter((note) => note.missingAdvancedKeys.length > 0).length,
            scenesWithExtra: notes.filter((note) => note.extraKeys.length > 0).length,
            scenesWithDrift: notes.filter((note) => note.orderDrift).length,
            scenesMissingIds: notes.filter((note) => note.missingSceneId).length,
            scenesDuplicateIds: notes.filter((note) => !!note.duplicateSceneId).length,
            scenesWithWarnings: notes.filter((note) => note.semanticWarnings.length > 0).length,
            clean: Math.max(0, files.length - notes.length - rawAudit.unreadFiles.length),
            scenesUnsafe: notes.filter((note) => note.safetyResult?.status === 'dangerous').length,
            scenesSuspicious: notes.filter((note) => note.safetyResult?.status === 'suspicious').length,
        },
        rawAudit,
        safetyResults: rawAudit.safetyResults,
    };
}

export async function insertMissingCoreFields(
    ctx: SceneNormalizerContext & { audit?: SceneNormalizationAudit }
): Promise<BackfillResult> {
    const audit = ctx.audit ?? await analyzeScenes(ctx);
    const definitions = buildScenePropertyDefinitions(ctx.settings);
    const fieldsToInsert = Object.fromEntries(
        definitions.core.map((definition) => [definition.key, definition.defaultValue])
    );
    const files = audit.notes
        .filter((note) => note.missingCoreKeys.length > 0)
        .map((note) => note.file);
    const missingKeys = new Set(audit.notes.flatMap((note) => note.missingCoreKeys));
    const filteredFields = Object.fromEntries(
        [...missingKeys].map((key) => [key, fieldsToInsert[key] ?? ''])
    );
    return runYamlBackfill({
        app: ctx.app,
        files,
        fieldsToInsert: filteredFields,
        onProgress: ctx.onProgress,
        abortSignal: ctx.abortSignal,
    });
}

export async function insertMissingAdvancedFields(
    ctx: SceneNormalizerContext & { audit?: SceneNormalizationAudit }
): Promise<BackfillResult> {
    const policy = resolveScenePropertyPolicy(ctx.settings);
    const audit = ctx.audit ?? await analyzeScenes(ctx);
    if (!policy.advancedEnabled) {
        return { updated: 0, skipped: 0, failed: 0, errors: [] };
    }
    const definitions = buildScenePropertyDefinitions(ctx.settings);
    const defaults = Object.fromEntries(
        definitions.advanced.map((definition) => [definition.key, definition.defaultValue])
    );
    const files = audit.notes
        .filter((note) => note.missingAdvancedKeys.length > 0)
        .map((note) => note.file);
    const missingKeys = new Set(audit.notes.flatMap((note) => note.missingAdvancedKeys));
    const filteredFields = Object.fromEntries(
        [...missingKeys].map((key) => [key, defaults[key] ?? ''])
    );
    return runYamlBackfill({
        app: ctx.app,
        files,
        fieldsToInsert: filteredFields,
        onProgress: ctx.onProgress,
        abortSignal: ctx.abortSignal,
    });
}

export async function ensureSceneIds(
    ctx: SceneNormalizerContext
): Promise<ReferenceIdBackfillResult> {
    const files = await resolveSceneFiles(ctx);
    return runReferenceIdBackfill({
        app: ctx.app,
        files,
        noteType: 'Scene',
        onProgress: ctx.onProgress,
        abortSignal: ctx.abortSignal,
    });
}

export async function fixDuplicateSceneIds(
    ctx: SceneNormalizerContext
): Promise<ReferenceIdDuplicateRepairResult> {
    const files = await resolveSceneFiles(ctx);
    return runReferenceIdDuplicateRepair({
        app: ctx.app,
        files,
        noteType: 'Scene',
        onProgress: ctx.onProgress,
        abortSignal: ctx.abortSignal,
    });
}

export async function reorderSceneFields(
    ctx: SceneNormalizerContext & { audit?: SceneNormalizationAudit }
): Promise<ReorderResult> {
    const audit = ctx.audit ?? await analyzeScenes(ctx);
    const definitions = buildScenePropertyDefinitions(ctx.settings);
    const policy = resolveScenePropertyPolicy(ctx.settings);
    const expected = resolveSceneExpectedKeys(ctx.settings, definitions, policy);
    const files = audit.notes
        .filter((note) => note.orderDrift && note.safetyResult?.status !== 'dangerous')
        .map((note) => note.file);

    return runYamlReorder({
        app: ctx.app,
        files,
        canonicalOrder: expected.canonicalOrder,
        safetyResults: audit.safetyResults,
        onProgress: ctx.onProgress,
        abortSignal: ctx.abortSignal,
    });
}

export async function deleteExtraSceneFields(
    ctx: SceneNormalizerContext & { audit?: SceneNormalizationAudit }
): Promise<DeleteResult> {
    const audit = ctx.audit ?? await analyzeScenes(ctx);
    const files = audit.notes
        .filter((note) => note.extraKeys.length > 0)
        .map((note) => note.file);
    const fieldsToDelete = [...new Set(audit.notes.flatMap((note) => note.extraKeys))];
    const protectedKeys = new Set([
        ...buildScenePropertyDefinitions(ctx.settings).core.map((definition) => definition.key),
        ...buildScenePropertyDefinitions(ctx.settings).advanced.map((definition) => definition.key),
        ...RESERVED_OBSIDIAN_KEYS,
    ]);

    return runYamlDeleteFields({
        app: ctx.app,
        files,
        fieldsToDelete,
        protectedKeys,
        safetyResults: audit.safetyResults,
        onProgress: ctx.onProgress,
        abortSignal: ctx.abortSignal,
    });
}

export async function deleteAdvancedSceneFields(
    ctx: SceneNormalizerContext & { audit?: SceneNormalizationAudit }
): Promise<DeleteResult> {
    const audit = ctx.audit ?? await analyzeScenes(ctx);
    const definitions = buildScenePropertyDefinitions(ctx.settings);
    const advancedKeys = definitions.advanced.map((definition) => definition.key);
    const protectedKeys = new Set([
        ...definitions.core.map((definition) => definition.key),
        ...RESERVED_OBSIDIAN_KEYS,
    ]);
    const excludeKey = getExcludeKeyPredicate('Scene', ctx.settings);
    const fieldsToDelete = advancedKeys.filter(
        (key) => !excludeKey(key) && !RESERVED_OBSIDIAN_KEYS.has(key)
    );
    const files = audit.notes
        .filter((note) => note.safetyResult?.status !== 'dangerous')
        .map((note) => note.file);

    return runYamlDeleteFields({
        app: ctx.app,
        files,
        fieldsToDelete,
        protectedKeys,
        safetyResults: audit.safetyResults,
        onProgress: ctx.onProgress,
        abortSignal: ctx.abortSignal,
    });
}
