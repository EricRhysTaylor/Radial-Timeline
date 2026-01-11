/**
 * Campaign Manager Section (Pro Feature)
 * Allows managing multiple APR campaigns with independent refresh schedules
 */

import { App, Setting, setIcon, ButtonComponent, TextComponent, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { AprCampaign, MomentumPreset } from '../../types/settings';
import { isProfessionalActive } from './ProfessionalSection';
import { MOMENTUM_PRESETS, MOMENTUM_LEVEL_INFO, getMomentumThresholds } from '../../renderer/apr/AprConstants';

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
        // Momentum Builder defaults (disabled by default, author opts in)
        momentumBuilder: {
            enabled: false,
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
    
    titleArea.createEl('h4', { text: 'Campaign Manager', cls: 'rt-section-title' });
    
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
    const rowClasses = ['rt-campaign-row'];
    if (needsRefresh) rowClasses.push('rt-campaign-needs-refresh');
    if (!campaign.isActive) rowClasses.push('rt-campaign-inactive');
    
    const row = container.createDiv({ cls: rowClasses.join(' ') });
    
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
        // Toggle expanded state
        const existingDetails = row.querySelector('.rt-campaign-details');
        if (existingDetails) {
            existingDetails.remove();
        } else {
            renderCampaignDetails(row, campaign, index, plugin, onUpdate);
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
    // MOMENTUM BUILDER (Progressive Reveal)
    // ─────────────────────────────────────────────────────────────────────────
    const momentumSection = details.createDiv({ cls: 'rt-campaign-momentum-section' });
    momentumSection.createEl('h5', { text: 'Momentum Builder', cls: 'rt-campaign-momentum-title' });
    
    const momentumDesc = momentumSection.createEl('p', { cls: 'rt-campaign-momentum-desc' });
    momentumDesc.setText('Automatically reveal more detail as your book progresses. Creates anticipation for your audience.');
    
    // Momentum toggle
    const momentumSettings = campaign.momentumBuilder ?? { enabled: false, preset: 'standard' as MomentumPreset };
    
    new Setting(momentumSection)
        .setName('Enable Momentum Builder')
        .setDesc('Progressive reveal based on completion %')
        .addToggle(toggle => {
            toggle.setValue(momentumSettings.enabled)
                .onChange(async (val) => {
                    if (!plugin.settings.authorProgress?.campaigns) return;
                    const target = plugin.settings.authorProgress.campaigns[index];
                    if (!target.momentumBuilder) {
                        target.momentumBuilder = { enabled: false, preset: 'standard' };
                    }
                    target.momentumBuilder.enabled = val;
                    await plugin.saveSettings();
                    onUpdate();
                });
        });
    
    // Only show preset and preview if momentum is enabled
    if (momentumSettings.enabled) {
        // Preset selector
        new Setting(momentumSection)
            .setName('Reveal Schedule')
            .addDropdown(drop => {
                drop.addOption('slow', 'Slow (15/30/60/85%)')
                    .addOption('standard', 'Standard (10/25/50/75%)')
                    .addOption('fast', 'Fast (5/15/35/65%)')
                    .addOption('custom', 'Custom')
                    .setValue(momentumSettings.preset)
                    .onChange(async (val) => {
                        if (!plugin.settings.authorProgress?.campaigns) return;
                        const target = plugin.settings.authorProgress.campaigns[index];
                        if (!target.momentumBuilder) {
                            target.momentumBuilder = { enabled: true, preset: 'standard' };
                        }
                        target.momentumBuilder.preset = val as MomentumPreset;
                        await plugin.saveSettings();
                        onUpdate();
                    });
            });
        
        // Show reveal level preview
        const thresholds = getMomentumThresholds(momentumSettings.preset, momentumSettings.customThresholds);
        const previewRow = momentumSection.createDiv({ cls: 'rt-momentum-preview-row' });
        
        const levels = [
            { key: 'bar', threshold: 0, label: 'Teaser' },
            { key: 'scenes', threshold: thresholds.scenes, label: 'Scenes' },
            { key: 'acts', threshold: thresholds.acts, label: 'Structure' },
            { key: 'subplots', threshold: thresholds.subplots, label: 'Depth' },
            { key: 'colors', threshold: thresholds.colors, label: 'Full Detail' },
        ] as const;
        
        levels.forEach((level, i) => {
            const levelBox = previewRow.createDiv({ cls: 'rt-momentum-level-box' });
            const iconSpan = levelBox.createSpan({ cls: 'rt-momentum-level-icon' });
            setIcon(iconSpan, MOMENTUM_LEVEL_INFO[level.key].icon);
            levelBox.createSpan({ text: `${level.threshold}%`, cls: 'rt-momentum-level-threshold' });
            levelBox.createSpan({ text: level.label, cls: 'rt-momentum-level-label' });
            
            // Arrow between levels (except last)
            if (i < levels.length - 1) {
                const arrow = previewRow.createSpan({ cls: 'rt-momentum-arrow' });
                setIcon(arrow, 'arrow-right');
            }
        });
    }
    
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
