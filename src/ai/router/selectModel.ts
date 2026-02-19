import { MODEL_PROFILES } from '../registry/builtinModels';
import type { Capability, ModelInfo, ModelSelectionRequest, ModelSelectionResult, ModelTier } from '../types';

const TIER_RANK: Record<ModelTier, number> = {
    DEEP: 4,
    BALANCED: 3,
    FAST: 2,
    LOCAL: 1
};

function hasCapabilities(model: ModelInfo, required: Capability[]): boolean {
    return required.every(cap => model.capabilities.includes(cap));
}

function filterEligible(models: ModelInfo[], request: ModelSelectionRequest): ModelInfo[] {
    return models
        .filter(model => model.provider === request.provider)
        .filter(model => model.status !== 'deprecated')
        .filter(model => hasCapabilities(model, request.requiredCapabilities))
        .filter(model => (request.contextTokensNeeded ?? 0) <= model.contextWindow)
        .filter(model => (request.outputTokensNeeded ?? 0) <= model.maxOutput);
}

function selectHighestStable(eligible: ModelInfo[]): ModelInfo | undefined {
    return eligible
        .filter(model => model.status === 'stable')
        .sort((a, b) => {
            const tierDelta = TIER_RANK[b.tier] - TIER_RANK[a.tier];
            if (tierDelta !== 0) return tierDelta;
            const reasoningDelta = b.personality.reasoning - a.personality.reasoning;
            if (reasoningDelta !== 0) return reasoningDelta;
            return a.alias.localeCompare(b.alias);
        })[0];
}

function scoreByProfile(model: ModelInfo, profile: NonNullable<typeof MODEL_PROFILES[keyof typeof MODEL_PROFILES]>): number {
    const weights = profile.weighting || { reasoning: 0.34, writing: 0.33, determinism: 0.33 };
    return (
        model.personality.reasoning * weights.reasoning
        + model.personality.writing * weights.writing
        + model.personality.determinism * weights.determinism
    );
}

function enforceProfileFloor(model: ModelInfo, profile: NonNullable<typeof MODEL_PROFILES[keyof typeof MODEL_PROFILES]>): boolean {
    if (profile.tier && model.tier !== profile.tier && TIER_RANK[model.tier] < TIER_RANK[profile.tier]) return false;
    if (typeof profile.minReasoning === 'number' && model.personality.reasoning < profile.minReasoning) return false;
    if (typeof profile.minWriting === 'number' && model.personality.writing < profile.minWriting) return false;
    if (typeof profile.minDeterminism === 'number' && model.personality.determinism < profile.minDeterminism) return false;
    if (profile.requiredCapabilities && !hasCapabilities(model, profile.requiredCapabilities)) return false;
    return true;
}

function selectLatestFast(eligible: ModelInfo[]): ModelInfo | undefined {
    return eligible
        .filter(model => model.status === 'stable')
        .sort((a, b) => {
            const fastA = a.tier === 'FAST' ? 1 : 0;
            const fastB = b.tier === 'FAST' ? 1 : 0;
            if (fastB !== fastA) return fastB - fastA;
            const detDelta = b.personality.determinism - a.personality.determinism;
            if (detDelta !== 0) return detDelta;
            return a.alias.localeCompare(b.alias);
        })[0];
}

function selectLatestCheap(eligible: ModelInfo[]): ModelInfo | undefined {
    return eligible
        .filter(model => model.status === 'stable')
        .sort((a, b) => {
            const cheapA = (a.tier === 'LOCAL' || a.tier === 'FAST') ? 1 : 0;
            const cheapB = (b.tier === 'LOCAL' || b.tier === 'FAST') ? 1 : 0;
            if (cheapB !== cheapA) return cheapB - cheapA;
            const tierDelta = TIER_RANK[a.tier] - TIER_RANK[b.tier];
            if (tierDelta !== 0) return tierDelta;
            return a.alias.localeCompare(b.alias);
        })[0];
}

export function selectModel(models: ModelInfo[], request: ModelSelectionRequest): ModelSelectionResult {
    const warnings: string[] = [];
    const eligible = filterEligible(models, request);

    if (!eligible.length) {
        throw new Error(`No model satisfies capability floor for provider ${request.provider}.`);
    }

    const fallback = selectHighestStable(eligible) ?? eligible[0];

    if (request.policy.type === 'pinned') {
        const pinnedAlias = request.policy.pinnedAlias;
        if (pinnedAlias) {
            const pinned = eligible.find(model => model.alias === pinnedAlias);
            if (pinned) {
                return {
                    provider: request.provider,
                    model: pinned,
                    warnings,
                    reason: `Pinned alias selected: ${pinned.alias}.`
                };
            }
            warnings.push(`Pinned alias "${pinnedAlias}" unavailable; fallback to ${fallback.label}.`);
        } else {
            warnings.push('Pinned policy had no alias; fallback to stable selection.');
        }
        return {
            provider: request.provider,
            model: fallback,
            warnings,
            reason: `Capability floor matched; fallback stable model selected: ${fallback.label}.`
        };
    }

    if (request.policy.type === 'profile') {
        const profile = MODEL_PROFILES[request.policy.profile];
        const profiled = eligible.filter(model => enforceProfileFloor(model, profile));
        const ranked = (profiled.length ? profiled : eligible)
            .slice()
            .sort((a, b) => {
                const scoreDelta = scoreByProfile(b, profile) - scoreByProfile(a, profile);
                if (scoreDelta !== 0) return scoreDelta;
                return a.alias.localeCompare(b.alias);
            });
        const selected = ranked[0] ?? fallback;
        if (!profiled.length) {
            warnings.push(`No model met strict profile floor for ${request.policy.profile}; best eligible match used.`);
        }
        return {
            provider: request.provider,
            model: selected,
            warnings,
            reason: `Selected via profile ${request.policy.profile} with deterministic weighted ranking.`
        };
    }

    if (request.policy.type === 'latestFast') {
        const selected = selectLatestFast(eligible) ?? fallback;
        return {
            provider: request.provider,
            model: selected,
            warnings,
            reason: 'Selected via latestFast policy after capability floor filtering.'
        };
    }

    if (request.policy.type === 'latestCheap') {
        const selected = selectLatestCheap(eligible) ?? fallback;
        return {
            provider: request.provider,
            model: selected,
            warnings,
            reason: 'Selected via latestCheap policy after capability floor filtering.'
        };
    }

    const selected = selectHighestStable(eligible) ?? fallback;
    return {
        provider: request.provider,
        model: selected,
        warnings,
        reason: 'Selected via latestStable policy after capability floor filtering.'
    };
}
