import { App, ButtonComponent, Modal, setIcon } from 'obsidian';
import { ERT_CLASSES } from '../ui/classes';

export interface ErtConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    badge?: { text: string; icon?: string };
}

class ErtConfirmModal extends Modal {
    private resolved = false;

    constructor(
        app: App,
        private readonly options: ErtConfirmOptions,
        private readonly onResolve: (confirmed: boolean) => void
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = 'min(480px, 92vw)'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }

        contentEl.addClass('ert-modal-container', 'ert-stack');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });

        if (this.options.badge) {
            const badge = header.createSpan({ cls: ERT_CLASSES.BADGE_PILL });
            if (this.options.badge.icon) {
                const badgeIcon = badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
                setIcon(badgeIcon, this.options.badge.icon);
            }
            badge.createSpan({ cls: ERT_CLASSES.BADGE_PILL_TEXT, text: this.options.badge.text });
        }

        header.createDiv({ cls: 'ert-modal-title', text: this.options.title });
        header.createDiv({ cls: 'ert-modal-subtitle', text: this.options.message });

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions' });

        const cancelButton = new ButtonComponent(actions)
            .setButtonText(this.options.cancelText ?? 'Cancel')
            .onClick(() => {
                this.resolved = true;
                this.close();
                this.onResolve(false);
            });
        cancelButton.buttonEl.addClass('ert-btn', 'ert-btn--standard-pro');

        const confirmButton = new ButtonComponent(actions)
            .setButtonText(this.options.confirmText ?? 'Continue')
            .onClick(() => {
                this.resolved = true;
                this.close();
                this.onResolve(true);
            });
        confirmButton.buttonEl.addClass('ert-btn', 'ert-btn--primary-pro');
    }

    onClose(): void {
        if (!this.resolved) {
            this.resolved = true;
            this.onResolve(false);
        }
        this.contentEl.empty();
    }
}

/**
 * Themed replacement for `window.confirm()` using the ERT modal shell.
 * Resolves true when the user clicks confirm, false on cancel/escape/dismiss.
 */
export function confirmWithErtModal(app: App, options: ErtConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => {
        new ErtConfirmModal(app, options, resolve).open();
    });
}
