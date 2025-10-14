/*
 * Gossamer Commands and State - Manual Score Entry
 */
import type RadialTimelinePlugin from './main';
import { buildRunFromDefault, GossamerRun, normalizeBeatName, shiftGossamerHistory, extractBeatOrder } from './utils/gossamer';
import { Notice, TFile } from 'obsidian';
import { GossamerScoreModal } from './view/GossamerScoreModal';

// Helper to find Plot note by beat title
function findPlotNoteByTitle(files: TFile[], beatTitle: string): TFile | null {
  for (const file of files) {
    if (file.basename === beatTitle || file.basename === beatTitle.replace(/^\d+\s+/, '')) {
      const cache = file.app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (fm && (fm.Class === 'Plot' || fm.class === 'Plot')) {
        return file;
      }
    }
  }
  return null;
}

/**
 * Save Gossamer scores to Plot note frontmatter with history shifting
 */
async function saveGossamerScores(
  plugin: RadialTimelinePlugin,
  scores: Map<string, number> // beatTitle → score
): Promise<void> {
  const files = plugin.app.vault.getMarkdownFiles();
  let updateCount = 0;
  
  for (const [beatTitle, newScore] of scores) {
    const file = findPlotNoteByTitle(files, beatTitle);
    if (!file) {
      console.warn(`[Gossamer] No Plot note found for beat: ${beatTitle}`);
      continue;
    }
    
    try {
      await plugin.app.fileManager.processFrontMatter(file, (yaml) => {
        const fm = yaml as Record<string, any>;
        
        // Shift history down (Gossamer1 → Gossamer2, etc.)
        const shifted = shiftGossamerHistory(fm);
        Object.assign(fm, shifted);
        
        // Set new score
        fm.Gossamer1 = newScore;
        
        // Clean up old/deprecated fields
        delete fm.GossamerLocation;
        delete fm.GossamerNote;
        delete fm.GossamerRuns;
        delete fm.GossamerLatestRun;
      });
      
      updateCount++;
    } catch (e) {
      console.error(`[Gossamer] Failed to update beat ${beatTitle}:`, e);
    }
  }
  
  if (updateCount > 0) {
    new Notice(`Updated ${updateCount} beat scores with history preserved.`);
  }
}

/**
 * Parse scores from clipboard text in format:
 * "Opening Image: 8"
 * "Theme Stated: 12"
 * Case-insensitive, handles leading numbers
 */
export function parseScoresFromClipboard(clipboardText: string): Map<string, number> {
  const scores = new Map<string, number>();
  
  // Match simple format: "Beat Name: 42" (flexible with whitespace)
  const lineRegex = /^(.+?):\s*(\d+)\s*$/gm;
  
  let match;
  while ((match = lineRegex.exec(clipboardText)) !== null) {
    const beatName = match[1].trim();
    const score = parseInt(match[2]);
    
    // Normalize beat name (remove leading numbers if present, convert to lowercase for matching)
    let normalizedBeat = beatName.replace(/^\d+\s+/, ''); // Remove leading number
    
    // Convert to title case for better matching
    normalizedBeat = normalizedBeat
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    if (!isNaN(score) && score >= 0 && score <= 100) {
      scores.set(normalizedBeat, score);
    }
  }
  
  return scores;
}

const lastRunByPlugin = new WeakMap<RadialTimelinePlugin, GossamerRun>();

function setInMemoryRun(plugin: RadialTimelinePlugin, run: GossamerRun): void {
  lastRunByPlugin.set(plugin, run);
  // Provide compatibility for renderer access
  (plugin as unknown as Record<string, unknown>)._gossamerLastRun = run;
}

/**
 * Open Gossamer score entry modal
 */
export async function openGossamerScoreEntry(plugin: RadialTimelinePlugin): Promise<void> {
  // Get all Plot notes
  const scenes = await plugin.getSceneData();
  const plotBeats = scenes.filter(s => s.itemType === 'Plot' && (s.subplot === 'Main Plot' || !s.subplot));
  
  if (plotBeats.length === 0) {
    new Notice('No Plot beats found. Create notes with Class: Plot.');
    return;
  }
  
  // Open score entry modal
  const modal = new GossamerScoreModal(plugin.app, plugin, plotBeats);
  modal.open();
}

export function getActiveGossamerRun(plugin: RadialTimelinePlugin): GossamerRun | null {
  return lastRunByPlugin.get(plugin) ?? null;
}

export async function toggleGossamerMode(plugin: RadialTimelinePlugin): Promise<void> {
  const view = getFirstView(plugin);
  if (!view) return;
  const current = getInteractionMode(view) === 'gossamer';
  if (current) {
    exitGossamerMode(plugin);
  } else {
    // Ensure a run exists (use default if none)
    if (!getActiveGossamerRun(plugin)) {
      const scenes = await plugin.getSceneData();
      const def = buildRunFromDefault(scenes);
      setInMemoryRun(plugin, def);
    }
    setBaseModeAllScenes(plugin);
    resetRotation(plugin);
    plugin.clearSearch();
    enterGossamerMode(plugin);
  }
}

function enterGossamerMode(plugin: RadialTimelinePlugin) {
  const view = getFirstView(plugin);
  if (!view) return;
  setInteractionMode(view, 'gossamer');
  // Setup will now happen inside renderTimeline after DOM is ready
  plugin.refreshTimelineIfNeeded(undefined);
}

function exitGossamerMode(plugin: RadialTimelinePlugin) {
  const view = getFirstView(plugin);
  if (!view) return;
  
  // Remove Gossamer event listeners before switching mode
  const svg = view.containerEl.querySelector('.radial-timeline-svg') as SVGSVGElement;
  if (svg && typeof (view as any).removeGossamerEventListeners === 'function') {
    (view as any).removeGossamerEventListeners(svg);
  }
  
  setInteractionMode(view, 'normal');
  restoreBaseMode(plugin);
  plugin.refreshTimelineIfNeeded(undefined);
}

// Base-mode helpers
let _previousBaseAllScenes: boolean | null = null;

export function setBaseModeAllScenes(plugin: RadialTimelinePlugin) {
  if (_previousBaseAllScenes === null) _previousBaseAllScenes = !!plugin.settings.outerRingAllScenes;
  if (!plugin.settings.outerRingAllScenes) {
    plugin.settings.outerRingAllScenes = true;
    plugin.saveSettings();
  }
}

export function restoreBaseMode(plugin: RadialTimelinePlugin) {
  if (_previousBaseAllScenes !== null) {
    plugin.settings.outerRingAllScenes = _previousBaseAllScenes;
    plugin.saveSettings();
    _previousBaseAllScenes = null;
  }
}

export function resetRotation(plugin: RadialTimelinePlugin) {
  const views = getAllViews(plugin);
  if (!Array.isArray(views)) return;
  views.forEach(v => { if (hasKey(v, 'rotationState')) (v as { rotationState: boolean }).rotationState = false; });
}

// --- Safe access helpers ---
function getAllViews(plugin: RadialTimelinePlugin): unknown[] | null {
  const p = plugin as unknown as { getTimelineViews?: () => unknown[] };
  if (typeof p.getTimelineViews === 'function') return p.getTimelineViews();
  return null;
}

function getFirstView(plugin: RadialTimelinePlugin): unknown | null {
  const p = plugin as unknown as { getTimelineViews?: () => unknown[]; getFirstTimelineView?: () => unknown | null };
  if (typeof p.getTimelineViews === 'function') {
    const list = p.getTimelineViews();
    if (Array.isArray(list) && list.length > 0) return list[0];
  }
  if (typeof p.getFirstTimelineView === 'function') return p.getFirstTimelineView();
  return null;
}

function hasKey(obj: unknown, key: string): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && key in (obj as Record<string, unknown>);
}

function getInteractionMode(view: unknown): 'normal' | 'gossamer' | undefined {
  if (hasKey(view, 'interactionMode')) {
    const val = (view as Record<string, unknown>).interactionMode;
    if (val === 'normal' || val === 'gossamer') return val;
  }
  return undefined;
}

function setInteractionMode(view: unknown, mode: 'normal' | 'gossamer'): void {
  if (hasKey(view, 'interactionMode')) {
    (view as { interactionMode: 'normal' | 'gossamer' }).interactionMode = mode;
  }
}


