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

import { isProfessionalActive } from './ProfessionalSection';

const getPublishTargets = (plugin: RadialTimelinePlugin): Record<string, string> => {
    const targets: Record<string, string> = {
        folder: 'Obsidian vault folder',
        github_pages: 'GitHub Pages (or similar static hosting)',
    };
    if (isProfessionalActive(plugin)) {
        targets.note = 'Markdown note with embed (Pro)';
    }
    return targets;
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

const fontStyleOptions: Record<string, { label: string; weight: number; italic: boolean }> = {
    '400-regular': { label: '400 · Regular', weight: 400, italic: false },
    '400-italic': { label: '400 · Italic', weight: 400, italic: true },
    '500-regular': { label: '500 · Medium', weight: 500, italic: false },
    '500-italic': { label: '500 · Medium Italic', weight: 500, italic: true },
    '600-regular': { label: '600 · Semi-bold', weight: 600, italic: false },
    '600-italic': { label: '600 · Semi-bold Italic', weight: 600, italic: true },
    '700-regular': { label: '700 · Bold', weight: 700, italic: false },
    '700-italic': { label: '700 · Bold Italic', weight: 700, italic: true },
    '800-regular': { label: '800 · Extra-bold', weight: 800, italic: false },
    '800-italic': { label: '800 · Extra-bold Italic', weight: 800, italic: true },
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

function applyFontStyle(styleKey: string, apply: (weight: number, italic: boolean) => Promise<void>): Promise<void> {
    const style = fontStyleOptions[styleKey] || fontStyleOptions['400-regular'];
    return apply(style.weight, style.italic);
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
    root.addClass(ERT_CLASSES.DENSITY_COMPACT);
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
        const panel = body.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.CARD_APR}` });
        const header = panel.createDiv({ cls: ERT_CLASSES.PANEL_HEADER });
        const headerLeft = inline(header, {});
        const headerBadge = headerLeft.createSpan({ cls: ERT_CLASSES.ICON_BADGE });
        const badgeIcon = headerBadge.createSpan();
        setIcon(badgeIcon, 'radio');
        headerBadge.createSpan({ text: 'APR' });
        headerLeft.createDiv({ text: 'Social Progress Reports', cls: ERT_CLASSES.SECTION_TITLE });

        const headerChips = inline(header, {});
        const chipStatus = headerChips.createSpan({ cls: ERT_CLASSES.CHIP });
        chipStatus.createSpan({ text: settings.enabled ? 'Enabled' : 'Disabled' });
        const chipFreq = headerChips.createSpan({ cls: ERT_CLASSES.CHIP });
        chipFreq.createSpan({ text: frequencyOptions[settings.updateFrequency || 'manual'] });

        const panelBody = panel.createDiv({ cls: ERT_CLASSES.PANEL_BODY });
        const { left, right } = heroLayout(panelBody);
        const lastPublished = settings.lastPublishedDate ? new Date(settings.lastPublishedDate).toLocaleDateString() : 'Never published';
        const statusRow = left.createDiv({ cls: ERT_CLASSES.CARD_APR });
        const statusChips = inline(statusRow, {});
        const publishChip = statusChips.createSpan({ cls: ERT_CLASSES.CHIP });
        publishChip.createSpan({ text: `Last published: ${lastPublished}` });
        statusRow.createDiv({ text: 'APR uses your current scene data and branding to render a live SVG preview.', cls: ERT_CLASSES.FIELD_NOTE });

        const previewFrame = right.createDiv({ cls: `${ERT_CLASSES.PANEL} ${ERT_CLASSES.PANEL_ELEV}` });
        previewFrame.addClass(ERT_CLASSES.PREVIEW_FRAME);
        previewHost = previewFrame;
    });

    // Activation & publishing
    section(root, { title: 'Activation & publishing', variant: [ERT_CLASSES.SECTION_ACCENT] }, (body) => {
        const panel = body.createDiv({ cls: ERT_CLASSES.PANEL });
        const grid = panel.createDiv({ cls: `${ERT_CLASSES.GRID_FORM} ${ERT_CLASSES.GRID_FORM_2}` });

        const enabledCell = grid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
        const enabledRow = stack(enabledCell, {
            label: 'Enable APR',
            desc: 'Allow APR generation and reminders.',
        });
        toggle(enabledRow, {
            value: settings.enabled ?? false,
            onChange: async (val) => {
                settings.enabled = val;
                await saveAndPreview();
            },
        });

        const defaultBehaviorCell = grid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
        const defaultBehaviorStack = stack(defaultBehaviorCell, {
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

        const targetCell = grid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
        const targetStack = stack(targetCell, {
            label: 'Publish target',
            desc: 'Where the dynamic SVG is written.',
        });
        const publishTargets = getPublishTargets(plugin);
        dropdown(targetStack, {
            options: publishTargets,
            value: settings.defaultPublishTarget ?? 'folder',
            onChange: async (val) => {
                settings.defaultPublishTarget = val as AuthorProgressPublishTarget;
                await saveAndPreview();
            },
        });

        // Show custom note template path field only if note target is selected and Pro is active
        if (settings.defaultPublishTarget === 'note' && isProfessionalActive(plugin) && settings.defaultNoteBehavior === 'custom') {
            const templateCell = grid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
            const templateStack = stack(templateCell, {
                label: 'Custom note template',
                desc: 'Path to your custom markdown template. Use {{SVG_PATH}} and {{AUTHOR_COMMENT}} placeholders.',
            });
            textInput(templateStack, {
                value: settings.customNoteTemplatePath ?? '',
                placeholder: 'Templates/APR-template.md',
                onChange: async (val) => {
                    settings.customNoteTemplatePath = val || undefined;
                    await saveAndPreview();
                },
            });
        }

        const freqCell = grid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
        const freqStack = stack(freqCell, {
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

        if ((settings.updateFrequency || 'manual') === 'manual') {
            const staleCell = grid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
            const staleStack = stack(staleCell, {
                label: 'Staleness threshold',
                desc: 'Reminder after N days (manual mode only).',
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
        }

        const reminderCell = grid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
        const reminderStack = stack(reminderCell, {
            label: 'Reminders',
            desc: 'Show in-app refresh reminder for manual mode.',
        });
        toggle(reminderStack, {
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
        const identityCard = body.createDiv({ cls: ERT_CLASSES.CARD_APR });
        const grid = identityCard.createDiv({ cls: `${ERT_CLASSES.GRID_FORM} ${ERT_CLASSES.GRID_FORM_2}` });

        const titleCell = grid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
        const identityStack = stack(titleCell, {
            label: 'Book title',
            desc: 'Shown prominently in the APR.',
        });
        textInput(identityStack, {
            value: settings.bookTitle ?? '',
            placeholder: 'Working Title',
            onChange: async (val) => {
                settings.bookTitle = val;
                await saveAndPreview();
            },
        });

        const authorCell = grid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
        const authorStack = stack(authorCell, {
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

        const urlCell = grid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
        const urlStack = stack(urlCell, {
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
        const panel = body.createDiv({ cls: ERT_CLASSES.PANEL });
        const revealStack = stack(panel, {
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

        const sizeStack = stack(panel, {
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

        const themeStack = stack(panel, {
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

        const spokeStack = stack(panel, {
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

        const centerStack = stack(panel, {
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
        const primaryCard = body.createDiv({ cls: ERT_CLASSES.CARD_APR });
        const grid = primaryCard.createDiv({ cls: `${ERT_CLASSES.GRID_FORM} ${ERT_CLASSES.GRID_FORM_2}` });

        const primaryCell = grid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
        const primaryStack = stack(primaryCell, {
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

        const percentCell = grid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
        const percentStack = stack(percentCell, {
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

        divider(primaryCard, {});

        const paletteStack = stack(primaryCard, {
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
        const typoCard = body.createDiv({ cls: ERT_CLASSES.CARD_APR });
        const typoGrid = typoCard.createDiv({ cls: `${ERT_CLASSES.GRID_FORM} ${ERT_CLASSES.GRID_FORM_3}` });

        const fontRow = (
            label: string,
            familyVal: string | undefined,
            weightVal: number | undefined,
            italicVal: boolean | undefined,
            sizeVal: number | undefined,
            onChange: (family: string, weight: number, italic: boolean, size?: number) => Promise<void>
        ) => {
            const cell = typoGrid.createDiv({ cls: ERT_CLASSES.GRID_FORM_CELL });
            const cellStack = stack(cell, { label, desc: '' });
            const rowInline = inline(cellStack, { variant: ERT_CLASSES.INLINE_SPLIT });
            const familyInput = textInput(rowInline, {
                value: familyVal ?? 'Inter',
                onChange: async (val) => {
                    await onChange(val || 'Inter', weightVal ?? 400, italicVal ?? false, sizeVal);
                },
            });
            dropdown(rowInline, {
                options: Object.fromEntries(Object.entries(fontStyleOptions).map(([k, v]) => [k, v.label])),
                value: `${weightVal ?? 400}-${italicVal ? 'italic' : 'regular'}`,
                onChange: async (val) => {
                    const style = fontStyleOptions[val] || fontStyleOptions['400-regular'];
                    await onChange(familyInput.getValue(), style.weight, style.italic, sizeVal);
                },
            });
            textInput(rowInline, {
                value: sizeVal?.toString() ?? '',
                placeholder: 'Auto',
                onChange: async (val) => {
                    const nextSize = numberFromText(val);
                    await onChange(familyInput.getValue(), weightVal ?? 400, italicVal ?? false, nextSize);
                },
            });
        };

        fontRow('Book title', settings.aprBookTitleFontFamily, settings.aprBookTitleFontWeight, settings.aprBookTitleFontItalic, settings.aprBookTitleFontSize, async (family, weight, italic, size) => {
            settings.aprBookTitleFontFamily = family;
            settings.aprBookTitleFontWeight = weight;
            settings.aprBookTitleFontItalic = italic;
            settings.aprBookTitleFontSize = size;
            await saveAndPreview();
        });

        fontRow('Author name', settings.aprAuthorNameFontFamily, settings.aprAuthorNameFontWeight, settings.aprAuthorNameFontItalic, settings.aprAuthorNameFontSize, async (family, weight, italic, size) => {
            settings.aprAuthorNameFontFamily = family;
            settings.aprAuthorNameFontWeight = weight;
            settings.aprAuthorNameFontItalic = italic;
            settings.aprAuthorNameFontSize = size;
            await saveAndPreview();
        });

        fontRow('Percent number', settings.aprPercentNumberFontFamily, settings.aprPercentNumberFontWeight, settings.aprPercentNumberFontItalic, settings.aprPercentNumberFontSize1Digit, async (family, weight, italic, size) => {
            settings.aprPercentNumberFontFamily = family;
            settings.aprPercentNumberFontWeight = weight;
            settings.aprPercentNumberFontItalic = italic;
            settings.aprPercentNumberFontSize1Digit = size;
            settings.aprPercentNumberFontSize2Digit = size;
            settings.aprPercentNumberFontSize3Digit = size;
            await saveAndPreview();
        });

        fontRow('Percent symbol', settings.aprPercentSymbolFontFamily, settings.aprPercentSymbolFontWeight, settings.aprPercentSymbolFontItalic, undefined, async (family, weight, italic, size) => {
            settings.aprPercentSymbolFontFamily = family;
            settings.aprPercentSymbolFontWeight = weight;
            settings.aprPercentSymbolFontItalic = italic;
            await saveAndPreview();
        });

        fontRow('RT badge', settings.aprRtBadgeFontFamily, settings.aprRtBadgeFontWeight, settings.aprRtBadgeFontItalic, settings.aprRtBadgeFontSize, async (family, weight, italic, size) => {
            settings.aprRtBadgeFontFamily = family;
            settings.aprRtBadgeFontWeight = weight;
            settings.aprRtBadgeFontItalic = italic;
            settings.aprRtBadgeFontSize = size;
            await saveAndPreview();
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

    // Campaign Manager (legacy UI wrapped, Pro skin)
    section(root, { title: 'Campaign Manager (Pro)', desc: 'Create multiple embeds with independent refresh schedules.' }, (body) => {
        const skinWrapper = body.createDiv({ cls: `${ERT_CLASSES.SKIN_PRO} ${ERT_CLASSES.DENSITY_COMPACT}` });
        const legacyHost = skinWrapper.createDiv({ attr: { 'data-ert-skip-validate': 'true' } });
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
