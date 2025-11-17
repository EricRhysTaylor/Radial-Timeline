/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { MarkdownRenderer } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { EmbeddedReleaseNotesEntry } from '../types';
import { parseReleaseVersion, formatPublishedDate } from './releases';

export { formatPublishedDate };

export async function renderReleaseNotesList(
    containerEl: HTMLElement,
    entries: EmbeddedReleaseNotesEntry[],
    majorEntry: EmbeddedReleaseNotesEntry,
    plugin: RadialTimelinePlugin,
    cssPrefix: string
): Promise<void> {
    // Render major entry body
    const majorBody = containerEl.createDiv({ cls: `${cssPrefix}-body markdown-preview-view` });
    await MarkdownRenderer.renderMarkdown(majorEntry.body, majorBody, '', plugin);

    // Render other entries as collapsible details, skipping the major entry
    for (const entry of entries) {
        if (entry.version === majorEntry.version) {
            continue;
        }

        const versionLabel = parseReleaseVersion(entry.version)?.fullLabel ?? (entry.title || entry.version);
        const details = containerEl.createEl('details', { cls: `${cssPrefix}-details` }) as HTMLDetailsElement;
        const summaryEl = details.createEl('summary', { cls: `${cssPrefix}-details-summary` });
        const dateText = formatPublishedDate(entry.publishedAt);
        summaryEl.createSpan({
            text: dateText ? `${versionLabel} — ${dateText}` : versionLabel,
            cls: `${cssPrefix}-details-summary-label`
        });
        const entryBody = details.createDiv({ cls: `${cssPrefix}-body markdown-preview-view` });
        await MarkdownRenderer.renderMarkdown(entry.body, entryBody, '', plugin);
    }
}

