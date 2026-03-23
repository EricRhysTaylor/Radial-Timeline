import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn()
}));

import * as obsidian from 'obsidian';

import { countAnthropicTokens, normalizeAnthropicTokenCountResponse } from './anthropicApi';

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

    it('normalizes total_tokens fallback responses into the canonical count result', () => {
        expect(normalizeAnthropicTokenCountResponse({
            total_tokens: 987
        }, 'claude-opus-4-6')).toEqual({
            provider: 'anthropic',
            modelId: 'claude-opus-4-6',
            inputTokens: 987,
            source: 'provider_count'
        });
    });
});
