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
    private aprSize: 'small' | 'medium' | 'large';
    
    private previewContainers: Map<'small' | 'medium' | 'large', HTMLElement> = new Map();
    private previewCards: Map<'small' | 'medium' | 'large', HTMLElement> = new Map();
    
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
        this.aprSize = settings.aprSize ?? 'medium';
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

        // Check if refresh reminder is needed (Manual mode only)
        if (this.service.isStale()) {
            const daysSince = this.plugin.settings.authorProgress?.lastPublishedDate 
                ? Math.floor((Date.now() - new Date(this.plugin.settings.authorProgress.lastPublishedDate).getTime()) / (1000 * 60 * 60 * 24))
                : 'many';
            const alert = contentEl.createDiv({ cls: 'rt-apr-refresh-alert rt-glass-card' });
            const alertIcon = alert.createSpan({ cls: 'rt-apr-refresh-icon' });
            setIcon(alertIcon, 'alert-triangle');
            alert.createEl('span', { text: `Your report is ${daysSince} days old. Time to refresh!` });
        }

        // Reveal Options (checkboxes in grid)
        const revealSection = contentEl.createDiv({ cls: 'rt-apr-reveal-section' });
        revealSection.createEl('h4', { text: 'What to Reveal', cls: 'rt-apr-reveal-title' });
        revealSection.createEl('p', { 
            text: 'Control how much of your story structure is visible to fans. Uncheck all for a simple progress ring showing how far scenes have advanced through your publishing stages (Zero → Press).', 
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

        // Size selector with side-by-side previews
        const sizeSection = contentEl.createDiv({ cls: 'rt-glass-card rt-apr-size-section' });
        sizeSection.createEl('h4', { text: 'Choose Export Size', cls: 'rt-section-title' });
        sizeSection.createEl('p', { 
            text: 'Click a preview to select. SVG exports are resolution-independent and look crisp on any screen.', 
            cls: 'rt-apr-size-desc' 
        });
        
        // Side-by-side preview row
        const previewRow = sizeSection.createDiv({ cls: 'rt-apr-preview-row' });
        
        // Create 3 preview cards
        this.createPreviewCard(previewRow, 'small', 'Small', '150×150', 'Widgets, sidebars');
        this.createPreviewCard(previewRow, 'medium', 'Medium', '300×300', 'Social posts, newsletters');
        this.createPreviewCard(previewRow, 'large', 'Large', '450×450', 'Website embeds');
        
        // Info note about pixel density
        const infoNote = sizeSection.createDiv({ cls: 'rt-apr-density-note' });
        setIcon(infoNote.createSpan({ cls: 'rt-apr-density-icon' }), 'info');
        infoNote.createSpan({ 
            text: 'Tip: If your platform rasterizes SVG to PNG (Twitter does this), use Large for best quality on Retina/high-DPI screens.' 
        });

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

    private createPreviewCard(
        container: HTMLElement, 
        size: 'small' | 'medium' | 'large', 
        label: string,
        dimensions: string,
        useCase: string
    ) {
        const card = container.createDiv({ cls: 'rt-apr-preview-card' });
        if (this.aprSize === size) {
            card.addClass('rt-active');
        }
        
        // Preview container (will hold SVG)
        const previewArea = card.createDiv({ cls: 'rt-apr-preview-thumb' });
        previewArea.createDiv({ cls: 'rt-apr-loading', text: '...' });
        this.previewContainers.set(size, previewArea);
        this.previewCards.set(size, card);
        
        // Label area
        const labelArea = card.createDiv({ cls: 'rt-apr-preview-label' });
        labelArea.createEl('strong', { text: label });
        labelArea.createEl('span', { text: dimensions, cls: 'rt-apr-preview-dims' });
        labelArea.createEl('span', { text: useCase, cls: 'rt-apr-preview-usecase' });
        
        // Click to select
        card.onclick = async () => {
            this.aprSize = size;
            this.updateCardSelection();
            await this.saveRevealOptions();
        };
    }

    private updateCardSelection() {
        this.previewCards.forEach((card, size) => {
            if (size === this.aprSize) {
                card.addClass('rt-active');
            } else {
                card.removeClass('rt-active');
            }
        });
    }

    private async loadData() {
        this.cachedScenes = await getAllScenes(this.app, this.plugin);
        this.progressPercent = this.service.calculateProgress(this.cachedScenes);
    }

    private async renderPreview(refreshScenes = true) {
        if (this.previewContainers.size === 0) return;

        if (refreshScenes) {
            await this.loadData();
        }

        const settings = this.plugin.settings.authorProgress;
        const sizes: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large'];

        for (const size of sizes) {
            const container = this.previewContainers.get(size);
            if (!container) continue;
            container.empty();

            if (this.cachedScenes.length === 0) {
                container.createDiv({ text: 'No scenes', cls: 'rt-apr-empty' });
                continue;
            }

        try {
                const { svgString } = createAprSVG(this.cachedScenes, {
                    size,
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
                    backgroundColor: settings?.aprBackgroundColor ?? '#0d0d0f',
                    transparentCenter: settings?.aprCenterTransparent ?? true,
                    bookAuthorColor: settings?.aprBookAuthorColor ?? this.plugin.settings.publishStageColors?.Press ?? '#6FB971',
                    authorColor: settings?.aprAuthorColor ?? settings?.aprBookAuthorColor ?? this.plugin.settings.publishStageColors?.Press ?? '#6FB971',
                    engineColor: settings?.aprEngineColor ?? '#e5e5e5',
                    percentNumberColor: settings?.aprPercentNumberColor ?? settings?.aprBookAuthorColor ?? this.plugin.settings.publishStageColors?.Press ?? '#6FB971',
                    percentSymbolColor: settings?.aprPercentSymbolColor ?? settings?.aprBookAuthorColor ?? this.plugin.settings.publishStageColors?.Press ?? '#6FB971',
                    theme: settings?.aprTheme ?? 'dark',
                    spokeColor: settings?.aprSpokeColorMode === 'custom' ? settings?.aprSpokeColor : undefined,
                    // Typography settings
                    bookTitleFontFamily: settings?.aprBookTitleFontFamily,
                    bookTitleFontWeight: settings?.aprBookTitleFontWeight,
                    bookTitleFontItalic: settings?.aprBookTitleFontItalic,
                    bookTitleFontSize: settings?.aprBookTitleFontSize,
                    authorNameFontFamily: settings?.aprAuthorNameFontFamily,
                    authorNameFontWeight: settings?.aprAuthorNameFontWeight,
                    authorNameFontItalic: settings?.aprAuthorNameFontItalic,
                    authorNameFontSize: settings?.aprAuthorNameFontSize,
                    percentNumberFontFamily: settings?.aprPercentNumberFontFamily,
                    percentNumberFontWeight: settings?.aprPercentNumberFontWeight,
                    percentNumberFontItalic: settings?.aprPercentNumberFontItalic,
                    percentNumberFontSize1Digit: settings?.aprPercentNumberFontSize1Digit,
                    percentNumberFontSize2Digit: settings?.aprPercentNumberFontSize2Digit,
                    percentNumberFontSize3Digit: settings?.aprPercentNumberFontSize3Digit,
                    percentSymbolFontFamily: settings?.aprPercentSymbolFontFamily,
                    percentSymbolFontWeight: settings?.aprPercentSymbolFontWeight,
                    percentSymbolFontItalic: settings?.aprPercentSymbolFontItalic,
                    rtBadgeFontFamily: settings?.aprRtBadgeFontFamily,
                    rtBadgeFontWeight: settings?.aprRtBadgeFontWeight,
                    rtBadgeFontItalic: settings?.aprRtBadgeFontItalic,
                    rtBadgeFontSize: settings?.aprRtBadgeFontSize
                });

                container.innerHTML = svgString; // SAFE: innerHTML used for SVG preview injection
        } catch (e) {
                container.createDiv({ text: 'Error', cls: 'rt-apr-error' });
                console.error(`APR Preview render error (${size}):`, e);
            }
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
                aprSize: 'medium',
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
