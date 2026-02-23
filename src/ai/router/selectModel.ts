import type { Capability, ModelInfo, ModelSelectionRequest, ModelSelectionResult } from '../types';

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

function inferLine(model: ModelInfo): string {
    if (model.line) return model.line;
    return `${model.provider}:${model.alias}`;
}

function releasedAtRank(model: ModelInfo): number {
    if (!model.releasedAt) return Number.NEGATIVE_INFINITY;
    const parsed = Date.parse(model.releasedAt);
    return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function compareNewest(a: ModelInfo, b: ModelInfo): number {
    const releasedAtDelta = releasedAtRank(b) - releasedAtRank(a);
    if (releasedAtDelta !== 0) return releasedAtDelta;
    return b.alias.localeCompare(a.alias);
}

function selectLatestStable(eligible: ModelInfo[]): ModelInfo {
    const stable = eligible.filter(model => model.status === 'stable');
    const pool = stable.length ? stable : eligible;
    const newestPerLine = new Map<string, ModelInfo>();
    for (const model of pool) {
        const line = inferLine(model);
        const current = newestPerLine.get(line);
        if (!current || compareNewest(model, current) < 0) {
            newestPerLine.set(line, model);
        }
    }
    return Array.from(newestPerLine.values()).sort(compareNewest)[0];
}

export function selectModel(models: ModelInfo[], request: ModelSelectionRequest): ModelSelectionResult {
    const warnings: string[] = [];
    const eligible = filterEligible(models, request);

    if (!eligible.length) {
        throw new Error(`No model satisfies capability floor for provider ${request.provider}.`);
    }

    const fallback = selectLatestStable(eligible);

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
            reason: `Pinned alias unavailable; using latest stable model: ${fallback.label}.`
        };
    }

    const selected = selectLatestStable(eligible);
    return {
        provider: request.provider,
        model: selected,
        warnings,
        reason: `Auto selected latest stable model in line ${inferLine(selected)}: ${selected.alias}.`
    };
}
