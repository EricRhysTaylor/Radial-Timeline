/*
 * Plot Template Note Creation
 */
import { Vault, TFile, normalizePath } from 'obsidian';
import { PLOT_SYSTEMS, PlotSystemTemplate, PlotBeatInfo } from './plotSystems';

/**
 * Generate Plot note content with frontmatter and body
 */
function generatePlotNoteContent(
  beatInfo: PlotBeatInfo,
  act: number,
  plotSystem: string
): string {
  const frontmatter = [
    '---',
    'Class: Plot',
    `Act: ${act}`,
    'Description:',
    `Beat Model: ${plotSystem}`,
    'Gossamer1:',
    '---',
    ''
  ].join('\n');

  // Build the body with description and percentage range
  const bodyParts: string[] = [];
  
  if (beatInfo.description) {
    bodyParts.push(beatInfo.description);
  }
  
  if (beatInfo.percentageRange) {
    bodyParts.push('');
    bodyParts.push(`**Manuscript Position:** ${beatInfo.percentageRange}`);
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
 * Create Plot template notes for a given plot system
 */
export async function createPlotTemplateNotes(
  vault: Vault,
  plotSystemName: string,
  sourcePath: string
): Promise<{ created: number; skipped: number; errors: string[] }> {
  const plotSystem = PLOT_SYSTEMS[plotSystemName];
  
  if (!plotSystem) {
    throw new Error(`Unknown plot system: ${plotSystemName}`);
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

  for (let i = 0; i < plotSystem.beats.length; i++) {
    const beatName = plotSystem.beats[i];
    const beatInfo = plotSystem.beatDetails[i];
    const beatNumber = i + 1;
    const act = getBeatAct(i, plotSystem.beats.length);
    
    // Filename: "1 Opening Image.md"
    const filename = `${beatNumber} ${beatName}.md`;
    const filePath = targetFolder ? `${targetFolder}/${filename}` : filename;
    const normalizedPath = normalizePath(filePath);

    // Check if file already exists
    const existingFile = vault.getAbstractFileByPath(normalizedPath);
    if (existingFile) {
      skipped++;
      continue;
    }

    // Generate full note content with frontmatter and body
    const content = generatePlotNoteContent(beatInfo, act, plotSystemName);

    try {
      await vault.create(normalizedPath, content);
      created++;
    } catch (error) {
      errors.push(`Failed to create "${filename}": ${error}`);
    }
  }

  return { created, skipped, errors };
}

