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
import type { RadialTimelineSettings, TimelineItem, BookMeta, EmbeddedReleaseNotesBundle, EmbeddedReleaseNotesEntry, BookProfile } from './types';
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
import { migrateSceneFrontmatterIds } from './migrations/sceneIds';
import { SettingsService } from './services/SettingsService';
import { DEFAULT_GEMINI_MODEL_ID } from './constants/aiDefaults';
import { DEFAULT_SETTINGS } from './settings/defaults';
import { migrateAiSettings } from './ai/settings/migrateAiSettings';
import { validateAiSettings } from './ai/settings/validateAiSettings';
import { buildDefaultAiSettings, mapAiProviderToLegacyProvider } from './ai/settings/aiSettings';
import { findBuiltinByAlias } from './ai/registry/builtinModels';
import { migrateLegacyKeysToSecretStorage } from './ai/credentials/credentials';
import { PLOT_SYSTEM_NAMES } from './utils/beatsSystems';
import { generateBeatGuid } from './utils/beatsInputNormalize';
import type { BeatSystemConfig } from './types/settings';
import { isDefaultEmbedPath } from './utils/aprPaths';
import { DEFAULT_BOOK_TITLE, createBookId, deriveBookTitleFromSourcePath, getActiveBook, normalizeBookProfile } from './utils/books';
import { initVersionCheckService, getVersionCheckService } from './services/VersionCheckService';
import { registerRuntimeCommands } from './RuntimeCommands';
import { AuthorProgressService } from './services/AuthorProgressService';


// Declare the variable that will be injected by the build process
declare const EMBEDDED_README_CONTENT: string;

// Import the new scene analysis function <<< UPDATED IMPORT

// Constants for the view
export const TIMELINE_VIEW_TYPE = "radial-timeline";
const TIMELINE_VIEW_DISPLAY_TEXT = "Radial timeline"; // Sentence case per guidelines

const DEV_PLAINTEXT_KEY_PATTERNS: Array<{ label: string; regex: RegExp }> = [
    { label: 'OpenAI key signature', regex: /sk-[A-Za-z0-9_-]{10,}/ },
    { label: 'Anthropic key signature', regex: /sk-ant-[A-Za-z0-9_-]{10,}/ },
    { label: 'Google API key signature', regex: /AIza[0-9A-Za-z_-]{16,}/ },
    { label: 'Bearer header token', regex: /\bBearer\s+[A-Za-z0-9._~+\/=-]{8,}/i },
    { label: 'Header-like high-entropy secret', regex: /(authorization|x-api-key|apiKey|token|secret)["']?\s*[:=]\s*["'][A-Za-z0-9+/_=-]{40,}/i }
];
const AI_CANONICAL_RESET_WARNING = 'AI settings were reset to the canonical default setup. Review AI Strategy and choose your preferred provider.';

function detectPlaintextCredentialPattern(serialized: string): string | null {
    for (const pattern of DEV_PLAINTEXT_KEY_PATTERNS) {
        if (pattern.regex.test(serialized)) {
            return pattern.label;
        }
    }
    return null;
}



// Search highlighting is centralized in TimeLineView.addHighlightRectangles() after SVG render.

export interface GetSceneDataOptions {
    filterBeatsBySystem?: boolean;
    sourcePath?: string;  // Override the default source path (used for Social APR project targeting)
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

    public getActiveBook() {
        return getActiveBook(this.settings);
    }

    public getActiveBookTitle(): string {
        const active = getActiveBook(this.settings);
        return active?.title?.trim() || DEFAULT_BOOK_TITLE;
    }

    private syncLegacySourcePathFromActiveBook(): void {
        const active = getActiveBook(this.settings);
        this.settings.sourcePath = active?.sourceFolder?.trim() || '';
    }

    public updateTimelineBookHeaders(): void {
        this.getTimelineViews().forEach(view => {
            if ((view as any).syncBookHeader) {
                (view as any).syncBookHeader();
            }
        });
    }

    public async setActiveBookId(bookId: string): Promise<void> {
        if (!bookId || this.settings.activeBookId === bookId) return;
        this.settings.activeBookId = bookId;
        this.syncLegacySourcePathFromActiveBook();
        await this.saveSettings();
        this.refreshTimelineIfNeeded(null);
        this.updateTimelineBookHeaders();
    }

    public async persistBookSettings(): Promise<void> {
        this.syncLegacySourcePathFromActiveBook();
        await this.saveSettings();
        this.refreshTimelineIfNeeded(null);
        this.updateTimelineBookHeaders();
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
        await migrateSceneFrontmatterIds(this);

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

        // Frontmatter detection is centralized in TimelineView debouncing; avoid duplicate listeners here.

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

    /** Show or hide the Inquiry ribbon icon and close open Inquiry views when hiding. */
    public setInquiryVisible(visible: boolean): void {
        this.commandRegistrar.setInquiryRibbonVisible(visible);
        if (!visible) {
            // Close any open Inquiry leaves
            const leaves = this.app.workspace.getLeavesOfType(INQUIRY_VIEW_TYPE);
            for (const leaf of leaves) {
                leaf.detach();
            }
        }
    }

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

    /**
     * Get the BookMeta for the active manuscript.
     * Populated during getSceneData() — returns null if no BookMeta note exists.
     */
    getBookMeta(): BookMeta | null {
        return this.sceneDataService.getBookMeta();
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());

        let booksMigrated = false;
        const settingsAny = this.settings as unknown as Record<string, unknown>;
        const hasBooks = Array.isArray(this.settings.books) && this.settings.books.length > 0;

        if (!hasBooks) {
            const legacySourcePath = (this.settings.sourcePath || '').trim();
            const legacyTitle = typeof settingsAny.bookTitle === 'string' ? (settingsAny.bookTitle as string).trim() : '';
            const derivedTitle = this.settings.showSourcePathAsTitle !== false
                ? deriveBookTitleFromSourcePath(legacySourcePath)
                : null;
            const title = legacyTitle || derivedTitle || DEFAULT_BOOK_TITLE;

            this.settings.books = [
                normalizeBookProfile({
                    id: createBookId(),
                    title,
                    sourceFolder: legacySourcePath
                })
            ];
            this.settings.activeBookId = this.settings.books[0].id;
            booksMigrated = true;
        } else {
            const normalized = this.settings.books.map(b => normalizeBookProfile(b));
            if (JSON.stringify(normalized) !== JSON.stringify(this.settings.books)) {
                this.settings.books = normalized;
                booksMigrated = true;
            }
            const activeExists = this.settings.activeBookId
                ? this.settings.books.some(b => b.id === this.settings.activeBookId)
                : false;
            if (!activeExists) {
                this.settings.activeBookId = this.settings.books[0].id;
                booksMigrated = true;
            }
        }

        if (this.settings.books.length > 0) {
            const active = getActiveBook(this.settings);
            const activeSource = active?.sourceFolder?.trim() || '';
            if (this.settings.sourcePath !== activeSource) {
                this.settings.sourcePath = activeSource;
                booksMigrated = true;
            }

            // ─── Migrate global lastUsedPandocLayoutByPreset into active book ───
            const globalLayoutPrefs = this.settings.lastUsedPandocLayoutByPreset;
            if (active && globalLayoutPrefs && Object.keys(globalLayoutPrefs).length > 0 && !active.lastUsedPandocLayoutByPreset) {
                const validPresets = new Set(['novel', 'screenplay', 'podcast']);
                const filtered: Record<string, string> = {};
                for (const [key, val] of Object.entries(globalLayoutPrefs)) {
                    if (validPresets.has(key) && typeof val === 'string') {
                        filtered[key] = val;
                    }
                }
                if (Object.keys(filtered).length > 0) {
                    active.lastUsedPandocLayoutByPreset = filtered as BookProfile['lastUsedPandocLayoutByPreset'];
                }
                this.settings.lastUsedPandocLayoutByPreset = {};
                booksMigrated = true;
            }
        }

        // Ensure defaults
        if (!this.settings.anthropicModelId) this.settings.anthropicModelId = DEFAULT_SETTINGS.anthropicModelId;
        if (!this.settings.openaiModelId) this.settings.openaiModelId = DEFAULT_SETTINGS.openaiModelId;
        if (!this.settings.geminiModelId) this.settings.geminiModelId = DEFAULT_SETTINGS.geminiModelId;
        if (!this.settings.defaultAiProvider || !['openai', 'anthropic', 'gemini', 'local'].includes(this.settings.defaultAiProvider)) {
            this.settings.defaultAiProvider = DEFAULT_SETTINGS.defaultAiProvider;
        }

        // Canonical AI settings migration/validation.
        const aiSettingsBefore = JSON.stringify(this.settings.aiSettings ?? null);
        const aiMigration = migrateAiSettings(this.settings);
        if (aiMigration.changed || !this.settings.aiSettings) {
            this.settings.aiSettings = aiMigration.aiSettings;
        }
        const aiValidation = validateAiSettings(this.settings.aiSettings);
        this.settings.aiSettings = aiValidation.value;
        if (aiValidation.warnings.length) {
            const prior = new Set(this.settings.aiSettings.migrationWarnings || []);
            aiValidation.warnings.forEach(warning => prior.add(warning));
            this.settings.aiSettings.migrationWarnings = Array.from(prior);
            this.settings.aiSettings.upgradedBannerPending = true;
        }

        if (!this.settings.aiCanonicalResetCompleted) {
            const previous = this.settings.aiSettings ?? buildDefaultAiSettings();
            const reset = buildDefaultAiSettings();
            reset.credentials = {
                ...reset.credentials,
                ...(previous.credentials || {})
            };
            reset.connections = {
                ...reset.connections,
                ollamaBaseUrl: previous.connections?.ollamaBaseUrl || this.settings.localBaseUrl || reset.connections?.ollamaBaseUrl
            };
            const priorWarnings = new Set(previous.migrationWarnings || []);
            priorWarnings.add(AI_CANONICAL_RESET_WARNING);
            reset.migrationWarnings = Array.from(priorWarnings);
            reset.upgradedBannerPending = true;
            this.settings.aiSettings = validateAiSettings(reset).value;
            this.settings.aiCanonicalResetCompleted = true;
        }

        const hasLegacyAiKeys = !!(
            (this.settings.openaiApiKey || '').trim()
            || (this.settings.anthropicApiKey || '').trim()
            || (this.settings.geminiApiKey || '').trim()
            || (this.settings.localApiKey || '').trim()
        );

        if (hasLegacyAiKeys) {
            const keyMigration = await migrateLegacyKeysToSecretStorage(this);
            if (keyMigration.warnings.length) {
                const canonical = this.settings.aiSettings ?? buildDefaultAiSettings();
                const prior = new Set(canonical.migrationWarnings || []);
                keyMigration.warnings.forEach(warning => prior.add(warning));
                canonical.migrationWarnings = Array.from(prior);
                this.settings.aiSettings = canonical;
            }
        }

        const aiSettingsAfter = JSON.stringify(this.settings.aiSettings ?? null);
        const aiSettingsMigrated = aiSettingsBefore !== aiSettingsAfter;

        // Back-compat sync: keep legacy provider/model fields in step while modules migrate to aiClient.
        if (this.settings.aiSettings) {
            const canonical = this.settings.aiSettings;
            this.settings.defaultAiProvider = mapAiProviderToLegacyProvider(canonical.provider);

            if (canonical.modelPolicy.type === 'pinned' && canonical.modelPolicy.pinnedAlias) {
                const pinned = findBuiltinByAlias(canonical.modelPolicy.pinnedAlias);
                if (pinned) {
                    if (pinned.provider === 'anthropic') this.settings.anthropicModelId = pinned.id;
                    if (pinned.provider === 'openai') this.settings.openaiModelId = pinned.id;
                    if (pinned.provider === 'google') this.settings.geminiModelId = pinned.id;
                    if (pinned.provider === 'ollama') this.settings.localModelId = pinned.id;
                }
            }

            this.settings.localBaseUrl = canonical.connections?.ollamaBaseUrl ?? this.settings.localBaseUrl;
        }

        if (typeof this.settings.lastSeenReleaseNotesVersion !== 'string') {
            this.settings.lastSeenReleaseNotesVersion = DEFAULT_SETTINGS.lastSeenReleaseNotesVersion;
        }
        if (this.settings.cachedReleaseNotes === undefined) {
            this.settings.cachedReleaseNotes = DEFAULT_SETTINGS.cachedReleaseNotes;
        }
        if (this.settings.authorProgress) {
            const apr = this.settings.authorProgress;
            if (apr.autoUpdateEmbedPaths === undefined) {
                apr.autoUpdateEmbedPaths = true;
            }
            const hasPublished = !!apr.lastPublishedDate?.trim();
            const hasCampaigns = (apr.campaigns ?? []).length > 0;
            const isDefaultPath = isDefaultEmbedPath(apr.dynamicEmbedPath, {
                bookTitle: apr.bookTitle,
                updateFrequency: apr.updateFrequency
            });
            if (!hasPublished && !hasCampaigns && isDefaultPath && apr.autoUpdateEmbedPaths === false) {
                apr.autoUpdateEmbedPaths = true;
            }
        }
        if (this.settings.releaseNotesLastFetched !== undefined) {
            const parsed = Date.parse(this.settings.releaseNotesLastFetched);
            if (Number.isNaN(parsed)) {
                this.settings.releaseNotesLastFetched = undefined;
            }
        }

        const legacyManuscriptFolder = 'Radial Timeline/Manuscript';
        const legacyOutlineFolder = 'Radial Timeline/Outline';
        const exportFolderDefault = DEFAULT_SETTINGS.manuscriptOutputFolder || 'Radial Timeline/Export';
        const manuscriptFolder = (this.settings.manuscriptOutputFolder || '').trim();
        const outlineFolder = (this.settings.outlineOutputFolder || '').trim();
        let exportFolderMigrated = false;

        if (!manuscriptFolder || manuscriptFolder === legacyManuscriptFolder) {
            this.settings.manuscriptOutputFolder = exportFolderDefault;
            exportFolderMigrated = true;
        }

        if (!outlineFolder || outlineFolder === legacyOutlineFolder || outlineFolder !== this.settings.manuscriptOutputFolder) {
            this.settings.outlineOutputFolder = this.settings.manuscriptOutputFolder || exportFolderDefault;
            exportFolderMigrated = true;
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

        // ─── Schema alignment (Scene/Beat/Backdrop ontology) ───────────────
        let schemaOntologyMigrated = false;
        const beatBaseTemplate = this.settings.beatYamlTemplates?.base;
        if (typeof beatBaseTemplate === 'string' && beatBaseTemplate.includes('Description:')) {
            if (!this.settings.beatYamlTemplates) {
                this.settings.beatYamlTemplates = { ...DEFAULT_SETTINGS.beatYamlTemplates! };
            } else {
                this.settings.beatYamlTemplates.base = beatBaseTemplate.replace(/^Description:/gm, 'Purpose:');
            }
            schemaOntologyMigrated = true;
            console.debug('[SchemaMigration]', {
                event: 'beat_base_template_description_to_purpose',
                action: 'updated beat base template to write Purpose',
            });
        }

        // ─── Strip When/Definition from all beat templates (base, advanced, per-system configs) ──
        const stripWhenDefinition = (yaml: string): string =>
            yaml.split('\n').filter(line => !/^(When|Definition)\s*:/i.test(line.trim())).join('\n');

        if (this.settings.beatYamlTemplates?.base) {
            const stripped = stripWhenDefinition(this.settings.beatYamlTemplates.base);
            if (stripped !== this.settings.beatYamlTemplates.base) {
                this.settings.beatYamlTemplates.base = stripped;
                schemaOntologyMigrated = true;
                console.debug('[SchemaMigration]', {
                    event: 'beat_base_template_stripped',
                    action: 'removed When/Definition from beat base template',
                });
            }
        }
        if (this.settings.beatYamlTemplates?.advanced) {
            const stripped = stripWhenDefinition(this.settings.beatYamlTemplates.advanced);
            if (stripped !== this.settings.beatYamlTemplates.advanced) {
                this.settings.beatYamlTemplates.advanced = stripped;
                schemaOntologyMigrated = true;
                console.debug('[SchemaMigration]', {
                    event: 'beat_advanced_template_stripped',
                    action: 'removed When/Definition from beat advanced template',
                });
            }
        }

        // ─── Migrate legacy beat YAML/hover globals into per-system config map ───
        let beatConfigMigrated = false;
        if (!this.settings.beatSystemConfigs) {
            const legacyAdvancedRaw = this.settings.beatYamlTemplates?.advanced ?? '';
            const legacyAdvancedBuiltIn = stripWhenDefinition(legacyAdvancedRaw);
            const legacyHover = this.settings.beatHoverMetadataFields ?? [];
            // Only create configs if there is something to migrate
            if (legacyAdvancedRaw.trim() || legacyHover.length > 0) {
                const seedConfig: BeatSystemConfig = {
                    beatYamlAdvanced: legacyAdvancedBuiltIn,
                    beatHoverMetadataFields: legacyHover.map(f => ({ ...f })),
                };
                const configs: Record<string, BeatSystemConfig> = {};
                // Seed all built-in system slots
                for (const name of PLOT_SYSTEM_NAMES) {
                    configs[name] = {
                        beatYamlAdvanced: seedConfig.beatYamlAdvanced,
                        beatHoverMetadataFields: seedConfig.beatHoverMetadataFields.map(f => ({ ...f })),
                    };
                }
                // Seed custom:default
                configs['custom:default'] = {
                    beatYamlAdvanced: legacyAdvancedRaw,
                    beatHoverMetadataFields: seedConfig.beatHoverMetadataFields.map(f => ({ ...f })),
                };
                // Seed any existing saved Pro systems
                const saved = this.settings.savedBeatSystems ?? [];
                for (const s of saved) {
                    configs[`custom:${s.id}`] = {
                        beatYamlAdvanced: s.beatYamlAdvanced ?? '',
                        beatHoverMetadataFields: (s.beatHoverMetadataFields ?? []).map(f => ({ ...f })),
                    };
                }
                this.settings.beatSystemConfigs = configs;
                beatConfigMigrated = true;
            }
        }

        // Strip leaked keys from built-in per-system slots only; preserve custom/saved payloads.
        if (this.settings.beatSystemConfigs) {
            for (const key of PLOT_SYSTEM_NAMES) {
                const cfg = this.settings.beatSystemConfigs[key];
                if (cfg?.beatYamlAdvanced) {
                    const stripped = stripWhenDefinition(cfg.beatYamlAdvanced);
                    if (stripped !== cfg.beatYamlAdvanced) {
                        cfg.beatYamlAdvanced = stripped;
                        schemaOntologyMigrated = true;
                    }
                }
            }
        }

        // ─── Migrate legacy backdropYamlTemplate → backdropYamlTemplates ────
        let backdropTemplateMigrated = false;
        if (!this.settings.backdropYamlTemplates) {
            const knownBaseKeys = ['Class', 'When', 'End', 'Context', 'Synopsis'];
            const legacyBackdropTemplate = this.settings.backdropYamlTemplate ?? '';
            if (legacyBackdropTemplate.trim()) {
                // Parse all keys from the legacy template
                const allKeys: string[] = [];
                for (const line of legacyBackdropTemplate.split('\n')) {
                    const m = line.match(/^([A-Za-z0-9 _'-]+):/);
                    if (m) {
                        const k = m[1].trim();
                        if (k && !allKeys.includes(k)) allKeys.push(k);
                    }
                }
                // Base = known base keys in canonical order; Advanced = everything else in original order
                const advancedKeys = allKeys.filter(k => !knownBaseKeys.includes(k));
                if (advancedKeys.length > 0) {
                    // Build advanced YAML string from extra keys (strip comments, use empty values)
                    const advLines = advancedKeys.map(k => `${k}:`);
                    this.settings.backdropYamlTemplates = {
                        base: `Class: Backdrop\nWhen: {{When}}\nEnd: {{End}}\nContext:`,
                        advanced: advLines.join('\n'),
                    };
                } else {
                    this.settings.backdropYamlTemplates = {
                        base: `Class: Backdrop\nWhen: {{When}}\nEnd: {{End}}\nContext:`,
                        advanced: '',
                    };
                }
                backdropTemplateMigrated = true;
                console.debug('[SchemaMigration]', {
                    event: 'backdrop_template_initialized_with_context',
                    action: 'legacy backdrop template migrated to Context base key'
                });
            }
        }
        if (this.settings.backdropYamlTemplates?.base?.includes('Synopsis:')) {
            this.settings.backdropYamlTemplates.base = this.settings.backdropYamlTemplates.base.replace(/^Synopsis:/gm, 'Context:');
            backdropTemplateMigrated = true;
            schemaOntologyMigrated = true;
            console.debug('[SchemaMigration]', {
                event: 'backdrop_base_template_synopsis_to_context',
                action: 'updated backdrop base template to write Context',
            });
        }
        if (this.settings.backdropHoverMetadataFields === undefined) {
            this.settings.backdropHoverMetadataFields = [];
            backdropTemplateMigrated = true;
        }
        if (this.settings.enableBackdropYamlEditor === undefined) {
            this.settings.enableBackdropYamlEditor = false;
            backdropTemplateMigrated = true;
        }

        // ─── Migrate legacy pandocTemplates → pandocLayouts ─────────────────
        let pandocLayoutsMigrated = false;
        const legacyTemplates = this.settings.pandocTemplates;
        if (legacyTemplates && (!this.settings.pandocLayouts || this.settings.pandocLayouts.length === 0)) {
            const migrated: import('./types').PandocLayoutTemplate[] = [];
            const presets = ['screenplay', 'podcast', 'novel'] as const;
            const nameMap: Record<string, string> = { screenplay: 'Screenplay Template', podcast: 'Podcast Template', novel: 'Novel Template' };
            for (const preset of presets) {
                const p = legacyTemplates[preset];
                if (p && p.trim()) {
                    migrated.push({
                        id: `${preset}-migrated`,
                        name: nameMap[preset],
                        preset,
                        path: p.trim(),
                        bundled: false
                    });
                }
            }
            if (migrated.length > 0) {
                this.settings.pandocLayouts = migrated;
                this.settings.pandocTemplates = undefined;
                pandocLayoutsMigrated = true;
            }
        }

        // ─── Beat Id migration: assign GUIDs to custom/saved beats lacking ids ───
        let beatIdMigrated = false;
        if (Array.isArray(this.settings.customBeatSystemBeats)) {
            for (const b of this.settings.customBeatSystemBeats) {
                if (!b.id) {
                    b.id = `custom:default:${generateBeatGuid()}`;
                    beatIdMigrated = true;
                }
            }
        }
        if (Array.isArray(this.settings.savedBeatSystems)) {
            for (const sys of this.settings.savedBeatSystems) {
                if (Array.isArray(sys.beats)) {
                    for (const b of sys.beats) {
                        if (!b.id) {
                            b.id = `custom:${sys.id}:${generateBeatGuid()}`;
                            beatIdMigrated = true;
                        }
                    }
                }
            }
        }
        // Ensure base template includes Beat Id placeholder (prepend before Class)
        if (this.settings.beatYamlTemplates?.base && !this.settings.beatYamlTemplates.base.includes('Beat Id:')) {
            this.settings.beatYamlTemplates.base = `Beat Id: {{BeatId}}\n${this.settings.beatYamlTemplates.base}`;
            beatIdMigrated = true;
            console.debug('[SchemaMigration]', {
                event: 'beat_id_template_prepended',
                action: 'prepended Beat Id placeholder to beat base template',
            });
        }

        if (before !== after || aiSettingsMigrated || templatesMigrated || actionNotesTargetMigrated || exportFolderMigrated || beatConfigMigrated || backdropTemplateMigrated || pandocLayoutsMigrated || booksMigrated || schemaOntologyMigrated || beatIdMigrated) {
            await this.saveSettings();
        }
    }

    async saveSettings() {
        this.syncLegacySourcePathFromActiveBook();
        if (__RT_DEV__) {
            try {
                const serialized = JSON.stringify(this.settings);
                const match = detectPlaintextCredentialPattern(serialized);
                if (match) {
                    console.error(
                        `[AI][credentials] Plaintext credential detected in settings serialization: ${match}. `
                        + 'Use saved keys and clear older key fields.'
                    );
                }
            } catch (error) {
                console.error('[AI][credentials] Failed to run plaintext credential scan.', error);
            }
        }
        await this.saveData(this.settings);
    }

    // Helper method to validate and remember folder paths
    async validateAndRememberPath(path: string): Promise<boolean> {
        return this.settingsService.validateAndRememberPath(path);
    }

    // ── Settings-aware refresh (tiered impact model) ─────────────────
    // Settings UI calls this instead of refreshTimelineIfNeeded(null) so
    // that only settings with a real visual effect trigger a render.
    //
    //   Tier 1 ("none")       — no-op; just save.
    //   Tier 2 ("selective")  — selective DOM-mutation path (no container.empty()).
    //   Tier 3 ("full")       — full SVG rebuild (same as the legacy path).

    onSettingChanged(impact: import('./settings/SettingImpact').SettingImpact): void {
        if (impact.kind === 'none') return;

        if (impact.kind === 'selective') {
            // Route through the batched scheduler so rapid changes are coalesced.
            // Debounce 50 ms — fast enough to feel live, slow enough to batch.
            this.timelineService.scheduleRender(impact.changeTypes, 50);
            return;
        }

        // impact.kind === 'full' — debounce 100 ms to avoid flicker cascades
        this.refreshTimelineIfNeeded(null, 100);
    }

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
        // Do not detach leaves here; Obsidian owns leaf teardown.
    }

    public dispatch<T>(type: string, detail: T): void {
        this.eventBus.dispatchEvent(new CustomEvent(type, { detail }));
    }

} // End of RadialTimelinePlugin class
