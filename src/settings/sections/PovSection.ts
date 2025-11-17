import { Setting as ObsidianSetting } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { GlobalPovMode } from '../../types/settings';

const POV_MODE_OPTIONS: Record<GlobalPovMode, string> = {
    off: 'Off — use the first listed character (legacy)',
    '1PV': '1PV — First-person voice (attach to POV character)',
    '2PV': '2PV — Second-person voice',
    '3PoL': '3PoL — Third-person limited (attach to POV character)',
    '3PoV': '3PoV — Third-person omniscient (label only)'
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
        .setDesc('Optional. Leave Off to keep marking the first listed character. Pick a mode to apply whenever a scene omits the POV frontmatter (scene-level POV still wins).')
        .addDropdown(dropdown => {
            (Object.keys(POV_MODE_OPTIONS) as GlobalPovMode[]).forEach((key) => {
                dropdown.addOption(key, POV_MODE_OPTIONS[key]);
            });
            dropdown.setValue(currentMode);
            dropdown.onChange(async (value) => {
                const next = (value as GlobalPovMode) || 'off';
                plugin.settings.globalPovMode = next;
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
            });
        });

    new ObsidianSetting(containerEl)
        .setName('Scene-level overrides')
        .setDesc('Add a `POV` field to any scene to override the markers. Examples: `POV: 3PoL: Kara`, `POV: 3PoV`, or YAML lists for multiple characters. Use `POV: none` to suppress the marker.');

    new ObsidianSetting(containerEl)
        .setName('Multiple POV markers')
        .setDesc('When a scene lists multiple `POV` entries (e.g., YAML array), each matching character receives its own superscript. Omniscient entries display as a leading label before the character list.');
}
