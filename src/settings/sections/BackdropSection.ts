import { App, Setting as Settings, ColorComponent, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { parseDateRangeInput } from '../../utils/date';
import { addHeadingIcon } from '../wikiLink';
import { DEFAULT_SETTINGS } from '../defaults';

type MicroBackdropConfig = {
    title: string;
    range: string;
    color: string;
};

const isValidHexColor = (value: string) => /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value);

export function renderBackdropSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; }): void {
    const { plugin, containerEl } = params;

    const backdropHeading = new Settings(containerEl)
        .setName('Backdrop')
        .setHeading();
    addHeadingIcon(backdropHeading, 'layers-3');
    backdropHeading.settingEl.classList.add('rt-section-heading');

    new Settings(containerEl)
        .setName('Show backdrop ring')
        .setDesc('Display the backdrop ring in Chronologue mode. When disabled, the ring space is reclaimed for subplot rings.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showBackdropRing ?? true)
            .onChange(async (value) => {
                plugin.settings.showBackdropRing = value;
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
                renderMicroBackdrops();
            }));

    const listContainer = containerEl.createDiv({ cls: 'rt-micro-backdrop-body' });
    const list = listContainer.createDiv({ cls: 'rt-micro-backdrop-list' });
    let expandedIndex: number | null = null;

    const getMicroBackdrops = (): MicroBackdropConfig[] =>
        Array.isArray(plugin.settings.chronologueBackdropMicroRings)
            ? plugin.settings.chronologueBackdropMicroRings
            : [];

    const saveMicroBackdrops = async (next: MicroBackdropConfig[]) => {
        plugin.settings.chronologueBackdropMicroRings = next;
        await plugin.saveSettings();
        plugin.refreshTimelineIfNeeded(null);
    };

    const updateMicroBackdrop = async (index: number, patch: Partial<MicroBackdropConfig>) => {
        const current = getMicroBackdrops();
        if (!current[index]) return;
        const next = [...current];
        next[index] = { ...next[index], ...patch };
        await saveMicroBackdrops(next);
    };

    const renderMicroBackdropRow = (config: MicroBackdropConfig, index: number) => {
        const wrapper = list.createDiv({ cls: 'rt-micro-backdrop-wrapper' });
        const rawTitle = config.title?.trim();
        const title = rawTitle ? `${rawTitle} microring` : `Micro backdrop ${index + 1}`;
        const rangeValue = config.range?.trim() ?? '';
        const parsedRange = rangeValue ? parseDateRangeInput(rangeValue) : null;
        const rangeSummary = parsedRange?.start && parsedRange?.end ? `Range: ${rangeValue}` : 'No date range set.';

        const row = new Settings(wrapper)
            .setName(title)
            .setDesc(rangeSummary);
        row.settingEl.classList.add('rt-micro-backdrop-row');

        const isExpanded = expandedIndex === index;
        row.addButton(button => {
            button
                .setIcon(isExpanded ? 'chevron-down' : 'chevron-right')
                .setTooltip(isExpanded ? 'Collapse' : 'Edit micro-backdrop')
                .onClick(() => {
                    expandedIndex = isExpanded ? null : index;
                    renderMicroBackdrops();
                });
        });

        row.addButton(button => {
            button
                .setIcon('trash')
                .setTooltip('Delete micro-backdrop')
                .onClick(async () => {
                    const current = getMicroBackdrops();
                    const next = current.filter((_, idx) => idx !== index);
                    expandedIndex = null;
                    await saveMicroBackdrops(next);
                    renderMicroBackdrops();
                });
        });

        if (!isExpanded) return;

        const details = wrapper.createDiv({ cls: 'rt-micro-backdrop-details' });

        const titleColorSetting = new Settings(details)
            .setName('Title + color')
            .setDesc('Name the microring and set its color.');
        titleColorSetting.controlEl.classList.add('ert-micro-backdrop-title-row');

        titleColorSetting.addText(text => {
            text.setPlaceholder('Title')
                .setValue(config.title || '');
            text.inputEl.classList.add('ert-input--md');
            text.onChange(async (value) => {
                await updateMicroBackdrop(index, { title: value });
            });
            const commitTitle = async () => {
                await updateMicroBackdrop(index, { title: text.getValue() });
                renderMicroBackdrops();
            };
            plugin.registerDomEvent(text.inputEl, 'blur', () => {
                void commitTitle();
            });
            plugin.registerDomEvent(text.inputEl, 'keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    text.inputEl.blur();
                }
            });
        });

        const colorControls = titleColorSetting.controlEl.createDiv({ cls: 'ert-color-grid-controls rt-micro-backdrop-color-controls' });
        let colorTextInput: TextComponent | undefined;
        let colorPickerRef: ColorComponent | undefined;
        let swatchEl: HTMLDivElement | null = null;
        const colorValue = config.color || '#ffffff';

        colorPickerRef = new ColorComponent(colorControls)
            .setValue(colorValue)
            .onChange(async (value) => {
                if (!isValidHexColor(value)) return;
                const normalized = value.startsWith('#') ? value : `#${value}`;
                await updateMicroBackdrop(index, { color: normalized });
                colorTextInput?.setValue(normalized);
                if (swatchEl) swatchEl.style.background = normalized;
            });

        const colorInput = colorControls.querySelector('input[type="color"]:last-of-type') as HTMLInputElement | null;
        if (colorInput) colorInput.classList.add('ert-hidden-color-input');

        swatchEl = colorControls.createDiv({ cls: 'ert-swatch-trigger' });
        swatchEl.style.background = colorValue;
        plugin.registerDomEvent(swatchEl, 'click', () => { colorInput?.click(); });

        const hexInput = new TextComponent(colorControls);
        colorTextInput = hexInput;
        hexInput.inputEl.classList.add('ert-hex-input');
        hexInput.setValue(colorValue)
            .onChange(async (value) => {
                if (!isValidHexColor(value)) return;
                const normalized = value.startsWith('#') ? value : `#${value}`;
                await updateMicroBackdrop(index, { color: normalized });
                colorPickerRef?.setValue(normalized);
                if (swatchEl) swatchEl.style.background = normalized;
            });

        const rangeSetting = new Settings(details)
            .setName('Date range')
            .setDesc('Example formats: "4/24/2024 - 4/25/2025 1:45pm" or "2024-04-24 - 2024-04-25 13:45".');
        rangeSetting.addText(text => {
            text.setPlaceholder('4/24/2024 - 4/25/2025 1:45pm')
                .setValue(config.range || '');
            text.inputEl.classList.add('ert-input--lg');

            const validateRange = () => {
                text.inputEl.removeClass('ert-setting-input-error');
                const trimmed = text.getValue().trim();
                if (!trimmed) return;
                const parsed = parseDateRangeInput(trimmed);
                if (!parsed?.start || !parsed?.end) {
                    text.inputEl.addClass('ert-setting-input-error');
                }
            };

            const commitRange = async () => {
                await updateMicroBackdrop(index, { range: text.getValue() });
                renderMicroBackdrops();
            };

            plugin.registerDomEvent(text.inputEl, 'blur', () => {
                validateRange();
                void commitRange();
            });
            plugin.registerDomEvent(text.inputEl, 'keydown', (event: KeyboardEvent) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    text.inputEl.blur();
                }
            });

            text.onChange(async (value) => {
                await updateMicroBackdrop(index, { range: value });
            });

            validateRange();
        });
    };

    const renderMicroBackdrops = () => {
        const showBackdropRing = plugin.settings.showBackdropRing ?? true;
        if (!showBackdropRing) {
            listContainer.addClass('ert-settings-hidden');
            list.empty();
            return;
        }

        listContainer.removeClass('ert-settings-hidden');
        list.empty();

        const microBackdrops = getMicroBackdrops();
        microBackdrops.forEach((config, index) => {
            renderMicroBackdropRow(config, index);
        });

        const emptyHint = microBackdrops.length === 0
            ? ' No micro-backdrops yet. Add one to get started.'
            : '';

        const addSetting = new Settings(list)
            .setName('Add micro-backdrop')
            .setDesc(`Creates a new ring configuration. Micro-backdrops are thin custom bands tucked under the backdrop ring (Chronologue mode only).${emptyHint}`);
        addSetting.addButton(button => button
            .setButtonText('Add')
            .onClick(async () => {
                const current = getMicroBackdrops();
                const palette = DEFAULT_SETTINGS.subplotColors || ['#ffffff'];
                const nextColor = palette[current.length % palette.length] || '#ffffff';
                const next = [
                    ...current,
                    { title: '', range: '', color: nextColor }
                ];
                expandedIndex = next.length - 1;
                await saveMicroBackdrops(next);
                renderMicroBackdrops();
            }));
    };

    renderMicroBackdrops();
}
