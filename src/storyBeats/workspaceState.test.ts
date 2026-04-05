import { describe, expect, it } from 'vitest';
import { TFolder } from 'obsidian';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import type { RadialTimelineSettings, SavedBeatSystem } from '../types/settings';
import { getBeatLibraryItems } from './libraryState';
import { activateLoadedBeatTab, ensureBeatWorkspaceState, ensureMaterializedBeatWorkspaceState, getActiveLoadedBeatTab, getLoadedBeatTabs, getMaterializedBeatTabs, loadBeatTabFromLibraryItem, unloadBeatTab } from './workspaceState';
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

function buildBeatApp(frontmatters: Array<Record<string, unknown>>) {
    const files = frontmatters.map((frontmatter, index) => ({
        path: `Books/One/${index + 1}.md`,
        basename: typeof frontmatter.Title === 'string' ? String(frontmatter.Title) : `Beat ${index + 1}`,
    }));
    const folder = Object.assign(Object.create(TFolder.prototype), {
        path: 'Books/One',
        children: [],
    });
    return {
        vault: {
            getMarkdownFiles: () => files,
            getAbstractFileByPath: (path: string) => path === 'Books/One' ? folder : null,
        },
        metadataCache: {
            getFileCache: (file: typeof files[number]) => ({
                frontmatter: frontmatters[files.findIndex((entry) => entry.path === file.path)],
            }),
        },
    } as any;
}

describe('beat workspace initialization', () => {
    it('does not auto-seed tabs when no workspace or manuscript systems exist', () => {
        const settings = buildSettings();

        const workspace = ensureBeatWorkspaceState(settings);
        const loadedTabs = getLoadedBeatTabs(settings);

        expect(workspace.activeTabId).toBeUndefined();
        expect(loadedTabs).toHaveLength(0);
        expect(resolveSelectedBeatModelFromSettings(settings)).toBeUndefined();
    });

    it('materializes detected manuscript systems into the persisted workspace', () => {
        const settings = buildSettings();
        const app = buildBeatApp([
            {
                ID: 'story-grid:inciting-incident',
                Class: 'Beat',
                'Beat Model': 'Story Grid',
                Title: 'Inciting Incident',
                Act: 1,
            },
        ]);

        const workspace = ensureMaterializedBeatWorkspaceState(app, settings);
        const loadedTabs = getLoadedBeatTabs(settings);

        expect(workspace.activeTabId).toBeUndefined();
        expect(loadedTabs).toHaveLength(1);
        expect(loadedTabs[0].sourceKind).toBe('builtin');
        expect(loadedTabs[0].name).toBe('Story Grid');
        expect(getActiveLoadedBeatTab(settings)).toBeUndefined();
        expect(resolveSelectedBeatModelFromSettings(settings)).toBeUndefined();
    });
});

describe('beat workspace loading', () => {
    it('prevents duplicate loads for the same library item', () => {
        const settings = buildSettings();

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

        const starterItem = getBeatLibraryItems(settings).find((item) => item.kind === 'starter');
        expect(starterItem).toBeTruthy();

        const loaded = loadBeatTabFromLibraryItem(settings, starterItem!);

        expect(getActiveLoadedBeatTab(settings)?.tabId).toBe(loaded.tabId);
        expect(resolveSelectedBeatModelFromSettings(settings)).toBe(loaded.name);
    });

    it('can reactivate a previously loaded tab without fixed-tab state', () => {
        const settings = buildSettings();

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

    it('restores the selected beat system for each book independently', () => {
        const settings: RadialTimelineSettings = {
            ...DEFAULT_SETTINGS,
            books: [
                { id: 'book-1', title: 'Book One', sourceFolder: 'Books/One' },
                { id: 'book-2', title: 'Book Two', sourceFolder: 'Books/Two' },
            ],
            activeBookId: 'book-1',
        };

        const storyGrid = getBeatLibraryItems(settings).find((item) => item.kind === 'builtin' && item.name === 'Story Grid');
        const starter = getBeatLibraryItems(settings).find((item) => item.kind === 'starter');
        expect(storyGrid).toBeTruthy();
        expect(starter).toBeTruthy();

        loadBeatTabFromLibraryItem(settings, storyGrid!);
        expect(resolveSelectedBeatModelFromSettings(settings)).toBe('Story Grid');

        settings.activeBookId = 'book-2';
        loadBeatTabFromLibraryItem(settings, starter!);
        expect(resolveSelectedBeatModelFromSettings(settings)).toBe(starter!.name);

        settings.activeBookId = 'book-1';
        expect(resolveSelectedBeatModelFromSettings(settings)).toBe('Story Grid');
    });
});

describe('manuscript-detected beat tabs', () => {
    it('materializes recognized manuscript systems as canonical tabs', () => {
        const settings = buildSettings();
        const app = buildBeatApp([
            {
                ID: 'story-grid:inciting-incident',
                Class: 'Beat',
                'Beat Model': 'Story Grid',
                Title: 'Inciting Incident',
                Act: 1,
            },
        ]);

        const tabs = getMaterializedBeatTabs(app, settings);

        expect(tabs.map((tab) => tab.name)).toContain('Story Grid');
        expect(tabs.every((tab) => tab.name !== 'Save The Cat')).toBe(true);
        expect(tabs.find((tab) => tab.name === 'Story Grid')?.sourceKind).toBe('builtin');
    });

    it('materializes unknown manuscript systems as detected generic tabs', () => {
        const settings = buildSettings();
        const app = buildBeatApp([
            {
                ID: 'beat-1',
                Class: 'Beat',
                'Beat Model': 'Historical Spiral',
                Title: 'Archive Shock',
                Act: 2,
                Purpose: 'The thesis turns.',
            },
        ]);

        const tabs = getMaterializedBeatTabs(app, settings);
        const detectedTab = tabs.find((tab) => tab.name === 'Historical Spiral');

        expect(detectedTab).toBeTruthy();
        expect(detectedTab?.sourceKind).toBe('detected');
        expect(detectedTab?.description).toBe('No matching system definition found.');
        expect(detectedTab?.beats).toHaveLength(1);
        expect(detectedTab?.beats[0].name).toBe('Archive Shock');
    });

    it('does not auto-select a detected manuscript tab when bootstrapped into workspace', () => {
        const settings = buildSettings();
        const app = buildBeatApp([
            {
                ID: 'beat-1',
                Class: 'Beat',
                'Beat Model': 'Historical Spiral',
                Title: 'Archive Shock',
                Act: 2,
            },
        ]);

        ensureMaterializedBeatWorkspaceState(app, settings);

        expect(getActiveLoadedBeatTab(settings)).toBeUndefined();
        expect(resolveSelectedBeatModelFromSettings(settings)).toBeUndefined();
        expect(getLoadedBeatTabs(settings).map((tab) => tab.name)).toContain('Historical Spiral');
    });
});

describe('unloadBeatTab (safe close)', () => {
    it('removes the tab from workspace without affecting other tabs', () => {
        const settings = buildSettings();
        const items = getBeatLibraryItems(settings);
        const storyGrid = items.find((item) => item.kind === 'builtin' && item.name === 'Story Grid')!;
        const starter = items.find((item) => item.kind === 'starter')!;

        loadBeatTabFromLibraryItem(settings, storyGrid);
        const starterTab = loadBeatTabFromLibraryItem(settings, starter);

        expect(getLoadedBeatTabs(settings)).toHaveLength(2);

        unloadBeatTab(settings, starterTab.tabId);

        const remaining = getLoadedBeatTabs(settings);
        expect(remaining).toHaveLength(1);
        expect(remaining[0].name).toBe('Story Grid');
    });

    it('selects the next tab when the active tab is closed', () => {
        const settings = buildSettings();
        const items = getBeatLibraryItems(settings);
        const storyGrid = items.find((item) => item.kind === 'builtin' && item.name === 'Story Grid')!;
        const starter = items.find((item) => item.kind === 'starter')!;

        const sgTab = loadBeatTabFromLibraryItem(settings, storyGrid);
        loadBeatTabFromLibraryItem(settings, starter);

        activateLoadedBeatTab(settings, sgTab.tabId);
        expect(getActiveLoadedBeatTab(settings)?.tabId).toBe(sgTab.tabId);

        const nextActiveId = unloadBeatTab(settings, sgTab.tabId);

        expect(getLoadedBeatTabs(settings)).toHaveLength(1);
        expect(nextActiveId).toBeDefined();
        expect(getActiveLoadedBeatTab(settings)?.name).toBe(starter.name);
    });

    it('returns undefined when the last tab is closed', () => {
        const settings = buildSettings();
        const items = getBeatLibraryItems(settings);
        const starter = items.find((item) => item.kind === 'starter')!;

        const tab = loadBeatTabFromLibraryItem(settings, starter);
        const nextActiveId = unloadBeatTab(settings, tab.tabId);

        expect(getLoadedBeatTabs(settings)).toHaveLength(0);
        expect(nextActiveId).toBeUndefined();
        expect(getActiveLoadedBeatTab(settings)).toBeUndefined();
    });

    it('is a no-op for an unknown tab id', () => {
        const settings = buildSettings();
        const items = getBeatLibraryItems(settings);
        const starter = items.find((item) => item.kind === 'starter')!;

        const tab = loadBeatTabFromLibraryItem(settings, starter);
        const result = unloadBeatTab(settings, 'nonexistent-tab-id');

        expect(getLoadedBeatTabs(settings)).toHaveLength(1);
        expect(getActiveLoadedBeatTab(settings)?.tabId).toBe(tab.tabId);
        expect(result).toBe(tab.tabId);
    });

    it('does not touch beat system configs — only removes the workspace tab', () => {
        const settings = buildSettings();
        const items = getBeatLibraryItems(settings);
        const starter = items.find((item) => item.kind === 'starter')!;

        const tab = loadBeatTabFromLibraryItem(settings, starter);
        const configsBefore = JSON.stringify(settings.beatSystemConfigs);

        unloadBeatTab(settings, tab.tabId);

        expect(JSON.stringify(settings.beatSystemConfigs)).toBe(configsBefore);
        expect(getLoadedBeatTabs(settings)).toHaveLength(0);
    });

    it('unloading multiple tabs sequentially leaves workspace empty', () => {
        const settings = buildSettings();
        const items = getBeatLibraryItems(settings);
        const storyGrid = items.find((item) => item.kind === 'builtin' && item.name === 'Story Grid')!;
        const starter = items.find((item) => item.kind === 'starter')!;

        loadBeatTabFromLibraryItem(settings, storyGrid);
        const starterTab = loadBeatTabFromLibraryItem(settings, starter);

        // Close Story Grid (safe, non-destructive)
        const sgTab = getLoadedBeatTabs(settings).find((t) => t.name === 'Story Grid')!;
        unloadBeatTab(settings, sgTab.tabId);

        // Only starter remains, still active
        expect(getLoadedBeatTabs(settings)).toHaveLength(1);
        expect(getActiveLoadedBeatTab(settings)?.tabId).toBe(starterTab.tabId);
        expect(resolveSelectedBeatModelFromSettings(settings)).toBe(starter.name);

        // Configs untouched — deletion of notes would be a separate vault operation
        const configsAfterClose = JSON.stringify(settings.beatSystemConfigs);

        // Now close the last tab
        unloadBeatTab(settings, starterTab.tabId);
        expect(getLoadedBeatTabs(settings)).toHaveLength(0);
        expect(JSON.stringify(settings.beatSystemConfigs)).toBe(configsAfterClose);
    });
});
