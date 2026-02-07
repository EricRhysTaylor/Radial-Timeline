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

export function renderWelcomeScreen({ container, plugin, refreshTimeline }: WelcomeScreenParams): void {
    container.addClass('rt-welcome-view');

    // Background shell icon - large and faint
    const bgIcon = container.createDiv({ cls: 'rt-welcome-bg-icon' });
    setIcon(bgIcon, 'shell');

    // Huge Welcome Title (custom styled block, not an H1)
    container.createDiv({ cls: 'rt-welcome-title', text: 'Welcome' });

    const body = container.createDiv({ cls: 'rt-welcome-body' });

    // Quick-start heading
    body.createEl('p', {
        cls: 'rt-welcome-paragraph',
        text: 'Get started in a few steps:'
    });

    // Step 1: Source path
    const step1 = body.createDiv({ cls: 'rt-welcome-step' });
    step1.createEl('strong', { text: '1. Set your source path' });
    const step1Text = step1.createEl('p', { cls: 'rt-welcome-paragraph' });
    step1Text.createSpan({ text: 'Point Radial Timeline at the folder containing (or that will contain) your manuscript scene files. Go to ' });
    step1Text.createEl('strong', { text: 'Settings \u2192 Core \u2192 General \u2192 Source path' });
    step1Text.createSpan({ text: ', or the welcome screen will prompt you.' });

    // Step 2: Create scenes
    const step2 = body.createDiv({ cls: 'rt-welcome-step' });
    step2.createEl('strong', { text: '2. Create scenes' });
    const step2List = step2.createEl('ul', { cls: 'rt-welcome-list' });

    const bookLi = step2List.createEl('li');
    bookLi.createEl('strong', { text: 'Book Designer' });
    bookLi.createSpan({ text: ' \u2014 Generate a complete manuscript scaffold with acts, subplots, characters, and optional beat notes in one click. This is the fastest way to see Radial Timeline in action.' });

    const manualLi = step2List.createEl('li');
    manualLi.createEl('strong', { text: 'Manual' });
    manualLi.createSpan({ text: ' \u2014 Use the command palette (Cmd/Ctrl + P) \u2192 Radial Timeline: Create basic scene note or Create advanced scene note to add scenes one at a time.' });

    // Step 3: Structure
    const step3 = body.createDiv({ cls: 'rt-welcome-step' });
    step3.createEl('strong', { text: '3. Set up your structure' });
    const step3List = step3.createEl('ul', { cls: 'rt-welcome-list' });

    const actsLi = step3List.createEl('li');
    actsLi.createEl('strong', { text: 'Acts' });
    actsLi.createSpan({ text: ' \u2014 Default is 3-act structure. Adjust in Settings \u2192 Core \u2192 Acts.' });

    const beatsLi = step3List.createEl('li');
    beatsLi.createEl('strong', { text: 'Story beats' });
    beatsLi.createSpan({ text: ' \u2014 Activate a beat system (Save the Cat, Hero\u2019s Journey, Story Grid) or create your own custom system in Settings \u2192 Core \u2192 Story beats system.' });

    // Step 4: Explore modes
    const step4 = body.createDiv({ cls: 'rt-welcome-step' });
    step4.createEl('strong', { text: '4. Explore modes' });
    const step4Text = step4.createEl('p', { cls: 'rt-welcome-paragraph' });
    step4Text.createSpan({ text: 'Switch between the three primary Timeline modes using keyboard shortcuts ' });
    step4Text.createEl('strong', { text: '1' });
    step4Text.createSpan({ text: ' (Narrative), ' });
    step4Text.createEl('strong', { text: '2' });
    step4Text.createSpan({ text: ' (Publication), and ' });
    step4Text.createEl('strong', { text: '3' });
    step4Text.createSpan({ text: ' (Chronologue) to see your story from different angles. Once you have a zero draft, try Gossamer mode (' });
    step4Text.createEl('strong', { text: '4' });
    step4Text.createSpan({ text: ') to map out the initial AI take on your momentum graph.' });

    // Links
    const links = body.createEl('p', { cls: 'rt-welcome-links' });

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
