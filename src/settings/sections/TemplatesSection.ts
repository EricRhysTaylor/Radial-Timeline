import { App, Setting } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { HoverMetadataField } from '../../types/settings';

export function renderTemplatesSection(containerEl: HTMLElement, plugin: RadialTimelinePlugin): void {
    const section = containerEl.createDiv({ cls: 'rt-settings-section' });
    const header = section.createDiv({ cls: 'rt-settings-header-row' });
    header.createEl('h3', { text: 'Templates & Metadata' });

    // Scene YAML Templates
    new Setting(section)
        .setName('Base Scene Template')
        .setDesc('YAML template for basic scenes.')
        .addTextArea(text => text
            .setValue(plugin.settings.sceneYamlTemplates?.base || '')
            .onChange(async (val) => {
                if (plugin.settings.sceneYamlTemplates) {
                    plugin.settings.sceneYamlTemplates.base = val;
                    await plugin.saveSettings();
                }
            }));

    new Setting(section)
        .setName('Advanced Scene Template')
        .setDesc('YAML template for detailed analysis.')
        .addTextArea(text => text
            .setValue(plugin.settings.sceneYamlTemplates?.advanced || '')
            .onChange(async (val) => {
                if (plugin.settings.sceneYamlTemplates) {
                    plugin.settings.sceneYamlTemplates.advanced = val;
                    await plugin.saveSettings();
                }
            }));

    // Hover Metadata Fields (simplified for fix)
    new Setting(section)
        .setName('Hover Metadata Fields')
        .setDesc('Add custom frontmatter keys to display in the hover synopsis.')
        .addButton(btn => btn
            .setButtonText('Add Field')
            .onClick(async () => {
                if (!plugin.settings.hoverMetadataFields) plugin.settings.hoverMetadataFields = [];
                const key = 'New Field';
                const label = 'New Label'; // Default label
                const icon = 'tag';
                const enabled = true;
                plugin.settings.hoverMetadataFields.push({ key, label, icon, enabled });
                await plugin.saveSettings();
                // Refresh UI (omitted for brevity in fix)
            }));
}
