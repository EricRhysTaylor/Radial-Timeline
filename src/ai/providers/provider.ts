import type RadialTimelinePlugin from '../../main';
import type { AIProvider as AIProviderInterface, AIProviderId, Capability } from '../types';
import { OpenAIProvider } from './openaiProvider';
import { AnthropicProvider } from './anthropicProvider';
import { GoogleProvider } from './googleProvider';
import { OllamaProvider } from './ollamaProvider';

export { OpenAIProvider, AnthropicProvider, GoogleProvider, OllamaProvider };
export type { AIProviderInterface as AIProvider };

export function defaultCapabilitiesForProvider(provider: AIProviderId): Capability[] {
    if (provider === 'anthropic') return ['longContext', 'reasoningStrong'];
    if (provider === 'google') return ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap', 'streaming'];
    if (provider === 'ollama') return ['jsonStrict'];
    if (provider === 'openai') return ['longContext', 'jsonStrict', 'reasoningStrong', 'toolCalling', 'functionCalling'];
    return [];
}

export function buildProviders(plugin: RadialTimelinePlugin): Record<AIProviderId, AIProviderInterface | null> {
    return {
        openai: new OpenAIProvider(plugin),
        anthropic: new AnthropicProvider(plugin),
        google: new GoogleProvider(plugin),
        ollama: new OllamaProvider(plugin),
        none: null
    };
}
