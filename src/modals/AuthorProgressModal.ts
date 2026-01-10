import { App, Modal, Setting, ButtonComponent, Notice, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { AuthorProgressPublishTarget } from '../types/settings';
import { getKickstarterEmbed, getPatreonEmbed } from '../renderer/utils/AuthorProgressUtils';
import { createAprSVG } from '../renderer/apr/AprRenderer';
import { getAllScenes } from '../utils/manuscript';
import { TimelineItem } from '../types/timeline';
import { AuthorProgressService } from '../services/AuthorProgressService';

export class AuthorProgressModal extends Modal {
    private plugin: RadialTimelinePlugin;
    private service: AuthorProgressService;
    private publishTarget: AuthorProgressPublishTarget;
    
    // Reveal options (checkbox states)
    private showSubplots: boolean;
    private showActs: boolean;
    private showStatus: boolean;
    private showPercent: boolean;
    private showBeatNotes: boolean;
    
    private previewContainer: HTMLElement | null = null;
    
    private cachedScenes: TimelineItem[] = [];
    private progressPercent: number = 0;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app);
        this.plugin = plugin;
        this.service = new AuthorProgressService(plugin, app);
        
        const settings = plugin.settings.authorProgress || {
            enabled: false,
            defaultNoteBehavior: 'preset',
            defaultPublishTarget: 'folder',
            showSubplots: true,
            showActs: true,
            showStatus: true,
            bookTitle: '',
            authorUrl: '',
            updateFrequency: 'manual',
            stalenessThresholdDays: 30,
            enableReminders: true,
            dynamicEmbedPath: 'Radial Timeline/Social/progress.svg'
        };

        // Initialize reveal options from settings
        this.showSubplots = settings.showSubplots ?? true;
        this.showActs = settings.showActs ?? true;
        this.showStatus = settings.showStatus ?? true;
        this.showPercent = settings.showProgressPercent ?? true;
        this.showBeatNotes = settings.showBeatNotes ?? false;
        this.publishTarget = settings.defaultPublishTarget;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('rt-apr-modal');

        // Outer glass container
        const glassContainer = contentEl.createDiv({ cls: 'rt-modal-glass-container' });

        // Modal Header with Badge (following modal template pattern)
        const header = glassContainer.createDiv({ cls: 'rt-modal-header' });
        
        // Badge with Radio icon for social media theme
        const badge = header.createSpan({ cls: 'rt-modal-badge rt-apr-badge' });
        const badgeIcon = badge.createSpan({ cls: 'rt-modal-badge-icon' });
        setIcon(badgeIcon, 'radio');
        badge.createSpan({ text: 'Share' });
        
        header.createDiv({ text: 'Author Progress Report', cls: 'rt-modal-title' });
        header.createDiv({ text: 'Public, spoiler-safe progress view for fans and backers', cls: 'rt-modal-subtitle' });

        // Check staleness and show alert if needed (Manual mode only)
        if (this.service.isStale()) {
            const daysSince = this.plugin.settings.authorProgress?.lastPublishedDate 
                ? Math.floor((Date.now() - new Date(this.plugin.settings.authorProgress.lastPublishedDate).getTime()) / (1000 * 60 * 60 * 24))
                : 'many';
            const alert = glassContainer.createDiv({ cls: 'rt-apr-stale-alert rt-glass-card' });
            const alertIcon = alert.createSpan({ cls: 'rt-apr-stale-icon' });
            setIcon(alertIcon, 'alert-triangle');
            alert.createEl('span', { text: `Your report is ${daysSince} days old. Consider refreshing.` });
        }

        // Reveal Options (checkboxes)
        const revealSection = glassContainer.createDiv({ cls: 'rt-glass-card rt-apr-reveal-section' });
        revealSection.createEl('h4', { text: 'What to Reveal', cls: 'rt-section-title' });
        revealSection.createEl('p', { 
            text: 'Control how much of your story structure is visible to fans.', 
            cls: 'rt-section-desc' 
        });
        
        new Setting(revealSection)
            .setName('Subplots')
            .setDesc('Show all subplot rings. Unchecked shows only the main plot ring.')
            .addToggle(toggle => toggle
                .setValue(this.showSubplots)
                .onChange(async (val) => {
                    this.showSubplots = val;
                    await this.saveRevealOptions();
                    this.renderPreview();
                })
            );

        new Setting(revealSection)
            .setName('Acts')
            .setDesc('Show act divisions. Unchecked shows a continuous circle.')
            .addToggle(toggle => toggle
                .setValue(this.showActs)
                .onChange(async (val) => {
                    this.showActs = val;
                    await this.saveRevealOptions();
                    this.renderPreview();
                })
            );

        new Setting(revealSection)
            .setName('Status Colors')
            .setDesc('Show stage colors (draft, revised, etc). Unchecked uses neutral gray for all scenes.')
            .addToggle(toggle => toggle
                .setValue(this.showStatus)
                .onChange(async (val) => {
                    this.showStatus = val;
                    await this.saveRevealOptions();
                    this.renderPreview();
                })
            );

        new Setting(revealSection)
            .setName('Show % Complete')
            .setDesc('Show the big center percentage.')
            .addToggle(toggle => toggle
                .setValue(this.showPercent)
                .onChange(async (val) => {
                    this.showPercent = val;
                    await this.saveRevealOptions();
                    this.renderPreview();
                })
            );

        new Setting(revealSection)
            .setName('Beat Notes')
            .setDesc('Include beat notes in the preview (usually off for APR).')
            .addToggle(toggle => toggle
                .setValue(this.showBeatNotes)
                .onChange(async (val) => {
                    this.showBeatNotes = val;
                    await this.saveRevealOptions();
                    this.renderPreview();
                })
            );

        // Preview Panel
        const previewSection = glassContainer.createDiv({ cls: 'rt-glass-card rt-apr-preview-section' });
        previewSection.createEl('h4', { text: 'Live Preview', cls: 'rt-section-title' });
        this.previewContainer = previewSection.createDiv({ cls: 'rt-apr-preview-area' });
        this.previewContainer.createDiv({ text: 'Loading preview...', cls: 'rt-apr-loading' });

        // Identity Configuration
        const identitySection = glassContainer.createDiv({ cls: 'rt-glass-card rt-apr-identity-section' });
        identitySection.createEl('h4', { text: 'Report Identity', cls: 'rt-section-title' });
        
        new Setting(identitySection)
            .setName('Book Title')
            .setDesc('Displayed on the perimeter branding')
            .addText(text => text
                .setPlaceholder('Working Title')
                .setValue(this.plugin.settings.authorProgress?.bookTitle || '')
                .onChange(async (val) => {
                    if (this.plugin.settings.authorProgress) {
                        this.plugin.settings.authorProgress.bookTitle = val;
                        await this.plugin.saveSettings();
                        this.renderPreview();
                    }
                })
            );

        new Setting(identitySection)
            .setName('Author URL')
            .setDesc('Link target for the book title arc (your shop, Kickstarter, etc.)')
            .addText(text => text
                .setPlaceholder('https://myshop.com')
                .setValue(this.plugin.settings.authorProgress?.authorUrl || '')
                .onChange(async (val) => {
                    if (this.plugin.settings.authorProgress) {
                        this.plugin.settings.authorProgress.authorUrl = val;
                        await this.plugin.saveSettings();
                        this.renderPreview();
                    }
                })
            );

        // Actions Section with Tabs
        const actionsSection = glassContainer.createDiv({ cls: 'rt-glass-card rt-apr-actions-section' });
        actionsSection.createEl('h4', { text: 'Publish', cls: 'rt-section-title' });
        
        const tabsContainer = actionsSection.createDiv({ cls: 'rt-apr-tabs-container' });
        const snapshotTab = tabsContainer.createDiv({ cls: 'rt-apr-tab rt-active' });
        setIcon(snapshotTab.createSpan(), 'camera');
        snapshotTab.createSpan({ text: 'Static Snapshot' });
        
        const dynamicTab = tabsContainer.createDiv({ cls: 'rt-apr-tab' });
        setIcon(dynamicTab.createSpan(), 'refresh-cw');
        dynamicTab.createSpan({ text: 'Live Embed' });
        
        const actionsContent = actionsSection.createDiv({ cls: 'rt-apr-actions-content' });

        this.renderSnapshotActions(actionsContent);

        snapshotTab.onclick = () => {
            snapshotTab.addClass('rt-active');
            dynamicTab.removeClass('rt-active');
            this.renderSnapshotActions(actionsContent);
        };

        dynamicTab.onclick = () => {
            dynamicTab.addClass('rt-active');
            snapshotTab.removeClass('rt-active');
            this.renderDynamicActions(actionsContent);
        };

        // Footer actions
        const footer = glassContainer.createDiv({ cls: 'rt-modal-actions' });
        new ButtonComponent(footer)
            .setButtonText('Close')
            .onClick(() => this.close());

        await this.loadData();
        this.renderPreview();
    }

    private renderSnapshotActions(container: HTMLElement) {
        container.empty();
        container.createEl('p', { text: 'Generate a one-time image to share immediately. Saves to your Output folder.', cls: 'rt-apr-tab-desc' });
        
        const btnRow = container.createDiv({ cls: 'rt-row' });
        new ButtonComponent(btnRow)
            .setButtonText('Save Snapshot')
            .setCta()
            .onClick(() => this.publish('static'));
    }

    private renderDynamicActions(container: HTMLElement) {
        container.empty();
        container.createEl('p', { text: 'Update the persistent file for your hosted embed. Use with GitHub Pages or similar.', cls: 'rt-apr-tab-desc' });
        
        const btnRow = container.createDiv({ cls: 'rt-row' });
        new ButtonComponent(btnRow)
            .setButtonText('Update Live File')
            .setCta()
            .onClick(() => this.publish('dynamic'));

        const embedSection = container.createDiv({ cls: 'rt-apr-embed-codes' });
        embedSection.createEl('h5', { text: 'Embed Codes' });
        
        const embedBtns = embedSection.createDiv({ cls: 'rt-row' });
        new ButtonComponent(embedBtns)
            .setButtonText('Copy Kickstarter Embed')
            .onClick(() => this.copyEmbed('kickstarter'));
        
        new ButtonComponent(embedBtns)
            .setButtonText('Copy Patreon Embed')
            .onClick(() => this.copyEmbed('patreon'));
    }

    private async loadData() {
        this.cachedScenes = await getAllScenes(this.app, this.plugin);
        this.progressPercent = this.service.calculateProgress(this.cachedScenes);
    }

    private renderPreview() {
        if (!this.previewContainer) return;
        this.previewContainer.empty();

        if (this.cachedScenes.length === 0) {
            this.previewContainer.createDiv({ text: 'No scenes found. Create scenes to see a preview.', cls: 'rt-apr-empty' });
            return;
        }

        const settings = this.plugin.settings.authorProgress;

        try {
            const { svgString } = createAprSVG(this.cachedScenes, {
                size: 'standard',
                progressPercent: this.progressPercent,
                bookTitle: settings?.bookTitle || 'Working Title',
                authorName: settings?.authorName || '',
                authorUrl: settings?.authorUrl || '',
                showSubplots: this.showSubplots,
                showActs: this.showActs,
                showStatusColors: this.showStatus,
                showProgressPercent: this.showPercent,
                showBeatNotes: this.showBeatNotes,
                stageColors: (this.plugin.settings as any).publishStageColors
            });

            this.previewContainer.innerHTML = svgString; // SAFE: innerHTML used for SVG preview injection
        } catch (e) {
            this.previewContainer.createDiv({ text: 'Failed to render preview. Check console for details.', cls: 'rt-apr-error' });
            console.error('APR Preview render error:', e);
        }
    }
    
    private async saveRevealOptions() {
        if (!this.plugin.settings.authorProgress) {
            this.plugin.settings.authorProgress = {
                enabled: false,
                defaultNoteBehavior: 'preset',
                defaultPublishTarget: 'folder',
                showSubplots: true,
                showActs: true,
                showStatus: true,
                bookTitle: '',
                authorUrl: '',
                updateFrequency: 'manual',
                stalenessThresholdDays: 30,
                enableReminders: true,
                dynamicEmbedPath: 'Radial Timeline/Social/progress.svg'
            };
        }
        this.plugin.settings.authorProgress.showSubplots = this.showSubplots;
        this.plugin.settings.authorProgress.showActs = this.showActs;
        this.plugin.settings.authorProgress.showStatus = this.showStatus;
        this.plugin.settings.authorProgress.showProgressPercent = this.showPercent;
        this.plugin.settings.authorProgress.showBeatNotes = this.showBeatNotes;
        await this.plugin.saveSettings();
    }

    private async publish(mode: 'static' | 'dynamic') {
        const result = await this.service.generateReport(mode);
        if (result) {
            new Notice(mode === 'dynamic' ? 'Live file updated!' : `Snapshot saved to ${result}`);
        } else {
            new Notice('Failed to generate report.');
        }
    }

    private copyEmbed(type: 'kickstarter' | 'patreon') {
        const embedPath = this.plugin.settings.authorProgress?.dynamicEmbedPath || 'progress.svg';
        // Placeholder URL - user needs to replace with their actual hosted URL
        const url = `https://YOUR_GITHUB_PAGES_URL/${embedPath}`;
        let code = '';
        
        if (type === 'kickstarter') {
            code = getKickstarterEmbed(url);
        } else if (type === 'patreon') {
            code = getPatreonEmbed(url);
        }

        navigator.clipboard.writeText(code);
        new Notice('Embed code copied! Replace YOUR_GITHUB_PAGES_URL with your actual hosted URL.');
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
