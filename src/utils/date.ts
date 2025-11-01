/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Time span information for determining appropriate time labels
 */
export interface TimeSpanInfo {
    /** Total time span in milliseconds */
    totalMs: number;
    /** Time span in hours */
    hours: number;
    /** Time span in days */
    days: number;
    /** Time span in weeks */
    weeks: number;
    /** Time span in months (approximate) */
    months: number;
    /** Time span in years */
    years: number;
    /** Recommended time unit for labels */
    recommendedUnit: 'hours' | 'days' | 'weeks' | 'months' | 'years';
}

/**
 * Time label information for rendering around the timeline arc
 */
export interface TimeLabelInfo {
    /** Label text (e.g., "Day 1", "Week 2") */
    text: string;
    /** Angular position in radians */
    angle: number;
    /** Time value in milliseconds */
    timeMs: number;
}

/**
 * Parse a When field string into a Date object
 * Supports ISO formats: YYYY-MM-DD, YYYY-MM-DDTHH:MM:SS, YYYY-MM-DD HH:MM
 */
/**
 * Parse When field from scene metadata
 * SINGLE SOURCE OF TRUTH for date parsing
 * Always interprets dates as LOCAL TIME (not UTC) to avoid timezone shifts
 * 
 * Supported formats:
 * - YYYY-MM-DD (date only, time defaults to 00:00:00 local)
 * - YYYY-MM-DD HH:MM (date + time in local timezone)
 * - YYYY-MM-DD HH:MM:SS (date + time with seconds in local timezone)
 * 
 * @param when - Date string from scene metadata
 * @returns Date object in local time, or null if invalid
 */
export function parseWhenField(when: string): Date | null {
    if (!when || typeof when !== 'string') return null;
    
    const trimmed = when.trim();
    
    // Try ISO date format: YYYY-MM-DD
    // Parse as local time by extracting components
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (dateOnlyMatch) {
        const year = parseInt(dateOnlyMatch[1], 10);
        const month = parseInt(dateOnlyMatch[2], 10) - 1; // JS months are 0-indexed
        const day = parseInt(dateOnlyMatch[3], 10);
        const date = new Date(year, month, day, 0, 0, 0, 0); // Local time at midnight
        return isNaN(date.getTime()) ? null : date;
    }
    
    // Try date + time with seconds: YYYY-MM-DD HH:MM:SS
    const dateTimeSecondsMatch = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(trimmed);
    if (dateTimeSecondsMatch) {
        const year = parseInt(dateTimeSecondsMatch[1], 10);
        const month = parseInt(dateTimeSecondsMatch[2], 10) - 1;
        const day = parseInt(dateTimeSecondsMatch[3], 10);
        const hour = parseInt(dateTimeSecondsMatch[4], 10);
        const minute = parseInt(dateTimeSecondsMatch[5], 10);
        const second = parseInt(dateTimeSecondsMatch[6], 10);
        const date = new Date(year, month, day, hour, minute, second, 0); // Local time
        return isNaN(date.getTime()) ? null : date;
    }
    
    // Try date + time format: YYYY-MM-DD HH:MM
    const dateTimeMatch = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(trimmed);
    if (dateTimeMatch) {
        const year = parseInt(dateTimeMatch[1], 10);
        const month = parseInt(dateTimeMatch[2], 10) - 1;
        const day = parseInt(dateTimeMatch[3], 10);
        const hour = parseInt(dateTimeMatch[4], 10);
        const minute = parseInt(dateTimeMatch[5], 10);
        const date = new Date(year, month, day, hour, minute, 0, 0); // Local time
        return isNaN(date.getTime()) ? null : date;
    }
    
    return null;
}

/**
 * Calculate time span information from an array of dates
 */
export function calculateTimeSpan(dates: Date[]): TimeSpanInfo {
    if (dates.length === 0) {
        return {
            totalMs: 0,
            hours: 0,
            days: 0,
            weeks: 0,
            months: 0,
            years: 0,
            recommendedUnit: 'days'
        };
    }
    
    const sortedDates = dates.slice().sort((a, b) => a.getTime() - b.getTime());
    const earliest = sortedDates[0];
    const latest = sortedDates[sortedDates.length - 1];
    const totalMs = latest.getTime() - earliest.getTime();
    
    const hours = totalMs / (1000 * 60 * 60);
    const days = hours / 24;
    const weeks = days / 7;
    const months = days / 30.44; // Average days per month
    const years = days / 365.25; // Account for leap years
    
    // Determine recommended unit based on span
    let recommendedUnit: TimeSpanInfo['recommendedUnit'];
    if (hours < 24) {
        recommendedUnit = 'hours';
    } else if (days < 7) {
        recommendedUnit = 'days';
    } else if (weeks < 8) {
        recommendedUnit = 'weeks';
    } else if (months < 24) {
        recommendedUnit = 'months';
    } else {
        recommendedUnit = 'years';
    }
    
    return {
        totalMs,
        hours,
        days,
        weeks,
        months,
        years,
        recommendedUnit
    };
}

/**
 * Generate time labels for the timeline arc based on time span
 */
export function generateTimeLabels(span: TimeSpanInfo, earliestDate: Date): TimeLabelInfo[] {
    const labels: TimeLabelInfo[] = [];
    
    switch (span.recommendedUnit) {
        case 'hours':
            // Generate hourly labels (max 24 labels)
            const maxHours = Math.min(24, Math.ceil(span.hours));
            for (let i = 0; i <= maxHours; i++) {
                const timeMs = earliestDate.getTime() + (i * 60 * 60 * 1000);
                const angle = mapTimeToAngle(timeMs, earliestDate.getTime(), earliestDate.getTime() + span.totalMs);
                labels.push({
                    text: `${i}h`,
                    angle,
                    timeMs
                });
            }
            break;
            
        case 'days':
            // Generate daily labels (max 7 labels)
            const maxDays = Math.min(7, Math.ceil(span.days));
            for (let i = 0; i <= maxDays; i++) {
                const timeMs = earliestDate.getTime() + (i * 24 * 60 * 60 * 1000);
                const angle = mapTimeToAngle(timeMs, earliestDate.getTime(), earliestDate.getTime() + span.totalMs);
                labels.push({
                    text: `Day ${i + 1}`,
                    angle,
                    timeMs
                });
            }
            break;
            
        case 'weeks':
            // Generate weekly labels (max 8 labels)
            const maxWeeks = Math.min(8, Math.ceil(span.weeks));
            for (let i = 0; i <= maxWeeks; i++) {
                const timeMs = earliestDate.getTime() + (i * 7 * 24 * 60 * 60 * 1000);
                const angle = mapTimeToAngle(timeMs, earliestDate.getTime(), earliestDate.getTime() + span.totalMs);
                labels.push({
                    text: `Week ${i + 1}`,
                    angle,
                    timeMs
                });
            }
            break;
            
        case 'months':
            // Generate monthly labels (max 12 labels)
            const maxMonths = Math.min(12, Math.ceil(span.months));
            for (let i = 0; i <= maxMonths; i++) {
                const timeMs = earliestDate.getTime() + (i * 30.44 * 24 * 60 * 60 * 1000);
                const angle = mapTimeToAngle(timeMs, earliestDate.getTime(), earliestDate.getTime() + span.totalMs);
                labels.push({
                    text: `Month ${i + 1}`,
                    angle,
                    timeMs
                });
            }
            break;
            
        case 'years':
            // Generate yearly labels (max 10 labels)
            const maxYears = Math.min(10, Math.ceil(span.years));
            for (let i = 0; i <= maxYears; i++) {
                const timeMs = earliestDate.getTime() + (i * 365.25 * 24 * 60 * 60 * 1000);
                const angle = mapTimeToAngle(timeMs, earliestDate.getTime(), earliestDate.getTime() + span.totalMs);
                labels.push({
                    text: `Year ${i + 1}`,
                    angle,
                    timeMs
                });
            }
            break;
    }
    
    return labels;
}

/**
 * Map a time value to an angular position on the timeline arc
 */
function mapTimeToAngle(timeMs: number, startMs: number, endMs: number): number {
    const progress = (timeMs - startMs) / (endMs - startMs);
    return progress * 2 * Math.PI - Math.PI / 2; // Start at top (12 o'clock)
}

/**
 * Format elapsed time with click-to-cycle units
 */
export function formatElapsedTime(ms: number, clickCount: number = 0): string {
    const hours = ms / (1000 * 60 * 60);
    const days = hours / 24;
    const weeks = days / 7;
    const months = days / 30.44;
    const years = days / 365.25;
    
    // Cycle through units based on click count
    const unitIndex = clickCount % 5;
    
    switch (unitIndex) {
        case 0: // Default - auto-select best unit
            if (hours < 24) {
                return `${hours.toFixed(1)} hours`;
            } else if (days < 7) {
                return `${days.toFixed(1)} days`;
            } else if (weeks < 8) {
                return `${weeks.toFixed(1)} weeks`;
            } else if (months < 24) {
                return `${months.toFixed(1)} months`;
            } else {
                return `${years.toFixed(1)} years`;
            }
        case 1: // Hours
            return `${hours.toFixed(1)} hours`;
        case 2: // Days
            return `${days.toFixed(1)} days`;
        case 3: // Weeks
            return `${weeks.toFixed(1)} weeks`;
        case 4: // Months
            return `${months.toFixed(1)} months`;
        default:
            return `${years.toFixed(1)} years`;
    }
}

export function dateToAngle(date: Date): number {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = (date.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24);
  const daysInYear =
    (new Date(date.getFullYear(), 11, 31).getTime() - startOfYear.getTime()) /
      (1000 * 60 * 60 * 24) +
    1;
  const progress = dayOfYear / daysInYear;
  return progress * 2 * Math.PI - Math.PI / 2;
} 

// Parses YYYY-MM-DD and checks if strictly before today (local date)
export function isOverdueDateString(dueString?: string, today: Date = new Date()): boolean {
  if (!dueString || typeof dueString !== 'string') return false;
  const parts = dueString.split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => isNaN(n))) return false;
  const [dueYear, dueMonth1, dueDay] = parts;
  const dueMonth = dueMonth1 - 1;
  const todayY = today.getFullYear();
  const todayM = today.getMonth();
  const todayD = today.getDate();
  if (dueYear < todayY) return true;
  if (dueYear > todayY) return false;
  if (dueMonth < todayM) return true;
  if (dueMonth > todayM) return false;
  return dueDay < todayD; // strictly before today
}

/**
 * Parse a Duration field into milliseconds
 * Supports flexible formats:
 * - "2 hours", "2h", "2 hr", "2.5 hours"
 * - "3 days", "3d", "3 day"
 * - "1 week", "1w", "1.5 weeks"
 * - "2 months", "2mo", "2 month"
 * - "1 year", "1y", "1 yr"
 * - "30 minutes", "30m", "30min"
 * - "45 seconds", "45s", "45sec"
 */
export function parseDuration(duration: string | undefined): number | null {
    if (!duration || typeof duration !== 'string') return null;
    
    const trimmed = duration.trim().toLowerCase();
    if (trimmed === '' || trimmed === '0') return 0;
    
    // Match number (int or float) + optional space + unit
    const match = trimmed.match(/^([\d.]+)\s*([a-z]+)$/);
    if (!match) return null;
    
    const value = parseFloat(match[1]);
    if (isNaN(value) || value < 0) return null;
    
    const unit = match[2];
    
    // Convert to milliseconds
    const MS_PER_SECOND = 1000;
    const MS_PER_MINUTE = 60 * MS_PER_SECOND;
    const MS_PER_HOUR = 60 * MS_PER_MINUTE;
    const MS_PER_DAY = 24 * MS_PER_HOUR;
    const MS_PER_WEEK = 7 * MS_PER_DAY;
    const MS_PER_MONTH = 30.44 * MS_PER_DAY; // Average month
    const MS_PER_YEAR = 365.25 * MS_PER_DAY; // Average year
    
    switch (unit) {
        // Seconds
        case 's':
        case 'sec':
        case 'secs':
        case 'second':
        case 'seconds':
            return value * MS_PER_SECOND;
            
        // Minutes
        case 'm':
        case 'min':
        case 'mins':
        case 'minute':
        case 'minutes':
            return value * MS_PER_MINUTE;
            
        // Hours
        case 'h':
        case 'hr':
        case 'hrs':
        case 'hour':
        case 'hours':
            return value * MS_PER_HOUR;
            
        // Days
        case 'd':
        case 'day':
        case 'days':
            return value * MS_PER_DAY;
            
        // Weeks
        case 'w':
        case 'wk':
        case 'wks':
        case 'week':
        case 'weeks':
            return value * MS_PER_WEEK;
            
        // Months
        case 'mo':
        case 'mon':
        case 'mos':
        case 'month':
        case 'months':
            return value * MS_PER_MONTH;
            
        // Years
        case 'y':
        case 'yr':
        case 'yrs':
        case 'year':
        case 'years':
            return value * MS_PER_YEAR;
            
        default:
            return null;
    }
}

/**
 * Detect discontinuities in scene timeline
 * Returns indices of scenes that have unusually large time gaps before them
 * 
 * @param scenes - Array of scenes with When dates (sorted chronologically)
 * @param threshold - Multiplier for median gap (default 3x)
 * @returns Array of scene indices with large gaps before them
 */
export function detectDiscontinuities(scenes: { when?: Date }[], threshold: number = 3): number[] {
    if (scenes.length < 3) return []; // Need at least 3 scenes to detect outliers
    
    // Calculate gaps between consecutive scenes
    const gaps: number[] = [];
    for (let i = 1; i < scenes.length; i++) {
        const prev = scenes[i - 1].when;
        const curr = scenes[i].when;
        
        if (prev && curr) {
            const gap = curr.getTime() - prev.getTime();
            if (gap >= 0) { // Only count forward gaps
                gaps.push(gap);
            }
        }
    }
    
    if (gaps.length === 0) return [];
    
    // Calculate median gap
    const sortedGaps = [...gaps].sort((a, b) => a - b);
    const medianGap = sortedGaps[Math.floor(sortedGaps.length / 2)];
    
    console.log('[detectDiscontinuities] Gap analysis', {
        gapCount: gaps.length,
        medianGapDays: medianGap / (1000 * 60 * 60 * 24),
        thresholdMultiplier: threshold,
        thresholdGapDays: (medianGap * threshold) / (1000 * 60 * 60 * 24),
        allGapsDays: gaps.map(g => g / (1000 * 60 * 60 * 24))
    });
    
    if (medianGap === 0) return []; // All scenes at same time
    
    // Absolute threshold: a gap greater than 30 days is always considered a discontinuity
    const ABSOLUTE_THRESHOLD_DAYS = 30;
    const absoluteThresholdMs = ABSOLUTE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    
    // Find scenes with gaps that are either:
    // 1. Statistical outliers: gap > threshold * median
    // 2. Absolute large gaps: gap > 30 days
    const discontinuityIndices: number[] = [];
    let gapIndex = 0;
    
    for (let i = 1; i < scenes.length; i++) {
        const prev = scenes[i - 1].when;
        const curr = scenes[i].when;
        
        if (prev && curr) {
            const gap = curr.getTime() - prev.getTime();
            if (gap >= 0) {
                const isStatisticalOutlier = gap > medianGap * threshold;
                const isAbsoluteLarge = gap > absoluteThresholdMs;
                
                if (isStatisticalOutlier || isAbsoluteLarge) {
                    discontinuityIndices.push(i);
                }
                gapIndex++;
            }
        }
    }
    
    return discontinuityIndices;
}

/**
 * Detect scene overlaps in timeline
 * Returns indices of scenes that temporally overlap with the next scene
 * (scene.When + scene.Duration > nextScene.When)
 * 
 * @param scenes - Array of scenes with When dates and Duration fields (sorted chronologically)
 * @returns Set of scene indices that have temporal overlaps
 */
export function detectSceneOverlaps(scenes: { when?: Date; Duration?: string }[]): Set<number> {
    const overlaps = new Set<number>();
    
    for (let i = 0; i < scenes.length - 1; i++) {
        const current = scenes[i];
        const next = scenes[i + 1];
        
        if (!current.when || !next.when) continue;
        
        const durationMs = parseDuration(current.Duration);
        if (durationMs === null || durationMs === 0) continue;
        
        const currentEnd = current.when.getTime() + durationMs;
        const nextStart = next.when.getTime();
        
        if (currentEnd > nextStart) {
            overlaps.add(i); // Mark current scene as overlapping
        }
    }
    
    return overlaps;
}

/**
 * Tick information for rendering timeline marks
 * Compatible with existing month rendering infrastructure
 */
export interface ChronologicalTickInfo {
    angle: number;      // Radians (0 = top, clockwise)
    name: string;       // Full label: "Day 1", "Week 2", "January", "Year 1"
    shortName: string;  // Short label: "D1", "W2", "Jan", "Y1"
    isMajor?: boolean;  // Optional: true for solid lines, false/undefined for dotted
    isFirst?: boolean;  // Optional: true for first scene label (beginning date)
    isLast?: boolean;   // Optional: true for last scene label (ending date)
}

/**
 * Generate chronological ticks based on actual scene time distribution
 * Returns ticks in same format as calendar months for compatibility
 * 
 * @param scenes - Array of scenes with When dates
 * @returns Array of tick info matching month format { angle, name, shortName }
 */
/**
 * Generate chronological ticks aligned to actual scene positions
 * Returns ticks in same format as calendar months for compatibility
 * 
 * @param scenes - Array of scenes with When dates (already sorted chronologically)
 * @param sceneStartAngles - Optional array of scene start angles (beginning of each scene's angular slice)
 * @param sceneAngularSize - Optional angular size of each scene (for calculating end angles when needed)
 * @returns Array of tick info matching month format { angle, name, shortName }
 */
export function generateChronologicalTicks(
    scenes: { when?: Date }[], 
    sceneStartAngles?: number[],
    sceneAngularSize?: number,
    debugLogger?: { log: (msg: string) => void }
): ChronologicalTickInfo[] {
    // Filter scenes with valid dates, preserving chronological order
    const validScenes: Array<{ date: Date; sortedIndex: number }> = [];
    scenes.forEach((s, idx) => {
        if (s.when && !isNaN(s.when.getTime())) {
            validScenes.push({ date: s.when, sortedIndex: idx });
        }
    });
    
    if (validScenes.length === 0) {
        // No valid dates - return empty
        return [];
    }
    
    // Special case: Only one scene - just show that date at the top
    if (validScenes.length === 1) {
        const singleDate = validScenes[0].date;
        // Use UTC methods to avoid timezone issues when displaying date-only strings
        const month = singleDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
        const day = singleDate.getUTCDate();
        const year = singleDate.getUTCFullYear();
        const dateLabel = `${month} ${day}, ${year}`;
        
        return [{
            angle: -Math.PI / 2, // Top of circle
            name: dateLabel,
            shortName: dateLabel,
            isMajor: true
        }];
    }
    
    const ticks: ChronologicalTickInfo[] = [];
    const numScenes = validScenes.length;
    
    // Get scene start angle - use provided start angles (aligned to scene beginnings)
    const getSceneStartAngle = (sortedIndex: number): number => {
        if (sceneStartAngles && sceneStartAngles[sortedIndex] !== undefined) {
            return sceneStartAngles[sortedIndex];
        }
        // Fallback: equal spacing around circle (0 = top, clockwise)
        const anglePerScene = (2 * Math.PI) / numScenes;
        return -Math.PI / 2 + (sortedIndex * anglePerScene);
    };
    
    // Since scenes are already sorted chronologically, first and last are at indices 0 and numScenes - 1
    const firstScene = validScenes[0];
    const lastScene = validScenes[numScenes - 1];
    const firstAngle = getSceneStartAngle(firstScene.sortedIndex);
    const lastAngle = getSceneStartAngle(lastScene.sortedIndex);

    // Decide which scenes to promote to major/labeled ticks
    // Use balanced distribution across the timeline
    // Ensure step evenly divides the scene count for balanced distribution
    const MAX_MAJOR_TICKS = 20;
    let step = 1;
    let numMajorTicks = numScenes;
    
    if (numScenes > MAX_MAJOR_TICKS) {
        // Calculate step that gives us approximately MAX_MAJOR_TICKS major ticks
        // But ensure it divides evenly into numScenes for balanced distribution
        step = Math.ceil(numScenes / MAX_MAJOR_TICKS);
        
        // Find a step that evenly divides numScenes (or gets close)
        // Try to find the largest divisor <= step that gives us <= MAX_MAJOR_TICKS
        let bestStep = step;
        let bestMajorCount = Math.ceil((numScenes - 1) / step) + 1; // +1 for first scene
        
        // Try divisors near our target step
        for (let testStep = step; testStep >= 1; testStep--) {
            const testMajorCount = Math.ceil((numScenes - 1) / testStep) + 1;
            if (testMajorCount <= MAX_MAJOR_TICKS && (numScenes - 1) % testStep === 0) {
                // Found a step that evenly divides!
                bestStep = testStep;
                bestMajorCount = testMajorCount;
                break;
            }
        }
        
        step = bestStep;
        numMajorTicks = bestMajorCount;
    }

    if (debugLogger) {
        debugLogger.log(`[Tick Generation] numScenes=${numScenes}, step=${step}, expected major ticks=${numMajorTicks}`);
    }

    // Build promote set using sorted indices (chronological order)
    const promoteSet = new Set<number>();
    promoteSet.add(0); // Always promote first scene
    promoteSet.add(numScenes - 1); // Always promote last scene
    
    // Promote every Nth scene (except first/last) for balanced distribution
    for (let i = step; i < numScenes - 1; i += step) {
        promoteSet.add(i);
    }
    
    if (debugLogger) {
        debugLogger.log(`[Tick Generation] Promoting ${promoteSet.size} scenes to major: [${Array.from(promoteSet).sort((a,b) => a-b).join(', ')}]`);
    }

    // Check if first and last would overlap (they're at the same or very close angles)
    // This happens when timeline wraps around a full circle
    const angleDiff = Math.abs(lastAngle - firstAngle);
    const normalizedDiff = Math.min(angleDiff, Math.abs(angleDiff - 2 * Math.PI));
    const wouldOverlap = normalizedDiff < 0.01 || normalizedDiff > (2 * Math.PI - 0.01);

    // Generate ticks aligned to scene starts (not centers)
    for (let i = 0; i < numScenes; i++) {
        const scene = validScenes[i];
        const sceneStartAngle = getSceneStartAngle(scene.sortedIndex);
        
        if (i === 0) {
            // First scene: full date label
            // Use UTC methods to avoid timezone issues when displaying date-only strings
            // Date strings like "1812-12-15" parse as UTC midnight, so use UTC methods
            const month = scene.date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
            const day = scene.date.getUTCDate();
            const year = scene.date.getUTCFullYear();
            const label = `${month} ${day}, ${year}`;
            ticks.push({
                angle: sceneStartAngle,
                name: label,
                shortName: label,
                isMajor: true,
                isFirst: true
            });
        } else if (i === numScenes - 1) {
            // Last scene: full date label, but adjust if it would overlap with first
            let tickAngle = sceneStartAngle;
            if (wouldOverlap && sceneAngularSize !== undefined) {
                // Offset last scene tick slightly to avoid overlap
                // Move it to the end of the last scene (start + angular size)
                tickAngle = sceneStartAngle + sceneAngularSize;
                // Normalize to [-π, π] range for display
                if (tickAngle > Math.PI) tickAngle -= 2 * Math.PI;
            }
            // Use UTC methods to avoid timezone issues when displaying date-only strings
            const month = scene.date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
            const day = scene.date.getUTCDate();
            const year = scene.date.getUTCFullYear();
            const label = `${month} ${day}, ${year}`;
            ticks.push({
                angle: tickAngle,
                name: label,
                shortName: label,
                isMajor: true,
                isLast: true
            });
        } else if (promoteSet.has(i)) {
            // Promoted scenes: abbreviated date label
            // Use UTC methods to avoid timezone issues when displaying date-only strings
            const month = scene.date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
            const day = scene.date.getUTCDate();
            ticks.push({
                angle: sceneStartAngle,
                name: `${month} ${day}`,
                shortName: `${month} ${day}`,
                isMajor: true
            });
        } else {
            // Minor scenes: tick mark without label
            ticks.push({
                angle: sceneStartAngle,
                name: '',
                shortName: '',
                isMajor: false
            });
        }
    }
    // If every scene was promoted (no small ticks), synthesize minor ticks to maintain visual rhythm
    const hasMinorTicks = ticks.some(tick => tick.isMajor === false);
    if (!hasMinorTicks && ticks.length > 1) {
        const SYNTHETIC_INTERVAL = Math.PI / 24; // ~7.5° between minor ticks
        const MAX_SYNTHETIC_PER_GAP = 12;
        const majorTicks = ticks
            .filter(tick => tick.isMajor !== false)
            .map(tick => ({
                tick,
                positiveAngle: normalizeAnglePositive(tick.angle)
            }))
            .sort((a, b) => a.positiveAngle - b.positiveAngle);

        const syntheticTicks: ChronologicalTickInfo[] = [];
        for (let i = 0; i < majorTicks.length; i++) {
            const current = majorTicks[i];
            const next = majorTicks[(i + 1) % majorTicks.length];

            let start = current.positiveAngle;
            let end = next.positiveAngle;

            if (i === majorTicks.length - 1 || end <= start) {
                end += Math.PI * 2; // wrap around for final segment or unordered angles
            }

            const gap = end - start;
            const subdivisions = Math.min(MAX_SYNTHETIC_PER_GAP + 1, Math.floor(gap / SYNTHETIC_INTERVAL));

            for (let step = 1; step < subdivisions; step++) {
                const anglePositive = start + (gap * step) / subdivisions;
                let angle = normalizeAngleCanonical(anglePositive);

                // Skip if this synthetic tick would overlap a major tick
                if (Math.abs(angle - current.tick.angle) < 1e-3 || Math.abs(angle - next.tick.angle) < 1e-3) {
                    continue;
                }

                syntheticTicks.push({
                    angle,
                    name: '',
                    shortName: '',
                    isMajor: false
                });
            }
        }

        if (syntheticTicks.length > 0) {
            ticks.push(...syntheticTicks);
            ticks.sort((a, b) => normalizeAngleCanonical(a.angle) - normalizeAngleCanonical(b.angle));
        }
    }

    return ticks;
}

/**
 * Normalize angle to the range [-π, π]
 */
function normalizeAngleCanonical(angle: number): number {
    const twoPi = Math.PI * 2;
    let normalized = angle % twoPi;
    if (normalized <= -Math.PI) {
        normalized += twoPi;
    } else if (normalized > Math.PI) {
        normalized -= twoPi;
    }
    return normalized;
}

/**
 * Normalize angle to the range [0, 2π)
 */
function normalizeAnglePositive(angle: number): number {
    const twoPi = Math.PI * 2;
    let normalized = angle % twoPi;
    if (normalized < 0) {
        normalized += twoPi;
    }
    return normalized;
}
