/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type RadialTimelinePlugin from '../../main';
import { DEFAULT_RELEASES_URL, parseReleaseVersion } from '../../utils/releases';
import { formatPublishedDate, renderReleaseNotesList } from '../../utils/releaseNotesRenderer';

interface ReleaseNotesSectionArgs {
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

export async function renderReleaseNotesSection({ plugin, containerEl }: ReleaseNotesSectionArgs): Promise<void> {
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

    await renderReleaseNotesList(section, entries, majorEntry, plugin, 'rt-settings-release-notes');
}
