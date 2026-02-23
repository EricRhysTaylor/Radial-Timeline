import type { Capability, ModelInfo } from '../types';

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
        line: 'claude-opus',
        tier: 'DEEP',
        capabilities: [...DEEP_CAPS],
        personality: { reasoning: 10, writing: 10, determinism: 9 },
        contextWindow: 200000,
        maxOutput: 16000,
        releasedAt: '2026-02-04',
        status: 'stable'
    },
    {
        provider: 'anthropic',
        id: 'claude-sonnet-4-6',
        alias: 'claude-sonnet-4.6',
        label: 'Claude Sonnet 4.6',
        line: 'claude-sonnet',
        tier: 'BALANCED',
        capabilities: [...BALANCED_CAPS, 'highOutputCap'],
        personality: { reasoning: 9, writing: 9, determinism: 9 },
        contextWindow: 200000,
        maxOutput: 16000,
        releasedAt: '2026-02-17',
        status: 'stable'
    },
    {
        provider: 'anthropic',
        id: 'claude-sonnet-4-5-20250929',
        alias: 'claude-sonnet-4.5',
        label: 'Claude Sonnet 4.5',
        line: 'claude-sonnet',
        tier: 'BALANCED',
        capabilities: [...BALANCED_CAPS, 'highOutputCap'],
        personality: { reasoning: 9, writing: 9, determinism: 9 },
        contextWindow: 200000,
        maxOutput: 16000,
        releasedAt: '2025-09-29',
        status: 'legacy'
    },
    {
        provider: 'openai',
        id: 'gpt-5.2-chat-latest',
        alias: 'gpt-5.2-latest',
        label: 'GPT-5.2',
        line: 'gpt-5',
        tier: 'BALANCED',
        capabilities: [...BALANCED_CAPS, 'highOutputCap', 'toolCalling', 'functionCalling'],
        personality: { reasoning: 9, writing: 8, determinism: 9 },
        contextWindow: 400000,
        maxOutput: 16000,
        status: 'stable'
    },
    {
        provider: 'openai',
        id: 'gpt-5.1-chat-latest',
        alias: 'gpt-5.1-latest',
        label: 'GPT-5.1',
        line: 'gpt-5',
        tier: 'BALANCED',
        capabilities: [...BALANCED_CAPS, 'highOutputCap', 'toolCalling', 'functionCalling'],
        personality: { reasoning: 8, writing: 8, determinism: 9 },
        contextWindow: 200000,
        maxOutput: 16000,
        status: 'stable'
    },
    {
        provider: 'google',
        id: 'gemini-3.1-pro-preview',
        alias: 'gemini-3.1-pro-preview',
        label: 'Gemini 3.1 Pro Preview',
        line: 'gemini-pro',
        tier: 'DEEP',
        capabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap', 'streaming'],
        personality: { reasoning: 9, writing: 8, determinism: 8 },
        contextWindow: 1048576,
        maxOutput: 65536,
        status: 'stable'
    },
    {
        provider: 'google',
        id: 'gemini-pro-latest',
        alias: 'gemini-pro-latest',
        label: 'Gemini Pro Latest',
        line: 'gemini-pro',
        tier: 'DEEP',
        capabilities: ['longContext', 'jsonStrict', 'reasoningStrong', 'highOutputCap', 'streaming'],
        personality: { reasoning: 9, writing: 8, determinism: 8 },
        contextWindow: 1048576,
        maxOutput: 65536,
        status: 'legacy'
    },
    {
        provider: 'google',
        id: 'gemini-2.5-flash',
        alias: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash',
        line: 'gemini-flash',
        tier: 'FAST',
        capabilities: ['longContext', 'jsonStrict', 'highOutputCap', 'streaming'],
        personality: { reasoning: 7, writing: 7, determinism: 8 },
        contextWindow: 1048576,
        maxOutput: 65536,
        status: 'stable'
    },
    {
        provider: 'google',
        id: 'gemini-flash-latest',
        alias: 'gemini-flash-latest',
        label: 'Gemini Flash Latest',
        line: 'gemini-flash',
        tier: 'FAST',
        capabilities: ['longContext', 'jsonStrict', 'highOutputCap', 'streaming'],
        personality: { reasoning: 7, writing: 7, determinism: 8 },
        contextWindow: 1048576,
        maxOutput: 65536,
        status: 'legacy'
    },
    {
        provider: 'ollama',
        id: 'llama3',
        alias: 'ollama-llama3',
        label: 'Ollama Llama 3',
        line: 'ollama-llama',
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
        line: 'ollama-local',
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

export function findBuiltinByAlias(alias: string): ModelInfo | undefined {
    return BUILTIN_MODELS.find(model => model.alias === alias);
}

export function findBuiltinByProviderModel(provider: ModelInfo['provider'], modelId: string): ModelInfo | undefined {
    return BUILTIN_MODELS.find(model => model.provider === provider && model.id === modelId);
}
