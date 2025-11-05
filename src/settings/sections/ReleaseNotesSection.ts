/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { MarkdownRenderer } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { EmbeddedReleaseNotesEntry } from '../../main';
import { DEFAULT_RELEASES_URL, compareReleaseVersionsDesc, parseReleaseVersion } from '../../utils/releases';

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

    if (!bundle || (!bundle.major && !bundle.latest)) {
        const fallback = section.createEl('p');
        fallback.setText('Release notes are not available in this build. ');
        const link = fallback.createEl('a', { text: 'View releases on GitHub.', href: DEFAULT_RELEASES_URL });
        link.setAttr('target', '_blank');
        return;
    }

    // Show the major release (e.g., 3.0.0) prominently
    const major = bundle.major ?? bundle.latest!;

    const versionInfo = parseReleaseVersion(major.version);
    const header = section.createDiv({ cls: 'rt-settings-release-notes-header' });
    header.createEl('strong', { text: versionInfo ? `Radial Timeline ${versionInfo.majorLabel}` : (major.title || major.version) });

    const dateLabel = formatPublishedDate(major.publishedAt);
    if (dateLabel) {
        header.createSpan({ text: dateLabel });
    }

    const headerLink = header.createEl('a', { text: 'Open on GitHub', href: major.url ?? DEFAULT_RELEASES_URL });
    headerLink.setAttr('target', '_blank');

    const previewEl = section.createDiv({ cls: 'rt-settings-release-notes-preview markdown-preview-view' });
    MarkdownRenderer.renderMarkdown(major.body, previewEl, '', plugin).catch(() => {
        previewEl.empty();
        previewEl.createEl('p', { text: 'Unable to render release notes. View them on GitHub instead.' });
    });

    // Collect patches (excluding the major release)
    const seen = new Set<string>([major.version]);
    const patches: EmbeddedReleaseNotesEntry[] = [];
    const addPatch = (entry: EmbeddedReleaseNotesEntry | null | undefined) => {
        if (!entry) return;
        if (seen.has(entry.version)) return;
        seen.add(entry.version);
        patches.push(entry);
    };

    // Add patches from bundle
    const bundlePatches: EmbeddedReleaseNotesEntry[] = Array.isArray(bundle.patches) ? bundle.patches : [];
    for (const entry of bundlePatches) {
        addPatch(entry);
    }

    // Add latest if it's different from major
    addPatch(bundle.latest);

    patches.sort((a, b) => compareReleaseVersionsDesc(a.version, b.version));

    for (const patchEntry of patches) {
        const patchInfo = parseReleaseVersion(patchEntry.version);
        const label = patchInfo ? `Patch ${patchInfo.fullLabel}` : (patchEntry.title || patchEntry.version);
        const details = section.createEl('details', { cls: 'rt-settings-release-notes-details' });
        details.createEl('summary', { cls: 'rt-settings-release-notes-summary', text: label });
        const patchBody = details.createDiv({ cls: 'rt-settings-release-notes-details-body' });
        const patchPreview = patchBody.createDiv({ cls: 'rt-settings-release-notes-preview markdown-preview-view' });
        MarkdownRenderer.renderMarkdown(patchEntry.body, patchPreview, '', plugin).catch(() => {
            patchPreview.empty();
            patchPreview.createEl('p', { text: 'Unable to render release notes. View them on GitHub instead.' });
        });
    }
}
