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

function inferLine(model: ModelInfo): string {
    if (model.line) return model.line;
    return `${model.provider}:${model.alias}`;
}

/**
 * Within a line, pick the newest stable model.
 * Prefers: releasedAt (descending) > alias (descending, higher version sorts later).
 */
function selectNewestInLine(models: ModelInfo[]): ModelInfo {
    const stable = models.filter(m => m.status === 'stable');
    const pool = stable.length ? stable : models;
    return pool.sort((a, b) => {
        if (a.releasedAt && b.releasedAt) {
            const dateDelta = b.releasedAt.localeCompare(a.releasedAt);
            if (dateDelta !== 0) return dateDelta;
        } else if (a.releasedAt) {
            return -1;
        } else if (b.releasedAt) {
            return 1;
        }
        return b.alias.localeCompare(a.alias);
    })[0];
}

/**
 * Two-phase profile selection:
 *  1) Score all eligible models to pick the best LINE (product family).
 *  2) Within that line, always choose the newest stable model.
 */
function selectByProfile(
    eligible: ModelInfo[],
    profile: NonNullable<typeof MODEL_PROFILES[keyof typeof MODEL_PROFILES]>,
    fallback: ModelInfo
): { model: ModelInfo; warnings: string[] } {
    const warnings: string[] = [];
    const profiled = eligible.filter(m => enforceProfileFloor(m, profile));
    const pool = profiled.length ? profiled : eligible;
    if (!profiled.length) {
        warnings.push(`No model met strict profile floor for this profile; best eligible match used.`);
    }

    const bestByScore = pool.slice().sort((a, b) => {
        const scoreDelta = scoreByProfile(b, profile) - scoreByProfile(a, profile);
        if (scoreDelta !== 0) return scoreDelta;
        return a.alias.localeCompare(b.alias);
    })[0];

    const winningLine = inferLine(bestByScore ?? fallback);
    const lineMembers = eligible.filter(m => inferLine(m) === winningLine && m.status === 'stable');

    if (lineMembers.length <= 1) {
        return { model: bestByScore ?? fallback, warnings };
    }

    const newest = selectNewestInLine(lineMembers);
    return { model: newest, warnings };
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
        const result = selectByProfile(eligible, profile, fallback);
        warnings.push(...result.warnings);
        return {
            provider: request.provider,
            model: result.model,
            warnings,
            reason: `Auto: best line ${inferLine(result.model)}, newest stable selected (${result.model.alias}).`
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
