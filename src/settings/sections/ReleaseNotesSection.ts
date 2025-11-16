/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { MarkdownRenderer } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { EmbeddedReleaseNotesEntry } from '../../types';
import { DEFAULT_RELEASES_URL, parseReleaseVersion } from '../../utils/releases';

interface ReleaseNotesSectionArgs {
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

function formatPublishedDate(value: string | undefined): string | null {
    if (!value) return null;
    try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return date.toLocaleDateString();
    } catch {
        return null;
    }
}

export function renderReleaseNotesSection({ plugin, containerEl }: ReleaseNotesSectionArgs): void {
    const entries = plugin.getReleaseNotesEntries();
    const section = containerEl.createDiv({ cls: 'rt-settings-release-notes' });
    section.createEl('h2', { text: "What's New" });

    if (!entries || entries.length === 0) {
        const fallback = section.createEl('p');
        fallback.setText('Release notes are not available in this build. ');
        const link = fallback.createEl('a', { text: 'View releases on GitHub.', href: DEFAULT_RELEASES_URL });
        link.setAttr('target', '_blank');
        return;
    }

    const majorVersion = plugin.getReleaseNotesMajorVersion();
    const majorEntry = (majorVersion ? entries.find(entry => entry.version === majorVersion) : null) ?? entries[entries.length - 1] ?? entries[0];

    const versionInfo = parseReleaseVersion(majorEntry.version);
    const header = section.createDiv({ cls: 'rt-settings-release-notes-header' });
    header.createEl('strong', { text: versionInfo ? `Radial Timeline ${versionInfo.majorLabel}` : (majorEntry.title || majorEntry.version) });

    const dateLabel = formatPublishedDate(majorEntry.publishedAt);
    if (dateLabel) {
        header.createSpan({ text: dateLabel });
    }

    const headerLink = header.createEl('a', { text: 'Open on GitHub', href: majorEntry.url ?? DEFAULT_RELEASES_URL });
    headerLink.setAttr('target', '_blank');

    const previewEl = section.createDiv({ cls: 'rt-settings-release-notes-preview markdown-preview-view' });
    void MarkdownRenderer.renderMarkdown(majorEntry.body, previewEl, '', plugin);

    for (const entry of entries) {
        const versionLabel = parseReleaseVersion(entry.version)?.fullLabel ?? (entry.title || entry.version);
        const details = section.createEl('details', { cls: 'rt-settings-release-notes-details' }) as HTMLDetailsElement;
        if (entry.version === majorEntry.version) {
            details.open = true;
        }
        const summaryEl = details.createEl('summary', { cls: 'rt-settings-release-notes-summary' });
        const date = formatPublishedDate(entry.publishedAt);
        summaryEl.setText(date ? `${versionLabel} — ${date}` : versionLabel);
        const patchBody = details.createDiv({ cls: 'rt-settings-release-notes-details-body' });
        const patchPreview = patchBody.createDiv({ cls: 'rt-settings-release-notes-preview markdown-preview-view' });
        void MarkdownRenderer.renderMarkdown(entry.body, patchPreview, '', plugin);
    }
}
