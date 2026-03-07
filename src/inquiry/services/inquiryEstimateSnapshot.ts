/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * InquiryEstimateSnapshot — single source of truth for Inquiry token estimates.
 *
 * Every UI surface that displays token counts, pass expectations, or readiness
 * indicators reads from one immutable snapshot produced here.  The snapshot is
 * keyed by a deterministic state key so that identical corpus + engine states
 * produce identical estimates without recomputation.
 *
 * Invariants:
 *   - Snapshot is immutable once built.  Never mutated after return.
 *   - State key excludes question text — hovering between questions does NOT
 *     trigger recomputation.
 *   - Mode (flow/depth) is excluded — proven UI-only emphasis that does not
 *     affect corpus selection, evidence blocks, or prompt construction.
 *   - Material rules (class configs) are implicitly captured by corpusFingerprint
 *     because changing rules changes manifest entries → changes fingerprint.
 */

import type { AIProviderId } from '../../ai/types';
import type { TokenEstimateMethod } from '../../ai/tokens/inputTokenEstimate';
import type { InquiryScope } from '../state';
import type { ResolvedInquiryEngine } from './inquiryModelResolver';
import type { CorpusManifest, EvidenceParticipationRules, InquiryRunnerInput } from '../runner/types';
import type { InquiryRunnerService } from '../runner/InquiryRunnerService';
import type { InquiryMode } from '../state';
import { estimatePassCount } from './inquiryAdvisory';
import { INQUIRY_CANONICAL_ESTIMATE_QUESTION, INQUIRY_MAX_OUTPUT_TOKENS } from '../constants';
import { mapAiProviderToLegacyProvider } from '../../ai/settings/aiSettings';

// ── Version ─────────────────────────────────────────────────────────

export const ESTIMATE_SNAPSHOT_VERSION = 1 as const;

// ── Types ───────────────────────────────────────────────────────────

export interface InquiryEstimateSnapshot {
    readonly version: typeof ESTIMATE_SNAPSHOT_VERSION;
    readonly stateKey: string;
    readonly computedAt: number;

    readonly scope: InquiryScope;
    readonly focusBookId?: string;

    readonly resolvedEngine: {
        readonly provider: AIProviderId;
        readonly modelId: string;
        readonly modelLabel: string;
        readonly contextWindow: number;
    };

    readonly corpus: {
        readonly scenes: string[];       // file paths
        readonly outlines: string[];     // file paths
        readonly references: string[];   // file paths
        readonly sceneCount: number;
        readonly outlineCount: number;
        readonly referenceCount: number;
        readonly evidenceChars: number;
        readonly corpusFingerprint: string;
    };

    readonly estimate: {
        readonly estimatedInputTokens: number;
        readonly effectiveInputCeiling: number;
        readonly maxOutputTokens: number;
        readonly expectedPassCount: number;
        readonly estimationMethod: TokenEstimateMethod;
        readonly uncertaintyTokens: number;
    };
}

// ── Snapshot builder params ─────────────────────────────────────────

export interface EstimateSnapshotParams {
    scope: InquiryScope;
    focusBookId?: string;
    focusSceneId?: string;
    focusLabel: string;
    manifest: CorpusManifest;
    payloadStats: {
        sceneCount: number;
        outlineCount: number;
        referenceCount: number;
        evidenceChars: number;
    };
    runner: InquiryRunnerService;
    engine: ResolvedInquiryEngine;
    overrideSummary: {
        active: boolean;
        classCount: number;
        itemCount: number;
        total: number;
    };
    rules: EvidenceParticipationRules;
    mode: InquiryMode;
}

// ── State key ───────────────────────────────────────────────────────

/**
 * Compute a deterministic cache key for snapshot invalidation.
 *
 * Key components:
 *   scope | focusBookId | corpusFingerprint | provider | modelId | overrideClassCount | overrideItemCount
 *
 * Exclusions (with rationale):
 *   - Question text: Evidence chars (~200k) dwarf question length (~200 chars).
 *     Including it would trigger recomputation on hover — violates UX rule.
 *   - Mode (flow/depth): Proven UI-only emphasis. InquiryRunnerInput documents:
 *     "UI emphasis only; inquiry computation must always include both flow + depth
 *     regardless of lens."  buildEvidenceBlocks() ignores it.
 *   - Material rules (class configs): Implicitly captured by corpusFingerprint.
 *     Any rule change that affects the estimate changes the manifest entries,
 *     which changes the fingerprint.
 */
export function computeEstimateStateKey(params: {
    scope: InquiryScope;
    focusBookId?: string;
    corpusFingerprint: string;
    provider: AIProviderId;
    modelId: string;
    overrideClassCount: number;
    overrideItemCount: number;
}): string {
    return [
        params.scope,
        params.focusBookId ?? '',
        params.corpusFingerprint,
        params.provider,
        params.modelId,
        params.overrideClassCount,
        params.overrideItemCount
    ].join('|');
}

// ── Corpus ID extraction ────────────────────────────────────────────

function extractCorpusIds(manifest: CorpusManifest): {
    scenes: string[];
    outlines: string[];
    references: string[];
} {
    const scenes: string[] = [];
    const outlines: string[] = [];
    const references: string[] = [];

    for (const entry of manifest.entries) {
        if (entry.class === 'scene') {
            scenes.push(entry.path);
        } else if (entry.class === 'outline') {
            outlines.push(entry.path);
        } else {
            references.push(entry.path);
        }
    }

    return { scenes, outlines, references };
}

// ── Builder ─────────────────────────────────────────────────────────

/**
 * Build an immutable InquiryEstimateSnapshot.
 *
 * Uses the canonical estimate question so that the estimate is deterministic
 * per corpus state — hovering between user questions does not cause flicker.
 *
 * Internal flow:
 *   1. Compute state key from params
 *   2. Extract corpus ID lists from manifest entries
 *   3. Call runner.buildTrace() with INQUIRY_CANONICAL_ESTIMATE_QUESTION
 *   4. Extract trace.tokenEstimate (inputTokens, effectiveInputCeiling, etc.)
 *   5. Compute expectedPassCount via estimatePassCount()
 *   6. Package and return frozen snapshot
 */
export async function buildInquiryEstimateSnapshot(
    params: EstimateSnapshotParams
): Promise<InquiryEstimateSnapshot> {
    const stateKey = computeEstimateStateKey({
        scope: params.scope,
        focusBookId: params.focusBookId,
        corpusFingerprint: params.manifest.fingerprint,
        provider: params.engine.provider,
        modelId: params.engine.modelId,
        overrideClassCount: params.overrideSummary.classCount,
        overrideItemCount: params.overrideSummary.itemCount
    });

    const corpusIds = extractCorpusIds(params.manifest);

    // Build a trace using the canonical question to get a precise token estimate.
    const runnerInput: InquiryRunnerInput = {
        scope: params.scope,
        focusLabel: params.focusLabel,
        focusSceneId: params.scope === 'book' ? params.focusSceneId : undefined,
        focusBookId: params.focusBookId,
        mode: params.mode,
        questionId: 'estimate-snapshot',
        questionText: INQUIRY_CANONICAL_ESTIMATE_QUESTION,
        questionZone: 'setup',
        corpus: params.manifest,
        rules: params.rules,
        ai: {
            provider: mapAiProviderToLegacyProvider(params.engine.provider),
            modelId: params.engine.modelId,
            modelLabel: params.engine.modelLabel
        }
    };

    const trace = await params.runner.buildTrace(runnerInput);

    const estimatedInputTokens = trace.tokenEstimate.inputTokens;
    const effectiveInputCeiling = trace.tokenEstimate.effectiveInputCeiling ?? 0;
    const estimationMethod: TokenEstimateMethod = trace.tokenEstimate.estimationMethod ?? 'heuristic_chars';
    const uncertaintyTokens = trace.tokenEstimate.uncertaintyTokens ?? 0;
    const expectedPassCount = estimatePassCount(estimatedInputTokens, effectiveInputCeiling);

    const snapshot: InquiryEstimateSnapshot = {
        version: ESTIMATE_SNAPSHOT_VERSION,
        stateKey,
        computedAt: Date.now(),

        scope: params.scope,
        focusBookId: params.focusBookId,

        resolvedEngine: {
            provider: params.engine.provider,
            modelId: params.engine.modelId,
            modelLabel: params.engine.modelLabel,
            contextWindow: params.engine.contextWindow,
        },

        corpus: {
            scenes: corpusIds.scenes,
            outlines: corpusIds.outlines,
            references: corpusIds.references,
            sceneCount: params.payloadStats.sceneCount,
            outlineCount: params.payloadStats.outlineCount,
            referenceCount: params.payloadStats.referenceCount,
            evidenceChars: params.payloadStats.evidenceChars,
            corpusFingerprint: params.manifest.fingerprint,
        },

        estimate: {
            estimatedInputTokens,
            effectiveInputCeiling,
            maxOutputTokens: INQUIRY_MAX_OUTPUT_TOKENS,
            expectedPassCount,
            estimationMethod,
            uncertaintyTokens,
        },
    };

    return snapshot;
}
