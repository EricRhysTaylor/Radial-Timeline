import { describe, expect, it } from 'vitest';
import { buildPublishingProgressStages } from './publishingProgress';

describe('publishingProgress', () => {
    it('marks a fresh publishing setup as needing setup', () => {
        const stages = buildPublishingProgressStages({
            hasBookMeta: false,
            bookMetaSummary: { state: 'blocked' },
            matterSummary: { state: 'ready' },
            matterCount: 0,
            layoutSummary: { state: 'ready', validCount: 0, totalCount: 0 },
            pandocPathValid: false,
        });

        expect(stages.map(stage => stage.id)).toEqual([
            'book-details',
            'book-pages',
            'pdf-style',
            'export-check',
        ]);
        expect(stages[0].statusLabel).toBe('Needs setup');
        expect(stages[1].statusLabel).toBe('Needs setup');
        expect(stages[2].statusLabel).toBe('Needs setup');
        expect(stages[3].statusLabel).toBe('Attention needed');
    });

    it('marks the setup row ready when publishing inputs are complete', () => {
        const stages = buildPublishingProgressStages({
            hasBookMeta: true,
            bookMetaSummary: { state: 'ready', topMessage: 'Book Details found' },
            matterSummary: { state: 'ready', topMessage: 'Matter pages are ready' },
            matterCount: 4,
            layoutSummary: { state: 'ready', validCount: 2, totalCount: 2, topMessage: 'Layouts are ready' },
            pandocPathValid: true,
        });

        expect(stages.every(stage => stage.statusLabel === 'Ready')).toBe(true);
        expect(stages[0].actionLabel).toBe('Open details');
        expect(stages[1].actionLabel).toBe('Review pages');
        expect(stages[2].actionLabel).toBe('Review styles');
        expect(stages[3].actionLabel).toBe('Review export');
    });
});
