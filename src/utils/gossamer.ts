/*
 * Gossamer utilities and defaults
 */

export type GossamerBeatStatus = 'present' | 'outlineOnly' | 'missing';

export interface GossamerBeat {
  beat: string;
  score?: number;
  notes?: string;
  status: GossamerBeatStatus;
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
  scenes: { itemType?: string; subplot?: string; title?: string; [key: string]: unknown }[] | undefined, // SAFE: any type used for dynamic Gossamer1-5 field access
  fieldName: string,
  selectedBeatModel?: string,
  includeZeroScores: boolean = true // For current run, default missing to 0; for historical, skip missing
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
  
  // Filter Beat notes by Beat Model only if explicitly specified and not empty
  // Support both 'Beat' (new standard) and 'Plot' (legacy)
  let plotNotes = scenes.filter(s => s.itemType === 'Beat' || s.itemType === 'Plot');
  if (selectedBeatModel && selectedBeatModel.trim() !== '' && plotNotes.some(p => p["Beat Model"])) {
    const normalizedSelected = selectedBeatModel.toLowerCase().replace(/\s+/g, '');
    plotNotes = plotNotes.filter(p => {
      const plotSystem = p["Beat Model"];
      if (typeof plotSystem !== 'string') return false;
      const normalizedPlotSystem = plotSystem.toLowerCase().replace(/\s+/g, '');
      return normalizedPlotSystem === normalizedSelected;
    });
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
  
  // Sort by numeric prefix and keep original titles
  plotNotes.sort((a, b) => {
    const aMatch = (a.title || '').match(/^(\d+(?:\.\d+)?)/);
    const bMatch = (b.title || '').match(/^(\d+(?:\.\d+)?)/);
    const aNum = aMatch ? parseFloat(aMatch[1]) : 0;
    const bNum = bMatch ? parseFloat(bMatch[1]) : 0;
    return aNum - bNum;
  });
  
  // Build beats array directly from beat notes
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
    
    if (parsedScore !== undefined) {
      return {
        beat: beatTitle,
        score: parsedScore,
        notes: `Score from Beat note frontmatter (${fieldName}).`,
        status: 'present' as const,
      };
    } else if (includeZeroScores) {
      // For current run (Gossamer1), default missing to 0 with red dot
      incompleteBeats.push(beatTitle);
      return {
        beat: beatTitle,
        score: 0,
        notes: `No ${fieldName} score in frontmatter - defaulting to 0.`,
        status: 'outlineOnly' as const,
      };
    } else {
      // For historical runs, mark as missing (will be skipped in rendering)
      return {
        beat: beatTitle,
        score: 0,
        notes: `No ${fieldName} score in frontmatter.`,
        status: 'missing' as const,
      };
    }
  }).filter(beat => beat.status !== 'missing'); // Remove missing beats from historical runs
  
  // Count how many beats have scores
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
      label: fieldName === 'Gossamer1' ? 'Score' : fieldName,
      date: new Date().toISOString(),
      model: selectedBeatModel 
    },
  };
}

/**
 * Build a run from actual Beat notes in the vault.
 * Uses whatever Beat notes the author created, filtered by Beat Model.
 * Missing Gossamer1 scores default to 0 (red dot).
 */
export function buildRunFromDefault(scenes?: { itemType?: string; subplot?: string; title?: string; Gossamer1?: number; "Beat Model"?: string }[], selectedBeatModel?: string): GossamerRun {
  return buildRunFromGossamerField(scenes, 'Gossamer1', selectedBeatModel, true);
}

/**
 * Build all gossamer runs (Gossamer1-5) and calculate min/max for band
 */
export function buildAllGossamerRuns(scenes: { itemType?: string; [key: string]: unknown }[] | undefined, selectedBeatModel?: string): { // SAFE: unknown type used for dynamic Gossamer1-5 field access
  current: GossamerRun;
  historical: Array<{ label: string; points: { beat: string; score: number }[]; color: string }>;
  minMax: { min: { beat: string; score: number }[]; max: { beat: string; score: number }[] } | null;
} {
  if (!scenes || scenes.length === 0) {
    return {
      current: buildRunFromGossamerField(scenes, 'Gossamer1', selectedBeatModel, true),
      historical: [],
      minMax: null
    };
  }

  // Build current run (Gossamer1)
  const current = buildRunFromGossamerField(scenes, 'Gossamer1', selectedBeatModel, true);
  
  // Use single gray color for all historical runs (matches CSS variable)
  const historicalColor = '#c0c0c0'; // Same as --rt-gossamer-historical-color
  
  // Build historical runs (Gossamer2-30)
  const historical: Array<{ label: string; points: { beat: string; score: number }[]; color: string }> = [];
  
  for (let i = 2; i <= 30; i++) {
    const fieldName = `Gossamer${i}`;
    
    // Check if ANY value exists for this field
    const hasAnyValue = scenes.some(s => (s.itemType === 'Beat' || s.itemType === 'Plot') && s[fieldName] !== undefined && s[fieldName] !== null);
    
    if (hasAnyValue) {
      // If any value exists, default ALL missing beats to 0 (encourages complete data)
      const run = buildRunFromGossamerField(scenes, fieldName, selectedBeatModel, true);
      
      historical.push({
        label: fieldName,
        points: run.beats.map(b => ({ beat: b.beat, score: b.score as number })),
        color: historicalColor
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
  
  return { current, historical, minMax };
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
    .filter(b => (b.status === 'present' || b.status === 'outlineOnly') && typeof b.score === 'number')
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
  
  // Filter by Beat Model only if explicitly specified and not empty
  if (selectedBeatModel && selectedBeatModel.trim() !== '' && plotBeats.some(p => p["Beat Model"])) {
    const normalizedSelected = selectedBeatModel.toLowerCase().replace(/\s+/g, '');
    plotBeats = plotBeats.filter(p => {
      const plotSystem = p["Beat Model"];
      if (!plotSystem) return false;
      const normalizedPlotSystem = plotSystem.toLowerCase().replace(/\s+/g, '');
      return normalizedPlotSystem === normalizedSelected;
    });
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
 * Detect the beat system being used from Beat Model field in Beat notes
 * Returns the detected system or empty string if none found (no forced defaults)
 */
export function detectPlotSystem(scenes: { itemType?: string; "Beat Model"?: string }[]): string {
  // Find any Beat note with Beat Model field (support both 'Beat' and 'Plot')
  const plotNote = scenes.find(s => (s.itemType === 'Beat' || s.itemType === 'Plot') && s["Beat Model"]);
  
  if (plotNote && plotNote["Beat Model"]) {
    return plotNote["Beat Model"];
  }
  
  // Return empty string if no plot system detected - let users work with their own structure
  return "";
}

/**
 * Shift Gossamer history down by one (Gossamer1 → Gossamer2, etc.)
 * Only keeps scores as simple numbers. Returns updated frontmatter.
 */
export function shiftGossamerHistory(frontmatter: Record<string, any>): Record<string, any> {
  const maxHistory = 30;
  const updated = { ...frontmatter };
  
  // Find existing Gossamer scores
  const existingScores: Record<number, number> = {};
  for (let i = 1; i <= maxHistory; i++) {
    const key = `Gossamer${i}`;
    if (typeof updated[key] === 'number') {
      existingScores[i] = updated[key];
    }
  }
  
  // Delete all Gossamer fields (including any beyond maxHistory)
  for (let i = 1; i <= maxHistory + 10; i++) {
    delete updated[`Gossamer${i}`];
  }
  
  // Shift down: 1→2, 2→3, 3→4, etc.
  Object.entries(existingScores).forEach(([oldIndex, score]) => {
    const newIndex = parseInt(oldIndex) + 1;
    if (newIndex <= maxHistory) {
      updated[`Gossamer${newIndex}`] = score;
    }
  });
  
  // Gossamer1 will be set by the caller with the new score
  return updated;
}


