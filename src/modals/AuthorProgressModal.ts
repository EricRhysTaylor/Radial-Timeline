import { App, Modal, Setting, ButtonComponent, Notice, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { AuthorProgressPublishTarget } from '../types/settings';
import { getKickstarterEmbed, getPatreonEmbed } from '../renderer/utils/AuthorProgressUtils';
import { getAllScenes } from '../utils/manuscript';
import { TimelineItem } from '../types/timeline';
import { AuthorProgressService } from '../services/AuthorProgressService';
import { 
    createAprSVG, 
    APR_SIZE_PRESETS, 
    APR_VIEW_MODE_LABELS,
    AprSize, 
    AprViewMode 
} from '../renderer/apr';

export class AuthorProgressModal extends Modal {
    private plugin: RadialTimelinePlugin;
    private service: AuthorProgressService;
    private viewMode: AprViewMode;
    private size: AprSize;
    private publishTarget: AuthorProgressPublishTarget;
    
    private previewContainer: HTMLElement | null = null;
    private sizeInfoEl: HTMLElement | null = null;
    
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
            authorName: '',
            authorUrl: '',
            updateFrequency: 'manual',
            stalenessThresholdDays: 30,
            enableReminders: true,
            dynamicEmbedPath: 'Radial Timeline/Social/progress.svg',
            aprSize: 'standard'
        };

        // Map old modes to new
        this.viewMode = this.mapOldModeToNew(settings.lastUsedMode || settings.defaultMode);
        this.size = (settings as any).aprSize || 'standard';
        this.publishTarget = settings.defaultPublishTarget;
    }

    private mapOldModeToNew(oldMode: string): AprViewMode {
        switch (oldMode) {
            case 'SCENES_ONLY': return 'scenes';
            case 'MOMENTUM_ONLY': return 'momentum';
            case 'FULL_STRUCTURE':
            default: return 'full';
        }
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

        // View Mode Selector
        const modeSection = glassContainer.createDiv({ cls: 'rt-glass-card rt-apr-mode-section' });
        modeSection.createEl('h4', { text: 'View Mode', cls: 'rt-section-title' });
        const modeSelector = modeSection.createDiv({ cls: 'rt-apr-mode-selector' });
        this.createModeButton(modeSelector, 'full', 'Full Structure');
        this.createModeButton(modeSelector, 'scenes', 'Scenes Only');
        this.createModeButton(modeSelector, 'momentum', 'Momentum Only');

        // Size Selector
        const sizeSection = glassContainer.createDiv({ cls: 'rt-glass-card rt-apr-size-section' });
        sizeSection.createEl('h4', { text: 'Export Size', cls: 'rt-section-title' });
        const sizeSelector = sizeSection.createDiv({ cls: 'rt-apr-size-selector' });
        this.createSizeButton(sizeSelector, 'compact', 'Compact');
        this.createSizeButton(sizeSelector, 'standard', 'Standard');
        this.createSizeButton(sizeSelector, 'large', 'Large');
        
        // Size info display
        this.sizeInfoEl = sizeSection.createDiv({ cls: 'rt-apr-size-info' });
        this.updateSizeInfo();

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
            .setName('Author Name')
            .setDesc('Optional - shown alongside book title in branding')
            .addText(text => text
                .setPlaceholder('Your Name')
                .setValue((this.plugin.settings.authorProgress as any)?.authorName || '')
                .onChange(async (val) => {
                    if (this.plugin.settings.authorProgress) {
                        (this.plugin.settings.authorProgress as any).authorName = val;
                        await this.plugin.saveSettings();
                        this.renderPreview();
                    }
                })
            );

        new Setting(identitySection)
            .setName('Author URL')
            .setDesc('Link target for the book title (your shop, Kickstarter, etc.)')
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

    private createModeButton(container: HTMLElement, mode: AprViewMode, label: string) {
        const btn = container.createEl('button', { text: label, cls: 'rt-apr-mode-btn' });
        if (this.viewMode === mode) btn.addClass('rt-active');
        btn.onclick = () => {
            this.viewMode = mode;
            container.findAll('.rt-apr-mode-btn').forEach(b => b.removeClass('rt-active'));
            btn.addClass('rt-active');
            
            // Save to settings (map back to old format for compatibility)
            if (this.plugin.settings.authorProgress) {
                const oldModeMap: Record<AprViewMode, string> = {
                    'full': 'FULL_STRUCTURE',
                    'scenes': 'SCENES_ONLY',
                    'momentum': 'MOMENTUM_ONLY'
                };
                this.plugin.settings.authorProgress.lastUsedMode = oldModeMap[mode] as any;
                this.plugin.saveSettings();
            }
            
            this.renderPreview();
        };
    }

    private createSizeButton(container: HTMLElement, size: AprSize, label: string) {
        const btn = container.createEl('button', { text: label, cls: 'rt-apr-size-btn' });
        if (this.size === size) btn.addClass('rt-active');
        btn.onclick = () => {
            this.size = size;
            container.findAll('.rt-apr-size-btn').forEach(b => b.removeClass('rt-active'));
            btn.addClass('rt-active');
            
            // Save to settings
            if (this.plugin.settings.authorProgress) {
                (this.plugin.settings.authorProgress as any).aprSize = size;
                this.plugin.saveSettings();
            }
            
            this.updateSizeInfo();
            this.renderPreview();
        };
    }

    private updateSizeInfo() {
        if (!this.sizeInfoEl) return;
        const preset = APR_SIZE_PRESETS[this.size];
        this.sizeInfoEl.setText(`${preset.svgSize} × ${preset.svgSize} px`);
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
                viewMode: this.viewMode,
                size: this.size,
                bookTitle: settings?.bookTitle || 'Working Title',
                authorName: (settings as any)?.authorName || '',
                authorUrl: settings?.authorUrl || '',
                progressPercent: this.progressPercent,
            });

            this.previewContainer.innerHTML = svgString; // SAFE: innerHTML used for SVG preview injection
        } catch (e) {
            this.previewContainer.createDiv({ text: 'Failed to render preview. Check console for details.', cls: 'rt-apr-error' });
            console.error('APR Preview render error:', e);
        }
    }

    private async publish(mode: 'static' | 'dynamic') {
        // Update service to use new renderer
        const result = await this.service.generateReport(mode, {
            viewMode: this.viewMode,
            size: this.size,
        });
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
