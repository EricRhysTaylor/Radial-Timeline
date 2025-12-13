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

const HERO_PREVIEW_LIMIT = 260;

// Use the first non-heading block of markdown as a lightweight hero preview.
function buildHeroPreview(body?: string): string | null {
    if (!body) {
        return null;
    }

    const candidate = body
        .split(/\n{2,}/)
        .map(block => block.trim())
        .find(block => block.length > 0 && !/^#+\s+/.test(block));

    if (!candidate) {
        return null;
    }

    const sanitized = candidate
        .replace(/!\[[^\]]*]\([^)]*\)/g, '')
        .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
        .replace(/^[>*\-\d.]+\s+/gm, '')
        .replace(/[*_`]/g, '')
        .trim();

    if (!sanitized) {
        return null;
    }

    return sanitized.length > HERO_PREVIEW_LIMIT
        ? `${sanitized.slice(0, HERO_PREVIEW_LIMIT - 1).trimEnd()}…`
        : sanitized;
}

export class ReleaseNotesModal extends Modal {
    private readonly entries: EmbeddedReleaseNotesEntry[];
    private readonly featuredEntry: EmbeddedReleaseNotesEntry;
    private readonly plugin: RadialTimelinePlugin;

    constructor(app: App, plugin: RadialTimelinePlugin, entries: EmbeddedReleaseNotesEntry[], featuredEntry: EmbeddedReleaseNotesEntry) {
        super(app);
        this.plugin = plugin;
        this.entries = entries;
        this.featuredEntry = featuredEntry;
    }

    async onOpen(): Promise<void> {
        const { contentEl, titleEl } = this;
        this.modalEl.addClass('rt-release-notes-modal');
        contentEl.empty();

        titleEl.setText("What's New");

        const versionLabel = parseReleaseVersion(this.featuredEntry.version)?.fullLabel ?? this.featuredEntry.version;
        const releaseDate = formatPublishedDate(this.featuredEntry.publishedAt);

        const heroEl = contentEl.createDiv({ cls: 'rt-release-notes-hero' });
        heroEl.createSpan({ text: 'Latest release', cls: 'rt-release-notes-hero-badge' });
        heroEl.createEl('h3', { text: this.featuredEntry.title || versionLabel, cls: 'rt-release-notes-hero-title' });

        const heroMetaEl = heroEl.createDiv({ cls: 'rt-release-notes-hero-meta' });
        heroMetaEl.createSpan({ text: versionLabel, cls: 'rt-release-notes-hero-version' });
        if (releaseDate) {
            heroMetaEl.createSpan({ text: releaseDate, cls: 'rt-release-notes-hero-date' });
        }

        const heroPreview = buildHeroPreview(this.featuredEntry.body);
        if (heroPreview) {
            heroEl.createEl('p', { text: heroPreview, cls: 'rt-release-notes-hero-description' });
        }

        const releaseUrl = this.featuredEntry.url ?? DEFAULT_RELEASES_URL;
        const heroActions = heroEl.createDiv({ cls: 'rt-release-notes-hero-actions' });
        const changelogLink = heroActions.createEl('a', {
            text: 'View full changelog',
            cls: 'rt-release-notes-hero-link',
            href: releaseUrl
        });
        changelogLink.setAttr('target', '_blank');
        changelogLink.setAttr('rel', 'noopener');
        heroActions.createSpan({
            text: 'Scroll to explore the rest of the updates',
            cls: 'rt-release-notes-hero-hint'
        });

        const bodyHost = contentEl.createDiv({ cls: 'rt-release-notes-modal-body' });
        await renderReleaseNotesList(bodyHost, this.entries, this.featuredEntry, this.plugin, 'rt-release-notes-modal');

        const footerEl = contentEl.createDiv({ cls: 'rt-release-notes-modal-footer' });
        const closeButton = footerEl.createEl('button', { text: 'Close' });
        closeButton.addEventListener('click', () => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
