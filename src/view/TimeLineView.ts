/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
// --- Imports and constants added for standalone module ---
import { ItemView, WorkspaceLeaf, MarkdownView, TFile, TAbstractFile, Notice, normalizePath, setIcon } from 'obsidian';
import RadialTimelinePlugin from '../main';
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
import { MONTH_LABEL_RADIUS, SVG_SIZE } from '../renderer/layout/LayoutConstants';
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
import { DEFAULT_BOOK_TITLE, getActiveBookTitle } from '../utils/books';
import { getActiveRecentStructuralMoves } from '../utils/recentStructuralMoves';
import type { StructuralMoveHistoryEntry } from '../types/settings';
import type { GossamerRunRecord } from '../utils/gossamer';

// Duplicate of constants defined in main for now. We can consolidate later.
export const TIMELINE_VIEW_TYPE = "radial-timeline";
export const TIMELINE_VIEW_DISPLAY_TEXT = "Radial timeline";
const TIMELINE_REFRESH_DELAY_MS = 5000;

// CONSTANTS: Scene expansion constants
const HOVER_EXPAND_FACTOR = 1.05; // expansion multiplier when text doesn't fit

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
    
    // Store rotation state to persist across timeline refreshes
    private rotationState: boolean = false;
    
    // Mode system
    private _currentMode: string = 'narrative'; // TimelineMode enum value
    private modeManager?: ModeManager; // Centralized mode management
    private interactionController?: ModeInteractionController; // Interaction handler management
    
    // Store event handler references for clean removal
    private normalEventHandlers: Map<string, EventListener> = new Map();
    private gossamerEventHandlers: Map<string, EventListener> = new Map();
    private gossamerRunsPopoverOpen = false;

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
        const title = getActiveBookTitle(this.plugin.settings, DEFAULT_BOOK_TITLE);
        return `Radial Timeline: ${title}`;
    }
    
    getIcon(): string {
        return "shell";
    }

    private ensureBookSwitcher(): void {
        const headerEl = this.containerEl.querySelector('.view-header') as HTMLElement | null;
        if (!headerEl) return;

        if (!this.bookSwitcherEl) {
            const actionsEl = headerEl.querySelector('.view-actions');
            const wrapper = document.createElement('div');
            wrapper.className = 'rt-book-switcher';

            const select = document.createElement('select');
            select.className = 'rt-book-switcher__select';
            select.addEventListener('change', () => {
                const nextId = select.value;
                void this.plugin.setActiveBookId(nextId);
            });

            const manageBtn = document.createElement('button');
            manageBtn.className = 'rt-book-switcher__manage clickable-icon';
            manageBtn.type = 'button';
            manageBtn.setAttribute('aria-label', 'Manage books');
            setIcon(manageBtn, 'settings');
            manageBtn.addEventListener('click', () => {
                if (this.plugin.settingsTab) {
                    this.plugin.settingsTab.setActiveTab('core');
                }
                const setting = (this.app as unknown as { setting?: { open: () => void; openTabById: (id: string) => void } }).setting; // SAFE: any type used for Obsidian internal API
                if (setting) {
                    setting.open();
                    setting.openTabById('radial-timeline');
                }
            });

            wrapper.appendChild(select);
            wrapper.appendChild(manageBtn);

            if (actionsEl && actionsEl.parentElement) {
                actionsEl.parentElement.insertBefore(wrapper, actionsEl);
            } else {
                headerEl.appendChild(wrapper);
            }

            this.bookSwitcherEl = wrapper;
            this.bookSwitcherSelect = select;
            this.bookSwitcherManageBtn = manageBtn;
        }

        this.updateBookSwitcherOptions();
    }

    private updateBookSwitcherOptions(): void {
        if (!this.bookSwitcherSelect) return;
        const select = this.bookSwitcherSelect;
        while (select.firstChild) {
            select.removeChild(select.firstChild);
        }

        const books = this.plugin.settings.books || [];
        books.forEach(book => {
            const option = document.createElement('option');
            option.value = book.id;
            option.textContent = book.title?.trim() || DEFAULT_BOOK_TITLE;
            select.appendChild(option);
        });

        if (books.length > 0) {
            select.value = this.plugin.settings.activeBookId || books[0].id;
        }

        select.toggleAttribute('disabled', books.length <= 1);
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
        const numActs = parseInt(svg.getAttribute('data-num-acts') || '3', 10);
        const angle = numActs > 0 ? 360 / numActs : 120; // Dynamic counter-rotation based on act count
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

        const perfStart = performance.now();
        const container = this.containerEl.children[1] as HTMLElement;
        
        // First update the tracking of open files
        this.updateOpenFilesTracking();
        
        // Get the scene data using the plugin's method
        this.plugin.getSceneData()
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
                    
                    // Handle time changes (year progress ring) using selective update
                    if (changeResult.changeTypes.has(ChangeType.TIME)) {
                        // this.rendererService.updateProgressAndTicks(this);
                        updated = true;
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
                    text: "Loading timeline data..."
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

        // Frontmatter values to track changes only to YAML frontmatter with debounce every 5 seconds.
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                // Skip if not a markdown file
                if (!(file instanceof TFile) || file.extension !== 'md') return;
                
                // Get the current frontmatter
                const cache = this.app.metadataCache.getFileCache(file);
                if (!cache || !cache.frontmatter) return;
                
                // Check if this is a scene or beat file (Class: Scene or Class: Beat/Plot)
                const fm = cache.frontmatter;
                const isScene = (fm.Class === 'Scene') || (fm.class === 'Scene');
                const isBeatOrPlot = (fm.Class === 'Plot') || (fm.class === 'Plot') || (fm.Class === 'Beat') || (fm.class === 'Beat');
                
                if (!isScene && !isBeatOrPlot) return;
                
                // Beat note frontmatter can affect timeline hover in multiple modes.
                // Always refresh on Scene or Beat/Plot frontmatter change so note values
                // remain the source of truth over settings defaults.
                
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
                text: "Error rendering timeline. Check console for details."
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
        if (runs.length === 0 || visibleRuns.length === 0) return;

        const xhtmlNs = 'http://www.w3.org/1999/xhtml';
        const svgNs = 'http://www.w3.org/2000/svg';
        const panelX = 470;
        const panelY = -756;
        const panelWidth = 290;
        const legendHeight = 10 + (Math.min(visibleRuns.length, 4) * 20);
        const popoverHeight = this.gossamerRunsPopoverOpen
            ? (this.plugin.gossamerLatestOnly ? 64 : Math.min(260, 92 + (runs.length * 30)))
            : 0;
        const panelHeight = 34 + legendHeight + (this.gossamerRunsPopoverOpen ? popoverHeight + 8 : 0);

        const foreignObject = document.createElementNS(svgNs, 'foreignObject');
        foreignObject.setAttribute('x', String(panelX));
        foreignObject.setAttribute('y', String(panelY));
        foreignObject.setAttribute('width', String(panelWidth));
        foreignObject.setAttribute('height', String(panelHeight));
        foreignObject.setAttribute('class', 'rt-gossamer-runs-fo');

        const panel = document.createElementNS(xhtmlNs, 'section');
        panel.className = 'rt-gossamer-runs';

        const controlsRow = document.createElementNS(xhtmlNs, 'div');
        controlsRow.className = 'rt-gossamer-runs__controls';

        const button = document.createElementNS(xhtmlNs, 'button') as HTMLButtonElement;
        button.type = 'button';
        button.className = 'rt-gossamer-runs__button';
        const buttonLabel = document.createElementNS(xhtmlNs, 'span');
        buttonLabel.textContent = 'Runs';
        button.appendChild(buttonLabel);
        const buttonIcon = document.createElementNS(xhtmlNs, 'span');
        buttonIcon.className = 'rt-gossamer-runs__button-icon';
        setIcon(buttonIcon as unknown as HTMLElement, this.gossamerRunsPopoverOpen ? 'chevron-up' : 'chevron-down');
        button.appendChild(buttonIcon);
        controlsRow.appendChild(button);

        const summary = document.createElementNS(xhtmlNs, 'div');
        summary.className = 'rt-gossamer-runs__summary';
        summary.textContent = `${visibleRuns.length} run${visibleRuns.length === 1 ? '' : 's'} visible`;
        controlsRow.appendChild(summary);
        panel.appendChild(controlsRow);

        const legend = document.createElementNS(xhtmlNs, 'div');
        legend.className = 'rt-gossamer-runs__legend';
        visibleRuns.slice().reverse().forEach((record, index) => {
            legend.appendChild(this.buildGossamerLegendRow(record, index === 0));
        });
        panel.appendChild(legend);

        if (this.gossamerRunsPopoverOpen) {
            const popover = document.createElementNS(xhtmlNs, 'div');
            popover.className = 'rt-gossamer-runs__popover';

            const latestRow = document.createElementNS(xhtmlNs, 'label');
            latestRow.className = 'rt-gossamer-runs__checkbox-row';
            const latestCheckbox = document.createElementNS(xhtmlNs, 'input') as HTMLInputElement;
            latestCheckbox.type = 'checkbox';
            latestCheckbox.checked = this.plugin.gossamerLatestOnly;
            latestRow.appendChild(latestCheckbox);
            const latestText = document.createElementNS(xhtmlNs, 'span');
            latestText.textContent = 'Latest only';
            latestRow.appendChild(latestText);
            popover.appendChild(latestRow);

            if (!this.plugin.gossamerLatestOnly) {
                const divider = document.createElementNS(xhtmlNs, 'div');
                divider.className = 'rt-gossamer-runs__divider';
                popover.appendChild(divider);

                const listHeader = document.createElementNS(xhtmlNs, 'div');
                listHeader.className = 'rt-gossamer-runs__section-title';
                listHeader.textContent = 'Runs';
                popover.appendChild(listHeader);

                const list = document.createElementNS(xhtmlNs, 'div');
                list.className = 'rt-gossamer-runs__list';
                runs.slice().reverse().forEach((record) => {
                    list.appendChild(this.buildGossamerRunToggleRow(record));
                });
                popover.appendChild(list);
            }

            panel.appendChild(popover);

            this.registerDomEvent(latestCheckbox, 'change', () => {
                this.plugin.gossamerLatestOnly = latestCheckbox.checked;
                if (latestCheckbox.checked) {
                    this.plugin.gossamerVisibleRunIds = [];
                }
                this.lastSnapshot = null;
                this.refreshTimeline();
            });
        }

        foreignObject.appendChild(panel);
        svg.appendChild(foreignObject);

        this.registerDomEvent(button, 'click', () => {
            this.gossamerRunsPopoverOpen = !this.gossamerRunsPopoverOpen;
            this.lastSnapshot = null;
            this.refreshTimeline();
        });
    }

    private buildGossamerLegendRow(record: GossamerRunRecord, isPrimary: boolean): HTMLElement {
        const xhtmlNs = 'http://www.w3.org/1999/xhtml';
        const row = document.createElementNS(xhtmlNs, 'div');
        row.className = 'rt-gossamer-runs__legend-row';

        const swatch = document.createElementNS(xhtmlNs, 'span');
        swatch.className = 'rt-gossamer-runs__swatch';
        if (!isPrimary) swatch.classList.add('is-secondary');
        row.appendChild(swatch);

        const label = document.createElementNS(xhtmlNs, 'span');
        label.className = 'rt-gossamer-runs__legend-label';
        label.textContent = record.label;
        row.appendChild(label);

        if (record.isLatest) {
            const badge = document.createElementNS(xhtmlNs, 'span');
            badge.className = 'rt-gossamer-runs__latest';
            badge.textContent = 'Latest';
            row.appendChild(badge);
        }

        return row;
    }

    private buildGossamerRunToggleRow(record: GossamerRunRecord): HTMLElement {
        const xhtmlNs = 'http://www.w3.org/1999/xhtml';
        const row = document.createElementNS(xhtmlNs, 'label');
        row.className = 'rt-gossamer-runs__checkbox-row';

        const checkbox = document.createElementNS(xhtmlNs, 'input') as HTMLInputElement;
        checkbox.type = 'checkbox';
        const selectedIds = this.plugin.gossamerVisibleRunIds.length > 0
            ? this.plugin.gossamerVisibleRunIds
            : this.plugin.gossamerRunInventory.map((run) => run.id);
        checkbox.checked = selectedIds.includes(record.id);
        row.appendChild(checkbox);

        const text = document.createElementNS(xhtmlNs, 'span');
        text.textContent = record.label;
        row.appendChild(text);

        this.registerDomEvent(checkbox, 'change', () => {
            const allIds = this.plugin.gossamerRunInventory.map((run) => run.id);
            const nextSelected = this.plugin.gossamerVisibleRunIds.length > 0
                ? [...this.plugin.gossamerVisibleRunIds]
                : [...allIds];

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
            this.lastSnapshot = null;
            this.refreshTimeline();
        });

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
        summary.textContent = entry.summary;
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
