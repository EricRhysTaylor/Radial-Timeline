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
            const current = String(plugin.settings.metadataRefreshDebounceMs ?? 5000);
            text.setPlaceholder('e.g., 5000')
                .setValue(current)
                .onChange(async (value) => {
                    const n = Number(value.trim());
                    if (!Number.isFinite(n) || n < 0) {
                        new Notice('Please enter a non-negative number.');
                        text.setValue(String(plugin.settings.metadataRefreshDebounceMs ?? 5000));
                        return;
                    }
                    plugin.settings.metadataRefreshDebounceMs = n;
                    await plugin.saveSettings();
                });
        });

    // Visual: Enable estimated date arc/label
    new Settings(containerEl)
        .setName('Show estimated completion arc/label')
        .setDesc('Toggle the estimation arc and date label near the progress ring.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showEstimate ?? true)
            .onChange(async (value) => {
                plugin.settings.showEstimate = value;
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
            }));

    // Experimental: New rendering system (Stage 3)
    new Settings(containerEl)
        .setName('🧪 Use new rendering system (Stage 3)')
        .setDesc('EXPERIMENTAL: Enable mode-definition-based rendering. Uses new architecture for rendering decisions. Toggle and refresh timeline to test. Report any visual differences.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.useNewRenderingSystem ?? false)
            .onChange(async (value) => {
                plugin.settings.useNewRenderingSystem = value;
                await plugin.saveSettings();
                
                // Show notice about what to test
                if (value) {
                    new Notice('New rendering system enabled. Testing Stage 3:\n1. Switch between All Scenes and Main Plot modes\n2. Verify rendering looks identical to before\n3. Check beats visibility\n4. Check subplot rings', 8000);
                } else {
                    new Notice('Switched back to legacy rendering system.');
                }
                
                // Refresh timeline to apply changes
                plugin.refreshTimelineIfNeeded(null);
            }));

    // Experimental: New interaction system (Stage 4)
    new Settings(containerEl)
        .setName('🧪 Use new interaction system (Stage 4)')
        .setDesc('EXPERIMENTAL: Enable ModeInteractionController for event handling. Uses new architecture for hover/click interactions. Toggle and test interactions. Report any behavioral differences.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.useNewInteractionSystem ?? false)
            .onChange(async (value) => {
                plugin.settings.useNewInteractionSystem = value;
                await plugin.saveSettings();
                
                // Show notice about what to test
                if (value) {
                    new Notice('New interaction system enabled. Testing Stage 4:\n1. Hover on scenes → tooltips\n2. Click on scenes → opens files\n3. Test in all modes (All Scenes, Main Plot, Gossamer)\n4. Verify interactions work identically', 8000);
                } else {
                    new Notice('Switched back to legacy interaction system.');
                }
                
                // Refresh timeline to apply changes
                plugin.refreshTimelineIfNeeded(null);
            }));
}


