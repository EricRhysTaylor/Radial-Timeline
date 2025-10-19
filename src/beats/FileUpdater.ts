import type { Vault, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';

export type ParsedBeats = { '1beats': string; '2beats': string; '3beats': string };

export async function updateSceneBeats(
  vault: Vault,
  file: TFile,
  parsedBeats: ParsedBeats,
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
      delete fmObj['1beats'];
      delete fmObj['2beats'];
      delete fmObj['3beats'];

      const now = new Date();
      const timestamp = now.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
      } as Intl.DateTimeFormatOptions);
      fmObj['Beats Last Updated'] = `${timestamp}${modelIdUsed ? ` by ${modelIdUsed}` : ' by Unknown Model'}`;

      if (Object.prototype.hasOwnProperty.call(fmObj, 'beatsupdate')) fmObj['beatsupdate'] = false;
      else fmObj['Beats Update'] = false;

      const b1 = parsedBeats['1beats']?.trim();
      const b2 = parsedBeats['2beats']?.trim();
      const b3 = parsedBeats['3beats']?.trim();
      if (b1) fmObj['1beats'] = toArray(b1);
      if (b2) fmObj['2beats'] = toArray(b2);
      if (b3) fmObj['3beats'] = toArray(b3);
    });
    return true;
  } catch (e) {
    console.error('[updateSceneBeats] Error updating file:', e);
    return false;
  }
}


