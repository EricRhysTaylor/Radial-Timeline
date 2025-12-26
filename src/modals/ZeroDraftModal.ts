/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
import { App, Modal, ButtonComponent } from 'obsidian';

/**
 * ZeroDraftModal presents a large textarea for editing the "Pending Edits" field.
 * OK overwrites the field (with delete-confirm if clearing). Cancel/Override confirm discards when dirty.
 */
export class ZeroDraftModal extends Modal {
    private readonly titleText: string;
    private readonly originalText: string;
    private readonly onOk: (nextText: string) => void;
    private readonly onOverride: () => void;

    private textareaEl!: HTMLTextAreaElement;

    constructor(
        app: App,
        options: {
            titleText: string;
            initialText: string;
            onOk: (nextText: string) => void;
            onOverride: () => void;
        }
    ) {
        super(app);
        this.titleText = options.titleText;
        this.originalText = (options.initialText || '').trim();
        this.onOk = options.onOk;
        this.onOverride = options.onOverride;
    }

    onOpen(): void {
        const { contentEl, titleEl, modalEl } = this;
        if (modalEl) modalEl.classList.add('rt-pulse-modal-shell');
        contentEl.addClass('rt-pulse-modal');
        contentEl.addClass('rt-manuscript-surface');
        titleEl.setText(this.titleText);

        // Context note
        const infoEl = contentEl.createDiv({ cls: 'rt-zero-draft-info' });
        infoEl.setText('Zero draft mode is enabled. This scene has Publish Stage = Zero and Status = Complete. Enter Pending Edits below, or click Override to open the note. You can turn this off in Settings → Zero draft mode.');

        // Textarea
        this.textareaEl = contentEl.createEl('textarea', { cls: 'rt-zero-draft-textarea' });
        this.textareaEl.value = this.originalText;

        // Buttons container
        const buttonRow = contentEl.createDiv({ cls: 'rt-modal-actions' });

        // OK button
        new ButtonComponent(buttonRow)
            .setButtonText('OK')
            .onClick(() => {
                const next = (this.textareaEl.value || '').trim();
                // If we are clearing existing non-empty content, confirm deletion
                if (this.originalText.length > 0 && next.length === 0) {
                    const confirmed = window.confirm('Delete existing pending edits content? This will remove all previous text.');
                    if (!confirmed) return; // Do not close or write
                }
                // Proceed with write
                this.onOk(next);
                this.close();
            });

        // Cancel button
        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => {
                const current = (this.textareaEl.value || '').trim();
                const isDirty = current !== this.originalText;
                if (isDirty) {
                    const discard = window.confirm('Discard changes?');
                    if (!discard) return;
                }
                this.close();
            });

        // Override button (red)
        const overrideBtn = new ButtonComponent(buttonRow)
            .setButtonText('Override')
            .onClick(() => {
                const current = (this.textareaEl.value || '').trim();
                const isDirty = current !== this.originalText;
                if (isDirty) {
                    const discard = window.confirm('Discard changes?');
                    if (!discard) return;
                }
                // Open note without saving
                this.onOverride();
                this.close();
            });
        overrideBtn.buttonEl.classList.add('rt-zero-draft-override');
    }
}

export default ZeroDraftModal;


