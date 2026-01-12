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

export type AuthorProgressPublishTarget = 'folder' | 'github_pages';
export type AuthorProgressFrequency = 'manual' | 'daily' | 'weekly' | 'monthly';

export interface AuthorProgressSettings {
    enabled: boolean;
    defaultNoteBehavior: 'preset' | 'custom';
    defaultPublishTarget: AuthorProgressPublishTarget;
    
    // Reveal Options (checkboxes)
    showSubplots: boolean;  // Show all rings vs single Main Plot ring
    showActs: boolean;      // Show act divisions vs full circle
    showStatus: boolean;    // Show real stage colors vs neutral gray
    showProgressPercent?: boolean; // Show big center %
    aprSize?: 'compact' | 'standard' | 'large';
    aprBackgroundColor?: string;
    aprCenterTransparent?: boolean;
    aprBookAuthorColor?: string;
    aprEngineColor?: string;
    aprTheme?: 'dark' | 'light' | 'none'; // Controls stroke/border contrast
    
    // Identity & Branding
    bookTitle: string;
    authorName?: string;
    authorUrl: string;

    // Updates & Frequency
    lastPublishedDate?: string; // ISO string
    updateFrequency: AuthorProgressFrequency;
    stalenessThresholdDays: number; // For Manual mode
    enableReminders: boolean;
    dynamicEmbedPath: string;
    
    // Pro Feature: Campaign Manager
    campaigns?: AprCampaign[];
}

/**
 * Teaser Reveal Levels
 * Each level unlocks more visual detail as progress increases
 */
export type TeaserRevealLevel = 'bar' | 'scenes' | 'acts' | 'subplots' | 'colors';

/**
 * Teaser Reveal preset configurations
 */
export type TeaserPreset = 'slow' | 'standard' | 'fast' | 'custom';

/**
 * Teaser Reveal thresholds - percentage at which each level unlocks
 * Order: bar (0%) → scenes → colors → acts → subplots (full)
 */
export interface TeaserThresholds {
    scenes: number;    // When to show scene cells (e.g., 10%)
    colors: number;    // When to show status colors (e.g., 25%)
    acts: number;      // When to show act divisions (e.g., 50%)
    subplots: number;  // When to show subplot rings / full view (e.g., 75%)
}

/**
 * Teaser Reveal settings for progressive reveal
 */
export interface TeaserRevealSettings {
    enabled: boolean;
    preset: TeaserPreset;
    customThresholds?: TeaserThresholds;
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
    
    // Refresh Schedule
    refreshThresholdDays: number;    // Days before reminder appears
    lastPublishedDate?: string;      // ISO string - when last updated
    
    // Output
    embedPath: string;               // Where to save the SVG for this campaign
    
    // Per-campaign reveal options (override defaults when Teaser Reveal is OFF)
    showSubplots: boolean;
    showActs: boolean;
    showStatus: boolean;
    showProgressPercent: boolean;
    aprSize: 'compact' | 'standard' | 'large';
    
    // Per-campaign styling (optional overrides)
    customBackgroundColor?: string;
    customTransparent?: boolean;
    customTheme?: 'dark' | 'light';
    
    // Pro Feature: Teaser Reveal (Progressive Reveal)
    teaserReveal?: TeaserRevealSettings;
}

export interface RadialTimelineSettings {
    sourcePath: string;
    showSourcePathAsTitle?: boolean;
    validFolderPaths: string[];
    aiOutputFolder?: string;
    manuscriptOutputFolder?: string;
    actCount?: number;
    actLabelsRaw?: string;
    showActLabels?: boolean;
    publishStageColors: {
        Zero: string;
        Author: string;
        House: string;
        Press: string;
    };
    subplotColors: string[];
    currentMode?: string;
    logApiInteractions: boolean;
    targetCompletionDate?: string;
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
    customBeatSystemBeats?: { name: string; act: number }[];
    dominantSubplots?: Record<string, string>;
    globalPovMode?: GlobalPovMode;
    readabilityScale?: ReadabilityScale;
    _isResuming?: boolean;
    _resumingMode?: 'flagged' | 'unprocessed' | 'force-all';
    lastSeenReleaseNotesVersion?: string;
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
    backdropYamlTemplate?: string;
    showBackdropRing?: boolean;
    hoverMetadataFields?: HoverMetadataField[];
    
    // Professional License
    professionalLicenseKey?: string;
    
    // Runtime Estimation Settings (Professional feature)
    enableRuntimeEstimation?: boolean;
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
    pandocTemplates?: {
        screenplay?: string;
        podcast?: string;
        novel?: string;
    };

    // Author Progress Report (APR)
    authorProgress?: AuthorProgressSettings;

    // Pro experience (visual/hero activation)
    hasSeenProActivation?: boolean;
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
