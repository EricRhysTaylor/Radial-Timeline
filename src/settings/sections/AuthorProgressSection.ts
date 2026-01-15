import { App, Setting, Notice, setIcon, normalizePath, ColorComponent, DropdownComponent, TextComponent, Modal, ButtonComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { AuthorProgressService } from '../../services/AuthorProgressService';
import { DEFAULT_SETTINGS } from '../defaults';
import type { AuthorProgressSettings } from '../../types/settings';
import { getAllScenes } from '../../utils/manuscript';
import { createAprSVG } from '../../renderer/apr/AprRenderer';
import { getPresetPalettes, generatePaletteFromColor } from '../../utils/aprPaletteGenerator';
import { AprPaletteModal } from '../../modals/AprPaletteModal';
import { renderCampaignManagerSection } from './CampaignManagerSection';
import { isProfessionalActive } from './ProfessionalSection';
import { addWikiLinkToElement } from '../wikiLink';

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
    badge.createSpan({ text: needsRefresh ? 'Reminder to Refresh' : 'Share · Author Progress Report' });
    // Add wiki link to the badge
    addWikiLinkToElement(badge, 'Settings#social-media');
    
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

    // ─────────────────────────────────────────────────────────────────────────
    // UNIFIED TYPOGRAPHY & COLOR CONTROLS
    // Each element: Row 1 = Label + Text Input (if applicable) + Color + Hex
    //               Row 2 = Font + Weight
    // ─────────────────────────────────────────────────────────────────────────
    const typographyContainer = stylingCard.createDiv({ cls: 'rt-apr-typography-container' });
    
    // Palette tracking & color picker refs
    let lastAppliedPalette: { bookTitle: string; authorName: string; percentNumber: string; percentSymbol: string } | null = null;
    let bookTitleColorPickerRef: ColorComponent | undefined;
    let bookTitleTextRef: TextComponent | undefined;
    let authorColorPickerRef: ColorComponent | undefined;
    let authorTextRef: TextComponent | undefined;
    let percentNumberColorPickerRef: ColorComponent | undefined;
    let percentNumberTextRef: TextComponent | undefined;
    let percentSymbolColorPickerRef: ColorComponent | undefined;
    let percentSymbolTextRef: TextComponent | undefined;
    
    const bookTitleColorFallback = plugin.settings.publishStageColors?.Press || '#6FB971';
    
    // Curated font list
    const FONT_OPTIONS = [
        { value: 'default', label: 'Default' },
        { value: 'Inter', label: 'Inter' },
        { value: 'system-ui', label: 'System UI' },
        { value: 'Exo', label: 'Exo' },
        { value: 'Roboto', label: 'Roboto' },
        { value: 'Montserrat', label: 'Montserrat' },
        { value: 'Open Sans', label: 'Open Sans' },
        { value: 'Dancing Script', label: 'Dancing Script' },
        { value: 'Caveat', label: 'Caveat' }
    ];
    
    // Weight options with italic variants
    const WEIGHT_OPTIONS = [
        { value: '300', label: 'Light (300)' },
        { value: '300-italic', label: 'Light Italic' },
        { value: '400', label: 'Normal (400)' },
        { value: '400-italic', label: 'Normal Italic' },
        { value: '500', label: 'Medium (500)' },
        { value: '500-italic', label: 'Medium Italic' },
        { value: '600', label: 'Semi-Bold (600)' },
        { value: '600-italic', label: 'Semi-Bold Italic' },
        { value: '700', label: 'Bold (700)' },
        { value: '700-italic', label: 'Bold Italic' },
        { value: '800', label: 'Extra-Bold (800)' },
        { value: '800-italic', label: 'Extra-Bold Italic' },
        { value: '900', label: 'Black (900)' },
        { value: '900-italic', label: 'Black Italic' }
    ];
    
    const parseWeightValue = (val: string): { weight: number; italic: boolean } => {
        if (val.includes('-italic')) {
            return { weight: parseInt(val.split('-')[0], 10), italic: true };
        }
        return { weight: parseInt(val, 10), italic: false };
    };
    
    const formatWeightValue = (weight: number, italic: boolean): string => {
        return italic ? `${weight}-italic` : String(weight);
    };

    const numberFromText = (val: string): number | undefined => {
        const parsed = Number.parseFloat(val.trim());
        return Number.isFinite(parsed) ? parsed : undefined;
    };

    const setAprSetting = async <K extends keyof AuthorProgressSettings>(key: K, value: AuthorProgressSettings[K] | undefined): Promise<void> => {
        if (!plugin.settings.authorProgress) return;
        plugin.settings.authorProgress[key] = value as AuthorProgressSettings[K];
        await plugin.saveSettings();
        refreshPreview();
    };

    const setAprSettings = async (updates: Partial<AuthorProgressSettings>): Promise<void> => {
        if (!plugin.settings.authorProgress) return;
        Object.assign(plugin.settings.authorProgress, updates);
        await plugin.saveSettings();
        refreshPreview();
    };

    const applyFontDropdown = (
        drop: DropdownComponent,
        currentValue: string | undefined,
        onSave: (value: string) => Promise<void>
    ): void => {
        const customValue = '__custom__';
        let currentFont = currentValue || 'Inter';
        let isUpdating = false;

        const updateOptions = (value: string): void => {
            isUpdating = true;
            while (drop.selectEl.firstChild) {
                drop.selectEl.firstChild.remove();
            }
            FONT_OPTIONS.forEach(font => drop.addOption(font.value, font.label));
            const normalized = value === 'Inter' ? 'default' : value;
            const hasOption = FONT_OPTIONS.some(opt => opt.value === normalized);
            if (!hasOption) {
                drop.addOption(normalized, `Custom: ${normalized}`);
            }
            drop.addOption(customValue, 'Custom...');
            drop.setValue(normalized);
            isUpdating = false;
        };

        const openCustomModal = (): void => {
            const modal = new Modal(app);
            modal.modalEl.addClass('ert-typography-modal');
            modal.titleEl.setText('Custom font');
            modal.onClose = () => {
                updateOptions(currentFont);
            };

            const body = modal.contentEl.createDiv({ cls: 'ert-typography-modal__body' });
            body.createEl('p', { text: 'Enter a font family available on your system.', cls: 'ert-typography-modal__hint' });

            const input = new TextComponent(body);
            input.setPlaceholder('e.g., EB Garamond');
            input.inputEl.addClass('ert-typography-modal__input');

            const normalized = currentFont === 'Inter' ? 'default' : currentFont;
            if (!FONT_OPTIONS.some(opt => opt.value === normalized)) {
                input.setValue(currentFont);
            }

            const actions = modal.contentEl.createDiv({ cls: 'ert-typography-modal__actions' });
            new ButtonComponent(actions)
                .setButtonText('Cancel')
                .onClick(() => {
                    modal.close();
                });

            new ButtonComponent(actions)
                .setButtonText('Save')
                .setCta()
                .onClick(async () => {
                    const value = input.getValue().trim();
                    if (!value) {
                        input.inputEl.focus();
                        return;
                    }
                    await onSave(value);
                    currentFont = value;
                    updateOptions(currentFont);
                    modal.close();
                });

            modal.open();
        };

        updateOptions(currentFont);

        drop.onChange(async (val) => {
            if (isUpdating) return;
            if (val === customValue) {
                openCustomModal();
                return;
            }
            const next = val === 'default' ? 'Inter' : val;
            if (next === currentFont) return;
            await onSave(next);
            currentFont = next;
        });
    };

    const addTypographyRow = (
        parent: HTMLElement,
        label: string,
        opts: {
            familyKey: keyof AuthorProgressSettings;
            weightKey: keyof AuthorProgressSettings;
            italicKey: keyof AuthorProgressSettings;
            sizeKeys?: (keyof AuthorProgressSettings)[];
            sizePlaceholders?: string[];
            weightDefault: number;
            italicDefault?: boolean;
            fontDefault?: string;
        }
    ): void => {
        const row = new Setting(parent).setName(label);
        row.descEl.remove();
        row.settingEl.addClass('ert-typography-row');

        const controls = row.controlEl.createDiv({ cls: 'ert-typography-controls' });

        const fontDrop = new DropdownComponent(controls);
        fontDrop.selectEl.addClass('ert-typography-select');
        const currentFont = (settings?.[opts.familyKey] as string | undefined) ?? opts.fontDefault ?? 'Inter';
        applyFontDropdown(fontDrop, currentFont, async (val) => {
            await setAprSetting(opts.familyKey, val as AuthorProgressSettings[typeof opts.familyKey]);
        });

        const styleDrop = new DropdownComponent(controls);
        styleDrop.selectEl.addClass('ert-typography-select');
        WEIGHT_OPTIONS.forEach(opt => styleDrop.addOption(opt.value, opt.label));
        const currentWeight = (settings?.[opts.weightKey] as number | undefined) ?? opts.weightDefault;
        const currentItalic = (settings?.[opts.italicKey] as boolean | undefined) ?? opts.italicDefault ?? false;
        styleDrop.setValue(formatWeightValue(currentWeight, currentItalic));
        styleDrop.onChange(async (val) => {
            const { weight, italic } = parseWeightValue(val);
            await setAprSettings({
                [opts.weightKey]: weight,
                [opts.italicKey]: italic
            } as Partial<AuthorProgressSettings>);
        });

        const sizeInputs: Array<{ key: keyof AuthorProgressSettings; input: TextComponent }> = [];
        let autoButton: HTMLButtonElement | null = null;

        const updateAutoState = (): void => {
            if (!autoButton || !opts.sizeKeys?.length) return;
            const isAuto = opts.sizeKeys.every(key => settings?.[key] === undefined);
            autoButton.classList.toggle('is-active', isAuto);
        };

        if (opts.sizeKeys?.length) {
            const sizeGroup = controls.createDiv({ cls: 'ert-typography-size-group' });
            opts.sizeKeys.forEach((key, index) => {
                const input = new TextComponent(sizeGroup);
                input.inputEl.addClass('ert-typography-size-input');
                input.setPlaceholder(opts.sizePlaceholders?.[index] ?? 'Auto');
                const currentValue = settings?.[key] as number | undefined;
                input.setValue(currentValue !== undefined ? String(currentValue) : '');
                input.onChange(async (val) => {
                    const next = val.trim() ? numberFromText(val) : undefined;
                    if (val.trim() && next === undefined) return;
                    await setAprSetting(key, next as AuthorProgressSettings[typeof key]);
                    updateAutoState();
                });
                sizeInputs.push({ key, input });
            });

            autoButton = controls.createEl('button', { text: 'Auto', cls: 'ert-chip ert-typography-auto' });
            autoButton.type = 'button';
            autoButton.addEventListener('click', async () => {
                const updates: Partial<AuthorProgressSettings> = {};
                opts.sizeKeys?.forEach((key) => {
                    updates[key] = undefined;
                });
                await setAprSettings(updates);
                sizeInputs.forEach(({ input }) => input.setValue(''));
                updateAutoState();
            });
        }

        updateAutoState();
    };
    
    // ─────────────────────────────────────────────────────────────────────────
    // COLOR PALETTE (at top, inside bordered group)
    // ─────────────────────────────────────────────────────────────────────────
    const currentBookTitleColorVal = settings?.aprBookAuthorColor || bookTitleColorFallback;
    const paletteGroupWrapper = typographyContainer.createDiv({ cls: 'rt-apr-palette-book-title-group rt-apr-unified-group' });
    paletteGroupWrapper.style.setProperty('--rt-palette-border-color', currentBookTitleColorVal);
    
    const paletteHelperSetting = new Setting(paletteGroupWrapper).setName('Color Palette');
    paletteHelperSetting.descEl.remove();
    const paletteIcon = paletteHelperSetting.nameEl.createSpan({ cls: 'rt-setting-icon' });
    setIcon(paletteIcon, 'palette');
    
    paletteHelperSetting.addButton(button => {
        button.setButtonText('Choose Palette');
        button.setCta();
        button.onClick(() => {
            const modal = new AprPaletteModal(app, plugin, plugin.settings.authorProgress || DEFAULT_SETTINGS.authorProgress || {} as any, (palette) => {
                bookTitleColorPickerRef?.setValue(palette.bookTitle);
                bookTitleTextRef?.setValue(palette.bookTitle);
                authorColorPickerRef?.setValue(palette.authorName);
                authorTextRef?.setValue(palette.authorName);
                percentNumberColorPickerRef?.setValue(palette.percentNumber);
                percentNumberTextRef?.setValue(palette.percentNumber);
                percentSymbolColorPickerRef?.setValue(palette.percentSymbol);
                percentSymbolTextRef?.setValue(palette.percentSymbol);
                paletteGroupWrapper.style.setProperty('--rt-palette-border-color', palette.bookTitle);
                lastAppliedPalette = palette;
                refreshPreview();
            });
            modal.open();
        });
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // TITLE SECTION
    // Row 1: Title label + text input + color swatch + hex
    // Row 2: Font + Weight
    // ─────────────────────────────────────────────────────────────────────────
    const titleRow1 = new Setting(paletteGroupWrapper).setName('Title');
    titleRow1.descEl.remove();
    titleRow1.settingEl.addClass('rt-apr-unified-row');
    
    titleRow1.addText(text => {
        text.setPlaceholder('Working Title');
        text.setValue(settings?.bookTitle || '');
        text.inputEl.addClass('rt-apr-text-input');
        text.onChange(async (val) => {
            if (plugin.settings.authorProgress) {
                plugin.settings.authorProgress.bookTitle = val;
                await plugin.saveSettings();
                refreshPreview();
            }
        });
    });
    
    titleRow1.addColorPicker(picker => {
        bookTitleColorPickerRef = picker;
        picker.setValue(currentBookTitleColorVal);
        picker.onChange(async (val) => {
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprBookAuthorColor = val || bookTitleColorFallback;
            await plugin.saveSettings();
            refreshPreview();
            bookTitleTextRef?.setValue(val);
            paletteGroupWrapper.style.setProperty('--rt-palette-border-color', val);
        });
    });
    
    titleRow1.addText(text => {
        bookTitleTextRef = text;
        text.inputEl.classList.add('rt-hex-input');
        text.setPlaceholder(bookTitleColorFallback).setValue(currentBookTitleColorVal);
        text.onChange(async (val) => {
            if (!val || !/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val)) return;
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprBookAuthorColor = val;
            await plugin.saveSettings();
            refreshPreview();
            bookTitleColorPickerRef?.setValue(val);
            paletteGroupWrapper.style.setProperty('--rt-palette-border-color', val);
        });
    });
    
    addTypographyRow(paletteGroupWrapper, 'Title', {
        familyKey: 'aprBookTitleFontFamily',
        weightKey: 'aprBookTitleFontWeight',
        italicKey: 'aprBookTitleFontItalic',
        sizeKeys: ['aprBookTitleFontSize'],
        sizePlaceholders: ['Auto'],
        weightDefault: 400
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // AUTHOR SECTION
    // ─────────────────────────────────────────────────────────────────────────
    const authorGroup = typographyContainer.createDiv({ cls: 'rt-apr-unified-group' });
    
    const authorColorFallback = settings?.aprBookAuthorColor || bookTitleColorFallback;
    const currentAuthorColor = settings?.aprAuthorColor || authorColorFallback;
    
    const authorRow1 = new Setting(authorGroup).setName('Author');
    authorRow1.descEl.remove();
    authorRow1.settingEl.addClass('rt-apr-unified-row');
    
    authorRow1.addText(text => {
        text.setPlaceholder('Author Name');
        text.setValue(settings?.authorName || '');
        text.inputEl.addClass('rt-apr-text-input');
        text.onChange(async (val) => {
            if (plugin.settings.authorProgress) {
                plugin.settings.authorProgress.authorName = val;
                await plugin.saveSettings();
                refreshPreview();
            }
        });
    });
    
    authorRow1.addColorPicker(picker => {
        authorColorPickerRef = picker;
        picker.setValue(currentAuthorColor);
        picker.onChange(async (val) => {
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprAuthorColor = val || authorColorFallback;
            await plugin.saveSettings();
            refreshPreview();
            authorTextRef?.setValue(val);
        });
    });
    
    authorRow1.addText(text => {
        authorTextRef = text;
        text.inputEl.classList.add('rt-hex-input');
        text.setPlaceholder(authorColorFallback).setValue(currentAuthorColor);
        text.onChange(async (val) => {
            if (!val || !/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val)) return;
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprAuthorColor = val;
            await plugin.saveSettings();
            refreshPreview();
            authorColorPickerRef?.setValue(val);
        });
    });
    
    addTypographyRow(authorGroup, 'Author', {
        familyKey: 'aprAuthorNameFontFamily',
        weightKey: 'aprAuthorNameFontWeight',
        italicKey: 'aprAuthorNameFontItalic',
        sizeKeys: ['aprAuthorNameFontSize'],
        sizePlaceholders: ['Auto'],
        weightDefault: 400
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // % SYMBOL SECTION
    // ─────────────────────────────────────────────────────────────────────────
    const symbolGroup = typographyContainer.createDiv({ cls: 'rt-apr-unified-group' });
    
    const percentSymbolColorFallback = settings?.aprBookAuthorColor || bookTitleColorFallback;
    const currentPercentSymbolColor = settings?.aprPercentSymbolColor || percentSymbolColorFallback;
    
    const symbolRow1 = new Setting(symbolGroup).setName('% Symbol');
    symbolRow1.descEl.remove();
    symbolRow1.settingEl.addClass('rt-apr-unified-row');
    
    symbolRow1.addColorPicker(picker => {
        percentSymbolColorPickerRef = picker;
        picker.setValue(currentPercentSymbolColor);
        picker.onChange(async (val) => {
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprPercentSymbolColor = val || percentSymbolColorFallback;
            await plugin.saveSettings();
            refreshPreview();
            percentSymbolTextRef?.setValue(val);
        });
    });
    
    symbolRow1.addText(text => {
        percentSymbolTextRef = text;
        text.inputEl.classList.add('rt-hex-input');
        text.setPlaceholder(percentSymbolColorFallback).setValue(currentPercentSymbolColor);
        text.onChange(async (val) => {
            if (!val || !/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val)) return;
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprPercentSymbolColor = val;
            await plugin.saveSettings();
            refreshPreview();
            percentSymbolColorPickerRef?.setValue(val);
        });
    });
    
    addTypographyRow(symbolGroup, '% Symbol', {
        familyKey: 'aprPercentSymbolFontFamily',
        weightKey: 'aprPercentSymbolFontWeight',
        italicKey: 'aprPercentSymbolFontItalic',
        weightDefault: 800
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // % NUMBER SECTION
    // ─────────────────────────────────────────────────────────────────────────
    const numberGroup = typographyContainer.createDiv({ cls: 'rt-apr-unified-group' });
    
    const percentNumberColorFallback = settings?.aprBookAuthorColor || bookTitleColorFallback;
    const currentPercentNumberColor = settings?.aprPercentNumberColor || percentNumberColorFallback;
    
    const numberRow1 = new Setting(numberGroup).setName('% Number');
    numberRow1.descEl.remove();
    numberRow1.settingEl.addClass('rt-apr-unified-row');
    
    numberRow1.addColorPicker(picker => {
        percentNumberColorPickerRef = picker;
        picker.setValue(currentPercentNumberColor);
        picker.onChange(async (val) => {
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprPercentNumberColor = val || percentNumberColorFallback;
            await plugin.saveSettings();
            refreshPreview();
            percentNumberTextRef?.setValue(val);
        });
    });
    
    numberRow1.addText(text => {
        percentNumberTextRef = text;
        text.inputEl.classList.add('rt-hex-input');
        text.setPlaceholder(percentNumberColorFallback).setValue(currentPercentNumberColor);
        text.onChange(async (val) => {
            if (!val || !/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val)) return;
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprPercentNumberColor = val;
            await plugin.saveSettings();
            refreshPreview();
            percentNumberColorPickerRef?.setValue(val);
        });
    });
    
    addTypographyRow(numberGroup, '% Number', {
        familyKey: 'aprPercentNumberFontFamily',
        weightKey: 'aprPercentNumberFontWeight',
        italicKey: 'aprPercentNumberFontItalic',
        sizeKeys: [
            'aprPercentNumberFontSize1Digit',
            'aprPercentNumberFontSize2Digit',
            'aprPercentNumberFontSize3Digit'
        ],
        sizePlaceholders: ['1d', '2d', '3d'],
        weightDefault: 800
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // RT BADGE SECTION
    // ─────────────────────────────────────────────────────────────────────────
    const badgeGroup = typographyContainer.createDiv({ cls: 'rt-apr-unified-group' });
    
    const rtBadgeColorFallback = '#e5e5e5';
    const currentRtBadgeColor = settings?.aprEngineColor || rtBadgeColorFallback;
    
    const badgeRow1 = new Setting(badgeGroup).setName('RT Badge');
    badgeRow1.descEl.remove();
    badgeRow1.settingEl.addClass('rt-apr-unified-row');
    
    badgeRow1.addColorPicker(picker => {
        picker.setValue(currentRtBadgeColor);
        picker.onChange(async (val) => {
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprEngineColor = val || rtBadgeColorFallback;
            await plugin.saveSettings();
            refreshPreview();
        });
    });
    
    badgeRow1.addText(text => {
        text.inputEl.classList.add('rt-hex-input');
        text.setPlaceholder(rtBadgeColorFallback).setValue(currentRtBadgeColor);
        text.onChange(async (val) => {
            if (!val || !/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val)) return;
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprEngineColor = val;
            await plugin.saveSettings();
            refreshPreview();
        });
    });
    
    addTypographyRow(badgeGroup, 'RT Badge', {
        familyKey: 'aprRtBadgeFontFamily',
        weightKey: 'aprRtBadgeFontWeight',
        italicKey: 'aprRtBadgeFontItalic',
        sizeKeys: ['aprRtBadgeFontSize'],
        sizePlaceholders: ['Auto'],
        weightDefault: 700
    });

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


    // Link URL (Title and Author are now in the typography section above)
    const linkUrlSetting = new Setting(stylingCard)
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
            spokeColor: aprSettings?.aprSpokeColorMode === 'custom' ? aprSettings?.aprSpokeColor : undefined,
            // Typography settings
            bookTitleFontFamily: aprSettings?.aprBookTitleFontFamily,
            bookTitleFontWeight: aprSettings?.aprBookTitleFontWeight,
            bookTitleFontItalic: aprSettings?.aprBookTitleFontItalic,
            bookTitleFontSize: aprSettings?.aprBookTitleFontSize,
            authorNameFontFamily: aprSettings?.aprAuthorNameFontFamily,
            authorNameFontWeight: aprSettings?.aprAuthorNameFontWeight,
            authorNameFontItalic: aprSettings?.aprAuthorNameFontItalic,
            authorNameFontSize: aprSettings?.aprAuthorNameFontSize,
            percentNumberFontFamily: aprSettings?.aprPercentNumberFontFamily,
            percentNumberFontWeight: aprSettings?.aprPercentNumberFontWeight,
            percentNumberFontItalic: aprSettings?.aprPercentNumberFontItalic,
            percentNumberFontSize1Digit: aprSettings?.aprPercentNumberFontSize1Digit,
            percentNumberFontSize2Digit: aprSettings?.aprPercentNumberFontSize2Digit,
            percentNumberFontSize3Digit: aprSettings?.aprPercentNumberFontSize3Digit,
            percentSymbolFontFamily: aprSettings?.aprPercentSymbolFontFamily,
            percentSymbolFontWeight: aprSettings?.aprPercentSymbolFontWeight,
            percentSymbolFontItalic: aprSettings?.aprPercentSymbolFontItalic,
            rtBadgeFontFamily: aprSettings?.aprRtBadgeFontFamily,
            rtBadgeFontWeight: aprSettings?.aprRtBadgeFontWeight,
            rtBadgeFontItalic: aprSettings?.aprRtBadgeFontItalic,
            rtBadgeFontSize: aprSettings?.aprRtBadgeFontSize
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
