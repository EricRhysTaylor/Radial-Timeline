import { App, Modal, Setting, DropdownComponent, ButtonComponent, Notice, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { AuthorProgressMode, AuthorProgressPublishTarget } from '../types/settings';
import { anonymizeTimeline, getAuthorProgressSealSVG, getKickstarterEmbed, getPatreonEmbed } from '../renderer/utils/AuthorProgressUtils';
import { createTimelineSVG } from '../renderer/TimelineRenderer';
import { getAllScenes } from '../utils/manuscript';
import { TimelineItem } from '../types/timeline';
import { AuthorProgressService } from '../services/AuthorProgressService';

export class AuthorProgressModal extends Modal {
    private plugin: RadialTimelinePlugin;
    private service: AuthorProgressService;
    private mode: AuthorProgressMode;
    private note: string = '';
    private publishTarget: AuthorProgressPublishTarget;
    
    private previewContainer: HTMLElement | null = null;
    private controlsContainer: HTMLElement | null = null;
    
    private cachedScenes: TimelineItem[] = [];
    private progressPercent: number = 0;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app);
        this.plugin = plugin;
        this.service = new AuthorProgressService(plugin, app);
        
        const settings = plugin.settings.authorProgress || {
            enabled: false,
            defaultMode: 'FULL_STRUCTURE',
            defaultNoteBehavior: 'preset',
            defaultPublishTarget: 'folder',
            lastUsedMode: 'FULL_STRUCTURE',
            bookTitle: '',
            authorUrl: '',
            updateFrequency: 'manual',
            stalenessThresholdDays: 30,
            enableReminders: true,
            dynamicEmbedPath: 'AuthorProgress/progress.svg'
        };

        this.mode = settings.lastUsedMode || settings.defaultMode;
        this.publishTarget = settings.defaultPublishTarget;
    }

    async onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('rt-apr-modal');

        // Check staleness and show alert if needed (Manual mode only)
        if (this.service.isStale()) {
            const daysSince = this.plugin.settings.authorProgress?.lastPublishedDate 
                ? Math.floor((Date.now() - new Date(this.plugin.settings.authorProgress.lastPublishedDate).getTime()) / (1000 * 60 * 60 * 24))
                : 'many';
            const alert = contentEl.createDiv({ cls: 'rt-apr-stale-alert' });
            alert.createEl('span', { text: `⚠️ Your report is ${daysSince} days old. Refresh recommended.` });
        }

        const grid = contentEl.createDiv({ cls: 'rt-apr-grid' });
        
        // --- PREVIEW PANEL (Left/Center) ---
        const leftPanel = grid.createDiv({ cls: 'rt-apr-preview-panel' });
        
        const header = leftPanel.createDiv({ cls: 'rt-apr-header' });
        header.createEl('h2', { text: 'Author Progress Report' });
        header.createEl('span', { text: 'Public, spoiler-safe progress view', cls: 'rt-apr-subtitle' });

        const modeSelector = header.createDiv({ cls: 'rt-apr-mode-selector' });
        this.createModeButton(modeSelector, 'FULL_STRUCTURE', 'Full Structure');
        this.createModeButton(modeSelector, 'SCENES_ONLY', 'Scenes Only');
        this.createModeButton(modeSelector, 'MOMENTUM_ONLY', 'Momentum Only');

        this.previewContainer = leftPanel.createDiv({ cls: 'rt-apr-preview-area' });
        this.previewContainer.createDiv({ text: 'Loading preview...', cls: 'rt-apr-loading' });

        // --- CONTROLS PANEL (Right) ---
        const rightPanel = grid.createDiv({ cls: 'rt-apr-controls-panel' });
        this.controlsContainer = rightPanel;

        // Identity Configuration (Top of Controls)
        rightPanel.createEl('h3', { text: 'Report Identity' });
        
        new Setting(rightPanel)
            .setName('Book Title')
            .setDesc('Displayed on the report ring')
            .addText(text => text
                .setPlaceholder('My Awesome Novel')
                .setValue(this.plugin.settings.authorProgress?.bookTitle || '')
                .onChange(async (val) => {
                    if (this.plugin.settings.authorProgress) {
                        this.plugin.settings.authorProgress.bookTitle = val;
                        await this.plugin.saveSettings();
                        this.renderPreview(); // Live update
                    }
                })
            );

        new Setting(rightPanel)
            .setName('Link URL')
            .setDesc('Target for the report graphic (e.g., Shop, Kickstarter)')
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

        // Tabbed Actions
        const tabsContainer = rightPanel.createDiv({ cls: 'rt-apr-tabs-container' });
        const snapshotTab = tabsContainer.createDiv({ cls: 'rt-apr-tab rt-active', text: 'Static Snapshot' });
        const dynamicTab = tabsContainer.createDiv({ cls: 'rt-apr-tab', text: 'Live Embed' });
        
        const actionsContent = rightPanel.createDiv({ cls: 'rt-apr-actions-content' });

        // Default to Snapshot view
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

        await this.loadData();
        this.renderPreview();
    }

    private renderSnapshotActions(container: HTMLElement) {
        container.empty();
        container.createEl('p', { text: 'Generate a one-time image to share immediately.', cls: 'rt-apr-tab-desc' });
        
        new ButtonComponent(container)
            .setButtonText('Save Snapshot to Disk')
            .setCta()
            .onClick(() => this.publish('static'));

        // "Copy to Clipboard" is tricky with SVG->Image conversion in Obsidian context without canvas API access sometimes.
        // We'll stick to Save for V1 unless we add canvas rasterization logic.
    }

    private renderDynamicActions(container: HTMLElement) {
        container.empty();
        container.createEl('p', { text: 'Update the persistent file for your hosted embed.', cls: 'rt-apr-tab-desc' });
        
        new ButtonComponent(container)
            .setButtonText('Update Live File')
            .setCta()
            .onClick(() => this.publish('dynamic'));

        const embedSection = container.createDiv({ cls: 'rt-apr-embed-codes' });
        embedSection.createEl('h4', { text: 'Embed Codes' });
        
        new ButtonComponent(embedSection)
            .setButtonText('Copy Kickstarter Embed')
            .onClick(() => this.copyEmbed('kickstarter'));
        
        new ButtonComponent(embedSection)
            .setButtonText('Copy Patreon Embed')
            .onClick(() => this.copyEmbed('patreon'));
    }

    private createModeButton(container: HTMLElement, mode: AuthorProgressMode, label: string) {
        const btn = container.createEl('button', { text: label, cls: 'rt-apr-mode-btn' });
        if (this.mode === mode) btn.addClass('rt-active');
        btn.onclick = () => {
            this.mode = mode;
            container.findAll('.rt-apr-mode-btn').forEach(b => b.removeClass('rt-active'));
            btn.addClass('rt-active');
            
            if (this.plugin.settings.authorProgress) {
                this.plugin.settings.authorProgress.lastUsedMode = mode;
                this.plugin.saveSettings();
            }
            
            this.renderPreview();
        };
    }

    private async loadData() {
        this.cachedScenes = await getAllScenes(this.app, this.plugin);
        this.progressPercent = this.service.calculateProgress(this.cachedScenes);
    }

    private renderPreview() {
        if (!this.previewContainer) return;
        this.previewContainer.empty();

        const processedScenes = anonymizeTimeline(this.cachedScenes, this.mode);
        const settings = this.plugin.settings.authorProgress;

        const { svgString } = createTimelineSVG({
            settings: {
                ...this.plugin.settings,
                showActLabels: this.mode !== 'MOMENTUM_ONLY',
            }
        } as any, processedScenes, {
            aprMode: true,
            progressPercent: this.progressPercent,
            bookTitle: settings?.bookTitle || 'Untitled Project',
            authorUrl: settings?.authorUrl || ''
        });

        // The SVG now contains the overlay, so we just inject it
        this.previewContainer.innerHTML = svgString; // SAFE: innerHTML used for SVG preview injection
    }

    private async publish(mode: 'static' | 'dynamic') {
        const result = await this.service.generateReport(mode);
        if (result) {
            new Notice(mode === 'dynamic' ? 'Live file updated!' : `Snapshot saved to ${result}`);
            this.close();
        } else {
            new Notice('Failed to generate report.');
        }
    }

    private copyEmbed(type: 'kickstarter' | 'patreon') {
        const url = 'YOUR_PUBLISHED_URL_HERE'; // Placeholder
        let code = '';
        
        if (type === 'kickstarter') {
            code = getKickstarterEmbed(url);
        } else if (type === 'patreon') {
            code = getPatreonEmbed(url);
        }

        navigator.clipboard.writeText(code);
        new Notice('Embed code copied! Replace URL with your hosted link.');
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
