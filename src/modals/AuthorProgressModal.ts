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
    private aprSize: 'compact' | 'standard' | 'large';
    private aprBackgroundColor: string;
    private aprCenterTransparent: boolean;
    private aprBookAuthorColor: string;
    private aprEngineColor: string;
    private aprTheme: 'dark' | 'light';
    
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
        this.aprSize = settings.aprSize ?? 'standard';
        this.aprBackgroundColor = settings.aprBackgroundColor ?? '#0d0d0f';
        this.aprCenterTransparent = settings.aprCenterTransparent ?? false;
        this.aprBookAuthorColor = settings.aprBookAuthorColor ?? this.plugin.settings.publishStageColors?.Press ?? '#6FB971';
        this.aprEngineColor = settings.aprEngineColor ?? '#e5e5e5';
        this.aprTheme = settings.aprTheme ?? 'dark';
        this.publishTarget = settings.defaultPublishTarget;
    }

    async onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        
        // Apply shell styling and sizing
        if (modalEl) {
            modalEl.classList.add('rt-modal-shell', 'rt-apr-modal');
            modalEl.style.width = '720px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw';
        }
        
        // Standard modal container with glassy styling
        contentEl.addClass('rt-modal-container', 'rt-apr-content');

        // Modal Header with Badge (following modal template pattern)
        const header = contentEl.createDiv({ cls: 'rt-modal-header' });
        
        // Badge with Radio icon for social media theme
        const badge = header.createSpan({ cls: 'rt-modal-badge rt-apr-badge' });
        const badgeIcon = badge.createSpan({ cls: 'rt-modal-badge-icon' });
        setIcon(badgeIcon, 'radio');
        badge.createSpan({ text: 'Share' });
        
        header.createDiv({ text: 'Author progress report', cls: 'rt-modal-title' });
        header.createDiv({ text: 'Public, spoiler-safe progress view for fans and backers', cls: 'rt-modal-subtitle' });

        // Check staleness and show alert if needed (Manual mode only)
        if (this.service.isStale()) {
            const daysSince = this.plugin.settings.authorProgress?.lastPublishedDate 
                ? Math.floor((Date.now() - new Date(this.plugin.settings.authorProgress.lastPublishedDate).getTime()) / (1000 * 60 * 60 * 24))
                : 'many';
            const alert = contentEl.createDiv({ cls: 'rt-apr-stale-alert rt-glass-card' });
            const alertIcon = alert.createSpan({ cls: 'rt-apr-stale-icon' });
            setIcon(alertIcon, 'alert-triangle');
            alert.createEl('span', { text: `Your report is ${daysSince} days old. Consider refreshing.` });
        }

        // Reveal Options (checkboxes in grid)
        const revealSection = contentEl.createDiv({ cls: 'rt-apr-reveal-section' });
        revealSection.createEl('h4', { text: 'What to Reveal', cls: 'rt-apr-reveal-title' });
        revealSection.createEl('p', { 
            text: 'Control how much of your story structure is visible to fans.', 
            cls: 'rt-apr-reveal-desc' 
        });
        
        const checkboxGrid = revealSection.createDiv({ cls: 'rt-apr-checkbox-grid' });
        
        // Subplots checkbox
        const subplotsItem = checkboxGrid.createDiv({ cls: 'rt-apr-checkbox-item' });
        const subplotsInput = subplotsItem.createEl('input', { type: 'checkbox' });
        subplotsInput.id = 'apr-subplots';
        subplotsInput.checked = this.showSubplots;
        subplotsInput.onchange = async () => {
            this.showSubplots = subplotsInput.checked;
            await this.saveRevealOptions();
            await this.renderPreview();
        };
        subplotsItem.createEl('label', { text: 'Subplots', attr: { for: 'apr-subplots' } });
        
        // Acts checkbox
        const actsItem = checkboxGrid.createDiv({ cls: 'rt-apr-checkbox-item' });
        const actsInput = actsItem.createEl('input', { type: 'checkbox' });
        actsInput.id = 'apr-acts';
        actsInput.checked = this.showActs;
        actsInput.onchange = async () => {
            this.showActs = actsInput.checked;
            await this.saveRevealOptions();
            await this.renderPreview();
        };
        actsItem.createEl('label', { text: 'Acts', attr: { for: 'apr-acts' } });
        
        // Status Colors checkbox
        const statusItem = checkboxGrid.createDiv({ cls: 'rt-apr-checkbox-item' });
        const statusInput = statusItem.createEl('input', { type: 'checkbox' });
        statusInput.id = 'apr-status';
        statusInput.checked = this.showStatus;
        statusInput.onchange = async () => {
            this.showStatus = statusInput.checked;
            await this.saveRevealOptions();
            await this.renderPreview();
        };
        statusItem.createEl('label', { text: 'Status Colors', attr: { for: 'apr-status' } });
        
        // % Complete checkbox
        const percentItem = checkboxGrid.createDiv({ cls: 'rt-apr-checkbox-item' });
        const percentInput = percentItem.createEl('input', { type: 'checkbox' });
        percentInput.id = 'apr-percent';
        percentInput.checked = this.showPercent;
        percentInput.onchange = async () => {
            this.showPercent = percentInput.checked;
            await this.saveRevealOptions();
            await this.renderPreview();
        };
        percentItem.createEl('label', { text: '% Complete', attr: { for: 'apr-percent' } });

        // Size selector
        const sizeSection = contentEl.createDiv({ cls: 'rt-glass-card rt-apr-size-section' });
        sizeSection.createEl('h4', { text: 'Export Size', cls: 'rt-section-title' });
        sizeSection.createEl('p', { text: 'Pick a preset for typical use: small (social), medium (posts), large (embeds).', cls: 'rt-apr-size-desc' });
        const sizeSelector = sizeSection.createDiv({ cls: 'rt-apr-size-selector' });
        this.createSizeButton(sizeSelector, 'compact', 'Small · 600px');
        this.createSizeButton(sizeSelector, 'standard', 'Medium · 800px');
        this.createSizeButton(sizeSelector, 'large', 'Large · 1000px');
        this.sizeInfoEl = sizeSection.createDiv({ cls: 'rt-apr-size-info' });
        this.updateSizeInfo();
        // Theme selector (light/dark)
        const themeSection = contentEl.createDiv({ cls: 'rt-glass-card rt-apr-theme-section' });
        themeSection.createEl('h4', { text: 'Theme Contrast', cls: 'rt-section-title' });
        themeSection.createEl('p', { text: 'Light uses dark spokes/borders for pale backgrounds. Dark uses light spokes/borders for dark canvases. Pick the one that keeps borders and spokes visible with your chosen background.', cls: 'rt-apr-size-desc' });
        new Setting(themeSection)
            .setName('Theme')
            .setDesc('Choose stroke/border contrast')
            .addDropdown(drop => {
                drop.addOption('dark', 'Dark (light strokes)');
                drop.addOption('light', 'Light (dark strokes)');
                drop.setValue(this.aprTheme);
                drop.onChange(async (val) => {
                    this.aprTheme = (val as 'dark' | 'light') || 'dark';
                    await this.saveRevealOptions();
                    await this.renderPreview();
                });
            });

        // Preview Panel (moved up for prominence)
        const previewSection = contentEl.createDiv({ cls: 'rt-glass-card rt-apr-preview-section' });
        previewSection.createEl('h4', { text: 'Live Preview', cls: 'rt-section-title' });
        this.previewContainer = previewSection.createDiv({ cls: 'rt-apr-preview-area' });
        this.previewContainer.createDiv({ text: 'Loading preview...', cls: 'rt-apr-loading' });

        // Actions Section with Tabs
        const actionsSection = contentEl.createDiv({ cls: 'rt-glass-card rt-apr-actions-section' });
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
        const footer = contentEl.createDiv({ cls: 'rt-modal-actions' });
        new ButtonComponent(footer)
            .setButtonText('Close')
            .onClick(() => this.close());

        await this.loadData();
        await this.renderPreview(false);
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

    private createSizeButton(container: HTMLElement, size: 'compact' | 'standard' | 'large', label: string) {
        const btn = container.createEl('button', { cls: 'rt-apr-size-btn' });
        btn.setText(label);
        const applyActive = () => {
            const buttons = container.querySelectorAll('.rt-apr-size-btn');
            buttons?.forEach(b => b.removeClass('rt-active'));
            btn.addClass('rt-active');
        };
        if (this.aprSize === size) {
            btn.addClass('rt-active');
        }
        btn.onclick = async () => {
            this.aprSize = size;
            applyActive();
            this.updateSizeInfo();
            await this.saveRevealOptions();
            await this.renderPreview();
        };
    }

    private updateSizeInfo() {
        if (!this.sizeInfoEl) return;
        const map: Record<string, string> = {
            compact: 'Small · 600x600 @1x · ideal for X/Bluesky single-image posts',
            standard: 'Medium · 800x800 @1x · great for Patreon/blog cards with crisp text',
            large: 'Large · 1000x1000 @1x · best for site embeds or higher DPI exports'
        };
        this.sizeInfoEl.setText(map[this.aprSize] || '');
    }

    private async loadData() {
        this.cachedScenes = await getAllScenes(this.app, this.plugin);
        this.progressPercent = this.service.calculateProgress(this.cachedScenes);
    }

    private async renderPreview(refreshScenes = true) {
        if (!this.previewContainer) return;
        this.previewContainer.empty();

        if (refreshScenes) {
            await this.loadData();
        }

        if (this.cachedScenes.length === 0) {
            this.previewContainer.createDiv({ text: 'No scenes found. Create scenes to see a preview.', cls: 'rt-apr-empty' });
            return;
        }

        const settings = this.plugin.settings.authorProgress;

        try {
            const { svgString } = createAprSVG(this.cachedScenes, {
                size: this.aprSize,
                progressPercent: this.progressPercent,
                bookTitle: settings?.bookTitle || 'Working Title',
                authorName: settings?.authorName || '',
                authorUrl: settings?.authorUrl || '',
                showSubplots: this.showSubplots,
                showActs: this.showActs,
                showStatusColors: this.showStatus,
                showProgressPercent: this.showPercent,
                stageColors: (this.plugin.settings as any).publishStageColors,
                actCount: this.plugin.settings.actCount || undefined,
                backgroundColor: this.aprBackgroundColor,
                transparentCenter: this.aprCenterTransparent,
                bookAuthorColor: this.aprBookAuthorColor,
                engineColor: this.aprEngineColor,
                theme: this.aprTheme
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
                showProgressPercent: true,
                aprSize: 'standard',
                aprBackgroundColor: '#0d0d0f',
                aprCenterTransparent: false,
                aprBookAuthorColor: this.plugin.settings.publishStageColors?.Press ?? '#6FB971',
                aprEngineColor: '#e5e5e5',
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
        this.plugin.settings.authorProgress.aprSize = this.aprSize;
        this.plugin.settings.authorProgress.aprBackgroundColor = this.aprBackgroundColor;
        this.plugin.settings.authorProgress.aprCenterTransparent = this.aprCenterTransparent;
        this.plugin.settings.authorProgress.aprBookAuthorColor = this.aprBookAuthorColor;
        this.plugin.settings.authorProgress.aprEngineColor = this.aprEngineColor;
        this.plugin.settings.authorProgress.aprTheme = this.aprTheme;
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
