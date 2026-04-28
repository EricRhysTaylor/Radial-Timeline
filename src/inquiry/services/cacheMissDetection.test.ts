import { describe, expect, it } from 'vitest';
import {
    detectCrossRunCacheMiss,
    describeCacheMissDetection,
    type DetectCrossRunCacheMissArgs
} from './cacheMissDetection';
import type { InquirySession } from '../sessionTypes';

const T_NOW = 1_700_000_000_000;
const SECOND = 1000;
const MINUTE = 60 * SECOND;

function priorSession(overrides: Partial<InquirySession> = {}): InquirySession {
    return {
        key: 'k',
        baseKey: 'b',
        createdAt: T_NOW - 30 * SECOND,
        lastAccessed: T_NOW - 30 * SECOND,
        targetSceneIds: [],
        cacheReuseFingerprint: 'fp-abc',
        cacheWindowExpiresAt: T_NOW + 4 * MINUTE,
        providerCacheStatus: 'created',
        cachedStableTokens: 95_000,
        result: {
            runId: 'r1',
            scope: 'book',
            scopeLabel: 'B1',
            mode: 'flow',
            selectionMode: 'discover',
            roleValidation: 'ok',
            questionId: 'q1',
            summary: '',
            verdict: { flow: 0, depth: 0 },
            findings: [],
            cacheReuseFingerprint: 'fp-abc'
        },
        ...overrides
    };
}

function args(overrides: Partial<DetectCrossRunCacheMissArgs> = {}): DetectCrossRunCacheMissArgs {
    return {
        currentUsage: { inputTokens: 5_000, cacheReadInputTokens: 0 },
        currentFingerprint: 'fp-abc',
        priorActiveSession: priorSession(),
        now: T_NOW,
        ...overrides
    };
}

describe('detectCrossRunCacheMiss', () => {
    it('flags expected_reuse_missed when prior primed and current cache_read is zero', () => {
        const result = detectCrossRunCacheMiss(args());
        expect(result.kind).toBe('expected_reuse_missed');
        if (result.kind !== 'expected_reuse_missed') return;
        expect(result.sharedFingerprint).toBe('fp-abc');
        expect(result.priorCachedTokens).toBe(95_000);
    });

    it('returns no_prior_session when no active session exists', () => {
        const result = detectCrossRunCacheMiss(args({ priorActiveSession: undefined }));
        expect(result.kind).toBe('no_prior_session');
    });

    it('returns prior_did_not_prime when prior session never set a cache status', () => {
        const result = detectCrossRunCacheMiss(args({
            priorActiveSession: priorSession({ providerCacheStatus: undefined })
        }));
        expect(result.kind).toBe('prior_did_not_prime');
    });

    it('returns prior_did_not_prime when prior session reported zero cached tokens', () => {
        const result = detectCrossRunCacheMiss(args({
            priorActiveSession: priorSession({ cachedStableTokens: 0 })
        }));
        expect(result.kind).toBe('prior_did_not_prime');
    });

    it('returns fingerprint_changed when prior run used a different cache fingerprint', () => {
        const result = detectCrossRunCacheMiss(args({
            priorActiveSession: priorSession({ cacheReuseFingerprint: 'fp-old' })
        }));
        expect(result.kind).toBe('fingerprint_changed');
    });

    it('returns fingerprint_changed when current fingerprint is missing', () => {
        const result = detectCrossRunCacheMiss(args({ currentFingerprint: undefined }));
        expect(result.kind).toBe('fingerprint_changed');
    });

    it('returns cache_window_expired when prior session TTL has passed', () => {
        const result = detectCrossRunCacheMiss(args({
            priorActiveSession: priorSession({ cacheWindowExpiresAt: T_NOW - 1 })
        }));
        expect(result.kind).toBe('cache_window_expired');
    });

    it('returns cache_hit_as_expected when current run did read from cache', () => {
        const result = detectCrossRunCacheMiss(args({
            currentUsage: { inputTokens: 5_000, cacheReadInputTokens: 90_000 }
        }));
        expect(result.kind).toBe('cache_hit_as_expected');
    });

    it('treats undefined currentUsage as zero cache_read (and therefore a miss when reuse was expected)', () => {
        const result = detectCrossRunCacheMiss(args({ currentUsage: undefined }));
        expect(result.kind).toBe('expected_reuse_missed');
    });

    it('handles prior with providerCacheStatus="hit" the same as "created" for prime detection', () => {
        const result = detectCrossRunCacheMiss(args({
            priorActiveSession: priorSession({ providerCacheStatus: 'hit' })
        }));
        expect(result.kind).toBe('expected_reuse_missed');
    });
});

describe('describeCacheMissDetection', () => {
    it('returns null for non-miss outcomes', () => {
        expect(describeCacheMissDetection({ kind: 'no_prior_session' })).toBeNull();
        expect(describeCacheMissDetection({ kind: 'cache_hit_as_expected' })).toBeNull();
        expect(describeCacheMissDetection({ kind: 'cache_window_expired' })).toBeNull();
        expect(describeCacheMissDetection({ kind: 'fingerprint_changed' })).toBeNull();
        expect(describeCacheMissDetection({ kind: 'prior_did_not_prime' })).toBeNull();
    });

    it('formats elapsed seconds when prior run was within the last minute', () => {
        const message = describeCacheMissDetection({
            kind: 'expected_reuse_missed',
            sharedFingerprint: 'fp-abc',
            priorRunAt: T_NOW - 30 * SECOND,
            priorCachedTokens: 95_000
        }, T_NOW);
        expect(message).toContain('30s ago');
        expect(message).toContain('95,000');
    });

    it('formats elapsed minutes when prior run was within the hour', () => {
        const message = describeCacheMissDetection({
            kind: 'expected_reuse_missed',
            sharedFingerprint: 'fp-abc',
            priorRunAt: T_NOW - 4 * MINUTE,
            priorCachedTokens: 50_000
        }, T_NOW);
        expect(message).toContain('4m ago');
    });
});
