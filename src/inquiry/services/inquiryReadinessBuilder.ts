/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Pure functions for building Inquiry readiness/estimate UI state.
 *
 * ⚠️ GUARDRAIL: This module is aggressively pure.
 * - Zero references to plugin, DOM, or class instance state.
 * - Every function is (input: ExplicitStruct) => output.
 * - No Obsidian imports.
 * - Must be importable and testable with zero Obsidian dependencies.
 */

import type { InquiryScope } from '../state';
import type { InquiryEstimateSnapshot } from './inquiryEstimateSnapshot';
import type { TokenEstimateMethod } from '../../ai/tokens/inputTokenEstimate';
import type { AIProviderId, AIRunAdvancedContext, AccessTier, AiSettingsV1, AnalysisPackaging, ModelInfo } from '../../ai/types';
import type { ResolvedInquiryEngine } from './inquiryModelResolver';
import type {
    TokenTier,
    InquiryPayloadStats,
    InquiryReadinessUiState,
    InquiryEnginePopoverState,
    PassPlanResult
} from '../types';
import { evaluateInquiryReadiness } from './readiness';
import { estimateUncertaintyTokens } from '../../ai/tokens/inputTokenEstimate';
import { computeCaps, INPUT_TOKEN_GUARD_FACTOR } from '../../ai/caps/computeCaps';
import { BUILTIN_MODELS } from '../../ai/registry/builtinModels';
import { INQUIRY_MAX_OUTPUT_TOKENS } from '../constants';
import { buildRTCorpusEstimate } from './buildRTCorpusEstimate';

// ── Constants ─────────────────────────────────────────────────────────

export const INQUIRY_INPUT_TOKENS_AMBER = 90000;
export const INQUIRY_INPUT_TOKENS_RED = 140000;

// ── Input structs ─────────────────────────────────────────────────────

export interface BuildReadinessUiStateInput {
    snapshot: InquiryEstimateSnapshot | null;
    scope: InquiryScope;
    scopeLabel: string;
    aiSettings: AiSettingsV1;
    resolvedEngine: ResolvedInquiryEngine;
    hasCredential: boolean;
    accessTier: AccessTier;
    payloadStats: InquiryPayloadStats;
    selectedSceneOverrideCount: number;
    hasAnyBodyEvidence: boolean;
    estimateSummaryOnlyTokens: number;
}

export interface BuildEnginePayloadSummaryInput {
    payloadStats: InquiryPayloadStats | null;
    scope: InquiryScope;
    scopeLabel: string;
}

export interface AdvisoryInputKeyParams {
    scope: InquiryScope;
    scopeLabel: string;
    provider: AIProviderId;
    modelId: string;
    packaging: AnalysisPackaging;
    estimatedInputTokens: number;
    estimateMethod: TokenEstimateMethod;
    estimateUncertaintyTokens: number;
    corpusFingerprint: string;
    overrideSummary: { active: boolean; classCount: number; itemCount: number; total: number };
    corpusFingerprintReused: boolean;
}

// ── Token tier ────────────────────────────────────────────────────────

export function getTokenTier(inputTokens: number): TokenTier {
    if (inputTokens >= INQUIRY_INPUT_TOKENS_RED) return 'red';
    if (inputTokens >= INQUIRY_INPUT_TOKENS_AMBER) return 'amber';
    return 'normal';
}

export function getTokenTierFromSnapshot(snapshot: InquiryEstimateSnapshot | null): TokenTier {
    if (!snapshot) return 'normal';
    return getTokenTier(snapshot.estimate.estimatedInputTokens);
}

// ── Format ────────────────────────────────────────────────────────────

export function formatTokenEstimate(value: number): string {
    const safe = Number.isFinite(value) ? value : 0;
    if (safe >= 1000) {
        const rounded = Math.round(safe / 100) / 10;
        return `${rounded.toFixed(rounded % 1 === 0 ? 0 : 1)}k`;
    }
    return String(Math.round(safe));
}

// ── Engine payload summary ────────────────────────────────────────────

export function buildEnginePayloadSummary(input: BuildEnginePayloadSummaryInput): {
    text: string;
    inputTokens: number;
    tier: TokenTier;
} {
    const scopeLabel = input.scope === 'saga' ? 'Saga' : 'Book';
    const contextLabel = `${scopeLabel} ${input.scopeLabel}`;
    if (!input.payloadStats) {
        return {
            text: `Payload (${contextLabel}): Estimating…`,
            inputTokens: 0,
            tier: 'normal'
        };
    }
    const corpusEstimate = buildRTCorpusEstimate(input.payloadStats);
    const inputLabel = formatTokenEstimate(corpusEstimate.estimatedTokens);
    return {
        text: `Payload (${contextLabel}): ~${inputLabel} in`,
        inputTokens: corpusEstimate.estimatedTokens,
        tier: getTokenTier(corpusEstimate.estimatedTokens)
    };
}

// ── Popover state ─────────────────────────────────────────────────────

export function resolveEnginePopoverState(readinessUi: InquiryReadinessUiState): InquiryEnginePopoverState {
    if (readinessUi.readiness.state === 'ready') return 'ready';
    if (readinessUi.readiness.state === 'large' && readinessUi.packaging === 'automatic') return 'multi-pass';
    return 'exceeds';
}

// ── Pass count / pass plan ────────────────────────────────────────────

export function estimateStructuredPassCount(readinessUi: InquiryReadinessUiState): number {
    if (Number.isFinite(readinessUi.expectedPassCount) && readinessUi.expectedPassCount > 0) {
        return Math.max(1, Math.floor(readinessUi.expectedPassCount));
    }
    if (readinessUi.safeInputBudget <= 0) return 2;
    const ratio = readinessUi.estimateInputTokens / readinessUi.safeInputBudget;
    if (!Number.isFinite(ratio)) return 2;
    return Math.max(2, Math.ceil(Math.max(1, ratio)));
}

export function getCurrentPassPlan(
    readinessUi: InquiryReadinessUiState,
    lastAdvancedContext: AIRunAdvancedContext | null
): PassPlanResult {
    const packagingExpected = readinessUi.packaging === 'automatic' && readinessUi.readiness.exceedsBudget;
    if (!packagingExpected) {
        return {
            packagingExpected: false,
            estimatedPassCount: null,
            recentExactPassCount: null,
            displayPassCount: 1,
            packagingTriggerReason: null
        };
    }
    const recentExactPassCount = typeof lastAdvancedContext?.executionPassCount === 'number' && lastAdvancedContext.executionPassCount > 1
        ? lastAdvancedContext.executionPassCount
        : null;
    const estimatedPassCount = estimateStructuredPassCount(readinessUi);
    return {
        packagingExpected: true,
        estimatedPassCount,
        recentExactPassCount,
        displayPassCount: recentExactPassCount ?? estimatedPassCount,
        packagingTriggerReason: lastAdvancedContext?.packagingTriggerReason ?? null
    };
}

// ── Run scope label ───────────────────────────────────────────────────

export function buildRunScopeLabel(
    stats: InquiryPayloadStats,
    selectedSceneCount: number,
    scope: InquiryScope,
    scopeLabel: string
): string {
    const sceneMode = stats.sceneFullTextCount > 0
        ? 'Full Scenes'
        : stats.sceneSynopsisUsed > 0
            ? 'Summaries'
            : 'No scene evidence';
    const outlineCount = stats.bookOutlineCount + stats.sagaOutlineCount;
    const outlineMode = (stats.bookOutlineFullCount + stats.sagaOutlineFullCount) > 0
        ? 'Full'
        : (stats.bookOutlineSummaryCount + stats.sagaOutlineSummaryCount) > 0
            ? 'Summary'
            : '';

    if (scope === 'book' && selectedSceneCount > 0 && selectedSceneCount < Math.max(1, stats.sceneTotal)) {
        return `Run on ${selectedSceneCount} scenes (${sceneMode}).`;
    }

    if (scope === 'book') {
        const parts: string[] = [];
        if (outlineCount > 0) {
            parts.push(`Outline (${outlineMode || 'Exclude'})`);
        }
        if (stats.sceneTotal > 0) {
            parts.push(sceneMode);
        }
        return `Run on Book ${scopeLabel} (${parts.join(' + ')}).`;
    }

    return `Run on Saga ${scopeLabel} (${sceneMode}).`;
}

// ── Advisory input key ────────────────────────────────────────────────

export function buildAdvisoryInputKey(params: AdvisoryInputKeyParams): string {
    return [
        params.scope,
        params.scopeLabel,
        params.provider,
        params.modelId,
        params.packaging,
        Math.round(params.estimatedInputTokens / 5000) * 5000,
        params.estimateMethod,
        Math.round(params.estimateUncertaintyTokens / 1000) * 1000,
        params.corpusFingerprint,
        params.overrideSummary.active ? 1 : 0,
        params.overrideSummary.classCount,
        params.overrideSummary.itemCount,
        params.overrideSummary.total,
        params.corpusFingerprintReused ? 1 : 0
    ].join('|');
}

// ── Readiness UI state (main builder) ─────────────────────────────────

export function buildReadinessUiState(input: BuildReadinessUiStateInput): InquiryReadinessUiState {
    const { snapshot, scope, scopeLabel, aiSettings, resolvedEngine, hasCredential, accessTier, payloadStats, selectedSceneOverrideCount } = input;
    const provider = resolvedEngine.provider === 'none' ? 'openai' as const : resolvedEngine.provider;
    const providerLabel = resolvedEngine.providerLabel;

    // If the engine itself is blocked (e.g. provider lacks Inquiry capability
    // floor), return a definitive blocked state — no model lookup, no
    // fabricated numbers.
    if (resolvedEngine.blocked) {
        return {
            pending: false,
            readiness: evaluateInquiryReadiness({
                hasEligibleModel: false,
                hasCredential,
                analysisPackaging: aiSettings.analysisPackaging,
                estimatedInputTokens: 0,
                safeInputBudget: 0,
                estimateUncertaintyTokens: 0
            }),
            estimateInputTokens: 0,
            expectedPassCount: 1,
            estimateMethod: 'heuristic_chars',
            estimateUncertaintyTokens: 0,
            safeInputBudget: 0,
            outputBudget: INQUIRY_MAX_OUTPUT_TOKENS,
            packaging: aiSettings.analysisPackaging,
            hasEligibleModel: false,
            hasCredential,
            provider,
            providerLabel,
            reason: resolvedEngine.blockReason || 'No model satisfies capability floor.',
            runScopeLabel: buildRunScopeLabel(payloadStats, selectedSceneOverrideCount, scope, scopeLabel),
            canSwitchToSummaries: false,
            canUseSelectedScenesOnly: false
        };
    }

    // If snapshot is not yet available, return a pending state.
    if (!snapshot) {
        return {
            pending: true,
            readiness: evaluateInquiryReadiness({
                hasEligibleModel: false,
                hasCredential,
                analysisPackaging: aiSettings.analysisPackaging,
                estimatedInputTokens: 0,
                safeInputBudget: 0,
                estimateUncertaintyTokens: 0
            }),
            estimateInputTokens: 0,
            expectedPassCount: 1,
            estimateMethod: 'heuristic_chars',
            estimateUncertaintyTokens: 0,
            safeInputBudget: 0,
            outputBudget: INQUIRY_MAX_OUTPUT_TOKENS,
            packaging: aiSettings.analysisPackaging,
            hasEligibleModel: false,
            hasCredential,
            provider,
            providerLabel,
            reason: 'Estimating…',
            runScopeLabel: buildRunScopeLabel(payloadStats, selectedSceneOverrideCount, scope, scopeLabel),
            canSwitchToSummaries: false,
            canUseSelectedScenesOnly: false
        };
    }

    const estimateInputTokens = snapshot.estimate.estimatedInputTokens;
    const expectedPassCount = Number.isFinite(snapshot.estimate.expectedPassCount)
        ? Math.max(1, Math.floor(snapshot.estimate.expectedPassCount))
        : 1;
    const estimateMethod: TokenEstimateMethod = snapshot.estimate.estimationMethod;
    const effectiveInputCeiling = snapshot.estimate.effectiveInputCeiling;
    let hasEligibleModel = false;
    let reason = 'Fits safely - single pass.';
    let safeInputBudget = 0;
    let outputBudget = INQUIRY_MAX_OUTPUT_TOKENS;
    let model: ModelInfo | undefined;
    const preparedSafeBudget = Number.isFinite(effectiveInputCeiling)
        ? Math.max(0, Math.floor(effectiveInputCeiling))
        : 0;
    if (preparedSafeBudget > 0) {
        safeInputBudget = preparedSafeBudget;
        hasEligibleModel = true;
    }

    try {
        // Use the resolved model from the canonical resolver.
        const resolvedModel = BUILTIN_MODELS.find(m => m.id === resolvedEngine.modelId);
        if (!resolvedModel) throw new Error(`Resolved model "${resolvedEngine.modelId}" not found in registry.`);
        model = resolvedModel;
        if (preparedSafeBudget <= 0) {
            hasEligibleModel = true;
            const caps = computeCaps({
                provider,
                model: resolvedModel,
                accessTier,
                feature: 'InquiryMode',
                overrides: aiSettings.overrides
            });
            safeInputBudget = Math.floor(caps.maxInputTokens * INPUT_TOKEN_GUARD_FACTOR);
            outputBudget = caps.maxOutputTokens;
        } else {
            outputBudget = snapshot.estimate.maxOutputTokens || outputBudget;
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reason = message || 'No model satisfies capability floor.';
    }
    const estimateUncertaintyBudget = Number.isFinite(snapshot.estimate.uncertaintyTokens)
        ? Math.max(0, Math.floor(snapshot.estimate.uncertaintyTokens))
        : estimateUncertaintyTokens(estimateMethod, safeInputBudget);

    const readiness = evaluateInquiryReadiness({
        hasEligibleModel,
        hasCredential,
        analysisPackaging: aiSettings.analysisPackaging,
        estimatedInputTokens: estimateInputTokens,
        safeInputBudget,
        estimateUncertaintyTokens: estimateUncertaintyBudget
    });

    const canSwitchToSummaries = input.hasAnyBodyEvidence
        && safeInputBudget > 0
        && input.estimateSummaryOnlyTokens <= safeInputBudget;
    const canUseSelectedScenesOnly = scope === 'book'
        && selectedSceneOverrideCount > 0
        && selectedSceneOverrideCount < Math.max(1, payloadStats.sceneTotal);

    if (readiness.cause === 'missing_key') {
        reason = `${providerLabel} key is missing. Add a saved key in AI settings.`;
    } else if (readiness.cause === 'capability_floor') {
        reason = `${providerLabel} cannot satisfy this Inquiry setup. Update Provider, Thinking Style, or Access level.`;
    } else if (readiness.cause === 'single_pass_limit') {
        reason = 'Exceeds the single-pass planning budget. Switch to Automatic or choose a larger-context engine.';
    } else if (readiness.state === 'large') {
        reason = 'Automatic packaging will run multiple structured passes.';
    }

    return {
        pending: false,
        readiness,
        estimateInputTokens,
        expectedPassCount,
        estimateMethod,
        estimateUncertaintyTokens: estimateUncertaintyBudget,
        safeInputBudget,
        outputBudget,
        packaging: aiSettings.analysisPackaging,
        hasEligibleModel,
        hasCredential,
        provider,
        providerLabel,
        reason,
        model,
        runScopeLabel: buildRunScopeLabel(payloadStats, selectedSceneOverrideCount, scope, scopeLabel),
        canSwitchToSummaries,
        canUseSelectedScenesOnly
    };
}
