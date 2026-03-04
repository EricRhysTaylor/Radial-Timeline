import { App, Setting as Settings, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { clearFontMetricsCaches } from '../../renderer/utils/FontMetricsCache';
import { t } from '../../i18n';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { ERT_CLASSES } from '../../ui/classes';
import { IMPACT_FULL, IMPACT_DOMINANT_SUBPLOT } from '../SettingImpact';
import { getSynopsisGenerationWordLimit, getSynopsisHoverLineLimit } from '../../utils/synopsisLimits';
import { renderMetadataSection } from './MetadataSection';

export function renderConfigurationSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; }): void {
    const { app, plugin, containerEl } = params;
    containerEl.classList.add(ERT_CLASSES.STACK);

    const configurationHeading = new Settings(containerEl)
        .setName(t('settings.configuration.heading'))
        .setHeading();
    addHeadingIcon(configurationHeading, 'pyramid');
    addWikiLink(configurationHeading, 'Settings#configuration');
    applyErtHeaderLayout(configurationHeading);

    const configurationBody = containerEl.createDiv({ cls: ERT_CLASSES.STACK });

    const createDenseRow = (
        parent: HTMLElement,
        options: {
            title: string;
            description: string;
            control: (setting: Settings) => void;
        }
    ): Settings => {
        const row = new Settings(parent)
            .setName(options.title)
            .setDesc(options.description);
        row.settingEl.addClass('ert-settingRow');
        options.control(row);
        return row;
    };

    const schemaContainer = configurationBody.createDiv({ cls: 'ert-config-group' });
    schemaContainer.createDiv({ cls: 'ert-config-group-title', text: 'Schema & Manuscript' });

    const displayContainer = configurationBody.createDiv({ cls: 'ert-config-group' });
    displayContainer.createDiv({ cls: 'ert-config-group-title', text: 'Timeline Display' });

    const performanceContainer = configurationBody.createDiv({ cls: 'ert-config-group' });
    performanceContainer.createDiv({ cls: 'ert-config-group-title', text: 'Performance' });

    // Schema & Manuscript
    const remapContainer = schemaContainer.createDiv({ cls: ERT_CLASSES.STACK });
    renderMetadataSection({ app, plugin, containerEl: remapContainer });

    createDenseRow(schemaContainer, {
        title: t('settings.configuration.synopsisMaxLines.name'),
        description: t('settings.configuration.synopsisMaxLines.desc'),
        control: (setting) => {
            setting.addText(text => {
                const current = String(getSynopsisGenerationWordLimit(plugin.settings));
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
                    if (!Number.isFinite(n) || n < 10 || n > 300) {
                        new Notice(t('settings.configuration.synopsisMaxLines.error'));
                        text.setValue(String(getSynopsisGenerationWordLimit(plugin.settings)));
                        return;
                    }
                    plugin.settings.synopsisGenerationMaxWords = Math.round(n);
                    // Keep legacy line-based setting synchronized for compatibility paths.
                    plugin.settings.synopsisHoverMaxLines = getSynopsisHoverLineLimit(plugin.settings);
                    await plugin.saveSettings();
                    plugin.onSettingChanged(IMPACT_FULL); // Tier 3: synopsis content/line limits affect hover SVG layout
                };

                plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
            });
        }
    });

    createDenseRow(schemaContainer, {
        title: t('settings.configuration.rippleRename.name'),
        description: t('settings.configuration.rippleRename.desc'),
        control: (setting) => {
            setting.addToggle(toggle => toggle
                .setValue(plugin.settings.enableManuscriptRippleRename ?? false)
                .onChange(async (value) => {
                    plugin.settings.enableManuscriptRippleRename = value;
                    await plugin.saveSettings();
                }));
        }
    });

    createDenseRow(schemaContainer, {
        title: t('settings.configuration.resetSubplotColors.name'),
        description: t('settings.configuration.resetSubplotColors.desc'),
        control: (setting) => {
            setting.addButton(button => button
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
    });

    // Timeline Display
    createDenseRow(displayContainer, {
        title: 'Pulse context',
        description: 'Include previous and next scenes in triplet analysis.',
        control: (setting) => {
            setting.addToggle(toggle => toggle
                .setValue(plugin.settings.showFullTripletAnalysis ?? true)
                .onChange(async (value) => {
                    plugin.settings.showFullTripletAnalysis = value;
                    await plugin.saveSettings();
                }));
        }
    });

    createDenseRow(displayContainer, {
        title: t('settings.configuration.autoExpand.name'),
        description: t('settings.configuration.autoExpand.desc'),
        control: (setting) => {
            setting.addToggle(toggle => toggle
                .setValue(plugin.settings.enableSceneTitleAutoExpand ?? true)
                .onChange(async (value) => {
                    plugin.settings.enableSceneTitleAutoExpand = value;
                    await plugin.saveSettings();
                }));
        }
    });

    createDenseRow(displayContainer, {
        title: t('settings.configuration.readability.name'),
        description: t('settings.configuration.readability.desc'),
        control: (setting) => {
            setting.addDropdown(drop => {
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
        }
    });

    // Performance
    createDenseRow(performanceContainer, {
        title: t('settings.configuration.debounce.name'),
        description: t('settings.configuration.debounce.desc'),
        control: (setting) => {
            setting.addText(text => {
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
        }
    });

}
