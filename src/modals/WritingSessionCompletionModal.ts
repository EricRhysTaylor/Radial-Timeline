import { ButtonComponent, Modal, Setting, TextAreaComponent, TextComponent } from 'obsidian';
import type { App } from 'obsidian';
import type { ActiveWritingSession } from '../types/settings';
import type { WritingSessionCompletionInput, WritingSessionSceneSuggestion } from '../services/WritingSessionService';

export interface WritingSessionCompletionResult extends WritingSessionCompletionInput {
    elapsedMinutes: number;
}

function minutesFromElapsed(elapsedMs: number): number {
    return Math.max(1, Math.round(Math.max(0, elapsedMs) / 60000));
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
        header.createSpan({ cls: 'ert-modal-badge', text: 'Session' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Save writing session' });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: [this.formatMode(), this.active.stage, this.active.bookTitle].filter(Boolean).join(' · ') || 'Writing session',
        });

        const form = contentEl.createDiv({ cls: 'ert-stack' });
        let minutes = minutesFromElapsed(this.elapsedMs);
        let wordsAdded: number | undefined;
        let scenesCompleted: number | undefined;
        let pagesEdited: number | undefined;
        let note = '';
        const selectedScenePaths = new Set(this.sceneSuggestions.map(suggestion => suggestion.path));

        const wireNumber = (setting: Setting, defaultValue: string, onChange: (value: string) => void): void => {
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

        wireNumber(
            new Setting(form)
                .setName('Minutes')
                .setDesc('Adjust if the timer does not match the real session.'),
            String(minutes),
            value => {
                const parsed = Number(value);
                if (Number.isFinite(parsed) && parsed > 0) minutes = Math.round(parsed);
            }
        );

        wireNumber(
            new Setting(form)
                .setName('Words added')
                .setDesc('Optional. Used for drafting totals and future goal stats.'),
            '',
            value => { wordsAdded = parseOptionalInteger(value); }
        );

        wireNumber(
            new Setting(form)
                .setName('Scenes completed')
                .setDesc('Optional manual count. Scene Due dates remain the system source of truth.'),
            '',
            value => { scenesCompleted = parseOptionalInteger(value); }
        );

        wireNumber(
            new Setting(form)
                .setName('Pages edited')
                .setDesc('Optional editing/revision measure.'),
            '',
            value => { pagesEdited = parseOptionalInteger(value); }
        );

        if (this.sceneSuggestions.length > 0) {
            const sceneSection = form.createDiv({ cls: 'ert-writing-session-scenes' });
            sceneSection.createDiv({ cls: 'ert-writing-session-scenes__title', text: 'Touched scenes' });
            this.sceneSuggestions.forEach(suggestion => {
                new Setting(sceneSection)
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

        new Setting(form)
            .setName('Note')
            .setDesc('Optional private note about what you worked on.')
            .addTextArea((text: TextAreaComponent) => {
                text.inputEl.addClass('ert-input--full');
                text.inputEl.rows = 3;
                text.onChange(value => { note = value; });
            });

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions' });
        const save = async () => {
            const elapsedMinutes = Math.max(1, minutes);
            const result: WritingSessionCompletionResult = {
                elapsedMinutes,
                elapsedMs: elapsedMinutes * 60000,
                wordsAdded,
                scenesCompleted,
                scenePaths: [...selectedScenePaths],
                pagesEdited,
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
