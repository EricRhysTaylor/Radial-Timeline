import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn()
}));

import {
    extractOpenAiResponsesContent,
    normalizeOpenAiResponsesResponseData,
    normalizeOpenAiResponsesUsage
} from './openaiApi';

describe('openai responses normalization', () => {
    it('extracts text from output_text and message content blocks', () => {
        const responseData = {
            output_text: 'Top-level summary',
            output: [
                {
                    type: 'message',
                    content: [
                        { type: 'output_text', text: 'Detail A' },
                        { type: 'output_text', output_text: 'Detail B' }
                    ]
                }
            ]
        };
        expect(extractOpenAiResponsesContent(responseData)).toBe('Top-level summary\n\nDetail A\n\nDetail B');
    });

    it('maps Responses usage fields into chat-style usage fields', () => {
        const usage = normalizeOpenAiResponsesUsage({
            input_tokens: 1200,
            output_tokens: 300
        });
        expect(usage).toEqual({
            prompt_tokens: 1200,
            completion_tokens: 300,
            total_tokens: 1500
        });
    });

    it('normalizes Responses payload into providerRouter-compatible shape', () => {
        const raw = {
            id: 'resp_123',
            status: 'completed',
            usage: {
                input_tokens: 12,
                output_tokens: 8
            }
        };

        const normalized = normalizeOpenAiResponsesResponseData(raw, 'gpt-5.4-pro', 'hello world') as Record<string, unknown>;
        const usage = normalized.usage as Record<string, unknown>;
        const choices = normalized.choices as Record<string, unknown>[];
        const firstChoice = choices[0];
        const message = firstChoice.message as Record<string, unknown>;

        expect(normalized.model).toBe('gpt-5.4-pro');
        expect(usage.prompt_tokens).toBe(12);
        expect(usage.completion_tokens).toBe(8);
        expect(usage.total_tokens).toBe(20);
        expect(message.content).toBe('hello world');
    });
});
