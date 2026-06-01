import type { InquirySession } from './sessionTypes';

/**
 * Versioned shape of the vault-resident inquiry session store.
 *
 * Inquiry briefs are persisted to a vault sidecar
 * (`.radial-timeline/inquiry/sessions.json`) rather than `data.json`. The vault
 * is the single source of truth for brief content: it ships with the vault,
 * survives a fresh plugin install, and rehydrates the Inquiry View with no
 * `data.json` present.
 *
 * Pure (de)serialization only — no Obsidian / filesystem access. The vault IO
 * lives in `InquiryArtifactStore.ts`.
 */
export const INQUIRY_ARTIFACT_SCHEMA_VERSION = 1 as const;

/**
 * Durable subset of an InquirySession that is persisted.
 *
 * Transient runtime fields are intentionally excluded — prompt-cache windows
 * expire within minutes and `lastAccessed` is recomputed in memory, so
 * persisting them is churn without value. They are rebuilt on hydration.
 */
export type PersistedInquirySession = Omit<
    InquirySession,
    | 'lastAccessed'
    | 'cacheWindowExpiresAt'
    | 'cacheReuseFingerprint'
    | 'cacheReuseState'
    | 'providerCacheStatus'
    | 'cachedStableRatio'
    | 'cachedStableTokens'
    | 'totalInputTokens'
>;

export interface InquirySessionArtifact {
    schemaVersion: typeof INQUIRY_ARTIFACT_SCHEMA_VERSION;
    savedAt: number;
    sessions: PersistedInquirySession[];
}

function stripTransient(session: InquirySession): PersistedInquirySession {
    const {
        lastAccessed: _lastAccessed,
        cacheWindowExpiresAt: _cacheWindowExpiresAt,
        cacheReuseFingerprint: _cacheReuseFingerprint,
        cacheReuseState: _cacheReuseState,
        providerCacheStatus: _providerCacheStatus,
        cachedStableRatio: _cachedStableRatio,
        cachedStableTokens: _cachedStableTokens,
        totalInputTokens: _totalInputTokens,
        ...durable
    } = session;
    return durable;
}

export function serializeSessionsToArtifact(
    sessions: InquirySession[],
    savedAt: number
): InquirySessionArtifact {
    return {
        schemaVersion: INQUIRY_ARTIFACT_SCHEMA_VERSION,
        savedAt,
        sessions: sessions.map(stripTransient)
    };
}

/**
 * Parse a sidecar payload into runtime sessions.
 *
 * Returns `null` for a present-but-invalid payload (corrupt JSON or an
 * unknown schema version) so the caller can log loudly — we never fabricate
 * session data to paper over a bad file. A missing file is handled by the IO
 * layer, not here.
 */
export function parseSessionArtifact(raw: string): InquirySession[] | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return null;
    }
    if (!isArtifact(parsed)) return null;
    return parsed.sessions.map(rehydrate);
}

function isArtifact(value: unknown): value is InquirySessionArtifact {
    if (!value || typeof value !== 'object') return false;
    const record = value as Record<string, unknown>;
    return (
        record.schemaVersion === INQUIRY_ARTIFACT_SCHEMA_VERSION &&
        Array.isArray(record.sessions)
    );
}

function rehydrate(session: PersistedInquirySession): InquirySession {
    return {
        ...session,
        targetSceneIds: Array.isArray(session.targetSceneIds)
            ? session.targetSceneIds.map(value => String(value).trim()).filter(Boolean)
            : [],
        // Transient: re-seed access time from creation so recency sorting works
        // until the session is touched in this runtime.
        lastAccessed: session.createdAt
    };
}
