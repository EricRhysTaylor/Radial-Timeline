/*
 * Social Media Tab: Author Progress Report (APR)
 * Rebuilt with ERT UI primitives to standardize layout and spacing.
 */

import { App, Notice, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { AuthorProgressSettings, AuthorProgressFrequency, AuthorProgressPublishTarget } from '../../types/settings';
import { DEFAULT_SETTINGS } from '../defaults';
import { mountRoot, section, row, stack, inline, divider, textInput, dropdown, toggle, button, slider, colorPicker, heroLayout } from '../../ui/ui';
import { ERT_CLASSES } from '../../ui/classes';
import { validateErtLayout } from '../../ui/validator';
import { AuthorProgressModal } from '../../modals/AuthorProgressModal';
import { AprPaletteModal } from '../../modals/AprPaletteModal';
import { renderCampaignManagerSection } from './CampaignManagerSection';
import { createAprSVG } from '../../renderer/apr/AprRenderer';
import { getAllScenes } from '../../utils/manuscript';
import { calculateAprProgress } from '../../renderer/apr/AprConstants';

export interface AuthorProgressSectionProps {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

const sizeOptions: Record<'small' | 'medium' | 'large', string> = {
    small: 'Small (150×150)',
    medium: 'Medium (300×300)',
    large: 'Large (450×450)',
};

const publishTargets: Record<AuthorProgressPublishTarget, string> = {
    folder: 'Obsidian vault folder',
    github_pages: 'GitHub Pages (or similar static hosting)',
};

const frequencyOptions: Record<AuthorProgressFrequency, string> = {
    manual: 'Manual (no auto-updates)',
    daily: 'Daily',
    weekly: 'Weekly',
    monthly: 'Monthly',
};

const themeOptions: Record<'dark' | 'light' | 'none', string> = {
    dark: 'Dark (recommended)',
    light: 'Light',
    none: 'No stroke contrast',
};

const spokeColorModeOptions: Record<'dark' | 'light' | 'none' | 'custom', string> = {
    dark: 'Match dark theme',
    light: 'Match light theme',
    none: 'Hide spokes',
    custom: 'Custom color',
};

const fontWeightOptions: Record<string, string> = {
    '300': '300 · Light',
    '400': '400 · Regular',
    '500': '500 · Medium',
    '600': '600 · Semi-bold',
    '700': '700 · Bold',
    '800': '800 · Extra-bold',
};

function ensureAprSettings(plugin: RadialTimelinePlugin): AuthorProgressSettings {
    const base = (DEFAULT_SETTINGS.authorProgress ?? {
        enabled: false,
        defaultNoteBehavior: 'preset',
        defaultPublishTarget: 'folder',
        showSubplots: true,
        showActs: true,
        showStatus: true,
        showProgressPercent: true,
        aprSize: 'medium',
        aprBackgroundColor: '#0d0d0f',
        aprCenterTransparent: true,
        bookTitle: '',
        authorUrl: '',
        updateFrequency: 'manual',
        stalenessThresholdDays: 30,
        enableReminders: true,
        dynamicEmbedPath: 'Radial Timeline/Social/progress.svg',
    }) as AuthorProgressSettings;

    if (!plugin.settings.authorProgress) {
        plugin.settings.authorProgress = { ...base };
    } else {
        const ap = plugin.settings.authorProgress;
        if (ap.enabled === undefined) ap.enabled = base.enabled;
        if (!ap.defaultNoteBehavior) ap.defaultNoteBehavior = base.defaultNoteBehavior;
        if (!ap.defaultPublishTarget) ap.defaultPublishTarget = base.defaultPublishTarget;
        if (ap.showSubplots === undefined) ap.showSubplots = base.showSubplots;
        if (ap.showActs === undefined) ap.showActs = base.showActs;
        if (ap.showStatus === undefined) ap.showStatus = base.showStatus;
        if (ap.showProgressPercent === undefined) ap.showProgressPercent = base.showProgressPercent;
        if (!ap.aprSize) ap.aprSize = base.aprSize;
        if (ap.aprBackgroundColor === undefined) ap.aprBackgroundColor = base.aprBackgroundColor;
        if (ap.aprCenterTransparent === undefined) ap.aprCenterTransparent = base.aprCenterTransparent;
        if (ap.bookTitle === undefined) ap.bookTitle = '';
        if (ap.authorUrl === undefined) ap.authorUrl = '';
        if (!ap.updateFrequency) ap.updateFrequency = base.updateFrequency;
        if (ap.stalenessThresholdDays === undefined) ap.stalenessThresholdDays = base.stalenessThresholdDays;
        if (ap.enableReminders === undefined) ap.enableReminders = base.enableReminders;
        if (!ap.dynamicEmbedPath) ap.dynamicEmbedPath = base.dynamicEmbedPath;
    }

    return plugin.settings.authorProgress as AuthorProgressSettings;
}

function labeledToggle(parent: HTMLElement, label: string, value: boolean, onChange: (val: boolean) => void): void {
    const wrap = parent.createDiv({ cls: ERT_CLASSES.TOGGLE_ITEM });
    toggle(wrap, { value, onChange });
    wrap.createSpan({ text: label });
}

function numberFromText(value: string): number | undefined {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
}

async function renderAprPreview(previewEl: HTMLElement, app: App, plugin: RadialTimelinePlugin, settings: AuthorProgressSettings): Promise<void> {
    previewEl.empty();
    if (!settings.enabled) {
        previewEl.createDiv({ text: 'Enable APR to see a live preview.', cls: ERT_CLASSES.FIELD_NOTE });
        return;
    }
    const loading = previewEl.createDiv({ text: 'Rendering preview…', cls: ERT_CLASSES.FIELD_NOTE });
    try {
        const scenes = await getAllScenes(app, plugin);
        const progressPercent = calculateAprProgress(scenes);
        const { svgString } = createAprSVG(scenes, {
            size: settings.aprSize || 'medium',
            progressPercent,
            bookTitle: settings.bookTitle || 'Working Title',
            authorName: settings.authorName || '',
            authorUrl: settings.authorUrl || '',
            showSubplots: settings.showSubplots ?? true,
            showActs: settings.showActs ?? true,
            showStatusColors: settings.showStatus ?? true,
            showProgressPercent: settings.showProgressPercent ?? true,
            stageColors: (plugin.settings as any).publishStageColors,
            actCount: plugin.settings.actCount || undefined,
            backgroundColor: settings.aprBackgroundColor,
            transparentCenter: settings.aprCenterTransparent,
            bookAuthorColor: settings.aprBookAuthorColor ?? (plugin.settings.publishStageColors?.Press),
            authorColor: settings.aprAuthorColor ?? settings.aprBookAuthorColor ?? (plugin.settings.publishStageColors?.Press),
            engineColor: settings.aprEngineColor,
            percentNumberColor: settings.aprPercentNumberColor ?? settings.aprBookAuthorColor ?? (plugin.settings.publishStageColors?.Press),
            percentSymbolColor: settings.aprPercentSymbolColor ?? settings.aprBookAuthorColor ?? (plugin.settings.publishStageColors?.Press),
            theme: settings.aprTheme || 'dark',
            spokeColor: settings.aprSpokeColorMode === 'custom' ? settings.aprSpokeColor : undefined,
            // Typography settings
            bookTitleFontFamily: settings.aprBookTitleFontFamily,
            bookTitleFontWeight: settings.aprBookTitleFontWeight,
            bookTitleFontItalic: settings.aprBookTitleFontItalic,
            bookTitleFontSize: settings.aprBookTitleFontSize,
            authorNameFontFamily: settings.aprAuthorNameFontFamily,
            authorNameFontWeight: settings.aprAuthorNameFontWeight,
            authorNameFontItalic: settings.aprAuthorNameFontItalic,
            authorNameFontSize: settings.aprAuthorNameFontSize,
            percentNumberFontFamily: settings.aprPercentNumberFontFamily,
            percentNumberFontWeight: settings.aprPercentNumberFontWeight,
            percentNumberFontItalic: settings.aprPercentNumberFontItalic,
            percentNumberFontSize1Digit: settings.aprPercentNumberFontSize1Digit,
            percentNumberFontSize2Digit: settings.aprPercentNumberFontSize2Digit,
            percentNumberFontSize3Digit: settings.aprPercentNumberFontSize3Digit,
            percentSymbolFontFamily: settings.aprPercentSymbolFontFamily,
            percentSymbolFontWeight: settings.aprPercentSymbolFontWeight,
            percentSymbolFontItalic: settings.aprPercentSymbolFontItalic,
            rtBadgeFontFamily: settings.aprRtBadgeFontFamily,
            rtBadgeFontWeight: settings.aprRtBadgeFontWeight,
            rtBadgeFontItalic: settings.aprRtBadgeFontItalic,
            rtBadgeFontSize: settings.aprRtBadgeFontSize
        });
        loading.remove();
        const inner = previewEl.createDiv({ cls: ERT_CLASSES.PREVIEW_INNER });
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (svgEl) {
            // Import the parsed SVG node to avoid cross-document issues
            inner.appendChild(document.importNode(svgEl, true));
        } else {
            inner.createDiv({ text: 'Preview unavailable (no SVG found).', cls: ERT_CLASSES.FIELD_NOTE });
        }
    } catch (err) {
        loading.remove();
        console.warn('APR preview failed', err);
        previewEl.createDiv({ text: 'Preview unavailable (see console).', cls: ERT_CLASSES.FIELD_NOTE });
    }
}

export function renderAuthorProgressSection({ app, plugin, containerEl }: AuthorProgressSectionProps): void {
    const settings = ensureAprSettings(plugin);
    containerEl.empty();

    const root = mountRoot(containerEl);
    root.addClass(ERT_CLASSES.SKIN_APR);
    let previewHost: HTMLElement | null = null;
    let previewTimer: number | undefined;
    let disposed = false;
    const requestPreview = () => {
        if (disposed) return;
        if (previewTimer) window.clearTimeout(previewTimer);
        previewTimer = window.setTimeout(() => {
            if (disposed) return;
            if (previewHost) void renderAprPreview(previewHost, app, plugin, settings);
        }, 200);
    };
    const saveAndPreview = async () => {
        await plugin.saveSettings();
        requestPreview();
    };

    // Hero / quick actions
    section(root, {
        title: 'Author Progress Reports',
        desc: 'Share a spoiler-safe, branded progress ring for fans, newsletters, and campaigns.',
        variant: [ERT_CLASSES.SECTION_HERO],
        icon: (iconEl) => {
            const badge = iconEl.createSpan({ cls: ERT_CLASSES.ICON_BADGE });
            const iconWrap = badge.createSpan();
            setIcon(iconWrap, 'radio');
            badge.createSpan({ text: 'Social' });
        },
        actions: (actionsEl) => {
            const actionsInline = inline(actionsEl, {});
            button(actionsInline, {
                text: 'Open APR modal',
                cta: true,
                onClick: () => {
                    const modal = new AuthorProgressModal(app, plugin);
                    modal.open();
                },
            });
            button(actionsInline, {
                text: 'Generate palette',
                onClick: () => {
                    new AprPaletteModal(app, plugin, settings, () => {
                        new Notice('Palette applied to APR.');
                        requestPreview();
                    }).open();
                },
            });
        }
    }, (body) => {
        const { left, right } = heroLayout(body);
        const lastPublished = settings.lastPublishedDate ? new Date(settings.lastPublishedDate).toLocaleDateString() : 'Never published';
        const statusRow = left.createDiv({ cls: ERT_CLASSES.CARD });
        const statusChips = inline(statusRow, {});
        const statusChip = statusChips.createSpan({ cls: ERT_CLASSES.CHIP });
        statusChip.createSpan({ text: settings.enabled ? 'Enabled' : 'Disabled' });
        const freqChip = statusChips.createSpan({ cls: ERT_CLASSES.CHIP });
        freqChip.createSpan({ text: frequencyOptions[settings.updateFrequency || 'manual'] });
        const publishChip = statusChips.createSpan({ cls: ERT_CLASSES.CHIP });
        publishChip.createSpan({ text: `Last published: ${lastPublished}` });
        statusRow.createDiv({ text: 'APR uses your current scene data and branding to render a live SVG preview.', cls: ERT_CLASSES.FIELD_NOTE });

        const previewFrame = right.createDiv({ cls: ERT_CLASSES.PREVIEW_FRAME });
        previewHost = previewFrame;
    });

    // Activation & publishing
    section(root, { title: 'Activation & publishing', variant: [ERT_CLASSES.SECTION_ACCENT] }, (body) => {
        const enabledRow = row(body, {
            label: 'Enable APR',
        });
        toggle(enabledRow, {
            value: settings.enabled ?? false,
            onChange: async (val) => {
                settings.enabled = val;
                await saveAndPreview();
            },
        });

        const defaultBehaviorStack = stack(body, {
            label: 'Default note behavior',
            desc: 'Use preset layout or a custom note template.',
        });
        dropdown(defaultBehaviorStack, {
            options: { preset: 'Preset (recommended)', custom: 'Custom' },
            value: settings.defaultNoteBehavior ?? 'preset',
            onChange: async (val) => {
                settings.defaultNoteBehavior = val as 'preset' | 'custom';
                await saveAndPreview();
            },
        });

        const targetStack = stack(body, {
            label: 'Publish target',
            desc: 'Where the dynamic SVG is written.',
        });
        dropdown(targetStack, {
            options: publishTargets,
            value: settings.defaultPublishTarget ?? 'folder',
            onChange: async (val) => {
                settings.defaultPublishTarget = val as AuthorProgressPublishTarget;
                await saveAndPreview();
            },
        });

        const freqStack = stack(body, {
            label: 'Update frequency',
            desc: 'Automatic refresh cadence for dynamic embeds.',
        });
        dropdown(freqStack, {
            options: frequencyOptions,
            value: settings.updateFrequency || 'manual',
            onChange: async (val) => {
                settings.updateFrequency = val as AuthorProgressFrequency;
                await saveAndPreview();
            },
        });

        const staleStack = stack(body, {
            label: 'Staleness threshold',
            desc: 'Manual mode reminder after N days (manual mode only).',
        });
        slider(staleStack, {
            min: 7,
            max: 90,
            step: 1,
            value: settings.stalenessThresholdDays ?? 30,
            onChange: async (val) => {
                settings.stalenessThresholdDays = val;
                await saveAndPreview();
            },
        });

        const reminderRow = row(body, {
            label: 'Reminders',
            desc: 'Show in-app refresh reminder for manual mode.',
        });
        toggle(reminderRow, {
            value: settings.enableReminders ?? true,
            onChange: async (val) => {
                settings.enableReminders = val;
                await saveAndPreview();
            },
        });
    });

    // Embeds
    section(root, { title: 'Embeds' }, (body) => {
        const embedStack = stack(body, {
            label: 'Dynamic embed path',
            desc: 'Vault path for live SVG updates.',
        });
        textInput(embedStack, {
            value: settings.dynamicEmbedPath || 'Radial Timeline/Social/progress.svg',
            onChange: async (val) => {
                settings.dynamicEmbedPath = val || 'Radial Timeline/Social/progress.svg';
                await saveAndPreview();
            },
        });
    });

    // Identity
    section(root, { title: 'Identity & links' }, (body) => {
        const titleStack = stack(body, {
            label: 'Book title',
            desc: 'Shown prominently in the APR.',
        });
        textInput(titleStack, {
            value: settings.bookTitle ?? '',
            placeholder: 'Working Title',
            onChange: async (val) => {
                settings.bookTitle = val;
                await saveAndPreview();
            },
        });

        const authorStack = stack(body, {
            label: 'Author name',
            desc: 'Optional secondary line.',
        });
        textInput(authorStack, {
            value: settings.authorName ?? '',
            placeholder: 'Pen name',
            onChange: async (val) => {
                settings.authorName = val;
                await saveAndPreview();
            },
        });

        const urlStack = stack(body, {
            label: 'Author URL',
            desc: 'Link attached to the embed.',
        });
        textInput(urlStack, {
            value: settings.authorUrl ?? '',
            placeholder: 'https://example.com',
            onChange: async (val) => {
                settings.authorUrl = val;
                await saveAndPreview();
            },
        });
    });

    // Reveal & layout
    section(root, { title: 'Reveal & layout' }, (body) => {
        const revealStack = stack(body, {
            label: 'Reveal options',
            desc: 'Control how much structure to show.',
        });
        const revealInline = inline(revealStack, {});
        labeledToggle(revealInline, 'Show subplots', settings.showSubplots ?? true, async (val) => {
            settings.showSubplots = val;
            await saveAndPreview();
        });
        labeledToggle(revealInline, 'Show acts', settings.showActs ?? true, async (val) => {
            settings.showActs = val;
            await saveAndPreview();
        });
        labeledToggle(revealInline, 'Show status colors', settings.showStatus ?? true, async (val) => {
            settings.showStatus = val;
            await saveAndPreview();
        });
        labeledToggle(revealInline, 'Show % complete', settings.showProgressPercent ?? true, async (val) => {
            settings.showProgressPercent = val;
            await saveAndPreview();
        });

        const sizeStack = stack(body, {
            label: 'APR size',
            desc: 'Affects canvas size and text scaling.',
        });
        dropdown(sizeStack, {
            options: sizeOptions,
            value: settings.aprSize || 'medium',
            onChange: async (val) => {
                settings.aprSize = val as 'small' | 'medium' | 'large';
                await saveAndPreview();
            },
        });

        const themeStack = stack(body, {
            label: 'Theme',
            desc: 'Stroke contrast and engine styling.',
        });
        dropdown(themeStack, {
            options: themeOptions,
            value: settings.aprTheme || 'dark',
            onChange: async (val) => {
                settings.aprTheme = val as 'dark' | 'light' | 'none';
                await saveAndPreview();
            },
        });

        const spokeStack = stack(body, {
            label: 'Act spokes',
            desc: 'Choose spoke style or a custom color.',
        });
        const spokeInline = inline(spokeStack, {});
        let spokePicker: ReturnType<typeof colorPicker>;
        dropdown(spokeInline, {
            options: spokeColorModeOptions,
            value: settings.aprSpokeColorMode || 'dark',
            onChange: async (val) => {
                settings.aprSpokeColorMode = val as 'dark' | 'light' | 'none' | 'custom';
                if (spokePicker) {
                    spokePicker.setDisabled(val !== 'custom');
                }
                await saveAndPreview();
            },
        });
        const spokeColorSlot = stack(spokeInline, { label: 'Custom color' });
        spokePicker = colorPicker(spokeColorSlot, {
            value: settings.aprSpokeColor ?? '#ffffff',
            onChange: async (val) => {
                settings.aprSpokeColor = val;
                await saveAndPreview();
            },
        });
        spokePicker.setDisabled((settings.aprSpokeColorMode || 'dark') !== 'custom');

        const centerStack = stack(body, {
            label: 'Center style',
            desc: 'Background and transparency.',
        });
        const centerInline = inline(centerStack, {});
        colorPicker(centerInline, {
            value: settings.aprBackgroundColor ?? '#0d0d0f',
            onChange: async (val) => {
                settings.aprBackgroundColor = val;
                await saveAndPreview();
            },
        });
        labeledToggle(centerInline, 'Transparent center', settings.aprCenterTransparent ?? true, async (val) => {
            settings.aprCenterTransparent = val;
            await saveAndPreview();
        });
    });

    // Colors
    section(root, { title: 'Colors' }, (body) => {
        const primaryStack = stack(body, {
            label: 'Primary colors',
            desc: 'Book title, author name, engine stroke.',
        });
        const primaryInline = inline(primaryStack, { variant: ERT_CLASSES.INLINE_SPLIT });
        colorPicker(primaryInline, {
            value: settings.aprBookAuthorColor ?? '#6FB971',
            onChange: async (val) => {
                settings.aprBookAuthorColor = val;
                await saveAndPreview();
            },
        });
        colorPicker(primaryInline, {
            value: settings.aprAuthorColor ?? settings.aprBookAuthorColor ?? '#6FB971',
            onChange: async (val) => {
                settings.aprAuthorColor = val;
                await saveAndPreview();
            },
        });
        colorPicker(primaryInline, {
            value: settings.aprEngineColor ?? '#e5e5e5',
            onChange: async (val) => {
                settings.aprEngineColor = val;
                await saveAndPreview();
            },
        });

        const percentStack = stack(body, {
            label: 'Percent badge',
            desc: 'Number and % symbol colors.',
        });
        const percentInline = inline(percentStack, {});
        colorPicker(percentInline, {
            value: settings.aprPercentNumberColor ?? settings.aprBookAuthorColor ?? '#6FB971',
            onChange: async (val) => {
                settings.aprPercentNumberColor = val;
                await saveAndPreview();
            },
        });
        colorPicker(percentInline, {
            value: settings.aprPercentSymbolColor ?? settings.aprBookAuthorColor ?? '#6FB971',
            onChange: async (val) => {
                settings.aprPercentSymbolColor = val;
                await saveAndPreview();
            },
        });

        divider(body, {});

        const paletteStack = stack(body, {
            label: 'Palette helper',
            desc: 'Generate harmonized colors from your book title hue.',
        });
        button(paletteStack, {
            text: 'Open palette helper',
            onClick: () => {
                new AprPaletteModal(app, plugin, settings, () => {
                    new Notice('Palette applied to APR.');
                }).open();
            },
        });
    });

    // Typography
    section(root, { title: 'Typography' }, (body) => {
        const bookTitleStack = stack(body, {
            label: 'Book title',
            desc: 'Font family, weight, italic, and size.',
        });
        const bookInline = inline(bookTitleStack, { variant: ERT_CLASSES.INLINE_SPLIT });
        textInput(bookInline, {
            value: settings.aprBookTitleFontFamily ?? 'Inter',
            onChange: async (val) => {
                settings.aprBookTitleFontFamily = val || 'Inter';
                await saveAndPreview();
            },
        });
        dropdown(bookInline, {
            options: fontWeightOptions,
            value: String(settings.aprBookTitleFontWeight ?? 400),
            onChange: async (val) => {
                settings.aprBookTitleFontWeight = Number(val);
                await saveAndPreview();
            },
        });
        labeledToggle(bookInline, 'Italic', settings.aprBookTitleFontItalic ?? false, async (val) => {
            settings.aprBookTitleFontItalic = val;
            await saveAndPreview();
        });
        textInput(bookInline, {
            value: settings.aprBookTitleFontSize?.toString() ?? '',
            placeholder: 'Auto',
            onChange: async (val) => {
                settings.aprBookTitleFontSize = numberFromText(val);
                await saveAndPreview();
            },
        });

        const authorNameStack = stack(body, {
            label: 'Author name',
            desc: 'Font family, weight, italic, and size.',
        });
        const authorInline = inline(authorNameStack, { variant: ERT_CLASSES.INLINE_SPLIT });
        textInput(authorInline, {
            value: settings.aprAuthorNameFontFamily ?? 'Inter',
            onChange: async (val) => {
                settings.aprAuthorNameFontFamily = val || 'Inter';
                await saveAndPreview();
            },
        });
        dropdown(authorInline, {
            options: fontWeightOptions,
            value: String(settings.aprAuthorNameFontWeight ?? 400),
            onChange: async (val) => {
                settings.aprAuthorNameFontWeight = Number(val);
                await saveAndPreview();
            },
        });
        labeledToggle(authorInline, 'Italic', settings.aprAuthorNameFontItalic ?? false, async (val) => {
            settings.aprAuthorNameFontItalic = val;
            await saveAndPreview();
        });
        textInput(authorInline, {
            value: settings.aprAuthorNameFontSize?.toString() ?? '',
            placeholder: 'Auto',
            onChange: async (val) => {
                settings.aprAuthorNameFontSize = numberFromText(val);
                await saveAndPreview();
            },
        });

        const percentStack = stack(body, {
            label: 'Percent number',
            desc: 'Number font and sizes for 1/2/3 digits.',
        });
        const percentInline = inline(percentStack, { variant: ERT_CLASSES.INLINE_SPLIT });
        textInput(percentInline, {
            value: settings.aprPercentNumberFontFamily ?? 'Inter',
            onChange: async (val) => {
                settings.aprPercentNumberFontFamily = val || 'Inter';
                await saveAndPreview();
            },
        });
        dropdown(percentInline, {
            options: fontWeightOptions,
            value: String(settings.aprPercentNumberFontWeight ?? 800),
            onChange: async (val) => {
                settings.aprPercentNumberFontWeight = Number(val);
                await saveAndPreview();
            },
        });
        labeledToggle(percentInline, 'Italic', settings.aprPercentNumberFontItalic ?? false, async (val) => {
            settings.aprPercentNumberFontItalic = val;
            await saveAndPreview();
        });
        textInput(percentInline, {
            value: settings.aprPercentNumberFontSize1Digit?.toString() ?? '',
            placeholder: '1-digit size',
            onChange: async (val) => {
                settings.aprPercentNumberFontSize1Digit = numberFromText(val);
                await saveAndPreview();
            },
        });
        textInput(percentInline, {
            value: settings.aprPercentNumberFontSize2Digit?.toString() ?? '',
            placeholder: '2-digit size',
            onChange: async (val) => {
                settings.aprPercentNumberFontSize2Digit = numberFromText(val);
                await saveAndPreview();
            },
        });
        textInput(percentInline, {
            value: settings.aprPercentNumberFontSize3Digit?.toString() ?? '',
            placeholder: '3-digit size',
            onChange: async (val) => {
                settings.aprPercentNumberFontSize3Digit = numberFromText(val);
                await saveAndPreview();
            },
        });

        const symbolStack = stack(body, {
            label: 'Percent symbol',
            desc: 'Font family, weight, and italic.',
        });
        const symbolInline = inline(symbolStack, { variant: ERT_CLASSES.INLINE_SPLIT });
        textInput(symbolInline, {
            value: settings.aprPercentSymbolFontFamily ?? 'Inter',
            onChange: async (val) => {
                settings.aprPercentSymbolFontFamily = val || 'Inter';
                await saveAndPreview();
            },
        });
        dropdown(symbolInline, {
            options: fontWeightOptions,
            value: String(settings.aprPercentSymbolFontWeight ?? 800),
            onChange: async (val) => {
                settings.aprPercentSymbolFontWeight = Number(val);
                await saveAndPreview();
            },
        });
        labeledToggle(symbolInline, 'Italic', settings.aprPercentSymbolFontItalic ?? false, async (val) => {
            settings.aprPercentSymbolFontItalic = val;
            await saveAndPreview();
        });

        const badgeStack = stack(body, {
            label: 'RT badge',
            desc: 'Font family, weight, italic, size.',
        });
        const badgeInline = inline(badgeStack, { variant: ERT_CLASSES.INLINE_SPLIT });
        textInput(badgeInline, {
            value: settings.aprRtBadgeFontFamily ?? 'Inter',
            onChange: async (val) => {
                settings.aprRtBadgeFontFamily = val || 'Inter';
                await saveAndPreview();
            },
        });
        dropdown(badgeInline, {
            options: fontWeightOptions,
            value: String(settings.aprRtBadgeFontWeight ?? 700),
            onChange: async (val) => {
                settings.aprRtBadgeFontWeight = Number(val);
                await saveAndPreview();
            },
        });
        labeledToggle(badgeInline, 'Italic', settings.aprRtBadgeFontItalic ?? false, async (val) => {
            settings.aprRtBadgeFontItalic = val;
            await saveAndPreview();
        });
        textInput(badgeInline, {
            value: settings.aprRtBadgeFontSize?.toString() ?? '',
            placeholder: 'Auto',
            onChange: async (val) => {
                settings.aprRtBadgeFontSize = numberFromText(val);
                await saveAndPreview();
            },
        });
    });

    // Privacy / Restrictions
    section(root, { title: 'Privacy & restrictions', variant: [ERT_CLASSES.SECTION_ACCENT] }, (body) => {
        const privacyStack = stack(body, {
            label: 'Spoiler safety',
            desc: 'APR shows high-level progress. Avoid embedding sensitive text or spoilers.',
        });
        privacyStack.createDiv({ cls: ERT_CLASSES.FIELD_NOTE, text: 'Use manual updates if you want tighter control over what is shown.' });
    });

    // Troubleshooting
    section(root, { title: 'Troubleshooting' }, (body) => {
        const tipsStack = stack(body, {
            label: 'Preview missing?',
            desc: 'Ensure APR is enabled and scenes exist. Large vaults may need a moment to render.',
        });
        tipsStack.createDiv({ cls: ERT_CLASSES.FIELD_NOTE, text: 'If preview still fails, open the APR modal and generate once to refresh cached data.' });
    });

    // Campaign Manager (legacy UI wrapped)
    section(root, { title: 'Campaign Manager (Pro)', desc: 'Create multiple embeds with independent refresh schedules.' }, (body) => {
        const legacyHost = body.createDiv({ attr: { 'data-ert-skip-validate': 'true' } });
        renderCampaignManagerSection({ app, plugin, containerEl: legacyHost, onCampaignChange: () => void plugin.saveSettings() });
    });

    if (previewHost) {
        void renderAprPreview(previewHost, app, plugin, settings);
    }

    plugin.register(() => {
        disposed = true;
        if (previewTimer) window.clearTimeout(previewTimer);
        previewHost = null;
    });

    validateErtLayout(root, { rootLabel: 'social-apr' });
}
