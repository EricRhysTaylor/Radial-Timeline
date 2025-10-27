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
export function parseWhenField(when: string): Date | null {
    if (!when || typeof when !== 'string') return null;
    
    const trimmed = when.trim();
    
    // Try ISO date format: YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const date = new Date(trimmed);
        return isNaN(date.getTime()) ? null : date;
    }
    
    // Try ISO datetime format: YYYY-MM-DDTHH:MM:SS
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
        const date = new Date(trimmed);
        return isNaN(date.getTime()) ? null : date;
    }
    
    // Try date + time format: YYYY-MM-DD HH:MM
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(trimmed)) {
        const date = new Date(trimmed.replace(' ', 'T'));
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