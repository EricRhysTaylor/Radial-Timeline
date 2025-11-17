/*
 * Plugin settings schema
 */

import type { EmbeddedReleaseNotesBundle } from './releaseNotes';

export type PovMarkerLabel = 'POV' | '1PV' | '2PV' | '3PO' | '3PL' | 'OBJ';

export type GlobalPovMode = 'off' | 'first' | 'second' | 'third' | 'omni' | 'objective';

export type ScenePovKeyword = 'first' | 'second' | 'third' | 'omni' | 'objective' | 'one' | 'two' | 'three' | 'count';

export interface AiContextTemplate {
    id: string;
    name: string;
    prompt: string;
    isBuiltIn: boolean;
}

export interface RadialTimelineSettings {
    sourcePath: string;
    validFolderPaths: string[];
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
    openaiApiKey?: string;
    anthropicApiKey?: string;
    anthropicModelId?: string;
    geminiApiKey?: string;
    geminiModelId?: string;
    defaultAiProvider?: 'openai' | 'anthropic' | 'gemini';
    openaiModelId?: string;
    enableAiSceneAnalysis: boolean;
    enableZeroDraftMode?: boolean;
    metadataRefreshDebounceMs?: number;
    showEstimate?: boolean;
    enableSceneTitleAutoExpand?: boolean;
    enableHoverDebugLogging?: boolean;
    sortByWhenDate?: boolean;
    chronologueDurationCapSelection?: string;
    discontinuityThreshold?: string;
    aiContextTemplates?: AiContextTemplate[];
    activeAiContextTemplateId?: string;
    beatSystem?: string;
    dominantSubplots?: Record<string, string>;
    globalPovMode?: GlobalPovMode;
    _isResuming?: boolean;
    _resumingMode?: 'flagged' | 'unprocessed' | 'force-all';
    lastSeenReleaseNotesVersion?: string;
    cachedReleaseNotes?: EmbeddedReleaseNotesBundle | null;
    releaseNotesLastFetched?: string;
}
