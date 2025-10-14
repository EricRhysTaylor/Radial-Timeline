/*
 * Gossamer SVG layer helper
 */
import type { Scene } from '../main';
import { GossamerRun, extractPresentBeatScores, extractBeatOrder } from '../utils/gossamer';

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
  overlayRuns?: Array<{ label?: string; points: { beat: string; score: number }[]; color?: string }>,
  minBand?: { min: { beat: string; score: number }[]; max: { beat: string; score: number }[] },
  spokeEndRadius?: number,
  publishStageColorByBeat?: Map<string, string>,
  beatSlicesByName?: Map<string, BeatSliceInfo>
): string {
  if (!run) return '';
  
  // Build a map of beat statuses for rendering (use exact beat names)
  const beatStatusMap = new Map(run.beats.map(b => [b.beat, b.status]));

  // Get selected beat model from plugin settings (passed through run meta if needed)
  const selectedBeatModel = run?.meta?.model;
  
  // Extract dynamic beat order from Plot notes
  const beatOrder = extractBeatOrder(scenes, selectedBeatModel);
  if (!beatOrder.length) {
    console.warn('[Gossamer] No Plot beats found in scenes');
    return '';
  }

  // Build angles map with fallback, then override with provided values from rendered plot beats
  const localAngles = (() => {
    const m = new Map<string, number>();
    // Fallback: equally-spaced angles if no rendered angles provided
    const fallbackAngles: number[] = beatOrder.map((_, i) => -Math.PI / 2 + (i / beatOrder.length) * 2 * Math.PI);
    beatOrder.forEach((name, idx) => m.set(name, fallbackAngles[idx]));
    
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

  // Create one path per contiguous present segment in dynamic beat order (use exact beat names)
  const nameToScore = new Map(present.map(p => [p.beat, p.score]));
  const segments: string[] = [];
  let current: { x: number; y: number }[] = [];
  const dots: string[] = [];
  const spokes: string[] = [];
  const beatOutlines: string[] = [];

  beatOrder.forEach(name => {
    const score = nameToScore.get(name);
    const angle = localAngles.get(name);
    
    if (typeof score === 'number' && typeof angle === 'number') {
      const r = mapScoreToRadius(score, innerRadius, outerRadius);
      const x = r * Math.cos(angle);
      const y = r * Math.sin(angle);
      current.push({ x, y });
      const path = beatPathByName?.get(name) || '';
      // Use URL-encoded path to match scene groups' data-path attribute
      const encodedPath = path ? encodeURIComponent(path) : '';
      const data = `data-beat="${escapeAttr(name)}" data-score="${String(score)}"${encodedPath ? ` data-path="${escapeAttr(encodedPath)}"` : ''}${run?.meta?.label ? ` data-label="${escapeAttr(run.meta.label)}"` : ''}`;
      
      // Check if this beat is missing data (outlineOnly status)
      const beatStatus = beatStatusMap.get(name);
      const isMissingData = beatStatus === 'outlineOnly';
      const titleText = isMissingData 
        ? `${name}: Missing data (defaulted to 0)`
        : `${name}${run?.meta?.label ? ` — ${run.meta.label}` : ''}: ${score}`;
      const title = `<title>${escapeAttr(titleText)}</title>`;
      
      // Get publish stage color for this beat, or red if missing data
      const stageColor = isMissingData ? '#ff4444' : (publishStageColorByBeat?.get(name) || '#7a7a7a');
      
      // Gossamer1 dots: normal colored circles (hover CSS will add stroke effect)
      dots.push(`<circle class="rt-gossamer-dot${isMissingData ? ' rt-gossamer-missing-data' : ''}" cx="${fmt(x)}" cy="${fmt(y)}" r="4" fill="${stageColor}" ${data}>${title}</circle>`);
      // Spoke from inner to the beginning of the beat slice (or outer radius if not specified)
      const spokeEnd = spokeEndRadius ?? outerRadius;
      const sx1 = innerRadius * Math.cos(angle);
      const sy1 = innerRadius * Math.sin(angle);
      const sx2 = spokeEnd * Math.cos(angle);
      const sy2 = spokeEnd * Math.sin(angle);
      spokes.push(`<line class="rt-gossamer-spoke" data-beat="${escapeAttr(name)}" style="stroke: ${stageColor};" x1="${fmt(sx1)}" y1="${fmt(sy1)}" x2="${fmt(sx2)}" y2="${fmt(sy2)}"/>`); // SAFE: inline style used for dynamic per-beat colors based on individual publish stages known only at runtime during SVG generation
      
      // Build beat slice outline if we have slice info
      if (beatSlicesByName) {
        const sliceInfo = beatSlicesByName.get(name);
        if (sliceInfo) {
          const arcPath = buildCellArcPath(sliceInfo.innerR, sliceInfo.outerR, sliceInfo.startAngle, sliceInfo.endAngle);
          beatOutlines.push(`<path class="rt-gossamer-beat-outline" d="${arcPath}" style="stroke: ${stageColor};" data-beat="${escapeAttr(name)}"/>`); // SAFE: inline style used for dynamic per-beat colors based on individual publish stages known only at runtime during SVG generation
        }
      }
    } else {
      // No angle (shouldn't happen if beat is in beatOrder, but handle gracefully)
      if (current.length > 1) {
        segments.push(buildPath(current));
      }
      current = [];
    }
  });
  if (current.length > 1) segments.push(buildPath(current));

  if (segments.length === 0 && dots.length === 0) return '';

  // Optional min/max band fill (rendered FIRST - behind everything)
  let bandSvg = '';
  if (minBand && minBand.min && minBand.max) {
    const minPts = toPoints(minBand.min, localAngles, innerRadius, outerRadius);
    const maxPts = toPoints(minBand.max, localAngles, innerRadius, outerRadius);
    if (minPts.length >= 3 && maxPts.length >= 3) {
      // Use Bezier smoothing for band to match plot lines
      const minPath = buildPath(minPts);
      const maxPath = buildPath(maxPts);
      const bandPath = buildBandFromPaths(minPts, maxPts);
      
      // Use a light version of publish stage color with transparency
      // Find the most common publish stage color from current run
      const stageColors = Array.from(publishStageColorByBeat?.values() || []);
      const dominantColor = stageColors.length > 0 ? stageColors[0] : '#7a7a7a';
      const lightColor = lightenColor(dominantColor, 0.7); // 70% lighter
      
      bandSvg = `<path class="rt-gossamer-band" d="${bandPath}" fill="${lightColor}" fill-opacity="0.3"/>`;
    }
  }

  // Optional historical runs (rendered in reverse order: oldest to newest, so newest is on top)
  const overlayPathsWithColors: Array<{ path: string; color: string }> = [];
  const overlayDots: string[] = [];
  
  if (overlayRuns && overlayRuns.length > 0) {
    // Reverse to draw oldest first (bottom layer)
    [...overlayRuns].reverse().forEach(ov => {
      const path = buildOverlayPath(ov.points, localAngles, innerRadius, outerRadius);
      if (path) {
        overlayPathsWithColors.push({
          path,
          color: ov.color || '#c0c0c0'
        });
      }
      
      // Add dots for historical runs (red if score is 0, gray if score > 0)
      ov.points.forEach(point => {
        const angle = localAngles.get(point.beat);
        if (typeof angle === 'number') {
          const r = mapScoreToRadius(point.score, innerRadius, outerRadius);
          const x = r * Math.cos(angle);
          const y = r * Math.sin(angle);
          const dotColor = point.score === 0 ? '#ff4444' : (ov.color || '#c0c0c0');
          // Historical dots: smaller than current (r=3 vs r=4), no stroke by default
          overlayDots.push(`<circle class="rt-gossamer-dot-historical" cx="${fmt(x)}" cy="${fmt(y)}" r="5" fill="${dotColor}" data-beat="${escapeAttr(point.beat)}" pointer-events="none"/>`);
        }
      });
    });
  }
  
  const overlaySvg = overlayPathsWithColors
    .map(({ path, color }) => `<path class="rt-gossamer-line rt-gossamer-overlay" d="${path}" stroke="${color}"/>`)
    .join('');
  const overlayDotsSvg = overlayDots.join('');

  // Main current run (Gossamer1) - on top of historical runs
  const mainPaths = segments.map(d => `<path class="rt-gossamer-line" d="${d}"/>`).join('');
  
  // Render order (SVG draw order = z-order):
  // 1. Band (behind everything)
  // 2. Historical runs (oldest to newest)
  // 3. Main current line
  // 4. Spokes (behind all dots)
  // 5. Beat outlines
  // 6. Historical dots (small, non-interactive)
  // 7. Current dots (on top, interactive)
  const dotsSvg = dots.join('');
  const spokesSvg = spokes.join('');
  const beatOutlinesSvg = beatOutlines.join('');
  
  return `<g class="rt-gossamer-layer">${bandSvg}${overlaySvg}${mainPaths}${spokesSvg}${beatOutlinesSvg}${overlayDotsSvg}${dotsSvg}</g>`;
}

/**
 * Centralized Bezier path builder - ensures all gossamer curves use identical smoothing.
 * @param points Array of x,y coordinates
 * @param startWithMove If true, starts with M command; if false, continues existing path with L
 */
function buildBezierPath(points: { x: number; y: number }[], startWithMove: boolean = true): string {
  if (!points.length) return '';
  if (points.length === 1) {
    return startWithMove ? `M ${fmt(points[0].x)} ${fmt(points[0].y)}` : `L ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  }
  if (points.length === 2) {
    const start = startWithMove ? `M ${fmt(points[0].x)} ${fmt(points[0].y)}` : `L ${fmt(points[0].x)} ${fmt(points[0].y)}`;
    return `${start} L ${fmt(points[1].x)} ${fmt(points[1].y)}`;
  }
  
  // Build smooth bezier curve through all points
  let path = startWithMove ? `M ${fmt(points[0].x)} ${fmt(points[0].y)}` : `L ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  
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
      tension = 0.1;
    } else if (avgDist < 100) {
      tension = 0.15;
    }
    
    // Further reduce tension if we detect a sharp angle (direction change)
    if (i > 0 && i < points.length - 1) {
      const v1x = current.x - prev.x;
      const v1y = current.y - prev.y;
      const v2x = next.x - current.x;
      const v2y = next.y - current.y;
      
      const dot = v1x * v2x + v1y * v2y;
      const mag1 = Math.sqrt(v1x * v1x + v1y * v1y);
      const mag2 = Math.sqrt(v2x * v2x + v2y * v2y);
      
      if (mag1 > 0 && mag2 > 0) {
        const cosAngle = dot / (mag1 * mag2);
        if (cosAngle < 0.5) {
          tension *= 0.5;
        }
      }
    }
    
    // Calculate control point distances (limit to fraction of segment length)
    const maxControlDist = distCurrNext * 0.4;
    
    // Control point 1 (outgoing from current point)
    let cp1x = current.x + (next.x - prev.x) * tension;
    let cp1y = current.y + (next.y - prev.y) * tension;
    
    const cp1dist = Math.sqrt((cp1x - current.x) ** 2 + (cp1y - current.y) ** 2);
    if (cp1dist > maxControlDist && cp1dist > 0) {
      const scale = maxControlDist / cp1dist;
      cp1x = current.x + (cp1x - current.x) * scale;
      cp1y = current.y + (cp1y - current.y) * scale;
    }
    
    // Control point 2 (incoming to next point)
    let cp2x = next.x - (afterNext.x - current.x) * tension;
    let cp2y = next.y - (afterNext.y - current.y) * tension;
    
    const cp2dist = Math.sqrt((cp2x - next.x) ** 2 + (cp2y - next.y) ** 2);
    if (cp2dist > maxControlDist && cp2dist > 0) {
      const scale = maxControlDist / cp2dist;
      cp2x = next.x + (cp2x - next.x) * scale;
      cp2y = next.y + (cp2y - next.y) * scale;
    }
    
    path += ` C ${fmt(cp1x)} ${fmt(cp1y)}, ${fmt(cp2x)} ${fmt(cp2y)}, ${fmt(next.x)} ${fmt(next.y)}`;
  }
  
  return path;
}

function buildPath(points: { x: number; y: number }[]): string {
  return buildBezierPath(points, true);
}

function fmt(n: number): string { return n.toFixed(6).replace(/\.0+$/, ''); }

function toPoints(series: { beat: string; score: number }[], angles: Map<string, number>, inner: number, outer: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  series.forEach(p => {
    const a = angles.get(p.beat);
    if (typeof a !== 'number') return;
    const r = mapScoreToRadius(p.score, inner, outer);
    pts.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
  });
  return pts;
}

function buildOverlayPath(points: { beat: string; score: number }[], angles: Map<string, number>, inner: number, outer: number): string | null {
  const pts = toPoints(points, angles, inner, outer);
  if (pts.length < 2) return null;
  return buildBezierPath(pts, true);
}

function buildBandFromPaths(minPts: { x: number; y: number }[], maxPts: { x: number; y: number }[]): string {
  // Build a closed shape using Bezier curves to match the plot lines
  if (minPts.length < 2 || maxPts.length < 2) return '';
  
  // Build max path forward using shared Bezier function
  const maxBezier = buildBezierPath(maxPts, true);
  
  // Build min path reversed using shared Bezier function (continue from max, no M command)
  const minReversed = [...minPts].reverse();
  const minBezier = buildBezierPath(minReversed, false);
  
  // Combine: start at first max point, draw max path, then min path reversed, close
  return `${maxBezier} ${minBezier} Z`;
}

function lightenColor(hex: string, amount: number): string {
  // Convert hex to RGB, lighten, return hex
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  const lighten = (c: number) => Math.round(c + (255 - c) * amount);
  
  const newR = lighten(r).toString(16).padStart(2, '0');
  const newG = lighten(g).toString(16).padStart(2, '0');
  const newB = lighten(b).toString(16).padStart(2, '0');
  
  return `#${newR}${newG}${newB}`;
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



