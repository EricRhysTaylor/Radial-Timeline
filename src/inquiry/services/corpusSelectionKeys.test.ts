import { describe, expect, it } from 'vitest';
import {
    buildCorpusSelectionKey,
    buildLegacyCorpusSelectionKey,
    parseCorpusSelectionKey
} from './corpusSelectionKeys';

describe('corpusSelectionKeys', () => {
    it('keeps scene selection key stable across path changes when sceneId is present', () => {
        const first = buildCorpusSelectionKey({
            className: 'scene',
            scope: 'book',
            filePath: 'Book 1/12 Opening.md',
            sceneId: 'scn_a1b2c3d4'
        });

        const renamed = buildCorpusSelectionKey({
            className: 'scene',
            scope: 'book',
            filePath: 'Book 1/12 Opening Renamed.md',
            sceneId: 'scn_a1b2c3d4'
        });

        expect(first).toBe(renamed);
        expect(parseCorpusSelectionKey(first)).toMatchObject({
            className: 'scene',
            scope: 'book',
            sceneId: 'scn_a1b2c3d4',
            isLegacy: false
        });
    });

    it('parses legacy path keys for migration', () => {
        const legacy = buildLegacyCorpusSelectionKey({
            className: 'scene',
            scope: 'book',
            filePath: 'Book 1/12 Opening.md'
        });
        const parsed = parseCorpusSelectionKey(legacy);
        expect(parsed).toEqual({
            className: 'scene',
            scope: 'book',
            path: 'Book 1/12 Opening.md',
            isLegacy: true
        });
    });
});
