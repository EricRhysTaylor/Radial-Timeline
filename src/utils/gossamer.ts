/*
 * Gossamer utilities and defaults
 */

import { parseRange, isScoreInRange } from './rangeValidation';
import { STAGE_ORDER } from './constants';
import { normalizeBeatSetNameInput, toBeatMatchKey, toBeatModelMatchKey } from './beatsInputNormalize';
import { comparePrefixTokens, extractPrefixToken } from './prefixOrder';

export type GossamerBeatStatus = 'present' | 'outlineOnly' | 'missing';

export interface GossamerBeat {
  beat: string;
  score?: number;
  notes?: string;
  status: GossamerBeatStatus;
  range?: { min: number; max: number }; // Ideal range for this beat
  isOutOfRange?: boolean; // True if score is outside ideal range
}

export interface GossamerRun {
  beats: GossamerBeat[];
  overall?: {
    summary?: string;
    refinements?: string[];
    incompleteBeats?: string[];
  };
  meta?: {
    model?: string; // Selected beat system (renderer compatibility)
    beatSystem?: string;
    provider?: string;
    runModel?: string;
    createdAt?: string;
    id?: string;
    runIndex?: number;
    date?: string; // ISO
    label?: string;
  };
}

export interface GossamerRunRecord {
  id: string;
  runIndex: number;
  beatSystem?: string;
  provider?: string;
  runModel?: string;
  createdAt?: string;
  label: string;
  isLatest: boolean;
  stage?: string;
  run: GossamerRun;
}

export interface GossamerRunFilterState {
  latestOnly?: boolean;
  visibleRunIds?: string[];
  beatSystemKey?: string;
}

export const GOSSAMER_LEGACY_FIELDS = [
  'GossamerLocation',
  'GossamerNote',
  'GossamerRuns',
  'GossamerLatestRun',
  'Gossamer Last Updated'
];

const GOSSAMER_MAX_HISTORY = 30;

type GossamerSlotMetadata = {
  runId?: string;
  createdAt?: string;
  provider?: string;
  model?: string;
  stage?: string;
};

function readGossamerFieldValue(source: Record<string, unknown>, key: string): unknown {
  const rawFrontmatter = source.rawFrontmatter as Record<string, unknown> | undefined;
  return source[key] ?? rawFrontmatter?.[key];
}

function getGossamerScoreKey(index: number): string {
  return `Gossamer${index}`;
}

function getGossamerJustificationKey(index: number): string {
  return `Gossamer${index} Justification`;
}

function getGossamerStageKey(index: number): string {
  return `GossamerStage${index}`;
}

function getGossamerRunIdKey(index: number): string {
  return `GossamerRunId${index}`;
}

function getGossamerCreatedAtKey(index: number): string {
  return `GossamerCreatedAt${index}`;
}

function getGossamerProviderKey(index: number): string {
  return `GossamerProvider${index}`;
}

function getGossamerModelKey(index: number): string {
  return `GossamerModel${index}`;
}

export function createGossamerRunId(): string {
  return `goss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function applyGossamerRunMetadata(frontmatter: Record<string, unknown>, index: number, metadata: GossamerSlotMetadata): void {
  if (metadata.stage) frontmatter[getGossamerStageKey(index)] = metadata.stage;
  if (metadata.runId) frontmatter[getGossamerRunIdKey(index)] = metadata.runId;
  if (metadata.createdAt) frontmatter[getGossamerCreatedAtKey(index)] = metadata.createdAt;
  if (metadata.provider) frontmatter[getGossamerProviderKey(index)] = metadata.provider;
  if (metadata.model) frontmatter[getGossamerModelKey(index)] = metadata.model;
}

export function clearGossamerRunSlot(frontmatter: Record<string, unknown>, index: number): void {
  delete frontmatter[getGossamerScoreKey(index)];
  delete frontmatter[getGossamerJustificationKey(index)];
  delete frontmatter[getGossamerStageKey(index)];
  delete frontmatter[getGossamerRunIdKey(index)];
  delete frontmatter[getGossamerCreatedAtKey(index)];
  delete frontmatter[getGossamerProviderKey(index)];
  delete frontmatter[getGossamerModelKey(index)];
}

function readGossamerSlotMetadata(source: Record<string, unknown>, index: number): GossamerSlotMetadata {
  const readString = (key: string): string | undefined => {
    const value = readGossamerFieldValue(source, key);
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  };

  return {
    runId: readString(getGossamerRunIdKey(index)),
    createdAt: readString(getGossamerCreatedAtKey(index)),
    provider: readString(getGossamerProviderKey(index)),
    model: readString(getGossamerModelKey(index)),
    stage: readString(getGossamerStageKey(index))
  };
}

function formatGossamerRunTimestamp(value: string | undefined, fallbackIndex: number): string {
  if (!value) return `Run ${fallbackIndex}`;

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return `Run ${fallbackIndex}`;

  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(new Date(parsed));
  } catch {
    return `Run ${fallbackIndex}`;
  }
}

function buildGossamerRunModelLabel(metadata: GossamerSlotMetadata): string {
  if (metadata.model) return metadata.model;
  if (metadata.provider === 'manual') return 'Manual entry';
  if (metadata.provider) return metadata.provider;
  return 'Legacy run';
}

function parseGossamerRunIndex(fieldName: string): number {
  const match = fieldName.match(/^Gossamer(\d+)$/);
  if (!match) return 1;
  const parsed = parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function parseGossamerScoreValue(value: unknown): number | undefined {
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const match = value.match(/\d+/);
    if (!match) return undefined;
    const parsed = parseInt(match[0], 10);
    if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 100) {
      return parsed;
    }
  }
  return undefined;
}

function formatRunListLabel(metadata: GossamerSlotMetadata, runIndex: number): string {
  const timeLabel = formatGossamerRunTimestamp(metadata.createdAt, runIndex);
  const modelLabel = buildGossamerRunModelLabel(metadata);
  return `${timeLabel} · ${modelLabel}`;
}

function getRunStageFromScenes(
  scenes: { itemType?: string; [key: string]: unknown }[],
  runIndex: number,
  selectedBeatModel?: string
): typeof STAGE_ORDER[number] | undefined {
  let plotNotes = scenes.filter((scene) => scene.itemType === 'Beat' || scene.itemType === 'Plot');
  if (toBeatModelMatchKey(selectedBeatModel ?? '')) {
    plotNotes = filterBeatsBySystem(plotNotes, selectedBeatModel);
  }
  for (const note of plotNotes) {
    const stage = readGossamerFieldValue(note as Record<string, unknown>, getGossamerStageKey(runIndex));
    if (typeof stage === 'string') {
      const match = STAGE_ORDER.find((candidate) => candidate === stage);
      if (match) return match;
    }
  }
  return undefined;
}

function cloneRunWithMeta(run: GossamerRun, meta: NonNullable<GossamerRun['meta']>): GossamerRun {
  return {
    ...run,
    meta: {
      ...(run.meta || {}),
      ...meta
    }
  };
}

const BUILTIN_BEAT_MODEL_KEYS = new Set<string>([
  toBeatModelMatchKey('Save The Cat'),
  toBeatModelMatchKey("Hero's Journey"),
  toBeatModelMatchKey('Classic Dramatic Structure'),
  toBeatModelMatchKey('Story Grid'), // legacy alias
]);

/**
 * Detects the dominant publish stage for a Gossamer run based on scene completion.
 * 
 * Rules (Milestone-based):
 * - Zero: Always the default starting stage (no requirements)
 * - Author: Unlocks when 100% of scenes have COMPLETED the Author stage
 * - House: Unlocks when 100% of scenes have COMPLETED the House stage
 * - Press: Unlocks when 100% of scenes have COMPLETED the Press stage
 * 
 * "Completed" means: Status = Complete AND Publish Stage >= that stage
 * 
 * @param scenes - Array of scene items to analyze (should be filtered to Scene itemType only)
 * @returns The dominant stage: 'Zero' | 'Author' | 'House' | 'Press'
 */
export function detectDominantStage(
  scenes: { itemType?: string; status?: string | string[]; "Publish Stage"?: string }[]
): typeof STAGE_ORDER[number] {
  // Filter to scene notes only (exclude Beat/Plot/Backdrop)
  const sceneNotes = scenes.filter(s => s.itemType === 'Scene');
  
  if (sceneNotes.length === 0) {
    return 'Zero';
  }
  
  // Helper to check if a status indicates completion
  const isCompleted = (status: string | string[] | undefined): boolean => {
    const val = Array.isArray(status) ? status[0] : status;
    const normalized = (val ?? '').toString().trim().toLowerCase();
    return normalized === 'complete' || normalized === 'completed' || normalized === 'done';
  };
  
  // Check stages in reverse order (most advanced first): Press -> House -> Author
  // Zero is the default fallback
  for (const stage of ['Press', 'House', 'Author'] as const) {
    const stageIndex = STAGE_ORDER.indexOf(stage);
    
    // Check if ALL scenes have completed this stage
    const allCompleted = sceneNotes.every(scene => {
      const sceneStage = scene['Publish Stage'] || 'Zero';
      const sceneStageIndex = STAGE_ORDER.indexOf(sceneStage as typeof STAGE_ORDER[number]);
      
      // Scene must be AT or BEYOND this stage AND marked complete
      return sceneStageIndex >= stageIndex && isCompleted(scene.status);
    });
    
    if (allCompleted) {
      return stage;
    }
  }
  
  // Default: Zero stage (always available)
  return 'Zero';
}

/**
 * Single source of truth for filtering beats by Beat Model.
 * Handles both built-in systems (Save The Cat, Hero's Journey, Classic Dramatic Structure) and Custom.
 * 
 * @param beats - Array of beat objects with optional "Beat Model" field
 * @param selectedBeatModel - The beat model to filter by (e.g., "Save The Cat", "Podcast Narrative Arc")
 * @returns Filtered array of beats matching the selected system
 */
export function filterBeatsBySystem<T>(
  beats: T[],
  selectedBeatModel?: string
): T[] {
  const system = normalizeBeatSetNameInput(selectedBeatModel ?? '', '');
  if (!system) {
    return beats; // No filtering if no system selected
  }

  const selectedKey = toBeatModelMatchKey(system);

  if (selectedKey === 'custom') {
    // Default Custom: exclude beats that belong to built-in systems
    return beats.filter(b => {
      const beatModel = (b as any)["Beat Model"]; // SAFE: dynamic field access for Beat Model filtering
      if (!beatModel || typeof beatModel !== 'string') return false; // Missing Beat Model is invalid for Beat notes
      const modelKey = toBeatModelMatchKey(beatModel);
      if (!modelKey) return false;
      if (modelKey === 'custom') return true; // Legacy generic custom model
      return !BUILTIN_BEAT_MODEL_KEYS.has(modelKey);
    });
  } else {
    // For specific system: only include beats matching that system
    const selectedLooksCustom = !BUILTIN_BEAT_MODEL_KEYS.has(selectedKey) && selectedKey !== 'custom';
    return beats.filter(b => {
      const beatModel = (b as any)["Beat Model"]; // SAFE: dynamic field access for Beat Model filtering
      if (!beatModel || typeof beatModel !== 'string') return false;
      const modelKey = toBeatModelMatchKey(beatModel);
      if (selectedLooksCustom) {
        // Support legacy notes still marked as generic "Custom".
        return modelKey === selectedKey || modelKey === 'custom';
      }
      return modelKey === selectedKey;
    });
  }
}

export const DefaultGossamerMomentum: { beat: string; score: number; notes: string }[] = [
  { beat: 'Opening Image',          score: 4,  notes: 'Quiet status quo before disturbance.' },
  { beat: 'Theme Stated',           score: 8,  notes: 'Subtle tension; hints of deeper change.' },
  { beat: 'Set-Up',                 score: 14, notes: 'World and protagonist established; mild friction.' },
  { beat: 'Catalyst',               score: 26, notes: 'Inciting incident jolts the protagonist’s world.' },
  { beat: 'Debate',                 score: 22, notes: 'Internal conflict; push–pull before commitment.' },
  { beat: 'Break into Two',         score: 35, notes: 'Crossing threshold; tension climbs.' },
  { beat: 'B Story',                score: 40, notes: 'Secondary stakes introduced; emotional contrast.' },
  { beat: 'Fun and Games',          score: 46, notes: 'Momentum holds steady; stakes rising under surface.' },
  { beat: 'Midpoint',               score: 64, notes: 'Major reversal or revelation; visible peak forming.' },
  { beat: 'Bad Guys Close In',      score: 72, notes: 'Pressure intensifies; opposing forces gather.' },
  { beat: 'All Is Lost',            score: 86, notes: 'Crisis hits; near-peak emotional tension.' },
  { beat: 'Dark Night of the Soul', score: 78, notes: 'Momentary drop before regrouping.' },
  { beat: 'Break into Three',       score: 82, notes: 'Decision to fight back; new synthesis.' },
  { beat: 'Finale',                 score: 94, notes: 'Climactic confrontation; maximum momentum.' },
  { beat: 'Final Image',            score: 42, notes: 'Resolution; lingering emotional after-echo.' }
];

export function normalizeBeatName(name: string): string {
  // Strip score/range suffixes, then normalize via shared beat matcher.
  return toBeatMatchKey((name || '').replace(/\s*\d+(?:\s*-\s*\d+)?\s*%?\s*$/i, '')).replace(/\s+/g, '');
}

/**
 * Build a run from a specific Gossamer field (Gossamer1, Gossamer2, etc.)
 * Generic builder that can construct runs from any GossamerId field.
 */
export function buildRunFromGossamerField(
  scenes: { itemType?: string; subplot?: string; title?: string; [key: string]: unknown }[] | undefined,
  fieldName: string,
  selectedBeatModel?: string,
  includeZeroScores: boolean = true
): GossamerRun {
  const runIndex = parseGossamerRunIndex(fieldName);
  let beats: GossamerBeat[];
  
  if (!scenes || scenes.length === 0) {
    return {
      beats: [],
      overall: {
        summary: 'No scenes provided.',
        refinements: [],
        incompleteBeats: [],
      },
      meta: {
        label: `Run ${runIndex}`,
        date: new Date().toISOString(),
        model: selectedBeatModel,
        beatSystem: selectedBeatModel,
        runIndex
      },
    };
  }

  // If 'Gossamer1' is requested, check if we should be using a dynamically determined latest run instead.
  // We only do this "smart" redirect if we are asking for the default/current run (often passed as 'Gossamer1')
  // and we want to ensure we actually get the LATEST data if the user has tracked multiple runs.
  // Filter Beat notes by Beat Model only if explicitly specified and not empty
  let plotNotes = scenes.filter(s => s.itemType === 'Beat' || s.itemType === 'Plot');
  
  if (toBeatModelMatchKey(selectedBeatModel ?? '')) {
    plotNotes = filterBeatsBySystem(plotNotes, selectedBeatModel);
  }
  
  if (plotNotes.length === 0) {
    return {
      beats: [],
      overall: {
        summary: selectedBeatModel 
          ? `No Beat notes found with Beat Model: ${selectedBeatModel}`
          : 'No Beat notes found. Create notes with Class: Beat.',
        refinements: [],
        incompleteBeats: [],
      },
      meta: {
        label: `Run ${runIndex}`,
        date: new Date().toISOString(),
        model: selectedBeatModel,
        beatSystem: selectedBeatModel,
        runIndex
      },
    };
  }
  
  // Sort by numeric prefix
  plotNotes.sort((a, b) => {
    const aMatch = (a.title || '').match(/^(\d+(?:\.\d+)?)/);
    const bMatch = (b.title || '').match(/^(\d+(?:\.\d+)?)/);
    const aNum = aMatch ? parseFloat(aMatch[1]) : 0;
    const bNum = bMatch ? parseFloat(bMatch[1]) : 0;
    return aNum - bNum;
  });
  
  const incompleteBeats: string[] = [];
  let slotMetadata: GossamerSlotMetadata | undefined;
  beats = plotNotes.map((plotNote) => {
    const beatTitle = (plotNote.title || '').replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
    
    // Parse score from the specified field
    const fieldValue = readGossamerFieldValue(plotNote as Record<string, unknown>, fieldName);
    const parsedScore = parseGossamerScoreValue(fieldValue);
    if (!slotMetadata) {
      const candidateMetadata = readGossamerSlotMetadata(plotNote as Record<string, unknown>, runIndex);
      if (candidateMetadata.runId || candidateMetadata.createdAt || candidateMetadata.provider || candidateMetadata.model || candidateMetadata.stage) {
        slotMetadata = candidateMetadata;
      }
    }
    
    // Parse Range field (ideal range for this beat)
    let range: { min: number; max: number } | undefined = undefined;
    let isOutOfRange = false;
    
    const rangeValue = plotNote.Range;
    if (typeof rangeValue === 'string') {
      const parsed = parseRange(rangeValue);
      if (parsed) {
        range = parsed;
        // Check if score is outside ideal range
        // Only flag if we actually have a score
        if (parsedScore !== undefined) {
          isOutOfRange = !isScoreInRange(parsedScore, range);
        }
      }
    }
    
    if (parsedScore !== undefined) {
      return {
        beat: beatTitle,
        score: parsedScore,
        notes: `Score from Beat note frontmatter (${fieldName}).`,
        status: 'present' as const,
        range,
        isOutOfRange
      };
    } else if (includeZeroScores) {
      // For current run, default missing to 0 with red dot
      incompleteBeats.push(beatTitle);
      return {
        beat: beatTitle,
        score: 0,
        notes: `No ${fieldName} score in frontmatter - defaulting to 0.`,
        status: 'outlineOnly' as const,
        range,
        isOutOfRange: false
      };
    } else {
      // For historical runs, mark as missing
      return {
        beat: beatTitle,
        score: 0,
        notes: `No ${fieldName} score in frontmatter.`,
        status: 'missing' as const,
      };
    }
  }).filter(beat => beat.status !== 'missing');
  
  const presentCount = beats.filter(b => b.status === 'present').length;
  const metadata = slotMetadata ?? {
    stage: getRunStageFromScenes(scenes as { itemType?: string; [key: string]: unknown }[], runIndex, selectedBeatModel)
  };
  
  return {
    beats: beats,
    overall: {
      summary: presentCount > 0
        ? `${fieldName} scores loaded from ${presentCount} of ${plotNotes.length} Beat notes.`
        : `No ${fieldName} scores found in Beat notes.`,
      refinements: [],
      incompleteBeats,
    },
    meta: { 
      label: fieldName.startsWith('Gossamer') ? `Run ${fieldName.replace('Gossamer', '')}` : fieldName,
      date: metadata.createdAt ?? new Date().toISOString(),
      model: selectedBeatModel,
      beatSystem: selectedBeatModel,
      provider: metadata.provider,
      runModel: metadata.model,
      createdAt: metadata.createdAt,
      id: metadata.runId,
      runIndex
    },
  };
}

/**
 * Build a run from actual Beat notes in the vault.
 * This represents the "Current" state - which is the LATEST available score for each beat.
 * Unlike historical runs (which look at specific fields like Gossamer1), this logic
 * finds the highest numbered Gossamer field (e.g. Gossamer5) for EACH beat individually.
 * This ensures "Current" always shows the most recent analysis.
 */
export function buildRunFromDefault(scenes?: { itemType?: string; subplot?: string; title?: string; Gossamer1?: number; "Beat Model"?: string; [key: string]: unknown }[], selectedBeatModel?: string): GossamerRun {
  if (!scenes) return buildRunFromGossamerField(scenes, 'Gossamer1', selectedBeatModel, true);

  // We need to construct a "Virtual" run composed of the latest scores
  // First, let's reuse the logic to filter and sort notes
  let plotNotes = scenes.filter(s => s.itemType === 'Beat' || s.itemType === 'Plot');
  if (toBeatModelMatchKey(selectedBeatModel ?? '')) {
    plotNotes = filterBeatsBySystem(plotNotes, selectedBeatModel);
  }
  
  plotNotes.sort((a, b) => {
    const aMatch = (a.title || '').match(/^(\d+(?:\.\d+)?)/);
    const bMatch = (b.title || '').match(/^(\d+(?:\.\d+)?)/);
    const aNum = aMatch ? parseFloat(aMatch[1]) : 0;
    const bNum = bMatch ? parseFloat(bMatch[1]) : 0;
    return aNum - bNum;
  });

  const beats: GossamerBeat[] = plotNotes.map(note => {
    const beatTitle = (note.title || '').replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
    
    // Find the latest score
    let latestScore: number | undefined = undefined;
    let latestRunIndex = 0;
    
    // Check Gossamer1 through Gossamer30
    for (let i = GOSSAMER_MAX_HISTORY; i >= 1; i--) {
      const val = readGossamerFieldValue(note as Record<string, unknown>, getGossamerScoreKey(i));
      const parsed = parseGossamerScoreValue(val);
      if (parsed !== undefined) {
        latestScore = parsed;
        latestRunIndex = i;
        break;
      }
    }
    
    // Range logic
    let range: { min: number; max: number } | undefined = undefined;
    let isOutOfRange = false;
    const rangeValue = note.Range;
    if (typeof rangeValue === 'string') {
      const parsed = parseRange(rangeValue);
      if (parsed) {
        range = parsed;
        if (latestScore !== undefined) {
          isOutOfRange = !isScoreInRange(latestScore, range);
        }
      }
    }

    if (latestScore !== undefined) {
      return {
        beat: beatTitle,
        score: latestScore,
        notes: `Latest score from Gossamer${latestRunIndex}`,
        status: 'present',
        range,
        isOutOfRange
      };
    } else {
      return {
        beat: beatTitle,
        score: 0,
        notes: 'No scores found',
        status: 'outlineOnly',
        range,
        isOutOfRange: false
      };
    }
  });

  return {
    beats,
    overall: {
      summary: `Current View: Showing latest scores (up to Gossamer30).`,
      refinements: [],
      incompleteBeats: []
    },
    meta: {
      label: 'Latest Run',
      date: new Date().toISOString(),
      model: selectedBeatModel,
      beatSystem: selectedBeatModel
    }
  };
}

export function buildGossamerRunInventory(
  scenes: { itemType?: string; subplot?: string; title?: string; [key: string]: unknown }[] | undefined,
  selectedBeatModel?: string
): GossamerRunRecord[] {
  if (!scenes || scenes.length === 0) return [];

  const plotNotes = (() => {
    let notes = scenes.filter((scene) => scene.itemType === 'Beat' || scene.itemType === 'Plot');
    if (toBeatModelMatchKey(selectedBeatModel ?? '')) {
      notes = filterBeatsBySystem(notes, selectedBeatModel);
    }
    return notes;
  })();

  if (plotNotes.length === 0) return [];

  const runIndexes: number[] = [];
  for (let runIndex = 1; runIndex <= GOSSAMER_MAX_HISTORY; runIndex++) {
    const hasAnyValue = plotNotes.some((note) => parseGossamerScoreValue(readGossamerFieldValue(note as Record<string, unknown>, getGossamerScoreKey(runIndex))) !== undefined);
    if (hasAnyValue) runIndexes.push(runIndex);
  }

  const records = runIndexes.map((runIndex) => {
    const run = buildRunFromGossamerField(scenes, getGossamerScoreKey(runIndex), selectedBeatModel, true);
    const metadataFromRun = run.meta || {};
    const metadata: GossamerSlotMetadata = {
      runId: metadataFromRun.id,
      createdAt: metadataFromRun.createdAt,
      provider: metadataFromRun.provider,
      model: metadataFromRun.runModel,
      stage: getRunStageFromScenes(scenes as { itemType?: string; [key: string]: unknown }[], runIndex, selectedBeatModel)
    };
    return {
      id: metadata.runId || `${toBeatModelMatchKey(selectedBeatModel ?? 'default') || 'default'}::run-${runIndex}`,
      runIndex,
      beatSystem: selectedBeatModel,
      provider: metadata.provider,
      runModel: metadata.model,
      createdAt: metadata.createdAt,
      label: formatRunListLabel(metadata, runIndex),
      isLatest: false,
      stage: metadata.stage,
      run
    };
  });

  if (records.length > 0) {
    records[records.length - 1].isLatest = true;
  }

  return records;
}

/**
 * Build all gossamer runs (Gossamer1-30) and calculate min/max for band.
 * Includes stage information for each run to enable stage-based coloring.
 */
export function buildAllGossamerRuns(
  scenes: { itemType?: string; [key: string]: unknown }[] | undefined,
  selectedBeatModel?: string,
  filterState: GossamerRunFilterState = {}
): { // SAFE: unknown type used for dynamic Gossamer1-30 field access
  current: GossamerRun;
  historical: Array<{ label: string; points: { beat: string; score: number }[]; color: string; stage?: string; runIndex: number }>;
  minMax: { min: { beat: string; score: number }[]; max: { beat: string; score: number }[] } | null;
  hasAnyScores: boolean;
  runs: GossamerRunRecord[];
  visibleRuns: GossamerRunRecord[];
  visibleRunIds: string[];
  visibleModelCount: number;
  latestOnly: boolean;
  beatSystemKey: string;
} {
  const beatSystemKey = toBeatModelMatchKey(selectedBeatModel ?? '');
  if (!scenes || scenes.length === 0) {
    return {
      current: buildRunFromGossamerField(scenes, 'Gossamer1', selectedBeatModel, true),
      historical: [],
      minMax: null,
      hasAnyScores: false,
      runs: [],
      visibleRuns: [],
      visibleRunIds: [],
      visibleModelCount: 0,
      latestOnly: true,
      beatSystemKey
    };
  }
  const runs = buildGossamerRunInventory(scenes as { itemType?: string; subplot?: string; title?: string; [key: string]: unknown }[], selectedBeatModel);
  const beatSystemChanged = (filterState.beatSystemKey ?? '') !== beatSystemKey;
  const latestOnly = beatSystemChanged ? true : filterState.latestOnly !== false;
  const visibleRunIds = latestOnly
    ? []
    : (filterState.visibleRunIds || []).filter((id) => runs.some((run) => run.id === id));
  const visibleRuns = (() => {
    if (runs.length === 0) return [];
    if (latestOnly) return [runs[runs.length - 1]];
    if (visibleRunIds.length === 0) return [...runs];
    const selectedRuns = runs.filter((run) => visibleRunIds.includes(run.id));
    return selectedRuns.length > 0 ? selectedRuns : [runs[runs.length - 1]];
  })();
  const currentRecord = visibleRuns[visibleRuns.length - 1];
  const current = currentRecord
    ? cloneRunWithMeta(currentRecord.run, {
        ...(currentRecord.run.meta || {}),
        label: currentRecord.isLatest ? 'Latest Run' : currentRecord.label,
        model: selectedBeatModel,
        beatSystem: selectedBeatModel
      })
    : buildRunFromDefault(scenes as { itemType?: string; subplot?: string; title?: string; Gossamer1?: number; "Beat Model"?: string; [key: string]: unknown }[], selectedBeatModel);
  
  // Default gray color for runs without stage data (legacy fallback)
  const historicalColor = '#c0c0c0'; // Same as --rt-gossamer-historical-color

  // Build historical runs from the remaining visible records (oldest to newest)
  const historical: Array<{ label: string; points: { beat: string; score: number }[]; color: string; stage?: string; runIndex: number }> = [];
  for (const record of visibleRuns.slice(0, -1)) {
    historical.push({
      label: record.label,
      points: record.run.beats.map((beat) => ({ beat: beat.beat, score: beat.score as number })),
      color: historicalColor,
      stage: record.stage,
      runIndex: record.runIndex
    });
  }
  
  // Calculate min/max if we have at least 2 runs
  let minMax: { min: { beat: string; score: number }[]; max: { beat: string; score: number }[] } | null = null;
  
  if (historical.length > 0) {
    // Collect all runs (current + historical)
    const allRuns = [current, ...historical.map(h => ({ beats: h.points.map(p => ({ ...p, status: 'present' as const, notes: '' })) }))];
    
    // Get all beat names from current run
    const beatNames = current.beats.map(b => b.beat);
    
    const minPoints: { beat: string; score: number }[] = [];
    const maxPoints: { beat: string; score: number }[] = [];
    
    beatNames.forEach(beatName => {
      // Collect all scores for this beat across all runs
      const scores: number[] = [];
      
      // Current run (include both 'present' and 'outlineOnly' status)
      const currentBeat = current.beats.find(b => b.beat === beatName);
      if (currentBeat && (currentBeat.status === 'present' || currentBeat.status === 'outlineOnly')) {
        scores.push(currentBeat.score as number);
      }
      
      // Historical runs
      historical.forEach(h => {
        const point = h.points.find(p => p.beat === beatName);
        if (point) {
          scores.push(point.score);
        }
      });
      
      // Include ALL beats that have at least one score
      // This ensures continuous min/max band even with missing data
      if (scores.length >= 1) {
        const min = Math.min(...scores);
        const max = Math.max(...scores);
        minPoints.push({ beat: beatName, score: min });
        maxPoints.push({ beat: beatName, score: max });
      }
    });
    
    if (minPoints.length >= 3 && maxPoints.length >= 3) {
      minMax = { min: minPoints, max: maxPoints };
    }
  }
  
  const hasAnyCurrentScores = current.beats.some(b => b.status === 'present' && typeof b.score === 'number');
  const hasHistoricalScores = historical.some(run => run.points.some(point => typeof point.score === 'number' && !Number.isNaN(point.score)));
  const hasAnyScores = hasAnyCurrentScores || hasHistoricalScores;
  const visibleModelCount = new Set(
    visibleRuns.map((record) => record.runModel || record.provider || 'Legacy run')
  ).size;
  
  return {
    current,
    historical,
    minMax,
    hasAnyScores,
    runs,
    visibleRuns,
    visibleRunIds: visibleRuns.map((record) => record.id),
    visibleModelCount,
    latestOnly,
    beatSystemKey
  };
}

export function zeroOffsetRun(run: GossamerRun): GossamerRun {
  // Use the first beat as the zero anchor (instead of hardcoded "opening image")
  const firstBeat = run.beats[0];
  const base = typeof firstBeat?.score === 'number' ? firstBeat.score : 0;
  return {
    ...run,
    beats: run.beats.map(b => ({
      ...b,
      score: typeof b.score === 'number' ? Math.max(0, b.score - base) : b.score,
    })),
  };
}

export function extractPresentBeatScores(run: GossamerRun): { beat: string; score: number }[] {
  return run.beats
    .filter(b => b.status === 'present' && typeof b.score === 'number')
    .map(b => ({ beat: b.beat, score: b.score as number }));
}

/**
 * Extract beat order from Beat notes.
 * Returns array of beat names in order, with leading numbers stripped.
 * Filters by Beat Model if selectedBeatModel is provided.
 */
export function extractBeatOrder(scenes: { itemType?: string; subplot?: string; title?: string; "Beat Model"?: string }[], selectedBeatModel?: string): string[] {
  // Support both 'Beat' (new standard) and 'Plot' (legacy)
  let plotBeats = scenes.filter(s => s.itemType === 'Beat' || s.itemType === 'Plot');
  
  // Use centralized filtering helper (single source of truth)
  if (toBeatModelMatchKey(selectedBeatModel ?? '')) {
    plotBeats = filterBeatsBySystem(plotBeats, selectedBeatModel);
  }
  
  // Sort by filename prefix using natural token ordering.
  plotBeats.sort((a, b) => {
    const aPrefix = extractPrefixToken(a.title || '');
    const bPrefix = extractPrefixToken(b.title || '');
    const prefixCmp = comparePrefixTokens(aPrefix, bPrefix);
    if (prefixCmp !== 0) return prefixCmp;
    return (a.title || '').localeCompare(b.title || '', undefined, { numeric: true, sensitivity: 'base' });
  });
  
  // Strip leading numbers from titles
  const beatNames = plotBeats
    .map(p => (p.title || '').replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim())
    .filter(Boolean);
  
  return beatNames;
}

/**
 * Shift Gossamer history down by one (Gossamer1 → Gossamer2, etc.)
 * Shifts both scores and justifications. Returns updated frontmatter.
 */
export function shiftGossamerHistory(frontmatter: Record<string, any>): Record<string, any> {
  const maxHistory = GOSSAMER_MAX_HISTORY;
  const updated = { ...frontmatter };
  for (let i = maxHistory; i >= 2; i--) {
    clearGossamerRunSlot(updated, i);

    const priorScore = updated[getGossamerScoreKey(i - 1)];
    if (priorScore !== undefined) {
      updated[getGossamerScoreKey(i)] = priorScore;
    }

    const priorJustification = updated[getGossamerJustificationKey(i - 1)];
    if (priorJustification !== undefined) {
      updated[getGossamerJustificationKey(i)] = priorJustification;
    }

    const priorMetadata = readGossamerSlotMetadata(updated, i - 1);
    applyGossamerRunMetadata(updated, i, priorMetadata);
  }

  clearGossamerRunSlot(updated, 1);
  
  // Gossamer1 and Gossamer1 Justification will be set by the caller with the new values
  return updated;
}

export function normalizeGossamerHistory(frontmatter: Record<string, any>): {
  normalized: Record<string, any>;
  changed: boolean;
} {
  const maxHistory = GOSSAMER_MAX_HISTORY;
  const normalized: Record<string, any> = {};
  type Entry = {
    score: number;
    justification?: string;
    originalIndex: number;
    metadata: GossamerSlotMetadata;
  };
  const entries: Entry[] = [];
  let hasOrphanField = false;

  for (let i = 1; i <= maxHistory; i++) {
    const scoreKey = getGossamerScoreKey(i);
    const justKey = getGossamerJustificationKey(i);
    const numeric = parseGossamerScoreValue(frontmatter[scoreKey]);
    const metadata = readGossamerSlotMetadata(frontmatter, i);
    if (numeric !== undefined) {
      const entry: Entry = { score: numeric, originalIndex: i, metadata };
      const justification = frontmatter[justKey];
      if (typeof justification === 'string' && justification.trim().length > 0) {
        entry.justification = justification;
      }
      entries.push(entry);
    } else if (
      (typeof frontmatter[justKey] === 'string' && frontmatter[justKey].trim().length > 0) ||
      metadata.runId ||
      metadata.createdAt ||
      metadata.provider ||
      metadata.model ||
      metadata.stage
    ) {
      hasOrphanField = true;
    }
  }

  const needsRenumber = entries.some((entry, idx) => entry.originalIndex !== idx + 1);
  const changed = needsRenumber || hasOrphanField;

  entries.forEach((entry, idx) => {
    const nextIndex = idx + 1;
    const key = getGossamerScoreKey(nextIndex);
    normalized[key] = entry.score;
    if (entry.justification) {
      normalized[`${key} Justification`] = entry.justification;
    }
    applyGossamerRunMetadata(normalized, nextIndex, entry.metadata);
  });

  return { normalized, changed };
}

export function collectGossamerManagedSnapshot(frontmatter: Record<string, any>, maxHistory: number = 40): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {};
  for (let i = 1; i <= maxHistory; i++) {
    const scoreKey = getGossamerScoreKey(i);
    const justKey = getGossamerJustificationKey(i);
    const stageKey = getGossamerStageKey(i);
    const runIdKey = getGossamerRunIdKey(i);
    const createdAtKey = getGossamerCreatedAtKey(i);
    const providerKey = getGossamerProviderKey(i);
    const modelKey = getGossamerModelKey(i);
    if (frontmatter[scoreKey] !== undefined) snapshot[scoreKey] = frontmatter[scoreKey];
    if (frontmatter[justKey] !== undefined) snapshot[justKey] = frontmatter[justKey];
    if (frontmatter[stageKey] !== undefined) snapshot[stageKey] = frontmatter[stageKey];
    if (frontmatter[runIdKey] !== undefined) snapshot[runIdKey] = frontmatter[runIdKey];
    if (frontmatter[createdAtKey] !== undefined) snapshot[createdAtKey] = frontmatter[createdAtKey];
    if (frontmatter[providerKey] !== undefined) snapshot[providerKey] = frontmatter[providerKey];
    if (frontmatter[modelKey] !== undefined) snapshot[modelKey] = frontmatter[modelKey];
  }
  for (const key of GOSSAMER_LEGACY_FIELDS) {
    if (frontmatter[key] !== undefined) snapshot[key] = frontmatter[key];
  }
  return snapshot;
}

export function willAppendGossamerPrune(frontmatter: Record<string, any>, maxHistory: number = 30): boolean {
  const hasValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return !Number.isNaN(value);
    if (typeof value === 'string') return value.trim().length > 0;
    return false;
  };
  for (let i = 1; i <= maxHistory; i++) {
    if (!hasValue(frontmatter[`Gossamer${i}`])) {
      return false;
    }
  }
  return true;
}

export function appendGossamerScore(
  frontmatter: Record<string, any>,
  maxHistory: number = GOSSAMER_MAX_HISTORY
): { nextIndex: number; updated: Record<string, any> } {
  const updated = { ...frontmatter };
  const hasValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return !Number.isNaN(value);
    if (typeof value === 'string') return value.trim().length > 0;
    return false;
  };

  for (let i = 1; i <= maxHistory; i++) {
    const key = getGossamerScoreKey(i);
    if (!hasValue(updated[key])) {
      return { nextIndex: i, updated };
    }
  }

  // All slots are full – drop the oldest (index 1) and shift everything up.
  for (let i = 2; i <= maxHistory; i++) {
    const currentKey = getGossamerScoreKey(i);
    const previousKey = getGossamerScoreKey(i - 1);
    const currentJustKey = getGossamerJustificationKey(i);
    const previousJustKey = getGossamerJustificationKey(i - 1);
    const currentScore = updated[currentKey];
    const currentJustification = updated[currentJustKey];
    const metadata = readGossamerSlotMetadata(updated, i);

    clearGossamerRunSlot(updated, i - 1);
    if (hasValue(currentScore)) {
      updated[previousKey] = currentScore;
    }
    if (hasValue(currentJustification)) {
      updated[previousJustKey] = currentJustification;
    }
    applyGossamerRunMetadata(updated, i - 1, metadata);
  }

  clearGossamerRunSlot(updated, maxHistory);

  return { nextIndex: maxHistory, updated };
}
