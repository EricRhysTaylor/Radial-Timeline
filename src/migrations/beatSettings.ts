import { DEFAULT_SETTINGS } from '../settings/defaults';
import type { BeatDefinition, BeatSystemConfig, BeatWorkspaceState, BookProfile, HoverMetadataField, LoadedBeatTab, RadialTimelineSettings, SavedBeatSystem } from '../types/settings';
import { generateBeatGuid, normalizeBeatNameInput, normalizeBeatSetNameInput, toBeatModelMatchKey } from '../utils/beatsInputNormalize';
import { PLOT_SYSTEM_NAMES } from '../utils/beatsSystems';
import {
    DEFAULT_CUSTOM_BEAT_SYSTEM_ID,
    buildDefaultCustomBeatSystem,
    DEFAULT_CUSTOM_BEAT_SYSTEM_NAME,
    getCustomBeatConfigKey,
    replaceSavedBeatSystem,
} from '../utils/beatSystemState';
import { getBeatLibraryItems } from '../storyBeats/libraryState';
import { WORKSPACE_TAB_ID_PREFIX } from '../storyBeats/workspaceState';

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
    selectionMigrated: boolean;
}

function cloneHoverFields(fields: HoverMetadataField[] | undefined): HoverMetadataField[] {
    return (fields ?? []).map((field) => ({ ...field }));
}

function cloneBeatDefinitions(beats: BeatDefinition[] | undefined): BeatDefinition[] {
    return (beats ?? []).map((beat) => ({ ...beat }));
}

function cloneBeatConfig(config: BeatSystemConfig | undefined): BeatSystemConfig {
    return {
        beatYamlAdvanced: typeof config?.beatYamlAdvanced === 'string' ? config.beatYamlAdvanced : '',
        beatHoverMetadataFields: cloneHoverFields(config?.beatHoverMetadataFields),
    };
}

function getLegacyActiveCustomBeatSystemId(settings: Pick<RadialTimelineSettings, 'activeCustomBeatSystemId'>): string {
    return (settings.activeCustomBeatSystemId ?? '').trim() || DEFAULT_CUSTOM_BEAT_SYSTEM_ID;
}

function ensureLegacyActiveCustomBeatSystem(
    settings: Pick<RadialTimelineSettings, 'savedBeatSystems' | 'activeCustomBeatSystemId'>
): SavedBeatSystem {
    if (!Array.isArray(settings.savedBeatSystems)) {
        settings.savedBeatSystems = [];
    }
    const activeId = getLegacyActiveCustomBeatSystemId(settings);
    settings.activeCustomBeatSystemId = activeId;
    const existing = settings.savedBeatSystems.find((system) => system.id === activeId);
    if (existing) return existing;

    const fallback = activeId === DEFAULT_CUSTOM_BEAT_SYSTEM_ID
        ? buildDefaultCustomBeatSystem()
        : {
            id: activeId,
            name: 'Custom',
            description: '',
            beats: [],
            createdAt: new Date().toISOString(),
        };
    settings.savedBeatSystems.unshift(fallback);
    return fallback;
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

function buildWorkspaceTabId(kind: LoadedBeatTab['sourceKind'], id?: string): string {
    if (kind === 'blank') return `${WORKSPACE_TAB_ID_PREFIX}blank`;
    return `${WORKSPACE_TAB_ID_PREFIX}${kind}:${id ?? ''}`;
}

function buildWorkspaceFromLoadedTab(tab: LoadedBeatTab): BeatWorkspaceState {
    return {
        loadedTabIds: [tab.tabId],
        tabsById: {
            [tab.tabId]: tab,
        },
        activeTabId: tab.tabId,
    };
}

function buildLoadedTabFromLegacySelection(
    settings: Pick<LegacyBeatSettings, 'beatSystemConfigs' | 'savedBeatSystems' | 'beatSystem' | 'activeCustomBeatSystemId'>
): LoadedBeatTab | undefined {
    const legacySelection = normalizeBeatSetNameInput(settings.beatSystem ?? '', '');
    if (!legacySelection) return undefined;

    const legacyKey = toBeatModelMatchKey(legacySelection);
    const matchedLibraryItem = getBeatLibraryItems(settings)
        .filter((item) => item.kind !== 'blank')
        .find((item) => toBeatModelMatchKey(item.name) === legacyKey);

    if (matchedLibraryItem) {
        return {
            tabId: buildWorkspaceTabId(matchedLibraryItem.kind, matchedLibraryItem.id),
            sourceKind: matchedLibraryItem.kind,
            sourceId: matchedLibraryItem.id,
            name: normalizeBeatSetNameInput(matchedLibraryItem.name, DEFAULT_CUSTOM_BEAT_SYSTEM_NAME),
            description: matchedLibraryItem.description ?? '',
            beats: cloneBeatDefinitions(matchedLibraryItem.beats),
            config: cloneBeatConfig(matchedLibraryItem.config),
            linkedSavedSystemId: matchedLibraryItem.linkedSavedSystemId,
            dirty: false,
        };
    }

    const activeCustomId = getLegacyActiveCustomBeatSystemId(settings);
    const activeCustomSystem = (settings.savedBeatSystems ?? []).find((system) => system.id === activeCustomId)
        ?? (settings.savedBeatSystems ?? []).find((system) => system.id === DEFAULT_CUSTOM_BEAT_SYSTEM_ID);
    const legacyMatchesDefaultCustom = legacyKey === toBeatModelMatchKey('Custom')
        || (!!activeCustomSystem && legacyKey === toBeatModelMatchKey(activeCustomSystem.name));

    if (!legacyMatchesDefaultCustom) return undefined;

    const customSystem = activeCustomSystem ?? buildDefaultCustomBeatSystem();
    return {
        tabId: buildWorkspaceTabId('blank'),
        sourceKind: 'blank',
        name: normalizeBeatSetNameInput(customSystem.name, DEFAULT_CUSTOM_BEAT_SYSTEM_NAME),
        description: typeof customSystem.description === 'string' ? customSystem.description : '',
        beats: cloneBeatDefinitions(customSystem.beats),
        config: cloneBeatConfig(settings.beatSystemConfigs?.[getCustomBeatConfigKey(customSystem.id)]),
        linkedSavedSystemId: customSystem.id,
        dirty: false,
    };
}

function hasExplicitBeatWorkspaceSelection(book: BookProfile | undefined): boolean {
    const activeTabId = book?.beatWorkspace?.activeTabId;
    return !!(activeTabId && book?.beatWorkspace?.tabsById?.[activeTabId]);
}

function migrateBookBeatSelections(settings: LegacyBeatSettings): boolean {
    if (settings.beatSelectionMigrationComplete) return false;

    const seededTab = buildLoadedTabFromLegacySelection(settings);
    let changed = true;

    settings.books = (settings.books ?? []).map((book) => {
        if (hasExplicitBeatWorkspaceSelection(book)) return book;
        if (!seededTab) return book;

        changed = true;
        return {
            ...book,
            beatWorkspace: buildWorkspaceFromLoadedTab({
                ...seededTab,
                beats: cloneBeatDefinitions(seededTab.beats),
                config: cloneBeatConfig(seededTab.config),
            }),
        };
    });

    settings.beatSelectionMigrationComplete = true;
    if (settings.beatSystem !== undefined) {
        delete settings.beatSystem;
        changed = true;
    }

    return changed;
}

export function migrateBeatSettings(settings: LegacyBeatSettings): BeatSettingsMigrationResult {
    let customStateMigrated = false;
    let configMigrated = false;
    let schemaNormalized = false;
    let beatIdsMigrated = false;
    let legacyFieldsRemoved = false;
    let selectionMigrated = false;
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

    const activeCustomBeatSystemId = getLegacyActiveCustomBeatSystemId(settings);
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

    const activeCustomSystem = ensureLegacyActiveCustomBeatSystem(settings);
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

    if (migrateBookBeatSelections(settings)) {
        selectionMigrated = true;
    }

    if (settings.customBeatSystemName !== undefined
        || settings.customBeatSystemDescription !== undefined
        || settings.customBeatSystemBeats !== undefined
        || settings.beatHoverMetadataFields !== undefined
        || settings.beatSystem !== undefined
        || typeof settings.beatYamlTemplates?.advanced === 'string') {
        legacyFieldsRemoved = true;
    }
    stripLegacyBeatSettings(settings);

    return {
        changed: customStateMigrated || configMigrated || schemaNormalized || beatIdsMigrated || legacyFieldsRemoved || selectionMigrated,
        customStateMigrated,
        configMigrated,
        schemaNormalized,
        beatIdsMigrated,
        legacyFieldsRemoved,
        selectionMigrated,
    };
}

export function stripLegacyBeatSettings(settings: LegacyBeatSettings): void {
    delete settings.customBeatSystemName;
    delete settings.customBeatSystemDescription;
    delete settings.customBeatSystemBeats;
    delete settings.beatHoverMetadataFields;
    delete settings.beatSystem;
    if (settings.beatYamlTemplates && 'advanced' in settings.beatYamlTemplates) {
        delete settings.beatYamlTemplates.advanced;
    }
}
