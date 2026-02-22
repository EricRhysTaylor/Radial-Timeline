import { selectModel } from '../router/selectModel';
import type { AccessTier, AIProviderId, AiSettingsV1, Capability, ModelInfo, ModelPolicy } from '../types';
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

function resolveIntent(
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
            contextTokensNeeded: 4000,
            outputTokensNeeded: 800
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

    const intents: RecommendationIntent[] = [
        {
            id: 'inquiry',
            title: 'Recommended for Inquiry',
            provider: selectedProvider,
            policy: { type: 'profile', profile: 'deepReasoner' },
            requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap']
        },
        {
            id: 'gossamer',
            title: 'Recommended for Gossamer',
            provider: selectedProvider,
            policy: { type: 'profile', profile: 'deepWriter' },
            requiredCapabilities: ['longContext', 'jsonStrict']
        },
        {
            id: 'quick',
            title: 'Recommended for Quick tasks',
            provider: selectedProvider,
            policy: { type: 'latestStable' },
            requiredCapabilities: ['jsonStrict']
        }
    ];

    intents.forEach(intent => {
        rows.push(resolveIntent(input.models, input.aiSettings, intent));
    });

    if (input.includeLocalPrivate) {
        const localIntent: RecommendationIntent = {
            id: 'local',
            title: 'Recommended for Local/Private',
            provider: 'ollama',
            policy: { type: 'latestStable' },
            requiredCapabilities: ['jsonStrict']
        };
        const localRow = resolveIntent(input.models, input.aiSettings, localIntent);
        if (localRow.model) {
            rows.push(localRow);
        }
    }

    return rows;
}
