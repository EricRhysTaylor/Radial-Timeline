// TODO: DEPRECATED — migrate to aiClient
export type AiStatus = 'success' | 'rejected' | 'unavailable' | 'timeout' | 'auth' | 'rate_limit';

export interface ProviderErrorClassification {
    aiStatus: AiStatus;
    aiReason?: string;
}

type ErrorEnvelope = {
    error?: string;
    message?: string;
    responseData?: unknown;
    status?: number;
};

const extractStatus = (input: ErrorEnvelope): number | null => {
    if (typeof input.status === 'number') return input.status;
    const responseData = input.responseData as Record<string, unknown> | undefined;
    const status = responseData?.status ?? (responseData?.error as any)?.status;
    return typeof status === 'number' ? status : null;
};

const extractMessage = (err: unknown): string => {
    if (!err) return '';
    if (typeof err === 'string') return err;
    if (err instanceof Error) return err.message;
    if (typeof err === 'object') {
        const record = err as Record<string, unknown>;
        if (typeof record.error === 'string') return record.error;
        if (typeof record.message === 'string') return record.message;
        if (typeof record.responseData === 'object' && record.responseData) {
            const response = record.responseData as Record<string, unknown>;
            const responseError = response.error as Record<string, unknown> | undefined;
            if (responseError && typeof responseError.message === 'string') {
                return responseError.message;
            }
            if (typeof response.message === 'string') return response.message;
        }
    }
    return '';
};

const isUnsupportedParamMessage = (normalized: string): boolean => {
    if (!normalized) return false;
    if (normalized.includes('only accepts its default temperature')) return true;

    const hasUnsupported = /(unsupported|unrecognized|unknown|invalid)/.test(normalized);
    const hasParamWord = /(parameter|field|argument|value)/.test(normalized);
    const mentionsParam = /(temperature|top_p|top p|response_format|response schema|response_schema|json_schema|json mode)/.test(normalized);

    if (hasUnsupported && (hasParamWord || mentionsParam)) return true;
    if (mentionsParam && normalized.includes('not supported')) return true;
    return false;
};

const isTruncationMessage = (normalized: string): boolean => {
    if (!normalized) return false;
    if (normalized.includes('truncated')) return true;
    if (normalized.includes('max tokens') || normalized.includes('maximum token')) return true;
    if (normalized.includes('maximum context') || normalized.includes('context length')) return true;
    if (normalized.includes('token limit') || normalized.includes('too many tokens')) return true;
    if (normalized.includes('length exceeded')) return true;
    return false;
};

export function classifyProviderError(err: unknown): ProviderErrorClassification {
    const envelope: ErrorEnvelope = typeof err === 'object' && err !== null
        ? err as ErrorEnvelope
        : { error: typeof err === 'string' ? err : undefined };

    const message = extractMessage(err);
    const normalized = message.toLowerCase();
    const status = extractStatus(envelope);

    if (status === 429 || normalized.includes('rate limit') || normalized.includes('too many requests') || normalized.includes('overloaded')) {
        return { aiStatus: 'rate_limit' };
    }

    if (status === 401 || status === 403 || normalized.includes('unauthorized') || normalized.includes('authentication') ||
        normalized.includes('invalid api key') || normalized.includes('api key') || normalized.includes('permission')) {
        return { aiStatus: 'auth' };
    }

    if (status === 408 || status === 504 || normalized.includes('timeout') || normalized.includes('timed out') ||
        normalized.includes('deadline exceeded') || normalized.includes('etimedout') || normalized.includes('econnaborted')) {
        return { aiStatus: 'timeout' };
    }

    if (status !== null && status >= 500) {
        return { aiStatus: 'unavailable' };
    }

    if (normalized.includes('connection refused') || normalized.includes('network') ||
        normalized.includes('could not connect') || normalized.includes('enotfound') || normalized.includes('econnrefused')) {
        return { aiStatus: 'unavailable' };
    }

    if (isUnsupportedParamMessage(normalized)) {
        return { aiStatus: 'rejected', aiReason: 'unsupported_param' };
    }

    if (isTruncationMessage(normalized)) {
        return { aiStatus: 'rejected', aiReason: 'truncated' };
    }

    return { aiStatus: 'rejected' };
}
