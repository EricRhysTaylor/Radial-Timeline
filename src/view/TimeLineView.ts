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
import ZeroDraftModal from './ZeroDraftModal';
import { parseSceneTitleComponents, renderSceneTitleComponents } from '../utils/text';
import { openOrRevealFile } from '../utils/fileUtils';

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
    
    // Frontmatter values to track to reduce unnecessary SVG View refreshes
    private lastFrontmatterValues: Record<string, unknown> = {};
    private timelineRefreshTimeout: number | null = null;
        
    // Scene data (scenes)
    sceneData: Scene[] = [];
    
    // Set of open scene paths (for tracking open files)
    openScenePaths: Set<string> = new Set<string>();
    
    // Store rotation state to persist across timeline refreshes
    private rotationState: boolean = false;
    
    public interactionMode: 'normal' | 'gossamer' = 'normal';
    
    // Store event handler references for clean removal
    private normalEventHandlers: Map<string, EventListener> = new Map();
    private gossamerEventHandlers: Map<string, EventListener> = new Map();

    constructor(leaf: WorkspaceLeaf, plugin: RadialTimelinePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.openScenePaths = plugin.openScenePaths;
    }
    
    private log<T>(message: string, data?: T) {
        // Forward to plugin logger; it is dev-guarded
        this.plugin.log(message, data);
    }
    
    getViewType(): string {
        return TIMELINE_VIEW_TYPE;
    }
    
    getDisplayText(): string {
        return TIMELINE_VIEW_DISPLAY_TEXT;
    }
    
    getIcon(): string {
        return "shell";
    }

    // --- Helpers for number-square orientation/position (shared across modes) ---
    private applyRotationToNumberSquares(svg: SVGSVGElement, rotated: boolean): void {
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

    private getSquareGroupForSceneId(svg: SVGSVGElement, sceneId: string): SVGGElement | null {
        const rect = svg.querySelector(`.rt-number-square[data-scene-id="${sceneId}"]`) as SVGRectElement | null;
        if (!rect) return null;
        const group = rect.closest('.number-square-group') as SVGGElement | null;
        return group;
    }

    private setNumberSquareGroupPosition(svg: SVGSVGElement, sceneId: string, x: number, y: number): void {
        const group = this.getSquareGroupForSceneId(svg, sceneId);
        if (group) {
            // Only translate on the outer group; orientation is handled by inner wrapper
            group.setAttribute('transform', `translate(${x}, ${y})`);
        }
    }

    // Add this method to handle search indicator clicks
    private setupSearchControls(): void {
        const clearSearchBtn = this.contentEl.querySelector('.rt-clear-search-btn');
        if (clearSearchBtn) {
            this.registerDomEvent(clearSearchBtn, 'click', () => {
                this.plugin.clearSearch();
            });
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
            this.refreshTimeline();
        } else {
            this.log('No changes in open files detected');
        }
    }

    refreshTimeline() {
        if (!this.plugin) return;

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
                this.sceneData = sceneData;
                
                // Remove the loading message
                loadingEl.remove();
                
                // Render the timeline with the scene data
                this.renderTimeline(container, this.sceneData);
                

            })
            .catch(error => {
                loadingEl.textContent = `Error: ${error.message}`;
                loadingEl.className = "error-message";
                if (this.plugin.settings.debug) {
                    console.error("Failed to load timeline data", error);
                }
            });
        
        // Setup search controls
        this.setupSearchControls();
        
        // Add highlight rectangles if search is active
        if (this.plugin.searchActive) {
            window.setTimeout(() => this.addHighlightRectangles(), 100);
        }
    }
    

    
    private setupMouseCoordinateTracking(container: HTMLElement) {
        if (!this.plugin.settings.debug) return;
        // Wait a bit for the SVG to be fully rendered
        window.setTimeout(() => {
            // Get SVG and text elements
            const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement;
            const debugText = svg?.querySelector('#mouse-coords-text') as SVGTextElement;
            const debugContainer = svg?.querySelector('.debug-info-container') as SVGGElement;
            
            if (!svg) {
                console.error('Could not find SVG element');
                return;
            }
            
            if (!debugText || !debugContainer) {
                console.error('Could not find debug elements');
                return;
            }
            
            // Function to update coordinates
            const updateCoordinates = (e: MouseEvent) => {
                // Check if debug mode is still enabled
                if (!this.plugin.settings.debug) {
                    // Hide debug display if debug mode disabled
                    debugContainer.classList.add('debug-container');
                    if (this.plugin.settings.debug) {
                        debugContainer.classList.add('visible');
                    }
                    return;
                } else {
                    // Ensure display is visible
                    debugContainer.classList.remove('debug-container');
                    debugContainer.classList.add('visible');
                }
                
                try {
                    const pt = svg.createSVGPoint();
                    pt.x = e.clientX;
                    pt.y = e.clientY;
                    
                    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                    if (svgP) {
                        debugText.textContent = `Mouse: X=${Math.round(svgP.x)}, Y=${Math.round(svgP.y)}`;
                    }
                } catch (err) {
                    console.error('Error updating coordinates:', err);
                }
            };
            
            // Remove any existing listeners and add new one
            svg.removeEventListener('mousemove', updateCoordinates);
            this.registerDomEvent(svg as unknown as HTMLElement, 'mousemove', updateCoordinates);
            
            // Also log coordinates on click
            this.registerDomEvent(svg as unknown as HTMLElement, 'click', (e: MouseEvent) => {
                // Only log if debug mode is active
                if (!this.plugin.settings.debug) return;
                
                try {
                    const pt = svg.createSVGPoint();
                    pt.x = e.clientX;
                    pt.y = e.clientY;
                    
                    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                    if (svgP) {
            
                    }
                } catch (err) {
                    console.error('Error capturing click coordinates:', err);
                }
            });
            
            // Create a MutationObserver to watch for changes to settings
            const settingsObserver = new MutationObserver((mutations) => {
                // Check current debug setting and update visibility accordingly
                debugContainer.classList.remove('debug-container');
                debugContainer.classList.add('visible');
            });
            
            // Register cleanup for observer
            this.register(() => settingsObserver.disconnect());
            
            // Initial visibility check
            debugContainer.classList.remove('debug-container');
            debugContainer.classList.add('visible');
            
            // For changes that might happen outside mutation observer
            this.registerDomEvent(document, 'visibilitychange', () => {
                debugContainer.classList.remove('debug-container');
                debugContainer.classList.add('visible');
            });
            
            this.plugin.log('Mouse coordinate tracking initialized');
        }, 500); // Wait 500ms to ensure SVG is fully rendered
    }
    
    async onOpen(): Promise<void> {
        this.log('Opening timeline view');
        
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
                
                // Check if this is a scene or plot file (Class: Scene or Class: Plot)
                const fm = cache.frontmatter;
                const isSceneOrPlot = (fm.Class === 'Scene') || (fm.class === 'Scene') ||
                                     (fm.Class === 'Plot') || (fm.class === 'Plot');
                if (!isSceneOrPlot) return;
                
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
                
                // Debounce the refresh with a generous 5 seconds
                if (this.timelineRefreshTimeout) window.clearTimeout(this.timelineRefreshTimeout);
                this.timelineRefreshTimeout = window.setTimeout(() => {
                    this.refreshTimeline();
                }, 5000);
            })
        );
        
        // Initial check of open files
        this.updateOpenFilesTracking();
        
        // Initial timeline render
        this.refreshTimeline();
    }
    
    async onClose(): Promise<void> {
        // Clear search state when view closes to ensure fresh state on reopen
        this.plugin.clearSearch();
        
        // Clean up any event listeners or resources
    }
    
    // Add the missing createSvgElement method
    private createSvgElement(svgContent: string, container: HTMLElement): SVGSVGElement | null {
        // Delegate to the plugin's implementation
        return this.plugin.createSvgElement(svgContent, container);
    }
    
    // Add missing addHighlightRectangles method
    private addHighlightRectangles(): void {
        if (!this.plugin.searchActive) {
            return;
        }
        
        this.log(`Adding highlight rectangles for search term: "${this.plugin.searchTerm}" with ${this.plugin.searchResults.size} results`);
        
        // Check if title tspans exist
        const allTitleTspans = this.contentEl.querySelectorAll('tspan[data-item-type="title"]');
        
        // Iterate through all text elements and replace their content
        // This ensures we completely replace any previous search highlighting
        
        // First, find all subplot to highlight
        const subplotTspans = this.contentEl.querySelectorAll('tspan[data-item-type="subplot"]');
        const searchTerm = this.plugin.searchTerm;
        
        // Create a word boundary regex for exact matches only
        const escapedPattern = escapeRegExp(searchTerm);
        const wordBoundaryRegex = new RegExp(`\\b(${escapedPattern})\\b`, 'gi');
        
        // Process all subplot
        subplotTspans.forEach((tspan: Element) => {
            // Get the original text content
            const originalText = tspan.textContent || '';
            
            // Skip if there's no match
            if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) {
                return;
            }
            
            // Apply highlighting - CSS classes handle colors via custom properties
            const fillColor = tspan.getAttribute('fill');
            
            // Test if we need a word boundary match
            const useWordBoundary = originalText.match(wordBoundaryRegex);
            const regex = useWordBoundary ? wordBoundaryRegex : new RegExp(`(${escapedPattern})`, 'gi');
            
            // Clear previous content (but preserve attributes)
            while (tspan.firstChild) {
                tspan.removeChild(tspan.firstChild);
            }
            
            // Restore fill attribute if it existed (CSS custom properties are preserved on element)
            if (fillColor) {
                tspan.setAttribute('fill', fillColor);
            }
            
            // Reset regex
            regex.lastIndex = 0;
            
            // Process the text parts
            let lastIndex = 0;
            let match;
            
            while ((match = regex.exec(originalText)) !== null) {
                // Add text before match (inherits fill from parent tspan)
                if (match.index > lastIndex) {
                    const textBefore = document.createTextNode(originalText.substring(lastIndex, match.index));
                    tspan.appendChild(textBefore);
                }
                
                // Add the highlighted match
                const highlightSpan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                highlightSpan.setAttribute("class", "rt-search-term");
                highlightSpan.setAttribute("fill", fillColor || "");
                highlightSpan.textContent = match[0];
                tspan.appendChild(highlightSpan);
                
                lastIndex = match.index + match[0].length;
            }
            
            // Add any remaining text (inherits fill from parent tspan)
            if (lastIndex < originalText.length) {
                const textAfter = document.createTextNode(originalText.substring(lastIndex));
                tspan.appendChild(textAfter);
            }
        });
        
        // Now, process all character labels
        const characterTspans = this.contentEl.querySelectorAll('tspan[data-item-type="character"]');
        
        // Process all character
        characterTspans.forEach((tspan: Element) => {
            // Same logic as for subplot
            const originalText = tspan.textContent || '';
            
            if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) {
                return;
            }
            
            // Apply highlighting - preserve the original fill color
            const fillColor = tspan.getAttribute('fill');
            const useWordBoundary = originalText.match(wordBoundaryRegex);
            const regex = useWordBoundary ? wordBoundaryRegex : new RegExp(`(${escapedPattern})`, 'gi');
            
            while (tspan.firstChild) {
                tspan.removeChild(tspan.firstChild);
            }
            
            // IMPORTANT: Ensure the parent tspan keeps its fill using CSS custom property
            if (fillColor) {
                tspan.setAttribute('fill', fillColor);
                tspan.classList.add('rt-with-dynamic-fill');
                (tspan as HTMLElement).style.setProperty('--rt-dynamic-fill-color', fillColor);
            }
            
            regex.lastIndex = 0;
            let lastIndex = 0;
            let match;
            
            while ((match = regex.exec(originalText)) !== null) {
                if (match.index > lastIndex) {
                    const textBefore = document.createTextNode(originalText.substring(lastIndex, match.index));
                    tspan.appendChild(textBefore);
                }
                
                const highlightSpan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                highlightSpan.setAttribute("class", "rt-search-term");
                highlightSpan.setAttribute("fill", fillColor || "");
                highlightSpan.textContent = match[0];
                tspan.appendChild(highlightSpan);
                
                lastIndex = match.index + match[0].length;
            }
            
            if (lastIndex < originalText.length) {
                const textAfter = document.createTextNode(originalText.substring(lastIndex));
                tspan.appendChild(textAfter);
            }
        });
        
        // Highlight matches in title text tspans (scene number and title) - use data-item-type like characters
        const titleTspans = this.contentEl.querySelectorAll('tspan[data-item-type="title"]');
        
        titleTspans.forEach((tspan: Element) => {
            const originalText = tspan.textContent || '';
            if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
            
            // Title tspans use CSS custom property (--rt-dynamic-color) like characters
            // Clear content only, preserve tspan element and inline style
            while (tspan.firstChild) {
                tspan.removeChild(tspan.firstChild);
            }
            
            const regex = new RegExp(`(${escapedPattern})`, 'gi');
            regex.lastIndex = 0;
            
            let lastIndex = 0;
            let match;
            
            while ((match = regex.exec(originalText)) !== null) {
                if (match.index > lastIndex) {
                    const textBefore = document.createTextNode(originalText.substring(lastIndex, match.index));
                    tspan.appendChild(textBefore);
                }
                
                const highlightSpan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                highlightSpan.setAttribute("class", "rt-search-term");
                // No fill attribute needed; inherits from parent via CSS custom property
                highlightSpan.textContent = match[0];
                tspan.appendChild(highlightSpan);
                
                lastIndex = match.index + match[0].length;
            }
            
            if (lastIndex < originalText.length) {
                const textAfter = document.createTextNode(originalText.substring(lastIndex));
                tspan.appendChild(textAfter);
            }
        });
        
        // Highlight matches in date tspans (like subplot/character approach)
        const dateTspans = this.contentEl.querySelectorAll('tspan[data-item-type="date"]');
        
        dateTspans.forEach((tspan: Element) => {
            const originalText = tspan.textContent || '';
            if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
            
            // Clear previous content (but preserve all attributes including inline styles)
            // Date uses --rt-date-color CSS custom property like subplots use --rt-dynamic-color
            while (tspan.firstChild) {
                tspan.removeChild(tspan.firstChild);
            }
            
            const regex = new RegExp(`(${escapedPattern})`, 'gi');
            regex.lastIndex = 0;
            
            let lastIndex = 0;
            let match;
            
            while ((match = regex.exec(originalText)) !== null) {
                if (match.index > lastIndex) {
                    const textBefore = document.createTextNode(originalText.substring(lastIndex, match.index));
                    tspan.appendChild(textBefore);
                }
                
                const highlightSpan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                highlightSpan.setAttribute("class", "rt-search-term");
                // Don't set fill - CSS will inherit from parent via custom property
                highlightSpan.textContent = match[0];
                tspan.appendChild(highlightSpan);
                
                lastIndex = match.index + match[0].length;
            }
            
            if (lastIndex < originalText.length) {
                const textAfter = document.createTextNode(originalText.substring(lastIndex));
                tspan.appendChild(textAfter);
            }
        });
        
        // Also highlight matches in synopsis text blocks
        const synopsisTextElements = this.contentEl.querySelectorAll('svg .rt-synopsis-text text');
        synopsisTextElements.forEach((textEl: Element) => {
            // NEW: Skip any text element that has tspan children, as they are handled elsewhere.
            if (textEl.querySelector('tspan')) {
                return;
            }

            const originalText = textEl.textContent || '';
            if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
            
            const fillColor = (textEl as SVGTextElement).getAttribute('fill') || '';
            
            // Clear existing content
            while (textEl.firstChild) textEl.removeChild(textEl.firstChild);
            
            // Apply highlighting
            const regex = new RegExp(`(${escapedPattern})`, 'gi');
            let lastIndex = 0;
            let match;
            
            while ((match = regex.exec(originalText)) !== null) {
                if (match.index > lastIndex) {
                    textEl.appendChild(document.createTextNode(originalText.substring(lastIndex, match.index)));
                }
                
                const highlightSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                highlightSpan.setAttribute('class', 'rt-search-term');
                if (fillColor) highlightSpan.setAttribute('fill', fillColor);
                highlightSpan.textContent = match[0];
                textEl.appendChild(highlightSpan);
                
                lastIndex = match.index + match[0].length;
            }
            
            if (lastIndex < originalText.length) {
                textEl.appendChild(document.createTextNode(originalText.substring(lastIndex)));
            }
        });
        
        // --- START NEW LOGIC ---
        // Target all tspans that do NOT have a data-item-type to apply highlighting
        // This is safer than the text-level approach and respects mixed-color lines
        const unhandledTspans = this.contentEl.querySelectorAll('svg .rt-synopsis-text text tspan:not([data-item-type])');
        unhandledTspans.forEach((tspan: Element) => {
            const originalText = tspan.textContent || '';
            if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;

            // Preserve existing fill color from the tspan itself
            const fillColor = (tspan as SVGTSpanElement).getAttribute('fill') || 'inherit';

            // Clear existing content
            while (tspan.firstChild) tspan.removeChild(tspan.firstChild);

            // Apply highlighting
            const regex = new RegExp(`(${escapedPattern})`, 'gi');
            let lastIndex = 0;
            let match;

            while ((match = regex.exec(originalText)) !== null) {
                if (match.index > lastIndex) {
                    tspan.appendChild(document.createTextNode(originalText.substring(lastIndex, match.index)));
                }

                const highlightSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                highlightSpan.setAttribute('class', 'rt-search-term');
                if (fillColor) highlightSpan.setAttribute('fill', fillColor);
                highlightSpan.textContent = match[0];
                tspan.appendChild(highlightSpan);

                lastIndex = match.index + match[0].length;
            }

            if (lastIndex < originalText.length) {
                tspan.appendChild(document.createTextNode(originalText.substring(lastIndex)));
            }
        });
        // --- END NEW LOGIC ---
        
        // Check for scene groups that should be highlighted
        const allSceneGroups = this.contentEl.querySelectorAll('.rt-scene-group');
        this.log(`Found ${allSceneGroups.length} scene groups to check for search matches`);
        
        // Add search-result class to all matching scene paths
        allSceneGroups.forEach((group: Element) => {
            const pathAttr = group.getAttribute('data-path');
            if (pathAttr && this.plugin.searchResults.has(decodeURIComponent(pathAttr))) {
                // Find the number square in this group
                const numberSquare = group.querySelector('.rt-number-square');
                const numberText = group.querySelector('.rt-number-text');
                
                if (numberSquare) {
                    numberSquare.classList.add('rt-search-result');
                    this.log(`Added rt-search-result class to number square for ${pathAttr}`);
                }
                
                if (numberText) {
                    numberText.classList.add('rt-search-result');
                }
            }
        });
    }
    
    async createTestSceneFile(): Promise<void> {
        // Use shared sanitizer to keep behavior consistent with template creation
        const { sanitizeSourcePath, buildInitialSceneFilename } = await import('../utils/sceneCreation');
        const sourcePath = sanitizeSourcePath(this.plugin.settings.sourcePath);
        let targetPath = sourcePath;
        
        if (sourcePath !== "") {
            try {
                // Try to create the folder if it doesn't exist
                await this.plugin.app.vault.createFolder(sourcePath);
            } catch (error) {
                // If the folder already exists, we can safely ignore the error and continue.
                const message = (error as any)?.message ?? '';
                if (!message.includes('Folder already exists')) {
                    console.error(`Failed to create folder: ${sourcePath}`, error);
                    new Notice(`Failed to create folder: ${sourcePath}`);
                    return;
                }
            }
        }
        
        // Create the test scene file content
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        const testSceneContent = `---
Class: Scene
Synopsis: What happens in this scene briefly.
Subplot:
  - Main Plot
  - Second Arc
Act: 1
When: 2000-01-31
Character:
  - Janet Rollins
Place:
  - Earth
  - San Diego
Words: 
Publish Stage: Zero
Status: Todo
Due: 2025-12-31
Total Time:
Revision:
Pending Edits: 
Beats Update: 
Book:
---

# Test Scene

This is a test scene created to help with initial Radial timeline setup.

`;
        
        // Harmonized initial filename
        const filename = buildInitialSceneFilename(targetPath, '1 Test Scene.md');
        
        try {
            // Create the file
            await this.plugin.app.vault.create(filename, testSceneContent);
            new Notice(`Created test scene file: ${filename}`);
            
            // Refresh the timeline after a short delay to allow metadata cache to update
            window.setTimeout(() => {
                this.refreshTimeline();
            }, 500);
        } catch (error) {
            console.error(`Failed to create test scene file: ${filename}`, error);
            new Notice(`Failed to create test scene file: ${filename}`);
        }
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
                messageText += " Would you like to create a demonstration scene note with example YAML front-matter?";
            }

            container.createEl("div", { text: messageText });
            this.log("No scenes found. Source path:", sourcePath || "<not set>");

            // Add button to create a demonstration scene file
            const demoButton = container.createEl("button", {
                text: "Create demonstration scene note",
                cls: "rt-action-button"
            });

            this.registerDomEvent(demoButton, "click", async () => {
                await this.createTestSceneFile();
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
                // If Gossamer mode is active, reuse hover-state styling: mute everything except Plot beats
                if (this.interactionMode === 'gossamer') {
                    svgElement.setAttribute('data-gossamer-mode', 'true');
                    // Apply the same logic as scene hover: add rt-non-selected to all elements except Plot beats
                    const allElements = svgElement.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title');
                    allElements.forEach(el => {
                        const group = el.closest('.rt-scene-group');
                        const itemType = group?.getAttribute('data-item-type');
                        // Treat Plot beats like "selected" items - they stay unmuted
                        if (itemType !== 'Plot') {
                            el.classList.add('rt-non-selected');
                        }
                    });
                } else {
                    svgElement.removeAttribute('data-gossamer-mode');
                }
                // Set CSS variables for subplot labels based on data attributes
                const subplotLabelGroups = svgElement.querySelectorAll('.subplot-label-group[data-font-size]');
                subplotLabelGroups.forEach((group) => {
                    const fontSize = group.getAttribute('data-font-size');
                    if (fontSize) {
                        (group as SVGElement).style.setProperty('--rt-subplot-font-size', `${fontSize}px`);
                    }
                });
                
                // Attach rotation toggle behavior (inline SVG scripts won't run here)
                const rotatable = svgElement.querySelector('#timeline-rotatable') as SVGGElement | null;
                const toggle = svgElement.querySelector('#rotation-toggle') as SVGGElement | null;
                const arrowUp = svgElement.querySelector('#rotation-arrow-up') as SVGUseElement | null;
                const arrowDown = svgElement.querySelector('#rotation-arrow-down') as SVGUseElement | null;
                if (rotatable && toggle && arrowUp && arrowDown) {
                    // Initialize from stored state to preserve rotation across timeline refreshes
                    let rotated = this.rotationState;
                    const applyRotation = () => {
                        if (rotated) {
                            rotatable.setAttribute('transform', 'rotate(-120)');
                            arrowUp.classList.add('is-hidden');
                            arrowDown.classList.remove('is-hidden');
                        } else {
                            rotatable.removeAttribute('transform');
                            arrowUp.classList.remove('is-hidden');
                            arrowDown.classList.add('is-hidden');
                        }
                        // Expose rotation state on the root SVG so other logic (hover redistribution) can respect it
                        svgElement.setAttribute('data-rotated', rotated ? 'true' : 'false');
                        // Keep squares upright by rotating only the inner orientation wrapper, not the translate group
                        this.applyRotationToNumberSquares(svgElement as unknown as SVGSVGElement, rotated);

                        // Counter-rotate center grid and estimate markers if they live under the rotatable group
                        const counterSelectors = [
                            '.color-key-center',
                            '.estimated-date-tick',
                            '.estimated-date-dot',
                            '.estimation-date-label',
                            '.target-date-tick',
                            '.target-date-marker'
                        ];
                        counterSelectors.forEach((sel) => {
                            const nodes = svgElement.querySelectorAll(sel);
                            nodes.forEach((node) => {
                                const el = node as SVGGraphicsElement;
                                // Only counter-rotate if this node is inside the rotatable group
                                if (!el.closest('#timeline-rotatable')) return;
                                const t = el.getAttribute('transform') || '';
                                const base = t.replace(/\s*rotate\([^)]*\)/g, '').trim();
                                if (rotated) {
                                    el.setAttribute('transform', `${base} rotate(120)`.trim());
                                } else {
                                    el.setAttribute('transform', base);
                                }
                            });
                        });
                    };
                    applyRotation();
                    this.registerDomEvent(toggle as unknown as HTMLElement, 'click', () => {
                        // Disable rotation in Gossamer mode
                        if (this.interactionMode === 'gossamer') return;
                        
                        rotated = !rotated;
                        this.rotationState = rotated; // Save state for persistence
                        applyRotation();
                    });
                }

                // Adjust plot labels after render
                const adjustLabels = () => this.plugin.adjustPlotLabelsAfterRender(timelineContainer);
                requestAnimationFrame(adjustLabels);
                
                // Re-adjust when the timeline view becomes active (workspace active-leaf-change)
                const leafChangeHandler = () => {
                    // Check if this timeline view is now the active leaf
                    if (this.app.workspace.getActiveViewOfType(RadialTimelineView) === this) {
                        // Small delay to ensure layout is settled
                        window.setTimeout(() => requestAnimationFrame(adjustLabels), 50);
                    }
                };
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
                        
                        // Set up click and hover events for path elements
                        this.setupSceneInteractions(group, svgElement, scenes);
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
                        this.registerDomEvent(svg, 'pointerover', (e: PointerEvent) => {
                            const g = (e.target as Element).closest('.rt-scene-group');
                            if (g && g !== lastHoverGroup) {
                                onEnterLeave(true, g);
                                lastHoverGroup = g;
                            }
                        });
                        this.registerDomEvent(svg, 'pointerout', (e: PointerEvent) => {
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
                    const all = svg.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title');
                    all.forEach(el => el.classList.remove('rt-selected'));

                    // Only clear muted state when NOT in Gossamer mode
                    if (view.interactionMode !== 'gossamer') {
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
                    const all = svg.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title');
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

                view.registerDomEvent(svg, 'pointerover', (e: PointerEvent) => {
                    // In Gossamer mode, normal scene hovers are disabled
                    if (view.interactionMode === 'gossamer') return;
                    
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
                    
                    // Only trigger expansion for regular scenes (not plot elements)
                    const sceneTitle = g.querySelector('.rt-scene-title');
                    if (sceneTitle) {
                        redistributeActScenes(g);
                    }
                });

                view.registerDomEvent(svg, 'pointerout', (e: PointerEvent) => {
                    // In Gossamer mode, normal scene hovers are disabled
                    if (view.interactionMode === 'gossamer') return;
                    
                    const toEl = e.relatedTarget as Element | null;

                    // Check if we're moving within the current group
                    if (currentGroup && toEl && currentGroup.contains(toEl)) return;
                    
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
                    storeOriginalAngles();
                    
                    const hoveredAct = hoveredGroup.getAttribute('data-act');
                    const hoveredRing = hoveredGroup.getAttribute('data-ring');
                    if (!hoveredAct || !hoveredRing) return;

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

                    if (actElements.length <= 1) return; // Need at least 2 elements to redistribute

                    // Only check text measurement if the hovered element is a scene (not a plot slice)
                    if (!sceneElements.includes(hoveredGroup)) return; // Don't expand plot slices

                    // Measure if the hovered scene's title text fits in its current space
                    const hoveredStart = Number(hoveredGroup.getAttribute('data-start-angle')) || 0;
                    const hoveredEnd = Number(hoveredGroup.getAttribute('data-end-angle')) || 0;
                    const hoveredInnerR = Number(hoveredGroup.getAttribute('data-inner-r')) || 0;
                    const hoveredOuterR = Number(hoveredGroup.getAttribute('data-outer-r')) || 0;
                    const hoveredMidR = (hoveredInnerR + hoveredOuterR) / 2;
                    const currentArcPx = (hoveredEnd - hoveredStart) * hoveredMidR;

                    // Get the scene title element and measure its text width
                    const hoveredSceneTitle = hoveredGroup.querySelector('.rt-scene-title');
                    if (!hoveredSceneTitle) return; // No title to measure

                    const titleText = hoveredSceneTitle.textContent || '';
                    if (!titleText.trim()) return; // No text to measure

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
                    
                    if (currentArcPx >= requiredArcPx) return; // Text already fits, no need to expand

                    // Calculate target expanded size based on text width
                    const targetArcPx = requiredArcPx * HOVER_EXPAND_FACTOR;
                    const targetAngularSize = targetArcPx / hoveredMidR;

                    // Get total angular space for this act/ring by finding act boundaries
                    let actStartAngle = 0;
                    let actEndAngle = 2 * Math.PI;
                    
                    // Simple approximation: if this is act 0,1,2 out of 3, divide circle
                    const actNum = Number(hoveredAct);
                    const NUM_ACTS = 3; // You might want to make this dynamic
                    actStartAngle = (actNum * 2 * Math.PI / NUM_ACTS) - Math.PI / 2;
                    actEndAngle = ((actNum + 1) * 2 * Math.PI / NUM_ACTS) - Math.PI / 2;
                    
                    const totalActSpace = actEndAngle - actStartAngle;
                    
                    // Calculate space for plot slices (they keep their original size)
                    let totalPlotSpace = 0;
                    const plotElements: Element[] = [];
                    actElements.forEach(element => {
                        if (!sceneElements.includes(element)) {
                            // This is a plot slice
                            plotElements.push(element);
                            const plotStart = Number(element.getAttribute('data-start-angle')) || 0;
                            const plotEnd = Number(element.getAttribute('data-end-angle')) || 0;
                            totalPlotSpace += (plotEnd - plotStart);
                        }
                    });
                    
                    const availableSceneSpace = totalActSpace - totalPlotSpace;
                    const spaceForOtherScenes = availableSceneSpace - targetAngularSize;
                    const angularSizeForOtherScenes = spaceForOtherScenes / (sceneElements.length - 1);

                    // Redistribute angles for all elements (scenes and plots)
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
                            // Plot slice (keep original size)
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
                view.registerDomEvent(svg, 'pointermove', (e: PointerEvent) => {
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
            if (this.interactionMode === 'gossamer') {
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
    
    // New helper method to set up scene interactions
    private setupSceneInteractions(group: Element, svgElement: SVGSVGElement, scenes: Scene[]): void {
        // In Gossamer mode, don't add normal scene interactions - they're handled separately
        if (this.interactionMode === 'gossamer') return;
        
        // Find path for click interaction
        const path = group.querySelector(".rt-scene-path");
        if (!path) return;
        
        const encodedPath = group.getAttribute("data-path");
        if (encodedPath && encodedPath !== "") {
            const filePath = decodeURIComponent(encodedPath);
            
            // Set up click handler
            this.registerDomEvent(path, "click", async (evt: MouseEvent) => {
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (!(file instanceof TFile)) return;

                // Intercept for Zero draft mode when conditions match
                if (this.plugin.settings.enableZeroDraftMode) {
                    const cache = this.plugin.app.metadataCache.getFileCache(file);
                    const fm = (cache && cache.frontmatter) ? (cache.frontmatter as Record<string, unknown>) : {};

                    // Case-insensitive lookup helper
                    const getFm = (key: string): unknown => {
                        if (!fm) return undefined;
                        const lower = key.toLowerCase();
                        for (const k of Object.keys(fm)) {
                            if (k.toLowerCase() === lower) return (fm as any)[k];
                        }
                        return undefined;
                    };

                    const stageValue = String(getFm('Publish Stage') ?? 'Zero');
                    const statusValue = String(getFm('Status') ?? 'Todo');

                    const isStageZero = stageValue.trim().toLowerCase() === 'zero';
                    const isStatusComplete = statusValue.trim().toLowerCase() === 'complete';

                    if (isStageZero && isStatusComplete) {
                        evt.preventDefault();
                        evt.stopPropagation();

                        const pendingEdits = String(getFm('Pending Edits') ?? '').trim();
                        const sceneTitle = file.basename || 'Scene';

                        const modal = new ZeroDraftModal(this.app, {
                            titleText: `Pending Edits — ${sceneTitle}`,
                            initialText: pendingEdits,
                            onOk: async (nextText: string) => {
                                try {
                                    await this.plugin.app.fileManager.processFrontMatter(file, (yaml) => {
                                        (yaml as any)['Pending Edits'] = nextText; // keep key; overwrite (may be empty)
                                    });
                                } catch (e) {
                                    new Notice('Failed to save Pending Edits');
                                }
                            },
                            onOverride: async () => {
                                // Open without saving (uses openLinkText to prevent duplicate tabs)
                                await openOrRevealFile(this.plugin.app, file, false);
                            }
                        });

                        modal.open();
                        return; // Do not open the note in this path
                    }
                }

                // Default behavior: open or reveal the note (uses openLinkText to prevent duplicate tabs)
                await openOrRevealFile(this.plugin.app, file, false);
            });
            // Cursor styling handled via CSS (.rt-scene-path)
            
            // Add mouse enter/leave handlers to highlight files in explorer and tabs
            this.registerDomEvent(group, "mouseenter", () => {
                // Disable scene hover in Gossamer mode (but allow plot slices)
                const itemType = group.getAttribute('data-item-type');
                if (this.interactionMode === 'gossamer' && itemType !== 'Plot') return;
                if (filePath && filePath.trim() !== '') {
                    // Verify the file exists before attempting to highlight
                    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                    if (file instanceof TFile) {
                        // this.highlightFileInExplorer(filePath, true); // Removed this line
                    }
                }
            });
            
            this.registerDomEvent(group, "mouseleave", () => {
                // Disable scene hover in Gossamer mode (but allow plot slices)
                const itemType = group.getAttribute('data-item-type');
                if (this.interactionMode === 'gossamer' && itemType !== 'Plot') return;
                if (filePath && filePath.trim() !== '') {
                    // this.highlightFileInExplorer(filePath, false); // Removed this line
                }
            });
        }
        
        // Set up mouseover events for synopses (delegated at svg level; keep only click here)
        const sceneId = path.id;
        let synopsis = svgElement.querySelector(`.rt-scene-info[data-for-scene="${sceneId}"]`);

        // If no synopsis found by exact ID match, try fallback methods
        if (!synopsis && group.hasAttribute("data-path") && group.getAttribute("data-path")) {
            const encodedPath = group.getAttribute("data-path");
            if (encodedPath) {
                const path = decodeURIComponent(encodedPath);
                const matchingSceneIndex = scenes.findIndex(s => s.path === path);
                
                if (matchingSceneIndex > -1) {
                    // Use the index to match against any available synopsis
                    const allSynopses = Array.from(svgElement.querySelectorAll('.rt-scene-info'));
                    
                    // As a fallback, just use the synopsis at the same index if available
                    if (matchingSceneIndex < allSynopses.length) {
                        synopsis = allSynopses[matchingSceneIndex] as Element;
                    }
                }
            }
        }

        // Delegated hover handled at svg level (see above); synopsis use rAF throttle there.
    }
    
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
            const [eventType, selector] = key.split('::');
            if (selector === 'svg') {
                svg.removeEventListener(eventType, handler as EventListenerOrEventListenerObject);
            } else {
                // For element-specific handlers, they'll be cleaned up when elements are removed
            }
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
        
        const view = this;
        let currentGroup: Element | null = null;
        let currentSynopsis: Element | null = null;
        
        const findSynopsisForScene = (sceneId: string): Element | null => {
            return svg.querySelector(`.rt-scene-info[data-for-scene="${sceneId}"]`);
        };
        
        const getSceneIdFromGroup = (group: Element): string | null => {
            const pathEl = group.querySelector('.rt-scene-path') as SVGPathElement | null;
            return pathEl?.id || null;
        };
        
        // 1a. Plot Slice Hover (delegated fallback): Show synopsis, sync dot+spoke
        const plotSliceOver = (e: PointerEvent) => {
            const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Plot"]');
            if (!g) return;
            plotSliceEnter(g as SVGGElement, e);
        };

        // 1b. Plot Slice direct handlers for reliability
        const plotSliceEnter = (g: Element, e: Event) => {
            if (g === currentGroup) return;

            currentGroup = g;
            svg.classList.add('scene-hover');

            const sid = getSceneIdFromGroup(g);
            if (sid) {
                currentSynopsis = findSynopsisForScene(sid);
                if (currentSynopsis) {
                    currentSynopsis.classList.add('rt-visible');
                    view.plugin.updateSynopsisPosition(currentSynopsis, e as unknown as MouseEvent, svg, sid);
                }
            }

            const encodedPath = g.getAttribute('data-path') || '';
            if (encodedPath) {
                const dot = svg.querySelector(`.rt-gossamer-dot[data-path="${encodedPath}"]`) as SVGCircleElement | null;
                if (dot) {
                    dot.classList.add('rt-hover');
                    const beatName = dot.getAttribute('data-beat');
                    if (beatName) {
                        // Show center dot
                        const centerDot = svg.querySelector(`.rt-gossamer-dot-center[data-beat="${beatName}"]`);
                        if (centerDot) centerDot.classList.add('rt-hover');
                        // Highlight spoke
                        const spoke = svg.querySelector(`.rt-gossamer-spoke[data-beat="${beatName}"]`);
                        if (spoke) spoke.classList.add('rt-gossamer-spoke-hover');
                        // Highlight beat outline
                        const beatOutline = svg.querySelector(`.rt-gossamer-beat-outline[data-beat="${beatName}"]`);
                        if (beatOutline) beatOutline.classList.add('rt-hover');
                        // Highlight all historical dots with matching beat name
                        const historicalDots = svg.querySelectorAll(`.rt-gossamer-dot-historical[data-beat="${beatName}"]`);
                        historicalDots.forEach(hd => hd.classList.add('rt-hover'));
                    }
                    g.classList.add('rt-gossamer-hover');
                }
            }
        };
        
        const plotSliceOut = (e: PointerEvent) => {
            if (!currentGroup) return;

            const toEl = e.relatedTarget as Element | null;
            if (toEl && (currentGroup.contains(toEl) ||
                        !!toEl.closest('.rt-gossamer-dot'))) return;

            svg.classList.remove('scene-hover');
            if (currentSynopsis) {
                currentSynopsis.classList.remove('rt-visible');
                currentSynopsis = null;
            }

            const encodedPath = currentGroup.getAttribute('data-path') || '';
            if (encodedPath) {
                const dot = svg.querySelector(`.rt-gossamer-dot[data-path="${encodedPath}"]`) as SVGCircleElement | null;
                if (dot) {
                    dot.classList.remove('rt-hover');
                    const beatName = dot.getAttribute('data-beat');
                    if (beatName) {
                        // Hide center dot
                        const centerDot = svg.querySelector(`.rt-gossamer-dot-center[data-beat="${beatName}"]`);
                        if (centerDot) centerDot.classList.remove('rt-hover');
                        // Remove spoke highlight
                        const spoke = svg.querySelector(`.rt-gossamer-spoke[data-beat="${beatName}"]`);
                        if (spoke) spoke.classList.remove('rt-gossamer-spoke-hover');
                        // Remove beat outline highlight
                        const beatOutline = svg.querySelector(`.rt-gossamer-beat-outline[data-beat="${beatName}"]`);
                        if (beatOutline) beatOutline.classList.remove('rt-hover');
                    }
                    currentGroup.classList.remove('rt-gossamer-hover');
                }
            }

            currentGroup = null;
        };
        
        // 2. Gossamer Dot Hover: Show synopsis, sync plot slice+spoke+center dot
        const dotOver = (e: PointerEvent) => {
            const dot = (e.target as Element).closest('.rt-gossamer-dot') as SVGCircleElement | null;
            if (!dot) return;
            
            dot.classList.add('rt-hover');
            const encodedPath = dot.getAttribute('data-path');
            const beatName = dot.getAttribute('data-beat');
            if (!encodedPath) return;
            
            svg.classList.add('scene-hover');
            
            // Show center dot and highlight beat outline
            if (beatName) {
                const centerDot = svg.querySelector(`.rt-gossamer-dot-center[data-beat="${beatName}"]`);
                if (centerDot) centerDot.classList.add('rt-hover');
                const beatOutline = svg.querySelector(`.rt-gossamer-beat-outline[data-beat="${beatName}"]`);
                if (beatOutline) beatOutline.classList.add('rt-hover');
            }
            
            // Find and highlight the plot slice (both have encoded paths now)
            const plotGroup = svg.querySelector(`.rt-scene-group[data-path="${encodedPath}"]`);
            if (plotGroup) {
                currentGroup = plotGroup;
                plotGroup.classList.add('rt-gossamer-hover');
                
                const sid = getSceneIdFromGroup(plotGroup);
                if (sid) {
                    currentSynopsis = findSynopsisForScene(sid);
                    if (currentSynopsis) {
                        currentSynopsis.classList.add('rt-visible');
                        view.plugin.updateSynopsisPosition(currentSynopsis, e as unknown as MouseEvent, svg, sid);
                    }
                }
            }
            
            // Highlight spoke, beat outline, and historical dots
            if (beatName) {
                const spoke = svg.querySelector(`.rt-gossamer-spoke[data-beat="${beatName}"]`);
                if (spoke) {
                    spoke.classList.add('rt-gossamer-spoke-hover');
                }
                const beatOutline = svg.querySelector(`.rt-gossamer-beat-outline[data-beat="${beatName}"]`);
                if (beatOutline) {
                    beatOutline.classList.add('rt-hover');
                }
                // Highlight all historical dots with matching beat name
                const historicalDots = svg.querySelectorAll(`.rt-gossamer-dot-historical[data-beat="${beatName}"]`);
                historicalDots.forEach(hd => hd.classList.add('rt-hover'));
            }
        };
        
        const dotOut = (e: PointerEvent) => {
            // Remove hover from all historical dots
            svg.querySelectorAll('.rt-gossamer-dot-historical.rt-hover').forEach(hd => hd.classList.remove('rt-hover'));
            const toEl = e.relatedTarget as Element | null;
            // If moving to a plot slice or another dot, keep highlights
            if (toEl && (toEl.closest('.rt-scene-group[data-item-type="Plot"]') || 
                        toEl.closest('.rt-gossamer-dot'))) return;

            svg.classList.remove('scene-hover');

            if (currentSynopsis) {
                currentSynopsis.classList.remove('rt-visible');
                currentSynopsis = null;
            }

            if (currentGroup) {
                currentGroup.classList.remove('rt-gossamer-hover');
                currentGroup = null;
            }

            // Remove all highlights
            svg.querySelectorAll('.rt-gossamer-spoke-hover').forEach(el => {
                el.classList.remove('rt-gossamer-spoke-hover');
            });
            svg.querySelectorAll('.rt-gossamer-dot.rt-hover').forEach(el => {
                el.classList.remove('rt-hover');
            });
            svg.querySelectorAll('.rt-gossamer-dot-center.rt-hover').forEach(el => {
                el.classList.remove('rt-hover');
            });
            svg.querySelectorAll('.rt-gossamer-beat-outline.rt-hover').forEach(el => {
                el.classList.remove('rt-hover');
            });
        };
        
        // 3. Click handlers
        const plotSliceClick = async (e: MouseEvent) => {
            const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Plot"]');
            if (!g) return;
            
            e.stopPropagation(); // Prevent background click-to-exit
            
            const encodedPath = g.getAttribute('data-path');
            if (!encodedPath) return;
            
            const filePath = decodeURIComponent(encodedPath);
            const file = view.plugin.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                await openOrRevealFile(view.plugin.app, file);
            }
        };
        
        const dotClick = async (e: MouseEvent) => {
            const dot = (e.target as Element).closest('.rt-gossamer-dot');
            if (!dot) return;
            
            e.stopPropagation(); // Prevent background click-to-exit
            
            const encodedPath = dot.getAttribute('data-path');
            if (!encodedPath) return;
            
            const path = decodeURIComponent(encodedPath);
            const file = view.plugin.app.vault.getAbstractFileByPath(path);
            if (file instanceof TFile) {
                await openOrRevealFile(view.plugin.app, file);
            }
        };
        
        // 4. Background click to exit Gossamer mode
        const backgroundClick = (e: MouseEvent) => {
            const target = e.target as Element;
            
            // If clicked on dot or plot slice, don't exit (handled by their stopPropagation)
            if (target.closest('.rt-gossamer-dot') || 
                target.closest('.rt-scene-group[data-item-type="Plot"]')) {
                return;
            }
            
            // Exit Gossamer mode
            import('../GossamerCommands').then(({ toggleGossamerMode }) => {
                toggleGossamerMode(view.plugin);
            });
        };
        
        // Register svg-level handlers using registerDomEvent
        // Note: registerDomEvent doesn't support capture phase, so we use regular addEventListener
        // for these specific Gossamer handlers. They will be cleaned up when the view unloads.
        view.registerDomEvent(svg, 'click', plotSliceClick);
        view.registerDomEvent(svg, 'click', dotClick);
        view.registerDomEvent(svg, 'click', backgroundClick);
        
        // For pointerover/out, we need capture phase for proper event ordering
        // These are cleaned up automatically when view unloads
        view.registerDomEvent(svg, 'pointerover', plotSliceOver);
        view.registerDomEvent(svg, 'pointerout', plotSliceOut);
        view.registerDomEvent(svg, 'pointerover', dotOver);
        view.registerDomEvent(svg, 'pointerout', dotOut);
        
        // Store handlers for manual cleanup when switching modes
        this.gossamerEventHandlers.set('pointerover::svg', plotSliceOver as EventListener);
        this.gossamerEventHandlers.set('pointerout::svg', plotSliceOut as EventListener);
        // Additionally, attach direct handlers to each Plot slice group to ensure reliability
        const plotGroups = svg.querySelectorAll('.rt-scene-group[data-item-type="Plot"]');
        plotGroups.forEach((el) => {
            view.registerDomEvent(el, 'pointerenter', (ev) => plotSliceEnter(el, ev));
            view.registerDomEvent(el, 'pointerleave', (ev) => plotSliceOut(ev as PointerEvent));
            view.registerDomEvent(el, 'click', (ev) => plotSliceClick(ev as MouseEvent));
        });
        this.gossamerEventHandlers.set('pointerover::dot::svg', dotOver as EventListener);
        this.gossamerEventHandlers.set('pointerout::dot::svg', dotOut as EventListener);
        this.gossamerEventHandlers.set('click::plot::svg', plotSliceClick as EventListener);
        this.gossamerEventHandlers.set('click::dot::svg', dotClick as EventListener);
        this.gossamerEventHandlers.set('click::bg::svg', backgroundClick as EventListener);
    }
}
