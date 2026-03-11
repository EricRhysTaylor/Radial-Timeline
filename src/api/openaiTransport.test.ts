import { describe, expect, it } from 'vitest';
import { isResponsesTransportModelId, resolveOpenAiTransportLane } from './openaiTransport';

describe('openai transport lane resolver', () => {
    it('routes GPT-5.4 Pro IDs to Responses lane', () => {
        expect(isResponsesTransportModelId('gpt-5.4-pro')).toBe(true);
        expect(isResponsesTransportModelId('gpt-5.4-pro-2026-03-05')).toBe(true);
        expect(resolveOpenAiTransportLane('gpt-5.4-pro')).toBe('responses');
        expect(resolveOpenAiTransportLane('gpt-5.4-pro-2026-03-05')).toBe('responses');
    });

    it('keeps GPT-5.4 and GPT-5.3 on chat completions lane', () => {
        expect(isResponsesTransportModelId('gpt-5.4')).toBe(false);
        expect(isResponsesTransportModelId('gpt-5.3')).toBe(false);
        expect(resolveOpenAiTransportLane('gpt-5.4')).toBe('chat_completions');
        expect(resolveOpenAiTransportLane('gpt-5.3')).toBe('chat_completions');
    });
});
