/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * AI Scene Analysis Processing Modal
 * This processes scenes for LLM analysis, not story beats (timeline slices)
 */
import { App, Modal, ButtonComponent, Notice, setIcon, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { DEFAULT_GEMINI_MODEL_ID } from '../constants/aiDefaults';
import { resolveAiLogFolder } from '../ai/log';
import { getModelDisplayName } from '../utils/modelResolver';
import type { LlmTimingStats } from '../types/settings';

export type ProcessingMode = 'flagged' | 'unprocessed' | 'force-all' | 'synopsis-flagged' | 'synopsis-missing-weak' | 'synopsis-missing' | 'synopsis-all';

export type SceneQueueItem = {
    id: string;
    label: string;
    detail?: string;
};

/**
 * Simple confirmation modal that matches the generic modal system
 */
class ConfirmationModal extends Modal {
    private readonly message: string;
    private readonly onConfirm: () => void;

    constructor(app: App, message: string, onConfirm: () => void) {
        super(app);
        this.message = message;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl, titleEl, modalEl } = this;
        titleEl.setText('');

        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = '520px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('ert-modal-container', 'ert-stack');

        // Header
        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        header.createSpan({ cls: 'ert-modal-badge', text: 'Confirm' });
        header.createDiv({ cls: 'ert-modal-title', text: 'Confirm action' });

        // Message card
        const card = contentEl.createDiv({ cls: 'ert-panel ert-panel--glass' });
        card.createDiv({ text: this.message });

        // Actions
        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });

        new ButtonComponent(buttonRow)
            .setButtonText('Continue')
            .setCta()
            .onClick(() => {
                this.close();
                this.onConfirm();
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }
}

export interface ProcessingOptions {
    mode: ProcessingMode;
    sceneCount: number;
    estimatedMinutes: number;
}

/**
 * Modal for confirming and showing progress of scene analysis processing
 */
export class SceneAnalysisProcessingModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly onConfirm: (mode: ProcessingMode, weakThreshold?: number, targetWords?: number) => Promise<void>;
    private readonly getSceneCount: (mode: ProcessingMode, weakThreshold?: number) => Promise<number>;
    private readonly resumeCommandId?: string; // Optional command ID to trigger on resume
    private readonly subplotName?: string; // Optional subplot name for resume (subplot processing only)
    private readonly isEntireSubplot?: boolean; // Track if this is "entire subplot" vs "flagged scenes"
    private readonly taskType: 'pulse' | 'synopsis';

    private processedResults: Map<string, string> = new Map(); // Store results for synopsis apply phase

    private selectedMode: ProcessingMode = 'flagged';
    public isProcessing: boolean = false;
    private abortController: AbortController | null = null;

    // Synopsis-specific controls
    private synopsisTargetWords: number = 300;
    private synopsisWeakThreshold: number = 75;

    // Progress tracking
    private progressBarEl?: HTMLElement;
    private progressTextEl?: HTMLElement;
    private statusTextEl?: HTMLElement;
    private heroStatusEl?: HTMLElement;
    private errorListEl?: HTMLElement;
    private abortButtonEl?: ButtonComponent;
    private actionButtonContainer?: HTMLElement;
    private queueScrollEl?: HTMLElement;
    private queueTrackEl?: HTMLElement;
    private queueNoteEl?: HTMLElement;
    private queueItems: HTMLElement[] = [];
    private queueData: SceneQueueItem[] = [];
    private queueActiveId?: string;
    private queueStatus: Map<string, 'success' | 'error'> = new Map();
    private queueGrades: Map<string, 'A' | 'B' | 'C'> = new Map();

    // Statistics
    private processedCount: number = 0;
    private totalCount: number = 0;
    private errorCount: number = 0;
    private warningCount: number = 0;
    private pendingRafId: number | null = null;
    private errorMessages: { message: string; hint?: string }[] = [];
    private warningMessages: string[] = [];
    private logAttempts: number = 0;

    // Animation state for progress bar estimation
    private animationIntervalId: number | null = null;
    private currentEstimatedSeconds: number = 0;

    constructor(
        app: App,
        plugin: RadialTimelinePlugin,
        getSceneCount: (mode: ProcessingMode, weakThreshold?: number) => Promise<number>,
        onConfirm: (mode: ProcessingMode, weakThreshold?: number, targetWords?: number) => Promise<void>,
        resumeCommandId?: string,
        subplotName?: string,
        isEntireSubplot?: boolean,
        taskType: 'pulse' | 'synopsis' = 'pulse'
    ) {
        super(app);
        this.plugin = plugin;
        this.getSceneCount = getSceneCount;
        this.onConfirm = onConfirm;
        this.resumeCommandId = resumeCommandId;
        this.subplotName = subplotName;
        this.isEntireSubplot = isEntireSubplot;
        this.taskType = taskType;

        // Initialize synopsis settings from plugin settings
        this.synopsisTargetWords = plugin.settings.synopsisTargetWords ?? 300;
        this.synopsisWeakThreshold = plugin.settings.synopsisWeakThreshold ?? 75;
    }

    onOpen(): void {
        const { contentEl, titleEl, modalEl } = this;
        // Use generic modal base + scene analysis specific styling
        if (modalEl) {
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
            modalEl.style.width = '720px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('ert-modal-container', 'ert-stack');
        contentEl.addClass('rt-scene-analysis-modal');
        titleEl.setText('');

        // If we're already processing (reopening), show progress view
        if (this.isProcessing) {
            this.showProgressView();
        } else {
            this.showConfirmationView();
        }
    }

    onClose(): void {
        if (this.pendingRafId !== null) {
            cancelAnimationFrame(this.pendingRafId);
            this.pendingRafId = null;
        }
        // Clean up animation interval
        this.stopSceneAnimation();
    }

    /**
     * Override close() to allow minimizing while processing continues
     */
    close(): void {
        if (this.isProcessing) {
            new Notice('Processing continues in background. Use command palette to reopen progress window.');
        }
        super.close();
    }

    private ensureModalShell(): void {
        if (this.modalEl && !this.modalEl.classList.contains('ert-modal-shell')) {
            this.modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell');
        }
        this.contentEl.classList.add('ert-modal-container', 'ert-stack');
        this.contentEl.classList.add('rt-scene-analysis-modal');
    }

    private getProcessingTitle(): string {
        if (this.taskType === 'synopsis') {
            return 'Synopsis scene refresh';
        }
        if (this.subplotName) {
            return this.isEntireSubplot
                ? `Processing entire subplot: ${this.subplotName}`
                : `Processing subplot: ${this.subplotName}`;
        }
        return 'Scene pulse analysis';
    }

    private getModeLabel(mode: ProcessingMode): string {
        switch (mode) {
            case 'unprocessed': return 'Scenes missing pulse metadata';
            case 'force-all': return 'Reprocessing every completed scene';
            case 'flagged': return 'Analyze flagged scenes in manuscript order';
            case 'synopsis-flagged': return 'Update flagged scenes';
            case 'synopsis-missing-weak': return 'Update missing or weak synopses';
            case 'synopsis-missing': return 'Update missing synopses only';
            case 'synopsis-all': return 'Regenerate ALL synopses';
            default: return mode;
        }
    }

    private getProcessingSubtitle(): string {
        if (this.taskType === 'synopsis') {
            return this.getModeLabel(this.selectedMode);
        }
        if (this.subplotName) {
            return this.isEntireSubplot
                ? `Analyzing every scene in subplot "${this.subplotName}"`
                : `Analyzing flagged scenes in subplot "${this.subplotName}"`;
        }
        return this.getModeLabel(this.selectedMode);
    }

    private renderProcessingHero(
        parent: HTMLElement,
        options?: { trackStatus?: boolean; subtitle?: string; metaItems?: string[] }
    ): HTMLElement {
        // Use flat header style matching Book Designer (no border/background on header)
        const hero = parent.createDiv({ cls: 'ert-modal-header' });
        const modelLabel = this.getActiveModelDisplayName();
        const badgeLabel = this.taskType === 'synopsis' ? 'AI Synopsis' : 'AI Pulse Run';
        const badgeText = modelLabel ? `${badgeLabel} · ${modelLabel}` : badgeLabel;
        hero.createSpan({ text: badgeText, cls: 'rt-scene-analysis-badge' });
        hero.createDiv({ text: this.getProcessingTitle(), cls: 'ert-modal-title' });
        const subtitleText = options?.subtitle ?? this.getProcessingSubtitle();
        const subtitleEl = hero.createDiv({ cls: 'ert-modal-subtitle' });
        subtitleEl.setText(subtitleText);
        if (options?.trackStatus) {
            this.heroStatusEl = subtitleEl;
        } else {
            this.heroStatusEl = undefined;
        }
        // Add meta pills only if provided (e.g., during progress view)
        const metaItems = options?.metaItems ?? [];
        if (metaItems.length > 0) {
            const metaEl = hero.createDiv({ cls: 'rt-scene-analysis-meta' });
            for (const item of metaItems) {
                metaEl.createSpan({ text: item, cls: 'rt-scene-analysis-meta-item' });
            }
        }
        return hero;
    }

    public setProcessingQueue(queue: SceneQueueItem[]): void {
        this.queueData = queue.slice();
        this.queueStatus.clear();
        this.queueGrades.clear();
        this.totalCount = queue.length;
        if (this.isProcessing && this.progressTextEl && queue.length > 0 && this.processedCount === 0) {
            this.progressTextEl.setText(`0 / ${queue.length} scenes (0%)`);
        }
        this.renderQueueItems();
    }

    private renderQueueItems(): void {
        if (!this.queueTrackEl) return;
        this.queueTrackEl.empty();
        this.queueItems = [];

        if (this.queueData.length === 0) {
            this.queueTrackEl.createSpan({ cls: 'rt-pulse-ruler-empty', text: 'Queue builds once eligible scenes are found...' });
            return;
        }

        for (const item of this.queueData) {
            const entry = this.queueTrackEl.createDiv({ cls: 'rt-pulse-ruler-item' });
            entry.setAttr('data-queue-id', item.id);

            // Background icon container (for grade-based icons)
            const iconBg = entry.createDiv({ cls: 'rt-pulse-card-icon-bg' });
            iconBg.setAttr('aria-hidden', 'true');

            // Content wrapper to sit above the background
            const content = entry.createDiv({ cls: 'rt-pulse-card-content' });

            const primaryLabel = item.label?.trim() || '—';
            content.createSpan({ cls: 'rt-pulse-ruler-value', text: primaryLabel });

            const secondary = item.detail?.trim();
            if (secondary && secondary !== primaryLabel) {
                content.createSpan({ cls: 'rt-pulse-ruler-label', text: secondary });
            }

            // Grade placeholder - always present to reserve space, prevents resize when grade arrives
            const gradePlaceholder = content.createDiv({ cls: 'rt-pulse-grade rt-pulse-grade-placeholder' });
            gradePlaceholder.setAttr('aria-hidden', 'true');

            const grade = this.queueGrades.get(item.id);
            if (grade) {
                this.applyQueueStatus(entry, 'success', grade);
            }

            this.queueItems.push(entry);
        }

        this.updateQueueHighlight();
    }

    private updateQueueHighlight(activeId?: string): void {
        if (activeId) {
            this.queueActiveId = activeId;
        }
        if (!this.queueTrackEl || !this.queueScrollEl) return;

        const activeIndex = this.queueActiveId
            ? this.queueData.findIndex(item => item.id === this.queueActiveId)
            : -1;

        this.queueItems.forEach((itemEl, index) => {
            itemEl.toggleClass('rt-is-active', index === activeIndex);
            itemEl.toggleClass('rt-is-complete', activeIndex !== -1 && index < activeIndex);
        });

        if (activeIndex >= 0) {
            const activeEl = this.queueItems[activeIndex];
            const container = this.queueScrollEl;
            if (activeEl && container) {
                const target = Math.max(0, activeEl.offsetLeft - (container.clientWidth / 2 - activeEl.clientWidth / 2));
                container.scrollTo({ left: target, behavior: 'smooth' });
            }
        }
    }

    public markQueueStatus(queueId: string, status: 'success' | 'error', grade?: 'A' | 'B' | 'C'): void {
        if (!queueId) return;
        this.queueStatus.set(queueId, status);
        if (grade) {
            this.queueGrades.set(queueId, grade);
        }
        const entry = this.queueItems.find(item => item.getAttribute('data-queue-id') === queueId);
        if (entry) {
            this.applyQueueStatus(entry, status, grade);
        }
    }

    private applyQueueStatus(entry: HTMLElement, status: 'success' | 'error', grade?: 'A' | 'B' | 'C'): void {
        // Remove old status classes
        entry.removeClass('rt-status-success', 'rt-status-error', 'rt-grade-a', 'rt-grade-b', 'rt-grade-c');

        // For errors only (API failures), apply error styling
        if (status === 'error') {
            entry.addClass('rt-status-error');
            return;
        }

        // For successful items, style by grade (not generic success)
        if (grade) {
            entry.addClass(`rt-grade-${grade.toLowerCase()}`);

            // Find existing grade placeholder and update it (don't create new element to prevent resize)
            const gradeEl = entry.querySelector('.rt-pulse-grade') as HTMLElement;
            if (gradeEl) {
                gradeEl.setText(grade);
                gradeEl.removeClass('rt-pulse-grade-placeholder');
                gradeEl.addClass(`rt-pulse-grade-${grade.toLowerCase()}`);
                gradeEl.removeAttribute('aria-hidden');
            }

            // Add background icon based on grade
            const iconBg = entry.querySelector('.rt-pulse-card-icon-bg');
            if (iconBg) {
                iconBg.empty();
                const iconName = grade === 'A' ? 'rainbow' : grade === 'B' ? 'mountain' : 'recycle';
                setIcon(iconBg as HTMLElement, iconName);
            }
        }
    }

    private setTripletNote(prevNum: string, currentNum: string, nextNum: string): void {
        if (!this.queueNoteEl) return;
        this.queueNoteEl.empty();

        const boundaryLabel = this.subplotName ? 'subplot' : 'manuscript';
        const chips = [
            { label: 'Previous', value: prevNum, fallback: `Start of ${boundaryLabel}` },
            { label: 'Current', value: currentNum, fallback: 'Unnumbered scene' },
            { label: 'Next', value: nextNum, fallback: `End of ${boundaryLabel}` }
        ];

        for (const chip of chips) {
            const chipEl = this.queueNoteEl.createSpan({ cls: 'rt-pulse-ruler-chip' });
            chipEl.createSpan({ cls: 'rt-pulse-ruler-chip-label', text: chip.label });
            chipEl.createSpan({ cls: 'rt-pulse-ruler-chip-value', text: this.formatTripletValue(chip.value, chip.fallback) });
        }
    }

    private formatTripletValue(value: string, fallback: string): string {
        const normalized = value?.trim();
        if (!normalized || normalized === 'N/A') {
            return fallback;
        }
        return normalized.startsWith('#') ? normalized : `#${normalized}`;
    }

    private findQueueIdForScene(value: string): string | undefined {
        if (!value) return undefined;
        const cleaned = value.replace(/^#/, '').trim();
        const found = this.queueData.find(item => item.label.replace(/^#/, '').trim() === cleaned);
        return found?.id;
    }

    private showConfirmationView(): void {
        const { contentEl, modalEl, titleEl } = this;
        contentEl.empty();
        this.ensureModalShell();
        titleEl.setText('');

        // Set modal width using Obsidian's approach
        if (modalEl) {
            modalEl.style.width = '720px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }

        this.renderProcessingHero(contentEl);

        // Synopsis size controls (only for synopsis mode)
        if (this.taskType === 'synopsis') {
            const controlsCard = contentEl.createDiv({ cls: 'rt-glass-card rt-synopsis-controls' });

            // Target Synopsis Length - Two column layout
            const targetControl = controlsCard.createDiv({ cls: 'rt-synopsis-control rt-synopsis-control--row' });
            const targetInfo = targetControl.createDiv({ cls: 'rt-synopsis-control-info' });
            targetInfo.createEl('label', { text: 'Target synopsis length', cls: 'rt-synopsis-control-label' });
            targetInfo.createDiv({
                text: 'Used when generating or regenerating synopses.',
                cls: 'rt-synopsis-control-help'
            });
            const targetInput = targetControl.createEl('input', {
                type: 'number',
                cls: 'rt-synopsis-control-input',
                attr: { min: '75', max: '500', step: '25' }
            }) as HTMLInputElement;
            targetInput.value = String(this.synopsisTargetWords);
            targetInput.addEventListener('change', () => {
                const val = parseInt(targetInput.value, 10);
                if (!isNaN(val) && val >= 75 && val <= 500) {
                    this.synopsisTargetWords = val;
                    this.checkThresholdWarning(warningEl);
                }
            });

            // Horizontal rule separator
            controlsCard.createEl('hr', { cls: 'rt-synopsis-control-divider' });

            // Weak Synopsis Threshold - Two column layout
            const thresholdControl = controlsCard.createDiv({ cls: 'rt-synopsis-control rt-synopsis-control--row' });
            const thresholdInfo = thresholdControl.createDiv({ cls: 'rt-synopsis-control-info' });
            thresholdInfo.createEl('label', { text: 'Treat synopsis as weak if under', cls: 'rt-synopsis-control-label' });
            thresholdInfo.createDiv({
                text: 'Only used to decide which scenes are selected for update.',
                cls: 'rt-synopsis-control-help'
            });
            const thresholdInput = thresholdControl.createEl('input', {
                type: 'number',
                cls: 'rt-synopsis-control-input',
                attr: { min: '10', max: '300', step: '5' }
            }) as HTMLInputElement;
            thresholdInput.value = String(this.synopsisWeakThreshold);
            thresholdInput.addEventListener('change', () => {
                const val = parseInt(thresholdInput.value, 10);
                if (!isNaN(val) && val >= 10 && val <= 300) {
                    this.synopsisWeakThreshold = val;
                    updateCount(); // Re-calculate scene counts with new threshold
                    this.checkThresholdWarning(warningEl);
                }
            });

            // Warning for target < threshold
            const warningEl = controlsCard.createDiv({ cls: 'rt-synopsis-threshold-warning' });
            this.checkThresholdWarning(warningEl);
        }

        // Mode selection
        const modesSection = contentEl.createDiv({ cls: 'rt-pulse-modes rt-glass-card' });

        if (this.taskType === 'synopsis') {
            this.createModeOption(
                modesSection,
                'synopsis-flagged',
                'Selected scenes (Synopsis Update: yes)',
                'Processes scenes with Synopsis Update: yes in frontmatter.',
                false
            );
            this.createModeOption(
                modesSection,
                'synopsis-missing',
                'Missing only',
                'Only processes scenes with absolutely no synopsis text.',
                false
            );
            this.createModeOption(
                modesSection,
                'synopsis-missing-weak',
                'Missing or weak (Recommended)',
                `Processes scenes with no synopsis or under ${this.synopsisWeakThreshold} words.`,
                true
            );
            this.createModeOption(
                modesSection,
                'synopsis-all',
                'Regenerate all (Warning)',
                'Regenerates synopses for every scene. Existing synopses will be overwritten.',
                false
            );
        } else {
            // Pulse Modes
            this.createModeOption(
                modesSection,
                'flagged',
                'Process flagged scenes (Recommended)',
                'Processes scenes with Pulse Update: Yes and Status: Working or Complete. Use when you\'ve revised scenes and want to update their pulse.',
                true
            );
            this.createModeOption(
                modesSection,
                'unprocessed',
                'Process unprocessed scenes',
                'Processes scenes with Status: Complete or Working that don\'t have pulse yet. Perfect for resuming after interruptions. Ignores Pulse Update flag.',
                false
            );
            this.createModeOption(
                modesSection,
                'force-all',
                'Reprocess ALL scenes',
                'Reprocesses ALL scenes with Status: Complete or Working, even if they already have pulse. Use when changing AI templates or doing complete reanalysis. WARNING: May be expensive!',
                false
            );
        }

        // Scene count display
        const countSection = contentEl.createDiv({ cls: 'rt-pulse-count rt-glass-card' });
        const countEl = countSection.createDiv({ cls: 'rt-pulse-count-number' });

        // Show loading state initially
        countEl.setText('Calculating...');

        const updateCount = async () => {
            countEl.empty();
            countEl.setText('Calculating...');

            try {
                const count = await this.getSceneCount(
                    this.selectedMode,
                    this.taskType === 'synopsis' ? this.synopsisWeakThreshold : undefined
                );
                // ~6 seconds per scene (1.5s delay + 3-5s API call) = 0.1 minutes
                const estimatedMinutes = Math.ceil(count * 0.1);
                countEl.empty();

                const countText = countEl.createDiv({ cls: 'rt-pulse-count-text' });
                countText.createSpan({ text: 'Scenes to process: ', cls: 'rt-pulse-label' });
                countText.createSpan({ text: `${count}`, cls: 'rt-pulse-number' });

                const timeText = countEl.createDiv({ cls: 'rt-pulse-time-text' });
                timeText.createSpan({ text: 'Estimated time: ', cls: 'rt-pulse-label' });
                timeText.createSpan({ text: `~${estimatedMinutes} minutes`, cls: 'rt-pulse-number' });

                if (count > 50) {
                    const warning = countEl.createDiv({ cls: 'rt-pulse-warning' });
                    warning.setText('Large batch processing may take significant time and API costs.');
                }
            } catch (error) {
                countEl.empty();
                countEl.setText(`Error calculating scene count: ${error instanceof Error ? error.message : String(error)}`);
            }
        };

        // Initial count (defer to next frame so modal paints immediately)
        const rafId = requestAnimationFrame(() => {
            updateCount();
        });
        this.pendingRafId = rafId;

        // Update count when mode changes
        // Modal classes don't have registerDomEvent, use addEventListener
        modesSection.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.addEventListener('change', () => updateCount());
        });

        // Action buttons
        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });

        new ButtonComponent(buttonRow)
            .setButtonText('Start processing')
            .setCta()
            .onClick(async () => {
                try {
                    const count = await this.getSceneCount(
                        this.selectedMode,
                        this.taskType === 'synopsis' ? this.synopsisWeakThreshold : undefined
                    );
                    if (count === 0) {
                        new Notice('No scenes to process with the selected mode.');
                        return;
                    }

                    // Extra confirmation for large batches or aggressive modes
                    if (count > 50 || this.selectedMode === 'force-all' || this.selectedMode === 'unprocessed') {
                        const confirmModal = new ConfirmationModal(
                            this.app,
                            `You are about to process ${count} scenes. This may take ${Math.ceil(count * 0.1)} minutes and incur API costs. Continue?`,
                            async () => {
                                await this.startProcessing();
                            }
                        );
                        confirmModal.open();
                        return;
                    }

                    await this.startProcessing();
                } catch (error) {
                    new Notice(`Error: ${error instanceof Error ? error.message : String(error)}`);
                }
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Purge all pulse')
            .setWarning()
            .onClick(async () => {
                try {
                    // Dynamic import to avoid circular dependency
                    const { purgeBeatsByManuscriptOrder } = await import('../SceneAnalysisCommands');

                    // Close this modal before showing purge confirmation
                    this.close();

                    // Execute purge (it has its own confirmation dialog)
                    await purgeBeatsByManuscriptOrder(this.plugin, this.plugin.app.vault);
                } catch (error) {
                    new Notice(`Error: ${error instanceof Error ? error.message : String(error)}`);
                }
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());
    }

    /**
     * Check if target word count is less than weak threshold and show warning
     */
    private checkThresholdWarning(warningEl: HTMLElement): void {
        if (this.synopsisTargetWords < this.synopsisWeakThreshold) {
            warningEl.textContent = `⚠️ Target size (${this.synopsisTargetWords}) is less than weak threshold (${this.synopsisWeakThreshold}). Newly generated synopses may be immediately classified as weak.`;
            warningEl.classList.add('is-visible');
        } else {
            warningEl.classList.remove('is-visible');
        }
    }

    private createModeOption(
        container: HTMLElement,
        mode: ProcessingMode,
        title: string,
        description: string,
        isDefault: boolean
    ): HTMLInputElement {
        const optionEl = container.createDiv({ cls: 'rt-pulse-mode-option' });

        const radioEl = optionEl.createEl('input', {
            type: 'radio',
            attr: { name: 'processing-mode', value: mode }
        });
        radioEl.checked = isDefault;
        if (isDefault) this.selectedMode = mode;

        // Modal classes don't have registerDomEvent, use addEventListener
        radioEl.addEventListener('change', () => {
            if (radioEl.checked) {
                this.selectedMode = mode;
            }
        });

        const labelContainer = optionEl.createDiv({ cls: 'rt-pulse-mode-label' });
        const titleEl = labelContainer.createDiv({ cls: 'rt-pulse-mode-title' });
        titleEl.setText(title);

        const descEl = labelContainer.createDiv({ cls: 'rt-pulse-mode-desc' });
        descEl.setText(description);

        // Make the entire option clickable
        optionEl.addEventListener('click', () => {
            radioEl.checked = true;
            this.selectedMode = mode;
            // Trigger change event to update scene count
            radioEl.dispatchEvent(new Event('change'));
        });

        return radioEl;
    }

    private async startProcessing(): Promise<void> {
        this.isProcessing = true;
        this.abortController = new AbortController();
        this.processedCount = 0;
        this.errorCount = 0;
        this.warningCount = 0;
        this.errorMessages = [];
        this.warningMessages = [];
        this.logAttempts = 0;

        // Notify plugin that processing has started
        this.plugin.activeBeatsModal = this;
        this.plugin.showBeatsStatusBar(0, 0);

        // Switch to progress view
        this.showProgressView();

        try {
            await this.onConfirm(
                this.selectedMode,
                this.taskType === 'synopsis' ? this.synopsisWeakThreshold : undefined,
                this.taskType === 'synopsis' ? this.synopsisTargetWords : undefined
            );

            // Show appropriate summary even if the last/only scene finished after an abort request
            if (this.abortController && this.abortController.signal.aborted) {
                this.showCompletionSummary('Processing aborted');
            } else {
                this.showCompletionSummary('Processing completed successfully!');
            }
        } catch (error) {
            if (!this.abortController.signal.aborted) {
                this.addError(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
                this.showCompletionSummary('Processing stopped due to error');
            } else {
                this.showCompletionSummary('Processing aborted');
            }
        } finally {
            this.isProcessing = false;
            this.abortController = null;
            this.plugin.activeBeatsModal = null;
            this.plugin.hideBeatsStatusBar();
        }
    }

    private showProgressView(): void {
        const { contentEl, titleEl } = this;
        contentEl.empty();
        this.ensureModalShell();
        titleEl.setText('');
        this.renderProcessingHero(contentEl, {
            trackStatus: true,
            metaItems: [
                `Model: ${this.getActiveModelDisplayName()}`,
                this.subplotName
                    ? (this.isEntireSubplot ? 'Entire subplot batch' : 'Flagged subplot scenes')
                    : this.getModeLabel(this.selectedMode)
            ]
        });

        const bodyEl = contentEl.createDiv({ cls: 'rt-pulse-progress-body' });
        const progressCard = bodyEl.createDiv({ cls: 'rt-pulse-progress-card rt-glass-card' });

        const progressContainer = progressCard.createDiv({ cls: 'rt-pulse-progress-container' });
        const progressBg = progressContainer.createDiv({ cls: 'rt-pulse-progress-bg' });
        this.progressBarEl = progressBg.createDiv({ cls: 'rt-pulse-progress-bar' });
        // Start at 25% so the bar isn't empty while waiting for first API response
        this.progressBarEl.style.setProperty('--progress-width', '25%');

        this.progressTextEl = progressCard.createDiv({ cls: 'rt-pulse-progress-text' });
        this.progressTextEl.setText('Initializing… preparing first scene (0%)');

        this.statusTextEl = progressCard.createDiv({ cls: 'rt-pulse-status-text' });
        this.statusTextEl.setText('Initializing pipeline...');

        const rulerBlock = progressCard.createDiv({ cls: 'rt-pulse-ruler-block' });
        rulerBlock.createDiv({ cls: 'rt-pulse-ruler-title', text: 'Scene queue' });
        this.queueScrollEl = rulerBlock.createDiv({ cls: 'rt-pulse-ruler-scroll' });
        this.queueTrackEl = this.queueScrollEl.createDiv({ cls: 'rt-pulse-ruler-track' });
        this.queueItems = [];
        this.queueActiveId = undefined;
        this.renderQueueItems();
        this.queueNoteEl = rulerBlock.createDiv({ cls: 'rt-pulse-ruler-note' });
        if (this.taskType === 'synopsis') {
            this.queueNoteEl.setText('Processing scenes to generate or update synopses based on scene content.');
        } else {
            this.queueNoteEl.setText('Triplets animate as the AI advances - starts, endings, and missing scenes handled automatically.');
        }

        this.errorListEl = bodyEl.createDiv({ cls: 'rt-pulse-error-list rt-glass-card rt-hidden' });

        this.actionButtonContainer = contentEl.createDiv({ cls: 'ert-modal-actions' });
        this.abortButtonEl = new ButtonComponent(this.actionButtonContainer)
            .setButtonText('Abort processing')
            .setWarning()
            .onClick(() => this.abortProcessing());
    }

    private abortProcessing(): void {
        if (!this.abortController) return;

        const confirmModal = new ConfirmationModal(
            this.app,
            'Are you sure you want to abort processing? Progress will be saved up to the current scene.',
            () => {
                this.abortController?.abort();
                this.statusTextEl?.setText('Aborting... Please wait.');
                this.abortButtonEl?.setDisabled(true);
                new Notice('Processing aborted by user');
            }
        );
        confirmModal.open();
    }

    public setSynopsisPreview(oldSynopsis: string, newSynopsis: string): void {
        if (!this.heroStatusEl) return;

        // Use the hero status area for the preview
        this.heroStatusEl.empty();
        const container = this.heroStatusEl.createDiv({ cls: 'rt-synopsis-preview-container' });

        // Old Synopsis (Collapsed)
        const oldCol = container.createDiv({ cls: 'rt-synopsis-col rt-synopsis-old' });
        oldCol.createDiv({ cls: 'rt-synopsis-label', text: 'Previous' });
        const oldText = oldCol.createDiv({ cls: 'rt-synopsis-text' });
        oldText.setText(oldSynopsis || '(No synopsis)');

        // New Synopsis (Preview)
        const newCol = container.createDiv({ cls: 'rt-synopsis-col rt-synopsis-new' });
        newCol.createDiv({ cls: 'rt-synopsis-label', text: 'New Preview' });
        const newText = newCol.createDiv({ cls: 'rt-synopsis-text' });
        if (newSynopsis === 'Generating...') {
            newText.addClass('rt-synopsis-generating');
            newText.setText('Generating...');
        } else {
            newText.setText(newSynopsis);
        }
    }

    public showApplyConfirmation(results: Map<string, string>): void {
        this.processedResults = results;
        const { contentEl, titleEl } = this;
        contentEl.empty();
        this.ensureModalShell();
        titleEl.setText('');

        this.renderProcessingHero(contentEl, {
            subtitle: `Review and apply changes`
        });

        const card = contentEl.createDiv({ cls: 'rt-glass-card rt-apply-card' });
        card.createDiv({ cls: 'rt-apply-message', text: `Processing complete. ${results.size} scenes have new synopses ready to apply.` });

        const warning = card.createDiv({ cls: 'rt-apply-warning' });
        warning.createSpan({ cls: 'rt-warning-icon', text: '⚠️' });
        warning.createSpan({ text: 'This will overwrite existing Synopsis fields in your frontmatter.' });

        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });

        new ButtonComponent(buttonRow)
            .setButtonText(`Apply ${results.size} Changes`)
            .setCta()
            .onClick(async () => {
                await this.applyChanges();
                this.close();
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Discard')
            .onClick(() => this.close());
    }

    private async applyChanges(): Promise<void> {
        const { processedResults } = this;
        if (processedResults.size === 0) return;

        const note = new Notice(`Applying ${processedResults.size} synopsis updates...`, 0);
        let updated = 0;

        try {
            // Get current model ID for timestamp
            const provider = this.plugin.settings.defaultAiProvider || 'openai';
            let modelId = 'Unknown Model';
            if (provider === 'anthropic') {
                modelId = this.plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929';
            } else if (provider === 'gemini') {
                modelId = this.plugin.settings.geminiModelId || 'gemini-3-pro-preview';
            } else if (provider === 'openai') {
                modelId = this.plugin.settings.openaiModelId || 'gpt-5.1-chat-latest';
            } else if (provider === 'local') {
                modelId = this.plugin.settings.localModelId || 'local-model';
            }

            for (const [path, newSynopsis] of processedResults.entries()) {
                const file = this.plugin.app.vault.getAbstractFileByPath(path);
                if (file && file instanceof TFile) {
                    await this.plugin.app.fileManager.processFrontMatter(file, (fm) => {
                        fm['Synopsis'] = newSynopsis;

                        // Replace Synopsis Update flag with timestamp (single field pattern)
                        // This is cleaner than Pulse's two-field approach
                        const now = new Date();
                        const timestamp = now.toLocaleString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                        } as Intl.DateTimeFormatOptions);

                        // Check all possible variations and replace with timestamp
                        const synopsisUpdateKeys = ['Synopsis Update', 'SynopsisUpdate', 'synopsisupdate'];
                        let updatedFlag = false;
                        for (const key of synopsisUpdateKeys) {
                            if (key in fm) {
                                fm[key] = `${timestamp} by ${modelId}`;
                                updatedFlag = true;
                                break; // Only update the first matching key
                            }
                        }
                        // If no existing flag, create one
                        if (!updatedFlag) {
                            fm['Synopsis Update'] = `${timestamp} by ${modelId}`;
                        }
                    });
                    updated++;
                }
            }
            new Notice(`Successfully updated ${updated} scenes.`);

            // Trigger Hooks (Inquiry Rescan / Stats)
            // Inquiry rescan is usually automatic on file modify, but we can trigger explicitly if needed.
            // Stats update via settings save.
            await this.plugin.saveSettings();

        } catch (e) {
            console.error(e);
            new Notice('Error applying changes. Check console.');
        } finally {
            note.hide();
        }
    }

    public updateProgress(current: number, total: number, sceneName: string): void {
        if (!this.isProcessing) return;

        // Track statistics
        this.processedCount = current;
        this.totalCount = total;

        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

        // Update status bar
        this.plugin.showBeatsStatusBar(current, total);

        if (this.progressBarEl) {
            // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
            this.progressBarEl.style.setProperty('--progress-width', `${percentage}%`);
        }

        if (this.progressTextEl) {
            this.progressTextEl.setText(`${current} / ${total} scenes (${percentage}%)`);
        }

        if (this.statusTextEl) {
            this.statusTextEl.setText(`Processing: ${sceneName}`);
        }

        if (this.heroStatusEl && this.taskType !== 'synopsis') {
            this.heroStatusEl.setText(`Processing ${sceneName}`);
        }
    }

    /**
     * Estimate how long the LLM call will take based on historical calibration data.
     * Uses actual average call times, NOT content length (API time doesn't scale with scene runtime).
     * Default is 10 seconds - reasonable for most models. Calibrates from actual samples.
     */
    private estimateDuration(_tripletMetric: number): number {
        const stats = this.plugin.settings.pulseTimingStats;

        // Use average of recent actual call times if we have valid samples
        if (stats?.recentSamples && stats.recentSamples.length > 0) {
            const avgCallTime = stats.recentSamples.reduce((a, b) => a + b, 0) / stats.recentSamples.length;
            // Sanity check: if avg < 1 second, these are legacy ratio-based samples - ignore them
            // Real API calls take at least 2-3 seconds even for the fastest models
            if (avgCallTime >= 1) {
                // Cap at 85% to avoid overshooting (animation completes slightly before actual call)
                return avgCallTime * 0.85;
            }
        }

        // Default: 10 seconds per call (reasonable for most API providers)
        return 10 * 0.85;
    }

    /**
     * Start smooth animation of progress bar during API wait.
     * Animates from current position toward estimated completion for this scene.
     */
    public startSceneAnimation(tripletMetric: number, sceneIndex: number, total: number, sceneName: string): void {
        // Clear any existing animation
        this.stopSceneAnimation();

        const estimatedSeconds = this.estimateDuration(tripletMetric);
        this.currentEstimatedSeconds = estimatedSeconds;

        // Calculate target: don't go past what this scene's completion would be
        const sceneStartPercent = total > 0 ? (sceneIndex / total) * 100 : 0;
        const sceneEndPercent = total > 0 ? ((sceneIndex + 1) / total) * 100 : 100;
        const targetPercent = sceneStartPercent + (sceneEndPercent - sceneStartPercent) * 0.85;

        // Animate in 200ms steps
        const steps = Math.max(1, Math.ceil(estimatedSeconds * 5));
        let step = 0;

        // Update status with estimate
        if (this.statusTextEl) {
            this.statusTextEl.setText(`Processing: ${sceneName} (~${Math.ceil(estimatedSeconds)}s)`);
        }

        this.animationIntervalId = this.plugin.registerInterval(window.setInterval(() => { // SAFE: setInterval wrapped with plugin.registerInterval for cleanup
            step++;
            const progress = step / steps;
            const currentPercent = sceneStartPercent + (targetPercent - sceneStartPercent) * progress;

            if (this.progressBarEl) {
                this.progressBarEl.style.setProperty('--progress-width', `${currentPercent}%`);
            }

            if (step >= steps) {
                this.stopSceneAnimation();
            }
        }, 200));
    }

    /**
     * Stop any running animation interval.
     */
    private stopSceneAnimation(): void {
        if (this.animationIntervalId !== null) {
            window.clearInterval(this.animationIntervalId);
            this.animationIntervalId = null;
        }
    }

    /**
     * Record actual processing time and update calibration data for future estimates.
     * Stores raw call times (not ratios) since API time doesn't correlate with content length.
     */
    public recordProcessingTime(_tripletMetric: number, actualSeconds: number): void {
        // Stop any running animation
        this.stopSceneAnimation();

        // Only calibrate if we have a meaningful time
        if (actualSeconds <= 0) return;

        // Update running average of actual call times (keep last 10 samples)
        const stats: LlmTimingStats = this.plugin.settings.pulseTimingStats ?? {
            averageTokenPerSec: 0,
            lastJobTokenCount: 0,
            lastJobDurationMs: 0,
            sampleSize: 0,
            recentSamples: [],
            sampleCount: 0
        };

        // Store actual call time directly (not a ratio)
        stats.recentSamples.push(actualSeconds);
        if (stats.recentSamples.length > 10) {
            stats.recentSamples.shift();
        }

        stats.sampleCount++;

        this.plugin.settings.pulseTimingStats = stats;
        // Save in background (don't await to avoid blocking)
        this.plugin.saveSettings();
    }

    public addError(message: string): void {
        if (!this.errorListEl) return;

        // Track error count
        this.errorCount++;
        const normalizedMessage = message?.trim() || 'Unknown error';
        const hint = this.deriveErrorHint(normalizedMessage);
        this.errorMessages.push({ message: normalizedMessage, hint: hint ?? undefined });

        // Show error list if it was hidden
        if (this.errorListEl.hasClass('rt-hidden')) {
            this.errorListEl.removeClass('rt-hidden');
            const header = this.errorListEl.createDiv({ cls: 'rt-pulse-error-header' });
            header.setText('Errors encountered:');
        }

        const errorItem = this.errorListEl.createDiv({ cls: 'rt-pulse-error-item' });
        errorItem.setText(normalizedMessage);
        if (hint) {
            errorItem.createDiv({ cls: 'rt-pulse-error-hint', text: hint });
        }
    }

    public setTripletInfo(prevNum: string, currentNum: string, nextNum: string, queueId?: string, sceneLabel?: string): void {
        this.setTripletNote(prevNum, currentNum, nextNum);
        if (this.queueData.length > 0) {
            const targetId = queueId ?? this.findQueueIdForScene(currentNum);
            this.updateQueueHighlight(targetId);
        }
        if (sceneLabel) {
            if (this.heroStatusEl) {
                this.heroStatusEl.setText(`Processing ${sceneLabel}`);
            }
            if (this.statusTextEl) {
                this.statusTextEl.setText(`Processing: ${sceneLabel}`);
            }
        }
    }

    public addWarning(message: string): void {
        if (!this.errorListEl) return;

        // Track warning count (doesn't affect success count)
        this.warningCount++;
        const normalizedMessage = message?.trim() || 'Warning encountered';
        this.warningMessages.push(normalizedMessage);

        // Show error list if it was hidden
        if (this.errorListEl.hasClass('rt-hidden')) {
            this.errorListEl.removeClass('rt-hidden');
            const header = this.errorListEl.createDiv({ cls: 'rt-pulse-error-header' });
            header.setText('Issues encountered:');
        }

        const warningItem = this.errorListEl.createDiv({ cls: 'rt-pulse-error-item rt-pulse-warning-item' });
        warningItem.setText(message);
    }

    private showCompletionSummary(statusMessage: string): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('');

        if (this.progressBarEl) {
            this.progressBarEl.style.setProperty('--progress-width', '100%');
            this.progressBarEl.removeClass('rt-progress-complete', 'rt-progress-error');
            if (this.errorCount > 0) {
                this.progressBarEl.addClass('rt-progress-error');
            } else {
                this.progressBarEl.addClass('rt-progress-complete');
            }
        }

        const successCount = Math.max(0, this.processedCount);
        const hasErrors = this.errorCount > 0;
        const hasWarnings = this.warningCount > 0;
        const hasIssues = hasErrors || hasWarnings;
        const remainingScenes = Math.max(0, this.totalCount - this.processedCount);

        const progressSummary = this.totalCount > 0
            ? `${successCount} / ${this.totalCount} scenes updated`
            : `${successCount} scene${successCount === 1 ? '' : 's'} updated`;
        if (this.progressTextEl) {
            this.progressTextEl.setText(progressSummary);
        }

        const statusParts: string[] = [];
        if (hasErrors) statusParts.push(`${this.errorCount} failed`);
        if (hasWarnings) statusParts.push(`${this.warningCount} skipped`);

        if (this.statusTextEl) {
            const statusText = statusParts.join(' | ');
            this.statusTextEl.setText(statusText);
            this.statusTextEl.removeClass('rt-error-text', 'rt-warning-text', 'rt-success-text');
            if (statusText) {
                if (hasErrors && successCount === 0) {
                    this.statusTextEl.addClass('rt-error-text');
                } else {
                    this.statusTextEl.addClass('rt-warning-text');
                }
            }
        }

        if (this.heroStatusEl) {
            this.heroStatusEl.setText(statusMessage);
        }

        if (this.errorListEl) {
            this.errorListEl.addClass('rt-hidden');
            this.errorListEl.empty();
        }

        contentEl.querySelectorAll('.rt-pulse-summary').forEach(el => el.remove());
        if (hasIssues) {
            const summaryContainer = contentEl.createDiv({ cls: 'rt-pulse-summary rt-glass-card' });
            summaryContainer.createEl('h3', { text: 'Processing details', cls: 'rt-pulse-summary-title' });
            const summaryStats = summaryContainer.createDiv({ cls: 'rt-pulse-summary-stats' });
            if (hasErrors) {
                summaryStats.createDiv({
                    cls: 'rt-pulse-summary-row rt-pulse-summary-error',
                    text: `Errors: ${this.errorCount}`
                });
            }
            if (hasWarnings) {
                summaryStats.createDiv({
                    cls: 'rt-pulse-summary-row rt-pulse-summary-warning',
                    text: `Warnings: ${this.warningCount} (skipped due to validation)`
                });
            }

            if (hasErrors && this.errorMessages.length > 0) {
                const errorDetails = summaryContainer.createDiv({ cls: 'rt-pulse-summary-list' });
                this.errorMessages.forEach(({ message, hint }) => {
                    const item = errorDetails.createDiv({ cls: 'rt-pulse-summary-item rt-pulse-summary-item-error' });
                    item.createSpan({ text: message });
                    if (hint) {
                        item.createDiv({ cls: 'rt-pulse-summary-hint', text: `Possible fix: ${hint}` });
                    }
                });
            }

            if (hasWarnings && this.warningMessages.length > 0) {
                const warningDetails = summaryContainer.createDiv({ cls: 'rt-pulse-summary-list' });
                this.warningMessages.forEach((warning) => {
                    const item = warningDetails.createDiv({ cls: 'rt-pulse-summary-item rt-pulse-summary-item-warning' });
                    item.createSpan({ text: warning });
                });
            }
        }

        contentEl.querySelectorAll('.rt-pulse-summary-tip').forEach(el => el.remove());

        // Only show log message for pulse analysis (synopsis doesn't write detailed logs)
        if (this.plugin.settings.logApiInteractions && this.taskType !== 'synopsis') {
            const logNoteEl = contentEl.createDiv({ cls: 'rt-pulse-summary-tip' });
            logNoteEl.createEl('strong', { text: 'Logs: ' });

            // Pulse-specific log message
            const isLocal = (this.plugin.settings.defaultAiProvider || 'openai') === 'local';
            const pulsesBypassed = isLocal && (this.plugin.settings.localSendPulseToAiReport ?? true);
            const pulseRouting = pulsesBypassed
                ? 'Triplet pulse updates bypassed scene yaml and were saved to the AI report.'
                : 'Triplet pulse updates were written to scene yaml.';
            if (this.logAttempts > 0) {
                const aiFolder = resolveAiLogFolder();
                logNoteEl.appendText(`Detailed AI interaction logs were saved to ${aiFolder}. ${pulseRouting}`);
            } else {
                logNoteEl.appendText(`Logging is enabled, but no AI request reached the server. ${pulseRouting}`);
            }
        }

        if (this.actionButtonContainer) {
            this.actionButtonContainer.empty();
            if (remainingScenes > 0 && (this.resumeCommandId || this.subplotName)) {
                new ButtonComponent(this.actionButtonContainer)
                    .setButtonText(`Resume (${remainingScenes} remaining)`)
                    .setCta()
                    .onClick(async () => {
                        this.close();

                        if (this.subplotName) {
                            const subplotName = this.subplotName;
                            const isEntireSubplot = this.isEntireSubplot;
                            window.setTimeout(async () => {
                                const { processBySubplotNameWithModal, processEntireSubplotWithModal } = await import('../SceneAnalysisCommands');
                                if (isEntireSubplot) {
                                    await processEntireSubplotWithModal(this.plugin, this.plugin.app.vault, subplotName, true);
                                } else {
                                    await processBySubplotNameWithModal(this.plugin, this.plugin.app.vault, subplotName);
                                }
                            }, 100);
                        } else if (this.resumeCommandId) {
                            this.plugin.settings._isResuming = true;
                            await this.plugin.saveSettings();
                            window.setTimeout(() => {
                                // @ts-ignore - accessing app commands
                                this.app.commands.executeCommandById(this.resumeCommandId);
                            }, 100);
                        }
                    });
            }

            new ButtonComponent(this.actionButtonContainer)
                .setButtonText('Close')
                .onClick(() => this.close());
        }
    }

    public isAborted(): boolean {
        return this.abortController?.signal.aborted ?? false;
    }

    public getAbortSignal(): AbortSignal | null {
        return this.abortController?.signal ?? null;
    }

    public noteLogAttempt(): void {
        this.logAttempts++;
    }

    /**
     * Programmatically abort processing (e.g., due to rate limiting)
     * Unlike abortProcessing(), this doesn't show a confirmation dialog
     */
    public abort(): void {
        if (!this.abortController) return;

        this.abortController.abort();
        this.statusTextEl?.setText('Processing stopped due to error');
        this.abortButtonEl?.setDisabled(true);
    }

    private getActiveModelDisplayName(): string {
        const provider = this.plugin.settings.defaultAiProvider || 'openai';
        let modelId: string;

        if (provider === 'anthropic') {
            modelId = this.plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929';
        } else if (provider === 'gemini') {
            modelId = this.plugin.settings.geminiModelId || DEFAULT_GEMINI_MODEL_ID;
        } else if (provider === 'local') {
            modelId = this.plugin.settings.localModelId || 'local-model';
        } else {
            modelId = this.plugin.settings.openaiModelId || 'gpt-4o';
        }

        return getModelDisplayName(modelId);
    }

    private deriveErrorHint(message: string): string | null {
        const normalized = message.toLowerCase();

        if (normalized.includes('temperature') && normalized.includes('default (1)')) {
            return 'This model only accepts its default temperature. Remove the custom temperature override in Settings → AI Providers.';
        }

        if (normalized.includes('model') && normalized.includes('not found')) {
            return 'Verify that the model is downloaded locally (use `ollama list`) and update the Local Model ID in settings to match exactly.';
        }

        if (normalized.includes('ollama server not responding') || normalized.includes('could not find ollama')) {
            return 'Launch Ollama (`ollama serve`) and confirm the Local Base URL points to the running server.';
        }

        if (normalized.includes('connection refused') || normalized.includes('timed out')) {
            return 'The plugin could not contact the local server. Check that it is running and that Obsidian has network permission.';
        }

        if (normalized.includes('schema') && normalized.includes('json')) {
            return 'The response was not valid JSON. Try switching to a larger or more instruction-following model.';
        }

        return null;
    }
}

export default SceneAnalysisProcessingModal;
