import { DEFAULT_SETTINGS } from '../settings/defaults';
import type { BeatDefinition, BeatSystemConfig, HoverMetadataField, RadialTimelineSettings, SavedBeatSystem } from '../types/settings';
import { generateBeatGuid, normalizeBeatNameInput, normalizeBeatSetNameInput } from '../utils/beatsInputNormalize';
import { PLOT_SYSTEM_NAMES } from '../utils/beatsSystems';
import {
    DEFAULT_CUSTOM_BEAT_SYSTEM_ID,
    buildDefaultCustomBeatSystem,
    ensureActiveCustomBeatSystem,
    getActiveCustomBeatSystemId,
    getCustomBeatConfigKey,
    replaceSavedBeatSystem,
} from '../utils/beatSystemState';

type LegacyBeatSettings = RadialTimelineSettings & {
    customBeatSystemName?: string;
    customBeatSystemDescription?: string;
    customBeatSystemBeats?: BeatDefinition[];
    beatHoverMetadataFields?: HoverMetadataField[];
    beatYamlTemplates?: {
        base?: string;
        advanced?: string;
    };
    savedBeatSystems?: Array<SavedBeatSystem & {
        beatYamlAdvanced?: string;
        beatHoverMetadataFields?: HoverMetadataField[];
    }>;
};
type LegacySavedBeatSystem = SavedBeatSystem & {
    beatYamlAdvanced?: string;
    beatHoverMetadataFields?: HoverMetadataField[];
};

export interface BeatSettingsMigrationResult {
    changed: boolean;
    customStateMigrated: boolean;
    configMigrated: boolean;
    schemaNormalized: boolean;
    beatIdsMigrated: boolean;
    legacyFieldsRemoved: boolean;
}

function cloneHoverFields(fields: HoverMetadataField[] | undefined): HoverMetadataField[] {
    return (fields ?? []).map((field) => ({ ...field }));
}

function stripWhenDefinition(yaml: string): string {
    return (yaml || '')
        .split('\n')
        .filter((line) => !/^(When|Definition)\s*:/i.test(line.trim()))
        .join('\n');
}

function stripDeprecatedAdvancedBeatFields(yaml: string): string {
    const lines = (yaml || '').split('\n');
    const result: string[] = [];
    let skipUntilNextField = false;

    for (const line of lines) {
        const fieldMatch = line.match(/^([A-Za-z][A-Za-z0-9 _'-]*):/);
        if (fieldMatch) {
            const fieldName = fieldMatch[1].trim();
            if (fieldName === 'Description' || fieldName === 'Chapter') {
                skipUntilNextField = true;
                continue;
            }
            skipUntilNextField = false;
            result.push(line);
            continue;
        }
        if (!skipUntilNextField) {
            result.push(line);
        }
    }

    return result.join('\n');
}

function normalizeAdvancedBeatYaml(yaml: string): string {
    return stripDeprecatedAdvancedBeatFields(stripWhenDefinition(yaml)).trim();
}

function normalizeBeatDefinitionId(beat: BeatDefinition, customBeatSystemId: string): BeatDefinition {
    const normalizedName = normalizeBeatNameInput(beat.name, '');
    return {
        ...beat,
        name: normalizedName,
        purpose: typeof beat.purpose === 'string' ? beat.purpose.trim() || undefined : undefined,
        range: typeof beat.range === 'string' ? beat.range.trim() || undefined : undefined,
        id: typeof beat.id === 'string' && beat.id.trim().length > 0
            ? beat.id.trim()
            : `custom:${customBeatSystemId}:${generateBeatGuid()}`,
    };
}

function normalizeSavedBeatSystemEntry(
    system: LegacySavedBeatSystem,
    fallbackId: string
): SavedBeatSystem {
    const id = typeof system.id === 'string' && system.id.trim().length > 0 ? system.id.trim() : fallbackId;
    return {
        id,
        name: normalizeBeatSetNameInput(system.name, 'Custom'),
        description: typeof system.description === 'string' ? system.description : '',
        beats: (system.beats ?? [])
            .map((beat) => normalizeBeatDefinitionId(beat, id))
            .filter((beat) => beat.name.length > 0),
        createdAt: typeof system.createdAt === 'string' && system.createdAt.trim().length > 0
            ? system.createdAt
            : new Date().toISOString(),
    };
}

function readLegacyBaseTemplate(settings: LegacyBeatSettings): string {
    const configuredBase = settings.beatYamlTemplates?.base;
    return typeof configuredBase === 'string' && configuredBase.trim().length > 0
        ? configuredBase
        : DEFAULT_SETTINGS.beatYamlTemplates!.base;
}

function ensureBeatConfigSlot(
    configs: Record<string, BeatSystemConfig>,
    key: string
): BeatSystemConfig {
    if (!configs[key]) {
        configs[key] = { beatYamlAdvanced: '', beatHoverMetadataFields: [] };
    }
    return configs[key];
}

export function migrateBeatSettings(settings: LegacyBeatSettings): BeatSettingsMigrationResult {
    let customStateMigrated = false;
    let configMigrated = false;
    let schemaNormalized = false;
    let beatIdsMigrated = false;
    let legacyFieldsRemoved = false;
    const legacyAdvanced = typeof settings.beatYamlTemplates?.advanced === 'string'
        ? settings.beatYamlTemplates.advanced
        : '';
    const builtinLegacyAdvanced = normalizeAdvancedBeatYaml(legacyAdvanced);
    const legacyHoverFields = cloneHoverFields(settings.beatHoverMetadataFields);

    const normalizedBase = readLegacyBaseTemplate(settings)
        .replace(/^Description:/gm, 'Purpose:')
        .replace(/^Beat Id\s*:\s*.*$/gim, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (!settings.beatYamlTemplates || settings.beatYamlTemplates.base !== normalizedBase) {
        settings.beatYamlTemplates = { base: normalizedBase };
        schemaNormalized = true;
    }

    const legacySavedSystems: LegacySavedBeatSystem[] = Array.isArray(settings.savedBeatSystems)
        ? (settings.savedBeatSystems as LegacySavedBeatSystem[])
        : [];
    const migratedSavedSystems = legacySavedSystems.map((system, index) => {
        const normalized = normalizeSavedBeatSystemEntry(system, `${Date.now()}-${index}`);
        if (normalized.beats.some((beat, beatIndex) => {
            const original = system.beats?.[beatIndex];
            return original && (!original.id || original.id !== normalized.beats[beatIndex]?.id);
        })) {
            beatIdsMigrated = true;
        }
        return normalized;
    });
    settings.savedBeatSystems = migratedSavedSystems;

    const legacyCustomBeats = Array.isArray(settings.customBeatSystemBeats)
        ? settings.customBeatSystemBeats
            .map((beat) => normalizeBeatDefinitionId(beat, DEFAULT_CUSTOM_BEAT_SYSTEM_ID))
            .filter((beat) => beat.name.length > 0)
        : [];
    if (legacyCustomBeats.some((beat, index) => settings.customBeatSystemBeats?.[index] && !settings.customBeatSystemBeats[index].id)) {
        beatIdsMigrated = true;
    }

    const legacyCustomName = normalizeBeatSetNameInput(settings.customBeatSystemName ?? '', '');
    const legacyCustomDescription = typeof settings.customBeatSystemDescription === 'string'
        ? settings.customBeatSystemDescription
        : '';
    const hasLegacyCustomState = legacyCustomName.length > 0
        || legacyCustomDescription.trim().length > 0
        || legacyCustomBeats.length > 0;

    const activeCustomBeatSystemId = getActiveCustomBeatSystemId(settings);
    settings.activeCustomBeatSystemId = activeCustomBeatSystemId;
    if (hasLegacyCustomState && activeCustomBeatSystemId === DEFAULT_CUSTOM_BEAT_SYSTEM_ID) {
        replaceSavedBeatSystem(settings, {
            ...buildDefaultCustomBeatSystem(),
            name: legacyCustomName || 'Custom',
            description: legacyCustomDescription,
            beats: legacyCustomBeats,
        });
        customStateMigrated = true;
    }

    const activeCustomSystem = ensureActiveCustomBeatSystem(settings);
    if (!activeCustomSystem.createdAt) {
        activeCustomSystem.createdAt = new Date().toISOString();
        customStateMigrated = true;
    }

    const existingConfigs = typeof settings.beatSystemConfigs === 'object' && settings.beatSystemConfigs
        ? settings.beatSystemConfigs
        : {};
    const normalizedConfigs: Record<string, BeatSystemConfig> = {};
    Object.entries(existingConfigs).forEach(([key, value]) => {
        normalizedConfigs[key] = {
            beatYamlAdvanced: normalizeAdvancedBeatYaml(value?.beatYamlAdvanced ?? ''),
            beatHoverMetadataFields: cloneHoverFields(value?.beatHoverMetadataFields),
        };
    });

    for (const builtInName of PLOT_SYSTEM_NAMES) {
        const slot = ensureBeatConfigSlot(normalizedConfigs, builtInName);
        if (!slot.beatYamlAdvanced && builtinLegacyAdvanced) {
            slot.beatYamlAdvanced = builtinLegacyAdvanced;
            configMigrated = true;
        }
        if (slot.beatHoverMetadataFields.length === 0 && legacyHoverFields.length > 0) {
            slot.beatHoverMetadataFields = cloneHoverFields(legacyHoverFields);
            configMigrated = true;
        }
    }

    for (const savedSystem of settings.savedBeatSystems) {
        const slot = ensureBeatConfigSlot(normalizedConfigs, getCustomBeatConfigKey(savedSystem.id));
        const legacySlot = legacySavedSystems.find((entry) => entry.id === savedSystem.id);
        if (!slot.beatYamlAdvanced && legacySlot?.beatYamlAdvanced) {
            slot.beatYamlAdvanced = normalizeAdvancedBeatYaml(legacySlot.beatYamlAdvanced);
            configMigrated = true;
        }
        if (slot.beatHoverMetadataFields.length === 0 && legacySlot?.beatHoverMetadataFields?.length) {
            slot.beatHoverMetadataFields = cloneHoverFields(legacySlot.beatHoverMetadataFields);
            configMigrated = true;
        }
    }

    const activeCustomConfigKey = getCustomBeatConfigKey(activeCustomBeatSystemId);
    const activeCustomSlot = ensureBeatConfigSlot(normalizedConfigs, activeCustomConfigKey);
    if (!activeCustomSlot.beatYamlAdvanced && legacyAdvanced.trim().length > 0 && activeCustomBeatSystemId === DEFAULT_CUSTOM_BEAT_SYSTEM_ID) {
        activeCustomSlot.beatYamlAdvanced = normalizeAdvancedBeatYaml(legacyAdvanced);
        configMigrated = true;
    }
    if (activeCustomSlot.beatHoverMetadataFields.length === 0 && legacyHoverFields.length > 0 && activeCustomBeatSystemId === DEFAULT_CUSTOM_BEAT_SYSTEM_ID) {
        activeCustomSlot.beatHoverMetadataFields = cloneHoverFields(legacyHoverFields);
        configMigrated = true;
    }

    Object.values(normalizedConfigs).forEach((config) => {
        const normalizedAdvanced = normalizeAdvancedBeatYaml(config.beatYamlAdvanced);
        if (normalizedAdvanced !== config.beatYamlAdvanced) {
            config.beatYamlAdvanced = normalizedAdvanced;
            configMigrated = true;
        }
    });
    settings.beatSystemConfigs = normalizedConfigs;

    if (settings.customBeatSystemName !== undefined
        || settings.customBeatSystemDescription !== undefined
        || settings.customBeatSystemBeats !== undefined
        || settings.beatHoverMetadataFields !== undefined
        || typeof settings.beatYamlTemplates?.advanced === 'string') {
        legacyFieldsRemoved = true;
    }
    stripLegacyBeatSettings(settings);

    return {
        changed: customStateMigrated || configMigrated || schemaNormalized || beatIdsMigrated || legacyFieldsRemoved,
        customStateMigrated,
        configMigrated,
        schemaNormalized,
        beatIdsMigrated,
        legacyFieldsRemoved,
    };
}

export function stripLegacyBeatSettings(settings: LegacyBeatSettings): void {
    delete settings.customBeatSystemName;
    delete settings.customBeatSystemDescription;
    delete settings.customBeatSystemBeats;
    delete settings.beatHoverMetadataFields;
    if (settings.beatYamlTemplates && 'advanced' in settings.beatYamlTemplates) {
        delete settings.beatYamlTemplates.advanced;
    }
}
