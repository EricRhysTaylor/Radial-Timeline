import type RadialTimelinePlugin from '../../main';
import { getCredential } from '../credentials/credentials';
import type { AIProviderId, EvidenceDocument, InputTokenEstimateMethod } from '../types';
import { callAnthropicTokenCount } from '../../api/anthropicApi';

export const DEFAULT_CHARS_PER_TOKEN = 4;

export type TokenEstimateMethod = InputTokenEstimateMethod;

export interface InputTokenEstimate {
    inputTokens: number;
    method: TokenEstimateMethod;
    uncertaintyTokens: number;
    error?: string;
}

export interface EstimateInputTokensRequest {
    plugin?: RadialTimelinePlugin;
    provider?: AIProviderId | 'gemini' | 'local';
    modelId?: string;
    systemPrompt?: string | null;
    userPrompt: string;
    evidenceDocuments?: EvidenceDocument[];
    citationsEnabled?: boolean;
    safeInputBudget?: number;
    charsPerToken?: number;
}

const HEURISTIC_UNCERTAINTY_RATIO = 0.04;
const HEURISTIC_UNCERTAINTY_MIN = 3000;
const ANTHROPIC_UNCERTAINTY_RATIO = 0.005;
const ANTHROPIC_UNCERTAINTY_MIN = 256;

function normalizeProvider(provider: EstimateInputTokensRequest['provider']): AIProviderId | 'none' {
    if (provider === 'gemini') return 'google';
    if (provider === 'local') return 'ollama';
    if (provider === 'anthropic' || provider === 'openai' || provider === 'google' || provider === 'ollama') {
        return provider;
    }
    return 'none';
}

export function estimateTokensFromChars(chars: number, charsPerToken = DEFAULT_CHARS_PER_TOKEN): number {
    if (!Number.isFinite(chars) || chars <= 0) return 0;
    const safeCharsPerToken = Number.isFinite(charsPerToken) && charsPerToken > 0
        ? charsPerToken
        : DEFAULT_CHARS_PER_TOKEN;
    return Math.max(1, Math.ceil(chars / safeCharsPerToken));
}

export function estimateTokensFromText(text: string, charsPerToken = DEFAULT_CHARS_PER_TOKEN): number {
    return estimateTokensFromChars(text.length, charsPerToken);
}

export function estimateUncertaintyTokens(method: TokenEstimateMethod, safeInputBudget?: number): number {
    const budget = Number.isFinite(safeInputBudget) ? Math.max(0, Math.floor(safeInputBudget as number)) : 0;
    if (method === 'anthropic_count') {
        return Math.max(ANTHROPIC_UNCERTAINTY_MIN, Math.floor(budget * ANTHROPIC_UNCERTAINTY_RATIO));
    }
    return Math.max(HEURISTIC_UNCERTAINTY_MIN, Math.floor(budget * HEURISTIC_UNCERTAINTY_RATIO));
}

export async function estimateInputTokens(request: EstimateInputTokensRequest): Promise<InputTokenEstimate> {
    const combinedPrompt = `${request.systemPrompt || ''}${request.userPrompt || ''}`;
    const evidenceChars = (request.evidenceDocuments || []).reduce((sum, doc) => (
        sum + (doc.title?.length ?? 0) + 4 + (doc.content?.length ?? 0)
    ), 0);
    const fallbackTokens = estimateTokensFromChars(
        combinedPrompt.length + evidenceChars,
        request.charsPerToken
    );
    const fallback = (error?: string): InputTokenEstimate => ({
        inputTokens: fallbackTokens,
        method: 'heuristic_chars',
        uncertaintyTokens: estimateUncertaintyTokens('heuristic_chars', request.safeInputBudget),
        ...(error ? { error } : {})
    });

    const provider = normalizeProvider(request.provider);
    if (provider !== 'anthropic' || !request.plugin || !request.modelId) {
        return fallback();
    }

    try {
        const apiKey = await getCredential(request.plugin, 'anthropic');
        if (!apiKey) {
            return fallback('Anthropic API key unavailable for token counting.');
        }

        const counted = await callAnthropicTokenCount(
            apiKey,
            request.modelId,
            request.systemPrompt ?? null,
            request.userPrompt,
            request.citationsEnabled,
            request.evidenceDocuments
        );

        if (!counted.success || typeof counted.inputTokens !== 'number' || !Number.isFinite(counted.inputTokens)) {
            return fallback(counted.error || 'Anthropic token counting failed.');
        }

        const inputTokens = Math.max(0, Math.floor(counted.inputTokens));
        return {
            inputTokens,
            method: 'anthropic_count',
            uncertaintyTokens: estimateUncertaintyTokens('anthropic_count', request.safeInputBudget)
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return fallback(message);
    }
}
