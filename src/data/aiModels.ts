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
            id: 'gpt-5.1-2025-11-13',
            label: 'GPT-5.1 (Nov 2025 build)',
            tier: 'premium',
            guidance: 'Deep-think powerhouse from OpenAI—best when you need maximum technical rigor across massive manuscripts. [FYI](https://platform.openai.com/docs/models#gpt-5-1)',
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
            id: 'models/gemini-2.5-pro',
            label: 'Gemini 2.5 Pro',
            tier: 'premium',
            guidance: 'Google’s momentum analyst—huge context window and strong beat-level analytics for structural planning. [FYI](https://ai.google.dev/gemini-api/docs/models/gemini#gemini-25-pro)',
        },
    ],
};
