import type { BeatDefinition, RadialTimelineSettings, SavedBeatSystem } from '../types/settings';
import { normalizeBeatNameInput, normalizeBeatSetNameInput, toBeatModelMatchKey } from './beatsInputNormalize';

export const DEFAULT_CUSTOM_BEAT_SYSTEM_ID = 'default';
export const DEFAULT_CUSTOM_BEAT_SYSTEM_NAME = 'Custom';
const DEFAULT_CUSTOM_CREATED_AT = '1970-01-01T00:00:00.000Z';

function normalizeBeatDefinition(beat: BeatDefinition): BeatDefinition {
    const name = normalizeBeatNameInput(beat.name, '');
    return {
        ...beat,
        name,
        purpose: typeof beat.purpose === 'string' ? beat.purpose.trim() || undefined : undefined,
        range: typeof beat.range === 'string' ? beat.range.trim() || undefined : undefined,
        id: typeof beat.id === 'string' && beat.id.trim().length > 0 ? beat.id.trim() : undefined,
        chapterBreak: beat.chapterBreak === true,
        chapterTitle: typeof beat.chapterTitle === 'string' ? beat.chapterTitle.trim() || undefined : undefined,
    };
}

export function buildDefaultCustomBeatSystem(): SavedBeatSystem {
    return {
        id: DEFAULT_CUSTOM_BEAT_SYSTEM_ID,
        name: DEFAULT_CUSTOM_BEAT_SYSTEM_NAME,
        description: '',
        beats: [],
        createdAt: DEFAULT_CUSTOM_CREATED_AT,
    };
}

export function getCustomBeatConfigKey(customBeatSystemId: string | undefined): string {
    const normalizedId = (customBeatSystemId ?? '').trim() || DEFAULT_CUSTOM_BEAT_SYSTEM_ID;
    return `custom:${normalizedId}`;
}

export function getActiveCustomBeatSystemId(settings: Pick<RadialTimelineSettings, 'activeCustomBeatSystemId'>): string {
    return (settings.activeCustomBeatSystemId ?? '').trim() || DEFAULT_CUSTOM_BEAT_SYSTEM_ID;
}

export function getSavedBeatSystems(settings: Pick<RadialTimelineSettings, 'savedBeatSystems'>): SavedBeatSystem[] {
    return Array.isArray(settings.savedBeatSystems) ? settings.savedBeatSystems : [];
}

export function findSavedBeatSystem(
    settings: Pick<RadialTimelineSettings, 'savedBeatSystems'>,
    customBeatSystemId: string | undefined
): SavedBeatSystem | undefined {
    const targetId = (customBeatSystemId ?? '').trim();
    if (!targetId) return undefined;
    return getSavedBeatSystems(settings).find((system) => system.id === targetId);
}

export function ensureActiveCustomBeatSystem(settings: Pick<RadialTimelineSettings, 'savedBeatSystems' | 'activeCustomBeatSystemId'>): SavedBeatSystem {
    if (!Array.isArray(settings.savedBeatSystems)) {
        settings.savedBeatSystems = [];
    }
    const activeId = getActiveCustomBeatSystemId(settings);
    settings.activeCustomBeatSystemId = activeId;
    const existing = settings.savedBeatSystems.find((system) => system.id === activeId);
    if (existing) return existing;

    const fallback = activeId === DEFAULT_CUSTOM_BEAT_SYSTEM_ID
        ? buildDefaultCustomBeatSystem()
        : {
            id: activeId,
            name: DEFAULT_CUSTOM_BEAT_SYSTEM_NAME,
            description: '',
            beats: [],
            createdAt: new Date().toISOString(),
        };
    settings.savedBeatSystems.unshift(fallback);
    return fallback;
}

export function getActiveCustomBeatSystem(
    settings: Pick<RadialTimelineSettings, 'savedBeatSystems' | 'activeCustomBeatSystemId'>
): SavedBeatSystem | undefined {
    return findSavedBeatSystem(settings, getActiveCustomBeatSystemId(settings));
}

export function getActiveCustomBeatSystemName(
    settings: Pick<RadialTimelineSettings, 'savedBeatSystems' | 'activeCustomBeatSystemId'>,
    fallback = DEFAULT_CUSTOM_BEAT_SYSTEM_NAME
): string {
    const activeSystem = getActiveCustomBeatSystem(settings);
    return normalizeBeatSetNameInput(activeSystem?.name ?? '', fallback);
}

export function getActiveCustomBeatSystemDescription(
    settings: Pick<RadialTimelineSettings, 'savedBeatSystems' | 'activeCustomBeatSystemId'>
): string {
    return getActiveCustomBeatSystem(settings)?.description ?? '';
}

export function getActiveCustomBeatSystemBeats(
    settings: Pick<RadialTimelineSettings, 'savedBeatSystems' | 'activeCustomBeatSystemId'>
): BeatDefinition[] {
    return getActiveCustomBeatSystem(settings)?.beats ?? [];
}

export function replaceSavedBeatSystem(
    settings: Pick<RadialTimelineSettings, 'savedBeatSystems'>,
    system: SavedBeatSystem
): void {
    if (!Array.isArray(settings.savedBeatSystems)) {
        settings.savedBeatSystems = [];
    }
    const normalized: SavedBeatSystem = {
        ...system,
        name: normalizeBeatSetNameInput(system.name, DEFAULT_CUSTOM_BEAT_SYSTEM_NAME),
        description: typeof system.description === 'string' ? system.description : '',
        beats: (system.beats ?? []).map(normalizeBeatDefinition).filter((beat) => beat.name.length > 0),
        createdAt: typeof system.createdAt === 'string' && system.createdAt.trim().length > 0
            ? system.createdAt
            : new Date().toISOString(),
    };
    const existingIndex = settings.savedBeatSystems.findIndex((entry) => entry.id === normalized.id);
    if (existingIndex >= 0) {
        settings.savedBeatSystems[existingIndex] = normalized;
        return;
    }
    settings.savedBeatSystems.unshift(normalized);
}

export function removeSavedBeatSystem(
    settings: Pick<RadialTimelineSettings, 'savedBeatSystems'>,
    customBeatSystemId: string
): void {
    if (!Array.isArray(settings.savedBeatSystems)) return;
    settings.savedBeatSystems = settings.savedBeatSystems.filter((system) => system.id !== customBeatSystemId);
}

export function resolveSelectedBeatModelFromSettings(
    settings: Pick<RadialTimelineSettings, 'beatSystem' | 'savedBeatSystems' | 'activeCustomBeatSystemId'>
): string | undefined {
    const selectedSystem = normalizeBeatSetNameInput(settings.beatSystem ?? '', '');
    if (!selectedSystem) return undefined;
    if (toBeatModelMatchKey(selectedSystem) !== 'custom') {
        return selectedSystem;
    }
    return getActiveCustomBeatSystemName(settings);
}
