/*
 * Gossamer Commands and State
 */
import type RadialTimelinePlugin from './main';
import { buildGossamerPrompt } from './ai/prompts/gossamer';
import { buildRunFromDefault, GossamerRun, GossamerBeatStatus, normalizeBeatName, zeroOffsetRun, extractBeatOrder, detectPlotSystem, shiftGossamerHistory } from './utils/gossamer';
import { Notice, TFile, Vault } from 'obsidian';
import { callProvider } from './api/providerRouter';
import { logExchange } from './ai/log';
import { assembleManuscript, estimateTokens } from './utils/manuscript';
import { GossamerAssemblyModal } from './view/GossamerAssemblyModal';

type Provider = 'openai' | 'anthropic' | 'gemini';

function getProvider(plugin: RadialTimelinePlugin): Provider {
  return plugin.settings.defaultAiProvider || 'openai';
}

// Helper function to get the active AI context template prompt
function getActiveContextPrompt(plugin: RadialTimelinePlugin): string | undefined {
  const templates = plugin.settings.aiContextTemplates || [];
  const activeId = plugin.settings.activeAiContextTemplateId;
  const active = templates.find(t => t.id === activeId);
  return active?.prompt;
}

// New interface for manuscript analysis response
interface ManuscriptAnalysisResponse {
  beats: Array<{
    beat: string;
    score: number;
    location: string;
    note: string;
  }>;
  overall: {
    summary: string;
  };
}

function parseAiJson(content: string): ManuscriptAnalysisResponse | null {
  try {
    // Try to extract JSON from markdown code blocks if present
    let jsonStr = content.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    
    // Validate structure
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.beats)) return null;
    if (!parsed.overall || typeof parsed.overall.summary !== 'string') return null;

    return parsed as ManuscriptAnalysisResponse;
  } catch (error) {
    console.error('[Gossamer] Failed to parse AI response:', error);
    return null;
  }
}

async function persistRunToBeatNotes(
  plugin: RadialTimelinePlugin,
  analysis: ManuscriptAnalysisResponse,
  modelId: string
): Promise<void> {
  const files = plugin.app.vault.getMarkdownFiles();
  const byName = new Map<string, TFile>();
  
  // Build map of normalized beat names to files
  files.forEach(f => {
    const cache = plugin.app.metadataCache.getFileCache(f);
    const fm = cache?.frontmatter;
    if (fm && (fm.Class === 'Plot' || fm.class === 'Plot')) {
      const title = fm.Title || f.basename;
      byName.set(normalizeBeatName(String(title)), f);
    }
  });

  const date = new Date().toISOString();
  
  // Update each beat's Plot note
  const updates = analysis.beats.map(async beat => {
    const file = byName.get(normalizeBeatName(beat.beat));
    if (!file) {
      console.warn(`[Gossamer] No Plot note found for beat: ${beat.beat}`);
      return;
    }
    
    try {
      await plugin.app.fileManager.processFrontMatter(file, (yaml) => {
        const fm = yaml as Record<string, any>;
        
        // Shift history down (Gossamer1 → Gossamer2, etc.)
        const shifted = shiftGossamerHistory(fm);
        Object.assign(fm, shifted);
        
        // Set new Gossamer1 with current score
        fm.Gossamer1 = beat.score;
        
        // Set guidance fields (only if location is not empty)
        if (beat.location && beat.location.trim().length > 0) {
          fm.GossamerLocation = beat.location;
        } else {
          // Clear location if placement is good
          delete fm.GossamerLocation;
        }
        
        // Always set note
        fm.GossamerNote = beat.note || '';
        
        // Remove old GossamerRuns and GossamerLatestRun fields (legacy cleanup)
        delete fm.GossamerRuns;
        delete fm.GossamerLatestRun;
      });
    } catch (e) {
      console.error(`[Gossamer] Failed to persist beat ${beat.beat}:`, e);
    }
  });
  
  await Promise.all(updates);
  new Notice(`Updated ${analysis.beats.length} plot beat notes with Gossamer analysis.`);
}

const lastRunByPlugin = new WeakMap<RadialTimelinePlugin, GossamerRun>();

function setInMemoryRun(plugin: RadialTimelinePlugin, run: GossamerRun): void {
  lastRunByPlugin.set(plugin, run);
  // Provide compatibility for renderer access
  (plugin as unknown as Record<string, unknown>)._gossamerLastRun = run;
}

export async function runGossamerAnalysis(plugin: RadialTimelinePlugin): Promise<GossamerRun> {
  try {
    // Get all scenes from sourcePath
    const scenes = await plugin.getSceneData();
    
    // Deduplicate scenes by path (scenes can appear multiple times if they have multiple subplots)
    const uniquePaths = new Set<string>();
    const uniqueScenes = scenes.filter(s => {
      if (s.itemType === 'Scene' && s.path && !uniquePaths.has(s.path)) {
        uniquePaths.add(s.path);
        return true;
      }
      return false;
    });
    
    const sceneFiles = uniqueScenes
      .map(s => plugin.app.vault.getAbstractFileByPath(s.path!))
      .filter((f): f is TFile => f instanceof TFile);

    if (sceneFiles.length === 0) {
      new Notice('No scenes found in source path. Please check settings.');
      return buildRunFromDefault(scenes);
    }

    // Detect plot system
    const plotSystem = detectPlotSystem(scenes);
    const beatOrder = extractBeatOrder(scenes);
    
    if (beatOrder.length === 0) {
      new Notice('No Plot beats found. Please create Plot notes with Class: Plot.');
      return buildRunFromDefault(scenes);
    }

    // Open assembly modal
    const modal = new GossamerAssemblyModal(plugin.app);
    modal.open();

    // Assemble manuscript with progress updates
    const manuscript = await assembleManuscript(
      sceneFiles,
      plugin.app.vault,
      (sceneIndex, sceneTitle, totalScenes) => {
        modal.updateProgress(sceneIndex, sceneTitle, totalScenes, 0);
      }
    );

    // Update with final word count
    modal.updateProgress(
      manuscript.totalScenes,
      'Complete',
      manuscript.totalScenes,
      manuscript.totalWords
    );

    // Save manuscript to AI folder
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const manuscriptPath = `AI/Gossamer-Manuscript-${timestamp}.txt`;
    
    try {
      await plugin.app.vault.createFolder('AI');
    } catch (e) {
      // Folder might already exist
    }
    
    await plugin.app.vault.create(manuscriptPath, manuscript.text);

    // Show summary and wait for user decision
    modal.showSummary(
      manuscript.totalScenes,
      manuscript.totalWords,
      plotSystem,
      beatOrder.length,
      manuscriptPath
    );

    const result = await modal.waitForUserDecision();

    if (!result.proceed) {
      new Notice('Gossamer analysis cancelled.');
      return buildRunFromDefault(scenes);
    }

    // User chose to proceed - send to AI
    new Notice('Sending manuscript to AI... This may take 30-90 seconds.');

    const contextPrompt = getActiveContextPrompt(plugin);
    const prompt = buildGossamerPrompt(
      manuscript.text,
      plotSystem,
      beatOrder,
      contextPrompt
    );

    const provider = getProvider(plugin);
    let modelId = plugin.settings.openaiModelId || 'gpt-4.1';
    let requestForLog: unknown = null;
    let responseForLog: unknown = null;
    let content: string | null = null;

    try {
      const result = await callProvider(plugin, {
        userPrompt: prompt,
        systemPrompt: null,
        maxTokens: 8000,
        temperature: 0.7
      });
      
      modelId = result.modelId;
      requestForLog = { model: modelId, prompt: 'See Gossamer-Manuscript file' };
      responseForLog = result.responseData;
      
      if (result.success) {
        content = result.content;
      } else {
        throw new Error('Provider call failed');
      }
    } catch (e) {
      console.error('[Gossamer] AI call failed:', e);
      new Notice('AI analysis failed. Check console for details.');
      return buildRunFromDefault(scenes);
    }

    // Parse AI response
    const analysis = content ? parseAiJson(content) : null;
    
    if (!analysis) {
      new Notice('Failed to parse AI response. Using default template.');
      return buildRunFromDefault(scenes);
    }

    // Save AI response
    const responsePath = `AI/Gossamer-Response-${timestamp}.json`;
    await plugin.app.vault.create(responsePath, JSON.stringify(analysis, null, 2));

    // Persist to Plot notes
    await persistRunToBeatNotes(plugin, analysis, modelId);

    // Log exchange
    await logExchange(plugin, plugin.app.vault, {
      prefix: 'Gossamer',
      provider,
      modelId,
      request: requestForLog,
      response: responseForLog,
      parsed: analysis,
      label: timestamp
    });

    // Convert to GossamerRun format for compatibility with view toggle
    const compatibleRun: GossamerRun = {
      beats: analysis.beats.map(b => ({
        beat: b.beat,
        score: b.score,
        notes: b.note,
        status: 'present' as const
      })),
      overall: {
        summary: analysis.overall.summary,
        refinements: [],
        incompleteBeats: []
      }
    };

    // Store in memory
    setInMemoryRun(plugin, compatibleRun);

    // Enforce All Scenes base mode, reset rotation, clear search, and enter overlay mode
    setBaseModeAllScenes(plugin);
    resetRotation(plugin);
    plugin.clearSearch();
    enterGossamerMode(plugin);

    new Notice('Gossamer analysis complete!');
    return compatibleRun;

  } catch (error) {
    console.error('[Gossamer] Analysis failed:', error);
    new Notice('Gossamer analysis failed. See console for details.');
    const scenes = await plugin.getSceneData();
    return buildRunFromDefault(scenes);
  }
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


