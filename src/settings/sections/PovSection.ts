import { Setting as ObsidianSetting } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { GlobalPovMode } from '../../types/settings';

const POV_MODE_OPTIONS: Record<GlobalPovMode, string> = {
    off: 'Off — legacy (first listed character, “pov” superscript)',
    first: 'First-person voice (¹ marker on characters)',
    second: 'Second-person voice (You² label)',
    third: 'Third-person limited (³ marker on characters)',
    omni: 'Omni narrator (Omni³ label)',
    objective: 'Objective — camera-eye narrator (Narrator° label)'
};

export function renderPovSection(params: {
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}): void {
    const { plugin, containerEl } = params;

    new ObsidianSetting(containerEl)
        .setName('Point of view')
        .setHeading();

    const currentMode = plugin.settings.globalPovMode ?? 'off';
    new ObsidianSetting(containerEl)
        .setName('Global POV override')
        .setDesc('Optional. Leave Off for legacy behavior. Choose a mode to apply whenever a scene omits the POV keyword (per-scene values like "pov: first" always win).')
        .addDropdown(dropdown => {
            (Object.keys(POV_MODE_OPTIONS) as GlobalPovMode[]).forEach((key) => {
                dropdown.addOption(key, POV_MODE_OPTIONS[key]);
            });
            dropdown.setValue(currentMode);
            dropdown.onChange(async (value) => {
                const next = (value as GlobalPovMode) || 'off';
                plugin.settings.globalPovMode = next;
                await plugin.saveSettings();
                const debounce = plugin.settings.metadataRefreshDebounceMs ?? 10000;
                plugin.refreshTimelineIfNeeded(null, debounce);
            });
        });

    new ObsidianSetting(containerEl)
        .setName('Scene-level overrides & multiple POV markers')
        .setDesc('Set `Pov:` in YAML to one keyword: `first`, `second`, `third`, `omni`, `objective`, or a highlight count such as `two`, `four`, `count`, or `all`. Any numeric value is also accepted, and highlights never exceed the number of listed characters.');
}
