/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Timeline Repair Wizard - Pattern Sync
 * Deterministic baseline timeline assignment based on manuscript order.
 */

import type { TFile } from 'obsidian';
import type { TimelineItem } from '../types';
import { parseWhenField } from '../utils/date';
import {
    type PatternPresetId,
    type RepairSceneEntry,
    type TimeBucket,
    TIME_BUCKET_HOURS,
    SCAFFOLD_PATTERNS
} from './types';

// ============================================================================
// Pattern Generators
// ============================================================================

/**
 * Get the next date based on pattern preset.
 * 
 * @param currentDate - Current date in the sequence
 * @param beatIndex - Current beat index (for multi-beat patterns)
 * @param presetId - The pattern preset to use
 * @returns Object with next date and updated beat index
 */
function getNextPatternDate(
    currentDate: Date,
    beatIndex: number,
    presetId: PatternPresetId
): { date: Date; beatIndex: number } {
    const result = new Date(currentDate);
    const pattern = SCAFFOLD_PATTERNS[presetId];
    
    if (pattern.type === 'interval') {
        if (presetId === 'weekly') {
            result.setDate(result.getDate() + 7);
        } else {
            // default to daily
            result.setDate(result.getDate() + 1);
        }
        return { date: result, beatIndex: 0 };
    }
    
    // Cycle pattern
    const nextBeat = (beatIndex + 1) % pattern.sequence.length;
    const bucket = pattern.sequence[nextBeat];
    result.setHours(TIME_BUCKET_HOURS[bucket], 0, 0, 0);
    
    // If we wrapped around, advance the day
    if (nextBeat === 0) {
        result.setDate(result.getDate() + 1);
    }
    
    return { date: result, beatIndex: nextBeat };
}

/**
 * Get the initial beat index for a given anchor date and preset.
 * Determines which beat in the cycle the anchor falls on based on its hour.
 */
export function getInitialBeatIndex(anchorDate: Date, presetId: PatternPresetId): number {
    const pattern = SCAFFOLD_PATTERNS[presetId];
    if (pattern.type === 'interval') return 0;
    
    const bucket = detectTimeBucket(anchorDate);
    const index = pattern.sequence.indexOf(bucket);
    
    // If exact bucket not in sequence, default to 0, or could do a closest match, 
    // but returning 0 is safe.
    return index >= 0 ? index : 0;
}

// ============================================================================
// Main Pattern Sync Function
// ============================================================================

export interface PatternSyncOptions {
    /** The anchor date to start the pattern from */
    anchorWhen: Date;
    
    /** Which scene index to anchor (usually 0) */
    anchorSceneIndex?: number;
    
    /** The pattern preset to use */
    patternPreset: PatternPresetId;
}

export interface PatternSyncInput {
    scene: TimelineItem;
    file: TFile;
    manuscriptIndex: number;
}

/**
 * Pattern Sync
 * 
 * Assigns When dates to scenes sequentially based on manuscript order
 * using a deterministic pattern. This creates a clean temporal baseline
 * that can be optionally refined by simple text cues.
 * 
 * Guarantees:
 * - Extremely fast (no text parsing, no API calls)
 * - Deterministic output for same input
 * - Every scene gets a When date
 * - Chronologue immediately becomes usable
 * 
 * @param scenes - Scenes in manuscript order with file references
 * @param options - Pattern configuration
 * @returns Array of RepairSceneEntry with pattern-assigned dates
 */
export function runPatternSync(
    scenes: PatternSyncInput[],
    options: PatternSyncOptions
): RepairSceneEntry[] {
    const { anchorWhen, patternPreset, anchorSceneIndex = 0 } = options;
    
    if (scenes.length === 0) {
        return [];
    }
    
    const entries: RepairSceneEntry[] = [];
    
    // Initialize beat index based on anchor time
    let beatIndex = getInitialBeatIndex(anchorWhen, patternPreset);
    let currentDate = new Date(anchorWhen);
    
    // Process scenes in manuscript order
    for (let i = 0; i < scenes.length; i++) {
        const { scene, file, manuscriptIndex } = scenes[i];
        
        // Parse original When if it exists
        let originalWhen: Date | null = null;
        let originalWhenRaw: string | undefined;
        
        if (scene.when instanceof Date && !isNaN(scene.when.getTime())) {
            originalWhen = scene.when;
        } else if (typeof scene.when === 'string') {
            originalWhenRaw = scene.when;
            const parsed = parseWhenField(scene.when);
            if (parsed) {
                originalWhen = parsed;
            }
        }
        
        // For the anchor scene, use the anchor date
        // For scenes before anchor, work backwards (rare case)
        // For scenes after anchor, work forwards with pattern
        let proposedWhen: Date;
        
        if (i === anchorSceneIndex) {
            proposedWhen = new Date(anchorWhen);
        } else if (i < anchorSceneIndex) {
            // Work backwards from anchor (subtract days)
            const offset = anchorSceneIndex - i;
            proposedWhen = new Date(anchorWhen);
            proposedWhen.setDate(proposedWhen.getDate() - offset);
        } else {
            // Normal forward progression
            const next = getNextPatternDate(currentDate, beatIndex, patternPreset);
            proposedWhen = next.date;
            beatIndex = next.beatIndex;
            currentDate = proposedWhen;
        }
        
        // Check if this changes the original
        const isChanged = originalWhen === null || 
            proposedWhen.getTime() !== originalWhen.getTime();
        
        const entry: RepairSceneEntry = {
            scene,
            file,
            manuscriptIndex,
            
            originalWhen,
            originalWhenRaw,
            proposedWhen,
            editedWhen: null,
            
            source: 'pattern',
            confidence: 'high',  // Pattern is deterministic, so high confidence
            
            needsReview: false,
            hasBackwardTime: false,
            hasLargeGap: false,
            isChanged
        };
        
        entries.push(entry);
    }
    
    // Second pass: detect backward time and large gaps
    detectTemporalIssues(entries);
    
    return entries;
}

/**
 * Detect temporal issues in the sequence:
 * - Backward time: scene's When is before previous scene's When
 * - Large gaps: unusually large time gaps between scenes
 */
function detectTemporalIssues(entries: RepairSceneEntry[]): void {
    if (entries.length < 2) return;
    
    // Calculate median gap for large gap detection
    const gaps: number[] = [];
    for (let i = 1; i < entries.length; i++) {
        const prev = entries[i - 1].proposedWhen;
        const curr = entries[i].proposedWhen;
        gaps.push(curr.getTime() - prev.getTime());
    }
    
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
    const largeGapThreshold = medianGap * 5; // 5x median is "large"
    
    // Detect issues
    for (let i = 1; i < entries.length; i++) {
        const prevWhen = entries[i - 1].proposedWhen;
        const currWhen = entries[i].proposedWhen;
        const gap = currWhen.getTime() - prevWhen.getTime();
        
        // Backward time
        if (gap < 0) {
            entries[i].hasBackwardTime = true;
            entries[i].needsReview = true;
        }
        
        // Large gap
        if (gap > largeGapThreshold && largeGapThreshold > 0) {
            entries[i].hasLargeGap = true;
        }
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Apply a time bucket to a date, keeping the same date but changing the time.
 */
export function applyTimeBucket(date: Date, bucket: TimeBucket): Date {
    const result = new Date(date);
    result.setHours(TIME_BUCKET_HOURS[bucket], 0, 0, 0);
    return result;
}

/**
 * Shift a date by a number of days.
 */
export function shiftDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

/**
 * Shift a date by a number of hours.
 */
export function shiftHours(date: Date, hours: number): Date {
    const result = new Date(date);
    result.setHours(result.getHours() + hours);
    return result;
}

/**
 * Detect which time bucket a date falls into.
 */
export function detectTimeBucket(date: Date): TimeBucket {
    const hour = date.getHours();
    if (hour < 11) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 21) return 'evening';
    return 'night';
}

/**
 * Format a When date for display in the review modal.
 */
export function formatWhenForDisplay(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hour}:${minute}`;
}

/**
 * Format just the time portion for compact display.
 */
export function formatTimeForDisplay(date: Date): string {
    const hour = date.getHours();
    const minute = date.getMinutes();
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    
    if (minute === 0) {
        return `${hour12}${ampm}`;
    }
    return `${hour12}:${String(minute).padStart(2, '0')}${ampm}`;
}
