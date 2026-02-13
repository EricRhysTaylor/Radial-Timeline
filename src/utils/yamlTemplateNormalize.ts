/**
 * Shared YAML template parsing utilities.
 *
 * Extracted from BeatPropertiesSection.ts so that the YAML Audit, Backfill,
 * and all three editor UIs (Scene / Beat / Backdrop) share one source of truth.
 */
import { parseYaml } from 'obsidian';
import type { RadialTimelineSettings, BeatSystemConfig } from '../types/settings';
import { getBeatConfigForSystem } from './beatsTemplates';
import { DEFAULT_SETTINGS } from '../settings/defaults';

// ─── Types ──────────────────────────────────────────────────────────────

export type FieldEntryValue = string | string[];
/** @deprecated Use FieldEntryValue */
export type TemplateEntryValue = FieldEntryValue;

export type NoteType = 'Scene' | 'Beat' | 'Backdrop';

// ─── Low-level parsers ──────────────────────────────────────────────────

/**
 * Extract YAML keys from a template string in the order they appear.
 * Lines must start with `SomeKey:` (allows letters, digits, spaces, underscores,
 * hyphens, and apostrophes).
 */
export function extractKeysInOrder(template: string): string[] {
    const keys: string[] = [];
    const lines = (template || '').split('\n');
    for (const line of lines) {
        const match = line.match(/^([A-Za-z0-9 _'-]+):/);
        if (match) {
            const key = match[1].trim();
            if (key && !keys.includes(key)) keys.push(key);
        }
    }
    return keys;
}

/**
 * Safely parse a YAML template string into a flat key → value record.
 * Arrays are preserved as `string[]`; everything else becomes `string`.
 * `null` / `undefined` values are normalized to `''`.
 */
export function safeParseYaml(template: string): Record<string, TemplateEntryValue> {
    try {
        const parsed = parseYaml(template);
        if (!parsed || typeof parsed !== 'object') return {};
        const entries: Record<string, TemplateEntryValue> = {};
        Object.entries(parsed as Record<string, unknown>).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                entries[key] = value.map((v) => String(v));
            } else if (value === undefined || value === null) {
                entries[key] = '';
            } else {
                entries[key] = String(value);
            }
        });
        return entries;
    } catch {
        return {};
    }
}

/**
 * Merge two ordered key lists, preserving the relative order of each.
 * Primary keys appear first; secondary keys that aren't already present
 * are appended in their original order.
 */
export function mergeOrders(primary: string[], secondary: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    [...primary, ...secondary].forEach(key => {
        if (!key || seen.has(key)) return;
        seen.add(key);
        result.push(key);
    });
    return result;
}

// ─── High-level per-note-type helpers ───────────────────────────────────

/**
 * Return the base template keys for a given note type.
 */
export function getBaseKeys(noteType: NoteType, settings: RadialTimelineSettings): string[] {
    switch (noteType) {
        case 'Scene':
            return extractKeysInOrder(
                settings.sceneYamlTemplates?.base ?? DEFAULT_SETTINGS.sceneYamlTemplates!.base
            );
        case 'Beat':
            return extractKeysInOrder(
                DEFAULT_SETTINGS.beatYamlTemplates!.base
            );
        case 'Backdrop':
            return extractKeysInOrder(
                settings.backdropYamlTemplates?.base
                    ?? DEFAULT_SETTINGS.backdropYamlTemplates?.base
                    ?? 'Class: Backdrop\nWhen:\nEnd:\nContext:'
            );
    }
}

/**
 * Return the custom/advanced template keys for a given note type,
 * filtering out any base keys.
 */
export function getCustomKeys(
    noteType: NoteType,
    settings: RadialTimelineSettings,
    beatSystemKey?: string
): string[] {
    const baseKeys = getBaseKeys(noteType, settings);

    switch (noteType) {
        case 'Scene': {
            const adv = settings.sceneYamlTemplates?.advanced
                ?? DEFAULT_SETTINGS.sceneYamlTemplates!.advanced;
            return extractKeysInOrder(adv).filter(k => !baseKeys.includes(k));
        }
        case 'Beat': {
            const config = getBeatConfigForSystem(settings, beatSystemKey);
            return extractKeysInOrder(config.beatYamlAdvanced).filter(k =>
                !baseKeys.includes(k) && k !== 'When' && k !== 'Description'
            );
        }
        case 'Backdrop': {
            const adv = settings.backdropYamlTemplates?.advanced ?? '';
            return extractKeysInOrder(adv).filter(k =>
                !baseKeys.includes(k) && k !== 'Synopsis'
            );
        }
    }
}

/**
 * Compute the canonical key order for a note type: base keys first,
 * then custom keys, both in their template-defined order.
 */
export function computeCanonicalOrder(
    noteType: NoteType,
    settings: RadialTimelineSettings,
    beatSystemKey?: string
): string[] {
    return mergeOrders(
        getBaseKeys(noteType, settings),
        getCustomKeys(noteType, settings, beatSystemKey)
    );
}

/**
 * Compute default values for all custom (advanced) template keys.
 * Values are derived from the parsed advanced template.
 * `undefined` / `null` are normalized to `''` to prevent `key: null` writes.
 */
export function getCustomDefaults(
    noteType: NoteType,
    settings: RadialTimelineSettings,
    beatSystemKey?: string
): Record<string, TemplateEntryValue> {
    const customKeys = getCustomKeys(noteType, settings, beatSystemKey);
    let advancedYaml = '';

    switch (noteType) {
        case 'Scene':
            advancedYaml = settings.sceneYamlTemplates?.advanced
                ?? DEFAULT_SETTINGS.sceneYamlTemplates!.advanced;
            break;
        case 'Beat':
            advancedYaml = getBeatConfigForSystem(settings, beatSystemKey).beatYamlAdvanced;
            break;
        case 'Backdrop':
            advancedYaml = settings.backdropYamlTemplates?.advanced ?? '';
            break;
    }

    const parsed = safeParseYaml(advancedYaml);
    const defaults: Record<string, TemplateEntryValue> = {};
    for (const key of customKeys) {
        const val = parsed[key];
        // Normalize undefined/null → '' to prevent `key: null` writes
        defaults[key] = val ?? '';
    }
    return defaults;
}

// ─── Exclude-key predicates ─────────────────────────────────────────────

/**
 * Returns a predicate that identifies "known dynamic" keys for a note type —
 * keys that may appear in frontmatter but are NOT part of the base or custom
 * template and should NOT be reported as "extra" by the audit.
 *
 * Example: Gossamer score fields on beats (Gossamer1, Gossamer2, GossamerStage1, …)
 */
export function getExcludeKeyPredicate(noteType: NoteType): (key: string) => boolean {
    switch (noteType) {
        case 'Beat':
            return (key: string) => {
                // All Gossamer-injected fields: Gossamer1, GossamerStage1,
                // Gossamer1 Justification, Gossamer Last Updated, etc.
                if (/^Gossamer/i.test(key)) return true;
                // Legacy base field (removed from template but may exist in older notes)
                if (key === 'When') return true;
                // Legacy beat narrative field (renamed to Purpose)
                if (key === 'Description') return true;
                // Obsidian-internal keys
                if (key === 'position' || key === 'cssclasses' || key === 'tags' || key === 'aliases') return true;
                return false;
            };
        case 'Scene':
            return (key: string) => {
                // Scene analysis dynamic fields
                if (/^(previous|current|next)SceneAnalysis$/i.test(key)) return true;
                // Legacy analysis fields
                if (/^[123]beats$/i.test(key)) return true;
                // Longform fields
                if (key === 'longform') return true;
                // Repair metadata
                if (['WhenSource', 'WhenConfidence', 'DurationSource', 'NeedsReview'].includes(key)) return true;
                // Obsidian-internal keys
                if (key === 'position' || key === 'cssclasses' || key === 'tags' || key === 'aliases') return true;
                return false;
            };
        case 'Backdrop':
            return (key: string) => {
                // Legacy backdrop narrative field (renamed to Context)
                if (key === 'Synopsis') return true;
                // Obsidian-internal keys
                if (key === 'position' || key === 'cssclasses' || key === 'tags' || key === 'aliases') return true;
                return false;
            };
    }
}
