import type RadialTimelinePlugin from '../../main';
import { getCredential } from '../credentials/credentials';
import { getLocalLlmBackend } from './backends';
import { getCanonicalLocalLlmSettings, LOCAL_LLM_BACKEND_LABELS } from './settings';
import { runStructuredJsonPipeline } from './structuredJson';
import type { LocalLlmSettings } from '../types';

export interface LocalLlmDiagnosticCheck {
    ok: boolean;
    message: string;
}

export interface LocalLlmDiagnosticsReport {
    backend: string;
    baseUrl: string;
    modelId: string;
    reachable: LocalLlmDiagnosticCheck;
    modelAvailable: LocalLlmDiagnosticCheck;
    basicCompletion: LocalLlmDiagnosticCheck;
    structuredJson: LocalLlmDiagnosticCheck;
    repairPath: LocalLlmDiagnosticCheck;
}

function resolveSettings(
    plugin: RadialTimelinePlugin,
    overrides?: Partial<LocalLlmSettings>
): LocalLlmSettings {
    return {
        ...getCanonicalLocalLlmSettings(plugin),
        ...(overrides || {})
    };
}

export async function runLocalLlmDiagnostics(
    plugin: RadialTimelinePlugin,
    overrides?: Partial<LocalLlmSettings>
): Promise<LocalLlmDiagnosticsReport> {
    const localLlm = resolveSettings(plugin, overrides);
    const backend = getLocalLlmBackend(localLlm.backend);
    const apiKey = await getCredential(plugin, 'ollama');
    const transport = {
        baseUrl: localLlm.baseUrl,
        timeoutMs: localLlm.timeoutMs,
        apiKey
    };

    let reachable: LocalLlmDiagnosticCheck = { ok: false, message: 'Connection not tested.' };
    let modelAvailable: LocalLlmDiagnosticCheck = { ok: false, message: 'Model availability not tested.' };
    let basicCompletion: LocalLlmDiagnosticCheck = { ok: false, message: 'Basic completion not tested.' };
    let structuredJson: LocalLlmDiagnosticCheck = { ok: false, message: 'Structured JSON path not tested.' };

    try {
        const models = await backend.listModels(transport);
        reachable = { ok: true, message: `${LOCAL_LLM_BACKEND_LABELS[localLlm.backend]} responded with ${models.length} models.` };
        const hasModel = models.some(model => model.id === localLlm.defaultModelId);
        modelAvailable = hasModel
            ? { ok: true, message: `Model "${localLlm.defaultModelId}" is available.` }
            : { ok: false, message: `Model "${localLlm.defaultModelId}" is not available.` };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reachable = { ok: false, message };
        modelAvailable = { ok: false, message: 'Model check skipped because backend is unreachable.' };
        return {
            backend: LOCAL_LLM_BACKEND_LABELS[localLlm.backend],
            baseUrl: localLlm.baseUrl,
            modelId: localLlm.defaultModelId,
            reachable,
            modelAvailable,
            basicCompletion,
            structuredJson,
            repairPath: {
                ok: true,
                message: 'Repair path self-check is runtime-local and remains available without a live backend.'
            }
        };
    }

    const basic = await backend.complete({
        ...transport,
        modelId: localLlm.defaultModelId,
        systemPrompt: 'Reply with the single word READY.',
        userPrompt: 'Return READY.',
        maxOutputTokens: 16
    });
    basicCompletion = basic.success && basic.content?.toUpperCase().includes('READY')
        ? { ok: true, message: 'Basic completion succeeded.' }
        : { ok: false, message: basic.error || 'Backend did not return the expected READY response.' };

    const structured = await runStructuredJsonPipeline({
        providerLabel: LOCAL_LLM_BACKEND_LABELS[localLlm.backend],
        schema: {
            type: 'object',
            properties: {
                status: { type: 'string' }
            },
            required: ['status']
        },
        jsonMode: localLlm.jsonMode,
        maxRetries: localLlm.maxRetries,
        runner: {
            run: ({ systemPrompt, userPrompt, useResponseFormat }) => backend.complete({
                ...transport,
                modelId: localLlm.defaultModelId,
                systemPrompt,
                userPrompt,
                maxOutputTokens: 64,
                responseFormat: useResponseFormat ? { type: 'json_object' } : undefined
            })
        },
        systemPrompt: 'Return only JSON.',
        userPrompt: 'Return {"status":"ok"} as valid JSON.'
    });
    structuredJson = structured.ok
        ? { ok: true, message: `Structured JSON path succeeded${structured.repairCount > 0 ? ' after repair.' : '.'}` }
        : { ok: false, message: structured.error };

    const repairPath: LocalLlmDiagnosticCheck = await (async () => {
        const result = await runStructuredJsonPipeline({
            providerLabel: LOCAL_LLM_BACKEND_LABELS[localLlm.backend],
            schema: {
                type: 'object',
                properties: {
                    status: { type: 'string' }
                },
                required: ['status']
            },
            jsonMode: localLlm.jsonMode,
            maxRetries: 1,
            runner: {
                async run({ userPrompt }) {
                    if (userPrompt.includes('Repair the invalid JSON below.')) {
                        return {
                            content: '{"status":"ok"}',
                            responseData: { source: 'repair-self-test' },
                            requestPayload: { source: 'repair-self-test' }
                        };
                    }
                    return {
                        content: '{"status": }',
                        responseData: { source: 'repair-self-test' },
                        requestPayload: { source: 'repair-self-test' }
                    };
                }
            },
            systemPrompt: 'Return only JSON.',
            userPrompt: 'Return {"status":"ok"} as valid JSON.'
        });
        return result.ok && result.repairCount === 1
            ? { ok: true, message: 'Repair path self-check succeeded.' }
            : { ok: false, message: result.ok ? 'Repair path did not execute.' : result.error };
    })();

    return {
        backend: LOCAL_LLM_BACKEND_LABELS[localLlm.backend],
        baseUrl: localLlm.baseUrl,
        modelId: localLlm.defaultModelId,
        reachable,
        modelAvailable,
        basicCompletion,
        structuredJson,
        repairPath
    };
}
