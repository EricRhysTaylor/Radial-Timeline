import { App, Setting as Settings, Notice, DropdownComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { Scene } from '../../main';
import { parseDurationDetail, formatDurationSelectionLabel } from '../../utils/date';

interface DurationCapOption {
    key: string;
    label: string;
    count: number;
    ms: number;
}

async function collectDurationCapOptions(plugin: RadialTimelinePlugin): Promise<DurationCapOption[]> {
    let scenes: Scene[] | undefined = plugin.lastSceneData;
    if (!Array.isArray(scenes) || scenes.length === 0) {
        try {
            scenes = await plugin.getSceneData();
        } catch {
            return [];
        }
    }

    const dedupeKeys = new Set<string>();
    const optionsMap = new Map<string, { label: string; count: number; ms: number }>();

    (scenes ?? []).forEach(scene => {
        if (scene.itemType === 'Beat' || scene.itemType === 'Plot') return;
        const identifier = scene.path || `${scene.title ?? ''}|${scene.date}`;
        if (!identifier || dedupeKeys.has(identifier)) return;
        dedupeKeys.add(identifier);

        const detail = parseDurationDetail(scene.Duration);
        if (!detail) return;
        const key = `${detail.value}|${detail.unitKey}`;
        const unitLabel = detail.value === 1 ? detail.unitSingular : detail.unitPlural;
        const label = `${detail.valueText} ${unitLabel}`;
        const existing = optionsMap.get(key);
        if (existing) {
            existing.count += 1;
        } else {
            optionsMap.set(key, { label, count: 1, ms: detail.ms });
        }
    });

    return Array.from(optionsMap.entries())
        .map(([key, data]) => ({
            key,
            label: data.label,
            count: data.count,
            ms: data.ms,
        }))
        .sort((a, b) => a.ms - b.ms);
}

export function renderAdvancedSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; }): void {
    const { app, plugin, containerEl } = params;

    new Settings(containerEl)
        .setName('Advanced')
        .setHeading();

    // 1. Chronologue duration arc cap (FIRST)
    const baseDurationDesc = 'In chronologue mode, scenes with duractions at or above the selected value fill the entire scene arc segment. All other durations below this are proportionally scaled. Recommended if you have a lot of scenes with very short arcs. Note: chronologue marks significant timeline gaps as discontinuous (∞) when the gap between scenes exceeds three times the median interval.';

    const durationSetting = new Settings(containerEl)
        .setName('Chronologue duration arc cap')
        .setDesc(baseDurationDesc);

    const savedCapSelection = plugin.settings.chronologueDurationCapSelection ?? 'auto';
    let durationDropdown: DropdownComponent | undefined;

    durationSetting.addDropdown(dropdown => {
        durationDropdown = dropdown;
        dropdown.addOption('auto', 'Longest observed duration (auto)');
        dropdown.setValue(savedCapSelection);
        dropdown.onChange(async (value) => {
            plugin.settings.chronologueDurationCapSelection = value;
            await plugin.saveSettings();
            plugin.refreshTimelineIfNeeded(null);
        });
    });

    collectDurationCapOptions(plugin)
        .then(options => {
            const dropdown = durationDropdown;
            if (!dropdown) return;
            if (options.length === 0) {
                durationSetting.setDesc(`${baseDurationDesc} No scene durations detected yet.`);
            } else {
                options.forEach(opt => {
                    if (!dropdown.selectEl.querySelector(`option[value="${opt.key}"]`)) {
                        dropdown.addOption(opt.key, `${opt.label} (${opt.count})`);
                    }
                });
            }

            if (savedCapSelection !== 'auto' && dropdown.selectEl.querySelector(`option[value="${savedCapSelection}"]`) === null) {
                const fallbackLabel = formatDurationSelectionLabel(savedCapSelection);
                if (fallbackLabel) {
                    dropdown.addOption(savedCapSelection, `${fallbackLabel} (0)`);
                }
            }

            dropdown.setValue(savedCapSelection);
        })
        .catch(() => {
            if (!durationDropdown) return;
            durationSetting.setDesc(`${baseDurationDesc} Unable to load duration data.`);
        });

    // 2. Auto-expand clipped scene titles (SECOND)
    new Settings(containerEl)
        .setName('Auto-expand clipped scene titles')
        .setDesc('When hovering over a scene, automatically expand it if the title text is clipped. Disable this if you prefer to quickly slide through scenes and read titles from the synopsis instead.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableSceneTitleAutoExpand ?? true)
            .onChange(async (value) => {
                plugin.settings.enableSceneTitleAutoExpand = value;
                await plugin.saveSettings();
            }));

    // 3. Show estimated completion date (THIRD)
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

    // 4. Metadata refresh debounce (SECOND TO LAST)
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

    // 5. Scene ordering by When date (LAST - DISABLED/GRAYED OUT)
    const sortSetting = new Settings(containerEl)
        .setName('Scene ordering based on When date')
        .setDesc('Coming soon: Sort scenes chronologically by When date instead of manuscript order. This feature is currently in development and will be available in a future update.')
        .addToggle(toggle => toggle
            .setValue(false)
            .setDisabled(true) // Make toggle inoperative
            .onChange(async () => {
                // No-op - disabled
            }));
    
    // Gray out the disabled setting
    sortSetting.settingEl.style.opacity = '0.5';
    sortSetting.settingEl.style.cursor = 'not-allowed';

    // New systems are now the default
    // The plugin now uses:
    // - Mode-definition-based rendering
    // - ModeInteractionController for event handling
    // Legacy code paths remain in codebase but are inactive
}
