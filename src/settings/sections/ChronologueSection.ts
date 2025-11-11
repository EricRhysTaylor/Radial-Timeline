import { App, Setting as Settings, Notice, DropdownComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { TimelineItem } from '../../main';
import { parseDurationDetail, formatDurationSelectionLabel } from '../../utils/date';

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
        dropdown.selectEl.style.setProperty('width', '160px', 'important');
        dropdown.selectEl.style.setProperty('min-width', '160px', 'important');
        dropdown.selectEl.style.setProperty('max-width', '160px', 'important');
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
    const calculateAutoThreshold = (): { display: string; days: number | null } => {
        try {
            const scenes = plugin.lastSceneData || [];
            if (scenes.length < 3) return { display: 'not yet calculated', days: null };
            
            // Get scenes with When dates
            const scenesWithDates = scenes.filter(s => s.when instanceof Date);
            if (scenesWithDates.length < 3) return { display: 'not yet calculated', days: null };
            
            // Sort chronologically
            const sorted = [...scenesWithDates].sort((a, b) => 
                (a.when as Date).getTime() - (b.when as Date).getTime()
            );
            
            // Calculate gaps
            const gaps: number[] = [];
            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1].when as Date;
                const curr = sorted[i].when as Date;
                const gap = curr.getTime() - prev.getTime();
                if (gap >= 0) gaps.push(gap);
            }
            
            if (gaps.length === 0) return { display: 'not yet calculated', days: null };
            
            // Calculate median gap
            const sortedGaps = [...gaps].sort((a, b) => a - b);
            const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
            
            // Calculate threshold: 3× median gap
            const threshold = medianGap * 3;
            
            // Convert to days for display
            const days = Math.round(threshold / (24 * 60 * 60 * 1000));
            return { display: `${days} days`, days };
        } catch {
            return { display: 'not yet calculated', days: null };
        }
    };

    const autoThreshold = calculateAutoThreshold();
    
    const discontinuitySetting = new Settings(containerEl)
        .setName('Discontinuity gap threshold')
        .setDesc(`In shift mode, the ∞ symbol marks large time gaps between scenes. By default, this is auto-calculated as 3× the median gap between scenes. Current auto value: ${autoThreshold.display}. You can override this with a custom duration (e.g., "4 days", "1 week").`);

    let discontinuityText: any; // SAFE: any type used for Obsidian TextComponent reference (library limitation)
    discontinuitySetting.addText(text => {
        discontinuityText = text;
        const currentValue = plugin.settings.discontinuityThreshold || '';
        text.setPlaceholder(`${autoThreshold.display} (auto)`)
            .setValue(currentValue);
        
        // Validate on blur (when user clicks out)
        text.inputEl.addEventListener('blur', async () => {
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
                new Notice('Invalid duration format. Examples: "4 days", "1 week", "2 months"');
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

