import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '../types';
import { buildTimelineSearchTextFields, timelineSceneMatchesSearch } from './SearchService';

function makeScene(overrides: Partial<TimelineItem> = {}): TimelineItem {
    return {
        date: '2026-04-09',
        when: new Date(2026, 3, 9, 12, 0, 0),
        path: 'Scenes/42 Embryo Clinic.md',
        title: '42 Embryo Clinic',
        synopsis: 'Chae Ban undergoes a medical scan.',
        Duration: '1 hour',
        subplot: 'Chae Ban & Trisan Pregnancy',
        Character: ['Chae Ban', 'Entiat Chelan'],
        currentSceneAnalysis: 'Body autonomy threat + / Pacification proposal personalizes stakes immediately',
        previousSceneAnalysis: 'Family fractures ? / Support network shaky before Chae stands alone',
        nextSceneAnalysis: 'Authority as predator + / Entiat threat manifests as open violence',
        rawFrontmatter: {
            Place: 'Diego, Earth',
            POV: 'Unindexed POV'
        },
        itemType: 'Scene',
        ...overrides
    };
}

describe('timeline search surface', () => {
    it('indexes only requested hover-visible scene fields plus current pulse analysis', () => {
        const scene = makeScene();
        const fields = buildTimelineSearchTextFields(scene, {
            includeCurrentSceneAnalysis: true,
            planetaryLine: 'MARS: SOL YEAR 61'
        });

        expect(fields.join('\n')).toContain('42 Embryo Clinic');
        expect(fields.join('\n')).toContain('Chae Ban undergoes a medical scan.');
        expect(fields.join('\n')).toContain('1 hour');
        expect(fields.join('\n')).toContain('Chae Ban & Trisan Pregnancy');
        expect(fields.join('\n')).toContain('Entiat Chelan');
        expect(fields.join('\n')).toContain('Body autonomy threat');
        expect(fields.join('\n')).toContain('MARS: SOL YEAR 61');
        expect(fields.join('\n')).not.toContain('Family fractures');
        expect(fields.join('\n')).not.toContain('Authority as predator');
        expect(fields.join('\n')).not.toContain('Diego, Earth');
        expect(fields.join('\n')).not.toContain('Unindexed POV');
    });

    it('does not match previous or next pulse YAML', () => {
        const scene = makeScene();

        expect(timelineSceneMatchesSearch(scene, 'Body autonomy threat', {
            includeCurrentSceneAnalysis: true
        })).toBe(true);
        expect(timelineSceneMatchesSearch(scene, 'Family fractures', {
            includeCurrentSceneAnalysis: true
        })).toBe(false);
        expect(timelineSceneMatchesSearch(scene, 'Authority as predator', {
            includeCurrentSceneAnalysis: true
        })).toBe(false);
    });

    it('matches title, date, duration, synopsis, character, and subplot text', () => {
        const scene = makeScene();

        expect(timelineSceneMatchesSearch(scene, 'Embryo Clinic')).toBe(true);
        expect(timelineSceneMatchesSearch(scene, 'Apr 9, 2026 @ Noon')).toBe(true);
        expect(timelineSceneMatchesSearch(scene, '4/9/2026')).toBe(true);
        expect(timelineSceneMatchesSearch(scene, '1 hour')).toBe(true);
        expect(timelineSceneMatchesSearch(scene, 'medical scan')).toBe(true);
        expect(timelineSceneMatchesSearch(scene, 'Entiat Chelan')).toBe(true);
        expect(timelineSceneMatchesSearch(scene, 'Trisan Pregnancy')).toBe(true);
    });
});
