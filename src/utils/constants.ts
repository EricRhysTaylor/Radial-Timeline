/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
// Minimal local constants the renderer relies on
export const NUM_ACTS = 3;

// Grid and legend sizing
// Status colors - references CSS variables
export const STATUS_COLORS = {
    Working: 'var(--rt-color-working, #FF69B4)',
    Todo: 'var(--rt-color-todo, #cccccc)',
    Empty: 'var(--rt-color-empty, #ffffff)',
    Due: 'var(--rt-color-due, #d05e5e)',
    Complete: 'var(--rt-color-complete)',
} as const;

// Scene number info interface used across renderer, view, and main
export interface SceneNumberInfo {
    number: string;
    x: number;
    y: number;
    width: number;
    height: number;
}

// Stage and status orderings
export const STAGE_ORDER = ["Zero", "Author", "House", "Press"] as const;
export const STAGES_FOR_GRID = ["Zero", "Author", "House", "Press"] as const;
export const STATUSES_FOR_GRID = ["Todo", "Working", "Due", "Completed"] as const;

export type Stage = typeof STAGE_ORDER[number];
export type Status = typeof STATUSES_FOR_GRID[number];
