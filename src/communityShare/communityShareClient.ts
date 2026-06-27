import { requestUrl } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { getSecret, isSecretStorageAvailable, setSecret } from '../ai/credentials/secretStorage';
import { normalizeCommunityShareSettings } from './communityShareSettings';
import { COMMUNITY_SHARE_REPORT_SCHEMA_VERSION, buildCommunitySharePreview } from './communitySharePreview';

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

interface PublishSuccess {
    ok: true;
    publish_id: string;
    version_id: string;
    public_slug: string;
    status: string;
    published_at: string;
    superseded_version_id?: string | null;
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

function isPublishSuccess(value: unknown): value is PublishSuccess {
    const body = value as Partial<PublishSuccess>;
    return body?.ok === true
        && typeof body.publish_id === 'string'
        && typeof body.version_id === 'string'
        && typeof body.public_slug === 'string'
        && typeof body.published_at === 'string';
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

export async function publishCommunityShareReport(plugin: RadialTimelinePlugin): Promise<PublishSuccess> {
    const current = normalizeCommunityShareSettings(plugin.settings.communityShare);
    if (!current.enabled || current.connection.status !== 'connected' || !current.connection.connectionId || !current.connection.secretId) {
        throw new CommunityShareError('connection_required', 'Connect Community Share before publishing.');
    }
    if (current.audience !== 'public' || current.tier < 1 || current.tier > 4 || current.manualPublishEnabled !== true) {
        throw new CommunityShareError('publish_locked', 'Publish requires public audience, launch tier 1-4, and manual publishing enabled.');
    }
    if (current.preview.status !== 'ready' || !current.preview.previewHash || !current.preview.payloadHash) {
        throw new CommunityShareError('preview_required', 'Generate and review the Complete Preview before publishing.');
    }

    const currentSecret = await getSecret(plugin.app, current.connection.secretId);
    if (!currentSecret) {
        throw new CommunityShareError('connection_secret_missing', 'The private connection secret is missing. Reconnect Community Share.');
    }

    const preview = await buildCommunitySharePreview(plugin);
    if (preview.previewHash !== current.preview.previewHash || preview.payloadHash !== current.preview.payloadHash) {
        throw new CommunityShareError('preview_stale', 'The Complete Preview is stale. Generate it again before publishing.');
    }

    const response = await requestUrl({
        url: `${FUNCTIONS_BASE_URL}/community-share-publish`,
        method: 'POST',
        contentType: 'application/json',
        body: JSON.stringify({
            connection_id: current.connection.connectionId,
            current_secret: currentSecret,
            publish_mode: 'manual',
            audience: 'public',
            tier: current.tier,
            field_manifest: preview.fieldManifest,
            redaction_manifest: preview.redactionManifest,
            payload: preview.payload,
            schema_version: COMMUNITY_SHARE_REPORT_SCHEMA_VERSION,
            preview_hash: preview.previewHash,
            report_period: preview.reportPeriod
        }),
        throw: false
    });

    const parsed = parseResponseJson(response.text);
    if (response.status < 200 || response.status >= 300) {
        const body = parsed as ActivationConfirmError;
        throw new CommunityShareError(
            body.error?.code || 'publish_failed',
            body.error?.message || 'Community Share publish failed. Review the preview and try again.'
        );
    }
    if (!isPublishSuccess(parsed)) {
        throw new CommunityShareError('invalid_response', 'Community publish returned an unexpected response.');
    }

    plugin.settings.communityShare = normalizeCommunityShareSettings({
        ...current,
        connection: {
            ...current.connection,
            publicSlug: parsed.public_slug,
            lastSyncedAt: parsed.published_at
        },
        preview: {
            ...current.preview,
            status: 'stale'
        },
        publishHistory: [
            ...current.publishHistory,
            {
                id: parsed.version_id,
                action: 'publish',
                status: 'success',
                at: parsed.published_at,
                versionId: parsed.version_id,
                publicSlug: parsed.public_slug,
                message: 'Manual public report published.'
            }
        ],
        lastError: undefined
    });
    await plugin.saveSettings();
    return parsed;
}
