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
            'claude-sonnet-4-6',
            'System rules',
            'User prompt body'
        );

        expect(result).toEqual({
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
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
        expect(body.model).toBe('claude-sonnet-4-6');
        expect(body.system).toEqual([{ type: 'text', text: 'System rules' }]);
        expect(body.messages?.[0]?.role).toBe('user');
        expect(body.messages?.[0]?.content?.[0]).toEqual({ type: 'text', text: 'User prompt body' });
    });

    it('rejects token count responses that omit input_tokens', () => {
        expect(normalizeAnthropicTokenCountResponse({
            total_tokens: 987
        }, 'claude-opus-4-6')).toBeNull();
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
                citations: { enabled: true },
                cache_control: { type: 'ephemeral' }
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
        expect(diagnostics.hasCacheablePrefix).toBe(true);
        expect(diagnostics.documentBlockCount).toBe(1);
        expect(diagnostics.documentChars).toBe('Scene evidence text'.length);
        expect(diagnostics.stableTextChars).toBe('Stable instructions'.length);
        expect(diagnostics.volatileTextChars).toBe('Volatile question'.length);
        expect(diagnostics.cachePrefixFingerprint).not.toBe('none');
        expect(diagnostics.volatileTextFingerprint).not.toBe('none');
        expect(diagnostics.blockShape).toBe('text>document*>text');
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
});
