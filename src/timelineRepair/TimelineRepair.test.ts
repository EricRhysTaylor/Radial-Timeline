import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { TimelineItem } from '../types';
import { parseWhenField } from '../utils/date';
import { createInMemoryApp, type InMemoryApp } from '../../tests/helpers/inMemoryObsidian';
import { runPatternSync } from './patternSync';
import { runKeywordSweep } from './keywordSweep';
import { runRepairPipeline } from './RepairPipeline';
import { createSession } from './sessionDiff';
import { writeSessionChanges } from './frontmatterWriter';
import { buildScaffoldPreview } from './scaffoldPreview';

function makeFile(path: string): TFile {
    return new TFile(path);
}

function makeScene(
    path: string,
    overrides: Partial<TimelineItem> = {}
): TimelineItem {
    const basename = path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
    return {
        title: basename,
        date: '',
        path,
        ...overrides
    };
}

function toIsoLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
}

function makePluginWithBodies(bodyByPath: Record<string, string>): RadialTimelinePlugin {
    return {
        app: {
            vault: {
                cachedRead: async (file: TFile) => bodyByPath[file.path] ?? ''
            }
        }
    } as unknown as RadialTimelinePlugin;
}

async function readFile(app: InMemoryApp, path: string): Promise<string> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Missing file: ${path}`);
    return app.vault.read(file);
}

describe('timeline repair normalizer', () => {
    it('scaffolds workable sequential When values for all-missing scenes across the built-in patterns', () => {
        const baseInputs = [
            { scene: makeScene('Book/01.md'), file: makeFile('Book/01.md'), manuscriptIndex: 0 },
            { scene: makeScene('Book/02.md'), file: makeFile('Book/02.md'), manuscriptIndex: 1 },
            { scene: makeScene('Book/03.md'), file: makeFile('Book/03.md'), manuscriptIndex: 2 },
            { scene: makeScene('Book/04.md'), file: makeFile('Book/04.md'), manuscriptIndex: 3 },
            { scene: makeScene('Book/05.md'), file: makeFile('Book/05.md'), manuscriptIndex: 4 }
        ];

        const anchor = new Date(2026, 0, 10, 8, 0, 0, 0);

        expect(runPatternSync(baseInputs.slice(0, 3), {
            anchorWhen: anchor,
            patternPreset: 'daily'
        }).map(entry => toIsoLocal(entry.proposedWhen))).toEqual([
            '2026-01-10 08:00',
            '2026-01-11 08:00',
            '2026-01-12 08:00'
        ]);

        expect(runPatternSync(baseInputs.slice(0, 4), {
            anchorWhen: anchor,
            patternPreset: 'beats2'
        }).map(entry => toIsoLocal(entry.proposedWhen))).toEqual([
            '2026-01-10 08:00',
            '2026-01-10 19:00',
            '2026-01-11 08:00',
            '2026-01-11 19:00'
        ]);

        expect(runPatternSync(baseInputs, {
            anchorWhen: anchor,
            patternPreset: 'beats4'
        }).map(entry => toIsoLocal(entry.proposedWhen))).toEqual([
            '2026-01-10 08:00',
            '2026-01-10 13:00',
            '2026-01-10 19:00',
            '2026-01-10 23:00',
            '2026-01-11 08:00'
        ]);

        expect(runPatternSync(baseInputs.slice(0, 3), {
            anchorWhen: anchor,
            patternPreset: 'weekly'
        }).map(entry => toIsoLocal(entry.proposedWhen))).toEqual([
            '2026-01-10 08:00',
            '2026-01-17 08:00',
            '2026-01-24 08:00'
        ]);
    });

    it('handles mixed valid and invalid When values without pretending the invalid ones were valid', () => {
        const entries = runPatternSync([
            {
                scene: makeScene('Book/01.md', { when: new Date(2026, 0, 10, 8, 0, 0, 0) }),
                file: makeFile('Book/01.md'),
                manuscriptIndex: 0
            },
            {
                scene: makeScene('Book/02.md', { when: new Date(2026, 0, 12, 8, 0, 0, 0) }),
                file: makeFile('Book/02.md'),
                manuscriptIndex: 1
            },
            {
                scene: makeScene('Book/03.md', { when: 'tomorrow-ish' as unknown as Date }),
                file: makeFile('Book/03.md'),
                manuscriptIndex: 2
            }
        ], {
            anchorWhen: new Date(2026, 0, 10, 8, 0, 0, 0),
            patternPreset: 'daily'
        });

        expect(entries[0].isChanged).toBe(false);
        expect(entries[1].originalWhen?.getTime()).toBe(new Date(2026, 0, 12, 8, 0, 0, 0).getTime());
        expect(entries[1].isChanged).toBe(true);
        expect(entries[2].originalWhen).toBeNull();
        expect(entries[2].originalWhenRaw).toBe('tomorrow-ish');
        expect(entries[2].isChanged).toBe(true);
    });

    it('refines the scaffold from explicit text cues like "next morning" and "three days later"', async () => {
        const entries = runPatternSync([
            { scene: makeScene('Book/01.md', { synopsis: 'Arrival.' }), file: makeFile('Book/01.md'), manuscriptIndex: 0 },
            { scene: makeScene('Book/02.md', { synopsis: 'They regroup the next morning.' }), file: makeFile('Book/02.md'), manuscriptIndex: 1 },
            { scene: makeScene('Book/03.md', { synopsis: 'Three days later, they return.' }), file: makeFile('Book/03.md'), manuscriptIndex: 2 }
        ], {
            anchorWhen: new Date(2026, 0, 10, 19, 0, 0, 0),
            patternPreset: 'daily'
        });

        const refined = await runKeywordSweep(entries, async () => '', { includeSynopsis: true });

        expect(refined.map(entry => entry.source)).toEqual(['pattern', 'keyword', 'keyword']);
        expect(toIsoLocal(refined[1].proposedWhen)).toBe('2026-01-11 08:00');
        expect(toIsoLocal(refined[2].proposedWhen)).toBe('2026-01-14 08:00');
    });

    it('scaffolds the whole book and only applies simple text cues when enabled', async () => {
        const scenes = [
            makeScene('Book/01.md', { actNumber: 1, subplot: 'A', synopsis: 'Opening scene.' }),
            makeScene('Book/02.md', { actNumber: 1, subplot: 'A', synopsis: 'This happens after dawn, though not stated directly.' }),
            makeScene('Book/03.md', { actNumber: 2, subplot: 'B', synopsis: 'Separate thread.' })
        ];
        const files = new Map(scenes.map(scene => [scene.path!, makeFile(scene.path!)]));
        const plugin = makePluginWithBodies({
            'Book/01.md': 'Body one',
            'Book/02.md': 'The next stretch clearly lands the following morning.',
            'Book/03.md': 'Body three'
        });

        const configBase = {
            anchorWhen: new Date(2026, 0, 10, 8, 0, 0, 0),
            anchorSceneIndex: 0,
            patternPreset: 'daily' as const,
            useTextCues: false
        };

        const withoutCues = await runRepairPipeline(scenes, files, plugin, configBase);

        expect(withoutCues.entries).toHaveLength(3);
        expect(withoutCues.entries.map(entry => entry.source)).toEqual(['pattern', 'pattern', 'pattern']);
        expect(withoutCues.cueRefined).toBe(0);
        expect(toIsoLocal(withoutCues.entries[1].proposedWhen)).toBe('2026-01-11 08:00');
        expect(toIsoLocal(withoutCues.entries[2].proposedWhen)).toBe('2026-01-12 08:00');

        const withCues = await runRepairPipeline(scenes, files, plugin, {
            ...configBase,
            useTextCues: true
        });

        expect(withCues.entries).toHaveLength(3);
        expect(withCues.entries[1].source).toBe('keyword');
        expect(toIsoLocal(withCues.entries[1].proposedWhen)).toBe('2026-01-11 08:00');
        expect(withCues.cueRefined).toBe(1);
        expect(withCues.entries[2].source).toBe('pattern');
    });

    it('builds compact preview labels for each pattern and reflects anchor changes', () => {
        const daily = buildScaffoldPreview('daily', new Date(2026, 11, 27, 0, 0, 0, 0), 82);
        expect(daily.startLabel).toBe('Start: Dec 27, 2026 · 12:00 AM');
        expect(daily.helperLabel).toBe('Scaffolds 82 scenes in narrative order.');
        expect(daily.steps.map(step => step.spacingLabel)).toEqual([
            'Day 1',
            'Day 2',
            'Day 3',
            'Day 4',
            'Day 5'
        ]);

        const twoBeatMorning = buildScaffoldPreview('beats2', new Date(2026, 0, 10, 8, 0, 0, 0), 5);
        expect(twoBeatMorning.steps.map(step => step.spacingLabel)).toEqual([
            'Morning',
            'Evening',
            'Morning',
            'Evening',
            'Morning'
        ]);

        const twoBeatEvening = buildScaffoldPreview('beats2', new Date(2026, 0, 10, 19, 0, 0, 0), 5);
        expect(twoBeatEvening.startLabel).toBe('Start: Jan 10, 2026 · 7:00 PM');
        expect(twoBeatEvening.steps.map(step => step.spacingLabel)).toEqual([
            'Evening',
            'Morning',
            'Evening',
            'Morning',
            'Evening'
        ]);

        const fourBeat = buildScaffoldPreview('beats4', new Date(2026, 0, 10, 13, 0, 0, 0), 5);
        expect(fourBeat.steps.map(step => step.spacingLabel)).toEqual([
            'Afternoon',
            'Evening',
            'Night',
            'Morning',
            'Afternoon'
        ]);

        const weekly = buildScaffoldPreview('weekly', new Date(2026, 0, 10, 8, 0, 0, 0), 4);
        expect(weekly.steps.map(step => step.spacingLabel)).toEqual([
            'Week 1',
            'Week 2',
            'Week 3',
            'Week 4'
        ]);
    });

    it('writes YAML only for changed scenes and leaves Chronologue materially more usable after apply', async () => {
        const app = createInMemoryApp({
            'Book/01 Scene.md': '---\nClass: Scene\n---\nScene one',
            'Book/02 Scene.md': '---\nClass: Scene\nWhen: 2026-01-02 08:00\n---\nScene two',
            'Book/03 Scene.md': '---\nClass: Scene\nWhen: ???\n---\nScene three'
        });

        const file1 = app.vault.getAbstractFileByPath('Book/01 Scene.md');
        const file2 = app.vault.getAbstractFileByPath('Book/02 Scene.md');
        const file3 = app.vault.getAbstractFileByPath('Book/03 Scene.md');

        if (!(file1 instanceof TFile) || !(file2 instanceof TFile) || !(file3 instanceof TFile)) {
            throw new Error('Expected TFiles');
        }

        const scenes = [
            makeScene('Book/01 Scene.md'),
            makeScene('Book/02 Scene.md', { when: new Date(2026, 0, 2, 8, 0, 0, 0) }),
            makeScene('Book/03 Scene.md', { when: '???' as unknown as Date })
        ];

        const entries = runPatternSync([
            { scene: scenes[0], file: file1, manuscriptIndex: 0 },
            { scene: scenes[1], file: file2, manuscriptIndex: 1 },
            { scene: scenes[2], file: file3, manuscriptIndex: 2 }
        ], {
            anchorWhen: new Date(2026, 0, 1, 8, 0, 0, 0),
            patternPreset: 'daily'
        });

        const session = createSession({
            entries,
            totalScenes: entries.length,
            scenesChanged: entries.filter(entry => entry.isChanged).length,
            scenesNeedingReview: 0,
            scenesWithBackwardTime: 0,
            scenesWithLargeGaps: 0,
            patternApplied: entries.length,
            cueRefined: 0
        });

        const result = await writeSessionChanges(app as never, session);

        expect(result.success).toBe(2);
        expect(result.failed).toBe(0);

        const scene1 = await readFile(app, 'Book/01 Scene.md');
        const scene2 = await readFile(app, 'Book/02 Scene.md');
        const scene3 = await readFile(app, 'Book/03 Scene.md');

        expect(scene1).toContain('When: 2026-01-01 08:00');
        expect(scene1).toContain('WhenSource: pattern');
        expect(scene1).toContain('WhenConfidence: high');

        expect(scene2).toBe('---\nClass: Scene\nWhen: 2026-01-02 08:00\n---\nScene two');

        expect(scene3).toContain('When: 2026-01-03 08:00');
        expect(scene3).toContain('WhenSource: pattern');
        expect(scene3).toContain('WhenConfidence: high');

        const parsedWhens = [scene1, scene2, scene3]
            .map(content => content.match(/^---\n([\s\S]*?)\n---/m)?.[1] ?? '')
            .map(frontmatter => frontmatter.match(/^When:\s*(.+)$/m)?.[1] ?? null)
            .map(value => value ? parseWhenField(value) : null);

        expect(parsedWhens.every(value => value instanceof Date && !isNaN(value.getTime()))).toBe(true);
        expect(parsedWhens.map(value => value?.getTime())).toEqual([
            new Date(2026, 0, 1, 8, 0, 0, 0).getTime(),
            new Date(2026, 0, 2, 8, 0, 0, 0).getTime(),
            new Date(2026, 0, 3, 8, 0, 0, 0).getTime()
        ]);
    });
});
