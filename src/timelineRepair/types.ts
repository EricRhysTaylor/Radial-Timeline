/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Timeline Repair Wizard - Core Types
 */

import type { TFile } from 'obsidian';
import type { TimelineItem } from '../types';

// ============================================================================
// Pattern Presets
// ============================================================================

/**
 * Built-in pattern presets for Level 1 Pattern Sync.
 * Each preset defines how When dates are assigned sequentially.
 */
export type PatternPresetId = 'daily' | 'twoBeatDay' | 'fourBeatDay' | 'weekly';

export interface PatternPreset {
    id: PatternPresetId;
    label: string;
    description: string;
}

export const PATTERN_PRESETS: PatternPreset[] = [
    {
        id: 'daily',
        label: 'Daily',
        description: '+1 day per scene, same time'
    },
    {
        id: 'twoBeatDay',
        label: 'Two-beat day',
        description: 'Morning → Evening → next Morning'
    },
    {
        id: 'fourBeatDay',
        label: 'Four-beat day',
        description: 'Morning → Afternoon → Evening → Night → next Morning'
    },
    {
        id: 'weekly',
        label: 'Weekly',
        description: '+7 days per scene'
    }
];

// ============================================================================
// Time Buckets
// ============================================================================

/**
 * Canonical time buckets for quick time assignment.
 * These are the "Morning / Afternoon / Evening / Night" shortcuts.
 */
export type TimeBucket = 'morning' | 'afternoon' | 'evening' | 'night';

export const TIME_BUCKET_HOURS: Record<TimeBucket, number> = {
    morning: 8,      // 08:00
    afternoon: 13,   // 13:00
    evening: 19,     // 19:00
    night: 23        // 23:00
};

export const TIME_BUCKET_LABELS: Record<TimeBucket, string> = {
    morning: 'Morning',
    afternoon: 'Afternoon',
    evening: 'Evening',
    night: 'Night'
};

// ============================================================================
// Provenance Metadata
// ============================================================================

/**
 * Source of the When value - tracks how it was derived.
 */
export type WhenSource = 'pattern' | 'keyword' | 'ai' | 'manual' | 'original';

/**
 * Confidence level in the inferred When value.
 */
export type WhenConfidence = 'high' | 'med' | 'low';

/**
 * Source of Duration value if inferred.
 */
export type DurationSource = 'inferred' | 'ai' | 'original';

// ============================================================================
// Keyword Cue Types (Level 2)
// ============================================================================

/**
 * Categories of temporal cues detected by Level 2 keyword sweep.
 */
export type TemporalCueCategory = 
    | 'absolute'      // Explicit date/time: "March 15, 2085"
    | 'sameDayTime'   // Same day, different time: "that evening"
    | 'dayJump'       // Day advancement: "the next day", "three weeks later"
    | 'continuity';   // Immediate continuation: "still", "immediately after"

export interface TemporalCue {
    category: TemporalCueCategory;
    match: string;           // The matched text
    value?: string | number; // Parsed value (date string, day offset, etc.)
    confidence: WhenConfidence;
}

// ============================================================================
// AI Response Types (Level 3)
// ============================================================================

/**
 * Structured response from AI temporal parsing.
 */
export interface AiTemporalResponse {
    whenSuggestion: string;          // ISO date string or relative description
    confidence: WhenConfidence;
    evidenceQuotes: string[];        // Supporting text from scene
    durationSuggestion?: number;     // Duration in milliseconds
    durationOngoing?: boolean;       // Scene spans ongoing time
    rationale?: string;              // AI's reasoning
}

// ============================================================================
// Repair Scene Entry
// ============================================================================

/**
 * Core data structure for a scene being processed by the repair wizard.
 * Contains original state, proposed changes, and metadata.
 */
export interface RepairSceneEntry {
    // Identity
    scene: TimelineItem;
    file: TFile;
    manuscriptIndex: number;
    
    // Original state (before repair)
    originalWhen: Date | null;
    originalWhenRaw?: string;  // Raw string from YAML for display
    
    // Proposed state (from analysis pipeline)
    proposedWhen: Date;
    
    // Edited state (user modifications in review modal)
    editedWhen: Date | null;
    
    // Provenance
    source: WhenSource;
    confidence: WhenConfidence;
    cues?: TemporalCue[];        // L2 keyword matches
    aiEvidence?: string[];       // L3 quote evidence
    aiRationale?: string;        // L3 reasoning
    
    // Flags
    needsReview: boolean;
    hasBackwardTime: boolean;    // When < previous scene's When
    hasLargeGap: boolean;        // Unusually large time gap from previous
    isChanged: boolean;          // proposedWhen differs from originalWhen
    
    // Duration (optional)
    originalDuration?: string;
    proposedDuration?: number;   // milliseconds
    durationSource?: DurationSource;
    durationOngoing?: boolean;
}

/**
 * Get the effective When date for a scene entry.
 * Priority: editedWhen > proposedWhen
 */
export function getEffectiveWhen(entry: RepairSceneEntry): Date {
    return entry.editedWhen ?? entry.proposedWhen;
}

// ============================================================================
// Session Diff Model
// ============================================================================

/**
 * A single edit operation in the undo stack.
 */
export interface EditOperation {
    type: 'single' | 'batch' | 'ripple';
    timestamp: number;
    
    // For single edits
    sceneIndex?: number;
    previousWhen?: Date;
    newWhen?: Date;
    
    // For batch/ripple edits
    changes?: Array<{
        sceneIndex: number;
        previousWhen: Date;
        newWhen: Date;
    }>;
}

/**
 * Session-local diff model for tracking changes before commit.
 */
export interface SessionDiffModel {
    entries: RepairSceneEntry[];
    undoStack: EditOperation[];
    redoStack: EditOperation[];
    
    // Ripple mode state
    rippleEnabled: boolean;
    
    // Dirty tracking
    hasUnsavedChanges: boolean;
}

// ============================================================================
// Pipeline Configuration
// ============================================================================

/**
 * Configuration for the repair analysis pipeline.
 */
export interface RepairPipelineConfig {
    // Anchor point
    anchorWhen: Date;
    anchorSceneIndex: number;  // Usually 0 (first scene)
    
    // Pattern configuration
    patternPreset: PatternPresetId;
    
    // Analysis levels to run
    runLevel1: boolean;  // Pattern Sync (always true)
    runLevel2: boolean;  // Keyword Sweep
    runLevel3: boolean;  // AI Temporal Parse
    
    // Level 3 options
    aiConfidenceThreshold: WhenConfidence;  // Auto-apply if AI confidence >= this
    
    // Duration options
    inferDuration: boolean;
    
    // Scope
    subplotFilter?: string;  // Only process scenes in this subplot
    actFilter?: number;      // Only process scenes in this act
}

/**
 * Default pipeline configuration.
 */
export const DEFAULT_PIPELINE_CONFIG: Omit<RepairPipelineConfig, 'anchorWhen'> = {
    anchorSceneIndex: 0,
    patternPreset: 'twoBeatDay',
    runLevel1: true,
    runLevel2: true,
    runLevel3: false,
    aiConfidenceThreshold: 'med',
    inferDuration: false
};

// ============================================================================
// Pipeline Results
// ============================================================================

/**
 * Results from running the repair pipeline.
 */
export interface RepairPipelineResult {
    entries: RepairSceneEntry[];
    
    // Statistics
    totalScenes: number;
    scenesChanged: number;
    scenesNeedingReview: number;
    scenesWithBackwardTime: number;
    scenesWithLargeGaps: number;
    
    // Level-specific stats
    level1Applied: number;
    level2Refined: number;
    level3Refined: number;
}

// ============================================================================
// Modal State
// ============================================================================

/**
 * State for the Timeline Repair Modal.
 */
export type ModalPhase = 'config' | 'analyzing' | 'review';

export interface ModalState {
    phase: ModalPhase;
    config: RepairPipelineConfig | null;
    result: RepairPipelineResult | null;
    session: SessionDiffModel | null;
    
    // Review phase filters
    filterNeedsReview: boolean;
    filterAiDerived: boolean;
    filterKeywordDerived: boolean;
    filterPatternOnly: boolean;
    
    // Selection state
    selectedIndices: Set<number>;
}

// ============================================================================
// Frontmatter Update Types
// ============================================================================

/**
 * A pending frontmatter update to be written.
 */
export interface FrontmatterUpdate {
    file: TFile;
    when: Date;
    whenSource: WhenSource;
    whenConfidence: WhenConfidence;
    
    // Optional fields
    duration?: number;
    durationSource?: DurationSource;
    durationOngoing?: boolean;
    needsReview?: boolean;
}

/**
 * Result of batch frontmatter updates.
 */
export interface FrontmatterWriteResult {
    success: number;
    failed: number;
    errors: Array<{ file: TFile; error: string }>;
}

