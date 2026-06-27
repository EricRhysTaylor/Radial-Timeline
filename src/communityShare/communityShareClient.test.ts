import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn()
}));

import * as obsidian from 'obsidian';
import { buildDefaultCommunityShareSettings } from './communityShareSettings';
import { buildCommunitySharePreview } from './communitySharePreview';
import { confirmCommunityShareActivation, publishCommunityShareReport } from './communityShareClient';

function createPluginHarness() {
    const secrets = new Map<string, string>();
    const plugin = {
        app: {
            secretStorage: {
                getSecret: (id: string) => secrets.get(id) ?? null,
                setSecret: (id: string, value: string) => {
                    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) {
                        throw new Error(`Invalid secret id: ${id}`);
                    }
                    secrets.set(id, value);
                },
                listSecrets: () => Array.from(secrets.keys())
            }
        },
        settings: {
            activeBookId: 'book-1',
            books: [{
                id: 'book-1',
                title: 'Private Local Draft Title',
                publicLabel: 'Public Project Alias',
                sourceFolder: 'Books/Private Path',
                genre: 'Fantasy'
            }],
            communityShare: buildDefaultCommunityShareSettings()
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
        }),
        saveSettings: vi.fn(async () => undefined)
    };
    return { plugin, secrets };
}

describe('Community Share activation client', () => {
    it('confirms activation with only a hashed installation id and stores the returned secret privately', async () => {
        const { plugin, secrets } = createPluginHarness();
        vi.clearAllMocks();
        const mockedRequestUrl = vi.spyOn(obsidian, 'requestUrl').mockResolvedValue({
            status: 201,
            text: JSON.stringify({
                connection_id: 'conn-1',
                connection_secret: 'rtcs_returned-secret',
                secret_expires_at: null,
                profile_id: 'profile-1',
                project_id: 'project-1',
                profile_display: 'Eric',
                project_title: 'Book 1'
            })
        } as never);

        await confirmCommunityShareActivation(plugin as never, 'activation-token-from-website');

        const request = mockedRequestUrl.mock.calls[0]?.[0] as { body: string; url: string };
        const body = JSON.parse(request.body) as Record<string, unknown>;
        expect(request.url).toContain('/community-activation-confirm');
        expect(body.activation_token).toBe('activation-token-from-website');
        expect(body.plugin_installation_id_hash).toMatch(/^[0-9a-f]{64}$/);
        expect(body.installation_label).toBeUndefined();
        expect(JSON.stringify(body)).not.toContain('rtpi_');

        expect(secrets.get('rt-community-share-installation-id')).toMatch(/^rtpi_/);
        expect(secrets.get('rt-community-share-connection-conn-1')).toBe('rtcs_returned-secret');
        expect(plugin.settings.communityShare.connection.status).toBe('connected');
        expect(plugin.settings.communityShare.connection.secretId).toBe('rt.community-share.connection.conn-1');
        expect(plugin.settings.communityShare.connection.profileId).toBe('profile-1');
        expect(plugin.settings.communityShare.connection.projectId).toBe('project-1');
        expect(plugin.settings.communityShare.preview.status).toBe('stale');
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('publishes only after a ready preview and records the returned public slug', async () => {
        const { plugin, secrets } = createPluginHarness();
        vi.clearAllMocks();
        const settings = plugin.settings.communityShare;
        settings.enabled = true;
        settings.tier = 3;
        settings.audience = 'public';
        settings.connection = {
            status: 'connected',
            connectionId: 'conn-1',
            profileId: 'profile-1',
            projectId: 'project-1',
            secretId: 'rt.community-share.connection.conn-1'
        };
        settings.fieldPolicy['project.title'] = true;
        settings.fieldPolicy['activity.words_added'] = true;
        secrets.set('rt-community-share-connection-conn-1', 'rtcs_current-secret');

        const preview = await buildCommunitySharePreview(plugin as never);
        settings.preview = {
            status: 'ready',
            generatedAt: '2026-06-27T12:00:00.000Z',
            previewHash: preview.previewHash,
            payloadHash: preview.payloadHash,
            reportPeriod: 'weekly',
            summary: preview.summary
        };

        const mockedRequestUrl = vi.spyOn(obsidian, 'requestUrl').mockResolvedValue({
            status: 201,
            text: JSON.stringify({
                ok: true,
                publish_id: 'publish-1',
                version_id: 'version-1',
                public_slug: 'csr_public',
                status: 'published',
                published_at: '2026-06-27T19:00:00.000Z',
                superseded_version_id: null
            })
        } as never);

        await publishCommunityShareReport(plugin as never);

        const request = mockedRequestUrl.mock.calls[0]?.[0] as { body: string; url: string };
        const body = JSON.parse(request.body) as Record<string, unknown>;
        expect(request.url).toContain('/community-share-publish');
        expect(body.current_secret).toBe('rtcs_current-secret');
        expect(body.preview_hash).toBe(preview.previewHash);
        expect(body.payload).toEqual(preview.payload);
        expect(JSON.stringify(body.payload)).not.toContain('Private Local Draft Title');
        expect(plugin.settings.communityShare.connection.publicSlug).toBe('csr_public');
        expect(plugin.settings.communityShare.preview.status).toBe('stale');
        expect(plugin.settings.communityShare.publishHistory[0]?.versionId).toBe('version-1');
        expect(plugin.saveSettings).toHaveBeenCalledTimes(1);
    });
});
