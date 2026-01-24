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
    featuredEntry: EmbeddedReleaseNotesEntry,
    plugin: RadialTimelinePlugin,
    cssPrefix: string,
    detailClasses: string = ''
): Promise<void> {
    const detailClassName = [ `${cssPrefix}-details`, detailClasses ].filter(Boolean).join(' ');

    // Render all entries as collapsible details, with the featured entry expanded by default
    for (const entry of entries) {
        const versionLabel = parseReleaseVersion(entry.version)?.fullLabel ?? (entry.title || entry.version);
        const details = containerEl.createEl('details', { cls: detailClassName }) as HTMLDetailsElement;

        // Expand the featured release
        if (entry.version === featuredEntry.version) {
            details.open = true;
        }

        if (entry.version === featuredEntry.version) {
            details.addClass(`${cssPrefix}-details-major`);
        }

        const summaryEl = details.createEl('summary', { cls: `${cssPrefix}-details-summary` });
        summaryEl.createSpan({
            text: versionLabel,
            cls: `${cssPrefix}-details-summary-label`
        });

        const dateText = formatPublishedDate(entry.publishedAt);
        if (dateText) {
            summaryEl.createSpan({
                text: '•',
                cls: `${cssPrefix}-details-summary-divider`
            });
            summaryEl.createSpan({
                text: dateText,
                cls: `${cssPrefix}-details-summary-date`
            });
        }

        if (entry.version === featuredEntry.version) {
            summaryEl.createSpan({
                text: 'Latest',
                cls: `${cssPrefix}-details-summary-badge`
            });
        }

        const entryBody = details.createDiv({ cls: `${cssPrefix}-details-body markdown-preview-view` });
        await MarkdownRenderer.renderMarkdown(entry.body ?? '', entryBody, '', plugin);
    }
}
