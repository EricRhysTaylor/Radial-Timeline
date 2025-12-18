/*
 * Manuscript Assembly Utilities
 */
import { TFile, Vault } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { TimelineItem } from '../types';
import { getScenePrefixNumber } from './text';

export interface SceneContent {
  title: string;
  bodyText: string;
  wordCount: number;
}

export interface AssembledManuscript {
  text: string;
  totalWords: number;
  totalScenes: number;
  scenes: SceneContent[];
  sortOrder?: string;
}

export type ManuscriptOrder = 'narrative' | 'chronological' | 'reverse-narrative' | 'reverse-chronological';

export interface ManuscriptSceneSelection {
  files: TFile[];
  sortOrder: string;
  titles: string[];
  whenDates: (string | null)[];
  sceneNumbers: number[];
}
 
export type TocMode = 'markdown' | 'plain' | 'none';

/**
 * Strip YAML frontmatter from file content
 */
function stripYamlFrontmatter(content: string): string {
  // Remove YAML frontmatter between --- markers
  const yamlPattern = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  return content.replace(yamlPattern, '');
}

/**
 * Strip Obsidian comments (%% ... %%)
 */
function stripObsidianComments(content: string): string {
  // Remove single-line comments
  content = content.replace(/%%.*?%%/g, '');
  // Remove multi-line comments
  content = content.replace(/%%[\s\S]*?%%/g, '');
  return content;
}

/**
 * Extract clean body text from file content
 */
export function extractBodyText(content: string): string {
  let text = stripYamlFrontmatter(content);
  text = stripObsidianComments(text);
  return text.trim();
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  // Split on whitespace and filter out empty strings
  const words = text.split(/\s+/).filter(word => word.length > 0);
  return words.length;
}

/**
 * Estimate tokens from word count (rough approximation: 1 token ≈ 0.75 words)
 */
export function estimateTokens(wordCount: number): number {
  return Math.ceil(wordCount / 0.75);
}

/**
 * Get sorted scene files ready for manuscript assembly
 * This is the single source of truth for preparing scenes for manuscript generation
 * Uses the same sorting logic as the timeline view
 * @param plugin - The RadialTimelinePlugin instance
 * @returns Object with array of TFile objects and sort order description
 */
export async function getSortedSceneFiles(plugin: RadialTimelinePlugin): Promise<{ files: TFile[], sortOrder: string }> {
  // Get all scenes
  const allScenes = await plugin.getSceneData();
  
  // Deduplicate by path
  const uniquePaths = new Set<string>();
  const uniqueScenes = allScenes.filter(s => {
    if (s.itemType === 'Scene' && s.path && !uniquePaths.has(s.path)) {
      uniquePaths.add(s.path);
      return true;
    }
    return false;
  });
  
  // Sort scenes using the same logic as the timeline view
  // Check current mode and sorting settings
  const currentMode = (plugin.settings as any).currentMode || 'narrative';
  const isChronologueMode = currentMode === 'chronologue';
  const sortByWhen = isChronologueMode ? true : ((plugin.settings as any).sortByWhenDate ?? false);
  const forceChronological = isChronologueMode;
  
  // Import and use the same sortScenes function that the timeline uses
  const { sortScenes } = await import('./sceneHelpers');
  const sortedScenes = sortScenes(uniqueScenes, sortByWhen, forceChronological);
  
  // Convert to TFile objects
  const sceneFiles = sortedScenes
    .map(s => plugin.app.vault.getAbstractFileByPath(s.path!))
    .filter((f): f is TFile => f instanceof TFile);
  
  // Determine sort order description
  let sortOrder: string;
  if (isChronologueMode) {
    sortOrder = 'Chronological (by When date/time)';
  } else {
    sortOrder = 'Narrative (by scene title/number)';
  }
  
  return { files: sceneFiles, sortOrder };
}

/**
 * Fetch scene files in a specific order (ignores current mode when explicit order is provided)
 */
export async function getSceneFilesByOrder(
  plugin: RadialTimelinePlugin,
  order: ManuscriptOrder
): Promise<ManuscriptSceneSelection> {
  const allScenes = await plugin.getSceneData();

  const uniquePaths = new Set<string>();
  const uniqueScenes = allScenes.filter((scene: TimelineItem) => {
    if (scene.itemType === 'Scene' && scene.path && !uniquePaths.has(scene.path)) {
      uniquePaths.add(scene.path);
      return true;
    }
    return false;
  });

  const { sortScenes, sortScenesChronologically } = await import('./sceneHelpers');
  let sortedScenes: TimelineItem[];
  let sortOrder: string;

  if (order === 'chronological' || order === 'reverse-chronological') {
    sortedScenes = sortScenesChronologically(uniqueScenes);
    if (order === 'reverse-chronological') {
      sortedScenes = sortedScenes.slice().reverse();
      sortOrder = 'Reverse chronological (by When date/time)';
    } else {
      sortOrder = 'Chronological (by When date/time)';
    }
  } else {
    sortedScenes = sortScenes(uniqueScenes, false, false);
    if (order === 'reverse-narrative') {
      sortedScenes = sortedScenes.slice().reverse();
      sortOrder = 'Reverse narrative (by scene title/number)';
    } else {
      sortOrder = 'Narrative (by scene title/number)';
    }
  }

  const files: TFile[] = [];
  const titles: string[] = [];
  const whenDates: (string | null)[] = [];
  const sceneNumbers: number[] = [];

  for (const scene of sortedScenes) {
    if (!scene.path) continue;
    const file = plugin.app.vault.getAbstractFileByPath(scene.path);
    if (!(file instanceof TFile)) continue;
    files.push(file);
    titles.push(file.basename);
    whenDates.push(scene.when ? formatWhenDate(scene.when) : null);
    const numStr = getScenePrefixNumber(scene.title, scene.number);
    sceneNumbers.push(numStr ? parseInt(numStr, 10) || 0 : 0);
  }

  return { files, sortOrder, titles, whenDates, sceneNumbers };
}

function formatWhenDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Apply an inclusive range to any ordered list of scenes.
 * Range is 1-based; if start/end are undefined the full list is returned.
 */
export function sliceScenesByRange(
  sceneFiles: TFile[],
  startIndex?: number,
  endIndex?: number
): TFile[] {
  if (!sceneFiles.length) return sceneFiles;

  const start = startIndex && startIndex > 0 ? startIndex : 1;
  const end = endIndex && endIndex > 0 ? endIndex : sceneFiles.length;
  const clampedStart = Math.min(Math.max(start, 1), sceneFiles.length);
  const clampedEnd = Math.min(Math.max(end, clampedStart), sceneFiles.length);

  return sceneFiles.slice(clampedStart - 1, clampedEnd);
}


/**
 * Generate a table of contents for the manuscript
 * @param scenes - Array of scene content
 * @param totalWords - Total word count
 * @param useObsidianLinks - If true, use [[#Scene Title]] format for clickable links in Obsidian
 * @param sortOrder - Description of the sort order used
 */
function generateTableOfContents(
  scenes: SceneContent[],
  totalWords: number,
  useObsidianLinks = false,
  sortOrder?: string
): string {
  const tocLines: string[] = [
    '# TABLE OF CONTENTS',
    '',
    `Total Scenes: ${scenes.length} | Total Words: ${totalWords.toLocaleString()}`,
    ''
  ];

  // Add sort order note if provided
  if (sortOrder) {
    tocLines.push(`**Sort Order:** ${sortOrder}`);
    tocLines.push('');
  }

  tocLines.push('---', '');

  scenes.forEach((scene, index) => {
    const sceneNum = index + 1;
    if (useObsidianLinks) {
      // Obsidian internal link format - clickable in reading mode
      tocLines.push(`${sceneNum}. [[#${scene.title}]] (${scene.wordCount.toLocaleString()} words)`);
    } else {
      // Plain text format - better for AI processing
      tocLines.push(`${sceneNum}. ${scene.title} (${scene.wordCount.toLocaleString()} words)`);
    }
  });

  tocLines.push('', '---', '', '');

  return tocLines.join('\n');
}

/**
 * Assemble full manuscript from scene files
 * @param sceneFiles - Array of TFile objects in manuscript order
 * @param vault - Obsidian vault instance
 * @param progressCallback - Optional callback for progress updates
 * @param useObsidianLinks - If true, TOC uses [[#Scene Title]] clickable links (default: false for AI processing)
 * @param sortOrder - Optional description of the sort order used
 */
export async function assembleManuscript(
  sceneFiles: TFile[],
  vault: Vault,
  progressCallback?: (sceneIndex: number, sceneTitle: string, totalScenes: number) => void,
  useObsidianLinks = false,
  sortOrder?: string,
  includeToc: boolean = true
): Promise<AssembledManuscript> {
  const scenes: SceneContent[] = [];
  const textParts: string[] = [];
  let totalWords = 0;

  for (let i = 0; i < sceneFiles.length; i++) {
    const file = sceneFiles[i];
    const title = file.basename;

    // Call progress callback if provided
    if (progressCallback) {
      progressCallback(i + 1, title, sceneFiles.length);
    }

    try {
      const content = await vault.read(file);
      const bodyText = extractBodyText(content);
      const wordCount = countWords(bodyText);

      scenes.push({ title, bodyText, wordCount });
      totalWords += wordCount;

      // Format: ## 44 Michi Updates Rel Newlan (markdown heading for TOC)
      textParts.push(`## ${title}\n\n${bodyText}\n\n`);
    } catch (error) {
      console.error(`Error reading scene file ${file.path}:`, error);
      // Add placeholder for failed scene
      textParts.push(`## ${title}\n\n[Error reading scene]\n\n`);
    }
  }

  // Generate TOC and prepend to manuscript
  const toc = includeToc ? generateTableOfContents(scenes, totalWords, useObsidianLinks, sortOrder) : '';
  const manuscriptText = toc + textParts.join('');

  return {
    text: manuscriptText,
    totalWords,
    totalScenes: sceneFiles.length,
    scenes,
    sortOrder
  };
}

