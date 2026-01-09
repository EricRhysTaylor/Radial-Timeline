import { App, Setting, Notice, setIcon, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { AuthorProgressService } from '../../services/AuthorProgressService';
import { DEFAULT_SETTINGS } from '../defaults';
import { getAllScenes } from '../../utils/manuscript';
import { createTimelineSVG } from '../../renderer/TimelineRenderer';
import { PluginRendererFacade } from '../../utils/sceneHelpers';

export interface AuthorProgressSectionProps {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

export function renderAuthorProgressSection({ app, plugin, containerEl }: AuthorProgressSectionProps): void {
    const section = containerEl.createDiv({ cls: 'rt-settings-section rt-apr-section' });
    
    // ─────────────────────────────────────────────────────────────────────────
    // APR HERO SECTION
    // ─────────────────────────────────────────────────────────────────────────
    const hero = section.createDiv({ cls: 'rt-apr-hero' });
    
    // Badge row with pill
    const badgeRow = hero.createDiv({ cls: 'rt-apr-hero-badge-row' });
    const badge = badgeRow.createSpan({ cls: 'rt-apr-hero-badge' });
    setIcon(badge, 'radio');
    badge.createSpan({ text: 'Social · Share' });
    
    // Big headline
    hero.createEl('h3', { 
        cls: 'rt-apr-hero-title', 
        text: 'Promote your work in progress.' 
    });
    
    // Description paragraph
    hero.createEl('p', { 
        cls: 'rt-apr-hero-subtitle', 
        text: 'Generate beautiful, spoiler-safe progress graphics for social media and crowdfunding. Perfect for Kickstarter updates, Patreon posts, or sharing your writing journey with fans.' 
    });
    
    // Features section
    const featuresSection = hero.createDiv({ cls: 'rt-apr-hero-features' });
    featuresSection.createEl('h5', { text: 'Key Benefits:' });
    const featuresList = featuresSection.createEl('ul');
    [
        { icon: 'eye-off', text: 'Spoiler-Safe — Scene titles and content automatically hidden' },
        { icon: 'share-2', text: 'Shareable — Export as static snapshot or live-updating embed' },
        { icon: 'trending-up', text: 'Progress Tracking — Visual momentum that excites your audience' },
    ].forEach(feature => {
        const li = featuresList.createEl('li');
        const iconSpan = li.createSpan({ cls: 'rt-apr-hero-feature-icon' });
        setIcon(iconSpan, feature.icon);
        li.createSpan({ text: feature.text });
    });
    
    // SVG Preview container
    const previewContainer = hero.createDiv({ cls: 'rt-apr-hero-preview' });
    previewContainer.createDiv({ cls: 'rt-apr-hero-preview-loading', text: 'Loading preview...' });
    
    // Load and render preview asynchronously
    renderHeroPreview(app, plugin, previewContainer);
    
    // Meta tags
    const settings = plugin.settings.authorProgress;
    const lastDate = settings?.lastPublishedDate 
        ? new Date(settings.lastPublishedDate).toLocaleDateString() 
        : 'Never';
    
    const meta = hero.createDiv({ cls: 'rt-apr-hero-meta' });
    meta.createSpan({ text: `Last update: ${lastDate}` });
    meta.createSpan({ text: 'Kickstarter ready' });
    meta.createSpan({ text: 'Patreon friendly' });
    
    // ─────────────────────────────────────────────────────────────────────────
    // CONFIGURATION SECTION
    // ─────────────────────────────────────────────────────────────────────────
    const contentWrapper = section.createDiv({ cls: 'rt-apr-content-wrapper' });
    
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

/**
 * Render the APR SVG preview in the hero section
 * Uses the main timeline renderer with APR mode for accurate preview
 */
async function renderHeroPreview(
    app: App, 
    plugin: RadialTimelinePlugin, 
    container: HTMLElement
): Promise<void> {
    try {
        const scenes = await getAllScenes(app, plugin);
        
        if (scenes.length === 0) {
            container.empty();
            container.createDiv({ 
                cls: 'rt-apr-hero-preview-empty',
                text: 'Create scenes to see a preview of your Author Progress Report.' 
            });
            return;
        }
        
        // Calculate progress using AuthorProgressService
        const service = new AuthorProgressService(plugin, app);
        const progressPercent = service.calculateProgress(scenes);
        
        const aprSettings = plugin.settings.authorProgress;
        
        // Use the main timeline renderer with APR mode
        const pluginFacade = plugin as unknown as PluginRendererFacade;
        
        const { svgString } = createTimelineSVG(pluginFacade, scenes, {
            aprMode: true,
            progressPercent,
            bookTitle: aprSettings?.bookTitle || 'Working Title',
            authorUrl: aprSettings?.authorUrl || '',
            showSubplots: aprSettings?.showSubplots ?? true,
            showActs: aprSettings?.showActs ?? true,
            showStatus: aprSettings?.showStatus ?? true
        });
        
        container.empty();
        container.innerHTML = svgString; // SAFE: innerHTML used for SVG preview injection
        
    } catch (e) {
        container.empty();
        container.createDiv({ 
            cls: 'rt-apr-hero-preview-error',
            text: 'Failed to render preview.' 
        });
        console.error('APR Settings Preview error:', e);
    }
}
