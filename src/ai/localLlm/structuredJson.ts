import { validateJsonResponse } from '../runtime/jsonValidator';

export interface StructuredJsonAttempt {
    content: string | null;
    responseData: unknown;
    requestPayload?: unknown;
    error?: string;
}

export interface StructuredJsonRunner {
    run(input: {
        systemPrompt?: string | null;
        userPrompt: string;
        useResponseFormat: boolean;
    }): Promise<StructuredJsonAttempt>;
}

export interface StructuredJsonSuccess {
    ok: true;
    content: string;
    responseData: unknown;
    requestPayload?: unknown;
    repairCount: number;
}

export interface StructuredJsonFailure {
    ok: false;
    error: string;
    responseData: unknown;
    requestPayload?: unknown;
    stage: 'initial' | 'repair';
    repairCount: number;
}

export type StructuredJsonResult = StructuredJsonSuccess | StructuredJsonFailure;

function stripCodeFence(input: string): string {
    const trimmed = input.trim();
    if (!trimmed.startsWith('```')) return trimmed;
    const withoutStart = trimmed.replace(/^```[a-zA-Z0-9_-]*\s*/u, '');
    return withoutStart.endsWith('```')
        ? withoutStart.slice(0, -3).trim()
        : withoutStart.trim();
}

function extractBalancedObject(raw: string): string | null {
    const input = stripCodeFence(raw);
    const start = input.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < input.length; index += 1) {
        const char = input[index];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
            continue;
        }
        if (char === '{') depth += 1;
        if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                return input.slice(start, index + 1).trim();
            }
        }
    }
    return input.trim().startsWith('{') ? input.trim() : null;
}

function buildRepairPrompt(schema: Record<string, unknown>, invalidContent: string): string {
    return [
        'Repair the invalid JSON below.',
        'Return only a valid JSON object.',
        'Preserve the intended meaning, but satisfy the required keys and valid JSON syntax.',
        `Schema: ${JSON.stringify(schema)}`,
        'Invalid JSON:',
        invalidContent
    ].join('\n\n');
}

function validateStructuredJson(
    content: string | null,
    schema: Record<string, unknown>,
    providerLabel: string
): { ok: true; normalized: string } | { ok: false; error: string } {
    const extracted = content ? extractBalancedObject(content) : null;
    if (!extracted) {
        return { ok: false, error: `${providerLabel} returned no JSON object to validate.` };
    }
    const validation = validateJsonResponse(extracted, schema, providerLabel);
    if (!validation.ok) {
        return {
            ok: false,
            error: validation.error instanceof Error ? validation.error.message : 'Invalid JSON response.'
        };
    }
    return { ok: true, normalized: extracted };
}

export async function runStructuredJsonPipeline(input: {
    providerLabel: string;
    schema: Record<string, unknown>;
    jsonMode: 'response_format' | 'prompt_only';
    maxRetries: number;
    runner: StructuredJsonRunner;
    systemPrompt?: string | null;
    userPrompt: string;
}): Promise<StructuredJsonResult> {
    const initial = await input.runner.run({
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        useResponseFormat: input.jsonMode === 'response_format'
    });
    if (initial.error) {
        return {
            ok: false,
            error: initial.error,
            responseData: initial.responseData,
            requestPayload: initial.requestPayload,
            stage: 'initial',
            repairCount: 0
        };
    }

    const validated = validateStructuredJson(initial.content, input.schema, input.providerLabel);
    if (validated.ok) {
        return {
            ok: true,
            content: validated.normalized,
            responseData: initial.responseData,
            requestPayload: initial.requestPayload,
            repairCount: 0
        };
    }

    let latestResponseData = initial.responseData;
    let latestRequestPayload = initial.requestPayload;
    let latestError = validated.error;
    const attempts = Math.max(0, input.maxRetries);
    for (let repairCount = 1; repairCount <= attempts; repairCount += 1) {
        const repair = await input.runner.run({
            systemPrompt: 'Repair malformed JSON for Radial Timeline. Return only valid JSON.',
            userPrompt: buildRepairPrompt(input.schema, initial.content || ''),
            useResponseFormat: input.jsonMode === 'response_format'
        });
        latestResponseData = repair.responseData;
        latestRequestPayload = repair.requestPayload;
        if (repair.error) {
            latestError = repair.error;
            continue;
        }
        const repairValidation = validateStructuredJson(repair.content, input.schema, input.providerLabel);
        if (repairValidation.ok) {
            return {
                ok: true,
                content: repairValidation.normalized,
                responseData: repair.responseData,
                requestPayload: repair.requestPayload,
                repairCount
            };
        }
        latestError = repairValidation.error;
    }

    return {
        ok: false,
        error: latestError,
        responseData: latestResponseData,
        requestPayload: latestRequestPayload,
        stage: 'repair',
        repairCount: attempts
    };
}
