export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export interface CuratedModel {
    id: string;
    label: string;
    guidance: string;
    link?: string;
}

export const CURATED_MODELS: Record<AiProvider, CuratedModel[]> = {
    openai: [
        {
            id: 'gpt-5.4',
            label: 'GPT-5.4',
            guidance: "→ GPT-5.4 (1,050,000 context). GPT-5.4 Pro remains a separate lane; full multi-turn positioning is documented on the Responses API while RT currently routes OpenAI through Chat Completions. [FYI](https://platform.openai.com/docs/models)",
        },
    ],
    anthropic: [
        {
            id: 'claude-opus-4-6',
            label: 'Claude Opus 4.6',
            guidance: "Claude Opus 4.6 with direct manuscript citation flow in RT Inquiry (document blocks + citations). [FYI](https://platform.claude.com/docs/en/build-with-claude/citations)",
        },
        {
            id: 'claude-sonnet-4-6',
            label: 'Claude Sonnet 4.6',
            guidance: "Claude Sonnet 4.6 with the same RT manuscript-citation workflow used by Inquiry. [FYI](https://platform.claude.com/docs/en/build-with-claude/citations)",
        },
    ],
    gemini: [
        {
            id: 'gemini-3.1-pro-preview',
            label: 'Gemini 3.1 Pro Preview',
            guidance: "→ Gemini 3.1 Pro Preview (1,048,576 context). Google grounding attribution is provider-supported, but not yet wired into RT Inquiry output mapping. [FYI](https://ai.google.dev/gemini-api/docs/models)",
        },
    ],
};
