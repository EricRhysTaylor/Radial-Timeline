import { ButtonComponent, Modal, Setting, TextAreaComponent, TextComponent } from 'obsidian';
import type { App } from 'obsidian';
import type { ActiveWritingSession } from '../types/settings';
import type { WritingSessionCompletionInput } from '../services/WritingSessionService';

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
        private onSubmit: (result: WritingSessionCompletionResult) => Promise<void>
    ) {
        super(app);
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
            text: [this.active.mode, this.active.bookTitle].filter(Boolean).join(' · ') || 'Writing session',
        });

        const form = contentEl.createDiv({ cls: 'ert-stack' });
        let minutes = minutesFromElapsed(this.elapsedMs);
        let wordsAdded: number | undefined;
        let scenesCompleted: number | undefined;
        let pagesEdited: number | undefined;
        let note = '';

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
