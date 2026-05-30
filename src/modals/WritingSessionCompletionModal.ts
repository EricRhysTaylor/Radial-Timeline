import { ButtonComponent, Modal, Setting, TextAreaComponent, TextComponent } from 'obsidian';
import type { App } from 'obsidian';
import type { ActiveWritingSession } from '../types/settings';
import type { WritingSessionCompletionInput, WritingSessionSceneSuggestion } from '../services/WritingSessionService';

export interface WritingSessionCompletionResult extends WritingSessionCompletionInput {
    elapsedMinutes: number;
}

export interface WritingSessionCompletionWordStats {
    typedWords?: number;
    netWordDelta?: number;
}

function minutesFromElapsed(elapsedMs: number): number {
    return Math.max(1, Math.round(Math.max(0, elapsedMs) / 60000));
}

function localDateString(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function sessionDateFromStartedAt(startedAt: string): string {
    const parsed = new Date(startedAt);
    return Number.isNaN(parsed.getTime()) ? localDateString() : localDateString(parsed);
}

function isDateKey(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function parseOptionalInteger(value: string): number | undefined {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return undefined;
    const rounded = Math.max(0, Math.round(parsed));
    return rounded > 0 ? rounded : undefined;
}

export class WritingSessionCompletionModal extends Modal {
    constructor(
        app: App,
        private active: ActiveWritingSession,
        private elapsedMs: number,
        private sceneSuggestions: WritingSessionSceneSuggestion[],
        private wordStats: WritingSessionCompletionWordStats,
        private onSubmit: (result: WritingSessionCompletionResult) => Promise<void>
    ) {
        super(app);
    }

    private formatMode(): string {
        if (this.active.mode === 'drafting') return 'fresh drafting';
        if (this.active.mode === 'revising') return 'revision';
        if (this.active.mode === 'editing') return 'line edit';
        return 'planning';
    }

    private formatHeaderMeta(): string {
        const mode = this.formatMode();
        const modeLabel = mode ? mode.charAt(0).toUpperCase() + mode.slice(1) : '';
        return [modeLabel, this.active.stage, this.active.bookTitle].filter(Boolean).join(' · ') || 'Session';
    }

    private formatSceneSuggestionDetail(suggestion: WritingSessionSceneSuggestion): string {
        const reasonLabel = suggestion.reason === 'active'
            ? 'active tab'
            : suggestion.reason === 'open'
                ? 'open tab'
                : suggestion.reason === 'working'
                    ? 'marked Working'
                    : 'modified during session';
        return [
            suggestion.stage,
            suggestion.status,
            reasonLabel,
        ].filter(Boolean).join(' · ');
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-modal--writing-session');
        }
        contentEl.addClass('ert-modal-container', 'ert-stack');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: this.formatHeaderMeta() });
        header.createDiv({ cls: 'ert-modal-title', text: 'Save writing session' });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Review word counts, confirm touched scenes, choose the writing day, then save this session record.',
        });

        const form = contentEl.createDiv({ cls: 'ert-writing-session-form ert-stack' });
        let minutes = minutesFromElapsed(this.elapsedMs);
        let sessionDate = sessionDateFromStartedAt(this.active.startedAt);
        const typedWords = Math.max(0, Math.round(this.wordStats.typedWords ?? this.active.typedWords ?? 0));
        const hasTypedWords = typedWords > 0;
        const netWordDelta = Number.isFinite(this.wordStats.netWordDelta)
            ? Math.round(this.wordStats.netWordDelta ?? 0)
            : undefined;
        let wordsAdded: number | undefined = hasTypedWords ? typedWords : undefined;
        let scenesCompleted: number | undefined;
        let note = '';
        const selectedScenePaths = new Set(this.sceneSuggestions.map(suggestion => suggestion.path));

        const wireNumber = (
            setting: Setting,
            defaultValue: string,
            onChange: (value: string) => void,
            extraClass?: string
        ): void => {
            if (extraClass) setting.settingEl.addClass(extraClass);
            setting.addText((text: TextComponent) => {
                text.inputEl.type = 'number';
                text.inputEl.min = '0';
                text.inputEl.step = '1';
                text.inputEl.addClass('ert-input--sm');
                text.setValue(defaultValue);
                text.onChange(onChange);
                text.inputEl.addEventListener('keydown', (evt: KeyboardEvent) => {
                    if (evt.key === 'Enter') {
                        evt.preventDefault();
                        void save();
                    }
                });
            });
        };

        const wordsSection = form.createDiv({ cls: 'ert-writing-session-section ert-writing-session-section--words' });
        const wordSummary = wordsSection.createDiv({ cls: 'ert-writing-session-grid ert-writing-session-grid--words' });
        const typedWordsSetting = new Setting(wordSummary)
            .setName('Typed during session')
            .setDesc('Additive live count from keyboard typing only. Paste, cut, deletion, and undo do not subtract from this meter.')
            .addText(text => {
                text.inputEl.addClass('ert-input--sm');
                text.setValue(hasTypedWords ? String(typedWords) : '0');
                text.setDisabled(true);
            });
        typedWordsSetting.settingEl.addClass('ert-writing-session-compact-setting');
        wireNumber(
            new Setting(wordSummary)
                .setName('Words to save')
                .setDesc('Defaults to typed words when available. Edit if the saved drafting count should differ.'),
            wordsAdded === undefined ? '' : String(wordsAdded),
            value => { wordsAdded = parseOptionalInteger(value); },
            'ert-writing-session-compact-setting'
        );

        const workSummary = wordsSection.createDiv({ cls: 'ert-writing-session-grid ert-writing-session-grid--work' });
        const netWordSetting = new Setting(workSummary)
            .setName('Net manuscript change')
            .setDesc('Snapshot difference for the open scene notes captured at session start. This can be negative after cuts or revision.')
            .addText(text => {
                text.inputEl.addClass('ert-input--sm');
                text.setValue(netWordDelta === undefined ? 'Unavailable' : `${netWordDelta > 0 ? '+' : ''}${netWordDelta}`);
                text.setDisabled(true);
            });
        netWordSetting.settingEl.addClass('ert-writing-session-compact-setting');
        wireNumber(
            new Setting(workSummary)
                .setName('Scenes completed')
                .setDesc('Optional manual count. Scene Due dates remain the system source of truth.'),
            '',
            value => { scenesCompleted = parseOptionalInteger(value); },
            'ert-writing-session-compact-setting'
        );

        if (this.sceneSuggestions.length > 0) {
            const sceneSection = form.createDiv({ cls: 'ert-writing-session-scenes' });
            sceneSection.createDiv({ cls: 'ert-writing-session-scenes__title', text: 'Touched scenes' });
            const sceneList = sceneSection.createDiv({ cls: 'ert-writing-session-scenes__list' });
            this.sceneSuggestions.forEach(suggestion => {
                new Setting(sceneList)
                    .setName(suggestion.title || suggestion.path)
                    .setDesc(this.formatSceneSuggestionDetail(suggestion))
                    .addToggle(toggle => {
                        toggle.setValue(true);
                        toggle.onChange(value => {
                            if (value) selectedScenePaths.add(suggestion.path);
                            else selectedScenePaths.delete(suggestion.path);
                        });
                    });
            });
        }

        const sessionMeta = form.createDiv({ cls: 'ert-writing-session-grid ert-writing-session-grid--session' });
        const sessionDateSetting = new Setting(sessionMeta)
            .setName('Session date')
            .setDesc('Writing day credited in stats. Defaults to the day this session started.')
            .addText((text: TextComponent) => {
                text.inputEl.type = 'date';
                text.inputEl.addClass('ert-input--md', 'ert-writing-session-date-input');
                text.setValue(sessionDate);
                text.onChange(value => {
                    if (isDateKey(value)) sessionDate = value;
                });
            });
        sessionDateSetting.settingEl.addClass('ert-writing-session-compact-setting');

        wireNumber(
            new Setting(sessionMeta)
                .setName('Minutes')
                .setDesc('Adjust if the timer does not match the real session.'),
            String(minutes),
            value => {
                const parsed = Number(value);
                if (Number.isFinite(parsed) && parsed > 0) minutes = Math.round(parsed);
            },
            'ert-writing-session-compact-setting'
        );

        const noteSetting = new Setting(form)
            .setName('Note')
            .setDesc('Optional private note about what you worked on.')
            .addTextArea((text: TextAreaComponent) => {
                text.inputEl.addClass('ert-input--full');
                text.inputEl.rows = 3;
                text.onChange(value => { note = value; });
            });
        noteSetting.settingEl.addClass('ert-writing-session-note');

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions' });
        const save = async () => {
            const elapsedMinutes = Math.max(1, minutes);
            const result: WritingSessionCompletionResult = {
                elapsedMinutes,
                sessionDate,
                elapsedMs: elapsedMinutes * 60000,
                wordsAdded,
                typedWords: hasTypedWords ? typedWords : undefined,
                netWordDelta,
                scenesCompleted,
                scenePaths: [...selectedScenePaths],
                note,
            };
            await this.onSubmit(result);
            this.close();
        };

        new ButtonComponent(actions)
            .setButtonText('Save')
            .setCta()
            .onClick(() => { void save(); });
        new ButtonComponent(actions)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}
