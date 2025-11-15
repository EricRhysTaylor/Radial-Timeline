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

            const trimmed = value.trim();

            if (trimmed) {
                const normalized = normalizePath(trimmed);
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
            } else {
                // Clear the source path, hide suggestions, and refresh the timeline immediately
                plugin.settings.sourcePath = '';
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);

                const suggestions = text.inputEl
                    .closest('.setting-item')
                    ?.querySelector('.source-path-suggestions');
                suggestions?.classList.add('hidden');

                text.inputEl.addClass('rt-setting-input-success');
                window.setTimeout(() => {
                    text.inputEl.removeClass('rt-setting-input-success');
                }, 1000);
            }
        });
    });
}

