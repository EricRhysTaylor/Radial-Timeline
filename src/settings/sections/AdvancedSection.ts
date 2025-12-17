import { App, Setting as Settings, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { clearFontMetricsCaches } from '../../renderer/utils/FontMetricsCache';
import { t } from '../../i18n';

const CANONICAL_KEYS = [
    'Class', 'When', 'Subplot', 'Act', 'Duration', 'Character', 'POV', 'Place', 'Synopsis', 
    'Status', 'Publish Stage', 'Due', 'Pending Edits', 'Beat Model', 'Range', 'Description'
].sort();

// Helper to expand 'Gossamer' into Gossamer1..30 for validation purposes, or just check prefixes.
// For the dropdown, we will just list 'Gossamer' as a general bucket or list all?
// The user asked for "canonical keys". Listing 30 Gossamer keys is clutter.
// However, the frontmatter parser maps "GossamerX" dynamically.
// Let's stick to the main ones + 'Gossamer' as a concept, but in the dropdown we should probably explicit list commonly mapped keys.
// Actually, let's keep the list simple. If they want to map "MyScore1" to "Gossamer1", they need "Gossamer1" in the list.
// Let's expand Gossamer for the dropdown to be useful.
const ALL_CANONICAL_KEYS = CANONICAL_KEYS;

export function renderAdvancedSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; }): void {
    const { app, plugin, containerEl } = params;

    new Settings(containerEl)
        .setName(t('settings.advanced.heading'))
        .setHeading();

    // 1. Auto-expand clipped scene titles
    new Settings(containerEl)
        .setName(t('settings.advanced.autoExpand.name'))
        .setDesc(t('settings.advanced.autoExpand.desc'))
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableSceneTitleAutoExpand ?? true)
            .onChange(async (value) => {
                plugin.settings.enableSceneTitleAutoExpand = value;
                await plugin.saveSettings();
            }));

    // 1b. Timeline readability scale
    new Settings(containerEl)
        .setName(t('settings.advanced.readability.name'))
        .setDesc(t('settings.advanced.readability.desc'))
        .addDropdown(drop => {
            drop.addOption('normal', t('settings.advanced.readability.normal'));
            drop.addOption('large', t('settings.advanced.readability.large'));
            drop.setValue(plugin.settings.readabilityScale ?? 'normal');
            drop.onChange(async (value) => {
                plugin.settings.readabilityScale = value as any;
                await plugin.saveSettings();
                clearFontMetricsCaches(); // Clear cached measurements for new scale
                plugin.refreshTimelineIfNeeded(null);
            });
            drop.selectEl.style.setProperty('width', 'fit-content', 'important');
        });

    // 2. Metadata refresh debounce
    new Settings(containerEl)
        .setName(t('settings.advanced.debounce.name'))
        .setDesc(t('settings.advanced.debounce.desc'))
        .addText(text => {
            const current = String(plugin.settings.metadataRefreshDebounceMs ?? 10000);
            text.setPlaceholder(t('settings.advanced.debounce.placeholder'))
                .setValue(current)
                .onChange(async (value) => {
                    const n = Number(value.trim());
                    if (!Number.isFinite(n) || n < 0) {
                        new Notice(t('settings.advanced.debounce.error'));
                        text.setValue(String(plugin.settings.metadataRefreshDebounceMs ?? 10000));
                        return;
                    }
                    plugin.settings.metadataRefreshDebounceMs = n;
                    await plugin.saveSettings();
                });
        });

    // 3. Reset subplot color precedence
    new Settings(containerEl)
        .setName(t('settings.advanced.resetSubplotColors.name'))
        .setDesc(t('settings.advanced.resetSubplotColors.desc'))
        .addButton(button => button
            .setButtonText(t('settings.advanced.resetSubplotColors.button'))
            .setWarning()
            .onClick(async () => {
                const count = Object.keys(plugin.settings.dominantSubplots || {}).length;
                plugin.settings.dominantSubplots = {};
                await plugin.saveSettings();
                
                // Refresh timeline using debounced method
                plugin.refreshTimelineIfNeeded(null);
                
                if (count > 0) {
                    new Notice(t('settings.advanced.resetSubplotColors.clearedNotice', { count: String(count) }));
                } else {
                    new Notice(t('settings.advanced.resetSubplotColors.nothingToReset'));
                }
            }));

    // 4. Custom Metadata Mapping (Toggle + UI)
    const mappingContainer = containerEl.createDiv();
    const mappingListContainer = containerEl.createDiv({ cls: 'rt-mapping-list' });

    // Toggle for Metadata Mapping
    new Settings(mappingContainer)
        .setName('Enable custom metadata mapping')
        .setDesc('Map your custom frontmatter keys to system keys. Useful for legacy data or non-standard naming conventions.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableCustomMetadataMapping ?? false)
            .onChange(async (value) => {
                plugin.settings.enableCustomMetadataMapping = value;
                await plugin.saveSettings();
                renderMappings(); // Refresh visibility
            }));

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
                        // We defer saving until blur to avoid partial state, but TextComponent doesn't have onBlur easily in chaining.
                        // Actually onChange fires on every keystroke. 
                        // It's better to use explicit save button or handle rename carefully.
                        // For simplicity in this UI pattern, we often delete/add for rename.
                        // But let's try to support rename.
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

    // 5. Scene ordering by When date (DISABLED/GRAYED OUT)
    const sortSetting = new Settings(containerEl)
        .setName(t('settings.advanced.sceneOrdering.name'))
        .setDesc(t('settings.advanced.sceneOrdering.desc'))
        .addToggle(toggle => toggle
            .setValue(false)
            .setDisabled(true) // Make toggle inoperative
            .onChange(async () => {
                // No-op - disabled
            }));
    
    // Gray out the disabled setting
    sortSetting.settingEl.style.opacity = '0.5';
    sortSetting.settingEl.style.cursor = 'not-allowed';
}
