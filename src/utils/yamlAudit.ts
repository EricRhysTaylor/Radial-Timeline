/**
 * Non-destructive YAML Audit engine.
 *
 * Compares note frontmatter against template-defined base + custom keys
 * and reports schema drift: missing fields, extra keys, and cosmetic order drift.
 *
 * NEVER modifies files — read-only analysis only.
 */
import type { App, TFile, CachedMetadata } from 'obsidian';
import {
    type NoteType,
    computeCanonicalOrder,
    getBaseKeys,
    getCustomKeys,
    getExcludeKeyPredicate,
} from './yamlTemplateNormalize';
import type { RadialTimelineSettings } from '../types/settings';
import { normalizeFrontmatterKeys } from './frontmatter';

// ─── Types ──────────────────────────────────────────────────────────────

export interface NoteAuditEntry {
    file: TFile;
    missingFields: string[];
    extraKeys: string[];
    orderDrift: boolean;
    semanticWarnings: string[];
    /** Short human-readable reason string (capped length). */
    reason: string;
}

export interface YamlAuditSummary {
    totalNotes: number;
    /** Notes whose cache was unavailable (recently created / not yet indexed). */
    unreadNotes: number;
    notesWithMissing: number;
    notesWithExtra: number;
    /** Only counted when missingFields.length === 0 for a note. */
    notesWithDrift: number;
    notesWithWarnings: number;
    clean: number;
}

export interface YamlAuditResult {
    notes: NoteAuditEntry[];
    /** Files that had no metadata cache entry — not counted as clean. */
    unreadFiles: TFile[];
    summary: YamlAuditSummary;
}

// ─── Helpers ────────────────────────────────────────────────────────────

/** Cap a reason string to a maximum length, appending "…" when truncated. */
function capReason(text: string, maxLen = 80): string {
    return text.length <= maxLen ? text : text.slice(0, maxLen - 1) + '…';
}

const SCENE_SYNOPSIS_SOFT_CHAR_LIMIT = 500;
const SCENE_SYNOPSIS_SOFT_SENTENCE_LIMIT = 3;
const BEAT_PURPOSE_SOFT_MAX_LINES = 3;
const BACKDROP_SCENE_TITLE_MAX_MATCHES = 3;

function getStringField(fm: Record<string, unknown>, key: string): string | undefined {
    const value = fm[key];
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function splitMeaningfulLines(value: string): string[] {
    return value
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean);
}

function countSentences(value: string): number {
    const matches = value.match(/[.!?](?:\s|$)/g);
    return matches ? matches.length : 1;
}

function stripSceneNumberPrefix(title: string): string {
    return title.replace(/^\d+(?:\.\d+)?\s+/, '').trim();
}

function collectSceneTitleIndex(app: App, settings: RadialTimelineSettings): string[] {
    const mappings = settings.enableCustomMetadataMapping ? settings.frontmatterMappings : undefined;
    const titles = new Set<string>();

    for (const file of app.vault.getMarkdownFiles()) {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) continue;
        const fm = mappings ? normalizeFrontmatterKeys(cache.frontmatter, mappings) : cache.frontmatter;
        if (fm.Class !== 'Scene') continue;

        const candidates = [file.basename, stripSceneNumberPrefix(file.basename)];
        if (typeof fm.Title === 'string' && fm.Title.trim().length > 0) {
            candidates.push(fm.Title.trim());
        }

        for (const raw of candidates) {
            const normalized = raw.trim().toLowerCase();
            if (normalized.length >= 8) titles.add(normalized);
        }
    }

    return [...titles];
}

function buildSemanticWarnings(
    noteType: NoteType,
    fm: Record<string, unknown>,
    sceneTitleIndex: string[]
): string[] {
    const warnings: string[] = [];

    if (noteType === 'Scene') {
        const synopsis = getStringField(fm, 'Synopsis');
        if (synopsis) {
            if (synopsis.length > SCENE_SYNOPSIS_SOFT_CHAR_LIMIT) {
                warnings.push(`Scene Synopsis is ${synopsis.length} chars (soft limit ≈${SCENE_SYNOPSIS_SOFT_CHAR_LIMIT}).`);
            } else {
                const sentenceCount = countSentences(synopsis);
                if (sentenceCount > SCENE_SYNOPSIS_SOFT_SENTENCE_LIMIT) {
                    warnings.push(`Scene Synopsis has ${sentenceCount} sentences (target is 1-${SCENE_SYNOPSIS_SOFT_SENTENCE_LIMIT}).`);
                }
            }
        }
        return warnings;
    }

    if (noteType === 'Beat') {
        const purpose = getStringField(fm, 'Purpose') ?? getStringField(fm, 'Description');
        if (getStringField(fm, 'Description') && !getStringField(fm, 'Purpose')) {
            warnings.push('Legacy "Description" detected; migrate to "Purpose" (non-destructive, optional cleanup).');
        }
        if (purpose) {
            const purposeLines = splitMeaningfulLines(purpose).length;
            if (purposeLines > BEAT_PURPOSE_SOFT_MAX_LINES) {
                warnings.push(`Beat Purpose spans ${purposeLines} lines (likely drifting into scene retell).`);
            }
        }
        return warnings;
    }

    if (noteType === 'Backdrop') {
        const context = getStringField(fm, 'Context') ?? getStringField(fm, 'Synopsis');
        if (getStringField(fm, 'Synopsis') && !getStringField(fm, 'Context')) {
            warnings.push('Legacy "Synopsis" detected; migrate to "Context" (non-destructive, optional cleanup).');
        }
        if (context && sceneTitleIndex.length > 0) {
            const lower = context.toLowerCase();
            const matched: string[] = [];
            for (const sceneTitle of sceneTitleIndex) {
                if (lower.includes(sceneTitle)) {
                    matched.push(sceneTitle);
                    if (matched.length >= BACKDROP_SCENE_TITLE_MAX_MATCHES) break;
                }
            }
            if (matched.length > 0) {
                warnings.push(`Backdrop Context references likely scene title(s): ${matched.join(', ')}.`);
            }
        }
        return warnings;
    }

    return warnings;
}

/**
 * Determine whether the order of `presentKeys` (as they appear in the note)
 * matches the subsequence they would occupy in `canonicalOrder`.
 *
 * Keys not in `canonicalOrder` are ignored (they are "extra" keys).
 * Only called when `missingFields` is empty.
 */
function hasOrderDrift(presentKeys: string[], canonicalOrder: string[]): boolean {
    // Build the subsequence of canonicalOrder that intersects with presentKeys
    const canonicalSet = new Set(presentKeys);
    const expected = canonicalOrder.filter(k => canonicalSet.has(k));

    // Compare actual vs expected
    const actual = presentKeys.filter(k => canonicalOrder.includes(k));
    if (actual.length !== expected.length) return true;
    for (let i = 0; i < actual.length; i++) {
        if (actual[i] !== expected[i]) return true;
    }
    return false;
}

// ─── Main audit function ────────────────────────────────────────────────

export interface YamlAuditOptions {
    app: App;
    settings: RadialTimelineSettings;
    noteType: NoteType;
    files: TFile[];
    /** Beat system key override (only relevant when noteType === 'Beat'). */
    beatSystemKey?: string;
}

/**
 * Run a non-destructive audit against all supplied files.
 *
 * Uses `metadataCache.getFileCache()` for speed. If a file has no cache
 * entry (stale or not yet indexed), it is counted as "unread" — never
 * mislabelled as clean.
 */
export function runYamlAudit(options: YamlAuditOptions): YamlAuditResult {
    const { app, settings, noteType, files, beatSystemKey } = options;

    const baseKeys = getBaseKeys(noteType, settings);
    const customKeys = getCustomKeys(noteType, settings, beatSystemKey);
    const canonicalOrder = computeCanonicalOrder(noteType, settings, beatSystemKey);
    const allTemplateKeys = new Set([...baseKeys, ...customKeys]);
    const excludeKey = getExcludeKeyPredicate(noteType);

    const mappings = settings.enableCustomMetadataMapping ? settings.frontmatterMappings : undefined;
    const sceneTitleIndex = noteType === 'Backdrop' ? collectSceneTitleIndex(app, settings) : [];

    const notes: NoteAuditEntry[] = [];
    const unreadFiles: TFile[] = [];

    for (const file of files) {
        const cache: CachedMetadata | null = app.metadataCache.getFileCache(file);

        // Stale-cache guard: if no cache entry at all, skip as unread
        if (!cache || !cache.frontmatter) {
            unreadFiles.push(file);
            continue;
        }

        const rawFm = cache.frontmatter;
        const fm = mappings ? normalizeFrontmatterKeys(rawFm, mappings) : rawFm;

        // Get the keys actually present in the note's frontmatter
        const noteKeys = Object.keys(fm).filter(k => k !== 'position'); // Obsidian injects 'position'

        // Missing: template keys not present in note
        const missingFields = [...allTemplateKeys].filter(k => !noteKeys.includes(k));

        // Extra: note keys not in any template and not excluded
        const extraKeys = noteKeys.filter(k =>
            !allTemplateKeys.has(k) && !excludeKey(k)
        );

        // Order drift: only evaluated when no fields are missing
        const orderDrift = missingFields.length === 0
            ? hasOrderDrift(noteKeys, canonicalOrder)
            : false;
        const semanticWarnings = buildSemanticWarnings(noteType, fm, sceneTitleIndex);

        // Build concise reason string
        const reasons: string[] = [];
        if (missingFields.length > 0) {
            reasons.push(`missing: ${missingFields.join(', ')}`);
        }
        if (extraKeys.length > 0) {
            reasons.push(`extra: ${extraKeys.join(', ')}`);
        }
        if (orderDrift) {
            reasons.push('field order differs from template');
        }
        if (semanticWarnings.length > 0) {
            reasons.push(`warnings: ${semanticWarnings.join(' | ')}`);
        }

        if (missingFields.length === 0 && extraKeys.length === 0 && !orderDrift && semanticWarnings.length === 0) {
            // Clean note — don't add to results
            continue;
        }

        notes.push({
            file,
            missingFields,
            extraKeys,
            orderDrift,
            semanticWarnings,
            reason: capReason(reasons.join(' | ')),
        });
    }

    const notesWithMissing = notes.filter(n => n.missingFields.length > 0).length;
    const notesWithExtra = notes.filter(n => n.extraKeys.length > 0).length;
    const notesWithDrift = notes.filter(n => n.orderDrift).length;
    const notesWithWarnings = notes.filter(n => n.semanticWarnings.length > 0).length;

    return {
        notes,
        unreadFiles,
        summary: {
            totalNotes: files.length,
            unreadNotes: unreadFiles.length,
            notesWithMissing,
            notesWithExtra,
            notesWithDrift,
            notesWithWarnings,
            clean: files.length - notes.length - unreadFiles.length,
        },
    };
}

// ─── File collection helpers ────────────────────────────────────────────

/**
 * Collect all vault files matching a note type.
 * Uses metadataCache for fast classification (no file I/O).
 */
export function collectFilesForAudit(
    app: App,
    noteType: NoteType,
    settings: RadialTimelineSettings,
    beatSystemKey?: string
): TFile[] {
    const files = app.vault.getMarkdownFiles();
    const mappings = settings.enableCustomMetadataMapping ? settings.frontmatterMappings : undefined;

    // Resolve Beat Model name for custom systems.
    // beatSystemKey may be in internal format 'custom:<id>' but frontmatter stores
    // the human-readable system name (e.g. 'Custom beats').
    let beatModelFilter: string | undefined;
    if (beatSystemKey && noteType === 'Beat') {
        if (beatSystemKey.startsWith('custom:')) {
            const customId = beatSystemKey.slice('custom:'.length);
            // Check saved systems first for the matching id
            const saved = settings.savedBeatSystems?.find(s => s.id === customId);
            beatModelFilter = saved?.name
                ?? settings.customBeatSystemName
                ?? 'Custom';
        } else {
            beatModelFilter = beatSystemKey;
        }
    }

    return files.filter(file => {
        const cache = app.metadataCache.getFileCache(file);
        if (!cache?.frontmatter) return false;
        const fm = mappings
            ? normalizeFrontmatterKeys(cache.frontmatter, mappings)
            : cache.frontmatter;

        switch (noteType) {
            case 'Scene':
                return fm.Class === 'Scene';
            case 'Beat':
                if (fm.Class !== 'Beat' && fm.Class !== 'Plot') return false;
                if (beatModelFilter) {
                    const model = fm['Beat Model'];
                    return model === beatModelFilter;
                }
                return true;
            case 'Backdrop':
                return fm.Class === 'Backdrop';
            default:
                return false;
        }
    });
}

// ─── Report formatting ──────────────────────────────────────────────────

/**
 * Format audit results as a plain-text report for clipboard / support.
 */
export function formatAuditReport(result: YamlAuditResult, noteType: NoteType): string {
    const lines: string[] = [];
    const s = result.summary;

    lines.push(`YAML Audit Report — ${noteType} Notes`);
    lines.push(`${'─'.repeat(48)}`);
    lines.push(`Total notes:     ${s.totalNotes}`);
    lines.push(`Clean:           ${s.clean}`);
    lines.push(`Missing fields:  ${s.notesWithMissing} note(s)`);
    lines.push(`Extra keys:      ${s.notesWithExtra} note(s)`);
    lines.push(`Order drift:     ${s.notesWithDrift} note(s)`);
    lines.push(`Warnings:        ${s.notesWithWarnings} note(s)`);
    if (s.unreadNotes > 0) {
        lines.push(`Unread (stale):  ${s.unreadNotes} note(s)`);
    }
    lines.push('');

    if (result.notes.length > 0) {
        lines.push('Details:');
        for (const entry of result.notes) {
            lines.push(`  ${entry.file.basename}  —  ${entry.reason}`);
            if (entry.semanticWarnings.length > 0) {
                lines.push(`    warnings: ${entry.semanticWarnings.join(' | ')}`);
            }
        }
    }

    if (result.unreadFiles.length > 0) {
        lines.push('');
        lines.push('Unread (no cache):');
        for (const f of result.unreadFiles) {
            lines.push(`  ${f.basename}`);
        }
    }

    return lines.join('\n');
}
