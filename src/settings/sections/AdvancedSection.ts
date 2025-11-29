import { App, Setting as Settings, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { clearFontMetricsCaches } from '../../renderer/utils/FontMetricsCache';
import { t } from '../../i18n';

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

    // 3. Reset subplot color dominance
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

    // 4. Scene ordering by When date (DISABLED/GRAYED OUT)
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
