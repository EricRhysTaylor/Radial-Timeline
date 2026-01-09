import { App, Setting, Notice, setIcon, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { AuthorProgressService } from '../../services/AuthorProgressService';
import { DEFAULT_SETTINGS } from '../defaults';

export interface AuthorProgressSectionProps {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

export function renderAuthorProgressSection({ app, plugin, containerEl }: AuthorProgressSectionProps): void {
    const section = containerEl.createDiv({ cls: 'rt-settings-section rt-apr-section' });
    
    // Content wrapper with accent border
    const contentWrapper = section.createDiv({ cls: 'rt-apr-content-wrapper' });
    
    // Header inside content wrapper with icon, title, and last update
    const settings = plugin.settings.authorProgress;
    const lastDate = settings?.lastPublishedDate 
        ? new Date(settings.lastPublishedDate).toLocaleDateString() 
        : 'Never';
    
    const headerBanner = contentWrapper.createDiv({ cls: 'rt-apr-header-banner' });
    const headerIcon = headerBanner.createSpan({ cls: 'rt-apr-header-icon' });
    setIcon(headerIcon, 'radio');
    headerBanner.createEl('span', { 
        text: `Author Progress Report (APR) — Last Update: ${lastDate}`, 
        cls: 'rt-apr-header-title' 
    });
    
    // Identity Inputs (High Visibility)
    new Setting(contentWrapper)
        .setName('Book Title')
        .setDesc('This title appears on your public report graphic.')
        .addText(text => text
            .setPlaceholder('Working Title')
            .setValue(settings?.bookTitle || '')
            .onChange(async (val) => {
                if (plugin.settings.authorProgress) {
                    plugin.settings.authorProgress.bookTitle = val;
                    await plugin.saveSettings();
                }
            })
        );

    const linkUrlSetting = new Setting(contentWrapper)
        .setName('Link URL')
        .setDesc('Where the graphic should link to (e.g. your website, Kickstarter, or shop).');
    
    linkUrlSetting.settingEl.addClass('rt-setting-full-width-input');
    
    linkUrlSetting.addText(text => {
        text.inputEl.addClass('rt-input-full');
        text.setPlaceholder('https://...')
            .setValue(settings?.authorUrl || '')
            .onChange(async (val) => {
                if (plugin.settings.authorProgress) {
                    plugin.settings.authorProgress.authorUrl = val;
                    await plugin.saveSettings();
                }
            });
    });

    // Automation & Frequency
    new Setting(contentWrapper)
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
        const currentDays = settings?.stalenessThresholdDays || 30;
        const stalenessSetting = new Setting(contentWrapper)
            .setName('Staleness Alert Threshold')
            .setDesc(`Days before showing a "Stale Report" warning in the timeline view. Currently: ${currentDays} days.`)
            .addSlider(slider => {
                slider
                    .setLimits(1, 90, 1)
                    .setValue(currentDays)
                    .setDynamicTooltip()
                    .onChange(async (val) => {
                        if (plugin.settings.authorProgress) {
                            plugin.settings.authorProgress.stalenessThresholdDays = val;
                            await plugin.saveSettings();
                            // Update description with new value
                            const descEl = stalenessSetting.descEl;
                            if (descEl) {
                                descEl.setText(`Days before showing a "Stale Report" warning in the timeline view. Currently: ${val} days.`);
                            }
                            // Update value label
                            if (valueLabel) {
                                valueLabel.setText(String(val));
                            }
                        }
                    });
                
                // Add value label above the slider thumb
                const sliderEl = slider.sliderEl;
                const valueLabel = sliderEl.parentElement?.createEl('span', {
                    cls: 'rt-slider-value-label',
                    text: String(currentDays)
                });
                
                return slider;
            });
    }

    const embedPathSetting = new Setting(contentWrapper)
        .setName('Embed File Path')
        .setDesc(`Location for the "Live Embed" SVG file. Must end with .svg. Default: ${DEFAULT_SETTINGS.authorProgress?.dynamicEmbedPath || 'Radial Timeline/Social/progress.svg'}`);
    
    embedPathSetting.settingEl.addClass('rt-setting-full-width-input');
    
    embedPathSetting.addText(text => {
        const defaultPath = DEFAULT_SETTINGS.authorProgress?.dynamicEmbedPath || 'Radial Timeline/Social/progress.svg';
        text.inputEl.addClass('rt-input-full');
        text.setPlaceholder(defaultPath)
            .setValue(settings?.dynamicEmbedPath || defaultPath);
        
        // Validate on blur
        const handleBlur = async () => {
            const val = text.getValue().trim();
            text.inputEl.removeClass('rt-setting-input-success');
            text.inputEl.removeClass('rt-setting-input-error');
            
            if (!val) {
                // Empty is invalid - needs a path
                text.inputEl.addClass('rt-setting-input-error');
                window.setTimeout(() => {
                    text.inputEl.removeClass('rt-setting-input-error');
                }, 2000);
                return;
            }
            
            if (!val.toLowerCase().endsWith('.svg')) {
                text.inputEl.addClass('rt-setting-input-error');
                window.setTimeout(() => {
                    text.inputEl.removeClass('rt-setting-input-error');
                }, 2000);
                return;
            }
            
            // Valid - save
            if (plugin.settings.authorProgress) {
                plugin.settings.authorProgress.dynamicEmbedPath = val;
                await plugin.saveSettings();
                text.inputEl.addClass('rt-setting-input-success');
                window.setTimeout(() => {
                    text.inputEl.removeClass('rt-setting-input-success');
                }, 1000);
            }
        };
        
        plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
        
        // Also handle Enter key
        plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                text.inputEl.blur();
            }
        });

        embedPathSetting.addExtraButton(button => {
            button.setIcon('rotate-ccw');
            button.setTooltip(`Reset to ${defaultPath}`);
            button.onClick(async () => {
                text.setValue(defaultPath);
                if (!plugin.settings.authorProgress) {
                    plugin.settings.authorProgress = { ...DEFAULT_SETTINGS.authorProgress! };
                }
                plugin.settings.authorProgress.dynamicEmbedPath = normalizePath(defaultPath);
                await plugin.saveSettings();
                text.inputEl.addClass('rt-setting-input-success');
                window.setTimeout(() => {
                    text.inputEl.removeClass('rt-setting-input-success');
                }, 1000);
            });
        });
    });
}
