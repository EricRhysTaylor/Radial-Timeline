import { INPUT_TOKEN_GUARD_FACTOR } from '../../ai/caps/computeCaps';
import { resolveEngineCapabilities } from '../../ai/caps/engineCapabilities';
import { selectModel } from '../../ai/router/selectModel';
import type {
    AIProviderId,
    AnalysisPackaging,
    ModelInfo,
} from '../../ai/types';
import { estimateUncertaintyTokens, type TokenEstimateMethod } from '../../ai/tokens/inputTokenEstimate';
import type { InquiryScope } from '../state';
import { INQUIRY_REQUIRED_CAPABILITIES, type ResolvedInquiryEngine } from './inquiryModelResolver';

export const INQUIRY_ADVISORY_CONTEXT_VERSION = 1 as const;

export type InquiryAdvisoryReasonCode =
    | 'single_pass_preferred'
    | 'sources_preferred'
    | 'cost_reuse_preferred';

export interface InquiryAdvisoryContext {
    version: typeof INQUIRY_ADVISORY_CONTEXT_VERSION;
    createdAt: string;
    scope: InquiryScope;
    focusLabel: string;
    resolvedEngine: {
        provider: AIProviderId;
        providerLabel: string;
        modelId: string;
        modelAlias: string;
        modelLabel: string;
        contextWindow: number;
    };
    corpus: {
        estimatedInputTokens: number;
        expectedPassCount: number;
        corpusFingerprint: string;
        overrideSummary: {
            active: boolean;
            classCount: number;
            itemCount: number;
            total: number;
        };
    };
    recommendation: {
        provider: AIProviderId;
        providerLabel: string;
        modelId: string;
        modelAlias: string;
        modelLabel: string;
        reasonCode: InquiryAdvisoryReasonCode;
        message: string;
        currentEngineBehavior: string;
    };
}

export interface InquiryAdvisoryOverrideSummary {
    active: boolean;
    classCount: number;
    itemCount: number;
    total: number;
}

export interface ComputeInquiryAdvisoryInput {
    scope: InquiryScope;
    focusLabel: string;
    resolvedEngine: ResolvedInquiryEngine;
    currentModel: ModelInfo | null;
    models: ModelInfo[];
    analysisPackaging: AnalysisPackaging;
    estimatedInputTokens: number;
    currentSafeInputBudget?: number;
    estimationMethod?: TokenEstimateMethod;
    estimateUncertaintyTokens?: number;
    corpusFingerprint: string;
    overrideSummary: InquiryAdvisoryOverrideSummary;
    previousContext?: InquiryAdvisoryContext | null;
}

type AdvisoryCandidate = {
    provider: AIProviderId;
    providerLabel: string;
    modelId: string;
    modelAlias: string;
    modelLabel: string;
    contextWindow: number;
    expectedPassCount: number;
    safeInputBudget: number;
    sourcesStatus: 'available' | 'provider_supported_not_used' | 'unavailable';
    corpusReuseStatus: 'available' | 'provider_supported_not_used' | 'unavailable';
};

const PROVIDER_LABELS: Record<AIProviderId, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    google: 'Google',
    ollama: 'Ollama',
    none: 'Disabled'
};

const COST_REUSE_TOKEN_THRESHOLD = 120000;
const SINGLE_PASS_DELTA_RATIO = 0.08;
const SINGLE_PASS_DELTA_MIN_TOKENS = 4000;

function estimatePassCount(estimatedInputTokens: number, safeInputBudget: number): number {
    if (estimatedInputTokens <= 0) return 1;
    if (!Number.isFinite(safeInputBudget) || safeInputBudget <= 0) return 2;
    if (estimatedInputTokens <= safeInputBudget) return 1;
    return Math.max(2, Math.ceil(estimatedInputTokens / safeInputBudget));
}

function buildCandidate(
    model: ModelInfo,
    estimatedInputTokens: number,
    safeInputBudgetOverride?: number
): AdvisoryCandidate {
    const capabilities = resolveEngineCapabilities(model);
    const contextWindow = Math.max(0, capabilities.largeContext.contextWindow || model.contextWindow || 0);
    const safeInputBudget = Number.isFinite(safeInputBudgetOverride)
        ? Math.max(0, Math.floor(safeInputBudgetOverride as number))
        : Math.max(0, Math.floor(contextWindow * INPUT_TOKEN_GUARD_FACTOR));

    return {
        provider: model.provider,
        providerLabel: PROVIDER_LABELS[model.provider],
        modelId: model.id,
        modelAlias: model.alias,
        modelLabel: model.label,
        contextWindow: model.contextWindow,
        expectedPassCount: estimatePassCount(estimatedInputTokens, safeInputBudget),
        safeInputBudget,
        sourcesStatus: capabilities.sources.status,
        corpusReuseStatus: capabilities.corpusReuse.status
    };
}

function dedupeCandidates(candidates: AdvisoryCandidate[]): AdvisoryCandidate[] {
    const unique = new Map<string, AdvisoryCandidate>();
    candidates.forEach(candidate => {
        unique.set(`${candidate.provider}:${candidate.modelId}`, candidate);
    });
    return Array.from(unique.values());
}

function rankCandidates(candidates: AdvisoryCandidate[]): AdvisoryCandidate[] {
    return [...candidates].sort((left, right) => {
        if (left.expectedPassCount !== right.expectedPassCount) {
            return left.expectedPassCount - right.expectedPassCount;
        }
        if (left.safeInputBudget !== right.safeInputBudget) {
            return right.safeInputBudget - left.safeInputBudget;
        }
        if (left.contextWindow !== right.contextWindow) {
            return right.contextWindow - left.contextWindow;
        }
        return left.modelLabel.localeCompare(right.modelLabel);
    });
}

function buildIdentity(context: InquiryAdvisoryContext): string {
    return [
        context.scope,
        context.focusLabel,
        context.resolvedEngine.provider,
        context.resolvedEngine.modelId,
        context.corpus.estimatedInputTokens,
        context.corpus.expectedPassCount,
        context.corpus.corpusFingerprint,
        context.corpus.overrideSummary.total,
        context.recommendation.currentEngineBehavior,
        context.recommendation.reasonCode,
        context.recommendation.provider,
        context.recommendation.modelId
    ].join('|');
}

function buildCurrentBehaviorLabel(expectedPassCount: number, packaging: AnalysisPackaging): string {
    if (expectedPassCount <= 1) {
        return 'This run is expected to fit in one pass.';
    }
    const modeSuffix = packaging === 'automatic'
        ? ''
        : packaging === 'singlePassOnly'
            ? ' (single-pass only mode)'
            : ' (segmented mode)';
    return `This run is expected to require ${expectedPassCount} passes${modeSuffix}.`;
}

function buildProviderCandidates(
    input: ComputeInquiryAdvisoryInput
): AdvisoryCandidate[] {
    const providerCandidates: AdvisoryCandidate[] = [];
    const providers = Array.from(new Set(
        input.models
            .map(model => model.provider)
            .filter((provider): provider is Exclude<AIProviderId, 'none'> => provider !== 'none')
    ));

    providers.forEach(provider => {
        try {
            const selection = selectModel(input.models, {
                provider,
                policy: { type: 'latestStable' },
                requiredCapabilities: INQUIRY_REQUIRED_CAPABILITIES
            });
            providerCandidates.push(buildCandidate(selection.model, input.estimatedInputTokens));
        } catch {
            // Provider has no eligible Inquiry model for current capability floor.
        }
    });

    return providerCandidates;
}

function hasMaterialSinglePassDelta(input: ComputeInquiryAdvisoryInput, currentCandidate: AdvisoryCandidate): boolean {
    if (currentCandidate.safeInputBudget <= 0) return false;
    const overflowTokens = Math.max(0, input.estimatedInputTokens - currentCandidate.safeInputBudget);
    if (overflowTokens <= 0) return false;

    const uncertainty = Number.isFinite(input.estimateUncertaintyTokens)
        ? Math.max(0, Math.floor(input.estimateUncertaintyTokens as number))
        : estimateUncertaintyTokens(
            input.estimationMethod ?? 'heuristic_chars',
            currentCandidate.safeInputBudget
        );
    const ratioFloor = Math.floor(currentCandidate.safeInputBudget * SINGLE_PASS_DELTA_RATIO);
    const materialFloor = Math.max(SINGLE_PASS_DELTA_MIN_TOKENS, ratioFloor, uncertainty);
    return overflowTokens >= materialFloor;
}

export function computeInquiryAdvisoryContext(input: ComputeInquiryAdvisoryInput): InquiryAdvisoryContext | null {
    const currentModel = input.currentModel;
    if (!currentModel) return null;

    const currentCandidate = buildCandidate(
        currentModel,
        input.estimatedInputTokens,
        input.currentSafeInputBudget
    );
    const alternatives = dedupeCandidates(buildProviderCandidates(input));

    if (!alternatives.length) return null;

    const sortedAlternatives = rankCandidates(alternatives).filter(candidate =>
        candidate.provider !== currentCandidate.provider || candidate.modelId !== currentCandidate.modelId
    );

    if (!sortedAlternatives.length) return null;

    const currentPassCount = Math.max(1, currentCandidate.expectedPassCount);
    const currentBehavior = buildCurrentBehaviorLabel(currentPassCount, input.analysisPackaging);
    const singlePassDeltaIsMaterial = hasMaterialSinglePassDelta(input, currentCandidate);

    let reasonCode: InquiryAdvisoryReasonCode | null = null;
    let suggestion: AdvisoryCandidate | null = null;
    let message = '';

    const singlePassAlternatives = sortedAlternatives.filter(candidate =>
        currentPassCount > 1
        && candidate.expectedPassCount === 1
        && singlePassDeltaIsMaterial
    );
    if (singlePassAlternatives.length) {
        reasonCode = 'single_pass_preferred';
        suggestion = singlePassAlternatives[0];
        message = `${suggestion.providerLabel} may fit this corpus in one pass.`;
    }

    if (!reasonCode && currentCandidate.sourcesStatus !== 'available') {
        const sourceAlternatives = sortedAlternatives.filter(candidate => candidate.sourcesStatus === 'available');
        if (sourceAlternatives.length) {
            reasonCode = 'sources_preferred';
            suggestion = sourceAlternatives[0];
            message = `${sourceAlternatives[0].providerLabel} supports Sources for this analysis.`;
        }
    }

    if (!reasonCode
        && currentCandidate.corpusReuseStatus !== 'available'
        && input.estimatedInputTokens >= COST_REUSE_TOKEN_THRESHOLD) {
        const reuseAlternatives = sortedAlternatives.filter(candidate =>
            candidate.corpusReuseStatus === 'available'
            && candidate.expectedPassCount <= currentPassCount
            && currentPassCount > 1
        );
        if (reuseAlternatives.length) {
            reasonCode = 'cost_reuse_preferred';
            suggestion = reuseAlternatives[0];
            message = `${reuseAlternatives[0].providerLabel} supports corpus reuse for repeated analysis.`;
        }
    }

    if (!reasonCode || !suggestion) return null;

    const advisory: InquiryAdvisoryContext = {
        version: INQUIRY_ADVISORY_CONTEXT_VERSION,
        createdAt: new Date().toISOString(),
        scope: input.scope,
        focusLabel: input.focusLabel,
        resolvedEngine: {
            provider: input.resolvedEngine.provider,
            providerLabel: input.resolvedEngine.providerLabel,
            modelId: input.resolvedEngine.modelId,
            modelAlias: input.resolvedEngine.modelAlias,
            modelLabel: input.resolvedEngine.modelLabel,
            contextWindow: input.resolvedEngine.contextWindow,
        },
        corpus: {
            estimatedInputTokens: input.estimatedInputTokens,
            expectedPassCount: currentPassCount,
            corpusFingerprint: input.corpusFingerprint,
            overrideSummary: {
                active: input.overrideSummary.active,
                classCount: input.overrideSummary.classCount,
                itemCount: input.overrideSummary.itemCount,
                total: input.overrideSummary.total,
            },
        },
        recommendation: {
            provider: suggestion.provider,
            providerLabel: suggestion.providerLabel,
            modelId: suggestion.modelId,
            modelAlias: suggestion.modelAlias,
            modelLabel: suggestion.modelLabel,
            reasonCode,
            message,
            currentEngineBehavior: currentBehavior,
        },
    };

    if (input.previousContext && buildIdentity(input.previousContext) === buildIdentity(advisory)) {
        advisory.createdAt = input.previousContext.createdAt;
    }

    return advisory;
}
