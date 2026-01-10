/*
 * Gossamer utilities and defaults
 */

import { parseRange, isScoreInRange } from './rangeValidation';
import { STAGE_ORDER } from './constants';

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
    model?: string;
    date?: string; // ISO
    label?: string;
  };
}

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
 * Handles both built-in systems (Save The Cat, Hero's Journey, Story Grid) and Custom.
 * 
 * @param beats - Array of beat objects with optional "Beat Model" field
 * @param selectedBeatSystem - The beat system to filter by (e.g., "Save The Cat", "Custom")
 * @param customBeatSystemName - Optional custom system name from settings
 * @returns Filtered array of beats matching the selected system
 */
export function filterBeatsBySystem<T>(
  beats: T[],
  selectedBeatSystem?: string,
  customBeatSystemName?: string
): T[] {
  if (!selectedBeatSystem || selectedBeatSystem.trim() === '') {
    return beats; // No filtering if no system selected
  }

  const system = selectedBeatSystem.trim();

  if (system === 'Custom') {
    // If a custom name is defined in settings, we should include beats that match it
    if (customBeatSystemName && customBeatSystemName.trim() !== '') {
        const customName = customBeatSystemName.trim();
        // Also include beats with generic 'Custom' model or no model, but exclude standard ones.
        const builtInSystems = ['save the cat', 'savethecat', "hero's journey", 'herosjourney', 'story grid', 'storygrid'];
        
        return beats.filter(b => {
          const beatModel = (b as any)["Beat Model"];
          if (!beatModel || typeof beatModel !== 'string') return true; 
          
          const normalizedModel = beatModel.toLowerCase().replace(/\s+/g, '').replace(/'/g, '');
          
          // Match custom name specifically
          if (beatModel === customName) return true;
          
          // OR Match legacy custom logic (not built-in)
          return !builtInSystems.includes(normalizedModel);
        });
    }

    // Default Custom: exclude beats that belong to built-in systems
    const builtInSystems = ['save the cat', 'savethecat', "hero's journey", 'herosjourney', 'story grid', 'storygrid'];
    return beats.filter(b => {
      const beatModel = (b as any)["Beat Model"]; // SAFE: dynamic field access for Beat Model filtering
      if (!beatModel || typeof beatModel !== 'string') return true; // Include beats with no Beat Model
      const normalizedModel = beatModel.toLowerCase().replace(/\s+/g, '').replace(/'/g, '');
      return !builtInSystems.includes(normalizedModel);
    });
  } else {
    // For specific system: only include beats matching that system
    const normalizedSelected = selectedBeatSystem.toLowerCase().replace(/\s+/g, '').replace(/'/g, '');
    return beats.filter(b => {
      const beatModel = (b as any)["Beat Model"]; // SAFE: dynamic field access for Beat Model filtering
      if (!beatModel || typeof beatModel !== 'string') return false;
      const normalizedModel = beatModel.toLowerCase().replace(/\s+/g, '').replace(/'/g, '');
      return normalizedModel === normalizedSelected;
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
  // Strip percentage annotations (e.g., "5%", "1-10%", "20%") and extra whitespace
  // Then normalize for fuzzy matching (remove hyphens, spaces, lowercase)
  return (name || '')
    .replace(/\s*\d+(?:\s*-\s*\d+)?\s*%?\s*$/i, '') // Remove trailing percentages like " 5%", " 1-10%", " 20", " 75 - 80%"
    .trim()
    .toLowerCase()
    .replace(/[-\s]/g, ''); // Remove hyphens and spaces for fuzzy matching (e.g., "set-up" → "setup", "dark night of the soul" → "darknightofthesoul")
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
  let beats: GossamerBeat[];
  
  if (!scenes || scenes.length === 0) {
    return {
      beats: [],
      overall: {
        summary: 'No scenes provided.',
        refinements: [],
        incompleteBeats: [],
      },
      meta: { label: fieldName, date: new Date().toISOString() },
    };
  }

  // If 'Gossamer1' is requested, check if we should be using a dynamically determined latest run instead.
  // We only do this "smart" redirect if we are asking for the default/current run (often passed as 'Gossamer1')
  // and we want to ensure we actually get the LATEST data if the user has tracked multiple runs.
  let actualField = fieldName;
  if (fieldName === 'Gossamer1') {
    // Try to find the max run index from ANY scene to know what "current" really means
    let maxIndex = 1;
    scenes.forEach(s => {
      for (let i = 30; i >= 1; i--) {
        if (s[`Gossamer${i}`] !== undefined) {
          maxIndex = Math.max(maxIndex, i);
          break; // Found max for this scene
        }
      }
    });
    // If we found a higher index, use that as "Current"
    // BUT: Historical view logic (buildAllGossamerRuns) calls this iteratively for 1..30.
    // We must be careful not to break historical loading.
    // Actually, `buildAllGossamerRuns` calls this with specific field names (Gossamer1, Gossamer2...).
    // Only `buildRunFromDefault` calls it with 'Gossamer1'.
    // So, we should change `buildRunFromDefault` instead of changing this low-level function.
  }
  
  // Filter Beat notes by Beat Model only if explicitly specified and not empty
  let plotNotes = scenes.filter(s => s.itemType === 'Beat' || s.itemType === 'Plot');
  
  if (selectedBeatModel && selectedBeatModel.trim() !== '' && plotNotes.some(p => p["Beat Model"])) {
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
      meta: { label: fieldName, date: new Date().toISOString() },
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
  beats = plotNotes.map((plotNote) => {
    const beatTitle = (plotNote.title || '').replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
    
    // Parse score from the specified field
    let parsedScore: number | undefined = undefined;
    const fieldValue = plotNote[fieldName];
    
    if (fieldValue !== undefined && fieldValue !== null) {
      const raw: unknown = fieldValue;
      
      if (typeof raw === 'number') {
        parsedScore = raw;
      } else if (typeof raw === 'string') {
        const match = raw.match(/\d+/);
        if (match) {
          const num = parseInt(match[0], 10);
          if (!isNaN(num) && num >= 0 && num <= 100) {
            parsedScore = num;
          }
        }
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
      date: new Date().toISOString(),
      model: selectedBeatModel 
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
  if (selectedBeatModel && selectedBeatModel.trim() !== '' && plotNotes.some(p => p["Beat Model"])) {
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
    for (let i = 30; i >= 1; i--) {
      const val = note[`Gossamer${i}`];
      if (val !== undefined && val !== null && typeof val === 'number') {
        latestScore = val;
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
      model: selectedBeatModel
    }
  };
}

/**
 * Build all gossamer runs (Gossamer1-30) and calculate min/max for band.
 * Includes stage information for each run to enable stage-based coloring.
 */
export function buildAllGossamerRuns(scenes: { itemType?: string; [key: string]: unknown }[] | undefined, selectedBeatModel?: string): { // SAFE: unknown type used for dynamic Gossamer1-30 field access
  current: GossamerRun;
  historical: Array<{ label: string; points: { beat: string; score: number }[]; color: string; stage?: string; runIndex: number }>;
  minMax: { min: { beat: string; score: number }[]; max: { beat: string; score: number }[] } | null;
  hasAnyScores: boolean;
} {
  if (!scenes || scenes.length === 0) {
    return {
      current: buildRunFromGossamerField(scenes, 'Gossamer1', selectedBeatModel, true),
      historical: [],
      minMax: null,
      hasAnyScores: false
    };
  }

  // Build current run (Gossamer1)
  const current = buildRunFromGossamerField(scenes, 'Gossamer1', selectedBeatModel, true);
  
  // Default gray color for runs without stage data (legacy fallback)
  const historicalColor = '#c0c0c0'; // Same as --rt-gossamer-historical-color
  
  // Helper to get the stage for a run by checking beat notes
  const getRunStage = (runIndex: number): string | undefined => {
    const stageFieldName = `GossamerStage${runIndex}`;
    // Look for stage in any beat note
    for (const scene of scenes) {
      if ((scene.itemType === 'Beat' || scene.itemType === 'Plot') && scene[stageFieldName]) {
        const stage = scene[stageFieldName];
        if (typeof stage === 'string' && ['Zero', 'Author', 'House', 'Press'].includes(stage)) {
          return stage;
        }
      }
    }
    return undefined;
  };
  
  // Build historical runs (Gossamer2-30)
  const historical: Array<{ label: string; points: { beat: string; score: number }[]; color: string; stage?: string; runIndex: number }> = [];
  
  for (let i = 2; i <= 30; i++) {
    const fieldName = `Gossamer${i}`;
    
    // Check if ANY value exists for this field
    const hasAnyValue = scenes.some(s => (s.itemType === 'Beat' || s.itemType === 'Plot') && s[fieldName] !== undefined && s[fieldName] !== null);
    
    if (hasAnyValue) {
      // If any value exists, default ALL missing beats to 0 (encourages complete data)
      const run = buildRunFromGossamerField(scenes, fieldName, selectedBeatModel, true);
      const stage = getRunStage(i);
      
      historical.push({
        label: fieldName,
        points: run.beats.map(b => ({ beat: b.beat, score: b.score as number })),
        color: historicalColor, // Will be overridden by renderer if stage is present
        stage,
        runIndex: i
      });
    }
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
  
  return { current, historical, minMax, hasAnyScores };
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
  if (selectedBeatModel && selectedBeatModel.trim() !== '' && plotBeats.some(p => p["Beat Model"])) {
    plotBeats = filterBeatsBySystem(plotBeats, selectedBeatModel);
  }
  
  // Sort by numeric prefix
  plotBeats.sort((a, b) => {
    const aMatch = (a.title || '').match(/^(\d+(?:\.\d+)?)/);
    const bMatch = (b.title || '').match(/^(\d+(?:\.\d+)?)/);
    const aNum = aMatch ? parseFloat(aMatch[1]) : 0;
    const bNum = bMatch ? parseFloat(bMatch[1]) : 0;
    return aNum - bNum;
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
  const maxHistory = 30;
  const updated = { ...frontmatter };
  
  // Find existing Gossamer scores and justifications
  const existingScores: Record<number, number> = {};
  const existingJustifications: Record<number, string> = {};
  
  for (let i = 1; i <= maxHistory; i++) {
    const scoreKey = `Gossamer${i}`;
    const justKey = `Gossamer${i} Justification`;
    
    if (typeof updated[scoreKey] === 'number') {
      existingScores[i] = updated[scoreKey];
    }
    if (typeof updated[justKey] === 'string') {
      existingJustifications[i] = updated[justKey];
    }
  }
  
  // Delete all Gossamer fields (including any beyond maxHistory)
  for (let i = 1; i <= maxHistory + 10; i++) {
    delete updated[`Gossamer${i}`];
    delete updated[`Gossamer${i} Justification`];
  }
  
  // Shift down: 1→2, 2→3, 3→4, etc.
  Object.entries(existingScores).forEach(([oldIndex, score]) => {
    const newIndex = parseInt(oldIndex) + 1;
    if (newIndex <= maxHistory) {
      updated[`Gossamer${newIndex}`] = score;
    }
  });
  
  Object.entries(existingJustifications).forEach(([oldIndex, justification]) => {
    const newIndex = parseInt(oldIndex) + 1;
    if (newIndex <= maxHistory) {
      updated[`Gossamer${newIndex} Justification`] = justification;
    }
  });
  
  // Gossamer1 and Gossamer1 Justification will be set by the caller with the new values
  return updated;
}

export function normalizeGossamerHistory(frontmatter: Record<string, any>): {
  normalized: Record<string, any>;
  changed: boolean;
} {
  const maxHistory = 30;
  const normalized: Record<string, any> = {};
  type Entry = { score: number; justification?: string; originalIndex: number };
  const entries: Entry[] = [];
  let hasOrphanJustification = false;

  for (let i = 1; i <= maxHistory; i++) {
    const scoreKey = `Gossamer${i}`;
    const justKey = `Gossamer${i} Justification`;
    const rawScore = frontmatter[scoreKey];
    let numeric: number | undefined;
    if (typeof rawScore === 'number') {
      numeric = rawScore;
    } else if (typeof rawScore === 'string') {
      const parsed = parseInt(rawScore);
      if (!Number.isNaN(parsed)) numeric = parsed;
    }
    if (numeric !== undefined) {
      const entry: Entry = { score: numeric, originalIndex: i };
      const justification = frontmatter[justKey];
      if (typeof justification === 'string' && justification.trim().length > 0) {
        entry.justification = justification;
      }
      entries.push(entry);
    } else if (typeof frontmatter[justKey] === 'string' && frontmatter[justKey].trim().length > 0) {
      hasOrphanJustification = true;
    }
  }

  const needsRenumber = entries.some((entry, idx) => entry.originalIndex !== idx + 1);
  const changed = needsRenumber || hasOrphanJustification;

  entries.forEach((entry, idx) => {
    const key = `Gossamer${idx + 1}`;
    normalized[key] = entry.score;
    if (entry.justification) {
      normalized[`${key} Justification`] = entry.justification;
    }
  });

  return { normalized, changed };
}

export function appendGossamerScore(
  frontmatter: Record<string, any>,
  maxHistory: number = 30
): { nextIndex: number; updated: Record<string, any> } {
  const updated = { ...frontmatter };
  const hasValue = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === 'number') return !Number.isNaN(value);
    if (typeof value === 'string') return value.trim().length > 0;
    return false;
  };

  for (let i = 1; i <= maxHistory; i++) {
    const key = `Gossamer${i}`;
    if (!hasValue(updated[key])) {
      return { nextIndex: i, updated };
    }
  }

  // All slots are full – drop the oldest (index 1) and shift everything up.
  for (let i = 2; i <= maxHistory; i++) {
    const currentKey = `Gossamer${i}`;
    const previousKey = `Gossamer${i - 1}`;
    const currentJustKey = `Gossamer${i} Justification`;
    const previousJustKey = `Gossamer${i - 1} Justification`;

    if (hasValue(updated[currentKey])) {
      updated[previousKey] = updated[currentKey];
    } else {
      delete updated[previousKey];
    }

    if (hasValue(updated[currentJustKey])) {
      updated[previousJustKey] = updated[currentJustKey];
    } else {
      delete updated[previousJustKey];
    }
  }

  delete updated[`Gossamer${maxHistory}`];
  delete updated[`Gossamer${maxHistory} Justification`];

  return { nextIndex: maxHistory, updated };
}
