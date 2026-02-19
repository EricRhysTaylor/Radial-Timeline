import type RadialTimelinePlugin from '../../main';
import { callProvider } from '../../api/providerRouter';
import type { AIProvider, Capability, GenerateJsonRequest, GenerateTextRequest, ProviderExecutionResult } from '../types';

const CAPS: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'toolCalling', 'functionCalling', 'streaming'];

export class OpenAIProvider implements AIProvider {
    id = 'openai' as const;

    constructor(private plugin: RadialTimelinePlugin) {}

    supports(capability: Capability): boolean {
        return CAPS.includes(capability);
    }

    async generateText(req: GenerateTextRequest): Promise<ProviderExecutionResult> {
        const result = await callProvider(this.plugin, {
            provider: 'openai',
            internalAdapterAccess: true,
            modelId: req.modelId,
            systemPrompt: req.systemPrompt ?? null,
            userPrompt: req.userPrompt,
            maxTokens: req.maxOutputTokens,
            temperature: req.temperature,
            top_p: req.topP
        });
        return result;
    }

    async generateJson(req: GenerateJsonRequest): Promise<ProviderExecutionResult> {
        const result = await callProvider(this.plugin, {
            provider: 'openai',
            internalAdapterAccess: true,
            modelId: req.modelId,
            systemPrompt: req.systemPrompt ?? null,
            userPrompt: req.userPrompt,
            maxTokens: req.maxOutputTokens,
            temperature: req.temperature,
            top_p: req.topP,
            jsonSchema: req.jsonSchema,
            responseFormat: {
                type: 'json_schema',
                json_schema: {
                    name: 'ai_result',
                    schema: req.jsonSchema
                }
            }
        });
        return result;
    }
}
