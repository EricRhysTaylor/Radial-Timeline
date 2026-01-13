import { App, Setting, Notice, setIcon, normalizePath, ColorComponent, TextComponent, Modal, ButtonComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { AuthorProgressService } from '../../services/AuthorProgressService';
import { DEFAULT_SETTINGS } from '../defaults';
import { getAllScenes } from '../../utils/manuscript';
import { createAprSVG } from '../../renderer/apr/AprRenderer';
import { getPresetPalettes, generatePaletteFromColor } from '../../utils/aprPaletteGenerator';
import { AprPaletteModal } from '../../modals/AprPaletteModal';
import { renderCampaignManagerSection } from './CampaignManagerSection';
import { isProfessionalActive } from './ProfessionalSection';
import { addWikiLink } from '../wikiLink';

export interface AuthorProgressSectionProps {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

export function renderAuthorProgressSection({ app, plugin, containerEl }: AuthorProgressSectionProps): void {
    const section = containerEl.createDiv({ cls: 'rt-settings-section rt-apr-section' });
    
    // Add heading with wiki link
    const heading = new Setting(section)
        .setName('Social Media · Author Progress Report')
        .setHeading();
    addWikiLink(heading, 'Settings#social-media');
    
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
        text: 'Generate vibrant, spoiler-safe progress graphics for social media and crowdfunding. Perfect for Kickstarter updates, Patreon posts, or sharing your writing journey with fans.' 
    });
    
    // Features section
    const featuresSection = hero.createDiv({ cls: 'rt-apr-hero-features' });
    featuresSection.createEl('h5', { text: 'Key Benefits:' });
    const featuresList = featuresSection.createEl('ul');
    [
        { icon: 'eye-off', text: 'Spoiler-Safe — Scene titles and content are not part of the graphic build process.' },
        { icon: 'share-2', text: 'Shareable — Export as static snapshot or live-updating embed' },
        { icon: 'trending-up', text: 'Stage-Weighted Progress — Tracks advancement through Zero → Author → House → Press' },
    ].forEach(feature => {
        const li = featuresList.createEl('li');
        const iconSpan = li.createSpan({ cls: 'rt-apr-hero-feature-icon' });
        setIcon(iconSpan, feature.icon);
        li.createSpan({ text: feature.text });
    });
    
    // Size selector and 1:1 preview
    const previewSection = hero.createDiv({ cls: 'rt-apr-preview-section' });
    
    // Size selector row
    const sizeSelectorRow = previewSection.createDiv({ cls: 'rt-apr-size-selector-row' });
    sizeSelectorRow.createSpan({ text: 'Preview Size:', cls: 'rt-apr-size-label' });
    
    const sizeButtons = [
        { size: 'small', dimension: '150' },
        { size: 'medium', dimension: '300' },
        { size: 'large', dimension: '450' },
    ] as const;
    
    const currentSize = plugin.settings.authorProgress?.aprSize || 'medium';
    
    sizeButtons.forEach(({ size, dimension }) => {
        const btn = sizeSelectorRow.createEl('button', { 
            cls: `rt-apr-size-btn ${size === currentSize ? 'rt-apr-size-btn-active' : ''}`,
            text: `${dimension}•${dimension}`
        });
        
        btn.onclick = async () => {
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprSize = size;
            await plugin.saveSettings();
            
            // Update button states
            sizeSelectorRow.querySelectorAll('.rt-apr-size-btn').forEach(b => b.removeClass('rt-apr-size-btn-active'));
            btn.addClass('rt-apr-size-btn-active');
            
            // Update dimension label
            const dimLabel = previewSection.querySelector('.rt-apr-preview-dimension-label');
            if (dimLabel) dimLabel.setText(`${dimension}×${dimension} — Actual size (scroll to see full preview)`);
            
            // Re-render preview at new size
            void renderHeroPreview(app, plugin, previewContainer, size);
        };
    });
    
    // Dimension info
    const currentDim = sizeButtons.find(s => s.size === currentSize)?.dimension || '300';
    previewSection.createDiv({ 
        cls: 'rt-apr-preview-dimension-label',
        text: `${currentDim}×${currentDim} — Actual size (scroll to see full preview)`
    });
    
    // SVG Preview container - shows at 1:1 actual size
    const previewContainer = previewSection.createDiv({ cls: 'rt-apr-hero-preview rt-apr-preview-actual' });
    previewContainer.createDiv({ cls: 'rt-apr-hero-preview-loading', text: 'Loading preview...' });
    
    // Load and render preview asynchronously at actual size
    renderHeroPreview(app, plugin, previewContainer, currentSize);
    const refreshPreview = () => { 
        const size = plugin.settings.authorProgress?.aprSize || 'medium';
        void renderHeroPreview(app, plugin, previewContainer, size); 
    };
    
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
    const currentSpokeMode = settings?.aprSpokeColorMode || 'dark';
    const currentSpokeColor = settings?.aprSpokeColor || '#ffffff';

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

    // Theme/Spokes Color setting (unified - controls both theme and spokes)
    const spokeColorSetting = new Setting(stylingCard)
        .setName('Theme Contrast & Spokes')
        .setDesc('Choose stroke/border contrast. Controls all structural elements including scene borders and act division spokes.');
    
    let spokeColorPickerRef: ColorComponent | undefined;
    let spokeColorInputRef: TextComponent | undefined;
    
    // Match Book Title Color layout exactly - always show color picker and text input
    const isCustomMode = currentSpokeMode === 'custom';
    const fallbackColor = '#ffffff';
    spokeColorSetting.addColorPicker(picker => {
        spokeColorPickerRef = picker;
        picker.setValue(isCustomMode ? currentSpokeColor : fallbackColor);
        picker.setDisabled(!isCustomMode);
        picker.onChange(async (val) => {
            if (/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val)) {
                if (!plugin.settings.authorProgress) return;
                plugin.settings.authorProgress.aprSpokeColor = val || fallbackColor;
                await plugin.saveSettings();
                refreshPreview();
                spokeColorInputRef?.setValue(val);
            }
        });
    });
    
    spokeColorSetting.addText(text => {
        spokeColorInputRef = text;
        text.inputEl.classList.add('rt-hex-input');
        text.setPlaceholder(fallbackColor).setValue(isCustomMode ? currentSpokeColor : fallbackColor);
        text.setDisabled(!isCustomMode);
        text.onChange(async (val) => {
            if (!val) return;
            if (/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val)) {
                if (!plugin.settings.authorProgress) return;
                plugin.settings.authorProgress.aprSpokeColor = val;
                await plugin.saveSettings();
                refreshPreview();
                spokeColorPickerRef?.setValue(val);
            }
        });
    });
    
    // Dropdown for mode (added after color controls, appears to the right)
    spokeColorSetting.addDropdown(drop => {
        drop.addOption('dark', 'Light Strokes');
        drop.addOption('light', 'Dark Strokes');
        drop.addOption('none', 'No Strokes');
        drop.addOption('custom', 'Custom Color');
        // Use spoke mode if set, otherwise fall back to theme
        const currentValue = currentSpokeMode !== 'dark' ? currentSpokeMode : (currentTheme !== 'dark' ? currentTheme : 'dark');
        drop.setValue(currentValue);
        drop.onChange(async (val) => {
            if (!plugin.settings.authorProgress) return;
            const mode = (val as 'dark' | 'light' | 'none' | 'custom') || 'dark';
            // Update both theme and spoke mode to keep them in sync
            plugin.settings.authorProgress.aprTheme = mode === 'custom' ? 'dark' : (mode as 'dark' | 'light' | 'none');
            plugin.settings.authorProgress.aprSpokeColorMode = mode;
            await plugin.saveSettings();
            
            // Enable/disable color controls based on mode (always visible, just disabled)
            const isCustom = mode === 'custom';
            spokeColorPickerRef?.setDisabled(!isCustom);
            spokeColorInputRef?.setDisabled(!isCustom);
            if (isCustom && spokeColorInputRef) {
                const current = plugin.settings.authorProgress.aprSpokeColor || fallbackColor;
                spokeColorInputRef.setValue(current);
                spokeColorPickerRef?.setValue(current);
            } else if (spokeColorInputRef) {
                spokeColorInputRef.setValue(fallbackColor);
                spokeColorPickerRef?.setValue(fallbackColor);
            }
            
            refreshPreview();
        });
    });

    const setColorPicker = (
        setting: Setting, 
        key: 'aprAuthorColor' | 'aprEngineColor' | 'aprPercentNumberColor' | 'aprPercentSymbolColor', 
        fallback: string,
        onColorChange?: () => void
    ) => {
        const current = (settings as any)?.[key] || fallback;
        setting.addColorPicker(picker => {
            if (key === 'aprAuthorColor') authorColorPickerRef = picker;
            else if (key === 'aprPercentNumberColor') percentNumberColorPickerRef = picker;
            else if (key === 'aprPercentSymbolColor') percentSymbolColorPickerRef = picker;
            
            picker.setValue(current);
            picker.onChange(async (val) => {
                if (!plugin.settings.authorProgress) return;
                (plugin.settings.authorProgress as any)[key] = val || fallback;
                onColorChange?.();
                await plugin.saveSettings();
                refreshPreview();
            });
        });
        setting.addText(text => {
            if (key === 'aprAuthorColor') authorTextRef = text;
            else if (key === 'aprPercentNumberColor') percentNumberTextRef = text;
            else if (key === 'aprPercentSymbolColor') percentSymbolTextRef = text;
            
            text.setPlaceholder(fallback).setValue(current);
            text.inputEl.classList.add('rt-hex-input');
            text.onChange(async (val) => {
                if (!val) return;
                if (!plugin.settings.authorProgress) return;
                (plugin.settings.authorProgress as any)[key] = val;
                onColorChange?.();
                await plugin.saveSettings();
                refreshPreview();
            });
        });
    };

    // Color Palette and Book Title Color - grouped together with border
    const bookTitleColorFallback = plugin.settings.publishStageColors?.Press || '#6FB971';
    const currentBookTitleColor = settings?.aprBookAuthorColor || bookTitleColorFallback;
    const paletteGroupWrapper = stylingCard.createDiv({ cls: 'rt-apr-palette-book-title-group' });
    
    // Track last applied palette and color picker refs
    let lastAppliedPalette: { bookTitle: string; authorName: string; percentNumber: string; percentSymbol: string } | null = null;
    let bookTitleColorPickerRef: ColorComponent | undefined;
    let bookTitleTextRef: TextComponent | undefined;
    let authorColorPickerRef: ColorComponent | undefined;
    let authorTextRef: TextComponent | undefined;
    let percentNumberColorPickerRef: ColorComponent | undefined;
    let percentNumberTextRef: TextComponent | undefined;
    let percentSymbolColorPickerRef: ColorComponent | undefined;
    let percentSymbolTextRef: TextComponent | undefined;
    
    // Set border color and active state
    const updateBorderState = (color: string, isActive: boolean) => {
        paletteGroupWrapper.style.setProperty('--rt-palette-border-color', color);
        if (isActive) {
            paletteGroupWrapper.classList.remove('rt-palette-inactive');
        } else {
            paletteGroupWrapper.classList.add('rt-palette-inactive');
        }
    };
    
    // Check if current colors match the last applied palette
    const checkPaletteActive = () => {
        if (!lastAppliedPalette || !plugin.settings.authorProgress) {
            updateBorderState(currentBookTitleColor, false);
            return;
        }
        const current = plugin.settings.authorProgress;
        const matches = 
            (current.aprBookAuthorColor || bookTitleColorFallback) === lastAppliedPalette.bookTitle &&
            (current.aprAuthorColor || bookTitleColorFallback) === lastAppliedPalette.authorName &&
            (current.aprPercentNumberColor || bookTitleColorFallback) === lastAppliedPalette.percentNumber &&
            (current.aprPercentSymbolColor || bookTitleColorFallback) === lastAppliedPalette.percentSymbol;
        updateBorderState(current.aprBookAuthorColor || bookTitleColorFallback, matches);
    };
    
    updateBorderState(currentBookTitleColor, false);
    
    // Color Palette Helper - moved above Book Title Color
    const paletteHelperSetting = new Setting(paletteGroupWrapper)
        .setName('Color Palette')
        .setDesc('Apply a preset color palette or generate one from your Book Title Color.');
    // Add palette icon to the name (prepend before text)
    const paletteIcon = paletteHelperSetting.nameEl.createSpan({ cls: 'rt-setting-icon' });
    setIcon(paletteIcon, 'palette');
    // Insert icon at the beginning
    if (paletteHelperSetting.nameEl.firstChild) {
        paletteHelperSetting.nameEl.insertBefore(paletteIcon, paletteHelperSetting.nameEl.firstChild);
    } else {
        paletteHelperSetting.nameEl.prepend(paletteIcon);
    }
    paletteHelperSetting.addButton(button => {
        button.setButtonText('Choose Palette...');
        button.setCta();
        button.onClick(() => {
            if (!plugin.settings.authorProgress) return;
            const modal = new AprPaletteModal(app, plugin, plugin.settings.authorProgress, (palette) => {
                // Update settings
                if (!plugin.settings.authorProgress) return;
                plugin.settings.authorProgress.aprBookAuthorColor = palette.bookTitle;
                plugin.settings.authorProgress.aprAuthorColor = palette.authorName;
                plugin.settings.authorProgress.aprPercentNumberColor = palette.percentNumber;
                plugin.settings.authorProgress.aprPercentSymbolColor = palette.percentSymbol;
                
                // Update color picker components
                bookTitleColorPickerRef?.setValue(palette.bookTitle);
                bookTitleTextRef?.setValue(palette.bookTitle);
                authorColorPickerRef?.setValue(palette.authorName);
                authorTextRef?.setValue(palette.authorName);
                percentNumberColorPickerRef?.setValue(palette.percentNumber);
                percentNumberTextRef?.setValue(palette.percentNumber);
                percentSymbolColorPickerRef?.setValue(palette.percentSymbol);
                percentSymbolTextRef?.setValue(palette.percentSymbol);
                
                // Store as last applied palette
                lastAppliedPalette = palette;
                updateBorderState(palette.bookTitle, true);
                
                refreshPreview();
            });
            modal.open();
        });
    });

    // Book Title Color with border color update
    const bookColorSetting = new Setting(paletteGroupWrapper).setName('Book Title Color').setDesc('Used for the book title in the perimeter text.');
    const currentBookColor = settings?.aprBookAuthorColor || bookTitleColorFallback;
    bookColorSetting.addColorPicker(picker => {
        bookTitleColorPickerRef = picker;
        picker.setValue(currentBookColor);
        picker.onChange(async (val) => {
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprBookAuthorColor = val || bookTitleColorFallback;
            checkPaletteActive();
            await plugin.saveSettings();
            refreshPreview();
        });
    });
    bookColorSetting.addText(text => {
        bookTitleTextRef = text;
        text.setPlaceholder(bookTitleColorFallback).setValue(currentBookColor);
        text.inputEl.classList.add('rt-hex-input');
        text.onChange(async (val) => {
            if (!val) return;
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprBookAuthorColor = val;
            checkPaletteActive();
            await plugin.saveSettings();
            refreshPreview();
        });
    });

    const authorColorSetting = new Setting(stylingCard).setName('Author Name Color').setDesc('Used for the author name in the perimeter text.');
    setColorPicker(authorColorSetting, 'aprAuthorColor', plugin.settings.publishStageColors?.Press || '#6FB971', checkPaletteActive);

    const percentNumberColorSetting = new Setting(stylingCard).setName('% number color').setDesc('Color for the center % number.');
    setColorPicker(percentNumberColorSetting, 'aprPercentNumberColor', plugin.settings.publishStageColors?.Press || '#6FB971', checkPaletteActive);

    const percentSymbolColorSetting = new Setting(stylingCard).setName('% symbol color').setDesc('Color for the center % symbol.');
    setColorPicker(percentSymbolColorSetting, 'aprPercentSymbolColor', plugin.settings.publishStageColors?.Press || '#6FB971', checkPaletteActive);

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

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLISHING SECTION
    // Pro users use Campaign Manager instead, non-Pro users see basic publishing options
    // ─────────────────────────────────────────────────────────────────────────
    const isProActive = isProfessionalActive(plugin);
    
    // Only show basic Publishing & Automation for non-Pro users
    if (!isProActive) {
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
    
    // Pro upgrade teaser for non-Pro users
    const proTeaser = automationCard.createDiv({ cls: 'rt-apr-pro-teaser' });
    const teaserIcon = proTeaser.createSpan({ cls: 'rt-apr-pro-teaser-icon' });
    setIcon(teaserIcon, 'signature');
    const teaserText = proTeaser.createDiv({ cls: 'rt-apr-pro-teaser-text' });
    teaserText.createEl('strong', { text: 'Want more?' });
    teaserText.createEl('span', { 
        text: ' Campaign Manager lets you create multiple embeds with Teaser Reveal—progressively show more detail as you write.' 
    });
    const teaserLink = proTeaser.createEl('a', {
        text: 'Upgrade to Pro →',
        href: 'https://radialtimeline.com/pro',
        cls: 'rt-apr-pro-teaser-link',
        attr: { target: '_blank', rel: 'noopener' }
    });
    } // End of non-Pro publishing section

    // ─────────────────────────────────────────────────────────────────────────
    // CAMPAIGN MANAGER (PRO FEATURE)
    // Only shown to Pro users - replaces basic Publishing & Automation
    // ─────────────────────────────────────────────────────────────────────────
    if (isProActive) {
        renderCampaignManagerSection({
            app,
            plugin,
            containerEl: contentWrapper,
            onCampaignChange: () => {
                // Refresh the hero preview when campaigns change
                const size = plugin.settings.authorProgress?.aprSize || 'medium';
                void renderHeroPreview(app, plugin, previewContainer, size);
            }
        });
    }
}

/**
 * Render the APR SVG preview in the hero section
 * Uses the dedicated APR renderer at 1:1 actual size
 */
async function renderHeroPreview(
    app: App, 
    plugin: RadialTimelinePlugin, 
    container: HTMLElement,
    size: 'small' | 'medium' | 'large' = 'medium'
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
        
        const { svgString, width, height } = createAprSVG(scenes, {
            size: size,
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
            authorColor: aprSettings?.aprAuthorColor ?? aprSettings?.aprBookAuthorColor ?? (plugin.settings.publishStageColors?.Press),
            engineColor: aprSettings?.aprEngineColor,
            percentNumberColor: aprSettings?.aprPercentNumberColor ?? aprSettings?.aprBookAuthorColor ?? (plugin.settings.publishStageColors?.Press),
            percentSymbolColor: aprSettings?.aprPercentSymbolColor ?? aprSettings?.aprBookAuthorColor ?? (plugin.settings.publishStageColors?.Press),
            theme: aprSettings?.aprTheme || 'dark',
            spokeColor: aprSettings?.aprSpokeColorMode === 'custom' ? aprSettings?.aprSpokeColor : undefined
        });
        
        container.empty();
        
        // Create a wrapper to ensure SVG displays at natural size
        const svgWrapper = container.createDiv({ cls: 'rt-apr-svg-wrapper' });
        svgWrapper.innerHTML = svgString; // SAFE: innerHTML used for SVG preview injection
        
        // Ensure the SVG has explicit dimensions for 1:1 display
        const svgEl = svgWrapper.querySelector('svg');
        if (svgEl) {
            svgEl.setAttribute('width', String(width));
            svgEl.setAttribute('height', String(height));
        }
        
    } catch (e) {
        container.empty();
        container.createDiv({ 
            cls: 'rt-apr-hero-preview-error',
            text: 'Failed to render preview.' 
        });
        console.error('APR Settings Preview error:', e);
    }
}
