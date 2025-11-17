import type { TimelineItem } from '../types';
import type { GlobalPovMode, PovMarkerLabel } from '../types/settings';

export interface ResolvedPov {
    leadingLabels: string[];
    characterMarkers: Array<{ index: number; label: string }>;
}

type PovEntry = string;

const LABEL_MAP: Record<string, PovMarkerLabel> = {
    'pov': 'POV',
    'first': '1PV',
    '1pv': '1PV',
    'second': '2PV',
    '2pv': '2PV',
    'third': '3PoV',
    '3pov': '3PoV',
    '3po': '3PoV',
    'omniscient': '3PoV',
    '3pol': '3PoL',
    'limited': '3PoL'
};

const CLEAR_MARKERS = new Set(['none', 'npc', 'off', 'hide']);

interface ParsedEntryLabel {
    type: 'label';
    label: string;
}

interface ParsedEntryCharacter {
    type: 'character';
    label?: string;
    character: string;
}

interface ParsedEntryNone {
    type: 'none';
}

type ParsedEntry = ParsedEntryLabel | ParsedEntryCharacter | ParsedEntryNone;

function normalizeEntries(raw: string | string[] | undefined): PovEntry[] {
    if (!raw) return [];
    const base: string[] = Array.isArray(raw) ? raw : [raw];
    const entries: PovEntry[] = [];
    base.forEach(value => {
        if (value === undefined || value === null) return;
        const str = typeof value === 'string' ? value : String(value);
        str.split(/\r?\n|;/).forEach(part => {
            const trimmed = part.trim();
            if (trimmed.length > 0) {
                entries.push(trimmed);
            }
        });
    });
    return entries;
}

function canonicalizeLabel(raw: string | undefined): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    const mapped = LABEL_MAP[trimmed.toLowerCase()];
    return mapped || trimmed;
}

function parseEntry(entry: string): ParsedEntry | null {
    const lowered = entry.trim().toLowerCase();
    if (CLEAR_MARKERS.has(lowered)) {
        return { type: 'none' };
    }

    const parenMatch = entry.match(/^(.*)\(([^)]+)\)$/);
    if (parenMatch) {
        const charCandidate = parenMatch[1]?.trim();
        const labelCandidate = canonicalizeLabel(parenMatch[2]);
        if (labelCandidate && charCandidate) {
            return { type: 'character', character: charCandidate, label: labelCandidate };
        }
        if (labelCandidate) {
            return { type: 'label', label: labelCandidate };
        }
    }

    const colonParts = entry.split(':').map(part => part.trim()).filter(Boolean);
    if (colonParts.length === 0) {
        return null;
    }

    if (colonParts.length === 1) {
        const label = canonicalizeLabel(colonParts[0]);
        if (label) {
            return { type: 'label', label };
        }
        return { type: 'character', character: colonParts[0] };
    }

    const first = colonParts[0];
    const rest = colonParts.slice(1).join(':');
    const firstLabel = canonicalizeLabel(first);
    const restLabel = canonicalizeLabel(rest);

    if (firstLabel && rest) {
        return { type: 'character', character: rest, label: firstLabel };
    }

    if (firstLabel && !rest) {
        return { type: 'label', label: firstLabel };
    }

    if (!firstLabel && restLabel) {
        return { type: 'character', character: first, label: restLabel };
    }

    return { type: 'character', character: entry };
}

function findCharacterIndex(characters: string[], target: string | undefined): number {
    if (!target) return -1;
    const normalizedTarget = target.trim().toLowerCase();
    if (!normalizedTarget) return -1;
    return characters.findIndex(char => char.trim().toLowerCase() === normalizedTarget);
}

function applyFallback(
    characters: string[],
    globalMode: GlobalPovMode | undefined
): ResolvedPov {
    const leadingLabels: string[] = [];
    const characterMarkers: Array<{ index: number; label: string }> = [];

    if (globalMode && globalMode !== 'off') {
        if (globalMode === '3PoV' || characters.length === 0) {
            leadingLabels.push(globalMode);
        } else {
            characterMarkers.push({ index: 0, label: globalMode });
        }
        return { leadingLabels, characterMarkers };
    }

    if (characters.length > 0) {
        characterMarkers.push({ index: 0, label: 'POV' });
    }
    return { leadingLabels, characterMarkers };
}

export function resolveScenePov(
    scene: TimelineItem,
    options: { globalMode?: GlobalPovMode }
): ResolvedPov {
    const characters = scene.Character || [];
    const entries = normalizeEntries(scene.pov);
    const leadingLabels: string[] = [];
    const characterMarkers = new Map<number, string>();
    let hasExplicitClear = false;

    entries.forEach(entry => {
        const parsed = parseEntry(entry);
        if (!parsed) return;
        if (parsed.type === 'none') {
            hasExplicitClear = true;
            return;
        }

        if (parsed.type === 'label') {
            leadingLabels.push(parsed.label);
            return;
        }

        const index = findCharacterIndex(characters, parsed.character);
        if (index >= 0) {
            characterMarkers.set(index, parsed.label ?? 'POV');
        } else if (parsed.label) {
            leadingLabels.push(parsed.label);
        }
    });

    if (hasExplicitClear) {
        return { leadingLabels: [], characterMarkers: [] };
    }

    if (characterMarkers.size === 0 && leadingLabels.length === 0) {
        return applyFallback(characters, options.globalMode);
    }

    const markerList = Array.from(characterMarkers.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([index, label]) => ({ index, label }));

    return { leadingLabels, characterMarkers: markerList };
}
