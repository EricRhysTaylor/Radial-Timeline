/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { App, MarkdownRenderer, Modal } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { EmbeddedReleaseNotesEntry } from '../main';
import { DEFAULT_RELEASES_URL, parseReleaseVersion } from '../utils/releases';

export class ReleaseNotesModal extends Modal {
    private readonly major: EmbeddedReleaseNotesEntry;
    private readonly patches: EmbeddedReleaseNotesEntry[];
    private readonly plugin: RadialTimelinePlugin;

    constructor(app: App, plugin: RadialTimelinePlugin, major: EmbeddedReleaseNotesEntry, patches: EmbeddedReleaseNotesEntry[]) {
        super(app);
        this.plugin = plugin;
        this.major = major;
        this.patches = patches;
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        this.modalEl.addClass('rt-release-notes-modal');
        contentEl.empty();

        const versionInfo = parseReleaseVersion(this.major.version);
        const modalHeading = versionInfo ? `Radial Timeline ${versionInfo.majorLabel}` : (this.major.title || 'What\'s New');
        titleEl.setText(modalHeading);

        const metaEl = contentEl.createDiv({ cls: 'rt-release-notes-modal-meta' });
        if (this.major.publishedAt) {
            try {
                const date = new Date(this.major.publishedAt);
                if (!Number.isNaN(date.getTime())) {
                    metaEl.createSpan({ text: date.toLocaleDateString() });
                }
            } catch {
                // Ignore malformed dates
            }
        }
        const releaseUrl = this.major.url ?? DEFAULT_RELEASES_URL;
        const link = metaEl.createEl('a', { text: 'View on GitHub', href: releaseUrl });
        link.setAttr('target', '_blank');

        const bodyHost = contentEl.createDiv();
        const majorBody = bodyHost.createDiv({ cls: 'rt-release-notes-modal-body markdown-preview-view' });
        MarkdownRenderer.renderMarkdown(this.major.body, majorBody, '', this.plugin).catch(() => {
            majorBody.empty();
            majorBody.createEl('p', { text: 'Unable to render release notes. Please view them on GitHub instead.' });
        });

        for (const patch of this.patches) {
            const patchInfo = parseReleaseVersion(patch.version);
            const details = bodyHost.createEl('details', { cls: 'rt-release-notes-details' });
            const label = patchInfo ? `Patch ${patchInfo.fullLabel}` : (patch.title || patch.version);
            const summaryEl = details.createEl('summary', { text: label });
            summaryEl.classList.add('rt-release-notes-details-summary');
            const patchBody = details.createDiv({ cls: 'rt-release-notes-modal-body markdown-preview-view' });
            MarkdownRenderer.renderMarkdown(patch.body, patchBody, '', this.plugin).catch(() => {
                patchBody.empty();
                patchBody.createEl('p', { text: 'Unable to render release notes. Please view them on GitHub instead.' });
            });
        }

        const footerEl = contentEl.createDiv({ cls: 'rt-release-notes-modal-footer' });
        const closeButton = footerEl.createEl('button', { text: 'Close' });
        closeButton.addEventListener('click', () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
        const versionToMark = this.patches[0]?.version ?? this.major.version;
        void this.plugin.markReleaseNotesSeen(versionToMark);
    }
}
