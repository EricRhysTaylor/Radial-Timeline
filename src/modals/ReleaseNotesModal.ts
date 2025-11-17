/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { App, Modal } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { EmbeddedReleaseNotesEntry } from '../types';
import { DEFAULT_RELEASES_URL, parseReleaseVersion } from '../utils/releases';
import { formatPublishedDate, renderReleaseNotesList } from '../utils/releaseNotesRenderer';

export class ReleaseNotesModal extends Modal {
    private readonly entries: EmbeddedReleaseNotesEntry[];
    private readonly majorEntry: EmbeddedReleaseNotesEntry;
    private readonly plugin: RadialTimelinePlugin;

    constructor(app: App, plugin: RadialTimelinePlugin, entries: EmbeddedReleaseNotesEntry[], majorEntry: EmbeddedReleaseNotesEntry) {
        super(app);
        this.plugin = plugin;
        this.entries = entries;
        this.majorEntry = majorEntry;
    }

    async onOpen(): Promise<void> {
        const { contentEl, titleEl } = this;
        this.modalEl.addClass('rt-release-notes-modal');
        contentEl.empty();

        titleEl.setText("What's New");

        const bodyHost = contentEl.createDiv();
        await renderReleaseNotesList(bodyHost, this.entries, this.majorEntry, this.plugin, 'rt-release-notes-modal');

        const footerEl = contentEl.createDiv({ cls: 'rt-release-notes-modal-footer' });
        const closeButton = footerEl.createEl('button', { text: 'Close' });
        closeButton.addEventListener('click', () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
