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
  return (name || '')
    .replace(/\s+\d+(?:-\d+)?%?\s*$/i, '') // Remove trailing percentages like " 5%", " 1-10%", " 20"
    .trim()
    .toLowerCase();
}

/**
 * Build a default run using the dynamic beat order from scenes.
 * If scenes are provided, use their actual beat names; otherwise fallback to template.
 */
export function buildRunFromDefault(scenes?: { itemType?: string; subplot?: string; title?: string }[]): GossamerRun {
  let beats: GossamerBeat[];
  
  if (scenes && scenes.length > 0) {
    // Extract actual beat names from Plot notes
    const beatOrder = extractBeatOrder(scenes);
    if (beatOrder.length > 0) {
      // Map template scores to actual beats (by index)
      beats = beatOrder.map((beatName, idx) => {
        const templateScore = DefaultGossamerMomentum[idx]?.score ?? 50; // Default to mid-range if beyond template
        const templateNotes = DefaultGossamerMomentum[idx]?.notes ?? 'Template score applied.';
        return {
          beat: beatName,
          score: templateScore,
          notes: templateNotes,
          status: 'present' as const,
        };
      });
    } else {
      // No Plot notes found, use template
      beats = DefaultGossamerMomentum.map(({ beat, score, notes }) => ({
        beat,
        score,
        notes,
        status: 'present' as const,
      }));
    }
  } else {
    // No scenes provided, use template
    beats = DefaultGossamerMomentum.map(({ beat, score, notes }) => ({
      beat,
      score,
      notes,
      status: 'present' as const,
    }));
  }
  
  // Zero-offset: first beat anchored to 0
  const opening = beats[0]?.score ?? 0;
  const adjusted = beats.map(b => ({ ...b, score: typeof b.score === 'number' ? Math.max(0, b.score - opening) : b.score }));
  return {
    beats: adjusted,
    overall: {
      summary: 'Default template momentum curve applied. Replace with AI analysis when available.',
      refinements: [],
      incompleteBeats: [],
    },
    meta: { label: 'Default', date: new Date().toISOString() },
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
 * Extract dynamic beat order from Plot notes (Main Plot only).
 * Returns array of beat names in the order they appear, sorted by numeric prefix.
 * E.g., ["Opening Image", "Theme Stated 5%", "Setup 1-10%", ...]
 */
export function extractBeatOrder(scenes: { itemType?: string; subplot?: string; title?: string }[]): string[] {
  const plotBeats = scenes
    .filter(s => s.itemType === 'Plot' && (s.subplot === 'Main Plot' || !s.subplot))
    .map(s => s.title || '')
    .filter(Boolean);
  
  // Sort by numeric prefix (e.g., "1 Opening Image", "2 Theme Stated 5%")
  plotBeats.sort((a, b) => {
    const aMatch = a.match(/^(\d+(?:\.\d+)?)/);
    const bMatch = b.match(/^(\d+(?:\.\d+)?)/);
    const aNum = aMatch ? parseFloat(aMatch[1]) : 0;
    const bNum = bMatch ? parseFloat(bMatch[1]) : 0;
    return aNum - bNum;
  });
  
  // Strip leading numbers: "1 Opening Image" → "Opening Image"
  return plotBeats.map(title => title.replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim());
}


