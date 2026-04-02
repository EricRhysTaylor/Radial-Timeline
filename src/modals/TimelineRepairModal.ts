/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Timeline Repair Wizard Modal
 * Two-phase modal: configuration wizard + review/edit UI for rapid human correction.
 */

import { App, Modal, ButtonComponent, Notice, setIcon, ToggleComponent } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { TFile } from 'obsidian';
import type { TimelineItem } from '../types';
import { t } from '../i18n';
import {
    type RepairPipelineConfig,
    type RepairPipelineResult,
    type SessionDiffModel,
    type ModalPhase,
    type PatternPresetId,
    type RepairSceneEntry,
    type TimeBucket,
    SCAFFOLD_PATTERNS,
    TIME_BUCKET_HOURS,
    TIME_BUCKET_LABELS,
    getEffectiveWhen
} from '../timelineRepair/types';
import { runRepairPipeline } from '../timelineRepair/RepairPipeline';
import { buildSharedSceneNoteFileMap, loadScopedSceneNotes, mapSharedSceneNotesToTimelineItems } from '../timeline/sharedSceneNotes';
import {
    createSession,
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
    getNeedsReviewCount
} from '../timelineRepair/sessionDiff';
import { formatWhenForDisplay, detectTimeBucket } from '../timelineRepair/patternSync';
import { writeSessionChanges, getChangeSummary } from '../timelineRepair/frontmatterWriter';
import { buildScaffoldPreview } from '../timelineRepair/scaffoldPreview';
import { parseWhenField } from '../utils/date';

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
    private filterKeywordDerived = false;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        super(app);
        this.plugin = plugin;
    }

    private getDefaultAnchorWhen(): Date {
        const firstScene = this.scenes[0];
        if (!firstScene) {
            const fallback = new Date();
            fallback.setHours(8, 0, 0, 0);
            return fallback;
        }

        if (firstScene.when instanceof Date && !isNaN(firstScene.when.getTime())) {
            return new Date(firstScene.when);
        }

        const rawWhen = firstScene.rawFrontmatter?.When;
        if (typeof rawWhen === 'string') {
            const parsed = parseWhenField(rawWhen);
            if (parsed) return parsed;
        }

        const fallback = new Date();
        fallback.setHours(8, 0, 0, 0);
        return fallback;
    }

    private parseAnchorWhenFromInputs(dateValue: string, timeValue: string, fallback: Date): Date {
        const [year, month, day] = dateValue.split('-').map(Number);
        const hasValidDate = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day);
        const [hour, minute] = timeValue.trim() ? timeValue.split(':').map(Number) : [0, 0];
        const safeHour = Number.isFinite(hour) ? hour : 0;
        const safeMinute = Number.isFinite(minute) ? minute : 0;

        if (!hasValidDate) {
            const fallbackDate = new Date(fallback);
            fallbackDate.setHours(safeHour, safeMinute, 0, 0);
            return fallbackDate;
        }

        return new Date(year, month - 1, day, safeHour, safeMinute, 0, 0);
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
        const sceneNotes = await loadScopedSceneNotes(this.plugin);
        this.scenes = mapSharedSceneNotesToTimelineItems(sceneNotes);
        this.files = buildSharedSceneNoteFileMap(sceneNotes);
    }

    private normalizeCueSearchText(value: string): string {
        return value
            .replace(/[\u2018\u2019]/g, '\'')
            .replace(/[\u201C\u201D]/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
    }

    private findCueRange(content: string, cueText: string): { start: number; end: number } | null {
        const attempts = [
            cueText,
            this.normalizeCueSearchText(cueText)
        ].filter((value, index, items) => value.length > 0 && items.indexOf(value) === index);

        for (const attempt of attempts) {
            const exactIndex = content.indexOf(attempt);
            if (exactIndex >= 0) {
                return { start: exactIndex, end: exactIndex + attempt.length };
            }

            const lowerContent = content.toLowerCase();
            const lowerAttempt = attempt.toLowerCase();
            const lowerIndex = lowerContent.indexOf(lowerAttempt);
            if (lowerIndex >= 0) {
                return { start: lowerIndex, end: lowerIndex + attempt.length };
            }
        }

        const normalizedContent = this.normalizeCueSearchText(content);
        const normalizedCue = this.normalizeCueSearchText(cueText);
        if (!normalizedCue) return null;

        const normalizedIndex = normalizedContent.toLowerCase().indexOf(normalizedCue.toLowerCase());
        if (normalizedIndex < 0) return null;

        const prefix = normalizedContent.slice(0, normalizedIndex);
        const rawPrefixMatch = content.match(new RegExp(`^[\\s\\S]{0,${prefix.length * 2}}`));
        const rawStart = rawPrefixMatch ? rawPrefixMatch[0].length : normalizedIndex;
        return {
            start: rawStart,
            end: Math.min(content.length, rawStart + cueText.length)
        };
    }

    private async openCueInFreshTab(file: TFile, cueText: string): Promise<void> {
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.openFile(file, { active: true });
        this.app.workspace.revealLeaf(leaf);

        const attemptSelection = (): boolean => {
            const view = leaf.view;
            if (!view || !('editor' in view)) return false;
            const editor = (view as { editor?: { getValue(): string; offsetToPos(offset: number): unknown; setSelection(from: unknown, to: unknown): void; scrollIntoView(range: { from: unknown; to: unknown }, center?: boolean): void; }; }).editor;
            if (!editor) return false;

            const content = editor.getValue();
            const range = this.findCueRange(content, cueText);
            if (!range) return false;

            const from = editor.offsetToPos(range.start);
            const to = editor.offsetToPos(range.end);
            editor.setSelection(from, to);
            editor.scrollIntoView({ from, to }, true);
            return true;
        };

        if (attemptSelection()) return;

        window.setTimeout(() => {
            attemptSelection();
        }, 50);
    }

    private buildConfigBadgeText(): string {
        const scenesWithWhen = this.scenes.filter(s => s.when instanceof Date).length;
        return `${t('timelineRepairModal.config.badge')}: ${this.scenes.length} scenes • ${scenesWithWhen} When dates`;
    }

    // ========================================================================
    // Configuration Phase
    // ========================================================================

    private showConfigPhase(): void {
        this.phase = 'config';
        this.contentEl.empty();

        // Header
        const header = this.contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: this.buildConfigBadgeText() });
        header.createDiv({ cls: 'ert-modal-title', text: t('timelineRepairModal.config.title') });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: t('timelineRepairModal.config.subtitle')
        });

        // Setup configuration
        const setupCard = this.contentEl.createDiv({ cls: 'rt-glass-card rt-timeline-repair-setup-card' });
        const setupGrid = setupCard.createDiv({ cls: 'rt-timeline-repair-setup-grid' });
        const leftCol = setupGrid.createDiv({ cls: 'rt-timeline-repair-config-column' });
        const rightCol = setupGrid.createDiv({ cls: 'rt-timeline-repair-config-column' });

        const anchorSection = leftCol.createDiv({ cls: 'rt-timeline-repair-config-block' });
        anchorSection.createDiv({ cls: 'rt-timeline-repair-block-header' })
            .createEl('h5', { text: t('timelineRepairModal.anchor.name'), cls: 'rt-timeline-repair-block-title' });
        anchorSection.createDiv({
            cls: 'rt-timeline-repair-section-desc',
            text: t('timelineRepairModal.anchor.desc')
        });

        const anchorRow = anchorSection.createDiv({ cls: 'rt-timeline-repair-anchor-row' });

        // Date input
        const dateInputContainer = anchorRow.createDiv({ cls: 'rt-timeline-repair-input-group' });
        dateInputContainer.createEl('label', { text: t('timelineRepairModal.anchor.dateLabel'), cls: 'rt-timeline-repair-label' });
        const dateInput = dateInputContainer.createEl('input', {
            type: 'date',
            cls: 'rt-timeline-repair-date-input ert-input ert-input--full'
        });

        const defaultAnchorWhen = this.getDefaultAnchorWhen();
        dateInput.value = `${defaultAnchorWhen.getFullYear()}-${String(defaultAnchorWhen.getMonth() + 1).padStart(2, '0')}-${String(defaultAnchorWhen.getDate()).padStart(2, '0')}`;

        // Time input
        const timeInputContainer = anchorRow.createDiv({ cls: 'rt-timeline-repair-input-group' });
        timeInputContainer.createEl('label', { text: t('timelineRepairModal.anchor.timeLabel'), cls: 'rt-timeline-repair-label' });
        const timeInput = timeInputContainer.createEl('input', {
            type: 'time',
            cls: 'rt-timeline-repair-time-input ert-input ert-input--full'
        });
        timeInput.value = `${String(defaultAnchorWhen.getHours()).padStart(2, '0')}:${String(defaultAnchorWhen.getMinutes()).padStart(2, '0')}`;

        let selectedPattern: PatternPresetId = 'beats2';

        const previewSection = leftCol.createDiv({ cls: 'rt-timeline-repair-config-block rt-timeline-repair-preview-section' });
        previewSection.createDiv({ cls: 'rt-timeline-repair-block-header' })
            .createEl('h5', { text: t('timelineRepairModal.preview.name'), cls: 'rt-timeline-repair-block-title' });
        const previewPanel = previewSection.createDiv({ cls: 'rt-timeline-repair-preview-panel' });
        const previewStart = previewPanel.createDiv({ cls: 'rt-timeline-repair-preview-start' });
        const previewStrip = previewPanel.createDiv({ cls: 'rt-timeline-repair-preview-strip' });
        const previewHelper = previewSection.createDiv({ cls: 'rt-timeline-repair-preview-helper' });

        const updateScaffoldPreview = (): void => {
            const anchorWhen = this.parseAnchorWhenFromInputs(dateInput.value, timeInput.value, defaultAnchorWhen);
            const preview = buildScaffoldPreview(selectedPattern, anchorWhen, this.scenes.length);
            previewStart.textContent = preview.startLabel;
            previewHelper.textContent = preview.helperLabel;
            previewStrip.empty();

            preview.steps.forEach((step, index) => {
                const stepEl = previewStrip.createDiv({ cls: 'rt-timeline-repair-preview-step' });
                stepEl.createDiv({ cls: 'rt-timeline-repair-preview-scene', text: step.sceneLabel });
                stepEl.createDiv({ cls: 'rt-timeline-repair-preview-label', text: step.spacingLabel });

                if (index < preview.steps.length - 1) {
                    previewStrip.createSpan({ cls: 'rt-timeline-repair-preview-arrow', text: '→' });
                }
            });
        };

        dateInput.addEventListener('input', updateScaffoldPreview);
        timeInput.addEventListener('input', updateScaffoldPreview);

        // Pattern selection
        const patternSection = rightCol.createDiv({ cls: 'rt-timeline-repair-config-block' });
        patternSection.createDiv({ cls: 'rt-timeline-repair-block-header' })
            .createEl('h5', { text: t('timelineRepairModal.pattern.name'), cls: 'rt-timeline-repair-block-title' });
        patternSection.createDiv({
            cls: 'rt-timeline-repair-section-desc',
            text: t('timelineRepairModal.pattern.desc')
        });

        const patternRow = patternSection.createDiv({ cls: 'rt-timeline-repair-pattern-grid' });

        for (const preset of Object.values(SCAFFOLD_PATTERNS)) {
            const option = patternRow.createEl('label', { cls: 'rt-timeline-repair-pattern-option' });
            const radio = option.createEl('input', {
                type: 'radio',
                cls: 'rt-timeline-repair-pattern-radio',
                attr: { name: 'rt-timeline-repair-pattern' }
            });
            radio.checked = preset.id === selectedPattern;
            option.toggleClass('rt-is-active', radio.checked);

            const optionText = option.createDiv({ cls: 'rt-timeline-repair-pattern-text' });
            optionText.createDiv({ text: preset.label, cls: 'rt-timeline-repair-pattern-label' });
            optionText.createDiv({ text: preset.description, cls: 'rt-timeline-repair-pattern-desc' });

            radio.addEventListener('change', () => {
                if (!radio.checked) return;
                patternRow.querySelectorAll('.rt-timeline-repair-pattern-option').forEach(p => {
                    p.toggleClass('rt-is-active', p === option);
                });
                selectedPattern = preset.id;
                updateScaffoldPreview();
            });
        }

        updateScaffoldPreview();

        const optionsSection = rightCol.createDiv({ cls: 'rt-timeline-repair-config-block' });
        optionsSection.createDiv({ cls: 'rt-timeline-repair-block-header' })
            .createEl('h5', { text: t('timelineRepairModal.refinements.name'), cls: 'rt-timeline-repair-block-title' });
        optionsSection.createDiv({
            cls: 'rt-timeline-repair-section-desc',
            text: t('timelineRepairModal.refinements.desc')
        });

        let useTextCues = true;

        const baseRow = optionsSection.createDiv({ cls: 'rt-timeline-repair-option-row rt-is-static' });
        const baseText = baseRow.createDiv({ cls: 'rt-timeline-repair-level-text' });
        baseText.createDiv({ cls: 'rt-timeline-repair-level-title', text: t('timelineRepairModal.refinements.baseScaffoldTitle') });
        baseText.createDiv({ cls: 'rt-timeline-repair-level-desc', text: t('timelineRepairModal.refinements.baseScaffoldDesc') });
        baseRow.createSpan({ cls: 'rt-timeline-repair-status-pill', text: t('timelineRepairModal.refinements.alwaysOn') });

        this.createLevelToggle(
            optionsSection,
            t('timelineRepairModal.refinements.textCuesTitle'),
            t('timelineRepairModal.refinements.textCuesDesc'),
            useTextCues,
            false,
            (val) => { useTextCues = val; }
        );

        // Action buttons
        const buttonRow = this.contentEl.createDiv({ cls: 'ert-modal-actions' });

        new ButtonComponent(buttonRow)
            .setButtonText(t('timelineRepairModal.config.previewButton'))
            .setCta()
            .onClick(async () => {
                const anchorWhen = this.parseAnchorWhenFromInputs(dateInput.value, timeInput.value, defaultAnchorWhen);

                this.config = {
                    anchorWhen,
                    anchorSceneIndex: 0,
                    patternPreset: selectedPattern,
                    useTextCues
                };

                await this.runAnalysis();
            });

        new ButtonComponent(buttonRow)
            .setButtonText(t('timelineRepairModal.config.cancelButton'))
            .onClick(() => this.close());
    }

    private createLevelToggle(
        container: HTMLElement,
        title: string,
        description: string,
        initialValue: boolean,
        disabled: boolean,
        onChange?: (value: boolean) => void
    ): HTMLElement {
        const row = container.createDiv({ cls: 'rt-timeline-repair-option-row' });

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
        header.createSpan({ cls: 'ert-modal-badge', text: t('timelineRepairModal.analyzing.badge') });
        header.createDiv({ cls: 'ert-modal-title', text: t('timelineRepairModal.analyzing.title') });
        const statusEl = header.createDiv({ cls: 'ert-modal-subtitle', text: t('timelineRepairModal.analyzing.statusApplying') });

        // Progress card
        const progressCard = this.contentEl.createDiv({ cls: 'rt-glass-card' });
        const progressContainer = progressCard.createDiv({ cls: 'rt-pulse-progress-container' });
        const progressBg = progressContainer.createDiv({ cls: 'rt-pulse-progress-bg' });
        const progressBar = progressBg.createDiv({ cls: 'rt-pulse-progress-bar' });
        progressBar.style.setProperty('--progress-width', '0%');

        const progressText = progressCard.createDiv({ cls: 'rt-pulse-progress-text' });
        progressText.setText(t('timelineRepairModal.analyzing.preparing'));

        // Abort button
        const buttonRow = this.contentEl.createDiv({ cls: 'ert-modal-actions' });
        new ButtonComponent(buttonRow)
            .setButtonText(t('timelineRepairModal.analyzing.abortButton'))
            .setWarning()
            .onClick(() => {
                this.abortController?.abort();
                new Notice(t('timelineRepairModal.analyzing.abortedNotice'));
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
                            case 'pattern':
                                statusEl.setText(t('timelineRepairModal.analyzing.phasePattern'));
                                progressBar.style.setProperty('--progress-width', '30%');
                                break;
                            case 'cues':
                                statusEl.setText(t('timelineRepairModal.analyzing.phaseCues'));
                                progressBar.style.setProperty('--progress-width', '70%');
                                break;
                            case 'complete':
                                statusEl.setText(t('timelineRepairModal.analyzing.phaseComplete'));
                                progressBar.style.setProperty('--progress-width', '100%');
                                break;
                        }
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
                new Notice(`Scaffold failed: ${error instanceof Error ? error.message : String(error)}`);
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

        // Badge row: Quick Scaffold + status counts
        const badgeRow = header.createDiv({ cls: 'rt-timeline-repair-badge-row' });
        this.summaryBarEl = badgeRow.createSpan({ cls: 'ert-modal-badge rt-timeline-repair-review-badge' });
        this.updateSummaryBar();

        header.createDiv({ cls: 'ert-modal-title', text: t('timelineRepairModal.review.title') });
        header.createDiv({
            cls: 'ert-modal-subtitle',
            text: t('timelineRepairModal.review.subtitle')
        });

        // Filter toggles
        const filterRow = this.contentEl.createDiv({ cls: 'rt-timeline-repair-filter-row' });

        this.createFilterPill(filterRow, t('timelineRepairModal.review.filterNeedsReview'), this.filterNeedsReview, (val) => {
            this.filterNeedsReview = val;
            this.renderSceneList();
        });

        if (this.result.cueRefined > 0) {
            this.createFilterPill(filterRow, t('timelineRepairModal.review.filterTextCues'), this.filterKeywordDerived, (val) => {
                this.filterKeywordDerived = val;
                this.renderSceneList();
            });
        }

        // Ripple mode toggle
        const rippleContainer = filterRow.createDiv({ cls: 'rt-timeline-repair-ripple-toggle' });
        rippleContainer.createSpan({ text: t('timelineRepairModal.review.rippleMode') });

        const rippleHelp = rippleContainer.createSpan({ cls: 'rt-timeline-repair-ripple-help' });
        setIcon(rippleHelp, 'help-circle');
        rippleHelp.setAttribute('title', t('timelineRepairModal.review.rippleModeHelp'));
        rippleHelp.setAttribute('aria-label',
            t('timelineRepairModal.review.rippleModeHelp').replace(/\n+/g, ' ')
        );

        const rippleToggle = new ToggleComponent(rippleContainer);
        rippleToggle.setValue(this.session.rippleEnabled);
        rippleToggle.onChange(() => {
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
            .setButtonText(t('timelineRepairModal.review.undoButton'))
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
            .setButtonText(t('timelineRepairModal.review.redoButton'))
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
            .setButtonText(t('timelineRepairModal.review.backButton'))
            .onClick(() => this.showConfigPhase());

        new ButtonComponent(buttonRow)
            .setButtonText(t('timelineRepairModal.review.applyButton'))
            .setCta()
            .setDisabled(!this.session.hasUnsavedChanges)
            .onClick(() => this.applyChanges());
    }

    private updateSummaryBar(): void {
        if (!this.summaryBarEl || !this.session) return;

        const changedCount = getChangedCount(this.session);
        const reviewCount = getNeedsReviewCount(this.session);
        const parts: string[] = [
            t('timelineRepairModal.review.badge').toUpperCase(),
            t('timelineRepairModal.review.summaryChanged', { count: changedCount }).toUpperCase()
        ];
        if (reviewCount > 0) {
            parts.push(t('timelineRepairModal.review.summaryNeedReview', { count: reviewCount }).toUpperCase());
        }
        this.summaryBarEl.setText(parts.join(' • '));
        this.summaryBarEl.toggleClass('rt-has-warnings', reviewCount > 0);
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
        if (this.filterKeywordDerived) {
            entries = entries.filter(e => e.source === 'keyword');
        }

        if (entries.length === 0) {
            this.sceneListEl.createDiv({
                cls: 'rt-timeline-repair-empty',
                text: t('timelineRepairModal.review.emptyFilter')
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
        const currentBucket = detectTimeBucket(effectiveWhen);

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

        // Two-line content area
        const contentArea = card.createDiv({ cls: 'rt-timeline-repair-card-content' });

        // LINE 1: identity + signal
        const line1 = contentArea.createDiv({ cls: 'rt-timeline-repair-line1' });

        line1.createSpan({
            text: `#${idx + 1}`,
            cls: 'rt-timeline-repair-scene-number'
        });
        line1.createSpan({
            text: entry.scene.title || t('timelineRepairModal.review.untitled'),
            cls: 'rt-timeline-repair-scene-title'
        });

        // Cue chips (blue keyword badges, linked to note origin)
        if (entry.source === 'keyword' && entry.cues?.length) {
            for (const cue of entry.cues) {
                const cueChip = line1.createEl('a', { cls: 'rt-timeline-repair-cue-chip' });
                cueChip.setText(`"${cue.match}"`);
                cueChip.setAttribute('aria-label', `Open note and search for "${cue.match}"`);
                cueChip.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    void this.openCueInFreshTab(entry.file, cue.match);
                    this.close();
                });
            }
        }

        // Warning badges
        if (entry.hasBackwardTime) {
            const warningBadge = line1.createSpan({ cls: 'rt-timeline-repair-warning-badge' });
            setIcon(warningBadge, 'alert-triangle');
            warningBadge.setAttribute('aria-label', t('timelineRepairModal.review.warningBackwardTime'));
        }
        if (entry.hasLargeGap) {
            const gapBadge = line1.createSpan({ cls: 'rt-timeline-repair-gap-badge' });
            setIcon(gapBadge, 'clock');
            gapBadge.setAttribute('aria-label', t('timelineRepairModal.review.warningLargeGap'));
        }

        // Pattern compliance chip
        const complianceLabel = this.getComplianceLabel(entry);
        const complianceChip = line1.createSpan({
            cls: 'rt-timeline-repair-compliance-chip'
        });
        complianceChip.addClass(`rt-compliance-${complianceLabel.replace(/\s+/g, '-')}`);
        complianceChip.setText(complianceLabel);

        // LINE 2: timeline + actions
        const line2 = contentArea.createDiv({ cls: 'rt-timeline-repair-line2' });

        // Left: proposed + comparison
        const whenArea = line2.createDiv({ cls: 'rt-timeline-repair-when-area' });

        // Proposed When (primary, prominent)
        const proposedLine = whenArea.createDiv({ cls: 'rt-timeline-repair-proposed-when' });
        proposedLine.createSpan({
            text: formatWhenForDisplay(effectiveWhen),
            cls: 'rt-timeline-repair-proposed-date'
        });
        proposedLine.createSpan({
            text: ` · ${TIME_BUCKET_LABELS[currentBucket]}`,
            cls: 'rt-timeline-repair-proposed-bucket'
        });

        // Current When comparison (secondary, smaller) — only if different
        if (entry.originalWhen) {
            const originalDisplay = formatWhenForDisplay(entry.originalWhen);
            const proposedDisplay = formatWhenForDisplay(effectiveWhen);
            const originalBucket = detectTimeBucket(entry.originalWhen);

            if (originalDisplay !== proposedDisplay || originalBucket !== currentBucket) {
                const comparisonLine = whenArea.createDiv({ cls: 'rt-timeline-repair-original-when' });
                comparisonLine.setText(`was ${originalDisplay} · ${TIME_BUCKET_LABELS[originalBucket]}`);
            }
        }

        // Right: controls
        const controlsArea = line2.createDiv({ cls: 'rt-timeline-repair-controls' });

        // Day controls
        const dayRow = controlsArea.createDiv({ cls: 'rt-timeline-repair-day-controls' });

        const dayMinusBtn = dayRow.createEl('button', { cls: 'rt-timeline-repair-nudge-btn', text: t('timelineRepairModal.review.dayMinus') });
        dayMinusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleDayShift(idx, -1);
        });

        const dayPlusBtn = dayRow.createEl('button', { cls: 'rt-timeline-repair-nudge-btn', text: t('timelineRepairModal.review.dayPlus') });
        dayPlusBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.handleDayShift(idx, 1);
        });

        // Time bucket pills
        const bucketRow = controlsArea.createDiv({ cls: 'rt-timeline-repair-bucket-controls' });

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

    /**
     * Derive pattern compliance label for a scene entry.
     * - "pattern": source is 'pattern' or 'original', no flags
     * - "cue-adjusted": source is 'keyword' or 'ai'
     * - "needs review": needsReview flag is set
     */
    private getComplianceLabel(entry: RepairSceneEntry): string {
        if (entry.needsReview) return 'needs review';
        if (entry.source === 'keyword' || entry.source === 'ai') return 'cue-adjusted';
        return 'pattern';
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
            new Notice(t('timelineRepairModal.apply.noChangesNotice'));
            return;
        }

        // Confirm
        const confirmed = await this.showConfirmDialog(summary.totalChanges);
        if (!confirmed) return;

        // Write changes
        try {
            const result = await writeSessionChanges(this.app, this.session, {
                onProgress: () => {
                    // Could show progress here
                }
            });

            if (result.failed > 0) {
                new Notice(t('timelineRepairModal.apply.partialNotice', { success: result.success, failed: result.failed }));
            } else {
                new Notice(t('timelineRepairModal.apply.successNotice', { count: result.success }));
            }

            this.close();

        } catch (error) {
            new Notice(`Failed to apply changes: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private showConfirmDialog(changeCount: number): Promise<boolean> {
        return new Promise((resolve) => {
            const modal = new Modal(this.app);
            modal.titleEl.setText(t('timelineRepairModal.confirm.title'));

            modal.contentEl.createDiv({
                text: t('timelineRepairModal.confirm.description', { count: changeCount })
            });
            modal.contentEl.createDiv({
                text: t('timelineRepairModal.confirm.warning'),
                cls: 'rt-timeline-repair-confirm-warning'
            });

            const buttonRow = modal.contentEl.createDiv({ cls: 'ert-modal-actions' });

            new ButtonComponent(buttonRow)
                .setButtonText(t('timelineRepairModal.confirm.applyButton'))
                .setCta()
                .onClick(() => {
                    modal.close();
                    resolve(true);
                });

            new ButtonComponent(buttonRow)
                .setButtonText(t('timelineRepairModal.confirm.cancelButton'))
                .onClick(() => {
                    modal.close();
                    resolve(false);
                });

            modal.open();
        });
    }
}

export default TimelineRepairModal;
