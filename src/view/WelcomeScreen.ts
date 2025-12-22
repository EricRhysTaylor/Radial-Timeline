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
    const intro = body.createEl('p', {
        cls: 'rt-welcome-paragraph',
        text: 'Radial Timeline is a visual map of your story across time. It works in four focused modes, each answering a different creative question.'
    });

    const modesList = body.createEl('ul', { cls: 'rt-welcome-list' });
    const addMode = (label: string, description: string) => {
        const li = modesList.createEl('li');
        li.createEl('strong', { text: `${label}: ` });
        li.createSpan({ text: description });
    };
    addMode('Narrative', 'Shows how threads are presented to the reader using the All Scenes outer ring and Story Beats.');
    addMode('Chronologue', 'Shows how scenes unfold in time.');
    addMode('Subplot', 'Isolates individual subplots with a project-management focus, making it easy to track scene Status and Publish Stage across a manuscript.');
    addMode('Gossamer', 'Steps back to give you a birds-eye view of pacing and momentum according to your story beats systems such as Save the Cat or Hero’s Journey.');

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
        text: 'Use the onscreen bug reporting tool or the Get Help buttons in the bottom corners of the Radial Timeline window. To get started, you need to create your first scene.'
    });

    // Button Container
    const buttonContainer = container.createDiv({ cls: 'rt-welcome-actions' });

    // Option 1: Simple Scene
    new ButtonComponent(buttonContainer)
        .setButtonText('Create single scene')
        .setCta()
        .onClick(async () => {
            const { createTemplateScene } = await import('../SceneAnalysisCommands');
            await createTemplateScene(plugin, plugin.app.vault);
            // Refresh the timeline after a short delay
            window.setTimeout(() => {
                refreshTimeline();
            }, 500);
        });

    // Option 2: Book Designer
    new ButtonComponent(buttonContainer)
        .setButtonText('Open Book Designer')
        .setCta()
        .onClick(() => {
            new BookDesignerModal(plugin.app, plugin).open();
        });
}

