import { App, Setting as Settings, Notice, DropdownComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { TimelineItem } from '../../types';
import { parseDurationDetail, formatDurationSelectionLabel, calculateAutoDiscontinuityThreshold } from '../../utils/date';

interface DurationCapOption {
    key: string;
    label: string;
    count: number;
    ms: number;
}

async function collectDurationCapOptions(plugin: RadialTimelinePlugin): Promise<DurationCapOption[]> {
    let scenes: TimelineItem[] | undefined = plugin.lastSceneData;
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

export function renderChronologueSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; }): void {
    const { app, plugin, containerEl } = params;

    new Settings(containerEl)
        .setName('Chronologue mode settings')
        .setHeading();

    // 1. Chronologue duration arc cap
    const baseDurationDesc = 'Scenes with durations at or above the selected value fill the entire segment. All other durations below this are proportionally scaled.';

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
            plugin.refreshTimelineIfNeeded(null); // Uses default debounce delay
        });
        // Set fixed width for dropdown (override CSS with important)
        dropdown.selectEl.style.setProperty('width', '250px', 'important');
        dropdown.selectEl.style.setProperty('min-width', '250px', 'important');
        dropdown.selectEl.style.setProperty('max-width', '250px', 'important');
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

    // 2. Discontinuity threshold customization
    
    // Calculate the actual auto threshold based on current scenes
    // Uses single source of truth helper to ensure this matches the renderer's calculation
    const getScenesForThreshold = async (): Promise<TimelineItem[]> => {
        if (Array.isArray(plugin.lastSceneData) && plugin.lastSceneData.length > 0) {
            return plugin.lastSceneData;
        }
        try {
            const fetched = await plugin.getSceneData();
            if (Array.isArray(fetched) && fetched.length > 0) {
                plugin.lastSceneData = fetched;
                return fetched;
            }
            return [];
        } catch (err) {
            console.error('[Settings] Failed to load scenes for discontinuity threshold:', err);
            return [];
        }
    };

    const calculateAutoThreshold = async (): Promise<{ display: string; days: number | null }> => {
        try {
            const scenes = await getScenesForThreshold();
            
            // Use single source of truth helper
            const thresholdMs = calculateAutoDiscontinuityThreshold(scenes);
            
            if (thresholdMs === null) {
                return { display: 'not yet calculated', days: null };
            }
            
            // Convert to appropriate time unit for display
            const minutes = thresholdMs / (60 * 1000);
            const hours = thresholdMs / (60 * 60 * 1000);
            const days = thresholdMs / (24 * 60 * 60 * 1000);
            
            let display: string;
            if (days >= 1) {
                display = `${Math.round(days)} ${Math.round(days) === 1 ? 'day' : 'days'}`;
            } else if (hours >= 1) {
                display = `${Math.round(hours)} ${Math.round(hours) === 1 ? 'hour' : 'hours'}`;
            } else {
                display = `${Math.round(minutes)} ${Math.round(minutes) === 1 ? 'minute' : 'minutes'}`;
            }
            
            return { display, days: Math.round(days * 100) / 100 };
        } catch (err) {
            console.error('[Settings] Error calculating threshold:', err);
            return { display: 'not yet calculated', days: null };
        }
    };

    const discontinuitySetting = new Settings(containerEl)
        .setName('Discontinuity gap threshold');

    // Declare the text component reference first (before updateDescriptionAndPlaceholder uses it)
    let discontinuityText: any; // SAFE: any type used for Obsidian TextComponent reference (library limitation)

    // Calculate threshold dynamically when settings are displayed
    const updateDescriptionAndPlaceholder = async () => {
        const autoThreshold = await calculateAutoThreshold();
        discontinuitySetting.setDesc(`In shift mode, the ∞ symbol marks large time gaps between scenes. By default, this is auto-calculated as 3× the median gap between scenes. Current auto value: ${autoThreshold.display}. You can override this with a custom gap threshold (e.g., "4 days", "1 week", "30 minutes").`);
        if (discontinuityText) {
            const currentValue = plugin.settings.discontinuityThreshold || '';
            discontinuityText.setPlaceholder(`${autoThreshold.display} (auto)`);
            if (!currentValue) {
                discontinuityText.setValue('');
            }
        }
    };

    // Calculate immediately
    void updateDescriptionAndPlaceholder();

    discontinuitySetting.addText(text => {
        discontinuityText = text;
        const currentValue = plugin.settings.discontinuityThreshold || '';
        text.setPlaceholder('Calculating…')
            .setValue(currentValue);
        
        void calculateAutoThreshold().then(autoThreshold => {
            text.setPlaceholder(`${autoThreshold.display} (auto)`);
            if (!currentValue) {
                text.setValue('');
            }
        });
        
        const handleBlur = async () => {
            const trimmed = text.getValue().trim();
            
            // Clear validation state
            text.inputEl.removeClass('rt-setting-input-success');
            text.inputEl.removeClass('rt-setting-input-error');

            if (!trimmed) {
                // Empty = use auto calculation
                plugin.settings.discontinuityThreshold = undefined;
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
                return;
            }

            // Validate the input by trying to parse it
            const parsed = parseDurationDetail(trimmed);
            if (!parsed) {
                text.inputEl.addClass('rt-setting-input-error');
                new Notice('Invalid gap threshold format. Examples: "4 days", "1 week", "2 months"');
                return;
            }

            // Valid input
            plugin.settings.discontinuityThreshold = trimmed;
            text.inputEl.addClass('rt-setting-input-success');
            await plugin.saveSettings();
            plugin.refreshTimelineIfNeeded(null);
            
            // Clear success state after a moment
            window.setTimeout(() => {
                text.inputEl.removeClass('rt-setting-input-success');
            }, 1000);
        };

        plugin.registerDomEvent(text.inputEl, 'blur', () => {
            void handleBlur();
        });
    });

    // Add a reset button
    discontinuitySetting.addExtraButton(button => button
        .setIcon('reset')
        .setTooltip('Reset to auto-calculated threshold')
        .onClick(async () => {
            plugin.settings.discontinuityThreshold = undefined;
            await plugin.saveSettings();
            plugin.refreshTimelineIfNeeded(null);
            if (discontinuityText) {
                discontinuityText.setValue('');
                discontinuityText.inputEl.removeClass('rt-setting-input-error');
                discontinuityText.inputEl.removeClass('rt-setting-input-success');
            }
            new Notice('Discontinuity threshold reset to auto-calculated value');
        }));
}
