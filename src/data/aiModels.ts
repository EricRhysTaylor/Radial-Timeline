export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export type ModelTier = 'premium' | 'balanced' | 'budget';

export interface CuratedModel {
    id: string;
    label: string;
    tier: ModelTier;
    guidance: string;
}

export const CURATED_MODELS: Record<AiProvider, CuratedModel[]> = {
    openai: [
        {
            id: 'gpt-5.1-2025-11-13',
            label: 'GPT-5.1 (Nov 2025 build)',
            tier: 'premium',
            guidance: 'Use for the most demanding manuscript-scale analysis. Highest reasoning depth and context budget available from OpenAI.',
        },
        {
            id: 'gpt-4.1',
            label: 'GPT-4.1',
            tier: 'balanced',
            guidance: 'Still a deep reasoning model with broad availability. Use when you want a reliable fallback that can handle heavy triplet runs.',
        },
    ],
    anthropic: [
        {
            id: 'claude-sonnet-4-5-20250929',
            label: 'Claude Sonnet 4.5',
            tier: 'premium',
            guidance: 'Latest Anthropic flagship for creative work—best choice when you need polished triplet reports and professional-quality narrative feedback on the first try.',
        },
        {
            id: 'claude-opus-4-1-20250805',
            label: 'Claude Opus 4.1',
            tier: 'balanced',
            guidance: 'Still excellent for deep analysis, but use this when you want slightly lower cost while maintaining long-context reasoning.',
        },
    ],
    gemini: [
        {
            id: 'models/gemini-2.5-pro',
            label: 'Gemini 2.5 Pro',
            tier: 'premium',
            guidance: 'Use for the most demanding beat momentum and range analyses—best accuracy and longest context from Gemini.',
        },
        {
            id: 'gemini-2.0-flash-exp',
            label: 'Gemini 2.0 Flash Experimental',
            tier: 'balanced',
            guidance: 'Fastest thinking-capable Gemini model—great when you want lower latency but still need reasoning headroom.',
        },
    ],
};
