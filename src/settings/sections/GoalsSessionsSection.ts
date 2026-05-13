import { Setting, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { RuntimeContentType, RuntimeRateProfile } from '../../types';
import { ERT_CLASSES } from '../../ui/classes';
import { t } from '../../i18n';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';

interface GoalsSessionsSectionParams {
    plugin: RadialTimelinePlugin;
    containerEl: HTMLElement;
}

function buildProfileFromLegacy(plugin: RadialTimelinePlugin): RuntimeRateProfile {
    return {
        id: 'default',
        label: 'Default',
        contentType: (plugin.settings.runtimeContentType || 'novel') as RuntimeContentType,
        dialogueWpm: plugin.settings.runtimeDialogueWpm || 160,
        actionWpm: plugin.settings.runtimeActionWpm || 100,
        narrationWpm: plugin.settings.runtimeNarrationWpm || 150,
        beatSeconds: plugin.settings.runtimeBeatSeconds || 2,
        pauseSeconds: plugin.settings.runtimePauseSeconds || 3,
        longPauseSeconds: plugin.settings.runtimeLongPauseSeconds || 5,
        momentSeconds: plugin.settings.runtimeMomentSeconds || 4,
        silenceSeconds: plugin.settings.runtimeSilenceSeconds || 5,
        sessionPlanning: {
            draftingWpm: undefined,
            recordingWpm: undefined,
            editingWpm: undefined,
            dailyMinutes: undefined,
        },
    };
}

function ensureDefaultRuntimeProfile(plugin: RadialTimelinePlugin): RuntimeRateProfile {
    if (!plugin.settings.runtimeRateProfiles || plugin.settings.runtimeRateProfiles.length === 0) {
        plugin.settings.runtimeRateProfiles = [buildProfileFromLegacy(plugin)];
    }
    if (!plugin.settings.defaultRuntimeProfileId) {
        plugin.settings.defaultRuntimeProfileId = plugin.settings.runtimeRateProfiles[0].id;
    }

    const profiles = plugin.settings.runtimeRateProfiles;
    const defaultProfile = profiles.find(profile => profile.id === plugin.settings.defaultRuntimeProfileId) ?? profiles[0];
    if (plugin.settings.defaultRuntimeProfileId !== defaultProfile.id) {
        plugin.settings.defaultRuntimeProfileId = defaultProfile.id;
    }
    if (!defaultProfile.sessionPlanning) {
        defaultProfile.sessionPlanning = {};
    }
    return defaultProfile;
}

function flash(input: HTMLInputElement, type: 'success' | 'error'): void {
    const successClass = 'ert-input--success';
    const errorClass = 'ert-input--error';
    input.classList.remove(type === 'success' ? errorClass : successClass);
    input.classList.add(type === 'success' ? successClass : errorClass);
    window.setTimeout(() => input.classList.remove(type === 'success' ? successClass : errorClass), type === 'success' ? 900 : 1200);
}

function wireNumberInput(params: {
    plugin: RadialTimelinePlugin;
    text: TextComponent;
    currentValue?: number;
    max: number;
    onSave: (value: number | undefined) => void;
}): void {
    const { plugin, text, currentValue, max, onSave } = params;
    text.inputEl.type = 'number';
    text.inputEl.min = '0';
    text.inputEl.max = String(max);
    text.inputEl.addClass('ert-input--xs');
    text.setValue(currentValue ? String(currentValue) : '');

    plugin.registerDomEvent(text.inputEl, 'keydown', (evt: KeyboardEvent) => {
        if (evt.key === 'Enter') {
            evt.preventDefault();
            text.inputEl.blur();
        }
    });

    plugin.registerDomEvent(text.inputEl, 'blur', async () => {
        const raw = text.getValue().trim();
        const num = parseInt(raw);
        if (raw && (!Number.isFinite(num) || num < 0 || num > max)) {
            flash(text.inputEl, 'error');
            return;
        }
        const value = raw ? num : undefined;
        onSave(value);
        await plugin.saveSettings();
        flash(text.inputEl, 'success');
    });
}

export function renderGoalsSessionsSection({ plugin, containerEl }: GoalsSessionsSectionParams): void {
    containerEl.classList.add(ERT_CLASSES.STACK);

    const heading = new Setting(containerEl)
        .setName(t('settings.goalsSessions.header.name'))
        .setHeading()
        .setDesc(t('settings.goalsSessions.header.desc'));
    addHeadingIcon(heading, 'timer');
    addWikiLink(heading, 'Settings-Core#goals--sessions');
    applyErtHeaderLayout(heading);

    const body = containerEl.createDiv({ cls: ERT_CLASSES.STACK });
    const defaultProfile = ensureDefaultRuntimeProfile(plugin);
    const session = defaultProfile.sessionPlanning ?? {};

    new Setting(body)
        .setName(t('settings.goalsSessions.draftingWpm.name'))
        .setDesc(t('settings.goalsSessions.draftingWpm.desc'))
        .addText((text: TextComponent) => {
            wireNumberInput({
                plugin,
                text,
                currentValue: session.draftingWpm,
                max: 1000,
                onSave: (value) => {
                    const profile = ensureDefaultRuntimeProfile(plugin);
                    profile.sessionPlanning = { ...profile.sessionPlanning, draftingWpm: value };
                },
            });
        });

    new Setting(body)
        .setName(t('settings.goalsSessions.dailyMinutes.name'))
        .setDesc(t('settings.goalsSessions.dailyMinutes.desc'))
        .addText((text: TextComponent) => {
            wireNumberInput({
                plugin,
                text,
                currentValue: session.dailyMinutes,
                max: 1440,
                onSave: (value) => {
                    const profile = ensureDefaultRuntimeProfile(plugin);
                    profile.sessionPlanning = { ...profile.sessionPlanning, dailyMinutes: value };
                },
            });
        });
}
