/*
 * Beat Template Note Creation
 */
import { Vault, TFile, normalizePath } from 'obsidian';
import { PLOT_SYSTEMS, PlotSystemTemplate, PlotBeatInfo } from './beatsSystems';

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
 * Generate Beat note content with frontmatter and body
 */
function generatePlotNoteContent(
  beatInfo: PlotBeatInfo,
  act: number,
  beatSystem: string
): string {
  const rangeValue = getRangeValue(beatInfo);
  const yamlEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const desc = beatInfo.description ? `"${yamlEscape(beatInfo.description)}"` : '""';
  
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

  // Build the body with description and optional placement
  const bodyParts: string[] = [];
  
  if (beatInfo.description) {
    bodyParts.push(beatInfo.description);
  }
  
  if (beatInfo.placement) {
    bodyParts.push('');
    bodyParts.push(`**Manuscript Position:** ${beatInfo.placement}`);
  }
  
  const body = bodyParts.length > 0 ? '\n' + bodyParts.join('\n') + '\n' : '';
  
  return frontmatter + body;
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
  customSystem?: PlotSystemTemplate
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
    s.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();

  for (let i = 0; i < beatSystem.beats.length; i++) {
    const beatName = beatSystem.beats[i];
    const beatInfo = beatSystem.beatDetails[i];
    const beatNumber = i + 1;
    // Use explicit act if available, otherwise calculate
    const act = beatInfo.act ? beatInfo.act : getBeatAct(i, beatSystem.beats.length);
    
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
    const content = generatePlotNoteContent(beatInfo, act, beatSystemName);

    try {
      await vault.create(normalizedPath, content);
      created++;
    } catch (error) {
      errors.push(`Failed to create "${filename}": ${error}`);
    }
  }

  return { created, skipped, errors };
}

