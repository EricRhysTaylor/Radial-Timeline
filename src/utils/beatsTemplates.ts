/*
 * Beat Template Note Creation
 */
import { Vault, TFile, normalizePath } from 'obsidian';
import { PLOT_SYSTEMS, PlotSystemTemplate, PlotBeatInfo } from './beatsSystems';
import { mergeTemplates } from './sceneGenerator';

/** Legacy beat base template — byte-for-byte matches the original hardcoded output. */
const LEGACY_BEAT_BASE = `Class: Beat
Act: {{Act}}
Description: {{Description}}
Beat Model: {{BeatModel}}
Range: {{Range}}
When:
Gossamer1:`;

/**
 * Convert beatInfo.range to Range field value (0-100 scale).
 */
function getRangeValue(beatInfo: PlotBeatInfo): string {
  if (beatInfo.range) {
    return beatInfo.range;
  }
  return '';
}

/**
 * Build the note body (description + optional placement). Shared by both paths.
 */
function buildBeatBody(beatInfo: PlotBeatInfo): string {
  const bodyParts: string[] = [];
  if (beatInfo.description) bodyParts.push(beatInfo.description);
  if (beatInfo.placement) {
    bodyParts.push('');
    bodyParts.push(`**Manuscript Position:** ${beatInfo.placement}`);
  }
  return bodyParts.length > 0 ? '\n' + bodyParts.join('\n') + '\n' : '';
}

/**
 * Returns the merged beat YAML template string (base + advanced).
 * If settings have no beatYamlTemplates, falls back to the legacy base.
 */
export function getMergedBeatYamlTemplate(settings: { beatYamlTemplates?: { base: string; advanced: string } }): string {
  const base = settings.beatYamlTemplates?.base ?? LEGACY_BEAT_BASE;
  const advanced = settings.beatYamlTemplates?.advanced ?? '';
  if (!advanced.trim()) return base;
  return mergeTemplates(base, advanced);
}

/**
 * Generate Beat note content with frontmatter and body.
 * When a template string is provided, uses {{Placeholder}} substitution.
 * When omitted, produces the exact legacy hardcoded output for backward compatibility.
 */
function generatePlotNoteContent(
  beatInfo: PlotBeatInfo,
  act: number,
  beatSystem: string,
  template?: string
): string {
  const yamlEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const desc = beatInfo.description ? `"${yamlEscape(beatInfo.description)}"` : '""';
  const rangeValue = getRangeValue(beatInfo);

  if (template) {
    // Template-based generation using {{Placeholder}} substitution
    let content = template;
    content = content.replace(/{{Act}}/g, act.toString());
    content = content.replace(/{{Description}}/g, desc);
    content = content.replace(/{{BeatModel}}/g, beatSystem);
    content = content.replace(/{{Range}}/g, rangeValue);

    return `---\n${content}\n---\n` + buildBeatBody(beatInfo);
  }

  // Legacy hardcoded output (backward compatibility)
  const frontmatter = [
    '---',
    'Class: Beat',
    `Act: ${act}`,
    `Description: ${desc}`,
    `Beat Model: ${beatSystem}`,
    rangeValue ? `Range: ${rangeValue}` : 'Range:',
    'When:',
    'Gossamer1:',
    '---',
    ''
  ].join('\n');

  return frontmatter + buildBeatBody(beatInfo);
}

/**
 * Determine Act number based on beat position
 * Roughly: first third = Act 1, middle third = Act 2, final third = Act 3
 */
function getBeatAct(beatIndex: number, totalBeats: number): number {
  const position = beatIndex / totalBeats;
  if (position < 0.33) return 1;
  if (position < 0.67) return 2;
  return 3;
}

/**
 * Create Beat template notes for a given beat system
 */
export async function createBeatTemplateNotes(
  vault: Vault,
  beatSystemName: string,
  sourcePath: string,
  customSystem?: PlotSystemTemplate,
  options?: { actStartNumbers?: Map<number, number>; beatTemplate?: string }
): Promise<{ created: number; skipped: number; errors: string[] }> {
  let beatSystem = PLOT_SYSTEMS[beatSystemName];
  
  if (beatSystemName === 'Custom' && customSystem) {
    beatSystem = customSystem;
  }
  
  if (!beatSystem) {
    throw new Error(`Unknown beat system: ${beatSystemName}`);
  }

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Normalize source path
  const targetFolder = sourcePath.trim() ? normalizePath(sourcePath.trim()) : '';

  // Ensure folder exists
  if (targetFolder) {
    const folder = vault.getAbstractFileByPath(targetFolder);
    if (!folder) {
      try {
        await vault.createFolder(targetFolder);
      } catch (e) {
        // Folder might already exist
      }
    }
  }

  const stripActPrefix = (name: string): string => {
    const m = name.match(/^Act\s*\d+\s*:\s*(.+)$/i);
    return m ? m[1].trim() : name.trim();
  };

  const sanitize = (s: string) =>
    s.replace(/[\\/:*?"<>|!.]+/g, '-').replace(/-+/g, '-').replace(/\s+/g, ' ').replace(/^-|-$/g, '').trim();

  // Use the custom system name (if provided) for Beat Model frontmatter instead of generic "Custom"
  const beatModelName = beatSystem.name || beatSystemName;

  const actStartNumbers = options?.actStartNumbers;
  const useActAlignedNumbers = !!actStartNumbers && actStartNumbers.size > 0;
  const actCounters = new Map<number, number>();

  const resolveBeatNumber = (act: number, fallback: number): number => {
    if (!useActAlignedNumbers) return fallback;
    if (actStartNumbers?.has(act)) {
      const start = actStartNumbers.get(act);
      if (start !== undefined) {
        const next = actCounters.get(act) ?? start;
        actCounters.set(act, next + 1);
        return next;
      }
    }
    if (act === 1) {
      const next = actCounters.get(act) ?? 1;
      actCounters.set(act, next + 1);
      return next;
    }
    return fallback;
  };

  for (let i = 0; i < beatSystem.beats.length; i++) {
    const beatName = beatSystem.beats[i];
    const beatInfo = beatSystem.beatDetails[i];
    // Use explicit act if available, otherwise calculate
    const act = beatInfo.act ? beatInfo.act : getBeatAct(i, beatSystem.beats.length);
    const beatNumber = resolveBeatNumber(act, i + 1);
    
    // Use canonical title without "Act X:" prefix for filename
    const displayName = stripActPrefix(beatName);
    const safeBeatName = sanitize(displayName);
    const filename = `${beatNumber} ${safeBeatName}.md`;
    const filePath = targetFolder ? `${targetFolder}/${filename}` : filename;
    const normalizedPath = normalizePath(filePath);

    // Check if file already exists
    const existingFile = vault.getAbstractFileByPath(normalizedPath);
    if (existingFile) {
      skipped++;
      continue;
    }

    // Generate full note content with frontmatter and body
    const content = generatePlotNoteContent(beatInfo, act, beatModelName, options?.beatTemplate);

    try {
      await vault.create(normalizedPath, content);
      created++;
    } catch (error) {
      errors.push(`Failed to create "${filename}": ${error}`);
    }
  }

  return { created, skipped, errors };
}
