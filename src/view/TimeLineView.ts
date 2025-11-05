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
import { RendererService } from '../services/RendererService';
import { ModeManager, createModeManager } from '../modes/ModeManager';
import { ModeInteractionController, createInteractionController } from '../modes/ModeInteractionController';

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
        
    // Scene data (scenes)
    sceneData: Scene[] = [];
    
    // Set of open scene paths (for tracking open files)
    openScenePaths: Set<string> = new Set<string>();
    
    // Store rotation state to persist across timeline refreshes
    private rotationState: boolean = false;
    
    // Cache book title for display in tab
    private cachedBookTitle: string | undefined = undefined;
    
    // Mode system
    private _currentMode: string = 'all-scenes'; // TimelineMode enum value
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
        this._currentMode = plugin.settings.currentMode || 'all-scenes';
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

        const perfStart = performance.now();
        const container = this.containerEl.children[1] as HTMLElement;
        container.empty();
        
        const loadingEl = container.createEl("div", {
            cls: "rt-loading-message",
            text: "Loading timeline data..."
        });
        
        // First update the tracking of open files
        this.updateOpenFilesTracking();
        
        // Get the scene data using the plugin's method
        this.plugin.getSceneData()
            .then(sceneData => {
                const dataLoadTime = performance.now() - perfStart;
                
                this.sceneData = sceneData;
                // Expose last scene data on plugin for selective services that need it
                this.plugin.lastSceneData = sceneData;
                
                // Cache book title for display (getDisplayText() will use it when called)
                const bookTitle = sceneData.find(scene => scene.Book)?.Book;
                if (bookTitle) {
                    this.cachedBookTitle = bookTitle;
                }
                
                // Remove the loading message
                loadingEl.remove();
                
                // Render the timeline with the scene data
                const renderStart = performance.now();
                this.renderTimeline(container, this.sceneData);
                const renderTime = performance.now() - renderStart;
                
                const totalTime = performance.now() - perfStart;
                

            })
            .catch(error => {
                loadingEl.textContent = `Error: ${error.message}`;
                loadingEl.className = "error-message";
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

        // If currently in gossamer mode and SVG exists, try selective gossamer rebuild now
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (svg && this.currentMode === 'gossamer') {
            try { this.rendererService?.updateGossamerLayer(this as any); } catch {}
        }
    }
    

    
    private setupMouseCoordinateTracking(container: HTMLElement) {
        // Mouse coordinate tracking disabled - no debug mode toggle exists
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
            this.app.workspace.on('active-leaf-change', () => {
                this.log('Active leaf changed event');
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
                    // Fallback to all-scenes mode if initialization fails
                    this._currentMode = 'all-scenes';
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
            // --- SVG-level delegated hover for scenes and synopsis (bind after append) ---
            (function setupDelegatedSceneHover(view: RadialTimelineView) {
                const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
                if (!svg) return;

                let currentGroup: Element | null = null;
                let currentSynopsis: Element | null = null;
                let currentSceneId: string | null = null;
                let rafId: number | null = null;

                const clearSelection = () => {
                    // Always clear active selection styles
                    const all = svg.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title, .rt-discontinuity-marker');
                    all.forEach(el => el.classList.remove('rt-selected'));

                    // Only clear muted state when NOT in Gossamer mode
                    if (view.currentMode !== 'gossamer') {
                        all.forEach(el => el.classList.remove('rt-non-selected'));
                    }

                    if (currentSynopsis) currentSynopsis.classList.remove('rt-visible');
                    currentGroup = null; currentSynopsis = null; currentSceneId = null;
                };

                const applySelection = (group: Element, sceneId: string) => {
                    const pathEl = group.querySelector('.rt-scene-path');
                    if (pathEl) (pathEl as Element).classList.add('rt-selected');
                    const numberSquare = svg.querySelector(`.rt-number-square[data-scene-id="${sceneId}"]`);
                    if (numberSquare) numberSquare.classList.add('rt-selected');
                    const numberText = svg.querySelector(`.rt-number-text[data-scene-id="${sceneId}"]`);
                    if (numberText) numberText.classList.add('rt-selected');
                    const sceneTitle = group.querySelector('.rt-scene-title');
                    if (sceneTitle) sceneTitle.classList.add('rt-selected');

                    const related = new Set<Element>();
                    const currentPathAttr = group.getAttribute('data-path');
                    if (currentPathAttr) {
                        const matches = svg.querySelectorAll(`[data-path="${currentPathAttr}"]`);
                        matches.forEach(mg => {
                            if (mg === group) return;
                            const rp = mg.querySelector('.rt-scene-path'); if (rp) related.add(rp);
                            const rt = mg.querySelector('.rt-scene-title'); if (rt) related.add(rt);
                            const rid = (rp as SVGPathElement | null)?.id;
                            if (rid) {
                                const rsq = svg.querySelector(`.rt-number-square[data-scene-id="${rid}"]`); if (rsq) related.add(rsq);
                                const rtx = svg.querySelector(`.rt-number-text[data-scene-id="${rid}"]`); if (rtx) related.add(rtx);
                            }
                        });
                    }
                    const all = svg.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title, .rt-discontinuity-marker');
                    all.forEach(el => {
                        if (!el.classList.contains('rt-selected') && !related.has(el)) el.classList.add('rt-non-selected');
                    });
                };

                const getSceneIdFromGroup = (group: Element): string | null => {
                    const pathEl = group.querySelector('.rt-scene-path') as SVGPathElement | null;
                    return pathEl?.id || null;
                };

                const findSynopsisForScene = (sceneId: string): Element | null => {
                    return svg.querySelector(`.rt-scene-info[data-for-scene="${sceneId}"]`);
                };

                view.registerDomEvent(svg as unknown as HTMLElement, 'pointerover', (e: PointerEvent) => {
                    // In Gossamer mode, normal scene hovers are disabled
                    if (view.currentMode === 'gossamer') return;

                    const g = (e.target as Element).closest('.rt-scene-group');
                    if (!g || g === currentGroup) return;

                    clearSelection();
                    const sid = getSceneIdFromGroup(g);
                    if (!sid) return;

                    // Add scene-hover class to SVG for subplot label styling
                    svg.classList.add('scene-hover');
                    
                    currentGroup = g;
                    currentSceneId = sid;
                    currentSynopsis = findSynopsisForScene(sid);
                    
                    applySelection(g, sid);
                    
                    if (currentSynopsis) {
                        currentSynopsis.classList.add('rt-visible');
                        view.plugin.updateSynopsisPosition(currentSynopsis, e as unknown as MouseEvent, svg, sid);
                    }
                    
                    // Trigger scene title auto-expansion for scenes with titles
                    const sceneTitle = g.querySelector('.rt-scene-title');
                    if (sceneTitle) {
                        redistributeActScenes(g);
                    }
                });

                view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', (e: PointerEvent) => {
                    // In Gossamer mode, normal scene hovers are disabled
                    if (view.currentMode === 'gossamer') return;
                    
                    const toEl = e.relatedTarget as Element | null;

                    // Check if we're moving within the current group or to related elements
                    if (currentGroup && toEl) {
                        if (currentGroup.contains(toEl)) return;
                        if (currentSceneId) {
                            if (toEl.closest(`.rt-number-square[data-scene-id="${currentSceneId}"]`)) return;
                            if (toEl.closest(`.rt-number-text[data-scene-id="${currentSceneId}"]`)) return;
                            if (toEl.closest(`.rt-scene-info[data-for-scene="${currentSceneId}"]`)) return;
                        }
                    }
                    
                    // Reset expansion if we had a scene expanded
                    if (currentGroup) {
                        const sceneTitle = currentGroup.querySelector('.rt-scene-title');
                        if (sceneTitle) {
                            resetAngularRedistribution();
                        }
                    }
                    
                    // Remove scene-hover class from SVG
                    svg.classList.remove('scene-hover');

                    clearSelection();
                });

                // Helper function to build arc path (copied from renderer)
                const buildCellArcPath = (innerR: number, outerR: number, startAngle: number, endAngle: number): string => {
                    const formatNumber = (n: number) => n.toFixed(6);
                    return `
                        M ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
                        L ${formatNumber(outerR * Math.cos(startAngle))} ${formatNumber(outerR * Math.sin(startAngle))}
                        A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(endAngle))} ${formatNumber(outerR * Math.sin(endAngle))}
                        L ${formatNumber(innerR * Math.cos(endAngle))} ${formatNumber(innerR * Math.sin(endAngle))}
                        A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
                    `;
                };

                // Track original scene angles and number square transforms for reset
                const originalAngles = new Map<string, { start: number; end: number; }>();
                const originalSquareTransforms = new Map<string, string>();
                
                // Create a single reusable text measurement element to avoid creating/destroying on each hover
                const measurementText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                // SAFE: styling moved to CSS class to satisfy code-quality policy
                measurementText.classList.add('rt-measure-text');
                svg.appendChild(measurementText);
                
                const storeOriginalAngles = () => {
                    if (originalAngles.size > 0) return; // Already stored
                    svg.querySelectorAll('.rt-scene-group').forEach((group: Element) => {
                        const start = Number(group.getAttribute('data-start-angle')) || 0;
                        const end = Number(group.getAttribute('data-end-angle')) || 0;
                        originalAngles.set(group.id, { start, end });
                        
                        // Store original number square transforms
                        const scenePathEl = group.querySelector('.rt-scene-path') as SVGPathElement;
                        if (scenePathEl) {
                            const sceneId = scenePathEl.id;
                            const numberSquareGroup = view.getSquareGroupForSceneId(svg, sceneId);
                            
                            if (numberSquareGroup) {
                                const originalTransform = numberSquareGroup.getAttribute('transform') || '';
                                originalSquareTransforms.set(sceneId, originalTransform);
                            }
                        }
                    });
                };

                // Reset all scenes to original angles
                const resetAngularRedistribution = () => {
                    originalAngles.forEach((angles, groupId) => {
                        const group = svg.getElementById(groupId);
                        if (!group) return;
                        const innerR = Number(group.getAttribute('data-inner-r')) || 0;
                        const outerR = Number(group.getAttribute('data-outer-r')) || 0;
                        const path = group.querySelector('.rt-scene-path') as SVGPathElement;
                        if (path) {
                            path.setAttribute('d', buildCellArcPath(innerR, outerR, angles.start, angles.end));
                        }
                        // Also reset text path if present
                        const textPath = group.querySelector('path[id^="textPath-"]') as SVGPathElement;
                        if (textPath) {
                            const textPathRadius = Math.max(innerR, outerR - 22); // SCENE_TITLE_INSET = 22
                            const TEXTPATH_START_NUDGE_RAD = 0.02;
                            const textStart = angles.start + TEXTPATH_START_NUDGE_RAD;
                            const formatNumber = (n: number) => n.toFixed(6);
                            textPath.setAttribute('d', 
                                `M ${formatNumber(textPathRadius * Math.cos(textStart))} ${formatNumber(textPathRadius * Math.sin(textStart))} A ${formatNumber(textPathRadius)} ${formatNumber(textPathRadius)} 0 0 1 ${formatNumber(textPathRadius * Math.cos(angles.end))} ${formatNumber(textPathRadius * Math.sin(angles.end))}`
                            );
                        }
                        
                        // Reset number square transform
                        const scenePathEl = group.querySelector('.rt-scene-path') as SVGPathElement;
                        if (scenePathEl) {
                            const sceneId = scenePathEl.id;
                            const originalTransform = originalSquareTransforms.get(sceneId);
                            if (originalTransform !== undefined) {
                                view.setNumberSquareGroupPosition(svg, sceneId, 
                                    parseFloat(originalTransform.split('(')[1]), 
                                    parseFloat(originalTransform.split(',')[1]));
                            }
                        }
                    });
                };

                // Redistribute scenes within an act to expand hovered scene
                const redistributeActScenes = (hoveredGroup: Element) => {
                    // Check if auto-expand is disabled in settings
                    if (!view.plugin.settings.enableSceneTitleAutoExpand) return;
                    
                    storeOriginalAngles();
                    
                    const hoveredAct = hoveredGroup.getAttribute('data-act');
                    const hoveredRing = hoveredGroup.getAttribute('data-ring');
                    if (!hoveredAct || !hoveredRing) {
                        return;
                    }

                        // Find all elements in the same act and ring (scenes AND plot slices)
                        const actElements: Element[] = [];
                        const sceneElements: Element[] = []; // Track which ones are scenes for text measurement
                        svg.querySelectorAll('.rt-scene-group').forEach((group: Element) => {
                            if (group.getAttribute('data-act') === hoveredAct && 
                                group.getAttribute('data-ring') === hoveredRing) {
                                const path = group.querySelector('.rt-scene-path');
                                if (path) {
                                    actElements.push(group);
                                    // Track which ones are scenes (have titles) vs plot slices
                                    const sceneTitle = group.querySelector('.rt-scene-title');
                                    if (sceneTitle) {
                                        sceneElements.push(group);
                                    }
                                }
                            }
                        });

                    if (actElements.length <= 1) {
                        return; // Need at least 2 elements to redistribute
                    }

                    // Only check text measurement if the hovered element is a scene (not a plot slice)
                    if (!sceneElements.includes(hoveredGroup)) {
                        return; // Don't expand plot slices
                    }
                    const hoveredStart = Number(hoveredGroup.getAttribute('data-start-angle')) || 0;
                    const hoveredEnd = Number(hoveredGroup.getAttribute('data-end-angle')) || 0;
                    const hoveredInnerR = Number(hoveredGroup.getAttribute('data-inner-r')) || 0;
                    const hoveredOuterR = Number(hoveredGroup.getAttribute('data-outer-r')) || 0;
                    const hoveredMidR = (hoveredInnerR + hoveredOuterR) / 2;

                    // Measure if the hovered scene's title text fits in its current space
                    const currentArcPx = (hoveredEnd - hoveredStart) * hoveredMidR;

                    // Get the scene title element and measure its text width
                    const hoveredSceneTitle = hoveredGroup.querySelector('.rt-scene-title');
                    if (!hoveredSceneTitle) {
                        return; // No title to measure
                    }

                    const titleText = hoveredSceneTitle.textContent || '';
                    if (!titleText.trim()) {
                        return; // No text to measure
                    }

                    // Use the reusable measurement element to avoid creating/destroying elements
                    measurementText.textContent = titleText;
                    const hoveredComputed = getComputedStyle(hoveredSceneTitle as Element);
                    
                    // SAFE: CSS custom properties used for dynamic font measurement copying
                    const fontFamily = hoveredComputed.fontFamily || 'sans-serif';
                    const fontSize = hoveredComputed.fontSize || '18px';
                    measurementText.style.setProperty('--rt-measurement-font-family', fontFamily);
                    measurementText.style.setProperty('--rt-measurement-font-size', fontSize);
                    
                    const textBBox = measurementText.getBBox();
                    const requiredTextWidth = textBBox.width;

                    // Add padding for readability and account for text path start offsets
                    const PADDING_PX = 8;
                    const TEXTPATH_START_NUDGE_RAD = 0.02; // Angular nudge from renderer
                    const TEXTPATH_START_OFFSET_PX = 4; // Pixel offset from startOffset="4"
                    
                    // Convert angular nudge to pixels at this radius
                    const angularNudgePx = TEXTPATH_START_NUDGE_RAD * hoveredMidR;
                    
                    const requiredArcPx = requiredTextWidth + PADDING_PX + TEXTPATH_START_OFFSET_PX + angularNudgePx;
                    
                    if (currentArcPx >= requiredArcPx) {
                        return; // Text already fits, no need to expand
                    }

                    // Calculate target expanded size based on text width
                    const targetArcPx = requiredArcPx * HOVER_EXPAND_FACTOR;
                    const targetAngularSize = targetArcPx / hoveredMidR;

                    // Get total angular space for this act/ring by finding act boundaries
                    let actStartAngle = 0;
                    let actEndAngle = 2 * Math.PI;
                    
                    const actNum = Number(hoveredAct);
                    
                    if (actNum === 0) {
                        // Chronologue mode (act 0): use full 360° circle
                        actStartAngle = -Math.PI / 2; // Start at top (12 o'clock)
                        actEndAngle = actStartAngle + (2 * Math.PI); // Full circle
                    } else {
                        // 3-act structure: divide circle into thirds
                        const NUM_ACTS = 3;
                        actStartAngle = (actNum * 2 * Math.PI / NUM_ACTS) - Math.PI / 2;
                        actEndAngle = ((actNum + 1) * 2 * Math.PI / NUM_ACTS) - Math.PI / 2;
                    }
                    
                    const totalActSpace = actEndAngle - actStartAngle;
                    
                    // Calculate space for beat slices (they keep their original size)
                    let totalBeatSpace = 0;
                    const beatElements: Element[] = [];
                    actElements.forEach(element => {
                        if (!sceneElements.includes(element)) {
                            // This is a beat slice
                            beatElements.push(element);
                            const beatStart = Number(element.getAttribute('data-start-angle')) || 0;
                            const beatEnd = Number(element.getAttribute('data-end-angle')) || 0;
                            totalBeatSpace += (beatEnd - beatStart);
                        }
                    });
                    
                    const availableSceneSpace = totalActSpace - totalBeatSpace;
                    const spaceForOtherScenes = availableSceneSpace - targetAngularSize;
                    const angularSizeForOtherScenes = spaceForOtherScenes / (sceneElements.length - 1);

                    // Redistribute angles for all elements (scenes and beats)
                    let currentAngle = actStartAngle;
                    actElements.forEach((group: Element) => {
                        const innerR = Number(group.getAttribute('data-inner-r')) || 0;
                        const outerR = Number(group.getAttribute('data-outer-r')) || 0;
                        
                        let newStart, newEnd;
                        if (group === hoveredGroup) {
                            // Expanded scene
                            newStart = currentAngle;
                            newEnd = currentAngle + targetAngularSize;
                        } else if (sceneElements.includes(group)) {
                            // Other scenes (compressed)
                            newStart = currentAngle;
                            newEnd = currentAngle + angularSizeForOtherScenes;
                        } else {
                            // Beat slice (keep original size)
                            const originalStart = Number(group.getAttribute('data-start-angle')) || 0;
                            const originalEnd = Number(group.getAttribute('data-end-angle')) || 0;
                            const originalSize = originalEnd - originalStart;
                            newStart = currentAngle;
                            newEnd = currentAngle + originalSize;
                        }

                        // Update the scene path
                        const path = group.querySelector('.rt-scene-path') as SVGPathElement;
                        if (path) {
                            path.setAttribute('d', buildCellArcPath(innerR, outerR, newStart, newEnd));
                        }

                        // Update text path if present
                        const textPath = group.querySelector('path[id^="textPath-"]') as SVGPathElement;
                        if (textPath) {
                            const textPathRadius = Math.max(innerR, outerR - 22); // SCENE_TITLE_INSET = 22
                            const TEXTPATH_START_NUDGE_RAD = 0.02;
                            const textStart = newStart + TEXTPATH_START_NUDGE_RAD;
                            const formatNumber = (n: number) => n.toFixed(6);
                            textPath.setAttribute('d', 
                                `M ${formatNumber(textPathRadius * Math.cos(textStart))} ${formatNumber(textPathRadius * Math.sin(textStart))} A ${formatNumber(textPathRadius)} ${formatNumber(textPathRadius)} 0 0 1 ${formatNumber(textPathRadius * Math.cos(newEnd))} ${formatNumber(textPathRadius * Math.sin(newEnd))}`
                            );
                        }

                        // Update associated number square position for all scenes (including hovered)
                        const scenePathEl = group.querySelector('.rt-scene-path') as SVGPathElement;
                        if (scenePathEl) {
                            const sceneId = scenePathEl.id;
                            // Position at the START of the redistributed scene (not center)
                            const startAngle = newStart;
                            // Use the same radius calculation as the original renderer
                            const squareRadius = (innerR + outerR) / 2;
                            const squareX = squareRadius * Math.cos(startAngle);
                            const squareY = squareRadius * Math.sin(startAngle);
                            
                            view.setNumberSquareGroupPosition(svg, sceneId, squareX, squareY);
                        }

                        currentAngle = newEnd;
                    });
                };

                const onMove = (e: PointerEvent) => {
                    // Update synopsis position when visible
                    if (currentSynopsis && currentSceneId) {
                        view.plugin.updateSynopsisPosition(currentSynopsis, e as unknown as MouseEvent, svg, currentSceneId);
                    }

                    rafId = null;
                };
                view.registerDomEvent(svg as unknown as HTMLElement, 'pointermove', (e: PointerEvent) => {
                    if (rafId !== null) return;
                    rafId = window.requestAnimationFrame(() => onMove(e));
                });
                
                // Register cleanup for hover RAF ID
                view.register(() => {
                    if (rafId !== null) cancelAnimationFrame(rafId);
                });
                
            })(this);
            // --- end delegated hover ---
            
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
