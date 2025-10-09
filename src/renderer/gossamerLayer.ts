/*
 * Gossamer SVG layer helper
 */
import type { Scene } from '../main';
import { STC_BEATS_ORDER } from '../ai/prompts/gossamer';
import { normalizeBeatName, GossamerRun, extractPresentBeatScores } from '../utils/gossamer';

export interface PolarConfig {
  innerRadius: number;
  outerRadius: number;
}

// Helper to map score [0..100] into a band near the outer ring
function mapScoreToRadius(score: number, inner: number, outer: number): number {
  const bandSize = Math.max(20, Math.min(80, (outer - inner) * 0.12));
  const bandInner = outer - bandSize;
  const clamped = Math.max(0, Math.min(100, score));
  return bandInner + (clamped / 100) * bandSize;
}

export function renderGossamerLayer(
  scenes: Scene[],
  run: GossamerRun | null | undefined,
  polar: PolarConfig
): string {
  if (!run) return '';

  // Build angle lookup using existing Plot beats from scenes (All Scenes mode shows them)
  const plotGroups = scenes.filter(s => s.itemType === 'Plot');
  // We rely on TimeLineRenderer to have already ordered scenes; here we just collect from DOM order input
  const anglesByBeat = new Map<string, number>();

  // Fallback: evenly space beats if angles cannot be found (defensive)
  const fallbackAngles: number[] = STC_BEATS_ORDER.map((_, i) => -Math.PI / 2 + (i / STC_BEATS_ORDER.length) * 2 * Math.PI);

  // Attempt to infer angles from plotGroups’ title order; TimeLineRenderer sets arcs but not exposed here,
  // so for Phase 1, rely on STC order for angular sequencing and evenly distribute as a temporary approximation.
  STC_BEATS_ORDER.forEach((name, idx) => anglesByBeat.set(normalizeBeatName(name), fallbackAngles[idx]));

  // Build contiguous segments from present beats with numeric scores
  const present = extractPresentBeatScores(run);
  if (!present.length) return '';

  const { innerRadius, outerRadius } = polar;

  // Create one path per contiguous present segment in STC order
  const nameToScore = new Map(present.map(p => [normalizeBeatName(p.beat), p.score]));
  const segments: string[] = [];
  let current: { x: number; y: number }[] = [];

  STC_BEATS_ORDER.forEach(name => {
    const key = normalizeBeatName(name);
    const score = nameToScore.get(key);
    const angle = anglesByBeat.get(key);
    if (typeof score === 'number' && typeof angle === 'number') {
      const r = mapScoreToRadius(score, innerRadius, outerRadius);
      current.push({ x: r * Math.cos(angle), y: r * Math.sin(angle) });
    } else {
      if (current.length > 1) {
        segments.push(buildPath(current));
      }
      current = [];
    }
  });
  if (current.length > 1) segments.push(buildPath(current));

  if (segments.length === 0) return '';

  const paths = segments.map(d => `<path class="rt-gossamer-line" d="${d}"/>`).join('');
  return `<g class="rt-gossamer-layer">${paths}</g>`;
}

function buildPath(points: { x: number; y: number }[]): string {
  if (!points.length) return '';
  const move = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  const rest = points.slice(1).map(p => `L ${fmt(p.x)} ${fmt(p.y)}`).join(' ');
  return `${move} ${rest}`;
}

function fmt(n: number): string { return n.toFixed(6).replace(/\.0+$/, ''); }


