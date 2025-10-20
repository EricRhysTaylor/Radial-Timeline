/*
 * Gossamer Commands and State - Manual Score Entry
 */
import type RadialTimelinePlugin from './main';
import { buildRunFromDefault, buildAllGossamerRuns, GossamerRun, normalizeBeatName, shiftGossamerHistory, extractBeatOrder } from './utils/gossamer';
import { Notice, TFile, App } from 'obsidian';
import { GossamerScoreModal } from './modals/GossamerScoreModal';

// Helper to find Plot note by beat title
function findPlotNoteByTitle(files: TFile[], beatTitle: string, app: App): TFile | null {
  for (const file of files) {
    if (file.basename === beatTitle || file.basename === beatTitle.replace(/^\d+\s+/, '')) {
      const cache = app.metadataCache.getFileCache(file);
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
    const file = findPlotNoteByTitle(files, beatTitle, plugin.app);
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
 * Parse scores from clipboard text in multiple formats:
 * 
 * Format 1 - Simple numeric (positional):
 * "1: 15, 2: 25, 3: 30, 4: 45, 5: 50"
 * 
 * Format 2 - Named beats:
 * "Opening Image: 8"
 * "Theme Stated: 12"
 * 
 * Case-insensitive, handles leading numbers
 */
export function parseScoresFromClipboard(clipboardText: string): Map<string, number> {
  const scores = new Map<string, number>();
  
  // Try Format 1 first: Simple numeric format "1: 15, 2: 25, 3: 30"
  const simpleFormatRegex = /(\d+)\s*:\s*(\d+)/g;
  const simpleMatches = Array.from(clipboardText.matchAll(simpleFormatRegex));
  
  if (simpleMatches.length > 0) {
    // Use simple numeric format - store as position → score
    for (const match of simpleMatches) {
      const position = parseInt(match[1]);
      const score = parseInt(match[2]);
      
      if (!isNaN(position) && !isNaN(score) && score >= 0 && score <= 100) {
        // Store with position as key for later mapping
        scores.set(`__position_${position}`, score);
      }
    }
    return scores;
  }
  
  // Format 2: Named format "Beat Name: 42" (flexible with whitespace)
  // Handle both full titles like "1 Opening Image: 14" and simplified like "1openingimage: 14"
  const lineRegex = /^(.+?):\s*(\d+)\s*$/gm;
  
  let match;
  while ((match = lineRegex.exec(clipboardText)) !== null) {
    const beatName = match[1].trim();
    const score = parseInt(match[2]);
    
    if (!isNaN(score) && score >= 0 && score <= 100) {
      // Store the score with the exact beat name for matching
      scores.set(beatName, score);
      
      // Also store with normalized name for fuzzy matching
      const normalizedBeat = normalizeBeatName(beatName);
      scores.set(normalizedBeat, score);
      
      // Store additional variations for better matching
      // Remove leading numbers and periods for flexible matching
      const withoutNumber = beatName.replace(/^\d+\.?\s*/, '').trim();
      if (withoutNumber !== beatName) {
        scores.set(withoutNumber, score);
        scores.set(normalizeBeatName(withoutNumber), score);
      }
      
      // Store without percentage annotations (handle various space formats)
      const withoutPercent = beatName.replace(/\s*\d+(?:\s*-\s*\d+)?\s*%?\s*$/i, '').trim();
      if (withoutPercent !== beatName) {
        scores.set(withoutPercent, score);
        scores.set(normalizeBeatName(withoutPercent), score);
      }
      
      // Store without both number prefix AND percentage for maximum flexibility
      const withoutNumberAndPercent = beatName
        .replace(/^\d+\.?\s*/, '') // Remove number prefix
        .replace(/\s*\d+(?:\s*-\s*\d+)?\s*%?\s*$/i, '') // Remove percentage (handle various space formats)
        .trim();
      if (withoutNumberAndPercent !== beatName && withoutNumberAndPercent !== withoutNumber && withoutNumberAndPercent !== withoutPercent) {
        scores.set(withoutNumberAndPercent, score);
        scores.set(normalizeBeatName(withoutNumberAndPercent), score);
      }
      
      // Store with just the core beat name (most flexible)
      const coreBeatName = beatName
        .replace(/^\d+\.?\s*/, '') // Remove number prefix
        .replace(/\s*\d+(?:\s*-\s*\d+)?\s*%?\s*$/i, '') // Remove percentage (handle various space formats)
        .replace(/\s+of\s+/gi, ' ') // Normalize "of" spacing
        .trim();
      if (coreBeatName !== beatName && coreBeatName !== withoutNumber && coreBeatName !== withoutPercent && coreBeatName !== withoutNumberAndPercent) {
        scores.set(coreBeatName, score);
        scores.set(normalizeBeatName(coreBeatName), score);
      }
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
// Helper for consistent log terminology ("allscenes" instead of internal "normal")
// (Currently unused since console logs were removed)
// function modeNameForLog(mode: 'allscenes' | 'mainplot' | 'gossamer' | undefined | null): string {
//   if (mode === 'allscenes') return 'allscenes';
//   return mode ?? 'unknown';
// }


/**
 * Open Gossamer score entry modal
 */
export async function openGossamerScoreEntry(plugin: RadialTimelinePlugin): Promise<void> {
  // Get all Plot notes (no subplot filtering - beats are not scenes)
  const scenes = await plugin.getSceneData();
  const plotBeats = scenes.filter(s => s.itemType === 'Plot');
  
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
    // ALWAYS rebuild run from fresh scene data (reads latest Gossamer1 scores from YAML)
    const scenes = await plugin.getSceneData();
    
    // Check if there are any Plot notes
    const plotNotes = scenes.filter(s => s.itemType === 'Plot');
    if (plotNotes.length === 0) {
      new Notice('Cannot enter Gossamer mode: No Plot notes found. Create notes with Class: Plot.');
      return;
    }
    
    // Use plot system from settings if explicitly set (not empty)
    const selectedBeatModel = plugin.settings.plotSystem?.trim() || undefined;
    
    // Build all runs (Gossamer1-30) with min/max band
    const allRuns = buildAllGossamerRuns(scenes as unknown as { itemType?: string; [key: string]: unknown }[], selectedBeatModel);
    
    if (allRuns.current.beats.length === 0) {
      const systemMsg = selectedBeatModel ? ` with Plot System: ${selectedBeatModel}` : '';
      new Notice(`Cannot enter Gossamer mode: No Plot notes found${systemMsg}. Create notes with Class: Plot.`);
      return;
    }
    
    // Check if ALL plot notes are missing Gossamer1 scores
    const hasAnyScores = plotNotes.some(s => typeof s.Gossamer1 === 'number');
    if (!hasAnyScores) {
      new Notice('Warning: No Gossamer1 scores found in Plot notes. Defaulting all beats to 0. Add Gossamer1: <score> to your Plot note frontmatter.');
    }
    
    // Store all runs on plugin (for renderer)
    setInMemoryRun(plugin, allRuns.current);
    (plugin as any)._gossamerHistoricalRuns = allRuns.historical;
    (plugin as any)._gossamerMinMax = allRuns.minMax;
    
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
  // Prefer selective update: build layer in-place without full refresh
  const v = view as unknown as { containerEl?: HTMLElement; interactionMode?: string } & Record<string, unknown>;
  const svg = (v as { containerEl?: HTMLElement } | null)?.containerEl?.querySelector?.('.radial-timeline-svg') as SVGSVGElement | null;
  let didSelective = false;
  try {
    const rs = (plugin.getRendererService && plugin.getRendererService()) || (plugin as any).rendererService;
    if (rs && v) {
      // Attach scene data to view if available for color/path mapping
      (v as any).sceneData = plugin.lastSceneData || (v as any).sceneData;
      (v as any).interactionMode = 'gossamer';
      const viewArg = {
        containerEl: (v as any).containerEl as HTMLElement,
        plugin,
        sceneData: (v as any).sceneData as any,
        interactionMode: 'gossamer' as const
      };
      didSelective = rs.updateGossamerLayer(viewArg);
    }
    if (didSelective && svg) {
      // Apply gossamer-mode styling: mute non-plot elements
      svg.setAttribute('data-gossamer-mode', 'true');
      const allElements = svg.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title');
      allElements.forEach(el => {
        const group = el.closest('.rt-scene-group');
        const itemType = group?.getAttribute('data-item-type');
        if (itemType !== 'Plot') {
          el.classList.add('rt-non-selected');
        }
      });
      
      // Update mode toggle button to show it will return to the original mode
      const modeToggle = svg.querySelector('#mode-toggle') as SVGGElement | null;
      if (modeToggle) {
        const originalMode = _previousBaseAllScenes ? 'allscenes' : 'mainplot';
        modeToggle.setAttribute('data-current-mode', originalMode);
        const title = modeToggle.querySelector('title');
        if (title) {
          title.textContent = originalMode === 'allscenes' ? 'Switch to Main Plot mode' : 'Switch to All Scenes mode';
        }
      }
      
      // Set up gossamer handlers on existing DOM if method exposed
      const setup = (v as any)?.setupGossamerEventListeners as ((svg: SVGSVGElement) => void) | undefined;
      if (typeof setup === 'function') setup(svg);
    }
  } catch {}
  if (!didSelective) {
    // Fall back to full refresh if selective failed
    plugin.refreshTimelineIfNeeded(undefined);
  }
}

function exitGossamerMode(plugin: RadialTimelinePlugin) {
  // Guard against double-execution
  if (_isExitingGossamer) {
    return;
  }
  
  const view = getFirstView(plugin);
  if (!view) {
    return;
  }
  
  // Set guard flag
  _isExitingGossamer = true;
  
  // Get SVG element
  const svg = (view as { containerEl?: HTMLElement } | null)?.containerEl?.querySelector('.radial-timeline-svg') as SVGSVGElement;
  
  // Remove all Gossamer muting classes FIRST
  if (svg) {
    const allElements = svg.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title, .rt-subplot-ring-label-text');
    allElements.forEach(el => el.classList.remove('rt-non-selected'));
    svg.removeAttribute('data-gossamer-mode');
  }
  
  // Remove Gossamer event listeners
  if (svg && typeof (view as unknown as { removeGossamerEventListeners?: (s: SVGSVGElement) => void }).removeGossamerEventListeners === 'function') {
    (view as unknown as { removeGossamerEventListeners: (s: SVGSVGElement) => void }).removeGossamerEventListeners(svg);
  }

  restoreBaseMode(plugin);
  
  // Always return to 'allscenes' interaction mode
  // The renderer will handle Main Plot mode via outerRingAllScenes setting
  // We don't use 'mainplot' interaction mode for settings-based Main Plot
  setInteractionMode(view, 'allscenes');
  
  // Force an immediate full refresh when exiting Gossamer mode
  // Use direct refreshTimeline() to avoid debounce delay
  if (typeof (view as any).refreshTimeline === 'function') {
    (view as any).refreshTimeline();
  } else {
    // Fallback to plugin refresh
    plugin.refreshTimelineIfNeeded(null);
  }
  
  // Reset guard flag after a short delay to allow the refresh to complete
  setTimeout(() => {
    _isExitingGossamer = false;
  }, 100);
}

// Base-mode helpers
let _previousBaseAllScenes: boolean | null = null;

// Guard to prevent double-execution of exit
let _isExitingGossamer = false;

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

export function resetGossamerModeState() {
  // Reset the Gossamer mode state variables when mode is changed outside of Gossamer
  _previousBaseAllScenes = null;
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

function getInteractionMode(view: unknown): 'allscenes' | 'mainplot' | 'gossamer' | undefined {
  if (hasKey(view, 'interactionMode')) {
    const val = (view as Record<string, unknown>).interactionMode;
    if (val === 'allscenes' || val === 'gossamer' || val === 'mainplot') return val as any;
  }
  return undefined;
}

function setInteractionMode(view: unknown, mode: 'allscenes' | 'mainplot' | 'gossamer'): void {
  if (hasKey(view, 'interactionMode')) {
    (view as { interactionMode: 'allscenes' | 'mainplot' | 'gossamer' }).interactionMode = mode;
  }
}


