import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { migrateBeatSettings } from './beatSettings';

describe('migrateBeatSettings', () => {
    it('moves legacy custom beat state into the canonical saved-system model and strips legacy fields', () => {
        const settings = {
            ...DEFAULT_SETTINGS,
            savedBeatSystems: [],
            beatSystemConfigs: undefined,
            activeCustomBeatSystemId: undefined,
            beatYamlTemplates: {
                base: 'Class: Beat\nDescription: {{Description}}\nBeat Id: {{BeatId}}\nWhen:\nPurpose:',
                advanced: 'Description:\nLegacy Field:\nWhen:'
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
});
