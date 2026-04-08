/**
 * Campaign Manager Section (Pro Feature)
 * Allows managing multiple APR campaigns with independent refresh schedules
 */

import { App, Setting, setIcon, setTooltip, ButtonComponent, Notice, Modal, DropdownComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { AuthorProgressCampaign, AuthorProgressSettings, TeaserPreset, TeaserRevealLevel } from '../../types/settings';
import { hasProFeatureAccess } from '../featureGate';
import { getTeaserThresholds, teaserLevelToRevealOptions, TEASER_LEVEL_INFO } from '../../renderer/apr/AprConstants';
import { createAprSVG } from '../../renderer/apr/AprRenderer';
import { getAllScenes } from '../../utils/manuscript';
import {
    buildCampaignEmbedPath,
    normalizeAprExportFormat,
    type AprExportFormat,
    type AprSize
} from '../../utils/aprPaths';
import { resolveBookTitle, resolveProjectPath, validateAndRememberProjectPath } from '../../renderer/apr/aprHelpers';

import { ERT_CLASSES } from '../../ui/classes';
import { ProjectPathSuggest } from '../ProjectPathSuggest';
import { fitSelectToSelectedLabel } from '../selectSizing';
import { scheduleFocusAfterPaint } from '../../utils/domFocus';

export interface CampaignManagerProps {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    onCampaignChange?: () => void;
}

interface CampaignNameModalOptions {
    badgeLabel?: string;
    title: string;
    subtitle: string;
    initialValue: string;
    actionLabel: string;
    onSubmit: (value: string) => Promise<boolean>;
}

class CampaignNameModal extends Modal {
    private readonly options: CampaignNameModalOptions;

    constructor(app: App, options: CampaignNameModalOptions) {
        super(app);
        this.options = options;
    }

    onOpen() {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-campaign-name-modal');
            modalEl.style.width = '420px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw';
        }

        contentEl.addClass('ert-modal-container', 'ert-stack');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: this.options.badgeLabel ?? 'Edit' });
        header.createDiv({ cls: 'ert-modal-title', text: this.options.title });
        header.createDiv({ cls: 'ert-modal-subtitle', text: this.options.subtitle });

        const inputContainer = contentEl.createDiv({ cls: 'ert-search-input-container' });
        const inputEl = inputContainer.createEl('input', {
            type: 'text',
            value: this.options.initialValue,
            cls: 'ert-input ert-input--full'
        });
        inputEl.setAttr('placeholder', 'Campaign name');

        scheduleFocusAfterPaint(inputEl, { selectText: true });

        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });
        const save = async () => {
            const val = inputEl.value.trim();
            if (!val) {
                new Notice('Please enter a campaign name');
                return;
            }
            const shouldClose = await this.options.onSubmit(val);
            if (shouldClose) {
                this.close();
            }
        };

        new ButtonComponent(buttonRow)
            .setButtonText(this.options.actionLabel)
            .setCta()
            .onClick(() => { void save(); });

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        // SAFE: Modal classes do not have registerDomEvent; Obsidian manages Modal lifecycle
        inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                void save();
            }
        });
    }

    onClose() {
        this.contentEl.empty();
    }
}

/**
 * Generate a unique campaign ID
 */
function generateCampaignId(): string {
    return `campaign-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function getDaysSince(date?: string): number | null {
    if (!date) return null;
    const time = new Date(date).getTime();
    if (!Number.isFinite(time)) return null;
    return Math.floor((Date.now() - time) / (1000 * 60 * 60 * 24));
}

function getNextUpdateLabel(campaign: AuthorProgressCampaign): string {
    if (!campaign.isActive) return 'Paused';
    const hasPublished = !!campaign.lastPublishedDate?.trim();
    if (!hasPublished) return 'Unpublished';

    const frequency = campaign.updateFrequency ?? 'manual';
    const daysSince = getDaysSince(campaign.lastPublishedDate) ?? 0;

    if (frequency === 'manual') {
        const reminderDays = campaign.refreshThresholdDays ?? 0;
        if (reminderDays <= 0) return 'Manual (no reminder)';
        const remaining = Math.max(0, reminderDays - daysSince);
        return remaining === 0 ? 'Reminder due' : `Reminder in ${remaining}d`;
    }

    const intervalDays = frequency === 'daily' ? 1 : frequency === 'weekly' ? 7 : 30;
    const remaining = Math.max(0, intervalDays - daysSince);
    return remaining === 0 ? 'Auto update due' : `Auto update in ${remaining}d`;
}

const AUTO_UPDATE_FREQUENCIES: readonly string[] = ['daily', 'weekly', 'monthly'];

function resolveCampaignExportFormat(campaign: AuthorProgressCampaign | undefined): AprExportFormat {
    if (!campaign) return 'png';
    if (typeof campaign.exportFormat === 'string' && campaign.exportFormat.trim()) {
        return normalizeAprExportFormat(campaign.exportFormat);
    }
    const path = campaign.exportPath?.toLowerCase() ?? '';
    return path.endsWith('.svg') ? 'svg' : 'png';
}

function getScheduleBadge(campaign: AuthorProgressCampaign): { label: string; cls: string } {
    if (!campaign.isActive) return { label: 'Paused', cls: 'is-paused' };
    const frequency = campaign.updateFrequency ?? 'manual';
    // Only treat known auto frequencies as auto (avoids showing "Auto · Full" or other invalid values)
    if (frequency !== 'manual' && AUTO_UPDATE_FREQUENCIES.includes(frequency)) {
        const label = frequency.charAt(0).toUpperCase() + frequency.slice(1);
        return { label: `Auto · ${label}`, cls: 'is-auto' };
    }
    const days = Number.isFinite(campaign.refreshThresholdDays) && campaign.refreshThresholdDays > 0
        ? campaign.refreshThresholdDays
        : 7;
    return { label: `Manual · ${days}d`, cls: 'is-manual' };
}

function resolveCampaignBookTitle(
    settings: AuthorProgressSettings | undefined,
    campaign: AuthorProgressCampaign | null,
    sourcePath: string
): string | undefined {
    if (!settings) return undefined;
    const projectPath = resolveProjectPath(settings, campaign, sourcePath);
    return resolveBookTitle(settings, campaign, projectPath);
}

/**
 * Create a new campaign with default values
 */
export function createDefaultCampaign(
    name: string,
    options?: {
        bookTitle?: string;
        aprSize?: AprSize;
    }
): AuthorProgressCampaign {
    const exportPath = buildCampaignEmbedPath({
        bookTitle: options?.bookTitle,
        campaignName: name,
        updateFrequency: 'manual',
        teaserEnabled: true,
        exportFormat: 'png'
    });
    return {
        id: generateCampaignId(),
        name,
        description: '',
        isActive: true,
        updateFrequency: 'manual',
        refreshThresholdDays: 7,
        lastPublishedDate: undefined,
        exportPath,
        exportFormat: 'png',
        // aprSize defaults to global setting (undefined)
        customTransparent: true,
        customTheme: 'dark',
        // Teaser Reveal defaults (enabled by default for campaigns)
        teaserReveal: {
            enabled: true,
            preset: 'standard',
            customThresholds: undefined
        }
    };
}

/**
 * Check if a campaign needs refresh
 */
export function campaignNeedsRefresh(campaign: AuthorProgressCampaign): boolean {
    if (!campaign.isActive) return false;
    if (campaign.updateFrequency && campaign.updateFrequency !== 'manual') return false;
    if (!campaign.lastPublishedDate) return false; // Never published - nothing to refresh yet

    const last = new Date(campaign.lastPublishedDate).getTime();
    const now = Date.now();
    const diffDays = (now - last) / (1000 * 60 * 60 * 24);

    return diffDays > campaign.refreshThresholdDays;
}

/**
 * Render the Campaign Manager section
 */
export function renderCampaignManagerSection({ app, plugin, containerEl, onCampaignChange }: CampaignManagerProps): void {
    const isProActive = hasProFeatureAccess(plugin);
    const campaigns = plugin.settings.authorProgress?.campaigns || [];
    const expandedCampaigns = new Set<string>();

    // ─────────────────────────────────────────────────────────────────────────
    // CAMPAIGN MANAGER CARD
    // ─────────────────────────────────────────────────────────────────────────
    const card = containerEl.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ${ERT_CLASSES.SKIN_PRO} ert-campaign-card` });
    if (!isProActive) {
        card.addClass('ert-pro-locked');
    }

    // Header with Pro badge
    const headerRow = card.createDiv({ cls: ERT_CLASSES.PANEL_HEADER });
    const titleArea = headerRow.createDiv({ cls: ERT_CLASSES.CONTROL });

    // Pro Pill (ERT Style)
    const titleRow = titleArea.createEl('h4', { cls: `${ERT_CLASSES.SECTION_TITLE} ${ERT_CLASSES.INLINE} ert-campaign-title` });
    const proPill = titleRow.createSpan({ cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO}` });
    setIcon(proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON }), 'signature');
    proPill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'PRO' });
    titleRow.createSpan({ text: 'Campaign Manager' });

    // Description
    card.createEl('p', {
        text: 'Create multiple export destinations with independent refresh schedules. Perfect for managing Kickstarter, Patreon, newsletter, and website exports separately.',
        cls: `${ERT_CLASSES.SECTION_DESC} ert-campaign-desc`
    });

    // ─────────────────────────────────────────────────────────────────────────
    // CAMPAIGN LIST
    // ─────────────────────────────────────────────────────────────────────────
    const listContainer = card.createDiv({ cls: `${ERT_CLASSES.STACK} ert-campaign-list` });

    if (campaigns.length === 0) {
        const emptyState = listContainer.createDiv({ cls: 'ert-campaign-empty-state' });
        emptyState.createEl('p', { text: 'No campaigns yet. Create your first campaign to track multiple export destinations.' });
    } else {
        campaigns.forEach((campaign, index) => {
            renderCampaignRow(listContainer, campaign, index, plugin, () => {
                rerenderCampaignList();
                onCampaignChange?.();
            }, expandedCampaigns);
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ADD CAMPAIGN BUTTON
    // ─────────────────────────────────────────────────────────────────────────
    const addSection = card.createDiv({ cls: 'ert-campaign-add-section' });

    const addRow = addSection.createDiv({ cls: 'ert-campaign-add-row' });

    const newCampaignSetting = new Setting(addRow)
        .setName('New campaign')
        .setDesc('Create a new campaign that targets a specific platform or audience.')
        .addButton(button => {
            button.setButtonText('Add Campaign');
            button.buttonEl.addClass('ert-btn', 'ert-btn--standard-pro');
            button.onClick(async () => {
                const modal = new CampaignNameModal(app, {
                    badgeLabel: 'New',
                    title: 'New campaign',
                    subtitle: 'Give your campaign a name (e.g., "Website Hero Page", "Kickstarter Campaign", "Newsletter")',
                    initialValue: '',
                    actionLabel: 'Create',
                    onSubmit: async (name) => {
                        const existing = campaigns.find(c => c.name.toLowerCase() === name.toLowerCase());
                        if (existing) {
                            new Notice('A campaign with this name already exists');
                            return false;
                        }

        const resolvedBookTitle = resolveCampaignBookTitle(
            plugin.settings.authorProgress,
            null,
            plugin.settings.sourcePath
        );
        const newCampaign = createDefaultCampaign(name, {
            bookTitle: resolvedBookTitle,
            aprSize: plugin.settings.authorProgress?.defaults.aprSize
        });
                        if (!plugin.settings.authorProgress) return false;
                        if (!plugin.settings.authorProgress.campaigns) {
                            plugin.settings.authorProgress.campaigns = [];
                        }
                        plugin.settings.authorProgress.campaigns.push(newCampaign);
                        await plugin.saveSettings();

                        new Notice(`Campaign "${name}" created!`);
                        rerenderCampaignList();
                        onCampaignChange?.();
                        return true;
                    }
                });
                modal.open();
            });
        });


    // ─────────────────────────────────────────────────────────────────────────
    // QUICK TEMPLATES
    // ─────────────────────────────────────────────────────────────────────────
    const templatesSection = card.createDiv({ cls: 'ert-campaign-templates' });
    templatesSection.createEl('h5', { text: 'Campaign Presets', cls: 'ert-kicker' });

    const templateRow = templatesSection.createDiv({ cls: ERT_CLASSES.INLINE });

    const templates = [
        { name: 'Kickstarter', icon: 'rocket', days: 7 },
        { name: 'Patreon', icon: 'heart', days: 14 },
        { name: 'Newsletter', icon: 'mail', days: 14 },
        { name: 'Website', icon: 'globe', days: 30 },
    ];

    templates.forEach(template => {
        const btn = templateRow.createEl('button', { cls: `${ERT_CLASSES.PILL_BTN} ${ERT_CLASSES.PILL_BTN_PRO}` });
        const iconSpan = btn.createSpan({ cls: ERT_CLASSES.PILL_BTN_ICON });
        setIcon(iconSpan, template.icon);
        btn.createSpan({ cls: ERT_CLASSES.PILL_BTN_LABEL, text: template.name });

        // Check if already exists
        const exists = campaigns.find(c => c.name.toLowerCase() === template.name.toLowerCase());
        if (exists) {
            btn.addClass(ERT_CLASSES.PILL_BTN_USED);
            btn.disabled = true;
        }

        btn.onclick = async () => {
            if (exists) return;

            const resolvedBookTitle = resolveCampaignBookTitle(
                plugin.settings.authorProgress,
                null,
                plugin.settings.sourcePath
            );
            const newCampaign = createDefaultCampaign(template.name, {
                bookTitle: resolvedBookTitle,
                aprSize: plugin.settings.authorProgress?.defaults.aprSize
            });
            newCampaign.refreshThresholdDays = template.days;

            if (!plugin.settings.authorProgress) return;
            if (!plugin.settings.authorProgress.campaigns) {
                plugin.settings.authorProgress.campaigns = [];
            }
            plugin.settings.authorProgress.campaigns.push(newCampaign);
            await plugin.saveSettings();

            new Notice(`Campaign "${template.name}" created!`);
            rerenderCampaignList();
            onCampaignChange?.();
        };
    });

    // Helper to re-render the list
    function rerenderCampaignList() {
        listContainer.empty();
        const updatedCampaigns = plugin.settings.authorProgress?.campaigns || [];

        if (updatedCampaigns.length === 0) {
            const emptyState = listContainer.createDiv({ cls: 'ert-campaign-empty-state' });
            emptyState.createEl('p', { text: 'No campaigns yet. Create your first campaign to track multiple export destinations.' });
        } else {
            const campaignIds = new Set(updatedCampaigns.map(campaign => campaign.id));
            expandedCampaigns.forEach((id) => {
                if (!campaignIds.has(id)) {
                    expandedCampaigns.delete(id);
                }
            });
            updatedCampaigns.forEach((campaign, index) => {
                renderCampaignRow(listContainer, campaign, index, plugin, () => {
                    rerenderCampaignList();
                    onCampaignChange?.();
                }, expandedCampaigns);
            });
        }

        // Update template button states
        templateRow.empty();
        templates.forEach(template => {
            const btn = templateRow.createEl('button', { cls: `${ERT_CLASSES.PILL_BTN} ${ERT_CLASSES.PILL_BTN_PRO}` });
            const iconSpan = btn.createSpan({ cls: ERT_CLASSES.PILL_BTN_ICON });
            setIcon(iconSpan, template.icon);
            btn.createSpan({ cls: ERT_CLASSES.PILL_BTN_LABEL, text: template.name });

            const exists = updatedCampaigns.find(c => c.name.toLowerCase() === template.name.toLowerCase());
            if (exists) {
                btn.addClass(ERT_CLASSES.PILL_BTN_USED);
                btn.disabled = true;
            }

            btn.onclick = async () => {
                if (exists) return;

                const resolvedBookTitle = resolveCampaignBookTitle(
                    plugin.settings.authorProgress,
                    null,
                    plugin.settings.sourcePath
                );
                const newCampaign = createDefaultCampaign(template.name, {
                    bookTitle: resolvedBookTitle,
                    aprSize: plugin.settings.authorProgress?.defaults.aprSize
                });
                newCampaign.refreshThresholdDays = template.days;

                if (!plugin.settings.authorProgress) return;
                if (!plugin.settings.authorProgress.campaigns) {
                    plugin.settings.authorProgress.campaigns = [];
                }
                plugin.settings.authorProgress.campaigns.push(newCampaign);
                await plugin.saveSettings();

                new Notice(`Campaign "${template.name}" created!`);
                rerenderCampaignList();
                onCampaignChange?.();
            };
        });
    }
}

/**
 * Render a single campaign row
 */
function renderCampaignRow(
    container: HTMLElement,
    campaign: AuthorProgressCampaign,
    index: number,
    plugin: RadialTimelinePlugin,
    onUpdate: () => void,
    expandedCampaigns: Set<string>
): void {
    const needsRefresh = campaignNeedsRefresh(campaign);

    // Create a wrapper to contain both the row and expandable details
    const wrapper = container.createDiv({ cls: 'ert-campaign-wrapper' });

    const rowClasses: string[] = [ERT_CLASSES.OBJECT_ROW];
    if (needsRefresh) rowClasses.push('is-needs-refresh');
    if (!campaign.isActive) rowClasses.push('is-inactive');

    const row = wrapper.createDiv({ cls: rowClasses.join(' ') });
    const rowLeft = row.createDiv({ cls: ERT_CLASSES.OBJECT_ROW_LEFT });
    const campaignKey = campaign.id;

    // Status indicator
    const titleRow = rowLeft.createDiv({ cls: `${ERT_CLASSES.INLINE} ert-campaign-title-row` });
    const statusIndicator = titleRow.createDiv({ cls: 'ert-campaign-status' });
    if (needsRefresh) {
        setIcon(statusIndicator, 'alert-triangle');
        setTooltip(statusIndicator, 'Refresh needed');
    } else if (campaign.isActive) {
        setIcon(statusIndicator, 'check-circle');
        setTooltip(statusIndicator, 'Up to date (no refresh needed)');
    } else {
        setIcon(statusIndicator, 'pause-circle');
        setTooltip(statusIndicator, 'Paused');
    }

    // Campaign info
    const nameEl = titleRow.createSpan({
        text: campaign.name,
        cls: `ert-campaign-name ert-campaign-name--clickable ${campaign.isActive ? 'is-active' : 'is-paused'}`
    });
    setTooltip(nameEl, 'Click to rename campaign');
    nameEl.setAttr('role', 'button');
    nameEl.setAttr('tabindex', '0');
    nameEl.setAttr('aria-label', `Rename campaign ${campaign.name}`);
    const openRenameModal = () => {
        const modal = new CampaignNameModal(plugin.app, {
            title: 'Rename Campaign',
            subtitle: `Enter a new name for "${campaign.name}"`,
            initialValue: campaign.name,
            actionLabel: 'Rename',
            onSubmit: async (nextName) => {
                const newName = nextName.trim();
                if (!newName) {
                    new Notice('Please enter a campaign name');
                    return false;
                }
                if (newName.toLowerCase() === campaign.name.toLowerCase()) {
                    return true;
                }
                if (!plugin.settings.authorProgress?.campaigns) return false;
                const existing = plugin.settings.authorProgress.campaigns.find(c => c.name.toLowerCase() === newName.toLowerCase());
                if (existing) {
                    new Notice('A campaign with this name already exists');
                    return false;
                }

                const resolvedBookTitle = resolveCampaignBookTitle(
                    plugin.settings.authorProgress,
                    campaign,
                    plugin.settings.sourcePath
                );
                const oldDefaultPath = buildCampaignEmbedPath({
                    bookTitle: resolvedBookTitle,
                    campaignName: campaign.name,
                    updateFrequency: campaign.updateFrequency,
                    aprExportQuality: campaign.aprExportQuality ?? plugin.settings.authorProgress?.defaults.aprExportQuality,
                    teaserEnabled: campaign.teaserReveal?.enabled ?? true,
                    exportFormat: resolveCampaignExportFormat(campaign)
                });
                const newDefaultPath = buildCampaignEmbedPath({
                    bookTitle: resolvedBookTitle,
                    campaignName: newName,
                    updateFrequency: campaign.updateFrequency,
                    aprExportQuality: campaign.aprExportQuality ?? plugin.settings.authorProgress?.defaults.aprExportQuality,
                    teaserEnabled: campaign.teaserReveal?.enabled ?? true,
                    exportFormat: resolveCampaignExportFormat(campaign)
                });

                plugin.settings.authorProgress.campaigns[index].name = newName;
                if (plugin.settings.authorProgress.campaigns[index].exportPath === oldDefaultPath) {
                    plugin.settings.authorProgress.campaigns[index].exportPath = newDefaultPath;
                }
                await plugin.saveSettings();
                onUpdate();
                return true;
            }
        });
        modal.open();
    };
    // SAFE: Settings sections are standalone functions without Component lifecycle; Obsidian manages settings tab cleanup
    nameEl.addEventListener('click', openRenameModal);
    // SAFE: Settings sections are standalone functions without Component lifecycle
    nameEl.addEventListener('keydown', (evt: KeyboardEvent) => {
        if (evt.key === 'Enter' || evt.key === ' ') {
            evt.preventDefault();
            openRenameModal();
        }
    });

    const scheduleBadge = getScheduleBadge(campaign);
    titleRow.createSpan({
        text: scheduleBadge.label,
        cls: `ert-campaign-refresh-badge ${scheduleBadge.cls}`
    });

    // Last published info
    const lastPublished = campaign.lastPublishedDate
        ? `Updated ${new Date(campaign.lastPublishedDate).toLocaleDateString()}`
        : 'Never published';
    rowLeft.createSpan({ text: lastPublished, cls: `${ERT_CLASSES.OBJECT_ROW_META} ert-campaign-last-published` });
    rowLeft.createSpan({
        text: getNextUpdateLabel(campaign),
        cls: `${ERT_CLASSES.OBJECT_ROW_META} ert-campaign-next-update`
    });

    if (expandedCampaigns.has(campaignKey)) {
        row.classList.add('is-expanded');
        renderCampaignDetails(wrapper, campaign, index, plugin, onUpdate);
    }

    // Actions
    const actions = row.createDiv({ cls: ERT_CLASSES.OBJECT_ROW_ACTIONS });
    const actionGroup = actions.createDiv({ cls: ERT_CLASSES.ICON_BTN_GROUP });

    // Toggle active
    const toggleBtn = actionGroup.createEl('button', { cls: ERT_CLASSES.ICON_BTN });
    setIcon(toggleBtn, campaign.isActive ? 'pause' : 'play');
    toggleBtn.addClass(campaign.isActive ? 'ert-iconBtn--active' : 'ert-iconBtn--paused');
    setTooltip(toggleBtn, campaign.isActive ? 'Pause campaign' : 'Resume campaign');
    toggleBtn.onclick = async () => {
        if (!plugin.settings.authorProgress?.campaigns) return;
        plugin.settings.authorProgress.campaigns[index].isActive = !campaign.isActive;
        await plugin.saveSettings();
        onUpdate();
    };

    // Edit (expand to show more options)
    const editBtn = actionGroup.createEl('button', { cls: ERT_CLASSES.ICON_BTN });
    setIcon(editBtn, 'settings');
    setTooltip(editBtn, 'Edit campaign settings');
    editBtn.onclick = () => {
        // Toggle expanded state - add details to wrapper, not row
        const existingDetails = wrapper.querySelector('.ert-campaign-details');
        if (existingDetails) {
            existingDetails.remove();
            row.classList.remove('is-expanded');
            expandedCampaigns.delete(campaignKey);
        } else {
            row.classList.add('is-expanded');
            expandedCampaigns.add(campaignKey);
            renderCampaignDetails(wrapper, campaign, index, plugin, onUpdate);
        }
    };

    // Delete
    const deleteBtn = actionGroup.createEl('button', { cls: `${ERT_CLASSES.ICON_BTN} ert-iconBtn--danger` });
    setIcon(deleteBtn, 'trash-2');
    setTooltip(deleteBtn, 'Delete campaign');
    deleteBtn.onclick = async () => {
        if (!plugin.settings.authorProgress?.campaigns) return;
        plugin.settings.authorProgress.campaigns.splice(index, 1);
        await plugin.saveSettings();
        new Notice(`Campaign "${campaign.name}" deleted`);
        onUpdate();
    };
}

/**
 * Render expanded campaign details for editing
 */
function renderCampaignDetails(
    parentRow: HTMLElement,
    campaign: AuthorProgressCampaign,
    index: number,
    plugin: RadialTimelinePlugin,
    onUpdate: () => void
): void {
    const details = parentRow.createDiv({ cls: `ert-campaign-details ${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}` });

    const freqSetting = details.createDiv({ cls: ['setting-item', 'ert-campaign-frequency-setting'] });
    const freqRow = freqSetting.createDiv({ cls: 'ert-campaign-frequency-setting__row' });
    const freqInfo = freqRow.createDiv({ cls: 'ert-settingComposite__info' });
    freqInfo.createDiv({ cls: 'setting-item-name', text: 'Update frequency' });
    freqInfo.createDiv({
        cls: 'setting-item-description',
        text: 'How often to auto-update this campaign\'s embed file. "Manual" requires clicking the Publish button.'
    });
    const freqControl = freqRow.createDiv({ cls: 'ert-settingComposite__control' });
    const frequencyDropdown = new DropdownComponent(freqControl);
    frequencyDropdown.selectEl.addClass('ert-input', 'ert-input--fit-selected'); // SAFE: removed unprefixed 'dropdown' class
    frequencyDropdown
        .addOption('manual', 'Manual Only')
        .addOption('daily', 'Daily')
        .addOption('weekly', 'Weekly')
        .addOption('monthly', 'Monthly')
        .setValue(campaign.updateFrequency || 'manual')
        .onChange(async (val) => {
            fitSelectToSelectedLabel(frequencyDropdown.selectEl, { minPx: 72, extraPx: 16 });
            if (!plugin.settings.authorProgress?.campaigns) return;
            const authorProgress = plugin.settings.authorProgress;
            const settings = authorProgress.defaults;
            if (!authorProgress.campaigns) return;
            const target = authorProgress.campaigns[index];
            const resolvedBookTitle = resolveCampaignBookTitle(
                authorProgress,
                target,
                plugin.settings.sourcePath
            );
            const oldDefaultPath = buildCampaignEmbedPath({
                bookTitle: resolvedBookTitle,
                campaignName: target.name,
                updateFrequency: target.updateFrequency,
                aprExportQuality: target.aprExportQuality ?? settings.aprExportQuality,
                teaserEnabled: target.teaserReveal?.enabled ?? true,
                exportFormat: resolveCampaignExportFormat(target)
            });
            target.updateFrequency = val as 'manual' | 'daily' | 'weekly' | 'monthly';
            if (settings.autoUpdateExportPath && target.exportPath === oldDefaultPath) {
                target.exportPath = buildCampaignEmbedPath({
                    bookTitle: resolvedBookTitle,
                    campaignName: target.name,
                    updateFrequency: target.updateFrequency,
                    aprExportQuality: target.aprExportQuality ?? settings.aprExportQuality,
                    teaserEnabled: target.teaserReveal?.enabled ?? true,
                    exportFormat: resolveCampaignExportFormat(target)
                });
            }
            await plugin.saveSettings();
            onUpdate();
        });
    fitSelectToSelectedLabel(frequencyDropdown.selectEl, { minPx: 72, extraPx: 16 });

    // Refresh threshold — subordinate to frequency setting (manual only)
    const isManual = !campaign.updateFrequency || campaign.updateFrequency === 'manual';
    const refreshWrap = freqSetting.createDiv({ cls: ['ert-campaign-frequency-setting__row', 'ert-campaign-frequency-setting__row--subordinate'] });
    if (!isManual) refreshWrap.addClass('ert-hidden');
    const refreshMin = 1;
    const refreshMax = 90;
    const getRefreshValue = () =>
        plugin.settings.authorProgress?.campaigns?.[index]?.refreshThresholdDays ?? campaign.refreshThresholdDays;
    const clampRefreshValue = (value: number) => Math.min(refreshMax, Math.max(refreshMin, Math.round(value)));

    const refreshInfo = refreshWrap.createDiv({ cls: 'ert-settingComposite__info' });
    refreshInfo.createDiv({ cls: 'setting-item-name', text: 'Refresh reminder threshold' });
    const refreshNote = refreshInfo.createDiv({ cls: 'setting-item-description' });
    refreshNote.setText(`Days before showing a refresh reminder in the timeline view. Currently: ${getRefreshValue()} days.`);

    const refreshControl = refreshWrap.createDiv({ cls: 'ert-settingComposite__control ert-campaign-refresh-controls' });
    const sliderEl = refreshControl.createEl('input', {
        type: 'range',
        attr: { min: String(refreshMin), max: String(refreshMax), step: '1', value: String(getRefreshValue()) }
    });
    const refreshValueInput = refreshControl.createEl('input', {
        type: 'number',
        cls: 'ert-input ert-input--2digit',
        value: String(getRefreshValue()),
        attr: { min: String(refreshMin), max: String(refreshMax), step: '1', 'aria-label': 'Refresh alert threshold (days)' }
    });

    const syncRefreshDisplay = (val: number) => {
        refreshNote.setText(`Days before showing a refresh reminder in the timeline view. Currently: ${val} days.`);
        if (document.activeElement !== refreshValueInput) refreshValueInput.value = String(val);
    };

    const commitRefreshValue = async (val: number) => {
        if (!plugin.settings.authorProgress?.campaigns) return;
        const nextValue = clampRefreshValue(val);
        plugin.settings.authorProgress.campaigns[index].refreshThresholdDays = nextValue;
        await plugin.saveSettings();
        syncRefreshDisplay(nextValue);
        refreshValueInput.value = String(nextValue);
        // Sync the schedule badge pill in the campaign header
        const badgeEl = parentRow.querySelector('.ert-campaign-refresh-badge');
        if (badgeEl) badgeEl.textContent = `Manual · ${nextValue}d`;
    };

    // SAFE: Settings sections are standalone functions without Component lifecycle; Obsidian manages settings tab cleanup
    sliderEl.addEventListener('input', () => {
        const nextValue = clampRefreshValue(Number(sliderEl.value));
        syncRefreshDisplay(nextValue);
    });
    sliderEl.addEventListener('change', () => {
        void commitRefreshValue(Number(sliderEl.value));
    });

    // SAFE: Settings sections are standalone functions without Component lifecycle; Obsidian manages settings tab cleanup
    refreshValueInput.addEventListener('input', () => {
        const parsed = Number(refreshValueInput.value);
        if (!Number.isFinite(parsed) || parsed < refreshMin || parsed > refreshMax) return;
        sliderEl.value = String(parsed);
        syncRefreshDisplay(parsed);
    });
    refreshValueInput.addEventListener('blur', () => {
        const parsed = Number(refreshValueInput.value);
        const nextValue = Number.isFinite(parsed) ? clampRefreshValue(parsed) : getRefreshValue();
        refreshValueInput.value = String(nextValue);
        sliderEl.value = String(nextValue);
        void commitRefreshValue(nextValue);
    });
    refreshValueInput.addEventListener('keydown', (evt: KeyboardEvent) => {
        if (evt.key === 'Enter') { evt.preventDefault(); refreshValueInput.blur(); }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // BOOK TITLE & PROJECT PATH OVERRIDES (Pro Campaign Feature)
    // ─────────────────────────────────────────────────────────────────────────

    // Book Title Override
    const bookTitleOverrideSetting = new Setting(details)
        .setName('Book title override')
        .setDesc('Optional: Override the display title for this campaign. Leave blank to inherit from Social Configuration.');

    bookTitleOverrideSetting.settingEl.addClass('ert-setting-full-width-input');

    bookTitleOverrideSetting.addText(text => {
        text.setPlaceholder('Leave blank to inherit')
            .setValue(campaign.bookTitleOverride || '');
        text.inputEl.addClass('ert-input--lg');

        const handleBlur = async () => {
            if (!plugin.settings.authorProgress?.campaigns) return;
            const val = text.getValue().trim();
            plugin.settings.authorProgress.campaigns[index].bookTitleOverride = val || undefined;
            await plugin.saveSettings();
            onUpdate();
        };

        // SAFE: Settings sections rebuild DOM on any change; input element cleanup handles listener
        text.inputEl.addEventListener('blur', handleBlur);
        // SAFE: Settings sections rebuild DOM on any change; input element cleanup handles listener
        text.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                text.inputEl.blur();
            }
        });
    });

    // Project Path Override
    const projectPathOverrideSetting = new Setting(details)
        .setName('Project path override')
        .setDesc('Optional: Override the project folder path for this campaign. Leave blank to inherit from Social Configuration.');

    projectPathOverrideSetting.settingEl.addClass('ert-setting-full-width-input');

    projectPathOverrideSetting.addText(text => {
        const successClass = 'ert-input--success';
        const errorClass = 'ert-input--error';

        const clearInputState = () => {
            text.inputEl.removeClass(successClass);
            text.inputEl.removeClass(errorClass);
        };

        const flashError = (timeout = 2000) => {
            text.inputEl.addClass(errorClass);
            window.setTimeout(() => {
                text.inputEl.removeClass(errorClass);
            }, timeout);
        };

        const flashSuccess = (timeout = 1000) => {
            text.inputEl.addClass(successClass);
            window.setTimeout(() => {
                text.inputEl.removeClass(successClass);
            }, timeout);
        };

        text.setPlaceholder('Leave blank to inherit')
            .setValue(campaign.projectPathOverride || '');
        text.inputEl.addClass('ert-input--lg');

        text.onChange(() => {
            clearInputState();
        });

        new ProjectPathSuggest(plugin.app, text.inputEl, plugin, text, {
            onValidPath: async (normalized) => {
                if (!plugin.settings.authorProgress?.campaigns) return;
                plugin.settings.authorProgress.campaigns[index].projectPathOverride = normalized;
                await plugin.saveSettings();
                onUpdate();
            },
            getSavedValue: () => plugin.settings.authorProgress?.campaigns?.[index]?.projectPathOverride || '',
            successClass,
            errorClass
        });

        const handleBlur = async () => {
            const val = text.getValue().trim();
            clearInputState();

            if (!val) {
                // Empty is allowed - means inherit from Social Configuration
                if (!plugin.settings.authorProgress?.campaigns) return;
                plugin.settings.authorProgress.campaigns[index].projectPathOverride = undefined;
                await plugin.saveSettings();
                flashSuccess();
                onUpdate();
                return;
            }

            // Validate the path exists
            const isValid = await validateAndRememberProjectPath(val, plugin);

            if (!isValid) {
                // Invalid path - revert to last saved value
                const savedValue = plugin.settings.authorProgress?.campaigns?.[index]?.projectPathOverride || '';
                text.setValue(savedValue);
                flashError();
                new Notice(`Invalid project path: "${val}" does not exist or is not a folder. Reverting to saved value.`);
                return;
            }

            // Save if valid
            flashSuccess();
            if (!plugin.settings.authorProgress?.campaigns) return;
            plugin.settings.authorProgress.campaigns[index].projectPathOverride = val;
            await plugin.saveSettings();
            onUpdate();
        };

        // SAFE: Settings sections rebuild DOM on any change; input element cleanup handles listener
        text.inputEl.addEventListener('blur', handleBlur);
        // SAFE: Settings sections rebuild DOM on any change; input element cleanup handles listener
        text.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                text.inputEl.blur();
            }
        });
    });

    // Embed path (with validation and reset)
    const resolvedBookTitle = resolveCampaignBookTitle(
        plugin.settings.authorProgress,
        campaign,
        plugin.settings.sourcePath
    );
    const defaultPath = buildCampaignEmbedPath({
        bookTitle: resolvedBookTitle,
        campaignName: campaign.name,
        updateFrequency: campaign.updateFrequency,
        aprExportQuality: campaign.aprExportQuality ?? plugin.settings.authorProgress?.defaults.aprExportQuality,
        teaserEnabled: campaign.teaserReveal?.enabled ?? true,
        exportFormat: resolveCampaignExportFormat(campaign)
    });
    const exportPathSetting = new Setting(details)
        .setName('Export path')
        .setDesc('Location for the exported campaign file.');

    exportPathSetting.settingEl.addClass('ert-setting-full-width-input');

    exportPathSetting.addText(text => {
        const successClass = 'ert-input--success';
        const errorClass = 'ert-input--error';
        const clearInputState = () => {
            text.inputEl.removeClass(successClass);
            text.inputEl.removeClass(errorClass);
        };
        const flashError = (timeout = 2000) => {
            text.inputEl.addClass(errorClass);
            window.setTimeout(() => {
                text.inputEl.removeClass(errorClass);
            }, timeout);
        };
        const flashSuccess = (timeout = 1000) => {
            text.inputEl.addClass(successClass);
            window.setTimeout(() => {
                text.inputEl.removeClass(successClass);
            }, timeout);
        };
        text.setPlaceholder(defaultPath)
            .setValue(campaign.exportPath);
        text.inputEl.addClass('ert-input--full');

        // Validate on blur
        const handleBlur = async () => {
            const val = text.getValue().trim();
            clearInputState();

            const format = resolveCampaignExportFormat(plugin.settings.authorProgress?.campaigns?.[index] ?? campaign);
            const requiredExt = `.${format}`;
            if (val && !val.toLowerCase().endsWith(requiredExt)) {
                flashError();
                new Notice(`Export path must end with ${requiredExt}`);
                return;
            }

            if (val) {
                flashSuccess();
            }

            if (!plugin.settings.authorProgress?.campaigns) return;
            plugin.settings.authorProgress.campaigns[index].exportPath = val || defaultPath;
            await plugin.saveSettings();
        };

        // SAFE: Settings sections rebuild DOM on any change; input element cleanup handles listener
        text.inputEl.addEventListener('blur', handleBlur);
    });

    // Reset button
    exportPathSetting.addExtraButton(btn => {
        btn.setIcon('rotate-ccw')
            .setTooltip('Reset to default path')
            .onClick(async () => {
                if (!plugin.settings.authorProgress?.campaigns) return;
                plugin.settings.authorProgress.campaigns[index].exportPath = defaultPath;
                await plugin.saveSettings();
                // Re-render to update the text input
                onUpdate();
            });
    });

    // Export Quality
    const exportQualitySetting = new Setting(details)
        .setName('Export quality')
        .setDesc('Standard (1200px) for social media. Ultra (2400px) for print and high-DPI displays.')
        .addDropdown(drop => {
            drop.selectEl.addClass('ert-input', 'ert-input--lg');
            const globalQuality = plugin.settings.authorProgress?.defaults.aprExportQuality ?? 'standard';
            const latestCampaign = plugin.settings.authorProgress?.campaigns?.[index];
            const campaignQuality = latestCampaign?.aprExportQuality ?? campaign.aprExportQuality;
            const defaultLabel = globalQuality === 'ultra' ? 'Ultra 2400px' : 'Standard 1200px';
            drop.addOption('', `Default (${defaultLabel})`);
            drop.addOption('standard', 'Standard (1200px)');
            drop.addOption('ultra', 'Ultra (2400px)');
            drop.setValue(campaignQuality ?? '');
            drop.onChange(async (val) => {
                if (!plugin.settings.authorProgress?.campaigns) return;
                const authorProgress = plugin.settings.authorProgress;
                const settings = authorProgress.defaults;
                if (!authorProgress.campaigns) return;
                const target = authorProgress.campaigns[index];
                const resolvedBookTitle = resolveCampaignBookTitle(
                    authorProgress,
                    target,
                    plugin.settings.sourcePath
                );
                const oldDefaultPath = buildCampaignEmbedPath({
                    bookTitle: resolvedBookTitle,
                    campaignName: target.name,
                    updateFrequency: target.updateFrequency,
                    aprExportQuality: target.aprExportQuality ?? settings.aprExportQuality,
                    teaserEnabled: target.teaserReveal?.enabled ?? true,
                    exportFormat: resolveCampaignExportFormat(target)
                });
                target.aprExportQuality = val === '' ? undefined : (val as 'standard' | 'ultra');
                if (settings.autoUpdateExportPath && target.exportPath === oldDefaultPath) {
                    target.exportPath = buildCampaignEmbedPath({
                        bookTitle: resolvedBookTitle,
                        campaignName: target.name,
                        updateFrequency: target.updateFrequency,
                        aprExportQuality: target.aprExportQuality ?? settings.aprExportQuality,
                        teaserEnabled: target.teaserReveal?.enabled ?? true,
                        exportFormat: resolveCampaignExportFormat(target)
                    });
                }
                await plugin.saveSettings();
                onUpdate();
            });
        });

    // ─────────────────────────────────────────────────────────────────────────
    // TEASER REVEAL (Progressive Reveal)
    // ─────────────────────────────────────────────────────────────────────────
    const teaserSection = details.createDiv({ cls: 'ert-campaign-teaser-section' });

    // Container for teaser content that can be re-rendered
    const teaserContentContainer = teaserSection.createDiv({ cls: `${ERT_CLASSES.STACK} ert-teaser` });

    // Function to render teaser content (toggle + optional presets/previews)
    const renderTeaserContent = () => {
        teaserContentContainer.empty();

        const currentCampaign = plugin.settings.authorProgress?.campaigns?.[index];
        if (!currentCampaign) return;

        const teaserSettings = currentCampaign.teaserReveal ?? { enabled: true, preset: 'standard' as TeaserPreset };

        // Combined header with toggle
        const teaserToggleSetting = new Setting(teaserContentContainer)
            .setName('Teaser reveal')
            .setDesc('Automatically reveal more detail as your book progresses. Creates anticipation for your audience.')
            .addToggle(toggle => {
                toggle.setValue(teaserSettings.enabled)
                    .onChange(async (val) => {
                        if (!plugin.settings.authorProgress?.campaigns) return;
                        const target = plugin.settings.authorProgress.campaigns[index];
                        if (!target.teaserReveal) {
                            target.teaserReveal = { enabled: true, preset: 'standard' };
                        }
                        target.teaserReveal.enabled = val;
                        await plugin.saveSettings();
                        // Re-render teaser section
                        renderTeaserContent();
                    });
            });


        // Add calendar icon to the teaser setting
        const teaserNameEl = teaserToggleSetting.nameEl;
        const iconSpan = teaserNameEl.createSpan({ cls: 'ert-teaser__icon' });
        setIcon(iconSpan, 'calendar-clock');
        teaserNameEl.prepend(iconSpan);

        // Only show preset and preview if teaser is enabled
        if (teaserSettings.enabled) {
            const isCustom = teaserSettings.preset === 'custom';

            // Container for schedule (wraps both rows)
            const scheduleContainer = teaserContentContainer.createDiv({
                cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ert-teaser__schedule`
            });

            // Row 1: Label + Dropdown (always shown)
            const scheduleRow = scheduleContainer.createDiv({ cls: `${ERT_CLASSES.INLINE} ert-teaser__scheduleRow` });
            scheduleRow.createSpan({ text: 'Reveal Schedule', cls: 'ert-teaser__scheduleLabel' });

            const dropdown = scheduleRow.createEl('select', { cls: 'ert-teaser__preset ert-input ert-input--lg' });
            const options = [
                { value: 'slow', label: 'Slow (15/40/70%)' },
                { value: 'standard', label: 'Standard (10/30/60%)' },
                { value: 'fast', label: 'Fast (5/20/45%)' },
                { value: 'custom', label: 'Custom' },
            ];
            options.forEach(opt => {
                const optEl = dropdown.createEl('option', { value: opt.value, text: opt.label });
                if (opt.value === teaserSettings.preset) optEl.selected = true;
            });
            dropdown.onchange = async () => {
                if (!plugin.settings.authorProgress?.campaigns) return;
                const target = plugin.settings.authorProgress.campaigns[index];
                if (!target.teaserReveal) {
                    target.teaserReveal = { enabled: true, preset: 'standard' };
                }
                const val = dropdown.value as TeaserPreset;
                target.teaserReveal.preset = val;
                // Initialize custom thresholds from current preset values if switching to custom
                if (val === 'custom' && !target.teaserReveal.customThresholds) {
                    const currentThresholds = getTeaserThresholds(teaserSettings.preset, undefined);
                    target.teaserReveal.customThresholds = { ...currentThresholds };
                }
                await plugin.saveSettings();
                renderTeaserContent();
            };

            // Row 2: Custom inputs (4-column grid to align with 4 previews below)
            if (isCustom) {
                const customThresholds = teaserSettings.customThresholds ?? { scenes: 10, colors: 30, full: 60 };
                const customRow = scheduleContainer.createDiv({ cls: 'ert-teaser__customRow' });

                // Column 1: Save button (aligns with TEASER preview)
                const saveCell = customRow.createDiv({ cls: 'ert-teaser__saveCell' });
                const saveBtn = saveCell.createEl('button', {
                    text: 'Save',
                    cls: 'ert-btn ert-btn--standard-pro'
                });

                // Columns 2-4: Input fields (align with SCENES, COLORS, FULL)
                const fields: { key: 'scenes' | 'colors' | 'full'; label: string }[] = [
                    { key: 'scenes', label: 'Scenes' },
                    { key: 'colors', label: 'Colors' },
                    { key: 'full', label: 'Full' },
                ];

                const inputs: Record<string, HTMLInputElement> = {};

                fields.forEach(({ key, label }) => {
                    const field = customRow.createDiv({ cls: 'ert-teaser__field' });
                    field.createSpan({ text: label, cls: 'ert-teaser__fieldLabel' });
                    const input = field.createEl('input', {
                        type: 'text',
                        cls: 'ert-teaser__fieldInput',
                        value: String(customThresholds[key])
                    });
                    input.maxLength = 2;
                    inputs[key] = input;
                });

                const validateAndSave = async () => {
                    const vals = {
                        scenes: parseInt(inputs.scenes.value) || 0,
                        colors: parseInt(inputs.colors.value) || 0,
                        full: parseInt(inputs.full.value) || 0,
                    };

                    // Validate range (1-99)
                    for (const [k, v] of Object.entries(vals)) {
                        if (v < 1 || v > 99) {
                            new Notice(`${k} must be between 1 and 99`);
                            return;
                        }
                    }

                    // Validate order: scenes < colors < full
                    if (vals.scenes >= vals.colors || vals.colors >= vals.full) {
                        new Notice('Thresholds must be in ascending order');
                        return;
                    }

                    // Save
                    if (!plugin.settings.authorProgress?.campaigns) return;
                    const target = plugin.settings.authorProgress.campaigns[index];
                    if (!target.teaserReveal) {
                        target.teaserReveal = { enabled: true, preset: 'custom' };
                    }
                    target.teaserReveal.customThresholds = vals;
                    await plugin.saveSettings();
                    new Notice('Custom thresholds saved');
                    renderTeaserContent();
                };

                saveBtn.onclick = validateAndSave;

                // Validate on blur for each input
                Object.values(inputs).forEach(input => {
                    input.onblur = () => {
                        const val = parseInt(input.value) || 0;
                        if (val < 1) input.value = '1';
                        else if (val > 99) input.value = '99';
                    };
                });
            }

            // Show SVG previews of each reveal stage
            const thresholds = getTeaserThresholds(teaserSettings.preset, teaserSettings.customThresholds);
            const svgPreviewRow = teaserContentContainer.createDiv({ cls: 'ert-teaser__previewRow' });
            renderTeaserStagesPreviews(svgPreviewRow, plugin, currentCampaign, index, thresholds, renderTeaserContent);
        }
    };

    // Initial render
    renderTeaserContent();


}

/**
 * Render mini SVG previews for each teaser reveal stage (4 stages)
 * Clickable cards allow disabling middle stages
 */
async function renderTeaserStagesPreviews(
    container: HTMLElement,
    plugin: RadialTimelinePlugin,
    campaign: AuthorProgressCampaign,
    campaignIndex: number,
    thresholds: { scenes: number; colors: number; full: number },
    onUpdate: () => void
): Promise<void> {
    const authorProgress = plugin.settings.authorProgress;
    const settings = authorProgress?.defaults;
    if (!authorProgress || !settings) return;

    // Get scenes for preview
    const scenes = await getAllScenes(plugin.app, plugin);
    if (scenes.length === 0) {
        container.createEl('p', {
            text: 'No scenes to preview. Add scenes to see teaser stages.',
            cls: 'ert-teaser__empty'
        });
        return;
    }

    const publishStageLabel = plugin.calculateCompletionEstimate(scenes)?.stage ?? 'Zero';
    const showRtAttribution = hasProFeatureAccess(plugin)
        ? settings?.aprShowRtAttribution !== false
        : true;

    // Get disabled stages
    const disabledStages = campaign.teaserReveal?.disabledStages ?? {};

    // 4 stages with their properties (labels/icons from TEASER_LEVEL_INFO)
    // Note: Ring stage uses 5% for preview (shows ring) even though threshold is 0%
    const stages: {
        level: TeaserRevealLevel;
        label: string;
        progress: number;
        icon: string;
        canDisable: boolean;
        isDisabled: boolean;
        disableKey?: 'scenes' | 'colors';
    }[] = [
            { level: 'bar', label: TEASER_LEVEL_INFO.bar.label, progress: 5, icon: TEASER_LEVEL_INFO.bar.icon, canDisable: false, isDisabled: false },
            { level: 'scenes', label: TEASER_LEVEL_INFO.scenes.label, progress: thresholds.scenes, icon: TEASER_LEVEL_INFO.scenes.icon, canDisable: true, isDisabled: !!disabledStages.scenes, disableKey: 'scenes' },
            { level: 'colors', label: TEASER_LEVEL_INFO.colors.label, progress: thresholds.colors, icon: TEASER_LEVEL_INFO.colors.icon, canDisable: true, isDisabled: !!disabledStages.colors, disableKey: 'colors' },
            { level: 'full', label: TEASER_LEVEL_INFO.full.label, progress: thresholds.full, icon: TEASER_LEVEL_INFO.full.icon, canDisable: false, isDisabled: false },
        ];

    stages.forEach(stage => {
        const revealOptions = teaserLevelToRevealOptions(stage.level);

        const cardClasses: string[] = [ERT_CLASSES.STAGE_CARD];
        if (stage.isDisabled) cardClasses.push('is-disabled');
        if (stage.canDisable) cardClasses.push('is-clickable');

        const card = container.createDiv({ cls: cardClasses.join(' ') });

        // Click to toggle for middle stages
        if (stage.canDisable && stage.disableKey) {
            const key = stage.disableKey;
            setTooltip(card, stage.isDisabled ? 'Click to enable this stage' : 'Click to skip this stage');
            card.onclick = async () => {
                if (!plugin.settings.authorProgress?.campaigns) return;
                const targetCampaign = plugin.settings.authorProgress.campaigns[campaignIndex];
                if (!targetCampaign.teaserReveal) {
                    targetCampaign.teaserReveal = { enabled: true, preset: 'standard' };
                }
                if (!targetCampaign.teaserReveal.disabledStages) {
                    targetCampaign.teaserReveal.disabledStages = {};
                }
                // Toggle the disabled state
                targetCampaign.teaserReveal.disabledStages[key] = !stage.isDisabled;
                await plugin.saveSettings();
                onUpdate();
            };
        }

        // SVG preview container
        const svgContainer = card.createDiv({ cls: 'ert-stageCard__svg' });

        try {
            const resolvedBookTitle = resolveCampaignBookTitle(
                authorProgress,
                campaign,
                plugin.settings.sourcePath
            ) ?? 'Book';
            const isRingOnly = stage.level === 'bar';
            const { svgString } = createAprSVG(scenes, {
                size: 'small',
                progressPercent: stage.progress,
                bookTitle: resolvedBookTitle,
                authorName: settings.authorName || '',
                authorUrl: '',
                showScenes: isRingOnly ? false : revealOptions.showScenes,
                showSubplots: revealOptions.showSubplots,
                showActs: revealOptions.showActs,
                showStatusColors: revealOptions.showStatusColors,
                showStageColors: revealOptions.showStageColors,
                grayCompletedScenes: revealOptions.grayCompletedScenes,
                grayscaleScenes: revealOptions.grayscaleScenes,
                showProgressPercent: !isRingOnly,
                showBranding: !isRingOnly,
                centerMark: 'none',
                stageColors: plugin.settings.publishStageColors,
                actCount: plugin.settings.actCount,
                backgroundColor: campaign.customBackgroundColor ?? settings.aprBackgroundColor,
                transparentCenter: campaign.customTransparent ?? settings.aprCenterTransparent,
                bookAuthorColor: settings.aprBookAuthorColor ?? (plugin.settings.publishStageColors?.Press),
                authorColor: settings.aprAuthorColor ?? settings.aprBookAuthorColor ?? (plugin.settings.publishStageColors?.Press),
                engineColor: settings.aprEngineColor,
                percentNumberColor: settings.aprPercentNumberColor ?? settings.aprBookAuthorColor ?? (plugin.settings.publishStageColors?.Press),
                percentSymbolColor: settings.aprPercentSymbolColor ?? settings.aprBookAuthorColor ?? (plugin.settings.publishStageColors?.Press),
                theme: campaign.customTheme ?? settings.aprTheme ?? 'dark',
                spokeColor: settings.aprSpokeColorMode === 'custom' ? settings.aprSpokeColor : undefined,
                publishStageLabel,
                showRtAttribution,
                teaserRevealEnabled: campaign.teaserReveal?.enabled ?? false,
                // Typography settings
                bookTitleFontFamily: settings.aprBookTitleFontFamily,
                bookTitleFontWeight: settings.aprBookTitleFontWeight,
                bookTitleFontItalic: settings.aprBookTitleFontItalic,
                bookTitleFontSize: settings.aprBookTitleFontSize,
                authorNameFontFamily: settings.aprAuthorNameFontFamily,
                authorNameFontWeight: settings.aprAuthorNameFontWeight,
                authorNameFontItalic: settings.aprAuthorNameFontItalic,
                authorNameFontSize: settings.aprAuthorNameFontSize,
                percentNumberFontSize1Digit: settings.aprPercentNumberFontSize1Digit,
                percentNumberFontSize2Digit: settings.aprPercentNumberFontSize2Digit,
                percentNumberFontSize3Digit: settings.aprPercentNumberFontSize3Digit,
                rtBadgeFontFamily: settings.aprRtBadgeFontFamily,
                rtBadgeFontWeight: settings.aprRtBadgeFontWeight,
                rtBadgeFontItalic: settings.aprRtBadgeFontItalic,
                rtBadgeFontSize: settings.aprRtBadgeFontSize,
                portableSvg: true
            });

            svgContainer.innerHTML = svgString; // SAFE: innerHTML used for SVG preview injection
        } catch {
            svgContainer.createEl('span', { text: '⚠', cls: 'ert-stageCard__error' });
        }

        // Disabled overlay
        if (stage.isDisabled) {
            const overlay = card.createDiv({ cls: 'ert-stageCard__overlay' });
            overlay.setText('SKIPPED');
        }

        // Label row
        const labelRow = card.createDiv({ cls: 'ert-stageCard__labelRow' });
        const iconSpan = labelRow.createSpan({ cls: 'ert-stageCard__icon' });
        setIcon(iconSpan, stage.icon);
        labelRow.createSpan({ text: `${stage.progress}%`, cls: 'ert-stageCard__percent' });

        card.createDiv({ cls: 'ert-stageCard__name', text: stage.label });
    });
}
