/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Detect "should-have-hit-cache but didn't" between Inquiry runs.
 *
 * The engine pill (renderer) tells the user *what* happened on the last run.
 * This detector answers a different question: was the previous run set up
 * such that THIS run should have benefited from the provider cache, but
 * provably didn't?
 *
 * Pure function — no side effects, no DOM. The caller decides how to surface
 * the result (Notice, log note, banner).
 */

import type { TokenUsage } from '../../ai/usage/providerUsage';
import type { InquirySession } from '../sessionTypes';

export type CacheMissDetection =
    | {
        kind: 'expected_reuse_missed';
        /** Fingerprint shared by both runs — useful for diagnostics. */
        sharedFingerprint: string;
        /** Previous run's timestamp; useful for "X seconds ago". */
        priorRunAt: number;
        /** Tokens the prior run primed/cached — what we expected to read back. */
        priorCachedTokens: number;
    }
    | { kind: 'no_prior_session' }
    | { kind: 'prior_did_not_prime' }
    | { kind: 'fingerprint_changed' }
    | { kind: 'cache_window_expired' }
    | { kind: 'cache_hit_as_expected' };

export interface DetectCrossRunCacheMissArgs {
    /** Token usage from the run that just completed. */
    currentUsage: TokenUsage | undefined;
    /** Cache reuse fingerprint computed for the current run. */
    currentFingerprint: string | undefined;
    /**
     * The most recent session for this provider+model whose cache window is
     * still open. Pass undefined if `getLatestActiveCacheSessionForEngine`
     * returned nothing.
     */
    priorActiveSession: InquirySession | undefined;
    /** Wall clock at detection time; injectable for tests. */
    now?: number;
}

/**
 * Decide whether the just-completed run silently failed to reuse the
 * previous run's primed cache. The function reports a discriminated union
 * so the caller can act differently for "no prior session" (boring) vs
 * "expected reuse missed" (worth a Notice).
 *
 * Detection rules:
 *   1. No prior active session matches → no_prior_session (nothing to compare).
 *   2. Prior session never primed/hit cache → prior_did_not_prime.
 *   3. Prior session has a different cache fingerprint → fingerprint_changed
 *      (corpus or model changed; reuse was not expected).
 *   4. Prior session's cache window is closed → cache_window_expired
 *      (reuse was not possible; not a regression).
 *   5. All preconditions met AND current run reports cache_read > 0 →
 *      cache_hit_as_expected (the happy path).
 *   6. All preconditions met BUT current run reports cache_read == 0 →
 *      expected_reuse_missed. This is the case we surface to the user.
 */
export function detectCrossRunCacheMiss(args: DetectCrossRunCacheMissArgs): CacheMissDetection {
    const prior = args.priorActiveSession;
    if (!prior) return { kind: 'no_prior_session' };

    const priorCacheStatus = prior.providerCacheStatus;
    const priorCachedTokens = prior.cachedStableTokens ?? 0;
    if (priorCacheStatus !== 'created' && priorCacheStatus !== 'hit') {
        return { kind: 'prior_did_not_prime' };
    }
    if (priorCachedTokens <= 0) {
        return { kind: 'prior_did_not_prime' };
    }

    const priorFingerprint = (prior.cacheReuseFingerprint
        ?? prior.result.cacheReuseFingerprint ?? '').trim();
    const currentFingerprint = (args.currentFingerprint ?? '').trim();
    if (!priorFingerprint || !currentFingerprint || priorFingerprint !== currentFingerprint) {
        return { kind: 'fingerprint_changed' };
    }

    const now = args.now ?? Date.now();
    if (!prior.cacheWindowExpiresAt || prior.cacheWindowExpiresAt <= now) {
        return { kind: 'cache_window_expired' };
    }

    const cacheRead = args.currentUsage?.cacheReadInputTokens ?? 0;
    if (cacheRead > 0) {
        return { kind: 'cache_hit_as_expected' };
    }

    return {
        kind: 'expected_reuse_missed',
        sharedFingerprint: currentFingerprint,
        priorRunAt: prior.createdAt ?? prior.lastAccessed,
        priorCachedTokens
    };
}

/**
 * Build a short human-readable warning message for the user.
 * Returns null when nothing should be surfaced.
 */
export function describeCacheMissDetection(
    detection: CacheMissDetection,
    now: number = Date.now()
): string | null {
    if (detection.kind !== 'expected_reuse_missed') return null;
    const elapsedMs = Math.max(0, now - detection.priorRunAt);
    const elapsedLabel = formatElapsed(elapsedMs);
    const cachedLabel = detection.priorCachedTokens.toLocaleString();
    return `Expected cache reuse missed: prior run ${elapsedLabel} ago primed ${cachedLabel} tokens, but this run reports zero cache reads. Cache window may have expired or the request prefix changed.`;
}

function formatElapsed(ms: number): string {
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.round(minutes / 60);
    return `${hours}h`;
}
