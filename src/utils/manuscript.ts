/*
 * Manuscript Assembly Utilities
 */
import { TFile, Vault, App, getFrontMatterInfo, parseYaml } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { TimelineItem, BookMeta } from '../types';
import { getScenePrefixNumber } from './text';
import { getActiveBookExportContext } from './exportContext';

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
  subplots: string[];
  synopses: (string | null)[];
  runtimes: (number | null)[];
  wordCounts: (number | null)[];
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

// ════════════════════════════════════════════════════════════════════════════
// Semantic Matter Helpers
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extract matter metadata from raw file content by parsing its YAML frontmatter.
 * Returns null if the file is not a Frontmatter/Backmatter note or has no Matter: block.
 */
function extractMatterMeta(content: string): { role?: string; usesBookMeta?: boolean } | null {
  try {
    const fmInfo = getFrontMatterInfo(content);
    const fmText = (fmInfo as { frontmatter?: string }).frontmatter;
    if (!fmText) return null;

    const yaml = parseYaml(fmText);
    if (!yaml) return null;

    // Only process Frontmatter/Backmatter class notes
    const classVal = yaml.Class || yaml.class;
    if (classVal !== 'Frontmatter' && classVal !== 'Backmatter') return null;

    // Look for nested Matter: block
    const matter = yaml.Matter || yaml.matter;
    if (!matter || typeof matter !== 'object') return null;

    return {
      role: typeof matter.role === 'string' ? matter.role : undefined,
      usesBookMeta: typeof matter.usesBookMeta === 'boolean' ? matter.usesBookMeta : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Render a semantic copyright page from BookMeta and body text.
 * Produces raw LaTeX for Pandoc PDF/DOCX export.
 *
 * This is the first wedge: hardcoded layout that proves
 * an author can edit YAML instead of LaTeX and still get a correct page.
 */
function renderCopyrightPage(bookMeta: BookMeta, bodyText: string): string {
  const year = bookMeta.rights?.year;
  const yearStr = year ? year.toString() : '[YEAR_MISSING]';
  const holder = bookMeta.rights?.copyright_holder ?? bookMeta.author ?? '';

  const parts: string[] = [];
  parts.push('\\begin{center}');
  parts.push('\\vspace*{\\fill}');
  parts.push('');

  if (bodyText.trim()) {
    parts.push(bodyText.trim());
    parts.push('');
    parts.push('\\vspace{0.4cm}');
    parts.push('');
  }

  parts.push(`Copyright \\textcopyright{} ${yearStr} ${holder}`);

  if (bookMeta.publisher?.name) {
    parts.push('');
    parts.push('\\vspace{0.3cm}');
    parts.push('');
    parts.push(bookMeta.publisher.name);
  }

  if (bookMeta.identifiers?.isbn_paperback) {
    parts.push('');
    parts.push('\\vspace{0.3cm}');
    parts.push('');
    parts.push(`ISBN: ${bookMeta.identifiers.isbn_paperback}`);
  }

  parts.push('');
  parts.push('\\vfill');
  parts.push('\\end{center}');

  return parts.join('\n');
}

// ════════════════════════════════════════════════════════════════════════════

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
  const exportContext = getActiveBookExportContext(plugin);
  const allScenes = await plugin.getSceneData({ sourcePath: exportContext.sourceFolder });

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

import { parseRuntimeField } from './runtimeEstimator';

/**
 * Get all valid scenes from the timeline (wrapper for getting timeline items directly)
 */
export async function getAllScenes(app: App, plugin: RadialTimelinePlugin): Promise<TimelineItem[]> {
  const exportContext = getActiveBookExportContext(plugin);
  const data = await plugin.getSceneData({ sourcePath: exportContext.sourceFolder });
  return data.filter(s => s.itemType === 'Scene' || !s.itemType);
}

/**
 * Fetch scene files in a specific order (ignores current mode when explicit order is provided)
 * @param includeMatter - When true, also includes Frontmatter/Backmatter items for manuscript export
 */
export async function getSceneFilesByOrder(
  app: App,
  plugin: RadialTimelinePlugin,
  order: ManuscriptOrder,
  subplotFilter?: string,
  includeMatter?: boolean
): Promise<ManuscriptSceneSelection> {
  const exportContext = getActiveBookExportContext(plugin);
  const allScenes = await plugin.getSceneData({ sourcePath: exportContext.sourceFolder });

  const uniquePaths = new Set<string>();
  const uniqueScenes = allScenes.filter((scene: TimelineItem) => {
    // Filter by subplot if specified (matter notes bypass subplot filter)
    const isMatter = scene.itemType === 'Frontmatter' || scene.itemType === 'Backmatter';
    if (!isMatter && subplotFilter && subplotFilter !== 'All Subplots') {
      const sceneSubplot = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
      if (sceneSubplot !== subplotFilter) return false;
    }

    const isAllowedType = scene.itemType === 'Scene'
      || (includeMatter && isMatter);

    if (isAllowedType && scene.path && !uniquePaths.has(scene.path)) {
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

  const synopses: (string | null)[] = [];
  const runtimes: (number | null)[] = [];
  const wordCounts: (number | null)[] = [];

  const files: TFile[] = [];
  const titles: string[] = [];
  const whenDates: (string | null)[] = [];
  const sceneNumbers: number[] = [];
  const subplots: string[] = [];

  for (const scene of sortedScenes) {
    if (!scene.path) continue;
    const file = app.vault.getAbstractFileByPath(scene.path);
    if (!(file instanceof TFile)) continue;
    files.push(file);
    titles.push(file.basename);
    whenDates.push(scene.when ? formatWhenDate(scene.when) : null);
    const numStr = getScenePrefixNumber(scene.title, scene.number);
    sceneNumbers.push(numStr ? parseInt(numStr, 10) || 0 : 0);
    const sceneSubplot = scene.subplot && scene.subplot.trim().length > 0 ? scene.subplot : 'Main Plot';
    subplots.push(sceneSubplot);

    const rf = scene.rawFrontmatter as Record<string, unknown> | undefined;

    // Prefer Synopsis, then scene.synopsis
    let synopsis: string | null = null;
    if (rf && typeof rf.Synopsis === 'string') synopsis = rf.Synopsis as string;
    else if (scene.synopsis && scene.synopsis.trim().length > 0) synopsis = scene.synopsis;
    synopses.push(synopsis);

    const rt = rf?.Runtime as string | number | undefined;
    runtimes.push(parseRuntimeField(rt));

    const w = rf?.Words;
    if (typeof w === 'number') wordCounts.push(w);
    else if (typeof w === 'string') {
      const parsed = parseInt(w, 10);
      wordCounts.push(Number.isFinite(parsed) ? parsed : null);
    } else {
      wordCounts.push(null);
    }
  }

  return { files, sortOrder, titles, whenDates, sceneNumbers, subplots, synopses, runtimes, wordCounts };
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
  includeToc: boolean = true,
  bookMeta?: BookMeta | null
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

      // ── Semantic matter role intercept ────────────────────────────────
      // If this file is a matter note with a semantic role, render via
      // the appropriate template instead of the default heading + body.
      const matterMeta = extractMatterMeta(content);

      if (matterMeta?.role === 'copyright' && matterMeta?.usesBookMeta && bookMeta) {
        const bodyText = extractBodyText(content);
        const rendered = renderCopyrightPage(bookMeta, bodyText);
        const wordCount = countWords(bodyText);

        scenes.push({ title, bodyText: rendered, wordCount });
        totalWords += wordCount;

        // No ## heading for copyright page — it's a layout-only page
        textParts.push(`${rendered}\n\n`);
      } else {
        // ── Normal rendering path ──────────────────────────────────────
        const bodyText = extractBodyText(content);
        const wordCount = countWords(bodyText);

        scenes.push({ title, bodyText, wordCount });
        totalWords += wordCount;

        // Format: ## 44 Michi Updates Rel Newlan (markdown heading for TOC)
        textParts.push(`## ${title}\n\n${bodyText}\n\n`);
      }
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

/**
 * Update the Words field in scene YAML frontmatter for each processed scene
 * @param app - Obsidian App instance
 * @param sceneFiles - Array of TFile objects that were processed
 * @param scenes - Array of SceneContent with word counts
 * @returns Number of files successfully updated
 */
export async function updateSceneWordCounts(
  app: App,
  sceneFiles: TFile[],
  scenes: SceneContent[]
): Promise<number> {
  let updatedCount = 0;

  for (let i = 0; i < sceneFiles.length; i++) {
    const file = sceneFiles[i];
    const scene = scenes[i];

    if (!file || !scene) continue;

    try {
      await app.fileManager.processFrontMatter(file, (fm) => {
        const fmObj = fm as Record<string, unknown>;
        fmObj['Words'] = scene.wordCount;
      });
      updatedCount++;
    } catch (error) {
      console.error(`[updateSceneWordCounts] Error updating ${file.path}:`, error);
    }
  }

  return updatedCount;
}
