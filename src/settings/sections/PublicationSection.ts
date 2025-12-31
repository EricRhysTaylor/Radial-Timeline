import type { App } from 'obsidian';
import { Setting as ObsidianSetting, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import { t } from '../../i18n';
import { addWikiLink } from '../wikiLink';

export function renderPublicationSection(params: {
    app: App;
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}): void {
    const { app, plugin, containerEl } = params;

    const pubHeading = new ObsidianSetting(containerEl)
        .setName('Publication and progress')
        .setHeading();
    addWikiLink(pubHeading, 'Settings#publication');

    // --- Target Completion Date ---
    new ObsidianSetting(containerEl)
        .setName('Target completion date')
        .setDesc('Set a target date for project completion (YYYY-MM-DD). This will be shown on the timeline.')
        .addText(text => {
            text.inputEl.type = 'date';
            text.inputEl.addClass('rt-input-md'); /* YYYY-MM-DD needs more space */
            text.setValue(plugin.settings.targetCompletionDate || '');

            text.onChange(() => {
                text.inputEl.removeClass('rt-setting-input-error');
            });

            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });

            const handleBlur = async () => {
                const value = text.getValue();
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
            };

            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
        });

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

    // --- Show completion estimate ---
    new ObsidianSetting(containerEl)
        .setName(t('settings.advanced.showEstimate.name'))
        .setDesc(t('settings.advanced.showEstimate.desc'))
        .addToggle(toggle => toggle
            .setValue(plugin.settings.showCompletionEstimate ?? true)
            .onChange(async (value) => {
                plugin.settings.showCompletionEstimate = value;
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
            }));

    // --- Completion estimate window (days) ---
    new ObsidianSetting(containerEl)
        .setName('Completion estimate window (days)')
        .setDesc('Active Publish Stage only. Pace = completed scenes in the last N days ÷ N. Estimate date = remaining scenes ÷ pace. Inactivity colors the date (7/14/21 days) and shows “?” after 21 days of no progress.')
        .addText(text => {
            const current = String(plugin.settings.completionEstimateWindowDays ?? 30);
            text.inputEl.type = 'number';
            text.inputEl.min = '14';
            text.inputEl.max = '90';
            text.inputEl.addClass('rt-input-xs');
            text.setValue(current);

            plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    text.inputEl.blur();
                }
            });

            const handleBlur = async () => {
                const raw = Number(text.getValue().trim());
                if (!Number.isFinite(raw)) {
                    text.setValue(String(plugin.settings.completionEstimateWindowDays ?? 30));
                    return;
                }
                const clamped = Math.min(90, Math.max(14, Math.round(raw)));
                plugin.settings.completionEstimateWindowDays = clamped;
                text.setValue(String(clamped));
                await plugin.saveSettings();
                plugin.refreshTimelineIfNeeded(null);
            };

            plugin.registerDomEvent(text.inputEl, 'blur', () => { void handleBlur(); });
        });
}
