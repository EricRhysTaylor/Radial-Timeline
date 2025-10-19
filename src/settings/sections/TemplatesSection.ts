import { App, Notice, Setting as Settings } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { CreatePlotTemplatesModal } from '../../modals/CreatePlotTemplatesModal';
import { getPlotSystem } from '../../utils/plotSystems';
import { createPlotTemplateNotes } from '../../utils/plotTemplates';

export function renderTemplatesSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}): void {
    const { app, plugin, containerEl } = params;

    // Plot System setting (for Gossamer mode)
    new Settings(containerEl)
        .setName('Plot system and gossamer')
        .setDesc('Select the story structure model for your manuscript. This will establish the optional plot system and can be used to create plot notes and graph scores using Gossamer view.')
        .addDropdown(dropdown => {
            dropdown
                .addOption('User', 'User (Custom plot structure)')
                .addOption('Save The Cat', 'Save The Cat (15 beats)')
                .addOption('Hero\'s Journey', 'Hero\'s Journey (12 beats)')
                .addOption('Story Grid', 'Story Grid (15 beats)')
                .setValue(plugin.settings.plotSystem || 'User')
                .onChange(async (value) => {
                    plugin.settings.plotSystem = value;
                    await plugin.saveSettings();
                    updatePlotSystemDescription(plotSystemInfo, value);
                    updateTemplateButton(templateSetting, value);
                });
            dropdown.selectEl.style.minWidth = '200px';
        });

    // Plot system explanation
    const plotSystemInfo = containerEl.createEl('div', { cls: 'setting-item-description' });
    plotSystemInfo.style.marginTop = '-8px';
    plotSystemInfo.style.marginBottom = '18px';
    plotSystemInfo.style.paddingLeft = '0';
    updatePlotSystemDescription(plotSystemInfo, plugin.settings.plotSystem || 'User');

    // Create template notes button
    const templateSetting = new Settings(containerEl)
        .setName('Create plot template notes')
        .setDesc('Generate template plot notes based on the selected plot system including YAML frontmatter and body summary.')
        .addButton(button => button
            .setButtonText('Create templates')
            .setTooltip('Creates Plot note templates in your source path')
            .onClick(async () => {
                await createPlotTemplates();
            }));

    updateTemplateButton(templateSetting, plugin.settings.plotSystem || 'User');

    function updatePlotSystemDescription(container: HTMLElement, selectedSystem: string): void {
        const descriptions: Record<string, string> = {
            'User': 'Custom plot structure. Uses any Plot notes you create without filtering by plot system. Perfect for custom story structures or when you don\'t follow a formal plot system.',
            'Save The Cat': 'Commercial fiction, screenplays, and genre stories. Emphasizes clear emotional beats and audience engagement.',
            'Hero\'s Journey': 'Mythic, adventure, and transformation stories. Focuses on the protagonist\'s arc through trials and self-discovery.',
            'Story Grid': 'Literary fiction and complex narratives. Balances micro and macro structure with progressive complications.'
        };

        container.empty();
        for (const [system, desc] of Object.entries(descriptions)) {
            const isSelected = system === selectedSystem;
            const lineDiv = container.createDiv();
            if (isSelected) {
                lineDiv.classList.add('rt-plot-system-selected');
            }
            const boldSpan = lineDiv.createEl('b');
            boldSpan.textContent = system;
            lineDiv.appendText(`: ${desc}`);
        }
    }

    function updateTemplateButton(setting: Settings, selectedSystem: string): void {
        const isCustom = selectedSystem === 'User';
        if (isCustom) {
            setting.setName('Create plot template notes');
            setting.setDesc('Custom plot systems must be created manually by the author.');
        } else {
            setting.setName(`Create plot template notes for ${selectedSystem}`);
            setting.setDesc(`Generate ${selectedSystem} template plot notes including YAML frontmatter and body summary.`);
        }
        const settingEl = setting.settingEl;
        if (isCustom) {
            settingEl.style.opacity = '0.6';
        } else {
            settingEl.style.opacity = '1';
        }
    }

    async function createPlotTemplates(): Promise<void> {
        const plotSystemName = plugin.settings.plotSystem || 'User';
        if (plotSystemName === 'User') {
            new Notice('User plot system selected. Create your own Plot notes with Class: Plot. No templates will be generated.');
            return;
        }
        const plotSystem = getPlotSystem(plotSystemName);
        if (!plotSystem) {
            new Notice(`Unknown plot system: ${plotSystemName}`);
            return;
        }
        const modal = new CreatePlotTemplatesModal(
            app,
            plugin,
            plotSystemName,
            plotSystem.beatCount
        );
        modal.open();
        const result = await modal.waitForConfirmation();
        if (!result.confirmed) return;
        try {
            const sourcePath = plugin.settings.sourcePath || '';
            const { created, skipped, errors } = await createPlotTemplateNotes(
                app.vault,
                plotSystemName,
                sourcePath
            );
            if (errors.length > 0) {
                new Notice(`Created ${created} notes. ${skipped} skipped. ${errors.length} errors. Check console.`);
                console.error('[Plot Templates] Errors:', errors);
            } else if (created === 0 && skipped > 0) {
                new Notice(`All ${skipped} Plot notes already exist. No new notes created.`);
            } else {
                new Notice(`✓ Successfully created ${created} Plot template notes!`);
            }
        } catch (error) {
            console.error('[Plot Templates] Failed:', error);
            new Notice(`Failed to create Plot templates: ${error}`);
        }
    }
}


