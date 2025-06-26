import { App, Plugin, Notice, Setting, PluginSettingTab, TFile, TAbstractFile, WorkspaceLeaf, ItemView, MarkdownView, MarkdownRenderer, TextComponent, Modal, ButtonComponent, requestUrl, Editor, parseYaml, stringifyYaml, Menu, MenuItem, Platform, DropdownComponent, Component } from "obsidian";
import { escapeRegExp } from './utils/regex';
import { hexToRgb, rgbToHsl, hslToRgb, rgbToHex, desaturateColor } from './utils/colour';
import { decodeHtmlEntities, parseSceneTitleComponents, renderSceneTitleComponents } from './utils/text';
import SynopsisManager from './SynopsisManager';
import { createTimelineSVG } from './renderer/TimelineRenderer';
import { ManuscriptTimelineView } from './view/TimeLineView';
import { ManuscriptTimelineSettingsTab } from './settings/SettingsTab';


// Declare the variable that will be injected by the build process
declare const EMBEDDED_README_CONTENT: string;

// Import the new beats update function <<< UPDATED IMPORT
import { processByManuscriptOrder, processBySubplotOrder, testYamlUpdateFormatting } from './BeatsCommands';

interface ManuscriptTimelineSettings {
    sourcePath: string;
    publishStageColors: {
        Zero: string;
        Author: string;
        House: string;
        Press: string;
    };
    logApiInteractions: boolean; // <<< ADDED: Setting to log API calls to files
    processedBeatContexts: string[]; // <<< ADDED: Cache for processed triplets
    debug: boolean; // Add debug setting
    targetCompletionDate?: string; // Optional: Target date as yyyy-mm-dd string
    openaiApiKey?: string; // <<< ADDED: Optional OpenAI API Key
    anthropicApiKey?: string; // <<< ADDED: Anthropic API Key
    anthropicModelId?: string; // <<< ADDED: Selected Anthropic Model ID
    defaultAiProvider?: 'openai' | 'anthropic'; // <<< ADDED: Default AI provider
    openaiModelId?: string; // <<< ADDED: Selected OpenAI Model ID
    // Optional: Store the fetched models list to avoid refetching?
    // availableOpenAiModels?: { id: string, description?: string }[];
}

// Constants for the view
export const TIMELINE_VIEW_TYPE = "manuscript-timeline";
const TIMELINE_VIEW_DISPLAY_TEXT = "Manuscript timeline"; // Use sentence case

export interface Scene {
    title?: string;
    date: string;
    path?: string;
    subplot?: string;
    act?: string;
    characters?: string[];
    pov?: string;
    location?: string;
    number?: number;
    synopsis?: string;
    when?: Date; // Keep for backward compatibility 
    actNumber?: number; // Keep for backward compatibility
    Character?: string[]; // Keep for backward compatibility
    status?: string | string[]; // Add status property
    "Publish Stage"?: string; // Add publish stage property
    due?: string; // Add due date property
    pendingEdits?: string; // Add pending edits property
    "1beats"?: string; // Add 1beats property
    "2beats"?: string; // Add 2beats property 
    "3beats"?: string; // Add 3beats property
}

// Add this interface to store scene number information for the scene square and synopsis
interface SceneNumberInfo {
    number: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

export const DEFAULT_SETTINGS: ManuscriptTimelineSettings = {
    sourcePath: '',
    publishStageColors: {
        Zero: '#9E70CF',   // Purple (Stage Zero)
        Author: '#5E85CF', // Blue   (Author)
        House: '#DA7847',  // Orange (House)
        Press: '#6FB971'   // Green  (Press)
    },
    logApiInteractions: false, // <<< ADDED: Default for new setting
    processedBeatContexts: [], // <<< ADDED: Default empty array
    debug: false,
    targetCompletionDate: undefined, // Ensure it's undefined by default
    openaiApiKey: '', // Default to empty string
    anthropicApiKey: '', // <<< ADDED: Default empty string
    anthropicModelId: 'claude-4-sonnet', // <<< ADDED: Default to latest Sonnet
    defaultAiProvider: 'openai', // <<< ADDED: Default to OpenAI
    openaiModelId: 'gpt-4o' // <<< ADDED: Default to gpt-4o
};

//a primary color for each status - references CSS variables
const STATUS_COLORS = {
    "Working": "var(--color-working)",
    "Todo": "var(--color-todo)",
    "Empty": "var(--color-empty)",  // Light gray
    "Due": "var(--color-due)",
    "Complete": "var(--color-complete)" // Complete status
};

const NUM_ACTS = 3;


// Helper functions for safe SVG creation - add at the top of the file
function createSvgElement(tag: string, attributes: Record<string, string> = {}, classes: string[] = []): SVGElement {
    const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
    
    // Set attributes
    for (const [key, value] of Object.entries(attributes)) {
        element.setAttribute(key, value);
    }
    
    // Add classes
    if (classes.length > 0) {
        element.classList.add(...classes);
    }
    
    return element;
}

function createSvgText(content: string, x: string | number, y: string | number, classes: string[] = []): SVGTextElement {
    const text = createSvgElement("text", { x: x.toString(), y: y.toString() }) as SVGTextElement;
    
    // Add classes
    if (classes.length > 0) {
        text.classList.add(...classes);
    }
    
    // Set text content safely
    if (content) {
        if (content.includes('<tspan')) {
            // For content with tspan elements, we need to parse and add each element
            // Create a temporary container
            const parser = new DOMParser();
            // Ensure the content is properly escaped except for tspan tags
            const safeContent = content
                .replace(/&(?!(amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;))/g, '&amp;')
                .replace(/</g, (match, offset) => {
                    // Only allow <tspan and </tspan
                    return content.substring(offset, offset + 6) === '<tspan' || 
                           content.substring(offset, offset + 7) === '</tspan' ? '<' : '&lt;';
                })
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
                
            const doc = parser.parseFromString(`<svg><text>${safeContent}</text></svg>`, 'image/svg+xml');
            const parsedText = doc.querySelector('text');
            
            if (parsedText) {
                // Copy all child nodes
                while (parsedText.firstChild) {
                    text.appendChild(parsedText.firstChild);
                }
            } else {
                // Fallback to simple text if parsing failed
                text.textContent = content;
            }
        } else {
            // For plain text, just set the content
            text.textContent = content;
        }
    }
    
    return text;
}

function createSvgTspan(content: string, classes: string[] = []): SVGTSpanElement {
    const tspan = createSvgElement("tspan") as SVGTSpanElement;
    
    // Add classes
    if (classes.length > 0) {
        tspan.classList.add(...classes);
    }
    
    // Set text content safely - escape any potential HTML/XML
    if (content) {
        tspan.textContent = content;
    }
    
    return tspan;
}

function formatNumber(num: number): string {
    if (Math.abs(num) < 0.001) return "0";
    return num.toFixed(3).replace(/\.?0+$/, '');
}

function parseSceneTitle(title: string): { number: string; text: string } {
    if (!title) {
        return { number: "0", text: "" };
    }
    
    // Extract the scene number from the beginning of the title
    const match = title.match(/^(\d+(\.\d+)?)\s+(.+)/);
    
    if (match) {
        // Get number and text parts
        const number = match[1]; // The first capture group (number)
        let text = match[3];     // The third capture group (text)
        
        // Escape XML entities in the text to make it safe for SVG
        text = text.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;')
                  .replace(/'/g, '&apos;');
        
        return { number, text };
    }
    
    // If no number was found, return the whole title as text
    // Escape XML entities
    const safeTitle = title.replace(/&/g, '&amp;')
                         .replace(/</g, '&lt;')
                         .replace(/>/g, '&gt;')
                         .replace(/"/g, '&quot;')
                         .replace(/'/g, '&apos;');
    
    return { number: "0", text: safeTitle };
}

// Helper function for XML escaping (moved outside class to be accessible to all)
function escapeXml(unsafe: string): string {
    return unsafe
        .replace(/&(?!(amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;))/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// Helper function to calculate angle for a given date
function dateToAngle(date: Date): number {
    const startOfYear = new Date(date.getFullYear(), 0, 1);
    const dayOfYear = (date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24);
    const daysInYear = (new Date(date.getFullYear(), 11, 31).getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24) + 1;
    const progress = dayOfYear / daysInYear;
    return (progress * 2 * Math.PI) - (Math.PI / 2); // Offset by -90deg to start at top
}

// Helper function to create a properly formatted SVG arc path
function createSvgArcPath(startAngle: number, endAngle: number, radius: number, largeArcFlag: number = 0): string {
    // Calculate start and end points
    const startX = radius * Math.cos(startAngle);
    const startY = radius * Math.sin(startAngle);
    const endX = radius * Math.cos(endAngle);
    const endY = radius * Math.sin(endAngle);
    
    // Create standardized arc path
    return `
        M ${startX} ${startY}
        A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}
    `;
}

/**
 * Create SVG elements for scene title with optional search highlighting
 * @param titleComponents The parsed title components
 * @param fragment The document fragment to append elements to
 * @param searchTerm Optional search term for highlighting
 * @param titleColor Optional color for the title text
 */


/**
 * Highlights search terms in regular text content
 * @param text The text to highlight search terms in
 * @param searchTerm The search term to highlight
 * @param fragment The document fragment to append elements to
 */
function highlightSearchTermsInText(text: string, searchTerm: string, fragment: DocumentFragment): void {
    if (!text || !searchTerm) {
        // If no text or search term, just add the text as is
        if (text) fragment.appendChild(document.createTextNode(text));
        return;
    }
    
    // Create safe regex for searching
    const escapedPattern = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedPattern})`, 'gi');
    
    // Process character by character for precise highlighting
    let lastIndex = 0;
    let match;
    
    // Reset regex to start from beginning
    regex.lastIndex = 0;
    
    while ((match = regex.exec(text)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
            const textBefore = document.createTextNode(text.substring(lastIndex, match.index));
            fragment.appendChild(textBefore);
        }
        
        // Add the highlighted match
        const highlight = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        highlight.setAttribute("class", "search-term");
        highlight.textContent = match[0];
        fragment.appendChild(highlight);
        
        lastIndex = match.index + match[0].length;
    }
    
    // Add any remaining text
    if (lastIndex < text.length) {
        const textAfter = document.createTextNode(text.substring(lastIndex));
        fragment.appendChild(textAfter);
    }
}

export default class ManuscriptTimelinePlugin extends Plugin {
    settings: ManuscriptTimelineSettings;
    
    // View reference
    activeTimelineView: ManuscriptTimelineView | null = null;

    // Track open scene paths
    openScenePaths: Set<string> = new Set<string>();
    
    // Search related properties
    searchTerm: string = '';
    searchActive: boolean = false;
    searchResults: Set<string> = new Set<string>();
    
    // --- Add variables to store latest estimate stats --- START ---
    latestTotalScenes: number = 0;
    latestRemainingScenes: number = 0;
    latestScenesPerWeek: number = 0;
    // --- Add variables to store latest estimate stats --- END ---
    
    // Add a synopsisManager instance
    public synopsisManager: SynopsisManager;
    
    // Add property to store the latest status counts for completion estimate
    public latestStatusCounts?: Record<string, number>;
    
    /**
     * Position and curve the text elements in the SVG
     * @param container The container element with the SVG
     */
    curveTextElements(container: Element, curveFactor: number, angleToCenter: number): void {
        // Find all text elements inside the container
        const textElements = container.querySelectorAll('text');
        if (!textElements.length) return;
    
        // Apply the curvature to each text element
        textElements.forEach((textEl) => {
            try {
                // Create a curved path effect for this text
                const pathId = `path-${Math.random().toString(36).substring(2, 9)}`;
                
                // Create a curved path element
                const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                pathElement.setAttribute('id', pathId);
                pathElement.setAttribute('d', `M 0,0 Q ${Math.cos(angleToCenter) * 500},${Math.sin(angleToCenter) * 500 * curveFactor} 1000,0`);
                pathElement.setAttribute('fill', 'none');
                // Use CSS class instead of inline style
                pathElement.classList.add('svg-path');
                
                // Add the path to the container before the text
                textEl.parentNode?.insertBefore(pathElement, textEl);
                
                // Link the text to the path
                textEl.setAttribute('path', `url(#${pathId})`);
                textEl.setAttribute('pathLength', '1');
                textEl.setAttribute('startOffset', '0');
            } catch (error) {
                console.error('Error applying text curvature:', error);
            }
        });
    }
    
    // Add helper method to highlight search terms
    public highlightSearchTerm(text: string): string {
        if (!this.searchActive || !this.searchTerm || !text) {
            return text;
        }

        // First decode any HTML entities that might be in the text
        const decodedText = decodeHtmlEntities(text);

        // Create safe regex for searching
        const escapedPattern = escapeRegExp(this.searchTerm);
        const regex = new RegExp(`(${escapedPattern})`, 'gi');
        
        // Use DocumentFragment for DOM manipulation
        const fragment = document.createDocumentFragment();
        
        // Special handling for title lines containing scene number and date
        // Title format is typically: "SceneNumber SceneTitle   Date"
        if (decodedText.includes('   ') && !decodedText.includes('<tspan')) {
            // Handle title lines directly with the same approach as other text
            // Split the title and date
            const dateMatch = decodedText.match(/\s{3,}(.+?)$/);
            
            if (dateMatch) {
                // Get title part without the date
                const titlePart = decodedText.substring(0, dateMatch.index).trim();
                const datePart = dateMatch[1].trim();
                
                // Extract scene number from title part
            const titleMatch = titlePart.match(/^(\d+(\.\d+)?)\s+(.+)$/);
            
            if (titleMatch) {
                    // We have a scene number + title format
                const sceneNumber = titleMatch[1];
                    const titleText = titleMatch[3];
                    
                    // Add scene number as a separate tspan
                    const numberTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                    numberTspan.setAttribute("font-weight", "bold");
                    numberTspan.textContent = `${sceneNumber} `;
                    fragment.appendChild(numberTspan);
                    
                    // Highlight the title text and append directly to the main fragment
                    highlightSearchTermsInText(titleText, this.searchTerm, fragment);
                    
                    // Add 4 spaces *after* the highlighted title content
                    fragment.appendChild(document.createTextNode('    '));
                    
                    // Add the date part
                    const dateTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                    dateTspan.setAttribute("class", "date-text");
                    dateTspan.textContent = datePart;
                    fragment.appendChild(dateTspan);
            } else {
                    // No scene number, just the title text and date
                    // Highlight the title text and append directly to the main fragment
                    highlightSearchTermsInText(titlePart, this.searchTerm, fragment);
                    
                    // Add spacer *after* the highlighted title content
                    fragment.appendChild(document.createTextNode('    '));
                    
                    // Add the date part
                    const dateTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                    dateTspan.setAttribute("class", "date-text");
                    dateTspan.textContent = datePart;
                    fragment.appendChild(dateTspan);
                }
            } else {
                // No date separator found, treat as regular text and highlight
                highlightSearchTermsInText(decodedText, this.searchTerm, fragment);
            }
            
            // Convert fragment to string using XMLSerializer
            return this.serializeFragment(fragment);
        }
        
        // Special handling for metadata text (subplots and characters)
        if (decodedText.includes(',') && !decodedText.includes('<tspan') && !decodedText.includes('<')) {
            // This is a raw metadata line (comma-separated items)
            
            // Split by commas to process each item separately
            const items = decodedText.split(/, */);
            
            // Process each item and create appropriate DOM elements
            items.forEach((item, i) => {
                if (i > 0) {
                    // Add comma and space for separator (except before first item)
                    fragment.appendChild(document.createTextNode(', '));
                }
                
                // Highlight search terms in this item
                highlightSearchTermsInText(item, this.searchTerm, fragment);
            });
            
            // Convert fragment to string using XMLSerializer
            return this.serializeFragment(fragment);
        }
        
        // Check if text already contains tspan with fill attributes (metadata lines)
        if (decodedText.includes('<tspan') && decodedText.includes('fill=')) {
            // Parse the existing HTML structure using DOMParser
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><text>${decodedText}</text></svg>`, 'image/svg+xml');
            
            // Check for parsing errors
            if (doc.querySelector('parsererror')) {
                // Parsing failed, return original text
                return decodedText;
            }
            
            // Process each tspan separately
            const textElement = doc.querySelector('text');
            if (!textElement) return decodedText;
            
            const tspans = textElement.querySelectorAll('tspan');
            Array.from(tspans).forEach(tspan => {
                const originalContent = tspan.textContent || '';
                const fillColor = tspan.getAttribute('fill');
                
                // Clear tspan content
                while (tspan.firstChild) {
                    tspan.removeChild(tspan.firstChild);
                }
                
                // Create a temporary fragment for this tspan's content
                const tspanFragment = document.createDocumentFragment();
                
                // Highlight search terms in this tspan's content
                highlightSearchTermsInText(originalContent, this.searchTerm, tspanFragment);
                
                // Apply the fill color to all highlight spans if needed
                if (fillColor) {
                    const highlights = tspanFragment.querySelectorAll('.search-term');
                    Array.from(highlights).forEach(highlight => {
                        highlight.setAttribute('fill', fillColor);
                    });
                }
                
                // Add the processed content to the tspan
                tspan.appendChild(tspanFragment);
            });
            
            // Extract the processed HTML using XMLSerializer
            const serializer = new XMLSerializer();
            const result = serializer.serializeToString(textElement);
            
            // Remove the outer <text></text> tags
            return result.replace(/<text[^>]*>|<\/text>/g, '');
        }
        
        // Regular processing for text without tspans (synopsis lines)
        highlightSearchTermsInText(decodedText, this.searchTerm, fragment);
        
        // Convert fragment to string using XMLSerializer
        return this.serializeFragment(fragment);
    }
    
    // Helper method to serialize DocumentFragment to string
    private serializeFragment(fragment: DocumentFragment): string {
        // Create a temporary SVG text element
        const textElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
        
        // Clone the fragment and append to the text element
        textElement.appendChild(fragment.cloneNode(true));
        
        // Use XMLSerializer to convert to string
        const serializer = new XMLSerializer();
        const result = serializer.serializeToString(textElement);
        
        // Remove the outer <text></text> tags
        return result.replace(/<text[^>]*>|<\/text>/g, '');
    }

    private processHighlightedContent(fragment: DocumentFragment): Node[] {
        // Create a temporary container using Obsidian's createEl
        const container = document.createElement('div');
        container.appendChild(fragment.cloneNode(true));
        
        // Extract all nodes from the container
        const resultNodes: Node[] = [];
        
        // Process each child node
        Array.from(container.childNodes).forEach(node => {
            if (node.nodeType === Node.TEXT_NODE) {
                // For text nodes, create plain text nodes
                if (node.textContent) {
                    resultNodes.push(document.createTextNode(node.textContent));
                }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                // For element nodes (like tspan), create SVG elements
                const element = node as Element;
                if (element.tagName.toLowerCase() === 'tspan') {
                    const svgTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                    
                    // Copy attributes
                    Array.from(element.attributes).forEach(attr => {
                        svgTspan.setAttribute(attr.name, attr.value);
                    });
                    
                    svgTspan.textContent = element.textContent;
                    resultNodes.push(svgTspan);
                }
            }
        });
        
        return resultNodes;
    }

    async onload() {
        await this.loadSettings();

        // Initialize SynopsisManager
        this.synopsisManager = new SynopsisManager(this);

        // Set CSS variables for publish stage colors
        this.setCSSColorVariables();
        
        // Register the view
        this.registerView(
            TIMELINE_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => {
                this.log('Creating new ManuscriptTimelineView');
                return new ManuscriptTimelineView(leaf, this);
            }
        );
        
        // Add ribbon icon
        this.addRibbonIcon('shell', 'Manuscript Timeline', () => {
            this.activateView();
        });

        // Add commands
        this.addCommand({
            id: 'open-timeline-view',
            name: 'Open', // Sentence case
            callback: () => {
                this.activateView();
            }
        });

        this.addCommand({
            id: 'search-timeline',
            name: 'Search timeline', // Sentence case
            callback: () => {
                this.openSearchPrompt();
            }
        });

        this.addCommand({
            id: 'clear-timeline-search',
            name: 'Clear search', // Sentence case
            callback: () => {
                this.clearSearch();
            }
        });

        // Add settings tab
        this.addSettingTab(new ManuscriptTimelineSettingsTab(this.app, this));
        
        // Register event for metadata changes
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                this.log('Metadata changed for file: ' + file.path);
                // Refresh timeline when metadata changes
                this.refreshTimelineIfNeeded(file);
            })
        );
        
        // Listen for tab changes and file manager interactions using Obsidian's events
        // This is more reliable than DOM events
        
        // Track active file changes
        this.registerEvent(
            this.app.workspace.on('file-open', (file: TFile | null) => {
                if (file) {
                    this.log('File opened: ' + file.path);
                    // When a file is opened, highlight it in the timeline
                    this.highlightSceneInTimeline(file.path, true);
                    
                    // Store a reference to clear the highlight when another file is opened
                    if (this._lastHighlightedFile && this._lastHighlightedFile !== file.path) {
                        this.highlightSceneInTimeline(this._lastHighlightedFile, false);
                    }
                    this._lastHighlightedFile = file.path;
                }
            })
        );
        
        // Track file explorer hover using DOM events since Obsidian doesn't have specific events for this
        this.registerDomEvent(document, 'mouseover', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const fileItem = target.closest('.nav-file-title');
            if (fileItem) {
                const navFile = fileItem.closest('.nav-file');
                if (navFile) {
                    const filePath = navFile.getAttribute('data-path');
                    if (filePath) {
                        // DEBUG: Always log the mouseover event to help diagnose issues
                        if (this.settings.debug) {
                            console.log(`DEBUG: Mouseover detected on file in explorer: ${filePath}`);
                        }
                        
                        // Store current hover path to avoid redundant processing
                        if (this._currentHoverPath === filePath) {
                            if (this.settings.debug) {
                                console.log(`DEBUG: Skipping (already hovering): ${filePath}`);
                            }
                            return;
                        }
                        this._currentHoverPath = filePath;
                        
                        // Only highlight if the file exists in the vault
                        const file = this.app.vault.getAbstractFileByPath(filePath);
                        if (file instanceof TFile) {
                            // Check if this is a scene file by looking at cached scene data
                            const isSceneFile = this.isSceneFile(filePath);
                            if (this.settings.debug) {
                                console.log(`DEBUG: File ${filePath} is ${isSceneFile ? '' : 'NOT '}a scene file`);
                            }
                            
                            if (isSceneFile) {
                                this.log(`Hovering over scene file: ${filePath}`);
                                this.highlightSceneInTimeline(filePath, true);
                            }
                        } else {
                            if (this.settings.debug) {
                                console.log(`DEBUG: File not found in vault: ${filePath}`);
                            }
                        }
                    }
                }
            }
        });
        
        this.registerDomEvent(document, 'mouseout', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const fileItem = target.closest('.nav-file-title');
            if (fileItem) {
                const navFile = fileItem.closest('.nav-file');
                if (navFile) {
                    const filePath = navFile.getAttribute('data-path');
                    if (filePath && this._currentHoverPath === filePath) {
                        if (this.settings.debug) {
                            console.log(`DEBUG: Mouseout detected on file: ${filePath}`);
                        }
                        this._currentHoverPath = null;
                        
                        // Only unhighlight if it was a scene file
                        const isSceneFile = this.isSceneFile(filePath);
                        if (isSceneFile) {
                            this.highlightSceneInTimeline(filePath, false);
                        }
                    }
                }
            }
        });
        
        // Also track tab hover using a similar approach
        this.registerDomEvent(document, 'mouseover', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const tabHeader = target.closest('.workspace-tab-header');
            if (tabHeader) {
                const tabId = tabHeader.getAttribute('data-tab-id');
                if (tabId) {
                    if (this.settings.debug) {
                        console.log(`DEBUG: Mouseover detected on tab: ${tabId}`);
                    }
                    const leaf = this.app.workspace.getLeafById(tabId);
                    if (leaf) {
                        const state = leaf.getViewState();
                        const filePath = state?.state?.file as string | undefined;
                        if (filePath && state?.type === 'markdown') {
                            if (this.settings.debug) {
                                console.log(`DEBUG: Tab contains markdown file: ${filePath}`);
                            }
                            
                            // Avoid redundant processing
                            if (this._currentTabHoverPath === filePath) {
                                if (this.settings.debug) {
                                    console.log(`DEBUG: Skipping tab (already hovering): ${filePath}`);
                                }
                                return;
                            }
                            this._currentTabHoverPath = filePath;
                            
                            // Only highlight if it's a scene file
                            const isSceneFile = this.isSceneFile(filePath);
                            if (this.settings.debug) {
                                console.log(`DEBUG: Tab file ${filePath} is ${isSceneFile ? '' : 'NOT '}a scene file`);
                            }
                            
                            if (isSceneFile) {
                                this.highlightSceneInTimeline(filePath, true);
                            }
                        } else {
                            if (this.settings.debug) {
                                console.log(`DEBUG: Tab is not a markdown file or has no file path`);
                            }
                        }
                    } else {
                        if (this.settings.debug) {
                            console.log(`DEBUG: No leaf found for tab ID: ${tabId}`);
                        }
                    }
                }
            }
        });
        
        this.registerDomEvent(document, 'mouseout', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const tabHeader = target.closest('.workspace-tab-header');
            if (tabHeader) {
                const tabId = tabHeader.getAttribute('data-tab-id');
                if (tabId) {
                    const leaf = this.app.workspace.getLeafById(tabId);
                    if (leaf) {
                        const state = leaf.getViewState();
                        const filePath = state?.state?.file as string | undefined;
                        if (filePath && state?.type === 'markdown' && this._currentTabHoverPath === filePath) {
                            this._currentTabHoverPath = null;
                            
                            // Only unhighlight if it was a scene file
                            const isSceneFile = this.isSceneFile(filePath);
                            if (isSceneFile) {
                                this.highlightSceneInTimeline(filePath, false);
                            }
                        }
                    }
                }
            }
        });
        
        // Track workspace layout changes to update our view
        this.registerEvent(
            this.app.workspace.on('layout-change', () => {
                this.updateOpenFilesTracking();
            })
        );

        // --- ADD NEW COMMANDS --- 
        this.addCommand({
            id: 'update-beats-manuscript-order',
            name: 'Update flagged beats (manuscript order)',
            callback: async () => {
                const apiKey = this.settings.openaiApiKey;
                if (!apiKey || apiKey.trim() === '') {
                    new Notice('OpenAI API key is not set in settings.');
                    return;
                }
                // <<< Wrap console.log with debug check >>>
                if (this.settings.debug) {
                    console.log(`[Manuscript Timeline] Update Beats command initiated. Using sourcePath: "${this.settings.sourcePath}"`);
                }
                new Notice(`Using source path: "${this.settings.sourcePath || '(Vault Root)'}"`); // Keep Notice visible

                try {
                     new Notice('Starting Manuscript Order update...');
                     await processByManuscriptOrder(this, this.app.vault);
                } catch (error) {
                    console.error("Error running Manuscript Order beat update:", error);
                    new Notice("❌ Error during Manuscript Order update.");
                }
            }
        });

        this.addCommand({
            id: 'update-beats-subplot-order',
            name: 'Update flagged beats (subplot order)',
            callback: async () => {
                const apiKey = this.settings.openaiApiKey;
                if (!apiKey || apiKey.trim() === '') {
                    new Notice('OpenAI API key is not set in settings.');
                    return;
                }
                // <<< Wrap console.log with debug check >>>
                if (this.settings.debug) {
                    console.log(`[Manuscript Timeline] Update Beats command initiated. Using sourcePath: "${this.settings.sourcePath}"`);
                }
                new Notice(`Using source path: "${this.settings.sourcePath || '(Vault Root)'}"`); // Keep Notice visible
                
                try {
                    new Notice('Starting Subplot Order update...');
                    await processBySubplotOrder(this, this.app.vault);
                } catch (error) {
                    console.error("Error running Subplot Order beat update:", error);
                    new Notice("❌ Error during Subplot Order update.");
                }
            }
        });

        // Add settings tab
        this.addSettingTab(new ManuscriptTimelineSettingsTab(this.app, this));

        // Register event listeners
        this.registerEvent(this.app.workspace.on('layout-change', () => { this.updateOpenFilesTracking(); }));
        this.registerEvent(this.app.metadataCache.on('changed', (file) => { this.refreshTimelineIfNeeded(file); }));
        this.registerEvent(this.app.vault.on('delete', (file) => { this.refreshTimelineIfNeeded(file); }));
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.handleFileRename(file, oldPath)));



        this.app.workspace.onLayoutReady(() => {
            this.setCSSColorVariables(); // Set initial colors
            this.updateOpenFilesTracking(); // Track initially open files
        });

         // Register file open/close events
        this.registerEvent(this.app.workspace.on('file-open', (file) => {
            if (file) {
                 // Check if the opened file is within the sourcePath
                if (this.isSceneFile(file.path)) {
                    this.openScenePaths.add(file.path);
                     this.highlightSceneInTimeline(file.path, true);
                 } 
            } else {
                // Handle case where no file is open (e.g., closing the last tab)
                // Potentially clear highlights or update state
            }
            this.refreshTimelineIfNeeded(null); // Refresh potentially needed on file change
        }));

        this.registerEvent(this.app.workspace.on('layout-change', () => {
            this.updateOpenFilesTracking();
            this.refreshTimelineIfNeeded(null);
        }));

        // Listen for changes, deletions, renames
        this.registerEvent(this.app.vault.on('modify', (file) => this.refreshTimelineIfNeeded(file)));
        this.registerEvent(this.app.vault.on('delete', (file) => this.refreshTimelineIfNeeded(file)));
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.handleFileRename(file, oldPath)));

        // Theme change listener
        this.registerEvent(this.app.workspace.on('css-change', () => {
            this.setCSSColorVariables();
            this.refreshTimelineIfNeeded(null); // Timeline might need redraw if colors change
        }));

         // Setup hover listeners
        this.setupHoverListeners();

        // Initial status bar update
        this.updateStatusBar(); 
        
        console.log('Manuscript Timeline Plugin Loaded');

        // <<< ADDED: Command for Beats API testing (DEBUG ONLY) >>>
        if (this.settings.debug) { // Wrap with this check
            this.addCommand({
                id: 'test-yaml-update-format',
                name: 'Test YAML at AITestDummyScene.md',
                callback: async () => {
                    // Call the exported test function
                    await testYamlUpdateFormatting(this, this.app.vault);
                }
            });
        } // End the debug check wrap
        // <<< END ADDED >>>
        
        this.addCommand({
            id: 'clear-processed-beats-cache', 
            name: 'Clear beats cache', // Use sentence case
            callback: async () => {
                const initialCount = this.settings.processedBeatContexts.length;
                if (initialCount === 0) {
                    new Notice('Beats processing cache is already empty.');
                    return;
                }
                this.settings.processedBeatContexts = []; // Clear the array
                await this.saveSettings(); // Save the change
                new Notice(`Cleared ${initialCount} cached beat contexts. You can now re-run beat processing.`);
                this.log(`User cleared processed beats cache. Removed ${initialCount} items.`);
            }
        });

    }
    
    // Store paths of current hover interactions to avoid redundant processing
    private _currentHoverPath: string | null = null;
    private _currentTabHoverPath: string | null = null;
    private _lastHighlightedFile: string | null = null;
    
    // Helper method to check if a file is a scene in the timeline
    private isSceneFile(filePath: string): boolean {
        if (!this.activeTimelineView) {
            return false;
        }
        
        try {
            // If we have a scene cache, check against it
            const scenes = this.activeTimelineView['sceneData'] || [];
            
            if (scenes.length === 0) {
                // If no scene data available, check the SVG directly
                const container = this.activeTimelineView.contentEl.querySelector('.manuscript-timeline-container');
                if (!container) {
                    return false;
                }
                
                const svgElement = container.querySelector('svg') as SVGSVGElement;
                if (!svgElement) {
                    return false;
                }
                
                // Try direct path match
                let encodedPath = encodeURIComponent(filePath);
                let sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);
                
                // Try with or without leading slash
                if (!sceneGroup && filePath.startsWith('/')) {
                    const altPath = filePath.substring(1);
                    encodedPath = encodeURIComponent(altPath);
                    sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);
                } else if (!sceneGroup && !filePath.startsWith('/')) {
                    const altPath = '/' + filePath;
                    encodedPath = encodeURIComponent(altPath);
                    sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);
                }
                
                return !!sceneGroup;
            }
            
            // Check if any scene has this path
            const matchingScene = scenes.find(scene => {
                if (!scene.path) return false;
                
                // Match with or without leading slash
                if (scene.path === filePath) return true;
                if (scene.path.startsWith('/') && scene.path.substring(1) === filePath) return true;
                if (!scene.path.startsWith('/') && '/' + scene.path === filePath) return true;
                
                return false;
            });
            
            return !!matchingScene;
        } catch (error) {
            this.log(`Error checking if file is a scene: ${error}`);
            return false;
        }
    }
    
    // Helper method to highlight a scene in the timeline when hovering over a file
    private highlightSceneInTimeline(filePath: string, isHighlighting: boolean): void {
        if (!filePath || !this.activeTimelineView) {
            return;
        }
        
        this.log(`${isHighlighting ? 'Highlighting' : 'Unhighlighting'} scene in timeline for file: ${filePath}`);
        
        try {
            // Get the SVG container element
            const container = this.activeTimelineView.contentEl.querySelector('.manuscript-timeline-container');
            if (!container) {
                return;
            }
            
            const svgElement = container.querySelector('svg') as SVGSVGElement;
            if (!svgElement) {
                return;
            }
            
            // First, we should reset any previous highlighting if we're highlighting a new scene
            if (isHighlighting) {
                // Remove existing highlights to start with a clean state
                const allElements = svgElement.querySelectorAll('.scene-path, .number-square, .number-text, .scene-title');
                allElements.forEach(element => {
                    element.classList.remove('selected', 'non-selected');
                });
            }
            
            // Try different path matching strategies to find the scene
            let foundScene = false;
            
            // Strategy 1: Direct path match
            let encodedPath = encodeURIComponent(filePath);
            let sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);
            
            // Strategy 2: Try with or without leading slash
            if (!sceneGroup && filePath.startsWith('/')) {
                const altPath = filePath.substring(1);
                encodedPath = encodeURIComponent(altPath);
                sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);
            } else if (!sceneGroup && !filePath.startsWith('/')) {
                const altPath = '/' + filePath;
                encodedPath = encodeURIComponent(altPath);
                sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);
            }
            
            if (sceneGroup) {
                foundScene = true;
                
                if (isHighlighting) {
                    // Highlight this scene by adding the 'selected' class to its elements
                    const currentPath = sceneGroup.querySelector('.scene-path');
                    if (currentPath) {
                        currentPath.classList.add('selected');
                        
                        // Also highlight the scene number and title
                        const sceneId = currentPath.id;
                        
                        const numberSquare = svgElement.querySelector(`.number-square[data-scene-id="${sceneId}"]`);
                        const numberText = svgElement.querySelector(`.number-text[data-scene-id="${sceneId}"]`);
                        
                        if (numberSquare) {
                            numberSquare.classList.add('selected');
                        }
                        
                        if (numberText) {
                            numberText.classList.add('selected');
                        }
                        
                        // Highlight the scene title
                        const sceneTitle = sceneGroup.querySelector('.scene-title');
                        if (sceneTitle) {
                            sceneTitle.classList.add('selected');
                        }
                        
                        // Make other scenes less prominent
                        const allScenePaths = svgElement.querySelectorAll('.scene-path:not(.selected)');
                        allScenePaths.forEach(element => {
                            element.classList.add('non-selected');
                        });
                        
                        // Make the tooltip visible if it exists
                        const synopsis = svgElement.querySelector(`.scene-info[data-for-scene="${sceneId}"]`);
                        if (synopsis) {
                            synopsis.classList.add('visible');
                        }
                    }
                } else {
                    // Reset highlighting
                    const allElements = svgElement.querySelectorAll('.scene-path, .number-square, .number-text, .scene-title');
                    allElements.forEach(element => {
                        element.classList.remove('selected', 'non-selected');
                    });
                    
                    // Hide any visible synopsis
                    const currentPath = sceneGroup.querySelector('.scene-path');
                    if (currentPath) {
                        const sceneId = currentPath.id;
                        const synopsis = svgElement.querySelector(`.scene-info[data-for-scene="${sceneId}"]`);
                        if (synopsis) {
                            synopsis.classList.remove('visible');
                        }
                    }
                }
            }
            
            if (!foundScene) {
                this.log(`No scene found in timeline matching path: ${filePath}`);
            }
        } catch (error) {
            this.log(`Error highlighting scene in timeline: ${error}`);
        }
    }
    
    // Helper to activate the timeline view
    async activateView() {
        // Check if view already exists
        const leaves = this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE);
        
        if (leaves.length > 0) {
            // View exists, just reveal it
            this.app.workspace.revealLeaf(leaves[0]);
            return;
        }
        
        // Create a new leaf in the center (main editor area)
        const leaf = this.app.workspace.getLeaf('tab');
        await leaf.setViewState({
            type: TIMELINE_VIEW_TYPE,
            active: true
        });
        
        // Reveal the leaf
        this.app.workspace.revealLeaf(leaf);
    }

    // Method to generate timeline (legacy HTML method - will be removed later)

    // Public method to get scene data
    async getSceneData(): Promise<Scene[]> {
        // Find markdown files in vault that match the filters
        const files = this.app.vault.getMarkdownFiles().filter(file => {
            // If sourcePath is empty, include all files, otherwise only include files in the sourcePath
            if (this.settings.sourcePath) {
                return file.path.startsWith(this.settings.sourcePath);
            }
            return true;
        });

        const scenes: Scene[] = [];
    
        for (const file of files) {
            try {
            const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
                
                if (metadata && metadata.Class === "Scene") {
                // Fix for date shift issue - ensure dates are interpreted as UTC
                const whenStr = metadata.When;
                
                // Directly parse the date in a way that preserves the specified date regardless of timezone
                // Use a specific time (noon UTC) to avoid any date boundary issues
                const when = new Date(`${whenStr}T12:00:00Z`);
                
                if (!isNaN(when.getTime())) {
                    // Split subplots if provided, otherwise default to "Main Plot"
                    const subplots = metadata.Subplot
                        ? Array.isArray(metadata.Subplot) 
                            ? metadata.Subplot 
                            : [metadata.Subplot]
                        : ["Main Plot"];
                    
                    // Read actNumber from metadata, default to 1 if missing
                    const actNumber = metadata.Act !== undefined ? Number(metadata.Act) : 1;
    
                    // Ensure actNumber is a valid number between 1 and 3
                    const validActNumber = (actNumber >= 1 && actNumber <= 3) ? actNumber : 1;
    
                    // Parse Character metadata - it might be a string or array
                    let characters = metadata.Character;
                    if (characters) {
                        // Convert to array if it's a string
                        if (!Array.isArray(characters)) {
                            characters = [characters];
                        }
                        // Clean up the internal link format (remove [[ and ]])
                        characters = characters.map((char: string) => char.replace(/[\[\]]/g, ''));
                    } else {
                            characters = [];
                    }
    
                    // Create a separate entry for each subplot
                    subplots.forEach(subplot => {
                        scenes.push({
                            title: metadata.Title || file.basename,
                                date: when.toISOString(),
                                path: file.path,
                            subplot: subplot,
                                act: validActNumber.toString(),
                                characters: characters,
                                pov: metadata.Pov,
                                location: metadata.Place,
                                number: validActNumber,
                                synopsis: metadata.Synopsis,
                                when: when,
                            actNumber: validActNumber,
                                Character: characters,
                                status: metadata.Status,
                                "Publish Stage": metadata["Publish Stage"],
                                due: metadata.Due,
                                pendingEdits: metadata["Pending Edits"],
                                "1beats": typeof metadata["1beats"] === 'string' ? metadata["1beats"] : String(metadata["1beats"]),
                                "2beats": typeof metadata["2beats"] === 'string' ? metadata["2beats"] : String(metadata["2beats"]), 
                                "3beats": typeof metadata["3beats"] === 'string' ? metadata["3beats"] : String(metadata["3beats"])
                            });
                    });
                }
            }
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
        }
        }

        //sort scenes by when and then by scene number for the subplot radials
        return scenes.sort((a, b) => {
            // First compare by when (date)
            const dateA = new Date(a.date);
            const dateB = new Date(b.date);
            const whenComparison = dateA.getTime() - dateB.getTime();
            if (whenComparison !== 0) return whenComparison;
            
            // If dates are equal, compare by scene number
            const aNumber = parseSceneTitle(a.title || '').number;
            const bNumber = parseSceneTitle(b.title || '').number;
            
            // Convert scene numbers to numbers for comparison
            // Ensure we're using numeric values by explicitly parsing the strings
            // Use parseFloat instead of parseInt to handle decimal scene numbers correctly
            const aNumberValue = aNumber ? parseFloat(aNumber) : 0;
            const bNumberValue = bNumber ? parseFloat(bNumber) : 0;
            return aNumberValue - bNumberValue;
        });
    }


public createTimelineSVG(scenes: Scene[]) {
  return createTimelineSVG(this, scenes);
}

    private darkenColor(color: string, percent: number): string {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max((num >> 16) - amt, 0);
        const G = Math.max(((num >> 8) & 0x00FF) - amt, 0);
        const B = Math.max((num & 0x0000FF) - amt, 0);
        return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
    }

    private lightenColor(color: string, percent: number): string {
        // Parse the color
        const num = parseInt(color.replace("#", ""), 16);
        
        // Extract original RGB values
        const R = (num >> 16);
        const G = ((num >> 8) & 0x00FF);
        const B = (num & 0x0000FF);
        
        // Calculate lightened values
        const mixRatio = Math.min(1, percent / 100); // How much white to mix in
        
        // Simple lightening calculation that preserves the hue
        const newR = Math.min(255, Math.round(R + (255 - R) * mixRatio));
        const newG = Math.min(255, Math.round(G + (255 - G) * mixRatio));
        const newB = Math.min(255, Math.round(B + (255 - B) * mixRatio));
        
        return "#" + (1 << 24 | newR << 16 | newG << 8 | newB).toString(16).slice(1);
    }

    /// Helper function to split text into balanced lines
    public splitIntoBalancedLines(text: string, maxWidth: number): string[] {
        // Check if the text already contains tspan elements (like search highlights)
        if (text.includes('<tspan')) {
            this.log(`Using DOM-based line splitting for text with tspans: ${text.substring(0, 50)}...`);
            
            // Parse the HTML using DOMParser
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><text>${text}</text></svg>`, 'image/svg+xml');
            
            // Check for parsing errors
            if (doc.querySelector('parsererror')) {
                this.log('Error parsing SVG content with tspans, returning original text');
                return [text];
            }
            
            // Extract the text element
            const textElement = doc.querySelector('text');
            if (!textElement) {
                return [text];
            }
            
            // Get the text content without the tags for measuring
            const plainText = textElement.textContent || '';
            
            // Split the plain text into lines based on length
            const plainLines = this.splitPlainTextIntoLines(plainText, maxWidth);
            
            if (plainLines.length <= 1) {
                // If we only have one line, just return the original text
                return [text];
            }
            
            // We need to split the text containing tspans
            // This is a complex operation as we need to distribute the tspans across lines
            // For now, just return the original text - future enhancement needed
            return [text];
        }
        
        // Regular text without tspans - use character-based splitting
        return this.splitPlainTextIntoLines(text, maxWidth);
    }
    
    // Helper method to split plain text into lines
    private splitPlainTextIntoLines(text: string, maxWidth: number): string[] {
        const words = text.split(/\s+/);
        const lines: string[] = [];
        let currentLine = '';
        let currentWidth = 0;
        const maxCharsPerLine = 50; // Approximately 400px at 16px font size
        
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const wordWidth = word.length;
            
            if (currentWidth + wordWidth > maxCharsPerLine && currentLine !== '') {
                lines.push(currentLine.trim());
                currentLine = word;
                currentWidth = wordWidth;
            } else {
                currentLine += (currentLine ? ' ' : '') + word;
                currentWidth += wordWidth + (currentLine ? 1 : 0); // Add space width
            }
        }
        
        if (currentLine) {
            lines.push(currentLine.trim());
        }
        
        return lines;
    }

    // Add a helper method for hyphenation
    private hyphenateWord(word: string, maxWidth: number, charWidth: number): [string, string] {
        const maxChars = Math.floor(maxWidth / charWidth);
        if (word.length <= maxChars) return [word, ''];
        
        // Simple hyphenation at maxChars-1 to account for hyphen
        const firstPart = word.slice(0, maxChars - 1) + '-';
        const secondPart = word.slice(maxChars - 1);
        return [firstPart, secondPart];
    }

    private generateSynopsisHTML(scene: Scene, contentLines: string[], sceneId: string): string {
        return this.synopsisManager.generateHTML(scene, contentLines, sceneId);
    }

    private formatSubplot(subplots: string): string {
        if (!subplots) return '';
        
        const items = subplots.split(',').map(item => item.trim());
        return items.map((subplot, i) => {
            // Ensure subplot text is safe for SVG
            const safeSubplot = this.safeSvgText(subplot);
            return `<text class="subplot-text" x="0" y="${-20 + i * 25}" text-anchor="middle">${safeSubplot}</text>`;
        }).join('');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // Ensure a valid Anthropic model ID is set, otherwise use the default
        if (!this.settings.anthropicModelId) {
            this.settings.anthropicModelId = DEFAULT_SETTINGS.anthropicModelId;
        }
        // Ensure a valid OpenAI model ID is set, otherwise use the default
        if (!this.settings.openaiModelId) {
            this.settings.openaiModelId = DEFAULT_SETTINGS.openaiModelId;
        }
         // Ensure a valid default provider is set
        if (!this.settings.defaultAiProvider || !['openai', 'anthropic'].includes(this.settings.defaultAiProvider)) {
            this.settings.defaultAiProvider = DEFAULT_SETTINGS.defaultAiProvider;
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // Add this helper function at the class level
    private parseSceneTitle(title: string): { number: string; cleanTitle: string } {
        // Split on first space
        const parts = title.trim().split(/\s+(.+)/);
        
        // Check if first part is a valid number
        if (parts.length > 1 && !isNaN(parseFloat(parts[0]))) {
            return {
                number: parts[0],
                cleanTitle: parts[1]
            };
        }
        return {
            number: "",
            cleanTitle: title.trim()
        };
    }

    public log<T>(message: string, data?: T) {
        if (this.settings.debug) {
            console.log(`[Manuscript Timeline] ${message}`, data || '');
        }
    }

    // Method to refresh the timeline if the active view exists
    refreshTimelineIfNeeded(file: TAbstractFile | null | undefined) {
        // If a specific file is provided, only refresh if it's a markdown file
        if (file && (!(file instanceof TFile) || file.extension !== 'md')) {
            return;
        }
        
        // If file is null/undefined, or if it's a valid markdown file, proceed to refresh

        // Get all timeline views
        const timelineViews = this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)
            .map(leaf => leaf.view as ManuscriptTimelineView)
            .filter(view => view instanceof ManuscriptTimelineView);

        // Refresh each view
        for (const view of timelineViews) {
            if (view) {
                // Get the leaf that contains the view
                const leaf = this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)[0];
                if (leaf) {
                    view.refreshTimeline();
                }
            }
        }
    }

    /**
     * Measures text dimensions using an offscreen DOM element
     * This provides much more accurate text sizing than estimation
     */
    private measureTextDimensions(text: string, maxWidth: number, fontSize: number, fontWeight: string = 'normal'): {width: number, height: number} {
        // Create an offscreen element for measurement
        const el = document.createElement('div');
        el.classList.add('text-measure');
        el.style.setProperty('--max-width', `${maxWidth}px`);
        el.style.setProperty('--font-size', `${fontSize}px`);
        el.style.setProperty('--font-weight', fontWeight);
        
        // Check if text contains HTML/SVG tags
        if (text.includes('<') && text.includes('>')) {
            // Use DOMParser for safely handling HTML content
            try {
                const parser = new DOMParser();
                // For SVG content
                if (text.includes('<tspan')) {
                    const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><text>${text}</text></svg>`, 'image/svg+xml');
                    if (!doc.querySelector('parsererror')) {
                        const textNode = doc.querySelector('text');
                        if (textNode) {
                            const fragment = document.createDocumentFragment();
                            while (textNode.firstChild) {
                                fragment.appendChild(textNode.firstChild);
                            }
                            el.appendChild(fragment);
                        } else {
                            el.textContent = text;
                        }
                    } else {
                        el.textContent = text;
                    }
                } else {
                    // For regular HTML
                    const doc = parser.parseFromString(`<div>${text}</div>`, 'text/html');
                    const div = doc.querySelector('div');
                    if (div) {
                        const fragment = document.createDocumentFragment();
                        while (div.firstChild) {
                            fragment.appendChild(div.firstChild);
                        }
                        el.appendChild(fragment);
                    } else {
                        el.textContent = text;
                    }
                }
            } catch (error) {
                console.error('Error parsing HTML content for measurement:', error);
                el.textContent = text;
            }
        } else {
            // Simple text, use textContent
            el.textContent = text;
        }
        
        // Append to DOM for measurement
        document.body.appendChild(el);
        
        // Get the dimensions
        const rect = el.getBoundingClientRect();
        const dimensions = {
            width: rect.width,
            height: rect.height
        };
        
        // Clean up
        document.body.removeChild(el);
        
        return dimensions;
    }

    // Add this function near the top of the class, after refreshTimelineIfNeeded 
    public updateSynopsisPosition(synopsis: Element, event: MouseEvent, svg: SVGSVGElement, sceneId: string): void {
        this.synopsisManager.updatePosition(synopsis, event, svg, sceneId);
    }

    // Add method to update open files tracking
    private updateOpenFilesTracking() {
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
            // Use the appropriate method to refresh the timeline
            if (this.activeTimelineView) {
                this.activeTimelineView.refreshTimeline();
            }
        } else {
            this.log('No changes in open files detected');
        }
    }

    // Search related methods
    private openSearchPrompt(): void {
        const modal = new Modal(this.app);
        modal.titleEl.setText('Search Timeline');
        
        const contentEl = modal.contentEl;
        contentEl.empty();
        
        // Create search input container
        const searchContainer = contentEl.createDiv('search-container');
        searchContainer.classList.add('flex-container');
        
        // Create search input
        const searchInput = new TextComponent(searchContainer);
        searchInput.setPlaceholder('Enter search term (min 3 characters)');
        searchInput.inputEl.classList.add('search-input');
        
        // Prepopulate with current search term if one exists
        if (this.searchActive && this.searchTerm) {
            searchInput.setValue(this.searchTerm);
        }
        
        // Create button container
        const buttonContainer = contentEl.createDiv('button-container');
        buttonContainer.classList.add('button-container');
        // All styles now defined in CSS
        
        // Create search button
        const searchButton = new ButtonComponent(buttonContainer)
            .setButtonText('Search')
            .onClick(() => {
                const term = searchInput.getValue().trim();
                if (term.length >= 3) {
                    this.performSearch(term);
                    modal.close();
                } else {
                    new Notice('Please enter at least 3 characters to search');
                }
            });
        
        // Create reset button
        const resetButton = new ButtonComponent(buttonContainer)
            .setButtonText('Reset')
            .onClick(() => {
                // Clear the search input
                searchInput.setValue('');
                // Clear the search and refresh the timeline
                this.clearSearch();
                // Close the modal after clearing
                modal.close();
            });
        
        // Add keyboard event listener
        searchInput.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const term = searchInput.getValue().trim();
                if (term.length >= 3) {
                    this.performSearch(term);
                    modal.close();
                } else {
                    new Notice('Please enter at least 3 characters to search');
                }
            }
        });
        
        modal.open();
    }
    
    public performSearch(term: string): void {
        if (!term || term.trim().length === 0) {
            this.clearSearch();
            return;
        }
        
        // Set search state
        this.searchTerm = term;
        this.searchActive = true;
        this.searchResults.clear();
        
        // Case-insensitive search without global flag (avoids lastIndex side-effects)
        const buildRegex = () => new RegExp(escapeRegExp(term), 'i');
        
        // Populate searchResults with matching scene paths
        this.getSceneData().then(scenes => {
            scenes.forEach(scene => {
                const regex = buildRegex();
                // Build searchable string from scene fields
                const searchableContent = [
                    scene.title,
                    scene.synopsis,
                    ...(scene.Character || []),
                    scene.subplot,
                    scene.location,
                    scene.pov
                ].filter(Boolean).join(' ');

                if (regex.test(searchableContent)) {
                    if (scene.path) {
                        this.searchResults.add(scene.path);
                    }
                }
            });
            
            // Get all timeline views and refresh them
            const timelineViews = this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)
                .map(leaf => leaf.view as ManuscriptTimelineView)
                .filter(view => view instanceof ManuscriptTimelineView);
                
            if (timelineViews.length > 0) {
                // Update all timeline views with the new search results
                timelineViews.forEach(view => {
                    if (view) {
                        view.refreshTimeline();
                    }
                });
                
                // Update active view reference
                if (!this.activeTimelineView && timelineViews.length > 0) {
                    this.activeTimelineView = timelineViews[0];
                }
            }
        });
    }
    
    public clearSearch(): void {
        this.searchActive = false;
        this.searchTerm = '';
        this.searchResults.clear();
        
        // Get all timeline views and refresh them
        const timelineViews = this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)
            .map(leaf => leaf.view as ManuscriptTimelineView)
            .filter(view => view instanceof ManuscriptTimelineView);

        if (timelineViews.length > 0) {
            // Refresh each view
            timelineViews.forEach(view => {
                if (view) {
                    view.refreshTimeline();
                }
            });
        }
    }

    // Function to set CSS variables for RGB colors
    private setCSSColorVariables() {
        const root = document.documentElement;
        const { publishStageColors } = this.settings;
        
        // Convert hex colors to RGB for CSS variables
        Object.entries(publishStageColors).forEach(([stage, color]) => {
            // Set the main color variable
            root.style.setProperty(`--publishStageColors-${stage}`, color);
            
            // Convert hex to RGB values for rgba() usage
            const rgbValues = this.hexToRGB(color);
            if (rgbValues) {
                root.style.setProperty(`--publishStageColors-${stage}-rgb`, rgbValues);
            }
        });
    }

    // Helper function to convert hex to RGB values without the "rgb()" wrapper
    private hexToRGB(hex: string): string | null {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        
        if (isNaN(r) || isNaN(g) || isNaN(b)) {
            return null;
        }
        
            return `${r}, ${g}, ${b}`;
        }

    // Add helper method to highlight search terms
    
    // Helper method to convert DocumentFragment to string for backward compatibility

    // Helper method to ensure text is safe for SVG
    public safeSvgText(text: string): string {
        return (text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }

    // Find the SVG element
    public createSvgElement(svgContent: string, container: HTMLElement): SVGSVGElement | null {
        try {
            // Performance optimization: Track parsing time
            const startTime = performance.now();
            
            // Create a new SVG element in the namespace
            const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            
            // Parse the SVG content using DOMParser
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
            
            // Check for parsing errors
            const parserError = svgDoc.querySelector('parsererror');
            if (parserError) {
                console.error('Error parsing SVG content:', parserError.textContent);
                
                // Try again with a fallback approach
                const fallbackParser = new DOMParser();
                const fallbackDoc = fallbackParser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`, 'image/svg+xml');
                
                // Check if this parsing succeeded
                if (!fallbackDoc.querySelector('parsererror')) {
                    const fallbackSvg = fallbackDoc.documentElement;
                    
                    // Copy all child nodes from the source SVG to our new element
                    while (fallbackSvg.firstChild) {
                        const child = fallbackSvg.firstChild;
                        svgElement.appendChild(child);
                    }
                    
                    // Set critical SVG attributes explicitly
                    svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                    svgElement.setAttribute('width', '100%');
                    svgElement.setAttribute('height', '100%');
                    svgElement.setAttribute('viewBox', '-800 -800 1600 1600');
                    svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                    svgElement.setAttribute('class', 'manuscript-timeline-svg');
                    
                    // Performance optimization: Add directly to fragment
                    const fragment = document.createDocumentFragment();
                    fragment.appendChild(svgElement);
                    
                    console.log(`SVG parsing fallback took ${performance.now() - startTime}ms`);
                    return svgElement;
                }
                
        return null;
    }
            
            // Get the source SVG element
            const sourceSvg = svgDoc.documentElement;

            // Copy attributes from the parsed SVG root to the new SVG element
            for (const attr of Array.from(sourceSvg.attributes)) {

                // Skip xmlns as it's set manually, handle class separately
                if (attr.name !== 'xmlns' && attr.name !== 'class') {
                    svgElement.setAttribute(attr.name, attr.value);
                }
            }
            // Merge classes
            svgElement.classList.add(...Array.from(sourceSvg.classList));
            
            // Extract critical attributes from source SVG (already done, keep for safety)
            const viewBox = sourceSvg.getAttribute('viewBox') || '-800 -800 1600 1600';
            
            // Set critical SVG attributes explicitly
            svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svgElement.setAttribute('width', '100%');
            svgElement.setAttribute('height', '100%');
            svgElement.setAttribute('viewBox', viewBox);
            svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svgElement.setAttribute('class', 'manuscript-timeline-svg');
            
            // Performance optimization: Use document fragment for better performance
            const fragment = document.createDocumentFragment();
            
            // Copy all child nodes from the source SVG to our new element
            while (sourceSvg.firstChild) {
                svgElement.appendChild(sourceSvg.firstChild);
            }
            
            // Add the SVG element to the container via fragment
            fragment.appendChild(svgElement);
            container.appendChild(fragment);
            
           
            return svgElement;
        } catch (error) {
            console.error('Error creating SVG element:', error);
            
            // Final fallback approach - create minimal SVG directly
            try {
                // Create simple SVG root
                const fallbackSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                
                // Set critical SVG attributes explicitly
                fallbackSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
                fallbackSvg.setAttribute('width', '100%');
                fallbackSvg.setAttribute('height', '100%');
                fallbackSvg.setAttribute('viewBox', '-800 -800 1600 1600');
                fallbackSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                fallbackSvg.setAttribute('class', 'manuscript-timeline-svg');
                
                // Extract content using regex approach
                const svgBodyMatch = svgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
                if (svgBodyMatch && svgBodyMatch[1]) {
                    // Use DOMParser to safely extract content
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svgBodyMatch[1]}</svg>`, 'image/svg+xml');
                    
                    // Performance optimization: Use document fragment for better performance
                    const fragment = document.createDocumentFragment();
                    
                    if (!doc.querySelector('parsererror')) {
                        const svgDoc = doc.documentElement;
                        
                        // Process elements in chunks to avoid UI blocking (max 100 elements per frame)
                        const processNodes = (nodes: Element[], startIdx: number, callback: () => void) => {
                            const CHUNK_SIZE = 100;
                            const endIdx = Math.min(startIdx + CHUNK_SIZE, nodes.length);
                            
                            for (let i = startIdx; i < endIdx; i++) {
                                const element = nodes[i];
                                // Create element with namespace
                                const newElement = document.createElementNS('http://www.w3.org/2000/svg', element.tagName.toLowerCase());
                                
                                // Copy attributes
                                Array.from(element.attributes).forEach(attr => {
                                    newElement.setAttribute(attr.name, attr.value);
                                });
                                
                                // Copy content
                                newElement.textContent = element.textContent;
                                
                                // Add to SVG
                                fallbackSvg.appendChild(newElement);
                            }
                            
                            if (endIdx < nodes.length) {
                                // Process next chunk in next animation frame
                                window.requestAnimationFrame(() => processNodes(nodes, endIdx, callback));
                            } else {
                                // Finished processing all nodes
                                callback();
                            }
                        };
                        
                        // Get all element nodes
                        const elementNodes = Array.from(svgDoc.querySelectorAll('*'));
                        
                        // If there are too many nodes, process in chunks
                        if (elementNodes.length > 100) {
                            // Add loading indicator first
                            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                            text.setAttribute('x', '0');
                            text.setAttribute('y', '0');
                            text.setAttribute('fill', '#333333');
                            text.setAttribute('font-size', '24');
                            text.setAttribute('text-anchor', 'middle');
                            text.textContent = 'Loading timeline...';
                            fallbackSvg.appendChild(text);
                            
                            // Add the SVG to container first to show loading
                            fragment.appendChild(fallbackSvg);
                            container.appendChild(fragment);
                            
                            // Process nodes in chunks
                            processNodes(elementNodes, 0, () => {
                                // Remove loading indicator when done
                                fallbackSvg.removeChild(text);
                            });
                        } else {
                            // Process all nodes at once for small SVGs
                            elementNodes.forEach(element => {
                                const newElement = document.createElementNS('http://www.w3.org/2000/svg', element.tagName.toLowerCase());
                                
                                Array.from(element.attributes).forEach(attr => {
                                    newElement.setAttribute(attr.name, attr.value);
                                });
                                
                                newElement.textContent = element.textContent;
                                fallbackSvg.appendChild(newElement);
                            });
                            
                            // Add to container
                            fragment.appendChild(fallbackSvg);
                            container.appendChild(fragment);
                        }
                    }
                } else {
                    // Add to container via fragment
                    const fragment = document.createDocumentFragment();
                    fragment.appendChild(fallbackSvg);
                    container.appendChild(fragment);
                }
                
                return fallbackSvg;
            } catch (innerError) {
                console.error('All SVG parsing approaches failed:', innerError);
                return null;
            }
        }
    }
    
    // Add a method to handle zooming and panning
    private setupZoomPan(svgElement: SVGSVGElement): void {
        // Initial transform values
        let scale = 1;
        const initialScale = 1;
        let translateX = 0;
        let translateY = 0;
        
        // Track mouse and touch events
        let isPanning = false;
        let startPoint = { x: 0, y: 0 };
        let endPoint = { x: 0, y: 0 };
        
        // Get SVG viewport dimensions
        const updateViewBox = () => {
            const viewBox = svgElement.getAttribute('viewBox')?.split(' ').map(Number) || [-800, -800, 1600, 1600];
            svgElement.setAttribute('viewBox', `${viewBox[0] - translateX} ${viewBox[1] - translateY} ${viewBox[2] / scale} ${viewBox[3] / scale}`);
        };
        
        // Zoom function
        const zoom = (delta: number, x: number, y: number) => {
            // Adjust scale with limits
            scale = Math.max(0.2, Math.min(3, scale - delta * 0.1));
            
            // Apply the transform to the viewBox instead of CSS transform
            updateViewBox();
        };
        
        // Handle mouse wheel for zooming
        svgElement.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? 1 : -1;
            zoom(delta, e.clientX, e.clientY);
        });
        
        // Handle panning with mouse
        svgElement.addEventListener('mousedown', (e) => {
            if (e.button === 0) { // Left mouse button
                isPanning = true;
                startPoint = { x: e.clientX, y: e.clientY };
                svgElement.style.cursor = 'grabbing';
            }
        });
        
        window.addEventListener('mousemove', (e) => {
            if (isPanning) {
                endPoint = { x: e.clientX, y: e.clientY };
                
                // Calculate the movement delta
                const dx = (endPoint.x - startPoint.x) / scale;
                const dy = (endPoint.y - startPoint.y) / scale;
                
                // Update translation
                translateX += dx;
                translateY += dy;
                
                // Update startPoint for continuous movement
                startPoint = { x: e.clientX, y: e.clientY };
                
                // Apply the updated viewBox
                updateViewBox();
            }
        });
        
        window.addEventListener('mouseup', () => {
            isPanning = false;
            svgElement.style.cursor = 'default';
        });
        
        // Double-click to reset view
        svgElement.addEventListener('dblclick', () => {
            scale = initialScale;
            translateX = 0;
            translateY = 0;
            
            // Reset the viewBox to its original value
            const size = 1600;
            svgElement.setAttribute('viewBox', `-${size / 2} -${size / 2} ${size} ${size}`);
        });
    }

    // --- START: Color Conversion & Desaturation Helpers ---
    // Ensure these are PUBLIC
    public desaturateColor(hexColor: string, amount: number): string {
        const rgb = hexToRgb(hexColor);
        if (!rgb) return hexColor;
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        hsl.s = Math.max(0, hsl.s * (1 - amount));
        const desat = hslToRgb(hsl.h, hsl.s, hsl.l);
        return rgbToHex(desat.r, desat.g, desat.b);
    }
    // --- END: Color Conversion & Desaturation Helpers ---

    // Add this function inside the ManuscriptTimelinePlugin class
    public calculateCompletionEstimate(scenes: Scene[]): {
        date: Date;
        total: number;
        remaining: number;
        rate: number; // Scenes per week
    } | null {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Normalize to start of day

        // --- New Calculation Logic --- START ---
        const startOfYear = new Date(today.getFullYear(), 0, 1); // Jan 1st of current year
        const startOfYearTime = startOfYear.getTime();
        const todayTime = today.getTime();

        // Calculate days passed since start of year (minimum 1 day)
        const daysPassedThisYear = Math.max(1, Math.round((todayTime - startOfYearTime) / (1000 * 60 * 60 * 24)));

        let completedThisYear = 0;
        const completedPathsThisYear = new Set<string>();

        // Calculate completed scenes this year
        scenes.forEach(scene => {
            const dueDateStr = scene.due;
            const scenePath = scene.path;
            const sceneStatus = scene.status?.toString().trim().toLowerCase();

            if (sceneStatus !== 'complete' && sceneStatus !== 'done') return;
            if (!scenePath || completedPathsThisYear.has(scenePath)) return;
            if (!dueDateStr) return;

            try {
                const dueDate = new Date(dueDateStr + 'T00:00:00');
                dueDate.setHours(0, 0, 0, 0);
                const dueTime = dueDate.getTime();

                if (!isNaN(dueTime) && dueTime >= startOfYearTime && dueTime < todayTime) {
                    completedThisYear++;
                    completedPathsThisYear.add(scenePath);
                }
            } catch (e) {
                // Ignore errors parsing date during calculation
            }
        });

        if (completedThisYear <= 0) {
            this.log("Completion estimate: No scenes completed this year. Cannot estimate.");
            return null;
        }

        const scenesPerDay = completedThisYear / daysPassedThisYear;

        // --- Get Current Status Counts (Necessary for Remaining/Total) ---
        // Use a fresh calculation based on the provided scenes array
        const processedPaths = new Set<string>(); // Track unique paths
        const currentStatusCounts = scenes.reduce((acc, scene) => {
            // --- Add check for unique path --- START ---
            if (!scene.path || processedPaths.has(scene.path)) {
                return acc; // Skip if no path or already counted
            }
            processedPaths.add(scene.path);
            // --- Add check for unique path --- END ---

            const normalizedStatus = scene.status?.toString().trim().toLowerCase() || 'Todo';
            
            if (normalizedStatus === "complete" || normalizedStatus === "done") {
                acc["Completed"] = (acc["Completed"] || 0) + 1;
            } else if (scene.due) {
                try {
                    const dueDate = new Date(scene.due + 'T00:00:00');
                    if (!isNaN(dueDate.getTime()) && dueDate.getTime() < todayTime) {
                        acc["Due"] = (acc["Due"] || 0) + 1;
                    } else {
                        acc[normalizedStatus] = (acc[normalizedStatus] || 0) + 1;
                    }
                } catch { 
                    acc[normalizedStatus] = (acc[normalizedStatus] || 0) + 1;
                }
            } else {
                acc[normalizedStatus] = (acc[normalizedStatus] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);
        
        // Calculate remaining and total from these counts
        const completedCount = currentStatusCounts['Completed'] || 0; // Count completed scenes
        const totalScenes = Object.values(currentStatusCounts).reduce((sum, count) => sum + count, 0); // Sum all counts for total
        const remainingScenes = totalScenes - completedCount; // Remaining = Total - Completed

        // --- Remove older remaining calculation ---
        // const todoCount = currentStatusCounts['Todo'] || 0;
        // const workingCount = currentStatusCounts['Working'] || 0;
        // const dueCount = currentStatusCounts['Due'] || 0; 
        // const remainingScenes = todoCount + workingCount + dueCount;
        // --- Finished Status Counts ---

        if (remainingScenes <= 0) {
            this.log("Completion estimate: No remaining scenes to estimate.");
            return null;
        }

        const daysNeeded = remainingScenes / scenesPerDay;

        if (!isFinite(daysNeeded) || daysNeeded < 0 || scenesPerDay <= 0) {
            this.log(`Completion estimate: Cannot estimate (Rate: ${scenesPerDay.toFixed(3)}, Needed: ${daysNeeded}).`);
            return null;
        }

        const scenesPerWeek = scenesPerDay * 7;

        // --- REMOVED latest... updates ---
        // this.latestTotalScenes = totalScenes;
        // this.latestRemainingScenes = remainingScenes;
        // this.latestScenesPerWeek = parseFloat(scenesPerWeek.toFixed(1));

        const estimatedDate = new Date(today);
        estimatedDate.setDate(today.getDate() + Math.ceil(daysNeeded));
        
        return {
            date: estimatedDate,
            total: totalScenes,
            remaining: remainingScenes,
            rate: parseFloat(scenesPerWeek.toFixed(1)) // Use rounded value
        };
    }

    private handleFileRename(file: TAbstractFile, oldPath: string): void {
        if (this.openScenePaths.has(oldPath)) {
            this.openScenePaths.delete(oldPath);
            if (file instanceof TFile && this.isSceneFile(file.path)) {
                this.openScenePaths.add(file.path);
            }
        }
        // Add any specific logic needed when a file affecting the timeline is renamed
        this.refreshTimelineIfNeeded(file);
    }

    private setupHoverListeners(): void {
        // ... (Existing hover listener setup) ...
    }

    // Method to update status bar items if needed
    private updateStatusBar(): void {
        // ... (update logic using latestTotalScenes, etc.) ...
    }

    onunload() {
        console.log('Manuscript Timeline Plugin Unloaded');
        // Clean up any other resources
    }
} // End of ManuscriptTimelinePlugin class