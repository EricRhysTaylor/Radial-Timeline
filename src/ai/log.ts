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
  // Build a local-time, file-safe timestamp (e.g., "10-18-2025 08-38-45 AM PDT")
  const localStamp = new Date().toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true, timeZoneName: 'short'
  } as Intl.DateTimeFormatOptions);
  const ts = localStamp.replace(/[\\/:,]/g, '-').replace(/\s+/g, ' ').trim();
  
  // Get model ID for filename
  const friendlyModelForFilename = payload.modelId || 'unknown-model';
  
  // Format: "Process Type — Model — Timestamp"
  const processType = payload.prefix === 'Gossamer' ? 'Gossamer Analysis' : 'Scene Processed';
  const fileName = `${processType} — ${friendlyModelForFilename} — ${ts}.md`;
  const file = `${folder}/${fileName}`;
  
  // Human-friendly local timestamp (e.g., "01-18-2025 8:38:45 AM PDT")
  const readableTimestamp = new Date().toLocaleString(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: 'numeric', minute: '2-digit', second: '2-digit',
    hour12: true, timeZoneName: 'short'
  } as Intl.DateTimeFormatOptions);
  
  // Create title in format: "Process Type — Model — Timestamp"
  const title = `${processType} — ${friendlyModelForFilename} — ${readableTimestamp}`;
  
  let fileContent = `# ${title}\n\n`;
  fileContent += `**Provider:** ${payload.provider}\n`;
  fileContent += `**Model:** ${friendlyModelForFilename}\n`;
  fileContent += `**Model ID:** ${payload.modelId}\n`;
  fileContent += `**Timestamp:** ${readableTimestamp}\n\n`;
  
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


