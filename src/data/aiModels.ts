export type AiProvider = 'anthropic' | 'openai' | 'google';

export interface CuratedModel {
    id: string;
    label: string;
    guidance: string;
    link?: string;
}

/*
 * User-facing model picker entries.
 *
 * Policy (2026-05-22): one top model per provider, plus a Google
 * fast/deep split where the speed/depth tradeoff is a quality dimension.
 * The picker UX (provider dropdown → model dropdown) stays in place
 * even with a single picker entry per provider, so the catalog can be
 * re-expanded later without UI surgery.
 *
 * See docs/engineering/standards/model-promotion.md for the promotion
 * policy when a new model is being evaluated for replacement.
 */
export const CURATED_MODELS: Record<AiProvider, CuratedModel[]> = {
    openai: [
        {
            id: 'gpt-5.5',
            label: 'GPT-5.5',
            guidance: "→ GPT-5.5 (1,050,000 context). Current OpenAI flagship for complex reasoning. RT uses the Responses API path with prompt caching. [FYI](https://platform.openai.com/docs/models)",
        },
    ],
    anthropic: [
        {
            id: 'claude-opus-4-7',
            label: 'Claude Opus 4.7',
            guidance: "Claude Opus 4.7 (1,000,000 context). RT's Anthropic lane — uses the document-citation and prompt-caching path RT relies on. [FYI](https://docs.anthropic.com/en/docs/build-with-claude/citations)",
        },
    ],
    google: [
        {
            id: 'gemini-3.1-pro-preview',
            label: 'Google 3.1 Pro Preview',
            guidance: "→ Google 3.1 Pro Preview (1,048,576 context). Depth lane for Google — best for narrative reasoning. Preview status: no GA release yet. Supports Search grounding; cached content and grounded citations are mutually exclusive per Google's API. [FYI](https://ai.google.dev/gemini-api/docs/models)",
        },
        {
            id: 'gemini-3.5-flash',
            label: 'Google 3.5 Flash',
            guidance: "Google 3.5 Flash (1,048,576 context). Speed lane for Google — best for structured extraction at lower latency. Different reasoning style than Pro, not just faster. [FYI](https://ai.google.dev/gemini-api/docs/models)",
        },
    ],
};
