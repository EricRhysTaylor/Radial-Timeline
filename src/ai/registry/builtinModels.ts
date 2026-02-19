import type { Capability, ModelInfo, ModelProfile, ModelProfileName } from '../types';

const DEEP_CAPS: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'];
const BALANCED_CAPS: Capability[] = ['longContext', 'jsonStrict', 'reasoningStrong'];
const FAST_CAPS: Capability[] = ['jsonStrict', 'streaming'];
const LOCAL_CAPS: Capability[] = ['jsonStrict'];

export const BUILTIN_MODELS: ModelInfo[] = [
    {
        provider: 'anthropic',
        id: 'claude-opus-4-6',
        alias: 'claude-opus-4.6',
        label: 'Claude Opus 4.6',
        tier: 'DEEP',
        capabilities: [...DEEP_CAPS],
        personality: { reasoning: 10, writing: 10, determinism: 9 },
        contextWindow: 200000,
        maxOutput: 16000,
        status: 'stable'
    },
    {
        provider: 'anthropic',
        id: 'claude-sonnet-4-5-20250929',
        alias: 'claude-sonnet-4.5',
        label: 'Claude Sonnet 4.5',
        tier: 'BALANCED',
        capabilities: [...BALANCED_CAPS, 'highOutputCap'],
        personality: { reasoning: 9, writing: 9, determinism: 9 },
        contextWindow: 200000,
        maxOutput: 16000,
        status: 'stable'
    },
    {
        provider: 'openai',
        id: 'gpt-5.2-chat-latest',
        alias: 'gpt-5.2-latest',
        label: 'GPT-5.2 (Latest)',
        tier: 'BALANCED',
        capabilities: [...BALANCED_CAPS, 'toolCalling', 'functionCalling'],
        personality: { reasoning: 9, writing: 8, determinism: 9 },
        contextWindow: 400000,
        maxOutput: 16000,
        status: 'stable'
    },
    {
        provider: 'openai',
        id: 'gpt-5.1-chat-latest',
        alias: 'gpt-5.1-latest',
        label: 'GPT-5.1 (Latest)',
        tier: 'BALANCED',
        capabilities: [...BALANCED_CAPS, 'toolCalling', 'functionCalling'],
        personality: { reasoning: 8, writing: 8, determinism: 9 },
        contextWindow: 200000,
        maxOutput: 16000,
        status: 'stable'
    },
    {
        provider: 'google',
        id: 'gemini-pro-latest',
        alias: 'gemini-pro-latest',
        label: 'Gemini Pro (Latest)',
        tier: 'DEEP',
        capabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap', 'streaming'],
        personality: { reasoning: 9, writing: 8, determinism: 8 },
        contextWindow: 1000000,
        maxOutput: 65536,
        status: 'stable'
    },
    {
        provider: 'google',
        id: 'gemini-flash-latest',
        alias: 'gemini-flash-latest',
        label: 'Gemini Flash (Latest)',
        tier: 'FAST',
        capabilities: ['longContext', 'jsonStrict', 'highOutputCap', 'streaming'],
        personality: { reasoning: 7, writing: 7, determinism: 8 },
        contextWindow: 1000000,
        maxOutput: 65536,
        status: 'stable'
    },
    {
        provider: 'ollama',
        id: 'llama3',
        alias: 'ollama-llama3',
        label: 'Ollama Llama 3',
        tier: 'LOCAL',
        capabilities: [...LOCAL_CAPS],
        personality: { reasoning: 6, writing: 6, determinism: 5 },
        contextWindow: 32000,
        maxOutput: 4000,
        status: 'stable'
    },
    {
        provider: 'ollama',
        id: 'local-model',
        alias: 'ollama-local-model',
        label: 'Local Model',
        tier: 'LOCAL',
        capabilities: [...LOCAL_CAPS],
        personality: { reasoning: 5, writing: 5, determinism: 4 },
        contextWindow: 32000,
        maxOutput: 4000,
        status: 'legacy'
    },
    {
        provider: 'none',
        id: 'none',
        alias: 'none',
        label: 'None',
        tier: 'FAST',
        capabilities: [...FAST_CAPS],
        personality: { reasoning: 0, writing: 0, determinism: 10 },
        contextWindow: 0,
        maxOutput: 0,
        status: 'legacy'
    }
];

export const MODEL_PROFILES: Record<ModelProfileName, ModelProfile> = {
    deepWriter: {
        tier: 'DEEP',
        minReasoning: 8,
        minWriting: 8,
        minDeterminism: 7,
        requiredCapabilities: ['longContext', 'jsonStrict'],
        weighting: {
            reasoning: 0.4,
            writing: 0.4,
            determinism: 0.2
        }
    },
    deepReasoner: {
        tier: 'DEEP',
        minReasoning: 9,
        minWriting: 6,
        minDeterminism: 8,
        requiredCapabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap'],
        weighting: {
            reasoning: 0.55,
            writing: 0.15,
            determinism: 0.3
        }
    },
    balancedAnalysis: {
        tier: 'BALANCED',
        minReasoning: 7,
        minWriting: 7,
        minDeterminism: 8,
        requiredCapabilities: ['jsonStrict', 'reasoningStrong'],
        weighting: {
            reasoning: 0.4,
            writing: 0.3,
            determinism: 0.3
        }
    }
};

export function findBuiltinByAlias(alias: string): ModelInfo | undefined {
    return BUILTIN_MODELS.find(model => model.alias === alias);
}

export function findBuiltinByProviderModel(provider: ModelInfo['provider'], modelId: string): ModelInfo | undefined {
    return BUILTIN_MODELS.find(model => model.provider === provider && model.id === modelId);
}
