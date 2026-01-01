/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Runtime Estimation Processing Modal
 */

import { App, Modal, ButtonComponent, DropdownComponent, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { TimelineItem } from '../types';
import { estimateRuntime, getRuntimeSettings, formatRuntimeValue, parseRuntimeField } from '../utils/runtimeEstimator';
import { isBeatNote } from '../utils/sceneHelpers';

export type RuntimeScope = 'current' | 'subplot' | 'all';

export interface RuntimeQueueItem {
    path: string;
    title: string;
    subplot?: string;
}

/**
 * Modal for runtime estimation processing
 */
export class RuntimeProcessingModal extends Modal {
    private readonly plugin: RadialTimelinePlugin;
    private readonly onProcess: (scope: RuntimeScope, subplotFilter: string | undefined, overrideExisting: boolean) => Promise<void>;
    private readonly getSceneCount: (scope: RuntimeScope, subplotFilter: string | undefined, overrideExisting: boolean) => Promise<number>;

    private selectedScope: RuntimeScope = 'all';
    private selectedSubplot: string = 'All Subplots';
    private overrideExisting: boolean = false;
    public isProcessing: boolean = false;

    // UI elements
    private scopeContainer?: HTMLElement;
    private subplotDropdown?: DropdownComponent;
    private subplotContainer?: HTMLElement;
    private countEl?: HTMLElement;
    private progressBarEl?: HTMLElement;
    private progressTextEl?: HTMLElement;
    private statusTextEl?: HTMLElement;
    private runningTotalEl?: HTMLElement;
    private queueContainer?: HTMLElement;
    private actionButton?: ButtonComponent;
    private closeButton?: ButtonComponent;

    // Processing state
    private processedCount: number = 0;
    private totalCount: number = 0;
    private runningTotalSeconds: number = 0;
    private abortController: AbortController | null = null;

    constructor(
        app: App,
        plugin: RadialTimelinePlugin,
        getSceneCount: (scope: RuntimeScope, subplotFilter: string | undefined, overrideExisting: boolean) => Promise<number>,
        onProcess: (scope: RuntimeScope, subplotFilter: string | undefined, overrideExisting: boolean) => Promise<void>
    ) {
        super(app);
        this.plugin = plugin;
        this.getSceneCount = getSceneCount;
        this.onProcess = onProcess;
    }

    async onOpen(): Promise<void> {
        const { contentEl, modalEl, titleEl } = this;
        titleEl.setText('');

        if (modalEl) {
            modalEl.classList.add('rt-modal-shell');
            modalEl.style.width = '720px'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxWidth = '92vw'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
            modalEl.style.maxHeight = '92vh'; // SAFE: Modal sizing via inline styles (Obsidian pattern)
        }
        contentEl.addClass('rt-modal-container', 'rt-runtime-modal');

        if (this.isProcessing) {
            this.showProgressView();
        } else {
            await this.showConfirmationView();
        }
    }

    onClose(): void {
        // Allow closing while processing - it continues in background
    }

    close(): void {
        if (this.isProcessing) {
            new Notice('Processing continues in background.');
        }
        super.close();
    }

    private async showConfirmationView(): Promise<void> {
        const { contentEl } = this;
        contentEl.empty();

        // Header
        const header = contentEl.createDiv({ cls: 'rt-modal-header' });
        header.createSpan({ cls: 'rt-modal-badge', text: 'Runtime estimator' });
        header.createDiv({ cls: 'rt-modal-title', text: 'Runtime Estimation' });
        
        const contentType = this.plugin.settings.runtimeContentType || 'novel';
        const modeLabel = contentType === 'screenplay' ? 'Screenplay mode' : 'Novel/Audiobook mode';
        header.createDiv({ cls: 'rt-modal-subtitle', text: `Estimate screen time or reading time for your scenes. ${modeLabel}.` });

        // Scope selection
        const scopeCard = contentEl.createDiv({ cls: 'rt-glass-card' });
        scopeCard.createEl('h4', { text: 'Scope', cls: 'rt-runtime-subheader' });

        this.scopeContainer = scopeCard.createDiv({ cls: 'rt-runtime-scope-options' });
        
        this.createScopeOption('current', 'Current scene', 'Estimate runtime for the currently open scene only.');
        this.createScopeOption('subplot', 'Subplot scenes', 'Estimate runtime for all scenes in a specific subplot.');
        this.createScopeOption('all', 'All scenes', 'Estimate runtime for all scenes in the manuscript.');

        // Subplot dropdown (shown only when subplot scope is selected)
        this.subplotContainer = scopeCard.createDiv({ cls: 'rt-runtime-subplot-container rt-hidden' });
        this.subplotContainer.createEl('label', { text: 'Select subplot:', cls: 'rt-runtime-label' });
        
        const dropdownContainer = this.subplotContainer.createDiv();
        this.subplotDropdown = new DropdownComponent(dropdownContainer);
        
        await this.loadSubplots();
        
        this.subplotDropdown.onChange(() => {
            this.selectedSubplot = this.subplotDropdown?.getValue() || 'All Subplots';
            this.updateCount();
        });

        // Override toggle
        const overrideCard = contentEl.createDiv({ cls: 'rt-glass-card' });
        const overrideRow = overrideCard.createDiv({ cls: 'rt-runtime-override-row' });
        
        const checkbox = overrideRow.createEl('input', { type: 'checkbox' });
        checkbox.checked = this.overrideExisting;
        checkbox.addEventListener('change', () => {
            this.overrideExisting = checkbox.checked;
            this.updateCount();
        });
        
        const labelContainer = overrideRow.createDiv({ cls: 'rt-runtime-override-label' });
        labelContainer.createEl('span', { text: 'Override existing Runtime values' });
        labelContainer.createDiv({ cls: 'setting-item-description', text: 'When checked, recalculates and replaces any existing Runtime values. Otherwise, only scenes without Runtime are processed.' });

        // Scene count display
        const countCard = contentEl.createDiv({ cls: 'rt-glass-card' });
        this.countEl = countCard.createDiv({ cls: 'rt-runtime-count' });
        this.countEl.setText('Calculating...');

        // Action buttons
        const buttonRow = contentEl.createDiv({ cls: 'rt-modal-actions' });

        this.actionButton = new ButtonComponent(buttonRow)
            .setButtonText('Estimate Runtimes')
            .setCta()
            .onClick(async () => {
                await this.startProcessing();
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        // Initial count
        await this.updateCount();
    }

    private createScopeOption(scope: RuntimeScope, label: string, description: string): void {
        if (!this.scopeContainer) return;

        const optionEl = this.scopeContainer.createDiv({ cls: 'rt-runtime-scope-option' });

        const radioEl = optionEl.createEl('input', {
            type: 'radio',
            attr: { name: 'runtime-scope', value: scope }
        });
        radioEl.checked = this.selectedScope === scope;

        radioEl.addEventListener('change', () => {
            if (radioEl.checked) {
                this.selectedScope = scope;
                this.updateScopeVisibility();
                this.updateCount();
            }
        });

        const labelContainer = optionEl.createDiv({ cls: 'rt-runtime-scope-label' });
        labelContainer.createDiv({ cls: 'rt-runtime-scope-title', text: label });
        labelContainer.createDiv({ cls: 'rt-runtime-scope-desc', text: description });

        optionEl.addEventListener('click', () => {
            radioEl.checked = true;
            this.selectedScope = scope;
            this.updateScopeVisibility();
            this.updateCount();
        });
    }

    private updateScopeVisibility(): void {
        if (this.subplotContainer) {
            if (this.selectedScope === 'subplot') {
                this.subplotContainer.removeClass('rt-hidden');
            } else {
                this.subplotContainer.addClass('rt-hidden');
            }
        }
    }

    private async loadSubplots(): Promise<void> {
        if (!this.subplotDropdown) return;

        try {
            const scenes = await this.plugin.getSceneData();
            const subplotCounts = new Map<string, number>();

            scenes.forEach(scene => {
                if (isBeatNote(scene)) return;
                const sub = scene.subplot && scene.subplot.trim() ? scene.subplot : 'Main Plot';
                subplotCounts.set(sub, (subplotCounts.get(sub) || 0) + 1);
            });

            const sortedSubplots = Array.from(subplotCounts.keys()).sort((a, b) => {
                if (a === 'Main Plot') return -1;
                if (b === 'Main Plot') return 1;
                return (subplotCounts.get(b) || 0) - (subplotCounts.get(a) || 0);
            });

            this.subplotDropdown.selectEl.textContent = '';
            sortedSubplots.forEach(sub => {
                this.subplotDropdown?.addOption(sub, `${sub} (${subplotCounts.get(sub)})`);
            });

            if (sortedSubplots.length > 0) {
                this.selectedSubplot = sortedSubplots[0];
                this.subplotDropdown.setValue(this.selectedSubplot);
            }
        } catch (e) {
            console.error('Failed to load subplots', e);
        }
    }

    private async updateCount(): Promise<void> {
        if (!this.countEl) return;

        this.countEl.empty();
        this.countEl.setText('Calculating...');

        try {
            const subplotFilter = this.selectedScope === 'subplot' ? this.selectedSubplot : undefined;
            const count = await this.getSceneCount(this.selectedScope, subplotFilter, this.overrideExisting);

            this.countEl.empty();
            const countText = this.countEl.createDiv({ cls: 'rt-runtime-count-text' });
            countText.createSpan({ text: 'Scenes to process: ', cls: 'rt-runtime-label' });
            countText.createSpan({ text: String(count), cls: 'rt-runtime-number' });

            if (count === 0) {
                const hint = this.countEl.createDiv({ cls: 'rt-runtime-hint' });
                if (this.selectedScope === 'current') {
                    hint.setText('Open a scene file to estimate its runtime.');
                } else if (!this.overrideExisting) {
                    hint.setText('All scenes already have Runtime values. Enable "Override existing" to recalculate.');
                }
            }
        } catch (error) {
            this.countEl.setText(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async startProcessing(): Promise<void> {
        this.isProcessing = true;
        this.abortController = new AbortController();
        this.processedCount = 0;
        this.runningTotalSeconds = 0;

        this.showProgressView();

        try {
            const subplotFilter = this.selectedScope === 'subplot' ? this.selectedSubplot : undefined;
            await this.onProcess(this.selectedScope, subplotFilter, this.overrideExisting);
            this.showCompletionSummary('Estimation completed successfully!');
        } catch (error) {
            if (this.abortController?.signal.aborted) {
                this.showCompletionSummary('Estimation aborted');
            } else {
                this.showCompletionSummary(`Error: ${error instanceof Error ? error.message : String(error)}`);
            }
        } finally {
            this.isProcessing = false;
            this.abortController = null;
        }
    }

    private showProgressView(): void {
        const { contentEl } = this;
        contentEl.empty();

        // Header
        const header = contentEl.createDiv({ cls: 'rt-modal-header' });
        header.createSpan({ cls: 'rt-modal-badge', text: 'Runtime estimator' });
        header.createDiv({ cls: 'rt-modal-title', text: 'Estimating Runtimes...' });
        this.statusTextEl = header.createDiv({ cls: 'rt-modal-subtitle' });
        this.statusTextEl.setText('Initializing...');

        // Progress card
        const progressCard = contentEl.createDiv({ cls: 'rt-glass-card' });

        // Progress bar
        const progressContainer = progressCard.createDiv({ cls: 'rt-pulse-progress-container' });
        const progressBg = progressContainer.createDiv({ cls: 'rt-pulse-progress-bg' });
        this.progressBarEl = progressBg.createDiv({ cls: 'rt-pulse-progress-bar' });
        this.progressBarEl.style.setProperty('--progress-width', '0%');

        this.progressTextEl = progressCard.createDiv({ cls: 'rt-pulse-progress-text' });
        this.progressTextEl.setText('0 / 0 scenes (0%)');

        // Running total
        const totalSection = progressCard.createDiv({ cls: 'rt-runtime-running-total' });
        totalSection.createSpan({ text: 'Running total: ', cls: 'rt-runtime-label' });
        this.runningTotalEl = totalSection.createSpan({ cls: 'rt-runtime-number' });
        this.runningTotalEl.setText('0:00');

        // Queue container
        this.queueContainer = progressCard.createDiv({ cls: 'rt-runtime-queue' });

        // Action buttons
        const buttonRow = contentEl.createDiv({ cls: 'rt-modal-actions' });

        new ButtonComponent(buttonRow)
            .setButtonText('Abort')
            .setWarning()
            .onClick(() => {
                this.abortController?.abort();
                new Notice('Aborting...');
            });

        this.closeButton = new ButtonComponent(buttonRow)
            .setButtonText('Close')
            .setDisabled(true)
            .onClick(() => this.close());
    }

    public updateProgress(current: number, total: number, sceneName: string, sceneRuntimeSeconds: number): void {
        this.processedCount = current;
        this.totalCount = total;
        this.runningTotalSeconds += sceneRuntimeSeconds;

        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

        if (this.progressBarEl) {
            this.progressBarEl.style.setProperty('--progress-width', `${percentage}%`);
        }

        if (this.progressTextEl) {
            this.progressTextEl.setText(`${current} / ${total} scenes (${percentage}%)`);
        }

        if (this.statusTextEl) {
            this.statusTextEl.setText(`Processing: ${sceneName}`);
        }

        if (this.runningTotalEl) {
            this.runningTotalEl.setText(formatRuntimeValue(this.runningTotalSeconds));
        }
    }

    public setTotalCount(total: number): void {
        this.totalCount = total;
        if (this.progressTextEl) {
            this.progressTextEl.setText(`0 / ${total} scenes (0%)`);
        }
    }

    public isAborted(): boolean {
        return this.abortController?.signal.aborted ?? false;
    }

    private showCompletionSummary(message: string): void {
        if (this.progressBarEl) {
            this.progressBarEl.style.setProperty('--progress-width', '100%');
            this.progressBarEl.addClass('rt-progress-complete');
        }

        if (this.statusTextEl) {
            this.statusTextEl.setText(message);
        }

        if (this.progressTextEl) {
            this.progressTextEl.setText(`${this.processedCount} scenes processed`);
        }

        if (this.runningTotalEl) {
            this.runningTotalEl.setText(formatRuntimeValue(this.runningTotalSeconds));
        }

        if (this.closeButton) {
            this.closeButton.setDisabled(false);
            this.closeButton.setCta();
        }
    }
}

export default RuntimeProcessingModal;

