/*
 * Gossamer Commands and State
 */
import type RadialTimelinePlugin from './main';
import { buildGossamerPrompt } from './ai/prompts/gossamer';
import { buildRunFromDefault, GossamerRun, GossamerBeatStatus, normalizeBeatName, zeroOffsetRun } from './utils/gossamer';
import { Notice, TFile, Vault } from 'obsidian';
import { callProvider } from './api/providerRouter';
import { logExchange } from './ai/log';

type Provider = 'openai' | 'anthropic' | 'gemini';

function getProvider(plugin: RadialTimelinePlugin): Provider {
  return plugin.settings.defaultAiProvider || 'openai';
}

async function logGossamerExchange(
  plugin: RadialTimelinePlugin,
  vault: Vault,
  provider: Provider,
  modelId: string,
  requestData: unknown,
  responseData: unknown,
  runLabel: string
): Promise<void> {
  if (!plugin.settings.logApiInteractions) return;
  const folder = 'AI';
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const file = `${folder}/Gossamer-${ts}-${runLabel || 'Run'}.json`;
  const payload = {
    provider,
    modelId,
    timestamp: new Date().toISOString(),
    request: requestData,
    response: responseData,
  };
  try {
    try { await vault.createFolder(folder); } catch {}
    await vault.create(file, JSON.stringify(payload, null, 2));
  } catch (e) {
    console.error('[Gossamer] Failed to write AI log:', e);
    new Notice('Failed to write Gossamer AI log.');
  }
}

function parseAiJson(content: string): GossamerRun | null {
  try {
    const objUnknown: unknown = JSON.parse(content);
    if (!objUnknown || typeof objUnknown !== 'object') return null;
    const obj = objUnknown as Record<string, unknown>;
    const beatsRaw = Array.isArray(obj.beats) ? obj.beats as unknown[] : [];
    const beats = beatsRaw.map((u: unknown) => {
      const rec = (u && typeof u === 'object') ? u as Record<string, unknown> : {};
      const beatVal = rec.beat;
      const scoreVal = rec.score;
      const notesVal = rec.notes;
      const statusVal = rec.status as unknown;
      const status: GossamerBeatStatus = (statusVal === 'present' || statusVal === 'outlineOnly' || statusVal === 'missing') ? statusVal : 'present';
      return {
        beat: typeof beatVal === 'string' ? beatVal : String(beatVal ?? ''),
        score: typeof scoreVal === 'number' ? scoreVal : undefined,
        notes: typeof notesVal === 'string' ? notesVal : undefined,
        status
      };
    });
    const overallRaw = (obj.overall && typeof obj.overall === 'object') ? obj.overall as Record<string, unknown> : undefined;
    const overall = overallRaw ? {
      summary: typeof overallRaw.summary === 'string' ? overallRaw.summary : undefined,
      refinements: Array.isArray(overallRaw.refinements) ? (overallRaw.refinements as unknown[]).filter((x): x is string => typeof x === 'string') : undefined,
      incompleteBeats: Array.isArray(overallRaw.incompleteBeats) ? (overallRaw.incompleteBeats as unknown[]).filter((x): x is string => typeof x === 'string') : undefined,
    } : undefined;
    return { beats, overall };
  } catch {
    return null;
  }
}

async function persistRunToBeatNotes(plugin: RadialTimelinePlugin, run: GossamerRun, modelId: string, runLabel: string): Promise<void> {
  const files = plugin.app.vault.getMarkdownFiles();
  const byName = new Map<string, TFile>();
  files.forEach(f => {
    const cache = plugin.app.metadataCache.getFileCache(f);
    const fm = cache?.frontmatter;
    if (fm && (fm.Class === 'Plot' || fm.class === 'Plot')) {
      const title = fm.Title || f.basename;
      byName.set(normalizeBeatName(String(title)), f);
    }
  });

  const date = new Date().toISOString();
  const updates = run.beats.map(async b => {
    const file = byName.get(normalizeBeatName(b.beat));
    if (!file) return;
    try {
      await plugin.app.fileManager.processFrontMatter(file, (yaml) => {
        const fm = yaml as Record<string, any>;
        const n = typeof fm.GossamerLatestRun === 'number' ? fm.GossamerLatestRun + 1 : 1;
        const entry = { run: n, label: runLabel, score: b.score, notes: b.notes, status: b.status, model: modelId, date };
        if (!Array.isArray(fm.GossamerRuns)) fm.GossamerRuns = [];
        fm.GossamerRuns.push(entry);
        fm.GossamerLatestRun = n;
        fm[`Gossamer${n}`] = { score: b.score, notes: b.notes, status: b.status, model: modelId, date };
      });
    } catch (e) {
      console.error('[Gossamer] Failed to persist beat run:', e);
    }
  });
  await Promise.all(updates);
}

const lastRunByPlugin = new WeakMap<RadialTimelinePlugin, GossamerRun>();

function setInMemoryRun(plugin: RadialTimelinePlugin, run: GossamerRun): void {
  lastRunByPlugin.set(plugin, run);
  // Provide compatibility for renderer access
  (plugin as unknown as Record<string, unknown>)._gossamerLastRun = run;
}

export async function runGossamerAnalysis(plugin: RadialTimelinePlugin): Promise<GossamerRun> {
  const scenes = await plugin.getSceneData();
  const prompt = buildGossamerPrompt(scenes);
  const provider = getProvider(plugin);
  const runLabel = 'Run01';

  let modelId = plugin.settings.openaiModelId || 'gpt-4.1';
  let requestForLog: unknown = null;
  let responseForLog: unknown = null;
  let content: string | null = null;

  try {
    const result = await callProvider(plugin, { userPrompt: prompt, systemPrompt: null, maxTokens: 4000, temperature: 0.7 });
    modelId = result.modelId;
    requestForLog = { model: modelId, user: prompt };
    responseForLog = result.responseData;
    if (result.success) content = result.content; else throw new Error('Provider call failed');
  } catch (e) {
    console.error('[Gossamer] AI call failed, using default:', e);
  }

  let run = content ? parseAiJson(content) : null;
  if (!run) run = buildRunFromDefault();

  // Zero-offset Opening to 0
  run = zeroOffsetRun(run);

  // Persist per-beat history
  await persistRunToBeatNotes(plugin, run, modelId, runLabel);

  // Log exchange
  await logExchange(plugin, plugin.app.vault, { prefix: 'Gossamer', provider, modelId, request: requestForLog, response: responseForLog, parsed: run, label: runLabel });

  // Store in memory
  setInMemoryRun(plugin, run);

  // Enforce All Scenes base mode, reset rotation, clear search, and enter overlay mode
  setBaseModeAllScenes(plugin);
  resetRotation(plugin);
  plugin.clearSearch();
  enterGossamerMode(plugin);
  return run;
}

export function getActiveGossamerRun(plugin: RadialTimelinePlugin): GossamerRun | null {
  return lastRunByPlugin.get(plugin) ?? null;
}

export function toggleGossamerMode(plugin: RadialTimelinePlugin): void {
  const view = getFirstView(plugin);
  if (!view) return;
  const current = getInteractionMode(view) === 'gossamer';
  if (current) {
    exitGossamerMode(plugin);
  } else {
    // Ensure a run exists (use default if none)
    if (!getActiveGossamerRun(plugin)) {
      const def = buildRunFromDefault();
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
  plugin.refreshTimelineIfNeeded(undefined);
}

function exitGossamerMode(plugin: RadialTimelinePlugin) {
  const view = getFirstView(plugin);
  if (!view) return;
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


