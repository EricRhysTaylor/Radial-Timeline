import type { App, TextComponent } from 'obsidian';
import { Setting as ObsidianSetting, normalizePath, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { t } from '../../i18n';
import { DEFAULT_SETTINGS } from '../defaults';
import { ERT_CLASSES } from '../../ui/classes';

export function renderGeneralSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    attachFolderSuggest: (text: TextComponent) => void;
    containerEl: HTMLElement;
}): void {
    const { app, plugin, attachFolderSuggest, containerEl } = params;

    // --- Source Path with Autocomplete ---
    const sourcePathSetting = new ObsidianSetting(containerEl)
        .setName('Source path')
        .setDesc('Specify the root folder containing your manuscript scene files.');

    let textInput: TextComponent;
    sourcePathSetting.addText(text => {
        textInput = text;
        text
            .setPlaceholder('Example: Book 1')
            .setValue(plugin.settings.sourcePath);
        text.inputEl.addClass('ert-input--xl');

        attachFolderSuggest(text);

        text.onChange(() => {
            text.inputEl.removeClass('ert-setting-input-success');
            text.inputEl.removeClass('ert-setting-input-error');
        });

        // Treat Enter like blur so validation runs once when user confirms
        plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
            if (evt.key === 'Enter') {
                evt.preventDefault();
                text.inputEl.blur();
            }
        });

        const handleBlur = async () => {
            const value = text.getValue();
            const trimmed = value.trim();
            const normalizedValue = trimmed ? normalizePath(trimmed) : '';

            if (trimmed) {
                const isValid = await plugin.validateAndRememberPath(normalizedValue);
                if (isValid) {
                    plugin.settings.sourcePath = normalizedValue;
                    await plugin.saveSettings();
                    text.inputEl.addClass('ert-setting-input-success');
                    window.setTimeout(() => {
                        text.inputEl.removeClass('ert-setting-input-success');
                    }, 1000);
                } else {
                    text.inputEl.addClass('ert-setting-input-error');
                    window.setTimeout(() => {
                        text.inputEl.removeClass('ert-setting-input-error');
                    }, 2000);
                }
            } else {
                // Clear the source path, hide suggestions, and refresh the timeline immediately
                plugin.settings.sourcePath = normalizedValue;
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);

                const suggestions = text.inputEl
                    .closest('.setting-item')
                    ?.querySelector('.source-path-suggestions');
                suggestions?.classList.add('hidden');

                text.inputEl.addClass('ert-setting-input-success');
                window.setTimeout(() => {
                    text.inputEl.removeClass('ert-setting-input-success');
                }, 1000);
            }
        };

        plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
    });

    // --- Show Source Path as Title ---
    const isShowingSourcePath = plugin.settings.showSourcePathAsTitle !== false;
    
    const getFolderTitle = () => {
        const sourcePath = plugin.settings.sourcePath;
        if (!sourcePath) return 'Work in Progress';
        // Get the last segment of the path
        const segments = sourcePath.split('/').filter(s => s.length > 0);
        return segments.length > 0 ? segments[segments.length - 1] : 'Work in Progress';
    };
    
    const getDescText = (enabled: boolean) => {
        const title = enabled ? getFolderTitle() : 'Work in Progress';
        return `Currently showing "${title}" as the title.`;
    };
    
    const titleToggleSetting = new ObsidianSetting(containerEl)
        .setName('Show source path as title')
        .setDesc(getDescText(isShowingSourcePath));
    
    titleToggleSetting.addToggle(toggle => {
        toggle
            .setValue(isShowingSourcePath)
            .onChange(async (value) => {
                plugin.settings.showSourcePathAsTitle = value;
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
                // Update description to reflect new state
                titleToggleSetting.setDesc(getDescText(value));
            });
    });

    // --- AI Output Folder ---
    const aiSetting = new ObsidianSetting(containerEl)
        .setName(t('settings.configuration.aiOutputFolder.name'))
        .setDesc(t('settings.configuration.aiOutputFolder.desc'));
    aiSetting.settingEl.addClass(ERT_CLASSES.ROW);
    aiSetting.settingEl.addClass(ERT_CLASSES.ROW_INLINE_CONTROL, 'ert-settingRow');
    aiSetting.addText(text => {
        const defaultPath = DEFAULT_SETTINGS.aiOutputFolder || 'Radial Timeline/Logs';
        const fallbackFolder = plugin.settings.aiOutputFolder?.trim() || defaultPath;
        const illegalChars = /[<>:"|?*]/;

        text.setPlaceholder(t('settings.configuration.aiOutputFolder.placeholder'))
            .setValue(fallbackFolder);
        text.inputEl.addClass('ert-input--full');

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

        aiSetting.addExtraButton(button => {
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

    // --- Export Folder ---
    const manuscriptSetting = new ObsidianSetting(containerEl)
        .setName(t('settings.configuration.manuscriptOutputFolder.name'))
        .setDesc(t('settings.configuration.manuscriptOutputFolder.desc'));
    manuscriptSetting.settingEl.addClass(ERT_CLASSES.ROW);
    manuscriptSetting.settingEl.addClass(ERT_CLASSES.ROW_INLINE_CONTROL, 'ert-settingRow');
    manuscriptSetting.addText(text => {
        const defaultPath = DEFAULT_SETTINGS.manuscriptOutputFolder || 'Radial Timeline/Export';
        const fallbackFolder = plugin.settings.manuscriptOutputFolder?.trim() || defaultPath;
        const illegalChars = /[<>:"|?*]/;

        text.setPlaceholder(t('settings.configuration.manuscriptOutputFolder.placeholder'))
            .setValue(fallbackFolder);
        text.inputEl.addClass('ert-input--full');

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

            plugin.settings.manuscriptOutputFolder = normalized;
            plugin.settings.outlineOutputFolder = normalized;
            await plugin.saveSettings();
            flashClass('ert-setting-input-success');
        };

        text.onChange(() => {
            inputEl.removeClass('ert-setting-input-success');
            inputEl.removeClass('ert-setting-input-error');
        });

        plugin.registerDomEvent(text.inputEl, 'blur', () => { void validatePath(); });

        manuscriptSetting.addExtraButton(button => {
            button.setIcon('rotate-ccw');
            button.setTooltip(`Reset to ${defaultPath}`);
            button.onClick(async () => {
                text.setValue(defaultPath);
                const normalizedDefault = normalizePath(defaultPath);
                plugin.settings.manuscriptOutputFolder = normalizedDefault;
                plugin.settings.outlineOutputFolder = normalizedDefault;
                await plugin.saveSettings();
                flashClass('ert-setting-input-success');
            });
        });
    });

}
