import { App, Setting as Settings, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';

export function renderAdvancedSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; }): void {
    const { app, plugin, containerEl } = params;

    new Settings(containerEl)
        .setName('Advanced')
        .setHeading();

    // 1. Auto-expand clipped scene titles
    new Settings(containerEl)
        .setName('Auto-expand clipped scene titles')
        .setDesc('When hovering over a scene, automatically expand it if the title text is clipped. Disable this if you prefer to quickly slide through scenes and read titles from the synopsis instead.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableSceneTitleAutoExpand ?? true)
            .onChange(async (value) => {
                plugin.settings.enableSceneTitleAutoExpand = value;
                await plugin.saveSettings();
            }));

    // 2. Metadata refresh debounce
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

    // 3. Scene ordering by When date (DISABLED/GRAYED OUT)
    const sortSetting = new Settings(containerEl)
        .setName('Scene ordering based on When date')
        .setDesc('Coming someday maybe not sure yet: Sort scenes chronologically by When date instead of manuscript order. This feature is currently in development and will be available in a future update.')
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
