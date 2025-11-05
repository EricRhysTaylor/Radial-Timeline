/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { MarkdownRenderer } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { DEFAULT_RELEASES_URL, extractReleaseSummary, parseReleaseVersion } from '../../utils/releases';

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
    const bundle = plugin.getReleaseNotesBundle();
    const section = containerEl.createDiv({ cls: 'rt-settings-release-notes' });
    section.createEl('h2', { text: "What's New" });

    if (!bundle || (!bundle.featured && !bundle.current)) {
        const fallback = section.createEl('p');
        fallback.setText('Release notes are not available in this build. ');
        const link = fallback.createEl('a', { text: 'View releases on GitHub.', href: DEFAULT_RELEASES_URL });
        link.setAttr('target', '_blank');
        return;
    }

    const featured = bundle.featured ?? bundle.current!;

    const versionInfo = parseReleaseVersion(featured.version);
    const header = section.createDiv({ cls: 'rt-settings-release-notes-header' });
    header.createEl('strong', { text: versionInfo ? `Radial Timeline ${versionInfo.majorLabel}` : (featured.title || featured.version) });

    const dateLabel = formatPublishedDate(featured.publishedAt);
    if (dateLabel) {
        header.createSpan({ text: dateLabel });
    }

    const headerLink = header.createEl('a', { text: 'Open on GitHub', href: featured.url ?? DEFAULT_RELEASES_URL });
    headerLink.setAttr('target', '_blank');

    const summary = extractReleaseSummary(featured.body);
    if (summary) {
        section.createDiv({ cls: 'rt-settings-release-summary' }).setText(summary);
    }

    const previewEl = section.createDiv({ cls: 'rt-settings-release-notes-preview markdown-preview-view' });
    MarkdownRenderer.renderMarkdown(featured.body, previewEl, '', plugin).catch(() => {
        previewEl.empty();
        previewEl.createEl('p', { text: 'Unable to render release notes. View them on GitHub instead.' });
    });

    const patchEntry = bundle.current && bundle.current.version !== featured.version ? bundle.current : null;

    if (patchEntry) {
        const patchInfo = parseReleaseVersion(patchEntry.version);
        const details = section.createEl('details', { cls: 'rt-settings-release-notes-details' });
        const label = patchInfo ? `Patch ${patchInfo.fullLabel}` : patchEntry.title || patchEntry.version;
        details.createEl('summary', { cls: 'rt-settings-release-notes-summary', text: label });
        const patchBody = details.createDiv({ cls: 'rt-settings-release-notes-details-body' });
        const patchPreview = patchBody.createDiv({ cls: 'rt-settings-release-notes-preview markdown-preview-view' });
        MarkdownRenderer.renderMarkdown(patchEntry.body, patchPreview, '', plugin).catch(() => {
            patchPreview.empty();
            patchPreview.createEl('p', { text: 'Unable to render release notes. View them on GitHub instead.' });
        });
    }

}
