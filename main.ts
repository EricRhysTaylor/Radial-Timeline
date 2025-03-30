import { App, Plugin, Notice, Setting, PluginSettingTab, TFile, TAbstractFile, WorkspaceLeaf, ItemView, MarkdownView, MarkdownRenderer, TextComponent, Modal, ButtonComponent } from "obsidian";

/*
 * OBSIDIAN PLUGIN DEVELOPMENT GUIDELINES - TYPESCRIPT
 * ==================================================
 *
 * 1. SECURITY: Never use innerHTML, outerHTML, or string concatenation to create HTML/SVG content
 *    - Always use proper DOM methods: document.createElement(), document.createElementNS(), etc.
 *    - Use element.appendChild() to build the DOM hierarchy
 *    - Set content with element.textContent, not innerHTML
 *    - Set attributes with element.setAttribute()
 *
 * 2. SVG CREATION:
 *    - Always use document.createElementNS("http://www.w3.org/2000/svg", "element-name")
 *    - Use the helper functions at the top of this file (createSvgElement, etc.)
 *
 * 3. STYLING:
 *    - Keep all CSS in styles.css, not inline in the JavaScript/TypeScript
 *    - Use classList methods to add/remove classes instead of manipulating className
 *    - Avoid inline styles when possible; use CSS classes instead
 *
 * 4. CODING STYLE:
 *    - Use TypeScript interfaces and types for better code safety
 *    - Document public methods and non-obvious code with JSDoc comments
 *    - Keep methods focused and not too long (split complex logic)
 *    - Use meaningful variable and method names
 *
 * 5. OBSIDIAN API:
 *    - Follow Obsidian's API patterns and lifecycle methods
 *    - Handle plugin load/unload gracefully to prevent memory leaks
 *    - Use Workspace events appropriately
 *
 * 6. PERFORMANCE:
 *    - Minimize DOM operations, batch them when possible
 *    - Cache DOM selections that are used repeatedly
 *    - Be mindful of event listeners - always remove them when no longer needed
 
*/

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

interface ManuscriptTimelineSettings {
    sourcePath: string;
    publishStageColors: {
        Zero: string;
        Author: string;
        House: string;
        Press: string;
    };
    debug: boolean; // Add debug setting
}

// Constants for the view
const TIMELINE_VIEW_TYPE = "manuscript-timeline-view";
const TIMELINE_VIEW_DISPLAY_TEXT = "Manuscript Timeline";

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
    sourcePath: 'Book 1',
    publishStageColors: {
        "Zero": "#9E70CF",  // Purple
        "Author": "#5E85CF", // Blue
        "House": "#DA7847",  // Orange
        "Press": "#6FB971"   // Green
    },
    debug: false // Default to false
};

//a primary color for each status
// 6FB971 green, DA7847 orange, 7C6561 flat brown, 9E70CF purple, 5E85CF Blue, bbbbbb gray 
const STATUS_COLORS = {
    "Working": "#70b970",
    "Todo": "#aaaaaa",
    "Empty": "#f0f0f0", // Light gray (will be replaced with light Zero color)
    "Due": "#d05e5e",
    "Complete": "#999999" // Added for complete status
};

const NUM_ACTS = 3;

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
    
    /**
     * Safely parse HTML string into Document using DOMParser
     * This is a safer alternative to using innerHTML
     */
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
            const doc = parser.parseFromString(`<div>${titleContent}</div>`, 'text/html');
            const container = doc.querySelector('div');
            
            if (!container) return;
            
            // Extract all tspans and add them to the text element
            const tspans = container.querySelectorAll('tspan');
            if (tspans.length > 0) {
                tspans.forEach(tspan => {
                    const svgTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                    
                    // Copy attributes
                    Array.from(tspan.attributes).forEach(attr => {
                        svgTspan.setAttribute(attr.name, attr.value);
                    });
                    
                    svgTspan.textContent = tspan.textContent;
                    titleTextElement.appendChild(svgTspan);
                });
            } else {
                // No tspans found, just add the text content
                const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                tspan.setAttribute("fill", titleColor);
                tspan.textContent = titleContent;
                titleTextElement.appendChild(tspan);
            }
        } else {
            // Handle title and date with different styling
            const parts = titleContent.split('  ');
            if (parts.length > 1) {
                const title = parts[0];
                const date = parts.slice(1).join('  ');
                
                const titleTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                titleTspan.setAttribute("fill", titleColor);
                titleTspan.setAttribute("font-weight", "bold");
                titleTspan.textContent = title;
                titleTextElement.appendChild(titleTspan);
                
                const dateTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                dateTspan.setAttribute("fill", titleColor);
                dateTspan.setAttribute("class", "date-text");
                dateTspan.textContent = date;
                titleTextElement.appendChild(dateTspan);
            } else {
                const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                tspan.setAttribute("fill", titleColor);
                tspan.textContent = titleContent;
                titleTextElement.appendChild(tspan);
            }
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
            this.plugin.log(`Generated subplot color for '${subplot}': hsl(${hue}, ${saturation}%, ${lightness}%)`);
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        };
        
        const getCharacterColor = (character: string): string => {
            // Similar to subplot colors but with slightly different ranges
            const hue = Math.floor(Math.random() * 360);
            const saturation = 60 + Math.floor(Math.random() * 30); // 60-90%
            const lightness = 30 + Math.floor(Math.random() * 15);  // 30-45%
            this.plugin.log(`Generated character color for '${character}': hsl(${hue}, ${saturation}%, ${lightness}%)`);
            return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        };
        
        // Set the line height
        const lineHeight = 26;
        
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
        titleTextElement.setAttribute("style", `--title-color: ${titleColor};`);
        
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
            // Add extra large vertical space between synopsis and metadata
            const metadataY = (synopsisEndIndex * lineHeight) + 45; // Big gap below the synopsis
            
            // Add invisible spacer element to ensure the gap is preserved
            const spacerY = (synopsisEndIndex * lineHeight) + 25;
            const spacerElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
            spacerElement.setAttribute("x", "0");
            spacerElement.setAttribute("y", String(spacerY));
            spacerElement.setAttribute("font-size", "14px");
            spacerElement.setAttribute("opacity", "0");
            spacerElement.textContent = "\u00A0"; // Non-breaking space
            synopsisTextGroup.appendChild(spacerElement);
            
            // Process subplots if first metadata item exists
            const decodedMetadataItems = metadataItems.map(item => decodeHtmlEntities(item));
            
            if (decodedMetadataItems[0] && decodedMetadataItems[0].trim() !== '\u00A0') {
                if (decodedMetadataItems[0].startsWith('<tspan')) {
                    // This is pre-formatted HTML that might contain search highlights
                    // Only use it for export/preview mode, otherwise create fresh elements
                    const subplotTextElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    subplotTextElement.setAttribute("class", "info-text metadata-text");
                    subplotTextElement.setAttribute("x", "0");
                    subplotTextElement.setAttribute("y", String(metadataY));
                    subplotTextElement.setAttribute("text-anchor", "start");
                    
                    // Process HTML content safely
                    this.processContentWithTspans(decodedMetadataItems[0], subplotTextElement);
                    
                    synopsisTextGroup.appendChild(subplotTextElement);
                } else {
                    // Extract subplots and apply colors
                    const subplots = decodedMetadataItems[0].split(', ').filter(s => s.trim().length > 0);
                    
                    if (subplots.length > 0) {
                        const subplotTextElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        subplotTextElement.setAttribute("class", "info-text metadata-text");
                        subplotTextElement.setAttribute("x", "0");
                        subplotTextElement.setAttribute("y", String(metadataY));
                        subplotTextElement.setAttribute("text-anchor", "start");
                        
                        // Format each subplot with its own color
                        subplots.forEach((subplot, j) => {
                            const color = getSubplotColor(subplot.trim());
                            const subplotText = subplot.trim();
                            
                            // Create tspan for subplot
                            const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                            tspan.setAttribute("fill", color);
                            tspan.setAttribute("data-item-type", "subplot");
                            tspan.setAttribute("style", `fill: ${color} !important;`);
                            
                            // Don't apply highlighting directly in the text - use a single text node for each subplot
                            // This ensures we won't get duplicate terms when applying highlights later
                            tspan.textContent = subplotText;
                            
                            subplotTextElement.appendChild(tspan);
                            
                            // Add comma separator if not the last item
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
            }
            
            // Process characters - second metadata item
            if (decodedMetadataItems.length > 1 && decodedMetadataItems[1] && decodedMetadataItems[1].trim() !== '') {
                // Standard spacing between subplot and character lines
                const characterY = metadataY + lineHeight;
                
                if (decodedMetadataItems[1].startsWith('<tspan')) {
                    // This is pre-formatted HTML that might contain search highlights
                    // Only use it for export/preview mode, otherwise create fresh elements
                    const characterTextElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
                    characterTextElement.setAttribute("class", "info-text metadata-text");
                    characterTextElement.setAttribute("x", "0");
                    characterTextElement.setAttribute("y", String(characterY));
                    characterTextElement.setAttribute("text-anchor", "start");
                    
                    // Process HTML content safely
                    this.processContentWithTspans(decodedMetadataItems[1], characterTextElement);
                    
                    synopsisTextGroup.appendChild(characterTextElement);
                } else {
                    // Extract characters and apply colors
                    const characters = decodedMetadataItems[1].split(', ').filter(c => c.trim().length > 0);
                    
                    if (characters.length > 0) {
                        const characterTextElement = document.createElementNS("http://www.w3.org/2000/svg", "text");
                        characterTextElement.setAttribute("class", "info-text metadata-text");
                        characterTextElement.setAttribute("x", "0");
                        characterTextElement.setAttribute("y", String(characterY));
                        characterTextElement.setAttribute("text-anchor", "start");
                        
                        // Format each character with its own color
                        characters.forEach((character, j) => {
                            const color = getCharacterColor(character.trim());
                            const characterText = character.trim();
                            
                            // Create tspan for character
                            const tspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                            tspan.setAttribute("fill", color);
                            tspan.setAttribute("data-item-type", "character");
                            tspan.setAttribute("style", `fill: ${color} !important;`);
                            
                            // Don't apply search highlighting here - we'll do it in addHighlightRectangles
                            // This prevents duplicate highlighting when the search term appears in characters
                            tspan.textContent = characterText;
                            
                            characterTextElement.appendChild(tspan);
                            
                            // Add comma separator if not the last item
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
            this.plugin.log(`[DEBUG] Setting transform: translate(${x}, ${y})`);
            synopsis.setAttribute('transform', `translate(${x}, ${y})`);
            
            // Ensure the synopsis is visible
            synopsis.classList.add('visible');
            synopsis.setAttribute('opacity', '1');
            synopsis.setAttribute('pointer-events', 'all');
            
            // Position text elements to follow the arc
            this.positionTextElements(synopsis, position.isRightAligned, position.isTopHalf);
            
            // Check final state of text elements
            if (this.plugin.settings.debug) {
                const textElements = Array.from(synopsis.querySelectorAll('text'));
                textElements.forEach((el, idx) => {
                    if (idx <= 2) { // Only log first few elements
                        this.plugin.log(`[DEBUG] Final text position ${idx}: x=${el.getAttribute('x')}, y=${el.getAttribute('y')}, anchor=${el.getAttribute('text-anchor')}`);
                    }
                });
            }
            
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
        const bottomHalfOffset = 400; // Updated value for bottom half (Q1, Q2)
        
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
                const distanceFromCenter = Math.sqrt(baseX * baseX + absoluteY * absoluteY);
                this.plugin.log(`Line ${index} distance check: distanceFromCenter=${distanceFromCenter.toFixed(2)}, radius=${radius}`);
                
                // Calculate what the x-coordinate would be if this point were on the circle
                try {
                    const circleX = Math.sqrt(radius * radius - absoluteY * absoluteY);
                    
                    // DEBUG: Log the values we're using
                    this.plugin.log(`Calculation for line ${index}: isTopHalf=${isTopHalf}, isRightAligned=${isRightAligned}, circleX=${circleX.toFixed(2)}, baseX=${baseX.toFixed(2)}`);
                    
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
                    
                    // DEBUG: Log the calculated offset
                    this.plugin.log(`Calculated xOffset for line ${index}: ${xOffset.toFixed(2)}`);
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
        }
        
        // Use DOMParser to parse the content safely
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${processedContent}</div>`, 'text/html');
        const container = doc.querySelector('div');
        
        if (!container) return;
        
        // Check if there are any direct text nodes
        let hasDirectTextNodes = false;
        container.childNodes.forEach(node => {
            if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
                hasDirectTextNodes = true;
            }
        });
        
        if (hasDirectTextNodes) {
            // Handle mixed content (text nodes and elements)
            container.childNodes.forEach(node => {
                if (node.nodeType === Node.TEXT_NODE) {
                    // Add text directly
                    if (node.textContent?.trim()) {
                        parentElement.appendChild(document.createTextNode(node.textContent));
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
                    parentElement.appendChild(svgTspan);
                }
            });
        } else {
            // Process only tspan elements
            const tspans = container.querySelectorAll('tspan');
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
                parentElement.appendChild(svgTspan);
            });
        }
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
    
    // Add a synopsisManager instance
    private synopsisManager: SynopsisManager;
    
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
                // SAFE: inline style used for hiding path that shouldn't be visible
                pathElement.style.display = 'none'; // Hide the path
                
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
            // First split by the triple space that separates title from date
            const parts = decodedText.split(/\s{3,}/);
            const titlePart = parts[0];
            const date = parts.length > 1 ? parts.slice(1).join('  ') : '';
            
            // Then extract scene number from title (if it exists)
            const titleMatch = titlePart.match(/^(\d+(\.\d+)?)\s+(.+)$/);
            
            if (titleMatch) {
                // We have scene number + title + date format
                const sceneNumber = titleMatch[1];
                const sceneTitle = titleMatch[3];
                
                // Create a title container tspan element
                const titleContainer = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                fragment.appendChild(titleContainer);
                
                // Add scene number and bolded text to maintain consistency with non-search case
                const titleTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                titleTspan.setAttribute("font-weight", "bold");
                
                // Add scene number as regular text (keeping this in the bold tspan)
                titleTspan.textContent = `${sceneNumber} `;
                titleContainer.appendChild(titleTspan);
                
                // Split the title by search term and create highlighted spans within the main title tspan
                const mainTitleTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                mainTitleTspan.setAttribute("font-weight", "bold");
                titleContainer.appendChild(mainTitleTspan);
                
                // Reset regex to start from beginning
                regex.lastIndex = 0;
                
                // Process the title content character by character to ensure highlighting works correctly
                let lastIndex = 0;
                let match;
                
                while ((match = regex.exec(sceneTitle)) !== null) {
                    // Add text before match
                    if (match.index > lastIndex) {
                        const textBefore = document.createTextNode(sceneTitle.substring(lastIndex, match.index));
                        mainTitleTspan.appendChild(textBefore);
                    }
                    
                    // Add the highlighted match
                    const highlight = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                    highlight.setAttribute("class", "search-term");
                    highlight.textContent = match[0];
                    mainTitleTspan.appendChild(highlight);
                    
                    lastIndex = match.index + match[0].length;
                }
                
                // Add any remaining text
                if (lastIndex < sceneTitle.length) {
                    const textAfter = document.createTextNode(sceneTitle.substring(lastIndex));
                    mainTitleTspan.appendChild(textAfter);
                }
                
                // Add date part, using same format as addTitleContent method
                if (date) {
                    // Add spacer first (add extra space after title for better readability)
                    fragment.appendChild(document.createTextNode('    '));
                    
                    // Create a date tspan with the same class as in addTitleContent
                    const dateTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                    dateTspan.setAttribute("class", "date-text");
                    dateTspan.textContent = date;
                    fragment.appendChild(dateTspan);
                }
            } else {
                // No scene number, just title + date
                
                // Create a title container tspan element
                const titleContainer = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                fragment.appendChild(titleContainer);
                
                // Create a bold tspan for the title
                const titleTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                titleTspan.setAttribute("font-weight", "bold");
                titleContainer.appendChild(titleTspan);
                
                // Reset regex to start from beginning
                regex.lastIndex = 0;
                
                // Process the title content character by character to ensure highlighting works correctly
                let lastIndex = 0;
                let match;
                
                while ((match = regex.exec(titlePart)) !== null) {
                    // Add text before match
                    if (match.index > lastIndex) {
                        const textBefore = document.createTextNode(titlePart.substring(lastIndex, match.index));
                        titleTspan.appendChild(textBefore);
                    }
                    
                    // Add the highlighted match
                    const highlight = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                    highlight.setAttribute("class", "search-term");
                    highlight.textContent = match[0];
                    titleTspan.appendChild(highlight);
                    
                    lastIndex = match.index + match[0].length;
                }
                
                // Add any remaining text
                if (lastIndex < titlePart.length) {
                    const textAfter = document.createTextNode(titlePart.substring(lastIndex));
                    titleTspan.appendChild(textAfter);
                }
                
                // Add date part, using same format as addTitleContent method
                if (date) {
                    // Add spacer first (add extra space after title for better readability)
                    fragment.appendChild(document.createTextNode('    '));
                    
                    // Create a date tspan with the same class as in addTitleContent
                    const dateTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                    dateTspan.setAttribute("class", "date-text");
                    dateTspan.textContent = date;
                    fragment.appendChild(dateTspan);
                }
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
                
                // Split the item by search term and create highlighted spans
                const itemParts = item.split(regex);
                itemParts.forEach((part, index) => {
                    if (index % 2 === 1) {
                        // This is a matched part (odd index)
                        const highlight = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                        highlight.setAttribute("class", "search-term");
                        highlight.textContent = part;
                        fragment.appendChild(highlight);
                    } else if (part) {
                        // This is regular text
                        fragment.appendChild(document.createTextNode(part));
                    }
                });
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
                
                // Split content by regex and rebuild with highlighted spans
                const parts = originalContent.split(regex);
                parts.forEach((part, index) => {
                    if (index % 2 === 1) {
                        // This is a matched part
                        const highlight = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                        highlight.setAttribute("class", "search-term");
                        if (fillColor) highlight.setAttribute("fill", fillColor);
                        highlight.textContent = part;
                        tspan.appendChild(highlight);
                    } else if (part) {
                        // This is regular text
                        tspan.appendChild(document.createTextNode(part));
                    }
                });
            });
            
            // Extract the processed HTML using XMLSerializer
            const serializer = new XMLSerializer();
            const result = serializer.serializeToString(textElement);
            
            // Remove the outer <text></text> tags
            return result.replace(/<text[^>]*>|<\/text>/g, '');
        }
        
        // Regular processing for text without tspans (synopsis lines)
        // Split by search term and create highlighted spans
        const parts = decodedText.split(regex);
        parts.forEach((part, index) => {
            if (index % 2 === 1) {
                // This is a matched part (odd index)
                const highlight = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
                highlight.setAttribute("class", "search-term");
                highlight.textContent = part;
                fragment.appendChild(highlight);
            } else if (part) {
                // This is regular text
                fragment.appendChild(document.createTextNode(part));
            }
        });
        
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
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Process highlighted content and return SVG elements
     * A safer alternative to using innerHTML for fragments
     * @param fragment The document fragment containing the highlighted content
     * @returns An array of nodes that can be appended to an SVG element
     */
    private processHighlightedContent(fragment: DocumentFragment): Node[] {
        // Create a temporary div to hold the fragment for processing
        const container = document.createElement('div');
        container.appendChild(fragment.cloneNode(true));
        
        // Use DOMParser to safely parse the HTML
        const parser = new DOMParser();
        const doc = parser.parseFromString(container.outerHTML, 'text/html');
        
        // Extract all nodes from the parsed document
        const resultNodes: Node[] = [];
        const containerNode = doc.querySelector('div');
        
        if (!containerNode) return resultNodes;
        
        // Process each child node
        Array.from(containerNode.childNodes).forEach(node => {
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
        
        // Initialize the synopsis manager
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
            id: 'open-timeline',
            name: 'Open Timeline View',
            callback: () => this.activateView()
        });

        this.addCommand({
            id: 'search-timeline',
            name: 'Search Timeline',
            callback: () => this.openSearchPrompt()
        });

        this.addCommand({
            id: 'clear-timeline-search',
            name: 'Clear Timeline Search',
            callback: () => this.clearSearch()
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
                                pendingEdits: metadata["Pending Edits"]
                            });

                            // Only log scene data in debug mode, and avoid the noisy scene details
                            if (this.settings.debug) {
                                this.log(`Added scene: ${metadata.Title || file.basename}`);
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
    public createTimelineSVG(scenes: Scene[]): string {
        // Performance optimization: Check if we have an excessive number of scenes
        const sceneCount = scenes.length;
        let simplifyRendering = false;
        
        // If we have more than 100 scenes, simplify the rendering
        if (sceneCount > 100) {
            console.log(`Large number of scenes detected (${sceneCount}), using simplified rendering mode`);
            simplifyRendering = true;
        }
        
        const size = 1600;
        const margin = 30;
        const innerRadius = 200; // the first ring is 200px from the center
        const outerRadius = size / 2 - margin;
        const maxTextWidth = 500; // Define maxTextWidth for the synopsis text
    
        // Create SVG with proper viewBox and preserveAspectRatio for better scaling
        // Ensure the viewBox is centered on the origin with proper dimensions
        let svg = `<svg width="${size}" height="${size}" viewBox="-${size / 2} -${size / 2} ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="manuscript-timeline-svg" preserveAspectRatio="xMidYMid meet">`;
        
        // Add debug coordinate display if debug mode is enabled
        if (this.settings.debug) {
            svg += `
                <g class="debug-info-container" style="pointer-events:none;"><!-- SAFE: inline style needed for SVG interaction -->
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

        // Performance optimization: In simplified mode, reduce the number of patterns
        if (!simplifyRendering) {
            // Original defs content
            // ... existing code ...
        } else {
            // Simplified patterns
            svg += `<pattern id="plaidWorking" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
                <rect width="10" height="10" fill="${this.darkenColor(STATUS_COLORS.Working, 5)}"/>
            </pattern>`;
            
            svg += `<pattern id="plaidTodo" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
                <rect width="10" height="10" fill="${this.lightenColor(STATUS_COLORS.Todo, 15)}"/>
            </pattern>`;
        }
    
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
        
        // Define plaid patterns for Working and Todo status
        svg += `<pattern id="plaidWorking" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="${this.darkenColor(STATUS_COLORS.Working, 5)}"/>
            <circle cx="5" cy="5" r="2" fill="#ffffff" fill-opacity="0.4"/>
            <circle cx="0" cy="0" r="1.5" fill="#ffffff" fill-opacity="0.3"/>
            <circle cx="10" cy="0" r="1.5" fill="#ffffff" fill-opacity="0.3"/>
            <circle cx="0" cy="10" r="1.5" fill="#ffffff" fill-opacity="0.3"/>
            <circle cx="10" cy="10" r="1.5" fill="#ffffff" fill-opacity="0.3"/>
        </pattern>`;
        
        svg += `<pattern id="plaidTodo" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
            <rect width="10" height="10" fill="${this.lightenColor(STATUS_COLORS.Todo, 15)}"/>
            <line x1="0" y1="0" x2="0" y2="10" stroke="#ffffff" stroke-width="1" stroke-opacity="0.3"/>
            <line x1="0" y1="0" x2="10" y2="0" stroke="#ffffff" stroke-width="1" stroke-opacity="0.3"/>
        </pattern>`;
        
        // Define patterns for Working and Todo states with Publish Stage colors
        svg += `${Object.entries(PUBLISH_STAGE_COLORS).map(([stage, color]) => `
            <pattern id="plaidWorking${stage}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
                <rect width="10" height="10" fill="${this.darkenColor(color, 5)}"/>
                <circle cx="5" cy="5" r="2" fill="#ffffff" fill-opacity="0.4"/>
                <circle cx="0" cy="0" r="1.5" fill="#ffffff" fill-opacity="0.3"/>
                <circle cx="10" cy="0" r="1.5" fill="#ffffff" fill-opacity="0.3"/>
                <circle cx="0" cy="10" r="1.5" fill="#ffffff" fill-opacity="0.3"/>
                <circle cx="10" cy="10" r="1.5" fill="#ffffff" fill-opacity="0.3"/>
            </pattern>
            
            <pattern id="plaidTodo${stage}" patternUnits="userSpaceOnUse" width="10" height="10" patternTransform="rotate(45)">
                <rect width="10" height="10" fill="${this.lightenColor(color, 20)}"/>
                <line x1="0" y1="0" x2="0" y2="10" stroke="#ffffff" stroke-width="1" stroke-opacity="0.3"/>
                <line x1="0" y1="0" x2="10" y2="0" stroke="#ffffff" stroke-width="1" stroke-opacity="0.3"/>
            </pattern>
        `).join('')}`;
        
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

        //outer months Labels
        months.forEach(({ name }, index) => {
            const pathId = `monthLabelPath-${index}`;
            svg += `
                <text class="month-label-outer">
                    <textPath href="#${pathId}" startOffset="0" text-anchor="start">
                        ${name}
                    </textPath>
                </text>
            `;
        });

        // First add the progress ring (move this BEFORE the month spokes code)
        // Calculate year progress
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const yearProgress = (now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24 * 365);

        // Create progress ring
        const progressRadius = lineInnerRadius + 15;
        const circumference = 2 * Math.PI * progressRadius;
        const progressLength = circumference * yearProgress;
        const startAngle = -Math.PI / 2; // Start at 12 o'clock
        const endAngle = startAngle + (2 * Math.PI * yearProgress);

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

        // Create six segments for the rainbow
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
            const segStart = startAngle + (i * segmentAngle);
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

        // THEN add the month spokes group (existing code)
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

            // Draw the spoke line
            svg += `
                <line  
                    x1="${x1}"
                    y1="${y1}"
                    x2="${x2}"
                    y2="${y2}"
                    class="month-spoke-line${isActBoundary ? ' act-boundary' : ''}"
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
                <text class="month-label">
                    <textPath href="#${innerPathId}" startOffset="0" text-anchor="start">
                        ${months[monthIndex].shortName}
                    </textPath>
                </text>
            `;
        });

         // Close the month spokes lines and text labels group
        svg += `</g>`;

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
                '\u00A0',
            ];
            
            // Handle subplot and character lines differently
            if (orderedSubplots.length > 0) {
                // Apply search highlighting to each subplot separately
                let subplotsHtml = '';
                orderedSubplots.forEach((subplot, i) => {
                    const term = this.searchTerm;
                    const regex = term ? new RegExp(`(${this.escapeRegExp(term)})`, 'gi') : null;
                    
                    // Create HTML directly for each subplot
                    const color = `hsl(${Math.floor(Math.random() * 360)}, 70%, 35%)`;
                    
                    // Don't apply search highlighting here - it will be done by addHighlightRectangles
                    let subplotText = escapeXml(subplot || ''); // Handle undefined subplot
                    
                    subplotsHtml += `<tspan fill="${color}" data-item-type="subplot" style="fill: ${color} !important;"><!-- SAFE: inline style needed for color override in SVG -->${subplotText}</tspan>`;
                    
                    // Add comma separator if not the last item
                    if (i < orderedSubplots.length - 1) {
                        subplotsHtml += '<tspan fill="var(--text-muted)">, </tspan>';
                    }
                });
                
                // Add the fully-formatted subplot line
                contentLines.push(subplotsHtml);
            } else {
                contentLines.push(''); // Empty placeholder
            }
            
            // Handle character list with similar approach
            if (scene.Character && scene.Character.length > 0) {
                let charactersHtml = '';
                scene.Character.forEach((character, i) => {
                    const term = this.searchTerm;
                    const regex = term ? new RegExp(`(${this.escapeRegExp(term)})`, 'gi') : null;
                    
                    // Create HTML directly for each character
                    const color = `hsl(${Math.floor(Math.random() * 360)}, 80%, 35%)`;
                    
                    // Apply search highlighting if needed
                    let characterText = escapeXml(character || ''); // Handle undefined character
                    
                    // Only apply direct highlighting if search is active but DON'T apply here if it contains the search term
                    // This prevents double highlighting since the text is processed again in addSearchHighlights
                    if (regex && this.searchActive) {
                        // Instead of replacing the term with a span, just keep the original text
                        // The highlighting will be added later by addSearchHighlights function
                        characterText = characterText; // No replacement here
                    }
                    
                    charactersHtml += `<tspan fill="${color}" data-item-type="character" style="fill: ${color} !important;"><!-- SAFE: inline style needed for color override in SVG -->${characterText}</tspan>`;
                    
                    // Add comma separator if not the last item
                    if (i < (scene.Character?.length || 0) - 1) {
                        charactersHtml += '<tspan fill="var(--text-muted)">, </tspan>';
                    }
                });
                
                // Add the fully-formatted character line
                contentLines.push(charactersHtml);
            } else {
                contentLines.push(''); // Empty placeholder
            }
            
            // Filter out empty lines
            const filteredContentLines = contentLines.filter(line => line);
            
            // Generate the synopsis element using our new DOM-based method
            // Instead of collecting HTML strings, store the DOM elements directly
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
                                
                                if (normalizedStatus === "complete") {
                                    // For completed scenes, use Publish Stage color with full opacity
                                    const stageColor = PUBLISH_STAGE_COLORS[publishStage as keyof typeof PUBLISH_STAGE_COLORS] || PUBLISH_STAGE_COLORS.Zero;
                                    // Do not apply any modifications to the color to ensure it matches the legend
                                    return stageColor;
                                }
                                if (scene.due && new Date() > new Date(scene.due)) {
                                    return STATUS_COLORS.Due; // Use Due color if past due date
                                }
                                
                                // Check for working or todo status to use plaid pattern
                                if (normalizedStatus === "working") {
                                    return `url(#plaidWorking${publishStage})`;
                                }
                                if (normalizedStatus === "todo") {
                                    return `url(#plaidTodo${publishStage})`;
                                }
                                
                                return STATUS_COLORS[statusList[0] as keyof typeof STATUS_COLORS] || STATUS_COLORS.Todo; // Use status color or default to Todo
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
                        L ${formatNumber(innerR * Math.cos(endAngle))} ${formatNumber(innerR * Math.sin(endAngle))}
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
            const angleOffset = -0.08; // Positive offset moves text clockwise
            
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
                <text class="act-label">
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
            
            if (normalizedStatus === "complete") {
                // For completed scenes, count by Publish Stage
                const publishStage = scene["Publish Stage"] || 'Zero';
                // Use the publishStage directly with type safety
                const validStage = publishStage as keyof typeof PUBLISH_STAGE_COLORS;
                acc[validStage] = (acc[validStage] || 0) + 1;
            } else if (scene.due && new Date() > new Date(scene.due)) {
                // Non-complete scenes that are past due date are counted as Due
                acc["Due"] = (acc["Due"] || 0) + 1;
            } else {
                // All other scenes are counted by their status
                // First get the status as a string safely
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
                <!-- Stage colors column (left) -->
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
                            >${stage.toUpperCase()} <tspan class="status-count" dy="-7" baseline-shift="super">${statusCounts[stage] || 0}</tspan></text>
                            
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
                            
                            <!-- Status label with left justification -->
                            <text 
                                x="10" 
                                y="0" 
                                dominant-baseline="middle" 
                                text-anchor="start"
                                class="center-key-text"
                            >${status.toUpperCase()} <tspan class="status-count" dy="-7" baseline-shift="super">${statusCounts[status] || 0}</tspan></text>
                        </g>
                    `;
                }).join('')}
            </g>
        `;

        // Add number squares after all other elements but before synopses
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

                // Add appropriate classes
                let squareClasses = "number-square";
                if (isSceneOpen) squareClasses += " scene-is-open";
                if (isSearchMatch) squareClasses += " search-result";

                svg += `
                    <g transform="translate(${squareX}, ${squareY})">
                        <rect 
                            x="-${squareSize.width/2}" 
                            y="-${squareSize.height/2}" 
                            width="${squareSize.width}" 
                            height="${squareSize.height}" 
                            fill="white"
                            class="${squareClasses}"
                            data-scene-id="${sceneId}"
                            data-has-edits="${hasEdits}"
                        />
                        <text 
                            x="0" 
                            y="0" 
                            text-anchor="middle" 
                            dominant-baseline="middle" 
                            class="number-text${isSceneOpen ? ' scene-is-open' : ''}${isSearchMatch ? ' search-result' : ''}"
                            data-scene-id="${sceneId}"
                            dy="0.1em"
                            fill="black"
                        >${number}</text>
                    </g>
                `;
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

        // Add it to the SVG output
        svg += synopsesHTML;

        // Add JavaScript to handle synopsis visibility
        const scriptSection = `
        <script>
            document.querySelectorAll('.scene-group').forEach(sceneGroup => {
                const scenePath = sceneGroup.querySelector('.scene-path');
                const sceneId = scenePath.id;
                const synopsis = document.querySelector(\`.scene-info[data-for-scene="\${sceneId}"]\`);
                
                sceneGroup.addEventListener('mouseenter', () => {
                    if (synopsis) {
                        synopsis.style.opacity = '1';
                        synopsis.style.pointerEvents = 'all';
                    }
                });
                
                sceneGroup.addEventListener('mouseleave', () => {
                    if (synopsis) {
                        synopsis.style.opacity = '0';
                        synopsis.style.pointerEvents = 'none';
                    }
                });
            });
        </script>`;

        // Add debug coordinate display
        if (this.settings.debug) {
            svg += `
                <g class="debug-info-container" style="pointer-events:none;">
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
        return svg;
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
    refreshTimelineIfNeeded(file: TAbstractFile) {
        // Only refresh if the file is a markdown file
        if (!(file instanceof TFile) || file.extension !== 'md') {
            return;
        }

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
        el.style.position = 'absolute';
        el.style.visibility = 'hidden';
        el.style.maxWidth = `${maxWidth}px`;
        el.style.fontSize = `${fontSize}px`;
        el.style.fontWeight = fontWeight;
        el.style.fontFamily = "'Inter', 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif";
        el.style.whiteSpace = 'pre-wrap'; // Preserve line breaks
        
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
        searchContainer.style.display = 'flex';
        searchContainer.style.gap = '10px';
        searchContainer.style.marginBottom = '15px';
        
        // Create search input
        const searchInput = new TextComponent(searchContainer);
        searchInput.setPlaceholder('Enter search term (min 3 characters)');
        searchInput.inputEl.style.flex = '1';
        
        // Prepopulate with current search term if one exists
        if (this.searchActive && this.searchTerm) {
            searchInput.setValue(this.searchTerm);
        }
        
        // Create button container
        const buttonContainer = contentEl.createDiv('button-container');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '10px';
        buttonContainer.style.justifyContent = 'flex-end';
        
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
                    container.appendChild(fragment);
                    
                    console.log(`SVG parsing fallback took ${performance.now() - startTime}ms`);
                    return svgElement;
                }
                
                return null;
            }
            
            // Get the source SVG element
            const sourceSvg = svgDoc.documentElement;
            
            // Extract critical attributes from source SVG
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
            
            console.log(`SVG parsing took ${performance.now() - startTime}ms`);
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
}


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
            swatch.style.backgroundColor = color;
            
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
        const {containerEl} = this;
        containerEl.empty();

        // Add horizontal rule to separate settings
        containerEl.createEl('hr', { cls: 'settings-separator' });

        // Add settings section
        containerEl.createEl('h2', {text: 'Settings', cls: 'setting-item-heading'});
        
        // Add source path setting
        new Setting(containerEl)
            .setName('Source Path')
            .setDesc('Set the folder containing your scene files (e.g., "Book 1" or "Scenes")')
            .addText(text => text
                .setValue(this.plugin.settings.sourcePath)
                    .onChange(async (value) => {
                    this.plugin.settings.sourcePath = value;
                        await this.plugin.saveSettings();
                }));

        // Add debug mode setting
        new Setting(containerEl)
            .setName('Debug Mode')
            .setDesc('Enable detailed logging in the console (useful for troubleshooting)')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.debug)
                .onChange(async (value) => {
                    this.plugin.settings.debug = value;
                    await this.plugin.saveSettings();
                }));
                

        // Add publishing stage colors section
        containerEl.createEl('h2', {text: 'Publishing Stage Colors', cls: 'setting-item-heading'});
        
        // Create color settings for each stage
        Object.entries(this.plugin.settings.publishStageColors).forEach(([stage, color]) => {
            let textInputRef: TextComponent | undefined;
        new Setting(containerEl)
                .setName(stage)
                .addText(textInput => {
                    textInputRef = textInput;
                    textInput.setValue(color)
                    .onChange(async (value) => {
                            if (this.isValidHex(value)) {
                                (this.plugin.settings.publishStageColors as Record<string, string>)[stage] = value;
                        await this.plugin.saveSettings();
                                // Update the color swatch
                                const swatch = textInput.inputEl.parentElement?.querySelector('.color-swatch') as HTMLElement;
                        if (swatch) {
                            swatch.style.backgroundColor = value;
                                }
                            }
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
                            // Update the color swatch
                            const swatch = textInputRef?.inputEl.parentElement?.querySelector('.color-swatch') as HTMLElement;
                            if (swatch) {
                                swatch.style.backgroundColor = defaultColor;
                            }
                        });
                });
            
            // Add color swatch after the text input
            if (textInputRef) {
                const swatchContainer = textInputRef.inputEl.parentElement;
                if (swatchContainer) {
                    const swatch = document.createElement('div');
                    swatch.className = 'color-swatch';
                    swatch.style.backgroundColor = color;
                    swatch.style.width = '20px';
                    swatch.style.height = '20px';
                    swatch.style.borderRadius = '3px';
                    swatch.style.display = 'inline-block';
                    swatch.style.marginLeft = '8px';
                    swatch.style.border = '1px solid var(--background-modifier-border)';
                    swatchContainer.appendChild(swatch);
                }
            }
            });
            
        // Add horizontal rule to separate settings from documentation
        containerEl.createEl('hr', { cls: 'settings-separator' });
        
        // Add documentation section
        containerEl.createEl('h2', {text: 'Documentation', cls: 'setting-item-heading'});
        
        // Create documentation section
        const documentationContainer = containerEl.createDiv('documentation-container');
        documentationContainer.style.marginLeft = '0';
        documentationContainer.style.paddingLeft = '0';
        
        // Fetch README.md content from GitHub
        fetch('https://raw.githubusercontent.com/ericrhystaylor/Obsidian-Manuscript-Timeline/refs/heads/master/README.md')
            .then(response => response.text())
            .then(content => {
                MarkdownRenderer.renderMarkdown(
                    content,
                    documentationContainer,
                    '',
                    this.plugin
                );
            })
            .catch(error => {
                documentationContainer.createEl('p', { text: 'Error loading documentation. Please check your internet connection.' });
        });
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
                    debugContainer.style.display = 'none';
                    return;
                } else {
                    // Ensure display is visible
                    debugContainer.style.display = '';
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
                debugContainer.style.display = this.plugin.settings.debug ? '' : 'none';
            });
            
            // Initial visibility check
            debugContainer.style.display = this.plugin.settings.debug ? '' : 'none';
            
            // For changes that might happen outside mutation observer
            document.addEventListener('visibilitychange', () => {
                debugContainer.style.display = this.plugin.settings.debug ? '' : 'none';
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
        const escapeRegExp = (string: string): string => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
                text: "Create a Test Scene File"
            });
            
            // SAFE: inline style used for button formatting
            testButton.style.marginTop = "20px";
            testButton.style.padding = "10px";
            
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
            // Generate the SVG content using the plugin's existing method
            // Performance optimization: Calculate start time for performance logging
            const startTime = performance.now();
            const svgContent = this.plugin.createTimelineSVG(scenes);
            this.log(`SVG content generated in ${performance.now() - startTime}ms, length: ${svgContent.length}`);
            
            // Create the SVG element safely without using innerHTML
            const svgElement = this.createSvgElement(svgContent, timelineContainer);
            
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
            }
                
            // Add the fragment to the container to minimize DOM operations
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
                const allElements = svgElement.querySelectorAll('.scene-path, .number-square, .number-text, .scene-title');
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
                    
                    if (numberSquare) {
                        numberSquare.classList.add('selected');
                    }
                    
                    if (numberText) {
                        numberText.classList.add('selected');
                    }
                    
                    // Highlight the scene title
                    const sceneTitle = group.querySelector('.scene-title');
                    if (sceneTitle) {
                        sceneTitle.classList.add('selected');
                    }
                }
                
                // Make other scenes less prominent
                allElements.forEach(element => {
                    if (!element.classList.contains('selected')) {
                        // Apply non-selected class even to open scenes when hovering other scenes
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
                const allElements = svgElement.querySelectorAll('.scene-path, .number-square, .number-text, .scene-title');
                allElements.forEach(element => {
                    element.classList.remove('selected', 'non-selected');
                });
            });
        }
    }
}

