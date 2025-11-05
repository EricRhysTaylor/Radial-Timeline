/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { App, MarkdownRenderer, Modal } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { EmbeddedReleaseNotesEntry } from '../main';
import { DEFAULT_RELEASES_URL, extractReleaseSummary, parseReleaseVersion } from '../utils/releases';

export class ReleaseNotesModal extends Modal {
    private readonly featured: EmbeddedReleaseNotesEntry;
    private readonly patch: EmbeddedReleaseNotesEntry | null;
    private readonly plugin: RadialTimelinePlugin;

    constructor(app: App, plugin: RadialTimelinePlugin, featured: EmbeddedReleaseNotesEntry, patch: EmbeddedReleaseNotesEntry | null) {
        super(app);
        this.plugin = plugin;
        this.featured = featured;
        this.patch = patch;
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        this.modalEl.addClass('rt-release-notes-modal');
        contentEl.empty();

        const versionInfo = parseReleaseVersion(this.featured.version);
        const modalHeading = versionInfo ? `Radial Timeline ${versionInfo.majorLabel}` : (this.featured.title || 'What\'s New');
        titleEl.setText(modalHeading);

        const metaEl = contentEl.createDiv({ cls: 'rt-release-notes-modal-meta' });
        if (this.featured.publishedAt) {
            try {
                const date = new Date(this.featured.publishedAt);
                if (!Number.isNaN(date.getTime())) {
                    metaEl.createSpan({ text: date.toLocaleDateString() });
                }
            } catch {
                // Ignore malformed dates
            }
        }
        const releaseUrl = this.featured.url ?? DEFAULT_RELEASES_URL;
        const link = metaEl.createEl('a', { text: 'View on GitHub', href: releaseUrl });
        link.setAttr('target', '_blank');

        const summary = extractReleaseSummary(this.featured.body);
        if (summary) {
            contentEl.createDiv({ cls: 'rt-release-notes-summary' }).setText(summary);
        }

        const bodyHost = contentEl.createDiv();
        const featuredBody = bodyHost.createDiv({ cls: 'rt-release-notes-modal-body markdown-preview-view' });
        MarkdownRenderer.renderMarkdown(this.featured.body, featuredBody, '', this.plugin).catch(() => {
            featuredBody.empty();
            featuredBody.createEl('p', { text: 'Unable to render release notes. Please view them on GitHub instead.' });
        });

        if (this.patch) {
            const patchInfo = parseReleaseVersion(this.patch.version);
            const details = bodyHost.createEl('details', { cls: 'rt-release-notes-details' });
            const label = patchInfo ? `Patch ${patchInfo.fullLabel}` : (this.patch.title || this.patch.version);
            const summaryEl = details.createEl('summary', { text: label });
            summaryEl.classList.add('rt-release-notes-details-summary');
            const patchBody = details.createDiv({ cls: 'rt-release-notes-modal-body markdown-preview-view' });
            MarkdownRenderer.renderMarkdown(this.patch.body, patchBody, '', this.plugin).catch(() => {
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
        const versionToMark = this.patch?.version ?? this.featured.version;
        void this.plugin.markReleaseNotesSeen(versionToMark);
    }
}
