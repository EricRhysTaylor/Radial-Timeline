import { App, Setting as Settings, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';

const CANONICAL_KEYS = [
    'Class', 'When', 'Subplot', 'Act', 'Duration', 'Character', 'POV', 'Place', 'Synopsis', 
    'Status', 'Publish Stage', 'Due', 'Pending Edits', 'Beat Model', 'Range', 'Description'
].sort();

const ALL_CANONICAL_KEYS = CANONICAL_KEYS;

export function renderMetadataSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; }): void {
    const { app, plugin, containerEl } = params;

    new Settings(containerEl)
        .setName('Custom Metadata Mapping')
        .setHeading();

    // Toggle for Metadata Mapping
    new Settings(containerEl)
        .setName('Enable custom metadata mapping')
        .setDesc('Map your custom frontmatter keys to system keys. Useful for legacy data or non-standard naming conventions.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableCustomMetadataMapping ?? false)
            .onChange(async (value) => {
                plugin.settings.enableCustomMetadataMapping = value;
                await plugin.saveSettings();
                renderMappings(); // Refresh visibility
            }));

    const mappingListContainer = containerEl.createDiv({ cls: 'rt-mapping-list' });

    const renderMappings = () => {
        // Toggle visibility based on setting
        if (!plugin.settings.enableCustomMetadataMapping) {
            mappingListContainer.addClass('rt-mapping-hidden');
            mappingListContainer.empty();
            return;
        }

        mappingListContainer.removeClass('rt-mapping-hidden');
        mappingListContainer.empty();
        
        const mappings = plugin.settings.frontmatterMappings || {};
        // Get set of currently used canonical keys to enforce uniqueness
        const usedCanonicalKeys = new Set(Object.values(mappings));

        // Render existing mappings
        for (const [userKey, systemKey] of Object.entries(mappings)) {
            const setting = new Settings(mappingListContainer);
            
            // Text input for User Key
            setting.addText(text => {
                text.setPlaceholder('Your Key (e.g. StoryLine)')
                    .setValue(userKey)
                    .onChange(async (newValue) => {
                        // We defer saving until blur to avoid partial state
                    });
                
                // Handle rename on blur
                text.inputEl.addEventListener('blur', async () => {
                    const newValue = text.getValue().trim();
                    if (newValue && newValue !== userKey) {
                        if (!plugin.settings.frontmatterMappings) plugin.settings.frontmatterMappings = {};
                        
                        // Remove old key
                        delete plugin.settings.frontmatterMappings[userKey];
                        // Add new key
                        plugin.settings.frontmatterMappings[newValue] = systemKey;
                        
                        await plugin.saveSettings();
                        renderMappings(); 
                    } else if (!newValue) {
                         // Revert if empty
                         text.setValue(userKey);
                    }
                });
            });

            // Dropdown for System Key
            setting.addDropdown(dropdown => {
                // Populate dropdown
                // Include:
                // 1. The current value (so it's selectable)
                // 2. Any key NOT in usedCanonicalKeys
                
                // Always add the current value first or ensure it's there
                dropdown.addOption(systemKey, systemKey);
                
                ALL_CANONICAL_KEYS.forEach(key => {
                    if (key !== systemKey && !usedCanonicalKeys.has(key)) {
                        dropdown.addOption(key, key);
                    }
                });
                
                dropdown.setValue(systemKey);
                dropdown.onChange(async (newValue) => {
                    if (plugin.settings.frontmatterMappings) {
                        plugin.settings.frontmatterMappings[userKey] = newValue;
                        await plugin.saveSettings();
                        renderMappings(); // Re-render to update used keys list for others
                    }
                });
            });

            // Delete button
            setting.addButton(button => button
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
        new Settings(mappingListContainer)
            .addButton(button => button
                .setButtonText('Add New Mapping')
                .onClick(async () => {
                    if (!plugin.settings.frontmatterMappings) {
                        plugin.settings.frontmatterMappings = {};
                    }
                    
                    // Find a unique user key placeholder
                    let newKey = 'New Key';
                    let i = 1;
                    while (plugin.settings.frontmatterMappings[newKey]) {
                        newKey = `New Key ${i++}`;
                    }

                    // Find first available canonical key
                    const currentUsed = new Set(Object.values(plugin.settings.frontmatterMappings));
                    const firstAvailable = ALL_CANONICAL_KEYS.find(k => !currentUsed.has(k));

                    if (!firstAvailable) {
                        new Notice('All supported system keys are already mapped.');
                        return;
                    }

                    plugin.settings.frontmatterMappings[newKey] = firstAvailable;
                    await plugin.saveSettings();
                    renderMappings();
                }));
    };

    // Initial render
    renderMappings();
}

