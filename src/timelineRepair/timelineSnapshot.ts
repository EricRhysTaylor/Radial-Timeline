/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Timeline Snapshot
 *
 * Lightweight restore-point captured immediately before Apply Scaffolded Dates
 * writes to disk. Stores only the previous `When` value (raw string when
 * available) for each scene that's about to change. Restores by writing the
 * captured values back into each scene's frontmatter.
 *
 * This is NOT a backup system. It does not preserve other frontmatter, body
 * content, or anything outside of `When`. It exists to give the author a
 * reliable single-step "put my dates back" action after a mass apply.
 */

import { TFile, type App } from 'obsidian';
import type { SessionDiffModel } from './types';

export const TIMELINE_SNAPSHOT_FOLDER = 'Radial Timeline/Snapshots/Timeline';

export interface TimelineSnapshotEntry {
    path: string;
    title: string;
    /** Raw YAML string the scene had before apply, if it existed. */
    previousWhenRaw: string | null;
}

export interface TimelineSnapshot {
    schema: 1;
    createdAt: string;
    displayLabel: string;
    config: {
        patternPreset: string;
        preserveAuthoredDates: boolean;
        useTextCues: boolean;
    };
    entries: TimelineSnapshotEntry[];
}

export interface SnapshotMeta {
    file: TFile;
    snapshot: TimelineSnapshot;
}

function pad2(n: number): string {
    return n.toString().padStart(2, '0');
}

function buildSnapshotFilename(now: Date): string {
    const stamp = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
    return `timeline-snapshot-${stamp}.json`;
}

function buildDisplayLabel(now: Date): string {
    return now.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    });
}

async function ensureSnapshotFolder(app: App): Promise<void> {
    const folder = app.vault.getAbstractFileByPath(TIMELINE_SNAPSHOT_FOLDER);
    if (folder) return;
    const parts = TIMELINE_SNAPSHOT_FOLDER.split('/');
    let current = '';
    for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        if (!app.vault.getAbstractFileByPath(current)) {
            try {
                await app.vault.createFolder(current);
            } catch {
                // Ignore — race-tolerant.
            }
        }
    }
}

export function buildTimelineSnapshot(
    session: SessionDiffModel,
    config: { patternPreset: string; preserveAuthoredDates: boolean; useTextCues: boolean }
): TimelineSnapshot {
    const now = new Date();
    const entries: TimelineSnapshotEntry[] = [];
    for (const entry of session.entries) {
        if (!entry.isChanged) continue;
        entries.push({
            path: entry.file.path,
            title: entry.scene.title ?? entry.file.basename,
            previousWhenRaw: entry.originalWhenRaw ?? null
        });
    }
    return {
        schema: 1,
        createdAt: now.toISOString(),
        displayLabel: buildDisplayLabel(now),
        config: { ...config },
        entries
    };
}

export async function saveTimelineSnapshot(
    app: App,
    snapshot: TimelineSnapshot
): Promise<TFile> {
    await ensureSnapshotFolder(app);
    const filename = buildSnapshotFilename(new Date(snapshot.createdAt));
    const path = `${TIMELINE_SNAPSHOT_FOLDER}/${filename}`;
    const json = JSON.stringify(snapshot, null, 2);
    const file = await app.vault.create(path, json);
    return file;
}

export async function listTimelineSnapshots(app: App): Promise<SnapshotMeta[]> {
    const folder = app.vault.getAbstractFileByPath(TIMELINE_SNAPSHOT_FOLDER);
    if (!folder) return [];
    const files: TFile[] = [];
    for (const child of app.vault.getFiles()) {
        if (child.path.startsWith(`${TIMELINE_SNAPSHOT_FOLDER}/`) && child.extension === 'json') {
            files.push(child);
        }
    }
    // Filenames embed a sortable timestamp, so lexicographic descending order
    // is also chronological newest-first. This avoids depending on file.stat,
    // which differs between environments.
    files.sort((a, b) => b.path.localeCompare(a.path));

    const result: SnapshotMeta[] = [];
    for (const file of files) {
        try {
            const text = await app.vault.read(file);
            const parsed = JSON.parse(text) as TimelineSnapshot;
            if (parsed && parsed.schema === 1 && Array.isArray(parsed.entries)) {
                result.push({ file, snapshot: parsed });
            }
        } catch {
            // Skip unparsable snapshots silently.
        }
    }
    return result;
}

export async function getLatestTimelineSnapshot(app: App): Promise<SnapshotMeta | null> {
    const all = await listTimelineSnapshots(app);
    return all[0] ?? null;
}

export interface RestoreResult {
    restored: number;
    skipped: number;
    failed: number;
    snapshotLabel: string;
}

/**
 * Write the snapshot's previousWhenRaw values back into each scene's
 * frontmatter, replacing the current `When` line. Scenes that had no
 * previous `When` are stripped of the field. Missing scene files are
 * skipped (counted, not errored).
 */
export async function restoreTimelineSnapshot(
    app: App,
    meta: SnapshotMeta
): Promise<RestoreResult> {
    let restored = 0;
    let skipped = 0;
    let failed = 0;

    for (const entry of meta.snapshot.entries) {
        const file = app.vault.getAbstractFileByPath(entry.path);
        if (!(file instanceof TFile)) {
            skipped++;
            continue;
        }
        try {
            const content = await app.vault.read(file);
            const updated = applyWhenToFrontmatter(content, entry.previousWhenRaw);
            if (updated !== content) {
                await app.vault.modify(file, updated);
            }
            restored++;
        } catch {
            failed++;
        }
    }

    return {
        restored,
        skipped,
        failed,
        snapshotLabel: meta.snapshot.displayLabel
    };
}

const FRONTMATTER_RE = /^(---\n)([\s\S]*?)(\n---\n?)/;
const WHEN_LINE_RE = /^When:.*$/m;

function applyWhenToFrontmatter(content: string, previousWhenRaw: string | null): string {
    const match = content.match(FRONTMATTER_RE);
    if (!match) return content;

    const [, openFence, body, closeFence] = match;
    const newWhenLine = previousWhenRaw === null ? 'When:' : `When: ${previousWhenRaw}`;

    let newBody: string;
    if (WHEN_LINE_RE.test(body)) {
        newBody = body.replace(WHEN_LINE_RE, newWhenLine);
    } else {
        // Insert as the first line of frontmatter.
        newBody = `${newWhenLine}\n${body}`;
    }

    return `${openFence}${newBody}${closeFence}${content.slice(match[0].length)}`;
}
