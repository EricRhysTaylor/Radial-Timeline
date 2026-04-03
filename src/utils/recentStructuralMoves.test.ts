import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import type { RadialTimelineSettings, StructuralMoveHistoryEntry } from '../types/settings';
import {
    MAX_RECENT_STRUCTURAL_MOVES,
    appendRecentStructuralMove,
    getActiveRecentStructuralMoves,
    normalizeRecentStructuralMoves
} from './recentStructuralMoves';

function makeSettings(): RadialTimelineSettings {
    return {
        ...DEFAULT_SETTINGS,
        books: [
            { id: 'book-1', title: 'Book One', sourceFolder: 'Books/One' },
            { id: 'book-2', title: 'Book Two', sourceFolder: 'Books/Two' }
        ],
        activeBookId: 'book-1'
    };
}

function makeEntry(index: number, overrides: Partial<StructuralMoveHistoryEntry> = {}): StructuralMoveHistoryEntry {
    return {
        timestamp: new Date(Date.UTC(2026, 0, index, 12, 0, 0)).toISOString(),
        itemType: 'Scene',
        itemId: `scene_${index}`,
        itemLabel: `Scene ${index}`,
        summary: `Moved Scene ${index} before Scene ${index + 1}`,
        ...overrides
    };
}

describe('recent structural moves', () => {
    it('keeps newest first and trims to the last five entries', () => {
        const settings = makeSettings();

        for (let i = 1; i <= 7; i += 1) {
            appendRecentStructuralMove(settings, makeEntry(i));
        }

        const entries = getActiveRecentStructuralMoves(settings);
        expect(entries).toHaveLength(MAX_RECENT_STRUCTURAL_MOVES);
        expect(entries.map((entry) => entry.itemId)).toEqual([
            'scene_7',
            'scene_6',
            'scene_5',
            'scene_4',
            'scene_3'
        ]);
    });

    it('stores history per active book', () => {
        const settings = makeSettings();
        appendRecentStructuralMove(settings, makeEntry(1));

        settings.activeBookId = 'book-2';
        appendRecentStructuralMove(settings, makeEntry(2, { itemId: 'scene_book_2' }));

        expect(getActiveRecentStructuralMoves(settings).map((entry) => entry.itemId)).toEqual(['scene_book_2']);

        settings.activeBookId = 'book-1';
        expect(getActiveRecentStructuralMoves(settings).map((entry) => entry.itemId)).toEqual(['scene_1']);
    });

    it('normalizes invalid rows away and preserves valid history', () => {
        const normalized = normalizeRecentStructuralMoves([
            makeEntry(1),
            { ...makeEntry(2), itemId: '   ' },
            { ...makeEntry(3), summary: '   ' }
        ] as StructuralMoveHistoryEntry[]);

        expect(normalized).toEqual([makeEntry(1)]);
    });
});
