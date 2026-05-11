import { Setting as Settings, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { PluginRendererFacade } from '../../utils/sceneHelpers';
import { computeCacheableValues } from '../../renderer/utils/Precompute';
import { DEFAULT_SETTINGS } from '../defaults';
import { colorSwatch, type ColorSwatchHandle } from '../../ui/ui';
import { ERT_DATA } from '../../ui/classes';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { HERO_PATTERNS, DEFAULT_WORKING_PATTERN_ID, getHeroPattern } from '../../renderer/components/HeroPatterns';
import { IMPACT_FULL } from '../SettingImpact';

/**
 * Return the subplot name trimmed of surrounding whitespace.
 * No length truncation — the card is allowed to grow / wrap to fit the name.
 */
function normalizeSubplotLabel(value: string): string {
    return value.trim();
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

function renderWorkingPatternPreview(svgEl: SVGSVGElement, patternId: string, stageColor: string): void {
    const pattern = getHeroPattern(patternId);
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    const NS = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(NS, 'defs');
    const pat = document.createElementNS(NS, 'pattern');
    pat.setAttribute('id', `ert-pattern-preview-${pattern.id}`);
    pat.setAttribute('patternUnits', 'userSpaceOnUse');
    pat.setAttribute('width', String(pattern.tileW));
    pat.setAttribute('height', String(pattern.tileH));
    // Use status Working hex as the field; stage color as the motif tint — same as Defs.ts.
    const fieldRect = document.createElementNS(NS, 'rect');
    fieldRect.setAttribute('width', String(pattern.tileW));
    fieldRect.setAttribute('height', String(pattern.tileH));
    fieldRect.setAttribute('fill', '#FFB1B1');
    fieldRect.setAttribute('opacity', '0.82');
    pat.appendChild(fieldRect);
    const tintG = document.createElementNS(NS, 'g');
    tintG.setAttribute('fill', stageColor);
    tintG.setAttribute('fill-opacity', String(pattern.fillOpacity));
    if (pattern.fillRule) tintG.setAttribute('fill-rule', pattern.fillRule);
    for (const shape of pattern.shapes) {
        const node = document.createElementNS(NS, shape.tag);
        for (const [k, v] of Object.entries(shape.attrs)) node.setAttribute(k, v);
        tintG.appendChild(node);
    }
    pat.appendChild(tintG);
    defs.appendChild(pat);
    svgEl.appendChild(defs);
    const rect = document.createElementNS(NS, 'rect');
    rect.setAttribute('width', '100%');
    rect.setAttribute('height', '100%');
    rect.setAttribute('fill', `url(#ert-pattern-preview-${pattern.id})`);
    svgEl.appendChild(rect);
}

export function renderColorsSection(containerEl: HTMLElement, plugin: RadialTimelinePlugin): void {
    // --- Working Patterns (Hero Patterns motif for Working-status scenes) ---
    const patternSection = containerEl.createDiv({ attr: { [ERT_DATA.SECTION]: 'colors-working-pattern' } });
    const patternHeading = new Settings(patternSection)
        .setName('Working patterns')
        .setHeading();
    addHeadingIcon(patternHeading, 'paintbrush-vertical');
    applyErtHeaderLayout(patternHeading);
    const patternDesc = patternHeading.descEl;
    if (patternDesc) {
        patternDesc.addClass('ert-color-section-desc');
        patternDesc.setText('SVG motif used to fill Working-status scenes, tinted per Publishing stage. Patterns from ');
        const link = patternDesc.createEl('a', {
            text: 'Hero Patterns',
            href: 'https://heropatterns.com',
        });
        link.setAttr('target', '_blank');
        link.setAttr('rel', 'noopener');
        patternDesc.appendText(' by Steve Schoger (CC BY 4.0).');
    }

    const currentPatternId = plugin.settings.workingPatternId ?? DEFAULT_WORKING_PATTERN_ID;
    const previewStageColor = plugin.settings.publishStageColors?.Author
        || DEFAULT_SETTINGS.publishStageColors.Author;

    const patternRow = new Settings(patternSection)
        .setName('Working pattern');
    const previewWrap = patternRow.controlEl.createDiv({ cls: 'ert-working-pattern-preview-wrap' });
    const previewSvg = previewWrap.createSvg('svg', { attr: { viewBox: '0 0 60 30', width: '60', height: '30' } });
    previewSvg.addClass('ert-working-pattern-preview');
    renderWorkingPatternPreview(previewSvg, currentPatternId, previewStageColor);

    patternRow.addDropdown(dropdown => {
        HERO_PATTERNS.forEach(p => dropdown.addOption(p.id, p.name));
        dropdown.setValue(currentPatternId);
        dropdown.onChange(async (value) => {
            plugin.settings.workingPatternId = value;
            await plugin.saveSettings();
            renderWorkingPatternPreview(previewSvg, value, previewStageColor);
            plugin.onSettingChanged(IMPACT_FULL);
        });
    });
    patternRow.addExtraButton(button => {
        button.setIcon('reset')
            .setTooltip('Reset to default')
            .onClick(async () => {
                plugin.settings.workingPatternId = DEFAULT_WORKING_PATTERN_ID;
                await plugin.saveSettings();
                renderWorkingPatternPreview(previewSvg, DEFAULT_WORKING_PATTERN_ID, previewStageColor);
                plugin.onSettingChanged(IMPACT_FULL);
                // Refresh the dropdown to reflect the reset.
                const select = patternRow.controlEl.querySelector('select');
                if (select instanceof HTMLSelectElement) select.value = DEFAULT_WORKING_PATTERN_ID;
            });
    });

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
            subplotLabels[i].setText(normalizeSubplotLabel(subplotName));
        }
    })();
}
