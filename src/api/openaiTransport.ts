export type OpenAiTransportLane = 'chat_completions' | 'responses';

const OPENAI_RESPONSES_MODEL_IDS = new Set<string>([
    'gpt-5.4-pro',
    'gpt-5.4-pro-2026-03-05'
]);

export function isResponsesTransportModelId(modelId: string): boolean {
    return OPENAI_RESPONSES_MODEL_IDS.has((modelId || '').trim());
}

export function resolveOpenAiTransportLane(modelId: string): OpenAiTransportLane {
    return isResponsesTransportModelId(modelId) ? 'responses' : 'chat_completions';
}
