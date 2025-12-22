import { App, Notice, Setting as Settings, TextAreaComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { CreateBeatsTemplatesModal } from '../../modals/CreateBeatsTemplatesModal';
import { getPlotSystem } from '../../utils/beatsSystems';
import { createBeatTemplateNotes } from '../../utils/beatsTemplates';
import { AiContextModal } from '../AiContextModal';
import { DEFAULT_SETTINGS } from '../defaults';

export function renderStoryBeatsSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}): void {
    const { app, plugin, containerEl } = params;

    new Settings(containerEl)
        .setName('Gossamer and story beats system')
        .setHeading();

    const beatSystemSetting = new Settings(containerEl)
        .setName('Story beats system')
        .setDesc('Select the story structure model for your manuscript. This will establish the story beat system and can be used to create beat notes and graph scores using Gossamer view.')
        .addDropdown(dropdown => {
            dropdown
                .addOption('Save The Cat', 'Save The Cat (15 beats)')
                .addOption('Hero\'s Journey', 'Hero\'s Journey (12 beats)')
                .addOption('Story Grid', 'Story Grid (15 beats)')                    
                .addOption('Custom', 'Custom (User defined beat structure)')
                .setValue(plugin.settings.beatSystem || 'Custom')
                .onChange(async (value) => {
                    plugin.settings.beatSystem = value;
                    await plugin.saveSettings();
                    updateStoryStructureDescription(storyStructureInfo, value);
                    updateTemplateButton(templateSetting, value);
                });
            dropdown.selectEl.style.minWidth = '200px';
        });

    beatSystemSetting.settingEl.classList.add('rt-setting-two-row');
    
    // Explicitly enforce grid layout via inline styles to override any stubborn Flexbox
    beatSystemSetting.settingEl.style.setProperty('display', 'grid', 'important');
    beatSystemSetting.settingEl.style.gridTemplateColumns = '1fr auto';
    beatSystemSetting.settingEl.style.gridTemplateRows = 'auto auto';

    // Align the dropdown to the top
    beatSystemSetting.controlEl.style.setProperty('align-self', 'flex-start', 'important');
    beatSystemSetting.controlEl.style.marginTop = '6px';

    // Story structure explanation
    const storyStructureInfo = beatSystemSetting.settingEl.createDiv({
        cls: 'rt-story-structure-info setting-item-description'
    });
    // Ensure styles are set if CSS class doesn't fully cover it (redundancy)
    storyStructureInfo.style.gridColumn = '1 / 3';
    storyStructureInfo.style.gridRow = '2 / 3';
    storyStructureInfo.style.marginTop = '8px';
    storyStructureInfo.style.marginBottom = '0';
    
    updateStoryStructureDescription(storyStructureInfo, plugin.settings.beatSystem || 'Custom');

    // Create template beat note button
    const templateSetting = new Settings(containerEl)
        .setName('Create story beat template notes')
        .setDesc('Generate template beat notes based on the selected story structure system including YAML frontmatter and body summary.')
        .addButton(button => button
            .setButtonText('Create templates')
            .setTooltip('Creates story beat note templates in your source path')
            .onClick(async () => {
                await createBeatTemplates();
            }));

    updateTemplateButton(templateSetting, plugin.settings.beatSystem || 'Custom');

    const getActiveTemplateName = (): string => {
        const templates = plugin.settings.aiContextTemplates || [];
        const activeId = plugin.settings.activeAiContextTemplateId;
        const active = templates.find(t => t.id === activeId);
        return active?.name || 'Generic Editor';
    };

    const contextTemplateSetting = new Settings(containerEl)
        .setName('AI prompt role & context template')
        .setDesc(`Active: ${getActiveTemplateName()}`)
        .addExtraButton(button => button
            .setIcon('gear')
            .setTooltip('Manage context templates for AI prompt generation and Gossamer score generation')
            .onClick(() => {
                const modal = new AiContextModal(app, plugin, () => {
                    contextTemplateSetting.setDesc(`Active: ${getActiveTemplateName()}`);
                });
                modal.open();
            }));

    // Scene Templates Section
    new Settings(containerEl)
        .setName('Scene templates')
        .setHeading();

    new Settings(containerEl)
        .setName('Default scene template')
        .setDesc('Select which template to use when creating new scenes via commands or the Book Designer.')
        .addDropdown(dropdown => {
            dropdown
                .addOption('base', 'Base (Minimal)')
                .addOption('advanced', 'Advanced (Comprehensive)')
                .setValue(plugin.settings.defaultSceneTemplate || 'base')
                .onChange(async (value) => {
                    plugin.settings.defaultSceneTemplate = value as 'base' | 'advanced';
                    await plugin.saveSettings();
                });
        });

    const baseTemplateSetting = new Settings(containerEl)
        .setName('Base template (Minimal)')
        .setDesc('Used for quick, simple scene notes.')
        .addTextArea(text => {
            text
                .setValue(plugin.settings.sceneTemplates?.base || DEFAULT_SETTINGS.sceneTemplates!.base)
                .onChange(async (value) => {
                    if (!plugin.settings.sceneTemplates) plugin.settings.sceneTemplates = { base: '', advanced: '' };
                    plugin.settings.sceneTemplates.base = value;
                    await plugin.saveSettings();
                });
            text.inputEl.rows = 10;
            // SAFE: inline style used for monospace font
            text.inputEl.style.setProperty('width', '100%');
            // SAFE: inline style used for monospace font
            text.inputEl.style.fontFamily = 'monospace';
            // SAFE: inline style used for monospace font
            text.inputEl.style.setProperty('font-size', '0.8em');
        })
        .addExtraButton(btn => {
            btn.setIcon('reset')
                .setTooltip('Restore default base template')
                .onClick(async () => {
                    if (!plugin.settings.sceneTemplates) plugin.settings.sceneTemplates = { base: '', advanced: '' };
                    plugin.settings.sceneTemplates.base = DEFAULT_SETTINGS.sceneTemplates!.base;
                    await plugin.saveSettings();
                    // Force refresh of text area
                    const ta = baseTemplateSetting.controlEl.querySelector('textarea');
                    if (ta) ta.value = DEFAULT_SETTINGS.sceneTemplates!.base;
                });
        });
    // SAFE: inline style used for layout
    baseTemplateSetting.settingEl.style.setProperty('display', 'block');
    // SAFE: inline style used for layout
    baseTemplateSetting.controlEl.style.setProperty('width', '100%');

    const advancedTemplateSetting = new Settings(containerEl)
        .setName('Advanced template (Comprehensive)')
        .setDesc('Used for detailed analysis and tracking.')
        .addTextArea(text => {
            text
                .setValue(plugin.settings.sceneTemplates?.advanced || DEFAULT_SETTINGS.sceneTemplates!.advanced)
                .onChange(async (value) => {
                    if (!plugin.settings.sceneTemplates) plugin.settings.sceneTemplates = { base: '', advanced: '' };
                    plugin.settings.sceneTemplates.advanced = value;
                    await plugin.saveSettings();
                });
            text.inputEl.rows = 15;
            // SAFE: inline style used for monospace font
            text.inputEl.style.setProperty('width', '100%');
            // SAFE: inline style used for monospace font
            text.inputEl.style.fontFamily = 'monospace';
            // SAFE: inline style used for monospace font
            text.inputEl.style.setProperty('font-size', '0.8em');
        })
        .addExtraButton(btn => {
            btn.setIcon('reset')
                .setTooltip('Restore default advanced template')
                .onClick(async () => {
                    if (!plugin.settings.sceneTemplates) plugin.settings.sceneTemplates = { base: '', advanced: '' };
                    plugin.settings.sceneTemplates.advanced = DEFAULT_SETTINGS.sceneTemplates!.advanced;
                    await plugin.saveSettings();
                    const ta = advancedTemplateSetting.controlEl.querySelector('textarea');
                    if (ta) ta.value = DEFAULT_SETTINGS.sceneTemplates!.advanced;
                });
        });
    // SAFE: inline style used for layout
    advancedTemplateSetting.settingEl.style.setProperty('display', 'block');
    // SAFE: inline style used for layout
    advancedTemplateSetting.controlEl.style.setProperty('width', '100%');

    // Helper text
    const helperDiv = containerEl.createDiv({ cls: 'rt-template-helper-text setting-item-description' });
    // SAFE: inline style used for layout
    helperDiv.style.marginTop = '10px';
    // SAFE: inline style used for layout
    helperDiv.style.marginBottom = '20px';
    // SAFE: innerHTML used for rich text description
    helperDiv.insertAdjacentHTML('beforeend', `
        <strong>Available Variables:</strong><br>
        <code>{{Act}}</code> - Act number<br>
        <code>{{When}}</code> - Date/Time string<br>
        <code>{{SceneNumber}}</code> - Scene number<br>
        <code>{{Subplot}}</code> - Comma-separated list of subplots<br>
        <code>{{SubplotList}}</code> - YAML-formatted list of subplots (e.g. <br>&nbsp;&nbsp;- Subplot A<br>&nbsp;&nbsp;- Subplot B)<br>
        <code>{{Character}}</code> - Character name(s)<br>
        <code>{{Place}}</code> - Location name
    `);

    function updateStoryStructureDescription(container: HTMLElement, selectedSystem: string): void {
        const descriptions: Record<string, string> = {
            'Save The Cat': 'Commercial fiction, screenplays, and genre stories. Emphasizes clear emotional beats and audience engagement.',
            'Hero\'s Journey': 'Mythic, adventure, and transformation stories. Focuses on the protagonist\'s arc through trials and self-discovery.',
            'Story Grid': 'Literary fiction and complex narratives. Balances micro and macro structure with progressive complications.',
            'Custom': 'Uses any story beat notes you create. Perfect for when you don\'t follow a traditional story structure.'
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
        const isCustom = selectedSystem === 'Custom';
        if (isCustom) {
            setting.setName('Create story beat template notes');
            setting.setDesc('Custom story structures must be created manually by the author.');
        } else {
            setting.setName(`Create story beat template notes for ${selectedSystem}`);
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
        const storyStructureName = plugin.settings.beatSystem || 'Custom';
        if (storyStructureName === 'Custom') {
            new Notice('Custom story structure selected. Create your own Beat notes with Class: Beat. No templates will be generated.');
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
            new Notice(`Failed to create story beat templates: ${error}`);
        }
    }
}
