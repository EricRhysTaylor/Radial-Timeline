import { App, Plugin, Notice, Setting, PluginSettingTab, TFile, TAbstractFile, WorkspaceLeaf, ItemView, MarkdownView, MarkdownRenderer, TextComponent, Modal, ButtonComponent } from "obsidian";

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
    text.textContent = content;
    
    if (classes.length > 0) {
        text.classList.add(...classes);
    }
    
    return text;
}

function createSvgTspan(content: string, classes: string[] = []): SVGTSpanElement {
    const tspan = createSvgElement("tspan") as SVGTSpanElement;
    tspan.textContent = content;
    
    if (classes.length > 0) {
        tspan.classList.add(...classes);
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
    const firstSpace = title.indexOf(' ');
    if (firstSpace === -1) return { number: '', text: title };
    
    const number = title.substring(0, firstSpace);
    // Check if the first part is a valid number (integer or decimal)
    if (!number.match(/^\d+(\.\d+)?$/)) {
        return { number: '', text: title };
    }
    
    return {
        number: number,
        text: title.substring(firstSpace + 1)
    };
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
    
    // Add helper method to highlight search terms
    private highlightSearchTerm(text: string): string {
        if (!this.searchActive || !this.searchTerm) return text;
        
        const regex = new RegExp(`(${this.escapeRegExp(this.searchTerm)})`, 'gi');
        
        // Check if the text already contains tspan elements
        if (text.includes('<tspan')) {
            // For text that already has tspan tags, we need to be careful not to break them
            // This is a simplified approach - a more robust solution would use DOM parsing
            return text.replace(regex, (match) => `<tspan class="search-term">${match}</tspan>`);
        } else {
            // Simple case - just wrap the matched text in a tspan
            return text.replace(regex, `<tspan class="search-term">$1</tspan>`);
        }
    }

    // Add helper method to escape special characters in regex
    private escapeRegExp(string: string): string {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    async onload() {
        await this.loadSettings();
        
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
        const size = 1600;
        const margin = 30;
        const innerRadius = 200; // the first ring is 200px from the center
        const outerRadius = size / 2 - margin;
    
        // Create SVG with styles now in external CSS file
        let svg = `<svg width="${size}" height="${size}" viewBox="-${size / 2} -${size / 2} ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="manuscript-timeline-svg">`;
        
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
        svg = `<svg width="${size}" height="${size}" viewBox="-${size / 2} -${size / 2} ${size} ${size}" xmlns="http://www.w3.org/2000/svg" class="manuscript-timeline-svg">`;

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
        const synopsesHTML: string[] = [];
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
            
            const sceneId = `scene-path-${actIndex}-${ring}-${sceneIndex}`;
            const numberInfo = sceneNumbersMap.get(sceneId);
            
            const lineHeight = 26; // Reduced for tighter spacing
            const size = 1600;
            const maxTextWidth = 500;
            const topOffset = -size / 2;

            // Generate random colors for characters
            const characterColors = scene.Character?.map(char => 
                '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0')
            ) || [];

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
                this.highlightSearchTerm(`${scene.title} - ${scene.when?.toLocaleDateString()}`),
                ...(scene.synopsis ? this.splitIntoBalancedLines(scene.synopsis, maxTextWidth).map(line => this.highlightSearchTerm(line)) : []),
                '\u00A0',
                this.highlightSearchTerm(orderedSubplots.join(', ')),
                scene.Character && scene.Character.length > 0 ? 
                    this.highlightSearchTerm(scene.Character.join(', ')) : '',
            ].filter(line => line);

            const totalHeight = contentLines.length * lineHeight;

            // Determine which text block to show based on Act number
            const displayActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
            const showLeftText = displayActNumber <= 2;
            const showRightText = displayActNumber === 3;

            synopsesHTML.push(`
                <g class="scene-info info-container" 
                   data-for-scene="${sceneId}">
                    
                    ${(() => {
                        // Get the scene's act and subplot to determine its position
                        const sceneActNumber = scene.actNumber !== undefined ? scene.actNumber : 1;
                        const actIndex = sceneActNumber - 1;
                        const subplot = scene.subplot || "Main Plot";
                        const ring = NUM_RINGS - 1 - masterSubplotOrder.indexOf(subplot);
                        
                        // Calculate angles from act index
                        const startAngle = (actIndex * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                        const endAngle = ((actIndex + 1) * 2 * Math.PI) / NUM_ACTS - Math.PI / 2;
                        
                        // Calculate radius from ring index
                        const innerRadius = ringStartRadii[ring];
                        const outerRadius = innerRadius + ringWidths[ring];
                        
                        // Find the angular position of this scene
                        const scenesInActAndSubplot = (scenesByActAndSubplot[actIndex] && scenesByActAndSubplot[actIndex][subplot]) || [];
                        const sceneIndex = scenesInActAndSubplot.indexOf(scene);
                        const sceneAngleSize = (endAngle - startAngle) / scenesInActAndSubplot.length;
                        const sceneStartAngle = startAngle + (sceneIndex * sceneAngleSize);
                        const sceneEndAngle = sceneStartAngle + sceneAngleSize;
                        
                        // Calculate the source point (where the scene is)
                        const sceneAngleMidpoint = (sceneStartAngle + sceneEndAngle) / 2;
                        const sourceX = (innerRadius + outerRadius) / 2 * Math.cos(sceneAngleMidpoint);
                        const sourceY = (innerRadius + outerRadius) / 2 * Math.sin(sceneAngleMidpoint);
                        
                        // For fixed position, we don't need to calculate quadrants or edge points
                        // We'll just use the center of the scene cell for the connector
                        const edgeX = sourceX;
                        const edgeY = sourceY;

                        // Prepare the content measurement
                        const titleFontSize = 24;
                        const bodyFontSize = 18;
                        
                        // Prepare the complete text content to measure
                        let fullText = `<div class="synopsis-title">${this.escapeXml(contentLines[0])}</div>`;
                        
                        // Add synopsis lines
                        const synopsisEndIndex = contentLines.length - 2; // -2 to exclude the spacer and subplot/character lines
                        for (let i = 1; i < synopsisEndIndex; i++) {
                            fullText += `<div class="synopsis-body">${this.escapeXml(contentLines[i])}</div>`;
                        }
                        
                        // Add spacer
                        fullText += `<div class="synopsis-spacer"></div>`;
                        
                        // Add subplot and character info
                        if (contentLines[contentLines.length - 2]) {
                            fullText += `<div class="synopsis-metadata">${this.escapeXml(contentLines[contentLines.length - 2])}</div>`;
                        }
                        if (contentLines[contentLines.length - 1]) {
                            fullText += `<div class="synopsis-metadata">${this.escapeXml(contentLines[contentLines.length - 1])}</div>`;
                        }
                        
                        // Add metadata items
                        const metadataItems = contentLines.slice(synopsisEndIndex);
                        metadataItems.forEach(line => {
                            // Handle tspan elements by removing tags for measurement
                            const plainText = line.replace(/<[^>]*>/g, '');
                            fullText += `<div class="synopsis-body">${this.escapeXml(plainText)}</div>`;
                        });
                        
                        // Use a fixed width for the text
                        const textWidth = 250;
                        
                        // Get accurate text dimensions for height
                        const textDimensions = this.measureTextDimensions(fullText, textWidth, bodyFontSize);
                        const textHeight = textDimensions.height;
                        
                        // Use fixed position for the synopsis at the center of the SVG
                        // No need for connector path since we're using fixed HTML positioning
                        
                        // Text alignment (always left-justified)
                        const textAlign = 'left';
                        
                        // No connector path needed for fixed positioning
                        const connectorPath = '';
                        
                        // Calculate text anchor point with standard offset
                        const textAnchorOffset = 0;
                        
                        // Create HTML for synopsis content - now with fixed positioning via CSS
                        let textHTML = `<g class="synopsis-text">`;
                        
                        // Title - don't escape XML if it contains tspan elements
                        const titleContent = contentLines[0];
                        
                        // Get the Publish Stage color for the title
                        const publishStage = scene["Publish Stage"] || 'Zero';
                        const titleColor = PUBLISH_STAGE_COLORS[publishStage as keyof typeof PUBLISH_STAGE_COLORS] || 
                                          PUBLISH_STAGE_COLORS.Zero;
                        
                        // Add debug logging to see the color values
                        if (this.settings.debug) {
                            this.log(`Synopsis title color for ${scene.title}: Stage=${publishStage}, Color=${titleColor}`);
                        }
                        
                        // Ensure publishStage is a string and create a valid class name
                        const stageClass = `title-stage-${String(publishStage).toLowerCase()}`;
                        
                        // Add the title with the publish stage color using tspan to ensure color is applied
                        if (titleContent.includes('<tspan')) {
                            // If it already has tspan tags, preserve them but add our color
                            textHTML += `<text class="info-text title-text-main ${stageClass}" x="0" y="0" text-anchor="${textAlign}" style="--title-color: ${titleColor};">${titleContent}</text>`;
                        } else {
                            // Wrap the entire content in a tspan with explicit fill color
                            textHTML += `<text class="info-text title-text-main ${stageClass}" x="0" y="0" text-anchor="${textAlign}" style="--title-color: ${titleColor};"><tspan fill="${titleColor}">${this.escapeXml(titleContent)}</tspan></text>`;
                        }
                        
                        // Add synopsis lines - adjust y position since we removed the divider
                        for (let i = 1; i < synopsisEndIndex; i++) {
                            const lineContent = contentLines[i];
                            if (lineContent.includes('<tspan')) {
                                textHTML += `<text class="info-text title-text-secondary" x="0" y="${30 + ((i-1) * lineHeight)}" text-anchor="${textAlign}">${lineContent}</text>`;
                            } else {
                                textHTML += `<text class="info-text title-text-secondary" x="0" y="${30 + ((i-1) * lineHeight)}" text-anchor="${textAlign}">${this.escapeXml(lineContent)}</text>`;
                            }
                        }
                        
                        // Metadata (subplots, characters)
                        const metadataStartY = 40 + ((synopsisEndIndex-1) * lineHeight) + 15;
                        metadataItems.forEach((line, i) => {
                            // Create a containing text element to ensure proper alignment
                            if (line.includes('<tspan')) {
                                // For lines with tspan elements (subplots, characters)
                                // Don't escape the line content since we need the tspan elements to be rendered as HTML
                                textHTML += `<text class="info-text metadata-text" x="0" y="${metadataStartY + (i * lineHeight)}" text-anchor="${textAlign}">${line}</text>`;
                            } else {
                                textHTML += `<text class="info-text title-text-secondary" x="0" y="${metadataStartY + (i * lineHeight)}" text-anchor="${textAlign}">${this.escapeXml(line)}</text>`;
                            }
                        });
                        
                        textHTML += `</g>`;
                        
                        return connectorPath + textHTML;
                    })()}
                </g>
            `);
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
                            >${stage.toUpperCase()} <tspan class="status-count">${statusCounts[stage] || 0}</tspan></text>
                            
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
                            >${status.toUpperCase()} <tspan class="status-count">${statusCounts[status] || 0}</tspan></text>
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
        
        // Add all synopses at the end of the SVG
        svg += `            <g class="synopses-container">
                ${synopsesHTML.join('\n')}
            </g>
        `;

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

        svg += `
            ${scriptSection}
        </svg>`;
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
        // First, handle any existing tspan elements by temporarily replacing them
        const tspanRegex = /<tspan[^>]*>([^<]*)<\/tspan>/g;
        const tempText = text.replace(tspanRegex, (_, content) => content);
        
        const words = tempText.split(/\s+/);
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
        
        // Restore tspan elements in the final lines
        return lines.map(line => {
            let restoredLine = line;
            const tspanMatches = text.match(tspanRegex) || [];
            
            tspanMatches.forEach(tspan => {
                const content = tspan.replace(/<[^>]*>/g, '');
                if (line.includes(content)) {
                    restoredLine = restoredLine.replace(content, tspan);
                }
            });
            
            return restoredLine;
        });
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

    private formatSynopsis(text: string, innerRadius: number, fontSize: number): string {
        const maxTextWidth = 400; // Fixed width for all text elements
        const maxCharsPerLine = 50; // Approximately 400px at 16px font size
    
        // Split text into lines with balanced word count
        const lines = this.splitIntoBalancedLines(text, maxCharsPerLine);
    
        // Prepare the formatted text to render inside the SVG
        return lines.map((line, i) => {
            return `<text class="synopsis-text" x="0" y="${20 + i * 25}" text-anchor="middle" style="max-width: ${maxTextWidth}px;">${line}</text>`;
        }).join(' ');
    }


    private formatSubplot(subplots: string): string {
        // Split the subplots into separate lines if there are multiple subplots
        const subplotsList = subplots.split(',').map(subplot => subplot.trim());
        return subplotsList.map((subplot, i) => {
            return `<text class="subplot-text" x="0" y="${-20 + i * 25}" text-anchor="middle">${subplot}</text>`;
        }).join(' ');
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
        // Disable all debug logging
        return;
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

    // Add this helper function for escaping XML/HTML special characters
    private escapeXml(unsafe: string): string {
        return unsafe.replace(/[<>&'"]/g, c => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
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
        el.innerHTML = text;
        
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
        if (!synopsis || !svg) {
            this.log("updateSynopsisPosition: missing synopsis or svg element", {synopsis, svg});
            return;
        }
        
        try {
            const pt = svg.createSVGPoint();
            pt.x = event.clientX;
            pt.y = event.clientY;
            const ctm = svg.getScreenCTM();
            if (!ctm) {
                this.log("updateSynopsisPosition: No SVG CTM available");
                return;
            }
            
            const svgP = pt.matrixTransform(ctm.inverse());
            
            // Determine which quadrant the mouse is in
            const quadrant = 
                svgP.x >= 0 && svgP.y >= 0 ? "Q1" :  // Bottom Right
                svgP.x < 0 && svgP.y >= 0 ? "Q2" :   // Bottom Left
                svgP.x < 0 && svgP.y < 0 ? "Q3" :    // Top Left
                "Q4";                                // Top Right
            
            // Place the synopsis in the appropriate position based on quadrant
            // Note: The synopsis is displayed in the OPPOSITE quadrant from the mouse position
            // with specific justification for each display location
            let translateX, translateY;
            synopsis.classList.remove('synopsis-q1', 'synopsis-q2', 'synopsis-q3', 'synopsis-q4');
            
            if (quadrant === 'Q1') { // Mouse in Bottom Right (Q1)
                translateX = -600;    // Place at X = -600 (Q2 area - left side)
                translateY = 150;     // Place at Y = 150 (bottom half)
                synopsis.classList.add('synopsis-q2'); // Left justify in Q2
            } else if (quadrant === 'Q2') { // Mouse in Bottom Left (Q2)
                translateX = 600;     // Place at X = 600 (Q1 area - right side)
                translateY = 150;     // Place at Y = 150 (bottom half)
                synopsis.classList.add('synopsis-q1'); // Right justify in Q1
            } else if (quadrant === 'Q3') { // Mouse in Top Left (Q3)
                translateX = 500;     // Place at X = 500 (Q4 area - right side)
                translateY = -550;    // Place at Y = -550 (top half)
                synopsis.classList.add('synopsis-q4'); // Right justify in Q4
            } else { // Mouse in Top Right (Q4)
                translateX = -500;    // Place at X = -500 (Q3 area - left side)
                translateY = -550;    // Place at Y = -550 (top half)
                synopsis.classList.add('synopsis-q3'); // Left justify in Q3
            }
            
            // Make sure the synopsis is visible by applying both class and style changes
            synopsis.classList.add('visible');
            (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.opacity = "1";
            (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.pointerEvents = "all";
            
            // Position based on calculated values
            const translateValue = `translate(${translateX}, ${translateY})`;
            synopsis.setAttribute('transform', translateValue);
            
            // Store the quadrant information in a data attribute
            synopsis.setAttribute('data-quadrant', quadrant);
            
            this.log(`Synopsis shown at position: ${translateX}, ${translateY} for quadrant ${quadrant}`, {
                synopsisVisible: synopsis.classList.contains('visible'),
                transform: synopsis.getAttribute('transform'),
                quadrant: quadrant
            });
        } catch (error) {
            console.error("Error in updateSynopsisPosition:", error);
        }
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
        if (term.length < 3) return;
        
        this.searchTerm = term;
        this.searchActive = true;
        this.searchResults.clear();
        
        // Get scene data and find matches
        this.getSceneData().then(scenes => {
            scenes.forEach(scene => {
                const searchableText = [
                    scene.title || '',
                    scene.synopsis || '',
                    scene.subplot || '',
                    ...(scene.characters || []),
                    ...(scene.Character || [])  // Backward compatibility
                ].join(' ').toLowerCase();
                
                if (searchableText.includes(term.toLowerCase())) {
                    if (scene.path) {
                        this.searchResults.add(scene.path);
                    }
                }
            });
            
            // Get all timeline views and refresh them
            const timelineViews = this.app.workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)
                .map(leaf => leaf.view as ManuscriptTimelineView)
                .filter(view => view instanceof ManuscriptTimelineView);

            // Refresh each view
            timelineViews.forEach(view => {
                if (view) {
                    view.refreshTimeline();
                }
            });
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

        // Refresh each view
        timelineViews.forEach(view => {
            if (view) {
                view.refreshTimeline();
            }
        });
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
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (result) {
            const r = parseInt(result[1], 16);
            const g = parseInt(result[2], 16);
            const b = parseInt(result[3], 16);
            return `${r}, ${g}, ${b}`;
        }
        return null;
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
    plugin: ManuscriptTimelinePlugin;
    sceneData: Scene[] = [];
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
        
        // Initial check of open files
        this.updateOpenFilesTracking();
        
        // Initial timeline render
        this.refreshTimeline();
    }
    
    async onClose(): Promise<void> {
        // Clean up any event listeners or resources
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
Title: 1 Test Scene
When: ${today}
Act: 1
Subplot: Main Plot
Character: [Protagonist]
Status: Working
Synopsis: This is a test scene created to troubleshoot the timeline view.
---

# Test Scene

This is a test scene created to help troubleshoot the Manuscript Timeline plugin.

## Scene Details
- Title: Test Scene
- When: ${today}
- Act: 1
- Subplot: Main Plot
- Character: Protagonist
- Status: Working
`;
        
        // Generate a unique filename
        const filename = `${targetPath ? targetPath + "/" : ""}1_test_scene.md`;
        
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
            
            testButton.style.marginTop = "20px";
            testButton.style.padding = "10px";
            
            testButton.addEventListener("click", async () => {
                await this.createTestSceneFile();
            });
            
            return;
        }
        
        this.log(`Found ${scenes.length} scenes to render`);
        
        this.sceneData = scenes;
        
        try {
            // Generate the SVG content using the plugin's existing method
            const svgContent = this.plugin.createTimelineSVG(scenes);
            this.log("SVG content generated, length:", svgContent.length);
            
            // Create a container with proper styling for centered content
            const timelineContainer = container.createEl("div", {
                cls: "manuscript-timeline-container"
            });
            
            // Use innerHTML to set the SVG content
            timelineContainer.innerHTML = svgContent;
            
            // Find the SVG element
            const svgElement = timelineContainer.querySelector("svg");
            if (svgElement) {
                // Set proper attributes for SVG element
                svgElement.setAttribute('width', '100%');
                svgElement.setAttribute('height', '100%');
                svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
                
                // Add direct JavaScript handlers for mouse events
                const allSynopses = svgElement.querySelectorAll(".scene-info");
                allSynopses.forEach(synopsis => {
                    // Initial setup to ensure they're hidden
                    (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.opacity = "0";
                    (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.pointerEvents = "none";
                });
                
                // Mark open files in the timeline
                const sceneGroups = svgElement.querySelectorAll(".scene-group");
                this.log(`Found ${sceneGroups.length} scene groups to check against ${this.openScenePaths.size} open files`);
                
                let markedOpenCount = 0;
                
                // Setup search controls after SVG is rendered
                this.setupSearchControls();
                
                sceneGroups.forEach((group) => {
                    const encodedPath = group.getAttribute("data-path");
                    if (encodedPath && encodedPath !== "") {
                        const filePath = decodeURIComponent(encodedPath);
                        
                        // Check if this file is currently open in a tab
                        if (this.openScenePaths.has(filePath)) {
                            this.log(`Marking scene as open: ${filePath}`);
                            markedOpenCount++;
                            
                            // Add a class to indicate this scene is open
                            group.classList.add("scene-is-open");
                            
                            // Mark the scene path element (but no styling)
                            const scenePath = group.querySelector(".scene-path");
                            if (scenePath) {
                                scenePath.classList.add("scene-is-open");
                            }
                            
                            // Mark the scene title text if present
                            const sceneTitle = group.querySelector(".scene-title");
                            if (sceneTitle) {
                                sceneTitle.classList.add("scene-is-open");
                            }
                            
                            // Mark the number square (but no styling)
                            const numberSquare = svgElement.querySelector(`.number-square[data-scene-id="${scenePath?.id}"]`);
                            if (numberSquare) {
                                numberSquare.classList.add("scene-is-open");
                            }
                            
                            // Mark the number text with the accent color
                            const numberText = svgElement.querySelector(`.number-text[data-scene-id="${scenePath?.id}"]`);
                            if (numberText) {
                                numberText.classList.add("scene-is-open");
                            }
                        }
                    }
                    
                    // Find all scene paths for click interaction
                    const path = group.querySelector(".scene-path");
                    if (path) {
                        const encodedPath = group.getAttribute("data-path");
                        if (encodedPath && encodedPath !== "") {
                            const filePath = decodeURIComponent(encodedPath);
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
                                        // Open in a new tab without trying to return focus
                                        const leaf = this.plugin.app.workspace.getLeaf('tab');
                                        leaf.openFile(file);
                                    }
                                }
                            });
                            (path as SVGElement & {style: CSSStyleDeclaration}).style.cursor = "pointer";
                        }
                        
                        // Add mouseover effects for synopses
                        const sceneId = path.id;
                        const synopsis = svgElement.querySelector(`.scene-info[data-for-scene="${sceneId}"]`);
                        
                        if (synopsis) {
                            // Apply mouseover effects for the group/path
                            group.addEventListener("mouseenter", (event: MouseEvent) => {
                                // Reset all previous mouseover effects to ensure clean state
                                const allElements = svgElement.querySelectorAll('.scene-path, .number-square, .number-text, .scene-title');
                                allElements.forEach(element => {
                                    // Remove only the selected and non-selected classes, but keep the scene-is-open class
                                    element.classList.remove('selected', 'non-selected');
                                });
                                
                                // Update synopsis position with debug info
                                const svg = svgElement.closest('svg') as SVGSVGElement;
                                this.plugin.updateSynopsisPosition(synopsis, event, svg, sceneId);
                                
                                // Make the tooltip visible
                                synopsis.classList.add('visible');
                                (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.opacity = "1";
                                (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.pointerEvents = "all";
                                
                                this.log("Synopsis shown", {
                                    synopsisVisible: synopsis.classList.contains('visible'),
                                    opacity: (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.opacity
                                });
                                
                                this.log("Mouseover triggered for scene:", sceneId);
                                
                                // Reveal the file in navigation
                                const encodedPath = group.getAttribute("data-path");
                                if (encodedPath && encodedPath !== "") {
                                    const filePath = decodeURIComponent(encodedPath);
                                    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
                                    if (file instanceof TFile) {
                                        // Use the file explorer view to reveal the file
                                        const fileExplorer = this.plugin.app.workspace.getLeavesOfType("file-explorer")[0]?.view;
                                        if (fileExplorer) {
                                            // @ts-ignore - Ignore TypeScript errors as the API may not be fully typed
                                            fileExplorer.revealInFolder(file);
                                        }
                                    }
                                }
                                
                                // Find and animate the number square for this scene
                                const numberSquare = svgElement.querySelector(`.number-square[data-scene-id="${sceneId}"]`);
                                const numberText = svgElement.querySelector(`.number-text[data-scene-id="${sceneId}"]`);
                                
                                if (numberSquare) {
                                    numberSquare.classList.add('selected');
                                    
                                    // Add scene color as CSS custom property
                                    const sceneFill = path.getAttribute("fill");
                                    if (sceneFill) {
                                        // Use CSS variable for color
                                        (numberSquare as SVGElement & {style: CSSStyleDeclaration}).style.setProperty('--scene-color', sceneFill);
                                    }
                                }
                                
                                if (numberText) {
                                    numberText.classList.add('selected');
                                }
                                
                                // Apply color transform without changing opacity
                                const allPaths = svgElement.querySelectorAll(".scene-path");
                                allPaths.forEach(otherPath => {
                                    if (otherPath !== path) {
                                        // Set ALL non-selected scenes to non-selected class
                                        otherPath.classList.add('non-selected');
                                        
                                        // Find and fade this path's number box and scene title
                                        const otherId = otherPath.id;
                                        
                                        // Add non-selected to all elements for this path
                                        const elementsToFade = [
                                            svgElement.querySelector(`.number-square[data-scene-id="${otherId}"]`),
                                            svgElement.querySelector(`.number-text[data-scene-id="${otherId}"]`),
                                            svgElement.querySelector(`.scene-title[data-scene-id="${otherId}"]`)
                                        ];
                                        
                                        elementsToFade.forEach(element => {
                                            if (element) {
                                                // ONLY ADD NON-SELECTED CLASS - just like for number boxes
                                                element.classList.add('non-selected');
                                                
                                                // Force browser reflow to apply the class
                                                void (element as HTMLElement).offsetWidth;
                                            }
                                        });
                                    } else {
                                        // Make the current path more prominent with class
                                        otherPath.classList.add('selected');
                                        
                                        // Highlight this scene's title and add the selected class
                                        const currentId = otherPath.id;
                                        const currentSceneTitle = svgElement.querySelector(`.scene-title[data-scene-id="${currentId}"]`);
                                        
                                        if (currentSceneTitle) {
                                            // ONLY ADD SELECTED CLASS - just like for number boxes
                                            currentSceneTitle.classList.add('selected');
                                        }
                                    }
                                });
                            });
                            
                            group.addEventListener("mouseleave", () => {
                                if (synopsis) {
                                    // Apply BOTH class and direct style changes for maximum compatibility
                                    synopsis.classList.remove('visible');
                                    (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.opacity = "0";
                                    (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.pointerEvents = "none";
                                    
                                    this.log("Synopsis hidden", {
                                        synopsisVisible: synopsis.classList.contains('visible'),
                                        opacity: (synopsis as SVGElement & {style: CSSStyleDeclaration}).style.opacity
                                    });
                                }
                                
                                // Reset the styling of all scene elements
                                const allPaths = svgElement.querySelectorAll(".scene-path");
                                allPaths.forEach(otherPath => {
                                    // Remove the mouseover effect classes
                                    otherPath.classList.remove('selected', 'non-selected');
                                    
                                    // Reset number box and title styling
                                    const otherId = otherPath.id;
                                    
                                    // Remove classes from all elements for this path
                                    const elementsToReset = [
                                        svgElement.querySelector(`.number-square[data-scene-id="${otherId}"]`),
                                        svgElement.querySelector(`.number-text[data-scene-id="${otherId}"]`),
                                        svgElement.querySelector(`.scene-title[data-scene-id="${otherId}"]`)
                                    ];
                                    
                                    elementsToReset.forEach(element => {
                                        if (element) {
                                            // Remove mouseover classes
                                            element.classList.remove('selected', 'non-selected');
                                            
                                            // For number squares, remove the custom CSS property
                                            if (element.classList.contains('number-square')) {
                                                (element as SVGElement & {style: CSSStyleDeclaration}).style.removeProperty('--scene-color');
                                            }
                                            
                                            // Force browser reflow to apply the class
                                            void (element as HTMLElement).offsetWidth;
                                        }
                                    });
                                });
                            });
                        }
                    }
                });
                
                this.log(`Marked ${markedOpenCount} scenes as open`);
                this.log("Added click handlers and mouseover effects to scene paths");
            } else {
                console.error("Failed to find SVG element in container");
            }
        } catch (error) {
            console.error("Error rendering timeline:", error);
            container.createEl("div", {
                cls: "error-message",
                text: `Error rendering timeline: ${error.message}`
            });
        }
    }
    
    // Add a method to create highlight rectangles
    private addHighlightRectangles(): void {
        if (!this.plugin.searchActive) {
            return;
        }
        
        // Get all search term tspans
        const searchTerms = this.contentEl.querySelectorAll('.search-term');
        
        // Apply direct styling to each search term
        // (Most styling now comes from CSS in styles.css)
        searchTerms.forEach(term => {
            try {
                // Apply background directly to the tspan if needed
                const tspan = term as SVGTSpanElement;
                
                // Apply paint order and ensure text is on top of highlight
                tspan.setAttribute('paint-order', 'stroke');
                
                // For compatibility with older browsers, we can add these directly
                // (but most styling should come from CSS)
                if (!tspan.hasAttribute('font-weight')) {
                    tspan.setAttribute('font-weight', 'bold');
                }
            } catch (error) {
                // Silently skip any errors
            }
        });
    }

    // Test function to manually trigger highlights
    testHighlights() {
        // Temporarily save the current state
        const wasSearchActive = this.plugin.searchActive;
        const prevSearchTerm = this.plugin.searchTerm;
        
        // Force search to be active
        this.plugin.searchActive = true;
        this.plugin.searchTerm = "test"; // Use a simple test term
        
        // Create test search terms
        const contentContainer = this.contentEl.querySelector('.manuscript-timeline-container');
        if (contentContainer) {
            // Test approach: Find text elements in each quadrant to test highlighting
            const quadrants = ['Q1', 'Q2', 'Q3', 'Q4'];
            
            quadrants.forEach(quadrant => {
                // Find text elements in this quadrant
                const quadrantTexts = contentContainer.querySelectorAll(`[data-quadrant="${quadrant}"] text`);
                
                if (quadrantTexts.length > 0) {
                    // Only test the first text element in each quadrant
                    const textEl = quadrantTexts[0] as SVGTextElement;
                    
                    // Add search-term class to the first word
                    const text = textEl.textContent || "";
                    if (text.length > 0) {
                        const firstWord = text.split(' ')[0];
                        if (firstWord && firstWord.length > 0) {
                            const newHTML = text.replace(firstWord, `<tspan class="search-term">${firstWord}</tspan>`);
                            textEl.innerHTML = newHTML;
                        }
                    }
                }
            });
            
            // Apply the highlights
            this.addHighlightRectangles();
            
            // Restore original state after 5 seconds
            setTimeout(() => {
                this.plugin.searchActive = wasSearchActive;
                this.plugin.searchTerm = prevSearchTerm;
            }, 5000);
        }
    }
}