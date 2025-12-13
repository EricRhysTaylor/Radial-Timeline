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
            id: 'gpt-5.2-chat-latest',
            label: 'GPT-5.2 Chat (Latest)',
            guidance: "OpenAI's top chat model. Strongest reasoning and instruction following for narrative analysis.",
        },
        {
            id: 'gpt-5.1-chat-latest',
            label: 'GPT-5.1 (Latest)',
            guidance: "OpenAI's previous flagship. Strong reasoning and instruction following. [FYI](https://platform.openai.com/docs/models)",
        },
    ],
    anthropic: [
        {
            id: 'claude-opus-4-5-20251101',
            label: 'Claude Opus 4.5',
            guidance: "Anthropic's most powerful model. Unparalleled nuance and deep structural analysis, though slower than Sonnet. [FYI](https://docs.anthropic.com/en/docs/about-claude/models)",
        },
        {
            id: 'claude-sonnet-4-5-20250929',
            label: 'Claude Sonnet 4.5',
            guidance: "Anthropic's balanced creative specialist—excellent narrative instincts and polished first-draft feedback. [FYI](https://docs.anthropic.com/en/docs/about-claude/models)",
        },
    ],
    gemini: [
        {
            id: 'gemini-3-pro-preview',
            label: 'Gemini 3 Pro Preview',
            guidance: "Google's latest reasoning engine—massive context and advanced problem solving for complex narrative analysis.",
        },
        {
            id: 'gemini-2.5-pro',
            label: 'Gemini 2.5 Pro',
            guidance: "Google's stable high-intelligence model. Reliable performance and large context window.",
        },
    ],
};
