import { App, Modal, Setting, ButtonComponent, Notice, TextComponent, setIcon, setTooltip, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getAllScenes } from '../utils/manuscript';
import { TimelineItem } from '../types/timeline';
import { AuthorProgressService } from '../services/AuthorProgressService';
import type { AprCampaign } from '../types/settings';
import { getTeaserThresholds, getTeaserRevealLevel, TEASER_LEVEL_INFO } from '../renderer/apr/AprConstants';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';
import { ERT_CLASSES } from '../ui/classes';
import { buildDefaultEmbedPath } from '../utils/aprPaths';

export class AuthorProgressModal extends Modal {
    private plugin: RadialTimelinePlugin;
    private service: AuthorProgressService;

    // Reveal options (derived from settings)
    private aprSize: 'thumb' | 'small' | 'medium' | 'large';
    private selectedTargetId: 'default' | string = 'default';

    private statusSectionEl: HTMLElement | null = null;
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
            dynamicEmbedPath: 'Radial Timeline/Social/book/apr-book-default-manual-medium.svg'
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
            modalEl.classList.add('ert-modal-shell', 'ert-ui', 'ert-scope--modal', 'ert-modal--social');
            modalEl.style.width = '720px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw';
        }

        // Standard modal container with glassy styling
        contentEl.addClass('ert-modal-container', 'ert-stack');

        // Modal Header with Badge (following modal template pattern)
        const header = contentEl.createDiv({ cls: 'ert-modal-header' });

        // Badge with Radio icon for social media theme
        const badge = header.createSpan({ cls: ERT_CLASSES.MODAL_BADGE });
        const badgeIcon = badge.createSpan({ cls: ERT_CLASSES.MODAL_BADGE_ICON });
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
        this.statusSectionEl = contentEl.createDiv({
            cls: `${ERT_CLASSES.PANEL} ert-panel--glass ${ERT_CLASSES.STACK}`
        });

        // Actions (context-sensitive)
        const actionsSection = contentEl.createDiv({
            cls: `${ERT_CLASSES.PANEL} ert-panel--glass ${ERT_CLASSES.STACK}`
        });
        const actionsHeader = actionsSection.createDiv({ cls: ERT_CLASSES.PANEL_HEADER });
        const actionsHeaderMain = actionsHeader.createDiv({ cls: ERT_CLASSES.CONTROL });
        const actionsTitleRow = actionsHeaderMain.createDiv({ cls: ERT_CLASSES.INLINE });
        const actionsIcon = actionsTitleRow.createSpan({ cls: ERT_CLASSES.SECTION_ICON });
        setIcon(actionsIcon, 'share-2');
        actionsTitleRow.createEl('h4', { text: 'Actions', cls: ERT_CLASSES.SECTION_TITLE });
        this.actionsSectionEl = actionsSection;

        if (isProActive && campaigns.length > 0) {
            const targetSetting = new Setting(actionsSection)
                .setName('Publish Target')
                .setDesc('Choose default report or a campaign');
            targetSetting.addDropdown(dropdown => {
                dropdown.addOption('default', 'Default Report');
                campaigns.forEach(campaign => {
                    dropdown.addOption(campaign.id, `Campaign: ${campaign.name}`);
                });
                dropdown.selectEl.addClass('ert-input--md');
                dropdown.setValue(this.selectedTargetId);
                dropdown.onChange(val => {
                    this.selectedTargetId = val === 'default' ? 'default' : val;
                    this.renderStatusSection();
                    this.renderActions();
                });
            });
        }

        this.actionsBodyEl = actionsSection.createDiv({ cls: `${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}` });

        // Footer actions
        const footer = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(footer)
            .setButtonText('Close')
            .onClick(() => this.close());

        await this.loadData();
        this.renderStatusSection();
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
        const isCampaign = this.isCampaignTarget();
        if (!isCampaign && settings?.aprSize) {
            this.aprSize = settings.aprSize;
        }

        const header = this.statusSectionEl.createDiv({ cls: ERT_CLASSES.PANEL_HEADER });
        const headerMain = header.createDiv({ cls: ERT_CLASSES.CONTROL });
        const headerRow = headerMain.createDiv({ cls: ERT_CLASSES.INLINE });
        const headerIcon = headerRow.createSpan({ cls: ERT_CLASSES.SECTION_ICON });
        setIcon(headerIcon, 'radio');
        headerRow.createEl('h4', { text: 'Status', cls: ERT_CLASSES.SECTION_TITLE });

        const headerActions = header.createDiv({ cls: ERT_CLASSES.SECTION_ACTIONS });
        const statusPill = headerActions.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM} ${ERT_CLASSES.BADGE_PILL_NEUTRAL}`
        });
        const statusIcon = statusPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(statusIcon, 'share-2');
        statusPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'Sharing output' });

        this.renderRefreshAlert(this.statusSectionEl);

        const statusGrid = this.statusSectionEl.createDiv({ cls: 'ert-apr-status-grid' });
        const statusHeaderRow = statusGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--header' });
        ['Item', 'Export', 'Stage', 'Update in', 'Reminder'].forEach(label => {
            statusHeaderRow.createDiv({ text: label, cls: 'ert-apr-status-cell ert-apr-status-cell--header' });
        });

        const statusTargets = this.getAprStatusTargets();
        statusTargets.forEach((target, index) => {
            const nameRow = statusGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--file' });
            const nameCell = nameRow.createDiv({
                cls: `ert-apr-status-file${target.campaign ? ' ert-apr-status-file--campaign' : ''}`
            });
            const nameContent = nameCell.createDiv({ cls: 'ert-apr-status-fileLabel' });
            nameContent.createSpan({ text: target.label });
            if (target.campaign) {
                const proPill = nameContent.createSpan({
                    cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM} ${ERT_CLASSES.BADGE_PILL_PRO}`
                });
                proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'Pro' });
            }
            if (target.path) {
                nameCell.setAttr('title', target.path);
            }

            const dataRow = statusGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--data' });
            dataRow.createDiv({
                text: String(index + 1),
                cls: `ert-apr-status-cell ert-apr-status-cell--item${target.campaign ? ' ert-apr-status-cell--campaign' : ''}`
            });

            const exportCell = dataRow.createDiv({
                cls: `ert-apr-status-cell${target.campaign ? ' ert-apr-status-cell--campaign' : ''}`
            });
            const exportPill = exportCell.createSpan({
                cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
            });
            const targetSize = this.getSizeMeta(target.size);
            exportPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: targetSize.dimension });
            exportPill.createEl('sup', { text: '2' });

            const stageCell = dataRow.createDiv({
                cls: `ert-apr-status-cell${target.campaign ? ' ert-apr-status-cell--campaign' : ''}`
            });
            const stagePill = stageCell.createSpan({
                cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
            });
            const stageIcon = stagePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
            const stageMeta = target.campaign
                ? this.getCampaignStageDisplay(target.campaign)
                : { label: TEASER_LEVEL_INFO.full.label.toUpperCase(), icon: TEASER_LEVEL_INFO.full.icon };
            setIcon(stageIcon, stageMeta.icon);
            stagePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: stageMeta.label });
            if (stageMeta.tooltip) {
                setTooltip(stagePill, stageMeta.tooltip);
            }

            const updateCell = dataRow.createDiv({
                cls: `ert-apr-status-cell${target.campaign ? ' ert-apr-status-cell--campaign' : ''}`
            });
            const updatePill = updateCell.createSpan({
                cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
            });
            const frequency = target.campaign ? target.campaign.updateFrequency : settings?.updateFrequency;
            const lastPublishedDate = target.campaign ? target.campaign.lastPublishedDate : settings?.lastPublishedDate;
            const isAuto = !!frequency && frequency !== 'manual';
            const updateInfo = target.campaign && !target.campaign.isActive
                ? { label: 'Paused', reminder: undefined }
                : (isAuto && !lastPublishedDate)
                    ? { label: 'Auto update due', reminder: undefined }
                    : this.getNextUpdateInfo({
                        frequency,
                        lastPublishedDate,
                        reminderDays: target.campaign ? target.campaign.refreshThresholdDays : settings?.stalenessThresholdDays,
                        remindersEnabled: target.campaign ? true : settings?.enableReminders
                    });
            updatePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: updateInfo.label });

            const reminderCell = dataRow.createDiv({
                cls: `ert-apr-status-cell ert-apr-status-cell--reminder${target.campaign ? ' ert-apr-status-cell--campaign' : ''}`
            });
            reminderCell.createSpan({
                cls: ERT_CLASSES.FIELD_NOTE,
                text: updateInfo.reminder ?? '—'
            });
        });
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
        const sizeRow = container.createDiv({
            cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_COMPACT} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}`
        });
        sizeRow.createSpan({ text: 'Export size', cls: ERT_CLASSES.LABEL });
        const sizeControls = sizeRow.createDiv({ cls: ERT_CLASSES.INLINE });

        const sizeOptions: Array<{ size: 'thumb' | 'small' | 'medium' | 'large'; label: string; dimension: string }> = [
            { size: 'thumb', label: 'Thumb', dimension: '100' },
            { size: 'small', label: 'Small', dimension: '150' },
            { size: 'medium', label: 'Medium', dimension: '300' },
            { size: 'large', label: 'Large', dimension: '450' }
        ];

        sizeOptions.forEach(option => {
            const isActive = option.size === this.getActiveAprSize();
            const btn = sizeControls.createEl('button', {
                cls: `${ERT_CLASSES.PILL_BTN} ${ERT_CLASSES.PILL_BTN_SOCIAL} ${isActive ? ERT_CLASSES.IS_ACTIVE : ''}`
            });
            const dims = btn.createSpan({ cls: ERT_CLASSES.PILL_BTN_LABEL });
            dims.append(document.createTextNode(option.dimension));
            dims.createEl('sup', { text: '2' });
            if (isActive) {
                btn.setAttr('aria-pressed', 'true');
            }
            btn.onclick = async () => {
                this.aprSize = option.size;
                await this.saveSize();
                this.renderStatusSection();
                this.renderActions();
            };
        });

        const stageRow = container.createDiv({
            cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_COMPACT} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}`
        });
        stageRow.createSpan({ text: 'Stage', cls: ERT_CLASSES.LABEL });
        const stageInfo = this.resolveTeaserStatus(this.getSelectedCampaign());
        const stageFallback = TEASER_LEVEL_INFO.full;
        const stageDisplay = stageInfo.info ?? stageFallback;
        const stageValue = stageRow.createDiv({ cls: ERT_CLASSES.INLINE });
        const stagePill = stageValue.createSpan({ cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}` });
        const stageIcon = stagePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(stageIcon, stageDisplay.icon);
        stagePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: stageDisplay.label });

        const pathRow = container.createDiv({
            cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_COMPACT} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}`
        });
        pathRow.createSpan({ text: 'Output path', cls: ERT_CLASSES.LABEL });
        const pathControl = pathRow.createDiv({ cls: ERT_CLASSES.CONTROL });
        const pathInput = new TextComponent(pathControl);
        const defaultPath = buildDefaultEmbedPath({
            bookTitle: settings?.bookTitle,
            updateFrequency: settings?.updateFrequency,
            aprSize: settings?.aprSize
        });
        const currentPath = settings?.dynamicEmbedPath || defaultPath;
        const clearState = () => {
            pathInput.inputEl.removeClass('ert-input--error');
            pathInput.inputEl.removeClass('ert-input--success');
        };
        pathInput.setPlaceholder(defaultPath);
        pathInput.setValue(currentPath);
        pathInput.inputEl.addClass('ert-input--full');

        const savePath = async () => {
            const val = pathInput.getValue().trim();
            clearState();
            if (!val || !val.toLowerCase().endsWith('.svg')) {
                pathInput.inputEl.addClass('ert-input--error');
                return;
            }
            if (!this.plugin.settings.authorProgress) return;
            this.plugin.settings.authorProgress.dynamicEmbedPath = normalizePath(val);
            await this.plugin.saveSettings();
            pathInput.inputEl.addClass('ert-input--success');
            window.setTimeout(() => pathInput.inputEl.removeClass('ert-input--success'), 900);
        };

        pathInput.inputEl.addEventListener('blur', () => { void savePath(); });
        pathInput.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                pathInput.inputEl.blur();
            }
        });

        const actionRow = container.createDiv({ cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}` });
        actionRow.createSpan({ text: '', cls: ERT_CLASSES.LABEL });
        const actionControl = actionRow.createDiv({ cls: ERT_CLASSES.CONTROL });
        const primaryButton = new ButtonComponent(actionControl)
            .setButtonText('Publish')
            .setCta();
        primaryButton.onClick(() => this.publish('dynamic'));
    }

    private renderProActions(container: HTMLElement, campaigns: AprCampaign[]): void {
        const campaign = this.getSelectedCampaign() ?? campaigns.find(c => c.id === this.selectedTargetId);
        if (!campaign) {
            container.createDiv({ text: 'Select a campaign to publish.', cls: ERT_CLASSES.FIELD_NOTE });
            return;
        }

        const sizeMeta = this.getSizeMeta(this.getActiveAprSize());
        const sizeRow = container.createDiv({
            cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_COMPACT} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}`
        });
        sizeRow.createSpan({ text: 'Export size', cls: ERT_CLASSES.LABEL });
        const sizeValue = sizeRow.createDiv({ cls: ERT_CLASSES.INLINE });
        const sizePill = sizeValue.createSpan({ cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}` });
        sizePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: sizeMeta.dimension });
        sizePill.createEl('sup', { text: '2' });

        const stageRow = container.createDiv({
            cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_COMPACT} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}`
        });
        stageRow.createSpan({ text: 'Stage', cls: ERT_CLASSES.LABEL });
        const stageValue = stageRow.createDiv({ cls: ERT_CLASSES.INLINE });
        const stageInfo = this.resolveTeaserStatus(campaign).info ?? TEASER_LEVEL_INFO.full;
        const stagePill = stageValue.createSpan({ cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}` });
        const stageIcon = stagePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(stageIcon, stageInfo.icon);
        stagePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: stageInfo.label });

        const pathRow = container.createDiv({
            cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_COMPACT} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}`
        });
        pathRow.createSpan({ text: 'Output path', cls: ERT_CLASSES.LABEL });
        const pathValue = pathRow.createDiv({ cls: ERT_CLASSES.INLINE });
        const pathText = pathValue.createSpan({
            cls: `${ERT_CLASSES.FIELD_NOTE} ert-mono ert-truncate`,
            text: this.summarizePath(campaign.embedPath)
        });
        pathText.setAttr('title', campaign.embedPath);

        const actionRow = container.createDiv({ cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}` });
        actionRow.createSpan({ text: '', cls: ERT_CLASSES.LABEL });
        const actionControl = actionRow.createDiv({ cls: ERT_CLASSES.CONTROL });
        const primaryButton = new ButtonComponent(actionControl)
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
            const alert = container.createDiv({ cls: ERT_CLASSES.INLINE });
            const alertIcon = alert.createSpan({ cls: ERT_CLASSES.ICON_BADGE });
            setIcon(alertIcon, 'alert-triangle');
            alert.createEl('span', {
                text: `Campaign "${campaign.name}" is ${ageLabel} days old. Time to refresh!`,
                cls: 'ert-section-desc ert-section-desc--alert'
            });
            return;
        }

        if (!this.service.isStale()) return;
        const daysSince = this.getDaysSince(this.plugin.settings.authorProgress?.lastPublishedDate);
        const ageLabel = daysSince === null ? 'many' : `${daysSince}`;
        const alert = container.createDiv({ cls: ERT_CLASSES.INLINE });
        const alertIcon = alert.createSpan({ cls: ERT_CLASSES.ICON_BADGE });
        setIcon(alertIcon, 'alert-triangle');
        alert.createEl('span', {
            text: `Your report is ${ageLabel} days old. Time to refresh!`,
            cls: 'ert-section-desc ert-section-desc--alert'
        });
    }

    private resolveTeaserStatus(campaign?: AprCampaign): { enabled: boolean; info?: { label: string; icon: string } } {
        if (!campaign) return { enabled: false };
        const teaserSettings = campaign.teaserReveal ?? { enabled: true, preset: 'standard' as const };
        if (!teaserSettings.enabled) return { enabled: false };
        const thresholds = getTeaserThresholds(teaserSettings.preset ?? 'standard', teaserSettings.customThresholds);
        const level = getTeaserRevealLevel(this.progressPercent, thresholds, teaserSettings.disabledStages);
        return { enabled: true, info: TEASER_LEVEL_INFO[level] };
    }

    private getFileName(path: string): string {
        if (!path) return '—';
        const normalized = path.split('\\').pop() ?? path;
        return normalized.split('/').pop() ?? normalized;
    }

    private getAprStatusTargets(): Array<{
        id: string;
        label: string;
        path: string;
        size: 'thumb' | 'small' | 'medium' | 'large';
        campaign?: AprCampaign;
    }> {
        const settings = this.plugin.settings.authorProgress;
        const targets: Array<{
            id: string;
            label: string;
            path: string;
            size: 'thumb' | 'small' | 'medium' | 'large';
            campaign?: AprCampaign;
        }> = [];

        const defaultPath = buildDefaultEmbedPath({
            bookTitle: settings?.bookTitle,
            updateFrequency: settings?.updateFrequency,
            aprSize: settings?.aprSize
        });
        const defaultSize = settings?.aprSize ?? 'medium';
        targets.push({
            id: 'default',
            label: 'Default Report',
            path: settings?.dynamicEmbedPath || defaultPath,
            size: defaultSize
        });

        const campaigns = settings?.campaigns || [];
        campaigns.forEach(campaign => {
            targets.push({
                id: campaign.id,
                label: `Campaign: ${campaign.name}`,
                path: campaign.embedPath,
                size: campaign.aprSize ?? defaultSize,
                campaign
            });
        });

        return targets;
    }

    private getEffectiveTargetPath(): string {
        const settings = this.plugin.settings.authorProgress;
        const campaign = this.getSelectedCampaign();
        if (campaign?.embedPath) return campaign.embedPath;
        return settings?.dynamicEmbedPath || buildDefaultEmbedPath({
            bookTitle: settings?.bookTitle,
            updateFrequency: settings?.updateFrequency,
            aprSize: settings?.aprSize
        });
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
                ? this.formatDays(Math.max(0, reminderDays - daysSince))
                : undefined;
            return { label: 'Manual', reminder };
        }

        const intervalDays = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 30;
        const daysSince = this.getDaysSince(opts.lastPublishedDate);
        const remaining = daysSince === null ? 0 : Math.max(0, intervalDays - daysSince);
        return { label: this.formatDays(remaining) };
    }

    private getCampaignStageDisplay(campaign: AprCampaign): { label: string; icon: string; tooltip?: string } {
        const teaserSettings = campaign.teaserReveal ?? { enabled: true, preset: 'standard' as const };
        if (!teaserSettings.enabled) {
            return { label: TEASER_LEVEL_INFO.full.label.toUpperCase(), icon: TEASER_LEVEL_INFO.full.icon };
        }

        const thresholds = getTeaserThresholds(teaserSettings.preset ?? 'standard', teaserSettings.customThresholds);
        const level = getTeaserRevealLevel(this.progressPercent, thresholds, teaserSettings.disabledStages);
        const info = TEASER_LEVEL_INFO[level];
        const progress = Math.max(0, Math.round(this.progressPercent));

        const steps: Array<{ level: 'scenes' | 'colors' | 'full'; threshold: number }> = [
            { level: 'scenes', threshold: thresholds.scenes },
            { level: 'colors', threshold: thresholds.colors },
            { level: 'full', threshold: thresholds.full },
        ];
        const disabled = teaserSettings.disabledStages ?? {};
        const filtered = steps.filter(step => !(step.level === 'scenes' && disabled.scenes) && !(step.level === 'colors' && disabled.colors));
        const currentIndex = filtered.findIndex(step => step.level === level);
        const nextThreshold = level === 'bar'
            ? filtered[0]?.threshold
            : (currentIndex >= 0 && currentIndex < filtered.length - 1
                ? filtered[currentIndex + 1].threshold
                : undefined);

        const label = nextThreshold
            ? `${info.label.toUpperCase()} ${progress}/${Math.round(nextThreshold)}`
            : info.label.toUpperCase();
        const tooltip = nextThreshold
            ? `${progress}% complete. Next stage at ${Math.round(nextThreshold)}%. Adjust ranges in the Campaign Manager.`
            : `${progress}% complete.`;

        return { label, icon: info.icon, tooltip };
    }

    private createStatusRow(container: HTMLElement, label: string): { rowEl: HTMLElement; valueEl: HTMLElement } {
        const row = container.createDiv({
            cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_COMPACT} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}`
        });
        row.createSpan({ text: label, cls: ERT_CLASSES.LABEL });
        const valueEl = row.createDiv({ cls: ERT_CLASSES.INLINE });
        return { rowEl: row, valueEl };
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
                dynamicEmbedPath: 'Radial Timeline/Social/book/apr-book-default-manual-medium.svg'
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
