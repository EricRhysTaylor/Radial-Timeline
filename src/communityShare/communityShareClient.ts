import { requestUrl } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getSecret, isSecretStorageAvailable, setSecret } from '../ai/credentials/secretStorage';
import { normalizeCommunityShareSettings } from './communityShareSettings';

const FUNCTIONS_BASE_URL = 'https://gjffqdfjcjdmqxuqlzsj.supabase.co/functions/v1';
const INSTALLATION_SECRET_ID = 'rt.community-share.installation-id';
const CONNECTION_SECRET_PREFIX = 'rt.community-share.connection';

interface ActivationConfirmSuccess {
    connection_id: string;
    connection_secret: string;
    secret_expires_at: string | null;
    profile_id: string;
    project_id: string;
    profile_display?: string;
    project_title?: string;
}

interface ActivationConfirmError {
    error?: {
        code?: string;
        message?: string;
    };
}

export class CommunityShareError extends Error {
    code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = 'CommunityShareError';
        this.code = code;
    }
}

function randomBase64Url(bytes: number): string {
    const buf = new Uint8Array(bytes);
    crypto.getRandomValues(buf);
    let bin = '';
    for (const b of buf) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(buf: ArrayBuffer): string {
    return [...new Uint8Array(buf)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
    return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function parseResponseJson(text: string): unknown {
    if (!text.trim()) return {};
    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

function isActivationConfirmSuccess(value: unknown): value is ActivationConfirmSuccess {
    const body = value as Partial<ActivationConfirmSuccess>;
    return typeof body?.connection_id === 'string'
        && typeof body.connection_secret === 'string'
        && typeof body.profile_id === 'string'
        && typeof body.project_id === 'string';
}

function connectionSecretId(connectionId: string): string {
    return `${CONNECTION_SECRET_PREFIX}.${connectionId}`;
}

async function getOrCreateInstallationId(plugin: RadialTimelinePlugin): Promise<string> {
    const existing = await getSecret(plugin.app, INSTALLATION_SECRET_ID);
    if (existing) return existing;

    const next = `rtpi_${randomBase64Url(24)}`;
    const stored = await setSecret(plugin.app, INSTALLATION_SECRET_ID, next);
    if (!stored) {
        throw new CommunityShareError('secret_storage_unavailable', 'Private secret storage is unavailable, so Community Share cannot connect safely.');
    }
    return next;
}

export async function confirmCommunityShareActivation(
    plugin: RadialTimelinePlugin,
    activationToken: string
): Promise<ActivationConfirmSuccess> {
    const token = activationToken.trim();
    if (token.length < 16) {
        throw new CommunityShareError('invalid_activation_token', 'Paste the full activation token from the website.');
    }
    if (!isSecretStorageAvailable(plugin.app)) {
        throw new CommunityShareError('secret_storage_unavailable', 'Private secret storage is unavailable, so Community Share cannot connect safely.');
    }

    const installationId = await getOrCreateInstallationId(plugin);
    const pluginInstallationIdHash = await sha256Hex(installationId);
    const response = await requestUrl({
        url: `${FUNCTIONS_BASE_URL}/community-activation-confirm`,
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({
            activation_token: token,
            plugin_installation_id_hash: pluginInstallationIdHash
        }),
        throw: false
    });

    const parsed = parseResponseJson(response.text);
    if (response.status < 200 || response.status >= 300) {
        const body = parsed as ActivationConfirmError;
        throw new CommunityShareError(
            body.error?.code || 'activation_failed',
            body.error?.message || 'Community activation failed. Generate a new token and try again.'
        );
    }
    if (!isActivationConfirmSuccess(parsed)) {
        throw new CommunityShareError('invalid_response', 'Community activation returned an unexpected response.');
    }

    const secretId = connectionSecretId(parsed.connection_id);
    const storedSecret = await setSecret(plugin.app, secretId, parsed.connection_secret);
    if (!storedSecret) {
        throw new CommunityShareError('secret_storage_failed', 'The connection succeeded, but the plugin could not store the private connection secret.');
    }

    const current = normalizeCommunityShareSettings(plugin.settings.communityShare);
    plugin.settings.communityShare = normalizeCommunityShareSettings({
        ...current,
        enabled: true,
        connection: {
            ...current.connection,
            status: 'connected',
            connectionId: parsed.connection_id,
            profileId: parsed.profile_id,
            projectId: parsed.project_id,
            connectedAt: new Date().toISOString(),
            lastSyncedAt: new Date().toISOString(),
            secretId
        },
        preview: {
            ...current.preview,
            status: 'stale'
        },
        lastError: undefined
    });
    await plugin.saveSettings();
    return parsed;
}
