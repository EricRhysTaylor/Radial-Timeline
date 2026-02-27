/*
 * Manuscript Assembly Utilities
 */
import { TFile, Vault, App, getFrontMatterInfo, parseYaml } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { TimelineItem, BookMeta, MatterMeta } from '../types';
import { getScenePrefixNumber } from './text';
import { getActiveBookExportContext } from './exportContext';
import { normalizeMatterBodyMode, parseMatterMetaFromFrontmatter, type MatterBodyMode } from './matterMeta';
import { normalizeFrontmatterKeys } from './frontmatter';

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
  acts: (number | null)[];
  sceneNumbers: number[];
  subplots: string[];
  synopses: (string | null)[];
  runtimes: (number | null)[];
  wordCounts: (number | null)[];
  matterMetaByPath?: Map<string, MatterMeta>;
}

export type TocMode = 'markdown' | 'plain' | 'none';
export type ManuscriptSceneHeadingMode = 'scene-number' | 'scene-number-title' | 'title-only';
export type SceneHeadingRenderMode = 'markdown-h2' | 'latex-section-starred';

export interface ModernClassicBeatDefinition {
  name: string;
  actIndex: number;
  id?: string;
  chapterBreak?: boolean;
  chapterTitle?: string;
}

export interface ModernClassicStructureOptions {
  enabled: boolean;
  beatDefinitions: ModernClassicBeatDefinition[];
  actEpigraphs?: string[];
  actEpigraphAttributions?: string[];
}

export interface AssembleManuscriptOptions {
  sceneHeadingMode?: ManuscriptSceneHeadingMode;
  sceneHeadingRenderMode?: SceneHeadingRenderMode;
  modernClassicStructure?: ModernClassicStructureOptions;
}

type EffectiveBodyMode = 'latex' | 'plain';
let matterOrderIgnoredWarned = false;
const matterLikeMissingClassWarnings = new Set<string>();

function isDevMode(): boolean {
  return typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';
}

function warnMatterOrderIgnoredOnce(): void {
  if (isDevMode() && !matterOrderIgnoredWarned) {
    matterOrderIgnoredWarned = true;
    console.warn('Matter.order is ignored; ordering uses filename prefixes.');
  }
}

function warnMatterLikeWithoutClass(scene: TimelineItem): void {
  if (!isDevMode()) return;
  const key = scene.path || scene.title || '(unknown)';
  if (matterLikeMissingClassWarnings.has(key)) return;
  matterLikeMissingClassWarnings.add(key);
  console.warn(`[Matter Export] Note looks like matter by prefix but has no Frontmatter/Backmatter Class: ${key}`);
}

/**
 * Extract note body with minimal normalization only.
 * Cleanup is handled centrally by manuscriptSanitize.ts at export time.
 */
export function extractBodyText(content: string): string {
  return content.replace(/\r\n?/g, '\n').trim();
}

// ════════════════════════════════════════════════════════════════════════════
// Semantic Matter Helpers
// ════════════════════════════════════════════════════════════════════════════

/**
 * Extract matter metadata from raw file content by parsing YAML frontmatter.
 * Uses simplified front/back matter keys (Class + Role/UseBookMeta/BodyMode).
 */
function extractMatterMeta(content: string): MatterMeta | null {
  try {
    const fmInfo = getFrontMatterInfo(content);
    const fmText = (fmInfo as { frontmatter?: string }).frontmatter;
    if (!fmText) return null;

    const yaml = parseYaml(fmText);
    if (!yaml || typeof yaml !== 'object' || Array.isArray(yaml)) return null;

    const parsed = parseMatterMetaFromFrontmatter(yaml as Record<string, unknown>);
    if (parsed?.order !== undefined) {
      warnMatterOrderIgnoredOnce();
    }
    return parsed;
  } catch {
    return null;
  }
}

function escapeLatex(value: string): string {
  return value
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([{}$&#_%])/g, '\\$1')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/~/g, '\\textasciitilde{}');
}

function resolveEffectiveBodyMode(bodyText: string, declared: MatterBodyMode = 'auto'): EffectiveBodyMode {
  if (declared === 'latex' || declared === 'plain') return declared;
  const latexSignature = /\\begin\{|\\vspace|\\textcopyright|\\newpage|\\thispagestyle|\\chapter\*?|\\centering|\\[A-Za-z]+(?:\*|\b)/;
  return latexSignature.test(bodyText) ? 'latex' : 'plain';
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripScenePrefix(title: string, prefix: string | null): string {
  const trimmed = title.trim();
  if (!prefix) return trimmed;
  const pattern = new RegExp(`^${escapeRegex(prefix)}(?:\\s+|[._:-]+\\s*)?`, 'i');
  return trimmed.replace(pattern, '').trim();
}

function extractScenePrefixFromTitle(title: string): string | null {
  const match = title.trim().match(/^(\d+(?:\.\d+)?)/);
  return match?.[1] || null;
}

function resolveSceneHeading(
  title: string,
  mode: ManuscriptSceneHeadingMode,
  fallbackNumber: number
): string {
  const trimmed = title.trim();
  const prefix = extractScenePrefixFromTitle(trimmed);
  const strippedTitle = stripScenePrefix(trimmed, prefix);

  switch (mode) {
    case 'scene-number':
      return prefix || `Scene ${fallbackNumber}`;
    case 'title-only':
      return strippedTitle || trimmed || `Scene ${fallbackNumber}`;
    case 'scene-number-title':
    default:
      if (prefix && strippedTitle) return `${prefix} ${strippedTitle}`;
      return trimmed || `Scene ${fallbackNumber}`;
  }
}

/**
 * Render a semantic copyright page from BookMeta and body text.
 * Produces raw LaTeX for Pandoc PDF export.
 *
 * This is the first wedge: hardcoded layout that proves
 * an author can edit YAML instead of LaTeX and still get a correct page.
 */
function renderCopyrightPage(bookMeta: BookMeta, bodyText: string, bodyMode: EffectiveBodyMode): string {
  const year = bookMeta.rights?.year;
  const yearStr = year ? year.toString() : '[YEAR MISSING]';
  const holder = escapeLatex(bookMeta.rights?.copyright_holder ?? bookMeta.author ?? '');
  const processedBody = bodyMode === 'latex'
    ? bodyText.trim()
    : escapeLatex(bodyText.trim());

  const parts: string[] = [];
  parts.push('\\begin{center}');
  parts.push('\\vspace*{\\fill}');
  parts.push('');

  if (processedBody) {
    parts.push(processedBody);
    parts.push('');
    parts.push('\\vspace{0.4cm}');
    parts.push('');
  }

  parts.push(`Copyright \\textcopyright{} ${yearStr} ${holder}`.trimEnd());

  if (bookMeta.publisher?.name) {
    parts.push('');
    parts.push('\\vspace{0.3cm}');
    parts.push('');
    parts.push(escapeLatex(bookMeta.publisher.name));
  }

  if (bookMeta.identifiers?.isbn_paperback) {
    parts.push('');
    parts.push('\\vspace{0.3cm}');
    parts.push('');
    parts.push(`ISBN: ${escapeLatex(bookMeta.identifiers.isbn_paperback)}`);
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

  const isMatterItem = (scene: TimelineItem): boolean =>
    scene.itemType === 'Frontmatter' || scene.itemType === 'Backmatter';

  const resolveMatterSideFromClass = (scene: TimelineItem): 'front' | 'back' =>
    scene.itemType === 'Backmatter' ? 'back' : 'front';

  const extractMatterPrefixToken = (title: string): string | null => {
    const match = title.trim().match(/^(\d+(?:\.\d+)?)/);
    return match?.[1] || null;
  };

  const looksLikeMatterByPrefix = (title: string): boolean => {
    const match = title.trim().match(/^(\d+(?:\.\d+)?)/);
    if (!match) return false;
    return /^0(?:\.|$)/.test(match[1]) || /^200(?:\.|$)/.test(match[1]);
  };

  const compareMatterItems = (a: TimelineItem, b: TimelineItem): number => {
    const aTitle = a.title || '';
    const bTitle = b.title || '';
    const aPrefix = extractMatterPrefixToken(aTitle);
    const bPrefix = extractMatterPrefixToken(bTitle);

    if (aPrefix && bPrefix) {
      const prefixCmp = aPrefix.localeCompare(bPrefix, undefined, { numeric: true, sensitivity: 'base' });
      if (prefixCmp !== 0) return prefixCmp;
    } else if (aPrefix && !bPrefix) {
      return -1;
    } else if (!aPrefix && bPrefix) {
      return 1;
    }

    return aTitle.localeCompare(bTitle, undefined, { numeric: true, sensitivity: 'base' });
  };

  const orderedItems = (() => {
    if (!includeMatter) return sortedScenes;

    const frontMatter = sortedScenes
      .filter(s => isMatterItem(s) && resolveMatterSideFromClass(s) === 'front')
      .sort(compareMatterItems);
    const backMatter = sortedScenes
      .filter(s => isMatterItem(s) && resolveMatterSideFromClass(s) === 'back')
      .sort(compareMatterItems);
    const sceneItems = sortedScenes.filter(s => {
      if (isMatterItem(s)) return false;
      if (includeMatter && looksLikeMatterByPrefix((s.title || '').trim())) {
        warnMatterLikeWithoutClass(s);
      }
      return true;
    });
    return [...frontMatter, ...sceneItems, ...backMatter];
  })();

  const synopses: (string | null)[] = [];
  const runtimes: (number | null)[] = [];
  const wordCounts: (number | null)[] = [];
  const matterMetaByPath = new Map<string, MatterMeta>();

  const files: TFile[] = [];
  const titles: string[] = [];
  const whenDates: (string | null)[] = [];
  const acts: (number | null)[] = [];
  const sceneNumbers: number[] = [];
  const subplots: string[] = [];

  for (const scene of orderedItems) {
    if (!scene.path) continue;
    const file = app.vault.getAbstractFileByPath(scene.path);
    if (!(file instanceof TFile)) continue;
    files.push(file);
    titles.push(file.basename);
    whenDates.push(scene.when ? formatWhenDate(scene.when) : null);
    acts.push(parseActNumber(scene.actNumber ?? scene.act));
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

    if (isMatterItem(scene) && scene.path) {
      if (scene.matterMeta?.order !== undefined) {
        warnMatterOrderIgnoredOnce();
      }
      const normalizedSide: 'front' | 'back' = resolveMatterSideFromClass(scene);
      matterMetaByPath.set(scene.path, {
        ...(scene.matterMeta || {}),
        side: normalizedSide,
        bodyMode: normalizeMatterBodyMode(scene.matterMeta?.bodyMode)
      });
    }
  }

  return {
    files,
    sortOrder,
    titles,
    whenDates,
    acts,
    sceneNumbers,
    subplots,
    synopses,
    runtimes,
    wordCounts,
    matterMetaByPath
  };
}

function formatWhenDate(date: Date): string {
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function parseActNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const numericMatch = trimmed.match(/\d+/);
  if (numericMatch) {
    const parsed = parseInt(numericMatch[0], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const normalizedRoman = trimmed.toUpperCase().replace(/^ACT\s+/i, '');
  const romanMap: Record<string, number> = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10
  };
  return romanMap[normalizedRoman] ?? null;
}

interface ModernClassicSceneBeatReference {
  beatId?: string;
  beatName?: string;
}

interface ModernClassicState {
  enabled: boolean;
  currentActIndex: number | null;
  chapterIndex: number;
  emittedSceneCount: number;
  actEpigraphs: string[];
  actEpigraphAttributions: string[];
  beatById: Map<string, ModernClassicBeatDefinition>;
  beatByName: Map<string, ModernClassicBeatDefinition>;
}

function normalizeBeatLookupKey(value: string): string {
  return value
    .trim()
    .replace(/^\d+(?:\.\d+)?(?:\s+|[._:-]+\s*)/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toRomanNumeral(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
  ];
  let remaining = Math.floor(value);
  let output = '';
  for (const [numeric, roman] of table) {
    while (remaining >= numeric) {
      output += roman;
      remaining -= numeric;
    }
  }
  return output;
}

function sanitizeModernClassicMacroArg(value: string): string {
  return value
    .replace(/[\\{}]/g, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRawLatexBlock(command: string): string {
  return `\`\`\`{=latex}\n${command}\n\`\`\`\n\n`;
}

function extractFrontmatterObject(content: string): Record<string, unknown> | null {
  try {
    const fmInfo = getFrontMatterInfo(content);
    const fmText = (fmInfo as { frontmatter?: string }).frontmatter;
    if (!fmText) return null;
    const yaml = parseYaml(fmText);
    if (!yaml || typeof yaml !== 'object' || Array.isArray(yaml)) return null;
    return normalizeFrontmatterKeys(yaml as Record<string, unknown>);
  } catch {
    return null;
  }
}

function getFirstFrontmatterString(frontmatter: Record<string, unknown>, keys: string[]): string | undefined {
  const normalizedAliases = new Set(
    keys.map(key => key.toLowerCase().replace(/[\s_-]/g, ''))
  );
  for (const [rawKey, value] of Object.entries(frontmatter)) {
    const normalizedKey = rawKey.toLowerCase().replace(/[\s_-]/g, '');
    if (!normalizedAliases.has(normalizedKey)) continue;
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function extractSceneBeatReference(content: string): ModernClassicSceneBeatReference {
  const fm = extractFrontmatterObject(content);
  if (!fm) return {};

  const beatId = getFirstFrontmatterString(fm, ['Beat Id', 'BeatId']);
  const beatName = getFirstFrontmatterString(fm, ['Beat', 'Story Beat', 'Beat Name']);
  return { beatId, beatName };
}

function createModernClassicState(options?: ModernClassicStructureOptions): ModernClassicState {
  const normalizeList = (values: unknown): string[] => {
    if (!Array.isArray(values)) return [];
    return values.map(value => (typeof value === 'string' ? value : ''));
  };
  const state: ModernClassicState = {
    enabled: options?.enabled === true,
    currentActIndex: null,
    chapterIndex: 0,
    emittedSceneCount: 0,
    actEpigraphs: normalizeList(options?.actEpigraphs),
    actEpigraphAttributions: normalizeList(options?.actEpigraphAttributions),
    beatById: new Map<string, ModernClassicBeatDefinition>(),
    beatByName: new Map<string, ModernClassicBeatDefinition>()
  };
  if (!state.enabled) return state;

  for (const beat of options?.beatDefinitions || []) {
    if (!beat || typeof beat.name !== 'string') continue;
    const actIndex = Number.isFinite(beat.actIndex) ? Math.floor(beat.actIndex) : 0;
    if (actIndex <= 0) continue;
    if (typeof beat.id === 'string' && beat.id.trim()) {
      state.beatById.set(beat.id.trim(), beat);
    }
    const nameKey = normalizeBeatLookupKey(beat.name);
    if (nameKey) {
      state.beatByName.set(nameKey, beat);
    }
  }

  return state;
}

function resolveModernClassicBeatDefinition(
  state: ModernClassicState,
  reference: ModernClassicSceneBeatReference
): ModernClassicBeatDefinition | undefined {
  if (!state.enabled) return undefined;
  if (reference.beatId && state.beatById.has(reference.beatId)) {
    return state.beatById.get(reference.beatId);
  }
  if (!reference.beatName) return undefined;
  if (state.beatById.has(reference.beatName)) {
    return state.beatById.get(reference.beatName);
  }
  const key = normalizeBeatLookupKey(reference.beatName);
  if (!key) return undefined;
  return state.beatByName.get(key);
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
  bookMeta?: BookMeta | null,
  matterMetaByPath?: Map<string, MatterMeta>,
  options?: AssembleManuscriptOptions
): Promise<AssembledManuscript> {
  const scenes: SceneContent[] = [];
  const textParts: string[] = [];
  let totalWords = 0;
  const sceneHeadingMode = options?.sceneHeadingMode || 'scene-number-title';
  const sceneHeadingRenderMode = options?.sceneHeadingRenderMode || 'markdown-h2';
  const matterDiagnostics: Array<{
    filePath: string;
    side: 'front' | 'back';
    prefix: number | null;
    declaredBodyMode: MatterBodyMode;
    effectiveBodyMode: EffectiveBodyMode;
    bodyModeResolution: 'explicit' | 'auto-detected';
  }> = [];
  const modernClassicState = createModernClassicState(options?.modernClassicStructure);

  const inferMatterSide = (meta?: MatterMeta): 'front' | 'back' => {
    const side = (meta?.side || '').toString().trim().toLowerCase();
    return side === 'back' || side === 'backmatter' ? 'back' : 'front';
  };

  const extractPrefix = (title: string): number | null => {
    const match = title.trim().match(/^(\d+(?:\.\d+)?)/);
    if (!match) return null;
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : null;
  };

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
      const matterMeta = (file.path && matterMetaByPath?.get(file.path)) || extractMatterMeta(content);
      const isMatterNote = !!matterMeta;
      const bodyText = extractBodyText(content);
      const declaredMode = normalizeMatterBodyMode(matterMeta?.bodyMode);
      const chosenBodyMode = resolveEffectiveBodyMode(bodyText, declaredMode);

      if (isMatterNote) {
        const bodyModeResolution: 'explicit' | 'auto-detected' = declaredMode === 'auto' ? 'auto-detected' : 'explicit';
        matterDiagnostics.push({
          filePath: file.path,
          side: inferMatterSide(matterMeta || undefined),
          prefix: extractPrefix(title),
          declaredBodyMode: declaredMode,
          effectiveBodyMode: chosenBodyMode,
          bodyModeResolution
        });
      }

      if (matterMeta?.role === 'copyright' && matterMeta?.usesBookMeta && bookMeta) {
        const rendered = renderCopyrightPage(bookMeta, bodyText, chosenBodyMode);
        const wordCount = countWords(bodyText);

        scenes.push({ title, bodyText: rendered, wordCount });
        totalWords += wordCount;

        // No ## heading for copyright page — it's a layout-only page
        textParts.push(`${rendered}\n\n`);
      } else if (isMatterNote && chosenBodyMode === 'latex') {
        const wordCount = countWords(bodyText);
        scenes.push({ title, bodyText, wordCount });
        totalWords += wordCount;
        textParts.push(`${bodyText}\n\n`);
      } else {
        // ── Normal rendering path ──────────────────────────────────────
        const wordCount = countWords(bodyText);
        if (modernClassicState.enabled && !isMatterNote) {
          const beatRef = extractSceneBeatReference(content);
          const beatDef = resolveModernClassicBeatDefinition(modernClassicState, beatRef);
          let emittedStructureOpener = false;

          const nextActIndex = beatDef?.actIndex;
          if (typeof nextActIndex === 'number' && nextActIndex > 0 && nextActIndex !== modernClassicState.currentActIndex) {
            const actRoman = toRomanNumeral(nextActIndex);
            if (actRoman) {
              textParts.push(buildRawLatexBlock(`\\rtPart{${actRoman}}`));
              const epigraphQuote = sanitizeModernClassicMacroArg(modernClassicState.actEpigraphs[nextActIndex - 1] || '');
              const epigraphAttribution = sanitizeModernClassicMacroArg(modernClassicState.actEpigraphAttributions[nextActIndex - 1] || '');
              if (epigraphQuote || epigraphAttribution) {
                textParts.push(buildRawLatexBlock(`\\rtEpigraph{${epigraphQuote}}{${epigraphAttribution}}`));
              }
              modernClassicState.currentActIndex = nextActIndex;
              emittedStructureOpener = true;
            }
          }

          const startsChapter = beatDef?.chapterBreak === true;
          if (startsChapter) {
            modernClassicState.chapterIndex += 1;
            const chapterRoman = toRomanNumeral(modernClassicState.chapterIndex);
            const chapterTitle = sanitizeModernClassicMacroArg(beatDef?.chapterTitle || '');
            textParts.push(buildRawLatexBlock(`\\rtChapter{${chapterRoman}}{${chapterTitle}}`));
            emittedStructureOpener = true;
          } else if (modernClassicState.emittedSceneCount > 0 && !emittedStructureOpener) {
            textParts.push(buildRawLatexBlock('\\rtSceneSep'));
          }

          scenes.push({ title, bodyText, wordCount });
          totalWords += wordCount;
          textParts.push(`${bodyText}\n\n`);
          modernClassicState.emittedSceneCount += 1;
        } else {
          const heading = resolveSceneHeading(title, sceneHeadingMode, i + 1);

          scenes.push({ title: heading, bodyText, wordCount });
          totalWords += wordCount;

          if (sceneHeadingRenderMode === 'latex-section-starred') {
            // Force header/footer suppression on scene-opener pages.
            textParts.push(`\\section*{${escapeLatex(heading)}}\n\\thispagestyle{empty}\n\n${bodyText}\n\n`);
          } else {
            textParts.push(`## ${heading}\n\n${bodyText}\n\n`);
          }
        }
      }
    } catch (error) {
      console.error(`Error reading scene file ${file.path}:`, error);
      // Add placeholder for failed scene
      textParts.push(`## ${title}\n\n[Error reading scene]\n\n`);
    }
  }

  if (isDevMode() && matterDiagnostics.length > 0) {
    const ordered = matterDiagnostics.map((entry, index) => ({
      prefixOrderIndex: index + 1,
      ...entry
    }));
    console.info('[Matter Export Diagnostic]', {
      front: ordered.filter(entry => entry.side === 'front'),
      back: ordered.filter(entry => entry.side === 'back'),
      bookMetaPath: bookMeta?.sourcePath || null,
      totalMatter: ordered.length
    });
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
      let didUpdate = false;
      await app.fileManager.processFrontMatter(file, (fm) => {
        const fmObj = fm as Record<string, unknown>;
        const rawClass = fmObj['Class'] ?? fmObj['class'];
        const classValue = typeof rawClass === 'string' ? rawClass.trim().toLowerCase() : '';
        const wordsKey = Object.keys(fmObj).find(key => key.toLowerCase() === 'words') ?? 'Words';

        // Only scene notes should receive word-count writes.
        if (classValue && classValue !== 'scene') return;

        fmObj[wordsKey] = scene.wordCount;
        didUpdate = true;
      });
      if (didUpdate) updatedCount++;
    } catch (error) {
      console.error(`[updateSceneWordCounts] Error updating ${file.path}:`, error);
    }
  }

  return updatedCount;
}
