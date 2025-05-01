import { App, Plugin, Notice, Setting, PluginSettingTab, TFile, TAbstractFile, WorkspaceLeaf, ItemView, MarkdownView, MarkdownRenderer, TextComponent, Modal, ButtonComponent, requestUrl, Editor, parseYaml, stringifyYaml, Menu, MenuItem, Platform, DropdownComponent, Component } from "obsidian";

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

interface Scene {
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

const DEFAULT_SETTINGS: ManuscriptTimelineSettings = {
    sourcePath: '',
    publishStageColors: {
        Zero: '#cccccc', // Default Light Grey
        Author: '#ffcc00', // Default Yellow
        House: '#66ccff', // Default Light Blue
        Press: '#99cc99' // Default Light Green
    },
    logApiInteractions: false, // <<< ADDED: Default for new setting
    processedBeatContexts: [], // <<< ADDED: Default empty array
    debug: false,
    targetCompletionDate: undefined, // Ensure it's undefined by default
    openaiApiKey: '', // Default to empty string
    anthropicApiKey: '', // <<< ADDED: Default empty string
    anthropicModelId: 'claude-3-7-sonnet-20250219', // <<< ADDED: Default to latest Sonnet
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

// Shared utility function for escaping regular expression special characters
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

// Helper function to decode HTML entities (like &#039; to ')
function decodeHtmlEntities(text: string): string {
    if (!text) return '';
    
    // Check if the text contains HTML tspan elements that we want to preserve
    if (text.includes('<tspan') || text.includes('&lt;tspan')) {
        // For content with tspan tags, we need special handling to preserve the tags
        // This content will be processed by processContentWithTspans later
        return text;
    }
    
    // For regular text without tspan elements, decode entities safely using DOMParser
    try {
        // Create a document fragment from the text
        const parser = new DOMParser();
        // Wrap the text in a span to ensure proper parsing
        const doc = parser.parseFromString(`<!DOCTYPE html><body><span>${text}</span></body>`, 'text/html');
        
        // Get the text content from the span element
        const spanElement = doc.querySelector('span');
        if (spanElement) {
            return spanElement.textContent || '';
        }
    } catch (error) {
        console.error('Error decoding HTML entities:', error);
        // Fall through to fallback approach
    }
    
    // Fallback to a simpler approach if DOMParser fails
    const span = document.createElement('span');
    span.textContent = text;
    return span.textContent || '';
}

/**
 * Utility function to parse scene title text into its components
 * @param titleText The raw scene title text
 * @returns An object with the parsed components
 */
function parseSceneTitleComponents(titleText: string): { sceneNumber: string, title: string, date: string } {
    const result = { sceneNumber: "", title: "", date: "" };
    
    if (!titleText) return result;
    
    // First decode any HTML entities
    const decodedText = decodeHtmlEntities(titleText);
    
    // Handle the case where text might already contain tspan elements
    if (decodedText.includes('<tspan')) {
        // If complex formatting is present, return the title as-is
        result.title = decodedText;
        return result;
    }
    
    // First, check if there's a date at the end (typically after 3+ spaces)
    // The date is usually a date format, often at the end after multiple spaces
    const dateMatch = decodedText.match(/\s{3,}(.+?)$/);
    if (dateMatch) {
        result.date = dateMatch[1].trim();
        
        // Get just the title part without the date
        const titlePart = decodedText.substring(0, dateMatch.index).trim();
        
        // Extract scene number if present at beginning of title
        const titleMatch = titlePart.match(/^(\d+(\.\d+)?)\s+(.+)$/);
        if (titleMatch) {
            result.sceneNumber = titleMatch[1];
            result.title = titleMatch[3]; // Just the title text, no number
        } else {
            result.title = titlePart; // No scene number, use entire title part
        }
    } else {
        // No date found, check for scene number in the full text
        const titleMatch = decodedText.match(/^(\d+(\.\d+)?)\s+(.+)$/);
        if (titleMatch) {
            result.sceneNumber = titleMatch[1];
            result.title = titleMatch[3];
        } else {
            result.title = decodedText;
        }
    }
    
    return result;
}

/**
 * Create SVG elements for scene title with optional search highlighting
 * @param titleComponents The parsed title components
 * @param fragment The document fragment to append elements to
 * @param searchTerm Optional search term for highlighting
 * @param titleColor Optional color for the title text
 */
function renderSceneTitleComponents(
    titleComponents: { sceneNumber: string, title: string, date: string },
    fragment: DocumentFragment,
    searchTerm?: string,
    titleColor?: string
): void {
    // Create a title container tspan element to hold all parts
    const titleContainer = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    fragment.appendChild(titleContainer);
    
    // Create a tspan for the scene number if it exists
    if (titleComponents.sceneNumber) {
        const titleNumberTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        titleNumberTspan.setAttribute("font-weight", "bold");
        if (titleColor) titleNumberTspan.setAttribute("fill", titleColor);
        
        // Add scene number as regular text
        titleNumberTspan.textContent = `${titleComponents.sceneNumber} `;
        titleContainer.appendChild(titleNumberTspan);
    }
    
    // Create a tspan for the main title text
    const mainTitleTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
    mainTitleTspan.setAttribute("font-weight", "bold");
    if (titleColor) mainTitleTspan.setAttribute("fill", titleColor);
    titleContainer.appendChild(mainTitleTspan);
    
    // If we have a search term, process the title for highlighting
    if (searchTerm && titleComponents.title) {
        // Create safe regex for searching
        const escapedPattern = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`(${escapedPattern})`, 'gi');
        
        // Reset regex to start from beginning
        regex.lastIndex = 0;
        
        // Process the title content character by character for highlighting
        let lastIndex = 0;
        let match;
        
        while ((match = regex.exec(titleComponents.title)) !== null) {
            // Add text before match
            if (match.index > lastIndex) {
                const textBefore = document.createTextNode(titleComponents.title.substring(lastIndex, match.index));
                mainTitleTspan.appendChild(textBefore);
            }
            
            // Add the highlighted match
            const highlight = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
            highlight.setAttribute("class", "search-term");
            if (titleColor) highlight.setAttribute("fill", titleColor);
            highlight.textContent = match[0];
            mainTitleTspan.appendChild(highlight);
            
            lastIndex = match.index + match[0].length;
        }
        
        // Add any remaining text
        if (lastIndex < titleComponents.title.length) {
            const textAfter = document.createTextNode(titleComponents.title.substring(lastIndex));
            mainTitleTspan.appendChild(textAfter);
        }
    } else {
        // No search highlighting, just add the title text
        mainTitleTspan.textContent = titleComponents.title;
    }
    
    // Add date part if it exists
    if (titleComponents.date) {
        // Add spacer first (add extra space after title for better readability)
        fragment.appendChild(document.createTextNode('    '));
        
        // Create a date tspan with consistent styling
        const dateTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        dateTspan.setAttribute("class", "date-text");
        if (titleColor) dateTspan.setAttribute("fill", titleColor);
        dateTspan.textContent = titleComponents.date;
        fragment.appendChild(dateTspan);
    }
}

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

// Add this class after the helper functions at the top of the file
class SynopsisManager {
    private plugin: ManuscriptTimelinePlugin;
    
    constructor(plugin: ManuscriptTimelinePlugin) {
        this.plugin = plugin;
    }
    
    /**
     * Escapes special characters in a string for use in a regular expression
     */
    escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    

    private parseHtmlSafely(html: string): DocumentFragment {
        // Use DOMParser to parse the HTML string
        const parser = new DOMParser();
        // Wrap with a root element to ensure proper parsing
        const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
        
        // Extract the content from the wrapper div
        const container = doc.querySelector('div');
        const fragment = document.createDocumentFragment();
        
        if (container) {
            // Move all child nodes to our fragment
            while (container.firstChild) {
                fragment.appendChild(container.firstChild);
            }
        }
        
        return fragment;
    }
    
    /**
     * Add title content to a text element safely
     * @param titleContent The title content to add
     * @param titleTextElement The text element to add to
     * @param titleColor The color for the title
     */
    private addTitleContent(titleContent: string, titleTextElement: SVGTextElement, titleColor: string): void {
        if (titleContent.includes('<tspan')) {
            // For pre-formatted HTML with tspans, parse safely
            const parser = new DOMParser();
            // Wrap in SVG text element for potentially better parsing of SVG tspans/text nodes
            const doc = parser.parseFromString(`<svg><text>${titleContent}</text></svg>`, 'image/svg+xml');
            const textNode = doc.querySelector('text');

            if (!textNode) {
                // Fallback: If parsing fails, add raw content (less safe, but preserves something)
                console.warn("Failed to parse title content with tspans, adding raw:", titleContent);
                const fallbackTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                fallbackTspan.setAttribute("fill", titleColor);
                // Avoid setting textContent directly with potentially complex HTML
                // Instead, append the raw string as a text node for basic display
                fallbackTspan.appendChild(document.createTextNode(titleContent)); 
                titleTextElement.appendChild(fallbackTspan);
                return;
            }

            // Iterate through all child nodes (tspans and text nodes)
            Array.from(textNode.childNodes).forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'tspan') {
                    // Handle tspan element
                    const tspan = node as Element;
                    const svgTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                    
                    // Copy attributes
                    Array.from(tspan.attributes).forEach(attr => {
                        svgTspan.setAttribute(attr.name, attr.value);
                    });
                    
                    svgTspan.textContent = tspan.textContent;
                    titleTextElement.appendChild(svgTspan);
                    
                } else if (node.nodeType === Node.TEXT_NODE) {
                    // Handle text node (e.g., spaces)
                    if (node.textContent) { // Check if textContent is not null or empty
                        titleTextElement.appendChild(document.createTextNode(node.textContent));
                    }
                }
                // Ignore other node types (like comments)
            });

        } else {
            // Non-search case (uses renderSceneTitleComponents which correctly handles spaces)
            const fragment = document.createDocumentFragment();
            const titleComponents = parseSceneTitleComponents(titleContent);
            renderSceneTitleComponents(titleComponents, fragment, undefined, titleColor);
            titleTextElement.appendChild(fragment);
        }
    }
    
    /**
     * Create a DOM element for a scene synopsis with consistent formatting
     * @returns An SVG group element containing the formatted synopsis
     */
    generateElement(scene: Scene, contentLines: string[], sceneId: string): SVGGElement {
        // Map the publish stage to a CSS class
        const stage = scene["Publish Stage"] || 'Zero';
        const stageClass = `title-stage-${String(stage).toLowerCase()}`;
        
        // Get the title color from the publish stage
        const titleColor = this.plugin.settings.publishStageColors[stage as keyof typeof this.plugin.settings.publishStageColors] || '#808080';
        
        // Determine where the synopsis content ends and metadata begins
        let synopsisEndIndex = contentLines.findIndex(line => line === '\u00A0' || line === '');
        if (synopsisEndIndex === -1) {
            // If no separator found, assume last two lines are metadata (subplots & characters)
            synopsisEndIndex = Math.max(0, contentLines.length - 2);
        }
        
        // Get metadata items - everything after the separator
        const metadataItems = contentLines.slice(synopsisEndIndex + 1);
        
        // Process all content lines to decode any HTML entities
        const decodedContentLines = contentLines.map(line => decodeHtmlEntities(line));
        
        // Create truly random color mappings for subplots and characters
        // These will generate new colors on every reload
        const getSubplotColor = (subplot: string): string => {
            // Generate a random dark color with good contrast (HSL: random hue, high saturation, low lightness)
            const hue = Math.floor(Math.random() * 360);
            const saturation = 60 + Math.floor(Math.random() * 20); // 60-80%
            const lightness = 25 + Math.floor(Math.random() * 15);  // 25-40% - dark enough for contrast
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        };
        
        const getCharacterColor = (character: string): string => {
            // Similar to subplot colors but with slightly different ranges
            const hue = Math.floor(Math.random() * 360);
            const saturation = 60 + Math.floor(Math.random() * 30); // 60-90%
            const lightness = 30 + Math.floor(Math.random() * 15);  // 30-45%
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        };
        
        // Set the line height
        const lineHeight = 24;
        let metadataY = 0;
        
        // Create the main container group
        const containerGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        containerGroup.setAttribute("class", "scene-info info-container");
        containerGroup.setAttribute("data-for-scene", sceneId);
        
        // Create the synopsis text group
        const synopsisTextGroup = document.createElementNS("http://www.w3.org/2000/svg", "g");
        synopsisTextGroup.setAttribute("class", "synopsis-text");
        containerGroup.appendChild(synopsisTextGroup);
        
        // Add the title with publish stage color - at origin (0,0)
        const titleContent = decodedContentLines[0];
        const titleTextElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
        titleTextElement.setAttribute("class", `info-text title-text-main ${stageClass}`);
        titleTextElement.setAttribute("x", "0");
        titleTextElement.setAttribute("y", "0");
        titleTextElement.setAttribute("text-anchor", "start");
        // Remove style attribute and use CSS variable
        titleTextElement.style.setProperty('--title-color', titleColor);
        
        // Process title content with special handling for formatting
        this.addTitleContent(titleContent, titleTextElement, titleColor);
        
        synopsisTextGroup.appendChild(titleTextElement);
        
        // Add synopsis lines with precise vertical spacing
        for (let i = 1; i < synopsisEndIndex; i++) {
            const lineContent = decodedContentLines[i];
            const lineY = i * lineHeight; // Simplified vertical spacing
            
            const synopsisLineElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
            synopsisLineElement.setAttribute("class", "info-text title-text-secondary");
            synopsisLineElement.setAttribute("x", "0");
            synopsisLineElement.setAttribute("y", String(lineY));
            synopsisLineElement.setAttribute("text-anchor", "start");
            
            if (lineContent.includes('<tspan')) {
                // For pre-formatted HTML, we need to parse and create elements safely
                this.processContentWithTspans(lineContent, synopsisLineElement);
            } else {
                synopsisLineElement.textContent = lineContent;
            }
            
            synopsisTextGroup.appendChild(synopsisLineElement);
        }
        
        // Process metadata items with consistent vertical spacing
        if (metadataItems.length > 0) {
            
            // Helper function to add a spacer element
            const addSpacer = (yPosition: number, height: number) => {
                const spacerElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
                spacerElement.setAttribute("class", "synopsis-spacer");
                spacerElement.setAttribute("x", "0");
                spacerElement.setAttribute("y", String(yPosition));
                // Setting font-size to 0, as requested, since constants had no effect
                spacerElement.setAttribute("font-size", `0px`); 
                spacerElement.textContent = "\u00A0"; // Non-breaking space
                spacerElement.setAttribute("opacity", "0"); // Make it invisible
                synopsisTextGroup.appendChild(spacerElement);
                // Return value now adds 0 height, placing next block immediately after previous
                // Need to return the original yPosition so next block starts correctly relative to the last *content* block
                return yPosition; // Return the STARTING yPosition of the spacer
            };

            // --- Add Spacer IMMEDIATELY after Synopsis Text ---
            const synopsisBottomY = synopsisEndIndex * lineHeight;
            // Call addSpacer with height 0, and store the returned start position
            let currentMetadataY = addSpacer(synopsisBottomY, 0);

            // Process 1beats metadata if it exists
            if (scene["1beats"]) {
                const beatsY = currentMetadataY;
                const beatsText = scene["1beats"] || '';
                const linesAdded = this.formatBeatsText(beatsText, '1beats', synopsisTextGroup, beatsY, lineHeight, 0); // Pass '1beats'
                currentMetadataY = beatsY + (linesAdded * lineHeight);
                if (linesAdded > 0) {
                    // Call addSpacer with height 0, update starting point for next block
                    currentMetadataY = addSpacer(currentMetadataY, 0);
                }
            }
            
            // Process 2beats metadata if it exists
            if (scene["2beats"]) {
                const beatsY = currentMetadataY;
                const beatsText = scene["2beats"] || '';
                const linesAdded = this.formatBeatsText(beatsText, '2beats', synopsisTextGroup, beatsY, lineHeight, 0); // Pass '2beats'
                currentMetadataY = beatsY + (linesAdded * lineHeight);
                if (linesAdded > 0) {
                     // Call addSpacer with height 0, update starting point for next block
                    currentMetadataY = addSpacer(currentMetadataY, 0);
                }
            }
            
            // Process 3beats metadata if it exists
            if (scene["3beats"]) {
                const beatsY = currentMetadataY;
                const beatsText = scene["3beats"] || '';
                const linesAdded = this.formatBeatsText(beatsText, '3beats', synopsisTextGroup, beatsY, lineHeight, 0); // Pass '3beats'
                currentMetadataY = beatsY + (linesAdded * lineHeight);
                if (linesAdded > 0) {
                    // Call addSpacer with height 0, update starting point for next block
                    currentMetadataY = addSpacer(currentMetadataY, 0);
                }
            }
            
            // --- Subplot rendering starts here, using the final currentMetadataY ---
            // currentMetadataY now holds the Y position *before* the last added spacer (if any)
            // or after the last content block if no spacer was added.
            const subplotStartY = currentMetadataY; 

            // Process subplots if first metadata item exists
            const decodedMetadataItems = metadataItems.map(item => decodeHtmlEntities(item));
            
            if (decodedMetadataItems.length > 0 && decodedMetadataItems[0] && decodedMetadataItems[0].trim().length > 0) {
                const subplots = decodedMetadataItems[0].split(', ').filter(s => s.trim().length > 0);
                    
                    if (subplots.length > 0) {
                        const subplotTextElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        subplotTextElement.setAttribute("class", "info-text metadata-text");
                        subplotTextElement.setAttribute("x", "0");
                        // Use the calculated subplotStartY
                        subplotTextElement.setAttribute("y", String(subplotStartY)); 
                        subplotTextElement.setAttribute("text-anchor", "start");
                        
                        // Format each subplot with its own color
                        subplots.forEach((subplot, j) => {
                            const color = getSubplotColor(subplot.trim()); // Restore random color
                            const subplotText = subplot.trim();
                            const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                            tspan.setAttribute("data-item-type", "subplot");
                            tspan.setAttribute("fill", color);
                            tspan.setAttribute("style", `fill: ${color} !important`); // Use random color with !important
                            tspan.textContent = subplotText;
                            subplotTextElement.appendChild(tspan);
                            if (j < subplots.length - 1) {
                                const comma = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                                comma.setAttribute("fill", "var(--text-muted)");
                                comma.textContent = ", ";
                                subplotTextElement.appendChild(comma);
                            }
                        });
                        
                        synopsisTextGroup.appendChild(subplotTextElement);
                }
            }
            
            // Process characters - second metadata item
            if (decodedMetadataItems.length > 1 && decodedMetadataItems[1] && decodedMetadataItems[1].trim().length > 0) {
                 // Calculate character Y based on subplot position plus standard line height
                const characterY = subplotStartY + lineHeight; 
                const characters = decodedMetadataItems[1].split(', ').filter(c => c.trim().length > 0);
                    
                if (characters.length > 0) {
                    const characterTextElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    characterTextElement.setAttribute("class", "info-text metadata-text");
                    characterTextElement.setAttribute("x", "0");
                    characterTextElement.setAttribute("y", String(characterY));
                    characterTextElement.setAttribute("text-anchor", "start");
                        
                    // Format each character with its own color
                    characters.forEach((character, j) => {
                        const color = getCharacterColor(character.trim()); // Restore random color
                        const characterText = character.trim();
                        const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                        tspan.setAttribute("data-item-type", "character");
                        tspan.setAttribute("fill", color);
                        tspan.setAttribute("style", `fill: ${color} !important`); // Use random color with !important
                        tspan.textContent = characterText;
                        characterTextElement.appendChild(tspan);
                        if (j < characters.length - 1) {
                            const comma = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                            comma.setAttribute("fill", "var(--text-muted)");
                            comma.textContent = ", ";
                            characterTextElement.appendChild(comma);
                        }
                    });
                        
                    synopsisTextGroup.appendChild(characterTextElement);
                }
            }
        }
        
        return containerGroup;
    }
    
    /**
     * Generate SVG string from DOM element (temporary compatibility method)
     */
    generateHTML(scene: Scene, contentLines: string[], sceneId: string): string {
        const element = this.generateElement(scene, contentLines, sceneId);
        const serializer = new XMLSerializer();
        return serializer.serializeToString(element);
    }
    
    /**
     * Update the position of a synopsis based on mouse position
     */
    updatePosition(synopsis: Element, event: MouseEvent, svg: SVGSVGElement, sceneId: string): void {
        if (!synopsis || !svg) {
            this.plugin.log("updatePosition: missing synopsis or svg element", {synopsis, svg});
            return;
        }
        
        try {
            // Get SVG coordinates from mouse position
            const pt = svg.createSVGPoint();
            pt.x = event.clientX;
            pt.y = event.clientY;
            const ctm = svg.getScreenCTM();
            if (!ctm) {
                this.plugin.log("updatePosition: No SVG CTM available");
                return;
            }
            
            const svgP = pt.matrixTransform(ctm.inverse());
            
            // Determine which quadrant the mouse is in
            const quadrant = this.getQuadrant(svgP.x, svgP.y);
            
            // Calculate positioning parameters
            const size = 1600; // SVG size
            const margin = 30;
            const outerRadius = size / 2 - margin;
            const adjustedRadius = outerRadius - 20; // Reduce radius by 20px to move synopsis closer to center
            
            // Debug info
            if (this.plugin.settings.debug) {
                this.plugin.log(`Mouse position: SVG(${svgP.x.toFixed(0)}, ${svgP.y.toFixed(0)}), Quadrant: ${quadrant}`);
            }
            
            // Reset styles and classes
            (synopsis as SVGElement).removeAttribute('style');
            synopsis.classList.remove('synopsis-q1', 'synopsis-q2', 'synopsis-q3', 'synopsis-q4');
            
            // Configure position based on quadrant
            const position = this.getPositionForQuadrant(quadrant, adjustedRadius);
            
            // Apply the position class and base transform
            synopsis.classList.add(`synopsis-${position.quadrantClass}`);
            
            // Calculate the initial x-position based on Pythagorean theorem
            const y = position.y;
            let x = 0;
            
            // Pythagorean calculation for the base x-position
            // For y-coordinate on circle: x² + y² = r²
            if (Math.abs(y) < adjustedRadius) {
                x = Math.sqrt(adjustedRadius * adjustedRadius - y * y);
                
                // FIXED: Apply direction based on alignment - same convention as text positioning
                // For right-aligned text (Q1, Q4), x should be positive
                // For left-aligned text (Q2, Q3), x should be negative
                x = position.isRightAligned ? x : -x;
            }
            
            // Set the base transformation to position the synopsis correctly
            synopsis.setAttribute('transform', `translate(${x}, ${y})`);
            
            // Ensure the synopsis is visible
            synopsis.classList.add('visible');
            synopsis.setAttribute('opacity', '1');
            synopsis.setAttribute('pointer-events', 'all');
            
            // Position text elements to follow the arc
            this.positionTextElements(synopsis, position.isRightAligned, position.isTopHalf);
            
        } catch (e) {
            this.plugin.log("Error in updatePosition:", e);
        }
    }
    
    /**
     * Determine which quadrant a point is in
     * SVG coordinate system: (0,0) is at center
     * Q1: Bottom-Right (+x, +y)
     * Q2: Bottom-Left (-x, +y)
     * Q3: Top-Left (-x, -y)
     * Q4: Top-Right (+x, -y)
     */
    private getQuadrant(x: number, y: number): string {
        // Debug log to troubleshoot
        this.plugin.log(`Raw coordinates: x=${x}, y=${y}`);
        
        // Define quadrants based on SVG coordinates
        if (x >= 0 && y >= 0) return "Q1";      // Bottom Right (+x, +y)
        else if (x < 0 && y >= 0) return "Q2";  // Bottom Left (-x, +y)
        else if (x < 0 && y < 0) return "Q3";   // Top Left (-x, -y)
        else return "Q4";                       // Top Right (+x, -y)
    }
    
    /**
     * Get position configuration for a specific quadrant
     */
    private getPositionForQuadrant(quadrant: string, outerRadius: number): {
        x: number,
        y: number,
        quadrantClass: string,
        isRightAligned: boolean,
        isTopHalf: boolean
    } {
        // Place synopsis in opposite quadrant from mouse position (same half)
        let result = {
            x: 0,
            y: 0,
            quadrantClass: "",
            isRightAligned: false,
            isTopHalf: false
        };
        
        // Fixed vertical positions
        const topHalfOffset = -550; // Fixed vertical position from center for top half
        const bottomHalfOffset = 120; // Updated value for bottom half (Q1, Q2)
        
        // Debug log to troubleshoot
        this.plugin.log(`Processing quadrant: ${quadrant}`);
        
        switch (quadrant) {
            case "Q1": // Mouse in Bottom Right -> Synopsis in Q2 (Bottom Left)
                result.x = 0;
                result.y = bottomHalfOffset; // Bottom half with updated value
                result.quadrantClass = "q2";
                result.isRightAligned = false; // Left aligned
                result.isTopHalf = false;
                break;
                
            case "Q2": // Mouse in Bottom Left -> Synopsis in Q1 (Bottom Right)
                result.x = 0;
                result.y = bottomHalfOffset; // Bottom half with updated value
                result.quadrantClass = "q1";
                result.isRightAligned = true; // Right aligned
                result.isTopHalf = false;
                break;
                
            case "Q3": // Mouse in Top Left -> Synopsis in Q4 (Top Right)
                result.x = 0;
                result.y = topHalfOffset; // Top half (unchanged)
                result.quadrantClass = "q4";
                result.isRightAligned = true; // Right aligned
                result.isTopHalf = true;
                break;
                
            case "Q4": // Mouse in Top Right -> Synopsis in Q3 (Top Left)
                result.x = 0;
                result.y = topHalfOffset; // Top half (unchanged)
                result.quadrantClass = "q3";
                result.isRightAligned = false; // Left aligned
                result.isTopHalf = true;
                break;
        }
        
        // Debug log the result for troubleshooting
        this.plugin.log(`Synopsis positioning: quadrant=${result.quadrantClass}, isRightAligned=${result.isRightAligned}, y=${result.y}`);
        
        return result;
    }
    
    /**
     * Position text elements along an arc
     */
    private positionTextElements(synopsis: Element, isRightAligned: boolean, isTopHalf: boolean): void {
        // Find all text elements
        const textElements = Array.from(synopsis.querySelectorAll('text'));
        if (textElements.length === 0) return;
        
        // Set text anchor alignment based on quadrant
        const textAnchor = isRightAligned ? 'end' : 'start';
        textElements.forEach(textEl => {
            textEl.setAttribute('text-anchor', textAnchor);
        });
        
        // Get the synopsis text group
        const synopsisTextGroup = synopsis.querySelector('.synopsis-text');
        if (!synopsisTextGroup) {
            this.plugin.log("Error: Could not find synopsis text group");
            return;
        }
        
        // Reset any previous transforms
        (synopsisTextGroup as SVGElement).removeAttribute('transform');
        
        // Circle parameters
        const titleLineHeight = 32; // Increased spacing for title/date line
        const synopsisLineHeight = 22; // Reduced spacing for synopsis text
        const radius = 750; // Reduced from 770 by 20px to match the adjustedRadius in updatePosition
        
        // Calculate starting y-position from synopsis position
        const synopsisTransform = (synopsis as SVGElement).getAttribute('transform') || '';
        const translateMatch = synopsisTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        
        if (!translateMatch || translateMatch.length < 3) {
            this.plugin.log("Error: Could not parse synopsis transform", synopsisTransform);
            return;
        }
        
        const baseX = parseFloat(translateMatch[1]);
        const baseY = parseFloat(translateMatch[2]);
        
        this.plugin.log(`Base position parsed: x=${baseX}, y=${baseY}`);
        
        // Position each text element using Pythagorean theorem relative to circle center
        textElements.forEach((textEl, index) => {
            // Calculate absolute position for this line with variable line heights
            let yOffset = 0;
            
            if (index === 0) {
                // Title line - position at origin
                yOffset = 0;
            } else {
                // All other lines use the synopsis line height with title spacing
                yOffset = titleLineHeight + (index - 1) * synopsisLineHeight;
            }
            
            const absoluteY = baseY + yOffset;
            
            // First line (index 0) should be positioned at the circle's edge
            if (index === 0) {
                textEl.setAttribute('x', '0');
                textEl.setAttribute('y', '0');
                
                if (this.plugin.settings.debug) {
                    this.plugin.log(`Title positioned at x=0, y=0, (absolute: ${baseX}, ${baseY})`);
                }
            } else {
                // For subsequent lines, calculate x-position using Pythagorean theorem
                // This makes text follow the circle's arc
                // For a point on a circle: x² + y² = r²
                let xOffset = 0;
                
                // Calculate distance for debugging
                //const distanceFromCenter = Math.sqrt(baseX * baseX + absoluteY * absoluteY);
                //this.plugin.log(`Line ${index} distance check: distanceFromCenter=${distanceFromCenter.toFixed(2)}, radius=${radius}`);
                
                // Calculate what the x-coordinate would be if this point were on the circle
                try {
                    const circleX = Math.sqrt(radius * radius - absoluteY * absoluteY);
                    
                    // DEBUG: Log the values we're using
                   // this.plugin.log(`Calculation for line ${index}: isTopHalf=${isTopHalf}, isRightAligned=${isRightAligned}, circleX=${circleX.toFixed(2)}, baseX=${baseX.toFixed(2)}`);
                    
                    // Calculate the x-offset for this line based on quadrant
                    if (isTopHalf) {
                        // Top half (Q3, Q4) - KEEP EXISTING BEHAVIOR
                        if (isRightAligned) {
                            // Q4 (top right) - text flows left
                            xOffset = Math.abs(circleX) - Math.abs(baseX);
                        } else {
                            // Q3 (top left) - text flows right
                            xOffset = Math.abs(baseX) - Math.abs(circleX);
                        }
                    } else {
                        // Bottom half (Q1, Q2) - FIXED CALCULATION
                        if (isRightAligned) {
                            // Q1 (bottom right) - text flows left
                            // Match Q4 formula with adjusted sign for bottom half
                            xOffset = -(Math.abs(baseX) - Math.abs(circleX));
                        } else {
                            // Q2 (bottom left) - text flows right
                            // Match Q3 formula that works correctly
                            xOffset = Math.abs(baseX) - Math.abs(circleX);
                        }
                    }
                    
                } catch (e) {
                    // If calculation fails (e.g. sqrt of negative), use a fixed offset
                    this.plugin.log(`Error calculating offset for line ${index}: ${e.message}`);
                    xOffset = 0;
                }
                
                // Apply calculated coordinates relative to the base position
                textEl.setAttribute('x', String(Math.round(xOffset)));
                textEl.setAttribute('y', String(yOffset));
            }
            
            // Debug logging
            if (this.plugin.settings.debug && index <= 3) {
                this.plugin.log(`Text ${index} positioned at x=${textEl.getAttribute('x')}, y=${textEl.getAttribute('y')}, absoluteY=${absoluteY}`);
            }
        });
    }

    /**
     * Process content with tspan elements and add to an SVG element
     * @param content The HTML content to process
     * @param parentElement The SVG element to append processed nodes to
     */
    private processContentWithTspans(content: string, parentElement: SVGElement): void {
        this.plugin.log(`DEBUG: Processing content with tspans: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
        
        // First decode any HTML entities in the content
        let processedContent = content;
        
        // Check if the content contains HTML-encoded tspan elements
        if (content.includes('&lt;tspan') && !content.includes('<tspan')) {
            // Convert HTML entities to actual tags for proper parsing
            processedContent = content
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&apos;/g, "'")
                .replace(/&amp;/g, '&');
                
            this.plugin.log(`DEBUG: Decoded HTML entities in content`);
        }
        
        // Use DOMParser to parse the content safely
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${processedContent}</div>`, 'text/html');
        const container = doc.querySelector('div');

        if (!container) {
            this.plugin.log(`DEBUG: Failed to parse HTML content: no container found`);
            return;
        }
        
        // Check if there are any direct text nodes
        let hasDirectTextNodes = false;
        container.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
                hasDirectTextNodes = true;
            }
        });
        
        this.plugin.log(`DEBUG: Content has direct text nodes: ${hasDirectTextNodes}`);
        
        if (hasDirectTextNodes) {
            // Handle mixed content (text nodes and elements)
            container.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    // Add text directly
                    if (node.textContent?.trim()) {
                        parentElement.appendChild(document.createTextNode(node.textContent));
                        this.plugin.log(`DEBUG: Added text node: "${node.textContent}"`);
                    }
                } else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'tspan') {
                    // Handle tspan element
                    const tspan = node as Element;
                    const svgTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                    
                    // Copy attributes
                    Array.from(tspan.attributes).forEach(attr => {
                        svgTspan.setAttribute(attr.name, attr.value);
                        
                        // Fix any incorrectly formatted style attributes that might contain "limportant" instead of "!important"
                        if (attr.name === 'style' && attr.value.includes('limportant')) {
                            const fixedStyle = attr.value.replace(/\s*limportant\s*;?/g, ' !important;');
                            svgTspan.setAttribute('style', fixedStyle);
                        }
                    });
                    
                    svgTspan.textContent = tspan.textContent;
                    this.plugin.log(`DEBUG: Added tspan element with text: "${tspan.textContent}"`);
                    parentElement.appendChild(svgTspan);
                }
            });
        } else {
            // Process only tspan elements
            const tspans = container.querySelectorAll('tspan');
            this.plugin.log(`DEBUG: Found ${tspans.length} tspan elements`);
            
            tspans.forEach(tspan => {
                const svgTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                
                // Copy attributes
                Array.from(tspan.attributes).forEach(attr => {
                    svgTspan.setAttribute(attr.name, attr.value);
                    
                    // Fix any incorrectly formatted style attributes
                    if (attr.name === 'style' && attr.value.includes('limportant')) {
                        const fixedStyle = attr.value.replace(/\s*limportant\s*;?/g, ' !important;');
                        svgTspan.setAttribute('style', fixedStyle);
                    }
                });
                
                svgTspan.textContent = tspan.textContent;
                this.plugin.log(`DEBUG: Added tspan element with text: "${tspan.textContent}"`);
                parentElement.appendChild(svgTspan);
            });
        }
        
        // If no content was added to the parent element, add the original text as fallback
        if (!parentElement.hasChildNodes()) {
            this.plugin.log(`DEBUG: No content was added, using original text as fallback`);
            parentElement.textContent = content;
        }
    }

    // Add this new method for splitting text into lines
    private splitTextIntoLines(text: string, maxWidth: number): string[] {
        // Handle null, undefined, or non-string input
        if (!text || typeof text !== 'string') {
            this.plugin.log(`DEBUG: splitTextIntoLines received invalid text: ${text}`);
            return [''];  // Return an array with a single empty string
        }
        
        // Trim the text to remove leading/trailing whitespace
        const trimmedText = text.trim();
        
        // Check if the trimmed text is empty
        if (!trimmedText) {
            this.plugin.log(`DEBUG: splitTextIntoLines received empty or whitespace-only text`);
            return [''];  // Return an array with a single empty string for empty content
        }
        
        // Simple line splitting based on approximate character count
        const words = trimmedText.split(/\s+/);
        const lines: string[] = [];
        let currentLine = '';
        const maxCharsPerLine = 50; // Approximately 400px at 16px font size
        
        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const wordWidth = word.length;
            
            if (currentLine.length + wordWidth + 1 > maxCharsPerLine && currentLine !== '') {
                lines.push(currentLine.trim());
                currentLine = word;
            } else {
                currentLine += (currentLine ? ' ' : '') + word;
            }
        }
        
        if (currentLine) {
            lines.push(currentLine.trim());
        }
        
        // If we still end up with no lines, ensure we return something
        if (lines.length === 0) {
            this.plugin.log(`DEBUG: splitTextIntoLines produced no lines, returning default`);
            return [trimmedText]; // Return the trimmed text as a single line
        }
        
        this.plugin.log(`DEBUG: splitTextIntoLines produced ${lines.length} lines from text of length ${text.length}`);
        return lines;
    }

    /**
     * Formats and adds beat text lines to an SVG group.
     * @param beatsText The multi-line string containing beats for one section.
     * @param beatKey The key identifying the section ('1beats', '2beats', '3beats').
     * @param parentGroup The SVG group element to append the text elements to.
     * @param baseY The starting Y coordinate for the first line.
     * @param lineHeight The vertical distance between lines.
     * @param spacerSize Size of the spacer to add after this beats section.
     */
    private formatBeatsText(beatsText: string, beatKey: '1beats' | '2beats' | '3beats', parentGroup: SVGElement, baseY: number, lineHeight: number, spacerSize: number = 0): number {
        // START: Restore line splitting logic
        if (!beatsText || typeof beatsText !== 'string' || beatsText === 'undefined' || beatsText === 'null') {
            return 0;
        }
        beatsText = beatsText.replace(/undefined|null/gi, '').trim();
        if (!beatsText) {
            return 0;
        }
        let lines: string[] = [];
        if (beatsText.trim().includes('\n')) {
            lines = beatsText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
        } else {
            const trimmedText = beatsText.trim();
            if (trimmedText.startsWith('-')) {
                if (trimmedText.length > 1) { lines = [trimmedText]; }
            } else {
                lines = trimmedText.split(',').map(item => `- ${item.trim()}`).filter(line => line.length > 2);
                if (lines.length === 0 && trimmedText.length > 0) {
                    lines = [`- ${trimmedText}`];
                }
            }
        }
        // END: Restore line splitting logic

        // Add this after the line splitting logic but before the for loop
        // Around line 1275-1280, right after "// END: Restore line splitting logic"

        // Pre-process lines that are too long (specifically for 2beats)
        if (beatKey === '2beats' && lines.length > 0) {
            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();
                
                // First extract any grade notation like [B]
                let gradePrefix = "";
                const gradeMatch = line.match(/^\s*(\[[A-Z][+-]?\]\s*)/);
                if (gradeMatch) {
                    gradePrefix = gradeMatch[1];
                    line = line.substring(gradeMatch[0].length).trim();
                }
                
                // Instead of building word-based segments, split on commas directly
                if (line.includes(',')) {
                    // Split by commas and create new lines from each segment
                    const segments = line.split(',').map(segment => segment.trim()).filter(segment => segment.length > 0);
                    
                    if (segments.length > 1) {
                        // First segment keeps the grade prefix
                        const firstSegment = segments.shift() || '';
                        const processedLines = [
                            gradePrefix ? `${gradePrefix} ${firstSegment}` : firstSegment,
                            ...segments.map(segment => `- ${segment}`)
                        ];
                        
                        // Replace current line with expanded lines
                        lines.splice(i, 1, ...processedLines);
                        
                        // Adjust i to account for the new lines
                        i += processedLines.length - 1;
                        continue;
                    }
                }
                
                // If line has a grade prefix but no commas, reattach the grade prefix
                if (gradePrefix) {
                    lines[i] = `${gradePrefix} ${line}`;
                }
            }
        }

        let currentY = baseY;
        let lineCount = 0;
    
        // Add a grade border line for the 2beats section if it has a letter grade
        let detectedGrade: string | null = null;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line.startsWith('-')) { line = `- ${line}`; }
            let rawContent = line.substring(1).trim();
            if (!rawContent) continue;

            // --- Revised Splitting and Formatting Logic --- 
            let titleText = rawContent; // Default: whole line is title
            let commentText = '';     // Default: no comment
            let titleClass = 'beats-text-neutral'; // Default class
            let commentClass = 'beats-text'; // Default comment class
            let signDetected: string | null = null; // Store the detected sign (+, -, ?)
            let useSlashSeparator = false; // Flag to control adding " / "

            // 1. Find the specific "Sign /" pattern
            const signSlashPattern = /^(.*?)\s*([-+?])\s*\/\s*(.*)$/;
            const match = rawContent.match(signSlashPattern);

            if (match) {
                // Pattern "Title Sign / Comment" found
                titleText = match[1].trim();    // Part before the sign
                signDetected = match[2];        // The actual sign (+, -, ?)
                commentText = match[3].trim(); // Part after the slash
                useSlashSeparator = true;     // We found the pattern, so use the slash
                // NOTE: Title sign is implicitly removed because titleText comes from group 1 (before the sign)
            } else {
                 // Pattern not found. Check if there's a sign at the end for coloring, but don't split.
                 const endSignMatch = rawContent.match(/\s*([-+?])$/);
                 if (endSignMatch) {
                     signDetected = endSignMatch[1];
                     // Remove the sign from the title text for display
                     titleText = rawContent.substring(0, endSignMatch.index).trim();
                 }
                 // No split needed, commentText remains empty, useSlashSeparator remains false
            }

            // 2. Determine Title CSS Class based on the detected sign
            if (signDetected === '+') {
                titleClass = 'beats-text-positive';
            } else if (signDetected === '-') {
                titleClass = 'beats-text-negative';
            } // Otherwise remains 'beats-text-neutral'
            
            // Handle special case for 2beats first line grade
            let isFirstLineOf2Beats = (beatKey === '2beats' && i === 0);
            let detectedGrade: string | null = null;
            if (isFirstLineOf2Beats) {
                // Look for Grade (A, B, C) potentially at the start of titleText
                const gradeMatch = titleText.match(/^\s*\d+(\.\d+)?\s+([ABC])(?![A-Za-z0-9])/i);
                 if (gradeMatch && gradeMatch[2]) {
                    detectedGrade = gradeMatch[2].toUpperCase();
                    // Override classes for the grade line
                    titleClass = 'beats-text-grade'; 
                    commentClass = 'beats-text-grade';
                 }
            }

            // --- Create SVG Elements --- 
            const textElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
            textElement.setAttribute("class", "beats-text"); // Base class for the line
            textElement.setAttribute("x", "0");
            textElement.setAttribute("y", String(currentY));
            textElement.setAttribute("text-anchor", "start");

            // Create Tspan for the Title part
            const titleTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
            titleTspan.setAttribute("class", titleClass); // Apply class based on sign/grade
            titleTspan.textContent = titleText; // Already processed/sign removed
            textElement.appendChild(titleTspan);

            // Create Tspan for the Comment part (if applicable)
            if (useSlashSeparator && commentText) {
                const commentTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                commentTspan.setAttribute("class", commentClass); // Default or grade class
                commentTspan.textContent = " / " + commentText; // Add the slash separator
                textElement.appendChild(commentTspan);
            } else if (commentText && !useSlashSeparator) {
                 // Case where a sign was found at the end but no slash - commentText is empty, so nothing added.
            }

            parentGroup.appendChild(textElement);
            currentY += lineHeight;
            lineCount++;
        }

        // Add grade border if detected
        if (detectedGrade && beatKey === '2beats') {
            // Find the scene group this synopsis belongs to
            const sceneGroup = parentGroup.closest('.scene-group');
            if (sceneGroup) {
                // Find the number-square in the scene group
                const numberSquare = sceneGroup.querySelector('.number-square');
                if (numberSquare) {
                    // Add the grade class to the number square
                    numberSquare.classList.add(`grade-${detectedGrade}`);

                    // Create or update the grade border
                    let gradeBorder = sceneGroup.querySelector('.grade-border-line');
                     if (!gradeBorder) {
                        gradeBorder = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                         gradeBorder.setAttribute("class", `grade-border-line grade-${detectedGrade}`);
                        
                        // Copy size and position from number-square
                        const x = numberSquare.getAttribute('x') || "0";
                        const y = numberSquare.getAttribute('y') || "0";
                        const width = numberSquare.getAttribute('width') || "0";
                        const height = numberSquare.getAttribute('height') || "0";
                        
                        gradeBorder.setAttribute("x", x);
                        gradeBorder.setAttribute("y", y);
                        gradeBorder.setAttribute("width", width);
                        gradeBorder.setAttribute("height", height);
                        gradeBorder.setAttribute("fill", "none");
                        
                        // Insert the border before the number-square for proper z-index
                         numberSquare.parentNode?.insertBefore(gradeBorder, numberSquare);
                     } else {
                        // Update existing border with the grade class
                         gradeBorder.setAttribute("class", `grade-border-line grade-${detectedGrade}`);
                     }
                 }
             }
        }

        // Add spacer at the end of this section if needed
        if (spacerSize > 0) {
            const addSpacer = (yPosition: number, height: number) => {
                const spacer = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                spacer.setAttribute("class", "synopsis-spacer");
                spacer.setAttribute("x", "0");
                spacer.setAttribute("y", String(yPosition));
                spacer.setAttribute("width", "20");
                spacer.setAttribute("height", String(height));
                spacer.setAttribute("fill", "transparent");
                parentGroup.appendChild(spacer);
            };
            
            addSpacer(currentY, spacerSize);
                currentY += spacerSize;
        }

        return lineCount;
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
    private synopsisManager: SynopsisManager;
    
    // Add property to store the latest status counts for completion estimate
    latestStatusCounts: Record<string, number> | null = null;
    
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
        const escapedPattern = this.escapeRegExp(this.searchTerm);
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

    // Add helper method to escape special characters in regex
    private escapeRegExp(string: string): string {
        return escapeRegExp(string); // Use the shared utility function
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
            name: 'Search Timeline', // Sentence case
            callback: () => {
                this.openSearchPrompt();
            }
        });

        this.addCommand({
            id: 'clear-timeline-search',
            name: 'Clear Search', // Sentence case
            callback: () => {
                this.clearSearch();
            }
        });

        // Add settings tab
        this.addSettingTab(new ManuscriptTimelineSettingTab(this.app, this));
        
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

        this.addCommand({
            id: 'search-timeline',
            name: 'Search Timeline',
            callback: () => {
                this.openSearchPrompt();
            }
        });

        this.addCommand({
            id: 'clear-timeline-search',
            name: 'Clear Timeline Search',
            callback: () => {
                this.clearSearch();
            }
        });

        // --- ADD NEW COMMANDS --- 
        this.addCommand({
            id: 'update-beats-manuscript-order',
            name: 'Update Flagged Beats (Manuscript Order)',
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
            name: 'Update Flagged Beats (Subplot Order)',
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
        this.addSettingTab(new ManuscriptTimelineSettingTab(this.app, this));

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
            name: 'Clear processed beats cache', // Use sentence case
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
                            (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.opacity = "1";
                            (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.pointerEvents = "all";
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
                            (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.opacity = "0";
                            (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.pointerEvents = "none";
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

                            // Only log scene data in debug mode, and avoid the noisy scene details
                            if (this.settings.debug) {
                                // this.log(`Added scene: ${metadata.Title || file.basename}`); // Commented out due to excessive logging
                            }
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

    // Change from private to public
    public createTimelineSVG(scenes: Scene[]): { svgString: string; maxStageColor: string; } {
        // Performance optimization: Check if we have an excessive number of scenes
        const sceneCount = scenes.length;
        const size = 1600;
        const margin = 30;
        const innerRadius = 200; // the first ring is 200px from the center
        const outerRadius = size / 2 - margin;
        const maxTextWidth = 500; // Define maxTextWidth for the synopsis text
    
        // --- Find Max Publish Stage --- START ---
        const stageOrder = ["Zero", "Author", "House", "Press"];
        let maxStageIndex = 0; // Default to Zero index
        scenes.forEach(scene => {
            const stage = scene["Publish Stage"] || "Zero";
            const currentIndex = stageOrder.indexOf(stage);
            if (currentIndex > maxStageIndex) {
                maxStageIndex = currentIndex;
            }
        });
        const maxStageName = stageOrder[maxStageIndex];
        // Add check before accessing settings potentially
        const maxStageColor = this.settings.publishStageColors[maxStageName as keyof typeof this.settings.publishStageColors] || DEFAULT_SETTINGS.publishStageColors.Zero;
 
        // --- Find Max Publish Stage --- END ---

        // Create SVG - REMOVE data-max-stage-color attribute
        let svg = `<svg width="${size}" height="${size}" viewBox="-${size / 2} -${size / 2} ${size} ${size}" 
                       xmlns="http://www.w3.org/2000/svg" class="manuscript-timeline-svg" 
                       preserveAspectRatio="xMidYMid meet">`; // Removed data-max-stage-color
        
        // REMOVE placeholder element
        // svg += `<g id="timeline-config-data" data-max-stage-color="${maxStageColor}"></g>`;

        // Add debug coordinate display if debug mode is enabled
        if (this.settings.debug) {
            svg += `
                <g class="debug-info-container svg-interaction"><!-- SAFE: class-based SVG interaction -->
                    <rect class="debug-info-background" x="-790" y="-790" width="230" height="40" rx="5" ry="5" fill="rgba(255,255,255,0.9)" stroke="#333333" stroke-width="1" />
                    <text class="debug-info-text" id="mouse-coords-text" x="-780" y="-765" fill="#ff3300" font-size="20px" font-weight="bold" stroke="white" stroke-width="0.5px" paint-order="stroke">Mouse: X=0, Y=0</text>
                </g>
            `;
        }
        
        // Add search results indicator if search is active
        if (this.searchActive && this.searchResults.size > 0) {
            svg += `
                <g transform="translate(-${size/2 - 20}, -${size/2 - 30})">
                    <rect x="0" y="0" width="200" height="40" rx="5" ry="5" 
                          fill="#FFCC00" fill-opacity="0.6" stroke="#000000" stroke-width="1" />
                    <text x="10" y="25" fill="#000000" font-size="14px" font-weight="bold">
                        Found ${this.searchResults.size} scene${this.searchResults.size !== 1 ? 's' : ''}: "${this.searchTerm}"
                    </text>
                    <g transform="translate(185, 20)" class="clear-search-btn" data-action="clear-search">
                        <circle r="15" fill="#FFFFFF" fill-opacity="0.8" stroke="#000000" stroke-width="1" />
                        <path d="M-8,-8 L8,8 M-8,8 L8,-8" stroke="#000000" stroke-width="2" fill="none" />
                    </g>
                </g>
            `;
        }
        
        // Center the origin in the middle of the SVG
        svg += `<g transform="translate(${size / 2}, ${size / 2})">`;
        
        // Create defs for patterns and gradients
        svg += `<defs>`;

        // Create a map to store scene number information for the scene square and synopsis
        const sceneNumbersMap = new Map<string, SceneNumberInfo>();
    
        // Collect all unique subplots
        const allSubplotsSet = new Set<string>();
        scenes.forEach(scene => {
            allSubplotsSet.add(scene.subplot || "None");
        });
        const allSubplots = Array.from(allSubplotsSet);
    
        // Dynamically set NUM_RINGS based on the number of unique subplots
        const NUM_RINGS = allSubplots.length;
    
        const DEFAULT_RING_COLOR = '#333333'; // Dark gray
    
        // Group scenes by Act and Subplot
        const scenesByActAndSubplot: { [act: number]: { [subplot: string]: Scene[] } } = {};
    
        for (let act = 0; act < NUM_ACTS; act++) {
            scenesByActAndSubplot[act] = {};
        }
    
        scenes.forEach(scene => {
            const act = scene.actNumber !== undefined ? scene.actNumber - 1 : 0; // Subtract 1 for 0-based index, default to 0 if undefined
    
            // Ensure act is within valid range
            const validAct = (act >= 0 && act < NUM_ACTS) ? act : 0;
    
            const subplot = scene.subplot || 'Default';
    
            if (!scenesByActAndSubplot[validAct][subplot]) {
                scenesByActAndSubplot[validAct][subplot] = [];
            }
    
            scenesByActAndSubplot[validAct][subplot].push(scene);
        });
    
        // Define the months and their angles
        const months = Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * 2 * Math.PI - Math.PI / 2; // Adjust so January is at the top
            const name = new Date(2000, i).toLocaleString('en-US', { month: 'long' });
            const shortName = new Date(2000, i).toLocaleString('en-US', { month: 'short' }).slice(0, 3);
            return { name, shortName, angle };
        });
    
        // Calculate total available space
        const availableSpace = outerRadius - innerRadius;
    
        // Set the reduction factor for ring widths (if you want equal widths, set reductionFactor to 1)
        const reductionFactor = 1; // For equal ring widths
        const N = NUM_RINGS;
    
        // Calculate the sum of the geometric series (simplifies to N when reductionFactor is 1)
        const sumOfSeries = (reductionFactor === 1) ? N : (1 - Math.pow(reductionFactor, N)) / (1 - reductionFactor);
    
        // Calculate the initial ring width to fill the available space
        const initialRingWidth = availableSpace / sumOfSeries;
    
        // Calculate each ring's width
        const ringWidths = Array.from({ length: N }, (_, i) => initialRingWidth * Math.pow(reductionFactor, i));
    
        // Calculate the start radii for each ring
        const ringStartRadii = ringWidths.reduce((acc, width, i) => {
            const previousRadius = i === 0 ? innerRadius : acc[i - 1] + ringWidths[i - 1];
            acc.push(previousRadius);
            return acc;
        }, [] as number[]);
    
        // Months radius outer and inner
        const lineInnerRadius = ringStartRadii[0] - 20;
        const lineOuterRadius = ringStartRadii[N - 1] + ringWidths[N - 1] + 30;
    
        // **Include the `<style>` code here**
        svg = `<svg width="${size}" height="${size}" viewBox="-${size / 2} -${size / 2} ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="manuscript-timeline-svg" preserveAspectRatio="xMidYMid meet">`;

        // Access the publishStageColors from settings
        const PUBLISH_STAGE_COLORS = this.settings.publishStageColors;

        // Begin defs act
        svg += `<defs>`;
        
        // Define patterns for Working and Todo states with Publish Stage colors
        svg += `${Object.entries(PUBLISH_STAGE_COLORS).map(([stage, color]) => {
            // Desaturate the stage color for the 'Working' background - REMOVED
            // const desaturatedColor = this.desaturateColor(color, 0.75); // Desaturate by 75%
            return `
            <pattern id="plaidWorking${stage}" patternUnits="userSpaceOnUse" width="80" height="20" patternTransform="rotate(-20)">
                <rect width="80" height="20" fill="var(--color-working)" opacity="var(--color-plaid-opacity)"/>
                <path d="M 0 10 Q 2.5 -5, 5 10 Q 7.5 25, 10 10 Q 12.5 5, 15 10 Q 17.5 25, 20 10 Q 22.5 -5, 25 10 Q 27.5 25, 30 10 Q 32.5 5, 35 10 Q 37.5 25, 40 10 Q 42.5 -5, 45 10 Q 47.5 25, 50 10 Q 52.5 5, 55 10 Q 57.5 25, 60 10 Q 62.5 -5, 65 10 Q 67.5 25, 70 10 Q 72.5 5, 75 10 Q 77.5 25, 80 10" 
                    stroke="${color}" 
                    stroke-opacity="var(--color-plaid-stroke-opacity)" 
                    stroke-width="1.5" 
                    fill="none" />
            </pattern>
            
            <pattern id="plaidTodo${stage}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
                <rect width="10" height="10" fill="var(--color-todo)" opacity="var(--color-plaid-opacity)"/>
                <line x1="0" y1="0" x2="0" y2="10" 
                    stroke="${color}" 
                    stroke-width="1" 
                    stroke-opacity="var(--color-plaid-stroke-opacity)"/>
                <line x1="0" y1="0" x2="10" y2="0" 
                    stroke="${color}" 
                    stroke-width="1" 
                    stroke-opacity="var(--color-plaid-stroke-opacity)"/>
            </pattern>
        `;}).join('')}`;
        
        // Define outer arc paths for months
        months.forEach(({ name, angle }, index) => {
            // Calculate angular offset for 9px at the label radius
            const outerlabelRadius = lineOuterRadius - 15; //the larger the number the closer to the center
            // Convert 5px to radians based on the circle's circumference
            const pixelToRadian = (5 * 2 * Math.PI) / (2 * Math.PI * outerlabelRadius);
            
            // Make the month offset very small, similar to but positive (clockwise) for Acts
            const angleOffset = 0.01; // Half of previous value (0.02)
            const startAngle = angle + angleOffset;  // Small offset to move label clockwise
            const endAngle = startAngle + (Math.PI / 24); // Short arc length
  
            const pathId = `monthLabelPath-${index}`;

            svg += `
                <path id="${pathId}"
                    d="
                        M ${formatNumber(outerlabelRadius * Math.cos(startAngle))} ${formatNumber(outerlabelRadius * Math.sin(startAngle))}
                        A ${formatNumber(outerlabelRadius)} ${formatNumber(outerlabelRadius)} 0 0 1 ${formatNumber(outerlabelRadius * Math.cos(endAngle))} ${formatNumber(outerlabelRadius * Math.sin(endAngle))}
                    "
                    fill="none"
                />
            `;
        });

        // Close defs act
        svg += `</defs>`;

        // Get current month index (0-11)
        const currentMonthIndex = new Date().getMonth();

        //outer months Labels
        months.forEach(({ name }, index) => {
            const pathId = `monthLabelPath-${index}`;
            const isPastMonth = index < currentMonthIndex;
            svg += `
                <text class="month-label-outer" ${isPastMonth ? 'opacity="0.5"' : ''}>
                    <textPath href="#${pathId}" startOffset="0" text-anchor="start">
                        ${name}
                    </textPath>
                </text>
            `;
        });

        // First add the progress ring (RAINBOW YEAR PROGRESS)
        // Calculate year progress
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        
        const yearProgress = (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24 * 365);
        // TEMP TEST: Force full year display to see all colors
        // const yearProgress = 1; // TEMP TEST: Force 100% to display all segments

        // Create progress ring
        const progressRadius = lineInnerRadius + 15;
        const circumference = 2 * Math.PI * progressRadius;
        // const progressLength = circumference * yearProgress; // No longer needed for arc calc
        const currentYearStartAngle = -Math.PI / 2; // Start at 12 o'clock
        const currentYearEndAngle = currentYearStartAngle + (2 * Math.PI * yearProgress);

        // Define rainbow gradients for the segments
        svg += `<defs>
            <linearGradient id="linearColors1" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#FF0000"></stop>
                <stop offset="100%" stop-color="#FF7F00"></stop>
            </linearGradient>
            <linearGradient id="linearColors2" x1="0.5" y1="0" x2="0.5" y2="1">
                <stop offset="0%" stop-color="#FF7F00"></stop>
                <stop offset="100%" stop-color="#FFFF00"></stop>
            </linearGradient>
            <linearGradient id="linearColors3" x1="1" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="#FFFF00"></stop>
                <stop offset="100%" stop-color="#00FF00"></stop>
            </linearGradient>
            <linearGradient id="linearColors4" x1="1" y1="1" x2="0" y2="0">
                <stop offset="0%" stop-color="#00FF00"></stop>
                <stop offset="100%" stop-color="#0000FF"></stop>
            </linearGradient>
            <linearGradient id="linearColors5" x1="0.5" y1="1" x2="0.5" y2="0">
                <stop offset="0%" stop-color="#0000FF"></stop>
                <stop offset="100%" stop-color="#4B0082"></stop>
            </linearGradient>
            <linearGradient id="linearColors6" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stop-color="#4B0082"></stop>
                <stop offset="100%" stop-color="#8F00FF"></stop>
            </linearGradient>
        </defs>`;

        // Add the base gray circle
        svg += `
            <circle
                cx="0"
                cy="0"
                r="${progressRadius}"
                class="progress-ring-base"
            />
        `;

         // --- Draw Estimation Arc --- START ---
         const estimateResult = this.calculateCompletionEstimate(scenes);

         // --- TEMPORARY DEBUG OVERRIDE FOR QUADRANT TESTING --- START ---
         // Uncomment ONE of the following lines to force the estimated date for testing positioning.
         // Remember to remove or comment out this block when done testing!

         // --- Quadrant Midpoints ---
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 1, 15); // Feb 15 (Quadrant 4 - Top Right)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 4, 15); // May 15 (Quadrant 1 - Bottom Right)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 7, 15); // Aug 15 (Quadrant 2 - Bottom Left)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 10, 15); // Nov 15 (Quadrant 3 - Top Left)

         // --- Cardinal Directions ---
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 0, 1);  // Jan 1 (Top, -90 deg)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 3, 1);  // Apr 1 (Right, 0 deg)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 6, 1);  // Jul 1 (Bottom, 90 deg)
         // const estimatedCompletionDate = new Date(new Date().getFullYear() + 1, 9, 1);  // Oct 1 (Left, 180 deg)
         // --- TEMPORARY DEBUG OVERRIDE FOR QUADRANT TESTING --- END ---

         // Only proceed if estimate calculation was successful
         if (estimateResult) {
             // Use estimateResult.date instead of estimatedCompletionDate
             const estimatedCompletionDate = estimateResult.date;

             const startAngle = -Math.PI/2; // 12 o'clock position

             if (this.settings.debug) {
                 this.log(`[Timeline Estimate] Calculating arc for date: ${estimatedCompletionDate.toISOString().split('T')[0]}`);
             }
             
             const estimatedYear = estimatedCompletionDate.getFullYear();
             const estimatedMonth = estimatedCompletionDate.getMonth();
             const estimatedDay = estimatedCompletionDate.getDate();
             
             const estimatedDaysInMonth = new Date(estimatedYear, estimatedMonth + 1, 0).getDate();
             const estimatedYearPos = estimatedMonth/12 + estimatedDay/estimatedDaysInMonth/12;
             const estimatedDateAngle = ((estimatedYearPos + 0.75) % 1) * Math.PI * 2;
             
             const now = new Date(); // Need current time for diff calculations
             const diffMs = estimatedCompletionDate.getTime() - now.getTime();
             let arcAngleSpan = estimatedDateAngle - startAngle;
             if (arcAngleSpan < 0) arcAngleSpan += 2 * Math.PI;
             const yearsDiff = estimatedCompletionDate.getFullYear() - now.getFullYear();

             // First, draw complete circles for each full year if any
             for (let i = 0; i < yearsDiff; i++) {
                 svg += `
                     <circle
                         cx="0"
                         cy="0"
                         r="${progressRadius}"
                         fill="none"
                         class="estimation-arc estimation-full-year"
                     />
                 `;
             }
             
             // Draw the arc from January 1 (12 o'clock) to estimated date position
             svg += `
                 <path
                     d="
                         M ${progressRadius * Math.cos(startAngle)} ${progressRadius * Math.sin(startAngle)}
                         A ${progressRadius} ${progressRadius} 0 ${arcAngleSpan > Math.PI ? 1 : 0} 1 
                         ${progressRadius * Math.cos(estimatedDateAngle)} ${progressRadius * Math.sin(estimatedDateAngle)}
                     "
                     class="estimation-arc"
                 />
             `;

         }
         // --- Draw Estimation Arc --- END ---

         
        // BEGIN add the month spokes group (existing code)
        svg += `<g class="month-spokes">`;

        // For each month, draw the inner spoke and labels
    
        // Then modify the inner month labels to curve along the inner arc
        months.forEach(({ name, angle }, monthIndex) => {
            const x1 = formatNumber((lineInnerRadius - 5) * Math.cos(angle));
            const y1 = formatNumber((lineInnerRadius - 5) * Math.sin(angle));
            const x2 = formatNumber(lineOuterRadius * Math.cos(angle));
            const y2 = formatNumber(lineOuterRadius * Math.sin(angle));

            // Check if this is an Act boundary (months 0, 4, or 8)
            const isActBoundary = [0, 4, 8].includes(monthIndex);
            // Check if this month has passed
            const isPastMonth = monthIndex < currentMonthIndex;

            // Draw the spoke line
            svg += `
                <line  
                    x1="${x1}"
                    y1="${y1}"
                    x2="${x2}"
                    y2="${y2}"
                    class="month-spoke-line${isActBoundary ? ' act-boundary' : ''}${isPastMonth ? ' past-month' : ''}"
                />`;

            // Create curved path for inner month labels
            const innerLabelRadius = lineInnerRadius;
            const pixelToRadian = (5 * 2 * Math.PI) / (2 * Math.PI * innerLabelRadius);
            const startAngle = angle + pixelToRadian;
            const endAngle = angle + (Math.PI / 6);
            
            const innerPathId = `innerMonthPath-${name}`;
            
            svg += `
                <path id="${innerPathId}"
                    d="
                        M ${formatNumber(innerLabelRadius * Math.cos(startAngle))} ${formatNumber(innerLabelRadius * Math.sin(startAngle))}
                        A ${formatNumber(innerLabelRadius)} ${formatNumber(innerLabelRadius)} 0 0 1 ${formatNumber(innerLabelRadius * Math.cos(endAngle))} ${formatNumber(innerLabelRadius * Math.sin(endAngle))}
                    "
                    fill="none"
                />
                <text class="month-label" ${isPastMonth ? 'opacity="0.5"' : ''}>
                    <textPath href="#${innerPathId}" startOffset="0" text-anchor="start">
                        ${months[monthIndex].shortName}
                    </textPath>
                </text>
            `;
        });

        // Close the month spokes lines and text labels group
        svg += `</g>`;


        // Create six segments for the rainbow (Year Progress)
        const segmentCount = 6;
        const fullCircleAngle = 2 * Math.PI;
        const segmentAngle = fullCircleAngle / segmentCount;
        
        // Calculate how many complete segments to show based on year progress
        const completeSegments = Math.floor(yearProgress * segmentCount);
        
        // Calculate the partial segment angle (for the last visible segment)
        const partialSegmentAngle = (yearProgress * segmentCount - completeSegments) * segmentAngle;
        
        // Draw each segment that should be visible
        for (let i = 0; i < segmentCount; i++) {
            // Calculate this segment's start and end angles
            const segStart = currentYearStartAngle + (i * segmentAngle);
            let segEnd = segStart + segmentAngle;
            
            // If this is beyond what should be shown based on year progress, skip it
            if (i > completeSegments) continue;
            
            // If this is the last partial segment, adjust the end angle
            if (i === completeSegments && partialSegmentAngle > 0) {
                segEnd = segStart + partialSegmentAngle;
            }
            
            // Create the arc path for this segment
            svg += `
                <path
                    d="
                        M ${progressRadius * Math.cos(segStart)} ${progressRadius * Math.sin(segStart)}
                        A ${progressRadius} ${progressRadius} 0 ${(segEnd - segStart) > Math.PI ? 1 : 0} 1 
                        ${progressRadius * Math.cos(segEnd)} ${progressRadius * Math.sin(segEnd)}
                    "
                    class="progress-ring-fill"
                    stroke="url(#linearColors${i+1})"
                />
            `;
        }

        // Add tick mark and label for the estimated completion date if available
        // Use the same estimateResult check
        if (estimateResult) {
            const estimatedCompletionDate = estimateResult.date; // Get date again

            // Use estimateResult.date for calculations
            const estimatedMonth = estimatedCompletionDate.getMonth();
            const estimatedDay = estimatedCompletionDate.getDate();
            const estimatedDaysInMonth = new Date(estimatedCompletionDate.getFullYear(), estimatedMonth + 1, 0).getDate();
            const estimatedYearPos = estimatedMonth/12 + estimatedDay/estimatedDaysInMonth/12;
            const absoluteDatePos = ((estimatedYearPos + 0.75) % 1) * Math.PI * 2;

            // ... (calculate tick mark positions using absoluteDatePos) ...
            const tickOuterRadius = progressRadius + 5;
            const tickInnerRadius = progressRadius - 35;
            const tickOuterX = tickOuterRadius * Math.cos(absoluteDatePos);
            const tickOuterY = tickOuterRadius * Math.sin(absoluteDatePos);
            const tickInnerX = tickInnerRadius * Math.cos(absoluteDatePos);
            const tickInnerY = tickInnerRadius * Math.sin(absoluteDatePos);
            
            svg += `
                <line 
                    x1="${formatNumber(tickOuterX)}" 
                    y1="${formatNumber(tickOuterY)}" 
                    x2="${formatNumber(tickInnerX)}" 
                    y2="${formatNumber(tickInnerY)}" 
                    class="estimated-date-tick" 
                />
                <circle 
                    cx="${formatNumber(tickInnerX)}" 
                    cy="${formatNumber(tickInnerY)}" 
                    r="4" 
                    class="estimated-date-dot" 
                />
            `;

            // Use estimateResult.date for display format
            const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', year: '2-digit' });
            const dateDisplay = dateFormatter.format(estimatedCompletionDate);
            
            // --- Get stats string from estimateResult --- START ---
            const total = estimateResult.total;
            const remaining = estimateResult.remaining;
            const rate = estimateResult.rate; // Already rounded
            const statsDisplay = `${total}:${remaining}:${rate}`; // Compact format
            // --- Get stats string from estimateResult --- END ---

            // ... (calculate label positions using absoluteDatePos) ...
            const labelRadius = progressRadius - 45;
            const maxOffset = -38;
            const offsetX = maxOffset * Math.cos(absoluteDatePos);
            const maxYOffset = 5;
            const offsetY = -maxYOffset * Math.sin(absoluteDatePos);
            const labelX = formatNumber(labelRadius * Math.cos(absoluteDatePos) + offsetX);
            const labelY = formatNumber(labelRadius * Math.sin(absoluteDatePos) + offsetY);

            svg += `
                <text
                    x="${labelX}"
                    y="${labelY}"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    class="estimation-date-label"
                >
                    ${dateDisplay}
                </text>
            `;

            //   Replace dateDisplay above for complete stats ${dateDisplay} ${statsDisplay}
        }

        // --- START: Draw Target Completion Marker ---
        let targetDateAngle = -Math.PI / 2; // Default to 12 o'clock (top)

        if (this.settings.targetCompletionDate) {
            try {
                // Parse the date string, ensuring it's treated as local time
                const targetDate = new Date(this.settings.targetCompletionDate + 'T00:00:00');
                const today = new Date();
                today.setHours(0, 0, 0, 0); // Normalize today to the beginning of the day

                // Only use the date if it's valid and in the future
                if (!isNaN(targetDate.getTime()) && targetDate > today) {
                    targetDateAngle = dateToAngle(targetDate);
                    if (this.settings.debug) {
                        this.log(`[Timeline Target] Using target date: ${targetDate.toISOString().slice(0,10)}, Angle: ${targetDateAngle.toFixed(2)}`);
                    }
                } else {
                     if (this.settings.debug) {
                        this.log(`[Timeline Target] Target date ${this.settings.targetCompletionDate} is invalid or not in the future. Using default.`);
                     }
                }
            } catch (e) {
                if (this.settings.debug) {
                   this.log(`[Timeline Target] Error parsing target date ${this.settings.targetCompletionDate}. Using default. Error: ${e}`);
                }
                // Keep default angle if parsing fails
            }
        } else {
            if (this.settings.debug) {
                this.log(`[Timeline Target] No target date set. Using default 12 o'clock.`);
            }
            // Keep default angle if setting is not present
        }

        // Define radii and size (similar to estimation marker)
        // const targetTickRadius = progressRadius; // Position relative to the progress ring - REMOVED
        // const targetTickHalfLength = 8; // How far the tick extends in/out - REMOVED
        const targetTickOuterRadius = progressRadius + 5; // Match red tick outer radius
        const targetTickInnerRadius = progressRadius - 35; // Match red tick inner radius
        const targetMarkerSize = 8; // Size of the square marker

        // Draw the tick mark line
        svg += `
            <line
                x1="${formatNumber(targetTickOuterRadius * Math.cos(targetDateAngle))}"
                y1="${formatNumber(targetTickOuterRadius * Math.sin(targetDateAngle))}"
                x2="${formatNumber((targetTickInnerRadius+3) * Math.cos(targetDateAngle))}"
                y2="${formatNumber((targetTickInnerRadius+3) * Math.sin(targetDateAngle))}"
                class="target-date-tick"
            />
        `;

        // Draw the square marker centered on the INNER radius (to match red dot position)
        const markerX = formatNumber(targetTickInnerRadius * Math.cos(targetDateAngle) - targetMarkerSize / 2);
        const markerY = formatNumber(targetTickInnerRadius * Math.sin(targetDateAngle) - targetMarkerSize / 2);
        svg += `
            <rect
                x="${markerX}"
                y="${markerY}"
                width="${targetMarkerSize}"
                height="${targetMarkerSize}"
                class="target-date-marker"
            />
        `;
        // --- END: Draw Target Completion Marker ---

        // Create master subplot order before the act loop
        const masterSubplotOrder = (() => {
            // Create a combined set of all subplots from all acts
            const allSubplotsMap = new Map<string, number>();
            
            // Iterate through all acts to gather all subplots
            for (let actIndex = 0; actIndex < NUM_ACTS; actIndex++) {
                Object.entries(scenesByActAndSubplot[actIndex] || {}).forEach(([subplot, scenes]) => {
                    // Add scenes count to existing count or initialize
                    allSubplotsMap.set(subplot, (allSubplotsMap.get(subplot) || 0) + scenes.length);
                });
            }
            
            // Convert map to array of subplot objects
            const subplotCounts = Array.from(allSubplotsMap.entries()).map(([subplot, count]) => ({
                subplot,
                count
            }));

            // Sort subplots, but ensure "Main Plot" or empty subplot is first
            subplotCounts.sort((a, b) => {
                // If either subplot is "Main Plot" or empty, prioritize it
                if (a.subplot === "Main Plot" || !a.subplot) return -1;
                if (b.subplot === "Main Plot" || !b.subplot) return 1;
                // Otherwise, sort by count as before
                return b.count - a.count;
            });

            return subplotCounts.map(item => item.subplot);
        })();

        // Synopses at end to be above all other elements
        const synopsesElements: SVGGElement[] = [];
        
        // Create a Map to store grade information by sceneId (NEW)
        const sceneGrades = new Map<string, string>();
        
        scenes.forEach((scene) => {
            // Handle undefined subplot with a default "Main Plot"
            const subplot = scene.subplot || "Main Plot";
            const subplotIndex = masterSubplotOrder.indexOf(subplot);
            const ring = NUM_RINGS - 1 - subplotIndex;
            
            // Handle undefined actNumber with a default of 1
            const actNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
            
            // Get the scenes for this act and subplot to determine correct index
            const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
            const actIndex = sceneActNumber - 1;
            const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];
            const sceneIndex = scenesInActAndSubplot.indexOf(scene);
            
            const sceneId = `scene-path-${actIndex}-${ring}-${sceneIndex}`; // Keep the old ID format
            
            // Extract grade from 2beats here, when we know it's available (NEW)
            if (scene["2beats"]) {
                try {
                    const firstLine2Beats = scene["2beats"].split('\n')[0]?.trim() || '';
                    // Updated regex to match "[Number] [GradeLetter] / [Comment]"
                    const gradeMatch = firstLine2Beats.match(/^(?:\d+(?:\.\d+)?\s+)?([ABC])(?![A-Za-z0-9])/i);                    if (gradeMatch && gradeMatch[1]) {
                        const grade = gradeMatch[1].toUpperCase();
                        // Store the grade in our Map
                        sceneGrades.set(sceneId, grade);
                    }
                } catch (e) {
                    this.log(`[ERROR][EarlyGradeExtract] Error extracting grade: ${e}`);
                }
            }
            
            // Skip content generation for placeholder scenes
            if (!scene.title) {
                return;
            }
            
            // Find all subplots this scene belongs to
            const allSceneSubplots = scenes
                .filter(s => s.path === scene.path)
                .map(s => s.subplot);

            // Reorder subplots to put the current ring's subplot first
            const orderedSubplots = [
                scene.subplot,
                ...allSceneSubplots.filter(s => s !== scene.subplot)
            ];
            
            // Prepare text content with modified format
            const contentLines = [
                // Format title and date on same line with spacing
                this.highlightSearchTerm(`${scene.title}   ${scene.when?.toLocaleDateString() || ''}`),
                ...(scene.synopsis ? this.splitIntoBalancedLines(scene.synopsis, maxTextWidth).map(line => this.highlightSearchTerm(line)) : []),
                '\u00A0', // Separator
            ];
            
            // --- Subplots --- 
            // Remove the loop generating subplotsHtml
            // Just push the raw subplot string (or empty string if none)
            const rawSubplots = orderedSubplots.join(', ');
            contentLines.push(rawSubplots);
            
            // --- Characters ---
            // Remove the loop generating charactersHtml
            // Just push the raw character string (or empty string if none)
            const rawCharacters = (scene.Character || []).join(', ');
            contentLines.push(rawCharacters);
            
            // Filter out empty lines AFTER generating raw strings
            const filteredContentLines = contentLines.filter(line => line && line.trim() !== '\u00A0');
            
            // Generate the synopsis element using our new DOM-based method
            // This will now always receive raw text for subplots/characters
            const synopsisElement = this.synopsisManager.generateElement(scene, filteredContentLines, sceneId);
            synopsesElements.push(synopsisElement);
        });

        // Draw scenes and dummy scenes (existing code remains as is)
        for (let act = 0; act < NUM_ACTS; act++) {
            const totalRings = NUM_RINGS;
            const subplotCount = masterSubplotOrder.length;
            const ringsToUse = Math.min(subplotCount, totalRings);

            for (let ringOffset = 0; ringOffset < ringsToUse; ringOffset++) {
                const ring = totalRings - ringOffset - 1; // Start from the outermost ring
                
                const innerR = ringStartRadii[ring];
                const outerR = innerR + ringWidths[ring];
                
                const startAngle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                const endAngle = ((act + 1) * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                
                // Use the subplot from the master order instead of the current act's order
                const subplot = masterSubplotOrder[ringOffset];

                if (subplot) {
                    const currentScenes = scenesByActAndSubplot[act][subplot] || [];

                    if (currentScenes && currentScenes.length > 0) {
                        const sceneAngleSize = (endAngle - startAngle) / currentScenes.length;
            
                        currentScenes.forEach((scene, idx) => {
                            const { number, text } = parseSceneTitle(scene.title || '');
                            const sceneStartAngle = startAngle + (idx * sceneAngleSize);
                            const sceneEndAngle = sceneStartAngle + sceneAngleSize;
                            // Position text 2px from the top boundary of the cell
                            const textPathRadius = outerR - 25;
            
                            // Determine the color of a scene based on its status and due date
                            const color = (() => {
                                const statusList = Array.isArray(scene.status) ? scene.status : [scene.status];
                                const normalizedStatus = statusList[0]?.toString().trim().toLowerCase() || '';
                                
                                // Get the publish stage for pattern selection
                                const publishStage = scene["Publish Stage"] || 'Zero';
                                
                                // If status is empty/undefined/null, treat it as "Todo" with plaid pattern
                                if (!normalizedStatus || normalizedStatus === '') {
                                    return `url(#plaidTodo${publishStage})`;
                                }
                                
                                if (normalizedStatus === "complete") {
                                    // For completed scenes, use Publish Stage color with full opacity
                                    const stageColor = PUBLISH_STAGE_COLORS[publishStage as keyof typeof PUBLISH_STAGE_COLORS] || PUBLISH_STAGE_COLORS.Zero;
                                    // Do not apply any modifications to the color to ensure it matches the legend
                                    return stageColor;
                                }
                                
                                // Check due date before checking working/todo
                                if (scene.due) {
                                    const originalDueString = scene.due;
                                    const parts = originalDueString.split('-').map(Number);

                                    // Ensure we have valid parts before proceeding
                                    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                                        const dueYear = parts[0];
                                        const dueMonth = parts[1] - 1; // Convert 1-based month
                                        const dueDay = parts[2];
                                        
                                        const today = new Date();
                                        const todayYear = today.getFullYear();
                                        const todayMonth = today.getMonth();
                                        const todayDay = today.getDate();
                                        
                                        // Compare dates by parts - overdue only if date is strictly before today
                                        let isOverdue = false;
                                        if (dueYear < todayYear) {
                                            isOverdue = true;
                                        } else if (dueYear === todayYear) {
                                            if (dueMonth < todayMonth) {
                                                isOverdue = true;
                                            } else if (dueMonth === todayMonth) {
                                                if (dueDay < todayDay) {
                                                    isOverdue = true;
                                                }
                                                // Same day is NOT overdue
                                            }
                                        }
                                        
                                        // **Specific Debug Log for Scene Coloring**
                                        // if (this.settings.debug) {
                                        //    console.log(`TRACE: Scene Color - Due Date Check for "${scene.title || scene.path}"`, {
                                        //        dueString: originalDueString,
                                        //        parsedDueYear: dueYear,
                                        //        parsedDueMonth: dueMonth + 1, // Log 1-based month
                                        //        parsedDueDay: dueDay,
                                        //        parsedTodayYear: todayYear,
                                        //        parsedTodayMonth: todayMonth + 1, // Log 1-based month
                                        //        parsedTodayDay: todayDay,
                                        //        comparisonResult_isOverdue: isOverdue
                                        //    });
                                        // }
                                        
                                        if (isOverdue) {
                                            return STATUS_COLORS.Due; // Return Due color if overdue
                                        }
                                    } else {
                                        // Handle invalid date format
                                        if (this.settings.debug) {
                                            console.warn(`WARN: Invalid date format for scene color: ${originalDueString}`);
                                        }
                                    }
                                }
                                
                                // If not overdue (or no due date), check for working/todo status
                                if (normalizedStatus === "working") {
                                    return `url(#plaidWorking${publishStage})`;
                                }
                                if (normalizedStatus === "todo") {
                                    return `url(#plaidTodo${publishStage})`;
                                }
                                
                                // Fallback to other status colors or Todo
                                return STATUS_COLORS[statusList[0] as keyof typeof STATUS_COLORS] || STATUS_COLORS.Todo;
                            })();
            
                        
                            // Construct the arc path for the scene
                            const arcPath = `
                                M ${formatNumber(innerR * Math.cos(sceneStartAngle))} ${formatNumber(innerR * Math.sin(sceneStartAngle))}
                                L ${formatNumber(outerR * Math.cos(sceneStartAngle))} ${formatNumber(outerR * Math.sin(sceneStartAngle))}
                                A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(sceneEndAngle))} ${formatNumber(outerR * Math.sin(sceneEndAngle))}
                                L ${formatNumber(innerR * Math.cos(sceneEndAngle))} ${formatNumber(innerR * Math.sin(sceneEndAngle))}
                                A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(sceneStartAngle))} ${formatNumber(innerR * Math.sin(sceneStartAngle))}
                            `;
            
                            const sceneId = `scene-path-${act}-${ring}-${idx}`;
            
                            // Apply appropriate CSS classes based on open status and search match
                            let sceneClasses = "scene-path";
                            if (scene.path && this.openScenePaths.has(scene.path)) sceneClasses += " scene-is-open";
                            // Don't add search-result class to scene paths anymore
            
                            // In createTimelineSVG method, replace the font size calculation with a fixed size:
                            const fontSize = 18; // Fixed font size for all rings
                            const dyOffset = -1;
            
                            svg += `
                            <g class="scene-group" data-path="${scene.path ? encodeURIComponent(scene.path) : ''}" id="scene-group-${act}-${ring}-${idx}">
                                <path id="${sceneId}"
                                      d="${arcPath}" 
                                      fill="${color}" 
                                      stroke="white" 
                                      stroke-width="1" 
                                      class="${sceneClasses}"/>

                                <!-- Scene title path (using only the text part) -->
                                <path id="textPath-${act}-${ring}-${idx}" 
                                      d="M ${formatNumber(textPathRadius * Math.cos(sceneStartAngle + 0.02))} ${formatNumber(textPathRadius * Math.sin(sceneStartAngle + 0.02))} 
                                         A ${formatNumber(textPathRadius)} ${formatNumber(textPathRadius)} 0 0 1 ${formatNumber(textPathRadius * Math.cos(sceneEndAngle))} ${formatNumber(textPathRadius * Math.sin(sceneEndAngle))}" 
                                      fill="none"/>
                                <text class="scene-title scene-title-${fontSize <= 10 ? 'small' : (fontSize <= 12 ? 'medium' : 'large')}${scene.path && this.openScenePaths.has(scene.path) ? ' scene-is-open' : ''}" dy="${dyOffset}" data-scene-id="${sceneId}">
                                    <textPath href="#textPath-${act}-${ring}-${idx}" startOffset="4">
                                        ${text}
                                    </textPath>
                                </text>
                            </g>`;
                        });
                    } else {
                        // Create 4 dummy scenes for empty subplot rings
                        const dummyScenes = 4;
                        for (let idx = 0; idx < dummyScenes; idx++) {
                            const sceneStartAngle = startAngle + (idx * (endAngle - startAngle) / dummyScenes);
                            const sceneEndAngle = startAngle + ((idx + 1) * (endAngle - startAngle) / dummyScenes);
                            
                            // Construct the arc path for the dummy scene
                            const arcPath = `
                                M ${formatNumber(innerR * Math.cos(sceneStartAngle))} ${formatNumber(innerR * Math.sin(sceneStartAngle))}
                                L ${formatNumber(outerR * Math.cos(sceneStartAngle))} ${formatNumber(outerR * Math.sin(sceneStartAngle))}
                                A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(sceneEndAngle))} ${formatNumber(outerR * Math.sin(sceneEndAngle))}
                                L ${formatNumber(innerR * Math.cos(sceneEndAngle))} ${formatNumber(innerR * Math.sin(sceneEndAngle))}
                                A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(sceneStartAngle))} ${formatNumber(innerR * Math.sin(sceneStartAngle))}
                            `;

                            svg += `<path d="${arcPath}" 
                                     fill="#EEEEEE" 
                                     stroke="white" 
                                     stroke-width="1" 
                                     class="scene-path"/>`;
                        }
                    }
                } else {
                    // Empty subplot code
                    const arcPath = `
                        M ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
                        L ${formatNumber(outerR * Math.cos(startAngle))} ${formatNumber(outerR * Math.sin(startAngle))}
                        A ${formatNumber(outerR)} ${formatNumber(outerR)} 0 0 1 ${formatNumber(outerR * Math.cos(endAngle))} ${formatNumber(outerR * Math.sin(endAngle))}
                        L ${formatNumber(innerR * Math.cos(endAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
                        A ${formatNumber(innerR)} ${formatNumber(innerR)} 0 0 0 ${formatNumber(innerR * Math.cos(startAngle))} ${formatNumber(innerR * Math.sin(startAngle))}
                    `;
                    const emptyColor = "#EEEEEE"; // Light gray for empty scenes
                    svg += `<path d="${arcPath}" fill="${emptyColor}" stroke="white" stroke-width="1"/>`;
                }
            }
        }

        // After all scenes are drawn, add just the act borders (vertical lines only)
        for (let act = 0; act < NUM_ACTS; act++) {
            const angle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
            
            // Draw only the vertical line (y-axis spoke) for each act boundary
            svg += `<line 
                x1="${formatNumber(innerRadius * Math.cos(angle))}" 
                y1="${formatNumber(innerRadius * Math.sin(angle))}"
                x2="${formatNumber(outerRadius * Math.cos(angle))}" 
                y2="${formatNumber(outerRadius * Math.sin(angle))}"
                class="act-border"
            />`;
        }

        // Calculate the actual outermost outerRadius (first ring's outer edge)
        const actualOuterRadius = ringStartRadii[NUM_RINGS - 1] + ringWidths[NUM_RINGS - 1];
       
        // Remove the old act code and replace it with this new version:
        for (let act = 0; act < NUM_ACTS; act++) {
            // Calculate angle for each act's starting position
            const angle = (act * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
            
            // Position labels slightly to the left of the vertical borders
            const actLabelRadius = actualOuterRadius + 14;
            const angleOffset = -0.085; // Positive offset moves text clockwise
            
            // Calculate start and end angles for the curved path
            const startAngle = angle + angleOffset;
            const endAngle = startAngle + (Math.PI / 12); // Reduced arc length
            
            const actPathId = `actPath-${act}`;
            
            // Create the curved path for act label
            svg += `
                <path id="${actPathId}"
                    d="
                        M ${formatNumber(actLabelRadius * Math.cos(startAngle))} ${formatNumber(actLabelRadius * Math.sin(startAngle))}
                        A ${formatNumber(actLabelRadius)} ${formatNumber(actLabelRadius)} 0 0 1 ${formatNumber(actLabelRadius * Math.cos(endAngle))} ${formatNumber(actLabelRadius * Math.sin(endAngle))}
                    "
                    fill="none"
                />
                <text class="act-label" fill="${maxStageColor}"> <!-- Use overall maxStageColor -->
                    <textPath href="#${actPathId}" startOffset="0" text-anchor="start">
                        ACT ${act + 1}
                    </textPath>
                </text>
            `;
        }

        // Add color key with decorative elements
        const keyX = size/2 - 200; // Position from right edge
        const keyY = -size/2 + 50; // Position from top
        const swatchSize = 20;
        const textOffset = 30;
        const lineHeight = 26; // Reduced for tighter spacing

        // Calculate the number of scenes for each status using a Set to track unique scenes
        const processedScenes = new Set<string>(); // Track scenes by their path
        const statusCounts = scenes.reduce((acc, scene) => {
            // Skip if we've already processed this scene
            if (scene.path && processedScenes.has(scene.path)) {
                return acc;
            }
            
            // Mark scene as processed
            if (scene.path) {
                processedScenes.add(scene.path);
            }
            
            const normalizedStatus = scene.status?.toString().trim().toLowerCase() || '';
            
            // If status is empty/undefined/null, count it as "Todo"
            if (!normalizedStatus || normalizedStatus === '') {
                acc["Todo"] = (acc["Todo"] || 0) + 1;
                return acc;
            }
            
            if (normalizedStatus === "complete") {
                // For completed scenes, count by Publish Stage
                const publishStage = scene["Publish Stage"] || 'Zero';
                // Use the publishStage directly with type safety
                const validStage = publishStage as keyof typeof PUBLISH_STAGE_COLORS;
                acc[validStage] = (acc[validStage] || 0) + 1;
            } else if (scene.due) {
                 // Parse date directly from string components
                const originalDueString = scene.due;
                const parts = originalDueString.split('-').map(Number);

                // Ensure we have valid parts before proceeding
                if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
                    const dueYear = parts[0];
                    const dueMonth = parts[1] - 1; // Convert 1-based month
                    const dueDay = parts[2];
                    
                    // Get today's date parts
                    const today = new Date();
                    const todayYear = today.getFullYear();
                    const todayMonth = today.getMonth();
                    const todayDay = today.getDate();
                    
                    // Compare dates by parts - overdue only if date is strictly before today
                    let isOverdue = false;
                    if (dueYear < todayYear) {
                        isOverdue = true;
                    } else if (dueYear === todayYear) {
                        if (dueMonth < todayMonth) {
                            isOverdue = true;
                        } else if (dueMonth === todayMonth) {
                            if (dueDay < todayDay) {
                                isOverdue = true;
                            }
                            // Same day is NOT overdue
                        }
                    }
                    
                    // Detailed debug logging
                    //if (this.settings.debug) {
                    //    console.log(`TRACE: Status Count Due Date Debug for "${scene.title || scene.path}"`, {
                    //        dueString: originalDueString,
                    //        parsedDueYear: dueYear,
                    //        parsedDueMonth: dueMonth + 1, // Log 1-based month
                    //        parsedDueDay: dueDay,
                    //        parsedTodayYear: todayYear,
                    //        parsedTodayMonth: todayMonth + 1, // Log 1-based month
                    //        parsedTodayDay: todayDay,
                    //        comparisonResult_isOverdue: isOverdue
                    //    });
                    // }
                    
                    if (isOverdue) {
                        // Non-complete scenes that are past due date are counted as Due
                        acc["Due"] = (acc["Due"] || 0) + 1;
                    } else {
                        // For files due today or in the future, count them by their status
                        let statusKey = "Todo"; // Default to Todo
                        if (scene.status) {
                            if (Array.isArray(scene.status) && scene.status.length > 0) {
                                statusKey = String(scene.status[0]);
                            } else if (typeof scene.status === 'string') {
                                statusKey = scene.status;
                            }
                        }
                        acc[statusKey] = (acc[statusKey] || 0) + 1;
                    }
                } else {
                    // Handle invalid date format
                    if (this.settings.debug) {
                        console.warn(`WARN: Invalid date format in status count: ${originalDueString}`);
                    }
                    // Count scenes with invalid due dates by status
                    let statusKey = "Todo"; 
                    if (scene.status) {
                        if (Array.isArray(scene.status) && scene.status.length > 0) {
                            statusKey = String(scene.status[0]);
                        } else if (typeof scene.status === 'string') {
                            statusKey = scene.status;
                        }
                    }
                    acc[statusKey] = (acc[statusKey] || 0) + 1;
                }
            } else {
                // All other scenes (no due date) are counted by their status
                let statusKey = "Todo"; // Default to Todo
                if (scene.status) {
                    if (Array.isArray(scene.status) && scene.status.length > 0) {
                        statusKey = String(scene.status[0]);
                    } else if (typeof scene.status === 'string') {
                        statusKey = scene.status;
                    }
                }
                acc[statusKey] = (acc[statusKey] || 0) + 1;
            }
            return acc;
        }, {} as Record<string, number>);

        // Save status counts for completion estimate
        this.latestStatusCounts = statusCounts;

        // Add center color key
        const centerRadius = innerRadius * 0.7; // Slightly smaller than innerRadius
        const centerKeySize = 20; // Size of color swatches
        const centerLineHeight = 35;

        // Separate stage colors and status colors
        const stageColorEntries = Object.entries(PUBLISH_STAGE_COLORS);
        const statusColorEntries = Object.entries(STATUS_COLORS)
            .filter(([status]) => status !== 'Empty' && status !== 'Complete');

        // Calculate heights for alignment
        const maxEntries = Math.max(stageColorEntries.length, statusColorEntries.length);
        const totalHeight = maxEntries * centerLineHeight;
        const startY = -totalHeight / 2 + centerLineHeight / 2;

        svg += `
            <g class="color-key-center">
            <!-- Stage colors column (left) ZERO AUTHOR HOUSE PUBLISH -->
                ${stageColorEntries.map(([stage, color], index) => {
                    const yPos = startY + (index * centerLineHeight);
                    return `
                        <g transform="translate(-25, ${yPos})">
                            <!-- Stage label with right justification -->
                            <text 
                                x="-10" 
                                y="0" 
                                dominant-baseline="middle" 
                                text-anchor="end"
                                class="center-key-text"
                            ><tspan>${stage.toUpperCase()}</tspan><tspan dx="0.0em" class="status-count" dy="-7" baseline-shift="super">${statusCounts[stage] || 0}</tspan></text>
                            
                            <!-- Color SWATCH to the right of text -->
                            <rect 
                                x="-3" 
                                y="-13" 
                                width="25" 
                                height="25" 
                                fill="${color}"
                            />
                        </g>
                    `;
                }).join('')}

                <!-- Status colors column (right) -->
                ${statusColorEntries.map(([status, color], index) => {
                    const yPos = startY + (index * centerLineHeight);
                    
                    // Check if this has a special pattern (Working, Todo, or Complete)
                    const hasSpecialPattern = status === 'Working' || status === 'Todo';
                    let fillValue;
                    
                    if (hasSpecialPattern) {
                        fillValue = `url(#plaid${status}Zero)`;
                    } else {
                        fillValue = color;
                    }
                    
                    return `
                        <g transform="translate(25, ${yPos})">
                            <!-- Color SWATCH first (left) -->
                            <rect 
                                x="-20" 
                                y="-13" 
                                width="25" 
                                height="25" 
                                fill="${fillValue}"
                            />
                            
                            <!-- Status label with left justification LEGEND WORKING TODO DUE -->
                            <text 
                                x="10" 
                                y="0" 
                                dominant-baseline="middle" 
                                text-anchor="start"
                                class="center-key-text"
                            ><tspan class="status-count" dy="-7" baseline-shift="super" dx="-0.15em">${statusCounts[status] || 0}</tspan><tspan dy="7">${status.toUpperCase()}</tspan></text>
                        </g>
                    `;
                }).join('')}
            </g>
        `;

        // First, add the background layer with subplot labels
        // --- START: Subplot Label Generation ---
        // Wrap subplot labels in a background layer for proper z-index
        svg += `<g class="background-layer">`;
        
        // Only show subplot labels in Act 3 (top position)
        const act = 3; // Act 3 is at the top (12 o'clock)
        const totalRings = NUM_RINGS;
        const subplotCount = masterSubplotOrder.length;
        const ringsToUse = Math.min(subplotCount, totalRings);
        
        for (let ringOffset = 0; ringOffset < ringsToUse; ringOffset++) {
            const ring = totalRings - ringOffset - 1; // Start from the outermost ring
            const subplot = masterSubplotOrder[ringOffset];
            
            // Skip empty subplots
            if (!subplot) continue;
            
            const innerR = ringStartRadii[ring];
            const outerR = innerR + ringWidths[ring];
            
            // Create a unique ID for the label path
            const labelPathId = `subplot-label-path-${ring}`;
            const labelRadius = (innerR + outerR) / 2; // Center of the ring
            
            // Calculate available height for text (y-axis distance)
            const availableHeight = ringWidths[ring];
            
            // Calculate dynamic font size based on available height
            // Use 95% of available height to fill more space
            const fontSize = Math.floor(availableHeight * 0.95);
            
            // Define arc to END at 270 degrees (12 o'clock) for right justification start
            // Use 90 degrees for the arc length to span Act 3
            const arcLength = Math.PI / 2; // 90 degrees span
            const endAngle = -Math.PI / 2; // End at 12 o'clock position
            const startAngle = endAngle - arcLength; // Start 90 degrees earlier (180 deg)
            
            // Calculate the actual length of the arc path in pixels
            const arcPixelLength = labelRadius * arcLength; 
            
            // Ensure subplot text is properly escaped
            const safeSubplotText = this.safeSvgText(subplot.toUpperCase());
            
            // Create the path for the label - Add data-font-size attribute instead of inline style
            svg += `
                <g class="subplot-label-group" data-font-size="${fontSize}">
                    <path id="${labelPathId}"
                        d="M ${formatNumber(labelRadius * Math.cos(startAngle))} ${formatNumber(labelRadius * Math.sin(startAngle))}
                        A ${formatNumber(labelRadius)} ${formatNumber(labelRadius)} 0 0 1 
                        ${formatNumber(labelRadius * Math.cos(endAngle))} ${formatNumber(labelRadius * Math.sin(endAngle))}"
                        class="subplot-ring-label-path"
                    />
                    <text class="subplot-label-text">
                        <textPath href="#${labelPathId}" startOffset="100%" text-anchor="end"
                                textLength="${arcPixelLength}" lengthAdjust="spacingAndGlyphs">
                            ${safeSubplotText}
                        </textPath>
                    </text>
                </g>
            `;
        }
        
        // Close the background layer group
        svg += `</g>`;
        // --- END: Subplot Label Generation ---

        // Add number squares after background layer but before synopses
        svg += `<g class="number-squares">`;
        scenes.forEach((scene) => {
            const { number } = parseSceneTitle(scene.title || '');
            if (number) {
                const subplot = scene.subplot || "Main Plot";
                const subplotIndex = masterSubplotOrder.indexOf(subplot);
                const ring = NUM_RINGS - 1 - subplotIndex;
                
                // Get the scenes for this act and subplot to determine correct index
                const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
                const actIndex = sceneActNumber - 1;
                const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];
                const sceneIndex = scenesInActAndSubplot.indexOf(scene);
                
                const startAngle = (actIndex * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                const endAngle = ((actIndex + 1) * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                const sceneAngleSize = (endAngle - startAngle) / scenesInActAndSubplot.length;
                const sceneStartAngle = startAngle + (sceneIndex * sceneAngleSize);
                
                const textPathRadius = (ringStartRadii[ring] + (ringStartRadii[ring] + ringWidths[ring])) / 2;
                
                // Reuse the existing square size calculation
                const getSquareSize = (num: string): { width: number, height: number } => {
                    const height = 18;
                    if (num.includes('.')) {
                        return {
                            width: num.length <= 3 ? 24 :
                                    num.length <= 4 ? 32 :
                                    36,
                            height: height
                        };
                    } else {
                        return {
                            width: num.length === 1 ? 20 :
                                    num.length === 2 ? 24 :
                                    28,
                            height: height
                        };
                    }
                };

                const squareSize = getSquareSize(number);
                const squareX = textPathRadius * Math.cos(sceneStartAngle) + 2;
                const squareY = textPathRadius * Math.sin(sceneStartAngle) + 2;
          
                // Store scene number information for square and synopsis
                const sceneId = `scene-path-${actIndex}-${ring}-${sceneIndex}`;
                sceneNumbersMap.set(sceneId, {
                    number,
                    x: squareX,
                    y: squareY,
                    width: squareSize.width,
                    height: squareSize.height
                });

                // Determine colors based on Edits metadata
                const hasEdits = scene.pendingEdits && scene.pendingEdits.trim() !== '';

                // Check if scene is open or a search result
                const isSceneOpen = scene.path && this.openScenePaths.has(scene.path);
                const isSearchMatch = this.searchActive && scene.path && this.searchResults.has(scene.path);

                // Declare base classes first
                let squareClasses = "number-square";
                if (isSceneOpen) squareClasses += " scene-is-open";
                if (isSearchMatch) squareClasses += " search-result";

                // Get grade from our Map instead of trying to extract it again
                const grade = sceneGrades.get(sceneId);
                if (grade) {
                    // Log grade information when in debug mode
                    if (this.settings.debug) {
                        this.log(`[GradeDebug] Found grade ${grade} for scene ${sceneId}`);
                    }
                }
                
                // Add the main group for the square and text
                svg += `
                    <g transform="translate(${squareX}, ${squareY})">
                        <rect 
                            x="-${squareSize.width/2}" 
                            y="-${squareSize.height/2}" 
                            width="${squareSize.width}" 
                            height="${squareSize.height}" 
                            fill="white"
                            class="${squareClasses}${hasEdits ? ' has-edits' : ''}" 
                            data-scene-id="${escapeXml(sceneId)}"
                        />
                        <text 
                            x="0" 
                            y="0" 
                            text-anchor="middle" 
                            dominant-baseline="middle" 
                            class="number-text${isSceneOpen ? ' scene-is-open' : ''}${isSearchMatch ? ' search-result' : ''}${hasEdits ? ' has-edits' : ''}"
                            data-scene-id="${escapeXml(sceneId)}"
                            dy="0.1em"
                            fill="black"
                        >${number}</text>
                    </g>
                `;

                // Add the grade line separately if a grade exists
                if (grade) {
                    const lineOffset = 2; // Offset from the edge of the rect
                    const lineX1 = squareX - squareSize.width / 2;
                    const lineY1 = squareY + squareSize.height / 2 + lineOffset;
                    const lineX2 = squareX + squareSize.width / 2;
                    const lineY2 = lineY1; // Horizontal line

                    // Log positioning data when in debug mode
                    if (this.settings.debug) {
                        this.log(`[GradeDebug] Adding grade line for ${sceneId} at position: x1=${lineX1}, y1=${lineY1}, x2=${lineX2}, y2=${lineY2}`);
                    }

                    svg += `
                        <line 
                            x1="${lineX1}" y1="${lineY1}" 
                            x2="${lineX2}" y2="${lineY2}" 
                            class="grade-border-line grade-${grade}" 
                            data-scene-id="${escapeXml(sceneId)}" 
                            stroke-width="2"
                        />
                    `;
                }
            }
        });
        svg += `</g>`;
        
        // Create container for all synopses
        const synopsesContainer = document.createElementNS("http://www.w3.org/2000/svg", "g");
        synopsesContainer.setAttribute("class", "synopses-container");

        // Add all synopsis elements to the container
        synopsesElements.forEach(element => {
            synopsesContainer.appendChild(element);
        });

        // Serialize the synopses container to SVG string
        const serializer = new XMLSerializer();
        const synopsesHTML = serializer.serializeToString(synopsesContainer);

        // Then add the synopses on top
        svg += synopsesHTML;

        // Add JavaScript to handle synopsis visibility
        const scriptSection = `
        <script>
            document.querySelectorAll('.scene-group').forEach(sceneGroup => {
                const scenePathElement = sceneGroup.querySelector('.scene-path');
                if (!scenePathElement) return; // Skip if no path element found

                const sceneId = scenePathElement.id;
                const synopsis = document.querySelector(\`.scene-info[data-for-scene="\${sceneId}"]\`);
                const gradeLine = document.querySelector(\`.grade-border-line[data-scene-id="\${sceneId}"]\`); // Find the grade line

                sceneGroup.addEventListener('mouseenter', () => {
                    if (synopsis) {
                        synopsis.style.opacity = '1';
                        synopsis.style.pointerEvents = 'all';
                    }
                    if (gradeLine) { // Check if grade line exists
                        gradeLine.classList.remove('non-selected'); // Remove non-selected on hover
                    }
                });

                sceneGroup.addEventListener('mouseleave', () => {
                    if (synopsis) {
                        synopsis.style.opacity = '0';
                        synopsis.style.pointerEvents = 'none';
                    }
                    if (gradeLine) { // Check if grade line exists
                        gradeLine.classList.add('non-selected'); // Add non-selected on mouse out
                    }
                });
            });
        </script>`;

        // Add debug coordinate display
        if (this.settings.debug) {
            svg += `
                <g class="debug-info-container svg-interaction"><!-- SAFE: class-based SVG interaction -->
                    <rect class="debug-info-background" x="-790" y="-790" width="230" height="40" rx="5" ry="5" fill="rgba(255,255,255,0.9)" stroke="#333333" stroke-width="1" />
                    <text class="debug-info-text" id="mouse-coords-text" x="-780" y="-765" fill="#ff3300" font-size="20px" font-weight="bold" stroke="white" stroke-width="0.5px" paint-order="stroke">Mouse: X=0, Y=0</text>
                </g>
                <script>
                    (function() {
                        // Wait for DOM to be ready
                        window.addEventListener('DOMContentLoaded', function() {
                            console.log("Setting up mouse coordinate tracking");
                            
                            // Get SVG element and coordinate text
                            const svg = document.querySelector('.manuscript-timeline-svg');
                            const coordText = document.getElementById('mouse-coords-text');
                            
                            if (!svg || !coordText) {
                                console.error("Couldn't find SVG or coordinate text element");
                                return;
                            }
                            
                            // Add mousemove handler to the main SVG element
                            svg.addEventListener('mousemove', function(e) {
                                try {
                                    const pt = svg.createSVGPoint();
                                    pt.x = e.clientX;
                                    pt.y = e.clientY;
                                    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
                                    coordText.textContent = 'Mouse: X=' + Math.round(svgP.x) + ', Y=' + Math.round(svgP.y);
                                } catch (err) {
                                    console.error("Error calculating coordinates:", err);
                                }
                            });
                            
                            // Also log coordinates on click
                            svg.addEventListener('click', function(e) {
                                try {
                                    const pt = svg.createSVGPoint();
                                    pt.x = e.clientX;
                                    pt.y = e.clientY;
                                    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
                                    console.log('Clicked at:', Math.round(svgP.x), Math.round(svgP.y));
                                } catch (err) {
                                    console.error("Error calculating coordinates:", err);
                                }
                            });
                            
                            console.log("Mouse coordinate tracking initialized");
                        });
                    })();
                </script>
            `;
        }

        // If not in debug mode, close SVG normally
        svg += `${scriptSection}</svg>`;

        const generatedSvgString = svg; // Assuming svg holds the final string

        // Find the max stage color (assuming maxStageColor variable exists here)
        // const maxStageColor = ... // Needs to be defined/calculated earlier

        // Return both the string and the color
        return { svgString: generatedSvgString, maxStageColor: maxStageColor };
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
    private splitIntoBalancedLines(text: string, maxWidth: number): string[] {
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

    public log(message: string, data?: any) {
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
        
        // Find matching scenes
        const regex = new RegExp(this.escapeRegExp(term), 'gi');
        
        // Populate searchResults with matching scene paths
        this.getSceneData().then(scenes => {
            scenes.forEach(scene => {
                // Check scene properties for matches
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
    private safeSvgText(text: string): string {
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
            
            // Final check before returning
            // if (this.settings.debug) { // REMOVE BLOCK
            //     const finalPlaceholder = svgElement.querySelector('#timeline-config-data');
            //     console.log('[Timeline Debug] Final check in createSvgElement: Placeholder exists?', !!finalPlaceholder);
            //     if (finalPlaceholder) {
            //         console.log('[Timeline Debug] Final check in createSvgElement: Placeholder attribute value:', finalPlaceholder.getAttribute('data-max-stage-color'));
            //     }
            // }
           
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
    public hexToRgb(hex: string): { r: number; g: number; b: number } | null {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    public rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
        r /= 255, g /= 255, b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h = 0, s = 0, l = (max + min) / 2;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, l };
    }

    public hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
        let r, g, b;
        if (s === 0) {
            r = g = b = l; // achromatic
        } else {
            const hue2rgb = (p: number, q: number, t: number) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1/6) return p + (q - p) * 6 * t;
                if (t < 1/2) return q;
                if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
                return p;
            };
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    }

    public rgbToHex(r: number, g: number, b: number): string {
        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
    }

    public desaturateColor(hexColor: string, amount: number): string {
        const rgb = this.hexToRgb(hexColor);
        if (!rgb) return hexColor; // Return original if invalid hex

        const hsl = this.rgbToHsl(rgb.r, rgb.g, rgb.b);
        
        // Reduce saturation by the specified amount (e.g., amount=0.5 means 50% less saturation)
        hsl.s = Math.max(0, hsl.s * (1 - amount)); 

        const desaturatedRgb = this.hslToRgb(hsl.h, hsl.s, hsl.l);
        return this.rgbToHex(desaturatedRgb.r, desaturatedRgb.g, desaturatedRgb.b);
    }
    // --- END: Color Conversion & Desaturation Helpers ---

    // Add this function inside the ManuscriptTimelinePlugin class
    private calculateCompletionEstimate(scenes: Scene[]): {
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
        this.app.workspace.detachLeavesOfType(TIMELINE_VIEW_TYPE);
        console.log('Manuscript Timeline Plugin Unloaded');
        // Clean up any other resources
    }
} // End of ManuscriptTimelinePlugin class


class ManuscriptTimelineSettingTab extends PluginSettingTab {
    plugin: ManuscriptTimelinePlugin;

    constructor(app: App, plugin: ManuscriptTimelinePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    // Add color swatch creation function
    private createColorSwatch(container: HTMLElement, color: string): HTMLElement {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
        swatch.style.setProperty('--swatch-color', color);
            
            container.appendChild(swatch);
            return swatch;
    }

    // Add color picker function with centered dialog
    private async showColorPicker(currentColor: string): Promise<string | null> {
        return new Promise((resolve) => {
            // Create a modal container
            const modal = document.createElement('div');
            modal.className = 'color-picker-modal';

            // Create the color picker container
            const pickerContainer = document.createElement('div');
            pickerContainer.className = 'color-picker-container';

            // Create the color picker input
            const colorPicker = document.createElement('input');
            colorPicker.type = 'color';
            colorPicker.value = currentColor;
            colorPicker.className = 'color-picker-input';

            // Create hex input
            const hexInput = document.createElement('input');
            hexInput.type = 'text';
            hexInput.value = currentColor;
            hexInput.className = 'color-picker-text-input';

            // Create RGB input
            const rgbInput = document.createElement('input');
            rgbInput.type = 'text';
            rgbInput.value = this.hexToRgb(currentColor);
            rgbInput.className = 'color-picker-text-input';

            // Create buttons container
            const buttonsContainer = document.createElement('div');
            buttonsContainer.className = 'color-picker-buttons';

            // Create OK button
            const okButton = document.createElement('button');
            okButton.textContent = 'OK';
            okButton.className = 'color-picker-button ok';

            // Create Cancel button
            const cancelButton = document.createElement('button');
            cancelButton.textContent = 'Cancel';
            cancelButton.className = 'color-picker-button cancel';

            // Add drag functionality
            let isDragging = false;
            let currentX: number;
            let currentY: number;
            let initialX: number;
            let initialY: number;
            let xOffset = 0;
            let yOffset = 0;

            pickerContainer.addEventListener('mousedown', (e) => {
                isDragging = true;
                initialX = e.clientX - xOffset;
                initialY = e.clientY - yOffset;
            });

            document.addEventListener('mousemove', (e) => {
                if (isDragging) {
                    e.preventDefault();
                    currentX = e.clientX - initialX;
                    currentY = e.clientY - initialY;
                    xOffset = currentX;
                    yOffset = currentY;
                    pickerContainer.style.transform = `translate(${currentX}px, ${currentY}px)`;
                }
            });

            document.addEventListener('mouseup', () => {
                isDragging = false;
            });

            // Update hex and RGB values when color changes
            colorPicker.addEventListener('input', (e) => {
                const newColor = (e.target as HTMLInputElement).value;
                hexInput.value = newColor;
                rgbInput.value = this.hexToRgb(newColor);
            });

            // Update color picker when hex input changes
            hexInput.addEventListener('input', (e) => {
                const newColor = (e.target as HTMLInputElement).value;
                if (this.isValidHex(newColor)) {
                    colorPicker.value = newColor;
                    rgbInput.value = this.hexToRgb(newColor);
                }
            });

            // Update color picker when RGB input changes
            rgbInput.addEventListener('input', (e) => {
                const newColor = (e.target as HTMLInputElement).value;
                const hex = this.rgbToHex(newColor);
                if (hex) {
                    colorPicker.value = hex;
                    hexInput.value = hex;
                }
            });

            // Add buttons to container
            buttonsContainer.appendChild(cancelButton);
            buttonsContainer.appendChild(okButton);

            // Add all elements to the picker container
            pickerContainer.appendChild(colorPicker);
            pickerContainer.appendChild(hexInput);
            pickerContainer.appendChild(rgbInput);
            pickerContainer.appendChild(buttonsContainer);

            // Add the picker container to the modal
            modal.appendChild(pickerContainer);

            // Add the modal to the document body
            document.body.appendChild(modal);

            // OK button event
            okButton.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(colorPicker.value);
            });

            // Cancel button event
            cancelButton.addEventListener('click', () => {
                document.body.removeChild(modal);
                resolve(null);
            });

            // Close if clicking outside the picker
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    document.body.removeChild(modal);
                    resolve(null);
                }
            });
        });
    }

    // Helper function to convert hex to RGB
    private hexToRgb(hex: string): string {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            return `rgb(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)})`;
        }
        return '';
    }

    // Helper function to convert RGB to hex
    private rgbToHex(rgb: string): string | null {
        const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
            if (match) {
            const r = parseInt(match[1]);
            const g = parseInt(match[2]);
            const b = parseInt(match[3]);
            return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
        }
        return null;
    }

    // Helper function to validate hex color
    private isValidHex(hex: string): boolean {
        return /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();



        // --- Source Path --- 
        new Setting(containerEl)
            .setName('Source path')
            .setDesc('Specify the root folder containing your manuscript scene files.')
            .addText(text => text
                .setPlaceholder('Example: Manuscript/Scenes')
                .setValue(this.plugin.settings.sourcePath)
                .onChange(async (value) => {
                    this.plugin.settings.sourcePath = value;
                    await this.plugin.saveSettings();
                }));

        // --- Target Completion Date --- 
        new Setting(containerEl)
            .setName('Target completion date')
            .setDesc('Optional: Set a target date for project completion (YYYY-MM-DD). This will be shown on the timeline.')
            .addText(text => {
                text.inputEl.type = 'date'; // Use HTML5 date input
                text.setValue(this.plugin.settings.targetCompletionDate || '')
                    .onChange(async (value) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);

                        if (!value) {
                            this.plugin.settings.targetCompletionDate = undefined;
                            text.inputEl.removeClass('setting-input-error');
                            await this.plugin.saveSettings();
                            return;
                        }

                        const selectedDate = new Date(value + 'T00:00:00');
                        if (selectedDate > today) {
                            this.plugin.settings.targetCompletionDate = value;
                            text.inputEl.removeClass('setting-input-error');
            } else {
                            new Notice('Target date must be in the future.');
                            text.setValue(this.plugin.settings.targetCompletionDate || '');
                            return;
                        }
                        await this.plugin.saveSettings();
                    });
            });

        // --- AI Settings for Beats Analysis ---
        containerEl.createEl('h2', { text: 'AI Settings for Beats Analysis'});
        

        // --- Default AI Provider Setting ---
        new Setting(containerEl)
        .setName('Default AI Provider')
        .setDesc('Select the default AI provider to use for AI features like Beat Analysis.')
        .addDropdown(dropdown => dropdown
            .addOption('openai', 'OpenAI (ChatGPT)')
            .addOption('anthropic', 'Anthropic (Claude)')
            .setValue(this.plugin.settings.defaultAiProvider || 'openai')
            .onChange(async (value) => {
                this.plugin.settings.defaultAiProvider = value as 'openai' | 'anthropic';
                await this.plugin.saveSettings();
            }));

        // --- OpenAI ChatGPT SECTION ---
        containerEl.createEl('h2', { text: 'OpenAI ChatGPT Settings'});


        // --- OpenAI API Key Setting ---
        const openaiSetting = new Setting(containerEl) // <<< ADD const openaiSetting = here (line 5252)
            .setName('OpenAI API Key')
            .setDesc('Your OpenAI API key for using ChatGPT AI features.')
            .addText(text => text
                .setPlaceholder('Enter your API key')
                .setValue(this.plugin.settings.openaiApiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.openaiApiKey = value.trim();
                    await this.plugin.saveSettings();
                }));
                

        // --- OpenAI Model Selection ---
        const modelSetting = new Setting(containerEl)
            .setName('OpenAI Model')
            .setDesc('Select the OpenAI model to use.')
            .addDropdown((dropdown) => {
                // Add only the top models for creative fiction
                dropdown.addOption('gpt-4o', 'GPT-4o (Recommended)')
                    .addOption('gpt-4-turbo', 'GPT-4 Turbo')
                    .addOption('gpt-4', 'GPT-4')
                    .setValue(this.plugin.settings.openaiModelId || 'gpt-4o')
                    .onChange(async (value) => {
                        this.plugin.settings.openaiModelId = value;
                        await this.plugin.saveSettings();
                    });
            });

        // --- Anthropic Claude SECTION ---
        containerEl.createEl('h2', { text: 'Anthropic Claude Settings'});

        
        // --- Anthropic API Key Setting ---
        const anthropicSetting = new Setting(containerEl)
            .setName('Anthropic API Key')
            .setDesc('Your Anthropic API key for using Claude AI features.')
            .addText(text => text
                .setPlaceholder('Enter your Anthropic API key')
                .setValue(this.plugin.settings.anthropicApiKey || '')
                .onChange(async (value) => {
                    this.plugin.settings.anthropicApiKey = value.trim();
                    await this.plugin.saveSettings();
                }));

        // --- Anthropic Model Selection ---
        new Setting(containerEl)
            .setName('Anthropic Model')
            .setDesc('Select the Claude model to use.')
            .addDropdown(dropdown => {
                // Add the common Claude models
                dropdown.addOption('claude-3-7-sonnet-20250219', 'Claude 3.7 Sonnet (Recommended)')
                    .addOption('claude-3-5-sonnet-20240620', 'Claude 3.5 Sonnet')
                    // Provide a guaranteed string fallback for setValue
                    .setValue(this.plugin.settings.anthropicModelId || 'claude-3-7-sonnet-20250219') 
                    .onChange(async (value) => {
                        this.plugin.settings.anthropicModelId = value;
                        await this.plugin.saveSettings();
                    });
            });

        // <<< ADD THIS Setting block for API Logging Toggle >>>
        new Setting(containerEl)
            .setName('Log AI Interactions to File')
            .setDesc('If enabled, create a new note in the "AI" folder for each OpenAI API request/response.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.logApiInteractions)
                .onChange(async (value) => {
                    this.plugin.settings.logApiInteractions = value;
                    await this.plugin.saveSettings();
                }));
        // <<< END of added Setting block >>>

        // --- Debug Mode Setting ---
        new Setting(containerEl)
            .setName('Debug mode')
            .setDesc('Enable debug logging to the console for troubleshooting.')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debug)
                .onChange(async (value) => {
                    this.plugin.settings.debug = value;
                    await this.plugin.saveSettings();
                }));

        // --- Publishing Stage Colors --- 
        containerEl.createEl('h2', { text: 'Publishing stage colors'}); // <<< CHANGED to H3, REMOVED CLASS

        Object.entries(this.plugin.settings.publishStageColors).forEach(([stage, color]) => {
            let textInputRef: TextComponent | undefined;
            const setting = new Setting(containerEl)
                .setName(stage)
                .addText(textInput => {
                    textInputRef = textInput;
                    textInput.setValue(color)
                        .onChange(async (value) => {
                            if (this.isValidHex(value)) {
                                (this.plugin.settings.publishStageColors as Record<string, string>)[stage] = value;
                                await this.plugin.saveSettings();
                                const swatch = setting.controlEl.querySelector('.color-swatch') as HTMLElement;
                                if (swatch) {
                                    swatch.style.setProperty('--swatch-color', value);
                                }
                            } // Consider adding feedback for invalid hex
                        });
                })
                .addExtraButton(button => {
                    button.setIcon('reset')
                        .setTooltip('Reset to default')
                        .onClick(async () => {
                            const defaultColor = DEFAULT_SETTINGS.publishStageColors[stage as keyof typeof DEFAULT_SETTINGS.publishStageColors];
                            (this.plugin.settings.publishStageColors as Record<string, string>)[stage] = defaultColor;
                            await this.plugin.saveSettings();
                            textInputRef?.setValue(defaultColor);
                            const swatch = setting.controlEl.querySelector('.color-swatch') as HTMLElement;
                            if (swatch) {
                                swatch.style.setProperty('--swatch-color', defaultColor);
                            }
                        });
                });

            // Add color swatch inside the control element for better alignment
            this.createColorSwatch(setting.controlEl, color);
        });
                
        // --- Embedded README Section ---
        containerEl.createEl('hr', { cls: 'settings-separator' });
        const readmeContainer = containerEl.createDiv({ cls: 'manuscript-readme-container' });
        const readmeMarkdown = typeof EMBEDDED_README_CONTENT !== 'undefined'
            ? EMBEDDED_README_CONTENT
            : 'README content could not be loaded. Please ensure the plugin was built correctly or view the README.md file directly.';

        MarkdownRenderer.render(
            this.app, 
            readmeMarkdown, 
            readmeContainer, 
            this.plugin.manifest.dir ?? '', 
            this as unknown as Component // Double cast to satisfy TypeScript and avoid Memory leak
        );
    }

}

// Timeline View implementation
export class ManuscriptTimelineView extends ItemView {
    static readonly viewType = TIMELINE_VIEW_TYPE;
    plugin: ManuscriptTimelinePlugin;
    
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
            
            console.log('Mouse coordinate tracking initialized');
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
        
        // Register for metadata changes to refresh the timeline
        this.registerEvent(
            this.app.metadataCache.on('changed', (file) => {
                this.log('Metadata changed event for file: ' + file.path);
                // Refresh the timeline view immediately when metadata changes
                this.refreshTimeline();
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
            const { svgString, maxStageColor: calculatedMaxStageColor } = this.plugin.createTimelineSVG(scenes); // Destructure the result
            this.log(`SVG content generated in ${performance.now() - startTime}ms, length: ${svgString.length}`); // Use svgString.length
            
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

                // --- Set Max Stage Color Variable --- START ---
                // Use the color returned directly from createTimelineSVG
                const originalMaxStageColor = calculatedMaxStageColor; 
                
                if (originalMaxStageColor) {
                    // Desaturate the color by 50%
                    // Correctly call the public method on the plugin instance
                    const desaturatedColor = this.plugin.desaturateColor(originalMaxStageColor, 0.5);
                    if (this.plugin.settings.debug) console.log(`[Timeline Debug] Original color: ${originalMaxStageColor}, Desaturated color: ${desaturatedColor}`);
                    
                    svgElement.style.setProperty('--max-publish-stage-color', desaturatedColor);
                } else {
                    if (this.plugin.settings.debug) console.log('[Timeline Debug] No max stage color received to desaturate.');
                }
                // --- Set Max Stage Color Variable --- END ---

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