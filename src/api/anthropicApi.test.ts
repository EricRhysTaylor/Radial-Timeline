import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn()
}));

import * as obsidian from 'obsidian';

import {
    buildAnthropicDispatchDiagnostics,
    buildAnthropicUserContent,
    countAnthropicTokens,
    normalizeAnthropicTokenCountResponse
} from './anthropicApi';

const mockedRequestUrl = vi.spyOn(obsidian, 'requestUrl');

describe('anthropic token counting', () => {
    beforeEach(() => {
        mockedRequestUrl.mockReset();
    });

    it('builds a count_tokens request and returns a canonical provider-count result', async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            text: '',
            json: {
                input_tokens: 4321
            }
        } as never);

        const result = await countAnthropicTokens(
            'test-key',
            'claude-opus-4-7',
            'System rules',
            'User prompt body'
        );

        expect(result).toEqual({
            provider: 'anthropic',
            modelId: 'claude-opus-4-7',
            inputTokens: 4321,
            source: 'provider_count'
        });

        const request = mockedRequestUrl.mock.calls[0]?.[0] as { url?: string; body?: string; headers?: Record<string, string> };
        const body = JSON.parse(request.body ?? '{}') as {
            model?: string;
            system?: Array<{ type?: string; text?: string }>;
            messages?: Array<{ role?: string; content?: Array<{ type?: string; text?: string }> }>;
        };

        expect(request.url).toBe('https://api.anthropic.com/v1/messages/count_tokens');
        expect(request.headers?.['anthropic-version']).toBe('2023-06-01');
        expect(body.model).toBe('claude-opus-4-7');
        expect(body.system).toEqual([{ type: 'text', text: 'System rules' }]);
        expect(body.messages?.[0]?.role).toBe('user');
        expect(body.messages?.[0]?.content?.[0]).toEqual({ type: 'text', text: 'User prompt body' });
    });

    it('includes the structured tool schema in count_tokens requests for JSON runs', async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            text: '',
            json: {
                input_tokens: 896
            }
        } as never);

        await countAnthropicTokens(
            'test-key',
            'claude-opus-4-7',
            'System rules',
            'Return {"answer":"ACK"}.',
            false,
            undefined,
            undefined,
            {
                type: 'object',
                properties: {
                    answer: { type: 'string' }
                },
                required: ['answer'],
                additionalProperties: false
            }
        );

        const request = mockedRequestUrl.mock.calls[0]?.[0] as { body?: string };
        const body = JSON.parse(request.body ?? '{}') as {
            tools?: Array<{ name?: string; input_schema?: Record<string, unknown> }>;
            tool_choice?: { type?: string; name?: string };
        };

        expect(body.tools).toEqual([{
            name: 'record_structured_response',
            description: 'Return the final structured response via this tool input.',
            input_schema: {
                type: 'object',
                properties: {
                    answer: { type: 'string' }
                },
                required: ['answer'],
                additionalProperties: false
            }
        }]);
        expect(body.tool_choice).toEqual({
            type: 'tool',
            name: 'record_structured_response'
        });
    });

    it('omits the structured tool schema when citations are enabled (citations + tool_use are mutually exclusive on Anthropic)', async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            text: '',
            json: {
                input_tokens: 1024
            }
        } as never);

        await countAnthropicTokens(
            'test-key',
            'claude-opus-4-7',
            'System rules',
            'Return JSON per the schema in the prompt.',
            true,
            undefined,
            undefined,
            {
                type: 'object',
                properties: {
                    answer: { type: 'string' }
                },
                required: ['answer'],
                additionalProperties: false
            }
        );

        const request = mockedRequestUrl.mock.calls[0]?.[0] as { body?: string };
        const body = JSON.parse(request.body ?? '{}') as {
            tools?: unknown;
            tool_choice?: unknown;
        };

        // Citations attach only to text content blocks. Forcing a tool call
        // produces a tool_use block with no text — citations would have nowhere
        // to anchor. Anthropic's docs make this incompatibility explicit.
        expect(body.tools).toBeUndefined();
        expect(body.tool_choice).toBeUndefined();
    });

    it('rejects token count responses that omit input_tokens', () => {
        expect(normalizeAnthropicTokenCountResponse({
            total_tokens: 987
        }, 'claude-opus-4-7')).toBeNull();
    });
});

describe('buildAnthropicUserContent', () => {
    it('emits document blocks without requiring a cache delimiter', () => {
        const content = buildAnthropicUserContent({
            userPrompt: 'Analyze the attached manuscript evidence.',
            citationsEnabled: true,
            evidenceDocuments: [
                { title: 'Scene S1', content: 'Scene evidence text' }
            ]
        });

        expect(content).toEqual([
            { type: 'text', text: 'Analyze the attached manuscript evidence.' },
            {
                type: 'document',
                source: { type: 'text', media_type: 'text/plain', data: 'Scene evidence text' },
                title: 'Scene S1',
                citations: { enabled: true }
            }
        ]);
    });

    it('preserves the trailing volatile block when a cache delimiter is present', () => {
        const content = buildAnthropicUserContent({
            userPrompt: 'Stable instructions\n<<<CACHE_BREAK>>>\nVolatile question',
            citationsEnabled: true,
            evidenceDocuments: [
                { title: 'Scene S1', content: 'Scene evidence text' }
            ]
        });

        expect(content).toHaveLength(3);
        expect(content[0]).toEqual({ type: 'text', text: 'Stable instructions' });
        expect(content[1]).toMatchObject({
            type: 'document',
            title: 'Scene S1',
            citations: { enabled: true }
        });
        expect(content[2]).toEqual({ type: 'text', text: 'Volatile question' });
    });

    it('builds dispatch diagnostics from the cacheable prefix and volatile tail separately', () => {
        const content = buildAnthropicUserContent({
            userPrompt: 'Stable instructions\n<<<CACHE_BREAK>>>\nVolatile question',
            citationsEnabled: true,
            evidenceDocuments: [
                { title: 'Scene S1', content: 'Scene evidence text' }
            ]
        });

        const diagnostics = buildAnthropicDispatchDiagnostics(content);

        expect(diagnostics.requestedCacheTtl).toBe('none');
        expect(diagnostics.hasCacheablePrefix).toBe(false);
        expect(diagnostics.documentBlockCount).toBe(0);
        expect(diagnostics.documentChars).toBe(0);
        expect(diagnostics.stableTextChars).toBe(0);
        expect(diagnostics.volatileTextChars).toBe('Stable instructions\nVolatile question'.length);
        expect(diagnostics.cachePrefixFingerprint).toBe('none');
        expect(diagnostics.volatileTextFingerprint).not.toBe('none');
        expect(diagnostics.blockShape).toBe('text>document>text');
    });

    it('records the requested cache ttl in dispatch diagnostics', () => {
        const content = buildAnthropicUserContent({
            userPrompt: 'Stable instructions\n<<<CACHE_BREAK>>>\nVolatile question',
            citationsEnabled: true,
            evidenceDocuments: [
                { title: 'Scene S1', content: 'Scene evidence text' }
            ],
            cacheTtl: '1h'
        });

        const diagnostics = buildAnthropicDispatchDiagnostics(content, '1h');

        expect(diagnostics.requestedCacheTtl).toBe('1h');
    });

    it('emits evidence as plain text blocks when citations are disabled', () => {
        const content = buildAnthropicUserContent({
            userPrompt: 'Analyze the attached manuscript evidence.',
            citationsEnabled: false,
            evidenceDocuments: [
                { title: 'Scene S1', content: 'Scene one body' },
                { title: 'Scene S2', content: 'Scene two body' }
            ]
        });

        expect(content).toEqual([
            { type: 'text', text: 'Analyze the attached manuscript evidence.' },
            { type: 'text', text: '## Scene S1\nScene one body' },
            { type: 'text', text: '## Scene S2\nScene two body' }
        ]);
    });

    it('places cache_control on the last evidence block when ttl is set and citations off', () => {
        const content = buildAnthropicUserContent({
            userPrompt: 'Stable instructions\n<<<CACHE_BREAK>>>\nVolatile question',
            citationsEnabled: false,
            evidenceDocuments: [
                { title: 'Scene S1', content: 'Scene one body' },
                { title: 'Scene S2', content: 'Scene two body' }
            ],
            cacheTtl: '1h'
        });

        expect(content).toHaveLength(4);
        expect(content[0]).toEqual({ type: 'text', text: 'Stable instructions' });
        expect(content[1]).toEqual({ type: 'text', text: '## Scene S1\nScene one body' });
        expect(content[2]).toEqual({
            type: 'text',
            text: '## Scene S2\nScene two body',
            cache_control: { type: 'ephemeral', ttl: '1h' }
        });
        expect(content[3]).toEqual({ type: 'text', text: 'Volatile question' });
    });

    it('omits the trailing volatile block when no delimiter is present and citations off', () => {
        const content = buildAnthropicUserContent({
            userPrompt: 'Just instructions, no delimiter.',
            citationsEnabled: false,
            evidenceDocuments: [
                { title: 'Scene S1', content: 'Scene one body' }
            ]
        });

        expect(content).toEqual([
            { type: 'text', text: 'Just instructions, no delimiter.' },
            { type: 'text', text: '## Scene S1\nScene one body' }
        ]);
    });
});
