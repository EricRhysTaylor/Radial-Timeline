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

        const versionInfo = parseReleaseVersion(this.majorEntry.version);
        const modalHeading = versionInfo ? `Radial Timeline ${versionInfo.majorLabel}` : (this.majorEntry.title || 'What\'s New');
        titleEl.setText(modalHeading);

        const metaEl = contentEl.createDiv({ cls: 'rt-release-notes-modal-meta' });
        this.attachDate(metaEl, this.majorEntry.publishedAt);
        const releaseUrl = this.majorEntry.url ?? DEFAULT_RELEASES_URL;
        const link = metaEl.createEl('a', { text: 'View on GitHub', href: releaseUrl });
        link.setAttr('target', '_blank');

        const bodyHost = contentEl.createDiv();
        const majorBody = bodyHost.createDiv({ cls: 'rt-release-notes-modal-body markdown-preview-view' });
        await MarkdownRenderer.renderMarkdown(this.majorEntry.body, majorBody, '', this.plugin);

        for (const entry of this.entries) {
            const isMajor = entry.version === this.majorEntry.version;
            await this.renderEntry(bodyHost, entry, isMajor);
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

    private async renderEntry(bodyHost: HTMLElement, entry: EmbeddedReleaseNotesEntry, defaultOpen: boolean): Promise<void> {
        const info = parseReleaseVersion(entry.version);
        const label = info ? info.fullLabel : (entry.title || entry.version);
        const details = bodyHost.createEl('details', { cls: 'rt-release-notes-details' }) as HTMLDetailsElement;
        if (defaultOpen) {
            details.open = true;
        }
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
