/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Gossamer AI Processing Modal
 * Tracks progress of Gemini momentum analysis with manuscript details and status updates
 */
import { App, ButtonComponent, Notice } from 'obsidian';
import { ErtModal } from '../ui/ErtModal';
import type RadialTimelinePlugin from '../main';
import { t } from '../i18n';
import { DEFAULT_GOSSAMER_SIGNAL, GOSSAMER_SIGNAL_METADATA } from '../types/gossamerSignals';
import { getCredential } from '../ai/credentials/credentials';
import { getModelDisplayName } from '../utils/modelResolver';
import { SimulatedProgress } from '../utils/simulatedProgress';
import type { AIRunAdvancedContext } from '../ai/types';
import { describeTokenEstimateMethod } from '../ai/tokens/inputTokenEstimate';
import { redactSensitiveValue } from '../ai/credentials/redactSensitive';
import { CANONICAL_PROVIDER_LABELS, getCanonicalAiSettings, resolveConfiguredSelection } from '../ai/runtime/runtimeSelection';
import { getActiveBookTitle } from '../utils/books';

export interface ManuscriptInfo {
    totalScenes: number;
    totalWords: number;
    estimatedTokens: number;
    beatCount: number;
    beatSystem: string; // Beat system name (e.g., "Save The Cat", "Custom")
    evidenceMode?: string;
    hasIterativeContext?: boolean; // Always false - previous scores not sent to avoid anchoring bias
}

export interface AnalysisOptions {
    requestScores: boolean;
}

/**
 * Modal for confirming and showing progress of Gossamer AI momentum analysis
 */
export class GossamerProcessingModal extends ErtModal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly onConfirm: (options: AnalysisOptions) => Promise<void>;

    public isProcessing: boolean = false;
    public analysisOptions: AnalysisOptions = {
        requestScores: true
    };

    // UI elements
    private confirmationView?: HTMLElement;
    private processingView?: HTMLElement;
    private subtitleEl?: HTMLElement;
    private manuscriptInfoEl?: HTMLElement;
    private statusTextEl?: HTMLElement;
    private apiStatusEl?: HTMLElement;
    private progressBarEl?: HTMLElement;
    private errorListEl?: HTMLElement;
    private closeButtonEl?: ButtonComponent;
    private aiAdvancedPreEl?: HTMLElement;
    private aiAdvancedContext: AIRunAdvancedContext | null = null;

    // Processing state
    private manuscriptInfo?: ManuscriptInfo;
    private currentStatus: string = t('gossamer.processingModal.statusInitializing');
    private apiCallStartTime?: number;
    private lastElapsedSeconds?: string;
    private timerInterval?: number;
    private progressSimulator?: SimulatedProgress;
    private estimatedProcessingMs: number = 45000; // Fallback estimate (45s typical)

    constructor(
        app: App,
        plugin: RadialTimelinePlugin,
        onConfirm: (options: AnalysisOptions) => Promise<void>
    ) {
        super(app);
        this.plugin = plugin;
        this.onConfirm = onConfirm;
    }

    onOpen(): void {
        const { contentEl, titleEl } = this;
        titleEl.setText('');
        this.applyShell({ width: '800px', containerClasses: ['ert-gossamer-processing-modal'] });
        if (this.modalEl) {
            this.modalEl.style.maxWidth = '90vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            this.modalEl.style.maxHeight = '92vh'; // Align with other tall modals for small screens
        }

        // Show confirmation view first
        this.showConfirmationView();
    }

    private renderProcessingHero(parent: HTMLElement, subtitle: string, modelName?: string): void {
        const hero = parent.createDiv({ cls: 'ert-modal-header' });

        // Build badge text with active book title and active signal
        const signal = this.plugin.gossamerSelectedSignal ?? DEFAULT_GOSSAMER_SIGNAL;
        const signalMeta = GOSSAMER_SIGNAL_METADATA[signal];
        const signalLabelLower = signalMeta.label.toLowerCase();
        const bookTitle = getActiveBookTitle(this.plugin.settings);
        const parts = [t('gossamer.processingModal.badge', { signal: signalLabelLower }), bookTitle, modelName].filter(Boolean);
        const badgeText = parts.join(' · ');

        hero.createSpan({ text: badgeText, cls: 'ert-modal-badge' });
        hero.createDiv({ text: t('gossamer.processingModal.title', { signal: signalLabelLower }), cls: 'ert-modal-title' });
        this.subtitleEl = hero.createDiv({ text: subtitle, cls: 'ert-modal-subtitle' });
    }

    onClose(): void {
        // Clear timer if active
        if (this.timerInterval) {
            window.clearInterval(this.timerInterval);
            this.timerInterval = undefined;
        }
        if (this.progressSimulator) {
            this.progressSimulator.stop();
        }
        // Allow closing while processing - it continues in background
    }

    /**
     * Override close() to allow minimizing while processing continues
     */
    close(): void {
        if (this.isProcessing) {
            new Notice(t('gossamer.processingModal.backgroundContinues'));
        }
        super.close();
    }

    private getActiveModelDisplayName(): string {
        const aiSettings = getCanonicalAiSettings(this.plugin);
        const selection = resolveConfiguredSelection(aiSettings, { feature: 'Gossamer' });
        return selection ? getModelDisplayName(selection.model.id) : t('gossamer.processingModal.modelDisabled');
    }

    private showConfirmationView(): void {
        const { contentEl } = this;
        contentEl.empty();

        const modelName = this.getActiveModelDisplayName();
        const signal = this.plugin.gossamerSelectedSignal ?? DEFAULT_GOSSAMER_SIGNAL;
        const signalLabelLower = GOSSAMER_SIGNAL_METADATA[signal].label.toLowerCase();
        this.renderProcessingHero(contentEl, t('gossamer.processingModal.confirmSubtitle', { signal: signalLabelLower }), modelName);

        this.confirmationView = contentEl;

        const card = contentEl.createDiv({ cls: 'ert-glass-card' });

        // Info section (no extra spacing class)
        const infoEl = card.createDiv();

        // Beat system info (will be updated when manuscript info is set)
        const beatSystemEl = infoEl.createDiv({ cls: 'ert-gossamer-proc-beat-system-info' });
        beatSystemEl.setText(t('gossamer.processingModal.gatheringDetails'));

        // Manuscript info section (will be populated by caller)
        const infoSection = card.createDiv({ cls: 'ert-gossamer-proc-info-section' });
        infoSection.createEl('h3', { text: t('gossamer.processingModal.manuscriptInfoHeading'), cls: 'ert-section-title' });
        this.manuscriptInfoEl = infoSection.createDiv({ cls: 'ert-gossamer-proc-manuscript-info' });
        this.manuscriptInfoEl.setText(t('gossamer.processingModal.gatheringDetails'));

        // Check if API key is configured for the active provider
        const aiSettings = getCanonicalAiSettings(this.plugin);
        const selection = resolveConfiguredSelection(aiSettings, { feature: 'Gossamer' });
        const activeProvider = selection?.provider ?? aiSettings.provider;
        if (activeProvider !== 'none' && activeProvider !== 'ollama') {
            getCredential(this.plugin, activeProvider).then(key => {
                if (!key) {
                    const name = CANONICAL_PROVIDER_LABELS[activeProvider];
                    const warningEl = card.createDiv({ cls: 'ert-pulse-warning' });
                    warningEl.setText(t('gossamer.processingModal.keyMissing', { provider: name }));
                }
            });
        }

        // Action buttons
        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });

        new ButtonComponent(buttonRow)
            .setButtonText(t('gossamer.processingModal.beginButton'))
            .setCta()
            .onClick(async () => {
                await this.startProcessing();
            });

        new ButtonComponent(buttonRow)
            .setButtonText(t('gossamer.processingModal.cancelButton'))
            .onClick(() => this.close());
    }

    private async startProcessing(): Promise<void> {
        this.isProcessing = true;
        this.showProcessingView();

        try {
            await this.onConfirm(this.analysisOptions);
        } catch (error) {
            console.error('[Gossamer AI] Processing error:', error);
        }
    }

    private showProcessingView(): void {
        const { contentEl } = this;
        contentEl.empty();

        const modelName = this.getActiveModelDisplayName();
        this.renderProcessingHero(contentEl, t('gossamer.processingModal.analyzingManuscript'), modelName);

        const bodyEl = contentEl.createDiv({ cls: 'ert-pulse-progress-body' });
        const progressCard = bodyEl.createDiv({ cls: 'ert-pulse-progress-card ert-glass-card' });

        // Manuscript info section (reusing existing styles but inside the card)
        const infoSection = progressCard.createDiv({ cls: 'ert-gossamer-proc-info-section' });
        infoSection.createEl('h3', { text: t('gossamer.processingModal.manuscriptInfoHeading'), cls: 'ert-section-title' });
        this.manuscriptInfoEl = infoSection.createDiv({ cls: 'ert-gossamer-proc-manuscript-info' });
        this.manuscriptInfoEl.setText(t('gossamer.processingModal.assemblingManuscript'));

        // Progress bar container
        const progressContainer = progressCard.createDiv({ cls: 'ert-pulse-progress-container' });
        const progressBg = progressContainer.createDiv({ cls: 'ert-pulse-progress-bg' });
        this.progressBarEl = progressBg.createDiv({ cls: 'ert-pulse-progress-bar' });
        this.progressBarEl.style.setProperty('--progress-width', '0%');

        // Status section
        const statusSection = progressCard.createDiv({ cls: 'ert-gossamer-proc-status-section' });
        statusSection.createEl('h3', { text: t('gossamer.processingModal.statusHeading'), cls: 'ert-section-title' });
        this.statusTextEl = statusSection.createDiv({ cls: 'ert-gossamer-proc-status-text' });
        this.statusTextEl.setText(this.currentStatus);

        this.apiStatusEl = statusSection.createDiv({ cls: 'ert-gossamer-proc-api-status' });
        this.apiStatusEl.setText(t('gossamer.processingModal.waitingToSend'));

        const advancedDetails = progressCard.createEl('details', { cls: 'ert-ai-advanced-details' });
        advancedDetails.createEl('summary', { text: t('gossamer.processingModal.advancedHeading') });
        this.aiAdvancedPreEl = advancedDetails.createEl('pre', { cls: 'ert-ai-advanced-pre' });
        this.renderAiAdvancedContext();

        // Error section
        this.errorListEl = bodyEl.createDiv({ cls: 'ert-pulse-error-list ert-glass-card ert-hidden' });

        // Close button (disabled while processing)
        const buttonContainer = contentEl.createDiv({ cls: 'ert-modal-actions' });
        this.closeButtonEl = new ButtonComponent(buttonContainer)
            .setButtonText(t('gossamer.processingModal.closeButton'))
            .setDisabled(true)
            .onClick(() => this.close());
    }

    public setAiAdvancedContext(context: AIRunAdvancedContext | null): void {
        this.aiAdvancedContext = context;
        this.renderAiAdvancedContext();
    }

    private renderAiAdvancedContext(): void {
        if (!this.aiAdvancedPreEl) return;
        if (!this.aiAdvancedContext) {
            this.aiAdvancedPreEl.setText(t('gossamer.processingModal.waitingFirstRequest'));
            return;
        }
        const ctx = this.aiAdvancedContext;
        const availabilityValue = ctx.availabilityStatus === 'visible'
            ? t('gossamer.processingModal.advAvailabilityVisible')
            : ctx.availabilityStatus === 'not_visible'
                ? t('gossamer.processingModal.advAvailabilityNotVisible')
                : t('gossamer.processingModal.advAvailabilityUnknown');
        const tokenLine = typeof ctx.totalInputTokens === 'number' && Number.isFinite(ctx.totalInputTokens)
            ? t('gossamer.processingModal.advTokenEstimate', {
                count: Math.max(0, Math.floor(ctx.totalInputTokens)).toLocaleString(),
                method: describeTokenEstimateMethod(ctx.tokenEstimateMethod ?? 'heuristic_chars')
            })
            : t('gossamer.processingModal.advTokenEstimateUnavailable');
        const lines = [
            t('gossamer.processingModal.advRoleTemplate', { value: ctx.roleTemplateName }),
            t('gossamer.processingModal.advResolvedModel', { provider: ctx.provider, alias: ctx.modelAlias, label: ctx.modelLabel }),
            t('gossamer.processingModal.advModelSelectionReason', { value: redactSensitiveValue(ctx.modelSelectionReason) }),
            t('gossamer.processingModal.advAvailability', { value: availabilityValue }),
            t('gossamer.processingModal.advAppliedCaps', { input: ctx.maxInputTokens, output: ctx.maxOutputTokens }),
            tokenLine,
            t('gossamer.processingModal.advPackaging'),
            t('gossamer.processingModal.advEvidence', { value: this.manuscriptInfo?.evidenceMode || t('gossamer.processingModal.evidenceDefault') }),
            '',
            t('gossamer.processingModal.advFinalPromptLabel'),
            redactSensitiveValue(ctx.finalPrompt || t('gossamer.processingModal.advFinalPromptNone'))
        ];
        if (typeof ctx.executionPassCount === 'number' && ctx.executionPassCount > 1) {
            lines.splice(6, 0, t('gossamer.processingModal.advPassCount', { value: ctx.executionPassCount }));
        }
        if (ctx.multiPassTriggerReason) {
            lines.splice(7, 0, t('gossamer.processingModal.advMultiPassTrigger', { value: redactSensitiveValue(ctx.multiPassTriggerReason) }));
        }
        this.aiAdvancedPreEl.setText(lines.join('\n'));
    }

    /**
     * Update manuscript assembly information
     */
    public setManuscriptInfo(info: ManuscriptInfo): void {
        this.manuscriptInfo = info;

        if (this.manuscriptInfoEl) {
            this.manuscriptInfoEl.empty();

            // Stats Grid
            const stats = this.manuscriptInfoEl.createDiv({ cls: 'ert-gossamer-proc-stats' });

            const createStat = (label: string, value: string) => {
                const item = stats.createDiv({ cls: 'ert-gossamer-proc-stat-item' });
                item.createDiv({ cls: 'ert-gossamer-proc-stat-label', text: label });
                item.createDiv({ cls: 'ert-gossamer-proc-stat-value', text: value });
            };

            createStat(t('gossamer.processingModal.statScenes'), info.totalScenes.toLocaleString());
            createStat(t('gossamer.processingModal.statWords'), info.totalWords.toLocaleString());
            createStat(t('gossamer.processingModal.statCorpusTokens'), `~${info.estimatedTokens.toLocaleString()}`);
            createStat(t('gossamer.processingModal.statBeats'), info.beatCount.toString());
            createStat(t('gossamer.processingModal.statEvidence'), info.evidenceMode || t('gossamer.processingModal.evidenceDefault'));

            // Note: Previous scores are not sent to AI to avoid anchoring bias.
            // Each analysis is fresh based on manuscript content only.
        }

        // Precompute estimated processing time for smoother progress animation
        this.estimatedProcessingMs = this.estimateProcessingMs(info);

        // Update the beat system info in confirmation view if it exists
        const beatSystemInfoEl = this.confirmationView?.querySelector('.ert-gossamer-proc-beat-system-info');
        if (beatSystemInfoEl) {
            beatSystemInfoEl.setText(t('gossamer.processingModal.beatSystemLine', { name: info.beatSystem }));
        }
        this.renderAiAdvancedContext();
    }

    /**
     * Update current status message
     */
    public setStatus(status: string): void {
        this.currentStatus = status;

        if (this.statusTextEl) {
            this.statusTextEl.setText(status);
        }
    }

    /**
     * Mark API call as started
     */
    public apiCallStarted(): void {
        this.apiCallStartTime = Date.now();

        if (this.apiStatusEl) {
            this.apiStatusEl.empty();
            this.updateTimer();

            // SAFE: Modal doesn't have registerInterval; manually cleaned up in onClose()
            this.timerInterval = window.setInterval(() => {
                this.updateTimer();
            }, 1000);
        }

        // Animate progress bar to indicate activity (pulse between 10% and 90%)
        if (this.progressBarEl) {
            this.progressBarEl.addClass('ert-gossamer-progress-active');
        }

        this.startSimulatedProgress();
    }

    /**
     * Update elapsed time display
     */
    private updateTimer(): void {
        if (!this.apiStatusEl || !this.apiCallStartTime) return;

        const elapsed = Math.floor((Date.now() - this.apiCallStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        const timeStr = minutes > 0
            ? `${minutes}:${seconds.toString().padStart(2, '0')}`
            : `${seconds}s`;

        // Show elapsed time only. The previous "running longer than
        // expected (est. ~Ns)" framing read as anxious/lame UX — the
        // progress bar already conveys "still working." Skip the
        // estimate-comparison commentary entirely.
        const message = t('gossamer.processingModal.timerElapsed', { time: timeStr });
        this.apiStatusEl.setText(message);
    }

    /**
     * Mark API call as successful
     */
    public apiCallSuccess(): void {
        // Clear timer
        if (this.timerInterval) {
            window.clearInterval(this.timerInterval);
            this.timerInterval = undefined;
        }

        const elapsedMs = this.apiCallStartTime ? Date.now() - this.apiCallStartTime : undefined;
        this.lastElapsedSeconds = elapsedMs !== undefined ? (elapsedMs / 1000).toFixed(1) : undefined;

        // Persist elapsed per-signal so the next run can seed a realistic ETA
        // instead of falling back to the size-based heuristic.
        if (elapsedMs !== undefined && elapsedMs > 0) {
            void this.persistLastRunDuration(elapsedMs);
        }

        // Elapsed is now rolled into the combined success line in completeProcessing;
        // clear the separate "Response received" row so there's only one end-state line.
        if (this.apiStatusEl) {
            this.apiStatusEl.empty();
        }

        // Complete the progress bar and pause animation
        if (this.progressSimulator) {
            this.progressSimulator.complete();
        }
        if (this.progressBarEl) {
            this.progressBarEl.removeClass('ert-gossamer-progress-active');
            this.progressBarEl.addClass('ert-progress-complete');
            // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
            this.progressBarEl.style.setProperty('--progress-width', '100%');
        }
    }

    private async persistLastRunDuration(elapsedMs: number): Promise<void> {
        const signal = this.plugin.gossamerSelectedSignal ?? DEFAULT_GOSSAMER_SIGNAL;
        const bucket = this.plugin.settings.gossamerLastRunMsBySignal ?? {};
        bucket[signal] = elapsedMs;
        this.plugin.settings.gossamerLastRunMsBySignal = bucket;
        await this.plugin.saveSettings();
    }

    /**
     * Mark API call as failed with error
     */
    public apiCallError(error: string): void {
        // Clear timer
        if (this.timerInterval) {
            window.clearInterval(this.timerInterval);
            this.timerInterval = undefined;
        }

        if (this.apiStatusEl) {
            this.apiStatusEl.empty();
            this.apiStatusEl.setText(t('gossamer.processingModal.apiFailed'));
        }

        // Reset progress bar
        if (this.progressSimulator) {
            this.progressSimulator.fail();
        }
        if (this.progressBarEl) {
            this.progressBarEl.removeClass('ert-gossamer-progress-active');
            this.progressBarEl.addClass('ert-progress-complete');
            // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
            this.progressBarEl.style.setProperty('--progress-width', '0%');
        }

        this.addError(error);
    }

    /**
     * Add error message to error section (using Scene Analysis styling)
     */
    public addError(message: string): void {
        if (!this.errorListEl) return;

        // Show error section
        if (this.errorListEl.hasClass('ert-hidden')) {
            this.errorListEl.removeClass('ert-hidden');
            const header = this.errorListEl.createDiv({ cls: 'ert-gossamer-proc-error-header' });
            header.setText(t('gossamer.processingModal.errorsHeader'));
        }

        const errorItem = this.errorListEl.createDiv({ cls: 'ert-gossamer-proc-error-item' });
        errorItem.setText(message);
    }

    /**
     * Mark processing as complete
     */
    public completeProcessing(success: boolean, message: string): void {
        this.isProcessing = false;

        if (this.statusTextEl) {
            const elapsedSuffix = success && this.lastElapsedSeconds ? ` (${this.lastElapsedSeconds}s)` : '';
            this.statusTextEl.setText(`${message}${elapsedSuffix}`);
        }

        // Modal subtitle stays as the original setup description for the
        // whole run — the run status is surfaced by statusTextEl below.
        // Mirroring it on the subtitle was redundant.

        // Complete the progress bar and pause animation
        if (this.progressSimulator) {
            if (success) {
                this.progressSimulator.complete();
            } else {
                this.progressSimulator.fail();
            }
        }
        if (this.progressBarEl) {
            this.progressBarEl.removeClass('ert-gossamer-progress-active');
            this.progressBarEl.addClass('ert-progress-complete');
            if (success) {
                // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
                this.progressBarEl.style.setProperty('--progress-width', '100%');
            }
        }

        if (this.closeButtonEl) {
            this.closeButtonEl.setDisabled(false);
            if (success) {
                this.closeButtonEl.setCta();
            }
        }
    }

    /**
     * Show rate limit notification
     */
    public showRateLimitWarning(retryAfter?: number): void {
        const message = retryAfter
            ? t('gossamer.processingModal.rateLimitWithRetry', { seconds: retryAfter })
            : t('gossamer.processingModal.rateLimit');

        this.addError(message);

        if (this.apiStatusEl) {
            this.apiStatusEl.setText(t('gossamer.processingModal.rateLimited'));
        }
    }

    /**
     * Start a simulated progress animation using manuscript-derived estimate.
     */
    private startSimulatedProgress(): void {
        const durationMs = this.estimateProcessingMs(this.manuscriptInfo);
        this.estimatedProcessingMs = durationMs;

        const simulator = this.getProgressSimulator();
        simulator.start({
            durationMs,
            startPercent: 8,
            maxPercent: 93,
            jitter: 0.9
        });
    }

    /**
     * Ensure we have a simulator instance and wire it to the bar element.
     */
    private getProgressSimulator(): SimulatedProgress {
        if (!this.progressSimulator) {
            this.progressSimulator = new SimulatedProgress((percent: number) => {
                this.updateProgressWidth(percent);
            });
        }
        return this.progressSimulator;
    }

    private updateProgressWidth(percent: number): void {
        if (this.progressBarEl) {
            // SAFE: inline style used for CSS custom property (--progress-width) to enable smooth progress animation
            this.progressBarEl.style.setProperty('--progress-width', `${percent}%`);
        }
    }

    /**
     * Estimate processing duration. Prefers the last observed duration for the
     * active signal (persisted across runs); falls back to a manuscript-size
     * heuristic when no prior sample exists.
     */
    private estimateProcessingMs(info?: ManuscriptInfo): number {
        const signal = this.plugin.gossamerSelectedSignal ?? DEFAULT_GOSSAMER_SIGNAL;
        const persisted = this.plugin.settings.gossamerLastRunMsBySignal?.[signal];
        if (typeof persisted === 'number' && Number.isFinite(persisted) && persisted > 0) {
            return this.clamp(persisted, 5000, 300000);
        }

        if (!info) return this.estimatedProcessingMs || 45000;

        const tokens = info.estimatedTokens ?? Math.round(info.totalWords * 1.35);
        const tokenSeconds = tokens / 4000; // Calibrated to ~40s for 139k tokens
        const sceneSeconds = Math.min(8, info.totalScenes * 0.08);
        const beatSeconds = Math.min(4, info.beatCount * 0.1);
        const iterativeSeconds = 0; // No longer used - previous scores not sent to avoid anchoring bias

        const totalSeconds = this.clamp(
            tokenSeconds + sceneSeconds + beatSeconds + iterativeSeconds,
            18,
            95
        );

        return totalSeconds * 1000;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.min(max, Math.max(min, value));
    }
}

export default GossamerProcessingModal;
