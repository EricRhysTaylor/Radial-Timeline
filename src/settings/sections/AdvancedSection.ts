import { App, Setting as Settings, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { clearFontMetricsCaches } from '../../renderer/utils/FontMetricsCache';
import { t } from '../../i18n';
import { addHeadingIcon, addWikiLink } from '../wikiLink';

export function renderAdvancedSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; }): void {
    const { app, plugin, containerEl } = params;

    const advancedHeading = new Settings(containerEl)
        .setName(t('settings.advanced.heading'))
        .setHeading();
    addHeadingIcon(advancedHeading, 'pyramid');
    addWikiLink(advancedHeading, 'Settings#advanced');

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
            drop.selectEl.addClass('ert-setting-dropdown');
        });

    // 2. Metadata refresh debounce
    new Settings(containerEl)
        .setName(t('settings.advanced.debounce.name'))
        .setDesc(t('settings.advanced.debounce.desc'))
        .addText(text => {
            const current = String(plugin.settings.metadataRefreshDebounceMs ?? 10000);
            text.setPlaceholder(t('settings.advanced.debounce.placeholder'));
            text.setValue(current);
            text.inputEl.addClass('rt-input-sm');

            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });

            const handleBlur = async () => {
                const n = Number(text.getValue().trim());
                if (!Number.isFinite(n) || n < 0) {
                    new Notice(t('settings.advanced.debounce.error'));
                    text.setValue(String(plugin.settings.metadataRefreshDebounceMs ?? 10000));
                    return;
                }
                plugin.settings.metadataRefreshDebounceMs = n;
                await plugin.saveSettings();
            };

            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
        });

    // 3. Reset subplot color precedence
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

}
