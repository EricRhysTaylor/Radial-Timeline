import { App, Modal, Setting, ButtonComponent, Notice, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { AuthorProgressPublishTarget } from '../types/settings';
import { getKickstarterEmbed, getPatreonEmbed } from '../renderer/utils/AuthorProgressUtils';
import { createAprSVG } from '../renderer/apr/AprRenderer';
import { getAllScenes } from '../utils/manuscript';
import { TimelineItem } from '../types/timeline';
import { AuthorProgressService } from '../services/AuthorProgressService';
import type { AprCampaign } from '../types/settings';
import { getTeaserThresholds, getTeaserRevealLevel, teaserLevelToRevealOptions, TEASER_LEVEL_INFO } from '../renderer/apr/AprConstants';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';

export class AuthorProgressModal extends Modal {
    private plugin: RadialTimelinePlugin;
    private service: AuthorProgressService;
    private publishTarget: AuthorProgressPublishTarget;

    // Reveal options (checkbox states)
    private showSubplots: boolean;
    private showActs: boolean;
    private showStatus: boolean;
    private showPercent: boolean;
    private aprSize: 'thumb' | 'small' | 'medium' | 'large';
    private selectedTargetId: 'default' | string = 'default';

    private alertContainer: HTMLElement | null = null;
    private revealSectionEl: HTMLElement | null = null;
    private sizeSectionEl: HTMLElement | null = null;
    private actionsContentEl: HTMLElement | null = null;
    private activePublishTab: 'snapshot' | 'dynamic' = 'snapshot';

    private previewContainers: Map<'thumb' | 'small' | 'medium' | 'large', HTMLElement> = new Map();
    private previewCards: Map<'thumb' | 'small' | 'medium' | 'large', HTMLElement> = new Map();

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

    private getSelectedCampaign(): AprCampaign | undefined {
        if (this.selectedTargetId === 'default') return undefined;
        return this.plugin.settings.authorProgress?.campaigns?.find(c => c.id === this.selectedTargetId);
    }

    private isCampaignTarget(): boolean {
        return this.selectedTargetId !== 'default';
    }

    private getActiveAprSize(): 'thumb' | 'small' | 'medium' | 'large' {
        return this.getSelectedCampaign()?.aprSize ?? this.aprSize;
    }

    async onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        // Apply shell styling and sizing
        if (modalEl) {
            modalEl.classList.add('ert-modal-shell', 'rt-apr-modal', 'ert-ui', 'ert-modal--social');
            modalEl.style.width = '720px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw';
        }

        // Standard modal container with glassy styling
        contentEl.addClass('ert-modal-container', 'rt-apr-content');

        // Modal Header with Badge (following modal template pattern)
        const header = contentEl.createDiv({ cls: 'ert-modal-header' });

        // Badge with Radio icon for social media theme
        const badge = header.createSpan({ cls: 'ert-modal-badge rt-apr-badge' });
        const badgeIcon = badge.createSpan({ cls: 'ert-modal-badge-icon' });
        setIcon(badgeIcon, 'radio');
        badge.createSpan({ text: 'Share' });

        header.createDiv({ text: 'Author progress report', cls: 'ert-modal-title' });
        header.createDiv({ text: 'Public, spoiler-safe progress view for fans and backers', cls: 'ert-modal-subtitle' });

        // Target selection + dynamic sections
        const campaigns = this.plugin.settings.authorProgress?.campaigns || [];
        const isProActive = isProfessionalActive(this.plugin);

        // Ensure valid target selection
        if (isProActive && campaigns.length > 0) {
            const campaignIds = new Set(campaigns.map(c => c.id));
            if (this.selectedTargetId !== 'default' && !campaignIds.has(this.selectedTargetId)) {
                this.selectedTargetId = 'default';
            }
        } else {
            this.selectedTargetId = 'default';
        }

        // Render sections
        this.alertContainer = contentEl.createDiv({ cls: 'rt-apr-refresh-alert-container' });
        this.revealSectionEl = contentEl.createDiv({ cls: 'rt-apr-reveal-section' });
        this.sizeSectionEl = contentEl.createDiv({ cls: 'rt-glass-card rt-apr-size-section' });

        this.renderRefreshAlert();
        this.renderRevealSection();
        this.renderSizeSection();

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
        this.actionsContentEl = actionsContent;
        this.activePublishTab = 'snapshot';

        this.renderPublishActions();

        snapshotTab.onclick = () => {
            snapshotTab.addClass('rt-active');
            dynamicTab.removeClass('rt-active');
            this.activePublishTab = 'snapshot';
            this.renderPublishActions();
        };

        dynamicTab.onclick = () => {
            dynamicTab.addClass('rt-active');
            snapshotTab.removeClass('rt-active');
            this.activePublishTab = 'dynamic';
            this.renderPublishActions();
        };

        // Target Selector at bottom of Publish container (Pro only)
        if (isProActive && campaigns.length > 0) {
            const targetContainer = actionsSection.createDiv({ cls: 'rt-apr-target-container' });
            // Add spacing/divider
            targetContainer.style.marginTop = '16px';
            targetContainer.style.paddingTop = '16px';
            targetContainer.style.borderTop = '1px solid var(--background-modifier-border)';

            const targetSetting = new Setting(targetContainer)
                .setName('Publish Target')
                .setDesc('Choose user group');

            // Add 'Pro' styling to the dropdown field
            targetSetting.controlEl.addClass('rt-apr-pro-target');

            targetSetting.addDropdown(dropdown => {
                dropdown.addOption('default', 'Default Report');
                campaigns.forEach(campaign => {
                    dropdown.addOption(campaign.id, `Campaign: ${campaign.name}`);
                });
                dropdown.setValue(this.selectedTargetId);
                dropdown.onChange(async (val) => {
                    this.selectedTargetId = val === 'default' ? 'default' : val;
                    this.renderRefreshAlert();
                    this.renderRevealSection();
                    this.renderSizeSection();
                    this.renderPublishActions();
                    await this.renderPreview(false);
                });
            });
        }

        // Footer actions
        const footer = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(footer)
            .setButtonText('Close')
            .onClick(() => this.close());

        await this.loadData();
        this.renderRevealSection();
        this.renderRefreshAlert();
        await this.renderPreview(false);
    }

    private renderSnapshotActions(container: HTMLElement) {
        container.empty();
        const campaign = this.getSelectedCampaign();
        const desc = campaign
            ? `Generate a one-time snapshot for "${campaign.name}". Saves to your Output folder.`
            : 'Generate a one-time image to share immediately. Saves to your Output folder.';
        container.createEl('p', { text: desc, cls: 'rt-apr-tab-desc' });

        const btnRow = container.createDiv({ cls: 'rt-row' });
        new ButtonComponent(btnRow)
            .setButtonText('Save Snapshot')
            .setCta()
            .onClick(() => this.publish('static'));
    }

    private renderDynamicActions(container: HTMLElement) {
        container.empty();
        const campaign = this.getSelectedCampaign();
        const desc = campaign
            ? `Update the live embed file for "${campaign.name}".`
            : 'Update the persistent file for your hosted embed. Use with GitHub Pages or similar.';
        container.createEl('p', { text: desc, cls: 'rt-apr-tab-desc' });

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
        size: 'thumb' | 'small' | 'medium' | 'large',
        label: string,
        dimension: string,
        useCase: string,
        options?: { locked?: boolean }
    ) {
        const isLocked = options?.locked ?? false;
        const card = container.createDiv({ cls: 'rt-apr-preview-card' });
        if (isLocked) {
            card.addClass('is-locked');
        }
        if (this.getActiveAprSize() === size) {
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
        const dims = labelArea.createEl('span', { cls: 'rt-apr-preview-dims' });
        dims.append(document.createTextNode(dimension));
        dims.createEl('sup', { text: '2' });
        labelArea.createEl('span', { text: useCase, cls: 'rt-apr-preview-usecase' });

        // Click to select
        if (!isLocked) {
            card.onclick = async () => {
                this.aprSize = size;
                this.updateCardSelection();
                await this.saveRevealOptions();
            };
        }
    }

    private updateCardSelection() {
        const activeSize = this.getActiveAprSize();
        this.previewCards.forEach((card, size) => {
            if (size === activeSize) {
                card.addClass('rt-active');
            } else {
                card.removeClass('rt-active');
            }
        });
    }

    private renderTargetSections(): void {
        this.renderRefreshAlert();
        this.renderRevealSection();
        this.renderSizeSection();
    }

    private renderRefreshAlert(): void {
        if (!this.alertContainer) return;
        this.alertContainer.empty();

        if (this.isCampaignTarget()) {
            const campaign = this.getSelectedCampaign();
            if (!campaign) return;
            if (!this.service.campaignNeedsRefresh(campaign)) return;
            const daysSince = campaign.lastPublishedDate
                ? Math.floor((Date.now() - new Date(campaign.lastPublishedDate).getTime()) / (1000 * 60 * 60 * 24))
                : 'many';
            const alert = this.alertContainer.createDiv({ cls: 'rt-apr-refresh-alert rt-glass-card' });
            const alertIcon = alert.createSpan({ cls: 'rt-apr-refresh-icon' });
            setIcon(alertIcon, 'alert-triangle');
            alert.createEl('span', { text: `Campaign "${campaign.name}" is ${daysSince} days old. Time to refresh!` });
            return;
        }

        if (!this.service.isStale()) return;
        const daysSince = this.plugin.settings.authorProgress?.lastPublishedDate
            ? Math.floor((Date.now() - new Date(this.plugin.settings.authorProgress.lastPublishedDate).getTime()) / (1000 * 60 * 60 * 24))
            : 'many';
        const alert = this.alertContainer.createDiv({ cls: 'rt-apr-refresh-alert rt-glass-card' });
        const alertIcon = alert.createSpan({ cls: 'rt-apr-refresh-icon' });
        setIcon(alertIcon, 'alert-triangle');
        alert.createEl('span', { text: `Your report is ${daysSince} days old. Time to refresh!` });
    }

    private renderRevealSection(): void {
        if (!this.revealSectionEl) return;
        this.revealSectionEl.empty();

        if (this.isCampaignTarget()) {
            const campaign = this.getSelectedCampaign();
            if (!campaign) return;

            this.revealSectionEl.createEl('h4', { text: 'What to Reveal', cls: 'rt-apr-reveal-title' });

            if (campaign.teaserReveal?.enabled) {
                const preset = campaign.teaserReveal.preset ?? 'standard';
                const thresholds = getTeaserThresholds(preset, campaign.teaserReveal.customThresholds);
                const level = getTeaserRevealLevel(
                    this.progressPercent,
                    thresholds,
                    campaign.teaserReveal.disabledStages
                );
                const levelLabel = TEASER_LEVEL_INFO[level]?.label ?? 'Teaser';
                this.revealSectionEl.createEl('p', {
                    text: `Teaser Reveal: ${preset} (${thresholds.scenes}/${thresholds.colors}/${thresholds.full}%). Current: ${levelLabel}.`,
                    cls: 'rt-apr-reveal-desc'
                });
            } else {
                const revealSummary = [
                    `Subplots ${campaign.showSubplots ? 'On' : 'Off'}`,
                    // Acts always shown
                    `Status Colors ${campaign.showStatus ? 'On' : 'Off'}`
                ].join(' · ');
                this.revealSectionEl.createEl('p', {
                    text: `Reveal: ${revealSummary}.`,
                    cls: 'rt-apr-reveal-desc'
                });
            }

            this.revealSectionEl.createEl('p', {
                text: `% Complete: ${campaign.showProgressPercent ? 'On' : 'Off'}. Edit in Campaign Manager.`,
                cls: 'rt-apr-reveal-desc'
            });
            return;
        }

        const settings = this.plugin.settings.authorProgress;
        this.showSubplots = settings?.showSubplots ?? true;
        this.showActs = settings?.showActs ?? true;
        this.showStatus = settings?.showStatus ?? true;
        this.showPercent = settings?.showProgressPercent ?? true;

        this.revealSectionEl.createEl('h4', { text: 'What to Reveal', cls: 'rt-apr-reveal-title' });
        this.revealSectionEl.createEl('p', {
            text: 'Control how much of your story structure is visible to fans. Uncheck all for a simple progress ring showing how far scenes have advanced through your publishing stages (Zero → Press).',
            cls: 'rt-apr-reveal-desc'
        });

        const checkboxGrid = this.revealSectionEl.createDiv({ cls: 'rt-apr-checkbox-grid' });

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

        // Acts removed from UI (always on)
        /*
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
        */

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

        const percentItem = checkboxGrid.createDiv({ cls: 'rt-apr-checkbox-item rt-apr-highlight-check' });
        const percentInput = percentItem.createEl('input', { type: 'checkbox' });
        percentInput.id = 'apr-percent';
        percentInput.checked = this.showPercent;
        percentInput.onchange = async () => {
            this.showPercent = percentInput.checked;
            await this.saveRevealOptions();
            await this.renderPreview();
        };
        percentItem.createEl('label', { text: '% Complete', attr: { for: 'apr-percent' } });
    }

    private renderSizeSection(): void {
        if (!this.sizeSectionEl) return;
        this.sizeSectionEl.empty();
        this.previewContainers = new Map();
        this.previewCards = new Map();

        const isCampaign = this.isCampaignTarget();
        const campaign = this.getSelectedCampaign();
        const settings = this.plugin.settings.authorProgress;
        if (!isCampaign) {
            this.aprSize = settings?.aprSize ?? 'medium';
        }

        this.sizeSectionEl.createEl('h4', { text: 'Choose Export Size', cls: 'rt-section-title' });
        const descText = isCampaign
            ? `Campaign size is set in Campaign Manager (${campaign?.aprSize ?? 'medium'}).`
            : 'Click a preview to select. SVG exports are resolution-independent and look crisp on any screen.';
        this.sizeSectionEl.createEl('p', { text: descText, cls: 'rt-apr-size-desc' });

        const previewRow = this.sizeSectionEl.createDiv({ cls: 'rt-apr-preview-row' });
        const locked = isCampaign;
        this.createPreviewCard(previewRow, 'thumb', 'Thumb', '100', 'Teaser ring', { locked });
        this.createPreviewCard(previewRow, 'small', 'Small', '150', 'Widgets, sidebars', { locked });
        this.createPreviewCard(previewRow, 'medium', 'Medium', '300', 'Social posts, newsletters', { locked });
        this.createPreviewCard(previewRow, 'large', 'Large', '450', 'Website embeds', { locked });

        const infoNote = this.sizeSectionEl.createDiv({ cls: 'rt-apr-density-note' });
        setIcon(infoNote.createSpan({ cls: 'rt-apr-density-icon' }), 'info');
        infoNote.createSpan({
            text: 'Tip: If your platform rasterizes SVG to PNG (Twitter does this), use Large for best quality on Retina/high-DPI screens.'
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
        const campaign = this.getSelectedCampaign();
        const isCampaign = !!campaign;
        const sizes: Array<'thumb' | 'small' | 'medium' | 'large'> = ['thumb', 'small', 'medium', 'large'];

        let showScenes = true;
        let showSubplots = this.showSubplots;
        let showActs = this.showActs;
        let showStatusColors = this.showStatus;
        let showStageColors = true;
        let grayCompletedScenes = false;
        let showProgressPercent = this.showPercent;
        let isTeaserBar = false;

        if (isCampaign && campaign) {
            showSubplots = campaign.showSubplots;
            showActs = campaign.showActs;
            showStatusColors = campaign.showStatus;
            showProgressPercent = campaign.showProgressPercent;

            if (campaign.teaserReveal?.enabled) {
                const preset = campaign.teaserReveal.preset ?? 'standard';
                const thresholds = getTeaserThresholds(preset, campaign.teaserReveal.customThresholds);
                const revealLevel = getTeaserRevealLevel(
                    this.progressPercent,
                    thresholds,
                    campaign.teaserReveal.disabledStages
                );
                const revealOptions = teaserLevelToRevealOptions(revealLevel);
                isTeaserBar = revealLevel === 'bar';
                showScenes = revealOptions.showScenes;
                showSubplots = revealOptions.showSubplots;
                showActs = revealOptions.showActs;
                showStatusColors = revealOptions.showStatusColors;
                showStageColors = revealOptions.showStageColors;
                grayCompletedScenes = revealOptions.grayCompletedScenes;
            }
        }

        for (const size of sizes) {
            const container = this.previewContainers.get(size);
            if (!container) continue;
            container.empty();

            if (this.cachedScenes.length === 0) {
                container.createDiv({ text: 'No scenes', cls: 'rt-apr-empty' });
                continue;
            }

            try {
                const ringOnly = isTeaserBar || size === 'thumb';
                const displayPercent = ringOnly && this.progressPercent <= 0 ? 5 : this.progressPercent;
                const { svgString } = createAprSVG(this.cachedScenes, {
                    size,
                    progressPercent: displayPercent,
                    bookTitle: settings?.bookTitle || 'Working Title',
                    authorName: settings?.authorName || '',
                    authorUrl: settings?.authorUrl || '',
                    showScenes: ringOnly ? false : showScenes,
                    showSubplots,
                    showActs,
                    showStatusColors,
                    showStageColors,
                    grayCompletedScenes,
                    showProgressPercent: ringOnly ? false : showProgressPercent,
                    showBranding: !ringOnly,
                    centerMark: size === 'thumb' ? 'plus' : 'none',
                    stageColors: (this.plugin.settings as any).publishStageColors,
                    actCount: this.plugin.settings.actCount || undefined,
                    backgroundColor: campaign?.customBackgroundColor ?? settings?.aprBackgroundColor ?? '#0d0d0f',
                    transparentCenter: campaign?.customTransparent ?? settings?.aprCenterTransparent ?? true,
                    bookAuthorColor: settings?.aprBookAuthorColor ?? this.plugin.settings.publishStageColors?.Press ?? '#6FB971',
                    authorColor: settings?.aprAuthorColor ?? settings?.aprBookAuthorColor ?? this.plugin.settings.publishStageColors?.Press ?? '#6FB971',
                    engineColor: settings?.aprEngineColor ?? '#e5e5e5',
                    percentNumberColor: settings?.aprPercentNumberColor ?? settings?.aprBookAuthorColor ?? this.plugin.settings.publishStageColors?.Press ?? '#6FB971',
                    percentSymbolColor: settings?.aprPercentSymbolColor ?? settings?.aprBookAuthorColor ?? this.plugin.settings.publishStageColors?.Press ?? '#6FB971',
                    theme: campaign?.customTheme ?? settings?.aprTheme ?? 'dark',
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

    private renderPublishActions(): void {
        if (!this.actionsContentEl) return;
        if (this.activePublishTab === 'dynamic') {
            this.renderDynamicActions(this.actionsContentEl);
        } else {
            this.renderSnapshotActions(this.actionsContentEl);
        }
    }

    private async saveRevealOptions() {
        if (this.isCampaignTarget()) return;
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
        if (this.isCampaignTarget()) {
            const campaign = this.getSelectedCampaign();
            if (!campaign) {
                new Notice('Campaign not found.');
                return;
            }
            if (mode === 'dynamic') {
                const result = await this.service.generateCampaignReport(campaign.id);
                if (result) {
                    new Notice(`Campaign "${campaign.name}" updated!`);
                } else {
                    new Notice('Failed to publish campaign.');
                }
                return;
            }
            const result = await this.service.generateCampaignSnapshot(campaign.id);
            if (result) {
                new Notice(`Snapshot saved to ${result}`);
            } else {
                new Notice('Failed to create campaign snapshot.');
            }
            return;
        }

        const result = await this.service.generateReport(mode);
        if (result) {
            new Notice(mode === 'dynamic' ? 'Live file updated!' : `Snapshot saved to ${result}`);
        } else {
            new Notice('Failed to generate report.');
        }
    }

    private copyEmbed(type: 'kickstarter' | 'patreon') {
        const campaign = this.getSelectedCampaign();
        const embedPath = campaign?.embedPath || this.plugin.settings.authorProgress?.dynamicEmbedPath || 'progress.svg';
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
