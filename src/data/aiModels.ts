export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export type ModelTier = 'premium' | 'balanced' | 'budget';

export interface CuratedModel {
    id: string;
    label: string;
    tier: ModelTier;
    guidance: string;
    link?: string;
}

export const CURATED_MODELS: Record<AiProvider, CuratedModel[]> = {
    openai: [
        {
            id: 'gpt-5.1-chat-latest',
            label: 'GPT-5.1 (Latest)',
            tier: 'premium',
            guidance: 'OpenAI’s flagship model. Best-in-class reasoning and instruction following for complex narrative analysis. [FYI](https://platform.openai.com/docs/models)',
        },
    ],
    anthropic: [
        {
            id: 'claude-sonnet-4-5-20250929',
            label: 'Claude Sonnet 4.5',
            tier: 'premium',
            guidance: 'Anthropic’s creative specialist—excellent narrative instincts and polished first-draft feedback for writers. [FYI](https://docs.anthropic.com/en/docs/about-claude/models#claude-sonnet-45)',
        },
    ],
    gemini: [
        {
            id: 'gemini-3-pro-preview',
            label: 'Gemini 3 Pro Preview',
            tier: 'premium',
            guidance: 'Google’s latest reasoning engine—massive context and advanced problem solving for complex narrative analysis.',
        },
    ],
};
