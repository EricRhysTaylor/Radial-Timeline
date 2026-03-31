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
import {
    describeAuditIssue,
    getAuditDisplayTitle,
    formatAuditIssueLabel,
    formatAuditStatusLabel,
    getAuditFindingBadgeLabels,
    getAuditFindingPreviewSnippet,
    getInitialExpandedFindingPath
} from '../timelineAudit/presentation';
import {
    TIMELINE_AUDIT_AI_STATE_EVENT,
    buildTimelineAuditAiScopeKey,
    createTimelineAuditAiJobState,
    resolveTimelineAuditDisplayResult,
    type TimelineAuditAiJobState
} from '../services/TimelineAuditAiService';
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
    private filter: FindingFilter = 'all';
    private abortController: AbortController | null = null;
    private unsubscribeAiState: (() => void) | null = null;
    private aiState: TimelineAuditAiJobState = createTimelineAuditAiJobState();
    private expandedFindingPath: string | null = null;
    private hasAutoExpandedCurrentResult = false;
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
        this.aiState = this.plugin.getTimelineAuditAiService().getState(this.getAiScopeKey());
        this.unsubscribeAiState = this.plugin.subscribe<TimelineAuditAiJobState>(
            TIMELINE_AUDIT_AI_STATE_EVENT,
            () => {
                const previousStatus = this.aiState.status;
                this.aiState = this.plugin.getTimelineAuditAiService().getState(this.getAiScopeKey());
                if (this.aiState.status === 'completed' && previousStatus !== 'completed') {
                    this.expandedFindingPath = null;
                    this.hasAutoExpandedCurrentResult = false;
                }
                if (!this.running) {
                    this.render();
                }
            }
        );

        await this.runAudit();
    }

    onClose(): void {
        this.abortController?.abort();
        this.unsubscribeAiState?.();
        this.unsubscribeAiState = null;
    }

    private getConfig(): TimelineAuditPipelineConfig {
        return {
            runDeterministicPass: true,
            runContinuityPass: this.runContinuityPass,
            runAiInference: false,
            chronologyWindow: 2,
            bodyExcerptChars: 2600
        };
    }

    private getAiScopeKey(): string {
        return buildTimelineAuditAiScopeKey(this.plugin, this.runContinuityPass);
    }

    private getDisplayedResult(): TimelineAuditResult | null {
        return resolveTimelineAuditDisplayResult(this.result, this.aiState, this.getAiScopeKey());
    }

    private async runAudit(options: { invalidateAi?: boolean } = {}): Promise<void> {
        if (options.invalidateAi) {
            this.plugin.getTimelineAuditAiService().invalidate(this.getAiScopeKey());
        }

        this.aiState = this.plugin.getTimelineAuditAiService().getState(this.getAiScopeKey());
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
            this.expandedFindingPath = null;
            this.hasAutoExpandedCurrentResult = false;
            this.aiState = this.plugin.getTimelineAuditAiService().getState(this.getAiScopeKey());
            this.render();
        }
    }

    private startAiAudit(): void {
        const scopeKey = this.getAiScopeKey();
        void this.plugin.getTimelineAuditAiService().start(scopeKey, {
            runContinuityPass: this.runContinuityPass,
            chronologyWindow: 2,
            bodyExcerptChars: 2600
        });
        this.aiState = this.plugin.getTimelineAuditAiService().getState(scopeKey);
        this.render();
    }

    private syncExpandedFinding(findings: TimelineAuditFinding[]): void {
        const expandedStillVisible = this.expandedFindingPath
            ? findings.some((finding) => finding.path === this.expandedFindingPath)
            : false;

        if (!expandedStillVisible) {
            this.expandedFindingPath = null;
        }

        if (!this.hasAutoExpandedCurrentResult) {
            this.expandedFindingPath = getInitialExpandedFindingPath(findings);
            this.hasAutoExpandedCurrentResult = true;
        }
    }

    private toggleFindingExpansion(path: string): void {
        this.expandedFindingPath = this.expandedFindingPath === path ? null : path;
        this.render();
    }

    private expandFinding(path: string, scroll = false): void {
        this.expandedFindingPath = path;
        this.render();

        if (scroll) {
            window.requestAnimationFrame(() => {
                scrollFindingCardIntoView(this.findingCardEls, path);
            });
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
            text: 'Timeline Audit checks each scene\'s YAML When value, summary, synopsis, and body text, then compares nearby scenes in chronology order. It looks for missing or invalid When values, time-of-day mismatches, suspicious jumps, and places where the written sequence appears to disagree with chronology. Direct text evidence counts more than inference, and AI remains optional. Use it to see where the timeline breaks before deciding what to change.'
        });

        if (this.aiState.status === 'completed') {
            header.createDiv({
                cls: 'rt-timeline-audit-ai-header-badge',
                text: 'AI-enhanced'
            });
        }

        if (this.running) {
            const loadingCard = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass rt-timeline-audit-loading' });
            loadingCard.createDiv({ cls: 'rt-timeline-audit-loading-title', text: 'Running instant audit…' });
            loadingCard.createDiv({
                cls: 'rt-timeline-audit-loading-copy',
                text: 'Deterministic checks run first and continuity checks run next. AI audit only runs when you explicitly start it.'
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

        const displayedResult = this.getDisplayedResult();
        if (!displayedResult) {
            const emptyCard = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass rt-timeline-audit-loading' });
            emptyCard.createDiv({ text: 'No audit results available.' });
            return;
        }

        const findings = this.getFilteredFindings();
        this.syncExpandedFinding(findings);

        const book = this.plugin.getActiveBook();
        const statsCard = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass rt-timeline-audit-stats' });
        const scopeRow = statsCard.createDiv({ cls: 'rt-timeline-audit-scope' });
        scopeRow.createSpan({
            cls: 'rt-timeline-audit-scope-book',
            text: this.plugin.getActiveBookTitle()
        });
        scopeRow.createSpan({
            cls: 'rt-timeline-audit-scope-path',
            text: `Active scope: ${book?.sourceFolder?.trim() || this.plugin.settings.sourcePath || 'Entire vault'}`
        });

        const statsGrid = statsCard.createDiv({ cls: 'rt-timeline-audit-stats-grid' });
        this.createStat(statsGrid, 'Total scenes', String(displayedResult.stats.totalScenes));
        this.createStat(statsGrid, 'Aligned', String(displayedResult.stats.aligned));
        this.createStat(statsGrid, 'Warnings', String(displayedResult.stats.warnings));
        this.createStat(statsGrid, 'Contradictions', String(displayedResult.stats.contradictions));
        this.createStat(statsGrid, 'Missing When', String(displayedResult.stats.missingWhen));

        this.renderTimelineOverview(contentEl, findings);
        this.renderAuditActions(contentEl);

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
                this.renderFindingListItem(findingsList, finding);
            }
        }

        const actionRow = contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(actionRow)
            .setButtonText('Re-run audit')
            .onClick(() => {
                void this.runAudit({ invalidateAi: true });
            });

        new ButtonComponent(actionRow)
            .setButtonText('Apply accepted changes')
            .setCta()
            .onClick(() => {
                void this.applyDecisions();
            });

        new ButtonComponent(actionRow)
            .setButtonText('Close')
            .onClick(() => this.close());
    }

    private renderAuditActions(container: HTMLElement): void {
        const actionsSection = container.createDiv({ cls: 'rt-timeline-audit-controls' });
        actionsSection.createDiv({ cls: 'rt-timeline-audit-controls-title', text: 'Audit actions' });

        const cards = actionsSection.createDiv({ cls: 'rt-timeline-audit-actions-grid' });

        const instantCard = cards.createDiv({ cls: 'ert-panel ert-panel--glass rt-timeline-audit-action-card' });
        instantCard.createDiv({ cls: 'rt-timeline-audit-action-card-title', text: 'Instant audit' });
        instantCard.createDiv({
            cls: 'rt-timeline-audit-action-card-copy',
            text: 'Runs automatically when this window opens. Checks chronology, summary/body disagreement, and nearby scene continuity.'
        });
        instantCard.createDiv({
            cls: 'rt-timeline-audit-action-card-status',
            text: 'Already run for the current view.'
        });

        const controlsRow = instantCard.createDiv({ cls: 'rt-timeline-audit-toggle-row' });
        this.createToggle(controlsRow, 'Continuity pass', this.runContinuityPass, (value) => {
            this.runContinuityPass = value;
            this.aiState = this.plugin.getTimelineAuditAiService().getState(this.getAiScopeKey());
            this.render();
        });
        instantCard.createDiv({
            cls: 'rt-timeline-audit-actions-copy',
            text: 'Checks neighboring scenes for suspicious jumps or impossible order.'
        });

        const aiCard = cards.createDiv({ cls: 'ert-panel ert-panel--glass rt-timeline-audit-action-card' });
        const aiHeader = aiCard.createDiv({ cls: 'rt-timeline-audit-ai-card-header' });
        aiHeader.createDiv({ cls: 'rt-timeline-audit-action-card-title', text: 'AI audit' });
        if (this.aiState.status === 'completed') {
            aiHeader.createDiv({ cls: 'rt-timeline-audit-ai-header-badge', text: 'AI-enhanced' });
        }
        aiCard.createDiv({
            cls: 'rt-timeline-audit-action-card-copy',
            text: 'Uses AI to read scene evidence more deeply and surface subtler timeline inconsistencies. Runs in the background and can be revisited later.'
        });

        const statusCol = aiCard.createDiv({ cls: 'rt-timeline-audit-ai-status' });
        statusCol.createDiv({
            cls: 'rt-timeline-audit-ai-status-title',
            text: this.getAiStatusLabel()
        });

        const meta = this.getAiStatusMeta();
        if (meta) {
            statusCol.createDiv({
                cls: 'rt-timeline-audit-ai-status-meta',
                text: meta
            });
        }

        if (this.aiState.status === 'running') {
            const progressWrap = aiCard.createDiv({ cls: 'rt-timeline-audit-ai-progress' });
            const progressBar = progressWrap.createDiv({ cls: 'rt-timeline-audit-ai-progress-bar' });
            const hasProgress = this.aiState.progressTotal > 0 && this.aiState.progressCurrent > 0;
            const progressWidth = hasProgress
                ? `${Math.max(8, Math.round((this.aiState.progressCurrent / this.aiState.progressTotal) * 100))}%`
                : '22%';
            progressBar.style.width = progressWidth; // SAFE: inline style used for lightweight AI progress width in modal UI
            if (!hasProgress) {
                progressBar.addClass('rt-is-indeterminate');
            }
        }

        const aiRow = aiCard.createDiv({ cls: 'rt-timeline-audit-ai-action-row' });
        const aiButton = new ButtonComponent(aiRow);
        aiButton.setButtonText(this.getAiActionLabel());
        if (this.aiState.status === 'running') {
            aiButton.setDisabled(true);
        } else {
            aiButton.setCta();
            aiButton.onClick(() => this.startAiAudit());
        }
    }

    private getAiActionLabel(): string {
        switch (this.aiState.status) {
            case 'running':
                return 'Running AI audit…';
            case 'completed':
                return 'Re-run AI Audit';
            default:
                return 'Start AI Audit';
        }
    }

    private getAiStatusLabel(): string {
        switch (this.aiState.status) {
            case 'running':
                return 'AI audit in progress';
            case 'completed':
                return 'AI audit complete';
            case 'failed':
                return 'AI audit failed';
            case 'not_started':
            default:
                return 'AI audit not started';
        }
    }

    private getAiStatusMeta(): string {
        if (this.aiState.status === 'running') {
            if (this.aiState.progressTotal > 0) {
                const scene = this.aiState.currentSceneName ? ` · ${this.aiState.currentSceneName}` : '';
                return `${this.aiState.progressCurrent}/${this.aiState.progressTotal}${scene}`;
            }
            return this.aiState.message || 'AI audit is running in the background.';
        }

        if (this.aiState.status === 'completed' && this.aiState.completedAt) {
            return `AI audit run ${this.formatRelativeAge(this.aiState.completedAt)}`;
        }

        if (this.aiState.status === 'failed') {
            return this.aiState.error || 'Try starting the AI audit again.';
        }

        return 'Instant audit is done. Start AI Audit to look for subtler timeline problems.';
    }

    private formatRelativeAge(timestamp: number): string {
        const deltaMs = Math.max(0, Date.now() - timestamp);
        const minutes = Math.floor(deltaMs / 60000);
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return `${days}d ago`;
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
            const sceneLabel = `Scene ${entry.finding.manuscriptOrderIndex + 1}`;
            const sceneTitle = getAuditDisplayTitle(entry.finding.title);
            const block = strip.createEl('button', {
                cls: `rt-timeline-audit-overview-block rt-timeline-audit-overview-block--${entry.severity}`,
                text: `S${entry.finding.manuscriptOrderIndex + 1}`
            });
            if (entry.finding.path === this.expandedFindingPath) {
                block.addClass('rt-is-active');
            }
            block.type = 'button';
            block.setAttr('aria-label', `${sceneLabel}, ${sceneTitle}. ${entry.issueSummary}`);
            block.addEventListener('click', () => {
                this.expandFinding(entry.finding.path, true);
            });
        }
    }

    private getFilteredFindings(): TimelineAuditFinding[] {
        const result = this.getDisplayedResult();
        if (!result) return [];

        return result.findings.filter((finding) => {
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

    private renderFindingListItem(container: HTMLElement, finding: TimelineAuditFinding): void {
        const shell = container.createDiv({ cls: 'rt-timeline-audit-finding-shell' });
        shell.addClass(`rt-timeline-audit-finding-shell--${finding.status}`);
        if (finding.path === this.expandedFindingPath) {
            shell.addClass('rt-is-expanded');
        }
        shell.tabIndex = -1;
        this.findingCardEls.set(finding.path, shell);

        const row = shell.createEl('button', {
            cls: `rt-timeline-audit-row rt-timeline-audit-row--${finding.status}`,
            attr: { type: 'button' }
        });
        if (finding.path === this.expandedFindingPath) {
            row.addClass('rt-is-expanded');
        }
        row.addEventListener('click', () => this.toggleFindingExpansion(finding.path));

        const left = row.createDiv({ cls: 'rt-timeline-audit-row-left' });
        const titleRow = left.createDiv({ cls: 'rt-timeline-audit-row-title-row' });
        titleRow.createSpan({
            cls: 'rt-timeline-audit-row-index',
            text: `#${finding.manuscriptOrderIndex + 1}`
        });
        titleRow.createSpan({
            cls: 'rt-timeline-audit-row-title',
            text: getAuditDisplayTitle(finding.title)
        });

        const preview = getAuditFindingPreviewSnippet(finding);
        if (preview) {
            left.createDiv({
                cls: 'rt-timeline-audit-row-snippet',
                text: preview
            });
        }

        const middle = row.createDiv({ cls: 'rt-timeline-audit-row-middle' });
        for (const label of getAuditFindingBadgeLabels(finding)) {
            middle.createSpan({
                cls: 'rt-timeline-audit-row-issue',
                text: label
            });
        }

        const right = row.createDiv({ cls: 'rt-timeline-audit-row-right' });
        right.createSpan({
            cls: `rt-timeline-audit-row-status rt-timeline-audit-row-status--${finding.status}`,
            text: formatAuditStatusLabel(finding.status)
        });
        right.createSpan({
            cls: 'rt-timeline-audit-row-chevron',
            text: finding.path === this.expandedFindingPath ? '▾' : '▸'
        });

        if (finding.path === this.expandedFindingPath) {
            const detailWrap = shell.createDiv({ cls: 'rt-timeline-audit-detail-wrap' });
            this.renderFindingDetail(detailWrap, finding);
        }
    }

    private renderFindingDetail(container: HTMLElement, finding: TimelineAuditFinding): void {
        const card = container.createDiv({ cls: 'rt-timeline-audit-card' });
        card.addClass(`rt-timeline-audit-card--${finding.status}`);

        const titleRow = card.createDiv({ cls: 'rt-timeline-audit-card-title-row' });
        titleRow.createDiv({
            cls: 'rt-timeline-audit-card-title',
            text: `#${finding.manuscriptOrderIndex + 1} ${getAuditDisplayTitle(finding.title)}`
        });
        titleRow.createDiv({
            cls: 'rt-timeline-audit-card-status',
            text: formatAuditStatusLabel(finding.status)
        });

        const issueRow = card.createDiv({ cls: 'rt-timeline-audit-badge-row' });
        for (const issue of finding.issues.filter((candidate, index, issues) =>
            issues.findIndex((entry) => entry.type === candidate.type) === index
        )) {
            issueRow.createSpan({
                cls: `rt-timeline-audit-badge rt-timeline-audit-badge--${issue.severity}`,
                text: formatAuditIssueLabel(issue.type)
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
            this.describeCurrentWhen(finding),
            `Chronology position: ${finding.expectedChronologyPosition ?? 'Not placed because YAML does not place it safely.'}`
        ]);
        this.createQuestionBlock(qaGrid, 'What the manuscript implies', [
            finding.inferredWrittenTimelinePosition?.label ?? 'No reliable alternate timeline position inferred.',
            finding.suggestedWhen ? `Suggested When: ${this.formatWhen(finding.suggestedWhen)}` : 'No safe replacement When suggested.'
        ]);
        this.createQuestionBlock(qaGrid, 'Why this was flagged', this.getFlagExplanationLines(finding));
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
                    text: `${this.formatEvidenceSource(evidence.source)} · ${this.formatEvidenceTier(evidence.tier)}`
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

    private getFlagExplanationLines(finding: TimelineAuditFinding): string[] {
        const issueLines = finding.issues
            .filter((issue, index, issues) => issues.findIndex((candidate) => candidate.type === issue.type) === index)
            .slice(0, 2)
            .map((issue) => describeAuditIssue(issue.type));

        if (finding.rationale) {
            issueLines.push(finding.rationale);
        }

        return issueLines.length > 0 ? issueLines : ['No rationale recorded.'];
    }

    private describeCurrentWhen(finding: TimelineAuditFinding): string {
        if (finding.whenParseIssue === 'missing_when') return 'YAML When: missing from frontmatter.';
        if (finding.whenParseIssue === 'invalid_when') return `YAML When: invalid in frontmatter (${finding.currentWhenRaw ?? 'unknown'}).`;
        return `YAML When: ${this.formatWhen(finding.currentWhen)}.`;
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

    private formatEvidenceTier(tier: string): string {
        switch (tier) {
            case 'direct': return 'Direct text';
            case 'strong_inference': return 'Strong inference';
            case 'ambiguous': return 'Ambiguous cue';
            default: return tier;
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
        const result = this.getDisplayedResult();
        if (!result) return;

        try {
            const applyResult = await applyAuditFindings(this.app, result.findings);
            if (applyResult.failed > 0) {
                new Notice(`Applied timeline audit decisions with ${applyResult.failed} failure(s).`);
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
