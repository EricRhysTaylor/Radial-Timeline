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

        if (missingFields.length === 0 && extraKeys.length === 0 && !orderDrift) {
            // Clean note — don't add to results
            continue;
        }

        notes.push({
            file,
            missingFields,
            extraKeys,
            orderDrift,
            reason: capReason(reasons.join(' | ')),
        });
    }

    const notesWithMissing = notes.filter(n => n.missingFields.length > 0).length;
    const notesWithExtra = notes.filter(n => n.extraKeys.length > 0).length;
    const notesWithDrift = notes.filter(n => n.orderDrift).length;

    return {
        notes,
        unreadFiles,
        summary: {
            totalNotes: files.length,
            unreadNotes: unreadFiles.length,
            notesWithMissing,
            notesWithExtra,
            notesWithDrift,
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
                if (beatSystemKey) {
                    const model = fm['Beat Model'];
                    return model === beatSystemKey;
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
    if (s.unreadNotes > 0) {
        lines.push(`Unread (stale):  ${s.unreadNotes} note(s)`);
    }
    lines.push('');

    if (result.notes.length > 0) {
        lines.push('Details:');
        for (const entry of result.notes) {
            lines.push(`  ${entry.file.basename}  —  ${entry.reason}`);
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
