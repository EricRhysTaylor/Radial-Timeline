/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { App, MarkdownRenderer, Modal } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { EmbeddedReleaseNotesEntry } from '../types';
import { DEFAULT_RELEASES_URL, parseReleaseVersion } from '../utils/releases';

export class ReleaseNotesModal extends Modal {
    private readonly major: EmbeddedReleaseNotesEntry;
    private readonly latest: EmbeddedReleaseNotesEntry;
    private readonly patches: EmbeddedReleaseNotesEntry[];
    private readonly plugin: RadialTimelinePlugin;

    constructor(app: App, plugin: RadialTimelinePlugin, major: EmbeddedReleaseNotesEntry, latest: EmbeddedReleaseNotesEntry, patches: EmbeddedReleaseNotesEntry[]) {
        super(app);
        this.plugin = plugin;
        this.major = major;
        this.latest = latest;
        this.patches = patches;
    }

    async onOpen(): Promise<void> {
        const { contentEl, titleEl } = this;
        this.modalEl.addClass('rt-release-notes-modal');
        contentEl.empty();

        const versionInfo = parseReleaseVersion(this.major.version);
        const modalHeading = versionInfo ? `Radial Timeline ${versionInfo.majorLabel}` : (this.major.title || 'What\'s New');
        titleEl.setText(modalHeading);

        const metaEl = contentEl.createDiv({ cls: 'rt-release-notes-modal-meta' });
        this.attachDate(metaEl, this.major.publishedAt);
        const releaseUrl = this.major.url ?? DEFAULT_RELEASES_URL;
        const link = metaEl.createEl('a', { text: 'View on GitHub', href: releaseUrl });
        link.setAttr('target', '_blank');

        const bodyHost = contentEl.createDiv();
        const majorBody = bodyHost.createDiv({ cls: 'rt-release-notes-modal-body markdown-preview-view' });
        await MarkdownRenderer.renderMarkdown(this.major.body, majorBody, '', this.plugin);

        if (this.latest.version !== this.major.version) {
            await this.renderEntry(bodyHost, this.latest, 'Release');
        }

        for (const patch of this.patches) {
            await this.renderEntry(bodyHost, patch, 'Patch');
        }

        const footerEl = contentEl.createDiv({ cls: 'rt-release-notes-modal-footer' });
        const closeButton = footerEl.createEl('button', { text: 'Close' });
        closeButton.addEventListener('click', () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }

    private attachDate(target: HTMLElement, isoDate: string | undefined): void {
        if (!isoDate) return;
        try {
            const date = new Date(isoDate);
            if (!Number.isNaN(date.getTime())) {
                target.createSpan({ text: date.toLocaleDateString() });
            }
        } catch {
            // ignore
        }
    }

    private async renderEntry(bodyHost: HTMLElement, entry: EmbeddedReleaseNotesEntry, prefix: string): Promise<void> {
        const info = parseReleaseVersion(entry.version);
        const label = info ? `${prefix} ${info.fullLabel}` : `${prefix} ${entry.version}`;
        const details = bodyHost.createEl('details', { cls: 'rt-release-notes-details' });
        const summaryEl = details.createEl('summary', { cls: 'rt-release-notes-details-summary' });
        const date = entry.publishedAt ? new Date(entry.publishedAt) : null;
        const dateText = date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : null;
        summaryEl.createSpan({
            text: dateText ? `${label} — ${dateText}` : label,
            cls: 'rt-release-notes-details-summary-label'
        });
        const entryBody = details.createDiv({ cls: 'rt-release-notes-modal-body markdown-preview-view' });
        await MarkdownRenderer.renderMarkdown(entry.body, entryBody, '', this.plugin);
    }
}
