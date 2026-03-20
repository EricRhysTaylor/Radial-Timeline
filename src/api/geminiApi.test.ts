import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('obsidian', () => ({
    requestUrl: vi.fn()
}));

import * as obsidian from 'obsidian';

import { callGeminiApi, extractGeminiGroundingCitations } from './geminiApi';

const mockedRequestUrl = vi.spyOn(obsidian, 'requestUrl');

describe('gemini grounding citation extraction', () => {
    beforeEach(() => {
        mockedRequestUrl.mockReset();
    });

    it('maps grounding supports and chunks into normalized citations', () => {
        const responseData = {
            candidates: [
                {
                    content: {
                        parts: [{ text: 'Grounded answer.' }]
                    },
                    groundingMetadata: {
                        groundingChunks: [
                            {
                                web: {
                                    uri: 'https://example.com/world-guide',
                                    title: 'World Guide'
                                }
                            }
                        ],
                        groundingSupports: [
                            {
                                segment: {
                                    text: 'the Contest of Standards',
                                    startIndex: 42,
                                    endIndex: 66
                                },
                                groundingChunkIndices: [0]
                            }
                        ]
                    }
                }
            ]
        };

        expect(extractGeminiGroundingCitations(responseData)).toEqual([
            {
                attributionType: 'grounded',
                sourceLabel: 'World Guide',
                sourceId: 'https://example.com/world-guide',
                url: 'https://example.com/world-guide',
                title: 'World Guide',
                citedText: 'the Contest of Standards',
                startCharIndex: 42,
                endCharIndex: 66
            }
        ]);
    });

    it('falls back to chunk-level grounded citations when support segments are absent', () => {
        const responseData = {
            candidates: [
                {
                    content: {
                        parts: [{ text: 'Grounded answer.' }]
                    },
                    groundingMetadata: {
                        groundingChunks: [
                            {
                                web: {
                                    uri: 'https://example.com/notes',
                                    title: 'Notes'
                                }
                            }
                        ]
                    }
                }
            ]
        };

        expect(extractGeminiGroundingCitations(responseData)).toEqual([
            {
                attributionType: 'grounded',
                sourceLabel: 'Notes',
                sourceId: 'https://example.com/notes',
                url: 'https://example.com/notes',
                title: 'Notes',
                citedText: undefined,
                startCharIndex: undefined,
                endCharIndex: undefined
            }
        ]);
    });

    it('requests google_search grounding when citations are enabled', async () => {
        mockedRequestUrl.mockResolvedValue({
            status: 200,
            text: '',
            json: {
                candidates: [
                    {
                        content: {
                            parts: [{ text: 'Grounded answer.' }]
                        }
                    }
                ]
            }
        } as never);

        const response = await callGeminiApi(
            'test-key',
            'gemini-3.1-pro-preview',
            null,
            'Summarize the manuscript.',
            1024,
            0.2,
            undefined,
            false,
            undefined,
            undefined,
            true,
            true
        );

        expect(response.success).toBe(true);
        expect(mockedRequestUrl).toHaveBeenCalledTimes(1);

        const request = mockedRequestUrl.mock.calls[0]?.[0] as { body?: string };
        const parsed = JSON.parse(request.body ?? '{}') as { tools?: Array<Record<string, unknown>> };

        expect(parsed.tools).toEqual([{ google_search: {} }]);
    });
});
