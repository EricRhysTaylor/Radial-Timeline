import type RadialTimelinePlugin from '../../main';
import { getCredential } from '../credentials/credentials';
import type {
    AIProviderId,
    EvidenceDocument,
    InputTokenEstimateMethod,
    TokenCountResult,
    TokenCountSource
} from '../types';
import { countAnthropicTokens } from '../../api/anthropicApi';
import { countGeminiTokens } from '../../api/geminiApi';

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
    provider?: AIProviderId;
    modelId?: string;
    systemPrompt?: string | null;
    userPrompt: string;
    evidenceDocuments?: EvidenceDocument[];
    citationsEnabled?: boolean;
    jsonSchema?: Record<string, unknown>;
    safeInputBudget?: number;
    charsPerToken?: number;
}

const HEURISTIC_UNCERTAINTY_RATIO = 0.04;
const HEURISTIC_UNCERTAINTY_MIN = 3000;
// Provider-counted estimates are exact for the prompt envelope, but we keep
// a small uncertainty band to account for any per-request envelope additions
// (cache markers, structured-output tools) the count call doesn't include.
const PROVIDER_COUNT_UNCERTAINTY_RATIO = 0.005;
const PROVIDER_COUNT_UNCERTAINTY_MIN = 256;

function normalizeProvider(provider: EstimateInputTokensRequest['provider']): AIProviderId | 'none' {
    if (provider === 'anthropic' || provider === 'openai' || provider === 'google' || provider === 'ollama') {
        return provider;
    }
    return 'none';
}

export function tokenEstimateSourceFromMethod(method: TokenEstimateMethod): TokenCountSource {
    return method === 'anthropic_count' || method === 'google_count'
        ? 'provider_count'
        : 'estimate';
}

export function describeTokenEstimateMethod(method: TokenEstimateMethod): string {
    if (method === 'anthropic_count') return 'Anthropic provider count';
    if (method === 'google_count') return 'Gemini provider count';
    return 'Heuristic estimate';
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
    if (method === 'anthropic_count' || method === 'google_count') {
        return Math.max(PROVIDER_COUNT_UNCERTAINTY_MIN, Math.floor(budget * PROVIDER_COUNT_UNCERTAINTY_RATIO));
    }
    return Math.max(HEURISTIC_UNCERTAINTY_MIN, Math.floor(budget * HEURISTIC_UNCERTAINTY_RATIO));
}

function toCountedEstimate(
    result: TokenCountResult,
    safeInputBudget?: number
): InputTokenEstimate {
    let method: TokenEstimateMethod;
    if (result.source === 'provider_count') {
        method = result.provider === 'google' ? 'google_count' : 'anthropic_count';
    } else {
        method = 'heuristic_chars';
    }
    return {
        inputTokens: Math.max(0, Math.floor(result.inputTokens)),
        method,
        uncertaintyTokens: estimateUncertaintyTokens(method, safeInputBudget)
    };
}

/**
 * Provider-counted token estimation.
 *
 * Dispatches to the provider's authoritative tokenizer when available:
 *   - anthropic: HTTP /v1/messages/count_tokens (knows document blocks + citations)
 *   - google:    HTTP models/{id}:countTokens   (free, no quota cost)
 *   - openai:    Falls through to chars/4 heuristic. OpenAI does not expose
 *                a free pre-flight count endpoint, and shipping a local
 *                tokenizer (tiktoken) was determined not to be worth ~2 MB
 *                of bundle for the cost-estimate accuracy gain.
 *   - ollama:    No remote tokenizer; falls through to heuristic.
 *
 * On any failure (missing key, network error, malformed response) returns
 * the heuristic with the error attached so the UI can surface "Heuristic
 * estimate — {reason}" rather than silently lying.
 */
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
    if (!request.plugin || !request.modelId) {
        return fallback();
    }

    if (provider === 'anthropic') {
        try {
            const apiKey = await getCredential(request.plugin, 'anthropic');
            if (!apiKey) {
                return fallback('Anthropic API key unavailable for token counting.');
            }
            const counted = await countAnthropicTokens(
                apiKey,
                request.modelId,
                request.systemPrompt ?? null,
                request.userPrompt,
                request.citationsEnabled,
                request.evidenceDocuments,
                undefined,
                request.jsonSchema
            );
            return toCountedEstimate(counted, request.safeInputBudget);
        } catch (error) {
            return fallback(error instanceof Error ? error.message : String(error));
        }
    }

    if (provider === 'google') {
        try {
            const apiKey = await getCredential(request.plugin, 'google');
            if (!apiKey) {
                return fallback('Gemini API key unavailable for token counting.');
            }
            // Gemini has no document-block/citations distinction at the API
            // level — evidence is concatenated into the user prompt by the
            // runner before this point. Just count system + user.
            const counted = await countGeminiTokens(
                apiKey,
                request.modelId,
                request.systemPrompt ?? null,
                request.userPrompt
            );
            return toCountedEstimate(counted, request.safeInputBudget);
        } catch (error) {
            return fallback(error instanceof Error ? error.message : String(error));
        }
    }

    return fallback();
}
