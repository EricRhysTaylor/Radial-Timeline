import { MarkdownRenderer, Component } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { EmbeddedReleaseNotesEntry } from '../types';

export function formatPublishedDate(dateStr?: string): string {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

export async function renderReleaseNoteEntry(
    entry: EmbeddedReleaseNotesEntry,
    container: HTMLElement,
    plugin: RadialTimelinePlugin
): Promise<void> {
    const entryBody = container.createDiv({ cls: 'rt-release-note-body' });
    
    if (entry.body) {
        // Safe check for undefined body
        await MarkdownRenderer.renderMarkdown(entry.body, entryBody, '', plugin);
    } else {
        // Render sections if body is missing
        entry.sections.forEach(section => {
            if (section.items.length > 0) {
                entryBody.createEl('h4', { text: section.type.toUpperCase() });
                const ul = entryBody.createEl('ul');
                section.items.forEach(item => {
                    ul.createEl('li', { text: item });
                });
            }
        });
    }
}

// Fallback/alias if older code calls renderReleaseNotesList expecting a list renderer
// (though usually we render entry by entry now).
export async function renderReleaseNotesList(
    entries: EmbeddedReleaseNotesEntry[],
    container: HTMLElement,
    plugin: RadialTimelinePlugin
): Promise<void> {
    for (const entry of entries) {
        const wrapper = container.createDiv({ cls: 'rt-release-note-entry-wrapper' });
        wrapper.createEl('h3', { text: entry.title });
        if (entry.publishedAt) {
            wrapper.createDiv({ cls: 'rt-release-note-date', text: formatPublishedDate(entry.publishedAt) });
        }
        await renderReleaseNoteEntry(entry, wrapper, plugin);
    }
}
