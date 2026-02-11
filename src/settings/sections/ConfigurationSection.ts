import { App, Setting as Settings, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { clearFontMetricsCaches } from '../../renderer/utils/FontMetricsCache';
import { t } from '../../i18n';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { ERT_CLASSES } from '../../ui/classes';
import { IMPACT_FULL, IMPACT_DOMINANT_SUBPLOT } from '../SettingImpact';

export function renderConfigurationSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; }): void {
    const { app, plugin, containerEl } = params;
    containerEl.classList.add(ERT_CLASSES.STACK);

    const configurationHeading = new Settings(containerEl)
        .setName(t('settings.configuration.heading'))
        .setHeading();
    addHeadingIcon(configurationHeading, 'pyramid');
    addWikiLink(configurationHeading, 'Settings#configuration');
    applyErtHeaderLayout(configurationHeading);

    const stackEl = containerEl.createDiv({ cls: ERT_CLASSES.STACK });

    // 1. Synopsis hover max lines
    new Settings(stackEl)
        .setName(t('settings.configuration.synopsisMaxLines.name'))
        .setDesc(t('settings.configuration.synopsisMaxLines.desc'))
        .addText(text => {
            const current = String(plugin.settings.synopsisHoverMaxLines ?? 5);
            text.setPlaceholder(t('settings.configuration.synopsisMaxLines.placeholder'));
            text.setValue(current);
            text.inputEl.addClass('ert-input--sm');

            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });

            const handleBlur = async () => {
                const n = Number(text.getValue().trim());
                if (!Number.isFinite(n) || n < 1) {
                    new Notice(t('settings.configuration.synopsisMaxLines.error'));
                    text.setValue(String(plugin.settings.synopsisHoverMaxLines ?? 5));
                    return;
                }
                plugin.settings.synopsisHoverMaxLines = n;
                await plugin.saveSettings();
                plugin.onSettingChanged(IMPACT_FULL); // Tier 3: synopsis line count baked into SVG at render time
            };

            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
        });

    // 2. Auto-expand clipped scene titles
    new Settings(stackEl)
        .setName(t('settings.configuration.autoExpand.name'))
        .setDesc(t('settings.configuration.autoExpand.desc'))
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableSceneTitleAutoExpand ?? true)
            .onChange(async (value) => {
                plugin.settings.enableSceneTitleAutoExpand = value;
                await plugin.saveSettings();
            }));

    // 1b. Timeline readability scale
    new Settings(stackEl)
        .setName(t('settings.configuration.readability.name'))
        .setDesc(t('settings.configuration.readability.desc'))
        .addDropdown(drop => {
            drop.addOption('normal', t('settings.configuration.readability.normal'));
            drop.addOption('large', t('settings.configuration.readability.large'));
            drop.setValue(plugin.settings.readabilityScale ?? 'normal');
            drop.onChange(async (value) => {
                plugin.settings.readabilityScale = value as any;
                await plugin.saveSettings();
                clearFontMetricsCaches(); // Clear cached measurements for new scale
                plugin.onSettingChanged(IMPACT_FULL); // Tier 3: font sizes/spacing change across entire timeline
            });
            drop.selectEl.addClass('ert-setting-dropdown');
        });

    // 2. Metadata refresh debounce
    new Settings(stackEl)
        .setName(t('settings.configuration.debounce.name'))
        .setDesc(t('settings.configuration.debounce.desc'))
        .addText(text => {
            const current = String(plugin.settings.metadataRefreshDebounceMs ?? 10000);
            text.setPlaceholder(t('settings.configuration.debounce.placeholder'));
            text.setValue(current);
            text.inputEl.addClass('ert-input--sm');

            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });

            const handleBlur = async () => {
                const n = Number(text.getValue().trim());
                if (!Number.isFinite(n) || n < 0) {
                    new Notice(t('settings.configuration.debounce.error'));
                    text.setValue(String(plugin.settings.metadataRefreshDebounceMs ?? 10000));
                    return;
                }
                plugin.settings.metadataRefreshDebounceMs = n;
                await plugin.saveSettings();
            };

            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
        });

    // 3. Reset subplot color precedence
    new Settings(stackEl)
        .setName(t('settings.configuration.resetSubplotColors.name'))
        .setDesc(t('settings.configuration.resetSubplotColors.desc'))
        .addButton(button => button
            .setButtonText(t('settings.configuration.resetSubplotColors.button'))
            .setWarning()
            .onClick(async () => {
                const count = Object.keys(plugin.settings.dominantSubplots || {}).length;
                plugin.settings.dominantSubplots = {};
                await plugin.saveSettings();

                // Tier 2: selective DOM update for scene colors only
                plugin.onSettingChanged(IMPACT_DOMINANT_SUBPLOT);

                if (count > 0) {
                    new Notice(t('settings.configuration.resetSubplotColors.clearedNotice', { count: String(count) }));
                } else {
                    new Notice(t('settings.configuration.resetSubplotColors.nothingToReset'));
                }
            }));

}
