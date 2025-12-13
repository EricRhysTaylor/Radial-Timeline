import { Modal, App } from 'obsidian';

export class DragConfirmModal extends Modal {
    private readonly summary: string[];
    private decision: boolean = false;
    private readonly accent?: string;

    constructor(app: App, summaryLines: string[], accent?: string) {
        super(app);
        this.summary = summaryLines;
        this.accent = accent;
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        modalEl.addClass('rt-pulse-modal-shell');
        contentEl.addClass('rt-pulse-modal');
        contentEl.addClass('rt-pulse-glass-card');
        contentEl.addClass('rt-confirm-modal');
        modalEl.style.setProperty('width', 'min(520px, 90vw)');
        modalEl.style.setProperty('max-height', '90vh');
        if (this.accent) {
            contentEl.style.setProperty('--rt-confirm-accent', this.accent);
        }

        contentEl.createEl('h3', { text: 'Confirm reorder', cls: 'rt-pulse-progress-heading rt-confirm-heading' });

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
