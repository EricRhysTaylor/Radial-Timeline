import { describe, expect, it } from 'vitest';
import { runStructuredJsonPipeline } from './structuredJson';

describe('runStructuredJsonPipeline', () => {
    const schema = {
        type: 'object',
        properties: {
            status: { type: 'string' }
        },
        required: ['status']
    };

    it('accepts a valid structured JSON success path', async () => {
        const result = await runStructuredJsonPipeline({
            providerLabel: 'Local LLM',
            schema,
            jsonMode: 'response_format',
            maxRetries: 1,
            runner: {
                async run() {
                    return {
                        content: '{"status":"ok"}',
                        responseData: { ok: true },
                        requestPayload: { ok: true }
                    };
                }
            },
            systemPrompt: 'Return only JSON.',
            userPrompt: 'Return {"status":"ok"}'
        });

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.content).toBe('{"status":"ok"}');
            expect(result.repairCount).toBe(0);
        }
    });

    it('repairs malformed JSON once and succeeds', async () => {
        let calls = 0;
        const result = await runStructuredJsonPipeline({
            providerLabel: 'Local LLM',
            schema,
            jsonMode: 'prompt_only',
            maxRetries: 1,
            runner: {
                async run({ userPrompt }) {
                    calls += 1;
                    if (userPrompt.includes('Repair the invalid JSON below.')) {
                        return {
                            content: '{"status":"ok"}',
                            responseData: { repaired: true },
                            requestPayload: { repaired: true }
                        };
                    }
                    return {
                        content: '```json\n{"status": }\n```',
                        responseData: { repaired: false },
                        requestPayload: { repaired: false }
                    };
                }
            },
            systemPrompt: 'Return only JSON.',
            userPrompt: 'Return {"status":"ok"}'
        });

        expect(calls).toBe(2);
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.repairCount).toBe(1);
        }
    });

    it('fails explicitly when repair cannot recover valid JSON', async () => {
        const result = await runStructuredJsonPipeline({
            providerLabel: 'Local LLM',
            schema,
            jsonMode: 'prompt_only',
            maxRetries: 1,
            runner: {
                async run() {
                    return {
                        content: '{"status": }',
                        responseData: { ok: false },
                        requestPayload: { ok: false }
                    };
                }
            },
            systemPrompt: 'Return only JSON.',
            userPrompt: 'Return {"status":"ok"}'
        });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.stage).toBe('repair');
            expect(result.error).toContain('Invalid JSON');
        }
    });
});
