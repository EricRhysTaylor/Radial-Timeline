/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Timeline Repair Wizard - Module Exports
 */

// Types
export * from './types';

// Level 1: Pattern Sync
export {
    runPatternSync,
    applyTimeBucket,
    shiftDays,
    shiftHours,
    detectTimeBucket,
    formatWhenForDisplay,
    formatTimeForDisplay,
    type PatternSyncOptions,
    type PatternSyncInput
} from './patternSync';

// Level 2: Keyword Sweep
export {
    runKeywordSweep,
    parseAmPmTime,
    type KeywordSweepOptions
} from './keywordSweep';

// Level 3: AI Temporal Parse
export {
    runAiTemporalParse,
    type AiTemporalParseOptions
} from './aiTemporalParse';

// Pipeline
export {
    runRepairPipeline,
    collectScenesForRepair,
    filterBySubplot,
    filterByAct,
    getUniqueSubplots,
    getUniqueActs,
    type PipelineCallbacks
} from './RepairPipeline';

// Session Diff
export {
    createSession,
    editSceneWhen,
    shiftSceneDays,
    setSceneTimeBucket,
    shiftMultipleDays,
    setMultipleTimeBucket,
    editMultipleScenes,
    toggleRippleMode,
    getRippleAffectedCount,
    undo,
    redo,
    canUndo,
    canRedo,
    getEntriesNeedingReview,
    getEntriesWithBackwardTime,
    getEntriesBySource,
    getChangedCount,
    getNeedsReviewCount
} from './sessionDiff';

// Frontmatter Writer
export {
    prepareUpdates,
    writeFrontmatterUpdates,
    writeSessionChanges,
    previewUpdates,
    getChangeSummary,
    clearProvenanceFields,
    clearAllProvenanceFields,
    type WriteOptions
} from './frontmatterWriter';

