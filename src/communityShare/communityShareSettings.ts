import type {
    CommunityShareAudience,
    CommunityShareFieldKey,
    CommunityShareFieldPolicy,
    CommunityShareSettings,
    CommunityShareTier
} from '../types/settings';

export const COMMUNITY_SHARE_SCHEMA_VERSION = 1;

export const COMMUNITY_SHARE_FIELD_KEYS: CommunityShareFieldKey[] = [
    'project.title',
    'project.alias',
    'project.description',
    'project.status',
    'project.genre',
    'project.custom_genre_label',
    'activity.report_period',
    'activity.writing_days',
    'activity.minutes_total',
    'activity.words_added',
    'activity.session_count',
    'activity.mode_mix',
    'activity.scenes_completed_by_stage',
    'activity.stage_mix',
    'activity.completed_scene_count',
    'activity.revised_scene_count',
    'activity.streak',
    'structure.real_scene_titles',
    'activity.exact_session_timestamps'
];

export function buildDefaultCommunityShareFieldPolicy(): CommunityShareFieldPolicy {
    return {
        'project.title': false,
        'project.alias': false,
        'project.description': false,
        'project.status': false,
        'project.genre': false,
        'project.custom_genre_label': false,
        'activity.report_period': false,
        'activity.writing_days': false,
        'activity.minutes_total': false,
        'activity.words_added': false,
        'activity.session_count': false,
        'activity.mode_mix': false,
        'activity.scenes_completed_by_stage': false,
        'activity.stage_mix': false,
        'activity.completed_scene_count': false,
        'activity.revised_scene_count': false,
        'activity.streak': false,
        'structure.real_scene_titles': false,
        'activity.exact_session_timestamps': false
    };
}

export function buildDefaultCommunityShareSettings(): CommunityShareSettings {
    return {
        schemaVersion: COMMUNITY_SHARE_SCHEMA_VERSION,
        enabled: false,
        tier: 0,
        audience: 'private_draft',
        manualPublishEnabled: true,
        scheduledPublishEnabled: false,
        workingNowEnabled: false,
        fieldPolicy: buildDefaultCommunityShareFieldPolicy(),
        redactionPolicy: {},
        connection: {
            status: 'disconnected'
        },
        preview: {
            status: 'not_generated'
        },
        publishHistory: []
    };
}

function coerceTier(value: unknown): CommunityShareTier {
    return value === 1 || value === 2 || value === 3 || value === 4 || value === 5 ? value : 0;
}

function coerceAudience(value: unknown): CommunityShareAudience {
    return value === 'public'
        || value === 'followers'
        || value === 'trusted_authors'
        || value === 'private_link'
        || value === 'private_draft'
        ? value
        : 'private_draft';
}

export function normalizeCommunityShareSettings(input?: Partial<CommunityShareSettings>): CommunityShareSettings {
    const defaults = buildDefaultCommunityShareSettings();
    const fieldPolicy = buildDefaultCommunityShareFieldPolicy();
    const incomingPolicy: Partial<CommunityShareFieldPolicy> = input?.fieldPolicy ?? {};
    for (const key of COMMUNITY_SHARE_FIELD_KEYS) {
        fieldPolicy[key] = incomingPolicy[key] === true;
    }

    const connection = input?.connection ?? defaults.connection;
    const preview = input?.preview ?? defaults.preview;
    const publishHistory = Array.isArray(input?.publishHistory)
        ? input.publishHistory.slice(-25)
        : [];

    return {
        ...defaults,
        ...input,
        schemaVersion: COMMUNITY_SHARE_SCHEMA_VERSION,
        enabled: input?.enabled === true,
        tier: coerceTier(input?.tier),
        audience: coerceAudience(input?.audience),
        manualPublishEnabled: input?.manualPublishEnabled !== false,
        scheduledPublishEnabled: false,
        workingNowEnabled: false,
        fieldPolicy,
        redactionPolicy: input?.redactionPolicy && typeof input.redactionPolicy === 'object' ? input.redactionPolicy : {},
        connection: {
            status: connection.status ?? 'disconnected',
            connectionId: connection.connectionId,
            activationTokenId: connection.activationTokenId,
            profileId: connection.profileId,
            projectId: connection.projectId,
            publicSlug: connection.publicSlug,
            connectedAt: connection.connectedAt,
            lastSyncedAt: connection.lastSyncedAt,
            disconnectedAt: connection.disconnectedAt,
            secretId: connection.secretId
        },
        preview: {
            status: preview.status ?? 'not_generated',
            generatedAt: preview.generatedAt,
            previewHash: preview.previewHash,
            payloadHash: preview.payloadHash,
            reportPeriod: preview.reportPeriod,
            summary: preview.summary
        },
        publishHistory,
        lastError: input?.lastError
    };
}
