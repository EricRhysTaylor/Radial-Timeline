/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Timeline Auditor Modal
 */

import { App, ButtonComponent, Modal, Notice, ToggleComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { applyAuditFindings } from '../timelineAudit/apply';
import { runAuditPipeline } from '../timelineAudit/AuditPipeline';
import { buildTimelineOverviewEntries, scrollFindingCardIntoView } from '../timelineAudit/TimelineOverviewStrip';
import type { TimelineAuditFinding, TimelineAuditPipelineConfig, TimelineAuditResult } from '../timelineAudit/types';

type FindingFilter =
    | 'all'
    | 'contradictions'
    | 'missing_when'
    | 'summary_body_disagreement'
    | 'continuity_problems'
    | 'ai_suggested'
    | 'unresolved';

export class TimelineAuditModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;

    private result: TimelineAuditResult | null = null;
    private running = false;
    private runContinuityPass = true;
    private runAiInference = false;
    private filter: FindingFilter = 'all';
    private abortController: AbortController | null = null;
    private readonly findingCardEls = new Map<string, HTMLElement>();

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen(): Promise<void> {
        const { contentEl, titleEl, modalEl } = this;
        titleEl.setText('');

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'rt-timeline-audit-modal-shell');
            modalEl.style.width = '960px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '96vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }

        contentEl.addClass('ert-modal-container', 'ert-stack', 'rt-timeline-audit-modal');
        await this.runAudit();
    }

    onClose(): void {
        this.abortController?.abort();
    }

    private getConfig(): TimelineAuditPipelineConfig {
        return {
            runDeterministicPass: true,
            runContinuityPass: this.runContinuityPass,
            runAiInference: this.runAiInference,
            chronologyWindow: 2,
            bodyExcerptChars: 2600
        };
    }

    private async runAudit(): Promise<void> {
        this.running = true;
        this.abortController?.abort();
        this.abortController = new AbortController();
        this.render();

        try {
            this.result = await runAuditPipeline(this.plugin, this.getConfig(), {
                abortSignal: this.abortController.signal
            });
        } catch (error) {
            if (!this.abortController.signal.aborted) {
                new Notice(`Timeline audit failed: ${error instanceof Error ? error.message : String(error)}`);
            }
        } finally {
            this.running = false;
            this.render();
        }
    }

    private render(): void {
        const { contentEl } = this;
        contentEl.empty();

        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Timeline Audit' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Evidence-based timeline diagnosis' });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Diagnose where manuscript evidence and YAML chronology disagree. Conservative by default.'
        });

        if (this.running) {
            const loadingCard = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass rt-timeline-audit-loading' });
            loadingCard.createDiv({ cls: 'rt-timeline-audit-loading-title', text: 'Running timeline audit…' });
            loadingCard.createDiv({
                cls: 'rt-timeline-audit-loading-copy',
                text: 'Deterministic checks run first, continuity checks run next, and AI stays off unless you enable it.'
            });

            const actionRow = contentEl.createDiv({ cls: 'ert-modal-actions' });
            new ButtonComponent(actionRow)
                .setButtonText('Abort')
                .setWarning()
                .onClick(() => {
                    this.abortController?.abort();
                    this.running = false;
                    this.render();
                });
            return;
        }

        if (!this.result) {
            const emptyCard = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass rt-timeline-audit-loading' });
            emptyCard.createDiv({ text: 'No audit results available.' });
            return;
        }

        const book = this.plugin.getActiveBook();
        const statsCard = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass rt-timeline-audit-stats' });
        const scopeRow = statsCard.createDiv({ cls: 'rt-timeline-audit-scope' });
        scopeRow.createSpan({
            cls: 'rt-timeline-audit-scope-book',
            text: this.plugin.getActiveBookTitle()
        });
        scopeRow.createSpan({
            cls: 'rt-timeline-audit-scope-path',
            text: book?.sourceFolder?.trim() || this.plugin.settings.sourcePath || 'Entire vault'
        });

        const statsGrid = statsCard.createDiv({ cls: 'rt-timeline-audit-stats-grid' });
        this.createStat(statsGrid, 'Total scenes', String(this.result.stats.totalScenes));
        this.createStat(statsGrid, 'Aligned', String(this.result.stats.aligned));
        this.createStat(statsGrid, 'Warnings', String(this.result.stats.warnings));
        this.createStat(statsGrid, 'Contradictions', String(this.result.stats.contradictions));
        this.createStat(statsGrid, 'Missing When', String(this.result.stats.missingWhen));

        const findings = this.getFilteredFindings();
        this.renderTimelineOverview(contentEl, findings);

        const controlsCard = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass rt-timeline-audit-controls' });
        controlsCard.createDiv({ cls: 'rt-timeline-audit-controls-title', text: 'Audit controls' });
        const controlsRow = controlsCard.createDiv({ cls: 'rt-timeline-audit-toggle-row' });
        this.createToggle(controlsRow, 'Continuity pass', this.runContinuityPass, (value) => {
            this.runContinuityPass = value;
        });
        this.createToggle(controlsRow, 'AI inference', this.runAiInference, (value) => {
            this.runAiInference = value;
        });

        const filterRow = contentEl.createDiv({ cls: 'rt-timeline-audit-filter-row' });
        this.createFilterPill(filterRow, 'All', 'all');
        this.createFilterPill(filterRow, 'Contradictions', 'contradictions');
        this.createFilterPill(filterRow, 'Missing When', 'missing_when');
        this.createFilterPill(filterRow, 'Summary/body disagreement', 'summary_body_disagreement');
        this.createFilterPill(filterRow, 'Continuity problems', 'continuity_problems');
        this.createFilterPill(filterRow, 'AI-suggested', 'ai_suggested');
        this.createFilterPill(filterRow, 'Unresolved', 'unresolved');

        const findingsList = contentEl.createDiv({ cls: 'rt-timeline-audit-findings' });
        this.findingCardEls.clear();

        if (findings.length === 0) {
            const emptyState = findingsList.createDiv({ cls: 'rt-timeline-audit-empty ert-panel ert-panel--glass' });
            emptyState.createDiv({ text: 'No findings match the current filter.' });
        } else {
            for (const finding of findings) {
                this.renderFindingCard(findingsList, finding);
            }
        }

        const actionRow = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(actionRow)
            .setButtonText('Refresh audit')
            .onClick(() => {
                void this.runAudit();
            });

        new ButtonComponent(actionRow)
            .setButtonText('Apply review decisions')
            .setCta()
            .onClick(() => {
                void this.applyDecisions();
            });

        new ButtonComponent(actionRow)
            .setButtonText('Close')
            .onClick(() => this.close());
    }

    private createStat(container: HTMLElement, label: string, value: string): void {
        const item = container.createDiv({ cls: 'rt-timeline-audit-stat' });
        item.createDiv({ cls: 'rt-timeline-audit-stat-value', text: value });
        item.createDiv({ cls: 'rt-timeline-audit-stat-label', text: label });
    }

    private createToggle(
        container: HTMLElement,
        label: string,
        value: boolean,
        onChange: (value: boolean) => void
    ): void {
        const row = container.createDiv({ cls: 'rt-timeline-audit-toggle' });
        row.createSpan({ cls: 'rt-timeline-audit-toggle-label', text: label });
        const toggle = new ToggleComponent(row);
        toggle.setValue(value);
        toggle.onChange(onChange);
    }

    private createFilterPill(container: HTMLElement, label: string, value: FindingFilter): void {
        const pill = container.createDiv({ cls: 'rt-timeline-audit-filter-pill' });
        if (this.filter === value) {
            pill.addClass('rt-is-active');
        }
        pill.setText(label);
        pill.addEventListener('click', () => {
            this.filter = value;
            this.render();
        });
    }

    private renderTimelineOverview(container: HTMLElement, findings: TimelineAuditFinding[]): void {
        const overviewCard = container.createDiv({ cls: 'ert-panel ert-panel--glass rt-timeline-audit-overview' });
        overviewCard.createDiv({ cls: 'rt-timeline-audit-overview-title', text: 'Timeline overview' });

        if (findings.length === 0) {
            overviewCard.createDiv({
                cls: 'rt-timeline-audit-overview-empty',
                text: 'No scenes match the current filter.'
            });
            return;
        }

        const strip = overviewCard.createDiv({ cls: 'rt-timeline-audit-overview-strip' });
        for (const entry of buildTimelineOverviewEntries(findings)) {
            const block = strip.createEl('button', {
                cls: `rt-timeline-audit-overview-block rt-timeline-audit-overview-block--${entry.severity}`,
                text: `S${entry.finding.manuscriptOrderIndex + 1}`
            });
            block.type = 'button';
            block.title = `${entry.finding.title}\n${entry.issueSummary}`;
            block.setAttr('aria-label', `${entry.finding.title}: ${entry.issueSummary}`);
            block.addEventListener('click', () => {
                scrollFindingCardIntoView(this.findingCardEls, entry.finding.path);
            });
        }
    }

    private getFilteredFindings(): TimelineAuditFinding[] {
        if (!this.result) return [];

        return this.result.findings.filter((finding) => {
            switch (this.filter) {
                case 'contradictions':
                    return finding.status === 'contradiction';
                case 'missing_when':
                    return finding.whenParseIssue === 'missing_when';
                case 'summary_body_disagreement':
                    return finding.issues.some((issue) => issue.type === 'summary_body_disagree');
                case 'continuity_problems':
                    return finding.issues.some((issue) =>
                        issue.type === 'continuity_conflict'
                        || issue.type === 'relative_order_conflict'
                        || issue.type === 'impossible_sequence'
                    );
                case 'ai_suggested':
                    return finding.aiSuggested;
                case 'unresolved':
                    return finding.unresolved;
                case 'all':
                default:
                    return true;
            }
        });
    }

    private renderFindingCard(container: HTMLElement, finding: TimelineAuditFinding): void {
        const card = container.createDiv({ cls: 'ert-panel ert-panel--glass rt-timeline-audit-card' });
        card.addClass(`rt-timeline-audit-card--${finding.status}`);
        card.tabIndex = -1;
        this.findingCardEls.set(finding.path, card);

        const titleRow = card.createDiv({ cls: 'rt-timeline-audit-card-title-row' });
        titleRow.createDiv({
            cls: 'rt-timeline-audit-card-title',
            text: `#${finding.manuscriptOrderIndex + 1} ${finding.title}`
        });
        titleRow.createDiv({
            cls: 'rt-timeline-audit-card-status',
            text: finding.status
        });

        const issueRow = card.createDiv({ cls: 'rt-timeline-audit-badge-row' });
        for (const issue of finding.issues) {
            issueRow.createSpan({
                cls: `rt-timeline-audit-badge rt-timeline-audit-badge--${issue.severity}`,
                text: issue.type
            });
        }

        const sourceRow = card.createDiv({ cls: 'rt-timeline-audit-badge-row' });
        const detectionSources = Array.from(new Set([
            ...finding.issues.map((issue) => issue.detectionSource),
            ...finding.evidence.map((evidence) => evidence.detectionSource)
        ]));
        detectionSources.forEach((source) => {
            sourceRow.createSpan({
                cls: 'rt-timeline-audit-source-badge',
                text: this.formatDetectionSource(source)
            });
        });

        const qaGrid = card.createDiv({ cls: 'rt-timeline-audit-qa-grid' });
        this.createQuestionBlock(qaGrid, 'What YAML currently says', [
            `When: ${this.describeCurrentWhen(finding)}`,
            `Chronology position: ${finding.expectedChronologyPosition ?? 'Not placed'}`
        ]);
        this.createQuestionBlock(qaGrid, 'What the manuscript implies', [
            finding.inferredWrittenTimelinePosition?.label ?? 'No reliable alternate timeline position inferred.',
            finding.suggestedWhen ? `Suggested When: ${this.formatWhen(finding.suggestedWhen)}` : 'No safe replacement When suggested.'
        ]);
        this.createQuestionBlock(qaGrid, 'Why this was flagged', [
            finding.rationale || 'No rationale recorded.'
        ]);
        this.createQuestionBlock(qaGrid, 'What the author can do', [
            finding.safeApplyEligible
                ? 'Apply the suggested When, keep YAML as-is, or mark for review.'
                : 'Keep YAML as-is or mark for review. Apply is disabled until evidence is safer.'
        ]);

        const evidenceList = card.createDiv({ cls: 'rt-timeline-audit-evidence-list' });
        if (finding.evidence.length === 0) {
            evidenceList.createDiv({ cls: 'rt-timeline-audit-evidence-empty', text: 'No evidence snippets captured.' });
        } else {
            for (const evidence of finding.evidence.slice(0, 4)) {
                const evidenceItem = evidenceList.createDiv({ cls: 'rt-timeline-audit-evidence-item' });
                evidenceItem.createSpan({
                    cls: 'rt-timeline-audit-evidence-label',
                    text: `${this.formatEvidenceSource(evidence.source)} · ${evidence.tier}`
                });
                evidenceItem.createSpan({
                    cls: 'rt-timeline-audit-evidence-snippet',
                    text: evidence.snippet
                });
            }
        }

        const actionRow = card.createDiv({ cls: 'rt-timeline-audit-card-actions' });
        const applyButton = new ButtonComponent(actionRow)
            .setButtonText('Apply')
            .setDisabled(!finding.safeApplyEligible)
            .onClick(() => {
                finding.reviewAction = 'apply';
                finding.unresolved = false;
                this.render();
            });
        if (finding.reviewAction === 'apply') {
            applyButton.setCta();
        }

        const keepButton = new ButtonComponent(actionRow)
            .setButtonText('Keep')
            .onClick(() => {
                finding.reviewAction = 'keep';
                finding.unresolved = finding.status !== 'aligned';
                this.render();
            });
        if (finding.reviewAction === 'keep') {
            keepButton.setCta();
        }

        const markReviewButton = new ButtonComponent(actionRow)
            .setButtonText('Mark review')
            .onClick(() => {
                finding.reviewAction = 'mark_review';
                finding.unresolved = true;
                this.render();
            });
        if (finding.reviewAction === 'mark_review') {
            markReviewButton.setCta();
        }
    }

    private createQuestionBlock(container: HTMLElement, title: string, lines: string[]): void {
        const block = container.createDiv({ cls: 'rt-timeline-audit-question-block' });
        block.createDiv({ cls: 'rt-timeline-audit-question-title', text: title });
        for (const line of lines) {
            block.createDiv({ cls: 'rt-timeline-audit-question-copy', text: line });
        }
    }

    private describeCurrentWhen(finding: TimelineAuditFinding): string {
        if (finding.whenParseIssue === 'missing_when') return 'Missing';
        if (finding.whenParseIssue === 'invalid_when') return `Invalid (${finding.currentWhenRaw ?? 'unknown'})`;
        return this.formatWhen(finding.currentWhen);
    }

    private formatWhen(value: Date | null): string {
        if (!(value instanceof Date) || Number.isNaN(value.getTime())) return 'Missing';
        const year = value.getFullYear();
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const day = String(value.getDate()).padStart(2, '0');
        const hour = String(value.getHours()).padStart(2, '0');
        const minute = String(value.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:${minute}`;
    }

    private formatEvidenceSource(source: string): string {
        switch (source) {
            case 'summary': return 'Summary';
            case 'synopsis': return 'Synopsis';
            case 'body': return 'Body';
            case 'neighbor': return 'Neighbor';
            case 'ai': return 'AI';
            default: return source;
        }
    }

    private formatDetectionSource(source: string): string {
        switch (source) {
            case 'deterministic': return 'Deterministic';
            case 'continuity': return 'Continuity';
            case 'ai': return 'AI';
            default: return source;
        }
    }

    private async applyDecisions(): Promise<void> {
        if (!this.result) return;

        try {
            const result = await applyAuditFindings(this.app, this.result.findings);
            if (result.failed > 0) {
                new Notice(`Applied timeline audit decisions with ${result.failed} failure(s).`);
            } else {
                new Notice('Applied timeline audit decisions.');
            }
            this.close();
        } catch (error) {
            new Notice(`Failed to apply timeline audit decisions: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

export default TimelineAuditModal;
