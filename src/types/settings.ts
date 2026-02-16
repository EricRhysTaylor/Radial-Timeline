import type { InquiryScope } from '../inquiry/state';

export interface AiContextTemplate {
    id: string;
    name: string;
    prompt: string;
    isBuiltIn: boolean;
}

export interface BookDesignerSceneAssignment {
    sceneNumber: number;
    act: number;
    subplotIndex: number;
}

export interface BookDesignerTemplate {
    id: string;
    name: string;
    templateType: 'base' | 'advanced';
    createdAt: string;
    scenesToGenerate: number;
    targetRangeMax: number;
    timeIncrement: string;
    selectedActs: number[];
    subplots: string[];
    characters: string[];
    generateBeats: boolean;
    assignments: BookDesignerSceneAssignment[];
    targetPath?: string;
}

export interface BeatSystemConfig {
    beatYamlAdvanced: string;
    beatHoverMetadataFields: HoverMetadataField[];
}

export interface SavedBeatSystem {
    id: string;
    name: string;
    description?: string;
    beats: { name: string; act: number; purpose?: string; id?: string }[];
    beatYamlAdvanced?: string;
    beatHoverMetadataFields?: HoverMetadataField[];
    createdAt: string;
}

export type GlobalPovMode = 'off' | 'first' | 'second' | 'third' | 'omni' | 'objective';
export type ReadabilityScale = 'normal' | 'large';
export type RuntimeContentType = 'novel' | 'screenplay' | 'audiobook';
export type PovMarkerLabel = '0' | '1' | '2' | '3';

export interface RuntimeRateProfile {
    id: string;
    label: string;
    contentType: RuntimeContentType;
    dialogueWpm: number;
    actionWpm: number;
    narrationWpm: number;
    beatSeconds: number;
    pauseSeconds: number;
    longPauseSeconds: number;
    momentSeconds: number;
    silenceSeconds: number;
    sessionPlanning?: {
        draftingWpm?: number;
        recordingWpm?: number;
        editingWpm?: number;
        dailyMinutes?: number;
    };
}

export interface LlmTimingStats {
    averageTokenPerSec: number;
    lastJobTokenCount: number;
    lastJobDurationMs: number;
    sampleSize: number;
    recentSamples: number[];
    sampleCount: number;
}

export interface HoverMetadataField {
    key: string;           // Frontmatter key
    label: string;         // Display label
    icon: string;          // Lucide icon name
    enabled: boolean;      // Show in hover synopsis
}

export interface BookProfile {
    id: string;
    title: string;
    sourceFolder: string;
    fileStem?: string;
    lastUsedPandocLayoutByPreset?: Partial<Record<'novel' | 'screenplay' | 'podcast', string>>;
}

export type AuthorProgressPublishTarget = 'folder' | 'github_pages' | 'note';
export type AuthorProgressFrequency = 'manual' | 'daily' | 'weekly' | 'monthly';

export interface AuthorProgressSettings {
    enabled: boolean;
    defaultNoteBehavior: 'preset' | 'custom';
    defaultPublishTarget: AuthorProgressPublishTarget;
    customNoteTemplatePath?: string; // Path to custom note template (Pro feature)

    // Reveal Options (checkboxes)
    showSubplots: boolean;  // Show all rings vs single Main Plot ring
    showActs: boolean;      // Show act divisions vs full circle
    showStatus: boolean;    // Show real stage colors vs neutral gray
    showProgressPercent?: boolean; // Show big center %
    aprProgressMode?: 'stage' | 'zero' | 'date';
    aprProgressDateStart?: string;
    aprProgressDateTarget?: string;
    aprSize?: 'thumb' | 'small' | 'medium' | 'large';
    aprBackgroundColor?: string;
    aprCenterTransparent?: boolean;
    aprBookAuthorColor?: string;
    aprAuthorColor?: string;
    aprEngineColor?: string;
    aprPercentNumberColor?: string; // Color for the center percent number
    aprPercentSymbolColor?: string; // Color for the center % symbol
    aprTheme?: 'dark' | 'light' | 'none'; // Controls stroke/border contrast
    aprSpokeColorMode?: 'dark' | 'light' | 'none' | 'custom'; // Act spokes color mode
    aprSpokeColor?: string; // Custom spokes color (used when mode is 'custom')

    // Typography Settings (since SVG embeds fonts, these are user-configurable)
    aprBookTitleFontFamily?: string;  // Font family for book title (default: 'Inter')
    aprBookTitleFontWeight?: number;  // Font weight for book title (default: 400)
    aprBookTitleFontItalic?: boolean; // Italic for book title (default: false)
    aprBookTitleFontSize?: number;    // Font size for book title (default: from preset)

    aprAuthorNameFontFamily?: string;  // Font family for author name (default: 'Inter' or script font)
    aprAuthorNameFontWeight?: number;  // Font weight for author name (default: 400)
    aprAuthorNameFontItalic?: boolean; // Italic for author name (default: false)
    aprAuthorNameFontSize?: number;    // Font size for author name (default: from preset)

    aprPercentNumberFontSize1Digit?: number;  // Font size for single-digit (default: from preset)
    aprPercentNumberFontSize2Digit?: number;  // Font size for double-digit (default: from preset)
    aprPercentNumberFontSize3Digit?: number;  // Font size for triple-digit (default: from preset)

    aprRtBadgeFontFamily?: string;  // Font family for stage badge / RT mark (default: 'Inter')
    aprRtBadgeFontWeight?: number;  // Font weight for stage badge / RT mark (default: 700)
    aprRtBadgeFontItalic?: boolean; // Italic for stage badge / RT mark (default: false)
    aprRtBadgeFontSize?: number;    // Font size for stage badge / RT mark (default: from preset)
    aprShowRtAttribution?: boolean; // Show RT attribution mark (Pro can disable)

    // Identity & Branding
    bookTitle: string;
    authorName?: string;
    authorUrl: string;

    // Social Project Configuration (Core)
    socialProjectPath?: string;  // Project folder path for Social target
    socialBookTitle?: string;    // Display title for Social target (overrides bookTitle)

    // Updates & Frequency
    lastPublishedDate?: string; // ISO string
    updateFrequency: AuthorProgressFrequency;
    stalenessThresholdDays: number; // For Manual mode
    enableReminders: boolean;
    dynamicEmbedPath: string;
    autoUpdateEmbedPaths?: boolean;

    // Pro Feature: Campaign Manager
    campaigns?: AprCampaign[];
}

/**
 * Teaser Reveal stages for progressive reveal (4 stages)
 * Each level unlocks more visual detail as progress increases
 * 
 * bar     = Progress ring only, no scenes
 * scenes  = Scene cells + acts rendered in grayscale with patterns, completed = gray
 * colors  = Full publish stage colors revealed (status + stage)
 * full    = All subplot rings visible
 */
export type TeaserRevealLevel = 'bar' | 'scenes' | 'colors' | 'full';

/**
 * Teaser Reveal preset configurations
 */
export type TeaserPreset = 'slow' | 'standard' | 'fast' | 'custom';

/**
 * Teaser Reveal thresholds - percentage at which each level unlocks
 * Order: bar (0%) → scenes → colors → full
 */
export interface TeaserThresholds {
    scenes: number;    // When to show scene cells + acts (e.g., 10%)
    colors: number;    // When to show full publish stage colors (e.g., 30%)
    full: number;      // When to show subplot rings / complete view (e.g., 60%)
}

/**
 * Disabled stages for Teaser Reveal
 * Authors can skip middle stages by clicking on preview cards
 */
export interface TeaserDisabledStages {
    scenes?: boolean;  // Skip SCENES stage
    colors?: boolean;  // Skip COLORS stage
}

/**
 * Teaser Reveal settings for progressive reveal
 */
export interface TeaserRevealSettings {
    enabled: boolean;
    preset: TeaserPreset;
    customThresholds?: TeaserThresholds;
    disabledStages?: TeaserDisabledStages;
}

/**
 * APR Campaign - Pro Feature
 * Allows multiple embed destinations with independent refresh schedules
 */
export interface AprCampaign {
    id: string;
    name: string;                    // "Kickstarter", "Newsletter", "Website", etc.
    description?: string;            // Optional notes about this campaign
    isActive: boolean;               // Whether this campaign is currently being used

    // Update Schedule
    updateFrequency?: 'manual' | 'daily' | 'weekly' | 'monthly';  // How often to auto-update
    refreshThresholdDays: number;    // Days before reminder appears (for manual mode)
    lastPublishedDate?: string;      // ISO string - when last updated

    // Output
    embedPath: string;               // Where to save the SVG for this campaign

    // Campaign-specific Project Configuration (Pro overrides)
    projectPath?: string;            // Override project folder path (inherits from socialProjectPath if not set)
    bookTitle?: string;              // Override display title (inherits from socialBookTitle if not set)

    aprSize?: 'thumb' | 'small' | 'medium' | 'large';

    // Per-campaign styling (optional overrides)
    customBackgroundColor?: string;
    customTransparent?: boolean;
    customTheme?: 'dark' | 'light';

    // Pro Feature: Teaser Reveal (Progressive Reveal)
    teaserReveal?: TeaserRevealSettings;
}

export type InquiryMaterialMode = 'none' | 'summary' | 'full';

export type InquirySourcesPreset = 'default' | 'light' | 'deep';

export interface InquiryClassConfig {
    className: string;
    enabled: boolean;
    bookScope: InquiryMaterialMode;
    sagaScope: InquiryMaterialMode;
    referenceScope: InquiryMaterialMode;
}

export interface InquirySourcesSettings {
    preset?: InquirySourcesPreset;
    scanRoots?: string[];
    resolvedScanRoots?: string[];
    classScope?: string[];
    classes?: InquiryClassConfig[];
    classCounts?: Record<string, number>;
    lastScanAt?: string;
}

export type InquiryPromptZone = 'setup' | 'pressure' | 'payoff';

export interface InquiryPromptSlot {
    id: string;
    label?: string;
    question: string;
    enabled: boolean;
    builtIn?: boolean;
    requiresContext?: boolean;
}

export type InquiryPromptConfig = Record<InquiryPromptZone, InquiryPromptSlot[]>;

export interface InquiryFocusCache {
    lastFocusBookId?: string;
    lastFocusSceneByBookId?: Record<string, string>;
}

export interface InquiryCorpusThresholds {
    emptyMax: number;
    sketchyMin: number;
    mediumMin: number;
    substantiveMin: number;
}

export interface OmnibusProgressState {
    totalQuestions: number;
    completedQuestionIds: string[];
    scope: InquiryScope;
    questionIds: string[];
    useOmnibus: boolean;
    corpusSettingsFingerprint: string;
    indexNotePath?: string;
    abortedAt?: string;
}

export interface InquirySessionCacheRecord {
    sessions: {
        key: string;
        baseKey: string;
        result: unknown;
        createdAt: number;
        lastAccessed: number;
        stale?: boolean;
        status?: 'saved' | 'unsaved' | 'error' | 'simulated';
        briefPath?: string;
        focusSceneId?: string;
        focusBookId?: string;
        scope?: InquiryScope;
        questionZone?: InquiryPromptZone;
        pendingEditsApplied?: boolean;
    }[];
    max: number;
}

/** A Pandoc LaTeX layout template scoped to a manuscript preset. */
export interface PandocLayoutTemplate {
    id: string;                // unique, e.g. "ajfinn-novel"
    name: string;              // display name, e.g. "AJFINN Classic"
    preset: 'novel' | 'screenplay' | 'podcast';
    path: string;              // vault-relative or absolute path to .tex file
    bundled?: boolean;         // true for RT-generated sample templates
}

export interface RadialTimelineSettings {
    books: BookProfile[];
    activeBookId?: string;
    sourcePath: string;
    /** @deprecated Legacy toggle. Book title now comes from BookProfile. Kept for migration. */
    showSourcePathAsTitle?: boolean;
    validFolderPaths: string[];
    validProjectPaths?: string[];  // Autocomplete history for Social Project Path field
    aiOutputFolder?: string;
    manuscriptOutputFolder?: string;
    outlineOutputFolder?: string;
    inquiryArtifactFolder?: string;
    inquiryAutoSave?: boolean;
    inquiryCacheEnabled?: boolean;
    inquiryCacheMaxSessions?: number;
    inquirySources?: InquirySourcesSettings;
    inquiryPromptConfig?: InquiryPromptConfig;
    inquirySessionCache?: InquirySessionCacheRecord;
    inquiryFocusCache?: InquiryFocusCache;
    inquiryLastMode?: 'flow' | 'depth';
    inquiryCorpusThresholds?: InquiryCorpusThresholds;
    inquiryCorpusHighlightLowSubstanceComplete?: boolean;
    inquiryActionNotesAutoPopulate?: boolean;
    inquiryActionNotesTargetField?: string;
    inquiryOmnibusProgress?: OmnibusProgressState;
    actCount?: number;
    actLabelsRaw?: string;
    publishStageColors: {
        Zero: string;
        Author: string;
        House: string;
        Press: string;
    };
    subplotColors: string[];
    currentMode?: string;
    logApiInteractions: boolean;
    targetCompletionDate?: string;  // Legacy - kept for backwards compatibility
    stageTargetDates?: {
        Zero?: string;    // Target date for Zero stage completion (YYYY-MM-DD)
        Author?: string;  // Target date for Author stage completion
        House?: string;   // Target date for House stage completion
        Press?: string;   // Target date for Press stage completion
    };
    showCompletionEstimate?: boolean;
    completionEstimateWindowDays?: number;
    openaiApiKey?: string;
    anthropicApiKey?: string;
    anthropicModelId?: string;
    geminiApiKey?: string;
    geminiModelId?: string;
    defaultAiProvider?: 'openai' | 'anthropic' | 'gemini' | 'local';
    localBaseUrl?: string;
    localModelId?: string;
    localApiKey?: string;
    localLlmInstructions?: string;
    localSendPulseToAiReport?: boolean;
    openaiModelId?: string;
    enableAiSceneAnalysis: boolean;
    enableZeroDraftMode?: boolean;
    metadataRefreshDebounceMs?: number;
    enableSceneTitleAutoExpand?: boolean;
    enableManuscriptRippleRename?: boolean;
    synopsisHoverMaxLines?: number; // @deprecated Legacy hover line limit, now derived from Synopsis max words
    enableHoverDebugLogging?: boolean;
    showFullTripletAnalysis?: boolean;
    sortByWhenDate?: boolean;
    chronologueDurationCapSelection?: string;
    discontinuityThreshold?: string;
    shouldRestoreTimelineOnLoad?: boolean;
    aiContextTemplates?: AiContextTemplate[];
    activeAiContextTemplateId?: string;
    beatSystem?: string;
    customBeatSystemName?: string;
    customBeatSystemDescription?: string;
    customBeatSystemBeats?: { name: string; act: number; purpose?: string; id?: string }[];
    dominantSubplots?: Record<string, string>;
    globalPovMode?: GlobalPovMode;
    readabilityScale?: ReadabilityScale;
    _isResuming?: boolean;
    _resumingMode?: 'flagged' | 'unprocessed' | 'force-all';
    lastSeenReleaseNotesVersion?: string;
    // Synopsis generation settings (legacy names — now control Summary generation)
    synopsisTargetWords?: number; // Target word count for AI-generated summaries (default: 200)
    synopsisWeakThreshold?: number; // Word count below which a summary is considered "weak" (default: 75)

    // Summary & Synopsis generation settings
    alsoUpdateSynopsis?: boolean; // When running Summary refresh, also generate Synopsis (default: false)
    synopsisGenerationMaxWords?: number; // Max words for AI-generated Synopsis (default: 30)
    synopsisGenerationMaxLines?: number; // @deprecated Legacy line-based synopsis limiter

    // Internal AI update timestamps (per-scene, keyed by file path)
    aiUpdateTimestamps?: Record<string, { synopsisUpdated?: string; summaryUpdated?: string }>
    cachedReleaseNotes?: EmbeddedReleaseNotesBundle | null;
    releaseNotesLastFetched?: string;
    enablePlanetaryTime?: boolean;
    planetaryProfiles?: PlanetaryProfile[];
    activePlanetaryProfileId?: string
    frontmatterMappings?: Record<string, string>;
    enableCustomMetadataMapping?: boolean;
    enableAdvancedYamlEditor?: boolean;
    sceneYamlTemplates?: {
        base: string;
        advanced: string;
    };
    bookDesignerTemplates?: BookDesignerTemplate[];
    /** @deprecated Use backdropYamlTemplates instead. Kept for migration. */
    backdropYamlTemplate?: string;
    backdropYamlTemplates?: {
        base: string;
        advanced: string;
    };
    enableBackdropYamlEditor?: boolean;
    backdropHoverMetadataFields?: HoverMetadataField[];
    showBackdropRing?: boolean;
    chronologueBackdropMicroRings?: ChronologueBackdropMicroRing[];
    hoverMetadataFields?: HoverMetadataField[];

    enableBeatYamlEditor?: boolean;
    // Per-system beat YAML + hover configs (keyed by system name or custom:<id>)
    beatSystemConfigs?: Record<string, BeatSystemConfig>;
    activeCustomBeatSystemId?: string;  // Which custom system is active (default: 'default')
    // Legacy beat YAML fields — deprecated, migrated into beatSystemConfigs on load
    beatYamlTemplates?: {
        base: string;
        advanced: string;
    };
    beatHoverMetadataFields?: HoverMetadataField[];
    savedBeatSystems?: SavedBeatSystem[];  // Pro: multiple custom beat systems

    // Professional License
    professionalLicenseKey?: string;
    devProActive?: boolean;  // Dev toggle to test Pro features as active/inactive (defaults to true during beta)

    // Runtime Estimation Settings (Professional feature)
    runtimeRateProfiles?: RuntimeRateProfile[];
    defaultRuntimeProfileId?: string;
    runtimeContentType?: RuntimeContentType;
    runtimeDialogueWpm?: number;
    runtimeActionWpm?: number;
    runtimeNarrationWpm?: number;
    runtimeBeatSeconds?: number;
    runtimePauseSeconds?: number;
    runtimeLongPauseSeconds?: number;
    runtimeMomentSeconds?: number;
    runtimeSilenceSeconds?: number;

    // LLM Timing Calibration (for progress bar animation)
    pulseTimingStats?: LlmTimingStats;

    // Export / Pandoc (Professional)
    pandocPath?: string;
    pandocEnableFallback?: boolean;
    pandocFallbackPath?: string;
    pandocFolder?: string;  // Vault path for Pandoc templates and compile scripts
    pandocLayouts?: PandocLayoutTemplate[];
    /** @deprecated Migrated to BookProfile.lastUsedPandocLayoutByPreset. Kept for one migration cycle. */
    lastUsedPandocLayoutByPreset?: Record<string, string>;

    /** @deprecated Migrated to pandocLayouts on load. Kept for one release cycle. */
    pandocTemplates?: {
        screenplay?: string;
        podcast?: string;
        novel?: string;
    };

    // Author Progress Report (APR)
    authorProgress?: AuthorProgressSettings;

    // Pro experience (visual/hero activation)
    hasSeenProActivation?: boolean;

    // Refactor Alerts System
    dismissedAlerts?: string[];
}

export interface ChronologueBackdropMicroRing {
    title: string;
    range: string;
    color: string;
}

export interface PlanetaryProfile {
    id: string;
    label: string;
    hoursPerDay: number;
    daysPerWeek: number;
    daysPerYear: number;
    epochOffsetDays?: number;
    epochLabel?: string;
    monthNames?: string[];
    weekdayNames?: string[];
    customFormat?: string;
}

export interface EmbeddedReleaseNotesBundle {
    version: string;
    entries: EmbeddedReleaseNotesEntry[];
    // Properties used by ReleaseNotesService logic
    majorVersion?: string;
    major?: EmbeddedReleaseNotesEntry;
    latest?: EmbeddedReleaseNotesEntry;
    patches?: EmbeddedReleaseNotesEntry[];
}

export interface EmbeddedReleaseNotesEntry {
    version: string;
    title: string;
    sections: {
        type: 'feature' | 'improvement' | 'fix';
        items: string[];
    }[];
    publishedAt?: string;
    body?: string;
    url?: string;
}
