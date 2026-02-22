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
            label: 'GPT-5.2',
            guidance: "→ GPT-5.2. Exceptional instruction following and structured output for precise scene analysis. [FYI](https://platform.openai.com/docs/models)",
        },
    ],
    anthropic: [
        {
            id: 'claude-opus-4-6',
            label: 'Claude Opus 4.6',
            guidance: "Most powerful Claude. Unparalleled nuance and deep structural analysis for complex narratives. [FYI](https://www.anthropic.com/claude)",
        },
        {
            id: 'claude-sonnet-4-6',
            label: 'Claude Sonnet 4.6',
            guidance: "Balanced creative specialist—excellent narrative instincts and polished first-draft feedback. [FYI](https://www.anthropic.com/claude)",
        },
    ],
    gemini: [
        {
            id: 'gemini-3.1-pro-preview',
            label: 'Gemini 3.1 Pro Preview',
            guidance: "→ Gemini 3.1 Pro Preview. 1M+ token context and advanced multimodal reasoning for complex narrative structures. [FYI](https://ai.google.dev/gemini-api/docs/models)",
        },
    ],
};
