/**
 * Campaign Manager Section (Pro Feature)
 * Allows managing multiple APR campaigns with independent refresh schedules
 */

import { App, Setting, setIcon, ButtonComponent, TextComponent, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { AprCampaign, TeaserPreset, TeaserRevealLevel } from '../../types/settings';
import { isProfessionalActive } from './ProfessionalSection';
import { TEASER_PRESETS, TEASER_LEVEL_INFO, getTeaserThresholds, teaserLevelToRevealOptions } from '../../renderer/apr/AprConstants';
import { createAprSVG } from '../../renderer/apr/AprRenderer';
import { getAllScenes } from '../../utils/manuscript';

export interface CampaignManagerProps {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
    onCampaignChange?: () => void;
}

/**
 * Generate a unique campaign ID
 */
function generateCampaignId(): string {
    return `campaign-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new campaign with default values
 */
export function createDefaultCampaign(name: string): AprCampaign {
    return {
        id: generateCampaignId(),
        name,
        description: '',
        isActive: true,
        refreshThresholdDays: 7,
        lastPublishedDate: undefined,
        embedPath: `Radial Timeline/Social/${name.toLowerCase().replace(/\s+/g, '-')}-progress.svg`,
        showSubplots: true,
        showActs: true,
        showStatus: true,
        showProgressPercent: true,
        aprSize: 'standard',
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
export function campaignNeedsRefresh(campaign: AprCampaign): boolean {
    if (!campaign.isActive) return false;
    if (!campaign.lastPublishedDate) return true; // Never published
    
    const last = new Date(campaign.lastPublishedDate).getTime();
    const now = Date.now();
    const diffDays = (now - last) / (1000 * 60 * 60 * 24);
    
    return diffDays > campaign.refreshThresholdDays;
}

/**
 * Render the Campaign Manager section
 */
export function renderCampaignManagerSection({ app, plugin, containerEl, onCampaignChange }: CampaignManagerProps): void {
    const isProActive = isProfessionalActive(plugin);
    const campaigns = plugin.settings.authorProgress?.campaigns || [];
    
    // ─────────────────────────────────────────────────────────────────────────
    // CAMPAIGN MANAGER CARD
    // ─────────────────────────────────────────────────────────────────────────
    const card = containerEl.createDiv({ cls: 'rt-glass-card rt-campaign-manager-card rt-apr-stack-gap' });
    
    // Header with Pro badge
    const headerRow = card.createDiv({ cls: 'rt-campaign-manager-header' });
    const titleArea = headerRow.createDiv({ cls: 'rt-campaign-manager-title-area' });
    
    const proBadge = titleArea.createSpan({ cls: 'rt-pro-feature-badge' });
    setIcon(proBadge, 'signature');
    proBadge.createSpan({ text: 'Pro' });
    
    titleArea.createEl('span', { text: 'Campaign Manager', cls: 'setting-item-name' });
    
    // Description
    card.createEl('p', { 
        text: 'Create multiple embed destinations with independent refresh schedules. Perfect for managing Kickstarter, Patreon, newsletter, and website embeds separately.',
        cls: 'rt-campaign-manager-desc'
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // PRO GATE - Coming Soon Overlay
    // ─────────────────────────────────────────────────────────────────────────
    if (!isProActive) {
        const overlay = card.createDiv({ cls: 'rt-campaign-manager-overlay' });
        overlay.createEl('div', { cls: 'rt-campaign-manager-coming-soon', text: 'Coming Soon with Pro' });
        card.addClass('rt-campaign-manager-locked');
        return; // Don't render the rest if Pro is not active
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // CAMPAIGN LIST
    // ─────────────────────────────────────────────────────────────────────────
    const listContainer = card.createDiv({ cls: 'rt-campaign-list' });
    
    if (campaigns.length === 0) {
        const emptyState = listContainer.createDiv({ cls: 'rt-campaign-empty-state' });
        emptyState.createEl('p', { text: 'No campaigns yet. Create your first campaign to track multiple embed destinations.' });
    } else {
        campaigns.forEach((campaign, index) => {
            renderCampaignRow(listContainer, campaign, index, plugin, () => {
                rerenderCampaignList();
                onCampaignChange?.();
            });
        });
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // ADD CAMPAIGN BUTTON
    // ─────────────────────────────────────────────────────────────────────────
    const addSection = card.createDiv({ cls: 'rt-campaign-add-section' });
    
    const addRow = addSection.createDiv({ cls: 'rt-campaign-add-row' });
    let nameInput: TextComponent;
    
    new Setting(addRow)
        .setName('New Campaign')
        .setDesc('Give your campaign a name (e.g., "Kickstarter", "Newsletter")')
        .addText(text => {
            nameInput = text;
            text.setPlaceholder('Campaign name...');
        })
        .addButton(button => {
            button.setButtonText('Add Campaign')
                .setCta()
                .onClick(async () => {
                    const name = nameInput.getValue().trim();
                    if (!name) {
                        new Notice('Please enter a campaign name');
                        return;
                    }
                    
                    // Check for duplicate names
                    const existing = campaigns.find(c => c.name.toLowerCase() === name.toLowerCase());
                    if (existing) {
                        new Notice('A campaign with this name already exists');
                        return;
                    }
                    
                    // Create and add the campaign
                    const newCampaign = createDefaultCampaign(name);
                    if (!plugin.settings.authorProgress) return;
                    if (!plugin.settings.authorProgress.campaigns) {
                        plugin.settings.authorProgress.campaigns = [];
                    }
                    plugin.settings.authorProgress.campaigns.push(newCampaign);
                    await plugin.saveSettings();
                    
                    nameInput.setValue('');
                    new Notice(`Campaign "${name}" created!`);
                    rerenderCampaignList();
                    onCampaignChange?.();
                });
        });
    
    // ─────────────────────────────────────────────────────────────────────────
    // QUICK TEMPLATES
    // ─────────────────────────────────────────────────────────────────────────
    const templatesSection = card.createDiv({ cls: 'rt-campaign-templates' });
    templatesSection.createEl('h5', { text: 'Quick Start Templates', cls: 'rt-campaign-templates-title' });
    
    const templateRow = templatesSection.createDiv({ cls: 'rt-campaign-template-row' });
    
    const templates = [
        { name: 'Kickstarter', icon: 'rocket', days: 7 },
        { name: 'Patreon', icon: 'heart', days: 14 },
        { name: 'Newsletter', icon: 'mail', days: 14 },
        { name: 'Website', icon: 'globe', days: 30 },
    ];
    
    templates.forEach(template => {
        const btn = templateRow.createEl('button', { cls: 'rt-campaign-template-btn' });
        const iconSpan = btn.createSpan();
        setIcon(iconSpan, template.icon);
        btn.createSpan({ text: template.name });
        
        // Check if already exists
        const exists = campaigns.find(c => c.name.toLowerCase() === template.name.toLowerCase());
        if (exists) {
            btn.addClass('rt-campaign-template-used');
            btn.disabled = true;
        }
        
        btn.onclick = async () => {
            if (exists) return;
            
            const newCampaign = createDefaultCampaign(template.name);
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
            const emptyState = listContainer.createDiv({ cls: 'rt-campaign-empty-state' });
            emptyState.createEl('p', { text: 'No campaigns yet. Create your first campaign to track multiple embed destinations.' });
        } else {
            updatedCampaigns.forEach((campaign, index) => {
                renderCampaignRow(listContainer, campaign, index, plugin, () => {
                    rerenderCampaignList();
                    onCampaignChange?.();
                });
            });
        }
        
        // Update template button states
        templateRow.empty();
        templates.forEach(template => {
            const btn = templateRow.createEl('button', { cls: 'rt-campaign-template-btn' });
            const iconSpan = btn.createSpan();
            setIcon(iconSpan, template.icon);
            btn.createSpan({ text: template.name });
            
            const exists = updatedCampaigns.find(c => c.name.toLowerCase() === template.name.toLowerCase());
            if (exists) {
                btn.addClass('rt-campaign-template-used');
                btn.disabled = true;
            }
            
            btn.onclick = async () => {
                if (exists) return;
                
                const newCampaign = createDefaultCampaign(template.name);
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
    campaign: AprCampaign, 
    index: number, 
    plugin: RadialTimelinePlugin,
    onUpdate: () => void
): void {
    const needsRefresh = campaignNeedsRefresh(campaign);
    
    // Create a wrapper to contain both the row and expandable details
    const wrapper = container.createDiv({ cls: 'rt-campaign-wrapper' });
    
    const rowClasses = ['rt-campaign-row'];
    if (needsRefresh) rowClasses.push('rt-campaign-needs-refresh');
    if (!campaign.isActive) rowClasses.push('rt-campaign-inactive');
    
    const row = wrapper.createDiv({ cls: rowClasses.join(' ') });
    
    // Status indicator
    const statusIndicator = row.createDiv({ cls: 'rt-campaign-status' });
    if (needsRefresh) {
        setIcon(statusIndicator, 'alert-triangle');
        statusIndicator.title = 'Needs refresh';
    } else if (campaign.isActive) {
        setIcon(statusIndicator, 'check-circle');
        statusIndicator.title = 'Up to date';
    } else {
        setIcon(statusIndicator, 'pause-circle');
        statusIndicator.title = 'Paused';
    }
    
    // Campaign info
    const infoArea = row.createDiv({ cls: 'rt-campaign-info' });
    const nameRow = infoArea.createDiv({ cls: 'rt-campaign-name-row' });
    nameRow.createSpan({ text: campaign.name, cls: 'rt-campaign-name' });
    
    if (campaign.refreshThresholdDays) {
        nameRow.createSpan({ 
            text: `${campaign.refreshThresholdDays}d refresh`, 
            cls: 'rt-campaign-refresh-badge' 
        });
    }
    
    // Last published info
    const lastPublished = campaign.lastPublishedDate 
        ? `Updated ${new Date(campaign.lastPublishedDate).toLocaleDateString()}`
        : 'Never published';
    infoArea.createSpan({ text: lastPublished, cls: 'rt-campaign-last-published' });
    
    // Actions
    const actions = row.createDiv({ cls: 'rt-campaign-actions' });
    
    // Toggle active
    const toggleBtn = actions.createEl('button', { cls: 'rt-campaign-action-btn' });
    setIcon(toggleBtn, campaign.isActive ? 'pause' : 'play');
    toggleBtn.title = campaign.isActive ? 'Pause campaign' : 'Resume campaign';
    toggleBtn.onclick = async () => {
        if (!plugin.settings.authorProgress?.campaigns) return;
        plugin.settings.authorProgress.campaigns[index].isActive = !campaign.isActive;
        await plugin.saveSettings();
        onUpdate();
    };
    
    // Edit (expand to show more options)
    const editBtn = actions.createEl('button', { cls: 'rt-campaign-action-btn' });
    setIcon(editBtn, 'settings');
    editBtn.title = 'Edit campaign settings';
    editBtn.onclick = () => {
        // Toggle expanded state - add details to wrapper, not row
        const existingDetails = wrapper.querySelector('.rt-campaign-details');
        if (existingDetails) {
            existingDetails.remove();
            row.classList.remove('rt-campaign-row-expanded');
        } else {
            row.classList.add('rt-campaign-row-expanded');
            renderCampaignDetails(wrapper, campaign, index, plugin, onUpdate);
        }
    };
    
    // Delete
    const deleteBtn = actions.createEl('button', { cls: 'rt-campaign-action-btn rt-campaign-delete-btn' });
    setIcon(deleteBtn, 'trash-2');
    deleteBtn.title = 'Delete campaign';
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
    campaign: AprCampaign,
    index: number,
    plugin: RadialTimelinePlugin,
    onUpdate: () => void
): void {
    const details = parentRow.createDiv({ cls: 'rt-campaign-details' });
    
    // Refresh threshold
    new Setting(details)
        .setName('Refresh Reminder')
        .setDesc('Days before showing a refresh reminder')
        .addSlider(slider => {
            slider.setLimits(1, 90, 1)
                .setValue(campaign.refreshThresholdDays)
                .setDynamicTooltip()
                .onChange(async (val) => {
                    if (!plugin.settings.authorProgress?.campaigns) return;
                    plugin.settings.authorProgress.campaigns[index].refreshThresholdDays = val;
                    await plugin.saveSettings();
                });
        });
    
    // Embed path
    new Setting(details)
        .setName('Embed Path')
        .setDesc('Where to save the SVG for this campaign')
        .addText(text => {
            text.setValue(campaign.embedPath)
                .onChange(async (val) => {
                    if (!plugin.settings.authorProgress?.campaigns) return;
                    plugin.settings.authorProgress.campaigns[index].embedPath = val;
                    await plugin.saveSettings();
                });
        });
    
    // Size
    new Setting(details)
        .setName('Export Size')
        .addDropdown(drop => {
            drop.addOption('compact', 'Small (600px)')
                .addOption('standard', 'Medium (800px)')
                .addOption('large', 'Large (1000px)')
                .setValue(campaign.aprSize)
                .onChange(async (val) => {
                    if (!plugin.settings.authorProgress?.campaigns) return;
                    plugin.settings.authorProgress.campaigns[index].aprSize = val as 'compact' | 'standard' | 'large';
                    await plugin.saveSettings();
                });
        });
    
    // Reveal options row
    const revealRow = details.createDiv({ cls: 'rt-campaign-reveal-row' });
    revealRow.createEl('span', { text: 'Show:', cls: 'rt-campaign-reveal-label' });
    
    const revealOptions = [
        { key: 'showSubplots', label: 'Subplots' },
        { key: 'showActs', label: 'Acts' },
        { key: 'showStatus', label: 'Status' },
        { key: 'showProgressPercent', label: '%' },
    ] as const;
    
    revealOptions.forEach(opt => {
        const checkbox = revealRow.createEl('label', { cls: 'rt-campaign-checkbox' });
        const input = checkbox.createEl('input', { type: 'checkbox' });
        input.checked = campaign[opt.key];
        checkbox.createSpan({ text: opt.label });
        
        input.onchange = async () => {
            if (!plugin.settings.authorProgress?.campaigns) return;
            const targetCampaign = plugin.settings.authorProgress.campaigns[index];
            if (!targetCampaign) return;
            // Update the specific reveal option
            switch (opt.key) {
                case 'showSubplots': targetCampaign.showSubplots = input.checked; break;
                case 'showActs': targetCampaign.showActs = input.checked; break;
                case 'showStatus': targetCampaign.showStatus = input.checked; break;
                case 'showProgressPercent': targetCampaign.showProgressPercent = input.checked; break;
            }
            await plugin.saveSettings();
        };
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // TEASER REVEAL (Progressive Reveal)
    // ─────────────────────────────────────────────────────────────────────────
    const teaserSection = details.createDiv({ cls: 'rt-campaign-teaser-section' });
    teaserSection.createEl('h5', { text: 'Teaser Reveal', cls: 'rt-campaign-teaser-title' });
    
    const teaserDesc = teaserSection.createEl('p', { cls: 'rt-campaign-teaser-desc' });
    teaserDesc.setText('Automatically reveal more detail as your book progresses. Creates anticipation for your audience.');
    
    // Container for teaser content that can be re-rendered
    const teaserContentContainer = teaserSection.createDiv({ cls: 'rt-teaser-content' });
    
    // Function to render teaser content (toggle + optional presets/previews)
    const renderTeaserContent = () => {
        teaserContentContainer.empty();
        
        const currentCampaign = plugin.settings.authorProgress?.campaigns?.[index];
        if (!currentCampaign) return;
        
        const teaserSettings = currentCampaign.teaserReveal ?? { enabled: true, preset: 'standard' as TeaserPreset };
        
        new Setting(teaserContentContainer)
            .setName('Enable Teaser Reveal')
            .setDesc('Progressive reveal based on completion %')
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
                        // Re-render just this section, not the whole list
                        renderTeaserContent();
                    });
            });
        
        // Only show preset and preview if teaser is enabled
        if (teaserSettings.enabled) {
            // Preset selector
            new Setting(teaserContentContainer)
                .setName('Reveal Schedule')
                .addDropdown(drop => {
                    drop.addOption('slow', 'Slow (15/30/55/80%)')
                        .addOption('standard', 'Standard (10/25/50/75%)')
                        .addOption('fast', 'Fast (5/15/35/60%)')
                        .addOption('custom', 'Custom')
                        .setValue(teaserSettings.preset)
                        .onChange(async (val) => {
                            if (!plugin.settings.authorProgress?.campaigns) return;
                            const target = plugin.settings.authorProgress.campaigns[index];
                            if (!target.teaserReveal) {
                                target.teaserReveal = { enabled: true, preset: 'standard' };
                            }
                            target.teaserReveal.preset = val as TeaserPreset;
                            // Initialize custom thresholds from current preset values if switching to custom
                            if (val === 'custom' && !target.teaserReveal.customThresholds) {
                                const currentThresholds = getTeaserThresholds(teaserSettings.preset, undefined);
                                target.teaserReveal.customThresholds = { ...currentThresholds };
                            }
                            await plugin.saveSettings();
                            // Re-render just this section
                            renderTeaserContent();
                        });
                });
            
            // Show custom threshold inputs when 'custom' is selected - compact single row
            if (teaserSettings.preset === 'custom') {
                const customRow = teaserContentContainer.createDiv({ cls: 'rt-teaser-custom-row' });
                const customThresholds = teaserSettings.customThresholds ?? { scenes: 10, colors: 25, acts: 50, subplots: 75 };
                
                const fields: { key: 'scenes' | 'colors' | 'acts' | 'subplots'; label: string }[] = [
                    { key: 'scenes', label: 'Scenes' },
                    { key: 'colors', label: 'Colors' },
                    { key: 'acts', label: 'Structure' },
                    { key: 'subplots', label: 'Full' },
                ];
                
                const inputs: Record<string, HTMLInputElement> = {};
                
                fields.forEach(({ key, label }) => {
                    const field = customRow.createDiv({ cls: 'rt-teaser-field' });
                    field.createSpan({ text: label, cls: 'rt-teaser-field-label' });
                    const input = field.createEl('input', { 
                        type: 'text',
                        cls: 'rt-teaser-field-input',
                        value: String(customThresholds[key])
                    });
                    input.maxLength = 2;
                    inputs[key] = input;
                });
                
                // Save button
                const saveBtn = customRow.createEl('button', { 
                    text: 'Save',
                    cls: 'rt-teaser-save-btn'
                });
                
                const validateAndSave = async () => {
                    const vals = {
                        scenes: parseInt(inputs.scenes.value) || 0,
                        colors: parseInt(inputs.colors.value) || 0,
                        acts: parseInt(inputs.acts.value) || 0,
                        subplots: parseInt(inputs.subplots.value) || 0,
                    };
                    
                    // Validate range (1-99)
                    for (const [k, v] of Object.entries(vals)) {
                        if (v < 1 || v > 99) {
                            new Notice(`${k} must be between 1 and 99`);
                            return;
                        }
                    }
                    
                    // Validate order: scenes < colors < acts < subplots
                    if (vals.scenes >= vals.colors || vals.colors >= vals.acts || vals.acts >= vals.subplots) {
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
            const svgPreviewRow = teaserContentContainer.createDiv({ cls: 'rt-teaser-svg-preview-row' });
            renderTeaserStagesPreviews(svgPreviewRow, plugin, currentCampaign, thresholds);
        }
    };
    
    // Initial render
    renderTeaserContent();
    
    // Publish button
    const publishRow = details.createDiv({ cls: 'rt-campaign-publish-row' });
    new ButtonComponent(publishRow)
        .setButtonText('Publish Now')
        .setCta()
        .onClick(async () => {
            const { AuthorProgressService } = await import('../../services/AuthorProgressService');
            const aprService = new AuthorProgressService(plugin, plugin.app);
            await aprService.generateCampaignReport(campaign.id);
            onUpdate();
        });
}

/**
 * Render mini SVG previews for each teaser reveal stage
 */
async function renderTeaserStagesPreviews(
    container: HTMLElement,
    plugin: RadialTimelinePlugin,
    campaign: AprCampaign,
    thresholds: { scenes: number; acts: number; subplots: number; colors: number }
): Promise<void> {
    const settings = plugin.settings.authorProgress;
    if (!settings) return;
    
    // Get scenes for preview
    const scenes = await getAllScenes(plugin.app, plugin);
    if (scenes.length === 0) {
        container.createEl('p', { 
            text: 'No scenes to preview. Add scenes to see teaser stages.',
            cls: 'rt-teaser-no-scenes'
        });
        return;
    }
    
    // Stages to preview with their simulated progress percentages
    // Order: bar → scenes → colors → acts → subplots (full)
    const stages: { level: TeaserRevealLevel; label: string; progress: number; icon: string }[] = [
        { level: 'bar', label: 'Teaser', progress: 5, icon: 'circle' },
        { level: 'scenes', label: 'Scenes', progress: thresholds.scenes, icon: 'sprout' },
        { level: 'colors', label: 'Colors', progress: thresholds.colors, icon: 'tree-pine' },
        { level: 'acts', label: 'Structure', progress: thresholds.acts, icon: 'trees' },
        { level: 'subplots', label: 'Full', progress: thresholds.subplots, icon: 'shell' },
    ];
    
    stages.forEach(stage => {
        const revealOptions = teaserLevelToRevealOptions(stage.level);
        
        const card = container.createDiv({ cls: 'rt-teaser-stage-card' });
        
        // SVG preview container
        const svgContainer = card.createDiv({ cls: 'rt-teaser-stage-svg' });
        
        try {
            const { svgString } = createAprSVG(scenes, {
                size: 'compact',
                progressPercent: stage.progress,
                bookTitle: settings.bookTitle || 'Book',
                authorName: settings.authorName || '',
                authorUrl: '',
                showScenes: revealOptions.showScenes,
                showSubplots: revealOptions.showSubplots,
                showActs: revealOptions.showActs,
                showStatusColors: revealOptions.showStatusColors,
                showProgressPercent: true,
                stageColors: plugin.settings.publishStageColors,
                actCount: plugin.settings.actCount,
                backgroundColor: campaign.customBackgroundColor ?? settings.aprBackgroundColor,
                transparentCenter: campaign.customTransparent ?? settings.aprCenterTransparent,
                theme: campaign.customTheme ?? settings.aprTheme ?? 'dark'
            });
            
            svgContainer.innerHTML = svgString; // SAFE: innerHTML used for SVG preview injection
        } catch {
            svgContainer.createEl('span', { text: '⚠', cls: 'rt-teaser-stage-error' });
        }
        
        // Label row
        const labelRow = card.createDiv({ cls: 'rt-teaser-stage-label-row' });
        const iconSpan = labelRow.createSpan({ cls: 'rt-teaser-stage-icon' });
        setIcon(iconSpan, stage.icon);
        labelRow.createSpan({ text: `${stage.progress}%`, cls: 'rt-teaser-stage-percent' });
        
        card.createDiv({ cls: 'rt-teaser-stage-name', text: stage.label });
    });
}
