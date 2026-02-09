/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { ButtonComponent, setIcon } from 'obsidian';
import RadialTimelinePlugin from '../main';
import { BookDesignerModal } from '../modals/BookDesignerModal';

interface WelcomeScreenParams {
    container: HTMLElement;
    plugin: RadialTimelinePlugin;
    refreshTimeline: () => void;
}

const WELCOME_COPY = {
    introLine1: 'Radial Timeline is a concise visualization system to organize and structure a scene-based story or creative work as a dynamic, ever-changing body of work. Try it for novels, sagas, screenplays, podcasts or YouTube scripts—fiction or non-fiction.',
    introLine2: 'Get your feet wet by creating your first scene. See it appear in the timeline.',
    actions: {
        primary: 'Create your first scene',
        secondary: 'Design a story framework',
        tertiary: 'How scenes, structure, and the timeline work'
    },
    stepsHeading: 'Start in three steps:',
    step1: {
        title: '1. Create your first scene',
        body: 'Start a scene so you have a place to write. Choose where your scenes live in your vault, then create your first scene note.',
        note: '(This folder is called the Source path in Settings \u2192 Core \u2192 General.)'
    },
    step2: {
        title: '2. Write prose immediately',
        body: 'Open the scene and start writing. You can leave scene details blank until you need them.'
    },
    step3: {
        title: '3. Shape the story structure',
        bullets: [
            {
                title: 'Design the framework',
                body: ' \u2014 Use Book Designer to set up acts, subplots, characters, and optional beats as a starting point.'
            },
            {
                title: 'Refine structure later',
                body: ' \u2014 Adjust acts and beats anytime in Settings \u2192 Core.'
            }
        ]
    },
    reorderNote: 'Scenes and beats can be conveniently dragged into a new order in Narrative mode.'
} as const;

const WELCOME_LINKS = {
    scenesStructureTimeline: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Scenes-Structure-Timeline'
} as const;

const WELCOME_ICONS = {
    primary: 'file-plus',
    secondary: 'layers',
    tertiary: 'info'
} as const;

const addButtonIcon = (buttonEl: HTMLButtonElement, iconName: string): void => {
    const icon = buttonEl.createSpan({ cls: 'rt-welcome-button-icon' });
    buttonEl.prepend(icon);
    setIcon(icon, iconName);
};

export function renderWelcomeScreen({ container, plugin, refreshTimeline }: WelcomeScreenParams): void {
    container.addClass('rt-welcome-view');

    // Background shell icon - large and faint
    const bgIcon = container.createDiv({ cls: 'rt-welcome-bg-icon' });
    setIcon(bgIcon, 'shell');

    // Huge Welcome Title (custom styled block, not an H1)
    container.createDiv({ cls: 'rt-welcome-title', text: 'Welcome' });

    const body = container.createDiv({ cls: 'rt-welcome-body' });

    body.createEl('p', {
        cls: 'rt-welcome-paragraph',
        text: WELCOME_COPY.introLine1
    });

    body.createEl('p', {
        cls: 'rt-welcome-paragraph',
        text: WELCOME_COPY.introLine2
    });

    // Primary + secondary actions
    const topActions = body.createDiv({ cls: 'rt-welcome-actions' });

    const createSceneBtn = new ButtonComponent(topActions)
        .setButtonText(WELCOME_COPY.actions.primary)
        .setCta()
        .onClick(() => {
            const commandManager = (plugin.app as unknown as { commands?: { executeCommandById?: (id: string) => void } }).commands;
            commandManager?.executeCommandById?.('radial-timeline:create-basic-scene-note');
        });
    createSceneBtn.buttonEl.classList.add('rt-welcome-primary-btn', 'rt-welcome-action-btn');
    addButtonIcon(createSceneBtn.buttonEl, WELCOME_ICONS.primary);

    const frameworkBtn = new ButtonComponent(topActions)
        .setButtonText(WELCOME_COPY.actions.secondary)
        .onClick(() => {
            new BookDesignerModal(plugin.app, plugin).open();
        });
    frameworkBtn.buttonEl.classList.add('rt-welcome-action-btn');
    addButtonIcon(frameworkBtn.buttonEl, WELCOME_ICONS.secondary);

    const learnBtn = new ButtonComponent(topActions)
        .setButtonText(WELCOME_COPY.actions.tertiary)
        .onClick(() => {
            window.open(WELCOME_LINKS.scenesStructureTimeline, '_blank');
        });
    learnBtn.buttonEl.classList.add('rt-welcome-action-btn');
    addButtonIcon(learnBtn.buttonEl, WELCOME_ICONS.tertiary);

    // Quick-start heading
    body.createEl('p', {
        cls: 'rt-welcome-paragraph',
        text: WELCOME_COPY.stepsHeading
    });

    // Step 1: Create your first scene
    const step1 = body.createDiv({ cls: 'rt-welcome-step' });
    step1.createEl('h3', { cls: 'rt-welcome-step-title', text: WELCOME_COPY.step1.title });
    const step1Text = step1.createEl('p', { cls: 'rt-welcome-paragraph' });
    step1Text.createSpan({ text: WELCOME_COPY.step1.body });
    step1.createEl('p', { cls: 'rt-welcome-paragraph rt-welcome-footnote', text: WELCOME_COPY.step1.note });

    // Step 2: Write prose immediately
    const step2 = body.createDiv({ cls: 'rt-welcome-step' });
    step2.createEl('h3', { cls: 'rt-welcome-step-title', text: WELCOME_COPY.step2.title });
    const step2Text = step2.createEl('p', { cls: 'rt-welcome-paragraph' });
    step2Text.createSpan({ text: WELCOME_COPY.step2.body });

    // Step 3: Story setup
    const step3 = body.createDiv({ cls: 'rt-welcome-step' });
    step3.createEl('h3', { cls: 'rt-welcome-step-title', text: WELCOME_COPY.step3.title });
    const step3List = step3.createEl('ul', { cls: 'rt-welcome-list' });

    const designerLi = step3List.createEl('li');
    designerLi.createEl('strong', { text: WELCOME_COPY.step3.bullets[0].title });
    designerLi.createSpan({ text: WELCOME_COPY.step3.bullets[0].body });

    const settingsLi = step3List.createEl('li');
    settingsLi.createEl('strong', { text: WELCOME_COPY.step3.bullets[1].title });
    settingsLi.createSpan({ text: WELCOME_COPY.step3.bullets[1].body });

    body.createEl('p', {
        cls: 'rt-welcome-paragraph',
        text: WELCOME_COPY.reorderNote
    });

    // Links
    const linksWrapper = body.createDiv({ cls: 'rt-welcome-links-wrapper' });
    const links = linksWrapper.createDiv({ cls: 'rt-welcome-links' });

    const makeLinkRow = (label: string, href: string) => {
        const row = links.createDiv({ cls: 'rt-welcome-link-row' });
        row.createEl('a', { href, text: label });
    };

    makeLinkRow('Wiki \u2014 full documentation', 'https://github.com/EricRhysTaylor/radial-timeline/wiki');
    makeLinkRow('Discussions', 'https://github.com/EricRhysTaylor/radial-timeline/discussions');
    makeLinkRow('Bug reports / feature requests', 'https://github.com/EricRhysTaylor/radial-timeline/issues');

    // Backup Notice
    const backupNotice = body.createDiv({ cls: 'rt-welcome-backup-notice' });
    
    // Icon
    const iconContainer = backupNotice.createDiv({ cls: 'rt-welcome-backup-icon' });
    iconContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-archive-restore"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/></svg>`; // SAFE: innerHTML used for static trusted Lucide icon SVG (no user input)

    // Text
    const backupText = backupNotice.createDiv({ cls: 'rt-welcome-backup-text' });
    
    const backupPara = backupText.createDiv();
    backupPara.createSpan({ text: 'Back up your Obsidian vault regularly to protect against data loss. Learn more at ' });
    backupPara.createEl('a', { text: 'Obsidian Backup Guide', href: 'https://help.obsidian.md/backup' });
    backupPara.createSpan({ text: '. Sync does not protect against all forms of data loss. Sync options include ' });
    backupPara.createEl('a', { text: 'Obsidian Sync', href: 'https://obsidian.md/sync' });
    backupPara.createSpan({ text: ' or ' });
    backupPara.createEl('a', { text: 'Obsidian Git', href: 'https://obsidian.md/plugins?id=obsidian-git' });

}
