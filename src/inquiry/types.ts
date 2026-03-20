/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Shared type definitions for the Inquiry subsystem.
 *
 * These types are used by InquiryView and the extracted service/builder modules.
 * Keeping them in a shared file avoids circular imports.
 */

import type { InquiryScope } from './state';
import type { InquiryReadinessResult } from './services/readiness';
import type { TokenEstimateMethod } from '../ai/tokens/inputTokenEstimate';
import type { AIProviderId, AnalysisPackaging, ModelInfo, RTCorpusTokenEstimate } from '../ai/types';
import type { CorpusManifestEntry } from './runner/types';

// ── Token tier ────────────────────────────────────────────────────────

export type TokenTier = 'normal' | 'amber' | 'red';

// ── Payload stats ─────────────────────────────────────────────────────

export type InquiryPayloadStats = {
    scope: InquiryScope;
    activeBookId?: string;
    sceneTotal: number;
    sceneSynopsisUsed: number;
    sceneSynopsisAvailable: number;
    sceneFullTextCount: number;
    sceneChars?: number;
    bookOutlineCount: number;
    bookOutlineSummaryCount: number;
    bookOutlineFullCount: number;
    sagaOutlineCount: number;
    sagaOutlineSummaryCount: number;
    sagaOutlineFullCount: number;
    outlineChars?: number;
    referenceCounts: { character: number; place: number; power: number; other: number; total: number };
    referenceByClass: Record<string, number>;
    referenceChars?: number;
    evidenceChars: number;
    resolvedRoots: string[];
    manifestFingerprint: string;
};

export type InquiryCurrentCorpusContext = {
    scope: InquiryScope;
    activeBookId?: string;
    scopeLabel: string;
    corpus: RTCorpusTokenEstimate;
    manifestEntries: CorpusManifestEntry[];
};

// ── Readiness UI state ────────────────────────────────────────────────

export type InquiryReadinessUiState = {
    pending: boolean;
    readiness: InquiryReadinessResult;
    estimateInputTokens: number;
    expectedPassCount: number;
    estimateMethod: TokenEstimateMethod;
    estimateUncertaintyTokens: number;
    safeInputBudget: number;
    outputBudget: number;
    packaging: AnalysisPackaging;
    hasEligibleModel: boolean;
    hasCredential: boolean;
    provider: AIProviderId;
    providerLabel: string;
    reason: string;
    model?: ModelInfo;
    runScopeLabel: string;
    canSwitchToSummaries: boolean;
    canUseSelectedScenesOnly: boolean;
};

// ── Engine popover state ──────────────────────────────────────────────

export type InquiryEnginePopoverState = 'ready' | 'multi-pass' | 'exceeds';

// ── Pass plan result ──────────────────────────────────────────────────

export type PassPlanResult = {
    packagingExpected: boolean;
    estimatedPassCount: number | null;
    recentExactPassCount: number | null;
    displayPassCount: number;
    packagingTriggerReason: string | null;
};
