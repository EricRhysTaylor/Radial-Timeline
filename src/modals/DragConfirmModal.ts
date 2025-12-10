import { Modal, App } from 'obsidian';

export class DragConfirmModal extends Modal {
    private readonly summary: string[];
    private decision: boolean = false;

    constructor(app: App, summaryLines: string[]) {
        super(app);
        this.summary = summaryLines;
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('rt-pulse-modal-shell');
        contentEl.addClass('rt-pulse-modal');
        contentEl.addClass('rt-pulse-glass-card');

        contentEl.createEl('h3', { text: 'Confirm reorder', cls: 'rt-pulse-progress-heading' });

        const list = contentEl.createEl('ul');
        this.summary.forEach(line => list.createEl('li', { text: line }));

        const buttons = contentEl.createDiv({ cls: 'rt-pulse-actions' });
        const confirmBtn = buttons.createEl('button', { text: 'Apply', cls: 'rt-mod-cta' });
        const cancelBtn = buttons.createEl('button', { text: 'Cancel' });

        confirmBtn.addEventListener('click', () => { this.decision = true; this.close(); });
        cancelBtn.addEventListener('click', () => { this.decision = false; this.close(); });
    }

    getResult(): boolean {
        return this.decision;
    }
}
