export type PromptTemplateRenderer = (vars: Record<string, unknown>) => { systemPrompt?: string; userPrompt: string };

const toText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value;
    return String(value);
};

export const PROMPT_TEMPLATES: Record<string, PromptTemplateRenderer> = {
    'inquiry.default': (vars) => ({
        systemPrompt: toText(vars.systemPrompt),
        userPrompt: toText(vars.userPrompt)
    }),
    'inquiry.omnibus': (vars) => ({
        systemPrompt: toText(vars.systemPrompt),
        userPrompt: toText(vars.userPrompt)
    }),
    'generic.text': (vars) => ({
        systemPrompt: toText(vars.systemPrompt),
        userPrompt: toText(vars.userPrompt)
    })
};
