import type { App } from 'obsidian';
import { Setting } from 'obsidian';
import type RadialTimelinePlugin from '../../main';

const CANONICAL_KEYS = [
    'Class', 'When', 'Subplot', 'Act', 'Duration', 'Character', 'POV', 'Place', 'Synopsis', 
    'Status', 'Publish Stage', 'Due', 'Pending Edits', 'Beat Model', 'Range', 
    'Suggest Placement', 'Description', 'Title'
].sort();

export function renderMetadataSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}): void {
    const { plugin, containerEl } = params;

    new Setting(containerEl)
        .setName('Metadata Mapping')
        .setHeading();

    new Setting(containerEl)
        .setDesc('Map your custom frontmatter keys to the system keys used by Radial Timeline. This allows you to use your own naming conventions (e.g., "StoryLine" instead of "Subplot", or "Date" instead of "When"). Keys are case-insensitive.');

    const mappingsContainer = containerEl.createDiv();

    const renderMappings = () => {
        mappingsContainer.empty();
        const mappings = plugin.settings.frontmatterMappings || {};

        for (const [userKey, systemKey] of Object.entries(mappings)) {
            new Setting(mappingsContainer)
                .addText(text => {
                    text.setPlaceholder('Your Key')
                        .setValue(userKey);
                    
                    text.inputEl.addEventListener('blur', async () => {
                        const newValue = text.getValue().trim();
                        if (newValue && newValue !== userKey) {
                            if (!plugin.settings.frontmatterMappings) plugin.settings.frontmatterMappings = {};
                            
                            // Remove old key
                            delete plugin.settings.frontmatterMappings[userKey];
                            // Add new key
                            plugin.settings.frontmatterMappings[newValue] = systemKey;
                            
                            await plugin.saveSettings();
                            renderMappings(); // Re-render to update closures
                        } else if (!newValue) {
                             // Revert if empty
                             text.setValue(userKey);
                        }
                    });
                })
                .addDropdown(dropdown => {
                    CANONICAL_KEYS.forEach(key => dropdown.addOption(key, key));
                    dropdown.setValue(systemKey);
                    dropdown.onChange(async (newValue) => {
                        if (plugin.settings.frontmatterMappings) {
                            plugin.settings.frontmatterMappings[userKey] = newValue;
                            await plugin.saveSettings();
                        }
                    });
                })
                .addButton(button => button
                    .setIcon('trash')
                    .setTooltip('Delete Mapping')
                    .onClick(async () => {
                        if (plugin.settings.frontmatterMappings) {
                            delete plugin.settings.frontmatterMappings[userKey];
                            await plugin.saveSettings();
                            renderMappings();
                        }
                    }));
        }

        // Add New Mapping Button
        new Setting(mappingsContainer)
            .addButton(button => button
                .setButtonText('Add New Mapping')
                .onClick(async () => {
                    if (!plugin.settings.frontmatterMappings) {
                        plugin.settings.frontmatterMappings = {};
                    }
                    // Find a unique key
                    let newKey = 'New Key';
                    let i = 1;
                    while (plugin.settings.frontmatterMappings[newKey]) {
                        newKey = `New Key ${i++}`;
                    }
                    plugin.settings.frontmatterMappings[newKey] = 'When';
                    await plugin.saveSettings();
                    renderMappings();
                }));
    };

    renderMappings();
}
