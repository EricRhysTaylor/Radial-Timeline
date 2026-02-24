import { Modal, App } from 'obsidian';

const ICON_SHUFFLE = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-shuffle-icon lucide-shuffle"><path d="m18 14 4 4-4 4"/><path d="m18 2 4 4-4 4"/><path d="M2 18h1.973a4 4 0 0 0 3.3-1.7l5.454-8.6a4 4 0 0 1 3.3-1.7H22"/><path d="M2 6h1.972a4 4 0 0 1 3.6 2.2"/><path d="M22 18h-6.041a4 4 0 0 1-3.3-1.8l-.359-.45"/></svg>`;
const ICON_LIST_ORDERED = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-list-ordered-icon lucide-list-ordered"><path d="M11 5h10"/><path d="M11 12h10"/><path d="M11 19h10"/><path d="M4 4h1v5"/><path d="M4 9h2"/><path d="M6.5 20H3.4c0-1 2.6-1.925 2.6-3.5a1.5 1.5 0 0 0-2.6-1.02"/></svg>`;
const ICON_BLOCKS = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-blocks-icon lucide-blocks"><path d="M10 22V7a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a1 1 0 0 0-1-1H2"/><rect x="14" y="2" width="8" height="8" rx="1"/></svg>`;

export class DragConfirmModal extends Modal {
    private readonly summary: string[];
    private readonly accent?: string;
    private readonly itemLabel: string; // 'scene' or 'beat'
    private phase: 'confirm' | 'running' | 'done' = 'confirm';
    private closed = false;
    private beginResolver: ((value: boolean) => void) | null = null;
    private dismissResolver: (() => void) | null = null;
    private primaryButtonEl: HTMLButtonElement | null = null;
    private cancelButtonEl: HTMLButtonElement | null = null;
    private statusRowEl: HTMLElement | null = null;
    private statusTextEl: HTMLElement | null = null;
    private backdropGuard: ((evt: MouseEvent) => void) | null = null;

    constructor(app: App, summaryLines: string[], accent?: string, itemLabel?: string) {
        super(app);
        this.summary = summaryLines;
        this.accent = accent;
        this.itemLabel = itemLabel || 'scene';
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        this.closed = false;
        contentEl.empty();
        
        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = 'min(660px, 90vw)'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }

        this.scope.register([], 'Escape', () => {
            if (this.phase === 'confirm') {
                this.resolveBegin(false);
                this.close();
            }
            return false;
        });

        this.backdropGuard = (evt: MouseEvent) => {
            if (this.phase === 'confirm') return;
            if (evt.target === this.containerEl) {
                evt.preventDefault();
                evt.stopPropagation();
                evt.stopImmediatePropagation();
            }
        };
        this.containerEl.addEventListener('mousedown', this.backdropGuard, true);
        this.containerEl.addEventListener('click', this.backdropGuard, true);

        contentEl.addClass('ert-modal-container', 'rt-drag-confirm-modal', 'ert-stack');
        
        // Use the passed accent color (subplot color)
        if (this.accent) {
            contentEl.style.setProperty('--rt-confirm-accent', this.accent);
        }

        // Header — differentiates between scene and beat moves
        const capitalLabel = this.itemLabel.charAt(0).toUpperCase() + this.itemLabel.slice(1);
        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: `Reorder ${capitalLabel}` });
        header.createDiv({ cls: 'ert-modal-title', text: `Confirm ${this.itemLabel} reorder` });

        const listDiv = contentEl.createDiv({ cls: 'rt-drag-confirm-list' });

        // Render each line as a styled card with icon
        this.summary.forEach((line, index) => {
            const row = listDiv.createDiv({ cls: 'rt-drag-confirm-row' });

            // Icon container
            const iconContainer = row.createDiv({ cls: 'rt-drag-confirm-row-icon' });

            // Assign specific icons based on list index
            if (index === 0) {
                this.setIcon(iconContainer, ICON_SHUFFLE);
            } else if (index === 1) {
                this.setIcon(iconContainer, ICON_LIST_ORDERED);
            } else {
                this.setIcon(iconContainer, ICON_BLOCKS);
            }

            // Text content
            row.createDiv({ cls: 'rt-drag-confirm-row-text', text: line });
        });

        const statusRow = listDiv.createDiv({ cls: 'rt-drag-confirm-row is-status-row is-hidden' });
        const statusIcon = statusRow.createDiv({ cls: 'rt-drag-confirm-row-icon' });
        this.setIcon(statusIcon, ICON_LIST_ORDERED);
        this.statusTextEl = statusRow.createDiv({ cls: 'rt-drag-confirm-row-text ert-drag-confirm-status-text' });
        this.statusTextEl.setText('Preparing reorder...');
        this.statusRowEl = statusRow;

        const buttons = contentEl.createDiv({ cls: 'ert-modal-actions' });
        const primaryBtn = buttons.createEl('button', { text: 'Begin', cls: 'rt-mod-cta' });
        const cancelBtn = buttons.createEl('button', { text: 'Cancel' });
        this.primaryButtonEl = primaryBtn;
        this.cancelButtonEl = cancelBtn;

        primaryBtn.addEventListener('click', () => {
            if (this.phase === 'confirm') {
                this.phase = 'running';
                this.setCloseControlDisabled(true);
                this.showStatusRow('is-live');
                if (this.primaryButtonEl) {
                    this.primaryButtonEl.disabled = true;
                    this.primaryButtonEl.textContent = 'Working...';
                }
                if (this.cancelButtonEl) {
                    this.cancelButtonEl.classList.add('is-hidden-action');
                }
                this.resolveBegin(true);
                return;
            }

            if (this.phase === 'done') {
                this.resolveDismiss();
                this.close();
            }
        });

        cancelBtn.addEventListener('click', () => {
            if (this.phase !== 'confirm') return;
            this.resolveBegin(false);
            this.close();
        });
    }

    private setIcon(container: HTMLElement, svgString: string): void {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgString, 'image/svg+xml');
        if (doc.documentElement) {
            container.empty();
            container.appendChild(document.importNode(doc.documentElement, true));
        }
    }

    onClose(): void {
        if (this.backdropGuard) {
            this.containerEl.removeEventListener('mousedown', this.backdropGuard, true);
            this.containerEl.removeEventListener('click', this.backdropGuard, true);
            this.backdropGuard = null;
        }
        this.closed = true;
        this.resolveBegin(false);
        this.resolveDismiss();
        this.setCloseControlDisabled(false);
        this.contentEl.empty();
    }

    async waitForBegin(): Promise<boolean> {
        return await new Promise<boolean>((resolve) => {
            this.beginResolver = resolve;
            this.open();
        });
    }

    updateProgress(message: string): void {
        if (this.closed || this.phase !== 'running') return;
        this.showStatusRow('is-live');
        this.statusTextEl?.setText(message);
    }

    async finishWithDismiss(message: string, isError: boolean = false): Promise<void> {
        if (this.closed) return;
        this.phase = 'done';
        this.showStatusRow(isError ? 'is-error' : 'is-complete');
        this.statusTextEl?.setText(message);
        this.setCloseControlDisabled(true);
        if (this.cancelButtonEl) {
            this.cancelButtonEl.classList.add('is-hidden-action');
        }
        if (this.primaryButtonEl) {
            this.primaryButtonEl.disabled = false;
            this.primaryButtonEl.textContent = 'Dismiss';
        }

        await new Promise<void>((resolve) => {
            this.dismissResolver = resolve;
        });
    }

    private showStatusRow(stateClass: 'is-live' | 'is-complete' | 'is-error'): void {
        if (!this.statusRowEl) return;
        this.statusRowEl.classList.remove('is-hidden', 'is-live', 'is-complete', 'is-error');
        this.statusRowEl.classList.add(stateClass);
    }

    private setCloseControlDisabled(disabled: boolean): void {
        const closeBtn = this.modalEl.querySelector<HTMLElement>('.modal-close-button');
        if (!closeBtn) return;
        closeBtn.classList.toggle('is-locked-close', disabled);
    }

    private resolveBegin(value: boolean): void {
        const resolver = this.beginResolver;
        this.beginResolver = null;
        resolver?.(value);
    }

    private resolveDismiss(): void {
        const resolver = this.dismissResolver;
        this.dismissResolver = null;
        resolver?.();
    }
}
