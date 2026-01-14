/*
 * Social Media Tab: Author Progress Report (APR)
 * Rebuilt with ERT UI primitives to standardize layout and spacing.
 */

import { App, Notice, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { AuthorProgressSettings, AuthorProgressFrequency, AuthorProgressPublishTarget } from '../../types/settings';
import { DEFAULT_SETTINGS } from '../defaults';
import { mountRoot, section, row, stack, inline, divider, textInput, dropdown, toggle, button, slider, colorPicker } from '../../ui/ui';
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

const fontFamilyOptions: Record<string, string> = {
    interface: 'Interface (var(--font-interface))',
    text: 'Text (var(--font-text))',
    system: 'System UI (system-ui)',
    serif: 'Serif (serif)',
    sans: 'Sans-serif (sans-serif)',
    mono: 'Monospace (monospace)',
    custom: 'Custom…',
};

const resolveFamily = (key: string | undefined, fallback?: string) => {
    switch (key) {
        case 'interface': return 'var(--font-interface)';
        case 'text': return 'var(--font-text)';
        case 'system': return 'system-ui';
        case 'serif': return 'serif';
        case 'sans': return 'sans-serif';
        case 'mono': return 'monospace';
        case 'custom': return fallback;
        default: return fallback;
    }
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
    const inner = previewEl.createDiv({ cls: ERT_CLASSES.PREVIEW_INNER });

    const showOverlay = (text: string) => {
        inner.createDiv({ text, cls: ERT_CLASSES.FIELD_NOTE });
    };

    try {
        const scenes = await getAllScenes(app, plugin);

        if (!settings.enabled) {
            showOverlay('Enable APR to render a preview.');
            return;
        }

        if (!scenes.length) {
            showOverlay('No scenes found. Add scenes to view your APR.');
            return;
        }

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
            bookAuthorColor: settings.aprBookAuthorColor ?? plugin.settings.publishStageColors?.Press,
            authorColor: settings.aprAuthorColor ?? settings.aprBookAuthorColor ?? plugin.settings.publishStageColors?.Press,
            engineColor: settings.aprEngineColor,
            percentNumberColor: settings.aprPercentNumberColor ?? settings.aprBookAuthorColor ?? plugin.settings.publishStageColors?.Press,
            percentSymbolColor: settings.aprPercentSymbolColor ?? settings.aprBookAuthorColor ?? plugin.settings.publishStageColors?.Press,
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

        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        const svgEl = doc.querySelector('svg');
        if (svgEl) {
            inner.appendChild(document.importNode(svgEl, true));
        } else {
            showOverlay('Preview unavailable (no SVG found).');
        }
    } catch (err) {
        console.warn('APR preview failed', err);
        showOverlay('Preview unavailable (see console).');
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

    // Hero / quick actions + always-on preview
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

        const bodyWrap = panel.createDiv({ cls: ERT_CLASSES.PANEL_BODY });
        const sizeRow = inline(bodyWrap, {});
        sizeRow.createSpan({ text: 'Size:' });
        (['small', 'medium', 'large'] as const).forEach((key) => {
            const chip = sizeRow.createSpan({ cls: ERT_CLASSES.CHIP });
            chip.createSpan({ text: sizeOptions[key] });
            if ((settings.aprSize || 'medium') === key) {
                chip.addClass(ERT_CLASSES.IS_ACTIVE);
            }
            chip.onclick = async () => {
                if (settings.aprSize === key) return;
                settings.aprSize = key;
                await saveAndPreview();
                sizeRow.childNodes.forEach((node) => {
                    if (node instanceof HTMLElement && node.hasClass && node.hasClass(ERT_CLASSES.CHIP)) {
                        node.removeClass(ERT_CLASSES.IS_ACTIVE);
                    }
                });
                chip.addClass(ERT_CLASSES.IS_ACTIVE);
            };
        });

        const previewFrame = bodyWrap.createDiv({ cls: `${ERT_CLASSES.PREVIEW_FRAME} ${ERT_CLASSES.PANEL_ELEV}` });
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

    // Embeds & output
    section(root, { title: 'Embeds & output' }, (body) => {
        const panel = body.createDiv({ cls: ERT_CLASSES.PANEL });

        const embedStack = stack(panel, {
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

        const noteLayoutStack = stack(panel, {
            label: 'Embed note layout',
            desc: 'Used when publishing APR to a note (Pro). Choose preset note or a custom template.',
        });
        dropdown(noteLayoutStack, {
            options: { preset: 'Preset note layout', custom: 'Custom template (Pro)' },
            value: settings.defaultNoteBehavior ?? 'preset',
            onChange: async (val) => {
                settings.defaultNoteBehavior = val as 'preset' | 'custom';
                await saveAndPreview();
            },
        });

        if (settings.defaultNoteBehavior === 'custom' && isProfessionalActive(plugin)) {
            const templateStack = stack(panel, {
                label: 'Custom note template',
                desc: 'Path to your markdown template. Use {{SVG_PATH}} and {{AUTHOR_COMMENT}} placeholders.',
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
        const panel = body.createDiv({ cls: ERT_CLASSES.PANEL });

        const keyFromFamily = (val?: string) => {
            if (!val) return 'interface';
            if (val === 'var(--font-interface)') return 'interface';
            if (val === 'var(--font-text)') return 'text';
            if (val === 'system-ui') return 'system';
            if (val === 'serif') return 'serif';
            if (val === 'sans-serif') return 'sans';
            if (val === 'monospace') return 'mono';
            return 'custom';
        };

        const styleDropdown = (slot: HTMLElement, weightVal?: number, italicVal?: boolean, onStyle?: (weight: number, italic: boolean) => void) => {
            const dd = dropdown(slot, {
                options: Object.fromEntries(Object.entries(fontStyleOptions).map(([k, v]) => [k, v.label])),
                value: `${weightVal ?? 400}-${italicVal ? 'italic' : 'regular'}`,
                onChange: (val) => {
                    const style = fontStyleOptions[val] || fontStyleOptions['400-regular'];
                    onStyle?.(style.weight, style.italic);
                },
            });
            return dd;
        };

        const familyControl = (
            slot: HTMLElement,
            current: string | undefined,
            onFamily: (family: string | undefined) => void
        ) => {
            const famInline = inline(slot, {});
            const selectedKey = keyFromFamily(current);
            const customWrap = famInline.createDiv({ cls: 'ert-hidden' });
            if (selectedKey === 'custom') customWrap.removeClass('ert-hidden');

            const dd = dropdown(famInline, {
                options: fontFamilyOptions,
                value: selectedKey,
                onChange: (val) => {
                    if (val === 'custom') {
                        customWrap.removeClass('ert-hidden');
                        return;
                    }
                    customWrap.addClass('ert-hidden');
                    onFamily(resolveFamily(val, current));
                },
            });

            const customInput = textInput(customWrap, {
                value: selectedKey === 'custom' ? current ?? '' : '',
                placeholder: 'Auto',
                onChange: (val) => {
                    const trimmed = val.trim();
                    if (!trimmed) {
                        new Notice('Font not found. Reverting.');
                        customInput.setValue(current ?? '');
                        onFamily(current);
                        return;
                    }
                    onFamily(trimmed);
                },
            });

            const setAuto = () => {
                dd.setValue('custom');
                customWrap.removeClass('ert-hidden');
                customInput.setValue('');
                onFamily(undefined);
            };

            return { setAuto, dropdown: dd, customInput };
        };

        const autoPill = (parent: HTMLElement, clear: () => void) => {
            const pill = parent.createSpan({ cls: ERT_CLASSES.CHIP });
            pill.createSpan({ text: 'Auto' });
            pill.onclick = clear;
        };

        const addRow = (
            label: string,
            opts: {
                familyKey: keyof AuthorProgressSettings;
                weightKey?: keyof AuthorProgressSettings;
                italicKey?: keyof AuthorProgressSettings;
                sizeKeys?: (keyof AuthorProgressSettings)[];
                sizePlaceholders?: string[];
            }
        ) => {
            const rowEl = row(panel, { label });
            const inlineEl = inline(rowEl, {});

            const setVal = async <V>(k: keyof AuthorProgressSettings | undefined, v: V) => {
                if (!k) return;
                (settings as unknown as Record<string, unknown>)[k] = v;
                await saveAndPreview();
            };

            const famCtrl = familyControl(inlineEl, settings[opts.familyKey] as string | undefined, async (family) => {
                await setVal(opts.familyKey, family);
            });

            const styleCtrl = styleDropdown(
                inlineEl,
                opts.weightKey ? settings[opts.weightKey] as number | undefined : undefined,
                opts.italicKey ? settings[opts.italicKey] as boolean | undefined : undefined,
                async (w, i) => {
                    await setVal(opts.weightKey, w);
                    await setVal(opts.italicKey, i);
                }
            );

            const sizeInputs: { setValue: (v: string) => void; setPlaceholder: (p: string) => void; inputEl: HTMLInputElement }[] = [];
            if (opts.sizeKeys?.length) {
                const sizeInline = inline(inlineEl, {});
                opts.sizeKeys.forEach((key, idx) => {
                    const sizeVal = settings[key] as number | undefined;
                    const input = textInput(sizeInline, {
                        value: sizeVal?.toString() ?? '',
                        placeholder: opts.sizePlaceholders?.[idx] ?? 'Auto',
                        onChange: async (val) => {
                            const next = numberFromText(val);
                            await setVal(key, next);
                        },
                    });
                    sizeInputs.push(input as unknown as typeof sizeInputs[0]);
                });
            }

            autoPill(inlineEl, async () => {
                famCtrl.setAuto();
                await setVal(opts.familyKey, undefined);
                await setVal(opts.weightKey, undefined);
                await setVal(opts.italicKey, undefined);
                if (opts.sizeKeys) {
                    for (const k of opts.sizeKeys) {
                        await setVal(k, undefined);
                    }
                }
                sizeInputs.forEach((inp, idx) => {
                    inp.setValue('');
                    inp.setPlaceholder(opts.sizePlaceholders?.[idx] ?? 'Auto');
                });
                const weight = opts.weightKey ? settings[opts.weightKey] as number | undefined : undefined;
                const italic = opts.italicKey ? settings[opts.italicKey] as boolean | undefined : undefined;
                styleCtrl.setValue?.(`${weight ?? 400}-${italic ? 'italic' : 'regular'}`);
            });
        };

        addRow('Book title', {
            familyKey: 'aprBookTitleFontFamily',
            weightKey: 'aprBookTitleFontWeight',
            italicKey: 'aprBookTitleFontItalic',
            sizeKeys: ['aprBookTitleFontSize'],
            sizePlaceholders: ['Auto'],
        });

        addRow('Author name', {
            familyKey: 'aprAuthorNameFontFamily',
            weightKey: 'aprAuthorNameFontWeight',
            italicKey: 'aprAuthorNameFontItalic',
            sizeKeys: ['aprAuthorNameFontSize'],
            sizePlaceholders: ['Auto'],
        });

        addRow('Percent number', {
            familyKey: 'aprPercentNumberFontFamily',
            weightKey: 'aprPercentNumberFontWeight',
            italicKey: 'aprPercentNumberFontItalic',
            sizeKeys: ['aprPercentNumberFontSize1Digit', 'aprPercentNumberFontSize2Digit', 'aprPercentNumberFontSize3Digit'],
            sizePlaceholders: ['1d', '2d', '3d'],
        });

        addRow('Percent symbol', {
            familyKey: 'aprPercentSymbolFontFamily',
            weightKey: 'aprPercentSymbolFontWeight',
            italicKey: 'aprPercentSymbolFontItalic',
        });

        addRow('RT badge', {
            familyKey: 'aprRtBadgeFontFamily',
            weightKey: 'aprRtBadgeFontWeight',
            italicKey: 'aprRtBadgeFontItalic',
            sizeKeys: ['aprRtBadgeFontSize'],
            sizePlaceholders: ['Auto'],
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
