import type { LocalLlmDiagnosticsReport } from './diagnostics';

export type LocalLlmCapabilityTier = 0 | 1 | 2 | 3 | 4;
export type LocalLlmFeatureSupport = 'yes' | 'partial' | 'no';

export interface LocalLlmCapabilityFeatureMap {
    summary: LocalLlmFeatureSupport;
    pulses: LocalLlmFeatureSupport;
    gossamer: LocalLlmFeatureSupport;
    inquiry: LocalLlmFeatureSupport;
}

export interface LocalLlmCapabilityAssessment {
    tier: LocalLlmCapabilityTier;
    tierName: string;
    tierSummary: string;
    confidence: 'validated' | 'heuristic';
    featureSupport: LocalLlmCapabilityFeatureMap;
    explanation: string;
}

export interface InferLocalLlmCapabilityInput {
    modelId: string;
    contextWindow?: number | null;
    maxOutput?: number | null;
    diagnostics?: LocalLlmDiagnosticsReport | null;
}

const TIER_LABELS: Record<LocalLlmCapabilityTier, { name: string; summary: string }> = {
    0: { name: 'Tier 0', summary: 'Not usable' },
    1: { name: 'Tier 1', summary: 'Basic' },
    2: { name: 'Tier 2', summary: 'Structured' },
    3: { name: 'Tier 3', summary: 'Strong' },
    4: { name: 'Tier 4', summary: 'Full' }
};

export const LOCAL_LLM_TIER_FEATURES: Record<LocalLlmCapabilityTier, LocalLlmCapabilityFeatureMap> = {
    0: { summary: 'no', pulses: 'no', gossamer: 'no', inquiry: 'no' },
    1: { summary: 'yes', pulses: 'no', gossamer: 'no', inquiry: 'no' },
    2: { summary: 'yes', pulses: 'yes', gossamer: 'partial', inquiry: 'no' },
    3: { summary: 'yes', pulses: 'yes', gossamer: 'yes', inquiry: 'partial' },
    4: { summary: 'yes', pulses: 'yes', gossamer: 'yes', inquiry: 'yes' }
};

function parseModelSizeHint(modelId: string): number | null {
    const match = modelId.toLowerCase().match(/(\d+(?:\.\d+)?)b\b/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function hasTimeoutSignal(diagnostics: LocalLlmDiagnosticsReport): boolean {
    const combined = [
        diagnostics.reachable.message,
        diagnostics.modelAvailable.message,
        diagnostics.basicCompletion.message,
        diagnostics.structuredJson.message
    ].join(' ').toLowerCase();
    return combined.includes('timeout') || combined.includes('timed out') || combined.includes('deadline exceeded');
}

function inferHeuristicTier(modelId: string, contextWindow?: number | null, maxOutput?: number | null): LocalLlmCapabilityTier {
    const sizeHint = parseModelSizeHint(modelId);
    const context = typeof contextWindow === 'number' ? contextWindow : 0;
    const output = typeof maxOutput === 'number' ? maxOutput : 0;
    const hasMediumContext = context >= 32_000 || output >= 4_000;
    const hasLargeContext = context >= 65_536 || output >= 6_000;

    if (sizeHint !== null) {
        if (sizeHint >= 20) return 4;
        if (sizeHint >= 12) return hasLargeContext ? 4 : 3;
        if (sizeHint >= 7) return hasMediumContext ? 3 : 2;
        if (sizeHint >= 3) return 1;
        return 0;
    }

    if (hasLargeContext) return 3;
    if (hasMediumContext) return 2;
    return 1;
}

function buildHeuristicExplanation(modelId: string, tier: LocalLlmCapabilityTier, contextWindow?: number | null, maxOutput?: number | null): string {
    const sizeHint = parseModelSizeHint(modelId);
    const context = typeof contextWindow === 'number' ? contextWindow : 0;
    const output = typeof maxOutput === 'number' ? maxOutput : 0;
    const hints: string[] = [];
    if (sizeHint !== null) hints.push(`${sizeHint}B name hint`);
    if (context > 0) hints.push(`${Math.round(context / 1024)}k context`);
    if (output > 0) hints.push(`${output} max output`);
    const hintText = hints.length ? hints.join(', ') : 'model name only';

    if (tier >= 4) return `Heuristic only. ${hintText} suggests this model may be Inquiry-eligible, but validate it after selecting it.`;
    if (tier === 3) return `Heuristic only. ${hintText} suggests this model is a reasonable Gossamer-class candidate.`;
    if (tier === 2) return `Heuristic only. ${hintText} suggests this model is better kept to lighter structured analysis.`;
    if (tier === 1) return `Heuristic only. ${hintText} suggests this model is safest for summary-oriented work.`;
    return 'Heuristic only. This model does not currently look reliable enough for RT features.';
}

function buildValidatedExplanation(
    tier: LocalLlmCapabilityTier,
    diagnostics: LocalLlmDiagnosticsReport,
    heuristicTier: LocalLlmCapabilityTier
): string {
    if (!diagnostics.reachable.ok) return `Backend check failed: ${diagnostics.reachable.message}`;
    if (!diagnostics.modelAvailable.ok) return diagnostics.modelAvailable.message;
    if (!diagnostics.basicCompletion.ok) return diagnostics.basicCompletion.message;
    if (!diagnostics.structuredJson.ok) {
        return `Basic completion worked, but structured JSON failed: ${diagnostics.structuredJson.message}`;
    }
    if (!diagnostics.repairPath.ok) {
        return `Structured JSON passed, but RT's repair path self-check failed: ${diagnostics.repairPath.message}`;
    }
    if (tier >= 4) {
        return `Structured JSON validated cleanly. Model hints${heuristicTier >= 4 ? '' : ' and runtime limits'} make Inquiry a reasonable candidate.`;
    }
    if (tier === 3) {
        return 'Structured JSON validated cleanly. Model hints make Gossamer realistic, but Inquiry should stay cautious.';
    }
    return 'Structured JSON validated cleanly. Keep this model on lighter structured analysis paths.';
}

export function inferLocalLlmCapability(input: InferLocalLlmCapabilityInput): LocalLlmCapabilityAssessment {
    const heuristicTier = inferHeuristicTier(input.modelId, input.contextWindow, input.maxOutput);
    let tier: LocalLlmCapabilityTier = heuristicTier;
    let confidence: 'validated' | 'heuristic' = 'heuristic';

    if (input.diagnostics) {
        confidence = 'validated';
        const diagnostics = input.diagnostics;
        if (!diagnostics.reachable.ok || !diagnostics.modelAvailable.ok) {
            tier = 0;
        } else if (!diagnostics.basicCompletion.ok) {
            tier = hasTimeoutSignal(diagnostics) ? 0 : 1;
        } else if (!diagnostics.structuredJson.ok) {
            tier = 1;
        } else {
            tier = Math.max(2, heuristicTier) as LocalLlmCapabilityTier;
            if (!diagnostics.repairPath.ok || hasTimeoutSignal(diagnostics)) {
                tier = Math.min(tier, 2) as LocalLlmCapabilityTier;
            }
        }
    }

    const labels = TIER_LABELS[tier];
    return {
        tier,
        tierName: labels.name,
        tierSummary: labels.summary,
        confidence,
        featureSupport: LOCAL_LLM_TIER_FEATURES[tier],
        explanation: input.diagnostics
            ? buildValidatedExplanation(tier, input.diagnostics, heuristicTier)
            : buildHeuristicExplanation(input.modelId, tier, input.contextWindow, input.maxOutput)
    };
}
