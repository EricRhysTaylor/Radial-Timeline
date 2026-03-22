import type RadialTimelinePlugin from '../../main';
import { callOpenAiResponsesApi } from '../../api/openaiApi';
import { classifyProviderError } from '../../api/providerErrors';
import { getCredential } from '../credentials/credentials';
import type { AIProvider, Capability, GenerateJsonRequest, GenerateTextRequest, ProviderExecutionResult } from '../types';

const CAPS: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'toolCalling', 'functionCalling', 'streaming'];

export class OpenAIProvider implements AIProvider {
    id = 'openai' as const;

    constructor(private plugin: RadialTimelinePlugin) {}

    supports(capability: Capability): boolean {
        return CAPS.includes(capability);
    }

    async generateText(req: GenerateTextRequest): Promise<ProviderExecutionResult> {
        const apiKey = await getCredential(this.plugin, 'openai');
        const result = await callOpenAiResponsesApi(
            apiKey,
            req.modelId,
            req.systemPrompt ?? null,
            req.userPrompt,
            req.maxOutputTokens,
            undefined,
            req.temperature,
            req.topP
        );
        return result.success
            ? {
                success: true,
                content: result.content,
                responseData: result.responseData,
                aiStatus: 'success',
                aiProvider: 'openai',
                aiModelRequested: req.modelId,
                aiModelResolved: req.modelId,
                citations: result.citations,
                aiTransportLane: 'responses'
            }
            : {
                success: false,
                content: result.content,
                responseData: result.responseData,
                aiStatus: classifyProviderError(result).aiStatus,
                aiReason: classifyProviderError(result).aiReason,
                aiProvider: 'openai',
                aiModelRequested: req.modelId,
                aiModelResolved: req.modelId,
                error: result.error,
                citations: result.citations,
                aiTransportLane: 'responses'
            };
    }

    async generateJson(req: GenerateJsonRequest): Promise<ProviderExecutionResult> {
        const apiKey = await getCredential(this.plugin, 'openai');
        const result = await callOpenAiResponsesApi(
            apiKey,
            req.modelId,
            req.systemPrompt ?? null,
            req.userPrompt,
            req.maxOutputTokens,
            {
                type: 'json_schema',
                json_schema: {
                    name: 'ai_result',
                    schema: req.jsonSchema
                }
            },
            req.temperature,
            req.topP
        );
        return result.success
            ? {
                success: true,
                content: result.content,
                responseData: result.responseData,
                aiStatus: 'success',
                aiProvider: 'openai',
                aiModelRequested: req.modelId,
                aiModelResolved: req.modelId,
                citations: result.citations,
                aiTransportLane: 'responses'
            }
            : {
                success: false,
                content: result.content,
                responseData: result.responseData,
                aiStatus: classifyProviderError(result).aiStatus,
                aiReason: classifyProviderError(result).aiReason,
                aiProvider: 'openai',
                aiModelRequested: req.modelId,
                aiModelResolved: req.modelId,
                error: result.error,
                citations: result.citations,
                aiTransportLane: 'responses'
            };
    }
}
