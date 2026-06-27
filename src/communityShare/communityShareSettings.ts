import type {
    CommunityShareAudience,
    CommunityShareFieldKey,
    CommunityShareFieldPolicy,
    CommunityShareSettings,
    CommunityShareTier
} from '../types/settings';

export const COMMUNITY_SHARE_SCHEMA_VERSION = 1;

export const COMMUNITY_SHARE_FIELD_KEYS: CommunityShareFieldKey[] = [
    'projectShell',
    'genre',
    'subgenre',
    'customGenre',
    'projectStage',
    'publicDescription',
    'progressPercent',
    'weeklyWords',
    'weeklyMinutes',
    'streak',
    'sessionCount',
    'aprCard',
    'workingNow'
];

export function buildDefaultCommunityShareFieldPolicy(): CommunityShareFieldPolicy {
    return {
        projectShell: false,
        genre: false,
        subgenre: false,
        customGenre: false,
        projectStage: false,
        publicDescription: false,
        progressPercent: false,
        weeklyWords: false,
        weeklyMinutes: false,
        streak: false,
        sessionCount: false,
        aprCard: false,
        workingNow: false
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
