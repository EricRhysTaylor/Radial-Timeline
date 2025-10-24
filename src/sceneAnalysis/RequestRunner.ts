import type RadialTimelinePlugin from '../main';
import type { Vault } from 'obsidian';

export type Provider = 'openai' | 'anthropic' | 'gemini';

export type AiRunner = (userPrompt: string, subplotName: string | null, commandContext: string, sceneName?: string, tripletInfo?: { prev: string; current: string; next: string }) => Promise<{ result: string | null; modelIdUsed: string | null }>;

export function createAiRunner(plugin: RadialTimelinePlugin, vault: Vault, callAiProvider: (plugin: RadialTimelinePlugin, vault: Vault, userPrompt: string, subplotName: string | null, commandContext: string, sceneName?: string, tripletInfo?: { prev: string; current: string; next: string }) => Promise<{ result: string | null; modelIdUsed: string | null }>): AiRunner {
  return (userPrompt, subplotName, commandContext, sceneName, tripletInfo) => callAiProvider(plugin, vault, userPrompt, subplotName, commandContext, sceneName, tripletInfo);
}


