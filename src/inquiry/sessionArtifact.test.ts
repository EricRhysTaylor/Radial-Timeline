import { describe, expect, it } from 'vitest';
import {
    INQUIRY_ARTIFACT_SCHEMA_VERSION,
    parseSessionArtifact,
    serializeSessionsToArtifact
} from './sessionArtifact';
import type { InquirySession } from './sessionTypes';

function makeSession(overrides: Partial<InquirySession> = {}): InquirySession {
    return {
        key: 'k1',
        baseKey: 'b1',
        result: { runId: 'r1' } as never,
        createdAt: 1000,
        lastAccessed: 5000,
        targetSceneIds: ['scn_a', ' scn_b ', ''],
        status: 'saved',
        briefPath: 'Radial Timeline/Inquiry/Briefing/Brief.md',
        // transient runtime fields that must NOT be persisted
        cacheWindowExpiresAt: 9999,
        cacheReuseFingerprint: 'fp',
        cacheReuseState: 'warm',
        providerCacheStatus: 'hit',
        cachedStableRatio: 0.5,
        cachedStableTokens: 10,
        totalInputTokens: 20,
        ...overrides
    };
}

describe('serializeSessionsToArtifact', () => {
    it('stamps the schema version and savedAt', () => {
        const artifact = serializeSessionsToArtifact([makeSession()], 1234);
        expect(artifact.schemaVersion).toBe(INQUIRY_ARTIFACT_SCHEMA_VERSION);
        expect(artifact.savedAt).toBe(1234);
        expect(artifact.sessions).toHaveLength(1);
    });

    it('strips transient runtime fields (cache window + lastAccessed)', () => {
        const artifact = serializeSessionsToArtifact([makeSession()], 1);
        const persisted = artifact.sessions[0] as Record<string, unknown>;
        expect(persisted.key).toBe('k1');
        expect(persisted.briefPath).toBe('Radial Timeline/Inquiry/Briefing/Brief.md');
        expect('lastAccessed' in persisted).toBe(false);
        expect('cacheWindowExpiresAt' in persisted).toBe(false);
        expect('cacheReuseFingerprint' in persisted).toBe(false);
        expect('providerCacheStatus' in persisted).toBe(false);
        expect('totalInputTokens' in persisted).toBe(false);
    });
});

describe('parseSessionArtifact', () => {
    it('round-trips durable session data', () => {
        const raw = JSON.stringify(serializeSessionsToArtifact([makeSession()], 1));
        const sessions = parseSessionArtifact(raw);
        expect(sessions).not.toBeNull();
        expect(sessions).toHaveLength(1);
        expect(sessions![0].key).toBe('k1');
    });

    it('re-seeds lastAccessed from createdAt on hydration', () => {
        const raw = JSON.stringify(serializeSessionsToArtifact([makeSession({ createdAt: 7777 })], 1));
        const sessions = parseSessionArtifact(raw);
        expect(sessions![0].lastAccessed).toBe(7777);
    });

    it('normalizes targetSceneIds (trims, drops empties)', () => {
        const raw = JSON.stringify(serializeSessionsToArtifact([makeSession()], 1));
        const sessions = parseSessionArtifact(raw);
        expect(sessions![0].targetSceneIds).toEqual(['scn_a', 'scn_b']);
    });

    it('returns null for corrupt JSON (caller logs; never fabricates)', () => {
        expect(parseSessionArtifact('{ not json')).toBeNull();
    });

    it('returns null for an unknown schema version', () => {
        const raw = JSON.stringify({ schemaVersion: 999, savedAt: 1, sessions: [] });
        expect(parseSessionArtifact(raw)).toBeNull();
    });

    it('returns an empty array for a valid empty artifact', () => {
        const raw = JSON.stringify(serializeSessionsToArtifact([], 1));
        expect(parseSessionArtifact(raw)).toEqual([]);
    });
});
