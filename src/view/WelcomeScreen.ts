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
    addMode('Chronologue', 'Shows how scenes unfold in time with shift & alt submodes.');
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
        text: 'Bug reporting & Get Help buttons in the bottom corners of the Radial Timeline window are always available. The Book Designer can help you begin by setting up a starter set of scenes.'
    });

    // Backup Notice
    const backupNotice = body.createDiv({ cls: 'rt-welcome-backup-notice' });
    
    // Icon
    const iconContainer = backupNotice.createDiv({ cls: 'rt-welcome-backup-icon' });
    iconContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-archive-restore"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h2"/><path d="M20 8v11a2 2 0 0 1-2 2h-2"/><path d="m9 15 3-3 3 3"/><path d="M12 12v9"/></svg>`; // SAFE: innerHTML used for static trusted Lucide icon SVG (no user input)

    // Text
    const backupText = backupNotice.createDiv({ cls: 'rt-welcome-backup-text' });
    
    const backupPara = backupText.createDiv();
    backupPara.createEl('strong', { text: 'Backup your Work: ' });
    backupPara.createSpan({ text: 'It is strongly recommended for you to ' });
    backupPara.createEl('a', { text: 'automate backups', href: 'https://help.obsidian.md/backup' });
    backupPara.createSpan({ text: '. The native ' });
    backupPara.createEl('a', { text: 'Obsidian Sync', href: 'https://obsidian.md/sync' });
    backupPara.createSpan({ text: ' service and community favorite ' });
    backupPara.createEl('a', { text: 'Obsidian Git', href: 'https://obsidian.md/plugins?id=obsidian-git' });
    backupPara.createSpan({ text: ' are excellent choices.' });

    const syncPara = backupText.createDiv();
    syncPara.style.marginTop = '8px';
    syncPara.createEl('strong', { text: 'Sync Conflicts: ' });
    syncPara.createSpan({ text: 'Avoid mixing sync services. If using iCloud on macOS alongside another sync tool, append ' });
    syncPara.createEl('code', { text: '.nosync' });
    syncPara.createSpan({ text: ' to the folder name to stop iCloud from syncing the vault. ' });
    syncPara.createEl('a', { text: 'Read the Obsidian Sync Guide.', href: 'https://help.obsidian.md/sync/switch' });

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

