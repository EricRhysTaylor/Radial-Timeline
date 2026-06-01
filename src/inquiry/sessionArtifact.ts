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
 * Only `lastAccessed` is transient — it is recomputed in memory and re-seeded
 * from `createdAt` on hydration. The provider-cache fields (window expiry,
 * reuse state, provider cache status, reuse fingerprint, observed ratios) ARE
 * persisted so the armed/warm cache state survives an Obsidian restart.
 *
 * (Earlier these were stripped on the assumption that cache windows "expire
 * within minutes" — false for OpenAI's 24h retention, and nothing actually
 * rebuilt them on load, so every restart looked like a brand-new run.)
 * `cacheWindowExpiresAt` is an absolute timestamp and every reader already
 * discards it once it is in the past, so a stale window loaded after a long
 * downtime is harmless.
 */
export type PersistedInquirySession = Omit<InquirySession, 'lastAccessed'>;

export interface InquirySessionArtifact {
    schemaVersion: typeof INQUIRY_ARTIFACT_SCHEMA_VERSION;
    savedAt: number;
    sessions: PersistedInquirySession[];
}

function stripTransient(session: InquirySession): PersistedInquirySession {
    // Only `lastAccessed` is transient; the provider-cache fields are durable
    // so the armed/warm state is restored after a restart (stale windows are
    // filtered by the `> now` checks at every read site).
    const { lastAccessed: _lastAccessed, ...durable } = session;
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
