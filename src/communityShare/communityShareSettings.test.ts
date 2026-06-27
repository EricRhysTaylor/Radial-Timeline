import { describe, expect, it } from 'vitest';
import {
    buildDefaultCommunityShareSettings,
    normalizeCommunityShareSettings
} from './communityShareSettings';

describe('Community Share settings', () => {
    it('defaults to fully off and public-safe launch guardrails', () => {
        const settings = buildDefaultCommunityShareSettings();

        expect(settings.enabled).toBe(false);
        expect(settings.tier).toBe(0);
        expect(settings.audience).toBe('private_draft');
        expect(settings.manualPublishEnabled).toBe(true);
        expect(settings.scheduledPublishEnabled).toBe(false);
        expect(settings.workingNowEnabled).toBe(false);
        expect(settings.connection.status).toBe('disconnected');
        expect(settings.preview.status).toBe('not_generated');
        expect(Object.values(settings.fieldPolicy).every(value => value === false)).toBe(true);
    });

    it('normalizes future launch fields back off', () => {
        const settings = normalizeCommunityShareSettings({
            enabled: true,
            tier: 5,
            audience: 'followers',
            scheduledPublishEnabled: true,
            workingNowEnabled: true,
            fieldPolicy: {
                ...buildDefaultCommunityShareSettings().fieldPolicy,
                'project.title': true,
                'activity.exact_session_timestamps': true
            }
        });

        expect(settings.enabled).toBe(true);
        expect(settings.tier).toBe(5);
        expect(settings.audience).toBe('followers');
        expect(settings.scheduledPublishEnabled).toBe(false);
        expect(settings.workingNowEnabled).toBe(false);
        expect(settings.fieldPolicy['project.title']).toBe(true);
        expect(settings.fieldPolicy['activity.exact_session_timestamps']).toBe(true);
    });

    it('clips publish history to a small local audit tail', () => {
        const history = Array.from({ length: 30 }, (_, index) => ({
            id: `entry-${index}`,
            action: 'publish' as const,
            status: 'success' as const,
            at: `2026-06-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`
        }));

        const settings = normalizeCommunityShareSettings({ publishHistory: history });

        expect(settings.publishHistory).toHaveLength(25);
        expect(settings.publishHistory[0]?.id).toBe('entry-5');
        expect(settings.publishHistory[24]?.id).toBe('entry-29');
    });
});
