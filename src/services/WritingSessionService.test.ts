import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '../types';
import type { WritingSessionRecord } from '../types/settings';
import {
    buildDailyWritingStats,
    collectSceneCompletionEvents,
    normalizeWritingSessionsSettings
} from './WritingSessionService';

describe('WritingSessionService pure helpers', () => {
    it('derives scene completion events by date, stage, and fresh/revision kind', () => {
        const scenes: TimelineItem[] = [
            {
                title: 'Scene 1',
                path: 'Book/Scene 1.md',
                date: '',
                status: 'Complete',
                due: '2026-05-12',
                'Publish Stage': 'Zero',
            },
            {
                title: 'Scene 2',
                path: 'Book/Scene 2.md',
                date: '',
                status: ['Complete'],
                due: '2026-05-12',
                'Publish Stage': 'Author',
            },
            {
                title: 'Scene 3',
                path: 'Book/Scene 3.md',
                date: '',
                status: 'Working',
                due: '2026-05-12',
                'Publish Stage': 'House',
            },
        ];

        expect(collectSceneCompletionEvents(scenes)).toEqual([
            expect.objectContaining({
                date: '2026-05-12',
                stage: 'Zero',
                workKind: 'fresh',
                revisionRound: 'Zero',
                path: 'Book/Scene 1.md',
            }),
            expect.objectContaining({
                date: '2026-05-12',
                stage: 'Author',
                workKind: 'revision',
                revisionRound: 'Author',
                path: 'Book/Scene 2.md',
            }),
        ]);
    });

    it('combines timer sessions with scene completion stats for a day', () => {
        const sessions: WritingSessionRecord[] = [
            {
                id: 'session-1',
                mode: 'drafting',
                startedAt: '2026-05-12T16:00:00.000Z',
                endedAt: '2026-05-12T17:00:00.000Z',
                elapsedMs: 60 * 60 * 1000,
                wordsAdded: 1200,
                source: 'timer',
            },
            {
                id: 'session-2',
                mode: 'editing',
                startedAt: '2026-05-11T16:00:00.000Z',
                endedAt: '2026-05-11T17:00:00.000Z',
                elapsedMs: 60 * 60 * 1000,
                source: 'timer',
            },
        ];
        const scenes: TimelineItem[] = [
            { title: 'Fresh', date: '', status: 'Complete', due: '2026-05-12', 'Publish Stage': 'Zero' },
            { title: 'Revision', date: '', status: 'Complete', due: '2026-05-12', 'Publish Stage': 'House' },
        ];

        const stats = buildDailyWritingStats({ date: '2026-05-12', sessions, scenes });

        expect(stats.minutesLogged).toBe(60);
        expect(stats.sessionsCompleted).toBe(1);
        expect(stats.wordsDrafted).toBe(1200);
        expect(stats.sessionCountByMode.drafting).toBe(1);
        expect(stats.sessionCountByMode.editing).toBe(0);
        expect(stats.scenesCompletedByStage).toEqual({
            Zero: 1,
            Author: 0,
            House: 1,
            Press: 0,
        });
    });

    it('normalizes missing or malformed writing session settings', () => {
        const normalized = normalizeWritingSessionsSettings({
            defaults: { defaultMode: 'drafting' },
            records: [],
            active: {
                id: 'active',
                mode: 'drafting',
                startedAt: '2026-05-12T16:00:00.000Z',
                lastResumedAt: '2026-05-12T16:00:00.000Z',
                elapsedMsBeforePause: 0,
            },
        });

        expect(normalized.defaults.defaultMode).toBe('drafting');
        expect(normalized.records).toEqual([]);
        expect(normalized.active?.id).toBe('active');
    });
});
