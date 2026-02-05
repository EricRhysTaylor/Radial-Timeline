import { App, Modal, Setting, ButtonComponent, Notice, TextComponent, setIcon, setTooltip, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { TimelineItem } from '../types/timeline';
import { AuthorProgressService } from '../services/AuthorProgressService';
import type { AprCampaign } from '../types/settings';
import { getTeaserThresholds, getTeaserRevealLevel, TEASER_LEVEL_INFO } from '../renderer/apr/AprConstants';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';
import { ERT_CLASSES } from '../ui/classes';
import { buildCampaignEmbedPath, buildDefaultEmbedPath, isDefaultEmbedPath } from '../utils/aprPaths';
import { resolveBookTitle, resolveProjectPath } from '../renderer/apr/aprHelpers';
import { isSceneItem } from '../utils/sceneHelpers';

export class AuthorProgressModal extends Modal {
    private plugin: RadialTimelinePlugin;
    private service: AuthorProgressService;

    // Reveal options (derived from settings)
    private aprSize: 'thumb' | 'small' | 'medium' | 'large';
    private lastFullSize: 'small' | 'medium' | 'large' = 'medium';
    private selectedTargetId: 'default' | string = 'default';

    private statusSectionEl: HTMLElement | null = null;
    private campaignsSectionEl: HTMLElement | null = null;
    private actionsSectionEl: HTMLElement | null = null;
    private actionsBodyEl: HTMLElement | null = null;

    private cachedScenes: TimelineItem[] = [];
    private progressPercent: number = 0;
    private cachedProjectPath: string = '';

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
            dynamicEmbedPath: 'Radial Timeline/Social/book/apr-default-manual-medium.svg'
        };

        // Initialize reveal options from settings
        // Initialize size from settings
        this.aprSize = settings.aprSize ?? 'medium';
        if (this.aprSize !== 'thumb') {
            this.lastFullSize = this.aprSize;
        }
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

        if (isProActive || campaigns.length > 0) {
            const campaignsSkin = contentEl.createDiv({ cls: ERT_CLASSES.SKIN_PRO });
            this.campaignsSectionEl = campaignsSkin.createDiv({
                cls: `${ERT_CLASSES.PANEL} ert-panel--glass ${ERT_CLASSES.STACK}`
            });
            if (!isProActive) {
                this.campaignsSectionEl.addClass('ert-pro-locked');
            }
        }

        // Actions (context-sensitive)
        const actionsSection = contentEl.createDiv({
            cls: `${ERT_CLASSES.PANEL} ert-panel--glass ${ERT_CLASSES.STACK}`
        });
        actionsSection.addClass('ert-apr-actions');
        const actionsHeader = actionsSection.createDiv({ cls: ERT_CLASSES.PANEL_HEADER });
        const actionsHeaderMain = actionsHeader.createDiv({ cls: ERT_CLASSES.CONTROL });
        const actionsTitleRow = actionsHeaderMain.createDiv({ cls: ERT_CLASSES.INLINE });
        const actionsIcon = actionsTitleRow.createSpan({ cls: ERT_CLASSES.SECTION_ICON });
        setIcon(actionsIcon, 'share-2');
        actionsTitleRow.createEl('h4', { text: 'Actions', cls: ERT_CLASSES.SECTION_TITLE });
        this.actionsSectionEl = actionsSection;

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
        const settings = this.plugin.settings.authorProgress;
        if (!settings) {
            this.cachedScenes = [];
            this.progressPercent = 0;
            this.cachedProjectPath = '';
            return;
        }

        // Get resolved project path for the selected target
        const campaign = this.getSelectedCampaign();
        const projectPath = resolveProjectPath(settings, campaign ?? null, this.plugin.settings.sourcePath);

        // Only reload if project path changed (cache invalidation on projectPath change)
        if (this.cachedProjectPath === projectPath && this.cachedScenes.length > 0) {
            return; // Cache hit - skip reload
        }

        // Load scenes from the resolved project path
        const allScenes = await this.plugin.getSceneData({ sourcePath: projectPath });
        this.cachedScenes = allScenes.filter(isSceneItem);
        this.progressPercent = this.service.calculateProgress(this.cachedScenes);
        this.cachedProjectPath = projectPath;

        // Empty project feedback - show Notice when valid path has no scenes
        if (this.cachedScenes.length === 0) {
            const targetLabel = campaign ? `Campaign "${campaign.name}"` : 'Default Report';
            new Notice(`${targetLabel}: Project path "${projectPath}" contains no scenes.`);
        }
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

        const statusTargets = this.getAprStatusTargets().filter(target => !target.campaign);
        this.renderStatusGrid(this.statusSectionEl, statusTargets);
    }

    private renderCampaignStatusSection(): void {
        if (!this.campaignsSectionEl) return;
        this.campaignsSectionEl.empty();

        const header = this.campaignsSectionEl.createDiv({ cls: ERT_CLASSES.PANEL_HEADER });
        const headerMain = header.createDiv({ cls: ERT_CLASSES.CONTROL });
        const headerRow = headerMain.createDiv({ cls: ERT_CLASSES.INLINE });
        const headerIcon = headerRow.createSpan({ cls: ERT_CLASSES.SECTION_ICON });
        setIcon(headerIcon, 'layers');
        headerRow.createEl('h4', { text: 'Campaign Status', cls: ERT_CLASSES.SECTION_TITLE });

        const headerActions = header.createDiv({ cls: ERT_CLASSES.SECTION_ACTIONS });
        const proPill = headerActions.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM} ${ERT_CLASSES.BADGE_PILL_PRO}`
        });
        const proIcon = proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(proIcon, 'signature');
        proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'Pro' });

        const campaignTargets = this.getAprStatusTargets().filter(target => target.campaign);
        if (campaignTargets.length === 0) {
            this.campaignsSectionEl.createDiv({ text: 'No campaigns yet.', cls: ERT_CLASSES.FIELD_NOTE });
            return;
        }

        this.renderStatusGrid(this.campaignsSectionEl, campaignTargets);
    }

    private renderStatusGrid(container: HTMLElement, targets: Array<{
        id: string;
        label: string;
        bookTitle: string;
        projectPath: string;
        path: string;
        size: 'thumb' | 'small' | 'medium' | 'large';
        campaign?: AprCampaign;
    }>): void {
        if (targets.length === 0) return;

        const settings = this.plugin.settings.authorProgress;
        const statusGrid = container.createDiv({ cls: 'ert-apr-status-grid' });
        const statusHeaderRow = statusGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--header' });
        const headerLabels = ['APR', 'Book Title', 'Export', 'Stage', 'Update In', 'Reminder'];
        headerLabels.forEach(label => {
            const headerCell = statusHeaderRow.createDiv({
                text: label,
                cls: 'ert-apr-status-cell ert-apr-status-cell--header'
            });
            if (label === 'APR') {
                setTooltip(headerCell, 'APR = Author Progress Report (the generated SVG output).');
            }
        });

        targets.forEach((target) => {
            const dataRow = statusGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--data' });

            const aprCell = dataRow.createDiv({ cls: 'ert-apr-status-cell ert-apr-status-cell--apr' });
            const aprLabel = aprCell.createSpan({
                text: target.label,
                cls: 'ert-apr-status-title'
            });
            aprLabel.setAttr('title', target.label);

            const bookCell = dataRow.createDiv({ cls: 'ert-apr-status-cell ert-apr-status-cell--book' });
            const bookLabel = bookCell.createSpan({
                text: target.bookTitle,
                cls: `${ERT_CLASSES.FIELD_NOTE} ert-apr-status-book`
            });
            if (target.projectPath) {
                bookLabel.setAttr('title', `Project: ${target.projectPath}`);
            }

            const exportCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
            const exportPill = exportCell.createSpan({
                cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
            });
            exportPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: this.getSizeLabelPx(target.size) });

            const stageCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
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

            const updateCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
            const updatePill = updateCell.createSpan({
                cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
            });
            const frequency = target.campaign ? target.campaign.updateFrequency : settings?.updateFrequency;
            const lastPublishedDate = target.campaign ? target.campaign.lastPublishedDate : settings?.lastPublishedDate;
            const isUnpublished = !lastPublishedDate?.trim();
            const isAuto = !!frequency && frequency !== 'manual';
            const updateInfo = isUnpublished
                ? { label: 'Unpublished', reminder: undefined }
                : target.campaign && !target.campaign.isActive
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

            const reminderCell = dataRow.createDiv({ cls: 'ert-apr-status-cell ert-apr-status-cell--reminder' });
            reminderCell.createSpan({
                cls: ERT_CLASSES.FIELD_NOTE,
                text: (isUnpublished ? '—' : undefined) ?? updateInfo.reminder ?? '—'
            });
        });
    }

    private renderActions(): void {
        if (!this.actionsBodyEl) return;
        this.actionsBodyEl.empty();

        const campaigns = this.plugin.settings.authorProgress?.campaigns || [];
        const isProActive = isProfessionalActive(this.plugin);
        const showProActions = isProActive && this.selectedTargetId !== 'default';
        if (this.actionsSectionEl) {
            this.actionsSectionEl.classList.toggle(ERT_CLASSES.SKIN_PRO, showProActions);
        }
        if (showProActions) {
            this.renderProActions(this.actionsBodyEl, campaigns);
        } else {
            this.renderCoreActions(this.actionsBodyEl);
        }
    }

    private renderCoreActions(container: HTMLElement): void {
        const settings = this.plugin.settings.authorProgress;
        if (!settings) return;

        this.aprSize = settings.aprSize ?? this.aprSize ?? 'medium';

        const campaigns = this.plugin.settings.authorProgress?.campaigns || [];
        const isProActive = isProfessionalActive(this.plugin);

        // === TARGET ROW (two-column: label left, dropdown right) ===
        if (isProActive && campaigns.length > 0) {
            const targetRow = container.createDiv({ cls: 'ert-apr-target-row' });
            targetRow.createSpan({ text: 'Target', cls: ERT_CLASSES.LABEL });
            const targetSelect = targetRow.createEl('select', { cls: 'dropdown ert-input' });
            targetSelect.createEl('option', { value: 'default', text: 'Default Report' });
            campaigns.forEach(campaign => {
                targetSelect.createEl('option', { value: campaign.id, text: `Campaign: ${campaign.name}` });
            });
            targetSelect.value = this.selectedTargetId;
            targetSelect.onchange = async () => {
                this.selectedTargetId = targetSelect.value === 'default' ? 'default' : targetSelect.value;
                await this.loadData();
                this.renderStatusSection();
                this.renderActions();
            };
        }

        // === EXPORT SIZE ROW (two-column: label left, buttons right) ===
        const exportRow = container.createDiv({ cls: 'ert-apr-target-row' });
        exportRow.createSpan({ text: 'Export Size', cls: ERT_CLASSES.LABEL });

        const sizeOptions: Array<{ size: 'thumb' | 'small' | 'medium' | 'large'; dimension: string }> = [
            { size: 'thumb', dimension: '100px' },
            { size: 'small', dimension: '150px' },
            { size: 'medium', dimension: '300px' },
            { size: 'large', dimension: '450px' }
        ];

        const sizeButtonRow = exportRow.createDiv({ cls: `ert-apr-size-buttons ${ERT_CLASSES.INLINE}` });
        sizeOptions.forEach(option => {
            const isActive = option.size === this.getActiveAprSize();
            const btn = sizeButtonRow.createEl('button', {
                cls: `${ERT_CLASSES.PILL_BTN} ${ERT_CLASSES.PILL_BTN_SOCIAL} ${isActive ? ERT_CLASSES.IS_ACTIVE : ''}`
            });
            const dims = btn.createSpan({ cls: ERT_CLASSES.PILL_BTN_LABEL });
            dims.append(document.createTextNode(option.dimension));
            if (isActive) {
                btn.setAttr('aria-pressed', 'true');
            }
            btn.onclick = async () => {
                this.aprSize = option.size;
                if (option.size !== 'thumb') {
                    this.lastFullSize = option.size;
                }
                await this.saveSize();
                this.renderStatusSection();
                this.renderActions();
            };
        });

        // === OUTPUT FILE ===
        const pathRow = container.createDiv({
            cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_COMPACT} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}`
        });
        pathRow.createSpan({ text: 'Output file', cls: ERT_CLASSES.LABEL });
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

        // === PUBLISH BUTTON ===
        const actionRow = container.createDiv({ cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}` });
        actionRow.createSpan({ text: '', cls: ERT_CLASSES.LABEL });
        const actionControl = actionRow.createDiv({ cls: ERT_CLASSES.CONTROL });
        const primaryButton = new ButtonComponent(actionControl)
            .setButtonText('Publish')
            .setCta();
        primaryButton.onClick(() => this.publish('dynamic'));
    }

    private renderProActions(container: HTMLElement, campaigns: AprCampaign[]): void {
        const settings = this.plugin.settings.authorProgress;
        if (!settings) return;

        // === TARGET ROW (two-column: label left, dropdown right) ===
        const targetRow = container.createDiv({ cls: 'ert-apr-target-row' });
        targetRow.createSpan({ text: 'Target', cls: ERT_CLASSES.LABEL });
        const targetSelect = targetRow.createEl('select', { cls: 'dropdown ert-input' });
        targetSelect.createEl('option', { value: 'default', text: 'Default Report' });
        campaigns.forEach(campaign => {
            targetSelect.createEl('option', { value: campaign.id, text: `Campaign: ${campaign.name}` });
        });
        targetSelect.value = this.selectedTargetId;
        targetSelect.onchange = async () => {
            this.selectedTargetId = targetSelect.value === 'default' ? 'default' : targetSelect.value;
            await this.loadData();
            this.renderStatusSection();
            this.renderActions();
        };

        const campaign = this.getSelectedCampaign() ?? campaigns.find(c => c.id === this.selectedTargetId);
        if (!campaign) {
            container.createDiv({ text: 'Select a campaign to publish.', cls: ERT_CLASSES.FIELD_NOTE });
            return;
        }

        // Auto-update legacy embed paths if enabled
        if (settings?.autoUpdateEmbedPaths) {
            const legacySlug = campaign.name.toLowerCase().replace(/\s+/g, '-');
            const legacyPath = `Radial Timeline/Social/${legacySlug}-progress.svg`;
            if (campaign.embedPath === legacyPath) {
                const nextPath = buildCampaignEmbedPath({
                    bookTitle: settings.bookTitle,
                    campaignName: campaign.name,
                    updateFrequency: campaign.updateFrequency,
                    aprSize: campaign.aprSize,
                    fallbackSize: settings.aprSize,
                    teaserEnabled: campaign.teaserReveal?.enabled ?? true
                });
                campaign.embedPath = nextPath;
                void this.plugin.saveSettings();
            }
        }

        // === STATUS ROW (grid-style: Book, Export, Type, Stage) ===
        const projectPath = resolveProjectPath(settings, campaign, this.plugin.settings.sourcePath);
        const bookTitle = resolveBookTitle(settings, campaign, projectPath);
        const activeSize = this.getActiveAprSize();
        const activeView = activeSize === 'thumb' ? 'thumb' : 'full';
        // Render-mode pill: Thumb (ring-only) or Standard (full APR render). Distinct from reveal-stage "Complete".
        const viewLabel = activeView === 'thumb' ? 'Thumb' : 'Standard';
        const stageInfo = this.resolveTeaserStatus(campaign).info ?? TEASER_LEVEL_INFO.full;

        const statusRow = container.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--data ert-apr-actions-status' });

        // Book cell
        const bookCell = statusRow.createDiv({ cls: 'ert-apr-status-cell ert-apr-status-cell--book' });
        const bookLabel = bookCell.createSpan({
            text: bookTitle,
            cls: `${ERT_CLASSES.FIELD_NOTE} ert-apr-status-book`
        });
        bookLabel.setAttr('title', `Project: ${projectPath}`);

        // Export cell
        const exportCell = statusRow.createDiv({ cls: 'ert-apr-status-cell' });
        const exportPill = exportCell.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
        });
        exportPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: this.getSizeLabelPx(activeSize) });

        // Type cell (Thumb / Standard)
        const typeCell = statusRow.createDiv({ cls: 'ert-apr-status-cell' });
        const typePill = typeCell.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
        });
        typePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: viewLabel });

        // Stage cell
        const stageCell = statusRow.createDiv({ cls: 'ert-apr-status-cell' });
        const stagePill = stageCell.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_SM}`
        });
        const stageIcon = stagePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(stageIcon, stageInfo.icon);
        stagePill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: stageInfo.label });

        // === OUTPUT FILE ===
        const pathRow = container.createDiv({
            cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_COMPACT} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}`
        });
        pathRow.createSpan({ text: 'Output file', cls: ERT_CLASSES.LABEL });
        const pathValue = pathRow.createDiv({ cls: ERT_CLASSES.INLINE });
        const pathText = pathValue.createSpan({
            cls: `${ERT_CLASSES.FIELD_NOTE} ert-mono ert-truncate`,
            text: this.summarizePath(campaign.embedPath)
        });
        pathText.setAttr('title', campaign.embedPath);

        // === PUBLISH BUTTON ===
        const actionRow = container.createDiv({ cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_MIDDLE_ALIGN}` });
        actionRow.createSpan({ text: '', cls: ERT_CLASSES.LABEL });
        const actionControl = actionRow.createDiv({ cls: ERT_CLASSES.CONTROL });
        const primaryButton = new ButtonComponent(actionControl)
            .setButtonText('Publish Campaign');
        primaryButton.buttonEl.addClass('ert-btn', 'ert-btn--standard-pro');
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
        bookTitle: string;
        projectPath: string;
        path: string;
        size: 'thumb' | 'small' | 'medium' | 'large';
        campaign?: AprCampaign;
    }> {
        const settings = this.plugin.settings.authorProgress;
        const targets: Array<{
            id: string;
            label: string;
            bookTitle: string;
            projectPath: string;
            path: string;
            size: 'thumb' | 'small' | 'medium' | 'large';
            campaign?: AprCampaign;
        }> = [];

        if (!settings) return targets;

        // Default Report (Core Social)
        const defaultProjectPath = resolveProjectPath(settings, null, this.plugin.settings.sourcePath);
        const defaultBookTitle = resolveBookTitle(settings, null, defaultProjectPath);
        const defaultPath = buildDefaultEmbedPath({
            bookTitle: settings.bookTitle,
            updateFrequency: settings.updateFrequency,
            aprSize: settings.aprSize
        });
        const defaultSize = settings.aprSize ?? 'medium';
        targets.push({
            id: 'default',
            label: 'Default Report',
            bookTitle: defaultBookTitle,
            projectPath: defaultProjectPath,
            path: settings.dynamicEmbedPath || defaultPath,
            size: defaultSize
        });

        // Campaigns (Pro overrides)
        const campaigns = settings.campaigns || [];
        campaigns.forEach(campaign => {
            const campaignProjectPath = resolveProjectPath(settings, campaign, this.plugin.settings.sourcePath);
            const campaignBookTitle = resolveBookTitle(settings, campaign, campaignProjectPath);
            targets.push({
                id: campaign.id,
                label: campaign.name,
                bookTitle: campaignBookTitle,
                projectPath: campaignProjectPath,
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

    private getSizeLabelPx(size: 'thumb' | 'small' | 'medium' | 'large'): string {
        const meta = this.getSizeMeta(size);
        return `${meta.dimension}px`;
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
                dynamicEmbedPath: 'Radial Timeline/Social/book/apr-default-manual-medium.svg'
            };
        }
        const settings = this.plugin.settings.authorProgress;
        const legacyPath = 'Radial Timeline/Social/progress.svg';
        settings.aprSize = this.aprSize;
        // Recompute default path when size changes if path is unset or any default (current or legacy format)
        const pathIsDefaultOrUnset = !settings.dynamicEmbedPath?.trim()
            || settings.dynamicEmbedPath === legacyPath
            || isDefaultEmbedPath(settings.dynamicEmbedPath, {
                bookTitle: settings.bookTitle,
                updateFrequency: settings.updateFrequency
            });
        if (settings.autoUpdateEmbedPaths !== false && pathIsDefaultOrUnset) {
            settings.dynamicEmbedPath = buildDefaultEmbedPath({
                bookTitle: settings.bookTitle,
                updateFrequency: settings.updateFrequency,
                aprSize: settings.aprSize
            });
        }
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
