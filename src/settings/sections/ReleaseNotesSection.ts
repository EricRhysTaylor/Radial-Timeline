/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { MarkdownRenderer } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { EmbeddedReleaseNotesEntry } from '../../types';
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

    // Collect releases so the major entry is visible first, followed by other releases chronologically.
    const seen = new Set<string>();
    const orderedItems: { entry: EmbeddedReleaseNotesEntry; kind: 'major' | 'release' | 'patch' }[] = [];
    const additionalItems: { entry: EmbeddedReleaseNotesEntry; kind: 'release' | 'patch' }[] = [];

    if (major) {
        seen.add(major.version);
        orderedItems.push({ entry: major, kind: 'major' });
    }

    const addAdditionalItem = (entry: EmbeddedReleaseNotesEntry | null | undefined, kind: 'release' | 'patch') => {
        if (!entry) return;
        if (seen.has(entry.version)) return;
        seen.add(entry.version);
        additionalItems.push({ entry, kind });
    };

    addAdditionalItem(bundle.latest, 'release');
    const bundlePatches: EmbeddedReleaseNotesEntry[] = Array.isArray(bundle.patches) ? bundle.patches : [];
    bundlePatches.forEach(entry => addAdditionalItem(entry, 'patch'));

    additionalItems.sort((a, b) => compareReleaseVersionsDesc(a.entry.version, b.entry.version));
    orderedItems.push(...additionalItems);

    for (const [index, { entry, kind }] of orderedItems.entries()) {
        const versionInfo = parseReleaseVersion(entry.version);
        const prefix = kind === 'major' ? 'Major Release' : kind === 'release' ? 'Release' : 'Patch';
        const label = versionInfo ? `${prefix} ${versionInfo.fullLabel}` : `${prefix} ${entry.title || entry.version}`;
        const details = section.createEl('details', { cls: 'rt-settings-release-notes-details' }) as HTMLDetailsElement;
        if (kind === 'major' || index === 0) {
            details.open = true;
        }
        const summaryEl = details.createEl('summary', { cls: 'rt-settings-release-notes-summary' });
        const date = formatPublishedDate(entry.publishedAt);
        summaryEl.setText(date ? `${label} — ${date}` : label);
        const patchBody = details.createDiv({ cls: 'rt-settings-release-notes-details-body' });
        const patchPreview = patchBody.createDiv({ cls: 'rt-settings-release-notes-preview markdown-preview-view' });
        void MarkdownRenderer.renderMarkdown(entry.body, patchPreview, '', plugin);
    }
}
