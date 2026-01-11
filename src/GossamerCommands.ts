/*
 * Gossamer Commands and State - Manual Score Entry
 */
import type RadialTimelinePlugin from './main';
import { DEFAULT_GEMINI_MODEL_ID } from './constants/aiDefaults';
import { buildRunFromDefault, buildAllGossamerRuns, GossamerRun, normalizeBeatName, appendGossamerScore, extractBeatOrder, detectDominantStage } from './utils/gossamer';
import { Notice, TFile, App } from 'obsidian';
import { GossamerScoreModal } from './modals/GossamerScoreModal';
import { GossamerProcessingModal, type ManuscriptInfo, type AnalysisOptions } from './modals/GossamerProcessingModal';
import { TimelineMode } from './modes/ModeDefinition';
import { assembleManuscript, type AssembledManuscript, type SceneContent } from './utils/manuscript';
import { buildUnifiedBeatAnalysisPrompt, getUnifiedBeatAnalysisJsonSchema, type UnifiedBeatInfo } from './ai/prompts/unifiedBeatAnalysis';
import { callGeminiApi } from './api/geminiApi';
import { ensureAiOutputFolder, resolveAiOutputFolder } from './utils/aiOutput';
const resolveGeminiModelId = (plugin?: RadialTimelinePlugin): string =>
  plugin?.settings?.geminiModelId || DEFAULT_GEMINI_MODEL_ID;

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
  const files = plugin.app.vault.getMarkdownFiles();
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
    
    // Check if there are any story beat notes (Beat only)
    const beatNotes = scenes.filter(s => s.itemType === 'Beat');
    if (beatNotes.length === 0) {
      new Notice('Cannot enter Gossamer mode: No story beats found. Create notes with frontmatter "Class: Beat".');
      return;
    }
    
    // Use beat system from settings if explicitly set (not empty)
    const selectedBeatModel = plugin.settings.beatSystem?.trim() || undefined;
    
    // Build all runs (Gossamer1-30) with min/max band
    const allRuns = buildAllGossamerRuns(scenes as unknown as { itemType?: string; [key: string]: unknown }[], selectedBeatModel);
    
    if (allRuns.current.beats.length === 0) {
      const systemMsg = selectedBeatModel ? ` with Beat Model: ${selectedBeatModel}` : '';
      new Notice(`Cannot enter Gossamer mode: No story beat notes found${systemMsg}. Create notes with Class: Beat (or Class: Plot for backward compatibility).`);
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
          idealRange: rangeValue,
          previousScore: typeof beatData[beatData.GossamerLatestRun ? `Gossamer${beatData.GossamerLatestRun}` : 'Gossamer1'] === 'number' 
            ? beatData[beatData.GossamerLatestRun ? `Gossamer${beatData.GossamerLatestRun}` : 'Gossamer1'] 
            : undefined,
          previousJustification: typeof beatData[beatData.GossamerLatestRun ? `Gossamer${beatData.GossamerLatestRun} Justification` : 'Gossamer1 Justification'] === 'string' 
            ? beatData[beatData.GossamerLatestRun ? `Gossamer${beatData.GossamerLatestRun} Justification` : 'Gossamer1 Justification']
            : undefined
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
      hasIterativeContext: beats.some(b => b.previousScore !== undefined)
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

    const result = await callGeminiApi(
      plugin.settings.geminiApiKey,
      geminiModelId,
      null, // No system prompt - instructions in user prompt
      prompt,
      9000, // Allow larger JSON output
      0.7, // Temperature
      schema
    );

    if (!result.success || !result.content) {
      modal.apiCallError(result.error || 'Failed to get response from Gemini');
      modal.completeProcessing(false, 'API call failed');
      
      // Check for rate limit
      if (result.error?.toLowerCase().includes('rate limit')) {
        modal.showRateLimitWarning();
      }
      
      // Create diagnostic report even on failure if logging is enabled
      if (plugin.settings.logApiInteractions) {
        await createFailureDiagnosticReport(
          plugin,
          manuscript,
          beats,
          beatSystem,
          prompt,
          result.error || 'Unknown error'
        );
      }
      
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
    
    const files = plugin.app.vault.getMarkdownFiles();
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

    // Create analysis report (structured like Scene Analysis - summary then raw data)
    modal.setStatus('Generating analysis report...');
    
    const reportTimestamp = new Date();
    const timestamp = reportTimestamp.toLocaleString();
    
    const reportLines: string[] = [
      `# Gossamer Momentum Analysis Report`,
      ``,
      `**Date:** ${timestamp}`,
      `**Beat System:** ${beatSystem}`,
      `**Model:** ${resolveGeminiModelId(plugin)}`,
      `**Manuscript:** ${manuscript.totalScenes} scenes, ${manuscript.totalWords.toLocaleString()} words`,
      `**Beats Updated:** ${updateCount} of ${analysis.beats.length}`,
      ``,
      `---`,
      ``,
      `## Summary`,
      ``,
      analysis.overallAssessment.summary,
      ``,
      `**Strengths:**`,
      ...analysis.overallAssessment.strengths.map(s => `- ${s}`),
      ``,
      `**Improvements:**`,
      ...analysis.overallAssessment.improvements.map(i => `- ${i}`),
      ``,
    ];
    
    // Add unmatched beats warning if any
    if (unmatchedBeats.length > 0) {
      reportLines.push(`**⚠️ Unmatched Beats:** ${unmatchedBeats.length} beat(s) could not be matched to notes: ${unmatchedBeats.join(', ')}`);
      reportLines.push(``);
    }
    
    // Add beat scores table
    reportLines.push(`**Beat Scores:**`);
    reportLines.push(``);
    reportLines.push(`| Beat | Score | Range | Status |`);
    reportLines.push(`|------|-------|-------|--------|`);
    for (const beat of analysis.beats) {
      const status = beat.isWithinRange ? '✓' : '⚠️';
      reportLines.push(`| ${beat.beatName} | ${beat.momentumScore} | ${beat.idealRange} | ${status} |`);
    }
    reportLines.push(``);
    
    // Add technical details section with actual JSON sent and received (for debugging)
    reportLines.push(`---`);
    reportLines.push(``);
    reportLines.push(`## Debug Information`);
    reportLines.push(``);
    reportLines.push(`### Manuscript Scenes Sent`);
    reportLines.push(``);
    reportLines.push(`The following ${manuscript.totalScenes} scenes were assembled and sent to Gemini (with table of contents):`);
    reportLines.push(``);
    manuscript.scenes.forEach((scene, idx) => {
      const wordCount = scene.wordCount || 0;
      reportLines.push(`${idx + 1}. ${scene.title || 'Untitled Scene'} (${wordCount.toLocaleString()} words)`);
    });
    reportLines.push(``);
    reportLines.push(`**Total Words:** ${manuscript.totalWords.toLocaleString()}`);
    reportLines.push(``);
    reportLines.push(`### Prompt Sent to Gemini`);
    reportLines.push(``);
    reportLines.push(`\`\`\`markdown`);
    reportLines.push(prompt);
    reportLines.push(`\`\`\``);
    reportLines.push(``);
    reportLines.push(`### JSON Response Received from Gemini`);
    reportLines.push(``);
    reportLines.push(`\`\`\`json`);
    reportLines.push(result.content || ''); // Raw JSON string from API
    reportLines.push(`\`\`\``);
    reportLines.push(``);

    // Save report to AI output folder (only if logging is enabled)
    let reportFile: TFile | undefined;
    let aiFolderPath = resolveAiOutputFolder(plugin);
    if (plugin.settings.logApiInteractions) {
      aiFolderPath = await ensureAiOutputFolder(plugin);
      const reportDate = new Date();
      const dateStr = reportDate.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
      const timeStr = reportDate.toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      }).replace(/:/g, '.');

      const reportPath = `${aiFolderPath}/Gossamer Analysis ${dateStr} ${timeStr}.md`;

      reportFile = await plugin.app.vault.create(reportPath, reportLines.join('\n'));
      
      // Open the report
      const leaf = plugin.app.workspace.getLeaf('tab');
      await leaf.openFile(reportFile);
    }

    const successMessage = `✓ Updated ${updateCount} beats with momentum scores`;
    
    const logMessage = plugin.settings.logApiInteractions
      ? `${successMessage}. Report saved to ${aiFolderPath} (includes full manuscript).`
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
      plotBeats = filterBeatsBySystem(plotBeats, beatSystem);
    }
    
    // Get sorted scene files (single source of truth)
    const { getSortedSceneFiles } = await import('./utils/manuscript');
    const { files: sceneFiles } = await getSortedSceneFiles(plugin);

    // Quick manuscript assembly to get stats
    const manuscript = await assembleManuscript(sceneFiles, plugin.app.vault);
    const estimatedTokens = Math.ceil(manuscript.text.length / 4);
    
    // Check if any beats have previous justifications (for iterative refinement)
    const beatsWithPreviousAnalysis = plotBeats.filter(beat => {
      const beatData = beat as any;
      const latestRun = beatData.GossamerLatestRun || 1;
      return typeof beatData[`Gossamer${latestRun} Justification`] === 'string';
    }).length;
    
    const manuscriptInfo: ManuscriptInfo = {
      totalScenes: manuscript.totalScenes,
      totalWords: manuscript.totalWords,
      estimatedTokens: estimatedTokens,
      beatCount: plotBeats.length,
      beatSystem: beatSystemDisplayName, // Use display name (may include custom name)
      hasIterativeContext: beatsWithPreviousAnalysis > 0
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

/**
 * Create diagnostic report when API call fails
 */
async function createFailureDiagnosticReport(
  plugin: RadialTimelinePlugin,
  manuscript: AssembledManuscript,
  beats: UnifiedBeatInfo[],
  beatSystem: string,
  prompt: string,
  errorMessage: string
): Promise<void> {
  const reportTimestamp = new Date();
  const timestamp = reportTimestamp.toLocaleString();
  
  const reportLines: string[] = [
    `# Gossamer AI Analysis - FAILED`,
    ``,
    `**Date:** ${timestamp}`,
    `**Beat System:** ${beatSystem}`,
    `**Model:** ${resolveGeminiModelId(plugin)}`,
    `**Error:** ${errorMessage}`,
    ``,
    `---`,
    ``,
    `## Error Details`,
    ``,
    errorMessage,
    ``,
    `## Manuscript Sent`,
    ``,
    `**Scenes:** ${manuscript.totalScenes}`,
    `**Words:** ${manuscript.totalWords.toLocaleString()}`,
    `**Estimated Input Tokens:** ~${Math.ceil(manuscript.text.length / 4).toLocaleString()}`,
    `**Story Beats:** ${beats.length}`,
    ``,
    `### Scene List`,
    ``,
  ];
  
  manuscript.scenes.forEach((scene: SceneContent, idx: number) => {
    const wordCount = scene.wordCount || 0;
    reportLines.push(`${idx + 1}. ${scene.title || 'Untitled Scene'} (${wordCount.toLocaleString()} words)`);
  });
  
  reportLines.push(``);
  reportLines.push(`### Prompt Sent to Gemini`);
  reportLines.push(``);
  reportLines.push(`\`\`\`markdown`);
  reportLines.push(prompt);
  reportLines.push(`\`\`\``);
  reportLines.push(``);
  
  // Save failure report
  const reportDate = new Date();
  const dateStr = reportDate.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const timeStr = reportDate.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).replace(/:/g, '.');

  const aiFolderPath = await ensureAiOutputFolder(plugin);
  const reportPath = `${aiFolderPath}/Gossamer Analysis FAILED ${dateStr} ${timeStr}.md`;

  const reportFile = await plugin.app.vault.create(reportPath, reportLines.join('\n'));
  
  // Open the failure report
  const leaf = plugin.app.workspace.getLeaf('tab');
  await leaf.openFile(reportFile);
  
  new Notice(`⚠️ Analysis failed. Diagnostic report saved to ${aiFolderPath}.`);
}

/**
 * Create detailed processing log similar to scene analysis logs
 */
async function createGossamerProcessingLog(
  plugin: RadialTimelinePlugin,
  manuscriptInfo: ManuscriptInfo,
  beatSystem: string,
  analysis: any, // SAFE: any type used for parsed Gemini JSON response with dynamic beat analysis structure
  updateCount: number,
  apiResult: any, // SAFE: any type used for Gemini API result with optional rate limit metadata
  prompt: string,
  beats: UnifiedBeatInfo[],
  unmatchedBeats: string[]
): Promise<void> {
  const now = new Date();
  const timestamp = now.toLocaleString();
  
  const logLines: string[] = [
    `# Gossamer AI Processing Log`,
    ``,
    `**Timestamp:** ${timestamp}`,
    `**Beat System:** ${beatSystem}`,
    ``,
    `## Manuscript Details`,
    ``,
    `- **Total Scenes:** ${manuscriptInfo.totalScenes}`,
    `- **Total Words:** ${manuscriptInfo.totalWords.toLocaleString()}`,
    `- **Estimated Tokens:** ~${manuscriptInfo.estimatedTokens.toLocaleString()}`,
    `- **Story Beats:** ${manuscriptInfo.beatCount}`,
    ``,
    `## API Details`,
    ``,
    `- **Provider:** Gemini (Google)`,
    `- **Model:** ${resolveGeminiModelId(plugin)}`,
    `- **Temperature:** 0.7`,
    `- **Max Output Tokens:** 8000`,
    ``,
    `## Processing Results`,
    ``,
    `- **Status:** ${apiResult.success ? '✓ Success' : '✗ Failed'}`,
    `- **Beats Updated:** ${updateCount}`,
    `- **Beats Analyzed:** ${analysis.beats?.length || 0}`,
    ``
  ];
  
  // Add unmatched beats if any
  if (unmatchedBeats.length > 0) {
    logLines.push(`- **Unmatched Beats:** ${unmatchedBeats.length} (${unmatchedBeats.join(', ')})`);
    logLines.push(``);
  }

  // Add rate limit info if available
  if (apiResult.rateLimitInfo) {
    logLines.push(`## Rate Limit Information`, ``);
    if (apiResult.rateLimitInfo.requestsRemaining !== undefined) {
      logLines.push(`- **Requests Remaining:** ${apiResult.rateLimitInfo.requestsRemaining}`);
    }
    if (apiResult.rateLimitInfo.tokensRemaining !== undefined) {
      logLines.push(`- **Tokens Remaining:** ${apiResult.rateLimitInfo.tokensRemaining}`);
    }
    logLines.push(``);
  }

  // Add beat-by-beat scores
  if (analysis.beats && analysis.beats.length > 0) {
    logLines.push(`## Beat Scores`, ``);
    logLines.push(`| Beat | Score | Ideal Range | Status |`);
    logLines.push(`|------|-------|-------------|--------|`);
    
    for (const beat of analysis.beats) {
      const status = beat.isWithinRange ? '✓ In range' : '⚠️ Out of range';
      logLines.push(`| ${beat.beatName} | ${beat.momentumScore} | ${beat.idealRange} | ${status} |`);
    }
    logLines.push(``);
  }
  
  // Add technical details with prompt and response (beat table removed - redundant with JSON)
  logLines.push(`## Technical Details`, ``);
  
  logLines.push(`### Full Prompt Sent to Gemini`, ``);
  logLines.push(`\`\`\`markdown`);
  logLines.push(prompt);
  logLines.push(`\`\`\``);
  logLines.push(``);
  
  logLines.push(`### JSON Response from Gemini`, ``);
  logLines.push(`\`\`\`json`);
  logLines.push(JSON.stringify(analysis, null, 2));
  logLines.push(`\`\`\``);
  logLines.push(``);

  // Add error details if any
  if (!apiResult.success && apiResult.error) {
    logLines.push(`## Errors`, ``);
    logLines.push('```');
    logLines.push(apiResult.error);
    logLines.push('```');
    logLines.push(``);
  }

  // Save log to AI output folder
  const dateStr = now.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
  const timeStr = now.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).replace(/:/g, '.');

  const aiFolderPath = await ensureAiOutputFolder(plugin);
  const logPath = `${aiFolderPath}/Gossamer Processing Log ${dateStr} ${timeStr}.md`;

  await plugin.app.vault.create(logPath, logLines.join('\n'));
}
