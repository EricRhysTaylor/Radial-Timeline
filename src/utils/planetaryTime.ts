/*
 * Planetary time conversion helpers
 */

import type { PlanetaryProfile, RadialTimelineSettings } from '../types';

export interface PlanetaryConversionResult {
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
    return `${epochLabel}YEAR ${localYear}, ${weekdayAbbrev} ${monthAbbrev} ${localDayOfMonth} @ ${timeStr}`;
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
