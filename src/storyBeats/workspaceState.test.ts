import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import type { RadialTimelineSettings, SavedBeatSystem } from '../types/settings';
import { getBeatLibraryItems } from './libraryState';
import { activateLoadedBeatTab, ensureBeatWorkspaceState, getActiveLoadedBeatTab, getLoadedBeatTabs, loadBeatTabFromLibraryItem } from './workspaceState';
import { resolveSelectedBeatModelFromSettings } from '../utils/beatSystemState';

function buildSettings(): RadialTimelineSettings {
    return {
        ...DEFAULT_SETTINGS,
        books: [
            {
                id: 'book-1',
                title: 'Book One',
                sourceFolder: 'Books/One',
            },
        ],
        activeBookId: 'book-1',
    };
}

describe('beat workspace compatibility adapter', () => {
    it('seeds a loaded builtin tab from legacy selection', () => {
        const settings = buildSettings();
        settings.beatSystem = 'Save The Cat';

        const workspace = ensureBeatWorkspaceState(settings);
        const loadedTabs = getLoadedBeatTabs(settings);

        expect(workspace.activeTabId).toBeTruthy();
        expect(loadedTabs).toHaveLength(1);
        expect(loadedTabs[0].sourceKind).toBe('builtin');
        expect(loadedTabs[0].name).toBe('Save The Cat');
        expect(resolveSelectedBeatModelFromSettings(settings)).toBe('Save The Cat');
    });

    it('seeds a loaded saved tab from legacy custom selection', () => {
        const settings = buildSettings();
        const savedSystem: SavedBeatSystem = {
            id: 'saved-1',
            name: 'Investigation Arc',
            description: 'Saved arc',
            beats: [
                { id: 'investigation:hook', name: 'Hook', act: 1 },
            ],
            createdAt: new Date().toISOString(),
        };
        settings.beatSystem = 'Custom';
        settings.activeCustomBeatSystemId = savedSystem.id;
        settings.savedBeatSystems = [...(settings.savedBeatSystems ?? []), savedSystem];

        const loadedTabs = getLoadedBeatTabs(settings);

        expect(loadedTabs).toHaveLength(1);
        expect(loadedTabs[0].sourceKind).toBe('saved');
        expect(loadedTabs[0].name).toBe('Investigation Arc');
        expect(resolveSelectedBeatModelFromSettings(settings)).toBe('Investigation Arc');
    });
});

describe('beat workspace loading', () => {
    it('prevents duplicate loads for the same library item', () => {
        const settings = buildSettings();
        settings.beatSystem = 'Save The Cat';

        const starterItem = getBeatLibraryItems(settings).find((item) => item.kind === 'starter');
        expect(starterItem).toBeTruthy();

        const firstLoad = loadBeatTabFromLibraryItem(settings, starterItem!);
        const secondLoad = loadBeatTabFromLibraryItem(settings, starterItem!);
        const loadedTabs = getLoadedBeatTabs(settings);

        expect(firstLoad.tabId).toBe(secondLoad.tabId);
        expect(loadedTabs.filter((tab) => tab.tabId === firstLoad.tabId)).toHaveLength(1);
    });

    it('uses the active loaded tab as the beat-model selector', () => {
        const settings = buildSettings();
        settings.beatSystem = 'Save The Cat';

        const starterItem = getBeatLibraryItems(settings).find((item) => item.kind === 'starter');
        expect(starterItem).toBeTruthy();

        const loaded = loadBeatTabFromLibraryItem(settings, starterItem!);

        expect(settings.beatSystem).toBe('Custom');
        expect(getActiveLoadedBeatTab(settings)?.tabId).toBe(loaded.tabId);
        expect(resolveSelectedBeatModelFromSettings(settings)).toBe(loaded.name);
    });

    it('can reactivate a previously loaded tab without fixed-tab state', () => {
        const settings = buildSettings();
        settings.beatSystem = 'Save The Cat';

        const builtinItem = getBeatLibraryItems(settings).find((item) => item.kind === 'builtin' && item.name === 'Story Grid');
        const starterItem = getBeatLibraryItems(settings).find((item) => item.kind === 'starter');
        expect(builtinItem).toBeTruthy();
        expect(starterItem).toBeTruthy();

        const builtinTab = loadBeatTabFromLibraryItem(settings, builtinItem!);
        const starterTab = loadBeatTabFromLibraryItem(settings, starterItem!);

        expect(resolveSelectedBeatModelFromSettings(settings)).toBe(starterTab.name);

        activateLoadedBeatTab(settings, builtinTab.tabId);

        expect(getActiveLoadedBeatTab(settings)?.tabId).toBe(builtinTab.tabId);
        expect(resolveSelectedBeatModelFromSettings(settings)).toBe('Story Grid');
    });
});
