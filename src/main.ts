/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { App, Plugin, Notice, Setting, PluginSettingTab, TFile, TAbstractFile, WorkspaceLeaf, ItemView, MarkdownView, MarkdownRenderer, TextComponent, Modal, ButtonComponent, Editor, parseYaml, stringifyYaml, Menu, MenuItem, Platform, DropdownComponent, Component, TFolder, SuggestModal, normalizePath } from "obsidian";
import { TimelineService } from './services/TimelineService';
import { SceneDataService } from './services/SceneDataService';
import { escapeRegExp } from './utils/regex';
import { hexToRgb, rgbToHsl, hslToRgb, rgbToHex, desaturateColor } from './utils/colour';
import { decodeHtmlEntities } from './utils/text';
import { STATUS_COLORS, SceneNumberInfo } from './utils/constants';
import SynopsisManager from './SynopsisManager';
import { createTimelineSVG, adjustBeatLabelsAfterRender } from './renderer/TimelineRenderer';
import { RadialTimelineView } from './view/TimeLineView';
import { RendererService } from './services/RendererService';
import { RadialTimelineSettingsTab } from './settings/SettingsTab';
import { ReleaseNotesModal } from './modals/ReleaseNotesModal';
import { parseSceneTitle } from './utils/text';
import { parseWhenField } from './utils/date';
import { isBeatNote, normalizeBooleanValue } from './utils/sceneHelpers';
import type { RadialTimelineSettings, TimelineItem, EmbeddedReleaseNotesBundle, EmbeddedReleaseNotesEntry } from './types';
import { ReleaseNotesService } from './services/ReleaseNotesService';
import { CommandRegistrar } from './services/CommandRegistrar';
import { HoverHighlighter } from './services/HoverHighlighter';
import { SceneHighlighter } from './services/SceneHighlighter';
import { GossamerScoreService } from './services/GossamerScoreService';
import { SceneAnalysisService } from './services/SceneAnalysisService';
import { StatusBarService } from './services/StatusBarService';
import { BeatsProcessingService } from './services/BeatsProcessingService';
import type { SceneAnalysisProcessingModal } from './modals/SceneAnalysisProcessingModal';


// Declare the variable that will be injected by the build process
declare const EMBEDDED_README_CONTENT: string;

// Import the new scene analysis function <<< UPDATED IMPORT
import { createTemplateScene } from './SceneAnalysisCommands';

// Constants for the view
export const TIMELINE_VIEW_TYPE = "radial-timeline";
const TIMELINE_VIEW_DISPLAY_TEXT = "Radial timeline"; // Sentence case per guidelines

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
    currentMode: 'narrative', // Default to Narrative mode
    logApiInteractions: true, // <<< ADDED: Default for new setting
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
    discontinuityThreshold: undefined, // Default to auto-calculated (3x median gap or 30 days)
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
    dominantSubplots: {}, // Default: empty map, will use outermost subplot for scenes in multiple subplots
    lastSeenReleaseNotesVersion: '',
    cachedReleaseNotes: null,
    releaseNotesLastFetched: undefined
};

// STATUS_COLORS now imported from constants

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
    private readonly eventBus = new EventTarget();
    private metadataCacheListener: (() => void) | null = null;
    
    // Services
    private timelineService!: TimelineService;
    private sceneDataService!: SceneDataService;
    private searchService!: import('./services/SearchService').SearchService;
    private fileTrackingService!: import('./services/FileTrackingService').FileTrackingService;
    private rendererService!: RendererService;
    private releaseNotesService!: ReleaseNotesService;
    private commandRegistrar!: CommandRegistrar;
    private sceneHighlighter!: SceneHighlighter;
    private gossamerScoreService!: GossamerScoreService;
    private sceneAnalysisService!: SceneAnalysisService;
    private statusBarService!: StatusBarService;
    private beatsProcessingService!: BeatsProcessingService;
    public lastSceneData?: TimelineItem[];
    
    // Completion estimate stats
    latestTotalScenes: number = 0;
    latestRemainingScenes: number = 0;
    latestScenesPerWeek: number = 0;
    
    // Add a synopsisManager instance
    public synopsisManager: SynopsisManager;
    
    // Add property to store the latest status counts for completion estimate
    public latestStatusCounts?: Record<string, number>;
    
    
    // Track active scene analysis processing modal and status bar item
    public activeBeatsModal: SceneAnalysisProcessingModal | null = null;

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

    public getReleaseNotesBundle(): EmbeddedReleaseNotesBundle | null {
        return this.releaseNotesService?.getBundle() ?? null;
    }

    public async markReleaseNotesSeen(version: string): Promise<void> {
        if (!this.releaseNotesService) return;
        await this.releaseNotesService.markReleaseNotesSeen(version);
    }

    public async maybeShowReleaseNotesModal(): Promise<void> {
        if (!this.releaseNotesService) return;
        const bundle = this.releaseNotesService.getBundle();
        if (!bundle) return;
        const latestVersion = bundle.latest?.version ?? bundle.major?.version ?? '';
        if (!latestVersion) return;

        const seenVersion = this.settings.lastSeenReleaseNotesVersion ?? '';
        if (seenVersion === latestVersion) return;
        if (this.releaseNotesService.hasShownModalThisSession()) return;

        this.releaseNotesService.markModalShown();
        await this.releaseNotesService.markReleaseNotesSeen(latestVersion);
        this.openReleaseNotesModal();
    }

    public openReleaseNotesModal(force: boolean = false): void {
        if (!this.releaseNotesService) return;
        const bundle = this.releaseNotesService.getBundle();
        if (!bundle) {
            if (force) new Notice('Release notes are not available offline yet. Connect to the internet and try again.');
            return;
        }

        const major = bundle.major ?? bundle.latest;
        if (!major) {
            if (force) new Notice('No release notes found.');
            return;
        }

        const patches = this.releaseNotesService.collectReleasePatches(bundle, major);
        const modal = new ReleaseNotesModal(this.app, this, major, patches);
        modal.open();
    }

    async onload() {
        await this.loadSettings();
        this.releaseNotesService = new ReleaseNotesService(this.settings, () => this.saveSettings());
        this.releaseNotesService.initializeFromEmbedded();
        void this.releaseNotesService.ensureReleaseNotesFresh(false);

        // Migration: Convert old field names to new field names
        await migrateSceneAnalysisFields(this);

        // Load embedded fonts (no external requests per Obsidian guidelines)
        // Embedded font injection removed to avoid inserting <style> tags at runtime.
        // All styles should live in styles.css so Obsidian can manage load/unload.

        // Initialize services and managers
        this.timelineService = new TimelineService(this.app, this);
        this.sceneDataService = new SceneDataService(this.app, this.settings);
        const { SearchService } = await import('./services/SearchService');
        const { FileTrackingService } = await import('./services/FileTrackingService');
        this.searchService = new SearchService(this.app, this);
        this.fileTrackingService = new FileTrackingService(this);
        this.rendererService = new RendererService(this.app);
        this.synopsisManager = new SynopsisManager(this);
        this.commandRegistrar = new CommandRegistrar(this, this.app);
        this.sceneHighlighter = new SceneHighlighter(this);
        this.gossamerScoreService = new GossamerScoreService(this.app, this);
        this.sceneAnalysisService = new SceneAnalysisService(this);
        this.statusBarService = new StatusBarService(this);
        this.beatsProcessingService = new BeatsProcessingService(this);

        // CSS variables for publish stage colors are set once on layout ready
        
        // Register the view
        this.registerView(
            TIMELINE_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => {
                return new RadialTimelineView(leaf, this);
            }
        );
        
        // Register ribbon + commands
        this.commandRegistrar.registerAll();
        this.sceneAnalysisService.registerCommands();

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
        
        // Track workspace layout changes to update our view
        // (layout-change listener consolidated below at line ~949)

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
        new HoverHighlighter(this.app, this, this.sceneHighlighter).register();

        // Initial status bar update (placeholder for future stats)
        // this.statusBarService.update(...);
    }
    public getRendererService(): RendererService { return this.rendererService; }
    
    public async processSceneAnalysisByManuscriptOrder(): Promise<void> {
        const { processByManuscriptOrder } = await import('./SceneAnalysisCommands');
        await processByManuscriptOrder(this, this.app.vault);
    }

    public async processSceneAnalysisBySubplotName(subplotName: string): Promise<void> {
        const { processBySubplotNameWithModal } = await import('./SceneAnalysisCommands');
        await processBySubplotNameWithModal(this, this.app.vault, subplotName);
    }

    public async processEntireSubplot(subplotName: string): Promise<void> {
        const { processEntireSubplotWithModal } = await import('./SceneAnalysisCommands');
        await processEntireSubplotWithModal(this, this.app.vault, subplotName);
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
    async getSceneData(options?: GetSceneDataOptions): Promise<TimelineItem[]> {
        // Delegate to SceneDataService
        return this.sceneDataService.getSceneData(options);
    }


public createTimelineSVG(scenes: TimelineItem[]) {
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
            // Use DOM-based line splitting for text with tspans
            
            // Parse the HTML using DOMParser
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg"><text>${text}</text></svg>`, 'image/svg+xml');
            
            // Check for parsing errors
            if (doc.querySelector('parsererror')) {
                // Error parsing SVG content with tspans, return original text
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

    private generateSynopsisHTML(scene: TimelineItem, contentLines: string[], sceneId: string): string {
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

    // Method to refresh the timeline if the active view exists (with debouncing)
    refreshTimelineIfNeeded(file: TAbstractFile | null | undefined, delayMs?: number) { 
        // For settings changes (file=null), use 0ms delay for immediate feedback
        // For file changes, use provided delay or default 400ms
        const effectiveDelay = file === null && delayMs === undefined ? 0 : (delayMs ?? 400);
        this.timelineService.refreshTimelineIfNeeded(file, effectiveDelay);
    }



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
            
            // Track file changes (removed diagnostic logs)
        }
        
        // Update the UI if something changed
        if (hasChanged) {
            // Debounced refresh for all open views
            this.refreshTimelineIfNeeded(null);
        }
    }

    // Search related methods
    public openSearchPrompt(): void { this.searchService.openSearchPrompt(); }
    
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
    public calculateCompletionEstimate(scenes: TimelineItem[]): {
        date: Date | null;  // null means "use default angle"
        total: number;
        remaining: number;
        rate: number; // Scenes per week
    } | null {
        // Filter out Beat notes - only calculate completion based on actual Scene notes
        const sceneNotesOnly = scenes.filter(scene => !isBeatNote(scene));
        
        if (sceneNotesOnly.length === 0) {
            return null;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Case 1: Check if book is complete (all scenes in Press stage and Complete status)
        const allScenesComplete = sceneNotesOnly.every(scene => {
            const publishStage = scene["Publish Stage"]?.toString().trim().toLowerCase() || '';
            const sceneStatus = scene.status?.toString().trim().toLowerCase() || '';
            return publishStage === 'press' && (sceneStatus === 'complete' || sceneStatus === 'done');
        });
        
        if (allScenesComplete) {
            // Book is done! Return target date if set, otherwise null (= use default angle)
            const targetDate = this.settings.targetCompletionDate 
                ? new Date(this.settings.targetCompletionDate + 'T00:00:00')
                : null;
            
            return {
                date: targetDate,
                total: sceneNotesOnly.length,
                remaining: 0,
                rate: 0
            };
        }

        // Case 2: Calculate estimate based on completion rate
        const startOfYear = new Date(today.getFullYear(), 0, 1);
        const startOfYearTime = startOfYear.getTime();
        const todayTime = today.getTime();
        const daysPassedThisYear = Math.max(1, Math.round((todayTime - startOfYearTime) / (1000 * 60 * 60 * 24)));

        let completedThisYear = 0;
        const completedPathsThisYear = new Set<string>();

        // Count scenes completed this year
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
                // Ignore errors parsing date
            }
        });

        // Case 3: No scenes completed this year - cannot estimate
        if (completedThisYear <= 0) {
            return null;
        }

        // Calculate remaining work
        const scenesPerDay = completedThisYear / daysPassedThisYear;
        const processedPaths = new Set<string>();
        const currentStatusCounts = sceneNotesOnly.reduce((acc, scene) => {
            if (!scene.path || processedPaths.has(scene.path)) {
                return acc;
            }
            processedPaths.add(scene.path);

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
        
        const completedCount = currentStatusCounts['Completed'] || 0;
        const totalScenes = Object.values(currentStatusCounts).reduce((sum, count) => sum + count, 0);
        const remainingScenes = totalScenes - completedCount;

        if (remainingScenes <= 0) {
            return null;
        }

        const daysNeeded = remainingScenes / scenesPerDay;

        if (!isFinite(daysNeeded) || daysNeeded < 0 || scenesPerDay <= 0) {
            return null;
        }

        const scenesPerWeek = scenesPerDay * 7;
        const estimatedDate = new Date(today);
        estimatedDate.setDate(today.getDate() + Math.ceil(daysNeeded));
        
        return {
            date: estimatedDate,
            total: totalScenes,
            remaining: remainingScenes,
            rate: parseFloat(scenesPerWeek.toFixed(1))
        };
    }

    public handleFileRename(file: TAbstractFile, oldPath: string): void {
        if (this.openScenePaths.has(oldPath)) {
            this.openScenePaths.delete(oldPath);
            if (file instanceof TFile && this.sceneHighlighter.isSceneFile(file.path)) {
                this.openScenePaths.add(file.path);
            }
        }
        // Add any specific logic needed when a file affecting the timeline is renamed
        this.refreshTimelineIfNeeded(file);
    }

    /**
     * Show status bar item with beats processing progress
     */
    showBeatsStatusBar(current: number, total: number): void {
        this.beatsProcessingService.showStatus(current, total);
    }
    
    /**
     * Hide and remove status bar item when processing completes
     */
    hideBeatsStatusBar(): void {
        this.beatsProcessingService.hideStatus();
    }

    async saveGossamerScores(scores: Map<string, number>): Promise<void> {
        await this.gossamerScoreService.saveScores(scores);
    }

    onunload() {
        // Clean up any other resources
        this.hideBeatsStatusBar();
        // Note: Do NOT detach leaves here - Obsidian handles this automatically
    }

    public dispatch<T>(type: string, detail: T): void {
        this.eventBus.dispatchEvent(new CustomEvent(type, { detail }));
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
