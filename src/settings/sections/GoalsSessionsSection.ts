import { Setting, TextComponent } from 'obsidian';
import type RadialTimelinePlugin from '../../main';
import type { RuntimeContentType, RuntimeRateProfile } from '../../types';
import { ERT_CLASSES } from '../../ui/classes';
import { t } from '../../i18n';
import { addHeadingIcon, addWikiLink, applyErtHeaderLayout } from '../wikiLink';
import type { WritingRangeStats } from '../../services/WritingSessionService';

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

function formatMinutes(minutes: number): string {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatRangeLabel(stats: WritingRangeStats): string {
    if (stats.days === 1) return 'Today';
    return `${stats.days} days`;
}

function createMetric(container: HTMLElement, label: string, value: string): void {
    const metric = container.createDiv({ cls: 'ert-goals-stat' });
    metric.createDiv({ cls: 'ert-goals-stat__value', text: value });
    metric.createDiv({ cls: 'ert-goals-stat__label', text: label });
}

function createRangeCard(container: HTMLElement, stats: WritingRangeStats): void {
    const card = container.createDiv({ cls: 'ert-goals-stat-card' });
    const header = card.createDiv({ cls: 'ert-goals-stat-card__header' });
    header.createDiv({ cls: 'ert-goals-stat-card__title', text: formatRangeLabel(stats) });
    header.createDiv({ cls: 'ert-goals-stat-card__date', text: stats.days === 1 ? stats.endDate : `${stats.startDate} to ${stats.endDate}` });

    const metrics = card.createDiv({ cls: 'ert-goals-stat-grid' });
    createMetric(metrics, 'logged', formatMinutes(stats.minutesLogged));
    createMetric(metrics, 'sessions', String(stats.sessionsCompleted));
    createMetric(metrics, 'goal days', stats.dailyTargetMinutes ? `${stats.daysGoalMet}/${stats.days}` : '—');
    createMetric(metrics, 'draft words', String(stats.wordsDrafted));
    createMetric(metrics, 'fresh scenes', String(stats.freshScenesCompleted));
    createMetric(metrics, 'revision scenes', String(stats.revisionScenesCompleted));

    const stages = card.createDiv({ cls: 'ert-goals-stage-line' });
    (['Zero', 'Author', 'House', 'Press'] as const).forEach(stage => {
        const item = stages.createSpan({ cls: 'ert-goals-stage-pill' });
        item.createSpan({ cls: 'ert-goals-stage-pill__label', text: stage });
        item.createSpan({ cls: 'ert-goals-stage-pill__value', text: String(stats.scenesCompletedByStage[stage]) });
    });
}

function renderStatsBody(container: HTMLElement, stats: WritingRangeStats[]): void {
    container.empty();
    const cards = container.createDiv({ cls: 'ert-goals-stats-grid' });
    stats.forEach(stat => createRangeCard(cards, stat));
}

function renderStatsError(container: HTMLElement, message: string): void {
    container.empty();
    container.createDiv({ cls: ERT_CLASSES.FIELD_NOTE, text: message });
}

function renderWritingStatsPanel(plugin: RadialTimelinePlugin, containerEl: HTMLElement): void {
    const details = containerEl.createEl('details', { cls: 'ert-goals-stats-details' });
    const summary = details.createEl('summary', { cls: 'ert-goals-stats-summary' });
    summary.createSpan({ cls: 'ert-goals-stats-summary__title', text: 'Writing stats' });
    summary.createSpan({
        cls: 'ert-goals-stats-summary__desc',
        text: 'Local timer records and scene completion dates.',
    });
    const body = details.createDiv({ cls: 'ert-goals-stats-body' });
    body.createDiv({ cls: ERT_CLASSES.FIELD_NOTE, text: 'Loading writing stats…' });

    const refresh = async () => {
        try {
            const service = plugin.getWritingSessionService();
            const stats = await Promise.all([
                service.getRangeStats(1),
                service.getRangeStats(7),
                service.getRangeStats(30),
            ]);
            renderStatsBody(body, stats);
        } catch (error) {
            renderStatsError(body, error instanceof Error ? error.message : 'Could not build writing stats.');
        }
    };

    void refresh();
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

    renderWritingStatsPanel(plugin, body);
}
