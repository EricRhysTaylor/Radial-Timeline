/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
// --- Imports and constants added for standalone module ---
import { ItemView, WorkspaceLeaf, MarkdownView, TFile, TAbstractFile, Notice, normalizePath } from 'obsidian';
import RadialTimelinePlugin from '../main';
import { escapeRegExp } from '../utils/regex';
import type { Scene } from '../main';
import { SceneNumberInfo } from '../utils/constants';
import ZeroDraftModal from '../modals/ZeroDraftModal';
import { parseSceneTitleComponents, renderSceneTitleComponents } from '../utils/text';
import { openOrRevealFile } from '../utils/fileUtils';
import { setupRotationController, setupSearchControls as setupSearchControlsExt, addHighlightRectangles as addHighlightRectanglesExt, setupModeToggleController } from './interactions';
import { isShiftModeActive } from './interactions/ChronologueShiftController';
import { RendererService } from '../services/RendererService';
import { ModeManager, createModeManager } from '../modes/ModeManager';
import { ModeInteractionController, createInteractionController } from '../modes/ModeInteractionController';
import { 
    createSnapshot, 
    detectChanges, 
    describeChanges, 
    type TimelineSnapshot, 
    ChangeType 
} from '../renderer/ChangeDetection';

// Duplicate of constants defined in main for now. We can consolidate later.
export const TIMELINE_VIEW_TYPE = "radial-timeline";
export const TIMELINE_VIEW_DISPLAY_TEXT = "Radial timeline";

// CONSTANTS: Scene expansion constants
const HOVER_EXPAND_FACTOR = 1.1; // expansion multiplier when text doesn't fit

// SceneNumberInfo now imported from constants

// Timeline View implementation
export class RadialTimelineView extends ItemView {
    static readonly viewType = TIMELINE_VIEW_TYPE;
    plugin: RadialTimelinePlugin;
    private rendererService?: RendererService;
    
    // Frontmatter values to track to reduce unnecessary SVG View refreshes
    private lastFrontmatterValues: Record<string, unknown> = {};
    private timelineRefreshTimeout: number | null = null;
    
    // Change detection snapshot for optimizing renders
    private lastSnapshot: TimelineSnapshot | null = null;
        
    // Scene data (scenes)
    sceneData: Scene[] = [];
    
    // Set of open scene paths (for tracking open files)
    openScenePaths: Set<string> = new Set<string>();
    
    // Store rotation state to persist across timeline refreshes
    private rotationState: boolean = false;
    
    // Cache book title for display in tab
    private cachedBookTitle: string | undefined = undefined;
    
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
        this.rendererService = (plugin as any).rendererService as RendererService;
        
        // Initialize mode management
        this._currentMode = plugin.settings.currentMode || 'narrative';
        try {
            this.modeManager = createModeManager(plugin, this);
            this.interactionController = createInteractionController(this);
        } catch (e) {
            // Mode management initialization failed
        }
    }
    
    private log<T>(message: string, data?: T) {
        // Forward to plugin logger; it is dev-guarded
        this.plugin.log(message, data);
    }
    
    getViewType(): string {
        return TIMELINE_VIEW_TYPE;
    }
    
    getDisplayText(): string {
        // Use cached book title if available
        if (this.cachedBookTitle && this.cachedBookTitle.trim()) {
            return `Radial Timeline: ${this.cachedBookTitle.trim()}`;
        }
        
        return TIMELINE_VIEW_DISPLAY_TEXT;
    }
    
    getIcon(): string {
        return "shell";
    }

    // --- Helpers for number-square orientation/position (shared across modes) ---
    public applyRotationToNumberSquares(svg: SVGSVGElement, rotated: boolean): void {
        const angle = 120; // degrees to counter-rotate when the whole timeline rotates -120
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
        
        // Get all open leaves
        const leaves = this.app.workspace.getLeavesOfType('markdown');
        const openFilesList: string[] = []; // Add proper type
        
        // Collect the paths of all open markdown files
        leaves.forEach(leaf => {
            // Check if the view is a MarkdownView with a file
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file) {
                this.openScenePaths.add(view.file.path);
                openFilesList.push(view.file.path);
            }
        });
        
        // Also check if there's an active file not in a leaf
        const activeFile = this.app.workspace.getActiveFile();
        if (activeFile && !openFilesList.includes(activeFile.path)) {
            this.openScenePaths.add(activeFile.path);
            openFilesList.push(activeFile.path);
        }
        
        // Get all open tabs from the workspace layout
        try {
            // @ts-ignore - Use the workspace layout accessor which may not be fully typed
            const layout = this.app.workspace.getLayout();
            if (layout && (layout as Record<string, unknown>).leaves) {
                const leafIds = Object.keys((layout as Record<string, unknown>).leaves as Record<string, unknown>);
                
                // Try to find any additional file paths from the layout
                leafIds.forEach(id => {
                    // @ts-ignore - Access the layout structure which may not be fully typed
                    const leafs = (layout as Record<string, any>).leaves as Record<string, any>;
                    const leafData = leafs[id];
                    if (leafData && leafData.type === 'markdown' && leafData.state && leafData.state.file) {
                        const filePath = leafData.state.file;
                        if (!openFilesList.includes(filePath)) {
                            this.openScenePaths.add(filePath);
                            openFilesList.push(filePath);
                        }
                    }
                });
            }
        } catch (e) {
            console.error("Error accessing workspace layout:", e);
        }
        
        
        // Check if the open files have changed
        let hasChanged = false;
        
        // Different size means something changed
        if (previousOpenFiles.size !== this.openScenePaths.size) {
            hasChanged = true;
        } else {
            // Check if any files were added or removed
            const addedFiles = [];
            const removedFiles = [];
            
            for (const path of previousOpenFiles) {
                if (!this.openScenePaths.has(path)) {
                    removedFiles.push(path);
                    hasChanged = true;
                }
            }
            
                for (const path of this.openScenePaths) {
                    if (!previousOpenFiles.has(path)) {
                    addedFiles.push(path);
                        hasChanged = true;
                }
            }
            
            if (addedFiles.length > 0) {
                this.log(`New files opened: ${addedFiles.join(', ')}`);
            }
            
            if (removedFiles.length > 0) {
                this.log(`Files no longer open: ${removedFiles.join(', ')}`);
            }
        }
        
        // Update the UI if something changed
        if (hasChanged) {
            const container = this.containerEl.children[1] as HTMLElement;
            // Try selective update first
            const updated = this.rendererService?.updateOpenClasses(container, this.openScenePaths);
            if (!updated) this.refreshTimeline();
        } else {
            this.log('No changes in open files detected');
        }
    }

    refreshTimeline() {
        if (!this.plugin) return;
        
        this.log(`[REFRESH TIMELINE] Called - currentMode: ${this._currentMode}`);

        const perfStart = performance.now();
        const container = this.containerEl.children[1] as HTMLElement;
        
        // First update the tracking of open files
        this.updateOpenFilesTracking();
        
        // Get the scene data using the plugin's method
        this.plugin.getSceneData()
            .then(async (sceneData) => {
                const dataLoadTime = performance.now() - perfStart;

                // If in Gossamer mode, the change might be a score update. We must
                // rebuild the run data here to ensure the renderer gets the latest scores.
                if (this._currentMode === 'gossamer') {
                    const { buildAllGossamerRuns } = await import('../utils/gossamer');
                    const selectedBeatModel = this.plugin.settings.beatSystem?.trim() || undefined;
                    const allRuns = buildAllGossamerRuns(sceneData as any, selectedBeatModel);
        
                    // Update the plugin's stored run data so the renderer can access it
                    (this.plugin as any)._gossamerLastRun = allRuns.current;
                    (this.plugin as any)._gossamerHistoricalRuns = allRuns.historical;
                    (this.plugin as any)._gossamerMinMax = allRuns.minMax;
                    this.log('[Gossamer] Rebuilt gossamer run data on refresh.');
                }
                
                this.sceneData = sceneData;
                // Expose last scene data on plugin for selective services that need it
                this.plugin.lastSceneData = sceneData;
                
                // Cache book title for display (getDisplayText() will use it when called)
                const bookTitle = sceneData.find(scene => scene.Book)?.Book;
                if (bookTitle) {
                    this.cachedBookTitle = bookTitle;
                }
                
                // Create snapshot of current state
                const currentSnapshot = createSnapshot(
                    sceneData,
                    this.plugin.openScenePaths,
                    this.plugin.searchActive,
                    this.plugin.searchResults,
                    this._currentMode,
                    this.plugin.settings,
                    (this.plugin as any)._gossamerLastRun
                );
                
                // Detect changes from last render
                const changeResult = detectChanges(this.lastSnapshot, currentSnapshot);
                
                // Log change detection results
                this.log('[ChangeDetection] ' + describeChanges(changeResult));
                
                // Decide rendering strategy
                if (changeResult.updateStrategy === 'none') {
                    // No changes - skip render entirely
                    this.log('[Render] Skipped - no changes detected');
                    return;
                } else if (changeResult.updateStrategy === 'selective' && this.rendererService) {
                    // Selective update using RendererService
                    this.log('[Render] Using selective update');
                    let updated = false;
                    
                    // Handle open files changes
                    if (changeResult.changeTypes.has(ChangeType.OPEN_FILES)) {
                        updated = this.rendererService.updateOpenClasses(container, this.plugin.openScenePaths) || updated;
                    }
                    
                    // Handle search changes
                    if (changeResult.changeTypes.has(ChangeType.SEARCH)) {
                        updated = this.rendererService.updateSearchHighlights(this) || updated;
                    }
                    
                    // Handle time changes (year progress ring) using selective update
                    if (changeResult.changeTypes.has(ChangeType.TIME)) {
                        updated = this.rendererService.updateProgressAndTicks(this) || updated;
                    }
                    
                    // Handle synopsis text changes
                    if (changeResult.changeTypes.has(ChangeType.SYNOPSIS)) {
                        updated = this.rendererService.updateSynopsisDOM(container, sceneData) || updated;
                    }

                    // Handle gossamer changes
                    if (changeResult.changeTypes.has(ChangeType.GOSSAMER)) {
                        updated = this.rendererService.updateGossamerLayer(this as any) || updated;
                    }
                    
                    if (updated) {
                        // Selective update succeeded
                        this.lastSnapshot = currentSnapshot;
                        const totalTime = performance.now() - perfStart;
                        this.log(`[Render] Selective update completed in ${totalTime.toFixed(2)}ms`);
                        return;
                    }
                    
                    // Selective update failed - fall through to full render
                    this.log('[Render] Selective update failed, falling back to full render');
                }
                
                // Full render
                this.log('[Render] Using full render');
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
                
                const totalTime = performance.now() - perfStart;
                this.log(`[Render] Full render completed in ${totalTime.toFixed(2)}ms (data: ${dataLoadTime.toFixed(2)}ms, render: ${renderTime.toFixed(2)}ms)`);

            })
            .catch(error => {
                const errorEl = container.createEl("div", {
                    cls: "rt-error-message",
                    text: `Error: ${error.message}`
                });
                console.error("Failed to load timeline data", error);
            });
        
        // Setup search controls
        this.setupSearchControls();
        
        // Add highlight rectangles if search is active (selective refresh)
        if (this.plugin.searchActive) {
            if (!this.rendererService?.updateSearchHighlights(this)) {
                window.setTimeout(() => this.addHighlightRectangles(), 100);
            }
        }

    }
    

    
    private setupMouseCoordinateTracking(container: HTMLElement) {
        // Mouse coordinate tracking disabled - no debug mode toggle exists
    }
    
    /**
     * Called whenever the view is shown/revealed (e.g., when switching tabs back to this view)
     * Unlike onOpen which is called only once when the view is created
     */
    onload(): void {
        this.log('========== TIMELINE VIEW LOADED/SHOWN ==========');
        this.log(`Current mode: ${this._currentMode}`);
        this.log(`Settings mode: ${this.plugin.settings.currentMode || 'narrative'}`);
        
        // Check what's in the DOM
        const container = this.containerEl.children[1] as HTMLElement | undefined;
        if (container) {
            const svg = container.querySelector('.radial-timeline-svg');
            if (svg) {
                const dataMode = svg.getAttribute('data-mode');
                const dataGossamer = svg.getAttribute('data-gossamer-mode');
                const gossamerLayer = svg.querySelector('.rt-gossamer-layer');
                const nonSelectedCount = svg.querySelectorAll('.rt-non-selected').length;
                
                this.log(`SVG exists: data-mode="${dataMode}", data-gossamer-mode="${dataGossamer}"`);
                this.log(`Gossamer layer exists: ${!!gossamerLayer}`);
                this.log(`Non-selected elements: ${nonSelectedCount}`);
            } else {
                this.log('No SVG element found in container');
            }
        } else {
            this.log('No container element found');
        }
        
        // Check gossamer data
        const hasGossamerData = !!(this.plugin as any)._gossamerLastRun;
        this.log(`Gossamer data exists on plugin: ${hasGossamerData}`);
        
        this.log('===============================================');
    }
    
    async onOpen(): Promise<void> {
        this.log('Opening timeline view');

        await this.plugin.maybeShowReleaseNotesModal();
        
        // Register event to track file opens
        this.registerEvent(
            this.app.workspace.on('file-open', () => {
                this.log('File opened event');
                this.updateOpenFilesTracking();
            })
        );
        
        // Register event for layout changes (tab opening/closing)
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.log('Layout changed event');
                this.updateOpenFilesTracking();
            })
        );
        
        // Register for active leaf changes which might mean tabs were changed
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                this.log('Active leaf changed event');
                
                // Check if this view is becoming active
                const isThisViewActive = leaf?.view === this;
                
                if (isThisViewActive) {
                    this.log(`Timeline view became active - currentMode: ${this._currentMode}, settings.currentMode: ${this.plugin.settings.currentMode}`);
                }
                
                this.updateOpenFilesTracking();
            })
        );
        
        // Register for quick switching between files
        this.registerEvent(
            this.app.workspace.on('quick-preview', () => {
                this.log('Quick preview event');
                this.updateOpenFilesTracking();
            })
        );
        

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
                
                // Performance optimization: Only refresh if the change is relevant to the current mode
                // Gossamer mode only cares about Beat/Plot notes, other modes care about Scene notes
                const isGossamerMode = this._currentMode === 'gossamer';
                if (isGossamerMode && !isBeatOrPlot) {
                    // In gossamer mode but a scene note changed - ignore it
                    return;
                }
                if (!isGossamerMode && isBeatOrPlot && !isScene) {
                    // Not in gossamer mode and only a beat note changed (no scenes) - ignore it
                    // Note: Some beat notes might also be scenes, so we check both
                    return;
                }
                
                // Check if this is a frontmatter change
                const fileId = file.path;
                const currentFrontmatter = JSON.stringify(cache.frontmatter);
                const previousFrontmatter = this.lastFrontmatterValues[fileId];
                
                // Update our stored value regardless
                this.lastFrontmatterValues[fileId] = currentFrontmatter;
                
                // If values are the same, no need to trigger refresh
                if (previousFrontmatter === currentFrontmatter) return;
                
                // Log only meaningful changes
                this.log('Scene/Plot frontmatter changed for file: ' + file.path);
                
                // Debounce the refresh per settings (default 5s)
                if (this.timelineRefreshTimeout) window.clearTimeout(this.timelineRefreshTimeout);
                this.timelineRefreshTimeout = window.setTimeout(() => {
                    this.refreshTimeline();
                }, Math.max(0, Number(this.plugin.settings.metadataRefreshDebounceMs ?? 10000)));
            })
        );
        
        // Initial check of open files
        this.updateOpenFilesTracking();
        
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
                }
            }
        }
        
        // Initial timeline render
        this.refreshTimeline();
    }
    
    async onClose(): Promise<void> {
        // Clear search state when view closes to ensure fresh state on reopen
        this.plugin.clearSearch();
        
        // Clean up keyboard event listeners
        if ((this as any)._modeToggleCleanup) {
            (this as any)._modeToggleCleanup();
        }
        if ((this as any)._chronologueShiftCleanup) {
            (this as any)._chronologueShiftCleanup();
        }
    }
    
    // Add the missing createSvgElement method
    private createSvgElement(svgContent: string, container: HTMLElement): SVGSVGElement | null {
        // Delegate to the plugin's implementation
        return this.plugin.createSvgElement(svgContent, container);
    }
    
    // Add missing addHighlightRectangles method
    private addHighlightRectangles(): void {
        this.log(`Adding highlight rectangles for search term: "${this.plugin.searchTerm}" with ${this.plugin.searchResults.size} results`);
        addHighlightRectanglesExt(this);
    }
    
    renderTimeline(container: HTMLElement, scenes: Scene[]): void {
        // Clear existing content
        container.empty();
        
        if (!scenes || scenes.length === 0) {
            // --- Build a contextual message describing why no scenes are shown ---
            let sourcePath = (this.plugin.settings.sourcePath || "").trim();
            // Use Obsidian's normalizePath to clean user-defined paths
            if (sourcePath) {
                sourcePath = normalizePath(sourcePath);
            }

            let messageText: string;

            if (sourcePath === "") {
                // No folder configured at all
                messageText = "No source folder has been configured in the Radial timeline plugin settings. Please choose a folder that will hold your scene notes or leave blank to use the root of your vault.";
            } else {
                const folderExists = !!this.plugin.app.vault.getAbstractFileByPath(sourcePath);
                if (folderExists) {
                    // Folder exists, just no scenes inside it
                    messageText = `No scene files were found in "${sourcePath}".`;
                } else {
                    // Folder path set but doesn't exist yet
                    messageText = `The folder "${sourcePath}" does not exist in your vault yet.`;
                }
                messageText += " Would you like to create a template scene note with example YAML frontmatter?";
            }

            container.createEl("div", { text: messageText });
            this.log("No scenes found. Source path:", sourcePath || "<not set>");

            // Add button to create a template scene file
            const demoButton = container.createEl("button", {
                text: "Create template scene note",
                cls: "rt-action-button"
            });

            this.registerDomEvent(demoButton, "click", async () => {
                // Use the same createTemplateScene function as the command palette
                const { createTemplateScene } = await import('../SceneAnalysisCommands');
                await createTemplateScene(this.plugin, this.plugin.app.vault);
                
                // Refresh the timeline after a short delay to allow metadata cache to update
                window.setTimeout(() => {
                    this.refreshTimeline();
                }, 500);
            });

            return;
        }
        
        this.log(`Found ${scenes.length} scenes to render`);
        
        this.sceneData = scenes;

        // Performance optimization: Create DocumentFragment to minimize reflows
        const fragment = document.createDocumentFragment();
        const timelineContainer = document.createElement("div");
        timelineContainer.className = "radial-timeline-container";
        fragment.appendChild(timelineContainer);
        
        try {
            // Generate the SVG content and get the max stage color
            const startTime = performance.now();
            const { svgString, maxStageColor: calculatedMaxStageColor } = this.plugin.createTimelineSVG(scenes);

            // Expose the dominant publish-stage colour to CSS so rules can use var(--rt-max-publish-stage-color)
            if (calculatedMaxStageColor) {
                document.documentElement.style.setProperty('--rt-max-publish-stage-color', calculatedMaxStageColor);
            }
            
            // Render directly into the container
            const svgElement = this.createSvgElement(svgString, timelineContainer);

                if (svgElement) {
                    // Set data-mode attribute for CSS targeting
                    svgElement.setAttribute('data-mode', this.currentMode);
                    
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

                // Adjust story beat labels after render
                const adjustLabels = () => this.plugin.adjustBeatLabelsAfterRender(timelineContainer);
                const rafId1 = requestAnimationFrame(adjustLabels);
                
                // Re-adjust when the timeline view becomes active (workspace active-leaf-change)
                const leafChangeHandler = () => {
                    // Check if this timeline view is now the active leaf
                    if (this.app.workspace.getActiveViewOfType(RadialTimelineView) === this) {
                        // Small delay to ensure layout is settled
                        const timeoutId = window.setTimeout(() => {
                            const rafId2 = requestAnimationFrame(adjustLabels);
                            this.register(() => cancelAnimationFrame(rafId2));
                        }, 50);
                        this.register(() => window.clearTimeout(timeoutId));
                    }
                };
                this.register(() => cancelAnimationFrame(rafId1));
                this.registerEvent(this.app.workspace.on('active-leaf-change', leafChangeHandler));
                
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
    
    // New helper removed; interactions moved to modes/AllScenesMode
    
    // Helper method to highlight files in the navigator and tab bar
    private highlightFileInExplorer(filePath: string, isHighlighting: boolean): void {
        if (!filePath) return;
        
        this.log(`${isHighlighting ? 'Highlighting' : 'Unhighlighting'} file in explorer: ${filePath}`);
        
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
                    // If we want to restore focus to this view, trigger for this.leaf.
                    this.plugin.app.workspace.trigger('active-leaf-change', this.leaf);
                }
            }
        } catch (error) {
            this.log(`Error highlighting file: ${error}`);
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
