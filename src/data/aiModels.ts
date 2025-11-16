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
            id: 'gpt-4.1',
            label: 'GPT-4.1',
            tier: 'premium',
            guidance: 'Use when you need the deepest reasoning for manuscript-wide triplet analysis or full beat diagnostics.',
        },
        {
            id: 'o4-mini',
            label: 'o4 Mini',
            tier: 'balanced',
            guidance: 'Great default for daily scene triplet work: strong reasoning with better latency and cost.',
        },
        {
            id: 'gpt-4o-mini',
            label: 'gpt-4o mini',
            tier: 'budget',
            guidance: 'Cheapest thinking-capable model—ideal for quick rechecks or outline brainstorming passes.',
        },
    ],
    anthropic: [
        {
            id: 'claude-opus-4-1-20250805',
            label: 'Claude Opus 4.1',
            tier: 'premium',
            guidance: 'Highest ceiling for nuanced literary analysis; reach for it when you need the most reliable, deeply reasoned feedback.',
        },
        {
            id: 'claude-sonnet-4-5-20250929',
            label: 'Claude Sonnet 4.5',
            tier: 'balanced',
            guidance: 'Updated balanced pick. Great for sustained triplet runs and momentum scoring without paying Opus rates.',
        },
        {
            id: 'claude-haiku-4',
            label: 'Claude Haiku 4',
            tier: 'budget',
            guidance: 'Fast, inexpensive option for iterative spot checks once you already have trusted output.',
        },
    ],
    gemini: [
        {
            id: 'gemini-2.5-pro',
            label: 'Gemini 2.5 Pro',
            tier: 'premium',
            guidance: 'Use for the most demanding beat momentum and range analyses—best accuracy across large manuscripts.',
        },
        {
            id: 'gemini-2.0-flash-exp',
            label: 'Gemini 2.0 Flash Exp',
            tier: 'balanced',
            guidance: 'Excellent reasoning at a lower price point. Ideal for repeated scene triplets throughout the week.',
        },
        {
            id: 'gemini-1.5-flash',
            label: 'Gemini 1.5 Flash',
            tier: 'budget',
            guidance: 'Perfect for rapid sanity checks or lightweight passes when experimenting with prompts.',
        },
    ],
};
