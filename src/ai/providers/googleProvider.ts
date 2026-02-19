import type RadialTimelinePlugin from '../../main';
import { callProvider } from '../../api/providerRouter';
import type { AIProvider, Capability, GenerateJsonRequest, GenerateTextRequest, ProviderExecutionResult } from '../types';

const CAPS: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap', 'streaming'];

export class GoogleProvider implements AIProvider {
    id = 'google' as const;

    constructor(private plugin: RadialTimelinePlugin) {}

    supports(capability: Capability): boolean {
        return CAPS.includes(capability);
    }

    async generateText(req: GenerateTextRequest): Promise<ProviderExecutionResult> {
        const result = await callProvider(this.plugin, {
            provider: 'gemini',
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
            provider: 'gemini',
            internalAdapterAccess: true,
            modelId: req.modelId,
            systemPrompt: req.systemPrompt ?? null,
            userPrompt: req.userPrompt,
            maxTokens: req.maxOutputTokens,
            temperature: req.temperature,
            top_p: req.topP,
            jsonSchema: req.jsonSchema
        });
        return result;
    }
}
