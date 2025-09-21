// --- Imports and constants added for standalone module ---
import { ItemView, WorkspaceLeaf, MarkdownView, TFile, TAbstractFile, Notice } from 'obsidian';
import RadialTimelinePlugin from '../main';
import { escapeRegExp } from '../utils/regex';
import type { Scene } from '../main';
import { PlotLabelManager } from '../utils/plotLabelManager';

// Duplicate of constants defined in main for now. We can consolidate later.
export const TIMELINE_VIEW_TYPE = "radial-timeline";
export const TIMELINE_VIEW_DISPLAY_TEXT = "Radial timeline";

// CONSTANTS: Scene expansion constants
const HOVER_EXPAND_FACTOR = 1.1; // expansion multiplier when text doesn't fit

// For SceneNumberInfo we define a concrete interface matching the fields we store
interface SceneNumberInfo {
  number: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

// Timeline View implementation
export class RadialTimelineView extends ItemView {
    static readonly viewType = TIMELINE_VIEW_TYPE;
    plugin: RadialTimelinePlugin;
    
    // Frontmatter values to track to reduce unnecessary SVG View refreshes
    private lastFrontmatterValues: Record<string, unknown> = {};
    private timelineRefreshTimeout: NodeJS.Timeout | null = null;
        
    // Scene data (scenes)
    sceneData: Scene[] = [];
    
    // Set of open scene paths (for tracking open files)
    openScenePaths: Set<string> = new Set<string>();
    
    constructor(leaf: WorkspaceLeaf, plugin: RadialTimelinePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.openScenePaths = plugin.openScenePaths;
    }
    
    private log<T>(message: string, data?: T) {
        // Disable all debug logging
        return;
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
            clearSearchBtn.addEventListener('click', () => {
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
            setTimeout(() => this.addHighlightRectangles(), 100);
        }
    }
    

    
    private setupMouseCoordinateTracking(container: HTMLElement) {
        if (!this.plugin.settings.debug) return;
        // Wait a bit for the SVG to be fully rendered
        setTimeout(() => {
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
                if (this.timelineRefreshTimeout) clearTimeout(this.timelineRefreshTimeout);
                this.timelineRefreshTimeout = setTimeout(() => {
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
        
        // Iterate through all text elements and replace their content
        // This ensures we completely replace any previous search highlighting
        
        // First, find all subplots to highlight
        const subplotTspans = this.contentEl.querySelectorAll('tspan[data-item-type="subplot"]');
        const searchTerm = this.plugin.searchTerm;
        
        // Create a word boundary regex for exact matches only
        const escapedPattern = escapeRegExp(searchTerm);
        const wordBoundaryRegex = new RegExp(`\\b(${escapedPattern})\\b`, 'gi');
        
        // Process all subplots
        subplotTspans.forEach((tspan: Element) => {
            // Get the original text content
            const originalText = tspan.textContent || '';
            
            // Skip if there's no match
            if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) {
                return;
            }
            
            // Apply highlighting
            const fillColor = tspan.getAttribute('fill');
            
            // Test if we need a word boundary match
            const useWordBoundary = originalText.match(wordBoundaryRegex);
            const regex = useWordBoundary ? wordBoundaryRegex : new RegExp(`(${escapedPattern})`, 'gi');
            
            // Clear previous content
            while (tspan.firstChild) {
                tspan.removeChild(tspan.firstChild);
            }
            
            // Reset regex
            regex.lastIndex = 0;
            
            // Process the text parts
            let lastIndex = 0;
            let match;
            
            while ((match = regex.exec(originalText)) !== null) {
                // Add text before match
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
            
            // Add any remaining text
            if (lastIndex < originalText.length) {
                const textAfter = document.createTextNode(originalText.substring(lastIndex));
                tspan.appendChild(textAfter);
            }
        });
        
        // Now, process all character elements
        const characterTspans = this.contentEl.querySelectorAll('tspan[data-item-type="character"]');
        
        // Process all characters
        characterTspans.forEach((tspan: Element) => {
            // Same logic as for subplots
            const originalText = tspan.textContent || '';
            
            if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) {
                return;
            }
            
            const fillColor = tspan.getAttribute('fill');
            const useWordBoundary = originalText.match(wordBoundaryRegex);
            const regex = useWordBoundary ? wordBoundaryRegex : new RegExp(`(${escapedPattern})`, 'gi');
            
            while (tspan.firstChild) {
                tspan.removeChild(tspan.firstChild);
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
        
        // Also highlight matches in synopsis hover titles
        const synopsisTitles = this.contentEl.querySelectorAll('svg .scene-info text.info-text.rt-title-text-main');
        synopsisTitles.forEach((titleEl: Element) => {
            const originalText = titleEl.textContent || '';
            if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
            const fillColor = (titleEl as SVGTextElement).getAttribute('fill');
            const regex = wordBoundaryRegex;
            // Clear existing children
            while (titleEl.firstChild) titleEl.removeChild(titleEl.firstChild);
            regex.lastIndex = 0;
            let lastIndex = 0; let match;
            while ((match = regex.exec(originalText)) !== null) {
                if (match.index > lastIndex) {
                    titleEl.appendChild(document.createTextNode(originalText.substring(lastIndex, match.index)));
                }
                const highlightSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                highlightSpan.setAttribute('class', 'rt-search-term');
                if (fillColor) highlightSpan.setAttribute('fill', fillColor);
                highlightSpan.textContent = match[0];
                titleEl.appendChild(highlightSpan);
                lastIndex = match.index + match[0].length;
            }
            if (lastIndex < originalText.length) {
                titleEl.appendChild(document.createTextNode(originalText.substring(lastIndex)));
            }
        });
        
        // Check for scene groups that should be highlighted
        const allSceneGroups = this.contentEl.querySelectorAll('.scene-group');
        this.log(`Found ${allSceneGroups.length} scene groups to check for search matches`);
        
        // Add search-result class to all matching scene paths
        allSceneGroups.forEach((group: Element) => {
            const pathAttr = group.getAttribute('data-path');
            if (pathAttr && this.plugin.searchResults.has(decodeURIComponent(pathAttr))) {
                // Find the number square in this group
                const numberSquare = group.querySelector('.rt-number-square');
                const numberText = group.querySelector('.rt-number-text');
                
                if (numberSquare) {
                    numberSquare.classList.add('search-result');
                    this.log(`Added search-result class to number square for ${pathAttr}`);
                }
                
                if (numberText) {
                    numberText.classList.add('search-result');
                }
            }
        });
    }
    
    async createTestSceneFile(): Promise<void> {
        // --- Sanitize the configured source path so we don't accidentally create
        //     duplicate folders when a trailing slash or whitespace is present
        //     1. Trim leading/trailing whitespace
        //     2. Remove a leading slash so the path is relative to the vault root
        //     3. Remove a trailing slash (if any)

        let sourcePath = (this.plugin.settings.sourcePath || "").trim();
        if (sourcePath.startsWith("/")) {
            sourcePath = sourcePath.slice(1);
        }

        if (sourcePath.endsWith("/")) {
            sourcePath = sourcePath.slice(0, -1);
        }

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
BeatsUpdate: 
Book:
---

# Test Scene

This is a test scene created to help with initial Radial timeline setup.

`;
        
        // Generate a unique filename
        const filename = `${targetPath ? targetPath + "/" : ""}1 Test Scene.md`;
        
        try {
            // Create the file
            await this.plugin.app.vault.create(filename, testSceneContent);
            new Notice(`Created test scene file: ${filename}`);
            
            // Refresh the timeline after a short delay to allow metadata cache to update
            setTimeout(() => {
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
            if (sourcePath.startsWith("/")) sourcePath = sourcePath.slice(1);
            if (sourcePath.endsWith("/")) sourcePath = sourcePath.slice(0, -1);

            let messageText: string;

            if (sourcePath === "") {
                // No folder configured at all
                messageText = "No source folder has been configured in the Radial timeline plugin settings. Please choose a folder that will hold your scene notes or leave blank to use the root of your vault.";
            } else {
                const folderExists = !!this.plugin.app.vault.getAbstractFileByPath(sourcePath);
                if (folderExists) {
                    // Folder exists, just no scenes inside it
                    messageText = `No scene files were found in “${sourcePath}”.`;
                } else {
                    // Folder path set but doesn't exist yet
                    messageText = `The folder “${sourcePath}” does not exist in your vault yet.`;
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

            demoButton.addEventListener("click", async () => {
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
            
            // Create the SVG element from the string
            const svgElement = this.createSvgElement(svgString, timelineContainer); // Pass svgString
            
            if (svgElement) {
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
                    let rotated = false;
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
                        rotated = !rotated;
                        applyRotation();
                    });
                }

                // Post-layout adjustment: prevent plot label overlap and add separators
                const scheduleLabelAdjust = () => PlotLabelManager.adjustPlotLabels(svgElement);
                // Delay to ensure layout is ready for accurate measurements + re-run on visibility/resize
                let adjustPending = false;
                const debouncedAdjust = () => {
                    if (adjustPending) return;
                    adjustPending = true;
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        scheduleLabelAdjust();
                        adjustPending = false;
                    }));
                };
                debouncedAdjust();
                const visibilityHandler = () => {
                    if (document.visibilityState === 'visible') debouncedAdjust();
                };
                this.registerDomEvent(document, 'visibilitychange', visibilityHandler);
                if ((window as any).ResizeObserver) {
                    const ro = new (window as any).ResizeObserver(() => debouncedAdjust());
                    // Ensure any previous observer is disconnected to avoid stacking observers
                    const selfAny = this as unknown as { _plotLabelRO?: ResizeObserver };
                    if (selfAny._plotLabelRO) {
                        try { selfAny._plotLabelRO.disconnect(); } catch {}
                    }
                    ro.observe(svgElement);
                    selfAny._plotLabelRO = ro as unknown as ResizeObserver;
                    this.register(() => {
                        try { ro.disconnect(); } catch {}
                        if (selfAny._plotLabelRO === ro) delete selfAny._plotLabelRO;
                    });
                }
                // Performance optimization: Use batch operations where possible
                const allSynopses = Array.from(svgElement.querySelectorAll(".scene-info"));
                const sceneGroups = Array.from(svgElement.querySelectorAll(".scene-group"));
                
                
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
                            group.classList.add("scene-is-open");
                            
                                // Mark the scene path element
                            const scenePath = group.querySelector(".scene-path");
                            if (scenePath) {
                                scenePath.classList.add("scene-is-open");
                            }
                            
                            // Mark the scene title text if present
                            const sceneTitle = group.querySelector(".scene-title");
                            if (sceneTitle) {
                                sceneTitle.classList.add("scene-is-open");
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
                        window.requestAnimationFrame(() => processSceneGroups(endIdx));
                    }
                };
                
                // Start processing scene groups in chunks
                processSceneGroups(0);
                
                // All synopses default to the CSS-defined hidden state (opacity 0, pointer-events none)
                allSynopses.forEach(synopsis => {
                    synopsis.classList.remove('visible');
                });
                
                // Setup search controls after SVG is rendered
                this.setupSearchControls();

                // --- START: Add hover effect for scene paths to fade subplot labels ---
                // Reuse the existing sceneGroups variable declared earlier
                // const sceneGroups = svgElement.querySelectorAll('.scene-group'); // REMOVE this redeclaration
                const subplotLabels = svgElement.querySelectorAll<SVGTextElement>('.subplot-label-text'); // Use type assertion

                if (subplotLabels.length > 0) {
                    const onEnterLeave = (hovering: boolean, targetGroup: Element | null) => {
                        if (!targetGroup) return;
                        subplotLabels.forEach(label => {
                            if (hovering) label.classList.add('non-selected'); else label.classList.remove('non-selected');
                        });
                    };
                    const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement;
                    if (svg) {
                        let lastHoverGroup: Element | null = null;
                        svg.addEventListener('pointerover', (e: PointerEvent) => {
                            const g = (e.target as Element).closest('.scene-group');
                            if (g && g !== lastHoverGroup) {
                                onEnterLeave(true, g);
                                lastHoverGroup = g;
                            }
                        });
                        svg.addEventListener('pointerout', (e: PointerEvent) => {
                            const g = (e.target as Element).closest('.scene-group');
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
                    const all = svg.querySelectorAll('.scene-path, .rt-number-square, .rt-number-text, .scene-title, .grade-border-line');
                    all.forEach(el => el.classList.remove('selected', 'non-selected'));
                    if (currentSynopsis) currentSynopsis.classList.remove('visible');
                    currentGroup = null; currentSynopsis = null; currentSceneId = null;
                };

                const applySelection = (group: Element, sceneId: string) => {
                    const pathEl = group.querySelector('.scene-path');
                    if (pathEl) (pathEl as Element).classList.add('selected');
                    const numberSquare = svg.querySelector(`.rt-number-square[data-scene-id="${sceneId}"]`);
                    if (numberSquare) numberSquare.classList.add('selected');
                    const numberText = svg.querySelector(`.rt-number-text[data-scene-id="${sceneId}"]`);
                    if (numberText) numberText.classList.add('selected');
                    const gradeLine = svg.querySelector(`.grade-border-line[data-scene-id="${sceneId}"]`);
                    if (gradeLine) gradeLine.classList.add('selected');
                    const sceneTitle = group.querySelector('.scene-title');
                    if (sceneTitle) sceneTitle.classList.add('selected');

                    const related = new Set<Element>();
                    const currentPathAttr = group.getAttribute('data-path');
                    if (currentPathAttr) {
                        const matches = svg.querySelectorAll(`[data-path="${currentPathAttr}"]`);
                        matches.forEach(mg => {
                            if (mg === group) return;
                            const rp = mg.querySelector('.scene-path'); if (rp) related.add(rp);
                            const rt = mg.querySelector('.scene-title'); if (rt) related.add(rt);
                            const rid = (rp as SVGPathElement | null)?.id;
                            if (rid) {
                                const rsq = svg.querySelector(`.rt-number-square[data-scene-id="${rid}"]`); if (rsq) related.add(rsq);
                                const rtx = svg.querySelector(`.rt-number-text[data-scene-id="${rid}"]`); if (rtx) related.add(rtx);
                            }
                        });
                    }
                    const all = svg.querySelectorAll('.scene-path, .rt-number-square, .rt-number-text, .scene-title, .grade-border-line');
                    all.forEach(el => {
                        if (!el.classList.contains('selected') && !related.has(el)) el.classList.add('non-selected');
                    });
                };

                const getSceneIdFromGroup = (group: Element): string | null => {
                    const pathEl = group.querySelector('.scene-path') as SVGPathElement | null;
                    return pathEl?.id || null;
                };

                const findSynopsisForScene = (sceneId: string): Element | null => {
                    return svg.querySelector(`.scene-info[data-for-scene="${sceneId}"]`);
                };

                

                svg.addEventListener('pointerover', (e: PointerEvent) => {
                    const g = (e.target as Element).closest('.scene-group');
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
                        currentSynopsis.classList.add('visible');
                        view.plugin.updateSynopsisPosition(currentSynopsis, e as unknown as MouseEvent, svg, sid);
                    }
                    
                    // Only trigger expansion for regular scenes (not plot elements)
                    const sceneTitle = g.querySelector('.scene-title');
                    if (sceneTitle) {
                        redistributeActScenes(g);
                    }
                });

                svg.addEventListener('pointerout', (e: PointerEvent) => {
                    const toEl = e.relatedTarget as Element | null;
                    
                    // Check if we're moving within the current group
                    if (currentGroup && toEl && currentGroup.contains(toEl)) return;
                    
                    // Reset expansion if we had a scene expanded
                    if (currentGroup) {
                        const sceneTitle = currentGroup.querySelector('.scene-title');
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
                    svg.querySelectorAll('.scene-group').forEach((group: Element) => {
                        const start = Number(group.getAttribute('data-start-angle')) || 0;
                        const end = Number(group.getAttribute('data-end-angle')) || 0;
                        originalAngles.set(group.id, { start, end });
                        
                        // Store original number square transforms
                        const scenePathEl = group.querySelector('.scene-path') as SVGPathElement;
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
                        const path = group.querySelector('.scene-path') as SVGPathElement;
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
                        const scenePathEl = group.querySelector('.scene-path') as SVGPathElement;
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
                        svg.querySelectorAll('.scene-group').forEach((group: Element) => {
                            if (group.getAttribute('data-act') === hoveredAct && 
                                group.getAttribute('data-ring') === hoveredRing) {
                                const path = group.querySelector('.scene-path');
                                if (path) {
                                    actElements.push(group);
                                    // Track which ones are scenes (have titles) vs plot slices
                                    const sceneTitle = group.querySelector('.scene-title');
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
                    const hoveredSceneTitle = hoveredGroup.querySelector('.scene-title');
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
                        const path = group.querySelector('.scene-path') as SVGPathElement;
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
                        const scenePathEl = group.querySelector('.scene-path') as SVGPathElement;
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
                svg.addEventListener('pointermove', (e: PointerEvent) => {
                    if (rafId !== null) return;
                    rafId = window.requestAnimationFrame(() => onMove(e));
                });
            })(this);
            // --- end delegated hover ---
            
        } catch (error) {
            console.error("Error rendering timeline:", error);
            container.createEl("div", {
                text: "Error rendering timeline. Check console for details."
            });
        }
    }
    
    // New helper method to set up scene interactions
    private setupSceneInteractions(group: Element, svgElement: SVGSVGElement, scenes: Scene[]): void {
        // Find path for click interaction
        const path = group.querySelector(".scene-path");
        if (!path) return;
        
        const encodedPath = group.getAttribute("data-path");
        if (encodedPath && encodedPath !== "") {
            const filePath = decodeURIComponent(encodedPath);
            
            // Set up click handler
            path.addEventListener("click", () => {
                const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                if (file instanceof TFile) {
                    // Check if the file is already open in any leaf
                    const leaves = this.plugin.app.workspace.getLeavesOfType("markdown");
                    const existingLeaf = leaves.find(leaf => {
                        const viewState = leaf.getViewState();
                        return viewState.state?.file === file.path;
                    });
                    
                    if (existingLeaf) {
                        // If the file is already open, just reveal that leaf
                        this.plugin.app.workspace.revealLeaf(existingLeaf);
                    } else {
                        // Open in a new tab
                        const leaf = this.plugin.app.workspace.getLeaf('tab');
                        leaf.openFile(file);
                    }
                }
            });
            // Cursor styling handled via CSS (.scene-path)
            
            // Add mouse enter/leave handlers to highlight files in explorer and tabs
            group.addEventListener("mouseenter", () => {
                if (filePath && filePath.trim() !== '') {
                    // Verify the file exists before attempting to highlight
                    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                    if (file instanceof TFile) {
                        // this.highlightFileInExplorer(filePath, true); // Removed this line
                    }
                }
            });
            
            group.addEventListener("mouseleave", () => {
                if (filePath && filePath.trim() !== '') {
                    // this.highlightFileInExplorer(filePath, false); // Removed this line
                }
            });
        }
        
        // Set up mouseover events for synopses (delegated at svg level; keep only click here)
        const sceneId = path.id;
        let synopsis = svgElement.querySelector(`.scene-info[data-for-scene="${sceneId}"]`);

        // If no synopsis found by exact ID match, try fallback methods
        if (!synopsis && group.hasAttribute("data-path") && group.getAttribute("data-path")) {
            const encodedPath = group.getAttribute("data-path");
            if (encodedPath) {
                const path = decodeURIComponent(encodedPath);
                const matchingSceneIndex = scenes.findIndex(s => s.path === path);
                
                if (matchingSceneIndex > -1) {
                    // Use the index to match against any available synopsis
                    const allSynopses = Array.from(svgElement.querySelectorAll('.scene-info'));
                    
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
                    // When unhighlighting, we don't need to do anything special
                    // The hover effect disappears naturally when mouse leaves
                    // But we can restore focus to the timeline view if needed
                    if (this.plugin.activeTimelineView) {
                        this.plugin.app.workspace.trigger('active-leaf-change', this.plugin.activeTimelineView.leaf);
                    }
                }
            }
        } catch (error) {
            this.log(`Error highlighting file: ${error}`);
        }
    }
    
    // Property to track tab highlight timeout
    private _tabHighlightTimeout: NodeJS.Timeout | null = null;
}
