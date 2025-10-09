/*
 * Unified AI exchange logging
 */
import type RadialTimelinePlugin from '../main';
import type { Vault } from 'obsidian';
import { Notice } from 'obsidian';

export interface LogPayload {
  prefix: 'Gossamer' | 'Beats';
  provider: string;
  modelId: string;
  request: unknown;
  response: unknown;
  parsed?: unknown;
  label?: string;
}

export async function logExchange(plugin: RadialTimelinePlugin, vault: Vault, payload: LogPayload): Promise<void> {
  if (!plugin.settings.logApiInteractions) return;
  const folder = 'AI';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `${folder}/${payload.prefix}-${ts}-${payload.label || 'Run'}.json`;
  const body = {
    provider: payload.provider,
    modelId: payload.modelId,
    timestamp: new Date().toISOString(),
    request: payload.request,
    response: payload.response,
    parsed: payload.parsed,
  };
  try {
    try { await vault.createFolder(folder); } catch {}
    await vault.create(file, JSON.stringify(body, null, 2));
  } catch (e) {
    console.error('[AI][log] Failed to write log:', e);
    new Notice('Failed to write AI log.');
  }
}


