// Minimal local constants the renderer relies on
export const NUM_ACTS = 3;

// Grid and legend sizing
export const GRID_CELL_BASE = 22;
export const GRID_CELL_WIDTH_EXTRA = 9; // width = round(base*1.5) + extra
export const GRID_CELL_GAP_X = 2;
export const GRID_CELL_GAP_Y = 4;
export const GRID_HEADER_OFFSET_Y = 12;
export const GRID_LINE_HEIGHT = 26;

// Plot arc width in pixels at a given radius
export const PLOT_PIXEL_WIDTH = 18; // converted to radians via (PLOT_PIXEL_WIDTH / middleRadius)

// Stage and status orderings
export const STAGE_ORDER = ["Zero", "Author", "House", "Press"] as const;
export const STAGES_FOR_GRID = ["Zero", "Author", "House", "Press"] as const;
export const STATUSES_FOR_GRID = ["Todo", "Working", "Due", "Completed"] as const;

export type Stage = typeof STAGE_ORDER[number];
export type Status = typeof STATUSES_FOR_GRID[number];