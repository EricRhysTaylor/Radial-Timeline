/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { formatNumber } from '../../utils/svg';
import { Scene } from '../../main';
import { parseWhenField, calculateTimeSpan, parseDuration, detectDiscontinuities, detectSceneOverlaps } from '../../utils/date';


/**
 * Render the chronological timeline arc with proportional tick marks
 * This creates a 3px arc around the outer perimeter with tick marks positioned
 * based on actual time proportions, not scene positions.
 * 
 * @param scenes - Array of scenes sorted in manuscript order
 * @param outerRadius - Outer radius of the scene ring
 * @param arcWidth - Width of the arc stroke
 * @param scenePositions - Optional map of scene angular positions (manuscript order, keyed by scene path/title)
 */
export function renderChronologueTimelineArc(
    scenes: Scene[],
    outerRadius: number,
    arcWidth: number = 3,
    scenePositions?: Map<string, { startAngle: number; endAngle: number }>
): string {
    console.log('[Chronologue] renderChronologueTimelineArc start', {
        sceneCount: scenes.length,
        outerRadius,
        arcWidth,
        callStack: new Error().stack?.split('\n').slice(1, 4).join('\n')
    });
    // Parse all When fields and filter out invalid dates (deduplicate by path/title+time)
    const seenKeys = new Set<string>();
    const sceneEntries: Array<{ scene: Scene; date: Date; sourceIndex: number }> = [];

    scenes.forEach((scene, index) => {
        const whenDate =
            scene.when instanceof Date
                ? scene.when
                : parseWhenField(typeof scene.when === 'string' ? scene.when : '');
        if (!whenDate) return;

        const key = scene.path
            ? `path:${scene.path}`
            : `title:${scene.title ?? ''}::${whenDate.getTime()}`;
        if (seenKeys.has(key)) return;
        seenKeys.add(key);
        sceneEntries.push({ scene, date: whenDate, sourceIndex: index });
    });

    const validDates = sceneEntries.map(entry => entry.date);

    if (validDates.length === 0) {
        console.log('[Chronologue] renderChronologueTimelineArc abort - no valid dates');
        return ''; // No valid dates to render
    }
    
    // Calculate time span
    const timeSpan = calculateTimeSpan(validDates);
    const earliestDate = validDates.reduce((earliest, current) =>
        current.getTime() < earliest.getTime() ? current : earliest
    );
    
    let svg = '';
    
    // Render the chronologue timeline elements
    const arcRadius = outerRadius + 13; // Position outside the scene ring (3px further out)
    svg += `<g class="rt-chronologue-timeline-arc">`;
    
    // Level 4 - Scene Duration Arcs (manuscript-order positions) - RENDER FIRST (behind ticks)
    if (scenePositions) {
        const durationSegments = renderDurationTickArcs({
            sceneEntries,
            arcRadius,
            timeSpanTotalMs: timeSpan.totalMs,
            earliestMs: earliestDate.getTime(),
            scenePositions
        });
        if (durationSegments) {
            svg += durationSegments;
        }
    }
    
    // Render time labels
    svg += `</g>`;
    
    return svg;
}

interface DurationTickArcParams {
    sceneEntries: Array<{ scene: Scene; date: Date; sourceIndex: number }>;
    arcRadius: number;
    timeSpanTotalMs: number;
    earliestMs: number;
    scenePositions: Map<string, { startAngle: number; endAngle: number }>;
}

function renderDurationTickArcs(params: DurationTickArcParams): string | null {
    const { sceneEntries, arcRadius, timeSpanTotalMs, earliestMs, scenePositions } = params;
    console.log('[Chronologue] renderDurationTickArcs start', {
        sceneEntriesCount: sceneEntries.length,
        arcRadius,
        timeSpanTotalMs,
        earliestMs,
        hasScenePositions: !!scenePositions
    });
    if (sceneEntries.length === 0 || timeSpanTotalMs <= 0) {
        console.log('[Chronologue] renderDurationTickArcs abort - no entries or zero timespan');
        return null;
    }
    
    const sortedEntries = sceneEntries
        .slice()
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    // Parse all durations and categorize them
    interface DurationInfo {
        durationMs: number | null; // null = unparseable, 0 = no duration, >0 = valid
        rawDuration: string | undefined;
    }
    
    const parsedDurations: DurationInfo[] = sortedEntries.map(entry => {
        const raw = entry.scene.Duration;
        if (!raw) {
            return { durationMs: 0, rawDuration: raw }; // No duration field
        }
        const value = parseDuration(raw);
        if (value === null) {
            return { durationMs: null, rawDuration: raw }; // Unparseable (e.g., "ongoing")
        }
        return { durationMs: value, rawDuration: raw };
    });

    // Collect valid (parseable, positive) durations
    const validDurationValues: number[] = [];
    parsedDurations.forEach(info => {
        if (info.durationMs && info.durationMs > 0) {
            validDurationValues.push(info.durationMs);
        }
    });

    if (validDurationValues.length === 0 && !parsedDurations.some(d => d.durationMs === null)) {
        console.log('[Chronologue] renderDurationTickArcs abort - no valid or unparseable durations');
        return null;
    }

    // Calculate threshold using 75th percentile instead of median for better outlier detection
    // This prevents common longer scenes from being marked as overflow
    const sortedDurations = [...validDurationValues].sort((a, b) => a - b);
    const medianDurationMs = validDurationValues.length > 0 ? calculateMedian(validDurationValues) : 0;
    const percentile75Index = Math.floor(sortedDurations.length * 0.75);
    const percentile75Ms = sortedDurations.length > 0 ? sortedDurations[percentile75Index] : medianDurationMs;
    
    // Use 75th percentile × 3 as threshold (catches real outliers, not common long scenes)
    const NORMALIZATION_MULTIPLIER = 3;
    const threshold = percentile75Ms > 0 ? percentile75Ms * NORMALIZATION_MULTIPLIER : Infinity;
    
    // The longest scene (absolute max) will fill 100% of the gap
    const maxValidDurationMs = validDurationValues.length > 0 
        ? Math.max(...validDurationValues) 
        : 1;

    console.log('[Chronologue] renderDurationTickArcs normalization', {
        validDurationCount: validDurationValues.length,
        totalSceneEntries: sortedEntries.length,
        scenesWithoutDuration: sortedEntries.length - validDurationValues.length,
        medianDurationMs,
        medianDurationHours: medianDurationMs / (1000 * 60 * 60),
        percentile75Ms,
        percentile75Hours: percentile75Ms / (1000 * 60 * 60),
        threshold,
        thresholdHours: threshold / (1000 * 60 * 60),
        maxValidDurationMs,
        maxValidDurationHours: maxValidDurationMs / (1000 * 60 * 60),
        scenesOverThreshold: validDurationValues.filter(d => d > threshold).length
    });

    // Detect overlaps (when scene.when + duration > nextScene.when)
    const overlapIndices = detectSceneOverlaps(sortedEntries.map(entry => ({
        when: entry.date,
        Duration: entry.scene.Duration
    } as { when: Date; Duration?: string })));

    console.log('[Chronologue] Overlap detection', {
        totalScenes: sortedEntries.length,
        overlapCount: overlapIndices.size,
        overlapIndices: Array.from(overlapIndices),
        sceneDetails: sortedEntries.map((entry, idx) => ({
            idx,
            title: entry.scene.title,
            when: entry.date.toISOString(),
            duration: entry.scene.Duration,
            isOverlap: overlapIndices.has(idx)
        }))
    });

    const durationPaths: string[] = [];

    const TWO_PI = Math.PI * 2;
    const EDGE_MARGIN_RAD = Math.PI / 360; // 0.5 degree margin from tick mark
    const STUB_FILL_RATIO = 0.15; // Red stub fills 15% of gap

    sortedEntries.forEach((entry, idx) => {
        const durationInfo = parsedDurations[idx];
        const durationMs = durationInfo.durationMs;
        
        // Skip scenes with no duration field at all
        if (durationMs === 0) {
            return; // No bar shown
        }

        // Get manuscript-order position for this scene using path or title as key
        const sceneKey = entry.scene.path || `title:${entry.scene.title || ''}`;
        const manuscriptPosition = scenePositions.get(sceneKey);
        if (!manuscriptPosition) {
            console.warn(`[Chronologue] No position found for scene key "${sceneKey}", title: ${entry.scene.title}`);
            return;
        }

        // Add 2px margins on both sides of the duration arc
        const marginAngle = 2 / arcRadius; // Convert 2px to radians
        const startAngle = manuscriptPosition.startAngle + marginAngle;
        const endAngle = manuscriptPosition.endAngle - marginAngle;
        const availableAngle = endAngle - startAngle;
        
        if (availableAngle <= 0) return;

        let spanAngle: number;
        let isUnparseable = false;
        const isOverlap = overlapIndices.has(idx);

        // Determine arc span based on duration type
        if (durationMs === null) {
            // Unparseable duration (e.g., "ongoing") - show red stub
            spanAngle = availableAngle * STUB_FILL_RATIO;
            isUnparseable = true;
        } else {
            // Valid duration - proportional to maxValidDurationMs (longest scene fills 100%)
            const ratio = maxValidDurationMs > 0 ? durationMs / maxValidDurationMs : 0;
            spanAngle = availableAngle * ratio;
        }

        if (spanAngle <= 0) return;

        const arcStart = startAngle;
        const arcEnd = arcStart + spanAngle;
        const largeArcFlag = spanAngle > Math.PI ? 1 : 0;

        // Determine arc class and styling
        let arcClass = 'rt-duration-arc';
        if (isUnparseable) {
            arcClass += ' rt-duration-arc-unparseable'; // Red stub
        } else if (isOverlap) {
            arcClass += ' rt-duration-arc-overlap'; // Magenta for overlaps
        }

        const x1 = formatNumber(arcRadius * Math.cos(arcStart));
        const y1 = formatNumber(arcRadius * Math.sin(arcStart));
        const x2 = formatNumber(arcRadius * Math.cos(arcEnd));
        const y2 = formatNumber(arcRadius * Math.sin(arcEnd));

        durationPaths.push(
            `<path d="M ${x1} ${y1} A ${formatNumber(arcRadius)} ${formatNumber(arcRadius)} 0 ${largeArcFlag} 1 ${x2} ${y2}" class="${arcClass}" />`
        );
    });
    
    if (durationPaths.length === 0) {
        console.log('[Chronologue] No duration arcs rendered', {
            sceneCount: sortedEntries.length,
            timeSpanTotalMs,
            hadParsedDuration: sortedEntries.some(entry => {
                const parsed = parseDuration(entry.scene.Duration);
                return parsed !== null && parsed > 0;
            })
        });
        return null;
    }
    
    console.log('[Chronologue] Duration arcs rendered - SUMMARY', {
        totalDurationPaths: durationPaths.length,
        firstFewPaths: durationPaths.slice(0, 3).map(p => p.substring(0, 100))
    });
    
    return `<g class="rt-chronologue-duration-ticks">
        ${durationPaths.join('')}
    </g>`;
}

function calculateMedian(values: number[]): number {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}

/**
 * Map a time value to an angular position on the timeline arc
 */
function mapTimeToAngle(timeMs: number, startMs: number, endMs: number): number {
    const progress = (timeMs - startMs) / (endMs - startMs);
    return progress * 2 * Math.PI - Math.PI / 2; // Start at top (12 o'clock)
}

/**
 * Render elapsed time arc between two selected scenes
 */
export function renderElapsedTimeArc(
    scene1: Scene,
    scene2: Scene,
    outerRadius: number,
    arcWidth: number = 2
): string {
    const date1 = parseWhenField(typeof scene1.when === 'string' ? scene1.when : '');
    const date2 = parseWhenField(typeof scene2.when === 'string' ? scene2.when : '');
    
    if (!date1 || !date2) {
        return '';
    }
    
    // Determine which scene is earlier
    const [earlierScene, laterScene] = date1.getTime() < date2.getTime() ? [scene1, scene2] : [scene2, scene1];
    const [earlierDate, laterDate] = date1.getTime() < date2.getTime() ? [date1, date2] : [date2, date1];
    
    const arcRadius = outerRadius + 15; // Position between main arc and tick marks
    const startAngle = mapTimeToAngle(earlierDate.getTime(), earlierDate.getTime(), laterDate.getTime());
    const endAngle = mapTimeToAngle(laterDate.getTime(), earlierDate.getTime(), laterDate.getTime());
    
    // Create arc path
    const largeArcFlag = (endAngle - startAngle) > Math.PI ? 1 : 0;
    const x1 = formatNumber(arcRadius * Math.cos(startAngle));
    const y1 = formatNumber(arcRadius * Math.sin(startAngle));
    const x2 = formatNumber(arcRadius * Math.cos(endAngle));
    const y2 = formatNumber(arcRadius * Math.sin(endAngle));
    
    const arcPath = `M ${x1} ${y1} A ${formatNumber(arcRadius)} ${formatNumber(arcRadius)} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
    
    return `<g class="rt-elapsed-time-arc">
        <path d="${arcPath}" fill="none" stroke="var(--interactive-accent)" stroke-width="${arcWidth}" opacity="0.8"/>
    </g>`;
}

/**
 * Arc 1: Chronological Timeline Backbone
 * Renders discontinuity symbols "~" at large time gaps between consecutive scenes
 * 
 * @param scenes - Scenes with When dates (sorted chronologically)
 * @param outerRadius - Outer radius of scene ring
 * @param discontinuityThreshold - Gap multiplier for discontinuity detection (default 3x median)
 * @param scenePositions - Map of scene angular positions (manuscript order, keyed by scene path/title)
 * @returns SVG string
 */
export function renderChronologicalBackboneArc(
    scenes: Scene[],
    outerRadius: number,
    discontinuityThreshold: number = 3,
    scenePositions?: Map<string, { startAngle: number; endAngle: number }>
): string {
    console.log('[Chronologue] renderChronologicalBackboneArc - Analyzing scenes');
    scenes.forEach((s, idx) => {
        const sceneKey = s.path || `title:${s.title || ''}`;
        const hasPosition = scenePositions?.has(sceneKey);
        console.log(`  Scene ${idx}: "${s.title}" itemType=${s.itemType} when=${s.when} hasPosition=${hasPosition} key=${sceneKey}`);
    });
    
    // Parse dates and filter valid ones (only Scene items, not Beat items)
    const validScenes: { scene: Scene; date: Date }[] = [];
    scenes.forEach(scene => {
        // Skip beats - only process Scene items in Chronologue mode
        if (scene.itemType !== 'Scene') return;
        
        let whenDate: Date | null = null;
        if (scene.when instanceof Date) {
            whenDate = scene.when;
        } else if (typeof scene.when === 'string') {
            whenDate = parseWhenField(scene.when);
        }
        
        if (whenDate) {
            validScenes.push({ scene, date: whenDate });
        }
    });
    
    console.log('[Chronologue] Valid scenes parsed', {
        validSceneCount: validScenes.length,
        willReturn: validScenes.length === 0 || !scenePositions
    });
    
    if (validScenes.length === 0 || !scenePositions) return '';
    
    // Deduplicate scenes (same path = same scene, even if it appears in multiple subplots)
    const uniqueScenesMap = new Map<string, Scene>();
    validScenes.forEach(({ scene }) => {
        const key = scene.path || `title:${scene.title || ''}`;
        if (!uniqueScenesMap.has(key)) {
            uniqueScenesMap.set(key, scene);
        }
    });
    
    // Sort unique scenes chronologically for discontinuity detection
    const uniqueScenesSorted = Array.from(uniqueScenesMap.values()).sort((a, b) => {
        const dateA = a.when instanceof Date ? a.when : parseWhenField(String(a.when));
        const dateB = b.when instanceof Date ? b.when : parseWhenField(String(b.when));
        if (!dateA || !dateB) return 0;
        return dateA.getTime() - dateB.getTime();
    });
    
    // Detect discontinuities (large time gaps between consecutive chronological scenes)
    const discontinuityIndices = detectDiscontinuities(uniqueScenesSorted, discontinuityThreshold);
    
    console.log('[Chronologue] Discontinuity detection', {
        originalSceneCount: scenes.length,
        uniqueSceneCount: uniqueScenesSorted.length,
        discontinuityCount: discontinuityIndices.length,
        discontinuityIndices,
        threshold: discontinuityThreshold,
        scenesWithGaps: discontinuityIndices.map(idx => ({
            idx,
            title: uniqueScenesSorted[idx]?.title,
            when: uniqueScenesSorted[idx]?.when
        }))
    });
    
    if (discontinuityIndices.length === 0) return '';
    
    const arcRadius = outerRadius + 13; // Same radius as duration arcs
    
    let svg = `<g class="rt-chronologue-backbone-discontinuities">`;
    
    // Add discontinuity "~" symbols at detected gaps
    discontinuityIndices.forEach(sceneIndex => {
        if (sceneIndex >= uniqueScenesSorted.length) return;
        
        const currScene = uniqueScenesSorted[sceneIndex];
        
        // Get manuscript-order position for this scene
        const sceneKey = currScene.path || `title:${currScene.title || ''}`;
        const manuscriptPosition = scenePositions.get(sceneKey);
        
        console.log('[Chronologue] Rendering discontinuity marker', {
            sceneIndex,
            title: currScene.title,
            sceneKey,
            foundPosition: !!manuscriptPosition,
            startAngle: manuscriptPosition?.startAngle,
            endAngle: manuscriptPosition?.endAngle
        });
        
        if (!manuscriptPosition) return;
        
        // Position the "~" at the MIDDLE of the scene arc
        const midAngle = (manuscriptPosition.startAngle + manuscriptPosition.endAngle) / 2;
        
        const x = formatNumber(arcRadius * Math.cos(midAngle));
        const y = formatNumber(arcRadius * Math.sin(midAngle));
        
        // Discontinuity symbol "~" centered in the middle of the scene arc
        svg += `<text x="${x}" y="${y}" class="rt-duration-overflow-text" text-anchor="middle" dominant-baseline="middle">~</text>`;
    });
    
    svg += `</g>`;
    
    return svg;
}

/**
 * Arc 2: Scene Duration Overlay
 * Renders colored arc segments showing each scene's duration
 * Red segments indicate temporal overlaps
 * 
 * @param scenes - Scenes with When dates and Duration fields (sorted chronologically)
 * @param outerRadius - Outer radius of scene ring
 * @returns SVG string
 */
export function renderSceneDurationArcs(
    scenes: Scene[],
    outerRadius: number
): string {
    // Detect overlaps
    const overlapIndices = detectSceneOverlaps(scenes);
    
    // Parse dates and calculate time range
    const validScenes: { scene: Scene; date: Date; index: number }[] = [];
    scenes.forEach((scene, index) => {
        const whenDate =
            scene.when instanceof Date
                ? scene.when
                : parseWhenField(typeof scene.when === 'string' ? scene.when : '');
        if (whenDate) {
            validScenes.push({ scene, date: whenDate, index });
        }
    });
    
    if (validScenes.length === 0) return '';
    
    const earliestMs = Math.min(...validScenes.map(s => s.date.getTime()));
    const latestMs = Math.max(...validScenes.map(s => s.date.getTime()));
    const totalMs = latestMs - earliestMs;
    
    if (totalMs === 0) return ''; // All scenes at same time
    
    const arcRadius = outerRadius + 9; // Position outside backbone arc
    const arcWidth = 3.5;
    
    let svg = `<g class="rt-scene-duration-arcs">`;
    
    validScenes.forEach(({ scene, date, index }) => {
        const durationMs = parseDuration(scene.Duration);
        if (!durationMs || durationMs === 0) return; // Skip scenes without duration
        
        // Calculate arc segment
        const startMs = date.getTime();
        const endMs = startMs + durationMs;
        
        const startAngle = mapTimeToAngle(startMs, earliestMs, latestMs);
        const endAngle = mapTimeToAngle(Math.min(endMs, latestMs), earliestMs, latestMs);
        
        // Determine color based on overlap
        const hasOverlap = overlapIndices.has(index);
        const color = hasOverlap ? 'var(--text-error)' : 'var(--text-success)';
        const opacity = Math.min(0.3 + (durationMs / (24 * 60 * 60 * 1000)) * 0.1, 0.8); // Opacity based on duration
        
        // Create arc path
        const largeArcFlag = (endAngle - startAngle) > Math.PI ? 1 : 0;
        const x1 = formatNumber(arcRadius * Math.cos(startAngle));
        const y1 = formatNumber(arcRadius * Math.sin(startAngle));
        const x2 = formatNumber(arcRadius * Math.cos(endAngle));
        const y2 = formatNumber(arcRadius * Math.sin(endAngle));
        
        const arcPath = `M ${x1} ${y1} A ${formatNumber(arcRadius)} ${formatNumber(arcRadius)} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
        
        svg += `<path d="${arcPath}" fill="none" stroke="${color}" stroke-width="${arcWidth}" opacity="${opacity}" class="rt-duration-arc ${hasOverlap ? 'rt-overlap' : ''}"/>`;
    });
    
    svg += `</g>`;
    
    return svg;
}
