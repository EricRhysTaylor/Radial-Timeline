export type AiProvider = 'anthropic' | 'openai' | 'google';

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
            guidance: "→ GPT-5.4 (1,050,000 context). GPT-5.4 Pro remains a separate lane and now routes through OpenAI Responses in RT. [FYI](https://platform.openai.com/docs/models)",
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
    google: [
        {
            id: 'gemini-2.5-pro',
            label: 'Google 2.5 Pro',
            guidance: "→ Google 2.5 Pro (1,048,576 context). Stable Google lane with Search grounding support; RT now maps grounding metadata into Inquiry Brief sources. [FYI](https://ai.google.dev/)",
        },
        {
            id: 'gemini-3.1-pro-preview',
            label: 'Google 3.1 Pro Preview',
            guidance: "Google 3.1 Pro Preview remains the experimental Google lane in RT. Use Google 2.5 Pro when grounded citations need to be dependable. [FYI](https://ai.google.dev/)",
        },
    ],
};
