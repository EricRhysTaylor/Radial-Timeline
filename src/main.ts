/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { App, Plugin, Notice, Setting, PluginSettingTab, TFile, TAbstractFile, WorkspaceLeaf, ItemView, MarkdownView, MarkdownRenderer, TextComponent, Modal, ButtonComponent, requestUrl, Editor, parseYaml, stringifyYaml, Menu, MenuItem, Platform, DropdownComponent, Component, TFolder, SuggestModal, normalizePath } from "obsidian";
import { TimelineService } from './services/TimelineService';
import { escapeRegExp } from './utils/regex';
import { hexToRgb, rgbToHsl, hslToRgb, rgbToHex, desaturateColor } from './utils/colour';
import { decodeHtmlEntities } from './utils/text';
import { STATUS_COLORS, SceneNumberInfo } from './utils/constants';
import SynopsisManager from './SynopsisManager';
import { createTimelineSVG, adjustBeatLabelsAfterRender } from './renderer/TimelineRenderer';
import { RadialTimelineView } from './view/TimeLineView';
import { RendererService } from './services/RendererService';
import { openGossamerScoreEntry, runGossamerAiAnalysis } from './GossamerCommands';
import { RadialTimelineSettingsTab } from './settings/SettingsTab';
import { SceneAnalysisProcessingModal } from './modals/SceneAnalysisProcessingModal';
import { ReleaseNotesModal } from './modals/ReleaseNotesModal';
import { shiftGossamerHistory } from './utils/gossamer';
import { assembleManuscript } from './utils/manuscript';
import { normalizeFrontmatterKeys } from './utils/frontmatter';
import { parseSceneTitle } from './utils/text';
import { parseWhenField } from './utils/date';
import { compareReleaseVersionsDesc, parseReleaseVersion } from './utils/releases';


// Declare the variable that will be injected by the build process
declare const EMBEDDED_README_CONTENT: string;
declare const EMBEDDED_RELEASE_NOTES: string;

// Import the new scene analysis function <<< UPDATED IMPORT
import { processByManuscriptOrder, testYamlUpdateFormatting, createTemplateScene, getDistinctSubplotNames, processBySubplotNameWithModal, processEntireSubplotWithModal } from './SceneAnalysisCommands';

// Helper function to normalize boolean values from various formats
function normalizeBooleanValue(value: unknown): boolean {
    if (typeof value === 'boolean') {
        return value;
    }
    if (typeof value === 'string') {
        const lower = value.toLowerCase().trim();
        // Handle empty string or just whitespace as false
        if (lower === '' || lower === ' ') {
            return false;
        }
        return lower === 'yes' || lower === 'true' || lower === '1';
    }
    if (typeof value === 'number') {
        return value === 1;
    }
    // Handle null, undefined, or any other falsy value as false
    return false;
}

/**
 * Check if a Class field represents a story beat
 * Accepts both "Plot" (legacy) and "Beat" (recommended), case-insensitive
 */
function isStoryBeat(classValue: unknown): boolean {
    if (typeof classValue !== 'string') return false;
    const normalized = classValue.toLowerCase().trim();
    return normalized === 'plot' || normalized === 'beat';
}

interface RadialTimelineSettings {
    sourcePath: string;
    validFolderPaths: string[]; // <<< ADDED: Store previously validated folder paths for autocomplete
    publishStageColors: {
        Zero: string;
        Author: string;
        House: string;
        Press: string;
    };
    subplotColors: string[]; // 16 subplot palette colors
    // Mode system
    currentMode?: string; // Current timeline mode (TimelineMode enum value)
    logApiInteractions: boolean; // <<< ADDED: Setting to log API calls to files
    debug: boolean; // Add debug setting
    targetCompletionDate?: string; // Optional: Target date as yyyy-mm-dd string
    openaiApiKey?: string; // <<< ADDED: Optional OpenAI API Key
    anthropicApiKey?: string; // <<< ADDED: Anthropic API Key
    anthropicModelId?: string; // <<< ADDED: Selected Anthropic Model ID
    geminiApiKey?: string; // <<< ADDED: Gemini API Key
    geminiModelId?: string; // <<< ADDED: Selected Gemini Model ID
    defaultAiProvider?: 'openai' | 'anthropic' | 'gemini'; // <<< ADDED: Default AI provider
    openaiModelId?: string; // <<< ADDED: Selected OpenAI Model ID
    // Feature toggles
    enableAiSceneAnalysis: boolean; // Show AI scene analysis features (colors + synopsis)
    enableZeroDraftMode?: boolean; // Intercept complete scenes in Stage Zero for Pending Edits modal
    // Advanced
    metadataRefreshDebounceMs?: number; // Debounce for frontmatter-changed refresh
    showEstimate?: boolean; // Toggle estimation arc/label near progress ring
    enableSceneTitleAutoExpand?: boolean; // Auto-expand clipped scene titles on hover
    enableHoverDebugLogging?: boolean; // Emit verbose hover redistribution logs to console
    sortByWhenDate?: boolean; // Sort scenes by When date (true) or manuscript order (false). Chronologue mode always uses When date.
    chronologueDurationCapSelection?: string; // Value|unit key used for duration arc cap (or 'auto')
    // AI Context Templates
    aiContextTemplates?: Array<{id: string; name: string; prompt: string; isBuiltIn: boolean}>;
    activeAiContextTemplateId?: string;
    // Beat System for Gossamer
    beatSystem?: string; // Selected beat system (e.g., "Save The Cat", "Hero's Journey", "Story Grid")
    // Resume state (internal, not exposed in UI)
    _isResuming?: boolean; // Temporary flag to indicate resume operation
    _resumingMode?: 'flagged' | 'unprocessed' | 'force-all'; // Mode being resumed
    lastSeenReleaseNotesVersion?: string; // Track release modal consumption
    cachedReleaseNotes?: EmbeddedReleaseNotesBundle | null;
    releaseNotesLastFetched?: string;
    // Optional: Store the fetched models list to avoid refetching?
    // availableOpenAiModels?: { id: string, description?: string }[];
}

// Constants for the view
export const TIMELINE_VIEW_TYPE = "radial-timeline";
const TIMELINE_VIEW_DISPLAY_TEXT = "Radial timeline"; // Sentence case per guidelines

export interface Scene {
    title?: string;
    date: string;
    path?: string;
    subplot?: string;
    act?: string;
    // Use singular meta key: Character
    // character?: string[]; // removed in favor of Character
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
    Duration?: string; // Scene duration (e.g., "2 hours", "3 days")
    Book?: string; // Add book title property
    "previousSceneAnalysis"?: string; // Add previousSceneAnalysis property
    "currentSceneAnalysis"?: string; // Add currentSceneAnalysis property 
    "nextSceneAnalysis"?: string; // Add nextSceneAnalysis property
    "Beats Update"?: boolean | string; // Scene analysis processing flag (legacy name kept for compatibility)
    // Beat-specific properties  
    itemType?: "Scene" | "Plot" | "Beat"; // Distinguish between Scene and Beat items (Plot is legacy for Beat)
    Description?: string; // For Beat descriptions
    "Beat Model"?: string; // Beat system (e.g., "Save The Cat", "Hero's Journey")
    Range?: string; // Ideal momentum range for this beat (e.g., "0-20", "71-90")
    "Suggest Placement"?: string; // AI-suggested scene number for optimal beat placement (e.g., "33.5")
    // Gossamer score fields
    Gossamer1?: number; // Current Gossamer score
    Gossamer2?: number; // Gossamer score history
    Gossamer3?: number;
    Gossamer4?: number;
    Gossamer5?: number;
    Gossamer6?: number;
    Gossamer7?: number;
    Gossamer8?: number;
    Gossamer9?: number;
    Gossamer10?: number;
    Gossamer11?: number;
    Gossamer12?: number;
    Gossamer13?: number;
    Gossamer14?: number;
    Gossamer15?: number;
    Gossamer16?: number;
    Gossamer17?: number;
    Gossamer18?: number;
    Gossamer19?: number;
    Gossamer20?: number;
    Gossamer21?: number;
    Gossamer22?: number;
    Gossamer23?: number;
    Gossamer24?: number;
    Gossamer25?: number;
    Gossamer26?: number;
    Gossamer27?: number;
    Gossamer28?: number;
    Gossamer29?: number;
    Gossamer30?: number;
}

// SceneNumberInfo now imported from constants

export const DEFAULT_SETTINGS: RadialTimelineSettings = {
    sourcePath: '',
    validFolderPaths: [], // <<< ADDED: Default empty array for folder path history
    publishStageColors: {
        Zero: '#9E70CF',   // Purple (Stage Zero)
        Author: '#5E85CF', // Blue   (Author)
        House: '#DA7847',  // Orange (House)
        Press: '#6FB971'   // Green  (Press)
    },
    subplotColors: [
        '#EFBDEB', // 0
        '#a35ca7', // 1
        '#6461A0', // 2
        '#314CB6', // 3
        '#0A81D1', // 4
        '#98CE00', // 5
        '#16E0BD', // 6
        '#78C3FB', // 7
        '#273C2C', // 8
        '#A6D8D4', // 9
        '#FF8600', // 10
        '#F9E784', // 11
        '#CEC3C1', // 12
        '#F3D34A', // 13
        '#004777', // 14
        '#8B4513'  // 15 - Brown for Ring 16
    ],
    currentMode: 'all-scenes', // Default to All Scenes mode
    logApiInteractions: true, // <<< ADDED: Default for new setting
    debug: false,
    targetCompletionDate: undefined, // Ensure it's undefined by default
    openaiApiKey: '', // Default to empty string
    anthropicApiKey: '', // <<< ADDED: Default empty string
    anthropicModelId: 'claude-sonnet-4-20250514', // Default to Sonnet 4 (20250514)
    geminiApiKey: '',
    geminiModelId: 'gemini-2.5-pro', // Default to Gemini 2.5 Pro
    defaultAiProvider: 'openai',
    openaiModelId: 'gpt-4.1', // Default to GPT-4.1
    enableAiSceneAnalysis: true,
    enableZeroDraftMode: false,
    metadataRefreshDebounceMs: 10000,
    showEstimate: true,
    enableSceneTitleAutoExpand: true, // Default: enabled to maintain current behavior
    enableHoverDebugLogging: false,
    sortByWhenDate: false, // Default: manuscript order (backward compatible)
    chronologueDurationCapSelection: 'auto',
    aiContextTemplates: [
        {
            id: "commercial_genre",
            name: "Commercial Genre Fiction (Balanced Depth)",
            prompt: `Act as a developmental editor for a commercial genre novel. Prioritize pacing, clarity, and emotional stakes. Ensure each scene moves the plot or deepens character conflict. Keep prose lean; prefer tension and subtext to exposition. Focus feedback on momentum, scene purpose, and reader engagement.`,
            isBuiltIn: true
        },
        {
            id: "literary",
            name: "Literary / Character-Driven Fiction",
            prompt: `Act as a developmental editor for a literary or character-driven novel. Emphasize emotional resonance, internal conflict, and subtext. Feedback should focus on authenticity of character motivation, narrative voice, and thematic depth. Avoid line-level polish; focus on the psychological realism of each beat.`,
            isBuiltIn: true
        },
        {
            id: "young_adult",
            name: "Young Adult / Coming-of-Age",
            prompt: `Act as a developmental editor for a young adult coming-of-age novel. Focus on pacing, clear emotional arcs, and voice consistency. Ensure stakes feel personal and immediate. Highlight areas where dialogue or internal monologue can better show growth or vulnerability. Keep feedback concise and energetic.`,
            isBuiltIn: true
        },
        {
            id: "science_fiction",
            name: "Epic or Hard Science Fiction / World-Building Focus",
            prompt: `Act as a developmental editor for a science-fiction novel with complex world-building. Balance clarity and immersion; ensure exposition is dramatized through character action or dialogue. Focus feedback on world logic, pacing through discovery, and integrating big ideas without slowing emotional momentum. Prioritize cohesion between technology, society, and theme.`,
            isBuiltIn: true
        },
        {
            id: "thriller",
            name: "Mystery / Thriller / Suspense",
            prompt: `Act as a developmental editor for a mystery or thriller novel. Emphasize pacing, tension, and clarity of motive. Identify where reveals or reversals land too early or too late. Ensure reader curiosity and suspense are sustained through every scene. Keep feedback focused on plot mechanics and emotional rhythm.`,
            isBuiltIn: true
        },
        {
            id: "romance",
            name: "Romance / Emotional-Arc Focused Fiction",
            prompt: `Act as a developmental editor for a romance or emotionally driven narrative. Focus feedback on relationship dynamics, emotional authenticity, and pacing of attraction/conflict/resolution. Ensure internal and external conflicts are intertwined. Highlight where subtext or tension could replace exposition.`,
            isBuiltIn: true
        }
    ],
    activeAiContextTemplateId: 'commercial_genre',
    beatSystem: 'Save The Cat', // Default beat system
    lastSeenReleaseNotesVersion: '',
    cachedReleaseNotes: null,
    releaseNotesLastFetched: undefined
};

// STATUS_COLORS now imported from constants

export interface EmbeddedReleaseNotesEntry {
    version: string;
    title: string;
    body: string;
    url?: string;
    publishedAt?: string;
}

export interface EmbeddedReleaseNotesBundle {
    major?: EmbeddedReleaseNotesEntry | null;
    latest?: EmbeddedReleaseNotesEntry | null;
    patches?: EmbeddedReleaseNotesEntry[];
}

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

// Remove redundant parseSceneTitle function - use the one from utils/text.ts instead

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

// Note: Search highlighting is now handled entirely by addHighlightRectangles() in TimeLineView.ts
// after the SVG is rendered. This simplifies the code and ensures a single source of truth.

export interface GetSceneDataOptions {
    filterBeatsBySystem?: boolean;
}

export default class RadialTimelinePlugin extends Plugin {
    settings: RadialTimelineSettings;
    
    // Do not store persistent references to views (per Obsidian guidelines)

    // Track open scene paths
    openScenePaths: Set<string> = new Set<string>();
    // Ensure settings tab is only added once per load
    private _settingsTabAdded: boolean = false;
    
    // Search related properties
    searchTerm: string = '';
    searchActive: boolean = false;
    searchResults: Set<string> = new Set<string>();
    
    // Services
    private timelineService!: TimelineService;
    private searchService!: import('./services/SearchService').SearchService;
    private fileTrackingService!: import('./services/FileTrackingService').FileTrackingService;
    private rendererService!: RendererService;
    public lastSceneData?: Scene[];
    
    // Completion estimate stats
    latestTotalScenes: number = 0;
    latestRemainingScenes: number = 0;
    latestScenesPerWeek: number = 0;
    
    // Add a synopsisManager instance
    public synopsisManager: SynopsisManager;
    
    // Add property to store the latest status counts for completion estimate
    public latestStatusCounts?: Record<string, number>;
    
    private releaseNotesBundle: EmbeddedReleaseNotesBundle | null = null;
    private releaseModalShownThisSession = false;
    private releaseNotesFetchPromise: Promise<boolean> | null = null;
    
    // Track active scene analysis processing modal and status bar item
    public activeBeatsModal: SceneAnalysisProcessingModal | null = null;
    private beatsStatusBarItem: HTMLElement | null = null;

    // Helper: get all currently open timeline views
    public getTimelineViews(): RadialTimelineView[] { return this.timelineService.getTimelineViews(); }
    
    // Helper: get the first open timeline view (if any)
    private getFirstTimelineView(): RadialTimelineView | null {
        const list = this.getTimelineViews();
        return list.length > 0 ? list[0] : null;
    }

    // Settings access helpers
    private get aiProvider(): 'openai' | 'anthropic' | 'gemini' {
        return this.settings.defaultAiProvider || 'openai';
    }

    private getApiKey(): string | undefined {
        const provider = this.aiProvider;
        if (provider === 'anthropic') return this.settings.anthropicApiKey;
        if (provider === 'gemini') return this.settings.geminiApiKey;
        return this.settings.openaiApiKey;
    }

    private getModelId(): string {
        const provider = this.aiProvider;
        if (provider === 'anthropic') return this.settings.anthropicModelId || 'claude-sonnet-4-20250514';
        if (provider === 'gemini') return this.settings.geminiModelId || 'gemini-2.5-pro';
        return this.settings.openaiModelId || 'gpt-4.1';
    }
    
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

    private normalizeReleaseEntry(value: unknown): EmbeddedReleaseNotesEntry | null {
        if (!value || typeof value !== 'object') return null;
        const raw = value as Record<string, unknown>;
        const rawVersion =
            typeof raw.version === 'string' ? raw.version :
            typeof raw.tag === 'string' ? raw.tag :
            typeof raw.tag_name === 'string' ? raw.tag_name as string :
            typeof raw.name === 'string' ? raw.name as string :
            '';
        const version = rawVersion.toString().trim().replace(/^v/i, '');
        if (!version) return null;
        const title =
            typeof raw.title === 'string' && raw.title.trim().length > 0
                ? raw.title
                : (typeof raw.name === 'string' && raw.name.trim().length > 0
                    ? raw.name
                    : `Radial Timeline ${version}`);
        const body = typeof raw.body === 'string' ? raw.body : '';
        const entry: EmbeddedReleaseNotesEntry = {
            version,
            title,
            body: body.length > 0 ? body : 'No release notes were provided for this version.',
        };
        const url =
            typeof raw.html_url === 'string' ? raw.html_url :
            typeof raw.htmlUrl === 'string' ? raw.htmlUrl as string :
            typeof raw.url === 'string' ? raw.url :
            undefined;
        if (url) {
            entry.url = url;
        }
        const published =
            typeof raw.publishedAt === 'string' ? raw.publishedAt :
            typeof raw.published_at === 'string' ? raw.published_at as string :
            undefined;
        if (published) {
            entry.publishedAt = published;
        }
        return entry;
    }

    private loadEmbeddedReleaseNotes(): EmbeddedReleaseNotesBundle | null {
        try {
            const raw = typeof EMBEDDED_RELEASE_NOTES !== 'undefined' ? EMBEDDED_RELEASE_NOTES : '';
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed) return null;
            
            // New format: major, latest, patches
            if (parsed.major || parsed.latest || parsed.patches) {
                const major = this.normalizeReleaseEntry(parsed.major) ?? null;
                const latest = this.normalizeReleaseEntry(parsed.latest) ?? null;
                const patches = Array.isArray(parsed.patches)
                    ? (parsed.patches as unknown[])
                        .map((entry: unknown) => this.normalizeReleaseEntry(entry))
                        .filter((entry): entry is EmbeddedReleaseNotesEntry => entry !== null)
                    : undefined;
                return {
                    major,
                    latest,
                    patches,
                };
            }
            
            // Legacy format: featured, current (for backward compatibility)
            if (parsed.featured || parsed.current) {
                const major = this.normalizeReleaseEntry(parsed.featured) ?? null;
                const latest = this.normalizeReleaseEntry(parsed.current) ?? null;
                const patches = Array.isArray(parsed.patches)
                    ? (parsed.patches as unknown[])
                        .map((entry: unknown) => this.normalizeReleaseEntry(entry))
                        .filter((entry): entry is EmbeddedReleaseNotesEntry => entry !== null)
                    : undefined;
                return {
                    major,
                    latest,
                    patches,
                };
            }
            
            // Single entry format (fallback)
            if (parsed.version || parsed.body) {
                const entry = this.normalizeReleaseEntry(parsed);
                if (!entry) return null;
                return { major: entry, latest: entry };
            }
            
            return null;
        } catch (error) {
            console.error('Failed to parse embedded release notes:', error);
            return null;
        }
    }

    public getReleaseNotesBundle(): EmbeddedReleaseNotesBundle | null {
        return this.releaseNotesBundle;
    }

    public async markReleaseNotesSeen(version: string): Promise<void> {
        if (!version) return;
        if (this.settings.lastSeenReleaseNotesVersion === version) return;
        this.settings.lastSeenReleaseNotesVersion = version;
        await this.saveSettings();
    }

    public async maybeShowReleaseNotesModal(): Promise<void> {
        const bundle = this.releaseNotesBundle;
        if (!bundle) return;
        if (this.releaseModalShownThisSession) return;
        
        // Check against the latest version
        const latestVersion = bundle.latest?.version ?? bundle.major?.version;
        if (!latestVersion) return;
        
        const seenVersion = this.settings.lastSeenReleaseNotesVersion ?? '';
        if (latestVersion === seenVersion) return;
        
        // Only show modal automatically for major releases (x.0.0)
        const versionInfo = parseReleaseVersion(latestVersion);
        if (!versionInfo) return;
        if (versionInfo.minor !== 0 || versionInfo.patch !== 0) {
            // For patch releases, don't auto-show modal, but mark as seen
            this.settings.lastSeenReleaseNotesVersion = latestVersion;
            await this.saveSettings();
            return;
        }
        
        this.openReleaseNotesModal();
    }

    public openReleaseNotesModal(force: boolean = false): void {
        const bundle = this.releaseNotesBundle;
        if (!bundle) return;
        
        // Featured release is the major release (e.g., 3.0.0)
        const major = bundle.major ?? bundle.latest;
        if (!major) return;
        
        const patches = this.collectReleasePatches(bundle, major);
        if (this.releaseModalShownThisSession && !force) return;
        
        this.releaseModalShownThisSession = true;
        const modal = new ReleaseNotesModal(this.app, this, major, patches);
        modal.open();
    }

    private collectReleasePatches(bundle: EmbeddedReleaseNotesBundle, major: EmbeddedReleaseNotesEntry): EmbeddedReleaseNotesEntry[] {
        const seen = new Set<string>([major.version]);
        const patches: EmbeddedReleaseNotesEntry[] = [];
        const add = (entry: EmbeddedReleaseNotesEntry | null | undefined) => {
            if (!entry) return;
            if (seen.has(entry.version)) return;
            seen.add(entry.version);
            patches.push(entry);
        };

        // Add all patches from the bundle
        const patchSource: EmbeddedReleaseNotesEntry[] = Array.isArray(bundle.patches) ? bundle.patches : [];
        for (const entry of patchSource) {
            add(entry);
        }

        // Add latest if it's different from major
        add(bundle.latest);
        
        patches.sort((a, b) => compareReleaseVersionsDesc(a.version, b.version));
        return patches;
    }

    private mergeReleaseBundles(primary: EmbeddedReleaseNotesBundle | null, fallback: EmbeddedReleaseNotesBundle | null): EmbeddedReleaseNotesBundle | null {
        if (!primary && !fallback) return null;
        if (!primary) return fallback;
        if (!fallback) return primary;

        const merged: EmbeddedReleaseNotesBundle = {
            major: primary.major ?? fallback.major ?? null,
            latest: primary.latest ?? fallback.latest ?? null,
        };

        const patches: EmbeddedReleaseNotesEntry[] = [];
        const seen = new Set<string>();
        const add = (entry: EmbeddedReleaseNotesEntry | null | undefined) => {
            if (!entry) return;
            if (seen.has(entry.version)) return;
            seen.add(entry.version);
            patches.push(entry);
        };

        const sources: Array<EmbeddedReleaseNotesEntry[] | undefined> = [
            primary.patches,
            fallback.patches,
        ];

        for (const source of sources) {
            if (!Array.isArray(source)) continue;
            for (const entry of source) {
                add(entry);
            }
        }

        // Add latest entries if not already included
        add(primary.latest);
        add(fallback.latest);
        add(primary.major);
        add(fallback.major);

        if (patches.length > 0) {
            patches.sort((a, b) => compareReleaseVersionsDesc(a.version, b.version));
            merged.patches = patches;
        }

        return merged;
    }

    public async ensureReleaseNotesFresh(force: boolean): Promise<boolean> {
        if (!force && this.releaseNotesFetchPromise) {
            return this.releaseNotesFetchPromise;
        }
        const task = this.performReleaseNotesFetch(force).finally(() => {
            this.releaseNotesFetchPromise = null;
        });
        this.releaseNotesFetchPromise = task;
        return task;
    }

    private async performReleaseNotesFetch(force: boolean): Promise<boolean> {
        const now = Date.now();
        if (!force && this.settings.releaseNotesLastFetched) {
            const last = Date.parse(this.settings.releaseNotesLastFetched);
            if (!Number.isNaN(last) && now - last < 24 * 60 * 60 * 1000) {
                return false; // Fresh enough
            }
        }

        try {
            const bundle = await this.downloadReleaseNotesBundle();
            if (!bundle) {
                return false;
            }
            const embedded = this.loadEmbeddedReleaseNotes();
            const merged = this.mergeReleaseBundles(bundle, embedded);
            this.settings.cachedReleaseNotes = merged;
            this.settings.releaseNotesLastFetched = new Date(now).toISOString();
            await this.saveSettings();
            this.releaseNotesBundle = merged;
            return true;
        } catch (error) {
            console.error('Failed to refresh release notes from GitHub:', error);
            return false;
        }
    }

    private async downloadReleaseNotesBundle(): Promise<EmbeddedReleaseNotesBundle | null> {
        const latest = await this.fetchGitHubRelease('latest');
        if (!latest) {
            return null;
        }

        const semver = parseReleaseVersion(latest.version);
        let major: EmbeddedReleaseNotesEntry | null = latest;
        let patches: EmbeddedReleaseNotesEntry[] | undefined;

        if (semver) {
            if (semver.minor !== 0 || semver.patch !== 0) {
                const majorTag = `${semver.major}.0.0`;
                const majorRelease = await this.fetchGitHubRelease(majorTag);
                if (majorRelease) {
                    major = majorRelease;
                }
            }
            const fetchedPatches = await this.fetchGitHubPatchReleases(semver.major);
            if (fetchedPatches.length > 0) {
                const seen = new Set<string>([major?.version ?? '']);
                patches = [];
                for (const entry of fetchedPatches) {
                    if (!entry) continue;
                    if (seen.has(entry.version)) continue;
                    seen.add(entry.version);
                    patches.push(entry);
                }
            }
        }

        return {
            major,
            latest,
            patches,
        };
    }

    private async fetchGitHubRelease(tagOrLatest: 'latest' | string): Promise<EmbeddedReleaseNotesEntry | null> {
        const base = 'https://api.github.com/repos/EricRhysTaylor/Radial-Timeline';
        const url = tagOrLatest === 'latest'
            ? `${base}/releases/latest`
            : `${base}/releases/tags/${encodeURIComponent(tagOrLatest)}`;

        try {
            const response = await requestUrl({
                url,
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'RadialTimelinePlugin'
                }
            });

            if (response.status >= 400) {
                return null;
            }

            const data = JSON.parse(response.text ?? '{}');
            return this.normalizeReleaseEntry(data);
        } catch (error) {
            console.warn(`Unable to fetch release info for ${tagOrLatest}:`, error);
            return null;
        }
    }

    private async fetchGitHubPatchReleases(major: number): Promise<EmbeddedReleaseNotesEntry[]> {
        const base = 'https://api.github.com/repos/EricRhysTaylor/Radial-Timeline';
        try {
            const response = await requestUrl({
                url: `${base}/releases?per_page=100`,
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'User-Agent': 'RadialTimelinePlugin'
                }
            });

            if (response.status >= 400) {
                return [];
            }

            const payload = JSON.parse(response.text ?? '[]');
            if (!Array.isArray(payload)) return [];

            const patches: EmbeddedReleaseNotesEntry[] = [];
            const seen = new Set<string>();

            for (const raw of payload) {
                const entry = this.normalizeReleaseEntry(raw);
                if (!entry) continue;
                if (seen.has(entry.version)) continue;
                seen.add(entry.version);
                const info = parseReleaseVersion(entry.version);
                if (!info) continue;
                if (info.major !== major) continue;
                if (info.minor === 0 && info.patch === 0) continue;
                patches.push(entry);
            }

            patches.sort((a, b) => compareReleaseVersionsDesc(a.version, b.version));
            return patches;
        } catch (error) {
            console.warn(`Unable to fetch release list for major ${major}:`, error);
            return [];
        }
    }

    async onload() {
        await this.loadSettings();
        const embeddedBundle = this.loadEmbeddedReleaseNotes();
        const cachedBundle = this.settings.cachedReleaseNotes ?? null;
        this.releaseNotesBundle = this.mergeReleaseBundles(cachedBundle, embeddedBundle);
        this.releaseModalShownThisSession = false;
        void this.ensureReleaseNotesFresh(false);

        // Migration: Convert old field names to new field names
        await migrateSceneAnalysisFields(this);

        // Load embedded fonts (no external requests per Obsidian guidelines)
        // Embedded font injection removed to avoid inserting <style> tags at runtime.
        // All styles should live in styles.css so Obsidian can manage load/unload.

        // Initialize services and managers
        this.timelineService = new TimelineService(this.app);
        const { SearchService } = await import('./services/SearchService');
        const { FileTrackingService } = await import('./services/FileTrackingService');
        this.searchService = new SearchService(this.app, this);
        this.fileTrackingService = new FileTrackingService(this);
        this.rendererService = new RendererService(this.app);
        this.synopsisManager = new SynopsisManager(this);

        // CSS variables for publish stage colors are set once on layout ready
        
        // Register the view
        this.registerView(
            TIMELINE_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => {
                this.log('Creating new RadialTimelineView');
                return new RadialTimelineView(leaf, this);
            }
        );
        
        // Add ribbon icon
        this.addRibbonIcon('shell', 'Radial timeline', () => {
            this.activateView();
        });

        // Add commands (ordered for command palette)
        
        // 1. Search timeline
        this.addCommand({
            id: 'search-timeline',
            name: 'Search timeline',
            callback: () => {
                this.openSearchPrompt();
            }
        });

        // 2. Clear search
        this.addCommand({
            id: 'clear-timeline-search',
            name: 'Clear search',
            callback: () => {
                this.clearSearch();
            }
        });

        // Gossamer enter momentum scores (manual entry)
        this.addCommand({
            id: 'gossamer-enter-scores',
            name: 'Gossamer enter momentum scores',
            callback: async () => {
                try {
                    await openGossamerScoreEntry(this);
                } catch (e) {
                    new Notice('Failed to open Gossamer score entry.');
                    console.error(e);
                }
            }
        });

        // Generate manuscript file
        this.addCommand({
            id: 'gossamer-generate-manuscript',
            name: 'Generate manuscript',
            callback: async () => {
                try {
                    new Notice('Assembling manuscript...');
                    
                    // Get sorted scene files (single source of truth)
                    const { getSortedSceneFiles } = await import('./utils/manuscript');
                    const { files: sceneFiles, sortOrder } = await getSortedSceneFiles(this);
                    
                    if (sceneFiles.length === 0) {
                        new Notice('No scenes found in source path.');
                        return;
                    }
                    
                    // Assemble manuscript with Obsidian-style clickable links
                    const manuscript = await assembleManuscript(sceneFiles, this.app.vault, undefined, true, sortOrder);
                    
                    if (!manuscript.text || manuscript.text.trim().length === 0) {
                        new Notice('Manuscript is empty. Check that your scene files have content.');
                        return;
                    }
                    
                    // Save to AI folder - use friendly local timestamp
                    const now = new Date();
                    const dateStr = now.toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                    });
                    const timeStr = now.toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                        hour12: true
                    }).replace(/:/g, '.'); // Replace colon with period for valid filename
                    
                    const manuscriptPath = `AI/Manuscript ${dateStr} ${timeStr} PTD.md`;
                    
                    try {
                        await this.app.vault.createFolder('AI');
                    } catch (e) {
                        // Folder might already exist - ignore error
                    }
                    
                    // Check if file already exists (shouldn't happen with timestamp, but just in case)
                    const existing = this.app.vault.getAbstractFileByPath(manuscriptPath);
                    if (existing) {
                        new Notice(`File ${manuscriptPath} already exists. Try again in a moment.`);
                        return;
                    }
                    
                    // Create the file
                    const createdFile = await this.app.vault.create(manuscriptPath, manuscript.text);
                    
                    // Open the file in a new tab
                    const leaf = this.app.workspace.getLeaf('tab');
                    await leaf.openFile(createdFile);
                    
                    new Notice(`Manuscript generated: ${manuscript.totalScenes} scenes, ${manuscript.totalWords.toLocaleString()} words. Saved to ${manuscriptPath}`);
                } catch (e) {
                    const errorMsg = (e as Error)?.message || 'Unknown error';
                    new Notice(`Failed to generate manuscript: ${errorMsg}`);
                    console.error(e);
                }
            }
        });

        // ===================================================================
        // GOSSAMER AI ANALYSIS - DORMANT
        // The AI analysis feature is temporarily disabled while under development.
        // Manual score entry remains available. To re-enable AI analysis, uncomment below.
        // ===================================================================
        
        // 4c. Gemini AI Gossamer analysis (DORMANT)
        // this.addCommand({
        //     id: 'gossamer-ai-analysis',
        //     name: 'Gossamer AI momentum analysis (Gemini)',
        //     checkCallback: (checking: boolean) => {
        //         if (!this.settings.enableAiSceneAnalysis) return false; // hide when AI features disabled
        //         if (checking) return true;
        //         (async () => {
        //             try {
        //                 await runGossamerAiAnalysis(this);
        //             } catch (e) {
        //                 const errorMsg = (e as Error)?.message || 'Unknown error';
        //                 new Notice(`Failed to run Gossamer AI analysis: ${errorMsg}`);
        //                 console.error(e);
        //             }
        //         })();
        //         return true;
        //     }
        // });

        // Add settings tab (only once)
        if (!this._settingsTabAdded) {
            this.addSettingTab(new RadialTimelineSettingsTab(this.app, this));
            this._settingsTabAdded = true;
        }
        
        // Note: Frontmatter change detection is handled by the TimelineView with proper debouncing
        // No metadata listener needed here to avoid triggering on body text changes
        
        // Listen for tab changes and file manager interactions using Obsidian's events
        // This is more reliable than DOM events
        // (file-open listener consolidated below at line ~941)
        
        // Track file explorer hover using DOM events since Obsidian doesn't have specific events for this
        this.registerDomEvent(document, 'mouseover', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const fileItem = target.closest('.nav-file-title');
            if (fileItem) {
                const navFile = fileItem.closest('.nav-file');
                if (navFile) {
                    const filePath = navFile.getAttribute('data-path');
                    if (filePath) {

                        
                        // Store current hover path to avoid redundant processing
                        if (this._currentHoverPath === filePath) {

                            return;
                        }
                        this._currentHoverPath = filePath;
                        
                        // Only highlight if the file exists in the vault
                        const file = this.app.vault.getAbstractFileByPath(filePath);
                        if (file instanceof TFile) {
                            // Check if this is a scene file by looking at cached scene data
                            const isSceneFile = this.isSceneFile(filePath);

                            
                            if (isSceneFile) {
                                this.log(`Hovering over scene file: ${filePath}`);
                                this.highlightSceneInTimeline(filePath, true);
                            }
                        } else {
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

                    const leaf = this.app.workspace.getLeafById(tabId);
                    if (leaf) {
                        const state = leaf.getViewState();
                        const filePath = state?.state?.file as string | undefined;
                        if (filePath && state?.type === 'markdown') {
                            
                            // Avoid redundant processing
                            if (this._currentTabHoverPath === filePath) {
                                return;
                            }
                            this._currentTabHoverPath = filePath;
                            
                            // Only highlight if it's a scene file
                            const isSceneFile = this.isSceneFile(filePath);
                            
                            if (isSceneFile) {
                                this.highlightSceneInTimeline(filePath, true);
                            }
                        } else {
                        }
                    } else {
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
        // (layout-change listener consolidated below at line ~949)

        // Helper: Get active AI model name for display
        const getActiveModelName = (): string => {
            const provider = this.settings.defaultAiProvider || 'openai';
            let modelName = 'Unknown';
            
            if (provider === 'anthropic') {
                const modelId = this.settings.anthropicModelId || 'claude-sonnet-4-20250514';
                if (modelId.includes('sonnet-4-5') || modelId.includes('sonnet-4.5')) modelName = 'Claude Sonnet 4.5';
                else if (modelId.includes('opus-4-1') || modelId.includes('opus-4.1')) modelName = 'Claude Opus 4.1';
                else if (modelId.includes('opus-4')) modelName = 'Claude Opus 4';
                else if (modelId.includes('sonnet-4')) modelName = 'Claude Sonnet 4';
                else modelName = modelId;
            } else if (provider === 'gemini') {
                const modelId = this.settings.geminiModelId || 'gemini-2.5-pro';
                if (modelId.includes('2.5-pro') || modelId.includes('2-5-pro')) modelName = 'Gemini 2.5 Pro';
                else if (modelId.includes('2.0-pro') || modelId.includes('2-0-pro')) modelName = 'Gemini 2.0 Pro';
                else modelName = modelId;
            } else if (provider === 'openai') {
                const modelId = this.settings.openaiModelId || 'gpt-4o';
                if (modelId.includes('4.1') || modelId.includes('4-1')) modelName = 'GPT-4.1';
                else if (modelId.includes('4o')) modelName = 'GPT-4o';
                else if (modelId.includes('o1')) modelName = 'GPT-o1';
                else modelName = modelId;
            }
            
            return modelName;
        };

        // Helper: Count processable scenes (Working or Complete status) and flagged scenes (Beats Update = True)
        const countProcessableScenes = async (subplotName?: string): Promise<{ flagged: number; processable: number; total: number }> => {
            try {
                // For subplot counting, use a more efficient approach that doesn't load all scene data
                if (subplotName) {
                    // Use the same efficient method as the beats processing
                    const allScenes = await this.getSceneData();
                    const filtered = allScenes.filter(scene => {
                        const subplots = scene.subplot ? 
                            (Array.isArray(scene.subplot) ? scene.subplot : [scene.subplot]) : [];
                        return subplots.includes(subplotName);
                    });
                    
                    const validScenes = filtered.filter(scene => {
                        const beatsUpdate = scene["Beats Update"];
                        const statusValue = Array.isArray(scene.status) ? scene.status[0] : scene.status;
                        return (statusValue === 'Working' || statusValue === 'Complete') && 
                               normalizeBooleanValue(beatsUpdate);
                    });
                    
                    const processableScenes = filtered.filter(scene => {
                        const statusValue = Array.isArray(scene.status) ? scene.status[0] : scene.status;
                        return statusValue === 'Working' || statusValue === 'Complete';
                    });
                    
                    return {
                        flagged: validScenes.length,
                        processable: processableScenes.length,
                        total: filtered.length
                    };
                } else {
                    // For manuscript order, use the original approach
                    const allScenes = await this.getSceneData();
                    
                    // Normalize boolean value (handle Yes/True/1/true)
                    const normalizeBool = (val: unknown): boolean => {
                        if (typeof val === 'boolean') return val;
                        if (typeof val === 'number') return val !== 0;
                        if (typeof val === 'string') {
                            const lower = val.toLowerCase().trim();
                            return lower === 'yes' || lower === 'true' || lower === '1';
                        }
                        return false;
                    };
                    
                    // Count scenes with processable content (Working or Complete status)
                    const processableScenes = allScenes.filter(scene => {
                        const statusValue = Array.isArray(scene.status) ? scene.status[0] : scene.status;
                        return statusValue === 'Working' || statusValue === 'Complete';
                    });
                    
                    // Count scenes that are both processable AND flagged for beats processing
                    const flaggedCount = processableScenes.filter(scene => {
                        return normalizeBool(scene["Beats Update"]);
                    }).length;
                    
                    return {
                        flagged: flaggedCount,
                        processable: processableScenes.length,
                        total: allScenes.length
                    };
                }
            } catch (error) {
                return { flagged: 0, processable: 0, total: 0 };
            }
        };

        // 5. Scene Analysis (manuscript order)
        this.addCommand({
            id: 'update-beats-manuscript-order',
            name: 'Scene Analysis (manuscript order)',
            checkCallback: (checking: boolean) => {
                if (!this.settings.enableAiSceneAnalysis) return false; // hide when disabled
                if (checking) return true;
                (async () => {
                // If there's already an active processing modal, just reopen it
                if (this.activeBeatsModal && this.activeBeatsModal.isProcessing) {
                    this.activeBeatsModal.open();
                    return;
                }
                
                const provider = this.settings.defaultAiProvider || 'openai';
                let hasKey = true;
                if (provider === 'anthropic') {
                    hasKey = !!this.settings.anthropicApiKey?.trim();
                    if (!hasKey) { new Notice('Anthropic API key is not set in settings.'); return; }
                } else if (provider === 'gemini') {
                    hasKey = !!this.settings.geminiApiKey?.trim();
                    if (!hasKey) { new Notice('Gemini API key is not set in settings.'); return; }
                } else {
                    hasKey = !!this.settings.openaiApiKey?.trim();
                    if (!hasKey) { new Notice('OpenAI API key is not set in settings.'); return; }
                }

                try {
                     await processByManuscriptOrder(this, this.app.vault);
                } catch (error) {
                    console.error("Error running manuscript order beat update:", error);
                    new Notice("Error during manuscript order update.");
                }
                })();
                return true;
            }
        });

        // 6. Scene Analysis (subplot)
        this.addCommand({
            id: 'update-beats-choose-subplot',
            name: 'Scene Analysis (subplot order)',
            checkCallback: (checking: boolean) => {
                if (!this.settings.enableAiSceneAnalysis) return false;
                if (checking) return true;
                (async () => {
                    // Simple provider key check like other commands
                    const provider = this.settings.defaultAiProvider || 'openai';
                    let hasKey = true;
                    if (provider === 'anthropic') hasKey = !!this.settings.anthropicApiKey?.trim();
                    else if (provider === 'gemini') hasKey = !!this.settings.geminiApiKey?.trim();
                    else hasKey = !!this.settings.openaiApiKey?.trim();
                    if (!hasKey) { new Notice(`${provider[0].toUpperCase()+provider.slice(1)} API key is not set in settings.`); return; }

                    // Create a modal for subplot selection with action buttons
                    class SubplotPickerModal extends Modal {
                        plugin: RadialTimelinePlugin;
                        choices: string[] = [];
                        selectedSubplot: string = '';
                        statsEl: HTMLElement | null = null;
                        dropdown: DropdownComponent | null = null;
                        buttonRow: HTMLElement | null = null;
                        
                        constructor(app: App, plugin: RadialTimelinePlugin) {
                            super(app);
                            this.plugin = plugin;
                        }
                        
                        async updateStats(subplotName: string): Promise<void> {
                            if (!this.statsEl) return;
                            
                            try {
                                const stats = await countProcessableScenes(subplotName);
                                this.statsEl.setText(`${stats.flagged} scene${stats.flagged !== 1 ? 's' : ''} will be processed (${stats.processable} processable, ${stats.total} total)`);
                            } catch (error) {
                                this.statsEl.setText('Unable to calculate scene count');
                            }
                        }
                        
                        async onOpen(): Promise<void> {
                            const { contentEl, titleEl } = this;
                            titleEl.setText('Select subplot for beats processing');
                            
                            // Get model name using common helper
                            const modelName = getActiveModelName();
                            
                            const infoEl = contentEl.createDiv({ cls: 'rt-subplot-picker-info' });
                            infoEl.createEl('p', { text: `Process beats using ${modelName}` });
                            
                            // Dropdown for subplot selection with better spacing
                            const selectContainer = contentEl.createDiv({ cls: 'rt-subplot-picker-select' });
                            selectContainer.createEl('label', { text: 'Select subplot:', cls: 'rt-subplot-picker-label' });
                            this.dropdown = new DropdownComponent(selectContainer);
                            this.dropdown.addOption('', 'Loading subplots...');
                            this.dropdown.setDisabled(true);
                            
                            // Stats display
                            this.statsEl = contentEl.createDiv({ cls: 'rt-subplot-picker-stats' });
                            this.statsEl.setText('Loading...');
                            
                            // Action buttons
                            this.buttonRow = contentEl.createDiv({ cls: 'rt-beats-actions' });
                            
                            const processButton = new ButtonComponent(this.buttonRow)
                                .setButtonText('Process beats')
                                .setCta()
                                .setDisabled(true)
                                .onClick(async () => {
                                    this.close();
                                    await processBySubplotNameWithModal(this.plugin, this.plugin.app.vault, this.selectedSubplot);
                                });
                            
                            const processEntireButton = new ButtonComponent(this.buttonRow)
                                .setButtonText('Process entire subplot')
                                .setCta()
                                .setDisabled(true)
                                .onClick(async () => {
                                    this.close();
                                    await processEntireSubplotWithModal(this.plugin, this.plugin.app.vault, this.selectedSubplot);
                                });
                            
                            const purgeButton = new ButtonComponent(this.buttonRow)
                                .setButtonText('Purge all beats')
                                .setWarning()
                                .setDisabled(true)
                                .onClick(async () => {
                                    try {
                                        const { purgeBeatsBySubplotName } = await import('./SceneAnalysisCommands');
                                        this.close();
                                        await purgeBeatsBySubplotName(this.plugin, this.plugin.app.vault, this.selectedSubplot);
                                    } catch (error) {
                                        new Notice(`Error: ${error instanceof Error ? error.message : String(error)}`);
                                    }
                                });
                            
                            new ButtonComponent(this.buttonRow)
                                .setButtonText('Cancel')
                                .onClick(() => this.close());
                            
                            // Load subplots asynchronously after modal is shown
                            try {
                                const names = await getDistinctSubplotNames(this.plugin, this.plugin.app.vault);
                                if (names.length === 0) {
                                    new Notice('No subplots found.');
                                    this.close();
                                    return;
                                }
                                
                                this.choices = names;
                                this.selectedSubplot = names[0];
                                
                                // Update dropdown with actual subplot names
                                if (this.dropdown) {
                                    // Clear loading option
                                    this.dropdown.selectEl.empty();
                                    
                                    // Add actual subplots
                                    names.forEach((name, index) => {
                                        this.dropdown?.addOption(name, `${index + 1}. ${name}`);
                                    });
                                    
                                    this.dropdown.setValue(this.selectedSubplot);
                                    this.dropdown.setDisabled(false);
                                    this.dropdown.onChange(async (value) => {
                                        this.selectedSubplot = value;
                                        await this.updateStats(value);
                                    });
                                }
                                
                                // Enable buttons
                                processButton.setDisabled(false);
                                processEntireButton.setDisabled(false);
                                purgeButton.setDisabled(false);
                                
                                // Update stats for initial selection
                                await this.updateStats(this.selectedSubplot);
                            } catch (error) {
                                new Notice(`Error loading subplots: ${error instanceof Error ? error.message : String(error)}`);
                                this.close();
                            }
                        }
                    }

                    new SubplotPickerModal(this.app, this).open();
                })();
                return true;
            }
        });

        // 7. Create template note
        this.addCommand({
            id: 'create-template-scene',
            name: 'Create template note',
            callback: async () => {
                await createTemplateScene(this, this.app.vault);
            }
        });

        // 8. Open
        this.addCommand({
            id: 'open-timeline-view',
            name: 'Open',
            callback: () => {
                this.activateView();
            }
        });

        this.app.workspace.onLayoutReady(() => {
            this.setCSSColorVariables(); // Set initial colors
            this.fileTrackingService.updateOpenFilesTracking(); // Track initially open files
        });

         // Register file open/close events (consolidated from duplicate listener above)
        this.registerEvent(this.app.workspace.on('file-open', (file) => {
            if (file) {
                this.log('File opened: ' + file.path);
                
                // Clear highlight from previously opened file
                if (this._lastHighlightedFile && this._lastHighlightedFile !== file.path) {
                    this.highlightSceneInTimeline(this._lastHighlightedFile, false);
                }
                
                // Highlight newly opened file
                this.highlightSceneInTimeline(file.path, true);
                this._lastHighlightedFile = file.path;
                
                // Check if the opened file is within the sourcePath
                if (this.isSceneFile(file.path)) {
                    this.openScenePaths.add(file.path);
                    this.refreshTimelineIfNeeded(null);
                } 
            } else {
                // Handle case where no file is open (e.g., closing the last tab)
                // Potentially clear highlights or update state
            }
        }));

        this.registerEvent(this.app.workspace.on('layout-change', () => {
            this.fileTrackingService.updateOpenFilesTracking();
            this.refreshTimelineIfNeeded(null);
        }));

        // Listen for deletions and renames only (metadata changes handled by view with debouncing)
        // Removed 'modify' listener as it triggers on every keystroke
        this.registerEvent(this.app.vault.on('delete', (file) => this.refreshTimelineIfNeeded(file)));
        this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.handleFileRename(file, oldPath)));

        // Theme change listener
        this.registerEvent(this.app.workspace.on('css-change', () => {
            this.setCSSColorVariables();
            // Prefer selective refresh for lightweight UI changes
            try {
                const views = this.getTimelineViews();
                views.forEach(v => {
                    const svg = (v as unknown as { containerEl?: HTMLElement })?.containerEl?.querySelector?.('.radial-timeline-svg');
                    if (svg) {
                        this.rendererService.updateProgressAndTicks(v as any);
                        if ((v as any).currentMode === 'gossamer') {
                            this.rendererService.updateGossamerLayer(v as any);
                        }
                    }
                });
            } catch {
                this.refreshTimelineIfNeeded(null);
            }
        }));

         // Setup hover listeners
        this.setupHoverListeners();

        // Initial status bar update
        this.updateStatusBar();
    }
    public getRendererService(): RendererService { return this.rendererService; }
    
    // Store paths of current hover interactions to avoid redundant processing
    private _currentHoverPath: string | null = null;
    private _currentTabHoverPath: string | null = null;
    private _lastHighlightedFile: string | null = null;
    
    // Helper method to check if a file is a scene in the timeline
    private isSceneFile(filePath: string): boolean {
        const views = this.getTimelineViews();
        if (views.length === 0) return false;

        try {
            // Check each view until a match is found
            for (const view of views) {
                const scenes = (view as any)['sceneData'] || [];

                if (scenes.length > 0) {
                    const matchingScene = scenes.find((scene: Scene) => {
                        if (!scene.path) return false;
                        if (scene.path === filePath) return true;
                        if (scene.path.startsWith('/') && scene.path.substring(1) === filePath) return true;
                        if (!scene.path.startsWith('/') && '/' + scene.path === filePath) return true;
                        return false;
                    });
                    if (matchingScene) return true;
                } else {
                    // Fallback to DOM lookup when scene cache isn't populated yet
                    const container = view.contentEl.querySelector('.radial-timeline-container');
                    if (!container) continue;
                    const svgElement = container.querySelector('svg') as SVGSVGElement | null;
                    if (!svgElement) continue;

                    let encodedPath = encodeURIComponent(filePath);
                    let sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);
                    if (!sceneGroup && filePath.startsWith('/')) {
                        const altPath = filePath.substring(1);
                        encodedPath = encodeURIComponent(altPath);
                        sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);
                    } else if (!sceneGroup && !filePath.startsWith('/')) {
                        const altPath = '/' + filePath;
                        encodedPath = encodeURIComponent(altPath);
                        sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);
                    }
                    if (sceneGroup) return true;
                }
            }

            return false;
        } catch (error) {
            this.log(`Error checking if file is a scene: ${error}`);
            return false;
        }
    }
    
    // Helper method to highlight a scene in the timeline when hovering over a file
    private highlightSceneInTimeline(filePath: string, isHighlighting: boolean): void {
        if (!filePath) return;

        const views = this.getTimelineViews();
        if (views.length === 0) return;

        this.log(`${isHighlighting ? 'Highlighting' : 'Unhighlighting'} scene in timeline for file: ${filePath}`);

        for (const view of views) {
            try {
                const container = view.contentEl.querySelector('.radial-timeline-container');
                if (!container) continue;

                const svgElement = container.querySelector('svg') as SVGSVGElement | null;
                if (!svgElement) continue;

                if (isHighlighting) {
                    const allElements = svgElement.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title');
                    allElements.forEach(element => {
                        element.classList.remove('rt-selected', 'rt-non-selected');
                    });
                }

                let foundScene = false;
                let encodedPath = encodeURIComponent(filePath);
                let sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);

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
                        const currentPath = sceneGroup.querySelector('.rt-scene-path');
                        if (currentPath) {
                            currentPath.classList.add('rt-selected');

                            const sceneId = (currentPath as SVGPathElement).id;
                            const numberSquare = svgElement.querySelector(`.rt-number-square[data-scene-id="${sceneId}"]`);
                            const numberText = svgElement.querySelector(`.rt-number-text[data-scene-id="${sceneId}"]`);

                            if (numberSquare) numberSquare.classList.add('rt-selected');
                            if (numberText) numberText.classList.add('rt-selected');

                            const sceneTitle = sceneGroup.querySelector('.rt-scene-title');
                            if (sceneTitle) sceneTitle.classList.add('rt-selected');

                            const allScenePaths = svgElement.querySelectorAll('.rt-scene-path:not(.rt-selected)');
                            allScenePaths.forEach(element => element.classList.add('rt-non-selected'));

                            const synopsis = svgElement.querySelector(`.rt-scene-info[data-for-scene="${sceneId}"]`);
                            if (synopsis) synopsis.classList.add('rt-visible');
                        }
                    } else {
                        const allElements = svgElement.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title');
                        allElements.forEach(element => element.classList.remove('selected', 'non-selected'));

                        const currentPath = sceneGroup.querySelector('.rt-scene-path');
                        if (currentPath) {
                            const sceneId = (currentPath as SVGPathElement).id;
                            const synopsis = svgElement.querySelector(`.rt-scene-info[data-for-scene="${sceneId}"]`);
                            if (synopsis) synopsis.classList.remove('rt-visible');
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
    async getSceneData(options?: GetSceneDataOptions): Promise<Scene[]> {
        const filterBeats = options?.filterBeatsBySystem ?? true;

        // Find markdown files in vault that match the filters
        const files = this.app.vault.getMarkdownFiles().filter((file: TFile) => {
            // If sourcePath is empty, include all files, otherwise only include files in the sourcePath
            if (this.settings.sourcePath) {
                return file.path.startsWith(this.settings.sourcePath);
            }
            return true;
        });

        const scenes: Scene[] = [];
        const plotsToProcess: Array<{file: TFile, metadata: Record<string, unknown>, validActNumber: number}> = [];
    
        for (const file of files) {
            try {
            const rawMetadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
                const metadata = rawMetadata ? normalizeFrontmatterKeys(rawMetadata) : undefined;
                
                if (metadata && metadata.Class === "Scene") {
                // Parse the When field using the centralized parser (single source of truth)
                const whenStr = metadata.When;
                
                let when: Date | undefined;
                if (typeof whenStr === 'string') {
                    const parsed = parseWhenField(whenStr);
                    if (parsed) {
                        when = parsed;
                    }
                } else if (whenStr instanceof Date) {
                    // Already a Date object
                    when = whenStr;
                }
                
                if (when && !isNaN(when.getTime())) {
                    // Split subplots if provided, otherwise default to "Main Plot"
                    const subplots = metadata.Subplot
                        ? Array.isArray(metadata.Subplot) 
                            ? metadata.Subplot 
                            : [metadata.Subplot]
                        : ["Main Plot"];
                    
                    // Read actNumber from metadata, default to 1 if missing or empty
                    const actValue = metadata.Act;
                    const actNumber = (actValue !== undefined && actValue !== null && actValue !== '') ? Number(actValue) : 1;
    
                    // Ensure actNumber is a valid number between 1 and 3
                    const validActNumber = (actNumber >= 1 && actNumber <= 3) ? actNumber : 1;
    
                    // Parse Character metadata - it might be a string or array
                    let characterList: string[] = [];
                    const characterData = metadata.Character;
                    if (characterData) {
                        // Convert to array if it's a string
                        if (Array.isArray(characterData)) {
                            characterList = characterData.map((char: unknown) => String(char).replace(/[\[\]]/g, ''));
                        } else {
                            characterList = [String(characterData).replace(/[\[\]]/g, '')];
                        }
                    }
    
                    // Extract scene number from filename (e.g., "52 Escaping Earth.md" → 52)
                    const sceneNumberMatch = file.name.match(/^(\d+(\.\d+)?)/);
                    const sceneNumber = sceneNumberMatch ? parseFloat(sceneNumberMatch[1]) : undefined;
    
                    // Create a separate entry for each subplot
                    subplots.forEach(subplot => {
                        if (when) { // Guard clause for type safety
                            scenes.push({
                                title: (typeof metadata.Title === 'string' ? metadata.Title : file.basename),
                                    date: when.toISOString(),
                                    path: file.path,
                                subplot: subplot,
                                    act: validActNumber.toString(),
                                    pov: (typeof metadata.POV === 'string' ? metadata.POV : undefined),
                                    location: (typeof metadata.Location === 'string' ? metadata.Location : undefined),
                                    number: sceneNumber,
                                    synopsis: (typeof metadata.Synopsis === 'string' ? metadata.Synopsis : undefined),
                                    when: when,
                                actNumber: validActNumber,
                                    Character: characterList,
                                    status: (typeof metadata.Status === 'string' || Array.isArray(metadata.Status) ? metadata.Status as string | string[] : undefined),
                                    "Publish Stage": (typeof metadata["Publish Stage"] === 'string' ? metadata["Publish Stage"] : undefined),
                                    due: (typeof metadata.Due === 'string' ? metadata.Due : undefined),
                                    pendingEdits: (typeof metadata["Pending Edits"] === 'string' ? metadata["Pending Edits"] : undefined),
                                    Book: (typeof metadata.Book === 'string' ? metadata.Book : undefined),
                                    Duration: (typeof metadata.Duration === 'string' ? metadata.Duration : undefined),
                                // Only process AI scene analysis fields if AI features are enabled (performance optimization)
                                "previousSceneAnalysis": this.settings.enableAiSceneAnalysis ? (typeof metadata["previousSceneAnalysis"] === 'string' ? metadata["previousSceneAnalysis"] : (Array.isArray(metadata["previousSceneAnalysis"]) ? metadata["previousSceneAnalysis"].join('\n') : (metadata["previousSceneAnalysis"] ? String(metadata["previousSceneAnalysis"]) : undefined))) : undefined,
                                "currentSceneAnalysis": this.settings.enableAiSceneAnalysis ? (typeof metadata["currentSceneAnalysis"] === 'string' ? metadata["currentSceneAnalysis"] : (Array.isArray(metadata["currentSceneAnalysis"]) ? metadata["currentSceneAnalysis"].join('\n') : (metadata["currentSceneAnalysis"] ? String(metadata["currentSceneAnalysis"]) : undefined))) : undefined,
                                "nextSceneAnalysis": this.settings.enableAiSceneAnalysis ? (typeof metadata["nextSceneAnalysis"] === 'string' ? metadata["nextSceneAnalysis"] : (Array.isArray(metadata["nextSceneAnalysis"]) ? metadata["nextSceneAnalysis"].join('\n') : (metadata["nextSceneAnalysis"] ? String(metadata["nextSceneAnalysis"]) : undefined))) : undefined,
                                "Beats Update": (typeof metadata["Beats Update"] === 'boolean' || typeof metadata["Beats Update"] === 'string') ? metadata["Beats Update"] as (boolean | string) : undefined,
                                itemType: "Scene"
                            });
                        }
                    });
                }
            }
                
            // Store story beat notes for processing after we know all subplots
            // Supports both "Class: Plot" (legacy) and "Class: Beat" (recommended)
            if (metadata && isStoryBeat(metadata.Class)) {
                // Read actNumber from metadata, default to 1 if missing or empty
                const actValue = metadata.Act;
                const actNumber = (actValue !== undefined && actValue !== null && actValue !== '') ? Number(actValue) : 1;
                const validActNumber = (actNumber >= 1 && actNumber <= 3) ? actNumber : 1;
                
                plotsToProcess.push({
                    file: file,
                    metadata: metadata,
                    validActNumber: validActNumber
                });
            }
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
        }
        }

        // Process Beat notes - create ONE entry per beat note (not duplicated per subplot)
        // Beat notes are shown only in the outer ring and are not subplot-specific
        plotsToProcess.forEach(plotInfo => {
            const beatModel = (plotInfo.metadata["Beat Model"] as string) || undefined;
            
            if (filterBeats) {
                // Filter beat notes based on selected story structure system
                const selectedSystem = this.settings.beatSystem || 'Custom';
                
                // If Custom is selected, only show beats that DON'T have a recognized Beat Model
                if (selectedSystem === 'Custom') {
                    const recognizedSystems = ['Save The Cat', 'Hero\'s Journey', 'Story Grid'];
                    if (beatModel && recognizedSystems.includes(beatModel)) {
                        // Skip beats that belong to recognized systems when Custom is selected
                        return;
                    }
                } else {
                    // For specific systems, only show beats that match the selected system
                    if (beatModel !== selectedSystem) {
                        // Skip beats that don't match the selected system
                        return;
                    }
                }
            }
            
            const gossamer1Value = typeof plotInfo.metadata.Gossamer1 === 'number' ? plotInfo.metadata.Gossamer1 : undefined;
            const rangeValue = typeof plotInfo.metadata.Range === 'string' ? plotInfo.metadata.Range : undefined;
            const suggestPlacementValue = typeof plotInfo.metadata["Suggest Placement"] === 'string' ? plotInfo.metadata["Suggest Placement"] : undefined;
            
            // Parse When field for beats (same logic as scenes)
            const whenStr = plotInfo.metadata.When;
            let beatWhen: Date | undefined;
            if (whenStr) {
                // Handle case where When might already be a Date object (from Obsidian)
                if (whenStr instanceof Date) {
                    beatWhen = whenStr;
                } else if (typeof whenStr === 'string' && whenStr.trim() !== '') {
                    const parsed = parseWhenField(whenStr);
                    beatWhen = parsed || undefined;
                }
            }
            
            scenes.push({
                title: plotInfo.file.basename,
                date: beatWhen ? beatWhen.toISOString() : "1900-01-01T12:00:00Z", // Use When field or dummy date
                path: plotInfo.file.path,
                subplot: undefined, // Beat notes are not associated with any specific subplot
                act: plotInfo.validActNumber.toString(),
                actNumber: plotInfo.validActNumber,
                when: beatWhen, // Add when field for chronological sorting
                itemType: "Plot",
                Description: (plotInfo.metadata.Description as string) || '',
                "Beat Model": beatModel,
                "Publish Stage": (plotInfo.metadata["Publish Stage"] as string) || undefined,
                Range: rangeValue,
                "Suggest Placement": suggestPlacementValue,
                Gossamer1: gossamer1Value,
                Gossamer2: typeof plotInfo.metadata.Gossamer2 === 'number' ? plotInfo.metadata.Gossamer2 : undefined,
                Gossamer3: typeof plotInfo.metadata.Gossamer3 === 'number' ? plotInfo.metadata.Gossamer3 : undefined,
                Gossamer4: typeof plotInfo.metadata.Gossamer4 === 'number' ? plotInfo.metadata.Gossamer4 : undefined,
                Gossamer5: typeof plotInfo.metadata.Gossamer5 === 'number' ? plotInfo.metadata.Gossamer5 : undefined,
                Gossamer6: typeof plotInfo.metadata.Gossamer6 === 'number' ? plotInfo.metadata.Gossamer6 : undefined,
                Gossamer7: typeof plotInfo.metadata.Gossamer7 === 'number' ? plotInfo.metadata.Gossamer7 : undefined,
                Gossamer8: typeof plotInfo.metadata.Gossamer8 === 'number' ? plotInfo.metadata.Gossamer8 : undefined,
                Gossamer9: typeof plotInfo.metadata.Gossamer9 === 'number' ? plotInfo.metadata.Gossamer9 : undefined,
                Gossamer10: typeof plotInfo.metadata.Gossamer10 === 'number' ? plotInfo.metadata.Gossamer10 : undefined,
                Gossamer11: typeof plotInfo.metadata.Gossamer11 === 'number' ? plotInfo.metadata.Gossamer11 : undefined,
                Gossamer12: typeof plotInfo.metadata.Gossamer12 === 'number' ? plotInfo.metadata.Gossamer12 : undefined,
                Gossamer13: typeof plotInfo.metadata.Gossamer13 === 'number' ? plotInfo.metadata.Gossamer13 : undefined,
                Gossamer14: typeof plotInfo.metadata.Gossamer14 === 'number' ? plotInfo.metadata.Gossamer14 : undefined,
                Gossamer15: typeof plotInfo.metadata.Gossamer15 === 'number' ? plotInfo.metadata.Gossamer15 : undefined,
                Gossamer16: typeof plotInfo.metadata.Gossamer16 === 'number' ? plotInfo.metadata.Gossamer16 : undefined,
                Gossamer17: typeof plotInfo.metadata.Gossamer17 === 'number' ? plotInfo.metadata.Gossamer17 : undefined,
                Gossamer18: typeof plotInfo.metadata.Gossamer18 === 'number' ? plotInfo.metadata.Gossamer18 : undefined,
                Gossamer19: typeof plotInfo.metadata.Gossamer19 === 'number' ? plotInfo.metadata.Gossamer19 : undefined,
                Gossamer20: typeof plotInfo.metadata.Gossamer20 === 'number' ? plotInfo.metadata.Gossamer20 : undefined,
                Gossamer21: typeof plotInfo.metadata.Gossamer21 === 'number' ? plotInfo.metadata.Gossamer21 : undefined,
                Gossamer22: typeof plotInfo.metadata.Gossamer22 === 'number' ? plotInfo.metadata.Gossamer22 : undefined,
                Gossamer23: typeof plotInfo.metadata.Gossamer23 === 'number' ? plotInfo.metadata.Gossamer23 : undefined,
                Gossamer24: typeof plotInfo.metadata.Gossamer24 === 'number' ? plotInfo.metadata.Gossamer24 : undefined,
                Gossamer25: typeof plotInfo.metadata.Gossamer25 === 'number' ? plotInfo.metadata.Gossamer25 : undefined,
                Gossamer26: typeof plotInfo.metadata.Gossamer26 === 'number' ? plotInfo.metadata.Gossamer26 : undefined,
                Gossamer27: typeof plotInfo.metadata.Gossamer27 === 'number' ? plotInfo.metadata.Gossamer27 : undefined,
                Gossamer28: typeof plotInfo.metadata.Gossamer28 === 'number' ? plotInfo.metadata.Gossamer28 : undefined,
                Gossamer29: typeof plotInfo.metadata.Gossamer29 === 'number' ? plotInfo.metadata.Gossamer29 : undefined,
                Gossamer30: typeof plotInfo.metadata.Gossamer30 === 'number' ? plotInfo.metadata.Gossamer30 : undefined
            });
        });

        
        // Filter out story beats if current mode doesn't support them
        const currentMode = this.settings.currentMode || 'all-scenes';
        if (currentMode === 'chronologue' || currentMode === 'main-plot') {
            // Remove Plot/Beat items from the data in modes that don't show beats
            return scenes.filter(s => s.itemType !== 'Plot');
        }
        
        // Don't sort here - let each rendering mode handle its own sort order
        // (All Scenes and Main Plot use manuscript order, Chronologue uses When field)
        return scenes;
    }


public createTimelineSVG(scenes: Scene[]) {
  return createTimelineSVG(this, scenes);
}

public adjustBeatLabelsAfterRender(container: HTMLElement) {
  return adjustBeatLabelsAfterRender(container);
}

    public darkenColor(color: string, percent: number): string {
        const num = parseInt(color.replace("#", ""), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max((num >> 16) - amt, 0);
        const G = Math.max(((num >> 8) & 0x00FF) - amt, 0);
        const B = Math.max((num & 0x0000FF) - amt, 0);
        return `#${(1 << 24 | R << 16 | G << 8 | B).toString(16).slice(1)}`;
    }

    public lightenColor(color: string, percent: number): string {
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
            return `<text class="rt-subplot-text" x="0" y="${-20 + i * 25}" text-anchor="middle">${safeSubplot}</text>`;
        }).join('');
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // Ensure defaults
        if (!this.settings.anthropicModelId) this.settings.anthropicModelId = DEFAULT_SETTINGS.anthropicModelId;
        if (!this.settings.openaiModelId) this.settings.openaiModelId = DEFAULT_SETTINGS.openaiModelId;
        if (!this.settings.geminiModelId) this.settings.geminiModelId = DEFAULT_SETTINGS.geminiModelId;
        if (!this.settings.defaultAiProvider || !['openai', 'anthropic', 'gemini'].includes(this.settings.defaultAiProvider)) {
            this.settings.defaultAiProvider = DEFAULT_SETTINGS.defaultAiProvider;
        }
        if (typeof this.settings.lastSeenReleaseNotesVersion !== 'string') {
            this.settings.lastSeenReleaseNotesVersion = DEFAULT_SETTINGS.lastSeenReleaseNotesVersion;
        }
        if (this.settings.cachedReleaseNotes === undefined) {
            this.settings.cachedReleaseNotes = DEFAULT_SETTINGS.cachedReleaseNotes;
        }
        if (this.settings.releaseNotesLastFetched !== undefined) {
            const parsed = Date.parse(this.settings.releaseNotesLastFetched);
            if (Number.isNaN(parsed)) {
                this.settings.releaseNotesLastFetched = undefined;
            }
        }

        // One-time (idempotent) migration of legacy model IDs to canonical ones
        const before = JSON.stringify({
            anthropicModelId: this.settings.anthropicModelId,
            openaiModelId: this.settings.openaiModelId,
            geminiModelId: this.settings.geminiModelId,
        });

        const normalize = (prov: 'anthropic'|'openai'|'gemini', id: string | undefined): string => {
            if (!id) return id as unknown as string;
            if (prov === 'anthropic') {
                if (id === 'claude-4.1-opus' || id === 'claude-opus-4-1' || id === 'claude-3-opus-20240229' || id === 'claude-opus-4-0' || id === 'claude-opus-4-1@20250805') return 'claude-opus-4-1-20250805';
                if (id === 'claude-4-sonnet' || id === 'claude-sonnet-4-1' || id === 'claude-3-7-sonnet-20250219' || id === 'claude-sonnet-4-0' || id === 'claude-sonnet-4-1@20250805') return 'claude-sonnet-4-20250514';
                return id;
            }
            if (prov === 'openai') {
                if (id === 'gpt-5' || id === 'o3' || id === 'gpt-4o') return 'gpt-4.1';
                return id;
            }
            // gemini
            if (id !== 'gemini-2.5-pro') return 'gemini-2.5-pro';
            return id;
        };

        this.settings.anthropicModelId = normalize('anthropic', this.settings.anthropicModelId);
        this.settings.openaiModelId = normalize('openai', this.settings.openaiModelId);
        this.settings.geminiModelId = normalize('gemini', this.settings.geminiModelId);

        const after = JSON.stringify({
            anthropicModelId: this.settings.anthropicModelId,
            openaiModelId: this.settings.openaiModelId,
            geminiModelId: this.settings.geminiModelId,
        });
        
        // AI Context Templates migration
        let templatesMigrated = false;
        const oldBuiltInIds = new Set(['generic-editor', 'ya-biopunk-scifi', 'adult-thriller', 'adult-romance']);
        
        if (!this.settings.aiContextTemplates || this.settings.aiContextTemplates.length === 0) {
            this.settings.aiContextTemplates = DEFAULT_SETTINGS.aiContextTemplates;
            templatesMigrated = true;
        } else {
            // Remove old built-in templates and ensure new ones exist
            const builtInTemplates = DEFAULT_SETTINGS.aiContextTemplates!;
            
            // Remove old built-in templates
            this.settings.aiContextTemplates = this.settings.aiContextTemplates.filter(template => 
                !template.isBuiltIn || !oldBuiltInIds.has(template.id)
            );
            
            // Add new built-in templates if missing
            const existingIds = new Set(this.settings.aiContextTemplates.map(t => t.id));
            for (const builtIn of builtInTemplates) {
                if (!existingIds.has(builtIn.id)) {
                    this.settings.aiContextTemplates.push(builtIn);
                    templatesMigrated = true;
                }
            }
        }
        
        if (!this.settings.activeAiContextTemplateId || oldBuiltInIds.has(this.settings.activeAiContextTemplateId)) {
            this.settings.activeAiContextTemplateId = DEFAULT_SETTINGS.activeAiContextTemplateId;
            templatesMigrated = true;
        }
        
        if (before !== after || templatesMigrated) {
            await this.saveSettings();
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // Helper method to validate and remember folder paths
    async validateAndRememberPath(path: string): Promise<boolean> {
        if (!path || path.trim() === '') return false;

        // Use Obsidian's normalizePath for user-defined paths
        const normalizedPath = normalizePath(path.trim());

        // Check if the folder exists in the vault and is a folder
        const file = this.app.vault.getAbstractFileByPath(normalizedPath);
        const isValid = file instanceof TFolder && file.path === normalizedPath;
        
        if (isValid) {
            // Add to valid paths if not already present
            if (!this.settings.validFolderPaths.includes(normalizedPath)) {
                this.settings.validFolderPaths.unshift(normalizedPath); // Add to beginning
                // Keep only the last 10 paths to avoid clutter
                if (this.settings.validFolderPaths.length > 10) {
                    this.settings.validFolderPaths = this.settings.validFolderPaths.slice(0, 10);
                }
                await this.saveSettings();
            }
            return true;
        }
        
        return false;
    }

    // Remove redundant parseSceneTitle method - use the one from utils/text.ts instead

    // Centralized debug logger: only logs in development builds
    private shouldDebugLog(): boolean {
        // Best-effort dev detection; safe in browser/Obsidian envs
        const isDev = typeof process !== 'undefined'
            && typeof process.env !== 'undefined'
            && process.env.NODE_ENV === 'development';
        // Only allow logs in dev
        return isDev === true;
    }

    // Overloads to satisfy facades expecting (message, data?) while allowing variadic usage
    public log<T>(message: string, data?: T): void;
    public log(...args: unknown[]): void;
    public log(...args: unknown[]) {
        // No-op to comply with Obsidian plugin guidelines and project policy
        // Intentionally avoiding console.* calls in plugin code
        void args; // prevent unused variable in some TS configs
    }

    // Method to refresh the timeline if the active view exists (with debouncing)
    refreshTimelineIfNeeded(file: TAbstractFile | null | undefined) { this.timelineService.refreshTimelineIfNeeded(file, 400); }



    // Add this function near the top of the class, after refreshTimelineIfNeeded 
    public updateSynopsisPosition(synopsis: Element, event: MouseEvent, svg: SVGSVGElement, sceneId: string): void {
        this.synopsisManager.updatePosition(synopsis, event, svg, sceneId);
    }

    // Add method to update open files tracking
    private updateOpenFilesTracking() {
        
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
                const leafIds = Object.keys(layout.leaves as Record<string, unknown>);
                
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
            // Debounced refresh for all open views
            this.refreshTimelineIfNeeded(null);
        } else {
            this.log('No changes in open files detected');
        }
    }

    // Search related methods
    private openSearchPrompt(): void { this.searchService.openSearchPrompt(); }
    
    public performSearch(term: string): void { this.searchService.performSearch(term); }
    
    public clearSearch(): void { this.searchService.clearSearch(); }

    // Function to set CSS variables for RGB colors
    public setCSSColorVariables() {
        const root = document.documentElement;
        const { publishStageColors, subplotColors } = this.settings;
        
        // Convert hex colors to RGB for CSS variables
        Object.entries(publishStageColors).forEach(([stage, color]) => {
            // Prefixed vars used by styles.css
            root.style.setProperty(`--rt-publishStageColors-${stage}`, color);

            const rgbValues = this.hexToRGB(color);
            if (rgbValues) {
                root.style.setProperty(`--rt-publishStageColors-${stage}-rgb`, rgbValues);
            }
        });

        // Apply subplot palette colors (16 entries)
        if (Array.isArray(subplotColors)) {
            for (let i = 0; i < 16; i++) {
                const color = subplotColors[i] || DEFAULT_SETTINGS.subplotColors[i];
                if (color) {
                    // CSS custom property used by styles.css swatches and rings
                    root.style.setProperty(`--rt-subplot-colors-${i}`, color);
                }
            }
        }
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
                    svgElement.setAttribute('class', 'radial-timeline-svg');
                    
                    // Performance optimization: Add directly to fragment
                    const fragment = document.createDocumentFragment();
                    fragment.appendChild(svgElement);
                    
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
            svgElement.setAttribute('class', 'radial-timeline-svg');
            
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
                fallbackSvg.setAttribute('class', 'radial-timeline-svg');
                
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
                        
                        // Track RAF IDs for cleanup
                        const rafIds: number[] = [];
                        
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
                                const rafId = window.requestAnimationFrame(() => processNodes(nodes, endIdx, callback));
                                rafIds.push(rafId);
                            } else {
                                // Finished processing all nodes
                                callback();
                            }
                        };
                        
                        // Register cleanup for all RAF IDs
                        this.register(() => {
                            rafIds.forEach(id => cancelAnimationFrame(id));
                        });
                        
                        // Get all element nodes
                        const elementNodes = Array.from(svgDoc.querySelectorAll('*'));
                        
                        // If there are too many nodes, process in chunks
                        if (elementNodes.length > 100) {
                            // Add loading indicator first
                            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                            text.setAttribute('x', '0');
                            text.setAttribute('y', '0');
                            text.setAttribute('class', 'loading-message');
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

    // Add this function inside the RadialTimelinePlugin class
    public calculateCompletionEstimate(scenes: Scene[]): {
        date: Date;
        total: number;
        remaining: number;
        rate: number; // Scenes per week
    } | null {
        // Filter out Plot notes - only calculate completion based on actual Scene notes
        const sceneNotesOnly = scenes.filter(scene => scene.itemType !== "Plot");
        
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
        sceneNotesOnly.forEach(scene => {
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
        // Use a fresh calculation based on the provided scenes array (excluding Plot notes)
        const processedPaths = new Set<string>(); // Track unique paths
        const currentStatusCounts = sceneNotesOnly.reduce((acc, scene) => {
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

    /**
     * Show status bar item with beats processing progress
     */
    showBeatsStatusBar(current: number, total: number): void {
        if (!this.beatsStatusBarItem) {
            this.beatsStatusBarItem = this.addStatusBarItem();
            this.beatsStatusBarItem.addClass('rt-beats-status-bar');
            // Make it clickable to reopen the modal
            this.registerDomEvent(this.beatsStatusBarItem, 'click', () => {
                if (this.activeBeatsModal) {
                    this.activeBeatsModal.open();
                }
            });
            this.beatsStatusBarItem.style.cursor = 'pointer';
            this.beatsStatusBarItem.title = 'Click to view progress';
        }
        
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        this.beatsStatusBarItem.setText(`Scene beats: ${current}/${total} (${percentage}%)`);
    }
    
    /**
     * Hide and remove status bar item when processing completes
     */
    hideBeatsStatusBar(): void {
        if (this.beatsStatusBarItem) {
            this.beatsStatusBarItem.remove();
            this.beatsStatusBarItem = null;
        }
    }

    /**
     * Save Gossamer scores to Beat notes with history shifting
     */
    async saveGossamerScores(scores: Map<string, number>): Promise<void> {
        // Get files from source path only
        const sourcePath = this.settings.sourcePath || '';
        const allFiles = this.app.vault.getMarkdownFiles();
        const files = sourcePath 
            ? allFiles.filter(f => f.path.startsWith(sourcePath))
            : allFiles;
        
        let updateCount = 0;
        
        for (const [beatTitle, newScore] of scores) {
            // Find Beat note by title
            let file: TFile | null = null;
            
            for (const f of files) {
                const cache = this.app.metadataCache.getFileCache(f);
                const rawFm = cache?.frontmatter;
                const fm = rawFm ? normalizeFrontmatterKeys(rawFm) : undefined;
                // Supports both "Class: Plot" (legacy) and "Class: Beat" (recommended)
                if (fm && isStoryBeat(fm.Class)) {
                    // Try multiple matching strategies
                    const filename = f.basename;
                    const titleMatch = filename === beatTitle || 
                                     filename === beatTitle.replace(/^\d+\s+/, '') ||
                                     filename.toLowerCase() === beatTitle.toLowerCase() ||
                                     filename.toLowerCase().replace(/[-\s]/g, '') === beatTitle.toLowerCase().replace(/[-\s]/g, '');
                    
                    if (titleMatch) {
                        file = f;
                        break;
                    }
                }
            }
            
            if (!file) {
                continue;
            }
            
            try {
                await this.app.fileManager.processFrontMatter(file, (yaml) => {
                    const fm = yaml as Record<string, any>;
                    
                    // Shift history down (Gossamer1 → Gossamer2, etc.)
                    const shifted = shiftGossamerHistory(fm);
                    Object.assign(fm, shifted);
                    
                    // Set new score
                    fm.Gossamer1 = newScore;
                    
                    // Clean up old/deprecated fields
                    delete fm.GossamerLocation;
                    delete fm.GossamerNote;
                    delete fm.GossamerRuns;
                    delete fm.GossamerLatestRun;
                });
                
                updateCount++;
            } catch (e) {
                console.error(`[Gossamer] Failed to update beat ${beatTitle}:`, e);
            }
        }
        
        if (updateCount > 0) {
            new Notice(`Updated ${updateCount} beat score${updateCount > 1 ? 's' : ''}.`);
        } else {
            new Notice('No beats were updated.');
        }
    }

    onunload() {
        // Clean up any other resources
        this.hideBeatsStatusBar();
        // Note: Do NOT detach leaves here - Obsidian handles this automatically
    }
} // End of RadialTimelinePlugin class

/**
 * Migration function to convert old field names to new field names
 * This ensures backward compatibility for existing data
 */
async function migrateSceneAnalysisFields(plugin: RadialTimelinePlugin): Promise<void> {
    try {
        const files = plugin.app.vault.getMarkdownFiles();
        let migratedCount = 0;
        
        for (const file of files) {
            const cache = plugin.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter;
            
            if (fm && (fm['1beats'] || fm['2beats'] || fm['3beats'])) {
                // Check if migration is needed (old fields exist but new fields don't)
                const needsMigration = (fm['1beats'] || fm['2beats'] || fm['3beats']) && 
                                     !(fm['previousSceneAnalysis'] || fm['currentSceneAnalysis'] || fm['nextSceneAnalysis']);
                
                if (needsMigration) {
                    await plugin.app.fileManager.processFrontMatter(file, (frontmatter) => {
                        const fmObj = frontmatter as Record<string, unknown>;
                        
                        // Migrate old field names to new field names
                        if (fmObj['1beats']) {
                            fmObj['previousSceneAnalysis'] = fmObj['1beats'];
                            delete fmObj['1beats'];
                        }
                        if (fmObj['2beats']) {
                            fmObj['currentSceneAnalysis'] = fmObj['2beats'];
                            delete fmObj['2beats'];
                        }
                        if (fmObj['3beats']) {
                            fmObj['nextSceneAnalysis'] = fmObj['3beats'];
                            delete fmObj['3beats'];
                        }
                    });
                    migratedCount++;
                }
            }
        }
        
        // Migration completed silently
        void migratedCount;
    } catch (error) {
        console.error('[Radial Timeline] Error during migration:', error);
    }
}
