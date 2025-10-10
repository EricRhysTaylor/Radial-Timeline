/*
 * Gossamer SVG layer helper
 */
import type { Scene } from '../main';
import { normalizeBeatName, GossamerRun, extractPresentBeatScores, extractBeatOrder } from '../utils/gossamer';

export interface PolarConfig {
  innerRadius: number;
  outerRadius: number;
}

// Helper to map score [0..100] into a band near the outer ring
function mapScoreToRadius(score: number, inner: number, outer: number): number {
  // Linear map: 0 -> inner, 100 -> outer
  const clamped = Math.max(0, Math.min(100, score));
  return inner + (clamped / 100) * (outer - inner);
}

export function renderGossamerLayer(
  scenes: Scene[],
  run: GossamerRun | null | undefined,
  polar: PolarConfig,
  anglesByBeat?: Map<string, number>,
  beatPathByName?: Map<string, string>,
  overlayRuns?: Array<{ label?: string; points: { beat: string; score: number }[] }>,
  minBand?: { min: { beat: string; score: number }[]; max: { beat: string; score: number }[] }
): string {
  if (!run) return '';

  // Extract dynamic beat order from Plot notes
  const beatOrder = extractBeatOrder(scenes);
  if (!beatOrder.length) {
    console.warn('[Gossamer] No Plot beats found in scenes');
    return '';
  }

  // Build angles map with fallback, then override with provided values from rendered plot beats
  const localAngles = (() => {
    const m = new Map<string, number>();
    // Fallback: equally-spaced angles if no rendered angles provided
    const fallbackAngles: number[] = beatOrder.map((_, i) => -Math.PI / 2 + (i / beatOrder.length) * 2 * Math.PI);
    beatOrder.forEach((name, idx) => m.set(normalizeBeatName(name), fallbackAngles[idx]));
    
    // Override with actual rendered plot beat positions for perfect alignment
    if (anglesByBeat) {
      anglesByBeat.forEach((val, key) => {
        m.set(key, val);
      });
    }
    return m;
  })();

  // Build contiguous segments from present beats with numeric scores
  const present = extractPresentBeatScores(run);
  if (!present.length) return '';

  const { innerRadius, outerRadius } = polar;

  // Create one path per contiguous present segment in dynamic beat order
  const nameToScore = new Map(present.map(p => [normalizeBeatName(p.beat), p.score]));
  const segments: string[] = [];
  let current: { x: number; y: number }[] = [];
  const dots: string[] = [];
  const spokes: string[] = [];

  beatOrder.forEach(name => {
    const key = normalizeBeatName(name);
    const score = nameToScore.get(key);
    const angle = localAngles.get(key);
    
    if (typeof score === 'number' && typeof angle === 'number') {
      const r = mapScoreToRadius(score, innerRadius, outerRadius);
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);
      current.push({ x, y });
      const path = beatPathByName?.get(key) || '';
      // Use URL-encoded path to match scene groups' data-path attribute
      const encodedPath = path ? encodeURIComponent(path) : '';
      const data = `data-beat="${escapeAttr(name)}" data-score="${String(score)}"${encodedPath ? ` data-path="${escapeAttr(encodedPath)}"` : ''}${run?.meta?.label ? ` data-label="${escapeAttr(run.meta.label)}"` : ''}`;
      const title = `<title>${escapeAttr(`${name}${run?.meta?.label ? ` — ${run.meta.label}` : ''}: ${score}`)}</title>`;
      dots.push(`<circle class="rt-gossamer-dot" cx="${fmt(x)}" cy="${fmt(y)}" r="5" ${data}>${title}</circle>`);
      // Full y-axis spoke from inner to outer radius at this beat's angle
      const sx1 = innerRadius * Math.cos(angle);
      const sy1 = innerRadius * Math.sin(angle);
      const sx2 = outerRadius * Math.cos(angle);
      const sy2 = outerRadius * Math.sin(angle);
      spokes.push(`<line class="rt-gossamer-spoke" data-beat="${escapeAttr(name)}" x1="${fmt(sx1)}" y1="${fmt(sy1)}" x2="${fmt(sx2)}" y2="${fmt(sy2)}"/>`);
    } else {
      if (current.length > 1) {
        segments.push(buildPath(current));
      }
      current = [];
    }
  });
  if (current.length > 1) segments.push(buildPath(current));

  if (segments.length === 0 && dots.length === 0) return '';

  // Optional overlays (dashed)
  const overlayPaths = (overlayRuns || [])
    .map(ov => buildOverlayPath(ov.points, localAngles, innerRadius, outerRadius))
    .filter((d): d is string => !!d);

  // Optional min/max band fill
  let bandPath = '';
  if (minBand && minBand.min && minBand.max) {
    const minPts = toPoints(minBand.min, localAngles, innerRadius, outerRadius);
    const maxPts = toPoints(minBand.max, localAngles, innerRadius, outerRadius);
    if (minPts.length >= 3 && maxPts.length >= 3) {
      bandPath = buildBand(minPts, maxPts);
    }
  }

  const mainPaths = segments.map(d => `<path class="rt-gossamer-line" d="${d}"/>`).join('');
  const overlaySvg = overlayPaths.map(d => `<path class="rt-gossamer-line rt-gossamer-overlay" d="${d}"/>`).join('');
  const bandSvg = bandPath ? `<path class="rt-gossamer-band" d="${bandPath}"/>` : '';
  const dotsSvg = dots.join('');
  const spokesSvg = spokes.join('');
  
  return `<g class="rt-gossamer-layer">${bandSvg}${overlaySvg}${spokesSvg}${mainPaths}${dotsSvg}</g>`;
}

function buildPath(points: { x: number; y: number }[]): string {
  if (!points.length) return '';
  const move = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  const rest = points.slice(1).map(p => `L ${fmt(p.x)} ${fmt(p.y)}`).join(' ');
  return `${move} ${rest}`;
}

function fmt(n: number): string { return n.toFixed(6).replace(/\.0+$/, ''); }

function toPoints(series: { beat: string; score: number }[], angles: Map<string, number>, inner: number, outer: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  series.forEach(p => {
    const a = angles.get(normalizeBeatName(p.beat));
    if (typeof a !== 'number') return;
    const r = mapScoreToRadius(p.score, inner, outer);
    pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  });
  return pts;
}

function buildOverlayPath(points: { beat: string; score: number }[], angles: Map<string, number>, inner: number, outer: number): string | null {
  const pts = toPoints(points, angles, inner, outer);
  if (pts.length < 2) return null;
  return buildPath(pts);
}

function buildBand(minPts: { x: number; y: number }[], maxPts: { x: number; y: number }[]): string {
  // Build a closed polygon: max path forward, then min path reversed, then Z
  const maxPart = `${fmt(maxPts[0].x)} ${fmt(maxPts[0].y)} ` + maxPts.slice(1).map(p => `${fmt(p.x)} ${fmt(p.y)}`).join(' ');
  const minRev = [...minPts].reverse();
  const minPart = minRev.map(p => `${fmt(p.x)} ${fmt(p.y)}`).join(' ');
  return `M ${maxPart} L ${minPart} Z`;
}

function escapeAttr(s: string): string {
  return (s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


