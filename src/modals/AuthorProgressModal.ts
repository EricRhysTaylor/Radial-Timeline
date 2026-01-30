import { App, Modal, Setting, ButtonComponent, Notice, setIcon, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getAllScenes } from '../utils/manuscript';
import { TimelineItem } from '../types/timeline';
import { AuthorProgressService } from '../services/AuthorProgressService';
import type { AprCampaign } from '../types/settings';
import { getTeaserThresholds, getTeaserRevealLevel, TEASER_LEVEL_INFO } from '../renderer/apr/AprConstants';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';

export class AuthorProgressModal extends Modal {
    private plugin: RadialTimelinePlugin;
    private service: AuthorProgressService;

    // Reveal options (derived from settings)
    private aprSize: 'thumb' | 'small' | 'medium' | 'large';
    private selectedTargetId: 'default' | string = 'default';

    private statusSectionEl: HTMLElement | null = null;
    private campaignsSectionEl: HTMLElement | null = null;
    private actionsSectionEl: HTMLElement | null = null;
    private actionsBodyEl: HTMLElement | null = null;

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
        // Initialize size from settings
        this.aprSize = settings.aprSize ?? 'medium';
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
            modalEl.classList.add('ert-modal-shell', 'rt-apr-modal', 'ert-ui', 'ert-scope--modal', 'ert-modal--social');
            modalEl.style.width = '720px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw';
        }

        // Standard modal container with glassy styling
        contentEl.addClass('ert-modal-container', 'ert-stack', 'rt-apr-content');

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

        // Status (always shown)
        this.statusSectionEl = contentEl.createDiv({ cls: 'rt-glass-card rt-apr-status-card' });

        // Campaign status table (Pro users or existing campaigns)
        if (isProActive || campaigns.length > 0) {
            this.campaignsSectionEl = contentEl.createDiv({ cls: 'rt-glass-card rt-apr-campaigns-card' });
            if (!isProActive) {
                this.campaignsSectionEl.addClass('ert-pro-locked');
            }
        }

        // Actions (context-sensitive)
        const actionsSection = contentEl.createDiv({ cls: 'rt-glass-card rt-apr-actions-section' });
        actionsSection.createEl('h4', { text: 'Actions', cls: 'rt-section-title' });
        this.actionsSectionEl = actionsSection;

        if (isProActive && campaigns.length > 0) {
            const targetSetting = new Setting(actionsSection)
                .setName('Publish Target')
                .setDesc('Choose default report or a campaign');
            targetSetting.controlEl.addClass('rt-apr-pro-target');
            targetSetting.addDropdown(dropdown => {
                dropdown.addOption('default', 'Default Report');
                campaigns.forEach(campaign => {
                    dropdown.addOption(campaign.id, `Campaign: ${campaign.name}`);
                });
                dropdown.setValue(this.selectedTargetId);
                dropdown.onChange(val => {
                    this.selectedTargetId = val === 'default' ? 'default' : val;
                    this.renderStatusSection();
                    this.renderActions();
                });
            });
        }

        this.actionsBodyEl = actionsSection.createDiv({ cls: 'rt-apr-actions-body' });

        // Footer actions
        const footer = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(footer)
            .setButtonText('Close')
            .onClick(() => this.close());

        await this.loadData();
        this.renderStatusSection();
        this.renderCampaignStatusSection();
        this.renderActions();
    }

    private async loadData() {
        this.cachedScenes = await getAllScenes(this.app, this.plugin);
        this.progressPercent = this.service.calculateProgress(this.cachedScenes);
    }

    private renderStatusSection(): void {
        if (!this.statusSectionEl) return;
        this.statusSectionEl.empty();

        const settings = this.plugin.settings.authorProgress;
        const campaign = this.getSelectedCampaign();
        const isCampaign = this.isCampaignTarget();
        if (!isCampaign && settings?.aprSize) {
            this.aprSize = settings.aprSize;
        }
        const sizeMeta = this.getSizeMeta(this.getActiveAprSize());
        const targetPath = this.getEffectiveTargetPath();
        const teaserStatus = this.resolveTeaserStatus(campaign);

        const header = this.statusSectionEl.createDiv({ cls: 'rt-apr-status-header' });
        header.createEl('h4', { text: 'Status: Sharing Output', cls: 'rt-section-title' });

        this.renderRefreshAlert(this.statusSectionEl);

        const grid = this.statusSectionEl.createDiv({ cls: 'rt-apr-status-grid' });

        const sizeRow = this.createStatusRow(grid, 'Export size');
        const sizePill = sizeRow.createSpan({ cls: 'rt-apr-status-pill rt-apr-status-pill--accent' });
        sizePill.createSpan({ text: `${sizeMeta.label} ${sizeMeta.dimension}` });
        sizePill.createEl('sup', { text: '2' });

        const stageInfo = teaserStatus.info ?? TEASER_LEVEL_INFO.full;
        const stageRow = this.createStatusRow(grid, 'Stage');
        const stagePill = stageRow.createSpan({ cls: 'rt-apr-status-pill' });
        const stageIcon = stagePill.createSpan({ cls: 'rt-apr-status-pill-icon' });
        setIcon(stageIcon, stageInfo.icon);
        stagePill.createSpan({ text: stageInfo.label });

        const targetRow = this.createStatusRow(grid, 'Target path');
        const targetValue = targetRow.createSpan({
            cls: 'rt-apr-status-value rt-apr-status-path',
            text: this.summarizePath(targetPath)
        });
        targetValue.setAttr('title', targetPath);

        if (campaign) {
            const teaserRow = this.createStatusRow(grid, 'Teaser reveal');
            const teaserEnabled = (campaign.teaserReveal?.enabled ?? true);
            const teaserPill = teaserRow.createSpan({
                cls: `rt-apr-status-pill ${teaserEnabled ? 'rt-apr-status-pill--on' : 'rt-apr-status-pill--off'}`
            });
            teaserPill.createSpan({ text: teaserEnabled ? 'On' : 'Off' });
        }

        const nextInfo = this.getNextUpdateInfo({
            frequency: isCampaign ? campaign?.updateFrequency : settings?.updateFrequency,
            lastPublishedDate: isCampaign ? campaign?.lastPublishedDate : settings?.lastPublishedDate,
            reminderDays: isCampaign ? campaign?.refreshThresholdDays : settings?.stalenessThresholdDays,
            remindersEnabled: isCampaign ? true : settings?.enableReminders
        });

        const nextRow = this.statusSectionEl.createDiv({ cls: 'rt-apr-next-update' });
        nextRow.createSpan({ text: 'Next update in:', cls: 'rt-apr-next-update-label' });
        nextRow.createSpan({ text: nextInfo.label, cls: 'rt-apr-next-update-value' });

        if (nextInfo.reminder) {
            this.statusSectionEl.createDiv({ text: nextInfo.reminder, cls: 'rt-apr-next-update-reminder' });
        }
    }

    private renderCampaignStatusSection(): void {
        if (!this.campaignsSectionEl) return;
        this.campaignsSectionEl.empty();

        const campaigns = this.plugin.settings.authorProgress?.campaigns || [];
        const header = this.campaignsSectionEl.createDiv({ cls: 'rt-apr-campaigns-header' });
        header.createEl('h4', { text: 'Campaigns', cls: 'rt-section-title' });

        if (campaigns.length === 0) {
            this.campaignsSectionEl.createDiv({
                text: 'No campaigns yet.',
                cls: 'rt-apr-campaigns-empty'
            });
            return;
        }

        const activeCampaigns = campaigns.filter(campaign => campaign.isActive);
        const pausedCampaigns = campaigns.filter(campaign => !campaign.isActive);

        const renderGroup = (label: string, group: AprCampaign[]) => {
            const groupEl = this.campaignsSectionEl!.createDiv({ cls: 'rt-apr-campaign-group' });
            groupEl.createDiv({ text: label, cls: 'rt-apr-campaign-group-title' });

            if (group.length === 0) {
                groupEl.createDiv({ text: 'None', cls: 'rt-apr-campaign-group-empty' });
                return;
            }

            const table = groupEl.createDiv({ cls: 'rt-apr-campaign-table' });
            const headerRow = table.createDiv({ cls: 'rt-apr-campaign-row rt-apr-campaign-row--header' });
            ['Campaign', 'Mode', 'Next update', 'Output', 'Last updated'].forEach(labelText => {
                headerRow.createDiv({ text: labelText, cls: 'rt-apr-campaign-cell' });
            });

            group.forEach(campaign => {
                const row = table.createDiv({ cls: 'rt-apr-campaign-row' });
                if (!campaign.isActive) row.addClass('is-paused');

                const nextInfo = this.getNextUpdateInfo({
                    frequency: campaign.updateFrequency,
                    lastPublishedDate: campaign.lastPublishedDate,
                    reminderDays: campaign.refreshThresholdDays,
                    remindersEnabled: true
                });
                const nextLabel = nextInfo.label.startsWith('Manual') ? 'Manual' : nextInfo.label;

                row.createDiv({ text: campaign.name, cls: 'rt-apr-campaign-cell' });
                row.createDiv({
                    text: this.formatFrequencyLabel(campaign.updateFrequency),
                    cls: 'rt-apr-campaign-cell rt-apr-campaign-cell--muted'
                });
                row.createDiv({ text: nextLabel, cls: 'rt-apr-campaign-cell' });
                row.createDiv({
                    text: this.summarizePath(campaign.embedPath),
                    cls: 'rt-apr-campaign-cell rt-apr-campaign-path',
                    attr: { title: campaign.embedPath }
                });
                row.createDiv({
                    text: campaign.lastPublishedDate ? new Date(campaign.lastPublishedDate).toLocaleDateString() : 'Never',
                    cls: 'rt-apr-campaign-cell rt-apr-campaign-cell--muted'
                });
            });
        };

        renderGroup('Active', activeCampaigns);
        renderGroup('Paused', pausedCampaigns);
    }

    private renderActions(): void {
        if (!this.actionsBodyEl) return;
        this.actionsBodyEl.empty();

        const campaigns = this.plugin.settings.authorProgress?.campaigns || [];
        const isProActive = isProfessionalActive(this.plugin);

        if (isProActive && this.selectedTargetId !== 'default') {
            this.renderProActions(this.actionsBodyEl, campaigns);
        } else {
            this.renderCoreActions(this.actionsBodyEl);
        }
    }

    private renderCoreActions(container: HTMLElement): void {
        const settings = this.plugin.settings.authorProgress;
        this.aprSize = settings?.aprSize ?? this.aprSize ?? 'medium';
        const sizeRow = container.createDiv({ cls: 'rt-apr-action-row' });
        sizeRow.createSpan({ text: 'Export size', cls: 'rt-apr-action-label' });
        const sizeControls = sizeRow.createDiv({ cls: 'rt-apr-size-selector' });

        const sizeOptions: Array<{ size: 'thumb' | 'small' | 'medium' | 'large'; label: string; dimension: string }> = [
            { size: 'thumb', label: 'Thumb', dimension: '100' },
            { size: 'small', label: 'Small', dimension: '150' },
            { size: 'medium', label: 'Medium', dimension: '300' },
            { size: 'large', label: 'Large', dimension: '450' }
        ];

        sizeOptions.forEach(option => {
            const btn = sizeControls.createEl('button', {
                cls: `rt-apr-size-btn ${option.size === this.getActiveAprSize() ? 'rt-active' : ''}`
            });
            btn.createSpan({ text: option.label });
            const dims = btn.createSpan({ cls: 'rt-apr-size-dim' });
            dims.append(document.createTextNode(option.dimension));
            dims.createEl('sup', { text: '2' });
            btn.onclick = async () => {
                this.aprSize = option.size;
                await this.saveSize();
                this.renderStatusSection();
                this.renderActions();
            };
        });

        const stageRow = container.createDiv({ cls: 'rt-apr-action-row' });
        stageRow.createSpan({ text: 'Stage', cls: 'rt-apr-action-label' });
        const stageInfo = this.resolveTeaserStatus(this.getSelectedCampaign());
        const stageFallback = TEASER_LEVEL_INFO.full;
        const stageDisplay = stageInfo.info ?? stageFallback;
        const stagePill = stageRow.createSpan({ cls: 'rt-apr-status-pill' });
        const stageIcon = stagePill.createSpan({ cls: 'rt-apr-status-pill-icon' });
        setIcon(stageIcon, stageDisplay.icon);
        stagePill.createSpan({ text: stageDisplay.label });

        const pathSetting = new Setting(container)
            .setName('Output path')
            .setDesc('Location for the live embed file.');
        pathSetting.settingEl.addClass('rt-apr-action-setting');

        pathSetting.addText(text => {
            const defaultPath = 'Radial Timeline/Social/progress.svg';
            const currentPath = settings?.dynamicEmbedPath || defaultPath;
            const errorClass = 'rt-apr-input--error';
            const successClass = 'rt-apr-input--success';
            const clearState = () => {
                text.inputEl.removeClass(errorClass);
                text.inputEl.removeClass(successClass);
            };

            text.setPlaceholder(defaultPath);
            text.setValue(currentPath);
            text.inputEl.addClass('rt-apr-path-input');

            const savePath = async () => {
                const val = text.getValue().trim();
                clearState();
                if (!val || !val.toLowerCase().endsWith('.svg')) {
                    text.inputEl.addClass(errorClass);
                    return;
                }
                if (!this.plugin.settings.authorProgress) return;
                this.plugin.settings.authorProgress.dynamicEmbedPath = normalizePath(val);
                await this.plugin.saveSettings();
                text.inputEl.addClass(successClass);
                window.setTimeout(() => text.inputEl.removeClass(successClass), 900);
            };

            text.inputEl.addEventListener('blur', () => { void savePath(); });
            text.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });
        });

        const actionRow = container.createDiv({ cls: 'rt-apr-action-row rt-apr-action-row--primary' });
        const primaryButton = new ButtonComponent(actionRow)
            .setButtonText('Publish')
            .setCta();
        primaryButton.onClick(() => this.publish('dynamic'));
    }

    private renderProActions(container: HTMLElement, campaigns: AprCampaign[]): void {
        const campaign = this.getSelectedCampaign() ?? campaigns.find(c => c.id === this.selectedTargetId);
        if (!campaign) {
            container.createDiv({ text: 'Select a campaign to publish.', cls: 'rt-apr-actions-empty' });
            return;
        }

        const modeRow = container.createDiv({ cls: 'rt-apr-action-row' });
        modeRow.createSpan({ text: 'Update mode', cls: 'rt-apr-action-label' });
        modeRow.createSpan({
            text: this.formatFrequencyLabel(campaign.updateFrequency),
            cls: 'rt-apr-action-value'
        });

        if ((campaign.updateFrequency ?? 'manual') === 'manual') {
            const reminderRow = container.createDiv({ cls: 'rt-apr-action-row' });
            reminderRow.createSpan({ text: 'Reminder', cls: 'rt-apr-action-label' });
            reminderRow.createSpan({
                text: campaign.refreshThresholdDays ? `${campaign.refreshThresholdDays} days` : 'Not set',
                cls: 'rt-apr-action-value'
            });
        }

        const actionRow = container.createDiv({ cls: 'rt-apr-action-row rt-apr-action-row--primary' });
        const primaryButton = new ButtonComponent(actionRow)
            .setButtonText('Publish Campaign')
            .setCta();
        primaryButton.onClick(() => this.publish('dynamic'));
    }

    private renderRefreshAlert(container: HTMLElement): void {
        if (this.isCampaignTarget()) {
            const campaign = this.getSelectedCampaign();
            if (!campaign) return;
            if (!this.service.campaignNeedsRefresh(campaign)) return;
            const daysSince = this.getDaysSince(campaign.lastPublishedDate);
            const ageLabel = daysSince === null ? 'many' : `${daysSince}`;
            const alert = container.createDiv({ cls: 'rt-apr-refresh-alert' });
            const alertIcon = alert.createSpan({ cls: 'rt-apr-refresh-icon' });
            setIcon(alertIcon, 'alert-triangle');
            alert.createEl('span', { text: `Campaign "${campaign.name}" is ${ageLabel} days old. Time to refresh!` });
            return;
        }

        if (!this.service.isStale()) return;
        const daysSince = this.getDaysSince(this.plugin.settings.authorProgress?.lastPublishedDate);
        const ageLabel = daysSince === null ? 'many' : `${daysSince}`;
        const alert = container.createDiv({ cls: 'rt-apr-refresh-alert' });
        const alertIcon = alert.createSpan({ cls: 'rt-apr-refresh-icon' });
        setIcon(alertIcon, 'alert-triangle');
        alert.createEl('span', { text: `Your report is ${ageLabel} days old. Time to refresh!` });
    }

    private resolveTeaserStatus(campaign?: AprCampaign): { enabled: boolean; info?: { label: string; icon: string } } {
        if (!campaign) return { enabled: false };
        const teaserSettings = campaign.teaserReveal ?? { enabled: true, preset: 'standard' as const };
        if (!teaserSettings.enabled) return { enabled: false };
        const thresholds = getTeaserThresholds(teaserSettings.preset ?? 'standard', teaserSettings.customThresholds);
        const level = getTeaserRevealLevel(this.progressPercent, thresholds, teaserSettings.disabledStages);
        return { enabled: true, info: TEASER_LEVEL_INFO[level] };
    }

    private getEffectiveTargetPath(): string {
        const settings = this.plugin.settings.authorProgress;
        const campaign = this.getSelectedCampaign();
        if (campaign?.embedPath) return campaign.embedPath;
        return settings?.dynamicEmbedPath || 'Radial Timeline/Social/progress.svg';
    }

    private getSizeMeta(size: 'thumb' | 'small' | 'medium' | 'large'): { label: string; dimension: string } {
        switch (size) {
            case 'thumb': return { label: 'Thumb', dimension: '100' };
            case 'small': return { label: 'Small', dimension: '150' };
            case 'large': return { label: 'Large', dimension: '450' };
            default: return { label: 'Medium', dimension: '300' };
        }
    }

    private summarizePath(path: string, maxLength = 42): string {
        if (!path) return '—';
        if (path.length <= maxLength) return path;
        const parts = path.split('/');
        if (parts.length <= 2) return `…${path.slice(-maxLength + 1)}`;
        return `…/${parts.slice(-2).join('/')}`;
    }

    private formatFrequencyLabel(frequency?: 'manual' | 'daily' | 'weekly' | 'monthly'): string {
        if (!frequency || frequency === 'manual') return 'Manual';
        const label = frequency.charAt(0).toUpperCase() + frequency.slice(1);
        return `Auto · ${label}`;
    }

    private getDaysSince(date?: string): number | null {
        if (!date) return null;
        const time = new Date(date).getTime();
        if (!Number.isFinite(time)) return null;
        return Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24));
    }

    private formatDays(value: number): string {
        const safe = Math.max(0, Math.round(value));
        return safe === 1 ? '1 day' : `${safe} days`;
    }

    private getNextUpdateInfo(opts: {
        frequency?: 'manual' | 'daily' | 'weekly' | 'monthly';
        lastPublishedDate?: string;
        reminderDays?: number;
        remindersEnabled?: boolean;
    }): { label: string; reminder?: string } {
        const frequency = opts.frequency ?? 'manual';
        if (frequency === 'manual') {
            const reminderDays = opts.reminderDays ?? 0;
            const daysSince = this.getDaysSince(opts.lastPublishedDate) ?? 0;
            const reminder = (opts.remindersEnabled && reminderDays > 0)
                ? `Reminder in: ${this.formatDays(Math.max(0, reminderDays - daysSince))}`
                : undefined;
            return { label: 'Manual (no schedule)', reminder };
        }

        const intervalDays = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 30;
        const daysSince = this.getDaysSince(opts.lastPublishedDate);
        const remaining = daysSince === null ? 0 : Math.max(0, intervalDays - daysSince);
        return { label: this.formatDays(remaining) };
    }

    private createStatusRow(container: HTMLElement, label: string): HTMLElement {
        const row = container.createDiv({ cls: 'rt-apr-status-row' });
        row.createSpan({ text: label, cls: 'rt-apr-status-label' });
        return row;
    }

    private async saveSize() {
        if (this.isCampaignTarget()) return;
        if (!this.plugin.settings.authorProgress) {
            this.plugin.settings.authorProgress = {
                enabled: false,
                defaultNoteBehavior: 'preset',
                defaultPublishTarget: 'folder',
                // Legacy fields preserved for type compatibility
                showSubplots: true,
                showActs: true,
                showStatus: true,
                aprSize: 'medium',
                aprShowRtAttribution: true,
                bookTitle: '',
                authorUrl: '',
                updateFrequency: 'manual',
                stalenessThresholdDays: 30,
                enableReminders: true,
                dynamicEmbedPath: 'Radial Timeline/Social/progress.svg'
            };
        }
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

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
