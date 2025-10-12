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
  
  // Get friendly model name for filename
  const friendlyModelForFilename = (() => {
    const mid = (payload.modelId || '').toLowerCase();
    const provider = payload.provider.toLowerCase();
    if (provider === 'anthropic') {
      if (mid.includes('sonnet-4-5') || mid.includes('sonnet-4.5')) return 'Claude Sonnet 4.5';
      if (mid.includes('opus-4-1') || mid.includes('opus-4.1')) return 'Claude Opus 4.1';
      if (mid.includes('sonnet-4')) return 'Claude Sonnet 4';
      if (mid.includes('opus-4')) return 'Claude Opus 4';
    } else if (provider === 'gemini') {
      if (mid.includes('2.5-pro') || mid.includes('2-5-pro')) return 'Gemini 2.5 Pro';
    } else if (provider === 'openai') {
      if (mid.includes('gpt-4.1') || mid.includes('gpt-4-1')) return 'GPT-4.1';
    }
    return payload.modelId;
  })();
  
  // Format: "Process Type — Model — Timestamp"
  const processType = payload.prefix === 'Gossamer' ? 'Gossamer Analysis' : 'Scene Processed';
  const fileName = `${processType} — ${friendlyModelForFilename} — ${ts}.md`;
  const file = `${folder}/${fileName}`;
  
  // Format timestamp as readable date-time (e.g., "2025-10-12 14:30:45")
  const readableTimestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  
  // Create title in format: "Process Type — Model — Timestamp"
  const title = `${processType} — ${friendlyModelForFilename} — ${readableTimestamp}`;
  
  let fileContent = `# ${title}\n\n`;
  fileContent += `**Provider:** ${payload.provider}\n`;
  fileContent += `**Model:** ${friendlyModelForFilename}\n`;
  fileContent += `**Model ID:** ${payload.modelId}\n`;
  fileContent += `**Timestamp:** ${new Date().toISOString()}\n\n`;
  
  fileContent += `## Request Sent\n\n`;
  fileContent += `\`\`\`json\n${JSON.stringify(payload.request, null, 2)}\n\`\`\`\n\n`;
  
  fileContent += `## Response Received\n\n`;
  fileContent += `\`\`\`json\n${JSON.stringify(payload.response, null, 2)}\n\`\`\`\n\n`;
  
  if (payload.parsed) {
    fileContent += `## Parsed Result\n\n`;
    fileContent += `\`\`\`json\n${JSON.stringify(payload.parsed, null, 2)}\n\`\`\`\n`;
  }
  
  try {
    try { await vault.createFolder(folder); } catch {}
    await vault.create(file, fileContent.trim());
  } catch (e) {
    console.error('[AI][log] Failed to write log:', e);
    new Notice('Failed to write AI log.');
  }
}


