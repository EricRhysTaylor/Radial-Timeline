import { describe, expect, it } from 'vitest';
import { buildDefaultCommunityShareSettings } from './communityShareSettings';
import { buildCommunitySharePreview } from './communitySharePreview';

describe('Community Share preview builder', () => {
    it('builds a public aggregate payload without private titles or sensitive fields', async () => {
        const settings = buildDefaultCommunityShareSettings();
        settings.enabled = true;
        settings.tier = 3;
        settings.audience = 'public';
        settings.connection = {
            status: 'connected',
            connectionId: 'connection-1',
            profileId: 'profile-1',
            projectId: 'project-1',
            secretId: 'rt.community-share.connection.connection-1'
        };
        settings.fieldPolicy['project.title'] = true;
        settings.fieldPolicy['project.genre'] = true;
        settings.fieldPolicy['activity.words_added'] = true;
        settings.fieldPolicy['activity.minutes_total'] = true;
        settings.fieldPolicy['activity.session_count'] = true;
        settings.fieldPolicy['activity.exact_session_timestamps'] = true;

        const plugin = {
            settings: {
                activeBookId: 'book-1',
                books: [{
                    id: 'book-1',
                    title: 'Private Local Draft Title',
                    publicLabel: 'Public Project Alias',
                    sourceFolder: 'Books/Private Path',
                    genre: 'Fantasy'
                }],
                communityShare: settings
            },
            getWritingSessionService: () => ({
                getRangeStats: async () => ({
                    startDate: '2026-06-21',
                    endDate: '2026-06-27',
                    days: 7,
                    targetMode: 'words',
                    minutesLogged: 63,
                    sessionsCompleted: 4,
                    wordsDrafted: 1234,
                    daysWithSessions: 3,
                    daysGoalMet: 2,
                    sessionCountByMode: { drafting: 4, revising: 0, editing: 0, planning: 0 },
                    minutesByMode: { drafting: 63, revising: 0, editing: 0, planning: 0 },
                    scenesCompletedByStage: { Zero: 0, Author: 0, House: 0, Press: 0 },
                    freshScenesCompleted: 0,
                    revisionScenesCompleted: 0,
                    sceneCompletionEvents: []
                })
            })
        };

        const preview = await buildCommunitySharePreview(plugin as never);

        expect(preview.payload['project.title']).toBe('Public Project Alias');
        expect(JSON.stringify(preview.payload)).not.toContain('Private Local Draft Title');
        expect(JSON.stringify(preview.payload)).not.toContain('Private Path');
        expect(preview.payload['activity.words_added']).toBe(1250);
        expect(preview.payload['activity.minutes_total']).toBe(65);
        expect(preview.payload['activity.session_count']).toBe('4-7');
        expect(preview.payload['activity.exact_session_timestamps']).toBeUndefined();
        expect(preview.fieldManifest['activity.exact_session_timestamps']?.enabled).toBe(false);
        expect(preview.payloadHash).toMatch(/^[0-9a-f]{64}$/);
        expect(preview.previewHash).toMatch(/^[0-9a-f]{64}$/);
    });
});
