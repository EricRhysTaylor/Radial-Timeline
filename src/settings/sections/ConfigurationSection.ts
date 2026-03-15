import { App, Setting as Settings, Notice, normalizePath } from 'obsidian';
import type { TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { clearFontMetricsCaches } from '../../renderer/utils/FontMetricsCache';
import { t } from '../../i18n';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { ERT_CLASSES } from '../../ui/classes';
import { IMPACT_FULL, IMPACT_DOMINANT_SUBPLOT } from '../SettingImpact';
import { DEFAULT_SETTINGS } from '../defaults';
import { resolveAiLogFolder, countAiLogFiles } from '../../ai/log';
import { renderMetadataSection } from './MetadataSection';

export function renderConfigurationSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; attachFolderSuggest?: (text: TextComponent) => void; }): void {
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

    // Logs
    const logsContainer = configurationBody.createDiv({ cls: 'ert-config-group' });
    logsContainer.createDiv({ cls: 'ert-config-group-title', text: 'Logs' });

    const logFolderSetting = createDenseRow(logsContainer, {
        title: t('settings.configuration.aiOutputFolder.name'),
        description: t('settings.configuration.aiOutputFolder.desc'),
        control: (setting) => {
            setting.addText(text => {
                const defaultPath = DEFAULT_SETTINGS.aiOutputFolder || 'Radial Timeline/Logs';
                const fallbackFolder = plugin.settings.aiOutputFolder?.trim() || defaultPath;
                const illegalChars = /[<>:"|?*]/;

                text.setPlaceholder(t('settings.configuration.aiOutputFolder.placeholder'))
                    .setValue(fallbackFolder);
                text.inputEl.addClass('ert-input--full');

                if (params.attachFolderSuggest) {
                    params.attachFolderSuggest(text);
                }

                const inputEl = text.inputEl;

                const flashClass = (cls: string) => {
                    inputEl.addClass(cls);
                    window.setTimeout(() => inputEl.removeClass(cls), cls === 'ert-setting-input-success' ? 1000 : 2000);
                };

                const validatePath = async () => {
                    inputEl.removeClass('ert-setting-input-success');
                    inputEl.removeClass('ert-setting-input-error');

                    const rawValue = text.getValue();
                    const trimmed = rawValue.trim() || fallbackFolder;

                    if (illegalChars.test(trimmed)) {
                        flashClass('ert-setting-input-error');
                        new Notice('Folder path cannot contain the characters < > : " | ? *');
                        return;
                    }

                    const normalized = normalizePath(trimmed);

                    try { await plugin.app.vault.createFolder(normalized); } catch { /* folder may already exist */ }

                    const isValid = await plugin.validateAndRememberPath(normalized);
                    if (!isValid) {
                        flashClass('ert-setting-input-error');
                        return;
                    }

                    plugin.settings.aiOutputFolder = normalized;
                    await plugin.saveSettings();
                    flashClass('ert-setting-input-success');
                };

                text.onChange(() => {
                    inputEl.removeClass('ert-setting-input-success');
                    inputEl.removeClass('ert-setting-input-error');
                });

                plugin.registerDomEvent(text.inputEl, 'blur', () => { void validatePath(); });

                setting.addExtraButton(button => {
                    button.setIcon('rotate-ccw');
                    button.setTooltip(`Reset to ${defaultPath}`);
                    button.onClick(async () => {
                        text.setValue(defaultPath);
                        plugin.settings.aiOutputFolder = normalizePath(defaultPath);
                        await plugin.saveSettings();
                        flashClass('ert-setting-input-success');
                    });
                });
            });
        }
    });
    logFolderSetting.settingEl.addClass('ert-setting-full-width-input');

    const outputFolder = resolveAiLogFolder();
    const formatLogCount = (fileCount: number | null): string => {
        if (fileCount === null) return 'Counting log files...';
        return fileCount === 0
            ? 'No log files yet'
            : fileCount === 1
                ? '1 log file'
                : `${fileCount} log files`;
    };
    const getLoggingDesc = (fileCount: number | null): string => {
        const countText = formatLogCount(fileCount);
        return `Summary logs (run metadata, token usage, results) are always written for Inquiry, Pulse, and Gossamer. When enabled, also writes Content logs containing full prompts, materials, and API responses\u2014useful for debugging and understanding AI behavior. Recommended while learning the system. Logs are stored in \u201c${outputFolder}\u201d (${countText}).`;
    };

    const apiLoggingSetting = createDenseRow(logsContainer, {
        title: 'Enable AI content logs',
        description: getLoggingDesc(null),
        control: (setting) => {
            setting.addToggle(toggle => toggle
                .setValue(plugin.settings.logApiInteractions)
                .onChange(async (value) => {
                    plugin.settings.logApiInteractions = value;
                    await plugin.saveSettings();
                }));
        }
    });

    const scheduleLogCount = () => {
        const runCount = () => {
            const fileCount = countAiLogFiles(plugin);
            apiLoggingSetting.setDesc(getLoggingDesc(fileCount));
        };
        const requestIdleCallback = (window as Window & {
            requestIdleCallback?: (cb: () => void) => void;
        }).requestIdleCallback;
        if (requestIdleCallback) {
            requestIdleCallback(runCount);
        } else {
            window.setTimeout(runCount, 0);
        }
    };
    scheduleLogCount();

}
