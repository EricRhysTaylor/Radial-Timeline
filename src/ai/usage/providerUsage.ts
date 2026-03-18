export type TokenUsage = {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    rawInputTokens?: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
    cacheCreation5mInputTokens?: number;
    cacheCreation1hInputTokens?: number;
};

function readUsageNumber(value: unknown): number | undefined {
    if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
    return Math.max(0, Math.floor(value));
}

function sumUsageNumbers(value: unknown): number | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const numbers = Object.values(value as Record<string, unknown>)
        .map(entry => readUsageNumber(entry))
        .filter((entry): entry is number => typeof entry === 'number');
    if (!numbers.length) return undefined;
    return numbers.reduce((sum, entry) => sum + entry, 0);
}

function readAnthropicUsage(responseData: Record<string, unknown>): TokenUsage | null {
    const usage = responseData.usage;
    if (!usage || typeof usage !== 'object') return null;
    const usageData = usage as Record<string, unknown>;
    const rawInputTokens = readUsageNumber(usageData.input_tokens);
    const cacheReadInputTokens = readUsageNumber(usageData.cache_read_input_tokens);
    const cacheCreation = usageData.cache_creation && typeof usageData.cache_creation === 'object'
        ? usageData.cache_creation as Record<string, unknown>
        : undefined;
    const cacheCreation5mInputTokens = readUsageNumber(cacheCreation?.ephemeral_5m_input_tokens);
    const cacheCreation1hInputTokens = readUsageNumber(cacheCreation?.ephemeral_1h_input_tokens);
    const cacheCreationInputTokens = readUsageNumber(usageData.cache_creation_input_tokens)
        ?? sumUsageNumbers(cacheCreation);
    const outputTokens = readUsageNumber(usageData.output_tokens);
    const hasAny = rawInputTokens !== undefined
        || cacheReadInputTokens !== undefined
        || cacheCreationInputTokens !== undefined
        || cacheCreation5mInputTokens !== undefined
        || cacheCreation1hInputTokens !== undefined
        || outputTokens !== undefined;
    if (!hasAny) return null;

    const inputPieces = [rawInputTokens, cacheReadInputTokens, cacheCreationInputTokens]
        .filter((value): value is number => typeof value === 'number');
    const inputTokens = inputPieces.length > 0
        ? inputPieces.reduce((sum, value) => sum + value, 0)
        : undefined;
    const totalTokens = typeof inputTokens === 'number' && typeof outputTokens === 'number'
        ? inputTokens + outputTokens
        : undefined;

    return {
        inputTokens,
        outputTokens,
        totalTokens,
        rawInputTokens,
        cacheReadInputTokens,
        cacheCreationInputTokens,
        cacheCreation5mInputTokens,
        cacheCreation1hInputTokens
    };
}

function readOpenAiUsage(responseData: Record<string, unknown>): TokenUsage | null {
    const usage = responseData.usage;
    if (!usage || typeof usage !== 'object') return null;
    const usageData = usage as Record<string, unknown>;
    const inputTokens = readUsageNumber(usageData.prompt_tokens) ?? readUsageNumber(usageData.input_tokens);
    const outputTokens = readUsageNumber(usageData.completion_tokens) ?? readUsageNumber(usageData.output_tokens);
    const totalTokens = readUsageNumber(usageData.total_tokens)
        ?? (typeof inputTokens === 'number' && typeof outputTokens === 'number'
            ? inputTokens + outputTokens
            : undefined);
    if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return null;
    return { inputTokens, outputTokens, totalTokens };
}

function readGeminiUsage(responseData: Record<string, unknown>): TokenUsage | null {
    const usage = responseData.usageMetadata;
    if (!usage || typeof usage !== 'object') return null;
    const usageData = usage as Record<string, unknown>;
    const inputTokens = readUsageNumber(usageData.promptTokenCount);
    const outputTokens = readUsageNumber(usageData.candidatesTokenCount);
    const totalTokens = readUsageNumber(usageData.totalTokenCount)
        ?? (typeof inputTokens === 'number' && typeof outputTokens === 'number'
            ? inputTokens + outputTokens
            : undefined);
    if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return null;
    return { inputTokens, outputTokens, totalTokens };
}

export function extractTokenUsage(provider: string | null | undefined, responseData: unknown): TokenUsage | null {
    if (!responseData || typeof responseData !== 'object') return null;
    const data = responseData as Record<string, unknown>;
    const normalizedProvider = (provider || '').trim().toLowerCase();

    if (normalizedProvider === 'anthropic') {
        return readAnthropicUsage(data);
    }
    if (normalizedProvider === 'openai' || normalizedProvider === 'local' || normalizedProvider === 'ollama') {
        return readOpenAiUsage(data);
    }
    if (normalizedProvider === 'gemini' || normalizedProvider === 'google') {
        return readGeminiUsage(data);
    }

    return readAnthropicUsage(data)
        ?? readOpenAiUsage(data)
        ?? readGeminiUsage(data);
}
