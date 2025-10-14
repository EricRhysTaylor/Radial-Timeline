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

export interface BeatSliceInfo {
  startAngle: number;
  endAngle: number;
  innerR: number;
  outerR: number;
}

export function renderGossamerLayer(
  scenes: Scene[],
  run: GossamerRun | null | undefined,
  polar: PolarConfig,
  anglesByBeat?: Map<string, number>,
  beatPathByName?: Map<string, string>,
  overlayRuns?: Array<{ label?: string; points: { beat: string; score: number }[] }>,
  minBand?: { min: { beat: string; score: number }[]; max: { beat: string; score: number }[] },
  spokeEndRadius?: number,
  publishStageColorByBeat?: Map<string, string>,
  beatSlicesByName?: Map<string, BeatSliceInfo>
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
  const centerDots: string[] = [];
  const spokes: string[] = [];
  const beatOutlines: string[] = [];

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
      
      // Get publish stage color for this beat
      const stageColor = publishStageColorByBeat?.get(key) || '#7a7a7a';
      
      dots.push(`<circle class="rt-gossamer-dot" cx="${fmt(x)}" cy="${fmt(y)}" r="5" style="fill: ${stageColor};" ${data}>${title}</circle>`); // SAFE: inline style used for dynamic per-beat colors based on individual publish stages known only at runtime during SVG generation
      // Add center dot (4px radius) that appears on hover with publish stage color
      centerDots.push(`<circle class="rt-gossamer-dot-center" cx="${fmt(x)}" cy="${fmt(y)}" r="4" style="fill: ${stageColor};" data-beat="${escapeAttr(name)}"/>`); // SAFE: inline style used for dynamic per-beat colors based on individual publish stages known only at runtime during SVG generation
      // Spoke from inner to the beginning of the beat slice (or outer radius if not specified)
      const spokeEnd = spokeEndRadius ?? outerRadius;
      const sx1 = innerRadius * Math.cos(angle);
      const sy1 = innerRadius * Math.sin(angle);
      const sx2 = spokeEnd * Math.cos(angle);
      const sy2 = spokeEnd * Math.sin(angle);
      spokes.push(`<line class="rt-gossamer-spoke" data-beat="${escapeAttr(name)}" style="stroke: ${stageColor};" x1="${fmt(sx1)}" y1="${fmt(sy1)}" x2="${fmt(sx2)}" y2="${fmt(sy2)}"/>`); // SAFE: inline style used for dynamic per-beat colors based on individual publish stages known only at runtime during SVG generation
      
      // Build beat slice outline if we have slice info
      if (beatSlicesByName) {
        const sliceInfo = beatSlicesByName.get(key);
        if (sliceInfo) {
          const arcPath = buildCellArcPath(sliceInfo.innerR, sliceInfo.outerR, sliceInfo.startAngle, sliceInfo.endAngle);
          beatOutlines.push(`<path class="rt-gossamer-beat-outline" d="${arcPath}" style="stroke: ${stageColor};" data-beat="${escapeAttr(name)}"/>`); // SAFE: inline style used for dynamic per-beat colors based on individual publish stages known only at runtime during SVG generation
        }
      }
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
  const centerDotsSvg = centerDots.join('');
  const spokesSvg = spokes.join('');
  const beatOutlinesSvg = beatOutlines.join('');
  
  return `<g class="rt-gossamer-layer">${bandSvg}${overlaySvg}${spokesSvg}${mainPaths}${beatOutlinesSvg}${dotsSvg}${centerDotsSvg}</g>`;
}

function buildPath(points: { x: number; y: number }[]): string {
  if (!points.length) return '';
  if (points.length === 1) return `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  if (points.length === 2) {
    // For just two points, use a straight line
    return `M ${fmt(points[0].x)} ${fmt(points[0].y)} L ${fmt(points[1].x)} ${fmt(points[1].y)}`;
  }
  
  // Build smooth bezier curve through all points
  let path = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  
  // Calculate control points for smooth curve with adaptive tension
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const prev = i > 0 ? points[i - 1] : current;
    const afterNext = i < points.length - 2 ? points[i + 2] : next;
    
    // Calculate distances to detect tight curves
    const distCurrNext = Math.sqrt((next.x - current.x) ** 2 + (next.y - current.y) ** 2);
    const distPrevCurr = Math.sqrt((current.x - prev.x) ** 2 + (current.y - prev.y) ** 2);
    const distNextAfter = Math.sqrt((afterNext.x - next.x) ** 2 + (afterNext.y - next.y) ** 2);
    
    // Base tension for smooth curves
    let tension = 0.25;
    
    // Reduce tension for tight curves (when points are close together)
    const avgDist = (distPrevCurr + distCurrNext + distNextAfter) / 3;
    if (avgDist < 50) {
      // Very tight curve - use minimal tension
      tension = 0.1;
    } else if (avgDist < 100) {
      // Moderately tight curve
      tension = 0.15;
    }
    
    // Further reduce tension if we detect a sharp angle (direction change)
    if (i > 0 && i < points.length - 1) {
      // Calculate vectors
      const v1x = current.x - prev.x;
      const v1y = current.y - prev.y;
      const v2x = next.x - current.x;
      const v2y = next.y - current.y;
      
      // Calculate dot product and magnitudes
      const dot = v1x * v2x + v1y * v2y;
      const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
      const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
      
      if (mag1 > 0 && mag2 > 0) {
        const cosAngle = dot / (mag1 * mag2);
        // If angle is sharp (cosAngle < 0 means > 90 degrees)
        if (cosAngle < 0.5) {
          tension *= 0.5; // Reduce tension for sharp turns
        }
      }
    }
    
    // Calculate control point distances (limit to fraction of segment length)
    const maxControlDist = distCurrNext * 0.4;
    
    // Control point 1 (outgoing from current point)
    let cp1x = current.x + (next.x - prev.x) * tension;
    let cp1y = current.y + (next.y - prev.y) * tension;
    
    // Limit control point 1 distance from current point
    const cp1dist = Math.sqrt((cp1x - current.x) ** 2 + (cp1y - current.y) ** 2);
    if (cp1dist > maxControlDist && cp1dist > 0) {
      const scale = maxControlDist / cp1dist;
      cp1x = current.x + (cp1x - current.x) * scale;
      cp1y = current.y + (cp1y - current.y) * scale;
    }
    
    // Control point 2 (incoming to next point)
    let cp2x = next.x - (afterNext.x - current.x) * tension;
    let cp2y = next.y - (afterNext.y - current.y) * tension;
    
    // Limit control point 2 distance from next point
    const cp2dist = Math.sqrt((cp2x - next.x) ** 2 + (cp2y - next.y) ** 2);
    if (cp2dist > maxControlDist && cp2dist > 0) {
      const scale = maxControlDist / cp2dist;
      cp2x = next.x + (cp2x - next.x) * scale;
      cp2y = next.y + (cp2y - next.y) * scale;
    }
    
    // Add cubic bezier curve segment
    path += ` C ${fmt(cp1x)} ${fmt(cp1y)}, ${fmt(cp2x)} ${fmt(cp2y)}, ${fmt(next.x)} ${fmt(next.y)}`;
  }
  
  return path;
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

// Helper to build arc path for beat slices
function buildCellArcPath(innerR: number, outerR: number, startAngle: number, endAngle: number): string {
  const x1 = innerR * Math.cos(startAngle);
  const y1 = innerR * Math.sin(startAngle);
  const x2 = outerR * Math.cos(startAngle);
  const y2 = outerR * Math.sin(startAngle);
  const x3 = outerR * Math.cos(endAngle);
  const y3 = outerR * Math.sin(endAngle);
  const x4 = innerR * Math.cos(endAngle);
  const y4 = innerR * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${fmt(x1)} ${fmt(y1)} L ${fmt(x2)} ${fmt(y2)} A ${fmt(outerR)} ${fmt(outerR)} 0 ${largeArc} 1 ${fmt(x3)} ${fmt(y3)} L ${fmt(x4)} ${fmt(y4)} A ${fmt(innerR)} ${fmt(innerR)} 0 ${largeArc} 0 ${fmt(x1)} ${fmt(y1)} Z`;
}


