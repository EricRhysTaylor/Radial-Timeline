import { formatRuntimeValue } from '../../utils/runtimeEstimator';

export function renderCenterGrid(params: {
  statusesForGrid: string[];
  stagesForGrid: string[];
  gridCounts: Record<string, Record<string, number>>;
  PUBLISH_STAGE_COLORS: Record<string, string>;
  currentYearLabel: string;
  estimatedTotalScenes: number;
  totalRuntimeSeconds: number;
  startXGrid: number;
  startYGrid: number;
  cellWidth: number;
  cellHeight: number;
  cellGapX: number;
  cellGapY: number;
  headerY: number;
  stageTooltips: Record<string, string>;
  statusTooltips: Record<string, string>;
  runtimeContentType?: 'novel' | 'screenplay';
}): string {
  const {
    statusesForGrid,
    stagesForGrid,
    gridCounts,
    PUBLISH_STAGE_COLORS,
    currentYearLabel,
    estimatedTotalScenes,
    totalRuntimeSeconds,
    startXGrid,
    startYGrid,
    cellWidth,
    cellHeight,
    cellGapX,
    cellGapY,
    headerY,
    runtimeContentType = 'novel',
  } = params;

  const gridWidth = statusesForGrid.length * cellWidth + (statusesForGrid.length - 1) * cellGapX;
  const gridHeight = stagesForGrid.length * cellHeight + (stagesForGrid.length - 1) * cellGapY;

  const isStageCompleteForGridRow = (rowIndex: number, gridCountsIn: typeof gridCounts, stages: string[]): boolean => {
    const stage = stages[rowIndex];
    const rc = gridCountsIn[stage];
    const rowTotal = (rc.Todo || 0) + (rc.Working || 0) + (rc.Due || 0) + (rc.Completed || 0);
    const maxStageIdxForGrid = stages.reduce((acc, s, idx) => {
      const counts = gridCountsIn[s];
      const total = (counts.Todo || 0) + (counts.Working || 0) + (counts.Due || 0) + (counts.Completed || 0);
      return total > 0 ? Math.max(acc, idx) : acc;
    }, -1);
    
    // A row is complete if:
    // 1. It has no scenes (surpassed by a later stage)
    if (rowTotal === 0 && maxStageIdxForGrid > rowIndex) {
      return true;
    }
    
    // 2. OR it's the most advanced stage AND all scenes in this stage are completed 
    //    AND all previous stages are also complete (final stage completion)
    if (rowIndex === maxStageIdxForGrid) {
      const completed = rc.Completed || 0;
      const incomplete = (rc.Todo || 0) + (rc.Working || 0) + (rc.Due || 0);
      const thisStageComplete = completed > 0 && incomplete === 0;
      
      if (!thisStageComplete) return false;
      
      // Check that all previous stages are also complete
      for (let i = 0; i < rowIndex; i++) {
        const prevStage = stages[i];
        const prevCounts = gridCountsIn[prevStage];
        const prevTotal = (prevCounts.Todo || 0) + (prevCounts.Working || 0) + (prevCounts.Due || 0) + (prevCounts.Completed || 0);
        const prevIncomplete = (prevCounts.Todo || 0) + (prevCounts.Working || 0) + (prevCounts.Due || 0);
        
        // Previous stage must either have no scenes (surpassed) or have all completed
        if (prevTotal > 0 && prevIncomplete > 0) {
          return false; // Previous stage still has incomplete work
        }
      }
      
      return true;
    }
    
    return false;
  };

  const renderGridCell = (stage: string, status: string, x: number, y: number, count: number): string => {
    let fillAttr = '';
    if (status === 'Completed') {
      const solid = (PUBLISH_STAGE_COLORS[stage as keyof typeof PUBLISH_STAGE_COLORS] || '#888888');
      fillAttr = `fill="${solid}"`;
    } else if (status === 'Working') {
      fillAttr = `fill="url(#plaidWorking${stage})"`;
    } else if (status === 'Todo') {
      fillAttr = `fill="url(#plaidTodo${stage})"`;
    } else if (status === 'Due') {
      fillAttr = `fill="var(--rt-color-due)"`;
    } else {
      fillAttr = `fill="#888888"`;
    }
    const cellOpacity = count <= 0 ? 0.10 : 1;
    const tooltipText = count > 0 ? `${stage} • ${status}: ${count}` : '';
    return `
      <g transform="translate(${x}, ${y})" ${tooltipText ? `class="rt-tooltip-target rt-grid-cell" data-tooltip="${tooltipText}" data-tooltip-placement="bottom"` : ''}>
        <rect x="0" y="0" width="${cellWidth}" height="${cellHeight}" ${fillAttr} fill-opacity="${cellOpacity}" pointer-events="all" />
        ${count > 0 ? `<text x="${cellWidth - 2}" y="${cellHeight - 3}" text-anchor="end" dominant-baseline="alphabetic" class="grid-cell-count">${count}</text>` : ''}
      </g>
    `;
  };

  const header = `
    <g class="color-key-center">
      ${statusesForGrid.map((status, c) => {
        const label = status === 'Todo' ? 'Tdo' : status === 'Working' ? 'Wrk' : status === 'Completed' ? 'Cmt' : 'Due';
        const x = startXGrid + c * (cellWidth + cellGapX) + (cellWidth / 2);
        const y = headerY;
        const tip = params.statusTooltips[status] || status;
        return `
          <g class="status-header rt-tooltip-target" data-tooltip="${tip}" data-tooltip-placement="bottom">
            <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="alphabetic" class="center-key-text status-header-letter">${label}</text>
            <rect x="${x - 18}" y="${y - 18}" width="36" height="24" fill="transparent" pointer-events="all" />
          </g>
        `;
      }).join('')}
      ${(() => {
        const runtimeY = startYGrid + gridHeight + (cellGapY + 16);
        const runtimeText = totalRuntimeSeconds > 0 ? formatRuntimeValue(totalRuntimeSeconds) : 'No Data';
        // Estimate text width for icon positioning (approx 7px per character)
        const textWidth = runtimeText.length * 7;
        const iconX = startXGrid + textWidth + 6;
        const iconY = runtimeY - 10; // Center icon vertically with text
        const iconSize = 12;
        // Lucide icon paths (scaled to iconSize)
        const micVocalIcon = `<g transform="translate(${iconX}, ${iconY}) scale(${iconSize / 24})">
          <path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928.911-5.127 2.374" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M21.174 16.5C20.5 15.5 20 14.372 20 13c0-2.058.911-3.928 2.374-5.127" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <circle cx="16" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="2"/>
        </g>`;
        const filmIcon = `<g transform="translate(${iconX}, ${iconY}) scale(${iconSize / 24})">
          <rect width="18" height="18" x="3" y="3" rx="2" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M7 3v18" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M3 7.5h4" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M3 12h4" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M3 16.5h4" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M17 3v18" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M17 7.5h4" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M17 12h4" fill="none" stroke="currentColor" stroke-width="2"/>
          <path d="M17 16.5h4" fill="none" stroke="currentColor" stroke-width="2"/>
        </g>`;
        const icon = runtimeContentType === 'screenplay' ? filmIcon : micVocalIcon;
        return `<g class="rt-runtime-display">
          <text x="${startXGrid}" y="${runtimeY}" text-anchor="start" dominant-baseline="alphabetic" class="center-key-text rt-runtime-total">${runtimeText}</text>
          ${icon}
        </g>`;
      })()}
      <text x="${startXGrid + gridWidth}" y="${startYGrid + gridHeight + (cellGapY + 16)}" text-anchor="end" dominant-baseline="alphabetic" class="center-key-text">${currentYearLabel}//${estimatedTotalScenes}</text>
    `;

  // Check if the entire book is complete (all scenes in the final Press stage are completed)
  const isBookComplete = (() => {
    const mostAdvancedStageIdx = stagesForGrid.reduce((acc, s, idx) => {
      const counts = gridCounts[s];
      const total = (counts.Todo || 0) + (counts.Working || 0) + (counts.Due || 0) + (counts.Completed || 0);
      return total > 0 ? Math.max(acc, idx) : acc;
    }, -1);
    if (mostAdvancedStageIdx === -1) return false;
    const finalStage = stagesForGrid[mostAdvancedStageIdx];
    if (finalStage !== 'Press') return false;
    const pressCounts = gridCounts['Press'];
    const pressCompleted = pressCounts.Completed || 0;
    const pressIncomplete = (pressCounts.Todo || 0) + (pressCounts.Working || 0) + (pressCounts.Due || 0);
    return pressCompleted > 0 && pressIncomplete === 0;
  })();

  const rows = stagesForGrid.map((stage, r) => {
    const xh = startXGrid - 12;
    const yh = startYGrid + r * (cellHeight + cellGapY) + (cellHeight / 2 + 1);
    const stageTip = params.stageTooltips[stage] || stage;
    const stageHeader = `
      <g class="stage-header rt-tooltip-target" data-tooltip="${stageTip}" data-tooltip-placement="right">
        <text x="${xh}" y="${yh}" text-anchor="end" dominant-baseline="middle" class="center-key-text stage-header-letter">${stage === 'Zero' ? 'Z' : stage === 'Author' ? 'A' : stage === 'House' ? 'H' : 'P'}</text>
        <rect x="${xh - 14}" y="${yh - 14}" width="28" height="28" fill="transparent" pointer-events="all" />
      </g>
    `;
    const cells = statusesForGrid.map((status, c) => {
      const count = gridCounts[stage][status] || 0;
      const x = startXGrid + c * (cellWidth + cellGapX);
      const y = startYGrid + r * (cellHeight + cellGapY);
      const completeRow = isStageCompleteForGridRow(r, gridCounts, stagesForGrid);
      if (completeRow) {
        const mostAdvancedStageIdx = stagesForGrid.reduce((acc, s, idx) => {
          const counts = gridCounts[s];
          const total = (counts.Todo || 0) + (counts.Working || 0) + (counts.Due || 0) + (counts.Completed || 0);
          return total > 0 ? Math.max(acc, idx) : acc;
        }, -1);
        const mostStage = stagesForGrid[Math.max(0, mostAdvancedStageIdx)];
        const solid = (PUBLISH_STAGE_COLORS[mostStage as keyof typeof PUBLISH_STAGE_COLORS] || '#888888');
        
        // Use smile face for ALL rows when the book is complete
        const iconId = isBookComplete ? 'icon-smile' : 'icon-bookmark-check';
        const completedTooltip = isBookComplete ? 'Book Complete! 🎉' : `${stage} stage complete`;
        
        return `
          <g transform="translate(${x}, ${y})" class="rt-tooltip-target rt-grid-cell-complete" data-tooltip="${completedTooltip}" data-tooltip-placement="bottom">
            <rect x="0" y="0" width="${cellWidth}" height="${cellHeight}" fill="${solid}" pointer-events="all" />
            <use href="#${iconId}" x="${(cellWidth - 18) / 2}" y="${(cellHeight - 18) / 2}" width="18" height="18" class="completed-icon" />
          </g>
        `;
      }
      return renderGridCell(stage, status, x, y, count);
    }).join('');
    return `${stageHeader}${cells}`;
  }).join('');

  const arrows = (() => {
    const maxStageIdxForGrid = stagesForGrid.reduce((acc, s, idx) => {
      const counts = gridCounts[s];
      const total = (counts.Todo || 0) + (counts.Working || 0) + (counts.Due || 0) + (counts.Completed || 0);
      return total > 0 ? Math.max(acc, idx) : acc;
    }, -1);
    if (maxStageIdxForGrid === -1) return '';
    return stagesForGrid.map((stage, r) => {
      let arrowId = '';
      if (r === maxStageIdxForGrid) arrowId = 'icon-arrow-right-dash';
      else if (r < maxStageIdxForGrid) arrowId = 'icon-arrow-down';
      else return '';
      const ax = startXGrid + gridWidth + 4;
      const ay = startYGrid + r * (cellHeight + cellGapY) + (cellHeight / 2);
      return `<use href="#${arrowId}" x="${ax}" y="${ay - 12}" width="24" height="24" class="rt-grid-arrow" />`;
    }).join('');
  })();

  return `${header}${rows}${arrows}</g>`;
}


