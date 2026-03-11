import { describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn()
}));

import {
    extractOpenAiAnnotationCitations,
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

    it('extracts OpenAI file citation annotations from Responses output', () => {
        const raw = {
            output: [
                {
                    type: 'message',
                    content: [
                        {
                            type: 'output_text',
                            text: 'The manuscript beat pivots at midpoint.',
                            annotations: [
                                {
                                    type: 'file_citation',
                                    file_id: 'file_123',
                                    filename: 'midpoint.md',
                                    quote: 'beat pivots at midpoint'
                                }
                            ]
                        }
                    ]
                }
            ]
        };

        expect(extractOpenAiAnnotationCitations(raw)).toEqual([
            {
                attributionType: 'tool_file',
                sourceLabel: 'midpoint.md',
                sourceId: 'file_123',
                fileId: 'file_123',
                filename: 'midpoint.md',
                citedText: 'beat pivots at midpoint',
                startCharIndex: undefined,
                endCharIndex: undefined
            }
        ]);
    });

    it('extracts OpenAI URL citation annotations from Chat-style response payloads', () => {
        const raw = {
            choices: [
                {
                    message: {
                        role: 'assistant',
                        content: [
                            {
                                type: 'output_text',
                                text: 'Reference: style guide.',
                                annotations: [
                                    {
                                        type: 'url_citation',
                                        url: 'https://example.com/style-guide',
                                        title: 'Style Guide'
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        };

        expect(extractOpenAiAnnotationCitations(raw)).toEqual([
            {
                attributionType: 'tool_url',
                sourceLabel: 'Style Guide',
                sourceId: 'https://example.com/style-guide',
                url: 'https://example.com/style-guide',
                title: 'Style Guide',
                citedText: undefined,
                startCharIndex: undefined,
                endCharIndex: undefined
            }
        ]);
    });
});
