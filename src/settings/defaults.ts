/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type { RadialTimelineSettings } from '../types';
import { buildDefaultInquiryPromptConfig } from '../inquiry/prompts';
import { buildDefaultAiSettings } from '../ai/settings/aiSettings';
import { DEFAULT_CUSTOM_BEAT_SYSTEM_ID, buildDefaultCustomBeatSystem, getCustomBeatConfigKey } from '../utils/beatSystemState';
import { PLOT_SYSTEM_NAMES } from '../utils/beatsSystems';
import { buildDefaultAuthorProgressSettings } from '../authorProgress/authorProgressConfig';

export const DEFAULT_SETTINGS: RadialTimelineSettings = {
    books: [],
    activeBookId: undefined,
    sourcePath: '',
    showSourcePathAsTitle: true, // @deprecated Legacy — book title from BookProfile after migration
    validFolderPaths: [], // Default empty array for folder path history
    aiOutputFolder: 'Radial Timeline/Logs',
    manuscriptOutputFolder: 'Radial Timeline/Export',
    outlineOutputFolder: 'Radial Timeline/Export',
    inquiryArtifactFolder: 'Radial Timeline/Inquiry/Briefing',
    inquiryAutoSave: true,
    inquiryRecentSessionsLimit: 30,
    inquirySources: {
        scanRoots: [],
        bookInclusion: {},
        classScope: [],
        classes: [],
        classCounts: {},
        resolvedScanRoots: []
    },
    inquiryPromptConfig: buildDefaultInquiryPromptConfig(),
    inquiryTargetCache: {
        lastBookId: undefined,
        lastTargetSceneIdsByBookId: {}
    },
    inquiryLastMode: 'flow',
    inquiryCorpusThresholds: {
        emptyMax: 10,
        sketchyMin: 100,
        mediumMin: 300,
        substantiveMin: 1000
    },
    inquiryCorpusHighlightLowSubstanceComplete: true,
    inquiryActionNotesAutoPopulate: false,
    inquiryActionNotesTargetField: 'Pending Edits',
    inquiryTimingHistory: {},
    dismissedAlerts: [],
    actCount: 3,
    actLabelsRaw: '',
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
    logApiInteractions: true, // Default for new setting
    targetCompletionDate: undefined, // Legacy - kept for backwards compatibility
    stageTargetDates: {
        Zero: undefined,
        Author: undefined,
        House: undefined,
        Press: undefined
    },
    showCompletionEstimate: true, // Default: show the estimate tick
    completionEstimateWindowDays: 30, // Rolling window (days) for completion estimate pace
    coreCompletionPreviewExpanded: true,
    povPreviewExpanded: true,
    enableAiSceneAnalysis: true,
    showFullTripletAnalysis: true,
    enableZeroDraftMode: false,
    synopsisTargetWords: 200, // Target word count for generated summaries (legacy name)
    synopsisWeakThreshold: 75, // Summaries under this word count are considered "weak" (legacy name)
    alsoUpdateSynopsis: false, // When running Summary refresh, also generate Synopsis
    synopsisGenerationMaxWords: 30, // Max words for AI-generated Synopsis
    synopsisGenerationMaxLines: 3, // @deprecated Legacy line-based synopsis limiter
    aiUpdateTimestamps: {}, // Internal AI update timestamps (per-scene)
    discontinuityThreshold: undefined, // Default to auto-calculated (3x median gap or 30 days)
    enableSceneTitleAutoExpand: true, // Default: enabled to maintain current behavior
    enableManuscriptRippleRename: false,
    synopsisHoverMaxLines: 5, // @deprecated Legacy fallback; hover lines now derive from synopsis word limit
    enableHoverDebugLogging: false,
    sortByWhenDate: false, // Default: manuscript order (backward compatible)
    chronologueDurationCapSelection: 'auto',
    readabilityScale: 'normal',
    shouldRestoreTimelineOnLoad: false,
    beatSystem: 'Save The Cat', // Default beat system
    dominantSubplots: {}, // Default: empty map, will use outermost subplot for scenes in multiple subplots
    globalPovMode: 'off',
    lastSeenReleaseNotesVersion: '',
    cachedReleaseNotes: null,
    releaseNotesLastFetched: undefined,
    aiSettings: buildDefaultAiSettings(),
    aiRegistryCacheJson: '',
    aiProviderSnapshotCacheJson: '',
    enablePlanetaryTime: false,
    planetarySectionExpanded: true,
    planetaryProfiles: [],
    activePlanetaryProfileId: '',
    proAccessEnabled: true,
    frontmatterMappings: {},
    enableCustomMetadataMapping: false,
    enableAdvancedYamlEditor: false,
    sceneAdvancedPropertiesEnabled: true,
    enableBeatYamlEditor: false,
    sceneYamlTemplates: {
        base: `Class: Scene
Act: {{Act}}
When: {{When}}
Duration: 1 hour
Synopsis:
Summary:
Pending Edits:
Subplot: {{Subplot}}
Character: {{Character}}
POV:
Words:
Runtime:
Publish Stage: Zero
Status: Todo
Due: {{When}}
Pulse Update:
Summary Update:`,
        advanced: `Place:
Questions:
Reader Emotion:
Internal:
Type:
Shift:
Iteration:`
    },
    beatYamlTemplates: {
        base: `Class: Beat
Act: {{Act}}
Purpose: {{Purpose}}
Beat Model: {{BeatModel}}
Range: {{Range}}`
    },
    beatSystemConfigs: Object.fromEntries(
        [...PLOT_SYSTEM_NAMES, getCustomBeatConfigKey(DEFAULT_CUSTOM_BEAT_SYSTEM_ID)].map((key) => [
            key,
            { beatYamlAdvanced: '', beatHoverMetadataFields: [] }
        ])
    ),
    activeCustomBeatSystemId: DEFAULT_CUSTOM_BEAT_SYSTEM_ID,
    savedBeatSystems: [buildDefaultCustomBeatSystem()],
    bookDesignerTemplates: [],
    manuscriptExportTemplates: [],
    lastUsedManuscriptExportTemplateId: undefined,
    backdropYamlTemplate: `Class: Backdrop                   # Backdrop events appear below the outer ring in Chronologue Mode
When: {{When}}                       # Start Date/Time (YYYY-MM-DD HH:MM)
End: {{End}}                         # End Date/Time (YYYY-MM-DD HH:MM)
Context: Static world context that shapes the story.`,
    backdropYamlTemplates: {
        base: `Class: Backdrop
When: {{When}}
End: {{End}}
Context:`,
        advanced: ``
    },
    enableBackdropYamlEditor: false,
    backdropHoverMetadataFields: [],
    showBackdropRing: true,
    chronologueBackdropMicroRings: [
        { title: '', range: '', color: '#EFBDEB' }
    ],

    // Runtime Estimation defaults
    runtimeRateProfiles: [
        {
            id: 'default',
            label: 'Default',
            contentType: 'novel',
            dialogueWpm: 160,
            actionWpm: 100,
            narrationWpm: 150,
            beatSeconds: 2,
            pauseSeconds: 3,
            longPauseSeconds: 5,
            momentSeconds: 4,
            silenceSeconds: 5,
            sessionPlanning: {
                draftingWpm: undefined,
                recordingWpm: undefined,
                editingWpm: undefined,
                dailyMinutes: undefined,
            },
        },
    ],
    defaultRuntimeProfileId: 'default',
    runtimeContentType: 'novel',
    runtimeDialogueWpm: 160,
    runtimeActionWpm: 100,
    runtimeNarrationWpm: 150,
    runtimeBeatSeconds: 2,
    runtimePauseSeconds: 3,
    runtimeLongPauseSeconds: 5,
    runtimeMomentSeconds: 4,
    runtimeSilenceSeconds: 5,

    // Export / Pandoc defaults
    pandocPath: '',
    pandocFolder: 'Radial Timeline/Pandoc',
    pandocLayouts: [],
    matterWorkflowMode: 'guided',
    lastUsedPandocLayoutByPreset: {},
    pandocTemplates: {
        screenplay: '',
        podcast: '',
        novel: ''
    },

    // Author Progress Report (APR)
    authorProgress: buildDefaultAuthorProgressSettings(),
};
