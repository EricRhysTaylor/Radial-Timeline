import { selectModel } from '../router/selectModel';
import type { AccessTier, AIProviderId, AiSettingsV1, Capability, ModelInfo, ModelPolicy, ModelTier } from '../types';
import type { AvailabilityStatus, MergedModelInfo } from './mergeModels';
import { formatRecommendationWhy } from './recommendationWhy';

export interface RecommendationRow {
    id: 'inquiry' | 'gossamer' | 'quick' | 'local';
    title: string;
    provider: AIProviderId;
    model: MergedModelInfo | null;
    reason: string;
    shortReason: string;
    availabilityStatus: AvailabilityStatus;
}

interface RecommendationIntent {
    id: RecommendationRow['id'];
    title: string;
    provider: AIProviderId;
    policy: ModelPolicy;
    requiredCapabilities: Capability[];
    strategy?: 'router' | 'tier_weighted';
    preferredTiers?: ModelTier[];
    contextTokensNeeded?: number;
    outputTokensNeeded?: number;
}

function toShortReason(reason: string, maxWords = 14): string {
    const words = reason.trim().split(/\s+/).filter(Boolean);
    if (words.length <= maxWords) return reason.trim();
    return `${words.slice(0, maxWords).join(' ')}...`;
}

function getTier(aiSettings: AiSettingsV1, provider: AIProviderId): AccessTier {
    if (provider === 'anthropic') return aiSettings.aiAccessProfile.anthropicTier ?? 1;
    if (provider === 'openai') return aiSettings.aiAccessProfile.openaiTier ?? 1;
    if (provider === 'google') return aiSettings.aiAccessProfile.googleTier ?? 1;
    return 1;
}

function findMergedModel(models: MergedModelInfo[], selected: ModelInfo): MergedModelInfo | null {
    return models.find(model => model.provider === selected.provider && model.alias === selected.alias) ?? null;
}

function hasCapabilities(model: ModelInfo, required: Capability[]): boolean {
    return required.every(capability => model.capabilities.includes(capability));
}

function availabilityRank(status: AvailabilityStatus): number {
    if (status === 'visible') return 0;
    if (status === 'unknown') return 1;
    return 2;
}

function statusRank(status: MergedModelInfo['status']): number {
    if (status === 'stable') return 0;
    if (status === 'legacy') return 1;
    return 2;
}

function scoreForIntent(model: MergedModelInfo, intentId: RecommendationIntent['id']): number {
    if (intentId === 'quick') {
        return model.personality.determinism * 4 + model.personality.reasoning * 2 + model.personality.writing;
    }
    if (intentId === 'gossamer') {
        return model.personality.writing * 4 + model.personality.determinism * 3 + model.personality.reasoning * 2;
    }
    return model.personality.reasoning * 4 + model.personality.writing * 2 + model.personality.determinism;
}

function getTierIndex(model: MergedModelInfo, preferredTiers: ModelTier[] | undefined): number {
    if (!preferredTiers?.length) return 999;
    const idx = preferredTiers.indexOf(model.tier);
    return idx === -1 ? preferredTiers.length + 10 : idx;
}

function buildEligibleModels(models: MergedModelInfo[], intent: RecommendationIntent): MergedModelInfo[] {
    const contextTokensNeeded = intent.contextTokensNeeded ?? 4000;
    const outputTokensNeeded = intent.outputTokensNeeded ?? 800;
    return models
        .filter(model => model.provider === intent.provider)
        .filter(model => model.status !== 'deprecated')
        .filter(model => hasCapabilities(model, intent.requiredCapabilities))
        .filter(model => contextTokensNeeded <= model.contextWindow)
        .filter(model => outputTokensNeeded <= model.maxOutput);
}

function resolveIntentWithRouter(
    models: MergedModelInfo[],
    aiSettings: AiSettingsV1,
    intent: RecommendationIntent
): RecommendationRow {
    try {
        const selected = selectModel(models, {
            provider: intent.provider,
            policy: intent.policy,
            requiredCapabilities: intent.requiredCapabilities,
            accessTier: getTier(aiSettings, intent.provider),
            contextTokensNeeded: intent.contextTokensNeeded ?? 4000,
            outputTokensNeeded: intent.outputTokensNeeded ?? 800
        });
        const model = findMergedModel(models, selected.model);
        const availabilityStatus = model?.availabilityStatus ?? 'unknown';
        const why = formatRecommendationWhy({
            intentId: intent.id,
            model,
            routerReason: selected.reason
        });
        return {
            id: intent.id,
            title: intent.title,
            provider: intent.provider,
            model,
            reason: selected.reason,
            shortReason: toShortReason(why),
            availabilityStatus
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            id: intent.id,
            title: intent.title,
            provider: intent.provider,
            model: null,
            reason: `No eligible model. ${message}`,
            shortReason: formatRecommendationWhy({ intentId: intent.id, model: null }),
            availabilityStatus: 'unknown'
        };
    }
}

function resolveIntentTierWeighted(
    models: MergedModelInfo[],
    aiSettings: AiSettingsV1,
    intent: RecommendationIntent,
    usedAliases: Set<string>
): RecommendationRow {
    const eligible = buildEligibleModels(models, intent);
    if (!eligible.length) {
        return resolveIntentWithRouter(models, aiSettings, intent);
    }

    const ranked = eligible.slice().sort((a, b) => {
        const availabilityDelta = availabilityRank(a.availabilityStatus) - availabilityRank(b.availabilityStatus);
        if (availabilityDelta !== 0) return availabilityDelta;

        const statusDelta = statusRank(a.status) - statusRank(b.status);
        if (statusDelta !== 0) return statusDelta;

        const tierDelta = getTierIndex(a, intent.preferredTiers) - getTierIndex(b, intent.preferredTiers);
        if (tierDelta !== 0) return tierDelta;

        const scoreDelta = scoreForIntent(b, intent.id) - scoreForIntent(a, intent.id);
        if (scoreDelta !== 0) return scoreDelta;

        return a.alias.localeCompare(b.alias);
    });

    const distinctCandidate = ranked.find(model => !usedAliases.has(model.alias));
    const selectedModel = distinctCandidate ?? ranked[0];
    const availabilityStatus = selectedModel.availabilityStatus ?? 'unknown';
    const reason = distinctCandidate
        ? `Tier-weighted intent selection (${intent.id}) chose ${selectedModel.alias} from preferred tiers.`
        : `Tier-weighted intent selection (${intent.id}) reused ${selectedModel.alias}; no distinct eligible alternative found.`;
    const why = formatRecommendationWhy({
        intentId: intent.id,
        model: selectedModel,
        routerReason: reason
    });

    return {
        id: intent.id,
        title: intent.title,
        provider: intent.provider,
        model: selectedModel,
        reason,
        shortReason: toShortReason(why),
        availabilityStatus
    };
}

function resolveIntent(
    models: MergedModelInfo[],
    aiSettings: AiSettingsV1,
    intent: RecommendationIntent,
    usedAliases: Set<string>
): RecommendationRow {
    if (intent.strategy === 'tier_weighted') {
        return resolveIntentTierWeighted(models, aiSettings, intent, usedAliases);
    }
    return resolveIntentWithRouter(models, aiSettings, intent);
}

export function getAvailabilityIconName(status: AvailabilityStatus): string {
    if (status === 'visible') return 'check-circle-2';
    if (status === 'not_visible') return 'alert-triangle';
    return 'help-circle';
}

export interface CurrentResolvedModelRef {
    provider: AIProviderId;
    alias?: string;
    modelId?: string;
    availabilityStatus?: AvailabilityStatus;
}

export function getRecommendationComparisonTag(
    row: RecommendationRow,
    current: CurrentResolvedModelRef | null
): 'Using this now' | 'Different from current' | null {
    if (!row.model || !current) return null;
    if (current.availabilityStatus && current.availabilityStatus !== 'visible') return null;

    const aliasMatch = Boolean(current.alias && row.model.alias && current.alias === row.model.alias);
    const keyMatch = row.model.provider === current.provider
        && Boolean(current.modelId && row.model.providerModelId === current.modelId);

    if (aliasMatch || keyMatch) return 'Using this now';
    return 'Different from current';
}

export function computeRecommendedPicks(input: {
    models: MergedModelInfo[];
    aiSettings: AiSettingsV1;
    includeLocalPrivate: boolean;
}): RecommendationRow[] {
    const selectedProvider = input.aiSettings.provider === 'none' ? 'openai' : input.aiSettings.provider;
    const rows: RecommendationRow[] = [];
    const usedAliases = new Set<string>();

    const intents: RecommendationIntent[] = [
        {
            id: 'inquiry',
            title: 'Recommended for Inquiry',
            provider: selectedProvider,
            policy: { type: 'profile', profile: 'deepReasoner' },
            requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'],
            strategy: 'router',
            contextTokensNeeded: 24000,
            outputTokensNeeded: 2000
        },
        {
            id: 'gossamer',
            title: 'Recommended for Gossamer',
            provider: selectedProvider,
            policy: { type: 'profile', profile: 'deepWriter' },
            requiredCapabilities: ['longContext', 'jsonStrict'],
            strategy: 'tier_weighted',
            preferredTiers: ['BALANCED', 'DEEP', 'FAST', 'LOCAL'],
            contextTokensNeeded: 4000,
            outputTokensNeeded: 1000
        },
        {
            id: 'quick',
            title: 'Recommended for Quick tasks',
            provider: selectedProvider,
            policy: { type: 'latestStable' },
            requiredCapabilities: ['jsonStrict'],
            strategy: 'tier_weighted',
            preferredTiers: ['FAST', 'BALANCED', 'DEEP', 'LOCAL'],
            contextTokensNeeded: 2000,
            outputTokensNeeded: 600
        }
    ];

    intents.forEach(intent => {
        const row = resolveIntent(input.models, input.aiSettings, intent, usedAliases);
        rows.push(row);
        if (row.model?.alias) {
            usedAliases.add(row.model.alias);
        }
    });

    if (input.includeLocalPrivate) {
        const localIntent: RecommendationIntent = {
            id: 'local',
            title: 'Recommended for Local/Private',
            provider: 'ollama',
            policy: { type: 'latestStable' },
            requiredCapabilities: ['jsonStrict'],
            strategy: 'router'
        };
        const localRow = resolveIntent(input.models, input.aiSettings, localIntent, usedAliases);
        if (localRow.model) {
            rows.push(localRow);
        }
    }

    return rows;
}
