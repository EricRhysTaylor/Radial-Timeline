/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Timeline Repair Wizard Modal
 * Two-phase modal: configuration wizard + review/edit UI for rapid human correction.
 */

import { App, Modal, ButtonComponent, DropdownComponent, Notice, setIcon, ToggleComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { TFile } from 'obsidian';
import type { TimelineItem } from '../types';
import {
    type RepairPipelineConfig,
    type RepairPipelineResult,
    type SessionDiffModel,
    type ModalPhase,
    type PatternPresetId,
    type RepairSceneEntry,
    type TimeBucket,
    PATTERN_PRESETS,
    TIME_BUCKET_HOURS,
    TIME_BUCKET_LABELS,
    DEFAULT_PIPELINE_CONFIG,
    getEffectiveWhen
} from '../timelineRepair/types';
import { runRepairPipeline, getUniqueSubplots, getUniqueActs } from '../timelineRepair/RepairPipeline';
import {
    createSession,
    editSceneWhen,
    shiftSceneDays,
    setSceneTimeBucket,
    shiftMultipleDays,
    setMultipleTimeBucket,
    toggleRippleMode,
    undo,
    redo,
    canUndo,
    canRedo,
    getChangedCount,
    getNeedsReviewCount,
    getRippleAffectedCount
} from '../timelineRepair/sessionDiff';
import { formatWhenForDisplay, formatTimeForDisplay, detectTimeBucket } from '../timelineRepair/patternSync';
import { writeSessionChanges, getChangeSummary } from '../timelineRepair/frontmatterWriter';

// ============================================================================
// Modal Class
// ============================================================================

export class TimelineRepairModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;

    // State
    private phase: ModalPhase = 'config';
    private config: RepairPipelineConfig | null = null;
    private result: RepairPipelineResult | null = null;
    private session: SessionDiffModel | null = null;
    private abortController: AbortController | null = null;

    // Scene data
    private scenes: TimelineItem[] = [];
    private files: Map<string, TFile> = new Map();

    // UI references
    private sceneListEl?: HTMLElement;
    private summaryBarEl?: HTMLElement;
    private selectedIndices: Set<number> = new Set();

    // Review filters
    private filterNeedsReview = false;
    private filterAiDerived = false;
    private filterKeywordDerived = false;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app);
        this.plugin = plugin;
    }

    async onOpen(): Promise<void> {
        const { contentEl, modalEl, titleEl } = this;
        titleEl.setText('');

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'rt-timeline-repair-modal-shell');
            modalEl.style.width = '900px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '95vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }

        contentEl.addClass('ert-modal-container', 'ert-stack', 'rt-timeline-repair-modal');

        // Load scene data
        await this.loadSceneData();

        // Show configuration phase
        this.showConfigPhase();

        // Set up keyboard navigation
        this.setupKeyboardNavigation();
    }

    onClose(): void {
        this.abortController?.abort();
    }

    private async loadSceneData(): Promise<void> {
        this.scenes = await this.plugin.getSceneData();

        // Build file map
        for (const scene of this.scenes) {
            if (scene.path) {
                const file = this.app.vault.getFileByPath(scene.path);
                if (file) {
                    this.files.set(scene.path, file);
                }
            }
        }
    }

    // ========================================================================
    // Configuration Phase
    // ========================================================================

    private showConfigPhase(): void {
        this.phase = 'config';
        this.contentEl.empty();

        // Header
        const header = this.contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Timeline Wizard' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Timeline order normalizer' });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Scaffold, infer, and refine When dates from narrative order. Fast and convenient. Reusable and adaptable.'
        });

        // Scene count summary
        const scenesWithWhen = this.scenes.filter(s => s.when instanceof Date).length;
        const scenesWithoutWhen = this.scenes.length - scenesWithWhen;

        const summaryCard = this.contentEl.createDiv({ cls: 'rt-glass-card' });
        const summaryRow = summaryCard.createDiv({ cls: 'rt-timeline-repair-summary-row' });
        this.createStatItem(summaryRow, 'Total Scenes', String(this.scenes.length));
        this.createStatItem(summaryRow, 'With When', String(scenesWithWhen));
        this.createStatItem(summaryRow, 'Missing When', String(scenesWithoutWhen));

        // Anchor configuration
        const anchorCard = this.contentEl.createDiv({ cls: 'rt-glass-card' });
        anchorCard.createEl('h4', { text: 'Anchor Point', cls: 'rt-section-title' });
        anchorCard.createDiv({
            cls: 'rt-timeline-repair-section-desc',
            text: 'Start date for the first scene. All subsequent scenes will be assigned dates based on the pattern.'
        });

        const anchorRow = anchorCard.createDiv({ cls: 'rt-timeline-repair-anchor-row' });

        // Date input
        const dateInputContainer = anchorRow.createDiv({ cls: 'rt-timeline-repair-input-group' });
        dateInputContainer.createEl('label', { text: 'Date', cls: 'rt-timeline-repair-label' });
        const dateInput = dateInputContainer.createEl('input', {
            type: 'date',
            cls: 'rt-timeline-repair-date-input'
        });

        // Default to today or first scene's date if it has one
        const firstSceneWithWhen = this.scenes.find(s => s.when instanceof Date);
        if (firstSceneWithWhen?.when) {
            const d = firstSceneWithWhen.when;
            dateInput.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } else {
            const today = new Date();
            dateInput.value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        }

        // Time input
        const timeInputContainer = anchorRow.createDiv({ cls: 'rt-timeline-repair-input-group' });
        timeInputContainer.createEl('label', { text: 'Time', cls: 'rt-timeline-repair-label' });
        const timeInput = timeInputContainer.createEl('input', {
            type: 'time',
            cls: 'rt-timeline-repair-time-input'
        });
        timeInput.value = '08:00';

        // Pattern selection
        const patternCard = this.contentEl.createDiv({ cls: 'rt-glass-card' });
        patternCard.createEl('h4', { text: 'Pattern', cls: 'rt-section-title' });
        patternCard.createDiv({
            cls: 'rt-timeline-repair-section-desc',
            text: 'How to space scenes in time. Level 2 and 3 will refine based on text cues.'
        });

        const patternRow = patternCard.createDiv({ cls: 'rt-timeline-repair-pattern-row' });
        let selectedPattern: PatternPresetId = 'twoBeatDay';

        for (const preset of PATTERN_PRESETS) {
            const pill = patternRow.createDiv({ cls: 'rt-timeline-repair-pattern-pill' });
            if (preset.id === selectedPattern) {
                pill.addClass('rt-is-active');
            }
            pill.createSpan({ text: preset.label, cls: 'rt-timeline-repair-pattern-label' });
            pill.createSpan({ text: preset.description, cls: 'rt-timeline-repair-pattern-desc' });

            pill.addEventListener('click', () => {
                patternRow.querySelectorAll('.rt-timeline-repair-pattern-pill').forEach(p =>
                    p.removeClass('rt-is-active'));
                pill.addClass('rt-is-active');
                selectedPattern = preset.id;
            });
        }

        // Analysis levels
        const levelsCard = this.contentEl.createDiv({ cls: 'rt-glass-card' });
        levelsCard.createEl('h4', { text: 'Analysis Levels', cls: 'rt-section-title' });

        let runLevel2 = true;
        let runLevel3 = false;
        let inferDuration = false;

        const level1Row = this.createLevelToggle(
            levelsCard,
            'Level 1: Pattern Sync',
            'Deterministic baseline from manuscript order. Always runs.',
            true,
            true // disabled - always runs
        );

        const level2Row = this.createLevelToggle(
            levelsCard,
            'Level 2: Keyword Sweep',
            'Detect temporal cues like "next morning" or "three weeks later".',
            runLevel2,
            false,
            (val) => { runLevel2 = val; }
        );

        const level3Row = this.createLevelToggle(
            levelsCard,
            'Level 3: AI Temporal Parse',
            'Use AI to infer time from complex or implicit language. Requires API key.',
            runLevel3,
            false,
            (val) => { runLevel3 = val; }
        );

        const durationRow = this.createLevelToggle(
            levelsCard,
            'Infer Duration',
            'Attempt to estimate scene duration from text (experimental).',
            inferDuration,
            false,
            (val) => { inferDuration = val; }
        );

        // Scope filters (optional)
        const subplots = getUniqueSubplots(this.scenes);
        const acts = getUniqueActs(this.scenes);

        let subplotFilter: string | undefined;
        let actFilter: number | undefined;

        if (subplots.length > 1 || acts.length > 1) {
            const scopeCard = this.contentEl.createDiv({ cls: 'rt-glass-card' });
            scopeCard.createEl('h4', { text: 'Scope (Optional)', cls: 'rt-section-title' });

            const scopeRow = scopeCard.createDiv({ cls: 'rt-timeline-repair-scope-row' });

            if (subplots.length > 1) {
                const subplotContainer = scopeRow.createDiv({ cls: 'rt-timeline-repair-input-group' });
                subplotContainer.createEl('label', { text: 'Subplot', cls: 'rt-timeline-repair-label' });
                const subplotDropdown = new DropdownComponent(subplotContainer);
                subplotDropdown.addOption('', 'All subplots');
                for (const sub of subplots) {
                    subplotDropdown.addOption(sub, sub);
                }
                subplotDropdown.onChange(val => { subplotFilter = val || undefined; });
            }

            if (acts.length > 1) {
                const actContainer = scopeRow.createDiv({ cls: 'rt-timeline-repair-input-group' });
                actContainer.createEl('label', { text: 'Act', cls: 'rt-timeline-repair-label' });
                const actDropdown = new DropdownComponent(actContainer);
                actDropdown.addOption('', 'All acts');
                for (const act of acts) {
                    actDropdown.addOption(String(act), `Act ${act}`);
                }
                actDropdown.onChange(val => { actFilter = val ? parseInt(val, 10) : undefined; });
            }
        }

        // Action buttons
        const buttonRow = this.contentEl.createDiv({ cls: 'ert-modal-actions' });

        new ButtonComponent(buttonRow)
            .setButtonText('Analyze Timeline')
            .setCta()
            .onClick(async () => {
                // Parse anchor date
                const [year, month, day] = dateInput.value.split('-').map(Number);
                const [hour, minute] = timeInput.value.split(':').map(Number);
                const anchorWhen = new Date(year, month - 1, day, hour, minute, 0, 0);

                this.config = {
                    anchorWhen,
                    anchorSceneIndex: 0,
                    patternPreset: selectedPattern,
                    runLevel1: true,
                    runLevel2,
                    runLevel3,
                    aiConfidenceThreshold: 'med',
                    inferDuration,
                    subplotFilter,
                    actFilter
                };

                await this.runAnalysis();
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }

    private createStatItem(container: HTMLElement, label: string, value: string): void {
        const item = container.createDiv({ cls: 'rt-timeline-repair-stat-item' });
        item.createDiv({ cls: 'rt-timeline-repair-stat-value', text: value });
        item.createDiv({ cls: 'rt-timeline-repair-stat-label', text: label });
    }

    private createLevelToggle(
        container: HTMLElement,
        title: string,
        description: string,
        initialValue: boolean,
        disabled: boolean,
        onChange?: (value: boolean) => void
    ): HTMLElement {
        const row = container.createDiv({ cls: 'rt-timeline-repair-level-row' });

        const textContainer = row.createDiv({ cls: 'rt-timeline-repair-level-text' });
        textContainer.createDiv({ cls: 'rt-timeline-repair-level-title', text: title });
        textContainer.createDiv({ cls: 'rt-timeline-repair-level-desc', text: description });

        const toggle = new ToggleComponent(row);
        toggle.setValue(initialValue);
        toggle.setDisabled(disabled);
        if (onChange) {
            toggle.onChange(onChange);
        }

        return row;
    }

    // ========================================================================
    // Analysis Phase
    // ========================================================================

    private async runAnalysis(): Promise<void> {
        this.phase = 'analyzing';
        this.contentEl.empty();
        this.abortController = new AbortController();

        // Header
        const header = this.contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Timeline Order Wizard' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Analyzing Timeline...' });
        const statusEl = header.createDiv({ cls: 'ert-modal-subtitle', text: 'Running Level 1: Pattern Sync...' });

        // Progress card
        const progressCard = this.contentEl.createDiv({ cls: 'rt-glass-card' });
        const progressContainer = progressCard.createDiv({ cls: 'rt-pulse-progress-container' });
        const progressBg = progressContainer.createDiv({ cls: 'rt-pulse-progress-bg' });
        const progressBar = progressBg.createDiv({ cls: 'rt-pulse-progress-bar' });
        progressBar.style.setProperty('--progress-width', '0%');

        const progressText = progressCard.createDiv({ cls: 'rt-pulse-progress-text' });
        progressText.setText('Preparing...');

        // Abort button
        const buttonRow = this.contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(buttonRow)
            .setButtonText('Abort')
            .setWarning()
            .onClick(() => {
                this.abortController?.abort();
                new Notice('Analysis aborted');
                this.showConfigPhase();
            });

        try {
            // Run pipeline
            this.result = await runRepairPipeline(
                this.scenes,
                this.files,
                this.plugin,
                this.config!,
                {
                    onPhaseChange: (phase) => {
                        switch (phase) {
                            case 'level1':
                                statusEl.setText('Running Level 1: Pattern Sync...');
                                progressBar.style.setProperty('--progress-width', '10%');
                                break;
                            case 'level2':
                                statusEl.setText('Running Level 2: Keyword Sweep...');
                                progressBar.style.setProperty('--progress-width', '40%');
                                break;
                            case 'level3':
                                statusEl.setText('Running Level 3: AI Temporal Parse...');
                                progressBar.style.setProperty('--progress-width', '60%');
                                break;
                            case 'complete':
                                statusEl.setText('Analysis complete');
                                progressBar.style.setProperty('--progress-width', '100%');
                                break;
                        }
                    },
                    onAiProgress: (current, total, sceneName) => {
                        progressText.setText(`AI analyzing: ${sceneName} (${current}/${total})`);
                        const pct = 60 + (current / total) * 35;
                        progressBar.style.setProperty('--progress-width', `${pct}%`);
                    },
                    abortSignal: this.abortController.signal
                }
            );

            // Create session from results
            this.session = createSession(this.result);

            // Show review phase
            this.showReviewPhase();

        } catch (error) {
            if (!this.abortController.signal.aborted) {
                new Notice(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
                this.showConfigPhase();
            }
        }
    }

    // ========================================================================
    // Review Phase
    // ========================================================================

    private showReviewPhase(): void {
        this.phase = 'review';
        this.contentEl.empty();

        if (!this.session || !this.result) {
            this.showConfigPhase();
            return;
        }

        // Header
        const header = this.contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Timeline Order Wizard' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Review & Edit' });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: 'Quick nudge dates with keyboard shortcuts. J/K to navigate, Day+/- to shift.'
        });

        // Summary bar
        this.summaryBarEl = this.contentEl.createDiv({ cls: 'rt-timeline-repair-summary-bar' });
        this.updateSummaryBar();

        // Filter toggles
        const filterRow = this.contentEl.createDiv({ cls: 'rt-timeline-repair-filter-row' });

        this.createFilterPill(filterRow, 'Needs Review', this.filterNeedsReview, (val) => {
            this.filterNeedsReview = val;
            this.renderSceneList();
        });

        if (this.result.level3Refined > 0) {
            this.createFilterPill(filterRow, 'AI-derived', this.filterAiDerived, (val) => {
                this.filterAiDerived = val;
                this.renderSceneList();
            });
        }

        if (this.result.level2Refined > 0) {
            this.createFilterPill(filterRow, 'Keyword-derived', this.filterKeywordDerived, (val) => {
                this.filterKeywordDerived = val;
                this.renderSceneList();
            });
        }

        // Ripple mode toggle
        const rippleContainer = filterRow.createDiv({ cls: 'rt-timeline-repair-ripple-toggle' });
        const rippleLabel = rippleContainer.createSpan({ text: 'Ripple Mode' });
        const rippleToggle = new ToggleComponent(rippleContainer);
        rippleToggle.setValue(this.session.rippleEnabled);
        rippleToggle.onChange((val) => {
            if (this.session) {
                this.session = toggleRippleMode(this.session);
                this.updateSummaryBar();
            }
        });

        // Scene list container
        this.sceneListEl = this.contentEl.createDiv({ cls: 'rt-timeline-repair-scene-list' });
        this.renderSceneList();

        // Action buttons
        const buttonRow = this.contentEl.createDiv({ cls: 'ert-modal-actions' });

        // Undo/Redo buttons
        const undoBtn = new ButtonComponent(buttonRow)
            .setButtonText('Undo')
            .setDisabled(!canUndo(this.session))
            .onClick(() => {
                if (this.session && canUndo(this.session)) {
                    this.session = undo(this.session);
                    this.renderSceneList();
                    this.updateSummaryBar();
                    undoBtn.setDisabled(!canUndo(this.session));
                    redoBtn.setDisabled(!canRedo(this.session));
                }
            });

        const redoBtn = new ButtonComponent(buttonRow)
            .setButtonText('Redo')
            .setDisabled(!canRedo(this.session))
            .onClick(() => {
                if (this.session && canRedo(this.session)) {
                    this.session = redo(this.session);
                    this.renderSceneList();
                    this.updateSummaryBar();
                    undoBtn.setDisabled(!canUndo(this.session));
                    redoBtn.setDisabled(!canRedo(this.session));
                }
            });

        // Spacer
        buttonRow.createDiv({ cls: 'rt-timeline-repair-button-spacer' });

        new ButtonComponent(buttonRow)
            .setButtonText('Back')
            .onClick(() => this.showConfigPhase());

        new ButtonComponent(buttonRow)
            .setButtonText('Apply Changes')
            .setCta()
            .setDisabled(!this.session.hasUnsavedChanges)
            .onClick(() => this.applyChanges());
    }

    private updateSummaryBar(): void {
        if (!this.summaryBarEl || !this.session) return;

        this.summaryBarEl.empty();

        const changedCount = getChangedCount(this.session);
        const reviewCount = getNeedsReviewCount(this.session);

        this.summaryBarEl.createSpan({
            text: `${changedCount} changed`,
            cls: 'rt-timeline-repair-summary-stat'
        });

        if (reviewCount > 0) {
            this.summaryBarEl.createSpan({
                text: `${reviewCount} need review`,
                cls: 'rt-timeline-repair-summary-stat rt-timeline-repair-summary-warning'
            });
        }

        if (this.session.rippleEnabled) {
            this.summaryBarEl.createSpan({
                text: 'Ripple ON',
                cls: 'rt-timeline-repair-summary-stat rt-timeline-repair-ripple-on'
            });
        }

        if (this.selectedIndices.size > 0) {
            this.summaryBarEl.createSpan({
                text: `${this.selectedIndices.size} selected`,
                cls: 'rt-timeline-repair-summary-stat'
            });
        }
    }

    private createFilterPill(
        container: HTMLElement,
        label: string,
        active: boolean,
        onChange: (value: boolean) => void
    ): void {
        const pill = container.createDiv({ cls: 'rt-timeline-repair-filter-pill' });
        if (active) pill.addClass('rt-is-active');
        pill.setText(label);

        pill.addEventListener('click', () => {
            const newActive = !pill.hasClass('rt-is-active');
            pill.toggleClass('rt-is-active', newActive);
            onChange(newActive);
        });
    }

    private renderSceneList(): void {
        if (!this.sceneListEl || !this.session) return;

        this.sceneListEl.empty();

        // Filter entries
        let entries = this.session.entries;

        if (this.filterNeedsReview) {
            entries = entries.filter(e => e.needsReview);
        }
        if (this.filterAiDerived) {
            entries = entries.filter(e => e.source === 'ai');
        }
        if (this.filterKeywordDerived) {
            entries = entries.filter(e => e.source === 'keyword');
        }

        if (entries.length === 0) {
            this.sceneListEl.createDiv({
                cls: 'rt-timeline-repair-empty',
                text: 'No scenes match the current filters.'
            });
            return;
        }

        // Render scene cards
        for (const entry of entries) {
            this.renderSceneCard(entry);
        }
    }

    private renderSceneCard(entry: RepairSceneEntry): void {
        if (!this.sceneListEl || !this.session) return;

        const idx = entry.manuscriptIndex;
        const effectiveWhen = getEffectiveWhen(entry);
        const isSelected = this.selectedIndices.has(idx);

        const card = this.sceneListEl.createDiv({ cls: 'rt-timeline-repair-scene-card' });
        if (isSelected) card.addClass('rt-is-selected');
        if (entry.needsReview) card.addClass('rt-needs-review');
        if (entry.hasBackwardTime) card.addClass('rt-has-backward-time');

        // Selection checkbox
        const checkbox = card.createEl('input', { type: 'checkbox', cls: 'rt-timeline-repair-checkbox' });
        checkbox.checked = isSelected;
        checkbox.addEventListener('change', () => {
            if (checkbox.checked) {
                this.selectedIndices.add(idx);
            } else {
                this.selectedIndices.delete(idx);
            }
            card.toggleClass('rt-is-selected', checkbox.checked);
            this.updateSummaryBar();
        });

        // Scene info
        const infoCol = card.createDiv({ cls: 'rt-timeline-repair-scene-info' });

        const titleRow = infoCol.createDiv({ cls: 'rt-timeline-repair-scene-title-row' });
        titleRow.createSpan({
            text: `#${idx + 1}`,
            cls: 'rt-timeline-repair-scene-number'
        });
        titleRow.createSpan({
            text: entry.scene.title || 'Untitled',
            cls: 'rt-timeline-repair-scene-title'
        });

        // Source badge
        const sourceBadge = titleRow.createSpan({ cls: 'rt-timeline-repair-source-badge' });
        sourceBadge.addClass(`rt-source-${entry.source}`);

        let sourceText: string = entry.source;
        if (entry.source === 'keyword' && entry.cues?.length) {
            sourceText = `keyword · "${entry.cues[0].match}"`;
        } else if (entry.source === 'ai') {
            sourceText = `ai · conf ${entry.confidence}`;
        }
        sourceBadge.setText(sourceText);

        // Warning badges
        if (entry.hasBackwardTime) {
            const warningBadge = titleRow.createSpan({ cls: 'rt-timeline-repair-warning-badge' });
            setIcon(warningBadge, 'alert-triangle');
            warningBadge.setAttribute('aria-label', 'Backward time');
        }
        if (entry.hasLargeGap) {
            const gapBadge = titleRow.createSpan({ cls: 'rt-timeline-repair-gap-badge' });
            setIcon(gapBadge, 'clock');
            gapBadge.setAttribute('aria-label', 'Large time gap');
        }

        // When display
        const whenCol = card.createDiv({ cls: 'rt-timeline-repair-when-col' });
        whenCol.createDiv({
            cls: 'rt-timeline-repair-when-date',
            text: formatWhenForDisplay(effectiveWhen)
        });

        const currentBucket = detectTimeBucket(effectiveWhen);
        whenCol.createDiv({
            cls: 'rt-timeline-repair-when-bucket',
            text: TIME_BUCKET_LABELS[currentBucket]
        });

        // Quick nudge controls
        const controlsCol = card.createDiv({ cls: 'rt-timeline-repair-controls' });

        // Day controls
        const dayRow = controlsCol.createDiv({ cls: 'rt-timeline-repair-day-controls' });

        const dayMinusBtn = dayRow.createEl('button', { cls: 'rt-timeline-repair-nudge-btn', text: '−1d' });
        dayMinusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleDayShift(idx, -1);
        });

        const dayPlusBtn = dayRow.createEl('button', { cls: 'rt-timeline-repair-nudge-btn', text: '+1d' });
        dayPlusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleDayShift(idx, 1);
        });

        // Time bucket pills
        const bucketRow = controlsCol.createDiv({ cls: 'rt-timeline-repair-bucket-controls' });

        const buckets: TimeBucket[] = ['morning', 'afternoon', 'evening', 'night'];
        for (const bucket of buckets) {
            const pill = bucketRow.createEl('button', {
                cls: 'rt-timeline-repair-bucket-pill',
                text: bucket.charAt(0).toUpperCase()
            });
            pill.setAttribute('aria-label', TIME_BUCKET_LABELS[bucket]);

            if (bucket === currentBucket) {
                pill.addClass('rt-is-active');
            }

            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleTimeBucketChange(idx, TIME_BUCKET_HOURS[bucket]);
            });
        }
    }

    private handleDayShift(sceneIndex: number, days: number): void {
        if (!this.session) return;

        if (this.selectedIndices.size > 1 && this.selectedIndices.has(sceneIndex)) {
            // Batch shift
            this.session = shiftMultipleDays(this.session, Array.from(this.selectedIndices), days);
        } else {
            // Single shift
            this.session = shiftSceneDays(this.session, sceneIndex, days);
        }

        this.renderSceneList();
        this.updateSummaryBar();
    }

    private handleTimeBucketChange(sceneIndex: number, hour: number): void {
        if (!this.session) return;

        if (this.selectedIndices.size > 1 && this.selectedIndices.has(sceneIndex)) {
            // Batch change
            this.session = setMultipleTimeBucket(this.session, Array.from(this.selectedIndices), hour);
        } else {
            // Single change
            this.session = setSceneTimeBucket(this.session, sceneIndex, hour);
        }

        this.renderSceneList();
        this.updateSummaryBar();
    }

    // ========================================================================
    // Keyboard Navigation
    // ========================================================================

    private setupKeyboardNavigation(): void {
        this.scope.register([], 'j', () => this.navigateScene(1));
        this.scope.register([], 'k', () => this.navigateScene(-1));
        this.scope.register([], '[', () => this.shiftFocusedScene(-1));
        this.scope.register([], ']', () => this.shiftFocusedScene(1));
    }

    private navigateScene(delta: number): boolean {
        if (this.phase !== 'review' || !this.sceneListEl) return false;

        const cards = this.sceneListEl.querySelectorAll('.rt-timeline-repair-scene-card');
        if (cards.length === 0) return false;

        const focused = this.sceneListEl.querySelector('.rt-timeline-repair-scene-card:focus');
        let currentIdx = focused ? Array.from(cards).indexOf(focused as HTMLElement) : -1;

        const newIdx = Math.max(0, Math.min(cards.length - 1, currentIdx + delta));
        (cards[newIdx] as HTMLElement).focus();

        return true;
    }

    private shiftFocusedScene(days: number): boolean {
        if (this.phase !== 'review' || !this.sceneListEl || !this.session) return false;

        const focused = this.sceneListEl.querySelector('.rt-timeline-repair-scene-card:focus');
        if (!focused) return false;

        const cards = Array.from(this.sceneListEl.querySelectorAll('.rt-timeline-repair-scene-card'));
        const cardIdx = cards.indexOf(focused as HTMLElement);

        // Get the scene index from the filtered list
        const visibleEntries = this.getVisibleEntries();
        if (cardIdx >= 0 && cardIdx < visibleEntries.length) {
            const sceneIdx = visibleEntries[cardIdx].manuscriptIndex;
            this.handleDayShift(sceneIdx, days);
        }

        return true;
    }

    private getVisibleEntries(): RepairSceneEntry[] {
        if (!this.session) return [];

        let entries = this.session.entries;

        if (this.filterNeedsReview) {
            entries = entries.filter(e => e.needsReview);
        }
        if (this.filterAiDerived) {
            entries = entries.filter(e => e.source === 'ai');
        }
        if (this.filterKeywordDerived) {
            entries = entries.filter(e => e.source === 'keyword');
        }

        return entries;
    }

    // ========================================================================
    // Apply Changes
    // ========================================================================

    private async applyChanges(): Promise<void> {
        if (!this.session) return;

        const summary = getChangeSummary(this.session);

        if (summary.totalChanges === 0) {
            new Notice('No changes to apply');
            return;
        }

        // Confirm
        const confirmed = await this.showConfirmDialog(summary.totalChanges);
        if (!confirmed) return;

        // Write changes
        try {
            const result = await writeSessionChanges(this.app, this.session, {
                onProgress: (current, total, fileName) => {
                    // Could show progress here
                }
            });

            if (result.failed > 0) {
                new Notice(`Applied ${result.success} changes. ${result.failed} failed.`);
            } else {
                new Notice(`Successfully applied ${result.success} timeline changes`);
            }

            this.close();

        } catch (error) {
            new Notice(`Failed to apply changes: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private showConfirmDialog(changeCount: number): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText('Confirm Changes');

            modal.contentEl.createDiv({
                text: `This will update ${changeCount} scene file(s) with new When dates and provenance metadata.`
            });
            modal.contentEl.createDiv({
                text: 'This action cannot be undone automatically. Make sure you have a backup if needed.',
                cls: 'rt-timeline-repair-confirm-warning'
            });

            const buttonRow = modal.contentEl.createDiv({ cls: 'ert-modal-actions' });

            new ButtonComponent(buttonRow)
                .setButtonText('Apply Changes')
                .setCta()
                .onClick(() => {
                    modal.close();
                    resolve(true);
                });

            new ButtonComponent(buttonRow)
                .setButtonText('Cancel')
                .onClick(() => {
                    modal.close();
                    resolve(false);
                });

            modal.open();
        });
    }
}

export default TimelineRepairModal;

