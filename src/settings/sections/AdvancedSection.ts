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

    // New systems are now the default
    // The plugin now uses:
    // - Mode-definition-based rendering
    // - ModeInteractionController for event handling
    // Legacy code paths remain in codebase but are inactive
}


