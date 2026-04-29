import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { createInMemoryApp, type InMemoryApp } from '../../tests/helpers/inMemoryObsidian';
import { buildOrderedKeyList, previewReorder, runYamlReorder } from './yamlManager';

const BACKDROP_CANONICAL_ORDER = ['ID', 'Class', 'When', 'End', 'Context'];
const noDynamic = (_key: string): boolean => false;

async function readFile(app: InMemoryApp, path: string): Promise<string> {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(`Missing file: ${path}`);
    return app.vault.read(file);
}

describe('yamlManager reorder', () => {
    it('canonicalizes aliased keys like class before reordering backdrop frontmatter', async () => {
        const app = createInMemoryApp({
            'Books/BookA/Backdrop.md': [
                '---',
                'ID: scn_d23a3033',
                'When: 2077-10-14T13:13:00',
                'End: 2085-04-15T12:00:00',
                'Context: Chae Ban leaves Earth after jumping in string.',
                'Test Field 1: The Test Value',
                'class: Backdrop',
                '---',
                'Body',
            ].join('\n'),
        });
        const file = app.vault.getMarkdownFiles()[0];

        const result = await runYamlReorder({
            app: app as never,
            files: [file],
            canonicalOrder: BACKDROP_CANONICAL_ORDER,
            isDynamic: noDynamic,
        });

        expect(result.reordered).toBe(1);
        expect(result.failed).toBe(0);
        expect(await readFile(app, 'Books/BookA/Backdrop.md')).toContain(
            [
                '---',
                'ID: scn_d23a3033',
                'Class: Backdrop',
                'When: 2077-10-14T13:13:00',
                'End: 2085-04-15T12:00:00',
                'Context: Chae Ban leaves Earth after jumping in string.',
                'Test Field 1: The Test Value',
            ].join('\n')
        );
    });

    it('shows canonicalized after-order in preview when a lowercase alias causes drift', () => {
        const app = createInMemoryApp({
            'Books/BookA/Backdrop.md': [
                '---',
                'ID: scn_d23a3033',
                'When: 2077-10-14T13:13:00',
                'End: 2085-04-15T12:00:00',
                'Context: Chae Ban leaves Earth after jumping in string.',
                'Test Field 1: The Test Value',
                'class: Backdrop',
                '---',
                'Body',
            ].join('\n'),
        });
        const file = app.vault.getMarkdownFiles()[0];

        expect(previewReorder(app as never, file, BACKDROP_CANONICAL_ORDER, noDynamic)).toEqual({
            before: ['ID', 'When', 'End', 'Context', 'Test Field 1', 'class'],
            after: ['ID', 'Class', 'When', 'End', 'Context', 'Test Field 1'],
        });
    });

    it('refuses reorder when duplicate canonical aliases would collapse author data', async () => {
        const app = createInMemoryApp({
            'Books/BookA/Backdrop.md': [
                '---',
                'ID: scn_d23a3033',
                'Description: Legacy value',
                'Purpose: New value',
                'Class: Backdrop',
                '---',
                'Body',
            ].join('\n'),
        });
        const file = app.vault.getMarkdownFiles()[0];

        const result = await runYamlReorder({
            app: app as never,
            files: [file],
            canonicalOrder: BACKDROP_CANONICAL_ORDER,
            isDynamic: noDynamic,
        });

        expect(result.reordered).toBe(0);
        expect(result.failed).toBe(1);
        expect(result.errors[0]?.error).toContain('duplicate canonical aliases');
        expect(await readFile(app, 'Books/BookA/Backdrop.md')).toContain('Description: Legacy value');
        expect(await readFile(app, 'Books/BookA/Backdrop.md')).toContain('Purpose: New value');
    });
});

describe('buildOrderedKeyList', () => {
    const canonical = ['ID', 'Class', 'Beat Model', 'Purpose'];
    const isGossamer = (key: string) => /^Gossamer/i.test(key);

    it('anchors a foreign key to its preceding canonical key when canonical zone is reordered', () => {
        // Author has Editorial wedged between Class and Beat Model in source order.
        // After reorder, ID must come first per canonical order; Editorial must
        // travel with its anchor (Class), not be flushed to the end.
        const current = ['Class', 'Editorial', 'Beat Model', 'ID', 'Purpose'];
        expect(buildOrderedKeyList(current, canonical, isGossamer)).toEqual([
            'ID', 'Class', 'Editorial', 'Beat Model', 'Purpose',
        ]);
    });

    it('keeps foreign keys at the head when no non-foreign predecessor exists', () => {
        const current = ['Editorial', 'Class', 'ID'];
        expect(buildOrderedKeyList(current, canonical, isGossamer)).toEqual([
            'Editorial', 'ID', 'Class',
        ]);
    });

    it('places dynamic keys after canonical zone in original relative order, with their own anchored foreigns', () => {
        const current = ['ID', 'Class', 'Beat Model', 'Purpose', 'Gossamer1', 'Editorial', 'GossamerStage1'];
        expect(buildOrderedKeyList(current, canonical, isGossamer)).toEqual([
            'ID', 'Class', 'Beat Model', 'Purpose', 'Gossamer1', 'Editorial', 'GossamerStage1',
        ]);
    });

    it('does not move foreign keys to the global end (the old append-at-end behavior)', () => {
        // Editorial was directly after ID in the source; it must remain after ID,
        // not be shoved to the bottom alongside dynamic keys.
        const current = ['ID', 'Editorial', 'Class', 'Gossamer1'];
        expect(buildOrderedKeyList(current, canonical, isGossamer)).toEqual([
            'ID', 'Editorial', 'Class', 'Gossamer1',
        ]);
    });
});
