import type {
    BeatDefinition,
    BeatLibraryItem,
    BeatSourceKind,
    BeatSystemConfig,
    BeatWorkspaceState,
    BookProfile,
    LoadedBeatTab,
    RadialTimelineSettings,
} from '../types/settings';
import { getActiveBook } from '../utils/books';
import {
    buildDefaultCustomBeatSystem,
    DEFAULT_CUSTOM_BEAT_SYSTEM_ID,
    getActiveCustomBeatSystem,
    getActiveCustomBeatSystemDescription,
    getActiveCustomBeatSystemId,
    getActiveCustomBeatSystemName,
    getCustomBeatConfigKey,
    getSavedBeatSystems,
    replaceSavedBeatSystem,
} from '../utils/beatSystemState';
import { normalizeBeatNameInput, normalizeBeatSetNameInput, toBeatModelMatchKey } from '../utils/beatsInputNormalize';
import { cloneBeatLibraryItem, getBeatLibraryItemBySource, getBuiltinBeatLibraryItems, getSavedBeatLibraryItems, getStarterBeatLibraryItems, isStarterBeatSetId, isWorkspaceBeatSystemId } from './libraryState';

export const WORKSPACE_TAB_ID_PREFIX = 'beat-tab:';
export const WORKSPACE_CUSTOM_ID_PREFIX = 'workspace:';

function cloneBeatDefinition(beat: BeatDefinition): BeatDefinition {
    return {
        ...beat,
        name: normalizeBeatNameInput(beat.name, ''),
        act: typeof beat.act === 'number' && Number.isFinite(beat.act) ? beat.act : 1,
        purpose: typeof beat.purpose === 'string' ? beat.purpose.trim() || undefined : undefined,
        id: typeof beat.id === 'string' ? beat.id.trim() || undefined : undefined,
        range: typeof beat.range === 'string' ? beat.range.trim() || undefined : undefined,
    };
}

function cloneBeatConfig(config: BeatSystemConfig | undefined): BeatSystemConfig {
    return {
        beatYamlAdvanced: typeof config?.beatYamlAdvanced === 'string' ? config.beatYamlAdvanced : '',
        beatHoverMetadataFields: Array.isArray(config?.beatHoverMetadataFields)
            ? config.beatHoverMetadataFields.map((field) => ({ ...field }))
            : [],
    };
}

function cloneLoadedTab(tab: LoadedBeatTab): LoadedBeatTab {
    return {
        ...tab,
        beats: tab.beats.map(cloneBeatDefinition),
        config: cloneBeatConfig(tab.config),
    };
}

function getWorkspaceCustomSystemId(tab: LoadedBeatTab): string {
    if (tab.sourceKind === 'saved' && tab.linkedSavedSystemId) return tab.linkedSavedSystemId;
    if (tab.sourceKind === 'starter' && tab.sourceId) return tab.sourceId;
    if (tab.sourceKind === 'blank') return DEFAULT_CUSTOM_BEAT_SYSTEM_ID;
    return `${WORKSPACE_CUSTOM_ID_PREFIX}${tab.tabId}`;
}

function buildWorkspaceTabId(item: BeatLibraryItem): string {
    if (item.kind === 'blank') return `${WORKSPACE_TAB_ID_PREFIX}blank`;
    return `${WORKSPACE_TAB_ID_PREFIX}${item.kind}:${item.id}`;
}

function createLoadedTabFromLibraryItem(item: BeatLibraryItem): LoadedBeatTab {
    const cloned = cloneBeatLibraryItem(item);
    return {
        tabId: buildWorkspaceTabId(cloned),
        sourceKind: cloned.kind,
        sourceId: cloned.id,
        name: normalizeBeatSetNameInput(cloned.name, 'Custom'),
        description: cloned.description ?? '',
        beats: cloned.beats.map(cloneBeatDefinition),
        config: cloneBeatConfig(cloned.config),
        linkedSavedSystemId: cloned.linkedSavedSystemId,
        dirty: false,
    };
}

function getActiveBookProfile(settings: RadialTimelineSettings): BookProfile | null {
    return getActiveBook(settings);
}

function writeWorkspace(settings: RadialTimelineSettings, workspace: BeatWorkspaceState): void {
    const activeBook = getActiveBookProfile(settings);
    if (!activeBook) return;
    activeBook.beatWorkspace = workspace;
}

function normalizeWorkspace(workspace: BeatWorkspaceState | undefined): BeatWorkspaceState {
    if (!workspace) {
        return { loadedTabIds: [], tabsById: {}, activeTabId: undefined };
    }
    const tabsById: Record<string, LoadedBeatTab> = {};
    for (const [tabId, tab] of Object.entries(workspace.tabsById || {})) {
        tabsById[tabId] = cloneLoadedTab({ ...tab, tabId });
    }
    const loadedTabIds = (workspace.loadedTabIds || []).filter((tabId) => !!tabsById[tabId]);
    const activeTabId = workspace.activeTabId && tabsById[workspace.activeTabId]
        ? workspace.activeTabId
        : loadedTabIds[0];
    return { loadedTabIds, tabsById, activeTabId };
}

function getLibraryItemByLegacySelection(settings: RadialTimelineSettings): BeatLibraryItem {
    const selectedSystem = normalizeBeatSetNameInput(settings.beatSystem ?? '', 'Save The Cat');
    if (toBeatModelMatchKey(selectedSystem) !== 'custom') {
        return getBuiltinBeatLibraryItems(settings).find((item) => item.name === selectedSystem) ?? getBuiltinBeatLibraryItems(settings)[0];
    }

    const activeCustomId = getActiveCustomBeatSystemId(settings);
    if (activeCustomId === DEFAULT_CUSTOM_BEAT_SYSTEM_ID) {
        return {
            id: DEFAULT_CUSTOM_BEAT_SYSTEM_ID,
            kind: 'blank',
            name: getActiveCustomBeatSystemName(settings, 'Custom'),
            description: getActiveCustomBeatSystemDescription(settings),
            beats: (getActiveCustomBeatSystem(settings)?.beats ?? []).map(cloneBeatDefinition),
            config: cloneBeatConfig(settings.beatSystemConfigs?.[getCustomBeatConfigKey(activeCustomId)]),
        };
    }
    if (isStarterBeatSetId(activeCustomId)) {
        return getBeatLibraryItemBySource(settings, 'starter', activeCustomId)
            ?? {
                id: activeCustomId,
                kind: 'starter',
                name: getActiveCustomBeatSystemName(settings, 'Custom'),
                description: getActiveCustomBeatSystemDescription(settings),
                beats: (getActiveCustomBeatSystem(settings)?.beats ?? []).map(cloneBeatDefinition),
                config: cloneBeatConfig(settings.beatSystemConfigs?.[getCustomBeatConfigKey(activeCustomId)]),
            };
    }
    if (isWorkspaceBeatSystemId(activeCustomId)) {
        return {
            id: activeCustomId,
            kind: 'blank',
            name: getActiveCustomBeatSystemName(settings, 'Custom'),
            description: getActiveCustomBeatSystemDescription(settings),
            beats: (getActiveCustomBeatSystem(settings)?.beats ?? []).map(cloneBeatDefinition),
            config: cloneBeatConfig(settings.beatSystemConfigs?.[getCustomBeatConfigKey(activeCustomId)]),
        };
    }
    return getBeatLibraryItemBySource(settings, 'saved', activeCustomId)
        ?? {
            id: activeCustomId,
            kind: 'saved',
            name: getActiveCustomBeatSystemName(settings, 'Custom'),
            description: getActiveCustomBeatSystemDescription(settings),
            beats: (getActiveCustomBeatSystem(settings)?.beats ?? []).map(cloneBeatDefinition),
            config: cloneBeatConfig(settings.beatSystemConfigs?.[getCustomBeatConfigKey(activeCustomId)]),
            linkedSavedSystemId: activeCustomId,
        };
}

function buildCompatibilityWorkspace(settings: RadialTimelineSettings): BeatWorkspaceState {
    const item = getLibraryItemByLegacySelection(settings);
    const tab = createLoadedTabFromLibraryItem(item);
    return {
        loadedTabIds: [tab.tabId],
        tabsById: { [tab.tabId]: tab },
        activeTabId: tab.tabId,
    };
}

function getWorkspace(settings: RadialTimelineSettings): BeatWorkspaceState {
    const activeBook = getActiveBookProfile(settings);
    if (!activeBook?.beatWorkspace || activeBook.beatWorkspace.loadedTabIds.length === 0) {
        const compatibility = buildCompatibilityWorkspace(settings);
        writeWorkspace(settings, compatibility);
        return compatibility;
    }
    const normalized = normalizeWorkspace(activeBook.beatWorkspace);
    activeBook.beatWorkspace = normalized;
    return normalized;
}

function setWorkspace(settings: RadialTimelineSettings, workspace: BeatWorkspaceState): BeatWorkspaceState {
    const normalized = normalizeWorkspace(workspace);
    writeWorkspace(settings, normalized);
    return normalized;
}

function getSourceLibraryItem(settings: RadialTimelineSettings, tab: LoadedBeatTab): BeatLibraryItem | undefined {
    if (tab.sourceKind === 'blank') return undefined;
    return getBeatLibraryItemBySource(settings, tab.sourceKind, tab.sourceId);
}

function areBeatListsEqual(left: BeatDefinition[], right: BeatDefinition[]): boolean {
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
        const a = cloneBeatDefinition(left[i]);
        const b = cloneBeatDefinition(right[i]);
        if (a.name !== b.name || a.act !== b.act || (a.purpose ?? '') !== (b.purpose ?? '') || (a.id ?? '') !== (b.id ?? '') || (a.range ?? '') !== (b.range ?? '')) {
            return false;
        }
    }
    return true;
}

function areBeatConfigsEqual(left: BeatSystemConfig, right: BeatSystemConfig): boolean {
    return JSON.stringify(cloneBeatConfig(left)) === JSON.stringify(cloneBeatConfig(right));
}

function computeTabDirty(settings: RadialTimelineSettings, tab: LoadedBeatTab): boolean {
    if (tab.sourceKind === 'blank') {
        return !!tab.description?.trim() || tab.beats.length > 0 || !!tab.config.beatYamlAdvanced.trim() || tab.config.beatHoverMetadataFields.length > 0;
    }
    const source = getSourceLibraryItem(settings, tab);
    if (!source) return tab.dirty;
    return normalizeBeatSetNameInput(tab.name, '') !== normalizeBeatSetNameInput(source.name, '')
        || (tab.description ?? '') !== (source.description ?? '')
        || !areBeatListsEqual(tab.beats, source.beats)
        || !areBeatConfigsEqual(tab.config, source.config);
}

export function ensureBeatWorkspaceState(settings: RadialTimelineSettings): BeatWorkspaceState {
    return getWorkspace(settings);
}

export function getLoadedBeatTabs(settings: RadialTimelineSettings): LoadedBeatTab[] {
    const workspace = getWorkspace(settings);
    return workspace.loadedTabIds
        .map((tabId) => workspace.tabsById[tabId])
        .filter((tab): tab is LoadedBeatTab => !!tab)
        .map(cloneLoadedTab);
}

export function getActiveLoadedBeatTab(settings: RadialTimelineSettings): LoadedBeatTab | undefined {
    const workspace = getWorkspace(settings);
    const activeTabId = workspace.activeTabId ?? workspace.loadedTabIds[0];
    const activeTab = activeTabId ? workspace.tabsById[activeTabId] : undefined;
    return activeTab ? cloneLoadedTab(activeTab) : undefined;
}

export function getActiveLoadedBeatTabId(settings: RadialTimelineSettings): string | undefined {
    return getWorkspace(settings).activeTabId ?? getWorkspace(settings).loadedTabIds[0];
}

export function isBeatLibraryItemLoaded(
    settings: RadialTimelineSettings,
    item: BeatLibraryItem
): LoadedBeatTab | undefined {
    return getLoadedBeatTabs(settings).find((tab) => {
        if (item.kind === 'blank') return tab.sourceKind === 'blank';
        return tab.sourceKind === item.kind && tab.sourceId === item.id;
    });
}

function commitHydratedTabToWorkspace(settings: RadialTimelineSettings, workspace: BeatWorkspaceState): BeatWorkspaceState {
    const activeTabId = workspace.activeTabId;
    if (!activeTabId) return workspace;
    const tab = workspace.tabsById[activeTabId];
    if (!tab) return workspace;

    const customSystemId = getWorkspaceCustomSystemId(tab);
    const liveSystem = getSavedBeatSystems(settings).find((system) => system.id === customSystemId);
    const config = settings.beatSystemConfigs?.[getCustomBeatConfigKey(customSystemId)];
    const nextTab: LoadedBeatTab = {
        ...tab,
        name: normalizeBeatSetNameInput(liveSystem?.name ?? tab.name, tab.name),
        description: liveSystem?.description ?? tab.description ?? '',
        beats: (liveSystem?.beats ?? tab.beats).map(cloneBeatDefinition),
        config: cloneBeatConfig(config ?? tab.config),
    };
    nextTab.dirty = computeTabDirty(settings, nextTab);

    return setWorkspace(settings, {
        ...workspace,
        tabsById: {
            ...workspace.tabsById,
            [activeTabId]: nextTab,
        },
    });
}

export function commitActiveBeatTabToWorkspace(settings: RadialTimelineSettings): LoadedBeatTab | undefined {
    const workspace = commitHydratedTabToWorkspace(settings, getWorkspace(settings));
    const activeTabId = workspace.activeTabId;
    const activeTab = activeTabId ? workspace.tabsById[activeTabId] : undefined;
    return activeTab ? cloneLoadedTab(activeTab) : undefined;
}

function hydrateLegacyStateFromTab(settings: RadialTimelineSettings, tab: LoadedBeatTab): void {
    const customSystemId = getWorkspaceCustomSystemId(tab);
    replaceSavedBeatSystem(settings, {
        id: customSystemId,
        name: normalizeBeatSetNameInput(tab.name, 'Custom'),
        description: tab.description ?? '',
        beats: tab.beats.map(cloneBeatDefinition),
        createdAt: new Date().toISOString(),
    });
    if (!settings.beatSystemConfigs) settings.beatSystemConfigs = {};
    settings.beatSystemConfigs[getCustomBeatConfigKey(customSystemId)] = cloneBeatConfig(tab.config);
    settings.activeCustomBeatSystemId = customSystemId;
    settings.beatSystem = 'Custom';
}

export function syncActiveBeatTabToLegacyWorkspace(settings: RadialTimelineSettings): void {
    const activeTab = getActiveLoadedBeatTab(settings);
    if (!activeTab) return;
    hydrateLegacyStateFromTab(settings, activeTab);
}

export function activateLoadedBeatTab(settings: RadialTimelineSettings, tabId: string): LoadedBeatTab | undefined {
    const committedWorkspace = commitHydratedTabToWorkspace(settings, getWorkspace(settings));
    const nextTab = committedWorkspace.tabsById[tabId];
    if (!nextTab) return undefined;
    const nextWorkspace = setWorkspace(settings, {
        ...committedWorkspace,
        activeTabId: tabId,
    });
    const activeTab = nextWorkspace.tabsById[tabId];
    if (!activeTab) return undefined;
    hydrateLegacyStateFromTab(settings, activeTab);
    return cloneLoadedTab(activeTab);
}

export function loadBeatTabFromLibraryItem(settings: RadialTimelineSettings, item: BeatLibraryItem): LoadedBeatTab {
    const existing = isBeatLibraryItemLoaded(settings, item);
    if (existing) {
        activateLoadedBeatTab(settings, existing.tabId);
        return existing;
    }
    const workspace = commitHydratedTabToWorkspace(settings, getWorkspace(settings));
    const tab = createLoadedTabFromLibraryItem(item);
    const nextWorkspace = setWorkspace(settings, {
        ...workspace,
        loadedTabIds: [...workspace.loadedTabIds, tab.tabId],
        tabsById: {
            ...workspace.tabsById,
            [tab.tabId]: tab,
        },
        activeTabId: tab.tabId,
    });
    const activeTab = nextWorkspace.tabsById[tab.tabId];
    hydrateLegacyStateFromTab(settings, activeTab);
    return cloneLoadedTab(activeTab);
}

export function updateLoadedBeatTab(
    settings: RadialTimelineSettings,
    tabId: string,
    updater: (tab: LoadedBeatTab) => LoadedBeatTab
): LoadedBeatTab | undefined {
    const workspace = getWorkspace(settings);
    const existing = workspace.tabsById[tabId];
    if (!existing) return undefined;
    const updated = updater(cloneLoadedTab(existing));
    updated.dirty = computeTabDirty(settings, updated);
    const nextWorkspace = setWorkspace(settings, {
        ...workspace,
        tabsById: {
            ...workspace.tabsById,
            [tabId]: updated,
        },
    });
    if (nextWorkspace.activeTabId === tabId) {
        hydrateLegacyStateFromTab(settings, updated);
    }
    return cloneLoadedTab(updated);
}

export function unloadBeatTab(settings: RadialTimelineSettings, tabId: string): string | undefined {
    const workspace = commitHydratedTabToWorkspace(settings, getWorkspace(settings));
    if (!workspace.tabsById[tabId]) return workspace.activeTabId;
    const nextIds = workspace.loadedTabIds.filter((id) => id !== tabId);
    const nextTabs = { ...workspace.tabsById };
    delete nextTabs[tabId];
    const nextActiveTabId = workspace.activeTabId === tabId ? nextIds[0] : workspace.activeTabId;
    setWorkspace(settings, {
        loadedTabIds: nextIds,
        tabsById: nextTabs,
        activeTabId: nextActiveTabId,
    });
    if (nextActiveTabId) {
        const nextActive = nextTabs[nextActiveTabId];
        if (nextActive) hydrateLegacyStateFromTab(settings, nextActive);
    }
    return nextActiveTabId;
}

export function getActiveBeatModelFromWorkspace(settings: RadialTimelineSettings): string | undefined {
    return getActiveLoadedBeatTab(settings)?.name?.trim() || undefined;
}

export function getActiveBeatWorkspaceConfig(settings: RadialTimelineSettings): BeatSystemConfig | undefined {
    return getActiveLoadedBeatTab(settings)?.config;
}

export function getActiveBeatWorkspaceKind(settings: RadialTimelineSettings): BeatSourceKind | undefined {
    return getActiveLoadedBeatTab(settings)?.sourceKind;
}

export function getActiveBeatWorkspaceLabel(settings: RadialTimelineSettings): string | undefined {
    return getActiveLoadedBeatTab(settings)?.name;
}
