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
  return (name || '').trim().toLowerCase();
}

export function buildRunFromDefault(): GossamerRun {
  const beats = DefaultGossamerMomentum.map(({ beat, score, notes }) => ({
    beat,
    score,
    notes,
    status: 'present' as const,
  }));
  // Zero-offset: Opening anchored to 0
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
  const opening = run.beats.find(b => normalizeBeatName(b.beat) === 'opening image');
  const base = typeof opening?.score === 'number' ? opening.score : 0;
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


