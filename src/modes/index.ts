/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Mode System Public API
 * 
 * Export all public types, definitions, and utilities for the mode system.
 */

// Core types
export {
    TimelineMode,
    type ModeDefinition,
    type ModeRenderingConfig,
    type ModeInteractionConfig,
    type ModeUIConfig,
    type OuterRingContent,
    type InnerRingContent,
    type BeatDisplay,
    type SceneColoring,
    type NumberSquareDisplay,
    type OverlayLayer,
    type VisualMuting,
    type ModeHoverBehavior,
    type ModeClickBehavior,
    type ModeExitBehavior,
    type ModeEventHandlers,
    isTimelineMode,
} from './ModeDefinition';

// Mode definitions
export { NARRATIVE_MODE } from './definitions/AllScenesMode';
export { PUBLICATION_MODE } from './definitions/MainPlotMode';
export { CHRONOLOGUE_MODE } from './definitions/ChronologueMode';
export { GOSSAMER_MODE } from './definitions/GossamerMode';

// Registry
export {
    getModeDefinition,
    getAllModes,
    getToggleableModes,
    getNextToggleMode,
    isModeRegistered,
} from './ModeRegistry';

// Mode Management
export { ModeManager, createModeManager } from './ModeManager';
export { ModeInteractionController, createInteractionController } from './ModeInteractionController';

