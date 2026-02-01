import type { Vault, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';

export type ParsedSceneAnalysis = { 'previousSceneAnalysis': string; 'currentSceneAnalysis': string; 'nextSceneAnalysis': string };

export async function updateSceneAnalysis(
  vault: Vault,
  file: TFile,
  parsedAnalysis: ParsedSceneAnalysis,
  plugin: RadialTimelinePlugin,
  modelIdUsed: string | null
): Promise<boolean> {
  try {
    const toArray = (block: string): string[] =>
      block
        .split('\n')
        .map(s => s.replace(/^\s*-\s*/, '').trim())
        .filter(Boolean);

    await plugin.app.fileManager.processFrontMatter(file, (fm) => {
      const fmObj = fm as Record<string, unknown>;
      delete fmObj['previousSceneAnalysis'];
      delete fmObj['currentSceneAnalysis'];
      delete fmObj['nextSceneAnalysis'];

      // Use single-field pattern: replace flag with timestamp (cleaner than two fields)
      const now = new Date();
      const timestamp = now.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      } as Intl.DateTimeFormatOptions);

      // Remove old separate "Pulse Last Updated" field if it exists (legacy cleanup)
      delete fmObj['Pulse Last Updated'];

      const pulseKeys = [
        'Pulse Update',
        'PulseUpdate',
        'pulseupdate',
        'Beats Update',
        'BeatsUpdate',
        'beatsupdate',
        'Review Update',
        'ReviewUpdate',
        'reviewupdate'
      ];
      let updatedFlag = false;
      for (const key of pulseKeys) {
        if (Object.prototype.hasOwnProperty.call(fmObj, key)) {
          // Replace flag with timestamp string (interpreted as false by normalizeBooleanValue)
          fmObj[key] = `${timestamp}${modelIdUsed ? ` by ${modelIdUsed}` : ' by Unknown Model'}`;
          updatedFlag = true;
          break; // Only update the first matching key
        }
      }
      if (!updatedFlag) {
        fmObj['Pulse Update'] = `${timestamp}${modelIdUsed ? ` by ${modelIdUsed}` : ' by Unknown Model'}`;
      }

      const b1 = parsedAnalysis['previousSceneAnalysis']?.trim();
      const b2 = parsedAnalysis['currentSceneAnalysis']?.trim();
      const b3 = parsedAnalysis['nextSceneAnalysis']?.trim();
      if (b1) fmObj['previousSceneAnalysis'] = toArray(b1);
      if (b2) fmObj['currentSceneAnalysis'] = toArray(b2);
      if (b3) fmObj['nextSceneAnalysis'] = toArray(b3);
    });
    return true;
  } catch (e) {
    console.error('[updateSceneBeats] Error updating file:', e);
    return false;
  }
}

export async function markPulseProcessed(
  vault: Vault,
  file: TFile,
  plugin: RadialTimelinePlugin,
  modelIdUsed: string | null
): Promise<boolean> {
  try {
    await plugin.app.fileManager.processFrontMatter(file, (fm) => {
      const fmObj = fm as Record<string, unknown>;

      // Use single-field pattern: replace flag with timestamp
      const now = new Date();
      const timestamp = now.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      } as Intl.DateTimeFormatOptions);

      // Remove old separate "Pulse Last Updated" field if it exists (legacy cleanup)
      delete fmObj['Pulse Last Updated'];

      const pulseKeys = [
        'Pulse Update',
        'PulseUpdate',
        'pulseupdate',
        'Beats Update',
        'BeatsUpdate',
        'beatsupdate',
        'Review Update',
        'ReviewUpdate',
        'reviewupdate'
      ];
      let updatedFlag = false;
      for (const key of pulseKeys) {
        if (Object.prototype.hasOwnProperty.call(fmObj, key)) {
          // Replace flag with timestamp string (interpreted as false by normalizeBooleanValue)
          fmObj[key] = `${timestamp}${modelIdUsed ? ` by ${modelIdUsed}` : ' by Unknown Model'}`;
          updatedFlag = true;
          break; // Only update the first matching key
        }
      }
      if (!updatedFlag) {
        fmObj['Pulse Update'] = `${timestamp}${modelIdUsed ? ` by ${modelIdUsed}` : ' by Unknown Model'}`;
      }
    });
    return true;
  } catch (e) {
    console.error('[markPulseProcessed] Error updating pulse flag:', e);
    return false;
  }
}
