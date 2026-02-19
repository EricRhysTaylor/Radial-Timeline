/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 * 
 * Runtime Estimation Processing Modal
 */

import { App, Modal, ButtonComponent, DropdownComponent, Notice, setIcon } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { TimelineItem } from '../types';
import { formatRuntimeValue, getRuntimeSettings } from '../utils/runtimeEstimator';
import { isNonSceneItem } from '../utils/sceneHelpers';
import { ERT_CLASSES } from '../ui/classes';
import type { AIRunAdvancedContext } from '../ai/types';
import { redactSensitiveValue } from '../ai/credentials/redactSensitive';

export type RuntimeScope = 'current' | 'subplot' | 'all';
export type RuntimeMode = 'local' | 'ai';

export interface RuntimeProcessResult {
    message?: string;
    localTotalSeconds?: number;
    aiResult?: {
        success: boolean;
        aiSeconds?: number;
        provider?: string;
        modelId?: string;
        rationale?: string;
        error?: string;
    };
}

export interface RuntimeStatusFilters {
    includeTodo: boolean;
    includeWorking: boolean;
    includeComplete: boolean;
}

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
    private readonly onProcess: (scope: RuntimeScope, subplotFilter: string | undefined, overrideExisting: boolean, statusFilters: RuntimeStatusFilters, mode: RuntimeMode) => Promise<RuntimeProcessResult | void>;
    private readonly getSceneCount: (scope: RuntimeScope, subplotFilter: string | undefined, overrideExisting: boolean, statusFilters: RuntimeStatusFilters) => Promise<number>;

    private selectedScope: RuntimeScope = 'all';
    private selectedSubplot: string = '';
    private overrideExisting: boolean = false;
    private selectedMode: RuntimeMode = 'local';
    private statusFilters: RuntimeStatusFilters = {
        includeTodo: false,
        includeWorking: true,
        includeComplete: true
    };
    public isProcessing: boolean = false;

    // UI elements
    private scopeDropdown?: DropdownComponent;
    private subplotDropdown?: DropdownComponent;
    private subplotLabelContainer?: HTMLElement;
    private subplotDropdownContainer?: HTMLElement;
    private currentSceneContainer?: HTMLElement;
    private currentSceneNameEl?: HTMLElement;
    private modeDescEl?: HTMLElement;
    private settingsAccordion?: HTMLElement;
    private settingsContent?: HTMLElement;
    private settingsExpanded: boolean = false;
    private countEl?: HTMLElement;
    private progressBarEl?: HTMLElement;
    private progressTextEl?: HTMLElement;
    private statusTextEl?: HTMLElement;
    private runningTotalEl?: HTMLElement;
    private queueContainer?: HTMLElement;
    private actionButton?: ButtonComponent;
    private closeButton?: ButtonComponent;
    private aiAdvancedContext: AIRunAdvancedContext | null = null;
    private aiAdvancedPreEl?: HTMLElement;

    // Subplot data
    private orderedSubplots: { name: string; count: number }[] = [];

    // Processing state
    private processedCount: number = 0;
    private totalCount: number = 0;
    private runningTotalSeconds: number = 0;
    private abortController: AbortController | null = null;

    constructor(
        app: App,
        plugin: RadialTimelinePlugin,
        getSceneCount: (scope: RuntimeScope, subplotFilter: string | undefined, overrideExisting: boolean, statusFilters: RuntimeStatusFilters) => Promise<number>,
        onProcess: (scope: RuntimeScope, subplotFilter: string | undefined, overrideExisting: boolean, statusFilters: RuntimeStatusFilters, mode: RuntimeMode) => Promise<RuntimeProcessResult | void>
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
            modalEl.classList.add('ert-ui', 'ert-scope--modal', 'ert-modal-shell', 'ert-runtime-modal-shell', ERT_CLASSES.SKIN_PRO);
        }
        contentEl.addClass('ert-modal-container', 'ert-stack', 'ert-runtime-modal');

        // Load subplots first
        await this.loadSubplots();

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
        const header = contentEl.createDiv({ cls: 'ert-modal-header' });

        const contentType = this.plugin.settings.runtimeContentType || 'novel';
        const modeLabel = contentType === 'screenplay' ? 'Screenplay' : 'Audiobook';
        const modeIconName = contentType === 'screenplay' ? 'film' : 'mic-vocal';
        const badgeText = `Runtime estimator · ${modeLabel}`;

        const pill = header.createSpan({
            cls: `${ERT_CLASSES.BADGE_PILL} ${ERT_CLASSES.BADGE_PILL_PRO}`,
        });
        const pillIcon = pill.createSpan({ cls: ERT_CLASSES.BADGE_PILL_ICON });
        setIcon(pillIcon, 'signature');
        pill.createSpan({
            cls: ERT_CLASSES.BADGE_PILL_TEXT,
            text: 'PRO',
        });

        const runtimeInfo = header.createSpan({ cls: 'ert-runtime-mode-info' });
        const modeIcon = runtimeInfo.createSpan({ cls: 'ert-modal-badge-icon' });
        setIcon(modeIcon, modeIconName);
        runtimeInfo.createSpan({ text: badgeText });
        header.createDiv({ cls: 'ert-modal-title', text: 'Runtime Estimation' });
        header.createDiv({ cls: 'ert-modal-subtitle', text: 'Algorithmic word-count analysis. Calculates runtime from scene text using configured WPM rates and parenthetical timing.' });

        // ===== SCOPE SECTION =====
        const scopeCard = contentEl.createDiv({ cls: 'rt-glass-card ert-runtime-section' });
        const scopeLayout = scopeCard.createDiv({ cls: 'rt-row rt-row-wrap rt-row-between' });
        const scopeInfo = scopeLayout.createDiv({ cls: 'rt-stack rt-stack-tight' });
        scopeInfo.createEl('h4', { text: 'Scope', cls: 'rt-section-title' });
        scopeInfo.createDiv({ cls: 'ert-runtime-section-desc', text: 'Select which scenes to process for runtime estimation.' });

        const scopeControls = scopeLayout.createDiv({ cls: 'rt-stack' });
        
        // Subplot label row (shown only when subplot scope is selected)
        this.subplotLabelContainer = scopeControls.createDiv({ cls: 'rt-hidden' });
        this.subplotLabelContainer.createEl('label', { text: 'Subplot:', cls: 'ert-runtime-label' });
        
        // Dropdowns row - both dropdowns aligned horizontally
        const scopeRow = scopeControls.createDiv({ cls: 'rt-row rt-row-wrap' });
        
        // Scope dropdown
        const scopeDropdownContainer = scopeRow.createDiv({ cls: 'ert-runtime-dropdown-container' });
        this.scopeDropdown = new DropdownComponent(scopeDropdownContainer);
        this.scopeDropdown
            .addOption('current', 'Current scene')
            .addOption('subplot', 'Subplot scenes')
            .addOption('all', 'All scenes')
            .setValue(this.selectedScope)
            .onChange((value) => {
                this.selectedScope = value as RuntimeScope;
                this.updateScopeVisibility();
                this.updateCount();
            });

        // Subplot dropdown (disabled when not in subplot scope)
        this.subplotDropdownContainer = scopeRow.createDiv({ cls: 'ert-runtime-dropdown-container ert-runtime-dropdown-disabled' });
        this.subplotDropdown = new DropdownComponent(this.subplotDropdownContainer);
        this.subplotDropdown.setDisabled(true);
        
        // Populate subplot dropdown
        this.orderedSubplots.forEach(sub => {
            this.subplotDropdown?.addOption(sub.name, `${sub.name} (${sub.count})`);
        });
        
        if (this.orderedSubplots.length > 0) {
            this.selectedSubplot = this.orderedSubplots[0].name;
            this.subplotDropdown.setValue(this.selectedSubplot);
        }
        
        this.subplotDropdown.onChange((value) => {
            this.selectedSubplot = value;
            this.updateCount();
        });

        // Current scene display (always visible, muted when not in current scope)
        this.currentSceneContainer = scopeCard.createDiv({ cls: 'ert-runtime-current-scene' });
        this.currentSceneContainer.createSpan({ text: 'Scene: ', cls: 'ert-runtime-label' });
        this.currentSceneNameEl = this.currentSceneContainer.createSpan({ cls: 'ert-runtime-current-scene-name' });

        // ===== STATUS FILTERS SECTION =====
        const statusCard = contentEl.createDiv({ cls: 'rt-glass-card ert-runtime-section' });
        statusCard.createEl('h4', { text: 'Scene Status Filter', cls: 'rt-section-title' });
        statusCard.createDiv({ cls: 'ert-runtime-section-desc', text: 'Only scenes with the selected status will be processed.' });

        const statusRow = statusCard.createDiv({ cls: 'rt-row rt-row-loose rt-row-wrap' });

        this.createStatusCheckbox(statusRow, 'Todo', 'includeTodo', this.statusFilters.includeTodo);
        this.createStatusCheckbox(statusRow, 'Working', 'includeWorking', this.statusFilters.includeWorking);
        this.createStatusCheckbox(statusRow, 'Complete', 'includeComplete', this.statusFilters.includeComplete);

        // ===== OVERRIDE SECTION =====
        const overrideCard = contentEl.createDiv({ cls: 'rt-glass-card ert-runtime-section' });
        overrideCard.createEl('h4', { text: 'Override', cls: 'rt-section-title' });
        overrideCard.createDiv({ cls: 'ert-runtime-section-desc', text: 'By default, only scenes without a Runtime field are processed.' });

        const overrideRow = overrideCard.createDiv({ cls: 'rt-row' });
        
        const checkbox = overrideRow.createEl('input', { type: 'checkbox' });
        checkbox.checked = this.overrideExisting;
        checkbox.addEventListener('change', () => {
            this.overrideExisting = checkbox.checked;
            this.updateCount();
        });
        
        const labelContainer = overrideRow.createDiv({ cls: 'ert-runtime-override-label' });
        labelContainer.createEl('span', { text: 'Recalculate all' });
        labelContainer.createDiv({ cls: 'ert-runtime-field-hint', text: 'Replaces existing Runtime values, including manual estimates you may have entered.' });

        // ===== SETTINGS ACCORDION =====
        const settingsCard = contentEl.createDiv({ cls: 'rt-glass-card ert-runtime-section' });
        
        this.settingsAccordion = settingsCard.createDiv({ cls: 'ert-runtime-accordion-header' });
        const accordionIcon = this.settingsAccordion.createSpan({ cls: 'ert-runtime-accordion-icon' });
        setIcon(accordionIcon, 'chevron-right');
        this.settingsAccordion.createSpan({ text: 'Estimation Settings', cls: 'ert-runtime-accordion-title' });
        this.settingsAccordion.createSpan({ cls: 'ert-runtime-accordion-hint', text: `(${modeLabel})` });
        
        this.settingsContent = settingsCard.createDiv({ cls: 'ert-runtime-accordion-content rt-hidden' });
        this.renderSettingsContent();
        
        this.settingsAccordion.addEventListener('click', () => {
            this.settingsExpanded = !this.settingsExpanded;
            if (this.settingsExpanded) {
                this.settingsContent?.removeClass('rt-hidden');
                setIcon(accordionIcon, 'chevron-down');
            } else {
                this.settingsContent?.addClass('rt-hidden');
                setIcon(accordionIcon, 'chevron-right');
            }
        });

        // ===== MODE SELECTION =====
        const modeCard = contentEl.createDiv({ cls: 'rt-glass-card ert-runtime-section' });
        modeCard.createEl('h4', { text: 'Estimation Mode', cls: 'rt-section-title' });
        this.modeDescEl = modeCard.createDiv({ cls: 'ert-runtime-section-desc' });

        const modeRow = modeCard.createDiv({ cls: 'rt-row' });
        const modeDropdownContainer = modeRow.createDiv({ cls: 'ert-runtime-dropdown-container' });
        const modeDropdown = new DropdownComponent(modeDropdownContainer);
        modeDropdown
            .addOption('local', 'Local')
            .addOption('ai', 'AI')
            .setValue(this.selectedMode)
            .onChange((value) => {
                this.selectedMode = value as RuntimeMode;
                this.updateModeDescription();
            });
        
        this.updateModeDescription();

        // ===== SCENE COUNT SECTION =====
        const countCard = contentEl.createDiv({ cls: 'rt-glass-card ert-runtime-section' });
        countCard.createEl('h4', { text: 'Summary', cls: 'rt-section-title' });
        this.countEl = countCard.createDiv({ cls: 'ert-runtime-count' });
        this.countEl.setText('Calculating...');

        // Action buttons
        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });

        this.actionButton = new ButtonComponent(buttonRow)
            .setButtonText('Estimate Runtimes')
            .setCta()
            .onClick(async () => {
                await this.startProcessing();
            });

        new ButtonComponent(buttonRow)
            .setButtonText('Cancel')
            .onClick(() => this.close());

        // Initial visibility and count
        this.updateScopeVisibility();
        await this.updateCount();
    }

    private createStatusCheckbox(container: HTMLElement, label: string, key: keyof RuntimeStatusFilters, checked: boolean): void {
        const wrapper = container.createDiv({ cls: 'ert-runtime-status-checkbox' });
        const checkbox = wrapper.createEl('input', { type: 'checkbox' });
        checkbox.checked = checked;
        checkbox.addEventListener('change', () => {
            this.statusFilters[key] = checkbox.checked;
            this.updateCount();
        });
        wrapper.createEl('label', { text: label });
    }

    private renderSettingsContent(): void {
        if (!this.settingsContent) return;
        this.settingsContent.empty();

        const runtimeSettings = getRuntimeSettings(this.plugin.settings, this.plugin.settings.defaultRuntimeProfileId);
        const profiles = this.plugin.settings.runtimeRateProfiles || [];
        const profileLabel = profiles.find(p => p.id === this.plugin.settings.defaultRuntimeProfileId)?.label || 'Default';
        const contentType = runtimeSettings.contentType || 'novel';

        const profileRow = this.settingsContent.createDiv({ cls: 'ert-runtime-setting-row' });
        profileRow.createSpan({ text: 'Profile:', cls: 'ert-runtime-setting-label' });
        profileRow.createSpan({ text: profileLabel, cls: 'ert-runtime-setting-value' });

        if (contentType === 'screenplay') {
            // Screenplay settings
            const dialogueRow = this.settingsContent.createDiv({ cls: 'ert-runtime-setting-row' });
            dialogueRow.createSpan({ text: 'Dialogue rate:', cls: 'ert-runtime-setting-label' });
            dialogueRow.createSpan({ text: `${runtimeSettings.dialogueWpm || 160} wpm`, cls: 'ert-runtime-setting-value' });

            const actionRow = this.settingsContent.createDiv({ cls: 'ert-runtime-setting-row' });
            actionRow.createSpan({ text: 'Action/Description rate:', cls: 'ert-runtime-setting-label' });
            actionRow.createSpan({ text: `${runtimeSettings.actionWpm || 100} wpm`, cls: 'ert-runtime-setting-value' });
        } else {
            // Novel settings
            const narrationRow = this.settingsContent.createDiv({ cls: 'ert-runtime-setting-row' });
            narrationRow.createSpan({ text: 'Narration rate:', cls: 'ert-runtime-setting-label' });
            narrationRow.createSpan({ text: `${runtimeSettings.narrationWpm || 150} wpm`, cls: 'ert-runtime-setting-value' });
        }

        // Parenthetical timings (shown for both modes)
        const parentheticalHeader = this.settingsContent.createDiv({ cls: 'ert-runtime-setting-subheader' });
        parentheticalHeader.setText('Parenthetical Timings');

        const timings = [
            { label: '(beat)', value: runtimeSettings.beatSeconds || 2 },
            { label: '(pause)', value: runtimeSettings.pauseSeconds || 3 },
            { label: '(long pause)', value: runtimeSettings.longPauseSeconds || 5 },
            { label: '(a moment)', value: runtimeSettings.momentSeconds || 4 },
            { label: '(silence)', value: runtimeSettings.silenceSeconds || 5 },
        ];

        timings.forEach(t => {
            const row = this.settingsContent!.createDiv({ cls: 'ert-runtime-setting-row' });
            row.createSpan({ text: t.label, cls: 'ert-runtime-setting-label' });
            row.createSpan({ text: `${t.value}s`, cls: 'ert-runtime-setting-value' });
        });

        const hint = this.settingsContent.createDiv({ cls: 'ert-runtime-settings-hint' });
        hint.setText('Configure these values in Settings → Pro → Runtime Estimation');
    }

    private updateScopeVisibility(): void {
        const showSubplot = this.selectedScope === 'subplot';
        const showCurrentScene = this.selectedScope === 'current';
        
        // Show/hide subplot label
        if (this.subplotLabelContainer) {
            if (showSubplot) {
                this.subplotLabelContainer.removeClass('rt-hidden');
            } else {
                this.subplotLabelContainer.addClass('rt-hidden');
            }
        }
        
        // Enable/disable subplot dropdown (always visible, but muted when not applicable)
        if (this.subplotDropdownContainer && this.subplotDropdown) {
            if (showSubplot) {
                this.subplotDropdownContainer.removeClass('ert-runtime-dropdown-disabled');
                this.subplotDropdown.setDisabled(false);
            } else {
                this.subplotDropdownContainer.addClass('ert-runtime-dropdown-disabled');
                this.subplotDropdown.setDisabled(true);
            }
        }
        
        // Show/mute current scene display
        if (this.currentSceneContainer) {
            if (showCurrentScene) {
                this.currentSceneContainer.removeClass('ert-runtime-current-scene-muted');
                this.updateCurrentSceneDisplay();
            } else {
                this.currentSceneContainer.addClass('ert-runtime-current-scene-muted');
            }
        }
    }

    private updateCurrentSceneDisplay(): void {
        if (!this.currentSceneNameEl) return;
        
        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (activeFile) {
            this.currentSceneNameEl.setText(activeFile.basename);
            this.currentSceneNameEl.removeClass('ert-runtime-no-scene');
        } else {
            this.currentSceneNameEl.setText('No scene open');
            this.currentSceneNameEl.addClass('ert-runtime-no-scene');
        }
    }

    private updateModeDescription(): void {
        if (!this.modeDescEl) return;
        
        const provider = this.plugin.settings.defaultAiProvider || 'openai';
        const providerLabel = this.getProviderLabel(provider);
        
        let description: string;
        
        switch (this.selectedMode) {
            case 'local':
                description = 'No data sent externally. Runtime calculated locally using word counts, configured WPM rates, and parenthetical timing directives.';
                break;
            case 'ai':
                description = `Each scene sent to ${providerLabel} along with local stats. AI analyzes pacing and context to estimate runtime. Writes AI estimate to each scene.`;
                break;
            default:
                description = '';
        }
        
        this.modeDescEl.setText(description);
    }

    private getProviderLabel(provider: string): string {
        switch (provider) {
            case 'openai':
                return `OpenAI (${this.plugin.settings.openaiModelId || 'gpt-5.1-chat-latest'})`;
            case 'anthropic':
                return `Anthropic (${this.plugin.settings.anthropicModelId || 'claude-sonnet-4-5-20250929'})`;
            case 'gemini':
                return `Google Gemini (${this.plugin.settings.geminiModelId || 'gemini-2.5-flash'})`;
            case 'local':
                const baseUrl = this.plugin.settings.localBaseUrl || 'localhost';
                const modelId = this.plugin.settings.localModelId || 'local model';
                return `Local LLM (${modelId} @ ${baseUrl})`;
            default:
                return provider;
        }
    }

    private async loadSubplots(): Promise<void> {
        try {
            const scenes = await this.plugin.getSceneData();
            const subplotCounts = new Map<string, number>();

            scenes.forEach(scene => {
                if (isNonSceneItem(scene)) return;
                const sub = scene.subplot && scene.subplot.trim() ? scene.subplot : 'Main Plot';
                subplotCounts.set(sub, (subplotCounts.get(sub) || 0) + 1);
            });

            // Sort: Main Plot first, then by count descending, then alphabetically
            this.orderedSubplots = Array.from(subplotCounts.entries())
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => {
                    if (a.name === 'Main Plot') return -1;
                    if (b.name === 'Main Plot') return 1;
                    if (a.count !== b.count) return b.count - a.count;
                    return a.name.localeCompare(b.name);
                });

            if (this.orderedSubplots.length > 0 && !this.selectedSubplot) {
                this.selectedSubplot = this.orderedSubplots[0].name;
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
            const count = await this.getSceneCount(this.selectedScope, subplotFilter, this.overrideExisting, this.statusFilters);

            this.countEl.empty();
            const countText = this.countEl.createDiv({ cls: 'ert-runtime-count-text' });
            countText.createSpan({ text: 'Scenes to process: ', cls: 'ert-runtime-label' });
            countText.createSpan({ text: String(count), cls: 'ert-runtime-number' });

            if (count === 0) {
                const hint = this.countEl.createDiv({ cls: 'ert-runtime-hint' });
                if (this.selectedScope === 'current') {
                    hint.setText('Open a scene file to estimate its runtime.');
                } else if (!this.statusFilters.includeTodo && !this.statusFilters.includeWorking && !this.statusFilters.includeComplete) {
                    hint.setText('Select at least one status filter.');
                } else if (!this.overrideExisting) {
                    hint.setText('All matching scenes already have Runtime values. Enable "Override existing" to recalculate.');
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
            const result = await this.onProcess(this.selectedScope, subplotFilter, this.overrideExisting, this.statusFilters, this.selectedMode);
            if (result && typeof result === 'object') {
                this.showCompletionSummary(result.message ?? 'Estimation completed successfully!', result.aiResult);
            } else {
                this.showCompletionSummary('Estimation completed successfully!');
            }
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
        const header = contentEl.createDiv({ cls: 'ert-modal-header' });
        
        const contentType = this.plugin.settings.runtimeContentType || 'novel';
        const modeLabel = contentType === 'screenplay' ? 'Screenplay' : 'Audiobook';
        
        header.createSpan({ cls: 'ert-modal-badge', text: `Runtime estimator · ${modeLabel}` });
        header.createDiv({ cls: 'ert-modal-title', text: 'Estimating Runtimes...' });
        this.statusTextEl = header.createDiv({ cls: 'ert-modal-subtitle' });
        this.statusTextEl.setText('Initializing...');

        // Progress card
        const progressCard = contentEl.createDiv({ cls: 'rt-glass-card ert-runtime-section' });

        // Progress bar
        const progressContainer = progressCard.createDiv({ cls: 'rt-pulse-progress-container' });
        const progressBg = progressContainer.createDiv({ cls: 'rt-pulse-progress-bg' });
        this.progressBarEl = progressBg.createDiv({ cls: 'rt-pulse-progress-bar' });
        this.progressBarEl.style.setProperty('--progress-width', '0%');

        this.progressTextEl = progressCard.createDiv({ cls: 'rt-pulse-progress-text' });
        this.progressTextEl.setText('0 / 0 scenes (0%)');

        // Running total
        const totalSection = progressCard.createDiv({ cls: 'ert-runtime-running-total' });
        totalSection.createSpan({ text: 'Running total: ', cls: 'ert-runtime-label' });
        this.runningTotalEl = totalSection.createSpan({ cls: 'ert-runtime-number' });
        this.runningTotalEl.setText('0:00');

        // Queue container
        this.queueContainer = progressCard.createDiv({ cls: 'ert-runtime-queue' });

        const advancedDetails = progressCard.createEl('details', { cls: 'ert-ai-advanced-details' });
        advancedDetails.createEl('summary', { text: 'AI Prompt & Context (Advanced)' });
        this.aiAdvancedPreEl = advancedDetails.createEl('pre', { cls: 'ert-ai-advanced-pre' });
        this.renderAiAdvancedContext();

        // Action buttons
        const buttonRow = contentEl.createDiv({ cls: 'ert-modal-actions' });

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

    public setStatusMessage(message: string): void {
        if (this.statusTextEl) {
            this.statusTextEl.setText(message);
        }
    }

    public setAiAdvancedContext(context: AIRunAdvancedContext | null): void {
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
            `Availability: ${ctx.availabilityStatus === 'visible' ? 'Visible to your key ✅' : ctx.availabilityStatus === 'not_visible' ? 'Not visible ⚠️' : 'Unknown (snapshot disabled)'}`,
            `Applied caps: input=${ctx.maxInputTokens}, output=${ctx.maxOutputTokens}`,
            '',
            'Feature mode instructions:',
            redactSensitiveValue(ctx.featureModeInstructions || '(none)'),
            '',
            'Final composed prompt:',
            redactSensitiveValue(ctx.finalPrompt || '(none)')
        ];
        this.aiAdvancedPreEl.setText(lines.join('\n'));
    }

    public isAborted(): boolean {
        return this.abortController?.signal.aborted ?? false;
    }

    private showCompletionSummary(message: string, aiResult?: RuntimeProcessResult['aiResult']): void {
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

        if (aiResult) {
            const aiSeconds = aiResult.aiSeconds;
            const aiLabel = aiResult.provider ? `${aiResult.provider}${aiResult.modelId ? `/${aiResult.modelId}` : ''}` : 'AI';
            const delta = typeof aiSeconds === 'number' ? aiSeconds - this.runningTotalSeconds : null;
            const deltaText = delta === null ? '' : ` · Δ ${delta >= 0 ? '+' : '-'}${formatRuntimeValue(Math.abs(delta))}`;

            if (this.progressTextEl) {
                const aiRuntime = typeof aiSeconds === 'number' ? formatRuntimeValue(aiSeconds) : '—';
                this.progressTextEl.setText(`Local: ${formatRuntimeValue(this.runningTotalSeconds)} · ${aiLabel}: ${aiRuntime}${deltaText}`);
            }

            if (this.statusTextEl) {
                if (aiResult.success) {
                    const rationale = aiResult.rationale ? aiResult.rationale.slice(0, 280) : 'AI estimate ready.';
                    this.statusTextEl.setText(rationale);
                } else {
                    this.statusTextEl.setText(`AI error: ${aiResult.error ?? 'Unknown error'}`);
                }
            }
        }

        if (this.closeButton) {
            this.closeButton.setDisabled(false);
            this.closeButton.setCta();
        }
    }
}

export default RuntimeProcessingModal;
