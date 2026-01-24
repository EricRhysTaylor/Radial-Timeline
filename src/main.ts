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
import { InquiryView } from './inquiry/InquiryView';
import { InquiryService } from './inquiry/InquiryService';
import { INQUIRY_VIEW_TYPE } from './inquiry/constants';
import { RendererService } from './services/RendererService';
import { RadialTimelineSettingsTab } from './settings/SettingsTab';
import { parseWhenField } from './utils/date';
import { normalizeBooleanValue } from './utils/sceneHelpers';
import { cleanupTooltipAnchors } from './utils/tooltip';
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
import { DEFAULT_SETTINGS } from './settings/defaults';
import { initVersionCheckService, getVersionCheckService } from './services/VersionCheckService';
import { registerRuntimeCommands } from './RuntimeCommands';
import { AuthorProgressService } from './services/AuthorProgressService';


// Declare the variable that will be injected by the build process
declare const EMBEDDED_README_CONTENT: string;

// Import the new scene analysis function <<< UPDATED IMPORT

// Constants for the view
export const TIMELINE_VIEW_TYPE = "radial-timeline";
const TIMELINE_VIEW_DISPLAY_TEXT = "Radial timeline"; // Sentence case per guidelines



// STATUS_COLORS now imported from constants
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
    // Reference to settings tab for programmatic tab switching
    public settingsTab?: RadialTimelineSettingsTab;

    // Search related properties
    searchTerm: string = '';
    searchActive: boolean = false;
    searchResults: Set<string> = new Set<string>();
    private readonly eventBus = new EventTarget();
    private metadataCacheListener: (() => void) | null = null;

    // Services
    private timelineService!: TimelineService;
    private inquiryService!: InquiryService;
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
    public milestonesService!: import('./services/MilestonesService').MilestonesService;
    public lastSceneData?: TimelineItem[];
    
    // APR Service
    private authorProgressService!: AuthorProgressService;

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
    private get aiProvider(): 'openai' | 'anthropic' | 'gemini' | 'local' {
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
        void this.releaseNotesService.ensureReleaseNotesFresh(); // Removed argument

        // Migration: Convert old field names to new field names
        await migrateSceneAnalysisFields(this);

        // Load embedded fonts (no external requests per Obsidian guidelines)
        // Embedded font injection removed to avoid inserting <style> tags at runtime.
        // All styles should live in styles.css so Obsidian can manage load/unload.

        // Initialize services and managers
        this.timelineService = new TimelineService(this.app, this);
        this.inquiryService = new InquiryService(this.app, this);
        this.sceneDataService = new SceneDataService(this.app, this.settings);
        const { SearchService } = await import('./services/SearchService');
        const { FileTrackingService } = await import('./services/FileTrackingService');
        this.searchService = new SearchService(this.app, this);
        this.fileTrackingService = new FileTrackingService(this);
        this.rendererService = new RendererService(this);
        this.synopsisManager = new SynopsisManager(this);
        this.commandRegistrar = new CommandRegistrar(this, this.app);
        this.sceneHighlighter = new SceneHighlighter(this);
        this.gossamerScoreService = new GossamerScoreService(this.app, this);
        this.sceneAnalysisService = new SceneAnalysisService(this);
        this.statusBarService = new StatusBarService(this);
        this.beatsProcessingService = new BeatsProcessingService(this.statusBarService);
        this.themeService = new ThemeService(this);
        this.timelineMetricsService = new TimelineMetricsService(this);
        
        // Milestones Service (single source of truth for stage completion milestones)
        // Separate from TimelineMetricsService (estimation/tick tracking)
        const { MilestonesService } = await import('./services/MilestonesService');
        this.milestonesService = new MilestonesService(this);
        
        // APR Service
        this.authorProgressService = new AuthorProgressService(this, this.app);

        // CSS variables for publish stage colors are set once on layout ready

        // Register the view
        this.registerView(
            TIMELINE_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => {
                return new RadialTimelineView(leaf, this);
            }
        );
        this.registerView(
            INQUIRY_VIEW_TYPE,
            (leaf: WorkspaceLeaf) => {
                return new InquiryView(leaf, this);
            }
        );

        // Register ribbon + commands
        this.commandRegistrar.registerAll();
        this.sceneAnalysisService.registerCommands();
        registerRuntimeCommands(this);

        // Add settings tab (only once)
        if (!this._settingsTabAdded) {
            this.settingsTab = new RadialTimelineSettingsTab(this.app, this);
            this.addSettingTab(this.settingsTab);
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

        // Initialize version check service and check for updates in background
        const versionService = initVersionCheckService(this.manifest.version);
        
        // Check for updates asynchronously (don't block plugin load)
        versionService.checkForUpdates().then(hasUpdate => {
            if (hasUpdate) {
                // Refresh timeline to show update indicator
                this.refreshTimelineIfNeeded(null);
            }
        }).catch((err) => {
            console.warn('[RadialTimeline] Version check failed on startup:', err);
        });

        // APR Auto-Update Check
        void this.authorProgressService.checkAutoUpdate();

        // Initial status bar update (placeholder for future stats)
        // this.statusBarService.update(...);

        // Dev-only debug infrastructure (tree-shaken in production)
        if (__RT_DEV__) {
            void import('./debug/index').then(m => m.installDebug(this));
        }
    }
    public getRendererService(): RendererService { return this.rendererService; }
    public getTimelineService(): TimelineService { return this.timelineService; }
    public getInquiryService(): InquiryService { return this.inquiryService; }

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



    async getSceneData(options?: GetSceneDataOptions): Promise<TimelineItem[]> {
        return this.sceneDataService.getSceneData(options);
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        // Ensure defaults
        if (!this.settings.anthropicModelId) this.settings.anthropicModelId = DEFAULT_SETTINGS.anthropicModelId;
        if (!this.settings.openaiModelId) this.settings.openaiModelId = DEFAULT_SETTINGS.openaiModelId;
        if (!this.settings.geminiModelId) this.settings.geminiModelId = DEFAULT_SETTINGS.geminiModelId;
        if (!this.settings.defaultAiProvider || !['openai', 'anthropic', 'gemini', 'local'].includes(this.settings.defaultAiProvider)) {
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
        const actionNotesTargetMigrated = this.settingsService.migrateInquiryActionNotesTargetField();

        const after = JSON.stringify({
            anthropicModelId: this.settings.anthropicModelId,
            openaiModelId: this.settings.openaiModelId,
            geminiModelId: this.settings.geminiModelId,
        });

        if (before !== after || templatesMigrated || actionNotesTargetMigrated) {
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
    public calculateCompletionEstimate(scenes: TimelineItem[]) {
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
        // Clean up tooltip anchors appended to document.body
        cleanupTooltipAnchors();
        // Note: Do NOT detach leaves here - Obsidian handles this automatically
    }

    public dispatch<T>(type: string, detail: T): void {
        this.eventBus.dispatchEvent(new CustomEvent(type, { detail }));
    }

} // End of RadialTimelinePlugin class
