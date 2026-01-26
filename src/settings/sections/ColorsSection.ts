import { Setting as Settings, ColorComponent, TextComponent, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { PluginRendererFacade } from '../../utils/sceneHelpers';
import { computeCacheableValues } from '../../renderer/utils/Precompute';
import { DEFAULT_SETTINGS } from '../defaults';
import { ERT_CLASSES } from '../../ui/classes';

const SUBPLOT_LABEL_MAX_LENGTH = 16;

function truncateSubplotLabel(value: string, maxLength = SUBPLOT_LABEL_MAX_LENGTH): string {
    const trimmed = value.trim();
    if (trimmed.length <= maxLength) return trimmed;
    return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

async function getTimelineSubplotOrder(plugin: RadialTimelinePlugin): Promise<string[]> {
    const scenes = Array.isArray(plugin.lastSceneData) ? plugin.lastSceneData : null;
    if (scenes && scenes.length > 0) {
        const { masterSubplotOrder } = computeCacheableValues(plugin as unknown as PluginRendererFacade, scenes);
        return masterSubplotOrder.filter(subplot =>
            subplot &&
            subplot.trim().length > 0 &&
            subplot !== 'Backdrop' &&
            subplot !== 'MicroBackdrop'
        );
    }

    await new Promise<void>(resolve => window.setTimeout(resolve, 150));
    let fetched: unknown;
    try {
        fetched = await plugin.getSceneData();
    } catch {
        return [];
    }
    const hydrated = Array.isArray(fetched) ? fetched : null;
    if (!hydrated || hydrated.length === 0) return [];

    const { masterSubplotOrder } = computeCacheableValues(plugin as unknown as PluginRendererFacade, hydrated);
    return masterSubplotOrder.filter(subplot =>
        subplot &&
        subplot.trim().length > 0 &&
        subplot !== 'Backdrop' &&
        subplot !== 'MicroBackdrop'
    );
}

export function renderColorsSection(containerEl: HTMLElement, plugin: RadialTimelinePlugin): void {
    // --- Publishing Stage Colors ---
    const pubHeading = containerEl.createDiv({ cls: 'setting-item setting-item-heading' });
    const pubInfo = pubHeading.createDiv({ cls: 'setting-item-info' });
    const pubName = pubInfo.createDiv({ cls: 'setting-item-name' });
    const pubHeaderIcon = pubName.createSpan({ cls: 'ert-setting-heading-icon' });
    setIcon(pubHeaderIcon, 'paintbrush-vertical');
    pubName.createSpan({ text: 'Publishing stage colors' });
    const pubWikiLink = pubName.createEl('a', {
        href: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#publishing-stage-colors',
        cls: 'ert-setting-heading-wikilink'
    });
    pubWikiLink.setAttr('target', '_blank');
    pubWikiLink.setAttr('rel', 'noopener');
    setIcon(pubWikiLink, 'external-link');
    pubInfo.createDiv({
        cls: 'setting-item-description ert-color-section-desc',
        text: 'Used for completed scenes, stage matrix, act labels and more.'
    });
    const stageGrid = containerEl.createDiv({ cls: 'ert-color-grid' });
    const stages = Object.entries(plugin.settings.publishStageColors);
    stages.forEach(([stage, color]) => {
        const cell = stageGrid.createDiv({ cls: 'ert-color-grid-item' });
        const label = cell.createDiv({ cls: 'ert-color-grid-label' });
        label.setText(stage);

        let textInputRef: TextComponent | undefined;
        let colorPickerRef: ColorComponent | undefined;
        const control = cell.createDiv({ cls: 'ert-color-grid-controls' });
        colorPickerRef = new ColorComponent(control)
            .setValue(color)
            .onChange(async (value) => {
                if (/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
                    (plugin.settings.publishStageColors as Record<string, string>)[stage] = value;
                    await plugin.saveSettings();
                    plugin.setCSSColorVariables();
                    textInputRef?.setValue(value);
                }
            });
        const colorInput = control.querySelector('input[type="color"]:last-of-type') as HTMLInputElement | null;
        if (colorInput) colorInput.classList.add('ert-hidden-color-input');
        const swatchEl = control.createEl('button', { cls: `${ERT_CLASSES.SWATCH} ert-stage-${stage}` });
        swatchEl.type = 'button';
        plugin.registerDomEvent(swatchEl, 'click', () => { colorInput?.click(); });
        new Settings(control)
            .addText(textInput => {
                textInputRef = textInput;
                textInput.inputEl.classList.add('ert-hex-input');
                textInput.setValue(color)
                    .onChange(async (value) => {
                        if (/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
                            (plugin.settings.publishStageColors as Record<string, string>)[stage] = value;
                            await plugin.saveSettings();
                            plugin.setCSSColorVariables();
                            colorPickerRef?.setValue(value);
                        }
                    });
            })
            .addExtraButton(button => {
                button.setIcon('reset')
                    .setTooltip('Reset to default')
                    .onClick(async () => {
                        const defaultColor = DEFAULT_SETTINGS.publishStageColors[stage as keyof typeof DEFAULT_SETTINGS.publishStageColors];
                        (plugin.settings.publishStageColors as Record<string, string>)[stage] = defaultColor;
                        await plugin.saveSettings();
                        plugin.setCSSColorVariables();
                        textInputRef?.setValue(defaultColor);
                        colorPickerRef?.setValue(defaultColor);
                    });
            });
    });

    // --- Subplot palette (16 colors) ---
    const subplotHeading = containerEl.createDiv({ cls: 'setting-item setting-item-heading' });
    const subplotInfo = subplotHeading.createDiv({ cls: 'setting-item-info' });
    const subplotName = subplotInfo.createDiv({ cls: 'setting-item-name' });
    const subplotHeaderIcon = subplotName.createSpan({ cls: 'ert-setting-heading-icon' });
    setIcon(subplotHeaderIcon, 'paintbrush-vertical');
    subplotName.createSpan({ text: 'Subplot ring colors' });
    const subplotWikiLink = subplotName.createEl('a', {
        href: 'https://github.com/EricRhysTaylor/radial-timeline/wiki/Settings#subplot-ring-colors',
        cls: 'ert-setting-heading-wikilink'
    });
    subplotWikiLink.setAttr('target', '_blank');
    subplotWikiLink.setAttr('rel', 'noopener');
    setIcon(subplotWikiLink, 'external-link');
    subplotInfo.createDiv({
        cls: 'setting-item-description ert-color-section-desc',
        text: 'Subplot ring colors used for rings 1 through 16 moving inward.'
    });
    const subplotGrid = containerEl.createDiv({ cls: 'ert-color-grid' });
    const ensureArray = (arr: unknown): string[] => Array.isArray(arr) ? arr as string[] : [];
    const subplotColors = ensureArray(plugin.settings.subplotColors);
    const subplotLabels: HTMLDivElement[] = [];
    for (let i = 0; i < 16; i++) {
        const labelText = i === 0 ? 'MAIN PLOT' : `Ring ${i + 1}`;
        const current = subplotColors[i] || DEFAULT_SETTINGS.subplotColors[i];
        const cell = subplotGrid.createDiv({ cls: 'ert-color-grid-item' });
        const label = cell.createDiv({ cls: 'ert-color-grid-label' });
        label.setText(labelText);
        subplotLabels.push(label);

        const control = cell.createDiv({ cls: 'ert-color-grid-controls' });
        let inputRef: TextComponent | undefined;
        let colorPickerRef: ColorComponent | undefined;
        colorPickerRef = new ColorComponent(control)
            .setValue(current)
            .onChange(async (value) => {
                if (/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
                    const next = [...(plugin.settings.subplotColors || DEFAULT_SETTINGS.subplotColors)];
                    next[i] = value;
                    plugin.settings.subplotColors = next;
                    await plugin.saveSettings();
                    plugin.setCSSColorVariables();
                    inputRef?.setValue(value);
                }
            });
        const colorInput2 = control.querySelector('input[type="color"]:last-of-type') as HTMLInputElement | null;
        if (colorInput2) colorInput2.classList.add('ert-hidden-color-input');
        const swatchEl2 = control.createEl('button', { cls: `${ERT_CLASSES.SWATCH} ert-subplot-${i}` });
        swatchEl2.type = 'button';
        plugin.registerDomEvent(swatchEl2, 'click', () => { colorInput2?.click(); });
        new Settings(control)
            .addText(text => {
                inputRef = text;
                text.inputEl.classList.add('ert-hex-input');
                text.setValue(current)
                    .onChange(async (value) => {
                        if (/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
                            const next = [...(plugin.settings.subplotColors || DEFAULT_SETTINGS.subplotColors)];
                            next[i] = value;
                            plugin.settings.subplotColors = next;
                            await plugin.saveSettings();
                            plugin.setCSSColorVariables();
                            colorPickerRef?.setValue(value);
                        }
                    });
            })
            .addExtraButton(button => {
                button.setIcon('reset')
                    .setTooltip('Reset to default')
                    .onClick(async () => {
                        const value = DEFAULT_SETTINGS.subplotColors[i];
                        const next = [...(plugin.settings.subplotColors || DEFAULT_SETTINGS.subplotColors)];
                        next[i] = value;
                        plugin.settings.subplotColors = next;
                        await plugin.saveSettings();
                        plugin.setCSSColorVariables();
                        inputRef?.setValue(value);
                        colorPickerRef?.setValue(value);
                    });
            });
    }

    void (async () => {
        const subplotOrder = await getTimelineSubplotOrder(plugin);
        if (subplotOrder.length === 0) return;
        for (let i = 1; i < subplotLabels.length; i++) {
            const subplotName = subplotOrder[i];
            if (!subplotName || subplotName.toLowerCase() === 'main plot') continue;
            subplotLabels[i].setText(truncateSubplotLabel(subplotName));
        }
    })();
}
