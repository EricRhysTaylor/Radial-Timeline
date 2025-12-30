import type { App, TextComponent } from 'obsidian';
import { Setting as ObsidianSetting, normalizePath } from 'obsidian';
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
            .setPlaceholder('Example: Book 1')
            .setValue(plugin.settings.sourcePath);
        text.inputEl.addClass('rt-input-full');

        attachFolderSuggest(text);

        text.onChange(() => {
            text.inputEl.removeClass('rt-setting-input-success');
            text.inputEl.removeClass('rt-setting-input-error');
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
                plugin.settings.sourcePath = normalizedValue;
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
        };

        plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
    });

    // --- Show Source Path as Title ---
    new ObsidianSetting(containerEl)
        .setName('Show source path as title')
        .setDesc('Display the source folder name as the title of your work. When off, displays "Work in Progress" instead.')
        .addToggle(toggle => {
            toggle
                .setValue(plugin.settings.showSourcePathAsTitle !== false)
                .onChange(async (value) => {
                    plugin.settings.showSourcePathAsTitle = value;
                    await plugin.saveSettings();
                    plugin.refreshTimelineIfNeeded(null);
                });
        });
}
