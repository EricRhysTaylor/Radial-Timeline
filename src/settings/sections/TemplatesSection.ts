import { App, Notice, Setting as Settings } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { CreateBeatsTemplatesModal } from '../../modals/CreateBeatsTemplatesModal';
import { getPlotSystem } from '../../utils/beatsSystems';
import { createBeatTemplateNotes } from '../../utils/beatsTemplates';

export function renderTemplatesSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}): void {
    const { app, plugin, containerEl } = params;

    // Story Structure setting (for Gossamer mode)
    new Settings(containerEl)
        .setName('Story beats system and gossamer')
        .setDesc('Select the story structure model for your manuscript. This will establish the optional beats system and can be used to create beat notes and graph scores using Gossamer view.')
        .addDropdown(dropdown => {
            dropdown
                .addOption('User', 'User (Custom beat structure)')
                .addOption('Save The Cat', 'Save The Cat (15 beats)')
                .addOption('Hero\'s Journey', 'Hero\'s Journey (12 beats)')
                .addOption('Story Grid', 'Story Grid (15 beats)')
                .setValue(plugin.settings.beatSystem || 'User')
                .onChange(async (value) => {
                    plugin.settings.beatSystem = value;
                    await plugin.saveSettings();
                    updateStoryStructureDescription(storyStructureInfo, value);
                    updateTemplateButton(templateSetting, value);
                });
            dropdown.selectEl.style.minWidth = '200px';
        });

    // Story structure explanation
    const storyStructureInfo = containerEl.createEl('div', { cls: 'setting-item-description' });
    storyStructureInfo.style.marginTop = '-8px';
    storyStructureInfo.style.marginBottom = '18px';
    storyStructureInfo.style.paddingLeft = '0';
    updateStoryStructureDescription(storyStructureInfo, plugin.settings.beatSystem || 'User');

    // Create template notes button
    const templateSetting = new Settings(containerEl)
        .setName('Create beat template notes')
        .setDesc('Generate template beat notes based on the selected story structure system including YAML frontmatter and body summary.')
        .addButton(button => button
            .setButtonText('Create templates')
            .setTooltip('Creates Beat note templates in your source path')
            .onClick(async () => {
                await createBeatTemplates();
            }));

    updateTemplateButton(templateSetting, plugin.settings.beatSystem || 'User');

    function updateStoryStructureDescription(container: HTMLElement, selectedSystem: string): void {
        const descriptions: Record<string, string> = {
            'User': 'Custom story structure. Uses any Beat notes you create without filtering by story structure. Perfect for custom story structures or when you don\'t follow a formal story structure.',
            'Save The Cat': 'Commercial fiction, screenplays, and genre stories. Emphasizes clear emotional beats and audience engagement.',
            'Hero\'s Journey': 'Mythic, adventure, and transformation stories. Focuses on the protagonist\'s arc through trials and self-discovery.',
            'Story Grid': 'Literary fiction and complex narratives. Balances micro and macro structure with progressive complications.'
        };

        container.empty();
        for (const [system, desc] of Object.entries(descriptions)) {
            const isSelected = system === selectedSystem;
            const lineDiv = container.createDiv();
            if (isSelected) {
                lineDiv.classList.add('rt-story-structure-selected');
            }
            const boldSpan = lineDiv.createEl('b');
            boldSpan.textContent = system;
            lineDiv.appendText(`: ${desc}`);
        }
    }

    function updateTemplateButton(setting: Settings, selectedSystem: string): void {
        const isCustom = selectedSystem === 'User';
        if (isCustom) {
            setting.setName('Create beat template notes');
            setting.setDesc('Custom story structures must be created manually by the author.');
        } else {
            setting.setName(`Create beat template notes for ${selectedSystem}`);
            setting.setDesc(`Generate ${selectedSystem} template beat notes including YAML frontmatter and body summary.`);
        }
        const settingEl = setting.settingEl;
        if (isCustom) {
            settingEl.style.opacity = '0.6';
        } else {
            settingEl.style.opacity = '1';
        }
    }

    async function createBeatTemplates(): Promise<void> {
        const storyStructureName = plugin.settings.beatSystem || 'User';
        if (storyStructureName === 'User') {
            new Notice('User story structure selected. Create your own Beat notes with Class: Beat. No templates will be generated.');
            return;
        }
        const storyStructure = getPlotSystem(storyStructureName);
        if (!storyStructure) {
            new Notice(`Unknown story structure: ${storyStructureName}`);
            return;
        }
        const modal = new CreateBeatsTemplatesModal(
            app,
            plugin,
            storyStructureName,
            storyStructure.beatCount
        );
        modal.open();
        const result = await modal.waitForConfirmation();
        if (!result.confirmed) return;
        try {
            const sourcePath = plugin.settings.sourcePath || '';
            const { created, skipped, errors } = await createBeatTemplateNotes(
                app.vault,
                storyStructureName,
                sourcePath
            );
            if (errors.length > 0) {
                new Notice(`Created ${created} notes. ${skipped} skipped. ${errors.length} errors. Check console.`);
                console.error('[Beat Templates] Errors:', errors);
            } else if (created === 0 && skipped > 0) {
                new Notice(`All ${skipped} Beat notes already exist. No new notes created.`);
            } else {
                new Notice(`✓ Successfully created ${created} Beat template notes!`);
            }
        } catch (error) {
            console.error('[Beat Templates] Failed:', error);
            new Notice(`Failed to create Beat templates: ${error}`);
        }
    }
}


