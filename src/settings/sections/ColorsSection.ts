import { Setting as Settings, ColorComponent, TextComponent, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { TimelineItem } from '../../types';
import type { PluginRendererFacade } from '../../utils/sceneHelpers';
import { computeCacheableValues } from '../../renderer/utils/Precompute';
import { DEFAULT_SETTINGS } from '../defaults';
import { addWikiLinkToElement } from '../wikiLink';
import { ERT_CLASSES } from '../../ui/classes';

const SUBPLOT_LABEL_MAX_LENGTH = 16;

function truncateSubplotLabel(value: string, maxLength = SUBPLOT_LABEL_MAX_LENGTH): string {
    const trimmed = value.trim();
    if (trimmed.length <= maxLength) return trimmed;
    return `${trimmed.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

async function getTimelineSubplotOrder(plugin: RadialTimelinePlugin): Promise<string[]> {
    let scenes: TimelineItem[] | undefined = plugin.lastSceneData;
    if (!Array.isArray(scenes) || scenes.length === 0) {
        try {
            scenes = await plugin.getSceneData();
        } catch {
            return [];
        }
    }
    if (!Array.isArray(scenes) || scenes.length === 0) return [];
    const { masterSubplotOrder } = computeCacheableValues(plugin as unknown as PluginRendererFacade, scenes);
    return masterSubplotOrder.filter(subplot =>
        subplot &&
        subplot.trim().length > 0 &&
        subplot !== 'Backdrop' &&
        subplot !== 'MicroBackdrop'
    );
}

export function renderColorsSection(containerEl: HTMLElement, plugin: RadialTimelinePlugin): void {
    // --- Publishing Stage Colors ---
    const pubHeader = containerEl.createDiv({
        cls: `${ERT_CLASSES.HEADER} ${ERT_CLASSES.HEADER_BLOCK} ${ERT_CLASSES.HEADER_SECTION}`
    });
    const pubHeaderLeft = pubHeader.createDiv({ cls: ERT_CLASSES.HEADER_LEFT });
    const pubHeaderIcon = pubHeaderLeft.createSpan();
    setIcon(pubHeaderIcon, 'paintbrush-vertical');
    const pubHeaderMain = pubHeader.createDiv({ cls: ERT_CLASSES.HEADER_MAIN });
    pubHeaderMain.createEl('h4', { text: 'Publishing stage colors', cls: ERT_CLASSES.SECTION_TITLE });
    const pubHeaderRight = pubHeader.createDiv({ cls: ERT_CLASSES.HEADER_RIGHT });
    addWikiLinkToElement(pubHeaderRight, 'Settings#publishing-stage-colors');
    containerEl.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-color-section-desc`,
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
        const swatchEl = control.createDiv({ cls: `ert-swatch-trigger ert-stage-${stage}` });
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
    const subplotHeader = containerEl.createDiv({
        cls: `${ERT_CLASSES.HEADER} ${ERT_CLASSES.HEADER_BLOCK} ${ERT_CLASSES.HEADER_SECTION}`
    });
    const subplotHeaderLeft = subplotHeader.createDiv({ cls: ERT_CLASSES.HEADER_LEFT });
    const subplotHeaderIcon = subplotHeaderLeft.createSpan();
    setIcon(subplotHeaderIcon, 'paintbrush-vertical');
    const subplotHeaderMain = subplotHeader.createDiv({ cls: ERT_CLASSES.HEADER_MAIN });
    subplotHeaderMain.createEl('h4', { text: 'Subplot ring colors', cls: ERT_CLASSES.SECTION_TITLE });
    const subplotHeaderRight = subplotHeader.createDiv({ cls: ERT_CLASSES.HEADER_RIGHT });
    addWikiLinkToElement(subplotHeaderRight, 'Settings#subplot-ring-colors');
    containerEl.createEl('p', {
        cls: `${ERT_CLASSES.SECTION_DESC} ert-color-section-desc`,
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
        const swatchEl2 = control.createDiv({ cls: `ert-swatch-trigger ert-subplot-${i}` });
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
