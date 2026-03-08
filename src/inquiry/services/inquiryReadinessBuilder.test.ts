/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { describe, it, expect } from 'vitest';
import {
    buildReadinessUiState,
    buildRunScopeLabel,
    buildEnginePayloadSummary,
    resolveEnginePopoverState,
    estimateStructuredPassCount,
    getCurrentPassPlan,
    buildAdvisoryInputKey,
    formatTokenEstimate,
    getTokenTier,
    getTokenTierFromSnapshot,
    INQUIRY_INPUT_TOKENS_AMBER,
    INQUIRY_INPUT_TOKENS_RED,
    type BuildReadinessUiStateInput
} from './inquiryReadinessBuilder';
import type { InquiryEstimateSnapshot } from './inquiryEstimateSnapshot';
import type { InquiryPayloadStats, InquiryReadinessUiState } from '../types';
import type { ResolvedInquiryEngine } from './inquiryModelResolver';
import type { AiSettingsV1 } from '../../ai/types';

// ── Fixtures ──────────────────────────────────────────────────────────

function makeSnapshot(overrides: Partial<{
    estimatedInputTokens: number;
    effectiveInputCeiling: number;
    maxOutputTokens: number;
    expectedPassCount: number;
    estimationMethod: string;
    uncertaintyTokens: number;
    corpusFingerprint: string;
}>): InquiryEstimateSnapshot {
    return {
        version: 1,
        stateKey: 'test-key',
        computedAt: Date.now(),
        scope: 'book',
        focusBookId: 'book-1',
        resolvedEngine: {
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-20250514',
            modelLabel: 'Claude Sonnet',
            contextWindow: 200000
        },
        corpus: {
            scenes: [],
            outlines: [],
            references: [],
            sceneCount: 10,
            outlineCount: 1,
            referenceCount: 5,
            evidenceChars: 50000,
            corpusFingerprint: overrides.corpusFingerprint ?? 'fp-test'
        },
        estimate: {
            estimatedInputTokens: overrides.estimatedInputTokens ?? 50000,
            effectiveInputCeiling: overrides.effectiveInputCeiling ?? 180000,
            maxOutputTokens: overrides.maxOutputTokens ?? 16384,
            expectedPassCount: overrides.expectedPassCount ?? 1,
            estimationMethod: (overrides.estimationMethod ?? 'heuristic_chars') as 'heuristic_chars',
            uncertaintyTokens: overrides.uncertaintyTokens ?? 5000
        }
    };
}

function makeEngine(overrides?: Partial<ResolvedInquiryEngine>): ResolvedInquiryEngine {
    return {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-20250514',
        modelAlias: 'sonnet',
        modelLabel: 'Claude Sonnet',
        providerLabel: 'Anthropic',
        contextWindow: 200000,
        maxOutput: 16384,
        selectionReason: 'test',
        policySource: 'globalPolicy',
        ...overrides
    };
}

function makeAiSettings(overrides?: Partial<AiSettingsV1>): AiSettingsV1 {
    return {
        version: 1,
        provider: 'anthropic',
        thinkingStyle: 'careful',
        analysisPackaging: 'automatic',
        pinnedModels: {},
        executionPreference: 'balanced',
        aiAccessProfile: {
            anthropicTier: 1,
            openaiTier: 1,
            googleTier: 1
        },
        ...overrides
    } as AiSettingsV1;
}

function makePayloadStats(overrides?: Partial<InquiryPayloadStats>): InquiryPayloadStats {
    return {
        scope: 'book',
        focusBookId: 'book-1',
        sceneTotal: 10,
        sceneSynopsisUsed: 0,
        sceneSynopsisAvailable: 0,
        sceneFullTextCount: 10,
        bookOutlineCount: 1,
        bookOutlineSummaryCount: 0,
        bookOutlineFullCount: 1,
        sagaOutlineCount: 0,
        sagaOutlineSummaryCount: 0,
        sagaOutlineFullCount: 0,
        referenceCounts: { character: 3, place: 2, power: 0, other: 0, total: 5 },
        referenceByClass: { Character: 3, Place: 2 },
        evidenceChars: 50000,
        resolvedRoots: ['/'],
        manifestFingerprint: 'fp-test',
        ...overrides
    };
}

function makeBaseInput(overrides?: Partial<BuildReadinessUiStateInput>): BuildReadinessUiStateInput {
    return {
        snapshot: makeSnapshot({}),
        scope: 'book',
        focusLabel: 'Book A',
        aiSettings: makeAiSettings(),
        resolvedEngine: makeEngine(),
        hasCredential: true,
        accessTier: 1,
        payloadStats: makePayloadStats(),
        selectedSceneOverrideCount: 0,
        hasAnyBodyEvidence: true,
        estimateSummaryOnlyTokens: 20000,
        ...overrides
    };
}

function makeReadinessUi(overrides?: Partial<InquiryReadinessUiState>): InquiryReadinessUiState {
    return {
        pending: false,
        readiness: {
            state: 'ready',
            cause: 'ok',
            pressureRatio: 0.3,
            pressureTone: 'normal',
            exceedsBudget: false,
            materiallyExceedsBudget: false
        },
        estimateInputTokens: 50000,
        estimateMethod: 'heuristic_chars',
        estimateUncertaintyTokens: 5000,
        safeInputBudget: 180000,
        outputBudget: 16384,
        packaging: 'automatic',
        hasEligibleModel: true,
        hasCredential: true,
        provider: 'anthropic',
        providerLabel: 'Anthropic',
        reason: 'Fits safely - single pass.',
        runScopeLabel: 'Run on Book A (Bodies).',
        canSwitchToSummaries: true,
        canUseSelectedScenesOnly: false,
        ...overrides
    };
}

// ── getTokenTier ──────────────────────────────────────────────────────

describe('getTokenTier', () => {
    it('returns normal below amber threshold', () => {
        expect(getTokenTier(50000)).toBe('normal');
    });

    it('returns amber at threshold', () => {
        expect(getTokenTier(INQUIRY_INPUT_TOKENS_AMBER)).toBe('amber');
    });

    it('returns amber between thresholds', () => {
        expect(getTokenTier(120000)).toBe('amber');
    });

    it('returns red at threshold', () => {
        expect(getTokenTier(INQUIRY_INPUT_TOKENS_RED)).toBe('red');
    });

    it('returns red above threshold', () => {
        expect(getTokenTier(200000)).toBe('red');
    });

    it('returns normal for zero', () => {
        expect(getTokenTier(0)).toBe('normal');
    });
});

// ── getTokenTierFromSnapshot ──────────────────────────────────────────

describe('getTokenTierFromSnapshot', () => {
    it('returns normal when snapshot is null', () => {
        expect(getTokenTierFromSnapshot(null)).toBe('normal');
    });

    it('returns tier based on snapshot input tokens', () => {
        expect(getTokenTierFromSnapshot(makeSnapshot({ estimatedInputTokens: 150000 }))).toBe('red');
    });
});

// ── formatTokenEstimate ───────────────────────────────────────────────

describe('formatTokenEstimate', () => {
    it('formats thousands with k suffix', () => {
        expect(formatTokenEstimate(50000)).toBe('50k');
    });

    it('formats fractional thousands', () => {
        expect(formatTokenEstimate(1500)).toBe('1.5k');
    });

    it('formats sub-thousand as integer', () => {
        expect(formatTokenEstimate(500)).toBe('500');
    });

    it('handles zero', () => {
        expect(formatTokenEstimate(0)).toBe('0');
    });

    it('handles NaN gracefully', () => {
        expect(formatTokenEstimate(NaN)).toBe('0');
    });

    it('handles Infinity gracefully', () => {
        expect(formatTokenEstimate(Infinity)).toBe('0');
    });

    it('handles exact 1000', () => {
        expect(formatTokenEstimate(1000)).toBe('1k');
    });
});

// ── resolveEnginePopoverState ─────────────────────────────────────────

describe('resolveEnginePopoverState', () => {
    it('returns ready when readiness state is ready', () => {
        expect(resolveEnginePopoverState(makeReadinessUi())).toBe('ready');
    });

    it('returns multi-pass when large and automatic packaging', () => {
        expect(resolveEnginePopoverState(makeReadinessUi({
            readiness: {
                state: 'large',
                cause: 'packaging_expected',
                pressureRatio: 1.5,
                pressureTone: 'red',
                exceedsBudget: true,
                materiallyExceedsBudget: true
            },
            packaging: 'automatic'
        }))).toBe('multi-pass');
    });

    it('returns exceeds when large and singlePassOnly', () => {
        expect(resolveEnginePopoverState(makeReadinessUi({
            readiness: {
                state: 'large',
                cause: 'packaging_expected',
                pressureRatio: 1.5,
                pressureTone: 'red',
                exceedsBudget: true,
                materiallyExceedsBudget: true
            },
            packaging: 'singlePassOnly'
        }))).toBe('exceeds');
    });

    it('returns exceeds when blocked', () => {
        expect(resolveEnginePopoverState(makeReadinessUi({
            readiness: {
                state: 'blocked',
                cause: 'missing_key',
                pressureRatio: Infinity,
                pressureTone: 'red',
                exceedsBudget: true,
                materiallyExceedsBudget: true
            }
        }))).toBe('exceeds');
    });
});

// ── estimateStructuredPassCount ────────────────────────────────────────

describe('estimateStructuredPassCount', () => {
    it('returns 2 when budget is zero', () => {
        expect(estimateStructuredPassCount(makeReadinessUi({ safeInputBudget: 0 }))).toBe(2);
    });

    it('returns 2 when ratio is below 2', () => {
        expect(estimateStructuredPassCount(makeReadinessUi({
            estimateInputTokens: 150000,
            safeInputBudget: 100000
        }))).toBe(2);
    });

    it('returns 3 for large ratio', () => {
        expect(estimateStructuredPassCount(makeReadinessUi({
            estimateInputTokens: 250000,
            safeInputBudget: 100000
        }))).toBe(3);
    });

    it('returns 2 for NaN ratio', () => {
        expect(estimateStructuredPassCount(makeReadinessUi({
            estimateInputTokens: NaN,
            safeInputBudget: 100000
        }))).toBe(2);
    });
});

// ── getCurrentPassPlan ────────────────────────────────────────────────

describe('getCurrentPassPlan', () => {
    it('returns single-pass plan when not exceeding budget', () => {
        const plan = getCurrentPassPlan(makeReadinessUi(), null);
        expect(plan.packagingExpected).toBe(false);
        expect(plan.displayPassCount).toBe(1);
    });

    it('returns multi-pass plan when exceeding budget with automatic packaging', () => {
        const plan = getCurrentPassPlan(makeReadinessUi({
            readiness: {
                state: 'large',
                cause: 'packaging_expected',
                pressureRatio: 1.5,
                pressureTone: 'red',
                exceedsBudget: true,
                materiallyExceedsBudget: true
            },
            estimateInputTokens: 200000,
            safeInputBudget: 100000,
            packaging: 'automatic'
        }), null);
        expect(plan.packagingExpected).toBe(true);
        expect(plan.estimatedPassCount).toBe(2);
        expect(plan.displayPassCount).toBe(2);
    });

    it('uses recent exact count when available', () => {
        const plan = getCurrentPassPlan(
            makeReadinessUi({
                readiness: {
                    state: 'large',
                    cause: 'packaging_expected',
                    pressureRatio: 2.5,
                    pressureTone: 'red',
                    exceedsBudget: true,
                    materiallyExceedsBudget: true
                },
                estimateInputTokens: 300000,
                safeInputBudget: 100000,
                packaging: 'automatic'
            }),
            { executionPassCount: 4, packagingTriggerReason: 'context_overflow' } as any
        );
        expect(plan.recentExactPassCount).toBe(4);
        expect(plan.displayPassCount).toBe(4);
        expect(plan.packagingTriggerReason).toBe('context_overflow');
    });

    it('ignores executionPassCount of 1', () => {
        const plan = getCurrentPassPlan(
            makeReadinessUi({
                readiness: {
                    state: 'large',
                    cause: 'packaging_expected',
                    pressureRatio: 1.5,
                    pressureTone: 'red',
                    exceedsBudget: true,
                    materiallyExceedsBudget: true
                },
                estimateInputTokens: 150000,
                safeInputBudget: 100000,
                packaging: 'automatic'
            }),
            { executionPassCount: 1 } as any
        );
        expect(plan.recentExactPassCount).toBeNull();
    });
});

// ── buildRunScopeLabel ────────────────────────────────────────────────

describe('buildRunScopeLabel', () => {
    it('shows scene selection when subset selected', () => {
        const label = buildRunScopeLabel(makePayloadStats(), 3, 'book', 'Book A');
        expect(label).toBe('Run on 3 scenes (Bodies).');
    });

    it('shows full book with bodies', () => {
        const label = buildRunScopeLabel(makePayloadStats(), 0, 'book', 'Book A');
        expect(label).toContain('Book A');
        expect(label).toContain('Bodies');
    });

    it('shows summaries when only summaries used', () => {
        const label = buildRunScopeLabel(
            makePayloadStats({ sceneFullTextCount: 0, sceneSynopsisUsed: 5 }),
            0, 'book', 'Book A'
        );
        expect(label).toContain('Summaries');
    });

    it('shows saga scope label', () => {
        const label = buildRunScopeLabel(makePayloadStats(), 0, 'saga', 'My Saga');
        expect(label).toContain('Saga My Saga');
    });

    it('includes outline info when outlines present', () => {
        const label = buildRunScopeLabel(makePayloadStats(), 0, 'book', 'Book A');
        expect(label).toContain('Outline');
    });
});

// ── buildEnginePayloadSummary ─────────────────────────────────────────

describe('buildEnginePayloadSummary', () => {
    it('returns estimating text when no snapshot', () => {
        const result = buildEnginePayloadSummary({ snapshot: null, scope: 'book', focusLabel: 'Book A' });
        expect(result.text).toContain('Estimating');
        expect(result.inputTokens).toBe(0);
        expect(result.tier).toBe('normal');
    });

    it('returns token summary from snapshot', () => {
        const result = buildEnginePayloadSummary({
            snapshot: makeSnapshot({ estimatedInputTokens: 50000 }),
            scope: 'book',
            focusLabel: 'Book A'
        });
        expect(result.text).toContain('50k');
        expect(result.text).toContain('Book');
        expect(result.inputTokens).toBe(50000);
        expect(result.tier).toBe('normal');
    });

    it('uses saga label for saga scope', () => {
        const result = buildEnginePayloadSummary({
            snapshot: makeSnapshot({}),
            scope: 'saga',
            focusLabel: 'My Saga'
        });
        expect(result.text).toContain('Saga My Saga');
    });
});

// ── buildAdvisoryInputKey ─────────────────────────────────────────────

describe('buildAdvisoryInputKey', () => {
    it('produces stable key for identical inputs', () => {
        const params = {
            scope: 'book' as const,
            focusLabel: 'Book A',
            provider: 'anthropic' as const,
            modelId: 'claude-sonnet-4-20250514',
            packaging: 'automatic' as const,
            estimatedInputTokens: 50000,
            estimateMethod: 'heuristic_chars' as const,
            estimateUncertaintyTokens: 5000,
            corpusFingerprint: 'fp-test',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
            corpusFingerprintReused: false
        };
        expect(buildAdvisoryInputKey(params)).toBe(buildAdvisoryInputKey({ ...params }));
    });

    it('changes when provider changes', () => {
        const base = {
            scope: 'book' as const,
            focusLabel: 'Book A',
            provider: 'anthropic' as const,
            modelId: 'claude-sonnet-4-20250514',
            packaging: 'automatic' as const,
            estimatedInputTokens: 50000,
            estimateMethod: 'heuristic_chars' as const,
            estimateUncertaintyTokens: 5000,
            corpusFingerprint: 'fp-test',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
            corpusFingerprintReused: false
        };
        const key1 = buildAdvisoryInputKey(base);
        const key2 = buildAdvisoryInputKey({ ...base, provider: 'openai' as const });
        expect(key1).not.toBe(key2);
    });

    it('quantizes token estimates to nearest 5000', () => {
        const base = {
            scope: 'book' as const,
            focusLabel: 'Book A',
            provider: 'anthropic' as const,
            modelId: 'claude-sonnet-4-20250514',
            packaging: 'automatic' as const,
            estimatedInputTokens: 50001,
            estimateMethod: 'heuristic_chars' as const,
            estimateUncertaintyTokens: 5000,
            corpusFingerprint: 'fp-test',
            overrideSummary: { active: false, classCount: 0, itemCount: 0, total: 0 },
            corpusFingerprintReused: false
        };
        // 50001 and 52499 both round to 50000
        const key1 = buildAdvisoryInputKey(base);
        const key2 = buildAdvisoryInputKey({ ...base, estimatedInputTokens: 52499 });
        expect(key1).toBe(key2);
    });
});

// ── buildReadinessUiState ─────────────────────────────────────────────

describe('buildReadinessUiState', () => {
    it('returns pending state when snapshot is null', () => {
        const result = buildReadinessUiState(makeBaseInput({ snapshot: null }));
        expect(result.pending).toBe(true);
        expect(result.estimateInputTokens).toBe(0);
        expect(result.reason).toBe('Estimating…');
    });

    it('returns ready state for normal payload', () => {
        const result = buildReadinessUiState(makeBaseInput());
        expect(result.pending).toBe(false);
        expect(result.readiness.state).toBe('ready');
        expect(result.hasEligibleModel).toBe(true);
    });

    it('returns blocked state when credential missing', () => {
        const result = buildReadinessUiState(makeBaseInput({ hasCredential: false }));
        expect(result.readiness.cause).toBe('missing_key');
        expect(result.reason).toContain('key is missing');
    });

    it('returns large state when exceeding budget with automatic packaging', () => {
        const result = buildReadinessUiState(makeBaseInput({
            snapshot: makeSnapshot({ estimatedInputTokens: 300000, effectiveInputCeiling: 180000 })
        }));
        expect(result.readiness.state).toBe('large');
        expect(result.readiness.cause).toBe('packaging_expected');
    });

    it('sets canSwitchToSummaries when body evidence exists and summaries fit', () => {
        const result = buildReadinessUiState(makeBaseInput({
            hasAnyBodyEvidence: true,
            estimateSummaryOnlyTokens: 50000
        }));
        expect(result.canSwitchToSummaries).toBe(true);
    });

    it('canSwitchToSummaries false when no body evidence', () => {
        const result = buildReadinessUiState(makeBaseInput({
            hasAnyBodyEvidence: false
        }));
        expect(result.canSwitchToSummaries).toBe(false);
    });

    it('sets canUseSelectedScenesOnly when scene overrides present', () => {
        const result = buildReadinessUiState(makeBaseInput({
            selectedSceneOverrideCount: 3
        }));
        expect(result.canUseSelectedScenesOnly).toBe(true);
    });

    it('canUseSelectedScenesOnly false in saga scope', () => {
        const result = buildReadinessUiState(makeBaseInput({
            scope: 'saga',
            selectedSceneOverrideCount: 3
        }));
        expect(result.canUseSelectedScenesOnly).toBe(false);
    });

    it('includes run scope label', () => {
        const result = buildReadinessUiState(makeBaseInput());
        expect(result.runScopeLabel).toContain('Book A');
    });
});
