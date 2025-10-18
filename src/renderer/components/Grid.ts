export function renderCenterGrid(params: {
  statusesForGrid: string[];
  stagesForGrid: string[];
  gridCounts: Record<string, Record<string, number>>;
  PUBLISH_STAGE_COLORS: Record<string, string>;
  currentYearLabel: string;
  estimatedTotalScenes: number;
  startXGrid: number;
  startYGrid: number;
  cellWidth: number;
  cellHeight: number;
  cellGapX: number;
  cellGapY: number;
  headerY: number;
}): string {
  const {
    statusesForGrid,
    stagesForGrid,
    gridCounts,
    PUBLISH_STAGE_COLORS,
    currentYearLabel,
    estimatedTotalScenes,
    startXGrid,
    startYGrid,
    cellWidth,
    cellHeight,
    cellGapX,
    cellGapY,
    headerY,
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
    return rowTotal === 0 && (maxStageIdxForGrid > rowIndex);
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
    return `
      <g transform="translate(${x}, ${y})">
        <rect x="0" y="0" width="${cellWidth}" height="${cellHeight}" ${fillAttr} fill-opacity="${cellOpacity}">
          ${count > 0 ? `<title>${stage} • ${status}: ${count}</title>` : ''}
        </rect>
        ${status === 'Completed' && count > 0 ? `<text x="2" y="${cellHeight - 3}" text-anchor="start" dominant-baseline="alphabetic" class="grid-completed-count">${count}</text>` : ''}
      </g>
    `;
  };

  const header = `
    <g class="color-key-center">
      ${statusesForGrid.map((status, c) => {
        const label = status === 'Todo' ? 'Tdo' : status === 'Working' ? 'Wrk' : status === 'Completed' ? 'Cmt' : 'Due';
        const x = startXGrid + c * (cellWidth + cellGapX) + (cellWidth / 2);
        const y = headerY;
        const tip = status;
        return `
          <g class="status-header">
            <text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="alphabetic" class="center-key-text status-header-letter">${label}</text>
            <rect x="${x - 18}" y="${y - 18}" width="36" height="24" fill="transparent" pointer-events="all">
              <title>${tip}</title>
            </rect>
          </g>
        `;
      }).join('')}
      <text x="${startXGrid + gridWidth}" y="${startYGrid + gridHeight + (cellGapY + 16)}" text-anchor="end" dominant-baseline="alphabetic" class="center-key-text">${currentYearLabel}//${estimatedTotalScenes}</text>
    `;

  const rows = stagesForGrid.map((stage, r) => {
    const xh = startXGrid - 12;
    const yh = startYGrid + r * (cellHeight + cellGapY) + (cellHeight / 2 + 1);
    const stageHeader = `
      <g class="stage-header">
        <text x="${xh}" y="${yh}" text-anchor="end" dominant-baseline="middle" class="center-key-text stage-header-letter">${stage === 'Zero' ? 'Z' : stage === 'Author' ? 'A' : stage === 'House' ? 'H' : 'P'}</text>
        <rect x="${xh - 14}" y="${yh - 14}" width="28" height="28" fill="transparent" pointer-events="all">
          <title>${stage}</title>
        </rect>
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
        return `
          <g transform="translate(${x}, ${y})">
            <rect x="0" y="0" width="${cellWidth}" height="${cellHeight}" fill="${solid}">
              ${count > 0 ? `<title>${stage} • ${status}: ${count}</title>` : ''}
            </rect>
            ${status === 'Completed' && count > 0 ? `<text x="2" y="${cellHeight - 3}" text-anchor="start" dominant-baseline="alphabetic" class="grid-completed-count">${count}</text>` : ''}
            <use href="#icon-bookmark-check" x="${(cellWidth - 18) / 2}" y="${(cellHeight - 18) / 2}" width="18" height="18" class="completed-icon" />
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


