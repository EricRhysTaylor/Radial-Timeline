import { MalformedJsonError } from '../errors';

export interface JsonValidationResult<T = unknown> {
    ok: boolean;
    parsed?: T;
    error?: Error;
}

function getRequired(schema?: Record<string, unknown>): string[] {
    if (!schema) return [];
    const required = schema.required;
    if (!Array.isArray(required)) return [];
    return required.filter(item => typeof item === 'string') as string[];
}

export function validateJsonResponse<T = unknown>(
    raw: string,
    schema?: Record<string, unknown>,
    provider?: string
): JsonValidationResult<T> {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
            ok: false,
            error: new MalformedJsonError(`Invalid JSON: ${message}`, { provider })
        };
    }

    const requiredKeys = getRequired(schema);
    if (requiredKeys.length && parsed && typeof parsed === 'object') {
        const record = parsed as Record<string, unknown>;
        const missing = requiredKeys.filter(key => !(key in record));
        if (missing.length) {
            return {
                ok: false,
                error: new MalformedJsonError(`JSON missing required keys: ${missing.join(', ')}`, { provider })
            };
        }
    }

    return { ok: true, parsed: parsed as T };
}
