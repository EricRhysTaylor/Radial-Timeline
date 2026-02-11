/**
 * Radial Timeline Plugin for Obsidian — Setting Impact Model
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 *
 * Classifies the visual impact of each settings change to avoid
 * unnecessary full re-renders that cause compositor flicker.
 *
 *   Tier 1 ("none")  — No visible timeline change; just save.
 *   Tier 2 ("selective") — Visual but non-structural; uses the selective DOM-mutation path.
 *   Tier 3 ("full")  — Structural layout change; requires a full SVG rebuild.
 */

import { ChangeType } from '../renderer/ChangeDetection';

// ── Impact descriptor ────────────────────────────────────────────────
export type SettingImpact =
    | { kind: 'none' }
    | { kind: 'selective'; changeTypes: ChangeType[] }
    | { kind: 'full' };

// ── Pre-built constants (avoid allocating on every call) ─────────────

/** Tier 1 — setting has no visible effect on the timeline SVG */
export const IMPACT_NONE: SettingImpact = { kind: 'none' };

/** Tier 3 — setting changes SVG layout and requires a full rebuild */
export const IMPACT_FULL: SettingImpact = { kind: 'full' };

// Tier 2 helpers — selective DOM mutations
export const IMPACT_SETTINGS_VISUAL: SettingImpact = {
    kind: 'selective',
    changeTypes: [ChangeType.SETTINGS],
};

export const IMPACT_GOSSAMER: SettingImpact = {
    kind: 'selective',
    changeTypes: [ChangeType.GOSSAMER],
};

export const IMPACT_DOMINANT_SUBPLOT: SettingImpact = {
    kind: 'selective',
    changeTypes: [ChangeType.DOMINANT_SUBPLOT],
};
