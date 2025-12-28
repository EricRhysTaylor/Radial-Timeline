/*
 * Planetary time conversion helpers
 */

import type { PlanetaryProfile, RadialTimelineSettings } from '../types';

export interface PlanetaryConversionResult {
    profile: PlanetaryProfile; // Included for convenience
    localYear: number;
    localDayOfYear: number;
    localMonthIndex: number;
    localDayOfMonth: number;
    localWeekdayIndex: number;
    localHours: number;
    localMinutes: number;
    localSeconds: number;
    formatted: string;
}

const EARTH_DAY_MS = 24 * 60 * 60 * 1000;

export function getActivePlanetaryProfile(settings: RadialTimelineSettings): PlanetaryProfile | null {
    if (!settings.enablePlanetaryTime) return null;
    const profiles = settings.planetaryProfiles || [];
    if (!profiles.length) return null;
    const activeId = settings.activePlanetaryProfileId || profiles[0]?.id;
    const profile = profiles.find(p => p.id === activeId) || profiles[0];
    return profile || null;
}

export function validatePlanetaryProfile(profile: PlanetaryProfile): { ok: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!profile.label || profile.label.trim().length === 0) errors.push('label');
    if (!Number.isFinite(profile.hoursPerDay) || profile.hoursPerDay <= 0) errors.push('hoursPerDay');
    if (!Number.isFinite(profile.daysPerWeek) || profile.daysPerWeek < 1) errors.push('daysPerWeek');
    if (!Number.isFinite(profile.daysPerYear) || profile.daysPerYear < 1) errors.push('daysPerYear');
    if (profile.epochOffsetDays !== undefined && !Number.isFinite(profile.epochOffsetDays)) errors.push('epochOffsetDays');
    return { ok: errors.length === 0, errors };
}

export function convertFromEarth(date: Date, profile: PlanetaryProfile): PlanetaryConversionResult | null {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const { hoursPerDay, daysPerYear, daysPerWeek } = profile;
    if (hoursPerDay <= 0 || daysPerYear <= 0) return null;

    const localDayMs = hoursPerDay * 60 * 60 * 1000;
    const epochShiftMs = (profile.epochOffsetDays ?? 0) * EARTH_DAY_MS;
    const shifted = date.getTime() + epochShiftMs;

    const totalLocalDays = shifted / localDayMs;
    const fullLocalDays = Math.floor(totalLocalDays);
    const dayFraction = totalLocalDays - fullLocalDays;

    const localYear = Math.floor(fullLocalDays / daysPerYear) + 1;
    const localDayOfYear = mod(fullLocalDays, daysPerYear);

    const monthNames = profile.monthNames || [];
    const monthCount = Math.max(1, monthNames.length || 12);
    const daysPerMonth = Math.max(1, Math.floor(daysPerYear / monthCount));
    const localMonthIndex = Math.min(monthCount - 1, Math.floor(localDayOfYear / daysPerMonth));
    const localDayOfMonth = mod(localDayOfYear, daysPerMonth) + 1;

    const localWeekdayIndex = daysPerWeek > 0 ? mod(fullLocalDays, daysPerWeek) : 0;

    const localDayMsWithinDay = Math.max(0, Math.round(dayFraction * localDayMs));
    const localHours = Math.floor(localDayMsWithinDay / (60 * 60 * 1000));
    const localMinutes = Math.floor((localDayMsWithinDay % (60 * 60 * 1000)) / (60 * 1000));
    const localSeconds = Math.floor((localDayMsWithinDay % (60 * 1000)) / 1000);

    const formatted = formatPlanetaryDateTime({
        profile,
        localYear,
        localMonthIndex,
        localDayOfMonth,
        localWeekdayIndex,
        localHours,
        localMinutes,
    });

    return {
        profile,
        localYear,
        localDayOfYear,
        localMonthIndex,
        localDayOfMonth,
        localWeekdayIndex,
        localHours,
        localMinutes,
        localSeconds,
        formatted,
    };
}

export function formatPlanetaryDateTime(opts: {
    profile: PlanetaryProfile;
    localYear: number;
    localMonthIndex: number;
    localDayOfMonth: number;
    localWeekdayIndex: number;
    localHours: number;
    localMinutes: number;
}): string {
    const { profile, localYear, localMonthIndex, localDayOfMonth, localWeekdayIndex, localHours, localMinutes } = opts;
    const monthLabel = profile.monthNames?.[localMonthIndex] ?? `Month ${localMonthIndex + 1}`;
    const weekdayLabel = profile.weekdayNames?.[localWeekdayIndex] ?? `Day ${localWeekdayIndex + 1}`;
    const epochLabel = profile.epochLabel ? `${profile.epochLabel.toUpperCase()} ` : '';
    const timeStr = `${pad(localHours)}:${pad(localMinutes)}`;
    const weekdayAbbrev = abbreviate(weekdayLabel);
    const monthAbbrev = abbreviate(monthLabel);
    // Format: Year ☉ Weekday Month · Day @ Time
    return `${epochLabel}Year ${localYear} ☉ ${weekdayAbbrev} ${monthAbbrev} · ${localDayOfMonth} @ ${timeStr}`;
}

/**
 * Smart adaptive formatter for planetary dates on perimeter
 * Attempts to match the granularity of the replaced Earth label (Time only, Date only, or Full)
 */
export function formatPlanetaryDateAdaptive(
    conversion: PlanetaryConversionResult,
    earthLabel: string
): string {
    // Detect content of Earth label to match granularity
    // Matches 10:30, 10:30am, noon, midnight
    const hasTime = /(\d{1,2}:\d{2}|noon|midnight)/i.test(earthLabel);
    // Matches 4-digit year (1000-2999)
    const hasYear = /\b(1\d{3}|2\d{3})\b/.test(earthLabel);
    
    // Check if it's ONLY time (no letters except am/pm/noon/midnight, no year)
    // Used to identify "Time-only" ticks
    const isTimeOnly = hasTime && !hasYear && !/[A-Za-z]{3,}/.test(earthLabel.replace(/am|pm|noon|midnight/i, ''));

    const { profile, localYear, localMonthIndex, localDayOfMonth, localHours, localMinutes } = conversion;
    const monthLabel = profile.monthNames?.[localMonthIndex] ?? `${localMonthIndex + 1}`;
    // Use short abbreviation for perimeter labels
    const monthAbbrev = abbreviate(monthLabel); 
    const timeStr = `${pad(localHours)}:${pad(localMinutes)}`;

    const parts: string[] = [];

    if (isTimeOnly) {
        return timeStr;
    }

    if (hasYear) {
        // Compact year: "Yr 30"
        parts.push(`Yr ${localYear}`);
    }

    // Date part: Month Day
    parts.push(`${monthAbbrev} ${localDayOfMonth}`);

    if (hasTime) {
        parts.push(timeStr);
    }

    return parts.join(' · ');
}

export function parseCommaNames(input: string | undefined): string[] | undefined {
    if (!input) return undefined;
    const names = input
        .split(',')
        .map(n => n.trim())
        .filter(Boolean);
    return names.length ? names : undefined;
}

function pad(value: number): string {
    return String(Math.max(0, value)).padStart(2, '0');
}

function mod(value: number, divisor: number): number {
    const result = value % divisor;
    return result < 0 ? result + divisor : result;
}

function abbreviate(label: string): string {
    const trimmed = label.trim();
    if (!trimmed) return '';
    // Use first token up to space or first 3 characters as a fallback
    const token = trimmed.split(/\s+/)[0];
    return token.slice(0, 3).toUpperCase();
}

/**
 * Format elapsed time using planetary units
 * @param ms Earth milliseconds elapsed
 * @param profile Planetary profile with hoursPerDay, daysPerWeek, daysPerYear
 * @param clickCount Which unit to display (cycles through options)
 */
export function formatElapsedTimePlanetary(ms: number, profile: PlanetaryProfile, clickCount: number = 0): string {
    if (!Number.isFinite(ms) || ms === 0) {
        return '0 local minutes';
    }
    
    const safeMs = Math.max(0, Math.abs(ms));
    const { hoursPerDay, daysPerWeek, daysPerYear } = profile;
    
    // Calculate local time units in Earth milliseconds
    const localMinuteMs = (hoursPerDay * 60 * 60 * 1000) / (hoursPerDay * 60); // Same as Earth minute
    const localHourMs = hoursPerDay * 60 * 60 * 1000 / hoursPerDay; // Same as Earth hour
    const localDayMs = hoursPerDay * 60 * 60 * 1000;
    const localWeekMs = localDayMs * daysPerWeek;
    const localMonthMs = localDayMs * (daysPerYear / 12); // Approximate local month
    const localYearMs = localDayMs * daysPerYear;
    
    const unitIndex = ((clickCount % 5) + 5) % 5;
    
    // Auto-pick best unit
    const pickAutoUnit = (): string => {
        if (safeMs >= localYearMs * 2) {
            const years = safeMs / localYearMs;
            return `${years.toFixed(1)} local years`;
        } else if (safeMs >= localMonthMs * 2) {
            const months = safeMs / localMonthMs;
            return `${months.toFixed(1)} local months`;
        } else if (safeMs >= localWeekMs * 2) {
            const weeks = safeMs / localWeekMs;
            return `${weeks.toFixed(1)} local weeks`;
        } else if (safeMs >= localDayMs * 2) {
            const days = safeMs / localDayMs;
            return `${days.toFixed(1)} local days`;
        } else if (safeMs >= localHourMs * 2) {
            const hours = safeMs / localHourMs;
            return `${hours.toFixed(1)} local hours`;
        } else {
            const minutes = safeMs / localMinuteMs;
            return `${Math.round(minutes)} local minutes`;
        }
    };
    
    switch (unitIndex) {
        case 0:
            return pickAutoUnit();
        case 1: {
            const hours = safeMs / localHourMs;
            return `${hours.toFixed(1)} local hours`;
        }
        case 2: {
            const days = safeMs / localDayMs;
            return `${days.toFixed(1)} local days`;
        }
        case 3: {
            const weeks = safeMs / localWeekMs;
            return `${weeks.toFixed(1)} local weeks`;
        }
        case 4:
        default: {
            const months = safeMs / localMonthMs;
            return `${months.toFixed(1)} local months`;
        }
    }
}
