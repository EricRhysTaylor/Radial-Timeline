import { App, Setting as Settings, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';

export function renderAdvancedSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; }): void {
    const { app, plugin, containerEl } = params;

    new Settings(containerEl)
        .setName('Advanced')
        .setHeading();

    // Performance: Debounce timeline refresh on metadata changes
    new Settings(containerEl)
        .setName('Metadata refresh debounce (ms)')
        .setDesc('Delay before refreshing the timeline after YAML frontmatter changes. Increase if your vault is large and updates feel too frequent.')
        .addText(text => {
            const current = String(plugin.settings.metadataRefreshDebounceMs ?? 10000);
            text.setPlaceholder('e.g., 10000')
                .setValue(current)
                .onChange(async (value) => {
                    const n = Number(value.trim());
                    if (!Number.isFinite(n) || n < 0) {
                        new Notice('Please enter a non-negative number.');
                        text.setValue(String(plugin.settings.metadataRefreshDebounceMs ?? 10000));
                        return;
                    }
                    plugin.settings.metadataRefreshDebounceMs = n;
                    await plugin.saveSettings();
                });
        });

    // Visual: Enable estimated date arc/label
    new Settings(containerEl)
        .setName('Show estimated completion date')
        .setDesc('Toggle the estimation date label near the progress ring.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showEstimate ?? true)
            .onChange(async (value) => {
                plugin.settings.showEstimate = value;
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
            }));

    // Interaction: Auto-expand clipped scene titles on hover
    new Settings(containerEl)
        .setName('Auto-expand clipped scene titles')
        .setDesc('When hovering over a scene, automatically expand it if the title text is clipped. Disable this if you prefer to quickly slide through scenes and read titles from the synopsis instead.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableSceneTitleAutoExpand ?? true)
            .onChange(async (value) => {
                plugin.settings.enableSceneTitleAutoExpand = value;
                await plugin.saveSettings();
            }));

    // Sorting: Sort by When date vs manuscript order
    const sortSetting = new Settings(containerEl)
        .setName('Scene ordering')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.sortByWhenDate ?? false)
            .onChange(async (value) => {
                plugin.settings.sortByWhenDate = value;
                await plugin.saveSettings();
                
                // Update the description dynamically
                updateSortDescription(sortSetting, value);
                
                plugin.refreshTimelineIfNeeded(null);
            }));
    
    // Set initial description
    updateSortDescription(sortSetting, plugin.settings.sortByWhenDate ?? false);
    
    // Helper function to update description based on toggle state
    function updateSortDescription(setting: Settings, sortByWhen: boolean) {
        if (sortByWhen) {
            setting.setDesc('Current: Chronological by When date (YYYY-MM-DD). Scenes sorted by their When field within each Act zone. Requires When field in YAML frontmatter. Applies to All Scenes and Main Plot modes. (Chronologue mode always uses chronological sorting regardless of this setting.)');
        } else {
            setting.setDesc('Current: Manuscript order by filename prefix. Scenes sorted by numeric filename prefix (e.g., "01 Scene.md") within each Act zone. Requires numbered prefixes for proper ordering. Applies to All Scenes and Main Plot modes. (Chronologue mode always uses chronological sorting regardless of this setting.)');
        }
    }

    // New systems are now the default
    // The plugin now uses:
    // - Mode-definition-based rendering
    // - ModeInteractionController for event handling
    // Legacy code paths remain in codebase but are inactive
}


