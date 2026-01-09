import { App, Setting as Settings, Notice, normalizePath } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { clearFontMetricsCaches } from '../../renderer/utils/FontMetricsCache';
import { t } from '../../i18n';
import { addWikiLink } from '../wikiLink';
import { DEFAULT_SETTINGS } from '../defaults';

export function renderAdvancedSection(params: { app: App; plugin: RadialTimelinePlugin; containerEl: HTMLElement; }): void {
    const { app, plugin, containerEl } = params;

    const advancedHeading = new Settings(containerEl)
        .setName(t('settings.advanced.heading'))
        .setHeading();
    addWikiLink(advancedHeading, 'Settings#advanced');

    // 0. AI output folder for logs and generated files
    const aiSetting = new Settings(containerEl)
        .setName(t('settings.advanced.aiOutputFolder.name'))
        .setDesc(`${t('settings.advanced.aiOutputFolder.desc')} Default: ${DEFAULT_SETTINGS.aiOutputFolder || 'Radial Timeline/AI Logs'}`);
    aiSetting.addText(text => {
        const defaultPath = DEFAULT_SETTINGS.aiOutputFolder || 'Radial Timeline/AI Logs';
        const fallbackFolder = plugin.settings.aiOutputFolder?.trim() || defaultPath;
        const illegalChars = /[<>:"|?*]/;

        text.setPlaceholder(t('settings.advanced.aiOutputFolder.placeholder'))
            .setValue(fallbackFolder);
        text.inputEl.addClass('rt-input-full');

        const inputEl = text.inputEl;

        const flashClass = (cls: string) => {
            inputEl.addClass(cls);
            window.setTimeout(() => inputEl.removeClass(cls), cls === 'rt-setting-input-success' ? 1000 : 2000);
        };

        const validatePath = async () => {
            inputEl.removeClass('rt-setting-input-success');
            inputEl.removeClass('rt-setting-input-error');

            const rawValue = text.getValue();
            const trimmed = rawValue.trim() || fallbackFolder;

            if (illegalChars.test(trimmed)) {
                flashClass('rt-setting-input-error');
                new Notice('Folder path cannot contain the characters < > : " | ? *');
                return;
            }

            const normalized = normalizePath(trimmed);

            try { await plugin.app.vault.createFolder(normalized); } catch { /* folder may already exist */ }

            const isValid = await plugin.validateAndRememberPath(normalized);
            if (!isValid) {
                flashClass('rt-setting-input-error');
                return;
            }

            plugin.settings.aiOutputFolder = normalized;
            await plugin.saveSettings();
            flashClass('rt-setting-input-success');
        };

        text.onChange(() => {
            inputEl.removeClass('rt-setting-input-success');
            inputEl.removeClass('rt-setting-input-error');
        });

        plugin.registerDomEvent(text.inputEl, 'blur', () => { void validatePath(); });

        aiSetting.addExtraButton(button => {
            button.setIcon('rotate-ccw');
            button.setTooltip(`Reset to ${defaultPath}`);
            button.onClick(async () => {
                text.setValue(defaultPath);
                plugin.settings.aiOutputFolder = normalizePath(defaultPath);
                await plugin.saveSettings();
                flashClass('rt-setting-input-success');
            });
        });
    });

    // 0b. Manuscript export folder
    const manuscriptSetting = new Settings(containerEl)
        .setName(t('settings.advanced.manuscriptOutputFolder.name'))
        .setDesc(`${t('settings.advanced.manuscriptOutputFolder.desc')} Default: ${DEFAULT_SETTINGS.manuscriptOutputFolder || 'Radial Timeline/Manuscript'}`);
    manuscriptSetting.addText(text => {
        const defaultPath = DEFAULT_SETTINGS.manuscriptOutputFolder || 'Radial Timeline/Manuscript';
        const fallbackFolder = plugin.settings.manuscriptOutputFolder?.trim() || defaultPath;
        const illegalChars = /[<>:"|?*]/;

        text.setPlaceholder(t('settings.advanced.manuscriptOutputFolder.placeholder'))
            .setValue(fallbackFolder);
        text.inputEl.addClass('rt-input-full');

        const inputEl = text.inputEl;

        const flashClass = (cls: string) => {
            inputEl.addClass(cls);
            window.setTimeout(() => inputEl.removeClass(cls), cls === 'rt-setting-input-success' ? 1000 : 2000);
        };

        const validatePath = async () => {
            inputEl.removeClass('rt-setting-input-success');
            inputEl.removeClass('rt-setting-input-error');

            const rawValue = text.getValue();
            const trimmed = rawValue.trim() || fallbackFolder;

            if (illegalChars.test(trimmed)) {
                flashClass('rt-setting-input-error');
                new Notice('Folder path cannot contain the characters < > : " | ? *');
                return;
            }

            const normalized = normalizePath(trimmed);

            try { await plugin.app.vault.createFolder(normalized); } catch { /* folder may already exist */ }

            const isValid = await plugin.validateAndRememberPath(normalized);
            if (!isValid) {
                flashClass('rt-setting-input-error');
                return;
            }

            plugin.settings.manuscriptOutputFolder = normalized;
            await plugin.saveSettings();
            flashClass('rt-setting-input-success');
        };

        text.onChange(() => {
            inputEl.removeClass('rt-setting-input-success');
            inputEl.removeClass('rt-setting-input-error');
        });

        plugin.registerDomEvent(text.inputEl, 'blur', () => { void validatePath(); });

        manuscriptSetting.addExtraButton(button => {
            button.setIcon('rotate-ccw');
            button.setTooltip(`Reset to ${defaultPath}`);
            button.onClick(async () => {
                text.setValue(defaultPath);
                plugin.settings.manuscriptOutputFolder = normalizePath(defaultPath);
                await plugin.saveSettings();
                flashClass('rt-setting-input-success');
            });
        });
    });

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
            drop.selectEl.addClass('rt-setting-dropdown');
        });

    // 1c. Show backdrop ring toggle
    new Settings(containerEl)
        .setName('Show backdrop ring')
        .setDesc('Display the backdrop ring in Chronologue mode. When disabled, the ring space is reclaimed for subplot rings.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showBackdropRing ?? true)
            .onChange(async (value) => {
                plugin.settings.showBackdropRing = value;
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
            }));

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
