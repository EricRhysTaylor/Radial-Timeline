/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
// --- Imports and constants added for standalone module ---
import { ItemView, WorkspaceLeaf, MarkdownView, TFile, TAbstractFile, Notice, normalizePath, setIcon } from 'obsidian';
import RadialTimelinePlugin from '../main';
import { t } from '../i18n';
import { escapeRegExp } from '../utils/regex';
import type { TimelineItem } from '../types';
import { SceneNumberInfo } from '../utils/constants';
import ZeroDraftModal from '../modals/ZeroDraftModal';
import { parseSceneTitleComponents } from '../utils/text';
import { renderSvgFromString } from '../utils/svgDom';
import { openOrRevealFile } from '../utils/fileUtils';
import { setupRotationController, setupSearchControls as setupSearchControlsExt, addHighlightRectangles as addHighlightRectanglesExt, setupModeToggleController, setupVersionIndicatorController, setupHelpIconController, setupTooltips } from './interactions';
import { isShiftModeActive } from './interactions/ChronologueShiftController';
import { RendererService } from '../services/RendererService';
import { ModeManager, createModeManager } from '../modes/ModeManager';
import { ModeInteractionController, createInteractionController } from '../modes/ModeInteractionController';
import { renderWelcomeScreen } from './WelcomeScreen';
import {
    MONTH_LABEL_RADIUS,
    PROGRESS_RING_BASE_WIDTH,
    PROGRESS_RING_RADIUS_OFFSET,
    SESSION_TIMER_RING_WIDTH,
    SVG_SIZE
} from '../renderer/layout/LayoutConstants';
import { buildSessionTimerRingState, renderSessionTimerRing } from '../renderer/components/SessionTimerRing';
import { 
    createSnapshot, 
    detectChanges, 
    describeChanges, 
    type TimelineSnapshot, 
    ChangeType 
} from '../renderer/ChangeDetection';
import { clearFontMetricsCaches } from '../renderer/utils/FontMetricsCache';
import { AuthorProgressModal } from '../modals/AuthorProgressModal';
import { isMatterNote } from '../utils/sceneHelpers';
import { DEFAULT_BOOK_TITLE, getTimelineScope, getTimelineScopeTitle, isSagaScopeAvailable } from '../utils/books';
import { getActiveRecentStructuralMoves } from '../utils/recentStructuralMoves';
import type { ActiveWritingSession, StructuralMoveHistoryEntry, WritingSessionMode } from '../types/settings';
import type { GossamerRunRecord } from '../utils/gossamer';
import { GOSSAMER_SIGNAL_METADATA, GOSSAMER_SIGNAL_TYPES, type GossamerSignalType } from '../types/gossamerSignals';
import { tooltip as applyTooltip } from '../utils/tooltip';

// Duplicate of constants defined in main for now. We can consolidate later.
export const TIMELINE_VIEW_TYPE = "radial-timeline";
export const TIMELINE_VIEW_DISPLAY_TEXT = "Radial timeline";
const TIMELINE_REFRESH_DELAY_MS = 1000;
const SAGA_SCOPE_OPTION = '__rt_saga__';
const SESSION_PROGRESS_STEP_PERCENT = 5;
const SESSION_SECONDS_DISPLAY_THRESHOLD_MS = 15 * 60 * 1000;

type SessionClockUnit = 'min' | 'sec';

interface SessionClockDisplay {
    value: string;
    unit: SessionClockUnit;
    label: string;
}

interface SessionStatusDisplay {
    headline: string;
    detail: string;
    unit?: string;
    tone: 'running' | 'paused' | 'complete';
}

// Namespace rule for Timeline view work:
// - New Timeline chrome (legends, panels, badges, overlays, tooltips, controls) uses ert-timeline-*.
// - Existing SVG/rendering primitives may still reference legacy rt-* islands.
// - Do not introduce fresh rt-* class creation for new chrome here unless it is explicitly allowlisted.

// CONSTANTS: Scene expansion constants
const HOVER_EXPAND_FACTOR = 1.05; // expansion multiplier when text doesn't fit
const TIMELINE_LEGEND_MODES = new Set(['progress', 'narrative', 'chronologue']);

interface TimelineLegendRow {
    icon?: string;
    swatch?: TimelineLegendSwatch;
    label: string;
    detail?: string;
    detailSegments?: TimelineLegendDetailSegment[];
    detailIcon?: string;
    detailIconLabel?: string;
}

interface TimelineLegendDetailSegment {
    text: string;
    color?: string;
}

interface TimelineLegendSwatch {
    fill?: string;
    stroke?: string;
    text?: string;
    textColor?: string;
}

interface TimelineLegendSection {
    title: string;
    rows: TimelineLegendRow[];
}

// SceneNumberInfo now imported from constants

// Timeline View implementation
export class RadialTimelineView extends ItemView {
    static readonly viewType = TIMELINE_VIEW_TYPE;
    plugin: RadialTimelinePlugin;
    private rendererService?: RendererService;
    
    // Frontmatter values to track to reduce unnecessary SVG View refreshes
    private lastFrontmatterValues: Record<string, unknown> = {};
    private timelineRefreshTimeout: number | null = null;
    private beatLabelAdjustTimeout: number | null = null;
    private beatLabelAdjustRaf: number | null = null;
    
    // Change detection snapshot for optimizing renders
    private lastSnapshot: TimelineSnapshot | null = null;
        
    // Scene data (scenes)
    sceneData: TimelineItem[] = [];
    
    // Set of open scene paths (for tracking open files)
    openScenePaths: Set<string> = new Set<string>();

    // Book switcher UI
    private bookSwitcherEl?: HTMLElement;
    private bookSwitcherSelect?: HTMLSelectElement;
    private bookSwitcherManageBtn?: HTMLButtonElement;
    private timelineSearchInput?: HTMLInputElement;
    private timelineSearchButton?: HTMLButtonElement;
    private timelineSearchButtonMode: 'search' | 'clear' = 'search';
    private timelineLegendTrigger?: HTMLButtonElement;
    private timelineLegendPanel?: HTMLElement;
    private writingSessionButton?: HTMLButtonElement;
    private writingSessionLabel?: HTMLElement;
    private writingSessionPanel?: HTMLElement;
    private writingSessionModeSelect?: HTMLSelectElement;
    private writingSessionCountdownToggle?: HTMLInputElement;
    private writingSessionGoalInput?: HTMLInputElement;
    private writingSessionTickInterval?: number;
    
    // Store rotation state to persist across timeline refreshes
    private rotationState: boolean = false;
    
    // Mode system
    private _currentMode: string = 'narrative'; // TimelineMode enum value
    private modeManager?: ModeManager; // Centralized mode management
    private interactionController?: ModeInteractionController; // Interaction handler management
    
    // Store event handler references for clean removal
    private normalEventHandlers: Map<string, EventListener> = new Map();
    private gossamerEventHandlers: Map<string, EventListener> = new Map();

    // Expose a safe registrar for Gossamer handlers so external modules can record svg-level listeners
    public registerGossamerHandler(key: string, handler: EventListener): void {
        this.gossamerEventHandlers.set(key, handler);
    }

    /**
     * Get the current timeline mode
     */
    public get currentMode(): string {
        return this._currentMode;
    }

    /**
     * Set the current timeline mode
     */
    public set currentMode(mode: string) {
        this._currentMode = mode;
        this.updateTimelineLegend();
    }

    /**
     * Get the ModeManager instance
     * Provides centralized mode switching with lifecycle management
     */
    public getModeManager(): ModeManager | undefined {
        return this.modeManager;
    }

    /**
     * Get the InteractionController instance
     * Manages event handler registration and cleanup
     */
    public getInteractionController(): ModeInteractionController | undefined {
        return this.interactionController;
    }


    constructor(leaf: WorkspaceLeaf, plugin: RadialTimelinePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.openScenePaths = plugin.openScenePaths;
        this.rendererService = plugin.getRendererService();
        
        // Initialize mode management
        this._currentMode = plugin.settings.currentMode || 'narrative';
        try {
            this.modeManager = createModeManager(plugin, this);
            this.interactionController = createInteractionController(this);
        } catch (e) {
            // Mode management initialization failed
        }
    }
    
    getViewType(): string {
        return TIMELINE_VIEW_TYPE;
    }
    
    getDisplayText(): string {
        const title = getTimelineScopeTitle(this.plugin.settings, DEFAULT_BOOK_TITLE);
        return `Radial Timeline: ${title}`;
    }
    
    getIcon(): string {
        return "rt-logo";
    }

    private ensureBookSwitcher(): void {
        const headerEl = this.containerEl.querySelector('.view-header') as HTMLElement | null;
        if (!headerEl) return;

        if (!this.bookSwitcherEl) {
            const actionsEl = headerEl.querySelector('.view-actions');
            const wrapper = document.createElement('div');
            wrapper.className = 'rt-book-switcher';

            const searchShell = document.createElement('div');
            searchShell.className = 'ert-timeline-search';

            const searchBtn = document.createElement('button');
            searchBtn.className = 'ert-timeline-search__button clickable-icon';
            searchBtn.type = 'button';

            const searchInput = document.createElement('input');
            searchInput.className = 'ert-timeline-search__input';
            searchInput.type = 'search';
            searchInput.placeholder = 'Search timeline';
            searchInput.autocomplete = 'off';
            searchInput.spellcheck = false;
            searchInput.setAttribute('aria-label', 'Search timeline');

            this.registerDomEvent(searchBtn, 'mousedown', (evt: MouseEvent) => {
                evt.preventDefault();
            });
            this.registerDomEvent(searchBtn, 'click', (evt: MouseEvent) => {
                evt.preventDefault();
                evt.stopPropagation();
                if (this.timelineSearchButtonMode === 'clear') {
                    this.clearTimelineSearchFromControl();
                    return;
                }
                this.commitTimelineSearchFromInput();
            });
            this.registerDomEvent(searchInput, 'input', () => {
                this.handleTimelineSearchInput();
            });
            this.registerDomEvent(searchInput, 'blur', () => {
                this.commitTimelineSearchFromInput();
            });
            this.registerDomEvent(searchInput, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Enter') {
                    evt.preventDefault();
                    this.commitTimelineSearchFromInput();
                }
            });

            const legendBtn = document.createElement('button');
            legendBtn.className = 'ert-timeline-legend__trigger clickable-icon';
            legendBtn.type = 'button';
            legendBtn.setAttribute('aria-expanded', 'false');
            setIcon(legendBtn, 'asterisk');

            const legendPanel = document.createElement('div');
            legendPanel.className = 'ert-timeline-legend';
            legendPanel.setAttribute('role', 'tooltip');

            const select = document.createElement('select');
            select.className = 'rt-book-switcher__select';
            this.registerDomEvent(select, 'change', async () => {
                const nextId = select.value;
                if (nextId === SAGA_SCOPE_OPTION) {
                    await this.plugin.setTimelineScope('saga');
                    if (getTimelineScope(this.plugin.settings) === 'saga') {
                        this.currentMode = 'narrative';
                    }
                    this.updateBookSwitcherOptions();
                    this.updateViewTitle();
                    return;
                }
                await this.plugin.setActiveBookId(nextId);
                this.updateBookSwitcherOptions();
                this.updateViewTitle();
            });

            const manageBtn = document.createElement('button');
            manageBtn.className = 'rt-book-switcher__manage ert-timeline-title-action clickable-icon';
            manageBtn.type = 'button';
            manageBtn.setAttribute('aria-label', 'Manage books');
            setIcon(manageBtn, 'settings');
            applyTooltip(manageBtn, 'Manage books', 'bottom');
            this.registerDomEvent(manageBtn, 'click', () => {
                if (this.plugin.settingsTab) {
                    this.plugin.settingsTab.setActiveTab('core');
                }
                const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting; // SAFE: any type used for Obsidian internal API
                if (setting) {
                    setting.open();
                    setting.openTabById('radial-timeline');
                }
            });

            const commandPaletteBtn = document.createElement('button');
            commandPaletteBtn.className = 'ert-timeline-title-action clickable-icon';
            commandPaletteBtn.type = 'button';
            commandPaletteBtn.setAttribute('aria-label', 'Radial Timeline commands');
            setIcon(commandPaletteBtn, 'command');
            applyTooltip(commandPaletteBtn, 'Radial Timeline commands', 'bottom');
            this.registerDomEvent(commandPaletteBtn, 'click', (evt: MouseEvent) => {
                evt.preventDefault();
                evt.stopPropagation();
                this.openRadialTimelineCommands();
            });

            const exportBtn = document.createElement('button');
            exportBtn.className = 'ert-timeline-title-action clickable-icon';
            exportBtn.type = 'button';
            exportBtn.setAttribute('aria-label', 'Manuscript export');
            setIcon(exportBtn, 'printer');
            applyTooltip(exportBtn, 'Manuscript export', 'bottom');
            this.registerDomEvent(exportBtn, 'click', (evt: MouseEvent) => {
                evt.preventDefault();
                evt.stopPropagation();
                this.plugin.openManuscriptExportModal();
            });

            const sessionBtn = document.createElement('button');
            sessionBtn.className = 'ert-timeline-session clickable-icon';
            sessionBtn.type = 'button';
            sessionBtn.setAttribute('aria-label', 'Start writing session');
            const sessionLabel = document.createElement('span');
            sessionLabel.className = 'ert-timeline-session__label';
            sessionLabel.textContent = 'Start';
            sessionBtn.appendChild(sessionLabel);
            applyTooltip(sessionBtn, 'Start writing session', 'bottom');
            this.registerDomEvent(sessionBtn, 'click', (evt: MouseEvent) => {
                evt.preventDefault();
                evt.stopPropagation();
                this.toggleWritingSessionPanel();
            });

            const sessionPanel = document.createElement('div');
            sessionPanel.className = 'ert-timeline-session-panel ert-hidden';
            sessionPanel.setAttribute('role', 'dialog');
            sessionPanel.setAttribute('aria-label', 'Writing session');
            document.body.appendChild(sessionPanel);
            this.register(() => sessionPanel.remove());

            let hideLegendTimer: number | null = null;
            const showLegend = () => {
                if (hideLegendTimer !== null) {
                    window.clearTimeout(hideLegendTimer);
                    hideLegendTimer = null;
                }
                if (legendBtn.hidden) return;
                this.updateTimelineLegend();
                legendPanel.classList.add('is-visible');
                legendBtn.setAttribute('aria-expanded', 'true');
            };
            const hideLegend = () => {
                legendPanel.classList.remove('is-visible');
                legendBtn.setAttribute('aria-expanded', 'false');
            };
            const scheduleLegendHide = () => {
                if (hideLegendTimer !== null) {
                    window.clearTimeout(hideLegendTimer);
                }
                hideLegendTimer = window.setTimeout(() => {
                    hideLegendTimer = null;
                    if (legendPanel.matches(':hover') || legendBtn.matches(':hover') || legendPanel.contains(document.activeElement)) {
                        return;
                    }
                    hideLegend();
                }, 120);
            };

            this.registerDomEvent(legendBtn, 'mouseenter', showLegend);
            this.registerDomEvent(legendBtn, 'focus', showLegend);
            this.registerDomEvent(legendBtn, 'mouseleave', scheduleLegendHide);
            this.registerDomEvent(legendBtn, 'blur', scheduleLegendHide);
            this.registerDomEvent(legendBtn, 'click', (evt: MouseEvent) => {
                evt.preventDefault();
                evt.stopPropagation();
                if (legendPanel.classList.contains('is-visible')) {
                    hideLegend();
                    return;
                }
                showLegend();
            });
            this.registerDomEvent(legendPanel, 'mouseenter', showLegend);
            this.registerDomEvent(legendPanel, 'mouseleave', scheduleLegendHide);
            this.registerDomEvent(document.body, 'click', (evt: MouseEvent) => {
                const target = evt.target as Node | null;
                if (target && (legendPanel.contains(target) || legendBtn.contains(target))) return;
                hideLegend();
            });
            this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Escape') hideLegend();
            });
            this.register(() => {
                if (hideLegendTimer !== null) {
                    window.clearTimeout(hideLegendTimer);
                    hideLegendTimer = null;
                }
            });

            searchShell.appendChild(searchBtn);
            searchShell.appendChild(searchInput);
            wrapper.appendChild(legendBtn);
            wrapper.appendChild(legendPanel);
            wrapper.appendChild(searchShell);
            wrapper.appendChild(select);
            wrapper.appendChild(commandPaletteBtn);
            wrapper.appendChild(exportBtn);
            wrapper.appendChild(manageBtn);

            if (actionsEl && actionsEl.parentElement) {
                actionsEl.parentElement.insertBefore(wrapper, actionsEl);
            } else {
                headerEl.appendChild(wrapper);
            }

            const navButtonsEl = headerEl.querySelector('.view-header-nav-buttons') as HTMLElement | null;
            const titleContainerEl = headerEl.querySelector('.view-header-title-container') as HTMLElement | null;
            if (navButtonsEl?.parentElement) {
                navButtonsEl.parentElement.insertBefore(sessionBtn, navButtonsEl.nextSibling);
            } else if (titleContainerEl?.parentElement) {
                titleContainerEl.parentElement.insertBefore(sessionBtn, titleContainerEl);
            } else {
                headerEl.insertBefore(sessionBtn, headerEl.firstChild);
            }

            this.bookSwitcherEl = wrapper;
            this.bookSwitcherSelect = select;
            this.bookSwitcherManageBtn = manageBtn;
            this.timelineSearchInput = searchInput;
            this.timelineSearchButton = searchBtn;
            this.timelineLegendTrigger = legendBtn;
            this.timelineLegendPanel = legendPanel;
            this.writingSessionButton = sessionBtn;
            this.writingSessionLabel = sessionLabel;
            this.writingSessionPanel = sessionPanel;
            this.writingSessionTickInterval = window.setInterval(() => this.refreshWritingSessionControl(), 1000);
            this.register(() => {
                if (this.writingSessionTickInterval !== undefined) {
                    window.clearInterval(this.writingSessionTickInterval);
                    this.writingSessionTickInterval = undefined;
                }
            });
            this.registerDomEvent(document.body, 'click', (evt: MouseEvent) => {
                const target = evt.target as Node | null;
                if (!target) return;
                if (sessionPanel.contains(target) || sessionBtn.contains(target)) return;
                this.hideWritingSessionPanel();
            });
            this.registerDomEvent(document, 'keydown', (evt: KeyboardEvent) => {
                if (evt.key === 'Escape') this.hideWritingSessionPanel();
            });
            this.syncTimelineSearchControl();
            this.refreshWritingSessionControl();
        }

        this.updateBookSwitcherOptions();
        this.updateTimelineLegend();
        this.syncTimelineSearchControl();
        this.refreshWritingSessionControl();
    }

    private formatSessionClock(ms: number): string {
        const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        }
        return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    private formatSessionClockDisplay(ms: number, mode: 'countdown' | 'elapsed'): SessionClockDisplay {
        const safeMs = Math.max(0, ms);
        const showSeconds = mode === 'countdown'
            ? safeMs <= SESSION_SECONDS_DISPLAY_THRESHOLD_MS
            : safeMs < 60000;
        if (showSeconds) {
            const value = String(Math.max(0, Math.ceil(safeMs / 1000)));
            return { value, unit: 'sec', label: `${value} sec` };
        }
        const minutes = mode === 'countdown'
            ? Math.ceil(safeMs / 60000)
            : Math.floor(safeMs / 60000);
        const value = String(Math.max(0, minutes));
        return { value, unit: 'min', label: `${value} min` };
    }

    private getSessionStatusDisplay(active: ActiveWritingSession, elapsedMs: number): SessionStatusDisplay {
        const goalMs = active.goalMinutes ? active.goalMinutes * 60000 : undefined;
        const remainingMs = goalMs ? Math.max(0, goalMs - elapsedMs) : undefined;
        const clockDisplay = this.formatSessionClockDisplay(remainingMs ?? elapsedMs, goalMs ? 'countdown' : 'elapsed');
        if (goalMs && remainingMs === 0) {
            return {
                headline: 'Session Complete',
                detail: 'Good work. Stop to save this session.',
                tone: 'complete',
            };
        }
        if (active.pausedAt) {
            return {
                headline: 'Paused',
                detail: `${clockDisplay.label} ${goalMs ? 'left' : 'elapsed'}`,
                tone: 'paused',
            };
        }
        return {
            headline: clockDisplay.value,
            detail: goalMs ? 'remaining' : 'elapsed',
            unit: clockDisplay.unit,
            tone: 'running',
        };
    }

    private getSessionProgressStep(progress: number): number {
        const clamped = Math.min(1, Math.max(0, progress));
        return Math.round((clamped * 100) / SESSION_PROGRESS_STEP_PERCENT) * SESSION_PROGRESS_STEP_PERCENT;
    }

    private getActiveSessionProgressStep(active: ActiveWritingSession, elapsedMs: number): number {
        const targetMinutes = active.goalMinutes ?? this.plugin.getWritingSessionService().getDefaultGoalMinutes() ?? 120;
        const targetMs = Math.max(1, targetMinutes) * 60000;
        return this.getSessionProgressStep(elapsedMs / targetMs);
    }

    private applySessionProgressClass(el: HTMLElement, progressStep: number | undefined): void {
        for (let step = 0; step <= 100; step += SESSION_PROGRESS_STEP_PERCENT) {
            el.classList.toggle(`is-progress-${step}`, progressStep === step);
        }
    }

    private getSessionClockSnapshot(): { label: string; detail: string; state: 'idle' | 'active' | 'paused'; progressStep?: number } {
        const service = this.plugin.getWritingSessionService();
        const active = service.getActiveSession();
        if (!active) return { label: 'Start', detail: 'Start writing session', state: 'idle' };
        const elapsedMs = service.getActiveElapsedMs();
        const display = this.getSessionStatusDisplay(active, elapsedMs);
        return {
            label: display.tone === 'complete' ? 'Complete' : display.headline,
            detail: active.pausedAt ? `Paused ${active.mode} session, ${display.detail}` : `Active ${active.mode} session, ${display.detail}`,
            state: active.pausedAt ? 'paused' : 'active',
            progressStep: this.getActiveSessionProgressStep(active, elapsedMs),
        };
    }

    private refreshWritingSessionControl(): void {
        if (!this.writingSessionButton || !this.writingSessionLabel) return;
        const snapshot = this.getSessionClockSnapshot();
        this.writingSessionLabel.setText(snapshot.label);
        this.writingSessionButton.classList.toggle('is-active', snapshot.state === 'active');
        this.writingSessionButton.classList.toggle('is-paused', snapshot.state === 'paused');
        this.applySessionProgressClass(this.writingSessionButton, snapshot.progressStep);
        this.writingSessionButton.setAttribute('aria-label', snapshot.detail);
        if (this.writingSessionPanel && !this.writingSessionPanel.classList.contains('ert-hidden')) {
            if (this.plugin.getWritingSessionService().getActiveSession()) {
                this.renderWritingSessionPanel();
            }
            this.positionWritingSessionPanel();
        }
        this.updateWritingSessionRing();
    }

    private toggleWritingSessionPanel(): void {
        if (!this.writingSessionPanel) return;
        if (this.writingSessionPanel.classList.contains('ert-hidden')) {
            this.showWritingSessionPanel();
        } else {
            this.hideWritingSessionPanel();
        }
    }

    private showWritingSessionPanel(): void {
        if (!this.writingSessionPanel) return;
        this.renderWritingSessionPanel();
        this.positionWritingSessionPanel();
        this.writingSessionPanel.classList.remove('ert-hidden');
        this.writingSessionButton?.setAttribute('aria-expanded', 'true');
    }

    private hideWritingSessionPanel(): void {
        this.writingSessionPanel?.classList.add('ert-hidden');
        this.writingSessionButton?.setAttribute('aria-expanded', 'false');
    }

    private positionWritingSessionPanel(): void {
        if (!this.writingSessionPanel || !this.writingSessionButton) return;
        const btnRect = this.writingSessionButton.getBoundingClientRect();
        const panelRect = this.writingSessionPanel.getBoundingClientRect();
        const viewportPadding = 12;
        const left = Math.min(
            Math.max(viewportPadding, btnRect.left),
            Math.max(viewportPadding, window.innerWidth - panelRect.width - viewportPadding)
        );
        this.writingSessionPanel.style.left = `${left}px`;
        this.writingSessionPanel.style.top = `${btnRect.bottom + 8}px`;
    }

    private getDefaultSessionGoalMinutes(): number {
        return this.plugin.getWritingSessionService().getDefaultGoalMinutes() ?? 120;
    }

    private createSessionButton(parent: HTMLElement, label: string, className: string, onClick: () => void | Promise<void>): HTMLButtonElement {
        const button = parent.createEl('button', { cls: className, text: label });
        button.type = 'button';
        button.onclick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            void onClick();
        };
        return button;
    }

    private createSessionIconButton(parent: HTMLElement, icon: string, label: string, className: string, onClick: () => void | Promise<void>): HTMLButtonElement {
        const button = parent.createEl('button', { cls: className });
        button.type = 'button';
        setIcon(button, icon);
        button.setAttribute('aria-label', label);
        applyTooltip(button, label, 'bottom');
        button.onclick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            void onClick();
        };
        return button;
    }

    private createSessionSectionTitle(parent: HTMLElement, icon: string, title: string): HTMLElement {
        const titleEl = parent.createDiv({ cls: 'ert-timeline-session-panel__section-title' });
        const iconEl = titleEl.createSpan({ cls: 'ert-timeline-session-panel__section-icon' });
        setIcon(iconEl, icon);
        titleEl.createSpan({ text: title });
        return titleEl;
    }

    private renderWritingSessionPanel(): void {
        const panel = this.writingSessionPanel;
        if (!panel) return;
        panel.empty();

        const service = this.plugin.getWritingSessionService();
        const active = service.getActiveSession();
        const header = panel.createDiv({ cls: 'ert-timeline-session-panel__header' });
        header.createDiv({ cls: 'ert-timeline-session-panel__title', text: 'Writing Session' });

        const settingsBtn = header.createEl('button', { cls: 'ert-timeline-session-panel__icon clickable-icon' });
        settingsBtn.type = 'button';
        setIcon(settingsBtn, 'settings');
        applyTooltip(settingsBtn, 'Goals & Sessions settings', 'bottom');
        settingsBtn.onclick = (event: MouseEvent) => {
            event.preventDefault();
            event.stopPropagation();
            const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
            if (setting) {
                setting.open();
                setting.openTabById('radial-timeline');
            }
            this.plugin.settingsTab?.revealSettingsSection('core', 'goals-sessions');
            this.hideWritingSessionPanel();
        };

        if (!active) {
            this.renderIdleWritingSessionPanel(panel);
            return;
        }
        this.renderActiveWritingSessionPanel(panel, active);
    }

    private renderIdleWritingSessionPanel(panel: HTMLElement): void {
        const service = this.plugin.getWritingSessionService();
        const defaultGoal = this.getDefaultSessionGoalMinutes();
        const intro = panel.createDiv({ cls: 'ert-timeline-session-panel__idle-card' });
        const introIcon = intro.createDiv({ cls: 'ert-timeline-session-panel__idle-icon' });
        setIcon(introIcon, 'play');
        const introText = intro.createDiv({ cls: 'ert-timeline-session-panel__idle-copy' });
        introText.createDiv({ cls: 'ert-timeline-session-panel__idle-title', text: 'Ready to write' });
        introText.createDiv({ cls: 'ert-timeline-session-panel__idle-meta', text: `${defaultGoal} min target · ${service.getSettings().defaults.defaultMode}` });

        const form = panel.createDiv({ cls: 'ert-timeline-session-panel__form' });
        const sessionSection = form.createDiv({ cls: 'ert-timeline-session-panel__section' });
        this.createSessionSectionTitle(sessionSection, 'pen-line', 'Session');

        const modeRow = sessionSection.createDiv({ cls: 'ert-timeline-session-panel__row' });
        modeRow.createDiv({ cls: 'ert-timeline-session-panel__label', text: 'Mode' });
        const modeSelect = modeRow.createEl('select', { cls: 'ert-timeline-session-panel__select' });
        const modeOptions: Array<{ value: WritingSessionMode; label: string }> = [
            { value: 'drafting', label: 'Fresh drafting' },
            { value: 'revising', label: 'Revision' },
            { value: 'editing', label: 'Editing' },
            { value: 'planning', label: 'Planning' },
        ];
        modeOptions.forEach(option => {
            const opt = modeSelect.createEl('option', { text: option.label });
            opt.value = option.value;
        });
        modeSelect.value = service.getSettings().defaults.defaultMode;
        this.writingSessionModeSelect = modeSelect;

        const sprintSection = form.createDiv({ cls: 'ert-timeline-session-panel__section' });
        this.createSessionSectionTitle(sprintSection, 'timer', 'Timer');

        const countdownRow = sprintSection.createDiv({ cls: 'ert-timeline-session-panel__row ert-timeline-session-panel__row--toggle' });
        const countdownLabel = countdownRow.createEl('label', { cls: 'ert-timeline-session-panel__toggle-label' });
        const countdownToggle = countdownLabel.createEl('input', { cls: 'ert-timeline-session-panel__toggle' });
        countdownToggle.type = 'checkbox';
        countdownToggle.checked = true;
        countdownLabel.createSpan({ text: 'Countdown sprint' });
        this.writingSessionCountdownToggle = countdownToggle;

        const goalRow = sprintSection.createDiv({ cls: 'ert-timeline-session-panel__row' });
        goalRow.createDiv({ cls: 'ert-timeline-session-panel__label', text: 'Goal' });
        const goalInput = goalRow.createEl('input', { cls: 'ert-timeline-session-panel__number' });
        goalInput.type = 'number';
        goalInput.min = '1';
        goalInput.max = '600';
        goalInput.step = '5';
        goalInput.value = String(defaultGoal);
        goalInput.setAttribute('aria-label', 'Session goal minutes');
        this.writingSessionGoalInput = goalInput;

        const quickRow = sprintSection.createDiv({ cls: 'ert-timeline-session-panel__quick' });
        [25, 50, defaultGoal].filter((value, index, values) => values.indexOf(value) === index).forEach(minutes => {
            this.createSessionButton(quickRow, `${minutes}m`, 'ert-timeline-session-panel__chip', () => {
                goalInput.value = String(minutes);
                countdownToggle.checked = true;
            });
        });

        countdownToggle.onchange = () => {
            goalInput.disabled = !countdownToggle.checked;
        };

        const actions = panel.createDiv({ cls: 'ert-timeline-session-panel__actions' });
        this.createSessionIconButton(actions, 'play', 'Start writing session', 'ert-timeline-session-panel__primary ert-timeline-session-panel__icon-action', async () => {
            const mode = (modeSelect.value as WritingSessionMode) || 'drafting';
            const parsedGoal = Number(goalInput.value);
            const goalMinutes = countdownToggle.checked && Number.isFinite(parsedGoal) && parsedGoal > 0
                ? parsedGoal
                : undefined;
            try {
                const session = await service.start({ mode, goalMinutes });
                new Notice(`Started ${session.mode} session${session.goalMinutes ? ` for ${session.goalMinutes} min` : ''}.`);
                this.refreshWritingSessionControl();
            } catch (error) {
                new Notice(error instanceof Error ? error.message : 'Could not start writing session.');
            }
        });
    }

    private renderActiveWritingSessionPanel(panel: HTMLElement, active: ActiveWritingSession): void {
        const service = this.plugin.getWritingSessionService();
        const elapsedMs = service.getActiveElapsedMs();
        const goalMs = active.goalMinutes ? active.goalMinutes * 60000 : undefined;
        const progress = goalMs ? Math.min(1, elapsedMs / goalMs) : undefined;
        const statusDisplay = this.getSessionStatusDisplay(active, elapsedMs);
        const clockProgressStep = this.getActiveSessionProgressStep(active, elapsedMs);

        const clock = panel.createDiv({ cls: `ert-timeline-session-panel__clock is-${statusDisplay.tone}` });
        this.applySessionProgressClass(clock, clockProgressStep);
        clock.createDiv({ cls: 'ert-timeline-session-panel__clock-value', text: statusDisplay.headline });
        clock.createDiv({ cls: 'ert-timeline-session-panel__clock-unit', text: statusDisplay.unit ? `${statusDisplay.unit} ${statusDisplay.detail}` : statusDisplay.detail });
        const meta = panel.createDiv({ cls: 'ert-timeline-session-panel__meta' });
        meta.setText([
            statusDisplay.tone === 'complete' ? 'Complete' : active.pausedAt ? 'Paused' : 'Running',
            active.mode,
            active.bookTitle,
        ].filter(Boolean).join(' · '));

        const statusSection = panel.createDiv({ cls: 'ert-timeline-session-panel__section' });
        this.createSessionSectionTitle(statusSection, 'activity', 'Progress');
        if (progress !== undefined) {
            const progressPercent = Math.round(progress * 100);
            const progressStep = this.getSessionProgressStep(progress);
            const progressShell = statusSection.createDiv({ cls: 'ert-timeline-session-panel__progress' });
            progressShell.createDiv({ cls: `ert-timeline-session-panel__progress-fill is-progress-${progressStep}` });
            progressShell.createDiv({
                cls: 'ert-timeline-session-panel__progress-label',
                text: `${progressPercent}% of ${active.goalMinutes} min`,
            });
        } else {
            statusSection.createDiv({ cls: 'ert-timeline-session-panel__note', text: 'Open-ended session' });
        }

        const actions = panel.createDiv({ cls: 'ert-timeline-session-panel__actions' });
        if (active.pausedAt) {
            this.createSessionIconButton(actions, 'play', 'Resume session', 'ert-timeline-session-panel__primary ert-timeline-session-panel__icon-action', async () => {
                try {
                    await service.resume();
                    this.refreshWritingSessionControl();
                } catch (error) {
                    new Notice(error instanceof Error ? error.message : 'Could not resume writing session.');
                }
            });
        } else {
            this.createSessionIconButton(actions, 'pause', 'Pause session', 'ert-timeline-session-panel__secondary ert-timeline-session-panel__icon-action', async () => {
                try {
                    await service.pause();
                    this.refreshWritingSessionControl();
                } catch (error) {
                    new Notice(error instanceof Error ? error.message : 'Could not pause writing session.');
                }
            });
        }
        this.createSessionIconButton(actions, 'square', 'Stop and save session', 'ert-timeline-session-panel__primary ert-timeline-session-panel__icon-action', async () => {
            try {
                const record = await service.stop();
                new Notice(`Saved ${record.mode} session (${this.formatSessionClock(record.elapsedMs)}).`);
                this.refreshWritingSessionControl();
            } catch (error) {
                new Notice(error instanceof Error ? error.message : 'Could not stop writing session.');
            }
        });
        this.createSessionIconButton(actions, 'trash-2', 'Discard session', 'ert-timeline-session-panel__ghost ert-timeline-session-panel__icon-action', async () => {
            try {
                await service.discard();
                new Notice('Discarded writing session.');
                this.refreshWritingSessionControl();
            } catch (error) {
                new Notice(error instanceof Error ? error.message : 'Could not discard writing session.');
            }
        });
    }

    private getRenderedTimelineSvg(): SVGSVGElement | null {
        return this.containerEl.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
    }

    private updateWritingSessionRing(svg: SVGSVGElement | null = this.getRenderedTimelineSvg()): void {
        if (!svg) return;
        svg.querySelectorAll('.ert-timeline-session-ring').forEach(el => el.remove());
        const active = this.plugin.getWritingSessionService().getActiveSession();
        if (!active) return;

        const lineInnerRadiusAttr = svg.getAttribute('data-line-inner-radius');
        const lineInnerRadius = lineInnerRadiusAttr ? Number(lineInnerRadiusAttr) : NaN;
        if (!Number.isFinite(lineInnerRadius)) return;

        const elapsedMs = this.plugin.getWritingSessionService().getActiveElapsedMs();
        const targetMinutes = active.goalMinutes ?? this.plugin.getWritingSessionService().getDefaultGoalMinutes() ?? 120;
        const state = buildSessionTimerRingState({
            progressRadius: lineInnerRadius + PROGRESS_RING_RADIUS_OFFSET,
            progressRingWidth: PROGRESS_RING_BASE_WIDTH,
            sessionRingWidth: SESSION_TIMER_RING_WIDTH,
            elapsedMs,
            targetMinutes,
            paused: !!active.pausedAt,
        });
        const ringSvg = renderSessionTimerRing(state);
        if (!ringSvg.trim()) return;

        const doc = new DOMParser().parseFromString(`<svg>${ringSvg}</svg>`, 'image/svg+xml');
        const ring = doc.documentElement.firstElementChild;
        const timelineRoot = svg.querySelector('#timeline-root');
        if (!ring || !timelineRoot) return;
        const imported = document.importNode(ring, true);
        const firstSceneGroup = timelineRoot.querySelector('#timeline-rotatable');
        if (firstSceneGroup) {
            timelineRoot.insertBefore(imported, firstSceneGroup);
        } else {
            timelineRoot.appendChild(imported);
        }
    }

    public focusTimelineSearchInput(): void {
        this.ensureBookSwitcher();
        if (!this.timelineSearchInput) return;
        this.timelineSearchInput.focus();
        this.timelineSearchInput.select();
    }

    public syncTimelineSearchControl(): void {
        if (!this.timelineSearchInput || !this.timelineSearchButton) return;

        if (this.plugin.searchActive && this.plugin.searchTerm) {
            this.timelineSearchInput.value = this.plugin.searchTerm;
            this.setTimelineSearchButtonMode('clear');
            return;
        }

        this.timelineSearchInput.value = '';
        this.setTimelineSearchButtonMode('search');
    }

    private setTimelineSearchButtonMode(mode: 'search' | 'clear'): void {
        if (!this.timelineSearchButton) return;
        this.timelineSearchButtonMode = mode;
        this.timelineSearchButton.empty();
        setIcon(this.timelineSearchButton, mode === 'clear' ? 'search-x' : 'search');
        this.timelineSearchButton.setAttribute('aria-label', mode === 'clear' ? 'Clear timeline search' : 'Search timeline');
        this.timelineSearchButton.setAttribute('title', mode === 'clear' ? 'Clear timeline search' : 'Search timeline');
        this.timelineSearchButton.classList.toggle('is-clear', mode === 'clear');
    }

    private handleTimelineSearchInput(): void {
        if (!this.timelineSearchInput) return;

        const term = this.timelineSearchInput.value.trim();
        if (!term) {
            this.setTimelineSearchButtonMode('search');
            if (this.plugin.searchActive || this.plugin.searchTerm) {
                this.plugin.clearSearch();
            }
            return;
        }

        this.setTimelineSearchButtonMode(
            this.plugin.searchActive && term === this.plugin.searchTerm ? 'clear' : 'search'
        );
    }

    private commitTimelineSearchFromInput(): void {
        if (!this.timelineSearchInput) return;

        const term = this.timelineSearchInput.value.trim();
        if (!term) {
            if (this.plugin.searchActive || this.plugin.searchTerm) {
                this.plugin.clearSearch();
            } else {
                this.setTimelineSearchButtonMode('search');
            }
            return;
        }

        if (this.plugin.searchActive && term === this.plugin.searchTerm && this.timelineSearchButtonMode === 'clear') {
            return;
        }

        this.plugin.performSearch(term);
        this.setTimelineSearchButtonMode('clear');
    }

    private clearTimelineSearchFromControl(): void {
        if (this.timelineSearchInput) {
            this.timelineSearchInput.value = '';
            this.timelineSearchInput.focus();
        }
        this.setTimelineSearchButtonMode('search');
        if (this.plugin.searchActive || this.plugin.searchTerm) {
            this.plugin.clearSearch();
        }
    }

    private openRadialTimelineCommands(): void {
        const commandManager = (this.app as unknown as { commands?: { executeCommandById?: (id: string) => void } }).commands;
        if (!commandManager?.executeCommandById) {
            new Notice('Command palette is not available.');
            return;
        }

        commandManager.executeCommandById('command-palette:open');
        this.seedCommandPaletteQuery('Radial Timeline');
    }

    private seedCommandPaletteQuery(query: string, attempt = 0): void {
        const input = document.querySelector<HTMLInputElement>('.prompt-input');
        if (!input) {
            if (attempt < 8) {
                window.setTimeout(() => this.seedCommandPaletteQuery(query, attempt + 1), 25);
                return;
            }
            new Notice('Command palette opened, but the search box was not found.');
            return;
        }

        input.value = query;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        input.setSelectionRange(query.length, query.length);
    }

    private updateTimelineLegend(): void {
        if (!this.timelineLegendTrigger || !this.timelineLegendPanel) return;

        const mode = this.currentMode || 'narrative';
        const isSupportedMode = TIMELINE_LEGEND_MODES.has(mode);
        this.timelineLegendTrigger.hidden = !isSupportedMode;
        this.timelineLegendPanel.classList.toggle('is-disabled', !isSupportedMode);
        this.timelineLegendPanel.classList.toggle('is-visible', false);
        this.timelineLegendTrigger.setAttribute('aria-expanded', 'false');
        if (!isSupportedMode) return;

        this.timelineLegendPanel.empty();

        const surface = document.createElement('div');
        surface.className = 'ert-timeline-legend__surface';

        const header = document.createElement('div');
        header.className = 'ert-timeline-legend__header';
        const title = document.createElement('div');
        title.className = 'ert-timeline-legend__title';
        title.textContent = 'Timeline Keys';
        const badge = document.createElement('div');
        badge.className = 'ert-timeline-legend__mode';
        badge.textContent = this.getTimelineLegendModeLabel(mode);
        header.appendChild(title);
        header.appendChild(badge);
        surface.appendChild(header);

        this.getTimelineLegendSections(mode).forEach(section => {
            const sectionEl = document.createElement('section');
            sectionEl.className = 'ert-timeline-legend__section';

            const sectionTitle = document.createElement('div');
            sectionTitle.className = 'ert-timeline-legend__section-title';
            sectionTitle.textContent = section.title;
            sectionEl.appendChild(sectionTitle);

            section.rows.forEach(row => {
                const rowEl = document.createElement('div');
                rowEl.className = 'ert-timeline-legend__row';

                const iconEl = document.createElement('span');
                iconEl.className = 'ert-timeline-legend__icon';
                if (row.swatch) {
                    iconEl.classList.add('ert-timeline-legend__icon--swatch');
                    const swatchEl = document.createElement('span');
                    swatchEl.className = 'ert-timeline-legend__swatch';
                    if (row.swatch.fill) swatchEl.style.setProperty('--ert-legend-swatch-fill', row.swatch.fill);
                    if (row.swatch.stroke) swatchEl.style.setProperty('--ert-legend-swatch-stroke', row.swatch.stroke);
                    if (row.swatch.textColor) swatchEl.style.setProperty('--ert-legend-swatch-text', row.swatch.textColor);
                    if (row.swatch.text) swatchEl.textContent = row.swatch.text;
                    iconEl.appendChild(swatchEl);
                } else if (row.icon) {
                    setIcon(iconEl, row.icon);
                }

                const copyEl = document.createElement('span');
                copyEl.className = 'ert-timeline-legend__copy';
                const labelEl = document.createElement('span');
                labelEl.className = 'ert-timeline-legend__label';
                labelEl.textContent = row.label;
                copyEl.appendChild(labelEl);

                if (row.detail) {
                    const detailEl = document.createElement('span');
                    detailEl.className = 'ert-timeline-legend__detail';
                    if (row.detailSegments) {
                        row.detailSegments.forEach(segment => {
                            const segmentEl = detailEl.createSpan({ text: segment.text });
                            if (segment.color) {
                                segmentEl.className = 'ert-timeline-legend__detail-segment';
                                segmentEl.style.setProperty('--ert-legend-segment-color', segment.color);
                            }
                        });
                    } else {
                        detailEl.appendText(row.detail);
                    }
                    if (row.detailIcon) {
                        const detailIconEl = detailEl.createSpan({
                            cls: 'ert-timeline-legend__detail-icon',
                            attr: {
                                'aria-label': row.detailIconLabel || row.detailIcon,
                                title: row.detailIconLabel || row.detailIcon,
                            },
                        });
                        setIcon(detailIconEl, row.detailIcon);
                    }
                    copyEl.appendChild(detailEl);
                }

                rowEl.appendChild(iconEl);
                rowEl.appendChild(copyEl);
                sectionEl.appendChild(rowEl);
            });

            surface.appendChild(sectionEl);
        });

        this.timelineLegendPanel.appendChild(surface);
    }

    private getTimelineLegendModeLabel(mode: string): string {
        if (mode === 'progress') return 'Progress';
        if (mode === 'chronologue') return 'Chronologue';
        return 'Narrative';
    }

    private randomSceneNumber(): string {
        return String(1 + Math.floor(Math.random() * 99));
    }

    private getTimelineLegendSections(mode: string): TimelineLegendSection[] {
        const sections: TimelineLegendSection[] = [
            {
                title: 'Scene Actions',
                rows: [
                    { icon: 'square-mouse-pointer', label: 'Hover scene', detail: mode === 'chronologue' ? 'show property fields and matching scenes' : 'show property fields and expand title *' },
                    { icon: 'mouse-pointer-click', label: 'Click scene', detail: 'open scene note' },
                    { icon: 'mouse', label: 'Right click scene', detail: 'set status, stage, or triplet pulse' },
                ],
            },
        ];

        if (mode === 'narrative') {
            sections.push({
                title: 'Narrative Only',
                rows: [
                    { icon: 'move-horizontal', label: 'Drag outer ring', detail: 'move scene or beat in manuscript order' },
                ],
            });
        }

        if (mode === 'chronologue') {
            sections.push({
                title: 'Chronologue Only',
                rows: [
                    { icon: 'arrow-left-right', label: 'Shift / Caps Lock', detail: 'compare elapsed time between scenes' },
                    { icon: 'crosshair', label: 'Click while comparing', detail: 'choose the scene pair' },
                ],
            });
        }

        sections.push({
            title: 'Number Square States',
            rows: [
                {
                    swatch: { fill: 'var(--rt-color-due)', stroke: 'var(--rt-color-due)', text: this.randomSceneNumber(), textColor: 'var(--rt-color-empty)' },
                    label: 'Missing date',
                    detail: 'marked Complete but missing WHEN',
                },
                {
                    swatch: { fill: 'var(--interactive-accent)', text: this.randomSceneNumber(), textColor: 'var(--rt-color-empty)' },
                    label: 'Open in tab',
                    detail: 'scene is currently open',
                },
                {
                    swatch: { fill: 'var(--rt-color-search)', text: this.randomSceneNumber(), textColor: 'var(--rt-legacy-black)' },
                    label: 'Search match',
                    detail: 'matches active search',
                },
                {
                    swatch: { fill: 'var(--rt-color-muted-gray)', text: this.randomSceneNumber(), textColor: 'var(--rt-legacy-black)' },
                    label: 'Pending edits',
                    detail: 'AI edits awaiting review',
                },
                {
                    swatch: { fill: 'var(--rt-color-empty)', text: this.randomSceneNumber(), textColor: 'var(--rt-grade-a-color)' },
                    label: 'Pulse AI grade A',
                    detail: 'strong scene',
                },
                {
                    swatch: { fill: 'var(--rt-color-empty)', text: this.randomSceneNumber(), textColor: 'var(--rt-grade-b-color)' },
                    label: 'Pulse AI grade B',
                    detail: 'acceptable',
                },
                {
                    swatch: { fill: 'var(--rt-color-empty)', text: this.randomSceneNumber(), textColor: 'var(--rt-grade-c-color)' },
                    label: 'Pulse AI grade C',
                    detail: 'needs revision',
                },
            ],
        });

        sections.push({
            title: 'Right Click Menu',
            rows: [
                {
                    icon: 'circle-dot',
                    label: 'Set Status',
                    detail: 'Todo, Working, Complete',
                    detailIcon: 'calendar-check',
                    detailIconLabel: 'Complete updates Due Date to today',
                },
                { icon: 'component', label: 'Change Stage', detail: 'Zero, Author, House, Press', detailSegments: this.getStageLegendDetailSegments() },
                { icon: 'flag', label: 'Misc', detail: 'Flag Triplet Pulse' },
            ],
        });

        return sections;
    }

    private getStageLegendDetailSegments(): TimelineLegendDetailSegment[] {
        const colors = this.plugin.settings.publishStageColors || {};
        return [
            { text: 'Zero', color: colors.Zero },
            { text: ', ' },
            { text: 'Author', color: colors.Author },
            { text: ', ' },
            { text: 'House', color: colors.House },
            { text: ', ' },
            { text: 'Press', color: colors.Press },
        ];
    }

    private updateBookSwitcherOptions(): void {
        if (!this.bookSwitcherSelect) return;
        const select = this.bookSwitcherSelect;
        while (select.firstChild) {
            select.removeChild(select.firstChild);
        }

        const books = this.plugin.settings.books || [];
        const sagaAvailable = isSagaScopeAvailable(this.plugin.settings);
        if (sagaAvailable) {
            const sagaOption = document.createElement('option');
            sagaOption.value = SAGA_SCOPE_OPTION;
            sagaOption.textContent = 'Saga';
            select.appendChild(sagaOption);
        }

        books.forEach(book => {
            const option = document.createElement('option');
            option.value = book.id;
            option.textContent = book.title?.trim() || DEFAULT_BOOK_TITLE;
            select.appendChild(option);
        });

        if (getTimelineScope(this.plugin.settings) === 'saga' && sagaAvailable) {
            select.value = SAGA_SCOPE_OPTION;
        } else if (books.length > 0) {
            select.value = this.plugin.settings.activeBookId || books[0].id;
        }

        select.toggleAttribute('disabled', books.length <= 1 && !sagaAvailable);
    }

    private updateViewTitle(): void {
        const titleText = this.getDisplayText();
        const headerTitle = this.containerEl.querySelector('.view-header-title') as HTMLElement | null;
        if (headerTitle) headerTitle.textContent = titleText;

        const tabTitle = this.containerEl
            .closest('.workspace-leaf')
            ?.querySelector('.workspace-tab-header-inner-title') as HTMLElement | null;
        if (tabTitle) tabTitle.textContent = titleText;
    }

    private scheduleBeatLabelAdjustment(delayMs = 0): void {
        if (this.beatLabelAdjustTimeout !== null) {
            window.clearTimeout(this.beatLabelAdjustTimeout);
            this.beatLabelAdjustTimeout = null;
        }
        if (this.beatLabelAdjustRaf !== null) {
            window.cancelAnimationFrame(this.beatLabelAdjustRaf);
            this.beatLabelAdjustRaf = null;
        }

        const run = () => {
            this.beatLabelAdjustTimeout = null;
            const timelineContainer = this.containerEl.querySelector('.radial-timeline-container') as HTMLElement | null;
            if (!timelineContainer) return;
            this.beatLabelAdjustRaf = window.requestAnimationFrame(() => {
                this.beatLabelAdjustRaf = null;
                this.rendererService?.adjustBeatLabelsAfterRender(timelineContainer);
            });
        };

        if (delayMs > 0) {
            this.beatLabelAdjustTimeout = window.setTimeout(run, delayMs);
            return;
        }

        run();
    }

    public syncBookHeader(): void {
        this.ensureBookSwitcher();
        this.updateViewTitle();
    }

    // --- Helpers for number-square orientation/position (shared across modes) ---
    public applyRotationToNumberSquares(svg: SVGSVGElement, rotated: boolean): void {
        const segmentCount = parseInt(svg.getAttribute('data-segment-count') || svg.getAttribute('data-num-acts') || '3', 10);
        const angle = segmentCount > 0 ? 360 / segmentCount : 120; // Dynamic counter-rotation based on active segment count
        const orients = svg.querySelectorAll<SVGGElement>('.number-square-orient');
        orients.forEach((el) => {
            const base = (el.getAttribute('transform') || '').replace(/\s*rotate\([^)]*\)/g, '').trim();
            if (rotated) {
                el.setAttribute('transform', `${base} rotate(${angle})`.trim());
            } else {
                if (base) el.setAttribute('transform', base); else el.removeAttribute('transform');
            }
        });
    }

    public getRotationState(): boolean { return this.rotationState; }
    public setRotationState(rotated: boolean): void { this.rotationState = rotated; }

    public getSquareGroupForSceneId(svg: SVGSVGElement, sceneId: string): SVGGElement | null {
        const rect = svg.querySelector(`.rt-number-square[data-scene-id="${sceneId}"]`) as SVGRectElement | null;
        if (!rect) return null;
        const group = rect.closest('.number-square-group') as SVGGElement | null;
        return group;
    }

    public setNumberSquareGroupPosition(svg: SVGSVGElement, sceneId: string, x: number, y: number): void {
        const group = this.getSquareGroupForSceneId(svg, sceneId);
        if (group) {
            // Only translate on the outer group; orientation is handled by inner wrapper
            group.setAttribute('transform', `translate(${x}, ${y})`);
        }
    }

    // Add this method to handle search indicator clicks
    private setupSearchControls(): void {
        setupSearchControlsExt(this);
    }
    
    /**
     * Setup interactions based on the current mode
     */
    private setupInteractionsForMode(svg: SVGSVGElement): void {
        if (this.interactionController) {
            const { getModeDefinition } = require('../modes/ModeRegistry');
            const modeDef = getModeDefinition(this.currentMode as any);
            this.interactionController.setupMode(modeDef, svg);
        }
    }
    
    updateOpenFilesTracking(): void {
        
        // Store the previous state to check if it changed
        const previousOpenFiles = new Set(this.openScenePaths);
        
        this.openScenePaths = new Set<string>();

        // Collect the paths of all open markdown files (including deferred/unactivated tabs)
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        leaves.forEach(leaf => {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file) {
                this.openScenePaths.add(view.file.path);
            } else {
                // Deferred/unactivated tab — read path from view state
                try {
                    const state = leaf.getViewState();
                    const filePath = (state?.state as Record<string, unknown>)?.file;
                    if (typeof filePath === 'string' && filePath.length > 0) {
                        this.openScenePaths.add(filePath);
                    }
                } catch { /* ignore */ }
            }
        });

        // Also check if there's an active file not in a leaf
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && !this.openScenePaths.has(activeFile.path)) {
            this.openScenePaths.add(activeFile.path);
        }
        
        
        // Check if the open files have changed
        let hasChanged = false;
        
        // Different size means something changed
        if (previousOpenFiles.size !== this.openScenePaths.size) {
            hasChanged = true;
        } else {
            // Check if any files were added or removed
            for (const path of previousOpenFiles) {
                if (!this.openScenePaths.has(path)) {
                    hasChanged = true;
                    break;
                }
            }
            if (!hasChanged) {
                for (const path of this.openScenePaths) {
                    if (!previousOpenFiles.has(path)) {
                        hasChanged = true;
                        break;
                    }
                }
            }
        }

        // Keep the plugin-level tracking in sync so rerenders know which scenes are open
        this.plugin.openScenePaths = new Set(this.openScenePaths);
        
        // Update the UI if something changed
        if (hasChanged) {
            const container = this.containerEl.children[1] as HTMLElement;
            // Try selective update first
            this.rendererService?.updateOpenClasses(container, this.openScenePaths);
        }
    }

    refreshTimeline() {
        if (!this.plugin) return;

        if (getTimelineScope(this.plugin.settings) === 'saga' && this.currentMode !== 'narrative') {
            this.currentMode = 'narrative';
            this.plugin.settings.currentMode = 'narrative';
        }

        const perfStart = performance.now();
        const container = this.containerEl.children[1] as HTMLElement;
        
        // First update the tracking of open files
        this.updateOpenFilesTracking();
        
        // Get the scene data using the plugin's method
        this.plugin.getTimelineSceneData()
            .then(async (sceneData) => {
                const dataLoadTime = performance.now() - perfStart;
                const timelineSceneData = sceneData.filter(item => !isMatterNote(item));

                // If in Gossamer mode, the change might be a score update. We must
                // rebuild the run data here to ensure the renderer gets the latest scores.
                if (this._currentMode === 'gossamer') {
                    const { syncGossamerPresentationState } = await import('../GossamerCommands');
                    await syncGossamerPresentationState(this.plugin, timelineSceneData as any);
                }
                
                this.sceneData = timelineSceneData;
                // Expose last scene data on plugin for selective services that need it
                this.plugin.lastSceneData = timelineSceneData;
                
                // Create snapshot of current state
                const currentSnapshot = createSnapshot(
                    timelineSceneData,
                    this.plugin.openScenePaths,
                    this.plugin.searchActive,
                    this.plugin.searchResults,
                    this._currentMode,
                    this.plugin.settings,
                    (this.plugin as any)._gossamerLastRun
                );
                
                // Detect changes from last render
                const changeResult = detectChanges(this.lastSnapshot, currentSnapshot);
                
                // Decide rendering strategy
                if (changeResult.updateStrategy === 'none') {
                    // No changes - skip render entirely
                    return;
                } else if (changeResult.updateStrategy === 'selective' && this.rendererService) {
                    // Selective update using RendererService
                    let updated = false;
                    
                    // Handle open files changes
                    if (changeResult.changeTypes.has(ChangeType.OPEN_FILES)) {
                        this.rendererService.updateOpenClasses(container, this.plugin.openScenePaths);
                        updated = true;
                    }
                    
                    // Handle search changes (highlight text + number square state)
                    if (changeResult.changeTypes.has(ChangeType.SEARCH)) {
                        this.rendererService.updateNumberSquaresDOM(container, this.plugin);
                        this.rendererService.updateSearchHighlights(container, this.plugin.searchTerm);
                        updated = true;
                    }
                    
                    // Handle time and progress target-date changes using selective update
                    if (changeResult.changeTypes.has(ChangeType.TIME) ||
                        changeResult.changeTypes.has(ChangeType.TARGET_DATES)) {
                        updated = this.rendererService.updateProgressAndTicks(container) || updated;
                    }
                    
                    // Handle synopsis text changes
                    if (changeResult.changeTypes.has(ChangeType.SYNOPSIS)) {
                        this.rendererService.updateSynopsisDOM(container, this.plugin);
                        updated = true;
                    }

                    // Handle dominant subplot changes (scene colors only)
                    if (changeResult.changeTypes.has(ChangeType.DOMINANT_SUBPLOT)) {
                        const scenes = this.sceneData || [];
                        updated = this.rendererService.updateSceneColorsDOM(container, this.plugin, scenes) || updated;
                    }

                    // Handle visual-only scene YAML changes (status, due, publish stage)
                    if (changeResult.changeTypes.has(ChangeType.SCENE_VISUAL)) {
                        const scenes = this.sceneData || [];
                        updated = this.rendererService.updateSceneFillsDOM(container, this.plugin, scenes) || updated;
                        updated = this.rendererService.updateCenterGridDOM(container, scenes) || updated;
                        updated = this.rendererService.updateProgressAndTicks(container) || updated;
                    }

                    // Handle gossamer changes
                    if (changeResult.changeTypes.has(ChangeType.GOSSAMER)) {
                        updated = this.rendererService.updateGossamerLayer(this as any) || updated;
                    }
                    
                    if (updated) {
                        // Selective update succeeded
                        this.lastSnapshot = currentSnapshot;
                        return;
                    }
                    
                    // Selective update failed - fall through to full render
                }
                
                // Full render
                const loadingEl = container.createEl("div", {
                    cls: "rt-loading-message",
                    text: t('timeline.loadingData')
                });
                
                // Clear container for full render
                container.empty();
                container.appendChild(loadingEl);
                
                // Render the timeline with the scene data
                const renderStart = performance.now();
                this.renderTimeline(container, this.sceneData);
                const renderTime = performance.now() - renderStart;
                
                // Remove loading message
                loadingEl.remove();
                
                // Update snapshot after successful render
                this.lastSnapshot = currentSnapshot;

                // Re-wire search controls and highlights now that DOM is current
                this.setupSearchControls();
                if (this.plugin.searchActive) {
                    const containerEl = container;
                    if (this.rendererService) {
                         this.rendererService.updateSearchHighlights(containerEl, this.plugin.searchTerm);
                    }
                }

            })
            .catch(error => {
                const errorEl = container.createEl("div", {
                    cls: "rt-error-message",
                    text: `Error: ${error.message}`
                });
                console.error("Failed to load timeline data", error);
            });
    }
    

    
    private setupMouseCoordinateTracking(container: HTMLElement) {
        // Mouse coordinate tracking disabled - no debug mode toggle exists
    }
    
    /**
     * Called whenever the view is shown/revealed (e.g., when switching tabs back to this view)
     * Unlike onOpen which is called only once when the view is created
     */
    onload(): void {
        // View is now loaded and visible
    }
    
    async onOpen(): Promise<void> {
        this.contentEl.addClass('radial-timeline-view');
        this.syncBookHeader();
        await this.plugin.maybeShowReleaseNotesModal();
        
        // Note: Workspace events (file-open, layout-change, active-leaf-change, quick-preview)
        // are handled by FileTrackingService at the plugin level to avoid duplicate handlers.
        // The service calls refreshTimeline() on all views when open files change.
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => {
            if (this.app.workspace.getActiveViewOfType(RadialTimelineView) !== this) return;
            this.scheduleBeatLabelAdjustment(50);
        }));

        // Frontmatter values to track changes only to YAML frontmatter with debounce every 1 second.
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                // Skip if not a markdown file
                if (!(file instanceof TFile) || file.extension !== 'md') return;
                
                // Get the current frontmatter
                const cache = this.app.metadataCache.getFileCache(file);
                if (!cache || !cache.frontmatter) return;
                
                // Check if this is a scene, beat/plot, or backdrop file.
                const fm = cache.frontmatter;
                const isScene = (fm.Class === 'Scene') || (fm.class === 'Scene');
                const isBeatOrPlot = (fm.Class === 'Plot') || (fm.class === 'Plot') || (fm.Class === 'Beat') || (fm.class === 'Beat');
                const isBackdrop = (fm.Class === 'Backdrop') || (fm.class === 'Backdrop');

                if (!isScene && !isBeatOrPlot && !isBackdrop) return;

                // Scene, Beat/Plot, and Backdrop frontmatter can affect timeline render
                // and hover content in multiple modes. Always refresh on those YAML
                // changes so note values remain the source of truth over cached DOM.
                
                // Check if this is a frontmatter change
                const fileId = file.path;
                const currentFrontmatter = JSON.stringify(cache.frontmatter);
                const previousFrontmatter = this.lastFrontmatterValues[fileId];
                
                // Update our stored value regardless
                this.lastFrontmatterValues[fileId] = currentFrontmatter;
                
                // If values are the same, no need to trigger refresh
                if (previousFrontmatter === currentFrontmatter) return;
                
                // Debounce frontmatter-triggered refreshes using the internal timeline delay.
                if (this.timelineRefreshTimeout) window.clearTimeout(this.timelineRefreshTimeout);
                this.timelineRefreshTimeout = window.setTimeout(() => {
                    this.refreshTimeline();
                }, TIMELINE_REFRESH_DELAY_MS);
            })
        );
        
        if (getTimelineScope(this.plugin.settings) === 'saga' && this._currentMode !== 'narrative') {
            this._currentMode = 'narrative';
            this.plugin.settings.currentMode = 'narrative';
            try { await this.plugin.saveSettings(); } catch { /* best effort */ }
        }

        // If starting in Gossamer mode, initialize it before the first render
        if (this._currentMode === 'gossamer' && this.modeManager) {
            const { TimelineMode } = await import('../modes/ModeDefinition');
            const { getModeDefinition } = await import('../modes/ModeRegistry');
            const gossamerDef = getModeDefinition(TimelineMode.GOSSAMER);
            
            // Run the onEnter hook to build gossamer data
            if (gossamerDef.onEnter) {
                try {
                    await gossamerDef.onEnter(this);
                } catch (e) {
                    console.error('[Gossamer] Failed to initialize on load:', e);
                    // Fallback to narrative mode if initialization fails
                    this._currentMode = 'narrative';
                    this.plugin.settings.currentMode = 'narrative';
                    try { await this.plugin.saveSettings(); } catch { /* best effort */ }
                    new Notice('Gossamer mode could not load. Returning to Narrative mode.', 6000);
                }
            }
        }
        
        // Initial timeline render
        this.refreshTimeline();
    }
    
    async onClose(): Promise<void> {
        // Clear search state directly without triggering refreshTimeline()
        // (view is closing, so no point in refreshing - avoids side effects during unload)
        this.plugin.searchActive = false;
        this.plugin.searchTerm = '';
        this.plugin.searchResults.clear();
        
        // Clean up chronologue shift mode buttons (keyboard listeners auto-cleanup via view.register())
        if ((this as any)._chronologueShiftCleanup) {
            (this as any)._chronologueShiftCleanup();
        }
        if (this.beatLabelAdjustTimeout !== null) {
            window.clearTimeout(this.beatLabelAdjustTimeout);
            this.beatLabelAdjustTimeout = null;
        }
        if (this.beatLabelAdjustRaf !== null) {
            window.cancelAnimationFrame(this.beatLabelAdjustRaf);
            this.beatLabelAdjustRaf = null;
        }
        // Note: ModeToggleController keyboard listeners are cleaned up automatically via view.register()
    }
    
    // Add missing addHighlightRectangles method
    private addHighlightRectangles(): void {
        addHighlightRectanglesExt(this);
    }
    
    renderTimeline(container: HTMLElement, scenes: TimelineItem[]): void {
        // Clear existing content
        container.empty();
        
        // Check if there are any actual scenes (not just backdrops or beats)
        // The user wants to see the Welcome Screen until they have at least one Scene note.
        const hasScenes = scenes && scenes.some(item => item.itemType === 'Scene');
        
        if (!scenes || scenes.length === 0 || !hasScenes) {
            renderWelcomeScreen({
                container,
                plugin: this.plugin,
                refreshTimeline: () => this.refreshTimeline()
            });
            return;
        }
        
        this.sceneData = scenes;

        // Performance optimization: Create DocumentFragment to minimize reflows
        const fragment = document.createDocumentFragment();
        const timelineContainer = document.createElement("div");
        timelineContainer.className = "radial-timeline-container";
        fragment.appendChild(timelineContainer);
        
        try {
            // Generate the SVG content and get the max stage color
            const startTime = performance.now();
            const renderer = this.rendererService ?? this.plugin.getRendererService();
            const { svgString, maxStageColor: calculatedMaxStageColor } = renderer.renderTimeline(scenes);

            // Expose the dominant publish-stage colour to CSS so rules can use var(--rt-max-publish-stage-color)
            if (calculatedMaxStageColor) {
                document.documentElement.style.setProperty('--rt-max-publish-stage-color', calculatedMaxStageColor);
            }
            
            // Render directly into the container
            const svgElement = renderSvgFromString(svgString, timelineContainer, (cleanup) => this.register(cleanup));

                if (svgElement) {
                    // Set data-mode attribute for CSS targeting
                    svgElement.setAttribute('data-mode', this.currentMode);
                    
                    // Preserve shift mode state across re-renders (chronologue mode only)
                    if (this.currentMode === 'chronologue' && isShiftModeActive()) {
                        svgElement.setAttribute('data-shift-mode', 'active');
                    }
                    
                    // Set data-chronologue-mode for CSS targeting (hides rotation toggle, etc.)
                    if (this.currentMode === 'chronologue') {
                        svgElement.setAttribute('data-chronologue-mode', 'true');
                    } else {
                        svgElement.removeAttribute('data-chronologue-mode');
                    }
                    this.updateWritingSessionRing(svgElement as unknown as SVGSVGElement);
                    
                    // If Gossamer mode is active, reuse hover-state styling: mute everything except Beat notes
                    if (this.currentMode === 'gossamer') {
                    svgElement.setAttribute('data-gossamer-mode', 'true');
                    // Apply the same logic as scene hover: add rt-non-selected to all elements except Beat notes
                    const allElements = svgElement.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title');
                    allElements.forEach(el => {
                        const group = el.closest('.rt-scene-group');
                        const itemType = group?.getAttribute('data-item-type');
                        // Treat story beats like "selected" items - they stay unmuted
                        if (itemType !== 'Beat') {
                            el.classList.add('rt-non-selected');
                        }
                    });
                    } else {
                        svgElement.removeAttribute('data-gossamer-mode');
                    }

                    // Setup interactions based on current mode
                    this.setupInteractionsForMode(svgElement as unknown as SVGSVGElement);
                // Set CSS variables for subplot labels based on data attributes
                const subplotLabelGroups = svgElement.querySelectorAll('.subplot-label-group[data-font-size]');
                subplotLabelGroups.forEach((group) => {
                    const fontSize = group.getAttribute('data-font-size');
                    if (fontSize) {
                        (group as SVGElement).style.setProperty('--rt-subplot-font-size', `${fontSize}px`);
                    }
                });
                
                // Attach rotation toggle behavior (inline SVG scripts won't run here)
                setupRotationController(this, svgElement as unknown as SVGSVGElement);

                // Attach mode toggle behavior
                setupModeToggleController(this, svgElement as unknown as SVGSVGElement);

                // Attach version indicator click behavior
                setupVersionIndicatorController(this, svgElement as unknown as SVGSVGElement);

                // Attach help icon click behavior
                setupHelpIconController(this, svgElement as unknown as SVGSVGElement);

                // Attach Author Progress Indicator click behavior - opens Settings Social tab
                const aprIndicator = svgElement.querySelector('.rt-apr-indicator');
                if (aprIndicator) {
                    this.registerDomEvent(aprIndicator as unknown as HTMLElement, 'click', () => {
                        // Open settings and switch to Social tab
                        if (this.plugin.settingsTab) {
                            this.plugin.settingsTab.setActiveTab('social');
                        }
                        // SAFE: any type used for accessing Obsidian's internal settings API
                        const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
                        if (setting) {
                            setting.open();
                            setting.openTabById('radial-timeline');
                        }
                    });
                }

                // Attach Progress Milestone Indicator click behavior - opens Settings Core tab (where progress preview lives)
                const milestoneIndicator = svgElement.querySelector('.rt-milestone-indicator');
                if (milestoneIndicator) {
                    this.registerDomEvent(milestoneIndicator as unknown as HTMLElement, 'click', () => {
                        // Open settings and switch to Core tab (where the progress preview lives)
                        if (this.plugin.settingsTab) {
                            this.plugin.settingsTab.forceExpandCoreCompletionPreview();
                            this.plugin.settingsTab.setActiveTab('core');
                        }
                        // SAFE: any type used for accessing Obsidian's internal settings API
                        const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting;
                        if (setting) {
                            setting.open();
                            setting.openTabById('radial-timeline');
                        }
                    });
                }

                // Performance optimization: Use batch operations where possible
                const allSynopses = Array.from(svgElement.querySelectorAll(".rt-scene-info"));
                const sceneGroups = Array.from(svgElement.querySelectorAll(".rt-scene-group"));
                
                // Track RAF IDs for cleanup
                const sceneGroupRafIds: number[] = [];
                
                // Performance optimization: Process scene groups in chunks to avoid UI blocking
                const CHUNK_SIZE = 20;
                const processSceneGroups = (startIdx: number) => {
                    const endIdx = Math.min(startIdx + CHUNK_SIZE, sceneGroups.length);
                    
                    for (let i = startIdx; i < endIdx; i++) {
                        const group = sceneGroups[i];
                    const encodedPath = group.getAttribute("data-path");
                        
                    if (encodedPath && encodedPath !== "") {
                        const filePath = decodeURIComponent(encodedPath);
                        
                        // Check if this file is currently open in a tab
                        if (this.openScenePaths.has(filePath)) {
                            // Add a class to indicate this scene is open
                            group.classList.add("rt-scene-is-open");
                            
                            // Mark the scene path element
                            const scenePath = group.querySelector(".rt-scene-path");
                            if (scenePath) {
                                scenePath.classList.add("rt-scene-is-open");
                            }
                            
                            // Mark the scene title text if present
                            const sceneTitle = group.querySelector(".rt-scene-title");
                            if (sceneTitle) {
                                sceneTitle.classList.add("rt-scene-is-open");
                            }
                            
                                // Get scene ID from path element
                                const sceneId = scenePath?.id;
                                if (sceneId) {
                                    // Mark the number elements
                                    const numberSquare = svgElement.querySelector(`.rt-number-square[data-scene-id="${sceneId}"]`);
                            if (numberSquare) {
                                numberSquare.classList.add("rt-scene-is-open");
                            }
                            
                                    const numberText = svgElement.querySelector(`.rt-number-text[data-scene-id="${sceneId}"]`);
                            if (numberText) {
                                numberText.classList.add("rt-scene-is-open");
                                    }
                                }
                            }
                        }
                    }
                    
                    // Process next chunk if there are more scene groups
                    if (endIdx < sceneGroups.length) {
                        const rafId = window.requestAnimationFrame(() => processSceneGroups(endIdx));
                        sceneGroupRafIds.push(rafId);
                    }
                };
                
                // Register cleanup for RAF IDs
                this.register(() => {
                    sceneGroupRafIds.forEach(id => cancelAnimationFrame(id));
                });
                
                // Start processing scene groups in chunks
                processSceneGroups(0);
                
                // All synopses default to the CSS-defined hidden state (opacity 0, pointer-events none)
                allSynopses.forEach(synopsis => {
                    synopsis.classList.remove('rt-visible');
                });
                
        // Setup search controls after SVG is rendered
        this.setupSearchControls();

                // --- START: Add hover effect for scene paths to fade subplot labels ---
                // Reuse the existing sceneGroups variable declared earlier
                // const sceneGroups = svgElement.querySelectorAll('.scene-group'); // REMOVE this redeclaration
                const subplotLabels = svgElement.querySelectorAll<SVGTextElement>('.rt-subplot-ring-label-text'); // Use type assertion for arching ring labels

                if (subplotLabels.length > 0) {
                    const onEnterLeave = (hovering: boolean, targetGroup: Element | null) => {
                        if (!targetGroup) return;
                        subplotLabels.forEach(label => {
                            if (hovering) label.classList.add('rt-non-selected'); else label.classList.remove('rt-non-selected');
                        });
                    };
                    const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement;
                    if (svg) {
                        let lastHoverGroup: Element | null = null;
                        this.registerDomEvent(svg as unknown as HTMLElement, 'pointerover', (e: PointerEvent) => {
                            const g = (e.target as Element).closest('.rt-scene-group');
                            if (g && g !== lastHoverGroup) {
                                onEnterLeave(true, g);
                                lastHoverGroup = g;
                            }
                        });
                        this.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', (e: PointerEvent) => {
                            const g = (e.target as Element).closest('.rt-scene-group');
                            if (g && g === lastHoverGroup) {
                                onEnterLeave(false, g);
                                lastHoverGroup = null;
                            }
                        });
                    }
                }
                // --- END: Add hover effect for scene paths ---

                // Delegated hover will be bound after we append the fragment
            }
                
            // Add the fragment to the container
            container.appendChild(fragment);
            const svgForRecentMoves = timelineContainer.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
            if (svgForRecentMoves) {
                this.renderRecentMovesPanel(svgForRecentMoves);
                this.renderGossamerRunsPanel(svgForRecentMoves);
            }
            this.scheduleBeatLabelAdjustment();
            
            // Attach Obsidian bubble tooltips to grid headers and buttons
            // Must be done after fragment is in DOM for getBoundingClientRect to work
            const svgForTooltips = container.querySelector('.radial-timeline-svg');
            if (svgForTooltips) {
                setupTooltips(svgForTooltips as SVGElement, this.registerDomEvent.bind(this));
            }
            
            // ============================================================================
            // MODE-SPECIFIC INTERACTIONS
            // ============================================================================
            // Scene hover interactions are now handled by mode-specific files using
            // SceneInteractionManager. The legacy 400-line closure has been removed.
            //
            // See: src/view/interactions/SceneInteractionManager.ts
            // See: src/view/modes/AllScenesMode.ts
            // See: src/view/modes/ChronologueMode.ts
            // ============================================================================
            
            // Set up Gossamer event listeners AFTER everything is rendered
            if (this.currentMode === 'gossamer') {
                const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement;
                if (svg) {
                    // Use DOUBLE requestAnimationFrame to ensure DOM is fully painted
                    let gossamerOuterRafId: number | null = null;
                    let gossamerInnerRafId: number | null = null;
                    gossamerOuterRafId = requestAnimationFrame(() => {
                        gossamerInnerRafId = requestAnimationFrame(() => {
                            this.setupGossamerEventListeners(svg);
                            gossamerOuterRafId = null;
                            gossamerInnerRafId = null;
                        });
                    });
                    
                    // Register cleanup for gossamer RAF IDs
                    this.register(() => {
                        if (gossamerOuterRafId !== null) cancelAnimationFrame(gossamerOuterRafId);
                        if (gossamerInnerRafId !== null) cancelAnimationFrame(gossamerInnerRafId);
                    });
                }
            }
            
        } catch (error) {
            console.error("Error rendering timeline:", error);
            container.createEl("div", {
                text: t('timeline.renderError')
            });
        }
    }

    private renderRecentMovesPanel(svg: SVGSVGElement): void {
        if (this.currentMode !== 'narrative') return;
        if (this.plugin.settings.showRecentMovesOverlay === false) return;

        const entries = getActiveRecentStructuralMoves(this.plugin.settings).slice(0, 10);
        if (entries.length === 0) return;

        const xhtmlNs = 'http://www.w3.org/1999/xhtml';
        const svgNs = 'http://www.w3.org/2000/svg';
        const viewBoxMin = -(SVG_SIZE / 2);
        const panelX = viewBoxMin;
        const panelY = viewBoxMin + 24;
        const panelWidth = 520;
        const rowHeight = 52;
        const panelHeight = 28 + (entries.length * rowHeight);

        const foreignObject = document.createElementNS(svgNs, 'foreignObject');
        foreignObject.setAttribute('x', String(panelX));
        foreignObject.setAttribute('y', String(panelY));
        foreignObject.setAttribute('width', String(panelWidth));
        foreignObject.setAttribute('height', String(panelHeight));
        foreignObject.setAttribute('class', 'rt-recent-moves-fo');
        foreignObject.style.pointerEvents = 'none';

        const panel = document.createElementNS(xhtmlNs, 'section');
        panel.className = 'rt-recent-moves';
        panel.style.setProperty('--rt-recent-moves-fade-center-x', `${-panelX}px`);
        panel.style.setProperty('--rt-recent-moves-fade-center-y', `${-panelY}px`);
        panel.style.setProperty('--rt-recent-moves-fade-radius', `${MONTH_LABEL_RADIUS}px`);
        panel.style.setProperty('--rt-recent-moves-fade-width', '110px');

        const header = document.createElementNS(xhtmlNs, 'div');
        header.className = 'rt-recent-moves__header';
        header.textContent = 'Recent moves';
        panel.appendChild(header);

        const list = document.createElementNS(xhtmlNs, 'div');
        list.className = 'rt-recent-moves__list';
        panel.appendChild(list);

        entries.forEach((entry) => {
            list.appendChild(this.buildRecentMoveRow(entry));
        });

        foreignObject.appendChild(panel);
        svg.appendChild(foreignObject);
    }

    private renderGossamerRunsPanel(svg: SVGSVGElement): void {
        if (this.currentMode !== 'gossamer') return;

        const runs = this.plugin.gossamerRunInventory || [];
        const visibleRuns = this.plugin.gossamerVisibleRunInventory || [];
        const activeSignal: GossamerSignalType = this.plugin.gossamerSelectedSignal ?? 'momentum';

        const xhtmlNs = 'http://www.w3.org/1999/xhtml';
        const svgNs = 'http://www.w3.org/2000/svg';
        const viewBoxMin = -(SVG_SIZE / 2);
        const panelX = viewBoxMin;
        const panelY = viewBoxMin + 24;
        const panelWidth = 520;
        const displayedRuns = runs.slice().reverse().slice(0, 30);
        const dividerHeight = displayedRuns.length > 1 ? 9 : 0;
        const listHeight = 8 + (displayedRuns.length * 30) + dividerHeight;
        // Header row remains ~44px; even with zero runs we still show the signal selector + pill.
        const panelHeight = 44 + (runs.length === 0 ? 0 : listHeight);

        const foreignObject = document.createElementNS(svgNs, 'foreignObject');
        foreignObject.setAttribute('x', String(panelX));
        foreignObject.setAttribute('y', String(panelY));
        foreignObject.setAttribute('width', String(panelWidth));
        foreignObject.setAttribute('height', String(panelHeight));
        foreignObject.setAttribute('class', 'rt-gossamer-runs-fo');
        foreignObject.style.pointerEvents = 'none';

        const panel = document.createElementNS(xhtmlNs, 'section');
        panel.className = 'rt-gossamer-runs';
        panel.style.setProperty('--rt-gossamer-runs-fade-center-x', `${-panelX}px`);
        panel.style.setProperty('--rt-gossamer-runs-fade-center-y', `${-panelY}px`);
        panel.style.setProperty('--rt-gossamer-runs-fade-radius', `${MONTH_LABEL_RADIUS}px`);
        panel.style.setProperty('--rt-gossamer-runs-fade-width', '110px');

        const controlsRow = document.createElementNS(xhtmlNs, 'div');
        controlsRow.className = 'rt-gossamer-runs__controls';

        // Pill: two states only — "LATEST" (latest only) or "{n} PLOTS" (everything else).
        const button = document.createElementNS(xhtmlNs, 'div') as HTMLDivElement;
        button.className = 'rt-gossamer-runs__button';
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');
        button.setAttribute('data-state', this.plugin.gossamerLatestOnly ? 'latest' : 'all');
        applyTooltip(
            button as unknown as HTMLElement,
            this.plugin.gossamerLatestOnly ? 'Click to show all plots' : 'Click to show latest only',
            'bottom'
        );
        const buttonLabel = document.createElementNS(xhtmlNs, 'span');
        if (runs.length === 0) {
            buttonLabel.textContent = '0 PLOTS';
        } else if (this.plugin.gossamerLatestOnly) {
            buttonLabel.textContent = 'LATEST';
        } else {
            buttonLabel.textContent = `${runs.length} PLOTS`;
        }
        button.appendChild(buttonLabel);
        controlsRow.appendChild(button);

        // Signal selector — 4 lucide icons, one per signal.
        const signalSelector = document.createElementNS(xhtmlNs, 'div') as HTMLDivElement;
        signalSelector.className = 'rt-gossamer-runs__signals';
        signalSelector.setAttribute('role', 'tablist');
        const signalButtons: Array<{ el: HTMLDivElement; signal: GossamerSignalType }> = [];
        GOSSAMER_SIGNAL_TYPES.forEach((signalId) => {
            const meta = GOSSAMER_SIGNAL_METADATA[signalId];
            const btn = document.createElementNS(xhtmlNs, 'div') as HTMLDivElement;
            btn.className = 'rt-gossamer-runs__signal';
            btn.setAttribute('role', 'tab');
            btn.setAttribute('tabindex', '0');
            btn.setAttribute('aria-selected', signalId === activeSignal ? 'true' : 'false');
            btn.setAttribute('data-signal', signalId);
            if (signalId === activeSignal) btn.classList.add('is-active');
            if (meta.inlineIconPath) {
                // Custom Lucide override. Intentionally DOES NOT carry the
                // `svg-icon` or `lucide-<name>` classes — those opt into
                // Obsidian's global icon styling (and potential re-renders).
                // Our own class alone is enough for our CSS to size it.
                const svgNs2 = 'http://www.w3.org/2000/svg';
                const iconSvg = document.createElementNS(svgNs2, 'svg');
                iconSvg.setAttribute('viewBox', '0 0 24 24');
                iconSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                iconSvg.setAttribute('class', 'rt-gossamer-runs__signal-icon');
                iconSvg.setAttribute('width', '28');
                iconSvg.setAttribute('height', '28');
                iconSvg.setAttribute('fill', 'none');
                iconSvg.setAttribute('stroke', 'currentColor');
                iconSvg.setAttribute('stroke-width', '2');
                iconSvg.setAttribute('stroke-linecap', 'round');
                iconSvg.setAttribute('stroke-linejoin', 'round');
                const path = document.createElementNS(svgNs2, 'path');
                path.setAttribute('d', meta.inlineIconPath);
                iconSvg.appendChild(path);
                btn.appendChild(iconSvg);
            } else {
                setIcon(btn as unknown as HTMLElement, meta.icon);
            }
            // Narrower balance width than default so the tooltip's native CSS wrap
            // can't re-break our last line into a widow (e.g. "count." alone).
            applyTooltip(btn as unknown as HTMLElement, meta.tooltip, 'bottom', 300, { custom: true });
            signalSelector.appendChild(btn);
            signalButtons.push({ el: btn, signal: signalId });
        });
        controlsRow.appendChild(signalSelector);

        panel.appendChild(controlsRow);

        if (runs.length > 0) {
            const list = document.createElementNS(xhtmlNs, 'div');
            list.className = 'rt-gossamer-runs__list rt-gossamer-runs__list--inline';
            displayedRuns.forEach((record, idx) => {
                list.appendChild(this.buildGossamerRunToggleRow(record));
                if (idx === 0 && displayedRuns.length > 1 && record.isLatest) {
                    const divider = document.createElementNS(xhtmlNs, 'div');
                    divider.className = 'rt-gossamer-runs__divider';
                    list.appendChild(divider);
                }
            });
            panel.appendChild(list);
        } else {
            const empty = document.createElementNS(xhtmlNs, 'div') as HTMLDivElement;
            empty.className = 'rt-gossamer-runs__empty';
            empty.textContent = `No ${GOSSAMER_SIGNAL_METADATA[activeSignal].label.toLowerCase()} runs yet.`;
            panel.appendChild(empty);
        }

        const schedulePanelRefresh = () => {
            window.setTimeout(() => {
                this.lastSnapshot = null;
                this.refreshTimeline();
            }, 0);
        };
        const stopRunsEvent = (event: Event) => {
            event.stopPropagation();
        };

        this.registerDomEvent(panel, 'click', stopRunsEvent);
        this.registerDomEvent(panel, 'mousedown', stopRunsEvent);
        this.registerDomEvent(panel, 'mouseup', stopRunsEvent);
        this.registerDomEvent(panel, 'pointerdown', stopRunsEvent);
        this.registerDomEvent(panel, 'pointerup', stopRunsEvent);

        // Pill click: binary toggle — latest-only vs show-all.
        const togglePillMode = (event: Event) => {
            event.stopPropagation();
            if (runs.length === 0) return;
            this.plugin.gossamerLatestOnly = !this.plugin.gossamerLatestOnly;
            this.plugin.gossamerVisibleRunIds = [];
            void this.plugin.saveGossamerRunFilterState();
            schedulePanelRefresh();
        };
        this.registerDomEvent(button, 'click', togglePillMode);
        this.registerDomEvent(button, 'keydown', (event: KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                togglePillMode(event);
            }
        });

        // Signal selector click: switch the plotted signal.
        signalButtons.forEach(({ el, signal }) => {
            this.registerDomEvent(el, 'click', (event) => {
                event.stopPropagation();
                if (this.plugin.gossamerSelectedSignal === signal) return;
                this.plugin.gossamerSelectedSignal = signal;
                // Switching signals resets run-level filters (IDs are signal-scoped).
                this.plugin.gossamerLatestOnly = false;
                this.plugin.gossamerVisibleRunIds = [];
                void this.plugin.saveGossamerRunFilterState();
                schedulePanelRefresh();
            });
            this.registerDomEvent(el, 'mousedown', stopRunsEvent);
            this.registerDomEvent(el, 'pointerdown', stopRunsEvent);
        });

        foreignObject.appendChild(panel);
        svg.insertBefore(foreignObject, svg.firstChild);
    }

    private buildGossamerRunToggleRow(record: GossamerRunRecord): HTMLElement {
        const xhtmlNs = 'http://www.w3.org/1999/xhtml';
        const row = document.createElementNS(xhtmlNs, 'label');
        row.className = 'rt-gossamer-runs__checkbox-row';

        const checkbox = document.createElementNS(xhtmlNs, 'input') as HTMLInputElement;
        checkbox.type = 'checkbox';
        const selectedIds = this.plugin.gossamerLatestOnly
            ? this.plugin.gossamerRunInventory.filter((run) => run.isLatest).map((run) => run.id)
            : (this.plugin.gossamerVisibleRunIds.length > 0
                ? this.plugin.gossamerVisibleRunIds
                : this.plugin.gossamerRunInventory.map((run) => run.id));
        checkbox.checked = selectedIds.includes(record.id);
        row.appendChild(checkbox);

        const text = document.createElementNS(xhtmlNs, 'span');
        text.textContent = record.label;
        row.appendChild(text);

        const schedulePanelRefresh = () => {
            window.setTimeout(() => {
                this.lastSnapshot = null;
                this.refreshTimeline();
            }, 0);
        };
        const stopRunsEvent = (event: Event) => {
            event.stopPropagation();
        };

        this.registerDomEvent(row, 'click', stopRunsEvent);
        this.registerDomEvent(row, 'mousedown', stopRunsEvent);
        this.registerDomEvent(row, 'mouseup', stopRunsEvent);
        this.registerDomEvent(row, 'pointerdown', stopRunsEvent);
        this.registerDomEvent(row, 'pointerup', stopRunsEvent);

        this.registerDomEvent(checkbox, 'change', (event) => {
            event.stopPropagation();
            const allIds = this.plugin.gossamerRunInventory.map((run) => run.id);
            const latestIds = this.plugin.gossamerRunInventory.filter((run) => run.isLatest).map((run) => run.id);
            const nextSelected = this.plugin.gossamerLatestOnly
                ? [...latestIds]
                : (this.plugin.gossamerVisibleRunIds.length > 0
                    ? [...this.plugin.gossamerVisibleRunIds]
                    : [...allIds]);

            if (checkbox.checked) {
                if (!nextSelected.includes(record.id)) nextSelected.push(record.id);
            } else {
                const filtered = nextSelected.filter((id) => id !== record.id);
                if (filtered.length === 0) {
                    checkbox.checked = true;
                    return;
                }
                nextSelected.splice(0, nextSelected.length, ...filtered);
            }

            this.plugin.gossamerLatestOnly = false;
            this.plugin.gossamerVisibleRunIds = nextSelected;
            void this.plugin.saveGossamerRunFilterState();
            schedulePanelRefresh();
        });
        this.registerDomEvent(checkbox, 'click', stopRunsEvent);
        this.registerDomEvent(checkbox, 'mousedown', stopRunsEvent);
        this.registerDomEvent(checkbox, 'mouseup', stopRunsEvent);
        this.registerDomEvent(checkbox, 'pointerdown', stopRunsEvent);
        this.registerDomEvent(checkbox, 'pointerup', stopRunsEvent);

        return row;
    }

    private buildRecentMoveRow(entry: StructuralMoveHistoryEntry): HTMLElement {
        const xhtmlNs = 'http://www.w3.org/1999/xhtml';
        const row = document.createElementNS(xhtmlNs, 'div');
        row.className = 'rt-recent-moves__item';

        const header = document.createElementNS(xhtmlNs, 'div');
        header.className = 'rt-recent-moves__header-row';

        const icon = document.createElementNS(xhtmlNs, 'div');
        icon.className = 'rt-recent-moves__icon';
        setIcon(icon as unknown as HTMLElement, 'arrow-right-to-line');
        header.appendChild(icon);

        const summary = document.createElementNS(xhtmlNs, 'div');
        summary.className = 'rt-recent-moves__summary';
        const [sourceLabel, targetLabel] = entry.summary.split('|').map((part) => part.trim());
        if (sourceLabel && targetLabel) {
            const source = document.createElementNS(xhtmlNs, 'span');
            source.textContent = sourceLabel;
            summary.appendChild(source);

            const cornerIcon = document.createElementNS(xhtmlNs, 'span');
            cornerIcon.className = 'rt-recent-moves__inline-icon';
            setIcon(cornerIcon as unknown as HTMLElement, 'corner-up-right');
            summary.appendChild(cornerIcon);

            const target = document.createElementNS(xhtmlNs, 'span');
            target.textContent = targetLabel;
            summary.appendChild(target);
        } else {
            summary.textContent = entry.summary;
        }
        header.appendChild(summary);
        row.appendChild(header);

        const meta = document.createElementNS(xhtmlNs, 'div');
        meta.className = 'rt-recent-moves__meta';
        const parts = [this.formatRecentMoveAge(entry.timestamp)];
        if (entry.sourceContext && entry.destinationContext) {
            parts.push(`${entry.sourceContext} -> ${entry.destinationContext}`);
        } else if (entry.destinationContext) {
            parts.push(entry.destinationContext);
        } else if (entry.sourceContext) {
            parts.push(entry.sourceContext);
        }
        meta.textContent = parts.join(' • ');
        row.appendChild(meta);

        return row;
    }

    private formatRecentMoveAge(timestamp: string): string {
        const parsed = Date.parse(timestamp);
        if (!Number.isFinite(parsed)) return 'Recently';

        const elapsedMs = Date.now() - parsed;
        if (elapsedMs < 60_000) return 'Just now';
        if (elapsedMs < 3_600_000) return `${Math.max(1, Math.floor(elapsedMs / 60_000))}m ago`;
        if (elapsedMs < 86_400_000) return `${Math.max(1, Math.floor(elapsedMs / 3_600_000))}h ago`;

        try {
            return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(parsed));
        } catch {
            return 'Recently';
        }
    }
    
    // New helper removed; interactions moved to modes/AllScenesMode
    
    // Helper method to highlight files in the navigator and tab bar
    private highlightFileInExplorer(filePath: string, isHighlighting: boolean): void {
        if (!filePath) return;
        
        try {
            // Get the file object
            const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
            
            if (file instanceof TFile) {
                // For highlighting, we'll use Obsidian's file explorer API to reveal the file
                if (isHighlighting) {
                    // Use the file explorer view directly
                    const fileExplorer = this.plugin.app.workspace.getLeavesOfType('file-explorer')[0];
                    if (fileExplorer && fileExplorer.view) {
                        // Cast to any to access the internal reveal method
                        interface ExplorerView { revealInFolder(file: TFile): void }
                        const explorerView = fileExplorer.view as unknown as ExplorerView;
                        if (explorerView.revealInFolder) {
                            // SAFE: Using Obsidian's API
                            explorerView.revealInFolder(file);
                        }
                    }
                    
                    // No additional focus behavior required
                } else {
                    // When unhighlighting, we don't need to do anything special.
                    // The hover effect disappears naturally when mouse leaves.
                }
            }
        } catch (error) {
            // Silently handle file highlighting errors
        }
    }
    
    // Property to track tab highlight timeout
    private _tabHighlightTimeout: number | null = null;
    
    /**
     * Remove all Gossamer-specific event listeners and restore normal mode
     */
    private removeGossamerEventListeners(svg: SVGSVGElement): void {
        this.gossamerEventHandlers.forEach((handler, key) => {
            const [eventType] = key.split('::');
            // All handlers recorded here were attached to the SVG root via delegation
            svg.removeEventListener(eventType, handler as EventListenerOrEventListenerObject);
        });
        this.gossamerEventHandlers.clear();
    }
    
    /**
     * Setup Gossamer-specific event listeners
     * These are simpler and don't have conditionals - just Plot slice and dot interactions
     */
    private setupGossamerEventListeners(svg: SVGSVGElement): void {
        // Clear any existing Gossamer handlers first
        this.removeGossamerEventListeners(svg);
        
        // Use ModeInteractionController system
        if (this.interactionController) {
            const { getModeDefinition } = require('../modes/ModeRegistry');
            const { TimelineMode } = require('../modes/ModeDefinition');
            const modeDef = getModeDefinition(TimelineMode.GOSSAMER);
            this.interactionController.setupMode(modeDef, svg);
        }
    }
}
