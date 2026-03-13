import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./anthropicApi', async importOriginal => {
    const actual = await importOriginal<typeof import('./anthropicApi')>();
    return {
        ...actual,
        callAnthropicApi: vi.fn()
    };
});

vi.mock('../ai/credentials/credentials', () => ({
    getCredential: vi.fn()
}));

import { callProvider } from './providerRouter';
import { callAnthropicApi } from './anthropicApi';
import { getCredential } from '../ai/credentials/credentials';

const mockedCallAnthropicApi = vi.mocked(callAnthropicApi);
const mockedGetCredential = vi.mocked(getCredential);

function buildPlugin() {
    return {
        settings: {
            defaultAiProvider: 'anthropic',
            openaiModelId: '',
            anthropicModelId: 'claude-sonnet-4-6',
            geminiModelId: '',
            localModelId: '',
            localBaseUrl: 'http://localhost:11434/v1'
        }
    } as never;
}

describe('providerRouter Anthropic structured output', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedGetCredential.mockResolvedValue('test-key');
        mockedCallAnthropicApi.mockResolvedValue({
            success: true,
            content: '{"ok":true}',
            responseData: { model: 'claude-sonnet-4-6' }
        });
    });

    it('passes JSON schema through the Anthropic adapter and disables thinking when tool use is forced', async () => {
        const jsonSchema = {
            type: 'object',
            properties: {
                ok: { type: 'boolean' }
            },
            required: ['ok']
        };

        const result = await callProvider(buildPlugin(), {
            provider: 'anthropic',
            modelId: 'claude-sonnet-4-6',
            userPrompt: 'hello',
            systemPrompt: 'sys',
            jsonSchema,
            thinkingBudgetTokens: 4096
        });

        expect(mockedCallAnthropicApi).toHaveBeenCalledWith(
            'test-key',
            'claude-sonnet-4-6',
            'sys',
            'hello',
            4000,
            true,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            jsonSchema
        );
        expect(result.requestPayload).toMatchObject({
            model: 'claude-sonnet-4-6',
            tool_choice: {
                type: 'tool',
                name: 'record_structured_response'
            },
            tools: [{
                name: 'record_structured_response',
                input_schema: jsonSchema
            }]
        });
        expect((result.requestPayload as Record<string, unknown>).thinking).toBeUndefined();
    });
});
