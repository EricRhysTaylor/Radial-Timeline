import { App, Modal, Setting, ButtonComponent, Notice, TextComponent, setIcon, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getAllScenes } from '../utils/manuscript';
import { TimelineItem } from '../types/timeline';
import { AuthorProgressService } from '../services/AuthorProgressService';
import type { AprCampaign } from '../types/settings';
import { getTeaserThresholds, getTeaserRevealLevel, TEASER_LEVEL_INFO } from '../renderer/apr/AprConstants';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';
import { ERT_CLASSES } from '../ui/classes';

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

        // Campaign status table (Pro users or existing campaigns)
        if (isProActive || campaigns.length > 0) {
            this.campaignsSectionEl = contentEl.createDiv({
                cls: `${ERT_CLASSES.PANEL} ert-panel--glass ${ERT_CLASSES.STACK} ${ERT_CLASSES.SKIN_PRO}`
            });
            if (!isProActive) {
                this.campaignsSectionEl.addClass('ert-pro-locked');
            }
        }

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
        const teaserStatus = this.resolveTeaserStatus(campaign);

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

        const stageInfo = teaserStatus.info ?? TEASER_LEVEL_INFO.full;
        const nextInfo = this.getNextUpdateInfo({
            frequency: isCampaign ? campaign?.updateFrequency : settings?.updateFrequency,
            lastPublishedDate: isCampaign ? campaign?.lastPublishedDate : settings?.lastPublishedDate,
            reminderDays: isCampaign ? campaign?.refreshThresholdDays : settings?.stalenessThresholdDays,
            remindersEnabled: isCampaign ? true : settings?.enableReminders
        });
        const statusGrid = this.statusSectionEl.createDiv({ cls: 'ert-apr-status-grid' });
        const statusHeaderRow = statusGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--header' });
        ['Item', 'Export', 'Stage', 'Update in', 'Reminder'].forEach(label => {
            statusHeaderRow.createDiv({ text: label, cls: 'ert-apr-status-cell ert-apr-status-cell--header' });
        });

        const statusFiles = this.getAprStatusFiles();
        statusFiles.forEach((fileName, index) => {
            const nameRow = statusGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--file' });
            nameRow.createDiv({ text: fileName, cls: 'ert-apr-status-file' });

            const dataRow = statusGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--data' });
            dataRow.createDiv({
                text: String(index + 1),
                cls: 'ert-apr-status-cell ert-apr-status-cell--item'
            });

            const exportCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
            const exportPill = exportCell.createSpan({
                cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
            });
            exportPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: sizeMeta.dimension });
            exportPill.createEl('sup', { text: '2' });

            const stageCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
            const stagePill = stageCell.createSpan({
                cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
            });
            const stageIcon = stagePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
            setIcon(stageIcon, stageInfo.icon);
            stagePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: stageInfo.label });

            const updateCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
            const updatePill = updateCell.createSpan({
                cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
            });
            updatePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: nextInfo.label });

            const reminderCell = dataRow.createDiv({ cls: 'ert-apr-status-cell ert-apr-status-cell--reminder' });
            reminderCell.createSpan({
                cls: ERT_CLASSES.FIELD_NOTE,
                text: nextInfo.reminder ?? '—'
            });
        });
    }

    private renderCampaignStatusSection(): void {
        if (!this.campaignsSectionEl) return;
        this.campaignsSectionEl.empty();

        const campaigns = this.plugin.settings.authorProgress?.campaigns || [];
        const header = this.campaignsSectionEl.createDiv({ cls: ERT_CLASSES.PANEL_HEADER });
        const headerMain = header.createDiv({ cls: ERT_CLASSES.CONTROL });
        const headerRow = headerMain.createDiv({ cls: ERT_CLASSES.INLINE });
        const headerIcon = headerRow.createSpan({ cls: ERT_CLASSES.SECTION_ICON });
        setIcon(headerIcon, 'layers');
        headerRow.createEl('h4', { text: 'Campaigns', cls: ERT_CLASSES.SECTION_TITLE });
        const headerActions = header.createDiv({ cls: ERT_CLASSES.SECTION_ACTIONS });
        const proPill = headerActions.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM} ${ERT_CLASSES.BADGE_PILL_PRO}`
        });
        const proIcon = proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(proIcon, 'signature');
        proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'Pro' });

        if (campaigns.length === 0) {
            this.campaignsSectionEl.createDiv({
                text: 'No campaigns yet.',
                cls: ERT_CLASSES.FIELD_NOTE
            });
            return;
        }

        const activeCampaigns = campaigns.filter(campaign => campaign.isActive);
        const pausedCampaigns = campaigns.filter(campaign => !campaign.isActive);

        const renderGroup = (label: string, group: AprCampaign[]) => {
            const groupEl = this.campaignsSectionEl!.createDiv({ cls: ERT_CLASSES.STACK });
            const groupHeader = groupEl.createDiv({ cls: ERT_CLASSES.INLINE });
            const groupPill = groupHeader.createSpan({
                cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM} ${ERT_CLASSES.BADGE_PILL_NEUTRAL}`
            });
            groupPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: label });

            if (group.length === 0) {
                groupEl.createDiv({ text: 'None', cls: ERT_CLASSES.FIELD_NOTE });
                return;
            }

            group.forEach(campaign => {
                const needsRefresh = this.service.campaignNeedsRefresh(campaign);
                const rowClasses: string[] = [ERT_CLASSES.OBJECT_ROW];
                if (needsRefresh) rowClasses.push('is-needs-refresh');
                if (!campaign.isActive) rowClasses.push('is-inactive');
                const row = groupEl.createDiv({ cls: rowClasses.join(' ') });

                const nextInfo = this.getNextUpdateInfo({
                    frequency: campaign.updateFrequency,
                    lastPublishedDate: campaign.lastPublishedDate,
                    reminderDays: campaign.refreshThresholdDays,
                    remindersEnabled: true
                });
                const nextLabel = nextInfo.label.startsWith('Manual') ? 'Manual' : nextInfo.label;

                const rowLeft = row.createDiv({ cls: ERT_CLASSES.OBJECT_ROW_LEFT });
                const titleRow = rowLeft.createDiv({ cls: ERT_CLASSES.INLINE });

                const stateIcon = titleRow.createSpan({ cls: `${ERT_CLASSES.ICON_BADGE} ert-campaign-status` });
                setIcon(stateIcon, needsRefresh ? 'alert-triangle' : campaign.isActive ? 'check-circle' : 'pause-circle');

                const typeIcon = titleRow.createSpan({ cls: ERT_CLASSES.ICON_BADGE });
                setIcon(typeIcon, this.getCampaignTypeIcon(campaign));

                titleRow.createSpan({ text: campaign.name });

                const pathMeta = rowLeft.createSpan({
                    cls: `${ERT_CLASSES.OBJECT_ROW_META} ert-mono ert-truncate`,
                    text: this.getFileName(campaign.embedPath)
                });
                pathMeta.setAttr('title', campaign.embedPath);

                const lastPublished = campaign.lastPublishedDate
                    ? `Updated ${new Date(campaign.lastPublishedDate).toLocaleDateString()}`
                    : 'Never updated';
                rowLeft.createSpan({ text: lastPublished, cls: ERT_CLASSES.OBJECT_ROW_META });

                const actions = row.createDiv({ cls: ERT_CLASSES.OBJECT_ROW_ACTIONS });
                const modePill = actions.createSpan({
                    cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
                });
                modePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: this.formatFrequencyLabel(campaign.updateFrequency) });

                const nextPill = actions.createSpan({
                    cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
                });
                nextPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: nextLabel });

                if (campaign.teaserReveal?.enabled) {
                    const teaserPill = actions.createSpan({
                        cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM} ${ERT_CLASSES.BADGE_PILL_NEUTRAL}`
                    });
                    const teaserIcon = teaserPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
                    setIcon(teaserIcon, 'calendar-clock');
                    teaserPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'Teaser' });
                }
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
        const defaultPath = 'Radial Timeline/Social/progress.svg';
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

    private getCampaignTypeIcon(campaign: AprCampaign): string {
        const label = campaign.name.toLowerCase();
        if (label.includes('kick')) return 'rocket';
        if (label.includes('patreon')) return 'heart';
        if (label.includes('news')) return 'mail';
        if (label.includes('site') || label.includes('web')) return 'globe';
        return 'share-2';
    }

    private getFileName(path: string): string {
        if (!path) return '—';
        const normalized = path.split('\\').pop() ?? path;
        return normalized.split('/').pop() ?? normalized;
    }

    private getAprStatusFiles(): string[] {
        const folderPath = normalizePath('Radial Timeline/Social');
        const prefix = `${folderPath}/`;
        const files = this.app.vault.getFiles().filter(file => file.path.startsWith(prefix));
        if (files.length === 0) {
            return [this.getFileName(this.getEffectiveTargetPath())];
        }
        return files.map(file => file.name);
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
