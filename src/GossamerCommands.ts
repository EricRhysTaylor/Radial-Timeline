/*
 * Gossamer Commands and State - Manual Score Entry
 */
import type RadialTimelinePlugin from './main';
import { DEFAULT_GEMINI_MODEL_ID } from './constants/aiDefaults';
import { buildRunFromDefault, buildAllGossamerRuns, GossamerRun, normalizeBeatName, appendGossamerScore, extractBeatOrder, detectDominantStage } from './utils/gossamer';
import { Notice, TFile, TFolder, App, normalizePath } from 'obsidian';
import { GossamerScoreModal } from './modals/GossamerScoreModal';
import { GossamerProcessingModal, type ManuscriptInfo, type AnalysisOptions } from './modals/GossamerProcessingModal';
import { TimelineMode } from './modes/ModeDefinition';
import { assembleManuscript } from './utils/manuscript';
import { buildUnifiedBeatAnalysisPrompt, getUnifiedBeatAnalysisJsonSchema, type UnifiedBeatInfo } from './ai/prompts/unifiedBeatAnalysis';
import { callGeminiApi } from './api/geminiApi';
import { buildProviderRequestPayload } from './api/requestPayload';
import {
  extractTokenUsage,
  formatAiLogContent,
  formatSummaryLogContent,
  formatLogTimestamp,
  resolveAiLogFolder,
  resolveAvailableLogPath,
  sanitizeLogPayload
} from './ai/log';
import { ensureGossamerContentLogFolder, resolveGossamerContentLogFolder } from './inquiry/utils/logs';
import { resolveSelectedBeatModel } from './utils/beatsInputNormalize';
import { isPathInFolderScope } from './utils/pathScope';
const resolveGeminiModelId = (plugin?: RadialTimelinePlugin): string =>
  plugin?.settings?.geminiModelId || DEFAULT_GEMINI_MODEL_ID;

const sanitizeSegment = (value: string | null | undefined) => {
  if (!value) return '';
  return value
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/-+/g, '-')
    .trim()
    .replace(/^-+|-+$/g, '');
};

const resolveGeminiModelFromResponse = (responseData: unknown): string | undefined => {
  if (!responseData || typeof responseData !== 'object') return undefined;
  const data = responseData as Record<string, unknown>;
  if (typeof data.modelVersion === 'string') return data.modelVersion;
  if (typeof data.model === 'string') return data.model;
  return undefined;
};

type GossamerLogPayload = {
  status: 'success' | 'error';
  beatSystemLabel: string;
  modelRequested: string;
  modelResolved?: string;
  prompt: string;
  manuscriptText: string;
  requestPayload: unknown;
  responseData?: unknown;
  assistantContent?: string | null;
  parsedOutput?: unknown;
  submittedAt?: Date | null;
  returnedAt?: Date | null;
  derivedSummary?: string;
  schemaWarnings?: string[];
};

async function writeGossamerLog(
  plugin: RadialTimelinePlugin,
  payload: GossamerLogPayload
): Promise<TFile | null> {
  const timestampSource = payload.returnedAt ?? payload.submittedAt ?? new Date();
  const readableTimestamp = formatLogTimestamp(timestampSource);
  const safeBeatSystem = sanitizeSegment(payload.beatSystemLabel) || 'Gossamer';
  const scopeTarget = `Manuscript · ${payload.beatSystemLabel}`;

  const { sanitized: sanitizedPayload, redactedKeys } = sanitizeLogPayload(payload.requestPayload ?? null);
  const sanitizationNotes = redactedKeys.length
    ? [`Redacted request keys: ${redactedKeys.join(', ')}.`]
    : [];
  const tokenUsage = extractTokenUsage('gemini', payload.responseData);
  const schemaWarnings = payload.schemaWarnings ?? [];
  const durationMs = payload.submittedAt && payload.returnedAt
    ? payload.returnedAt.getTime() - payload.submittedAt.getTime()
    : null;

  const isError = payload.status === 'error';
  const shouldWriteContent = plugin.settings.logApiInteractions || isError;

  // Write Content Log first (if enabled) so we know whether to mark it as written
  let contentLogWritten = false;
  if (shouldWriteContent) {
    try {
      const contentFolder = await ensureGossamerContentLogFolder(plugin.app);
      if (contentFolder) {
        const contentTitle = `Gossamer Content Log — ${payload.beatSystemLabel} ${readableTimestamp}`;
        const contentBaseName = `Gossamer Content Log — ${safeBeatSystem} ${readableTimestamp}`;

        const contentLogContent = formatAiLogContent({
          title: contentTitle,
          metadata: {
            feature: 'Gossamer',
            scopeTarget,
            provider: 'gemini',
            modelRequested: payload.modelRequested,
            modelResolved: payload.modelResolved ?? payload.modelRequested,
            submittedAt: payload.submittedAt ?? null,
            returnedAt: payload.returnedAt ?? null,
            durationMs,
            status: payload.status,
            tokenUsage
          },
          request: {
            systemPrompt: '',
            userPrompt: payload.prompt,
            evidenceText: payload.manuscriptText,
            requestPayload: sanitizedPayload
          },
          response: {
            rawResponse: payload.responseData ?? null,
            assistantContent: payload.assistantContent ?? '',
            parsedOutput: payload.parsedOutput ?? null
          },
          notes: {
            sanitizationSteps: sanitizationNotes,
            retryAttempts: 0,
            schemaWarnings
          },
          derivedSummary: payload.derivedSummary
        });

        const contentFolderPath = resolveGossamerContentLogFolder();
        const contentFilePath = resolveAvailableLogPath(plugin.app.vault, contentFolderPath, contentBaseName);
        await plugin.app.vault.create(contentFilePath, contentLogContent.trim());
        contentLogWritten = true;
      }
    } catch (e) {
      console.error('[Gossamer][log] Failed to write content log:', e);
      // Non-blocking: continue with summary log
    }
  }

  // Write Summary Log (always written for AI runs)
  let summaryFile: TFile | null = null;
  try {
    const summaryFolderPath = normalizePath(resolveAiLogFolder());
    const existing = plugin.app.vault.getAbstractFileByPath(summaryFolderPath);
    if (existing && !(existing instanceof TFolder)) {
      console.error('[Gossamer][log] Log folder path is not a folder.');
      return null;
    }
    try {
      await plugin.app.vault.createFolder(summaryFolderPath);
    } catch {
      // Folder may already exist.
    }

    const summaryTitle = `Gossamer Log — ${payload.beatSystemLabel} ${readableTimestamp}`;
    const summaryBaseName = `Gossamer Log — ${safeBeatSystem} ${readableTimestamp}`;

    // Build result summary from derived summary (first line or key info)
    let resultSummary: string | undefined;
    if (payload.status === 'success' && payload.derivedSummary) {
      const firstLine = payload.derivedSummary.split('\n').find(line => line.trim().length > 0);
      resultSummary = firstLine ? firstLine.trim().slice(0, 100) : 'Analysis complete.';
    }

    const summaryContent = formatSummaryLogContent({
      title: summaryTitle,
      feature: 'Gossamer',
      scopeTarget,
      provider: 'gemini',
      modelRequested: payload.modelRequested,
      modelResolved: payload.modelResolved ?? payload.modelRequested,
      submittedAt: payload.submittedAt ?? null,
      returnedAt: payload.returnedAt ?? null,
      durationMs,
      status: payload.status,
      tokenUsage,
      resultSummary,
      errorReason: isError ? (payload.assistantContent || 'Unknown error.') : null,
      suggestedFixes: isError ? ['Retry or check Gemini API configuration.'] : undefined,
      contentLogWritten,
      retryAttempts: 0
    });

    const summaryFilePath = resolveAvailableLogPath(plugin.app.vault, summaryFolderPath, summaryBaseName);
    summaryFile = await plugin.app.vault.create(summaryFilePath, summaryContent.trim());
  } catch (e) {
    console.error('[Gossamer][log] Failed to write summary log:', e);
    // Non-blocking: logging failures should not break the AI run
  }

  return summaryFile;
}

// Helper to find Beat note by beat title (prefers Beat over Plot)
function findBeatNoteByTitle(files: TFile[], beatTitle: string, app: App): TFile | null {
  for (const file of files) {
    if (file.basename === beatTitle || file.basename === beatTitle.replace(/^\d+\s+/, '')) {
      const cache = app.metadataCache.getFileCache(file);
      const fm = cache?.frontmatter;
      if (fm && (fm.Class === 'Beat' || fm.class === 'Beat' || fm.Class === 'Plot' || fm.class === 'Plot')) {
        return file;
      }
    }
  }
  return null;
}

/**
 * Save Gossamer scores to Beat note frontmatter with appending (G1=oldest, newest=highest number)
 * Also saves the dominant publish stage at the time of the run.
 */
async function saveGossamerScores(
  plugin: RadialTimelinePlugin,
  scores: Map<string, number>, // beatTitle → score
  dominantStage?: string // Optional pre-computed stage
): Promise<void> {
  const bookScope = (plugin.settings.sourcePath || '').trim();
  const files = plugin.app.vault.getMarkdownFiles().filter(f => isPathInFolderScope(f.path, bookScope));
  let updateCount = 0;
  
  // Detect dominant stage if not provided
  let stage = dominantStage || 'Zero';
  if (!dominantStage) {
    try {
      const scenes = await plugin.getSceneData();
      stage = detectDominantStage(scenes);
    } catch (e) {
      console.error('[Gossamer] Failed to detect dominant stage, defaulting to Zero:', e);
    }
  }
  
  for (const [beatTitle, newScore] of scores) {
    const file = findBeatNoteByTitle(files, beatTitle, plugin.app);
    if (!file) {
      continue;
    }
    
    try {
      await plugin.app.fileManager.processFrontMatter(file, (yaml) => {
        const fm = yaml as Record<string, any>;
        
        // Append new score to end (G1=oldest, newest=highest number)
        const { nextIndex, updated } = appendGossamerScore(fm);
        Object.assign(fm, updated);
        
        // Set new score at next available index
        fm[`Gossamer${nextIndex}`] = newScore;
        
        // Set the stage for this run
        fm[`GossamerStage${nextIndex}`] = stage;
        
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
    new Notice(`Updated ${updateCount} beat scores (${stage} stage).`);
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

/**
 * Open Gossamer score entry modal
 */
export async function openGossamerScoreEntry(plugin: RadialTimelinePlugin): Promise<void> {
  // Get story beat notes filtered by Beat Model setting (same as gossamer rendering)
  const scenes = await plugin.getSceneData();
  const plotBeats = scenes.filter(s => s.itemType === 'Beat');
  
  if (plotBeats.length === 0) {
    new Notice('No story beats found. Create notes with frontmatter "Class: Beat".');
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
    
    // Check if there are any story beat notes (Beat or legacy Plot)
    const beatNotes = scenes.filter(s => s.itemType === 'Beat' || s.itemType === 'Plot');
    if (beatNotes.length === 0) {
      const selectedSystem = resolveSelectedBeatModel(plugin.settings.beatSystem, plugin.settings.customBeatSystemName) ?? '';
      const systemHint = selectedSystem
        ? `No "${selectedSystem}" beat notes found. Ensure beat notes have "Class: Beat" and "Beat Model: ${selectedSystem}" in frontmatter.`
        : 'No story beats found. Create notes with frontmatter "Class: Beat".';
      new Notice(`Cannot enter Gossamer mode. ${systemHint}`, 8000);
      return;
    }
    
    // Use beat system from settings if explicitly set (not empty)
    const selectedBeatModel = resolveSelectedBeatModel(plugin.settings.beatSystem, plugin.settings.customBeatSystemName);
    
    // Build all runs (Gossamer1-30) with min/max band
    const allRuns = buildAllGossamerRuns(scenes as unknown as { itemType?: string; [key: string]: unknown }[], selectedBeatModel);
    
    if (allRuns.current.beats.length === 0) {
      const systemHint = selectedBeatModel
        ? `No beat notes found matching "${selectedBeatModel}". Check that your beat notes have "Beat Model: ${selectedBeatModel}" in frontmatter.`
        : 'No story beat notes could be matched.';
      new Notice(`Cannot enter Gossamer mode. ${systemHint}`, 8000);
      return;
    }
    
    // Show info message if no scores exist (graceful, not a warning)
    if (!allRuns.hasAnyScores) {
      new Notice('No Gossamer scores found. Showing ideal ranges and spokes. Add scores using "Gossamer enter momentum scores" command.');
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

async function enterGossamerMode(plugin: RadialTimelinePlugin) {
  const view = getFirstView(plugin);
  if (!view) return;
  
  // Try using ModeManager first
  const modeManager = hasKey(view, 'getModeManager') && typeof (view as any).getModeManager === 'function'
    ? (view as any).getModeManager()
    : null;
  
  if (modeManager) {
    // Use new ModeManager for mode switching
    await modeManager.switchMode(TimelineMode.GOSSAMER);
    // ModeManager handles: settings persistence, lifecycle hooks, and refresh
  } else {
    // Fallback mode switching
    // Update mode system
    if (hasKey(view, 'currentMode')) {
      (view as any).currentMode = 'gossamer';
    }
    
    // Update settings
    plugin.settings.currentMode = 'gossamer';
    plugin.saveSettings();
  }
  
  // Only do selective update if not using ModeManager
  // (ModeManager handles refresh through lifecycle hooks)
  if (!modeManager) {
    // Prefer selective update: build layer in-place without full refresh
    const v = view as unknown as { containerEl?: HTMLElement; currentMode?: string } & Record<string, unknown>;
    const svg = (v as { containerEl?: HTMLElement } | null)?.containerEl?.querySelector?.('.radial-timeline-svg') as SVGSVGElement | null;
    let didSelective = false;
    try {
      const rs = (plugin.getRendererService && plugin.getRendererService()) || (plugin as any).rendererService;
      if (rs && v) {
        // Attach scene data to view if available for color/path mapping
        (v as any).sceneData = plugin.lastSceneData || (v as any).sceneData;
        (v as any).currentMode = 'gossamer';
        const viewArg = {
          containerEl: (v as any).containerEl as HTMLElement,
          plugin,
          sceneData: (v as any).sceneData as any,
          currentMode: 'gossamer' as const
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
          // Keep beats (story structure) unmuted, mute everything else
          if (itemType !== 'Beat') {
            el.classList.add('rt-non-selected');
          }
        });
        
        // Update mode toggle button to show it will return to the original mode
        const modeToggle = svg.querySelector('#mode-toggle') as SVGGElement | null;
        if (modeToggle) {
          const originalMode = _previousBaseMode || 'narrative';
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
}

async function exitGossamerMode(plugin: RadialTimelinePlugin) {
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
  
  // Try using ModeManager first
  const modeManager = hasKey(view, 'getModeManager') && typeof (view as any).getModeManager === 'function'
    ? (view as any).getModeManager()
    : null;
  
  if (modeManager) {
    // Use new ModeManager for mode switching
    const restoredMode = restoreBaseMode(plugin);
    
    // Use ModeManager to switch (handles lifecycle hooks and refresh)
    await modeManager.switchMode(restoredMode as any);
    
    // Reset guard flag after a short delay
    window.setTimeout(() => {
      _isExitingGossamer = false;
    }, 100);
    
    return;
  }
  
  // Fallback mode exit
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

  const restoredMode = restoreBaseMode(plugin);
  
  // Update new mode system if available
  if (hasKey(view, 'currentMode')) {
    (view as any).currentMode = restoredMode;
  }
  
  // Update settings
  plugin.settings.currentMode = restoredMode;
  plugin.saveSettings();
  
  // Force an immediate full refresh when exiting Gossamer mode
  // Use direct refreshTimeline() to avoid debounce delay
  if (typeof (view as any).refreshTimeline === 'function') {
    (view as any).refreshTimeline();
  } else {
    // Fallback to plugin refresh
    plugin.refreshTimelineIfNeeded(null);
  }
  
  // Reset guard flag after a short delay to allow the refresh to complete
  window.setTimeout(() => {
    _isExitingGossamer = false;
  }, 100);
}

// Base-mode helpers
let _previousBaseMode: string | null = null;

// Guard to prevent double-execution of exit
let _isExitingGossamer = false;

export function setBaseModeAllScenes(plugin: RadialTimelinePlugin) {
  // Save the current mode before entering Gossamer (if not already saved)
  if (_previousBaseMode === null) {
    _previousBaseMode = plugin.settings.currentMode || 'narrative';
  }
}

export function restoreBaseMode(plugin: RadialTimelinePlugin): string {
  // Restore the saved mode
  if (_previousBaseMode !== null) {
    const mode = _previousBaseMode;
    _previousBaseMode = null;
    return mode;
  }
  // Default to narrative if no saved mode
  return 'narrative';
}

export function resetGossamerModeState() {
  // Reset the Gossamer mode state variables when mode is changed outside of Gossamer
  _previousBaseMode = null;
}

export function resetRotation(plugin: RadialTimelinePlugin) {
  const views = getAllViews(plugin);
  if (!Array.isArray(views)) return;
  views.forEach((view) => {
    if (hasKey(view, 'rotationState')) {
      (view as { rotationState: boolean }).rotationState = false;
    }
  });
}

// --- Safe access helpers ---
function getAllViews(plugin: RadialTimelinePlugin): unknown[] | null {
    const timelineService = (plugin as any).timelineService;
    if (timelineService && typeof timelineService.getTimelineViews === 'function') {
        return timelineService.getTimelineViews();
    }
    return null;
}

function getFirstView(plugin: RadialTimelinePlugin): unknown | null {
    const timelineService = (plugin as any).timelineService;
    if (timelineService && typeof timelineService.getFirstTimelineView === 'function') {
        return timelineService.getFirstTimelineView();
    }
    // Fallback for older versions or if the method doesn't exist
    const views = getAllViews(plugin);
    return views && views.length > 0 ? views[0] : null;
}

function hasKey(obj: unknown, key: string): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && key in (obj as Record<string, unknown>);
}

function getInteractionMode(view: unknown): 'allscenes' | 'mainplot' | 'gossamer' | undefined {
  if (hasKey(view, 'currentMode')) {
    const val = (view as Record<string, unknown>).currentMode;
    if (val === 'narrative' || val === 'gossamer' || val === 'subplot') return val as any;
  }
  return undefined;
}

/**
 * Run Gemini AI analysis of manuscript momentum across story beats
 */
export async function runGossamerAiAnalysis(plugin: RadialTimelinePlugin): Promise<void> {
  // Get beat system from settings (used by both pre-check and processing)
  const settingsBeatSystem = plugin.settings.beatSystem || 'Save The Cat';
  
  // If Custom is selected, try to get the custom name from the first beat note's Beat Model field
  let beatSystemDisplayName = settingsBeatSystem;
  if (settingsBeatSystem === 'Custom') {
    // Get beat notes to check for custom name
    const scenes = await plugin.getSceneData({ filterBeatsBySystem: false });
    const allBeats = scenes.filter(s => (s.itemType === 'Beat' || s.itemType === 'Plot'));
    
    // Find first beat without a recognized system
    const recognizedSystems = ['Save The Cat', 'Hero\'s Journey', 'Story Grid'];
    for (const beat of allBeats) {
      if (!beat.path) continue;
      const file = plugin.app.vault.getAbstractFileByPath(beat.path);
      if (!file) continue;
      const cache = plugin.app.metadataCache.getFileCache(file as any);
      const beatModel = cache?.frontmatter?.["Beat Model"] as string | undefined;
      
      // If we find a custom beat model (not one of the recognized systems)
      if (beatModel && !recognizedSystems.includes(beatModel)) {
        beatSystemDisplayName = beatModel;
        break;
      }
    }
  }
  
  const beatSystem = settingsBeatSystem; // Use settings value for filtering logic
  
  // Define the actual processing function
  const processAnalysis = async (options: AnalysisOptions, modal: GossamerProcessingModal) => {
    try {
      modal.setStatus('Validating configuration...');
      
      // Check if Gemini API key is configured
      if (!plugin.settings.geminiApiKey || plugin.settings.geminiApiKey.trim() === '') {
        modal.addError('Gemini API key not configured. Go to Settings → AI → Gemini API key.');
        modal.completeProcessing(false, 'Configuration error');
        new Notice('Gemini API key not configured. Go to Settings → AI → Gemini API key.');
        return;
      }
      
      modal.setStatus('Loading story beats...');
      
      // Get all beat notes
      const scenes = await plugin.getSceneData();
      let plotBeats = scenes.filter(s => (s.itemType === 'Beat' || s.itemType === 'Plot'));
      
      // Use centralized filtering helper (single source of truth)
      const { filterBeatsBySystem } = await import('./utils/gossamer');
      if (beatSystem && beatSystem.trim() !== '' && plotBeats.some(p => p["Beat Model"])) {
        plotBeats = filterBeatsBySystem(plotBeats, beatSystem, plugin.settings.customBeatSystemName);
      }
      
      if (plotBeats.length === 0) {
        modal.addError('No story beats found. Create notes with frontmatter "Class: Beat".');
        modal.completeProcessing(false, 'No beats found');
        new Notice('No story beats found. Create notes with frontmatter "Class: Beat".');
        return;
      }

      // Build unified beat info list with all necessary data
      const beats: UnifiedBeatInfo[] = plotBeats
      .sort((a, b) => {
        const aMatch = (a.title || '').match(/^(\d+(?:\.\d+)?)/);
        const bMatch = (b.title || '').match(/^(\d+(?:\.\d+)?)/);
        const aNum = aMatch ? parseFloat(aMatch[1]) : 0;
        const bNum = bMatch ? parseFloat(bMatch[1]) : 0;
        return aNum - bNum;
      })
      .map((beat, index) => {
        const beatData = beat as any; // SAFE: Dynamic access to Gossamer and Range fields
        
        // Get cache for this beat note to read Range field
        const file = plugin.app.vault.getAbstractFileByPath(beat.path || '');
        const cache = file ? plugin.app.metadataCache.getFileCache(file as any) : null;
        const fm = cache?.frontmatter;
        
        // Read Range field directly from metadata cache
        const rangeValue = (typeof fm?.Range === 'string' ? fm.Range : '0-100');
        
        return {
          beatName: (beat.title || 'Unknown Beat').replace(/^\d+(?:\.\d+)?\s+/, ''),
          beatNumber: index + 1,
          idealRange: rangeValue
          // Note: Previous scores/justifications are intentionally NOT included
          // to avoid anchoring bias. Each analysis is fresh based on manuscript content only.
          // Historical scores remain in metadata (Gossamer1, Gossamer2, etc.) for user reference.
        };
      });

    modal.setStatus('Assembling manuscript with table of contents...');

    // Get sorted scene files (single source of truth)
    const { getSortedSceneFiles } = await import('./utils/manuscript');
    const { files: sceneFiles, sortOrder } = await getSortedSceneFiles(plugin);

    if (sceneFiles.length === 0) {
      modal.addError('No scenes found in source path.');
      modal.completeProcessing(false, 'No scenes found');
      new Notice('No scenes found in source path.');
      return;
    }

    // Assemble manuscript with table of contents
    const manuscript = await assembleManuscript(sceneFiles, plugin.app.vault, undefined, true, sortOrder); // includeTableOfContents = true

    if (!manuscript.text || manuscript.text.trim().length === 0) {
      modal.addError('Manuscript is empty. Check that your scene files have content.');
      modal.completeProcessing(false, 'Empty manuscript');
      new Notice('Manuscript is empty. Check that your scene files have content.');
      return;
    }

    // Estimate tokens (rough: ~4 characters per token)
    const estimatedTokens = Math.ceil(manuscript.text.length / 4);
    
    // Update modal with manuscript info
    const manuscriptInfo: ManuscriptInfo = {
      totalScenes: manuscript.totalScenes,
      totalWords: manuscript.totalWords,
      estimatedTokens: estimatedTokens,
      beatCount: beats.length,
      beatSystem: beatSystemDisplayName, // Use display name (may include custom name)
      hasIterativeContext: false // Always false - we don't send previous scores to avoid anchoring bias
    };
    modal.setManuscriptInfo(manuscriptInfo);

    // Build prompt
    modal.setStatus('Building analysis prompt...');
    const prompt = buildUnifiedBeatAnalysisPrompt(manuscript.text, beats, beatSystem);
    const schema = getUnifiedBeatAnalysisJsonSchema();

    // Call Gemini API
    modal.setStatus('Sending manuscript to Gemini API for momentum analysis...');
    modal.apiCallStarted();

    const geminiModelId = resolveGeminiModelId(plugin);
    const requestPayload = buildProviderRequestPayload('gemini', geminiModelId, {
      userPrompt: prompt,
      systemPrompt: null,
      maxTokens: 9000,
      temperature: 0.7,
      jsonSchema: schema
    });

    const submittedAt = new Date();
    const result = await callGeminiApi(
      plugin.settings.geminiApiKey,
      geminiModelId,
      null, // No system prompt - instructions in user prompt
      prompt,
      9000, // Allow larger JSON output
      0.7, // Temperature
      schema
    );
    const returnedAt = new Date();

    if (!result.success || !result.content) {
      modal.apiCallError(result.error || 'Failed to get response from Gemini');
      modal.completeProcessing(false, 'API call failed');
      
      // Check for rate limit
      if (result.error?.toLowerCase().includes('rate limit')) {
        modal.showRateLimitWarning();
      }
      
      await writeGossamerLog(plugin, {
        status: 'error',
        beatSystemLabel: beatSystemDisplayName,
        modelRequested: geminiModelId,
        modelResolved: resolveGeminiModelFromResponse(result.responseData) ?? geminiModelId,
        prompt,
        manuscriptText: manuscript.text,
        requestPayload,
        responseData: result.responseData,
        assistantContent: result.content,
        parsedOutput: null,
        submittedAt,
        returnedAt,
        schemaWarnings: result.error ? [`Error: ${result.error}`] : undefined
      });
      
      throw new Error(result.error || 'Failed to get response from Gemini');
    }

    modal.apiCallSuccess();
    modal.setStatus('Parsing AI response...');

    // Parse response - AI returns raw scores without range info (to avoid anchoring bias)
    interface AiBeatAnalysis {
      beatName: string;
      momentumScore: number;
      justification: string;
    }

    interface AiAnalysisResponse {
      beats: AiBeatAnalysis[];
      overallAssessment: {
        summary: string;
        strengths: string[];
        improvements: string[];
      };
    }

    // Enriched beat with computed range comparison
    interface EnrichedBeatAnalysis extends AiBeatAnalysis {
      idealRange: string;
      isWithinRange: boolean;
    }

    interface EnrichedAnalysisResponse {
      beats: EnrichedBeatAnalysis[];
      overallAssessment: {
        summary: string;
        strengths: string[];
        improvements: string[];
      };
    }

    const rawAnalysis: AiAnalysisResponse = JSON.parse(result.content);
    
    // Import range utilities for computing isWithinRange
    const { parseRange, isScoreInRange } = await import('./utils/rangeValidation');
    
    // Enrich AI response with range comparison (computed in code, not by AI)
    const analysis: EnrichedAnalysisResponse = {
      ...rawAnalysis,
      beats: rawAnalysis.beats.map((aiBeat, idx) => {
        // Match to our beats array which has the range info
        const ourBeat = beats[idx];
        const idealRange = ourBeat?.idealRange || '0-100';
        const parsed = parseRange(idealRange);
        const isWithinRange = parsed ? isScoreInRange(aiBeat.momentumScore, parsed) : true;
        
        return {
          ...aiBeat,
          idealRange,
          isWithinRange
        };
      })
    };

    // Save results to beat notes
    modal.setStatus('Updating beat notes...');
    
    // Detect dominant stage for this run
    let dominantStage = 'Zero';
    try {
      const allScenes = await plugin.getSceneData();
      dominantStage = detectDominantStage(allScenes);
    } catch (e) {
      console.error('[Gossamer] Failed to detect dominant stage, defaulting to Zero:', e);
    }
    
    const geminiBookScope = (plugin.settings.sourcePath || '').trim();
    const files = plugin.app.vault.getMarkdownFiles().filter(f => isPathInFolderScope(f.path, geminiBookScope));
    let updateCount = 0;
    const unmatchedBeats: string[] = [];

    // Match beats by index - Gemini returns them in the same order they were sent
    for (let i = 0; i < analysis.beats.length; i++) {
      const beat = analysis.beats[i];
      const matchingBeat = plotBeats[i]; // Direct index match - no searching needed!

      if (!matchingBeat) {
        unmatchedBeats.push(beat.beatName);
        continue;
      }

      // Use the file path from the matched beat
      const file = matchingBeat.path ? plugin.app.vault.getAbstractFileByPath(matchingBeat.path) : null;
      if (!file || !(file instanceof TFile)) {
        unmatchedBeats.push(beat.beatName);
        continue;
      }

      // Update beat note with scores
      await plugin.app.fileManager.processFrontMatter(file, (yaml) => {
        const fm = yaml as Record<string, any>;
        
        // Append new score to end (G1=oldest, newest=highest number)
        const { nextIndex, updated } = appendGossamerScore(fm);
        Object.assign(fm, updated);
        
        // Set new score, stage, and justification at next available index
        fm[`Gossamer${nextIndex}`] = beat.momentumScore;
        fm[`GossamerStage${nextIndex}`] = dominantStage;
        fm[`Gossamer${nextIndex} Justification`] = beat.justification || '';
        
        // Add timestamp and model info
        const now = new Date();
        const timestamp = now.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });
        const modelId = resolveGeminiModelId(plugin);
        fm['Gossamer Last Updated'] = `${timestamp} by ${modelId}`;
      });
      
      updateCount++;
    }
    
    // Log unmatched beats
    if (unmatchedBeats.length > 0) {
      modal.addError(`Could not match ${unmatchedBeats.length} beat(s): ${unmatchedBeats.join(', ')}`);
    }

    // Create analysis log (unified AI log envelope)
    modal.setStatus('Generating analysis log...');

    const derivedLines: string[] = [];
    derivedLines.push(`Beats updated: ${updateCount}`);
    derivedLines.push(`Beats analyzed: ${analysis.beats.length}`);
    if (analysis.overallAssessment?.summary) {
      derivedLines.push(`Overall summary: ${analysis.overallAssessment.summary}`);
    }
    if (analysis.overallAssessment?.strengths?.length) {
      derivedLines.push(`Strengths: ${analysis.overallAssessment.strengths.join('; ')}`);
    }
    if (analysis.overallAssessment?.improvements?.length) {
      derivedLines.push(`Improvements: ${analysis.overallAssessment.improvements.join('; ')}`);
    }
    if (unmatchedBeats.length > 0) {
      derivedLines.push(`Unmatched beats: ${unmatchedBeats.join(', ')}`);
    }
    derivedLines.push('');
    derivedLines.push(`| Beat | Score | Ideal Range | Status |`);
    derivedLines.push(`|------|-------|-------------|--------|`);
    for (const beat of analysis.beats) {
      const status = beat.isWithinRange ? 'In range' : 'Out of range';
      derivedLines.push(`| ${beat.beatName} | ${beat.momentumScore} | ${beat.idealRange} | ${status} |`);
    }

    const reportFile = await writeGossamerLog(plugin, {
      status: 'success',
      beatSystemLabel: beatSystemDisplayName,
      modelRequested: geminiModelId,
      modelResolved: resolveGeminiModelFromResponse(result.responseData) ?? geminiModelId,
      prompt,
      manuscriptText: manuscript.text,
      requestPayload,
      responseData: result.responseData,
      assistantContent: result.content,
      parsedOutput: analysis,
      submittedAt,
      returnedAt,
      derivedSummary: derivedLines.join('\n')
    });

    if (reportFile) {
      const leaf = plugin.app.workspace.getLeaf('tab');
      await leaf.openFile(reportFile);
    }

    const successMessage = `✓ Updated ${updateCount} beats with momentum scores`;
    
    const aiFolderPath = resolveAiLogFolder();
    const logMessage = plugin.settings.logApiInteractions
      ? `${successMessage}. Log saved to ${aiFolderPath} (includes full manuscript).`
      : `${successMessage}. (Logging disabled - no report saved)`;

    modal.completeProcessing(true, successMessage);
    new Notice(logMessage);

    // Refresh timeline AFTER processing completes to show updated Gossamer scores
    // Use direct refresh on all views to bypass debounce for immediate visual feedback
    plugin.getTimelineViews().forEach(v => v.refreshTimeline());

    } catch (e) {
      const errorMsg = (e as Error)?.message || 'Unknown error';
      modal.addError(`Processing failed: ${errorMsg}`);
      modal.completeProcessing(false, 'Processing failed');
      new Notice(`Failed Gossamer AI analysis: ${errorMsg}`);
      console.error('[Gossamer AI]', e);
    }
  };

  // Pre-gather manuscript info for confirmation view
  try {
    // Get scenes and beats to show in confirmation
    const scenes = await plugin.getSceneData();
    let plotBeats = scenes.filter(s => (s.itemType === 'Beat' || s.itemType === 'Plot'));
    
    // Use centralized filtering helper (single source of truth)
    const { filterBeatsBySystem } = await import('./utils/gossamer');
    if (beatSystem && beatSystem.trim() !== '' && plotBeats.some(p => p["Beat Model"])) {
      plotBeats = filterBeatsBySystem(plotBeats, beatSystem, plugin.settings.customBeatSystemName);
    }
    
    // Get sorted scene files (single source of truth)
    const { getSortedSceneFiles } = await import('./utils/manuscript');
    const { files: sceneFiles } = await getSortedSceneFiles(plugin);

    // Quick manuscript assembly to get stats
    const manuscript = await assembleManuscript(sceneFiles, plugin.app.vault);
    const estimatedTokens = Math.ceil(manuscript.text.length / 4);
    
    const manuscriptInfo: ManuscriptInfo = {
      totalScenes: manuscript.totalScenes,
      totalWords: manuscript.totalWords,
      estimatedTokens: estimatedTokens,
      beatCount: plotBeats.length,
      beatSystem: beatSystemDisplayName, // Use display name (may include custom name)
      hasIterativeContext: false // Always false - we don't send previous scores to avoid anchoring bias
    };

    // Create modal with the processing callback
    const modal = new GossamerProcessingModal(plugin.app, plugin, async (options: AnalysisOptions) => {
      await processAnalysis(options, modal);
    });
    
    // Set manuscript info in confirmation view before opening
    modal.open();
    modal.setManuscriptInfo(manuscriptInfo);
    
  } catch (e) {
    const errorMsg = (e as Error)?.message || 'Unknown error';
    new Notice(`Failed to prepare Gossamer analysis: ${errorMsg}`);
    console.error('[Gossamer AI Pre-check]', e);
  }
}
