import { describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { createInMemoryApp, type InMemoryApp } from '../../tests/helpers/inMemoryObsidian';
import { previewReorder, runYamlReorder } from './yamlManager';

const BACKDROP_CANONICAL_ORDER = ['ID', 'Class', 'When', 'End', 'Context'];

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

        expect(previewReorder(app as never, file, BACKDROP_CANONICAL_ORDER)).toEqual({
            before: ['ID', 'When', 'End', 'Context', 'Test Field 1', 'class'],
            after: ['ID', 'Class', 'When', 'End', 'Context', 'Test Field 1'],
        });
    });
});
