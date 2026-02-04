import { Setting as Settings, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { PluginRendererFacade } from '../../utils/sceneHelpers';
import { computeCacheableValues } from '../../renderer/utils/Precompute';
import { DEFAULT_SETTINGS } from '../defaults';
import { colorSwatch, type ColorSwatchHandle } from '../../ui/ui';
import { ERT_DATA } from '../../ui/classes';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';

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
    const pubSection = containerEl.createDiv({ attr: { [ERT_DATA.SECTION]: 'colors-publish' } });
    const pubHeading = new Settings(pubSection)
        .setName('Publishing stage colors')
        .setDesc('Used for completed scenes, stage matrix, act labels and more.')
        .setHeading();
    addHeadingIcon(pubHeading, 'paintbrush-vertical');
    addWikiLink(pubHeading, 'Settings#publishing-stage-colors');
    pubHeading.descEl?.addClass('ert-color-section-desc');
    applyErtHeaderLayout(pubHeading);
    const stageGrid = pubSection.createDiv({ cls: 'ert-color-grid' });
    const stages = Object.entries(plugin.settings.publishStageColors);
    stages.forEach(([stage, color]) => {
        const cell = stageGrid.createDiv({ cls: 'ert-color-grid-item' });
        const label = cell.createDiv({ cls: 'ert-color-grid-label' });
        label.setText(stage);

        let textInputRef: TextComponent | undefined;
        const control = cell.createDiv({ cls: 'ert-color-grid-controls' });

        const swatchHandle: ColorSwatchHandle = colorSwatch(control, {
            value: color,
            ariaLabel: `${stage} stage color`,
            swatchClass: `ert-stage-${stage}`,
            plugin,
            onChange: async (value) => {
                if (/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
                    (plugin.settings.publishStageColors as Record<string, string>)[stage] = value;
                    await plugin.saveSettings();
                    plugin.setCSSColorVariables();
                    textInputRef?.setValue(value);
                }
            }
        });

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
                            swatchHandle.setValue(value);
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
                        swatchHandle.setValue(defaultColor);
                    });
            });
    });

    // --- Subplot palette (16 colors) ---
    const subplotSection = containerEl.createDiv({ attr: { [ERT_DATA.SECTION]: 'colors-subplot' } });
    const subplotHeading = new Settings(subplotSection)
        .setName('Subplot ring colors')
        .setDesc('Subplot ring colors used for rings 1 through 16 moving inward.')
        .setHeading();
    addHeadingIcon(subplotHeading, 'paintbrush-vertical');
    addWikiLink(subplotHeading, 'Settings#subplot-ring-colors');
    subplotHeading.descEl?.addClass('ert-color-section-desc');
    applyErtHeaderLayout(subplotHeading);
    const subplotGrid = subplotSection.createDiv({ cls: 'ert-color-grid' });
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

        const swatchHandle: ColorSwatchHandle = colorSwatch(control, {
            value: current,
            ariaLabel: `Subplot ring ${i + 1} color`,
            swatchClass: `ert-subplot-${i}`,
            plugin,
            onChange: async (value) => {
                if (/^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value)) {
                    const next = [...(plugin.settings.subplotColors || DEFAULT_SETTINGS.subplotColors)];
                    next[i] = value;
                    plugin.settings.subplotColors = next;
                    await plugin.saveSettings();
                    plugin.setCSSColorVariables();
                    inputRef?.setValue(value);
                }
            }
        });

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
                            swatchHandle.setValue(value);
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
                        swatchHandle.setValue(value);
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
