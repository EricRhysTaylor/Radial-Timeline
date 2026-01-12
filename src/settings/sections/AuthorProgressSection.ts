import { App, Setting, Notice, setIcon, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { AuthorProgressService } from '../../services/AuthorProgressService';
import { DEFAULT_SETTINGS } from '../defaults';
import { getAllScenes } from '../../utils/manuscript';
import { createAprSVG } from '../../renderer/apr/AprRenderer';
import { renderCampaignManagerSection } from './CampaignManagerSection';

export interface AuthorProgressSectionProps {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

export function renderAuthorProgressSection({ app, plugin, containerEl }: AuthorProgressSectionProps): void {
    const section = containerEl.createDiv({ cls: 'rt-settings-section rt-apr-section' });
    
    // Check if APR needs refresh
    const aprService = new AuthorProgressService(plugin, app);
    const needsRefresh = aprService.isStale();
    
    // ─────────────────────────────────────────────────────────────────────────
    // APR HERO SECTION
    // ─────────────────────────────────────────────────────────────────────────
    const hero = section.createDiv({ cls: 'rt-apr-hero' });
    
    // Badge row with pill - turns red when refresh needed
    const badgeRow = hero.createDiv({ cls: 'rt-apr-hero-badge-row' });
    const badgeClasses = needsRefresh ? 'rt-apr-hero-badge rt-apr-badge-alert' : 'rt-apr-hero-badge';
    const badge = badgeRow.createSpan({ cls: badgeClasses });
    setIcon(badge, needsRefresh ? 'alert-triangle' : 'radio');
    badge.createSpan({ text: needsRefresh ? 'Reminder to Refresh' : 'Social · Share' });
    
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
        { icon: 'trending-up', text: 'Stage-Weighted Progress — Tracks advancement through Zero → Author → House → Press' },
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
    const refreshPreview = () => { void renderHeroPreview(app, plugin, previewContainer); };
    
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
    
    // Styling (background + branding colors) - placed first, close to preview
    const stylingCard = contentWrapper.createDiv({ cls: 'rt-glass-card rt-apr-styling-card rt-apr-stack-gap' });
    stylingCard.createEl('h4', { text: 'Styling', cls: 'rt-section-title' });

    const currentBg = settings?.aprBackgroundColor || '#0d0d0f';
    const currentTransparent = settings?.aprCenterTransparent ?? true; // Default to true (recommended)
    const currentTheme = settings?.aprTheme || 'dark';

    // Transparency (Recommended) - placed FIRST with special styling
    const transparencySetting = new Setting(stylingCard)
        .setName('Transparent Mode (Recommended)')
        .setDesc('No background fill — adapts to any page or app. Ideal for websites, blogs, and platforms that preserve SVG transparency.');
    
    // Background color - for special situations only (when transparency is off)
    const bgSetting = new Setting(stylingCard)
        .setName('Background Color')
        .setDesc('Bakes in a solid background. Use when transparency isn\'t reliable: email newsletters, Kickstarter, PDF exports, or platforms that rasterize SVGs.');
    
    // Store references to the color picker and text input for enabling/disabling
    let bgColorPicker: any = null; // SAFE: any type used for Obsidian color picker component reference
    let bgTextInput: any = null; // SAFE: any type used for Obsidian text component reference
    
    // Helper to swap emphasis and enable/disable background controls
    const updateEmphasis = (isTransparent: boolean) => {
        if (isTransparent) {
            transparencySetting.settingEl.classList.add('rt-apr-recommended-setting');
            bgSetting.settingEl.classList.remove('rt-apr-recommended-setting');
            bgSetting.settingEl.classList.add('rt-setting-muted');
            if (bgColorPicker) bgColorPicker.setDisabled(true);
            if (bgTextInput) bgTextInput.setDisabled(true);
        } else {
            transparencySetting.settingEl.classList.remove('rt-apr-recommended-setting');
            bgSetting.settingEl.classList.add('rt-apr-recommended-setting');
            bgSetting.settingEl.classList.remove('rt-setting-muted');
            if (bgColorPicker) bgColorPicker.setDisabled(false);
            if (bgTextInput) bgTextInput.setDisabled(false);
        }
    };
    
    transparencySetting.addToggle(toggle => {
        toggle.setValue(currentTransparent);
        toggle.onChange(async (val) => {
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprCenterTransparent = val;
            await plugin.saveSettings();
            updateEmphasis(val);
            refreshPreview();
        });
    });

    bgSetting.addColorPicker(picker => {
        bgColorPicker = picker;
        picker.setValue(currentBg);
        picker.onChange(async (val) => {
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprBackgroundColor = val || '#0d0d0f';
            await plugin.saveSettings();
            refreshPreview();
        });
    });

    bgSetting.addText(text => {
        bgTextInput = text;
        text.setPlaceholder('#0d0d0f').setValue(currentBg);
        text.inputEl.classList.add('rt-hex-input');
        text.onChange(async (val) => {
            if (!val) return;
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprBackgroundColor = val;
            await plugin.saveSettings();
            refreshPreview();
        });
    });
    
    // Set initial emphasis state after controls are created
    updateEmphasis(currentTransparent);

    // Theme selector
    const themeSetting = new Setting(stylingCard)
        .setName('Theme Contrast')
        .setDesc('Choose stroke/border contrast to match your background.')
        .addDropdown(drop => {
            drop.addOption('dark', 'Light Strokes');
            drop.addOption('light', 'Dark Strokes');
            drop.addOption('none', 'No Strokes');
            drop.setValue(currentTheme);
            drop.onChange(async (val) => {
                if (!plugin.settings.authorProgress) return;
                plugin.settings.authorProgress.aprTheme = (val as 'dark' | 'light' | 'none') || 'dark';
                await plugin.saveSettings();
                refreshPreview();
            });
        });

    const setColorPicker = (
        setting: Setting, 
        key: 'aprBookAuthorColor' | 'aprEngineColor', 
        fallback: string
    ) => {
        const current = (settings as any)?.[key] || fallback;
        setting.addColorPicker(picker => {
            picker.setValue(current);
            picker.onChange(async (val) => {
                if (!plugin.settings.authorProgress) return;
                (plugin.settings.authorProgress as any)[key] = val || fallback;
                await plugin.saveSettings();
                refreshPreview();
            });
        });
        setting.addText(text => {
            text.setPlaceholder(fallback).setValue(current);
            text.inputEl.classList.add('rt-hex-input');
            text.onChange(async (val) => {
                if (!val) return;
                if (!plugin.settings.authorProgress) return;
                (plugin.settings.authorProgress as any)[key] = val;
                await plugin.saveSettings();
                refreshPreview();
            });
        });
    };

    const bookColorSetting = new Setting(stylingCard).setName('Book + Author Color').setDesc('Used for the perimeter text.');
    setColorPicker(bookColorSetting, 'aprBookAuthorColor', plugin.settings.publishStageColors?.Press || '#6FB971');

    const engineColorSetting = new Setting(stylingCard).setName('Radial Timeline Engine Color').setDesc('Used on the Radial Timeline Logo link in the bottom right corner.');
    setColorPicker(engineColorSetting, 'aprEngineColor', '#e5e5e5');

    // Identity & Links
    const identityCard = contentWrapper.createDiv({ cls: 'rt-glass-card rt-apr-identity-card rt-apr-stack-gap' });
    identityCard.createEl('h4', { text: 'Identity & Links', cls: 'rt-section-title' });

    new Setting(identityCard)
        .setName('Book Title')
        .setDesc('Appears on your public report graphic.')
        .addText(text => text
            .setPlaceholder('Working Title')
            .setValue(settings?.bookTitle || '')
            .onChange(async (val) => {
                if (plugin.settings.authorProgress) {
                    plugin.settings.authorProgress.bookTitle = val;
                    await plugin.saveSettings();
                    refreshPreview();
                }
            })
        );

    new Setting(identityCard)
        .setName('Author Name')
        .setDesc('Appears alongside the title (e.g., Title • Author).')
        .addText(text => text
            .setPlaceholder('Author Name')
            .setValue(settings?.authorName || '')
            .onChange(async (val) => {
                if (plugin.settings.authorProgress) {
                    plugin.settings.authorProgress.authorName = val;
                    await plugin.saveSettings();
                    refreshPreview();
                }
            })
        );

    const linkUrlSetting = new Setting(identityCard)
        .setName('Link URL')
        .setDesc('Where the graphic should link to (e.g. your website, Kickstarter, or shop).');
    
    linkUrlSetting.settingEl.addClass('rt-setting-full-width-input');
    
    linkUrlSetting.addText(text => {
        text.inputEl.addClass('rt-input-full');
        text.setPlaceholder('https://your-site.com')
            .setValue(settings?.authorUrl || '')
            .onChange(async (val) => {
                if (plugin.settings.authorProgress) {
                    plugin.settings.authorProgress.authorUrl = val;
                    await plugin.saveSettings();
                    refreshPreview();
                }
            });
    });

    // Publishing & Automation
    const automationCard = contentWrapper.createDiv({ cls: 'rt-glass-card rt-apr-automation-card rt-apr-stack-gap' });
    automationCard.createEl('h4', { text: 'Publishing & Automation', cls: 'rt-section-title' });

    const frequencySetting = new Setting(automationCard)
        .setName('Update Frequency')
        .setDesc('How often to auto-update the live embed file. "Manual" requires clicking the update button in the Author Progress Report modal.')
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
    
    // Add red alert border when refresh is needed
    if (needsRefresh) {
        frequencySetting.settingEl.classList.add('rt-apr-refresh-alert');
    }

    // Conditional Manual Settings
    if (settings?.updateFrequency === 'manual') {
        const currentDays = settings?.stalenessThresholdDays || 30;
        const stalenessSetting = new Setting(automationCard)
            .setName('Refresh Alert Threshold')
            .setDesc(`Days before showing a refresh reminder in the timeline view. Currently: ${currentDays} days.`)
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
                                descEl.setText(`Days before showing a refresh reminder in the timeline view. Currently: ${val} days.`);
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
        
        // Add red alert border when refresh is needed
        if (needsRefresh) {
            stalenessSetting.settingEl.classList.add('rt-apr-refresh-alert');
        }
    }

    const embedPathSetting = new Setting(automationCard)
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

    // ─────────────────────────────────────────────────────────────────────────
    // CAMPAIGN MANAGER (PRO FEATURE)
    // ─────────────────────────────────────────────────────────────────────────
    renderCampaignManagerSection({
        app,
        plugin,
        containerEl: contentWrapper,
        onCampaignChange: () => {
            // Refresh the hero preview when campaigns change
            void renderHeroPreview(app, plugin, previewContainer);
        }
    });
}

/**
 * Render the APR SVG preview in the hero section
 * Uses the dedicated APR renderer
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
        
        const { svgString } = createAprSVG(scenes, {
            size: aprSettings?.aprSize || 'standard',
            progressPercent,
            bookTitle: aprSettings?.bookTitle || 'Working Title',
            authorName: aprSettings?.authorName || '',
            authorUrl: aprSettings?.authorUrl || '',
            showSubplots: aprSettings?.showSubplots ?? true,
            showActs: aprSettings?.showActs ?? true,
            showStatusColors: aprSettings?.showStatus ?? true,
            showProgressPercent: aprSettings?.showProgressPercent ?? true,
            stageColors: (plugin.settings as any).publishStageColors,
            actCount: plugin.settings.actCount || undefined,
            backgroundColor: aprSettings?.aprBackgroundColor,
            transparentCenter: aprSettings?.aprCenterTransparent,
            bookAuthorColor: aprSettings?.aprBookAuthorColor ?? (plugin.settings.publishStageColors?.Press),
            engineColor: aprSettings?.aprEngineColor,
            theme: aprSettings?.aprTheme || 'dark'
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
