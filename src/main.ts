/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { App, Plugin, Notice, Setting, PluginSettingTab, TFile, TAbstractFile, WorkspaceLeaf, ItemView, MarkdownView, MarkdownRenderer, TextComponent, Modal, ButtonComponent, Editor, parseYaml, stringifyYaml, Menu, MenuItem, Platform, DropdownComponent, Component, TFolder, SuggestModal } from "obsidian";
import { TimelineService } from './services/TimelineService';
import { SceneDataService } from './services/SceneDataService';
import { escapeRegExp } from './utils/regex';
import { hexToRgb, rgbToHsl, hslToRgb, rgbToHex, desaturateColor } from './utils/colour';
import { decodeHtmlEntities, parseSceneTitle } from './utils/text';
import { STATUS_COLORS, SceneNumberInfo } from './utils/constants';
import SynopsisManager from './SynopsisManager';
import { RadialTimelineView } from './view/TimeLineView';
import { RendererService } from './services/RendererService';
import { RadialTimelineSettingsTab } from './settings/SettingsTab';
import { parseWhenField } from './utils/date';
import { normalizeBooleanValue } from './utils/sceneHelpers';
import type { RadialTimelineSettings, TimelineItem, EmbeddedReleaseNotesBundle, EmbeddedReleaseNotesEntry } from './types';
import { ReleaseNotesService } from './services/ReleaseNotesService';
import { CommandRegistrar } from './services/CommandRegistrar';
import { HoverHighlighter } from './services/HoverHighlighter';
import { SceneHighlighter } from './services/SceneHighlighter';
import { GossamerScoreService } from './services/GossamerScoreService';
import { SceneAnalysisService } from './services/SceneAnalysisService';
import { StatusBarService } from './services/StatusBarService';
import { BeatsProcessingService } from './services/BeatsProcessingService';
import { ThemeService } from './services/ThemeService';
import type { SceneAnalysisProcessingModal } from './modals/SceneAnalysisProcessingModal';
import { TimelineMetricsService } from './services/TimelineMetricsService';
import { migrateSceneAnalysisFields } from './migrations/sceneAnalysis';
import { SettingsService } from './services/SettingsService';
import { DEFAULT_GEMINI_MODEL_ID } from './constants/aiDefaults';


// Declare the variable that will be injected by the build process
declare const EMBEDDED_README_CONTENT: string;

// Import the new scene analysis function <<< UPDATED IMPORT

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
    anthropicModelId: 'claude-sonnet-4-5-20250929', // Default to Sonnet 4.5 (20250929)
    geminiApiKey: '',
    geminiModelId: DEFAULT_GEMINI_MODEL_ID, // Default to Gemini 3 Pro Preview
    defaultAiProvider: 'openai',
    openaiModelId: 'gpt-5.1-chat-latest', // Default to GPT-5.1
    enableAiSceneAnalysis: true,
    enableZeroDraftMode: false,
    metadataRefreshDebounceMs: 10000,
    showEstimate: true,
    discontinuityThreshold: undefined, // Default to auto-calculated (3x median gap or 30 days)
    enableSceneTitleAutoExpand: true, // Default: enabled to maintain current behavior
    enableHoverDebugLogging: false,
    sortByWhenDate: false, // Default: manuscript order (backward compatible)
    chronologueDurationCapSelection: 'auto',
    readabilityScale: 'normal',
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
    globalPovMode: 'off',
    lastSeenReleaseNotesVersion: '',
    cachedReleaseNotes: null,
    releaseNotesLastFetched: undefined
};

// STATUS_COLORS now imported from constants

const NUM_ACTS = 3;
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
    private themeService!: ThemeService;
    private timelineMetricsService!: TimelineMetricsService;
    private settingsService!: SettingsService;
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
        if (provider === 'anthropic') return this.settings.anthropicModelId || 'claude-sonnet-4-5-20250929';
        if (provider === 'gemini') return this.settings.geminiModelId || DEFAULT_GEMINI_MODEL_ID;
        return this.settings.openaiModelId || 'gpt-5.1-chat-latest';
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

    public getReleaseNotesEntries(): EmbeddedReleaseNotesEntry[] {
        return this.releaseNotesService?.getEntries() ?? [];
    }

    public getReleaseNotesMajorVersion(): string | null {
        return this.releaseNotesService?.getMajorVersion() ?? null;
    }

    public async markReleaseNotesSeen(version: string): Promise<void> {
        await this.releaseNotesService?.markReleaseNotesSeen(version);
    }

    public async maybeShowReleaseNotesModal(): Promise<void> {
        await this.releaseNotesService?.maybeShowReleaseNotesModal(this.app, this);
    }

    public openReleaseNotesModal(): void {
        this.releaseNotesService?.openReleaseNotesModal(this.app, this);
    }

    async onload() {
        this.settingsService = new SettingsService(this);
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
        this.beatsProcessingService = new BeatsProcessingService(this.statusBarService);
        this.themeService = new ThemeService(this);
        this.timelineMetricsService = new TimelineMetricsService(this);

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

        this.fileTrackingService.registerWorkspaceListeners();

        // Setup hover listeners
        new HoverHighlighter(this.app, this, this.sceneHighlighter).register();

        // Initial status bar update (placeholder for future stats)
        // this.statusBarService.update(...);
    }
    public getRendererService(): RendererService { return this.rendererService; }

    public isSceneFile(path: string): boolean {
        return this.sceneHighlighter.isSceneFile(path);
    }
    
    public async processSceneAnalysisByManuscriptOrder(): Promise<void> {
        await this.sceneAnalysisService.processByManuscriptOrder();
    }

    public async processSceneAnalysisBySubplotName(subplotName: string): Promise<void> {
        await this.sceneAnalysisService.processBySubplotName(subplotName);
    }

    public async processEntireSubplot(subplotName: string): Promise<void> {
        await this.sceneAnalysisService.processEntireSubplot(subplotName);
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

    async getSceneData(options?: GetSceneDataOptions): Promise<TimelineItem[]> {
        return this.sceneDataService.getSceneData(options);
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

        const before = JSON.stringify({
            anthropicModelId: this.settings.anthropicModelId,
            openaiModelId: this.settings.openaiModelId,
            geminiModelId: this.settings.geminiModelId,
        });

        if (!this.settingsService) {
            this.settingsService = new SettingsService(this);
        }

        this.settingsService.normalizeModelIds();
        const templatesMigrated = await this.settingsService.migrateAiContextTemplates();

        const after = JSON.stringify({
            anthropicModelId: this.settings.anthropicModelId,
            openaiModelId: this.settings.openaiModelId,
            geminiModelId: this.settings.geminiModelId,
        });

        if (before !== after || templatesMigrated) {
            await this.saveSettings();
        }
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    // Helper method to validate and remember folder paths
    async validateAndRememberPath(path: string): Promise<boolean> {
        return this.settingsService.validateAndRememberPath(path);
    }

    // Remove redundant parseSceneTitle method - use the one from utils/text.ts instead

    // Method to refresh the timeline if the active view exists (with debouncing)
    refreshTimelineIfNeeded(file: TAbstractFile | null | undefined, delayMs?: number) { 
        // For settings changes (file=null), use 0ms delay for immediate feedback
        // For file changes, use provided delay or default 400ms
        const effectiveDelay = file === null && delayMs === undefined ? 0 : (delayMs ?? 400);
		this.timelineService.refreshTimelineIfNeeded(file, effectiveDelay);
	}

    // Search related methods
    public openSearchPrompt(): void { this.searchService.openSearchPrompt(); }
    
    public performSearch(term: string): void { this.searchService.performSearch(term); }
    
    public clearSearch(): void { this.searchService.clearSearch(); }

    public setCSSColorVariables(): void {
        this.themeService.applyCssVariables();
    }

    // Add helper method to highlight search terms
    
    // Helper method to convert DocumentFragment to string for backward compatibility


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
        date: Date | null;
        total: number;
        remaining: number;
        rate: number;
    } | null {
        return this.timelineMetricsService.calculateCompletionEstimate(scenes);
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
        this.beatsProcessingService?.hideStatus();
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
