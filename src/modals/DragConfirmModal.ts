import { Modal, App } from 'obsidian';

const ICON_SHUFFLE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shuffle-icon lucide-shuffle"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/></svg>`;
const ICON_LIST_ORDERED = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-ordered-icon lucide-list-ordered"><path d="M11 5h10"/><path d="M11 12h10"/><path d="M11 19h10"/><path d="M4 4h1v5"/><path d="M4 9h2"/><path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"/></svg>`;
const ICON_BLOCKS = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-blocks-icon lucide-blocks"><path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2"/><rect x="14" y="2" width="8" height="8" rx="1"/></svg>`;

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
        modalEl.style.setProperty('width', 'min(560px, 90vw)');
        modalEl.style.setProperty('max-height', '90vh');
        
        // Use the passed accent color (subplot color)
        if (this.accent) {
            contentEl.style.setProperty('--rt-confirm-accent', this.accent);
        }

        contentEl.createEl('h3', { text: 'Confirm reorder', cls: 'rt-pulse-progress-heading rt-confirm-heading' });

        const listDiv = contentEl.createDiv({ cls: 'rt-confirm-list' });

        // Render each line as a styled card with icon
        this.summary.forEach((line, index) => {
            const row = listDiv.createDiv({ cls: 'rt-confirm-row' });

            // Icon container
            const iconContainer = row.createDiv({ cls: 'rt-confirm-row-icon' });

            // Assign specific icons based on list index
            if (index === 0) {
                this.setIcon(iconContainer, ICON_SHUFFLE);
            } else if (index === 1) {
                this.setIcon(iconContainer, ICON_LIST_ORDERED);
            } else {
                this.setIcon(iconContainer, ICON_BLOCKS);
            }

            // Text content
            row.createDiv({ cls: 'rt-confirm-row-text', text: line });
        });

        const buttons = contentEl.createDiv({ cls: 'rt-pulse-actions' });
        const confirmBtn = buttons.createEl('button', { text: 'Apply', cls: 'rt-mod-cta' });
        const cancelBtn = buttons.createEl('button', { text: 'Cancel' });

        confirmBtn.addEventListener('click', () => { this.decision = true; this.close(); });
        cancelBtn.addEventListener('click', () => { this.decision = false; this.close(); });
    }

    private setIcon(container: HTMLElement, svgString: string): void {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        if (doc.documentElement) {
            container.empty();
            container.appendChild(document.importNode(doc.documentElement, true));
        }
    }

    getResult(): boolean {
        return this.decision;
    }
}
