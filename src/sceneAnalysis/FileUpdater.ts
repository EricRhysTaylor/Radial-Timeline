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

      const now = new Date();
      const timestamp = now.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      } as Intl.DateTimeFormatOptions);
      fmObj['Beats Last Updated'] = `${timestamp}${modelIdUsed ? ` by ${modelIdUsed}` : ' by Unknown Model'}`;

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
          fmObj[key] = false;
          updatedFlag = true;
        }
      }
      if (!updatedFlag) fmObj['Pulse Update'] = false;

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

