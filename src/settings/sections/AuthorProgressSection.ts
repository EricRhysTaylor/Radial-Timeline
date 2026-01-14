/*
 * Social Media Tab: Author Progress Report (APR)
 * Rebuilt with ERT UI primitives to standardize layout and spacing.
 */

import { App, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { AuthorProgressSettings, AuthorProgressFrequency, AuthorProgressPublishTarget } from '../../types/settings';
import { DEFAULT_SETTINGS } from '../defaults';
import { mountRoot, section, row, stack, inline, divider, textInput, dropdown, toggle, button, slider, colorPicker } from '../../ui/ui';
import { ERT_CLASSES } from '../../ui/classes';
import { validateErtLayout } from '../../ui/validator';
import { AuthorProgressModal } from '../../modals/AuthorProgressModal';
import { AprPaletteModal } from '../../modals/AprPaletteModal';
import { renderCampaignManagerSection } from './CampaignManagerSection';

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
    const wrap = parent.createDiv({ cls: 'ert-toggle-item' });
    toggle(wrap, { value, onChange });
    wrap.createSpan({ text: label });
}

function numberFromText(value: string): number | undefined {
    const num = Number(value);
    return Number.isFinite(num) ? num : undefined;
}

export function renderAuthorProgressSection({ app, plugin, containerEl }: AuthorProgressSectionProps): void {
    const settings = ensureAprSettings(plugin);
    containerEl.empty();

    const root = mountRoot(containerEl);

    // Hero / quick actions
    section(root, {
        title: 'Author Progress Reports',
        desc: 'Share a spoiler-safe, branded progress ring for fans, newsletters, and campaigns.',
    }, (body) => {
        const infoInline = inline(body, { variant: ERT_CLASSES.INLINE_SPLIT });
        const statusSlot = stack(infoInline, { label: 'Status' });
        const lastPublished = settings.lastPublishedDate ? new Date(settings.lastPublishedDate).toLocaleDateString() : 'Never published';
        statusSlot.createDiv({ text: settings.enabled ? 'Enabled' : 'Disabled' });
        statusSlot.createDiv({ text: `Last published: ${lastPublished}`, cls: 'ert-field-note' });

        const freqSlot = stack(infoInline, { label: 'Auto-updates' });
        const freqLabel = frequencyOptions[settings.updateFrequency || 'manual'];
        freqSlot.createDiv({ text: freqLabel });
        if (settings.updateFrequency === 'manual') {
            freqSlot.createDiv({ text: `Refresh reminder after ${settings.stalenessThresholdDays ?? 30} days`, cls: 'ert-field-note' });
        }

        const actionSlot = stack(infoInline, { label: 'Actions' });
        const actionsRow = inline(actionSlot, {});
        button(actionsRow, {
            text: 'Open APR modal',
            cta: true,
            onClick: () => {
                const modal = new AuthorProgressModal(app, plugin);
                modal.open();
            },
        });
        button(actionsRow, {
            text: 'Generate palette',
            onClick: () => {
                new AprPaletteModal(app, plugin, settings, () => {
                    new Notice('Palette applied to APR.');
                }).open();
            },
        });
    });

    // Activation & publishing
    section(root, { title: 'Activation & publishing' }, (body) => {
        const enabledRow = row(body, {
            label: 'Enable APR',
            desc: 'Allow APR generation, embedding, and reminders.',
        });
        toggle(enabledRow, {
            value: settings.enabled ?? false,
            onChange: async (val) => {
                settings.enabled = val;
                await plugin.saveSettings();
            },
        });

        const defaultBehaviorRow = row(body, {
            label: 'Default note behavior',
            desc: 'Use preset layout or a custom note template.',
        });
        dropdown(defaultBehaviorRow, {
            options: { preset: 'Preset (recommended)', custom: 'Custom' },
            value: settings.defaultNoteBehavior ?? 'preset',
            onChange: async (val) => {
                settings.defaultNoteBehavior = val as 'preset' | 'custom';
                await plugin.saveSettings();
            },
        });

        const targetRow = row(body, {
            label: 'Publish target',
            desc: 'Where the dynamic SVG is written.',
        });
        dropdown(targetRow, {
            options: publishTargets,
            value: settings.defaultPublishTarget ?? 'folder',
            onChange: async (val) => {
                settings.defaultPublishTarget = val as AuthorProgressPublishTarget;
                await plugin.saveSettings();
            },
        });

        const embedRow = row(body, {
            label: 'Dynamic embed path',
            desc: 'Vault path for live SVG updates.',
        });
        textInput(embedRow, {
            value: settings.dynamicEmbedPath || 'Radial Timeline/Social/progress.svg',
            onChange: async (val) => {
                settings.dynamicEmbedPath = val || 'Radial Timeline/Social/progress.svg';
                await plugin.saveSettings();
            },
        });

        const updateRow = row(body, {
            label: 'Update frequency',
            desc: 'Automatic refresh cadence for dynamic embeds.',
        });
        dropdown(updateRow, {
            options: frequencyOptions,
            value: settings.updateFrequency || 'manual',
            onChange: async (val) => {
                settings.updateFrequency = val as AuthorProgressFrequency;
                await plugin.saveSettings();
            },
        });

        const staleRow = row(body, {
            label: 'Staleness threshold',
            desc: 'Manual mode reminder after N days.',
        });
        slider(staleRow, {
            min: 7,
            max: 90,
            step: 1,
            value: settings.stalenessThresholdDays ?? 30,
            onChange: async (val) => {
                settings.stalenessThresholdDays = val;
                await plugin.saveSettings();
            },
        });
        staleRow.createDiv({ cls: 'ert-field-note', text: 'Applies only when update frequency is Manual.' });

        const reminderRow = row(body, {
            label: 'Reminders',
            desc: 'Show in-app refresh reminder for manual mode.',
        });
        toggle(reminderRow, {
            value: settings.enableReminders ?? true,
            onChange: async (val) => {
                settings.enableReminders = val;
                await plugin.saveSettings();
            },
        });
    });

    // Identity
    section(root, { title: 'Identity & links' }, (body) => {
        const titleRow = row(body, {
            label: 'Book title',
            desc: 'Shown prominently in the APR.',
        });
        textInput(titleRow, {
            value: settings.bookTitle ?? '',
            placeholder: 'Working Title',
            onChange: async (val) => {
                settings.bookTitle = val;
                await plugin.saveSettings();
            },
        });

        const authorRow = row(body, {
            label: 'Author name',
            desc: 'Optional secondary line.',
        });
        textInput(authorRow, {
            value: settings.authorName ?? '',
            placeholder: 'Pen name',
            onChange: async (val) => {
                settings.authorName = val;
                await plugin.saveSettings();
            },
        });

        const urlRow = row(body, {
            label: 'Author URL',
            desc: 'Link attached to the embed.',
        });
        textInput(urlRow, {
            value: settings.authorUrl ?? '',
            placeholder: 'https://example.com',
            onChange: async (val) => {
                settings.authorUrl = val;
                await plugin.saveSettings();
            },
        });
    });

    // Reveal & layout
    section(root, { title: 'Reveal & layout' }, (body) => {
        const revealRow = row(body, {
            label: 'Reveal options',
            desc: 'Control how much structure to show.',
        });
        const revealInline = inline(revealRow, {});
        labeledToggle(revealInline, 'Show subplots', settings.showSubplots ?? true, async (val) => {
            settings.showSubplots = val;
            await plugin.saveSettings();
        });
        labeledToggle(revealInline, 'Show acts', settings.showActs ?? true, async (val) => {
            settings.showActs = val;
            await plugin.saveSettings();
        });
        labeledToggle(revealInline, 'Show status colors', settings.showStatus ?? true, async (val) => {
            settings.showStatus = val;
            await plugin.saveSettings();
        });
        labeledToggle(revealInline, 'Show % complete', settings.showProgressPercent ?? true, async (val) => {
            settings.showProgressPercent = val;
            await plugin.saveSettings();
        });

        const sizeRow = row(body, {
            label: 'APR size',
            desc: 'Affects canvas size and text scaling.',
        });
        dropdown(sizeRow, {
            options: sizeOptions,
            value: settings.aprSize || 'medium',
            onChange: async (val) => {
                settings.aprSize = val as 'small' | 'medium' | 'large';
                await plugin.saveSettings();
            },
        });

        const themeRow = row(body, {
            label: 'Theme',
            desc: 'Stroke contrast and engine styling.',
        });
        dropdown(themeRow, {
            options: themeOptions,
            value: settings.aprTheme || 'dark',
            onChange: async (val) => {
                settings.aprTheme = val as 'dark' | 'light' | 'none';
                await plugin.saveSettings();
            },
        });

        const spokeRow = row(body, {
            label: 'Act spokes',
            desc: 'Choose spoke style or a custom color.',
        });
        const spokeInline = inline(spokeRow, {});
        let spokePicker: ReturnType<typeof colorPicker>;
        dropdown(spokeInline, {
            options: spokeColorModeOptions,
            value: settings.aprSpokeColorMode || 'dark',
            onChange: async (val) => {
                settings.aprSpokeColorMode = val as 'dark' | 'light' | 'none' | 'custom';
                if (spokePicker) {
                    spokePicker.setDisabled(val !== 'custom');
                }
                await plugin.saveSettings();
            },
        });
        const spokeColorSlot = stack(spokeInline, { label: 'Custom color' });
        spokePicker = colorPicker(spokeColorSlot, {
            value: settings.aprSpokeColor ?? '#ffffff',
            onChange: async (val) => {
                settings.aprSpokeColor = val;
                await plugin.saveSettings();
            },
        });
        spokePicker.setDisabled((settings.aprSpokeColorMode || 'dark') !== 'custom');

        const centerRow = row(body, {
            label: 'Center style',
            desc: 'Background and transparency.',
        });
        const centerInline = inline(centerRow, {});
        colorPicker(centerInline, {
            value: settings.aprBackgroundColor ?? '#0d0d0f',
            onChange: async (val) => {
                settings.aprBackgroundColor = val;
                await plugin.saveSettings();
            },
        });
        labeledToggle(centerInline, 'Transparent center', settings.aprCenterTransparent ?? true, async (val) => {
            settings.aprCenterTransparent = val;
            await plugin.saveSettings();
        });
    });

    // Colors
    section(root, { title: 'Colors' }, (body) => {
        const primaryRow = row(body, {
            label: 'Primary colors',
            desc: 'Book title, author name, engine stroke.',
        });
        const primaryInline = inline(primaryRow, { variant: ERT_CLASSES.INLINE_SPLIT });
        colorPicker(primaryInline, {
            value: settings.aprBookAuthorColor ?? '#6FB971',
            onChange: async (val) => {
                settings.aprBookAuthorColor = val;
                await plugin.saveSettings();
            },
        });
        colorPicker(primaryInline, {
            value: settings.aprAuthorColor ?? settings.aprBookAuthorColor ?? '#6FB971',
            onChange: async (val) => {
                settings.aprAuthorColor = val;
                await plugin.saveSettings();
            },
        });
        colorPicker(primaryInline, {
            value: settings.aprEngineColor ?? '#e5e5e5',
            onChange: async (val) => {
                settings.aprEngineColor = val;
                await plugin.saveSettings();
            },
        });

        const percentRow = row(body, {
            label: 'Percent badge',
            desc: 'Number and % symbol colors.',
        });
        const percentInline = inline(percentRow, {});
        colorPicker(percentInline, {
            value: settings.aprPercentNumberColor ?? settings.aprBookAuthorColor ?? '#6FB971',
            onChange: async (val) => {
                settings.aprPercentNumberColor = val;
                await plugin.saveSettings();
            },
        });
        colorPicker(percentInline, {
            value: settings.aprPercentSymbolColor ?? settings.aprBookAuthorColor ?? '#6FB971',
            onChange: async (val) => {
                settings.aprPercentSymbolColor = val;
                await plugin.saveSettings();
            },
        });

        divider(body, {});

        const paletteRow = row(body, {
            label: 'Palette helper',
            desc: 'Generate harmonized colors from your book title hue.',
        });
        button(paletteRow, {
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
        const bookTitleRow = row(body, {
            label: 'Book title',
            desc: 'Font family, weight, italic, and size.',
        });
        const bookInline = inline(bookTitleRow, { variant: ERT_CLASSES.INLINE_SPLIT });
        textInput(bookInline, {
            value: settings.aprBookTitleFontFamily ?? 'Inter',
            onChange: async (val) => {
                settings.aprBookTitleFontFamily = val || 'Inter';
                await plugin.saveSettings();
            },
        });
        dropdown(bookInline, {
            options: fontWeightOptions,
            value: String(settings.aprBookTitleFontWeight ?? 400),
            onChange: async (val) => {
                settings.aprBookTitleFontWeight = Number(val);
                await plugin.saveSettings();
            },
        });
        labeledToggle(bookInline, 'Italic', settings.aprBookTitleFontItalic ?? false, async (val) => {
            settings.aprBookTitleFontItalic = val;
            await plugin.saveSettings();
        });
        textInput(bookInline, {
            value: settings.aprBookTitleFontSize?.toString() ?? '',
            placeholder: 'Auto',
            onChange: async (val) => {
                settings.aprBookTitleFontSize = numberFromText(val);
                await plugin.saveSettings();
            },
        });

        const authorNameRow = row(body, {
            label: 'Author name',
            desc: 'Font family, weight, italic, and size.',
        });
        const authorInline = inline(authorNameRow, { variant: ERT_CLASSES.INLINE_SPLIT });
        textInput(authorInline, {
            value: settings.aprAuthorNameFontFamily ?? 'Inter',
            onChange: async (val) => {
                settings.aprAuthorNameFontFamily = val || 'Inter';
                await plugin.saveSettings();
            },
        });
        dropdown(authorInline, {
            options: fontWeightOptions,
            value: String(settings.aprAuthorNameFontWeight ?? 400),
            onChange: async (val) => {
                settings.aprAuthorNameFontWeight = Number(val);
                await plugin.saveSettings();
            },
        });
        labeledToggle(authorInline, 'Italic', settings.aprAuthorNameFontItalic ?? false, async (val) => {
            settings.aprAuthorNameFontItalic = val;
            await plugin.saveSettings();
        });
        textInput(authorInline, {
            value: settings.aprAuthorNameFontSize?.toString() ?? '',
            placeholder: 'Auto',
            onChange: async (val) => {
                settings.aprAuthorNameFontSize = numberFromText(val);
                await plugin.saveSettings();
            },
        });

        const percentRow = row(body, {
            label: 'Percent number',
            desc: 'Number font and sizes for 1/2/3 digits.',
        });
        const percentInline = inline(percentRow, { variant: ERT_CLASSES.INLINE_SPLIT });
        textInput(percentInline, {
            value: settings.aprPercentNumberFontFamily ?? 'Inter',
            onChange: async (val) => {
                settings.aprPercentNumberFontFamily = val || 'Inter';
                await plugin.saveSettings();
            },
        });
        dropdown(percentInline, {
            options: fontWeightOptions,
            value: String(settings.aprPercentNumberFontWeight ?? 800),
            onChange: async (val) => {
                settings.aprPercentNumberFontWeight = Number(val);
                await plugin.saveSettings();
            },
        });
        labeledToggle(percentInline, 'Italic', settings.aprPercentNumberFontItalic ?? false, async (val) => {
            settings.aprPercentNumberFontItalic = val;
            await plugin.saveSettings();
        });
        textInput(percentInline, {
            value: settings.aprPercentNumberFontSize1Digit?.toString() ?? '',
            placeholder: '1-digit size',
            onChange: async (val) => {
                settings.aprPercentNumberFontSize1Digit = numberFromText(val);
                await plugin.saveSettings();
            },
        });
        textInput(percentInline, {
            value: settings.aprPercentNumberFontSize2Digit?.toString() ?? '',
            placeholder: '2-digit size',
            onChange: async (val) => {
                settings.aprPercentNumberFontSize2Digit = numberFromText(val);
                await plugin.saveSettings();
            },
        });
        textInput(percentInline, {
            value: settings.aprPercentNumberFontSize3Digit?.toString() ?? '',
            placeholder: '3-digit size',
            onChange: async (val) => {
                settings.aprPercentNumberFontSize3Digit = numberFromText(val);
                await plugin.saveSettings();
            },
        });

        const symbolRow = row(body, {
            label: 'Percent symbol',
            desc: 'Font family, weight, and italic.',
        });
        const symbolInline = inline(symbolRow, { variant: ERT_CLASSES.INLINE_SPLIT });
        textInput(symbolInline, {
            value: settings.aprPercentSymbolFontFamily ?? 'Inter',
            onChange: async (val) => {
                settings.aprPercentSymbolFontFamily = val || 'Inter';
                await plugin.saveSettings();
            },
        });
        dropdown(symbolInline, {
            options: fontWeightOptions,
            value: String(settings.aprPercentSymbolFontWeight ?? 800),
            onChange: async (val) => {
                settings.aprPercentSymbolFontWeight = Number(val);
                await plugin.saveSettings();
            },
        });
        labeledToggle(symbolInline, 'Italic', settings.aprPercentSymbolFontItalic ?? false, async (val) => {
            settings.aprPercentSymbolFontItalic = val;
            await plugin.saveSettings();
        });

        const badgeRow = row(body, {
            label: 'RT badge',
            desc: 'Font family, weight, italic, size.',
        });
        const badgeInline = inline(badgeRow, { variant: ERT_CLASSES.INLINE_SPLIT });
        textInput(badgeInline, {
            value: settings.aprRtBadgeFontFamily ?? 'Inter',
            onChange: async (val) => {
                settings.aprRtBadgeFontFamily = val || 'Inter';
                await plugin.saveSettings();
            },
        });
        dropdown(badgeInline, {
            options: fontWeightOptions,
            value: String(settings.aprRtBadgeFontWeight ?? 700),
            onChange: async (val) => {
                settings.aprRtBadgeFontWeight = Number(val);
                await plugin.saveSettings();
            },
        });
        labeledToggle(badgeInline, 'Italic', settings.aprRtBadgeFontItalic ?? false, async (val) => {
            settings.aprRtBadgeFontItalic = val;
            await plugin.saveSettings();
        });
        textInput(badgeInline, {
            value: settings.aprRtBadgeFontSize?.toString() ?? '',
            placeholder: 'Auto',
            onChange: async (val) => {
                settings.aprRtBadgeFontSize = numberFromText(val);
                await plugin.saveSettings();
            },
        });
    });

    // Campaign Manager (legacy UI wrapped)
    section(root, { title: 'Campaign Manager (Pro)', desc: 'Create multiple embeds with independent refresh schedules.' }, (body) => {
        const legacyHost = body.createDiv({ attr: { 'data-ert-skip-validate': 'true' } });
        renderCampaignManagerSection({ app, plugin, containerEl: legacyHost, onCampaignChange: () => void plugin.saveSettings() });
    });

    validateErtLayout(root, { rootLabel: 'social-apr' });
}
