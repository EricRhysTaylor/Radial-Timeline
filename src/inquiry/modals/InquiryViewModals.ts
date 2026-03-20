import {
    App,
    ButtonComponent,
    Modal,
    ToggleComponent,
    setTooltip
} from 'obsidian';
import type { AIRunAdvancedContext } from '../../ai/types';
import { redactSensitiveValue } from '../../ai/credentials/redactSensitive';
import { SIGMA_CHAR } from '../constants/inquiryUi';
import type {
    InquiryOmnibusModalOptions,
    InquiryOmnibusPlan,
    InquiryPurgePreviewItem,
    InquiryQuestion
} from '../types/inquiryViewTypes';
import type { InquiryScope, InquiryZone } from '../state';

export class InquiryPurgeConfirmationModal extends Modal {
    constructor(
        app: App,
        private totalScenes: number,
        private affectedScenes: InquiryPurgePreviewItem[],
        private scopeLabel: string,
        private onConfirm: () => Promise<void>
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-inquiry-modal-shell--compact');
        }

        contentEl.addClass('ert-modal-container', 'ert-stack');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Inquiry' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Purge Action Items' });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Removes Inquiry-generated action items from scene frontmatter.'
        });

        const panel = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass ert-stack' });

        const affectedCount = this.affectedScenes.length;
        if (affectedCount === 0) {
            panel.createDiv({
                cls: 'ert-inquiry-purge-message',
                text: `No Inquiry action items found in ${this.totalScenes} scene${this.totalScenes !== 1 ? 's' : ''} in ${this.scopeLabel}.`
            });
        } else {
            panel.createDiv({
                cls: 'ert-inquiry-purge-message',
                text: `Found Inquiry action items in ${affectedCount} of ${this.totalScenes} scene${this.totalScenes !== 1 ? 's' : ''} in ${this.scopeLabel}:`
            });

            const listContainer = panel.createDiv({ cls: 'ert-inquiry-purge-list-container' });
            const listEl = listContainer.createEl('ul', { cls: 'ert-inquiry-purge-list' });
            this.affectedScenes.forEach(item => {
                const li = listEl.createEl('li', { cls: 'ert-inquiry-purge-list-item' });
                li.createSpan({ cls: 'ert-inquiry-purge-list-label', text: item.label });
                li.createSpan({
                    cls: 'ert-inquiry-purge-list-count',
                    text: `${item.lineCount} item${item.lineCount !== 1 ? 's' : ''}`
                });
            });

            panel.createDiv({
                cls: 'ert-inquiry-purge-details',
                text: 'User-written notes in Pending Edits are preserved.'
            });
            panel.createDiv({
                cls: 'ert-inquiry-purge-warning',
                text: 'This cannot be undone.'
            });
        }

        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });
        if (affectedCount > 0) {
            new ButtonComponent(buttonRow)
                .setButtonText(`Purge ${affectedCount} scene${affectedCount !== 1 ? 's' : ''}`)
                .setWarning()
                .onClick(async () => {
                    this.close();
                    await this.onConfirm();
                });
        }
        new ButtonComponent(buttonRow)
            .setButtonText(affectedCount > 0 ? 'Cancel' : 'Close')
            .onClick(() => this.close());
    }

    onClose(): void {
        this.contentEl.empty();
    }
}

export class InquiryCancelRunModal extends Modal {
    private didResolve = false;

    constructor(
        app: App,
        private estimateLabel: string,
        private onResolve: (confirmed: boolean) => void,
        private onClosed?: () => void
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-inquiry-modal-shell--compact');
        }

        contentEl.addClass('ert-modal-container', 'ert-stack', 'ert-inquiry-cancel-modal');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Inquiry' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Cancel Inquiry Run?' });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Canceling discards this run after the current pass returns.'
        });

        if (this.estimateLabel.trim()) {
            contentEl.createDiv({
                cls: 'ert-inquiry-cancel-modal-estimate',
                text: `ETA: ${this.estimateLabel}.`
            });
        }
        contentEl.createDiv({
            cls: 'ert-inquiry-cancel-modal-copy',
            text: 'You can work in another note if this Inquiry tab stays open. Cancel means start over. No resume.'
        });

        const actions = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(actions)
            .setButtonText('Keep Running')
            .onClick(() => {
                this.resolveOnce(false);
                this.close();
            });
        new ButtonComponent(actions)
            .setButtonText('Cancel Run')
            .setWarning()
            .onClick(() => {
                this.resolveOnce(true);
                this.close();
            });
    }

    onClose(): void {
        this.contentEl.empty();
        this.onClosed?.();
        this.resolveOnce(false);
    }

    private resolveOnce(confirmed: boolean): void {
        if (this.didResolve) return;
        this.didResolve = true;
        this.onResolve(confirmed);
    }
}

export class InquiryOmnibusModal extends Modal {
    private didResolve = false;
    private selectedScope: InquiryScope;
    private createIndex = true;
    private runDisabledReason?: string | null;
    private isRunning = false;
    private abortRequested = false;
    private progressEl?: HTMLDivElement;
    private progressTextEl?: HTMLDivElement;
    private progressMicroEl?: HTMLDivElement;
    private configPanel?: HTMLDivElement;
    private actionsEl?: HTMLDivElement;
    private resultEl?: HTMLDivElement;
    private aiAdvancedPreEl?: HTMLPreElement;
    private aiAdvancedContext: AIRunAdvancedContext | null = null;

    constructor(
        app: App,
        private options: InquiryOmnibusModalOptions,
        private onResolve: (result: InquiryOmnibusPlan | null) => void
    ) {
        super(app);
        this.selectedScope = options.initialScope;
        this.runDisabledReason = options.runDisabledReason;
    }

    onOpen(): void {
        const { contentEl, modalEl } = this;
        contentEl.empty();

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-inquiry-modal-shell--wide');
        }

        contentEl.addClass('ert-modal-container', 'ert-stack');

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Inquiry' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Run Omnibus Pass' });
        header.createDiv({ cls: 'ert-modal-subtitle', text: 'Runs all enabled Inquiry questions for the selected scope.' });

        this.configPanel = contentEl.createDiv({ cls: 'ert-omnibus-config-panel ert-stack' });
        this.renderConfigPanel();

        this.progressEl = contentEl.createDiv({ cls: 'ert-omnibus-progress-panel ert-stack is-hidden' });

        this.resultEl = contentEl.createDiv({ cls: 'ert-omnibus-result-panel is-hidden' });

        this.actionsEl = contentEl.createDiv({ cls: 'ert-modal-actions' });
        this.renderConfigActions();
    }

    private renderConfigPanel(): void {
        if (!this.configPanel) return;
        this.configPanel.empty();

        const howSection = this.configPanel.createDiv({ cls: 'ert-omnibus-how-section' });
        howSection.createDiv({ cls: 'ert-omnibus-how-title', text: 'How this run works' });
        const howList = howSection.createEl('ul', { cls: 'ert-omnibus-how-list' });
        howList.createEl('li', { text: 'Load corpus once for the selected scope' });
        howList.createEl('li', { text: 'Run questions sequentially against that shared context' });
        howList.createEl('li', { text: 'Save results incrementally (Brief + Log per question)' });
        howList.createEl('li', { text: 'Safe to stop: abort at any time; completed results remain saved' });

        const prior = this.options.priorProgress;
        if (prior) {
            const resumeNote = this.configPanel.createDiv({ cls: 'ert-omnibus-resume-note' });
            resumeNote.setText(`Last run stopped after question ${prior.completedQuestionIds.length} of ${prior.totalQuestions}.`);
            if (this.options.resumeUnavailableReason) {
                const configNote = resumeNote.createDiv({ cls: 'ert-field-note' });
                configNote.setText(`Resume unavailable: ${this.options.resumeUnavailableReason}`);
            }
        }

        const panel = this.configPanel.createDiv({ cls: 'ert-panel ert-panel--glass ert-stack' });

        const summaryGrid = panel.createDiv({ cls: 'ert-apr-status-grid ert-omnibus-summary-grid' });
        const summaryHeaderRow = summaryGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--header' });
        ['Scope', 'Questions', 'Provider', 'Index'].forEach(label => {
            summaryHeaderRow.createDiv({
                text: label,
                cls: 'ert-apr-status-cell ert-apr-status-cell--header'
            });
        });

        const summaryRow = summaryGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--data' });
        const scopeCell = summaryRow.createDiv({ cls: 'ert-apr-status-cell' });
        const scopePillRow = scopeCell.createDiv({ cls: 'ert-inline' });
        const bookPill = scopePillRow.createEl('button', {
            cls: 'ert-badgePill ert-badgePill--sm ert-omnibus-pill',
            text: `Book (${this.options.bookLabel})`,
            type: 'button'
        });
        const sagaPill = scopePillRow.createEl('button', {
            cls: 'ert-badgePill ert-badgePill--sm ert-omnibus-pill',
            text: `Saga (${SIGMA_CHAR})`,
            type: 'button'
        });

        const totalCell = summaryRow.createDiv({ cls: 'ert-apr-status-cell' });
        totalCell.createSpan({
            cls: 'ert-badgePill ert-badgePill--sm',
            text: `${this.options.questions.length} questions`
        });

        const providerCell = summaryRow.createDiv({ cls: 'ert-apr-status-cell' });
        const providerPill = providerCell.createSpan({
            cls: 'ert-badgePill ert-badgePill--sm',
            text: this.options.providerLabel
        });
        setTooltip(providerPill, this.options.providerSummary);

        const indexCell = summaryRow.createDiv({ cls: 'ert-apr-status-cell' });
        const indexRow = indexCell.createDiv({ cls: 'ert-inline' });
        const indexToggle = new ToggleComponent(indexRow);
        indexToggle.setValue(this.createIndex);
        indexToggle.onChange(value => {
            this.createIndex = value;
        });
        indexRow.createSpan({ text: 'Index note' });

        panel.createDiv({ cls: 'ert-divider' });

        const questionGrid = panel.createDiv({ cls: 'ert-apr-status-grid ert-omnibus-question-grid' });
        const questionHeaderRow = questionGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--header' });
        ['Zone', 'Question', 'Lens', 'Scope', 'Status'].forEach(label => {
            questionHeaderRow.createDiv({
                text: label,
                cls: 'ert-apr-status-cell ert-apr-status-cell--header'
            });
        });

        const scopePills: HTMLSpanElement[] = [];
        const getScopeLabel = (scope: InquiryScope): string =>
            scope === 'saga' ? `Saga (${SIGMA_CHAR})` : `Book (${this.options.bookLabel})`;

        const updateScopeSelection = (scope: InquiryScope): void => {
            this.selectedScope = scope;
            const scopeLabel = getScopeLabel(scope);
            scopePills.forEach(pill => pill.setText(scopeLabel));
            bookPill.classList.toggle('is-active', scope === 'book');
            sagaPill.classList.toggle('is-active', scope === 'saga');
            bookPill.setAttribute('aria-pressed', scope === 'book' ? 'true' : 'false');
            sagaPill.setAttribute('aria-pressed', scope === 'saga' ? 'true' : 'false');
        };

        bookPill.addEventListener('click', () => updateScopeSelection('book'));
        sagaPill.addEventListener('click', () => updateScopeSelection('saga'));
        updateScopeSelection(this.selectedScope);

        const lensLabel = 'Flow + Depth';
        const zoneOrder: InquiryZone[] = ['setup', 'pressure', 'payoff'];
        zoneOrder.forEach(zone => {
            const zoneQuestions = this.options.questions.filter(question => question.zone === zone);
            if (!zoneQuestions.length) return;
            const zoneLabel = zone === 'setup' ? 'Setup' : zone === 'pressure' ? 'Pressure' : 'Payoff';
            const groupRow = questionGrid.createDiv({ cls: 'ert-apr-status-row' });
            groupRow.createDiv({ cls: 'ert-apr-status-cell ert-omnibus-group', text: zoneLabel });

            zoneQuestions.forEach(question => {
                const dataRow = questionGrid.createDiv({ cls: 'ert-apr-status-row ert-apr-status-row--data' });

                const zoneCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
                zoneCell.createSpan({ cls: 'ert-badgePill ert-badgePill--sm', text: zoneLabel });

                const questionCell = dataRow.createDiv({ cls: 'ert-apr-status-cell ert-omnibus-question-cell' });
                const questionText = questionCell.createSpan({ cls: 'ert-omnibus-question', text: question.question });
                setTooltip(questionText, question.question);

                const lensCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
                lensCell.createSpan({ cls: 'ert-badgePill ert-badgePill--sm', text: lensLabel });

                const scopeCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
                const scopePill = scopeCell.createSpan({
                    cls: 'ert-badgePill ert-badgePill--sm',
                    text: getScopeLabel(this.selectedScope)
                });
                scopePills.push(scopePill);

                const statusCell = dataRow.createDiv({ cls: 'ert-apr-status-cell' });
                statusCell.createSpan({ cls: 'ert-badgePill ert-badgePill--sm', text: 'Brief + Log' });
            });
        });

        if (this.runDisabledReason) {
            const reason = this.configPanel.createDiv({ cls: 'ert-field-note' });
            reason.setText(`Run disabled: ${this.runDisabledReason}`);
        }

        const totalQuestions = this.options.questions.length;
        const briefLabel = totalQuestions === 1 ? 'Brief' : 'Briefs';
        const logLabel = totalQuestions === 1 ? 'Log' : 'Logs';
        const logsDisabledNote = this.options.logsEnabled ? '' : ' Logs are disabled in settings.';
        const volumeLine = this.configPanel.createDiv({ cls: 'ert-field-note' });
        volumeLine.setText(`This will generate ${totalQuestions} Inquiry ${briefLabel} and ${totalQuestions} ${logLabel}.${logsDisabledNote}`);
    }

    private renderConfigActions(): void {
        if (!this.actionsEl) return;
        this.actionsEl.empty();

        const prior = this.options.priorProgress;
        if (prior && this.options.resumeAvailable) {
            const resumeBtn = new ButtonComponent(this.actionsEl)
                .setButtonText('Resume Omnibus')
                .setCta();
            if (this.runDisabledReason) {
                resumeBtn.setDisabled(true);
            }
            resumeBtn.onClick(() => {
                if (this.runDisabledReason) return;
                this.resolveOnce({ scope: this.selectedScope, createIndex: this.createIndex, resume: true });
                this.switchToRunning();
            });
            setTooltip(resumeBtn.buttonEl, 'Resends corpus and runs remaining questions.');
        }

        const runButton = new ButtonComponent(this.actionsEl)
            .setButtonText(prior && this.options.resumeAvailable ? 'Restart Omnibus' : 'Run Omnibus')
            .setCta();
        if (this.runDisabledReason) {
            runButton.setDisabled(true);
        }
        runButton.onClick(() => {
            if (this.runDisabledReason) return;
            this.resolveOnce({ scope: this.selectedScope, createIndex: this.createIndex });
            this.switchToRunning();
        });

        new ButtonComponent(this.actionsEl)
            .setButtonText('Cancel')
            .onClick(() => {
                this.resolveOnce(null);
                this.close();
            });
    }

    switchToRunning(): void {
        this.isRunning = true;
        this.setHidden(this.configPanel, true);
        if (this.progressEl) {
            this.setHidden(this.progressEl, false);
            this.progressEl.empty();
            this.progressEl.createDiv({ cls: 'ert-omnibus-progress-title', text: 'Running Omnibus Pass...' });
            this.progressTextEl = this.progressEl.createDiv({ cls: 'ert-omnibus-progress-text' });
            this.progressTextEl.setText('Preparing...');
            this.progressMicroEl = this.progressEl.createDiv({ cls: 'ert-omnibus-progress-micro ert-field-note' });
            const advancedDetails = this.progressEl.createEl('details', { cls: 'ert-ai-advanced-details' });
            advancedDetails.createEl('summary', { text: 'AI Prompt & Context (Advanced)' });
            this.aiAdvancedPreEl = advancedDetails.createEl('pre', { cls: 'ert-ai-advanced-pre' });
            this.renderAiAdvancedContext();
        }
        if (this.actionsEl) {
            this.actionsEl.empty();
            new ButtonComponent(this.actionsEl)
                .setButtonText('Abort Run')
                .onClick(() => {
                    this.abortRequested = true;
                    if (this.progressMicroEl) {
                        this.progressMicroEl.setText('Stopping after current question...');
                    }
                });
        }
    }

    updateProgress(current: number, total: number, zone: string, questionLabel: string, micro?: string): void {
        if (this.progressTextEl) {
            this.progressTextEl.setText(`Question ${current} of ${total}`);
        }
        if (this.progressMicroEl && !this.abortRequested) {
            this.progressMicroEl.setText(micro ?? `${zone} · ${questionLabel}`);
        }
    }

    setAiAdvancedContext(context: AIRunAdvancedContext | null): void {
        this.aiAdvancedContext = context;
        this.renderAiAdvancedContext();
    }

    private renderAiAdvancedContext(): void {
        if (!this.aiAdvancedPreEl) return;
        if (!this.aiAdvancedContext) {
            this.aiAdvancedPreEl.setText('Waiting for first AI request...');
            return;
        }
        const ctx = this.aiAdvancedContext;
        const lines = [
            `Role template: ${ctx.roleTemplateName}`,
            `Resolved model: ${ctx.provider} -> ${ctx.modelAlias} (${ctx.modelLabel})`,
            `Model selection reason: ${redactSensitiveValue(ctx.modelSelectionReason)}`,
            `Availability: ${ctx.availabilityStatus === 'visible' ? 'Visible to your key ✅' : ctx.availabilityStatus === 'not_visible' ? 'Not visible ⚠️' : 'Unknown (snapshot unavailable)'}`,
            `Applied caps: input=${ctx.maxInputTokens}, output=${ctx.maxOutputTokens}`,
            `Packaging: ${ctx.analysisPackaging === 'singlePassOnly' ? 'Single-pass only' : ctx.analysisPackaging === 'segmented' ? 'Segmented' : 'Automatic'}`,
            '',
            'Feature mode instructions:',
            redactSensitiveValue(ctx.featureModeInstructions || '(none)'),
            '',
            'Final composed prompt:',
            redactSensitiveValue(ctx.finalPrompt || '(none)')
        ];
        if (typeof ctx.executionPassCount === 'number' && ctx.executionPassCount > 1) {
            lines.splice(6, 0, `Pass count: ${ctx.executionPassCount}`);
        }
        if (ctx.packagingTriggerReason) {
            lines.splice(7, 0, `Packaging trigger: ${redactSensitiveValue(ctx.packagingTriggerReason)}`);
        }
        this.aiAdvancedPreEl.setText(lines.join('\n'));
    }

    showResult(completed: number, total: number, aborted: boolean): void {
        this.isRunning = false;
        this.setHidden(this.progressEl, true);
        if (this.resultEl) {
            this.setHidden(this.resultEl, false);
            this.resultEl.empty();
            const briefLabel = completed === 1 ? 'Brief' : 'Briefs';
            const logLabel = completed === 1 ? 'Log' : 'Logs';
            if (aborted) {
                this.resultEl.createDiv({
                    cls: 'ert-omnibus-result-text',
                    text: `Omnibus pass stopped. ${completed} of ${total} completed.`
                });
            } else {
                this.resultEl.createDiv({
                    cls: 'ert-omnibus-result-text',
                    text: `Omnibus pass complete. ${completed} Inquiry ${briefLabel} and ${completed} ${logLabel} created.`
                });
            }
        }
        if (this.actionsEl) {
            this.actionsEl.empty();
            new ButtonComponent(this.actionsEl)
                .setButtonText('Close')
                .setCta()
                .onClick(() => this.close());
        }
    }

    isAbortRequested(): boolean {
        return this.abortRequested;
    }

    onClose(): void {
        this.resolveOnce(null);
    }

    private resolveOnce(result: InquiryOmnibusPlan | null): void {
        if (this.didResolve) return;
        this.didResolve = true;
        this.onResolve(result);
    }

    private setHidden(el: HTMLElement | undefined, hidden: boolean): void {
        if (!el) return;
        el.classList.toggle('is-hidden', hidden);
    }
}
