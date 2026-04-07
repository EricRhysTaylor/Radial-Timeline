import { App, Setting as Settings, Notice, normalizePath } from 'obsidian';
import type { TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { clearFontMetricsCaches } from '../../renderer/utils/FontMetricsCache';
import { t } from '../../i18n';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import { ERT_CLASSES } from '../../ui/classes';
import { IMPACT_FULL } from '../SettingImpact';
import { DEFAULT_SETTINGS } from '../defaults';
import { countContentLogFiles, resolveContentLogsRoot, resolveLogsRoot } from '../../ai/log';
import { renderMetadataSection } from './MetadataSection';
import {
    buildTimelineChapterResolverItems,
    collapseTimelineChapterMarkersByResolvedBoundary,
    resolveTimelineChapterMarkers
} from '../../utils/timelineChapters';

export function renderConfigurationSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; attachFolderSuggest?: (text: TextComponent) => void; }): void {
    const { app, plugin, containerEl } = params;
    containerEl.classList.add(ERT_CLASSES.STACK);

    const configurationHeading = new Settings(containerEl)
        .setName(t('settings.configuration.heading'))
        .setHeading();
    addHeadingIcon(configurationHeading, 'pyramid');
    addWikiLink(configurationHeading, 'Settings#configuration');
    applyErtHeaderLayout(configurationHeading);

    const configurationBody = containerEl.createDiv({ cls: [ERT_CLASSES.SECTION_BODY, ERT_CLASSES.STACK] });

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

    const createFolderPathRow = (
        parent: HTMLElement,
        options: {
            title: string;
            description: string;
            placeholder: string;
            defaultPath: string;
            currentValue: () => string | undefined;
            saveValue: (normalized: string) => Promise<void>;
        }
    ): Settings => {
        const folderSetting = createDenseRow(parent, {
            title: options.title,
            description: options.description,
            control: (setting) => {
                setting.addText(text => {
                    const fallbackFolder = options.currentValue()?.trim() || options.defaultPath;
                    const illegalChars = /[<>:"|?*]/;

                    text.setPlaceholder(options.placeholder)
                        .setValue(fallbackFolder);
                    text.inputEl.addClass('ert-input--xl');

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

                        await options.saveValue(normalized);
                        flashClass('ert-setting-input-success');
                    };

                    text.onChange(() => {
                        inputEl.removeClass('ert-setting-input-success');
                        inputEl.removeClass('ert-setting-input-error');
                    });

                    plugin.registerDomEvent(text.inputEl, 'blur', () => { void validatePath(); });

                    setting.addExtraButton(button => {
                        button.setIcon('rotate-ccw');
                        button.setTooltip(`Reset to ${options.defaultPath}`);
                        button.onClick(async () => {
                            const normalizedDefault = normalizePath(options.defaultPath);
                            text.setValue(options.defaultPath);
                            await options.saveValue(normalizedDefault);
                            flashClass('ert-setting-input-success');
                        });
                    });
                });
            }
        });
        return folderSetting;
    };

    const displayContainer = configurationBody.createDiv({ cls: 'ert-config-group' });
    displayContainer.createDiv({ cls: 'ert-config-group-title', text: 'Timeline Display' });

    const schemaContainer = configurationBody.createDiv({ cls: 'ert-config-group' });
    schemaContainer.createDiv({ cls: 'ert-config-group-title', text: 'Schema & Manuscript' });

    const logsContainer = configurationBody.createDiv({ cls: 'ert-config-group' });
    logsContainer.createDiv({ cls: 'ert-config-group-title', text: 'Logs' });

    // Logs
    createDenseRow(logsContainer, {
        title: t('settings.configuration.aiOutputFolder.name'),
        description: t('settings.configuration.aiOutputFolder.desc'),
        control: () => {}
    });

    createDenseRow(logsContainer, {
        title: 'Content logs',
        description: `Full prompt and payload logs are stored in "${resolveContentLogsRoot()}".`,
        control: () => {}
    });

    createFolderPathRow(logsContainer, {
        title: t('settings.configuration.manuscriptOutputFolder.name'),
        description: t('settings.configuration.manuscriptOutputFolder.desc'),
        placeholder: t('settings.configuration.manuscriptOutputFolder.placeholder'),
        defaultPath: DEFAULT_SETTINGS.manuscriptOutputFolder || 'Radial Timeline/Export',
        currentValue: () => plugin.settings.manuscriptOutputFolder,
        saveValue: async (normalized) => {
            plugin.settings.manuscriptOutputFolder = normalized;
            plugin.settings.outlineOutputFolder = normalized;
            await plugin.saveSettings();
        }
    });

    const outputFolder = resolveLogsRoot();
    const contentFolder = resolveContentLogsRoot();
    const formatLogCount = (fileCount: number | null): string => {
        if (fileCount === null) return 'Counting content logs...';
        return fileCount === 0
            ? 'No content logs yet'
            : fileCount === 1
                ? '1 content log'
                : `${fileCount} content logs`;
    };
    const getLoggingDesc = (fileCount: number | null): string => {
        const countText = formatLogCount(fileCount);
        return `Concise logs, archives, snapshots, and move history are always written to "${outputFolder}". When enabled, content logs containing full prompts, materials, and API responses are written to "${contentFolder}" (${countText}).`;
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
            const fileCount = countContentLogFiles(plugin);
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

    // Timeline Display
    const buildChapterMarkerDescription = (status?: string): string => {
        const base = t('settings.configuration.chapterMarkers.desc');
        return status ? `${base} ${status}` : base;
    };

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

    const chapterMarkerSetting = createDenseRow(displayContainer, {
        title: t('settings.configuration.chapterMarkers.name'),
        description: buildChapterMarkerDescription(),
        control: (setting) => {
            setting.addToggle(toggle => toggle
                .setValue(plugin.settings.showChapterMarkers ?? false)
                .onChange(async (value) => {
                    plugin.settings.showChapterMarkers = value;
                    await plugin.saveSettings();
                    plugin.onSettingChanged(IMPACT_FULL);
                }));
        }
    });

    createDenseRow(displayContainer, {
        title: 'Recent drag move overlay in narrative mode',
        description: 'Shows the last committed scene and beat drag moves in narrative timeline.',
        control: (setting) => {
            setting.addToggle(toggle => toggle
                .setValue(plugin.settings.showRecentMovesOverlay ?? true)
                .onChange(async (value) => {
                    plugin.settings.showRecentMovesOverlay = value;
                    await plugin.saveSettings();
                    plugin.onSettingChanged(IMPACT_FULL);
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

    const refreshChapterMarkerStatus = async () => {
        try {
            const chapterResolverItems = buildTimelineChapterResolverItems(await plugin.getSceneData());
            const chapterCount = collapseTimelineChapterMarkersByResolvedBoundary(
                resolveTimelineChapterMarkers(chapterResolverItems)
            ).length;
            chapterMarkerSetting.setDesc(buildChapterMarkerDescription(
                chapterCount > 0
                    ? `${chapterCount} active chapter marker${chapterCount === 1 ? '' : 's'} in the current active book.`
                    : 'No active chapter markers.'
            ));
        } catch {
            chapterMarkerSetting.setDesc(buildChapterMarkerDescription('No active chapter markers.'));
        }
    };
    void refreshChapterMarkerStatus();

}
