/*
 * Plugin settings schema
 */

import type { EmbeddedReleaseNotesBundle } from './releaseNotes';

export type PovMarkerLabel = '1' | '2' | '3' | '0';

export type GlobalPovMode = 'off' | 'first' | 'second' | 'third' | 'omni' | 'objective';

export type ScenePovKeyword = 'first' | 'second' | 'third' | 'omni' | 'objective' | 'one' | 'two' | 'three' | 'count';

export type ReadabilityScale = 'normal' | 'large';

export type RuntimeContentType = 'screenplay' | 'novel';

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

export interface HoverMetadataField {
    key: string;           // YAML key name
    icon: string;          // Lucide icon name
    enabled: boolean;      // Show in hover synopsis
}

export interface RadialTimelineSettings {
    sourcePath: string;
    showSourcePathAsTitle?: boolean;
    validFolderPaths: string[];
    aiOutputFolder?: string;
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
    activePlanetaryProfileId?: string;
    frontmatterMappings?: Record<string, string>;
    enableCustomMetadataMapping?: boolean;
    enableAdvancedYamlEditor?: boolean;
    sceneYamlTemplates?: {
        base: string;
        advanced: string;
    };
    bookDesignerTemplates?: BookDesignerTemplate[];
    backdropYamlTemplate?: string;
    hoverMetadataFields?: HoverMetadataField[];
    
    // Professional License
    professionalLicenseKey?: string;
    
    // Runtime Estimation Settings (Professional feature)
    enableRuntimeEstimation?: boolean;
    runtimeContentType?: RuntimeContentType;
    runtimeDialogueWpm?: number;
    runtimeActionWpm?: number;
    runtimeNarrationWpm?: number;
    runtimeBeatSeconds?: number;
    runtimePauseSeconds?: number;
    runtimeLongPauseSeconds?: number;
    runtimeMomentSeconds?: number;
    runtimeSilenceSeconds?: number;
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
}
