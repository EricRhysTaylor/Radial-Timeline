/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { ButtonComponent } from 'obsidian';
import RadialTimelinePlugin from '../main';
import { BookDesignerModal } from '../modals/BookDesignerModal';

interface WelcomeScreenParams {
    container: HTMLElement;
    plugin: RadialTimelinePlugin;
    refreshTimeline: () => void;
}

export function renderWelcomeScreen({ container, plugin, refreshTimeline }: WelcomeScreenParams): void {
    container.addClass('rt-welcome-view');

    // Huge Welcome Title (custom styled block, not an H1)
    container.createDiv({ cls: 'rt-welcome-title', text: 'Welcome' });

    const body = container.createDiv({ cls: 'rt-welcome-body' });

    // Intro Paragraph
    const intro = body.createEl('p', { cls: 'rt-welcome-paragraph' });
    intro.createSpan({ text: 'Radial Timeline is a visual map of your story in a concise radial format, revealing structure, status, and meta. It works in four focused modes, each answering a different creative question.' });

    const modesList = body.createEl('ul', { cls: 'rt-welcome-list' });
    const addMode = (label: string, description: string) => {
        const li = modesList.createEl('li');
        li.createEl('strong', { text: `${label}: ` });
        li.createSpan({ text: description });
    };
    addMode('Narrative', 'Color coded subplots and All Scenes outer ring plus Story Beats.');
    addMode('Subplot', 'Isolates individual subplots with a project-management focus.');
    addMode('Chronologue', 'Shows how scenes unfold in time with shift-mode.');
    addMode('Gossamer', 'Steps back to give you a birds-eye view of pacing and momentum.');

    const links = body.createEl('p', { cls: 'rt-welcome-links' });

    const makeLinkRow = (label: string, href: string) => {
        const row = links.createDiv({ cls: 'rt-welcome-link-row' });
        row.createEl('a', { href, text: label });
    };

    makeLinkRow('Learn more at the GitHub Wiki', 'https://github.com/EricRhysTaylor/radial-timeline/wiki');
    makeLinkRow('Discussions group', 'https://github.com/EricRhysTaylor/Radial-Timeline/discussions');
    makeLinkRow('Bug reports / feature requests', 'https://github.com/EricRhysTaylor/radial-timeline/issues');

    const cta = body.createEl('p', {
        cls: 'rt-welcome-paragraph',
        text: 'Bug reporting & Get Help buttons in the bottom corners of the Radial Timeline window are always available. The Book Designer can help you get started by setting up scenes and subplots.'
    });

    // Button Container
    const buttonContainer = container.createDiv({ cls: 'rt-welcome-actions' });

    // Book Designer only
    const bookBtn = new ButtonComponent(buttonContainer)
        .setButtonText('Book Designer')
        .setCta()
        .onClick(() => {
            new BookDesignerModal(plugin.app, plugin).open();
        });
    bookBtn.buttonEl.classList.add('rt-welcome-book-btn');
}

