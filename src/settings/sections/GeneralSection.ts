import type { App, TextComponent } from 'obsidian';
import { Setting as ObsidianSetting, normalizePath, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';

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
            .setPlaceholder('Example: Manuscript/Scenes')
            .setValue(plugin.settings.sourcePath);

        attachFolderSuggest(text);

        if (plugin.settings.sourcePath?.trim()) {
            window.setTimeout(async () => {
                const isValid = await plugin.validateAndRememberPath(plugin.settings.sourcePath);
                if (isValid) {
                    text.inputEl.addClass('rt-setting-input-success');
                    window.setTimeout(() => {
                        text.inputEl.removeClass('rt-setting-input-success');
                    }, 2000);
                }
            }, 100);
        }

        text.onChange(async (value) => {
            text.inputEl.removeClass('rt-setting-input-success');
            text.inputEl.removeClass('rt-setting-input-error');

            if (value.trim()) {
                const normalized = normalizePath(value.trim());
                const isValid = await plugin.validateAndRememberPath(normalized);
                if (isValid) {
                    plugin.settings.sourcePath = normalized;
                    await plugin.saveSettings();
                    text.inputEl.addClass('rt-setting-input-success');
                    window.setTimeout(() => {
                        text.inputEl.removeClass('rt-setting-input-success');
                    }, 1000);
                } else {
                    text.inputEl.addClass('rt-setting-input-error');
                    window.setTimeout(() => {
                        text.inputEl.removeClass('rt-setting-input-error');
                    }, 2000);
                }
            }
        });
    });

    // --- Target Completion Date ---
    new ObsidianSetting(containerEl)
        .setName('Target completion date')
        .setDesc('Optional: Set a target date for project completion (YYYY-MM-DD). This will be shown on the timeline.')
        .addText(text => {
            text.inputEl.type = 'date';
            text.setValue(plugin.settings.targetCompletionDate || '')
                .onChange(async (value) => {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    if (!value) {
                        plugin.settings.targetCompletionDate = undefined;
                        text.inputEl.removeClass('rt-setting-input-error');
                        await plugin.saveSettings();
                        return;
                    }

                    const selectedDate = new Date(value + 'T00:00:00');
                    if (selectedDate > today) {
                        plugin.settings.targetCompletionDate = value;
                        text.inputEl.removeClass('rt-setting-input-error');
                    } else {
                        new Notice('Target date must be in the future.');
                        text.setValue(plugin.settings.targetCompletionDate || '');
                        return;
                    }
                    await plugin.saveSettings();
                });
        });

    // --- Timeline outer ring content ---
    new ObsidianSetting(containerEl)
        .setName('All scenes mode or main plot mode')
        .setDesc('If enabled, the outer ring shows ordered scenes from all subplots with subplot colors. Plot beats slices (gray) with labels are shown in the outer ring. When off, the outer ring shows only main plot scenes with publish stage coloring throughout timeline.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.outerRingAllScenes || false)
            .onChange(async (value) => {
                plugin.settings.outerRingAllScenes = value;
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
            }));

    // --- Zero draft mode toggle ---
    new ObsidianSetting(containerEl)
        .setName('Zero draft mode')
        .setDesc('Intercept clicks on scenes with Publish Stage = Zero and Status = Complete to capture Pending Edits without opening the scene.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.enableZeroDraftMode ?? false)
            .onChange(async (value) => {
                plugin.settings.enableZeroDraftMode = value;
                await plugin.saveSettings();
            }));
}


