import type { App } from 'obsidian';
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
    DEFAULT_CUSTOM_BEAT_SYSTEM_ID,
    getCustomBeatConfigKey,
} from '../utils/beatSystemState';
import { normalizeBeatNameInput, normalizeBeatSetNameInput, toBeatModelMatchKey } from '../utils/beatsInputNormalize';
import { cloneBeatLibraryItem, getBeatLibraryItemBySource, getBuiltinBeatLibraryItems, getSavedBeatLibraryItems, getStarterBeatLibraryItems } from './libraryState';
import { resolveBookScopedFiles } from '../services/NoteScopeResolver';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import { isStoryBeat } from '../utils/sceneHelpers';

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

export function getLoadedBeatTabWorkspaceSystemId(tab: LoadedBeatTab): string {
    return getWorkspaceCustomSystemId(tab);
}

export function getLoadedBeatTabConfigKey(tab: LoadedBeatTab): string {
    if (tab.sourceKind === 'builtin') {
        return normalizeBeatSetNameInput(tab.name, tab.name);
    }
    return getCustomBeatConfigKey(getWorkspaceCustomSystemId(tab));
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

function buildLoadedTabIdentityKey(tab: Pick<LoadedBeatTab, 'sourceKind' | 'sourceId' | 'name'>): string {
    if (tab.sourceKind === 'blank') return 'blank';
    if (tab.sourceId) return `${tab.sourceKind}:${tab.sourceId}`;
    return `name:${toBeatModelMatchKey(tab.name)}`;
}

function buildDetectedBeatTabId(modelName: string): string {
    return `${WORKSPACE_TAB_ID_PREFIX}detected:${toBeatModelMatchKey(modelName)}`;
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
        : undefined;
    return { loadedTabIds, tabsById, activeTabId };
}

function getWorkspace(settings: RadialTimelineSettings): BeatWorkspaceState {
    const activeBook = getActiveBookProfile(settings);
    if (!activeBook?.beatWorkspace || activeBook.beatWorkspace.loadedTabIds.length === 0) {
        return { loadedTabIds: [], tabsById: {}, activeTabId: undefined };
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

function mergeDetectedTabsIntoWorkspace(
    settings: RadialTimelineSettings,
    workspace: BeatWorkspaceState,
    detectedTabs: LoadedBeatTab[]
): { workspace: BeatWorkspaceState; changed: boolean } {
    if (detectedTabs.length === 0) {
        return { workspace, changed: false };
    }

    const nextLoadedTabIds = [...workspace.loadedTabIds];
    const nextTabsById = { ...workspace.tabsById };
    let changed = false;

    for (const detectedTab of detectedTabs) {
        const exists = nextLoadedTabIds.some((tabId) => {
            const tab = nextTabsById[tabId];
            if (!tab) return false;
            return buildLoadedTabIdentityKey(tab) === buildLoadedTabIdentityKey(detectedTab)
                || toBeatModelMatchKey(tab.name) === toBeatModelMatchKey(detectedTab.name);
        });
        if (exists) continue;
        nextLoadedTabIds.push(detectedTab.tabId);
        nextTabsById[detectedTab.tabId] = cloneLoadedTab(detectedTab);
        changed = true;
    }

    const nextActiveTabId = workspace.activeTabId && nextTabsById[workspace.activeTabId]
        ? workspace.activeTabId
        : undefined;
    if (nextActiveTabId !== workspace.activeTabId) {
        changed = true;
    }

    if (!changed) {
        return { workspace, changed: false };
    }

    return {
        workspace: setWorkspace(settings, {
            loadedTabIds: nextLoadedTabIds,
            tabsById: nextTabsById,
            activeTabId: nextActiveTabId,
        }),
        changed: true,
    };
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

export function ensureMaterializedBeatWorkspaceState(app: App, settings: RadialTimelineSettings): BeatWorkspaceState {
    const workspace = getWorkspace(settings);
    const detectedTabs = collectManuscriptDetectedTabs(app, settings);
    const { workspace: nextWorkspace } = mergeDetectedTabsIntoWorkspace(settings, workspace, detectedTabs);
    return nextWorkspace;
}

export function getLoadedBeatTabs(settings: RadialTimelineSettings): LoadedBeatTab[] {
    const workspace = getWorkspace(settings);
    return workspace.loadedTabIds
        .map((tabId) => workspace.tabsById[tabId])
        .filter((tab): tab is LoadedBeatTab => !!tab)
        .map(cloneLoadedTab);
}

function collectManuscriptDetectedTabs(app: App, settings: RadialTimelineSettings): LoadedBeatTab[] {
    const beatScope = resolveBookScopedFiles({ app, settings, noteType: 'Beat' });
    if (!beatScope.files.length) return [];
    const mappings = settings.enableCustomMetadataMapping ? settings.frontmatterMappings : undefined;
    const libraryItems = [
        ...getBuiltinBeatLibraryItems(settings),
        ...getStarterBeatLibraryItems(settings),
        ...getSavedBeatLibraryItems(settings),
    ];
    const manuscriptGroups = new Map<string, {
        modelName: string;
        beats: Map<string, BeatDefinition>;
    }>();

    for (const file of beatScope.files) {
        const cache = app.metadataCache.getFileCache(file);
        const raw = (cache?.frontmatter ?? {}) as Record<string, unknown>;
        const frontmatter = mappings ? normalizeFrontmatterKeys(raw, mappings) : raw;
        const classValue = typeof frontmatter.Class === 'string' ? frontmatter.Class.trim() : '';
        if (classValue.length > 0 && !isStoryBeat(classValue)) continue;

        const modelName = normalizeBeatSetNameInput(typeof frontmatter['Beat Model'] === 'string' ? frontmatter['Beat Model'] : '', '');
        if (!modelName) continue;
        const modelKey = toBeatModelMatchKey(modelName);
        if (!modelKey) continue;
        const group = manuscriptGroups.get(modelKey) ?? {
            modelName,
            beats: new Map<string, BeatDefinition>(),
        };

        const title = normalizeBeatNameInput(
            typeof frontmatter.Title === 'string' && frontmatter.Title.trim().length > 0 ? frontmatter.Title : file.basename,
            file.basename
        );
        const id = typeof frontmatter.ID === 'string' && frontmatter.ID.trim().length > 0 ? frontmatter.ID.trim() : undefined;
        const actRaw = Number(frontmatter.Act);
        const act = Number.isFinite(actRaw) ? Math.max(1, Math.round(actRaw)) : 1;
        const dedupeKey = id || `${toBeatModelMatchKey(title)}:${act}`;
        if (!group.beats.has(dedupeKey)) {
            group.beats.set(dedupeKey, {
                name: title,
                act,
                id,
                purpose: typeof frontmatter.Purpose === 'string' ? frontmatter.Purpose.trim() || undefined : undefined,
                range: typeof frontmatter.Range === 'string' ? frontmatter.Range.trim() || undefined : undefined,
            });
        }
        manuscriptGroups.set(modelKey, group);
    }

    return [...manuscriptGroups.values()].map((group) => {
        const matchedLibraryItem = libraryItems.find((item) => toBeatModelMatchKey(item.name) === toBeatModelMatchKey(group.modelName));
        if (matchedLibraryItem) {
            return createLoadedTabFromLibraryItem(matchedLibraryItem);
        }
        return {
            tabId: buildDetectedBeatTabId(group.modelName),
            sourceKind: 'detected',
            sourceId: `detected:${toBeatModelMatchKey(group.modelName)}`,
            name: group.modelName,
            description: 'No matching system definition found.',
            beats: [...group.beats.values()].sort((left, right) => {
                if (left.act !== right.act) return left.act - right.act;
                return left.name.localeCompare(right.name);
            }).map(cloneBeatDefinition),
            config: cloneBeatConfig(settings.beatSystemConfigs?.[group.modelName]),
            dirty: false,
        };
    });
}

export function getMaterializedBeatTabs(app: App, settings: RadialTimelineSettings): LoadedBeatTab[] {
    const loadedTabs = getLoadedBeatTabs(settings);
    const detectedTabs = collectManuscriptDetectedTabs(app, settings);
    if (loadedTabs.length === 0 && detectedTabs.length > 0) {
        return detectedTabs;
    }
    const merged: LoadedBeatTab[] = [];
    const seen = new Set<string>();

    for (const tab of loadedTabs) {
        const identityKey = buildLoadedTabIdentityKey(tab);
        merged.push(tab);
        seen.add(identityKey);
        seen.add(`name:${toBeatModelMatchKey(tab.name)}`);
    }

    for (const tab of detectedTabs) {
        const identityKey = buildLoadedTabIdentityKey(tab);
        const nameKey = `name:${toBeatModelMatchKey(tab.name)}`;
        if (seen.has(identityKey) || seen.has(nameKey)) continue;
        merged.push(tab);
        seen.add(identityKey);
        seen.add(nameKey);
    }

    return merged;
}

export function getActiveLoadedBeatTab(settings: RadialTimelineSettings): LoadedBeatTab | undefined {
    const workspace = getWorkspace(settings);
    const activeTabId = workspace.activeTabId;
    const activeTab = activeTabId ? workspace.tabsById[activeTabId] : undefined;
    return activeTab ? cloneLoadedTab(activeTab) : undefined;
}

export function getActiveLoadedBeatTabId(settings: RadialTimelineSettings): string | undefined {
    return getWorkspace(settings).activeTabId;
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

export function activateLoadedBeatTab(settings: RadialTimelineSettings, tabId: string): LoadedBeatTab | undefined {
    const workspace = getWorkspace(settings);
    const nextTab = workspace.tabsById[tabId];
    if (!nextTab) return undefined;
    const nextWorkspace = setWorkspace(settings, {
        ...workspace,
        activeTabId: tabId,
    });
    const activeTab = nextWorkspace.tabsById[tabId];
    if (!activeTab) return undefined;
    return cloneLoadedTab(activeTab);
}

export function loadBeatTabFromLibraryItem(settings: RadialTimelineSettings, item: BeatLibraryItem): LoadedBeatTab {
    const existing = isBeatLibraryItemLoaded(settings, item);
    if (existing) {
        activateLoadedBeatTab(settings, existing.tabId);
        return existing;
    }
    const workspace = getWorkspace(settings);
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
    return cloneLoadedTab(activeTab);
}

export function materializeBeatTab(settings: RadialTimelineSettings, tab: LoadedBeatTab): LoadedBeatTab {
    const existing = getLoadedBeatTabs(settings).find((entry) => {
        return buildLoadedTabIdentityKey(entry) === buildLoadedTabIdentityKey(tab)
            || toBeatModelMatchKey(entry.name) === toBeatModelMatchKey(tab.name);
    });
    if (existing) {
        activateLoadedBeatTab(settings, existing.tabId);
        return existing;
    }
    const workspace = getWorkspace(settings);
    const nextTab = cloneLoadedTab(tab);
    const nextWorkspace = setWorkspace(settings, {
        ...workspace,
        loadedTabIds: [...workspace.loadedTabIds, nextTab.tabId],
        tabsById: {
            ...workspace.tabsById,
            [nextTab.tabId]: nextTab,
        },
        activeTabId: nextTab.tabId,
    });
    const activeTab = nextWorkspace.tabsById[nextTab.tabId];
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
    return cloneLoadedTab(updated);
}

export function unloadBeatTab(settings: RadialTimelineSettings, tabId: string): string | undefined {
    const workspace = getWorkspace(settings);
    if (!workspace.tabsById[tabId]) return workspace.activeTabId;
    const nextIds = workspace.loadedTabIds.filter((id) => id !== tabId);
    const nextTabs = { ...workspace.tabsById };
    delete nextTabs[tabId];
    const nextActiveTabId = workspace.activeTabId === tabId ? nextIds[0] : workspace.activeTabId;
    const nextWorkspace = setWorkspace(settings, {
        loadedTabIds: nextIds,
        tabsById: nextTabs,
        activeTabId: nextActiveTabId,
    });
    return nextActiveTabId;
}

export function getActiveBeatWorkspaceKind(settings: RadialTimelineSettings): BeatSourceKind | undefined {
    return getActiveLoadedBeatTab(settings)?.sourceKind;
}

export function getActiveBeatWorkspaceSystemId(settings: RadialTimelineSettings): string | undefined {
    const activeTab = getActiveLoadedBeatTab(settings);
    return activeTab ? getWorkspaceCustomSystemId(activeTab) : undefined;
}

export function getActiveBeatWorkspaceConfigKey(settings: RadialTimelineSettings): string | undefined {
    const activeTab = getActiveLoadedBeatTab(settings);
    return activeTab ? getLoadedBeatTabConfigKey(activeTab) : undefined;
}
