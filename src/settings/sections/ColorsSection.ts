import { Setting as Settings, ColorComponent, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { DEFAULT_SETTINGS } from '../defaults';
import { addHeadingIcon, addWikiLink } from '../wikiLink';

export function renderColorsSection(containerEl: HTMLElement, plugin: RadialTimelinePlugin): void {
    // --- Publishing Stage Colors ---
    const pubHeading = new Settings(containerEl)
        .setName('Publishing stage colors')
        .setHeading();
    addHeadingIcon(pubHeading, 'paintbrush-vertical');
    addWikiLink(pubHeading, 'Settings#publishing-stage-colors');
    pubHeading.settingEl.classList.add('rt-section-heading');
    containerEl.createEl('p', { cls: 'rt-color-section-desc', text: 'Used for completed scenes, stage matrix, act labels and more.' });
    const stageGrid = containerEl.createDiv({ cls: 'rt-color-grid' });
    const stages = Object.entries(plugin.settings.publishStageColors);
    stages.forEach(([stage, color]) => {
        const cell = stageGrid.createDiv({ cls: 'rt-color-grid-item' });
        const label = cell.createDiv({ cls: 'rt-color-grid-label' });
        label.setText(stage);

        let textInputRef: TextComponent | undefined;
        let colorPickerRef: ColorComponent | undefined;
        const control = cell.createDiv({ cls: 'rt-color-grid-controls' });
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
        if (colorInput) colorInput.classList.add('rt-hidden-color-input');
        const swatchEl = control.createDiv({ cls: `rt-swatch-trigger rt-stage-${stage}` });
        plugin.registerDomEvent(swatchEl, 'click', () => { colorInput?.click(); });
        new Settings(control)
            .addText(textInput => {
                textInputRef = textInput;
                textInput.inputEl.classList.add('rt-hex-input');
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
    const subplotHeading = new Settings(containerEl)
        .setName('Subplot ring colors')
        .setHeading();
    addHeadingIcon(subplotHeading, 'paintbrush-vertical');
    addWikiLink(subplotHeading, 'Settings#subplot-ring-colors');
    subplotHeading.settingEl.classList.add('rt-section-heading');
    containerEl.createEl('p', { cls: 'rt-color-section-desc', text: 'Subplot ring colors used for rings 1 through 16 moving inward.' });
    const subplotGrid = containerEl.createDiv({ cls: 'rt-color-grid' });
    const ensureArray = (arr: unknown): string[] => Array.isArray(arr) ? arr as string[] : [];
    const subplotColors = ensureArray(plugin.settings.subplotColors);
    for (let i = 0; i < 16; i++) {
        const labelText = i === 0 ? 'MAIN PLOT' : `Ring ${i + 1}`;
        const current = subplotColors[i] || DEFAULT_SETTINGS.subplotColors[i];
        const cell = subplotGrid.createDiv({ cls: 'rt-color-grid-item' });
        const label = cell.createDiv({ cls: 'rt-color-grid-label' });
        label.setText(labelText);

        const control = cell.createDiv({ cls: 'rt-color-grid-controls' });
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
        if (colorInput2) colorInput2.classList.add('rt-hidden-color-input');
        const swatchEl2 = control.createDiv({ cls: `rt-swatch-trigger rt-subplot-${i}` });
        plugin.registerDomEvent(swatchEl2, 'click', () => { colorInput2?.click(); });
        new Settings(control)
            .addText(text => {
                inputRef = text;
                text.inputEl.classList.add('rt-hex-input');
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
}

