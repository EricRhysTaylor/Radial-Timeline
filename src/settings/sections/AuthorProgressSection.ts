import { App, Setting, Notice, setIcon, normalizePath, DropdownComponent, TextComponent, Modal, ButtonComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { AuthorProgressService } from '../../services/AuthorProgressService';
import { DEFAULT_SETTINGS } from '../defaults';
import type { AuthorProgressSettings, TeaserRevealLevel } from '../../types/settings';
import type { TimelineItem } from '../../types';
import { getAllScenes } from '../../utils/manuscript';
import { createAprSVG } from '../../renderer/apr/AprRenderer';
import { getTeaserRevealLevel, getTeaserThresholds, teaserLevelToRevealOptions } from '../../renderer/apr/AprConstants';
import { getPresetPalettes, generatePaletteFromColor } from '../../utils/aprPaletteGenerator';
import { AprPaletteModal } from '../../modals/AprPaletteModal';
import { renderCampaignManagerSection } from './CampaignManagerSection';
import { isProfessionalActive } from './ProfessionalSection';
import { colorSwatch, type ColorSwatchHandle } from '../../ui/ui';
import { ERT_CLASSES } from '../../ui/classes';
import { STAGE_ORDER } from '../../utils/constants';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';

export interface AuthorProgressSectionProps {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

type TeaserPreviewMode = 'auto' | TeaserRevealLevel;

export function renderAuthorProgressSection({ app, plugin, containerEl }: AuthorProgressSectionProps): void {
    // Social is ERT-only; avoid legacy classes.
    const section = containerEl.createDiv({
        cls: `ert-apr-section ${ERT_CLASSES.ROOT} ${ERT_CLASSES.SKIN_SOCIAL} ${ERT_CLASSES.STACK}`
    });

    // Check if APR needs refresh
    const aprService = new AuthorProgressService(plugin, app);
    const needsRefresh = aprService.isStale();
    const isProActive = isProfessionalActive(plugin);

    // ─────────────────────────────────────────────────────────────────────────
    // APR HERO SECTION
    // ─────────────────────────────────────────────────────────────────────────
    const hero = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.CARD_HERO} ${ERT_CLASSES.STACK}` });

    // Badge row with pill - turns red when refresh needed
    const badgeRow = hero.createDiv({ cls: ERT_CLASSES.INLINE });
    const badgeClasses = needsRefresh ?
        `ert-badgePill--alert ${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_APR}` :
        `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_APR}`;
    const badge = badgeRow.createSpan({ cls: badgeClasses });
    // Left Icon and Text
    setIcon(badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON }), needsRefresh ? 'alert-triangle' : 'radio');
    badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: needsRefresh ? 'Reminder to Refresh' : 'Share · Author Progress Report' });

    // Right Icon (Wiki Link) - Manually constructed for ERT styling
    const wikiLink = badge.createEl('a', {
        href: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#social-media',
        cls: 'ert-badgePill__rightIcon',
        attr: {
            'aria-label': 'Read more in the Wiki',
            'target': '_blank',
            'rel': 'noopener'
        }
    });
    setIcon(wikiLink, 'external-link');

    // Big headline
    hero.createEl('h3', {
        cls: `${ERT_CLASSES.SECTION_TITLE} ert-hero-title`,
        text: 'Promote your latest work across social media.'
    });

    // Description paragraph
    hero.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-hero-subtitle ert-apr-hero-subtitle`,
        text: 'Generate vibrant, spoiler-safe progress graphics for social media and crowdfunding. Perfect for Kickstarter updates, Patreon posts, or sharing your writing journey with fans.'
    });

    // Features section
    const featuresSection = hero.createDiv({
        cls: `${ERT_CLASSES.HERO_FEATURES} ${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}`
    });
    featuresSection.createEl('h5', { text: 'Key Benefits:', cls: 'ert-kicker' });
    const featuresList = featuresSection.createEl('ul', { cls: ERT_CLASSES.STACK });
    [
        { icon: 'eye-off', text: 'Spoiler-Safe — Scene titles and content are not part of the graphic build process.' },
        { icon: 'share-2', text: 'Shareable — Export as static snapshot or live-updating embed' },
        { icon: 'trending-up', text: 'Stage-Weighted Progress — Tracks advancement through Zero → Author → House → Press' },
    ].forEach(feature => {
        const li = featuresList.createEl('li', { cls: `${ERT_CLASSES.INLINE} ert-feature-item` });
        const iconSpan = li.createSpan({ cls: 'ert-feature-icon' });
        setIcon(iconSpan, feature.icon);
        li.createSpan({ text: feature.text });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // APR PREVIEW MODULE
    // ─────────────────────────────────────────────────────────────────────────
    const previewCard = section.createDiv({ cls: `${ERT_CLASSES.CARD} ${ERT_CLASSES.STACK}` });

    // Size selector row
    const sizeSelectorRow = previewCard.createDiv({ cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_COMPACT}` });
    sizeSelectorRow.createSpan({ text: 'Preview Size:', cls: ERT_CLASSES.LABEL });
    const sizeSelectorControls = sizeSelectorRow.createDiv({ cls: ERT_CLASSES.INLINE });
    let teaserPreviewMode: TeaserPreviewMode = 'auto';
    let refreshPreview = () => {};
    let teaserPreviewRow!: HTMLDivElement;
    const updateTeaserPreviewVisibility = (size: 'thumb' | 'small' | 'medium' | 'large') => {
        teaserPreviewRow.toggleClass('ert-hidden', size === 'thumb');
    };

    const sizeButtons = [
        { size: 'thumb', dimension: '100' },
        { size: 'small', dimension: '150' },
        { size: 'medium', dimension: '300' },
        { size: 'large', dimension: '450' },
    ] as const;

    const currentSize = plugin.settings.authorProgress?.aprSize || 'medium';
    const setSizeLabel = (el: HTMLElement, dimension: string, suffix?: string) => {
        el.textContent = '';
        el.append(document.createTextNode(dimension));
        el.append(document.createTextNode('²'));
        if (suffix) {
            el.append(document.createTextNode(` — ${suffix}`));
        }
    };
    let dimLabel: HTMLElement | null = null;

    sizeButtons.forEach(({ size, dimension }) => {
        const btn = sizeSelectorControls.createEl('button', {
            cls: `ert-apr-size-btn ${size === currentSize ? `ert-apr-size-btn--active ${ERT_CLASSES.IS_ACTIVE}` : ''} ${ERT_CLASSES.PILL_BTN} ${ERT_CLASSES.PILL_BTN_STANDARD}`
        });
        setSizeLabel(btn, dimension);

        btn.onclick = async () => {
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprSize = size;
            await plugin.saveSettings();

            // Update button states
            sizeSelectorRow.querySelectorAll('.ert-apr-size-btn').forEach(b => {
                b.removeClass('ert-apr-size-btn--active');
                b.removeClass(ERT_CLASSES.IS_ACTIVE);
            });
            btn.addClass('ert-apr-size-btn--active');
            btn.addClass(ERT_CLASSES.IS_ACTIVE);

            // Update dimension label
            if (dimLabel) {
                setSizeLabel(dimLabel, dimension, 'Actual size preview');
            }

            // Re-render preview at new size
            updateTeaserPreviewVisibility(size);
            refreshPreview?.();
        };
    });

    // Dimension info
    const currentDim = sizeButtons.find(s => s.size === currentSize)?.dimension || '300';
    dimLabel = sizeSelectorRow.createEl('em', { cls: ERT_CLASSES.ROW_DESC });
    setSizeLabel(dimLabel, currentDim, 'Actual size preview');

    // Teaser preview (Pro only, sizes 150+)
    teaserPreviewRow = previewCard.createDiv({ cls: `${ERT_CLASSES.ROW} ${ERT_CLASSES.ROW_TIGHT} ${ERT_CLASSES.SKIN_PRO} ert-apr-teaser-preview-row` });
    if (!isProActive) {
        teaserPreviewRow.addClass('ert-pro-locked');
    }
    const teaserLabel = teaserPreviewRow.createDiv({ cls: ERT_CLASSES.INLINE });
    teaserLabel.createSpan({ text: 'Teaser Preview', cls: ERT_CLASSES.LABEL });
    const teaserBadge = teaserLabel.createSpan({ cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO} ${ERT_CLASSES.BADGE_PILL_SM}` });
    setIcon(teaserBadge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON }), 'signature');
    teaserBadge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: 'PRO' });
    const teaserControls = teaserPreviewRow.createDiv({ cls: ERT_CLASSES.INLINE });
    const teaserSelect = teaserControls.createEl('select', { cls: 'dropdown ert-input ert-input--md' });
    const teaserOptions: { value: TeaserPreviewMode; label: string }[] = [
        { value: 'auto', label: 'Auto (Current stage)' },
        { value: 'bar', label: 'Teaser' },
        { value: 'scenes', label: 'Scenes (B&W)' },
        { value: 'colors', label: 'Colors' },
        { value: 'full', label: 'Full (Subplots)' },
    ];
    teaserOptions.forEach(opt => {
        teaserSelect.createEl('option', { value: opt.value, text: opt.label });
    });
    teaserSelect.value = teaserPreviewMode;
    teaserSelect.onchange = () => {
        teaserPreviewMode = teaserSelect.value as TeaserPreviewMode;
        refreshPreview?.();
    };
    updateTeaserPreviewVisibility(currentSize);

    // 1:1 preview
    const previewSection = previewCard.createDiv({ cls: 'ert-apr-preview' });

    // SVG Preview container - shows at 1:1 actual size
    const previewContainer = previewSection.createDiv({ cls: `ert-apr-preview-frame ert-apr-preview--actual ${ERT_CLASSES.PREVIEW_FRAME} ert-previewFrame--flush` });
    previewContainer.createDiv({ cls: `ert-apr-preview-loading ${ERT_CLASSES.PREVIEW_INNER}`, text: 'Loading preview...' });

    // Load and render preview asynchronously at actual size
    renderHeroPreview(app, plugin, previewContainer, currentSize, teaserPreviewMode);
    refreshPreview = () => {
        const size = plugin.settings.authorProgress?.aprSize || 'medium';
        updateTeaserPreviewVisibility(size);
        void renderHeroPreview(app, plugin, previewContainer, size, teaserPreviewMode);
    };

    // Meta tags
    const settings = plugin.settings.authorProgress;
    const lastDate = settings?.lastPublishedDate
        ? new Date(settings.lastPublishedDate).toLocaleDateString()
        : 'Never';

    const meta = previewCard.createDiv({ cls: ERT_CLASSES.INLINE });
    meta.createSpan({ text: `Last update: ${lastDate}`, cls: `${ERT_CLASSES.CHIP} ${ERT_CLASSES.FIELD_NOTE}` });
    meta.createSpan({ text: 'Kickstarter ready', cls: ERT_CLASSES.CHIP });
    meta.createSpan({ text: 'Patreon friendly', cls: ERT_CLASSES.CHIP });

    // ─────────────────────────────────────────────────────────────────────────
    // CONFIGURATION SECTION
    // ─────────────────────────────────────────────────────────────────────────
    const contentWrapper = section.createDiv({ cls: `ert-apr-content ${ERT_CLASSES.STACK}` });

    // Styling (background + branding colors) - placed first, close to preview
    const stylingCard = contentWrapper.createDiv({ cls: ERT_CLASSES.PANEL });
    const stylingBlock = stylingCard.createDiv({ cls: ERT_CLASSES.STACK });
    const stylingHeader = stylingBlock.createDiv({ cls: ERT_CLASSES.PANEL_HEADER });
    const stylingHeading = new Setting(stylingHeader)
        .setName('Styling')
        .setDesc('Customize the look of your APR to express your personality. Set and style various text attributes such as the Working Title, Author, and geometry elements like the borders and background.')
        .setHeading();
    addHeadingIcon(stylingHeading, 'brush');
    addWikiLink(stylingHeading, 'Settings#social-media-styling');
    applyErtHeaderLayout(stylingHeading, { variant: 'inline' });
    const stylingBody = stylingBlock.createDiv({ cls: 'ert-typography-stack' });

    const currentBg = settings?.aprBackgroundColor || '#0d0d0f';
    const currentTransparent = settings?.aprCenterTransparent ?? true; // Default to true (recommended)
    const currentTheme = settings?.aprTheme || 'dark';
    const currentSpokeMode = settings?.aprSpokeColorMode || 'dark';
    const currentSpokeColor = settings?.aprSpokeColor || '#ffffff';

    // Transparency (Recommended) - placed FIRST with special styling
    const transparencySetting = new Setting(stylingBody)
        .setName('Transparent mode (recommended)')
        .setDesc('No background fill — adapts to any page or app. Ideal for websites, blogs, and platforms that preserve SVG transparency.');

    // Background color - for special situations only (when transparency is off)
    const bgSetting = new Setting(stylingBody)
        .setName('Background color')
        .setDesc('Bakes in a solid background. Use when transparency isn\'t reliable: email newsletters, Kickstarter, PDF exports, or platforms that rasterize SVGs.');

    // Store references to the color picker and text input for enabling/disabling
    let bgColorPicker: ColorSwatchHandle | null = null;
    let bgTextInput: TextComponent | null = null;

    // Helper to swap emphasis and enable/disable background controls
    const updateEmphasis = (isTransparent: boolean) => {
        if (isTransparent) {
            bgSetting.settingEl.classList.add('is-inactive');
            if (bgColorPicker) bgColorPicker.setDisabled(true);
            if (bgTextInput) bgTextInput.setDisabled(true);
        } else {
            bgSetting.settingEl.classList.remove('is-inactive');
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

    const bgSwatch = colorSwatch(bgSetting.controlEl, {
        value: currentBg,
        ariaLabel: 'Background color',
        onChange: async (val) => {
            if (!plugin.settings.authorProgress) return;
            const next = val || '#0d0d0f';
            plugin.settings.authorProgress.aprBackgroundColor = next;
            await plugin.saveSettings();
            bgTextInput?.setValue(next);
            refreshPreview();
        }
    });
    bgColorPicker = bgSwatch;

    bgSetting.addText(text => {
        bgTextInput = text;
        text.setPlaceholder('#0d0d0f').setValue(currentBg);
        text.inputEl.classList.add('ert-input--hex');
        text.onChange(async (val) => {
            if (!val) return;
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprBackgroundColor = val;
            await plugin.saveSettings();
            bgColorPicker?.setValue(val);
            refreshPreview();
        });
    });

    // Set initial emphasis state after controls are created
    updateEmphasis(currentTransparent);

    // Spokes & border controls (placed before Theme section)
    const spokeColorSetting = new Setting(stylingBody)
        .setName('Spokes and borders')
        .setDesc('Choose contrasting color or none. Controls all structural elements including scene borders and act division spokes.');
    spokeColorSetting.controlEl.addClass(ERT_CLASSES.INLINE);

    let spokeColorPickerRef: ColorSwatchHandle | undefined;
    let spokeColorInputRef: TextComponent | undefined;

    // Match Book Title Color layout exactly - always show color picker and text input
    const isCustomMode = currentSpokeMode === 'custom';
    const fallbackColor = '#ffffff';
    const spokeControlRow = spokeColorSetting.controlEl;
    const spokeColorPicker = colorSwatch(spokeControlRow, {
        value: isCustomMode ? currentSpokeColor : fallbackColor,
        ariaLabel: 'Spoke color',
        onChange: async (val) => {
            if (/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val)) {
                if (!plugin.settings.authorProgress) return;
                plugin.settings.authorProgress.aprSpokeColor = val || fallbackColor;
                await plugin.saveSettings();
                refreshPreview();
                spokeColorInputRef?.setValue(val);
            }
        }
    });
    spokeColorPickerRef = spokeColorPicker;
    spokeColorPicker.setDisabled(!isCustomMode);

    const spokeColorInput = new TextComponent(spokeControlRow);
    spokeColorInputRef = spokeColorInput;
    spokeColorInput.inputEl.classList.add('ert-input--hex');
    spokeColorInput.setPlaceholder(fallbackColor).setValue(isCustomMode ? currentSpokeColor : fallbackColor);
    spokeColorInput.setDisabled(!isCustomMode);
    spokeColorInput.onChange(async (val) => {
        if (!val) return;
        if (/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val)) {
            if (!plugin.settings.authorProgress) return;
            plugin.settings.authorProgress.aprSpokeColor = val;
            await plugin.saveSettings();
            refreshPreview();
            spokeColorPickerRef?.setValue(val);
        }
    });

    // Dropdown for mode (added after color controls, appears to the right)
    const spokeModeDropdown = new DropdownComponent(spokeControlRow);
    spokeModeDropdown.addOption('dark', 'Light Strokes');
    spokeModeDropdown.addOption('light', 'Dark Strokes');
    spokeModeDropdown.addOption('none', 'No Strokes');
    spokeModeDropdown.addOption('custom', 'Custom Color');
    // Use spoke mode if set, otherwise fall back to theme
    const currentValue = currentSpokeMode !== 'dark' ? currentSpokeMode : (currentTheme !== 'dark' ? currentTheme : 'dark');
    spokeModeDropdown.setValue(currentValue);
    spokeModeDropdown.onChange(async (val) => {
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

    // Link URL
    const linkUrlSetting = new Setting(stylingBody)
        .setName('Link URL')
        .setDesc('Where the graphic should link to (e.g. your website, Kickstarter, or shop).');

    linkUrlSetting.settingEl.addClass('ert-setting-full-width-input');

    linkUrlSetting.addText(text => {
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
        const isValidUrl = (value: string) => {
            try {
                const url = new URL(value);
                return url.protocol === 'http:' || url.protocol === 'https:';
            } catch {
                return false;
            }
        };

        text.setPlaceholder('https://your-site.com')
            .setValue(settings?.authorUrl || '')
            .onChange(() => {
                clearInputState();
            });

        const handleBlur = async () => {
            const val = text.getValue().trim();
            clearInputState();

            if (!val) {
                if (plugin.settings.authorProgress) {
                    plugin.settings.authorProgress.authorUrl = '';
                    await plugin.saveSettings();
                    refreshPreview();
                    flashSuccess();
                }
                return;
            }

            if (!isValidUrl(val)) {
                flashError();
                return;
            }

            if (plugin.settings.authorProgress) {
                plugin.settings.authorProgress.authorUrl = val;
                await plugin.saveSettings();
                refreshPreview();
                flashSuccess();
            }
        };

        plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
        plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                text.inputEl.blur();
            }
        });
    });

    // ─────────────────────────────────────────────────────────────────────────
    // UNIFIED TYPOGRAPHY & COLOR CONTROLS
    // Each element: Row 1 = Label + Text Input (if applicable) + Color + Hex
    //               Row 2 = Font + Weight
    // ─────────────────────────────────────────────────────────────────────────
    const themeCard = contentWrapper.createDiv({ cls: ERT_CLASSES.PANEL });
    const themeBlock = themeCard.createDiv({ cls: ERT_CLASSES.STACK });
    const themeHeader = themeBlock.createDiv({ cls: ERT_CLASSES.PANEL_HEADER });
    const themeHeading = new Setting(themeHeader)
        .setName('Theme')
        .setDesc('Theme palette applies curated colors across Title, Author, % Symbol, and % Number based on the Title color. Stage badge uses publish stage colors; manual edits override per row.')
        .setHeading();
    addHeadingIcon(themeHeading, 'swatch-book');
    addWikiLink(themeHeading, 'Settings#social-media-theme');
    const themeControl = themeHeading.controlEl;
    const themeBody = themeBlock.createDiv({ cls: 'ert-typography-stack' });

    // Palette tracking & color picker refs
    let lastAppliedPalette: { bookTitle: string; authorName: string; percentNumber: string; percentSymbol: string } | null = null;
    let bookTitleColorPickerRef: ColorSwatchHandle | undefined;
    let bookTitleTextRef: TextComponent | undefined;
    let authorColorPickerRef: ColorSwatchHandle | undefined;
    let authorTextRef: TextComponent | undefined;
    let percentNumberColorPickerRef: ColorSwatchHandle | undefined;
    let percentNumberTextRef: TextComponent | undefined;
    let percentSymbolColorPickerRef: ColorSwatchHandle | undefined;
    let percentSymbolTextRef: TextComponent | undefined;

    const themeButton = themeControl.createEl('button', { cls: 'ert-pillBtn ert-pillBtn--social' });
    themeButton.type = 'button';
    const themeIcon = themeButton.createSpan({ cls: 'ert-pillBtn__icon' });
    setIcon(themeIcon, 'swatch-book');
    themeButton.createSpan({ cls: 'ert-pillBtn__label', text: 'Choose Palette' });
    themeButton.addEventListener('click', () => {
        const modal = new AprPaletteModal(
            app,
            plugin,
            plugin.settings.authorProgress || DEFAULT_SETTINGS.authorProgress || {} as any,
            (palette) => {
                bookTitleColorPickerRef?.setValue(palette.bookTitle);
                bookTitleTextRef?.setValue(palette.bookTitle);
                authorColorPickerRef?.setValue(palette.authorName);
                authorTextRef?.setValue(palette.authorName);
                percentNumberColorPickerRef?.setValue(palette.percentNumber);
                percentNumberTextRef?.setValue(palette.percentNumber);
                percentSymbolColorPickerRef?.setValue(palette.percentSymbol);
                percentSymbolTextRef?.setValue(palette.percentSymbol);
                lastAppliedPalette = palette;
                refreshPreview();
            }
        );
        modal.open();
    });
    applyErtHeaderLayout(themeHeading);

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

    const clearPercentNumberOverrides = (): void => {
        if (!settings) return;
        const hasOverrides = [
            settings.aprPercentNumberFontSize1Digit,
            settings.aprPercentNumberFontSize2Digit,
            settings.aprPercentNumberFontSize3Digit
        ].some(value => value !== undefined && value !== null);
        if (!hasOverrides) return;
        void setAprSettings({
            aprPercentNumberFontSize1Digit: undefined,
            aprPercentNumberFontSize2Digit: undefined,
            aprPercentNumberFontSize3Digit: undefined
        });
    };

    clearPercentNumberOverrides();

    const applyFontDropdown = (
        drop: DropdownComponent,
        currentValue: string | undefined,
        onSave: (value: string) => Promise<void>
    ): { setValue: (value: string) => void } => {
        const customValue = '__custom__';
        let currentFont = currentValue || 'Inter';
        let isUpdating = false;
        const isCustomFont = (value: string): boolean => {
            const normalized = value.trim();
            const normalizedValue = normalized === 'Inter' ? 'default' : normalized;
            return !FONT_OPTIONS.some(opt => opt.value === normalizedValue) && normalizedValue !== 'default';
        };
        const fontCanvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
        const fontContext = fontCanvas?.getContext('2d') ?? null;
        const fontSample = 'abcdefghijklmnopqrstuvwxyz0123456789';
        const isFontLoaded = (value: string): boolean => {
            if (!isCustomFont(value)) return true;
            const trimmed = value.trim();
            if (!trimmed) return false;
            const fallback = 'monospace';
            if (!fontContext) return true;
            fontContext.font = `16px ${fallback}`;
            const baseline = fontContext.measureText(fontSample).width;
            fontContext.font = `16px "${trimmed}", ${fallback}`;
            const measured = fontContext.measureText(fontSample).width;
            const metricsMatch = measured === baseline;
            if (metricsMatch) return false;
            if (typeof document === 'undefined' || !('fonts' in document)) return true;
            try {
                return document.fonts.check(`16px "${trimmed}"`) || document.fonts.check(`16px ${trimmed}`);
            } catch {
                return false;
            }
        };
        const updateWarningState = (value: string): void => {
            const normalized = value.trim();
            const showWarning = isCustomFont(normalized) && !isFontLoaded(normalized);
            drop.selectEl.classList.toggle('ert-typography-select--warning', showWarning);
            if (showWarning) {
                drop.selectEl.title = `Font not loaded: ${normalized}. Check spelling or install the font.`;
            } else {
                drop.selectEl.removeAttribute('title');
            }
        };

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
            updateWarningState(currentFont);
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
            updateWarningState(currentFont);
        });

        const setValue = (value: string): void => {
            const next = value || 'Inter';
            currentFont = next;
            updateOptions(currentFont);
        };

        return { setValue };
    };

    type TypographyControlOptions = {
        familyKey: keyof AuthorProgressSettings;
        weightKey: keyof AuthorProgressSettings;
        italicKey: keyof AuthorProgressSettings;
        sizeKeys?: (keyof AuthorProgressSettings)[];
        sizePlaceholders?: string[];
        showSizeControls?: boolean;
        weightDefault: number;
        italicDefault?: boolean;
        fontDefault?: string;
    };

    type ElementBlockOptions = {
        label: string;
        desc: string;
        dataTypo: string;
        text?: {
            placeholder: string;
            value: string;
            onChange: (value: string) => Promise<void>;
        };
        primaryAction?: (rowEl: HTMLElement) => void;
        color: {
            key: keyof AuthorProgressSettings;
            value: string;
            fallback: string;
            onAfterChange?: (value: string) => void;
            setPickerRef?: (picker: ColorSwatchHandle) => void;
            setTextRef?: (text: TextComponent) => void;
        };
        typography: TypographyControlOptions;
    };

    const buildTypographyControls = (
        rowEl: HTMLElement,
        opts: TypographyControlOptions,
        onUpdateAutoState: () => void,
        isSyncing: () => boolean
    ): {
        setFontValue: (value: string) => void;
        setStyleValue: (weight: number, italic: boolean) => void;
        sizeInputs: TextComponent[];
    } => {
        const fontDrop = new DropdownComponent(rowEl);
        fontDrop.selectEl.addClass('ert-typography-select');
        const currentFont = (settings?.[opts.familyKey] as string | undefined) ?? opts.fontDefault ?? 'Inter';
        const { setValue: setFontValue } = applyFontDropdown(fontDrop, currentFont, async (val) => {
            if (isSyncing()) return;
            await setAprSetting(opts.familyKey, val as AuthorProgressSettings[typeof opts.familyKey]);
            onUpdateAutoState();
        });

        const styleDrop = new DropdownComponent(rowEl);
        styleDrop.selectEl.addClass('ert-typography-select');
        WEIGHT_OPTIONS.forEach(opt => styleDrop.addOption(opt.value, opt.label));
        const currentWeight = (settings?.[opts.weightKey] as number | undefined) ?? opts.weightDefault;
        const currentItalic = (settings?.[opts.italicKey] as boolean | undefined) ?? opts.italicDefault ?? false;
        let isStyleUpdating = false;
        styleDrop.setValue(formatWeightValue(currentWeight, currentItalic));
        styleDrop.onChange(async (val) => {
            if (isStyleUpdating || isSyncing()) return;
            const { weight, italic } = parseWeightValue(val);
            await setAprSettings({
                [opts.weightKey]: weight,
                [opts.italicKey]: italic
            } as Partial<AuthorProgressSettings>);
            onUpdateAutoState();
        });

        const setStyleValue = (weight: number, italic: boolean): void => {
            isStyleUpdating = true;
            styleDrop.setValue(formatWeightValue(weight, italic));
            isStyleUpdating = false;
        };

        const sizeInputs: TextComponent[] = [];
        if (opts.sizeKeys?.length && opts.showSizeControls !== false) {
            const sizeGroup = rowEl.createDiv({ cls: 'ert-typography-size-group' });
            opts.sizeKeys.forEach((key, index) => {
                const input = new TextComponent(sizeGroup);
                input.setPlaceholder(opts.sizePlaceholders?.[index] ?? 'Auto');
                const currentValue = settings?.[key] as number | undefined;
                input.setValue(currentValue !== undefined ? String(currentValue) : '');
                input.onChange(async (val) => {
                    if (isSyncing()) return;
                    const next = val.trim() ? numberFromText(val) : undefined;
                    if (val.trim() && next === undefined) return;
                    await setAprSetting(key, next as AuthorProgressSettings[typeof key]);
                    onUpdateAutoState();
                });
                sizeInputs.push(input);
            });
        }

        return { setFontValue, setStyleValue, sizeInputs };
    };

    const addElementBlock = (parent: HTMLElement, opts: ElementBlockOptions): void => {
        const block = new Setting(parent).setName(opts.label).setDesc(opts.desc);
        block.settingEl.addClass('ert-elementBlock', 'ert-settingRow');
        block.settingEl.dataset.ertTypo = opts.dataTypo;
        block.controlEl.addClass('ert-elementBlock__right');
        const infoEl = block.settingEl.querySelector('.setting-item-info');
        infoEl?.classList.add('ert-elementBlock__left');

        const controlGroup = block.controlEl.createDiv({ cls: 'ert-controlGroup' });
        const rowPrimary = controlGroup.createDiv({ cls: 'ert-typography-controls' });
        const rowSecondary = controlGroup.createDiv({ cls: 'ert-typography-controls' });

        let isSyncing = false;
        const isSyncingCheck = () => isSyncing;

        let autoButton: HTMLButtonElement | null = null;

        const normalizeHex = (val: string): string => val.trim().toLowerCase();
        const defaultFont = opts.typography.fontDefault ?? 'Inter';
        const defaultWeight = opts.typography.weightDefault;
        const defaultItalic = opts.typography.italicDefault ?? false;

        const updateAutoState = (): void => {
            const currentColor = normalizeHex((settings?.[opts.color.key] as string | undefined) ?? opts.color.fallback);
            const defaultColor = normalizeHex(opts.color.fallback);
            const currentFont = (settings?.[opts.typography.familyKey] as string | undefined) ?? defaultFont;
            const currentWeight = (settings?.[opts.typography.weightKey] as number | undefined) ?? defaultWeight;
            const currentItalic = (settings?.[opts.typography.italicKey] as boolean | undefined) ?? defaultItalic;
            const isSizeAuto = opts.typography.sizeKeys?.length
                ? opts.typography.sizeKeys.every(key => settings?.[key] === undefined)
                : true;
            const isAuto = currentColor === defaultColor
                && currentFont === defaultFont
                && currentWeight === defaultWeight
                && currentItalic === defaultItalic
                && isSizeAuto;
            if (autoButton) {
                autoButton.classList.toggle('is-active', isAuto);
            }
        };

        if (opts.text) {
            const textConfig = opts.text;
            const textInput = new TextComponent(rowPrimary);
            textInput.setPlaceholder(textConfig.placeholder);
            textInput.setValue(textConfig.value);
            textInput.inputEl.addClass('ert-typography-text-input');
            textInput.inputEl.addClass('ert-input--lg');
            textInput.onChange(async (val) => {
                if (isSyncing) return;
                await textConfig.onChange(val);
            });
        }

        const colorPicker = colorSwatch(rowSecondary, {
            value: opts.color.value,
            ariaLabel: `${opts.label} color`,
            onChange: async (val) => {
                if (isSyncing) return;
                const next = val || opts.color.fallback;
                await setAprSetting(opts.color.key, next as AuthorProgressSettings[typeof opts.color.key]);
                colorText?.setValue(next);
                opts.color.onAfterChange?.(next);
                updateAutoState();
            }
        });
        opts.color.setPickerRef?.(colorPicker);

        const colorText = new TextComponent(rowSecondary);
        opts.color.setTextRef?.(colorText);
        colorText.inputEl.classList.add('ert-input--hex');
        colorText.setPlaceholder(opts.color.fallback).setValue(opts.color.value);
        colorText.onChange(async (val) => {
            if (isSyncing) return;
            if (!val || !/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val)) return;
            await setAprSetting(opts.color.key, val as AuthorProgressSettings[typeof opts.color.key]);
            colorPicker.setValue(val);
            opts.color.onAfterChange?.(val);
            updateAutoState();
        });

        opts.primaryAction?.(rowSecondary);

        autoButton = rowSecondary.createEl('button', { text: 'Auto', cls: 'ert-chip ert-typography-auto' });
        autoButton.type = 'button';

        const typographyRefs = buildTypographyControls(rowPrimary, opts.typography, updateAutoState, isSyncingCheck);

        autoButton.addEventListener('click', async () => {
            if (!plugin.settings.authorProgress) return;
            const updates: Partial<AuthorProgressSettings> = {
                [opts.color.key]: opts.color.fallback,
                [opts.typography.familyKey]: defaultFont,
                [opts.typography.weightKey]: defaultWeight,
                [opts.typography.italicKey]: defaultItalic
            };
            opts.typography.sizeKeys?.forEach((key) => {
                updates[key] = undefined;
            });
            await setAprSettings(updates);
            isSyncing = true;
            colorPicker.setValue(opts.color.fallback);
            colorText.setValue(opts.color.fallback);
            typographyRefs.setFontValue(defaultFont);
            typographyRefs.setStyleValue(defaultWeight, defaultItalic);
            typographyRefs.sizeInputs.forEach(input => input.setValue(''));
            opts.color.onAfterChange?.(opts.color.fallback);
            isSyncing = false;
            updateAutoState();
        });

        updateAutoState();
    };

    // ─────────────────────────────────────────────────────────────────────────
    // COLOR PALETTE + TITLE BLOCK
    // ─────────────────────────────────────────────────────────────────────────
    const currentBookTitleColorVal = settings?.aprBookAuthorColor || bookTitleColorFallback;

    // ─────────────────────────────────────────────────────────────────────────
    // ELEMENT BLOCKS (Title, Author, % Symbol, % Number, Stage Badge / RT Mark)
    // ─────────────────────────────────────────────────────────────────────────
    addElementBlock(themeBody, {
        label: 'Title',
        desc: 'Outer ring book title text. This color is used for the palette seed color.',
        dataTypo: 'title',
        text: {
            placeholder: 'Working Title',
            value: settings?.bookTitle || '',
            onChange: async (val) => {
                await setAprSetting('bookTitle', val as AuthorProgressSettings['bookTitle']);
            }
        },
        color: {
            key: 'aprBookAuthorColor',
            value: currentBookTitleColorVal,
            fallback: bookTitleColorFallback,
            setPickerRef: (picker) => {
                bookTitleColorPickerRef = picker;
            },
            setTextRef: (text) => {
                bookTitleTextRef = text;
            }
        },
        typography: {
            familyKey: 'aprBookTitleFontFamily',
            weightKey: 'aprBookTitleFontWeight',
            italicKey: 'aprBookTitleFontItalic',
            sizeKeys: ['aprBookTitleFontSize'],
            sizePlaceholders: ['Auto'],
            showSizeControls: false,
            weightDefault: 400
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // AUTHOR
    // ─────────────────────────────────────────────────────────────────────────
    const authorColorFallback = settings?.aprBookAuthorColor || bookTitleColorFallback;
    const currentAuthorColor = settings?.aprAuthorColor || authorColorFallback;

    addElementBlock(themeBody, {
        label: 'Author',
        desc: 'Outer ring author name text.',
        dataTypo: 'author',
        text: {
            placeholder: 'Author Name',
            value: settings?.authorName || '',
            onChange: async (val) => {
                await setAprSetting('authorName', val as AuthorProgressSettings['authorName']);
            }
        },
        color: {
            key: 'aprAuthorColor',
            value: currentAuthorColor,
            fallback: authorColorFallback,
            setPickerRef: (picker) => {
                authorColorPickerRef = picker;
            },
            setTextRef: (text) => {
                authorTextRef = text;
            }
        },
        typography: {
            familyKey: 'aprAuthorNameFontFamily',
            weightKey: 'aprAuthorNameFontWeight',
            italicKey: 'aprAuthorNameFontItalic',
            sizeKeys: ['aprAuthorNameFontSize'],
            sizePlaceholders: ['Auto'],
            showSizeControls: false,
            weightDefault: 400
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // % SYMBOL
    // ─────────────────────────────────────────────────────────────────────────
    const percentSymbolColorFallback = settings?.aprBookAuthorColor || bookTitleColorFallback;
    const currentPercentSymbolColor = settings?.aprPercentSymbolColor || percentSymbolColorFallback;

    addElementBlock(themeBody, {
        label: '% Symbol',
        desc: 'Center percent symbol.',
        dataTypo: 'percent-symbol',
        color: {
            key: 'aprPercentSymbolColor',
            value: currentPercentSymbolColor,
            fallback: percentSymbolColorFallback,
            setPickerRef: (picker) => {
                percentSymbolColorPickerRef = picker;
            },
            setTextRef: (text) => {
                percentSymbolTextRef = text;
            }
        },
        typography: {
            familyKey: 'aprPercentSymbolFontFamily',
            weightKey: 'aprPercentSymbolFontWeight',
            italicKey: 'aprPercentSymbolFontItalic',
            weightDefault: 800
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // % NUMBER
    // ─────────────────────────────────────────────────────────────────────────
    const percentNumberColorFallback = settings?.aprBookAuthorColor || bookTitleColorFallback;
    const currentPercentNumberColor = settings?.aprPercentNumberColor || percentNumberColorFallback;

    addElementBlock(themeBody, {
        label: '% Number',
        desc: 'Center progress number.',
        dataTypo: 'percent-number',
        color: {
            key: 'aprPercentNumberColor',
            value: currentPercentNumberColor,
            fallback: percentNumberColorFallback,
            setPickerRef: (picker) => {
                percentNumberColorPickerRef = picker;
            },
            setTextRef: (text) => {
                percentNumberTextRef = text;
            }
        },
        typography: {
            familyKey: 'aprPercentNumberFontFamily',
            weightKey: 'aprPercentNumberFontWeight',
            italicKey: 'aprPercentNumberFontItalic',
            sizeKeys: [
                'aprPercentNumberFontSize1Digit',
                'aprPercentNumberFontSize2Digit',
                'aprPercentNumberFontSize3Digit'
            ],
            sizePlaceholders: ['1d', '2d', '3d'],
            showSizeControls: false,
            weightDefault: 800
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // RT BADGE
    // ─────────────────────────────────────────────────────────────────────────
    const rtBadgeColorFallback = '#e5e5e5';
    const currentRtBadgeColor = settings?.aprEngineColor || rtBadgeColorFallback;

    addElementBlock(themeBody, {
        label: 'Stage badge / RT mark',
        desc: 'Typography for the publish stage badge and the RT attribution mark.',
        dataTypo: 'ert-badgePill',
        color: {
            key: 'aprEngineColor',
            value: currentRtBadgeColor,
            fallback: rtBadgeColorFallback
        },
        typography: {
            familyKey: 'aprRtBadgeFontFamily',
            weightKey: 'aprRtBadgeFontWeight',
            italicKey: 'aprRtBadgeFontItalic',
            sizeKeys: ['aprRtBadgeFontSize'],
            sizePlaceholders: ['Auto'],
            showSizeControls: false,
            weightDefault: 700
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLISHING SECTION
    // Pro users use Campaign Manager instead, non-Pro users see basic publishing options
    // ─────────────────────────────────────────────────────────────────────────


    // ─────────────────────────────────────────────────────────────────────────
    // PUBLISHING SECTION
    // Pro users use Campaign Manager instead, non-Pro users see basic publishing options
    // ─────────────────────────────────────────────────────────────────────────

    // Only show basic Publishing & Automation for non-Pro users
    if (!isProActive) {
        const automationCard = contentWrapper.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK}` });
        const automationHeader = new Setting(automationCard)
            .setName('Publishing & Automation')
            .setHeading();
        addHeadingIcon(automationHeader, 'rss');
        addWikiLink(automationHeader, 'Settings#social-media-publishing');
        applyErtHeaderLayout(automationHeader);

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
            frequencySetting.settingEl.classList.add('ert-apr-refresh-alert');
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
                        cls: 'ert-sliderValueLabel',
                        text: String(currentDays)
                    });

                    return slider;
                });

            // Add red alert border when refresh is needed
            if (needsRefresh) {
                stalenessSetting.settingEl.classList.add('ert-apr-refresh-alert');
            }
        }

        const embedPathSetting = new Setting(automationCard)
            .setName('Embed File Path')
            .setDesc(`Location for the "Live Embed" SVG file.`);


        embedPathSetting.addText(text => {
            const defaultPath = DEFAULT_SETTINGS.authorProgress?.dynamicEmbedPath || 'Radial Timeline/Social/progress.svg';
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
                .setValue(settings?.dynamicEmbedPath || defaultPath);

            // Validate on blur
            const handleBlur = async () => {
                const val = text.getValue().trim();
                clearInputState();

                if (!val) {
                    // Empty is invalid - needs a path
                    flashError();
                    return;
                }

                if (!val.toLowerCase().endsWith('.svg')) {
                    flashError();
                    return;
                }

                // Valid - save
                if (plugin.settings.authorProgress) {
                    plugin.settings.authorProgress.dynamicEmbedPath = val;
                    await plugin.saveSettings();
                    flashSuccess();
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
                    flashSuccess();
                });
            });
        });

        // Pro upgrade teaser for non-Pro users
        const proTeaser = automationCard.createDiv({ cls: `ert-apr-pro-teaser ${ERT_CLASSES.SKIN_PRO}` });
        const headerRow = proTeaser.createDiv({ cls: 'ert-apr-pro-teaser-header' });
        const teaserIcon = headerRow.createSpan({ cls: 'ert-apr-pro-teaser-icon' });
        setIcon(teaserIcon, 'signature');
        const teaserHeading = headerRow.createDiv({ cls: 'ert-apr-pro-teaser-heading' });
        teaserHeading.createEl('strong', { text: 'Want more?' });
        const teaserLabel = headerRow.createDiv({ cls: 'ert-apr-pro-teaser-header-label', text: 'Enhance your workflow' });
        const teaserDescription = proTeaser.createDiv({ cls: 'ert-apr-pro-teaser-description' });
        teaserDescription.setText(
            'Campaign manager lets you create multiple embeds with Teaser Reveal—progressively show more detail as you write. Get access to Campaign manager and more Pro workflow features including runtime (RT) chronologue mode and Pandoc manuscript export templates.'
        );
        const teaserLink = proTeaser.createEl('a', {
            text: 'Upgrade to Pro Signature →',
            href: 'https://radialtimeline.com/pro',
            cls: 'ert-apr-pro-teaser-link',
            attr: { target: '_blank', rel: 'noopener' }
        });
    } // End of non-Pro publishing section

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLISH STAGE DETECTION & PROGRESS MODE
    // ─────────────────────────────────────────────────────────────────────────
    type AprProgressMode = 'stage' | 'zero' | 'date';
    const progressModeCard = contentWrapper.createDiv({ cls: ERT_CLASSES.PANEL });
    const progressModeBlock = progressModeCard.createDiv({ cls: ERT_CLASSES.STACK });
    const progressModeHeader = progressModeBlock.createDiv({ cls: ERT_CLASSES.PANEL_HEADER });
    const progressModeHeading = new Setting(progressModeHeader)
        .setName('Publish stage detection & progress mode')
        .setDesc('Detects your current publish stage. In new projects, select between a target manuscript length (recommended) or date range.')
        .setHeading();
    addHeadingIcon(progressModeHeading, 'activity');
    addWikiLink(progressModeHeading, 'Settings#social-media');
    applyErtHeaderLayout(progressModeHeading);

    const progressModeGroup = progressModeBlock.createDiv({ cls: `${ERT_CLASSES.PREVIEW_FRAME} ert-previewFrame--flush` });
    const progressModeGrid = progressModeGroup.createDiv({ cls: ERT_CLASSES.GRID_FORM });
    progressModeGrid.style.gridTemplateColumns = 'minmax(0, 1fr) auto minmax(0, 1fr)';
    progressModeGrid.style.columnGap = 'var(--ert-gap-md)';

    const stageCell = progressModeGrid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
    const stageBadgeRow = stageCell.createDiv({ cls: ERT_CLASSES.INLINE });
    stageBadgeRow.style.alignSelf = 'flex-start';
    const stageBadge = stageBadgeRow.createSpan({ cls: ERT_CLASSES.CHIP, text: 'DETECTING…' });
    const stageNote = stageCell.createDiv({ cls: ERT_CLASSES.FIELD_NOTE });

    progressModeGrid.createDiv({ cls: 'ert-divider--vertical' });

    const modeCell = progressModeGrid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
    const modeDropdown = new DropdownComponent(modeCell);
    modeDropdown.selectEl.addClass('ert-input--md');
    const modeGuidance = modeCell.createDiv({ cls: `${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}` });

    const dateRangeWrap = modeCell.createDiv({ cls: `${ERT_CLASSES.STACK} ${ERT_CLASSES.STACK_TIGHT}` });
    dateRangeWrap.addClass('ert-hidden');
    const dateRangeInput = new TextComponent(dateRangeWrap);
    dateRangeInput.setPlaceholder('YYYY-MM-DD to YYYY-MM-DD');
    dateRangeInput.inputEl.addClass('ert-input--full');
    dateRangeWrap.createDiv({
        cls: ERT_CLASSES.FIELD_NOTE,
        text: 'Format: YYYY-MM-DD to YYYY-MM-DD.'
    });

    const normalizeStage = (raw: unknown): (typeof STAGE_ORDER)[number] => {
        const value = Array.isArray(raw) ? raw[0] : raw;
        const trimmed = (value ?? '').toString().trim().toLowerCase();
        const match = STAGE_ORDER.find(stage => stage.toLowerCase() === trimmed);
        return match ?? 'Zero';
    };

    const detectPublishStage = (scenes: TimelineItem[]): {
        stage: (typeof STAGE_ORDER)[number];
        total: number;
        note: string;
    } => {
        const seen = new Set<string>();
        scenes.forEach(scene => {
            if (scene?.itemType && scene.itemType !== 'Scene') return;
            if (scene?.path && seen.has(scene.path)) return;
            if (scene?.path) seen.add(scene.path);
        });
        const total = seen.size;
        const estimate = plugin.calculateCompletionEstimate(scenes);
        const stage = normalizeStage(estimate?.stage);
        if (!estimate || total === 0) {
            return {
                stage: 'Zero',
                total,
                note: total === 0 ? 'No scenes found yet; assuming Zero stage.' : 'No progress estimate available yet.'
            };
        }
        return { stage, total, note: 'Based on the progress estimate (active publish stage).' };
    };

    const applyStageBadgeTone = (stage: (typeof STAGE_ORDER)[number]) => {
        const color = plugin.settings.publishStageColors?.[stage] ?? '#808080';
        stageBadge.style.setProperty('--ert-chip-bg', `color-mix(in srgb, ${color} 18%, var(--background-secondary) 82%)`);
        stageBadge.style.setProperty('border', `1px solid ${color}`);
        stageBadge.style.setProperty('color', color);
    };

    const formatDateRange = (start?: string, target?: string): string => {
        if (!start || !target) return '';
        return `${start} to ${target}`;
    };

    const parseIsoDate = (value: string): number | null => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
        const parsed = new Date(`${value}T00:00:00`);
        const time = parsed.getTime();
        return Number.isFinite(time) ? time : null;
    };

    const parseDateRange = (value: string): { start?: string; target?: string; error?: string } => {
        const matches = value.match(/\d{4}-\d{2}-\d{2}/g);
        if (!matches || matches.length < 2) {
            return { error: 'Enter both start and target dates (YYYY-MM-DD).' };
        }
        const [start, target] = matches;
        const startTime = parseIsoDate(start);
        const targetTime = parseIsoDate(target);
        if (!startTime || !targetTime) {
            return { error: 'Use YYYY-MM-DD for both dates.' };
        }
        if (startTime > targetTime) {
            return { error: 'Start date must be before target date.' };
        }
        return { start, target };
    };

    const setGuidanceLines = (lines: string[]): void => {
        modeGuidance.empty();
        lines.forEach(line => {
            modeGuidance.createDiv({ cls: ERT_CLASSES.FIELD_NOTE, text: line });
        });
    };

    const dateInputSuccessClass = 'ert-setting-input-success';
    const dateInputErrorClass = 'ert-setting-input-error';

    const flashDateInput = (cls: string, timeout: number) => {
        dateRangeInput.inputEl.addClass(cls);
        window.setTimeout(() => dateRangeInput.inputEl.removeClass(cls), timeout);
    };

    const clearDateInputState = () => {
        dateRangeInput.inputEl.removeClass(dateInputSuccessClass);
        dateRangeInput.inputEl.removeClass(dateInputErrorClass);
    };

    let isZeroStage = true;
    let isUpdatingMode = false;

    const updateModeUI = (modeOverride?: AprProgressMode) => {
        isUpdatingMode = true;
        modeDropdown.selectEl.options.length = 0;
        if (isZeroStage) {
            modeDropdown.addOption('zero', 'Zero Mode (End scene number created by Author)');
            modeDropdown.addOption('date', 'Date Target Mode');
            modeDropdown.setDisabled(false);
            const storedMode = (plugin.settings.authorProgress?.aprProgressMode ?? 'zero') as AprProgressMode;
            const nextMode = modeOverride ?? (storedMode === 'date' ? 'date' : 'zero');
            modeDropdown.setValue(nextMode);
            setGuidanceLines([
                'Zero Mode (recommended): create a placeholder final scene note with a high prefix number (e.g., "60 The End") to set intended total scene count.',
                'Date Mode: choose a start date and target completion date.'
            ]);
            dateRangeWrap.toggleClass('ert-hidden', nextMode !== 'date');
        } else {
            modeDropdown.addOption('stage', 'Publish-stage progress (auto)');
            modeDropdown.setValue('stage');
            modeDropdown.setDisabled(true);
            setGuidanceLines(['Using publish-stage progress.']);
            dateRangeWrap.addClass('ert-hidden');
        }
        isUpdatingMode = false;
    };

    const updateStageUI = (stage: (typeof STAGE_ORDER)[number], total: number, note: string) => {
        isZeroStage = stage === 'Zero';
        stageBadge.setText(`${stage.toUpperCase()} DETECTED`);
        applyStageBadgeTone(stage);
        stageNote.setText(note);
        updateModeUI();
    };

    modeDropdown.onChange(async (val) => {
        if (isUpdatingMode || !isZeroStage) return;
        if (!plugin.settings.authorProgress) return;
        const nextMode = (val === 'date' ? 'date' : 'zero') as AprProgressMode;
        plugin.settings.authorProgress.aprProgressMode = nextMode;
        await plugin.saveSettings();
        updateModeUI(nextMode);
    });

    dateRangeInput.onChange(() => {
        clearDateInputState();
    });

    const handleDateRangeBlur = async (): Promise<void> => {
        if (!plugin.settings.authorProgress) return;
        clearDateInputState();
        const raw = dateRangeInput.getValue().trim();
        if (!raw) {
            plugin.settings.authorProgress.aprProgressDateStart = undefined;
            plugin.settings.authorProgress.aprProgressDateTarget = undefined;
            await plugin.saveSettings();
            return;
        }
        const parsed = parseDateRange(raw);
        if (!parsed.start || !parsed.target) {
            flashDateInput(dateInputErrorClass, 2000);
            return;
        }
        plugin.settings.authorProgress.aprProgressDateStart = parsed.start;
        plugin.settings.authorProgress.aprProgressDateTarget = parsed.target;
        await plugin.saveSettings();
        dateRangeInput.setValue(formatDateRange(parsed.start, parsed.target));
        flashDateInput(dateInputSuccessClass, 1000);
    };

    plugin.registerDomEvent(dateRangeInput.inputEl, 'blur', () => { void handleDateRangeBlur(); });
    plugin.registerDomEvent(dateRangeInput.inputEl, 'keydown', (evt: KeyboardEvent) => {
        if (evt.key === 'Enter') {
            evt.preventDefault();
            dateRangeInput.inputEl.blur();
        }
    });

    const seedDateRange = () => {
        const start = plugin.settings.authorProgress?.aprProgressDateStart;
        const target = plugin.settings.authorProgress?.aprProgressDateTarget;
        dateRangeInput.setValue(formatDateRange(start, target));
    };

    const refreshPublishStage = async (): Promise<void> => {
        try {
            const scenes = await getAllScenes(app, plugin);
            const result = detectPublishStage(scenes);
            updateStageUI(result.stage, result.total, result.note);
            seedDateRange();
        } catch {
            updateStageUI('Zero', 0, 'No scenes found yet; assuming Zero stage.');
            seedDateRange();
        }
    };

    void refreshPublishStage();

    // ─────────────────────────────────────────────────────────────────────────
    // CAMPAIGN MANAGER (PRO FEATURE)
    // Always visible; locked styling handled inside section when Pro is inactive
    // ─────────────────────────────────────────────────────────────────────────
    const proContainer = contentWrapper.createDiv({ cls: `${ERT_CLASSES.SKIN_PRO} ${ERT_CLASSES.STACK}` });
    renderCampaignManagerSection({
        app,
        plugin,
        containerEl: proContainer,
        onCampaignChange: () => {
            // Refresh the hero preview when campaigns change
            refreshPreview?.();
        }
    });

    if (isProActive) {
        const attributionCard = proContainer.createDiv({
            cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.STACK} ${ERT_CLASSES.SKIN_PRO}`
        });

        const attributionSetting = new Setting(attributionCard)
            .setName('RT Attribution')
            .setDesc('Show the Radial Timeline attribution mark and link in APR exports.')
            .addToggle(toggle => {
                toggle.setValue(settings?.aprShowRtAttribution !== false)
                    .onChange(async (val) => {
                        if (!plugin.settings.authorProgress) return;
                        plugin.settings.authorProgress.aprShowRtAttribution = val;
                        await plugin.saveSettings();
                        refreshPreview();
                    });
            });
        attributionSetting.settingEl.addClass('ert-setting--flush');
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
    size: 'thumb' | 'small' | 'medium' | 'large' = 'medium',
    teaserPreviewMode: TeaserPreviewMode = 'auto'
): Promise<void> {
    try {
        const scenes = await getAllScenes(app, plugin);

        if (scenes.length === 0) {
            container.empty();
            container.createDiv({
                cls: 'ert-apr-preview-empty',
                text: 'Create scenes to see a preview of your Author Progress Report.'
            });
            return;
        }

        // Calculate progress using AuthorProgressService
        const service = new AuthorProgressService(plugin, app);
        const progressPercent = service.calculateProgress(scenes);

        const aprSettings = plugin.settings.authorProgress;
        const publishStageLabel = plugin.calculateCompletionEstimate(scenes)?.stage ?? 'Zero';
        const revealCampaign = (aprSettings as any)?.revealCampaign;
        const revealCampaignEnabled = !!revealCampaign?.enabled;
        const nextRevealAt = revealCampaign?.nextRevealAt ?? revealCampaign?.nextRevealDate ?? revealCampaign?.nextReveal;
        const isProActive = isProfessionalActive(plugin);
        const showRtAttribution = isProActive
            ? aprSettings?.aprShowRtAttribution !== false
            : true;

        const isThumb = size === 'thumb';
        const baseShowSubplots = aprSettings?.showSubplots ?? true;
        const baseShowActs = aprSettings?.showActs ?? true;
        const baseShowStatusColors = aprSettings?.showStatus ?? true;
        const baseShowProgressPercent = aprSettings?.showProgressPercent ?? true;

        let showScenes = !isThumb;
        let showSubplots = baseShowSubplots;
        let showActs = baseShowActs;
        let showStatusColors = baseShowStatusColors;
        let showStageColors = true;
        let grayCompletedScenes = false;
        let grayscaleScenes = false;
        let showProgressPercent = isThumb ? false : baseShowProgressPercent;
        let showBranding = !isThumb;

        if (isProActive && !isThumb) {
            let previewLevel: TeaserRevealLevel | null = null;
            if (teaserPreviewMode !== 'auto') {
                previewLevel = teaserPreviewMode;
            } else {
                const campaigns = aprSettings?.campaigns ?? [];
                const activeCampaign = campaigns.find(c => c.isActive) ?? campaigns[0];
                const teaserSettings = activeCampaign?.teaserReveal;
                if (teaserSettings?.enabled) {
                    const preset = teaserSettings.preset ?? 'standard';
                    const thresholds = getTeaserThresholds(preset, teaserSettings.customThresholds);
                    previewLevel = getTeaserRevealLevel(progressPercent, thresholds, teaserSettings.disabledStages);
                }
            }

            if (previewLevel) {
                const revealOptions = teaserLevelToRevealOptions(previewLevel);
                showScenes = revealOptions.showScenes;
                showSubplots = revealOptions.showSubplots;
                showActs = revealOptions.showActs;
                showStatusColors = revealOptions.showStatusColors;
                showStageColors = revealOptions.showStageColors;
                grayCompletedScenes = revealOptions.grayCompletedScenes;
                grayscaleScenes = revealOptions.grayscaleScenes;

                if (previewLevel === 'bar') {
                    showProgressPercent = false;
                    showBranding = false;
                }
            }
        }

        const displayPercent = progressPercent;
        const { svgString, width, height } = createAprSVG(scenes, {
            size: size,
            progressPercent: displayPercent,
            bookTitle: aprSettings?.bookTitle || 'Working Title',
            authorName: aprSettings?.authorName || '',
            authorUrl: aprSettings?.authorUrl || '',
            showScenes,
            showSubplots,
            showActs,
            showStatusColors,
            showStageColors,
            grayCompletedScenes,
            grayscaleScenes,
            showProgressPercent,
            showBranding,
            centerMark: 'none',
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
            publishStageLabel,
            showRtAttribution,
            revealCampaignEnabled,
            nextRevealAt,
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
        const svgWrapper = container.createDiv({ cls: 'ert-apr-svg-wrapper' });
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
            cls: 'ert-apr-preview-error',
            text: 'Failed to render preview.'
        });
        console.error('APR Settings Preview error:', e);
    }
}
