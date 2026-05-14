import { describe, expect, it } from 'vitest';
import type { TimelineItem } from '../types';
import type { WritingSessionRecord } from '../types/settings';
import {
    buildDailyWritingStats,
    buildDailyWritingSessionProgress,
    buildWritingRangeStats,
    collectSceneCompletionEvents,
    normalizeWritingSessionsSettings,
    WritingSessionService
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

    it('builds range stats with goal days and fresh versus revision completions', () => {
        const sessions: WritingSessionRecord[] = [
            {
                id: 'session-1',
                mode: 'drafting',
                startedAt: '2026-05-10T16:00:00.000Z',
                endedAt: '2026-05-10T17:00:00.000Z',
                elapsedMs: 60 * 60 * 1000,
                wordsAdded: 900,
                source: 'timer',
            },
            {
                id: 'session-2',
                mode: 'editing',
                startedAt: '2026-05-12T16:00:00.000Z',
                endedAt: '2026-05-12T16:45:00.000Z',
                elapsedMs: 45 * 60 * 1000,
                source: 'timer',
            },
        ];
        const scenes: TimelineItem[] = [
            { title: 'Fresh', date: '', status: 'Complete', due: '2026-05-10', 'Publish Stage': 'Zero' },
            { title: 'Revision', date: '', status: 'Complete', due: '2026-05-12', 'Publish Stage': 'House' },
            { title: 'Old', date: '', status: 'Complete', due: '2026-04-30', 'Publish Stage': 'Press' },
        ];

        const stats = buildWritingRangeStats({
            endDate: '2026-05-12',
            days: 7,
            sessions,
            scenes,
            dailyTargetMinutes: 45,
        });

        expect(stats.startDate).toBe('2026-05-06');
        expect(stats.minutesLogged).toBe(105);
        expect(stats.sessionsCompleted).toBe(2);
        expect(stats.wordsDrafted).toBe(900);
        expect(stats.daysWithSessions).toBe(2);
        expect(stats.daysGoalMet).toBe(2);
        expect(stats.freshScenesCompleted).toBe(1);
        expect(stats.revisionScenesCompleted).toBe(1);
        expect(stats.scenesCompletedByStage).toEqual({
            Zero: 1,
            Author: 0,
            House: 1,
            Press: 0,
        });
    });

    it('subtracts completed sessions from the daily writing goal', () => {
        const sessions: WritingSessionRecord[] = [
            {
                id: 'session-1',
                mode: 'drafting',
                startedAt: '2026-05-12T16:00:00.000Z',
                endedAt: '2026-05-12T16:02:00.000Z',
                elapsedMs: 2 * 60 * 1000,
                source: 'timer',
            },
            {
                id: 'session-2',
                mode: 'editing',
                startedAt: '2026-05-12T17:00:00.000Z',
                endedAt: '2026-05-12T17:03:00.000Z',
                elapsedMs: 3 * 60 * 1000,
                source: 'timer',
            },
        ];

        const stats = buildDailyWritingSessionProgress({
            date: '2026-05-12',
            sessions,
            dailyTargetMinutes: 10,
        });

        expect(stats.minutesLogged).toBe(5);
        expect(stats.sessionsCompleted).toBe(2);
        expect(stats.remainingMinutes).toBe(5);
        expect(stats.overGoalMinutes).toBe(0);
    });

    it('keeps extra completed sessions after the daily goal is exceeded', () => {
        const sessions: WritingSessionRecord[] = [
            {
                id: 'session-1',
                mode: 'drafting',
                startedAt: '2026-05-12T16:00:00.000Z',
                endedAt: '2026-05-12T16:14:00.000Z',
                elapsedMs: 14 * 60 * 1000,
                source: 'timer',
            },
        ];

        const stats = buildDailyWritingSessionProgress({
            date: '2026-05-12',
            sessions,
            dailyTargetMinutes: 10,
        });

        expect(stats.minutesLogged).toBe(14);
        expect(stats.remainingMinutes).toBe(0);
        expect(stats.overGoalMinutes).toBe(4);
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

    it('starts countdown sessions with a goal minute target', async () => {
        const plugin = {
            settings: {
                books: [{ id: 'book-1', title: 'Book One', folder: 'Book' }],
                activeBookId: 'book-1',
                writingSessions: {
                    defaults: { defaultMode: 'drafting' },
                    records: [],
                },
                runtimeRateProfiles: [{
                    id: 'default',
                    label: 'Default',
                    contentType: 'novel',
                    dialogueWpm: 160,
                    actionWpm: 100,
                    narrationWpm: 150,
                    beatSeconds: 2,
                    pauseSeconds: 3,
                    longPauseSeconds: 5,
                    momentSeconds: 4,
                    silenceSeconds: 5,
                    sessionPlanning: { dailyMinutes: 120 },
                }],
                defaultRuntimeProfileId: 'default',
            },
            saveSettings: async () => undefined,
        };
        const service = new WritingSessionService(plugin as any);

        expect(service.getDefaultGoalMinutes()).toBe(120);
        const session = await service.start({ mode: 'revising', goalMinutes: 50 });

        expect(session.mode).toBe('revising');
        expect(session.goalMinutes).toBe(50);
        expect(session.bookId).toBe('book-1');
        expect(plugin.settings.writingSessions.active?.goalMinutes).toBe(50);
    });

    it('saves completion details from the stop confirmation modal', async () => {
        const plugin = {
            settings: {
                books: [{ id: 'book-1', title: 'Book One', sourceFolder: 'Book' }],
                activeBookId: 'book-1',
                writingSessions: {
                    defaults: { defaultMode: 'drafting' },
                    records: [],
                },
            },
            saveSettings: async () => undefined,
        };
        const service = new WritingSessionService(plugin as any);
        await service.start({ mode: 'drafting', goalMinutes: 25 });

        const record = await service.stop({
            elapsedMs: 42 * 60000,
            wordsAdded: 1234,
            scenesCompleted: 2,
            pagesEdited: 4,
            note: 'Worked on the opening.',
        });

        expect(record.elapsedMs).toBe(42 * 60000);
        expect(record.wordsAdded).toBe(1234);
        expect(record.scenesCompleted).toBe(2);
        expect(record.pagesEdited).toBe(4);
        expect(record.note).toBe('Worked on the opening.');
        expect(plugin.settings.writingSessions.active).toBeUndefined();
        expect(plugin.settings.writingSessions.records).toHaveLength(1);
    });
});
