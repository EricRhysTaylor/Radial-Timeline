// --- Imports and constants added for standalone module ---
import { ItemView, WorkspaceLeaf, MarkdownView, TFile, TAbstractFile, Notice } from 'obsidian';
import ManuscriptTimelinePlugin from '../main';
import { escapeRegExp } from '../utils/regex';

// Duplicate of constants defined in main for now. We can consolidate later.
export const TIMELINE_VIEW_TYPE = "manuscript-timeline";
export const TIMELINE_VIEW_DISPLAY_TEXT = "Manuscript timeline";

// TEMP generic type aliases until shared types file exists
type Scene = any;
type SceneNumberInfo = any;

// Timeline View implementation
export class ManuscriptTimelineView extends ItemView {
    static readonly viewType = TIMELINE_VIEW_TYPE;
    plugin: ManuscriptTimelinePlugin;
    
    // Frontmatter values to track to reduce unnecessary SVG View refreshes
    private lastFrontmatterValues: Record<string, any> = {};
    private timelineRefreshTimeout: NodeJS.Timeout | null = null;
        
    // Scene data (scenes)
    sceneData: Scene[] = [];
    
    // Set of open scene paths (for tracking open files)
    openScenePaths: Set<string> = new Set<string>();
    
    constructor(leaf: WorkspaceLeaf, plugin: ManuscriptTimelinePlugin) {
        super(leaf);
        this.plugin = plugin;
        this.openScenePaths = plugin.openScenePaths;
    }
    
    private log(message: string, data?: any) {
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

    // Add this method to handle search indicator clicks
    private setupSearchControls(): void {
        const clearSearchBtn = this.contentEl.querySelector('.clear-search-btn');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                this.plugin.clearSearch();
            });
        }
    }
    
    updateOpenFilesTracking(): void {
        this.log('Running open files tracking check...');
        
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
            if (layout && layout.leaves) {
                const leafIds = Object.keys(layout.leaves as Record<string, any>);
                
                // Try to find any additional file paths from the layout
                leafIds.forEach(id => {
                    // @ts-ignore - Access the layout structure which may not be fully typed
                    const leafData = layout.leaves[id];
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
        
        // Log a summary instead of individual files
        if (openFilesList.length > 0) {
            this.log(`Found ${openFilesList.length} open files: ${openFilesList.join(', ')}`);
        } else {
            this.log('No open files found');
        }
        
        // Check if the open files have changed
        let hasChanged = false;
        
        // Different size means something changed
        if (previousOpenFiles.size !== this.openScenePaths.size) {
            this.log(`Open files count changed from ${previousOpenFiles.size} to ${this.openScenePaths.size}`);
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
            this.log('Open files changed, refreshing timeline...');
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
            cls: "loading-message",
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
                
                // Count SVG elements if debug mode is enabled
                if (this.plugin.settings.debug) {
                    this.countSvgElements(container);
                    this.setupMouseCoordinateTracking(container);
                }
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
    
    /**
     * Count all SVG elements and log to console for debugging
     */
    private countSvgElements(container: HTMLElement) {
        if (!this.plugin.settings.debug) return;
        setTimeout(() => {
            const svg = container.querySelector('.manuscript-timeline-svg') as SVGSVGElement;
            
            if (!svg) {
                console.log('Could not find SVG element for counting');
                return;
            }
            
            // Count all SVG elements by type
            const elementCounts: Record<string, number> = {};
            const allElements = svg.querySelectorAll('*');
            let totalCount = 0;
            
            allElements.forEach(el => {
                const tagName = el.tagName.toLowerCase();
                elementCounts[tagName] = (elementCounts[tagName] || 0) + 1;
                totalCount++;
            });
            
            // Log the counts
            console.log(`SVG Elements Count (Total: ${totalCount}):`);
            Object.entries(elementCounts)
                .sort((a, b) => b[1] - a[1]) // Sort by count, descending
                .forEach(([tagName, count]) => {
                    console.log(`  ${tagName}: ${count}`);
                });
            
            // Add count to debug display if it exists
            const debugText = svg.querySelector('#element-count-text');
            if (debugText) {
                (debugText as SVGTextElement).textContent = `SVG Elements: ${totalCount}`;
            }
        }, 500); // Wait for SVG to fully render
    }
    
    private setupMouseCoordinateTracking(container: HTMLElement) {
        if (!this.plugin.settings.debug) return;
        // Wait a bit for the SVG to be fully rendered
        setTimeout(() => {
            // Get SVG and text elements
            const svg = container.querySelector('.manuscript-timeline-svg') as SVGSVGElement;
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
            svg.removeEventListener('mousemove', updateCoordinates as any);
            svg.addEventListener('mousemove', updateCoordinates);
            
            // Also log coordinates on click
            svg.addEventListener('click', (e: MouseEvent) => {
                // Only log if debug mode is active
                if (!this.plugin.settings.debug) return;
                
                try {
                    const pt = svg.createSVGPoint();
                    pt.x = e.clientX;
                    pt.y = e.clientY;
                    
                    const svgP = pt.matrixTransform(svg.getScreenCTM()?.inverse());
                    if (svgP) {
                        console.log('Clicked at SVG coordinates:', Math.round(svgP.x), Math.round(svgP.y));
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
            document.addEventListener('visibilitychange', () => {
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
                
                // Check if this is a scene file (Class: Scene)
                const fm = cache.frontmatter;
                const isScene = (fm.Class === 'Scene') || (fm.class === 'Scene');
                if (!isScene) return;
                
                // Check if this is a frontmatter change
                const fileId = file.path;
                const currentFrontmatter = JSON.stringify(cache.frontmatter);
                const previousFrontmatter = this.lastFrontmatterValues[fileId];
                
                // Update our stored value regardless
                this.lastFrontmatterValues[fileId] = currentFrontmatter;
                
                // If values are the same, no need to trigger refresh
                if (previousFrontmatter === currentFrontmatter) return;
                
                // Log only meaningful changes
                this.log('Scene frontmatter changed for file: ' + file.path);
                
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
                highlightSpan.setAttribute("class", "search-term");
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
                highlightSpan.setAttribute("class", "search-term");
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
        
        // Check for scene groups that should be highlighted
        const allSceneGroups = this.contentEl.querySelectorAll('.scene-group');
        this.log(`Found ${allSceneGroups.length} scene groups to check for search matches`);
        
        // Add search-result class to all matching scene paths
        allSceneGroups.forEach((group: Element) => {
            const pathAttr = group.getAttribute('data-path');
            if (pathAttr && this.plugin.searchResults.has(decodeURIComponent(pathAttr))) {
                // Find the number square in this group
                const numberSquare = group.querySelector('.number-square');
                const numberText = group.querySelector('.number-text');
                
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
        const sourcePath = this.plugin.settings.sourcePath || "";
        let targetPath = sourcePath;
        
        // Make sure the folder exists
        if (sourcePath && !this.plugin.app.vault.getAbstractFileByPath(sourcePath)) {
            try {
                // Try to create the folder if it doesn't exist
                await this.plugin.app.vault.createFolder(sourcePath);
            } catch (error) {
                console.error(`Failed to create folder: ${sourcePath}`, error);
                new Notice(`Failed to create folder: ${sourcePath}`);
                return;
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
When: 1969-04-17
Character:
  - Janet Rollins
Place:
  - Earth
  - San Diego
Words: 1
Publish Stage: Zero
Status: Complete
Due: 2025-05-17
Total Time: 2
Revision: 2
Pending Edits: 
---

# Test Scene

This is a test scene created to help troubleshoot the Manuscript Timeline plugin.

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
            container.createEl("div", {
                text: "No scenes found. Please check your source path in the settings."
            });
            this.log("No scenes found. Source path:", this.plugin.settings.sourcePath);
            
            // Add button to create a test scene file
            const testButton = container.createEl("button", {
                text: "Create a Test Scene File",
                cls: "action-button"
            });
            
            // Styles now defined in CSS
            
            testButton.addEventListener("click", async () => {
                await this.createTestSceneFile();
            });
            
            return;
        }
        
        this.log(`Found ${scenes.length} scenes to render`);
        
        this.sceneData = scenes;

        // Performance optimization: Create DocumentFragment to minimize reflows
        const fragment = document.createDocumentFragment();
        const timelineContainer = document.createElement("div");
        timelineContainer.className = "manuscript-timeline-container";
        fragment.appendChild(timelineContainer);
        
        try {
            // Generate the SVG content and get the max stage color
            const startTime = performance.now();
            const { svgString, maxStageColor: calculatedMaxStageColor } = this.plugin.createTimelineSVG(scenes);

            // Expose the dominant publish-stage colour to CSS so rules can use var(--max-publish-stage-color)
            if (calculatedMaxStageColor) {
                document.documentElement.style.setProperty('--max-publish-stage-color', calculatedMaxStageColor);
            }
            
            // Create the SVG element from the string
            const svgElement = this.createSvgElement(svgString, timelineContainer); // Pass svgString
            
            if (svgElement) {
                // Performance optimization: Use batch operations where possible
                const allSynopses = Array.from(svgElement.querySelectorAll(".scene-info"));
                const sceneGroups = Array.from(svgElement.querySelectorAll(".scene-group"));
                
                this.log(`Found ${sceneGroups.length} scene groups to check against ${this.openScenePaths.size} open files`);
                
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
                                    const numberSquare = svgElement.querySelector(`.number-square[data-scene-id="${sceneId}"]`);
                            if (numberSquare) {
                                numberSquare.classList.add("scene-is-open");
                            }
                            
                                    const numberText = svgElement.querySelector(`.number-text[data-scene-id="${sceneId}"]`);
                            if (numberText) {
                                numberText.classList.add("scene-is-open");
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
                
                // Hide all synopses initially (in batch for performance)
                allSynopses.forEach(synopsis => {
                    (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.opacity = "0";
                    (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.pointerEvents = "none";
                });
                
                // Setup search controls after SVG is rendered
                this.setupSearchControls();

                // Apply dynamic font size for subplot labels after SVG is in the DOM
                const subplotLabelGroups = svgElement.querySelectorAll('.subplot-label-group');
                subplotLabelGroups.forEach(group => {
                    const fontSize = group.getAttribute('data-font-size');
                    if (fontSize) {
                        (group as HTMLElement).style.setProperty('--subplot-font-size', `${fontSize}px`);
                    }
                });

                // --- START: Add hover effect for scene paths to fade subplot labels ---
                // Reuse the existing sceneGroups variable declared earlier
                // const sceneGroups = svgElement.querySelectorAll('.scene-group'); // REMOVE this redeclaration
                const subplotLabels = svgElement.querySelectorAll<SVGTextElement>('.subplot-label-text'); // Use type assertion

                if (subplotLabels.length > 0) { // Only add listeners if subplot labels exist
                    // Attach listeners to GROUPS (using the existing sceneGroups variable)
                    sceneGroups.forEach(group => {
                        group.addEventListener('mouseenter', () => {
                            subplotLabels.forEach(label => {
                                label.classList.add('non-selected'); // Use standard class
                            });
                        });

                        group.addEventListener('mouseleave', () => {
                            subplotLabels.forEach(label => {
                                label.classList.remove('non-selected'); // Use standard class
                            });
                        });
                    });
                    if (this.plugin.settings.debug) this.plugin.log(`Added hover listeners to ${sceneGroups.length} scene groups to fade ${subplotLabels.length} subplot labels using .non-selected.`);
                }
                // --- END: Add hover effect for scene paths ---
            }
                
            // Add the fragment to the container
            container.appendChild(fragment);
            
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
            (path as SVGElement & {style: CSSStyleDeclaration}).style.cursor = "pointer";
            
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
        
        // Set up mouseover events for synopses
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

        if (synopsis) {
            // Performance optimization: Use a debounced mousemove handler instead of directly updating
            let timeoutId: number | null = null;
            
            // Apply mouseover effects for the group/path
            group.addEventListener("mouseenter", (event: MouseEvent) => {
                // Reset all previous mouseover effects to ensure clean state
                const allElements = svgElement.querySelectorAll('.scene-path, .number-square, .number-text, .scene-title, .grade-border-line'); // <<< Added grade-border-line here
                allElements.forEach(element => {
                    // Remove only the selected and non-selected classes, but keep the scene-is-open class
                    element.classList.remove('selected', 'non-selected');
                });
                
                // Highlight the current scene path and related elements
                const currentPath = group.querySelector('.scene-path');
                if (currentPath) {
                    currentPath.classList.add('selected');
                    
                    // Also highlight the number square and text
                    const sceneId = path.id;
                    const numberSquare = svgElement.querySelector(`.number-square[data-scene-id="${sceneId}"]`);
                    const numberText = svgElement.querySelector(`.number-text[data-scene-id="${sceneId}"]`);
                    const gradeLine = svgElement.querySelector(`.grade-border-line[data-scene-id="${sceneId}"]`); // <<< Find the grade line
                    
                    if (numberSquare) {
                        numberSquare.classList.add('selected');
                    }
                    
                    if (numberText) {
                        numberText.classList.add('selected');
                    }

                    // <<< NEW: Add selected class to grade line if it exists
                    if (gradeLine) {
                        gradeLine.classList.add('selected'); 
                        // We also implicitly prevent non-selected from being added later by including it in `allElements` 
                        // and removing non-selected initially, and then adding selected here.
                    }
                    
                    // Highlight the scene title
                    const sceneTitle = group.querySelector('.scene-title');
                    if (sceneTitle) {
                        sceneTitle.classList.add('selected');
                    }
                }
                
                // Make other scenes less prominent, but preserve has-edits styling
                allElements.forEach(element => {
                    if (!element.classList.contains('selected')) {
                        // Apply non-selected class to all non-hovered elements.
                        element.classList.add('non-selected');
                    }
                });
                
                // Make the tooltip visible
                synopsis.classList.add('visible');
                (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.opacity = "1";
                (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.pointerEvents = "all";
                
                // Update position on initial hover
                const svg = svgElement.closest('svg') as SVGSVGElement;
                this.plugin.updateSynopsisPosition(synopsis, event, svg, sceneId);
            });
            
            // Use mousemove with debounce to improve performance
            group.addEventListener("mousemove", (event: MouseEvent) => {
                if (timeoutId) {
                    window.clearTimeout(timeoutId);
                }
                
                timeoutId = window.setTimeout(() => {
                    const svg = svgElement.closest('svg') as SVGSVGElement;
                    this.plugin.updateSynopsisPosition(synopsis, event, svg, sceneId);
                    timeoutId = null;
                }, 50); // 50ms debounce
            });
            
            group.addEventListener("mouseleave", () => {
                if (timeoutId) {
                    window.clearTimeout(timeoutId);
                    timeoutId = null;
                }
                
                // Hide the tooltip
                synopsis.classList.remove('visible');
                (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.opacity = "0";
                (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.pointerEvents = "none";
                
                // Reset all element states
                const allElements = svgElement.querySelectorAll('.scene-path, .number-square, .number-text, .scene-title, .grade-border-line'); // <<< Added grade-border-line here
                allElements.forEach(element => {
                    element.classList.remove('selected', 'non-selected');
                });

                // REMOVED the explicit re-addition of non-selected to all grade lines
                // const allGradeLines = svgElement.querySelectorAll('.grade-border-line');
                // allGradeLines.forEach(line => line.classList.add('non-selected'));
            });
        }
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
                        const explorerView = fileExplorer.view as any;
                        if (explorerView.revealInFolder) {
                            // SAFE: Using Obsidian's API
                            explorerView.revealInFolder(file);
                        }
                    }
                    
                    // If we want to flash the file in the explorer without actually opening it
                    // We can trigger a temporary focus event
                    // this.plugin.app.workspace.trigger('file-menu', file, null); // <--- Commented out: Causes TypeError: e.addItem is not a function

                    // Focus on any open instance of this file in the editor
                    const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
                    const matchingLeaf = leaves.find(leaf => {
                        const state = leaf.getViewState();
                        return state.state?.file === file.path;
                    });
                    
                    if (matchingLeaf) {
                        // Just trigger focus events without actually switching
                        /*this.plugin.app.workspace.trigger('hover-link', {
                            event: null,
                            source: 'timeline',
                            hoverParent: null,
                            targetEl: null,
                            linktext: file.path
                        });*/
                    }
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