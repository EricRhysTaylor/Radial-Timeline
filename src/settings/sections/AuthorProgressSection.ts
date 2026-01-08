import { App, Setting, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { AuthorProgressService } from '../../services/AuthorProgressService';

export interface AuthorProgressSectionProps {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

export function renderAuthorProgressSection({ app, plugin, containerEl }: AuthorProgressSectionProps): void {
    const section = containerEl.createDiv({ cls: 'rt-settings-section' });
    
    // Header with Help Link
    const header = section.createDiv({ cls: 'rt-settings-header-row' });
    header.createEl('h3', { text: 'Author Progress Report (APR)' });
    
    // Status Banner
    const settings = plugin.settings.authorProgress;
    const lastDate = settings?.lastPublishedDate 
        ? new Date(settings.lastPublishedDate).toLocaleDateString() 
        : 'Never';
    
    const banner = section.createDiv({ cls: 'rt-apr-status-banner' });
    banner.createEl('span', { text: `Last Updated: ${lastDate}`, cls: 'rt-apr-last-updated' });
    
    // Identity Inputs (High Visibility)
    new Setting(section)
        .setName('Book Title')
        .setDesc('This title appears on your public report graphic.')
        .addText(text => text
            .setPlaceholder('My Great Novel')
            .setValue(settings?.bookTitle || '')
            .onChange(async (val) => {
                if (plugin.settings.authorProgress) {
                    plugin.settings.authorProgress.bookTitle = val;
                    await plugin.saveSettings();
                }
            })
        );

    new Setting(section)
        .setName('Link URL')
        .setDesc('Where the graphic should link to (e.g. your website, Kickstarter, or shop).')
        .addText(text => text
            .setPlaceholder('https://...')
            .setValue(settings?.authorUrl || '')
            .onChange(async (val) => {
                if (plugin.settings.authorProgress) {
                    plugin.settings.authorProgress.authorUrl = val;
                    await plugin.saveSettings();
                }
            })
        );

    // Automation & Frequency
    new Setting(section)
        .setName('Update Frequency')
        .setDesc('How often to auto-update the live embed file. "Manual" requires clicking the update button.')
        .addDropdown(dropdown => dropdown
            .addOption('manual', 'Manual Only')
            .addOption('daily', 'Daily')
            .addOption('weekly', 'Weekly')
            .addOption('monthly', 'Monthly')
            .setValue(settings?.updateFrequency || 'manual')
            .onChange(async (val) => {
                if (plugin.settings.authorProgress) {
                    plugin.settings.authorProgress.updateFrequency = val as any;
                    await plugin.saveSettings();
                    
                    // Toggle visibility of staleness threshold
                    const isManual = val === 'manual';
                    // We'd ideally toggle the element here, but for simplicity we rely on re-render or just leave it visible.
                }
            })
        );

    // Conditional Manual Settings
    if (settings?.updateFrequency === 'manual') {
        new Setting(section)
            .setName('Staleness Alert Threshold')
            .setDesc('Days before showing a "Stale Report" warning in the timeline view.')
            .addSlider(slider => slider
                .setLimits(1, 90, 1)
                .setValue(settings?.stalenessThresholdDays || 30)
                .setDynamicTooltip()
                .onChange(async (val) => {
                    if (plugin.settings.authorProgress) {
                        plugin.settings.authorProgress.stalenessThresholdDays = val;
                        await plugin.saveSettings();
                    }
                })
            );
    }

    new Setting(section)
        .setName('Embed File Path')
        .setDesc('Location for the "Live Embed" SVG file.')
        .addText(text => text
            .setValue(settings?.dynamicEmbedPath || 'AuthorProgress/progress.svg')
            .onChange(async (val) => {
                if (plugin.settings.authorProgress) {
                    plugin.settings.authorProgress.dynamicEmbedPath = val;
                    await plugin.saveSettings();
                }
            })
        );
}
