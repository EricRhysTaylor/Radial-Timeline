import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    scoreReuseAdvancedContext,
    getAnthropicAcceptedCacheTtl,
    getDispatchEngineKey,
    resolveActualUsageCostForResult,
    buildEngineRecentRunSnapshot,
    buildEngineCacheWindowSnapshotFromSession
} from './inquiryCacheStatus';
import type { AIRunAdvancedContext } from '../../ai/types';
import type { InquiryRunTrace } from '../runner/types';
import type { InquiryResult } from '../state';
import type { InquirySession } from '../sessionTypes';

const ctx = (p: Partial<AIRunAdvancedContext>): AIRunAdvancedContext =>
    p as unknown as AIRunAdvancedContext;
const trace = (usage: Record<string, unknown> | undefined): InquiryRunTrace =>
    ({ usage }) as unknown as InquiryRunTrace;
const result = (p: Partial<InquiryResult>): InquiryResult =>
    p as unknown as InquiryResult;

describe('scoreReuseAdvancedContext', () => {
    it('returns 0 for null or non-warm context (truth-over-optimism)', () => {
        expect(scoreReuseAdvancedContext(null)).toBe(0);
        expect(scoreReuseAdvancedContext(ctx({ reuseState: 'eligible' }))).toBe(0);
        expect(scoreReuseAdvancedContext(ctx({ reuseState: 'idle' }))).toBe(0);
    });

    it('weights ratio >> tokens >> input for a warm context', () => {
        const score = scoreReuseAdvancedContext(ctx({
            reuseState: 'warm',
            cachedStableRatio: 1,
            cachedStableTokens: 1000,
            totalInputTokens: 130000
        }));
        // 1*1_000_000 + 1000 + 130000*0.001
        expect(score).toBe(1_000_000 + 1000 + 130);
    });

    it('treats non-finite/missing components as zero', () => {
        expect(scoreReuseAdvancedContext(ctx({
            reuseState: 'warm',
            cachedStableRatio: Number.NaN,
            cachedStableTokens: undefined,
            totalInputTokens: undefined
        }))).toBe(0);
    });

    it('with equal token/input, a higher reuse ratio wins (characterizes the preserved formula)', () => {
        const hiRatio = scoreReuseAdvancedContext(ctx({ reuseState: 'warm', cachedStableRatio: 0.9, cachedStableTokens: 100, totalInputTokens: 100 }));
        const loRatio = scoreReuseAdvancedContext(ctx({ reuseState: 'warm', cachedStableRatio: 0.1, cachedStableTokens: 100, totalInputTokens: 100 }));
        expect(hiRatio).toBeGreaterThan(loRatio);
        // Exact preserved weighting: ratio*1e6 + tokens + input*0.001
        expect(hiRatio).toBe(0.9 * 1_000_000 + 100 + 0.1);
    });
});

describe('getAnthropicAcceptedCacheTtl', () => {
    it('returns unknown when no trace/usage or zero counts', () => {
        expect(getAnthropicAcceptedCacheTtl(undefined)).toBe('unknown');
        expect(getAnthropicAcceptedCacheTtl(null)).toBe('unknown');
        expect(getAnthropicAcceptedCacheTtl(trace({}))).toBe('unknown');
        expect(getAnthropicAcceptedCacheTtl(trace({ cacheCreation5mInputTokens: 0, cacheCreation1hInputTokens: 0 }))).toBe('unknown');
    });

    it('classifies 5m / 1h / mixed from the usage payload only', () => {
        expect(getAnthropicAcceptedCacheTtl(trace({ cacheCreation5mInputTokens: 10 }))).toBe('5m');
        expect(getAnthropicAcceptedCacheTtl(trace({ cacheCreation1hInputTokens: 10 }))).toBe('1h');
        expect(getAnthropicAcceptedCacheTtl(trace({ cacheCreation5mInputTokens: 5, cacheCreation1hInputTokens: 7 }))).toBe('mixed');
    });
});

describe('getDispatchEngineKey', () => {
    it('returns null when provider or model is missing', () => {
        expect(getDispatchEngineKey(result({}))).toBeNull();
        expect(getDispatchEngineKey(result({ aiProvider: 'openai' }))).toBeNull();
        expect(getDispatchEngineKey(result({ aiModelResolved: 'gpt-5.5' }))).toBeNull();
    });

    it('builds a lowercased, trimmed provider::model key, preferring resolved model', () => {
        expect(getDispatchEngineKey(result({ aiProvider: '  OpenAI ', aiModelResolved: ' GPT-5.5 ' }))).toBe('openai::gpt-5.5');
        expect(getDispatchEngineKey(result({ aiProvider: 'anthropic', aiModelRequested: 'claude-x' }))).toBe('anthropic::claude-x');
        expect(getDispatchEngineKey(result({ aiProvider: 'google', aiModelResolved: 'gemini-pro', aiModelRequested: 'ignored' }))).toBe('google::gemini-pro');
    });
});

describe('resolveActualUsageCostForResult', () => {
    it('returns undefined for unsupported provider / missing model or usage', () => {
        expect(resolveActualUsageCostForResult(result({}))).toBeUndefined();
        expect(resolveActualUsageCostForResult(result({ aiProvider: 'ollama', aiModelResolved: 'x', tokenUsage: {} as never }))).toBeUndefined();
        expect(resolveActualUsageCostForResult(result({ aiProvider: 'openai', tokenUsage: {} as never }))).toBeUndefined();
        expect(resolveActualUsageCostForResult(result({ aiProvider: 'openai', aiModelResolved: 'gpt-5.5' }))).toBeUndefined();
    });

    it('returns a finite number for a supported provider with real usage', () => {
        const cost = resolveActualUsageCostForResult(result({
            aiProvider: 'openai',
            aiModelResolved: 'gpt-5.5',
            tokenUsage: { inputTokens: 130000, outputTokens: 4000 } as never
        }));
        expect(typeof cost === 'number' && Number.isFinite(cost)).toBe(true);
        expect(cost).toBeGreaterThan(0);
    });

    it('swallows pricing errors and returns undefined (catch path)', () => {
        // Unknown model id → estimateUsageCost may throw/return non-finite;
        // either way the helper must yield undefined, never throw.
        expect(() => resolveActualUsageCostForResult(result({
            aiProvider: 'openai',
            aiModelResolved: '___definitely-not-a-model___',
            tokenUsage: { inputTokens: 1 } as never
        }))).not.toThrow();
    });
});

describe('buildEngineRecentRunSnapshot', () => {
    it('passes through citationsRequested and tokenUsage, derives citationCount + cost', () => {
        const snap = buildEngineRecentRunSnapshot(result({
            aiProvider: 'openai',
            aiModelResolved: 'gpt-5.5',
            citations: [],
            evidenceDocumentMeta: [],
            findings: [],
            tokenUsage: { inputTokens: 1000, outputTokens: 10 } as never
        }), true);
        expect(snap.citationsRequested).toBe(true);
        expect(snap.citationCount).toBe(0);
        expect(snap.tokenUsage).toEqual({ inputTokens: 1000, outputTokens: 10 });
        expect('actualCostUSD' in snap).toBe(true);
    });

    it('honours citationsRequested=false', () => {
        const snap = buildEngineRecentRunSnapshot(result({
            findings: [], citations: [], evidenceDocumentMeta: []
        }), false);
        expect(snap.citationsRequested).toBe(false);
    });
});

describe('buildEngineCacheWindowSnapshotFromSession', () => {
    const sess = (p: Partial<InquirySession>): InquirySession => p as unknown as InquirySession;
    const NOW = 1_000_000;

    it('returns undefined for null/absent or already-expired window', () => {
        expect(buildEngineCacheWindowSnapshotFromSession(null, NOW)).toBeUndefined();
        expect(buildEngineCacheWindowSnapshotFromSession(sess({}), NOW)).toBeUndefined();
        expect(buildEngineCacheWindowSnapshotFromSession(sess({ cacheWindowExpiresAt: NOW }), NOW)).toBeUndefined();
        expect(buildEngineCacheWindowSnapshotFromSession(sess({ cacheWindowExpiresAt: NOW - 1 }), NOW)).toBeUndefined();
    });

    it('shapes a still-open window and floors/clamps cachedStableTokens', () => {
        expect(buildEngineCacheWindowSnapshotFromSession(
            sess({ cacheWindowExpiresAt: NOW + 1000, cachedStableTokens: 1234.9 }), NOW
        )).toEqual({ expiresAt: NOW + 1000, cachedTokens: 1234 });
        expect(buildEngineCacheWindowSnapshotFromSession(
            sess({ cacheWindowExpiresAt: NOW + 1000, cachedStableTokens: -5 }), NOW
        )).toEqual({ expiresAt: NOW + 1000, cachedTokens: 0 });
    });

    it('cachedTokens is undefined when cachedStableTokens is absent/non-finite', () => {
        expect(buildEngineCacheWindowSnapshotFromSession(
            sess({ cacheWindowExpiresAt: NOW + 1000 }), NOW
        )).toEqual({ expiresAt: NOW + 1000, cachedTokens: undefined });
        expect(buildEngineCacheWindowSnapshotFromSession(
            sess({ cacheWindowExpiresAt: NOW + 1000, cachedStableTokens: Number.NaN }), NOW
        )).toEqual({ expiresAt: NOW + 1000, cachedTokens: undefined });
    });
});

describe('InquiryView keeps thin delegating wrappers (behaviour unchanged)', () => {
    const src = readFileSync(resolve(process.cwd(), 'src/inquiry/InquiryView.ts'), 'utf8');
    it('imports the pure helpers under aliases and delegates without recursion', () => {
        expect(src.includes("from './engine/inquiryCacheStatus'")).toBe(true);
        expect(src.includes('return scoreReuseAdvancedContextPure(context);')).toBe(true);
        expect(src.includes('return getAnthropicAcceptedCacheTtlPure(trace);')).toBe(true);
        expect(src.includes('return getDispatchEngineKeyPure(result);')).toBe(true);
        // The original inline bodies must be gone from InquiryView.
        expect(src.includes('return (ratioScore * 1_000_000) + tokenScore + (inputScore * 0.001);')).toBe(false);
    });

    it('chunk-2 wrappers delegate while keeping guard / citations / lookup / now in the view', () => {
        expect(src.includes('return resolveActualUsageCostForResultPure(result);')).toBe(true);
        expect(src.includes('return buildEngineRecentRunSnapshotPure(result, this.areInquiryProviderCitationsEnabled());')).toBe(true);
        expect(src.includes('return buildEngineCacheWindowSnapshotFromSessionPure(session, Date.now());')).toBe(true);
        // Guard + session lookup remain in InquiryView.
        expect(src.includes('if (!result || this.isErrorResult(result)) return undefined;')).toBe(true);
        expect(src.includes('this.sessionStore.getLatestActiveCacheSessionForEngine(')).toBe(true);
        // Original inline shaper bodies must be gone from InquiryView.
        expect(src.includes('const sourcesVM = buildInquirySourcesViewModel(\n            result.citations,')).toBe(false);
        expect(src.includes('const breakdown = estimateUsageCost(provider, modelId, result.tokenUsage);')).toBe(false);
    });
});
