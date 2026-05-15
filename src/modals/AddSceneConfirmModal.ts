import { App, Modal, setIcon } from 'obsidian';
import type { SceneInsertionPlan } from '../services/SceneInsertService';

function basename(path: string): string {
    return path.split('/').pop() ?? path;
}

export class AddSceneConfirmModal extends Modal {
    private resolver: ((confirmed: boolean) => void) | null = null;
    private resolved = false;

    constructor(app: App, private readonly plan: SceneInsertionPlan) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();
        this.resolved = false;

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = 'min(660px, 90vw)'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }

        this.scope.register([], 'Escape', () => {
            this.resolve(false);
            this.close();
            return false;
        });

        contentEl.addClass('ert-modal-container', 'ert-drag-confirm-modal', 'ert-stack');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Add Scene' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Confirm scene insert' });

        const listDiv = contentEl.createDiv({ cls: 'ert-drag-confirm-list' });
        const summarySection = listDiv.createDiv({ cls: 'ert-drag-confirm-section' });
        summarySection.createDiv({ cls: 'ert-drag-confirm-section-title', text: 'Scene insert summary' });

        this.addSummaryRow(summarySection, 'file-plus-2', `Add ${basename(this.plan.finalPath)} after ${this.plan.anchorBasename}`);

        const impactGrid = summarySection.createDiv({ cls: 'ert-drag-confirm-impact-grid' });
        this.createImpactCard(impactGrid, 'When', this.plan.when || 'Blank', 'calendar-clock');
        this.createImpactCard(impactGrid, 'Subplot', this.plan.subplotLabel, 'orbit');
        this.createImpactCard(impactGrid, 'YAML', this.plan.yamlMode, 'braces');
        this.createImpactCard(impactGrid, 'Numbering', this.plan.numberingMode, this.plan.usedRippleRename ? 'waves' : 'list-plus');

        const renameSection = listDiv.createDiv({ cls: 'ert-drag-confirm-section' });
        renameSection.createDiv({ cls: 'ert-drag-confirm-section-title', text: 'Filename impact' });
        if (this.plan.renamePreviews.length === 0) {
            this.addSummaryRow(renameSection, 'list-ordered', 'No existing scene or beat filenames will be renamed.');
        } else {
            this.addSummaryRow(renameSection, 'list-ordered', `${this.plan.renamePreviews.length} file${this.plan.renamePreviews.length === 1 ? '' : 's'} will be renamed.`);
            const frame = renameSection.createDiv({ cls: 'ert-drag-confirm-history-frame' });
            const list = frame.createDiv({ cls: 'ert-drag-confirm-history-list' });
            this.plan.renamePreviews.slice(0, 12).forEach((preview) => {
                const row = list.createDiv({ cls: 'ert-drag-confirm-history-item' });
                const rowHeader = row.createDiv({ cls: 'ert-drag-confirm-history-header' });
                const rowIcon = rowHeader.createDiv({ cls: 'ert-drag-confirm-history-icon' });
                setIcon(rowIcon, 'arrow-right-to-line');
                rowHeader.createDiv({
                    cls: 'ert-drag-confirm-history-summary',
                    text: `${basename(preview.fromPath)} -> ${basename(preview.toPath)}`
                });
            });
            const remaining = this.plan.renamePreviews.length - 12;
            if (remaining > 0) {
                list.createDiv({
                    cls: 'ert-drag-confirm-history-meta',
                    text: `And ${remaining} more...`
                });
            }
        }

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions' });
        const confirmButton = actions.createEl('button', { text: 'Add scene', cls: 'ert-mod-cta' });
        const cancelButton = actions.createEl('button', { text: 'Cancel' });
        confirmButton.addEventListener('click', () => {
            this.resolve(true);
            this.close();
        });
        cancelButton.addEventListener('click', () => {
            this.resolve(false);
            this.close();
        });
    }

    onClose(): void {
        this.resolve(false);
        this.contentEl.empty();
    }

    waitForConfirm(): Promise<boolean> {
        return new Promise((resolve) => {
            this.resolver = resolve;
            this.open();
        });
    }

    private addSummaryRow(container: HTMLElement, icon: string, text: string): void {
        const row = container.createDiv({ cls: 'ert-drag-confirm-row' });
        const iconEl = row.createDiv({ cls: 'ert-drag-confirm-row-icon' });
        setIcon(iconEl, icon);
        row.createDiv({ cls: 'ert-drag-confirm-row-text', text });
    }

    private createImpactCard(container: HTMLElement, label: string, value: string, icon: string): void {
        const card = container.createDiv({ cls: 'ert-drag-confirm-impact-card' });
        const iconContainer = card.createDiv({ cls: 'ert-drag-confirm-row-icon' });
        setIcon(iconContainer, icon);
        const text = card.createDiv({ cls: 'ert-drag-confirm-impact-text' });
        text.createDiv({ cls: 'ert-drag-confirm-impact-label', text: label });
        text.createDiv({ cls: 'ert-drag-confirm-impact-value', text: value });
    }

    private resolve(confirmed: boolean): void {
        if (this.resolved) return;
        this.resolved = true;
        this.resolver?.(confirmed);
        this.resolver = null;
    }
}
