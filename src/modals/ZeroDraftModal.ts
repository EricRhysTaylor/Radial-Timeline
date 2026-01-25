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
        titleEl.setText('');
        
        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-modal-shell');
            modalEl.style.width = '680px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('ert-modal-container', 'ert-stack');

        // Header
        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Zero Draft' });
        header.createDiv({ cls: 'ert-modal-title', text: this.titleText });
        header.createDiv({ cls: 'ert-modal-subtitle', text: 'Enter Pending Edits below, or click Override to open the note directly.' });

        // Info note
        const infoEl = contentEl.createDiv({ cls: 'ert-field-note' });
        infoEl.setText('Zero draft mode is enabled. This scene has Publish Stage = Zero and Status = Complete. You can turn this off in Settings → Zero draft mode.');

        // Textarea
        const textareaRow = contentEl.createDiv({ cls: 'ert-row' });
        textareaRow.createDiv({ cls: 'ert-label', text: 'Pending edits' });
        const textareaControl = textareaRow.createDiv({ cls: 'ert-control' });
        this.textareaEl = textareaControl.createEl('textarea', { cls: 'ert-textarea' });
        this.textareaEl.value = this.originalText;
        this.textareaEl.style.minHeight = '200px';

        // Buttons container
        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });

        // OK button
        new ButtonComponent(buttonRow)
            .setButtonText('Save')
            .setCta()
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

        // Override button
        new ButtonComponent(buttonRow)
            .setButtonText('Override')
            .setWarning()
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
    }
}

export default ZeroDraftModal;

