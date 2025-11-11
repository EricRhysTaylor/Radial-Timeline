import type { App } from 'obsidian';
import { Setting as ObsidianSetting, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';

export function renderPublicationSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}): void {
    const { app, plugin, containerEl } = params;

    new ObsidianSetting(containerEl)
        .setName('Publication and progress')
        .setHeading();

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
                        plugin.refreshTimelineIfNeeded(null);
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
                    plugin.refreshTimelineIfNeeded(null);
                });
        });

    // --- Show estimated completion date ---
    new ObsidianSetting(containerEl)
        .setName('Show estimated completion date')
        .setDesc('Toggle the estimation date label near the progress ring.')
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showEstimate ?? true)
            .onChange(async (value) => {
                plugin.settings.showEstimate = value;
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

