import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { migrateBeatSettings } from './beatSettings';
import type { RadialTimelineSettings } from '../types/settings';
import { resolveSelectedBeatModelFromSettings } from '../utils/beatSystemState';

describe('migrateBeatSettings', () => {
    it('moves legacy custom beat state into the canonical saved-system model and strips legacy fields', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            savedBeatSystems: [],
            beatSystemConfigs: undefined,
            activeCustomBeatSystemId: undefined,
            beatYamlTemplates: {
                base: 'Class: Beat\nDescription: {{Description}}\nBeat Id: {{BeatId}}\nWhen:\nPurpose:',
                advanced: 'Description:\nChapter:\nLegacy Field:\nWhen:'
            },
            beatHoverMetadataFields: [
                { key: 'Legacy Hover', label: 'Legacy Hover', icon: 'book', enabled: true }
            ],
            customBeatSystemName: 'Podcast Arc',
            customBeatSystemDescription: 'Legacy description',
            customBeatSystemBeats: [
                { name: 'Cold Open', act: 1 },
                { name: 'Reveal', act: 2, id: 'custom:default:reveal' }
            ]
        } as typeof DEFAULT_SETTINGS & Record<string, unknown>;

        const result = migrateBeatSettings(settings);

        expect(result.changed).toBe(true);
        expect(settings.activeCustomBeatSystemId).toBe('default');
        expect(settings.savedBeatSystems).toHaveLength(1);
        expect(settings.savedBeatSystems?.[0]).toMatchObject({
            id: 'default',
            name: 'Podcast Arc',
            description: 'Legacy description'
        });
        expect(settings.savedBeatSystems?.[0].beats).toHaveLength(2);
        expect(settings.savedBeatSystems?.[0].beats[0]?.id).toMatch(/^custom:default:/);
        expect(settings.beatSystemConfigs?.['Save The Cat']).toEqual({
            beatYamlAdvanced: 'Legacy Field:',
            beatHoverMetadataFields: [{ key: 'Legacy Hover', label: 'Legacy Hover', icon: 'book', enabled: true }]
        });
        expect(settings.beatSystemConfigs?.['custom:default']).toEqual({
            beatYamlAdvanced: 'Legacy Field:',
            beatHoverMetadataFields: [{ key: 'Legacy Hover', label: 'Legacy Hover', icon: 'book', enabled: true }]
        });
        expect(settings.beatYamlTemplates?.base).toContain('Purpose: {{Description}}');
        expect(settings.beatYamlTemplates?.base).not.toContain('Description:');
        expect(settings.beatYamlTemplates?.base).not.toContain('Beat Id:');
        expect('advanced' in (settings.beatYamlTemplates ?? {})).toBe(false);
        expect('customBeatSystemName' in settings).toBe(false);
        expect('customBeatSystemDescription' in settings).toBe(false);
        expect('customBeatSystemBeats' in settings).toBe(false);
        expect('beatHoverMetadataFields' in settings).toBe(false);
    });

    it('seeds missing per-book selections from the legacy global beat system once', () => {
        const settings: RadialTimelineSettings = {
            ...DEFAULT_SETTINGS,
            beatSelectionMigrationComplete: false,
            beatSystem: 'Story Grid',
            books: [
                { id: 'book-1', title: 'Book One', sourceFolder: 'Books/One' },
                { id: 'book-2', title: 'Book Two', sourceFolder: 'Books/Two' },
            ],
            activeBookId: 'book-1',
        };

        const result = migrateBeatSettings(settings);

        expect(result.selectionMigrated).toBe(true);
        expect(settings.beatSelectionMigrationComplete).toBe(true);
        expect(settings.beatSystem).toBeUndefined();
        settings.activeBookId = 'book-1';
        expect(resolveSelectedBeatModelFromSettings(settings)).toBe('Classic Dramatic Structure');
        settings.activeBookId = 'book-2';
        expect(resolveSelectedBeatModelFromSettings(settings)).toBe('Classic Dramatic Structure');
    });

    it('never overrides an existing per-book workspace selection during migration', () => {
        const settings: RadialTimelineSettings = {
            ...DEFAULT_SETTINGS,
            beatSelectionMigrationComplete: false,
            beatSystem: 'Story Grid',
            books: [
                {
                    id: 'book-1',
                    title: 'Book One',
                    sourceFolder: 'Books/One',
                    beatWorkspace: {
                        loadedTabIds: ['beat-tab:builtin:builtin:save_the_cat'],
                        tabsById: {
                            'beat-tab:builtin:builtin:save_the_cat': {
                                tabId: 'beat-tab:builtin:builtin:save_the_cat',
                                sourceKind: 'builtin',
                                sourceId: 'builtin:save_the_cat',
                                name: 'Save The Cat',
                                description: '',
                                beats: [],
                                config: { beatYamlAdvanced: '', beatHoverMetadataFields: [] },
                                dirty: false,
                            },
                        },
                        activeTabId: 'beat-tab:builtin:builtin:save_the_cat',
                    },
                },
            ],
            activeBookId: 'book-1',
        };

        migrateBeatSettings(settings);

        expect(resolveSelectedBeatModelFromSettings(settings)).toBe('Save The Cat');
    });

    it('leaves untouched books explicitly unset when no legacy global selection exists', () => {
        const settings: RadialTimelineSettings = {
            ...DEFAULT_SETTINGS,
            beatSelectionMigrationComplete: false,
            beatSystem: undefined,
            books: [
                { id: 'book-1', title: 'Book One', sourceFolder: 'Books/One' },
            ],
            activeBookId: 'book-1',
        };

        const result = migrateBeatSettings(settings);

        expect(result.selectionMigrated).toBe(true);
        expect(resolveSelectedBeatModelFromSettings(settings)).toBeUndefined();
        expect(settings.books[0]?.beatWorkspace).toBeUndefined();
    });

    it('is idempotent and does not reseed after the first migration run', () => {
        const settings: RadialTimelineSettings = {
            ...DEFAULT_SETTINGS,
            beatSelectionMigrationComplete: false,
            beatSystem: 'Story Grid',
            books: [
                { id: 'book-1', title: 'Book One', sourceFolder: 'Books/One' },
            ],
            activeBookId: 'book-1',
        };

        migrateBeatSettings(settings);
        const firstWorkspace = JSON.stringify(settings.books[0]?.beatWorkspace);

        settings.books.push({ id: 'book-2', title: 'Book Two', sourceFolder: 'Books/Two' });
        const second = migrateBeatSettings(settings);

        expect(second.selectionMigrated).toBe(false);
        expect(JSON.stringify(settings.books[0]?.beatWorkspace)).toBe(firstWorkspace);
        settings.activeBookId = 'book-2';
        expect(resolveSelectedBeatModelFromSettings(settings)).toBeUndefined();
    });
});
