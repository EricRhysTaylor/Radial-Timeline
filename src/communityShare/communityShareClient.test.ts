import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn()
}));

import * as obsidian from 'obsidian';
import { buildDefaultCommunityShareSettings } from './communityShareSettings';
import { confirmCommunityShareActivation } from './communityShareClient';

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
            communityShare: buildDefaultCommunityShareSettings()
        },
        saveSettings: vi.fn(async () => undefined)
    };
    return { plugin, secrets };
}

describe('Community Share activation client', () => {
    it('confirms activation with only a hashed installation id and stores the returned secret privately', async () => {
        const { plugin, secrets } = createPluginHarness();
        vi.spyOn(obsidian, 'requestUrl').mockResolvedValue({
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

        const request = vi.mocked(obsidian.requestUrl).mock.calls[0]?.[0] as { body: string; url: string };
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
});
