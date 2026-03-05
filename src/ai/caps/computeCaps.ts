import { PROVIDER_CAPS } from './providerCaps';
import type { AccessTier, AIProviderId, AIOverrides, ModelInfo } from '../types';

export interface RetryPolicy {
    maxAttempts: number;
    baseDelayMs: number;
    retryMalformedJson: boolean;
}

export interface ComputedCaps {
    maxInputTokens: number;
    maxOutputTokens: number;
    safeChunkThreshold: number;
    temperature: number;
    retryPolicy: RetryPolicy;
    requestPerMinute: number;
    thinkingBudgetTokens?: number;
    citationsEnabled?: boolean;
}

export interface ComputeCapsInput {
    provider: AIProviderId;
    model: ModelInfo;
    accessTier?: AccessTier;
    feature: string;
    overrides?: Partial<AIOverrides>;
}

function resolveModeMultiplier(mode?: 'auto' | 'high' | 'max'): number {
    if (mode === 'max') return 1;
    if (mode === 'high') return 0.9;
    return 0.75;
}

function resolveFeatureMultiplier(feature: string): number {
    const normalized = feature.toLowerCase();
    if (normalized.includes('inquiry')) return 1;
    if (normalized.includes('gossamer')) return 0.85;
    if (normalized.includes('apr')) return 0.5;
    if (normalized.includes('runtime')) return 0.4;
    return 0.7;
}

/** Extended thinking budget resolver.
 *  First ship: Anthropic + Inquiry + deep only. Returns undefined when disabled. */
function resolveThinkingBudget(
    provider: AIProviderId,
    feature: string,
    reasoningDepth?: 'standard' | 'deep'
): number | undefined {
    if (provider !== 'anthropic') return undefined;
    if (reasoningDepth !== 'deep') return undefined;
    if (!feature.toLowerCase().includes('inquiry')) return undefined;
    return 4096;
}

/** Citations resolver.
 *  First ship: Anthropic + Inquiry only.
 *  Note: citations are API-incompatible with Anthropic structured outputs
 *  (output_config.format). Today Inquiry uses text prompting with JSON instructions,
 *  so this is safe. If structured JSON output is ever added for Anthropic, this
 *  resolver must also gate on that. */
function resolveCitationsEnabled(
    provider: AIProviderId,
    feature: string
): boolean {
    if (provider !== 'anthropic') return false;
    if (!feature.toLowerCase().includes('inquiry')) return false;
    return true;
}

function resolveDefaultTemperature(feature: string, reasoningDepth?: 'standard' | 'deep'): number {
    const normalized = feature.toLowerCase();
    if (normalized.includes('inquiry')) {
        return reasoningDepth === 'deep' ? 0.15 : 0.2;
    }
    if (normalized.includes('gossamer')) {
        return 0.45;
    }
    return 0.25;
}

export function computeCaps(input: ComputeCapsInput): ComputedCaps {
    if (input.provider === 'none') {
        return {
            maxInputTokens: 0,
            maxOutputTokens: 0,
            safeChunkThreshold: 0,
            temperature: 0,
            retryPolicy: { maxAttempts: 0, baseDelayMs: 0, retryMalformedJson: false },
            requestPerMinute: 0
        };
    }

    const providerCaps = PROVIDER_CAPS[input.provider];
    const tier = input.accessTier ?? 1;
    const tierCaps = providerCaps.tiers[tier];
    const modeMultiplier = resolveModeMultiplier(input.overrides?.maxOutputMode);
    const featureMultiplier = resolveFeatureMultiplier(input.feature);
    const modelMaxOutput = Math.max(1, input.model.maxOutput || providerCaps.providerMaxOutputTokens);

    const baseOutput = Math.min(
        providerCaps.providerMaxOutputTokens,
        tierCaps.maxOutputTokens,
        modelMaxOutput
    );

    const targetOutput = Math.max(
        512,
        Math.floor(baseOutput * modeMultiplier * featureMultiplier)
    );

    const maxOutputTokens = Math.min(baseOutput, targetOutput);
    const safeChunkThreshold = tierCaps.safeUtilization;
    const maxInputTokens = Math.max(1024, Math.floor((input.model.contextWindow || providerCaps.defaultInputTokens) * safeChunkThreshold));

    const retryPolicy: RetryPolicy = {
        maxAttempts: tierCaps.retryAttempts,
        baseDelayMs: input.provider === 'ollama' ? 600 : 400,
        retryMalformedJson: true
    };

    const thinkingBudgetTokens = resolveThinkingBudget(
        input.provider, input.feature, input.overrides?.reasoningDepth
    );

    // When extended thinking is enabled, Anthropic requires temperature=1.
    const temperature = thinkingBudgetTokens
        ? 1
        : (typeof input.overrides?.temperature === 'number'
            ? input.overrides.temperature
            : resolveDefaultTemperature(input.feature, input.overrides?.reasoningDepth));

    const citationsEnabled = resolveCitationsEnabled(input.provider, input.feature) || undefined;

    return {
        maxInputTokens,
        maxOutputTokens,
        safeChunkThreshold,
        temperature,
        retryPolicy,
        requestPerMinute: tierCaps.requestPerMinute,
        thinkingBudgetTokens,
        citationsEnabled
    };
}
