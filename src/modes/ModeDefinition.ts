/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Timeline Mode System
 * 
 * This module defines the core types for the modular mode architecture.
 * Modes are composable feature sets that declare what they need rather than
 * embedding mode-specific logic throughout the codebase.
 */

import type { RadialTimelineView } from '../view/TimeLineView';

/**
 * Available timeline display modes
 */
export enum TimelineMode {
    /** All scenes from all subplots in manuscript order */
    ALL_SCENES = 'all-scenes',
    
    /** Only main plot scenes with publish stage coloring */
    MAIN_PLOT = 'main-plot',
    
    /** Gossamer analysis overlay with beat tracking */
    GOSSAMER = 'gossamer',
    
    /** Chronological story order based on When field */
    CHRONOLOGUE = 'chronologue'
}

/**
 * Outer ring content strategy
 */
export type OuterRingContent = 
    | 'all-scenes'         // All scenes from all subplots in manuscript order
    | 'main-plot-only'     // Only Main Plot subplot scenes
    | 'chronologue';       // Scenes ordered by story chronology based on When field

/**
 * Inner ring content strategy
 */
export type InnerRingContent = 
    | 'subplot-scenes'     // Subplot-specific scenes (default)
    | 'chronologue'        // Chronological ordering based on When field
    | 'hidden';            // Don't show inner rings

/**
 * Plot beat display strategy
 */
export type PlotBeatDisplay = 
    | 'outer-ring-slices'  // Gray slices with labels in outer ring (All Scenes mode)
    | 'none';              // Don't show plot beats (Main Plot mode)

/**
 * Scene coloring strategy
 */
export type SceneColoring = 
    | 'subplot'            // Color by subplot (All Scenes mode)
    | 'publish-stage'      // Color by publish stage (Main Plot mode)
    | 'chronological';     // Color by story time (future)

/**
 * Number square display level
 */
export type NumberSquareDisplay = 
    | 'full'               // Full display with all features
    | 'minimized'          // Smaller, de-emphasized
    | 'hidden';            // Don't show number squares

/**
 * Available overlay layers
 */
export type OverlayLayer = 
    | 'gossamer-dots'      // Gossamer score dots on radial spokes
    | 'gossamer-spokes'    // Spokes connecting dots to center
    | 'gossamer-outlines'  // Beat outline highlights
    | 'confidence-band'    // Min/max confidence band
    | 'chronological-timeline'; // Chronological timeline arc with proportional tick marks

/**
 * Visual muting targets
 */
export type VisualMuting = 
    | 'non-plot'           // Mute all non-plot elements (Gossamer mode)
    | 'non-main-plot'      // Mute all non-main-plot elements (Main Plot mode)
    | 'future-scenes';     // Mute scenes that haven't happened yet in story (future)

/**
 * Hover behavior strategies
 */
export type ModeHoverBehavior = 
    | 'standard-scene-hover'     // Standard scene hover with synopsis
    | 'plot-only-hover'          // Hover only on plot elements
    | 'gossamer-bidirectional'   // Gossamer dots ↔ slices ↔ spokes
    | 'chronological-hover';     // Show story time on hover (future)

/**
 * Click behavior strategies
 */
export type ModeClickBehavior = 
    | 'open-scene-file'          // Standard: open the scene file
    | 'open-plot-file'           // Open plot beat file
    | 'gossamer-open-file'       // Gossamer-specific file opening
    | 'chronologue-shift-mode';  // Chronologue shift mode for elapsed time comparison

/**
 * Exit behavior for modes
 */
export type ModeExitBehavior = 
    | 'click-background'         // Click background to exit (Gossamer)
    | 'toggle-button'            // Use mode toggle button (All Scenes ↔ Main Plot)
    | 'none';                    // No special exit behavior

/**
 * Custom event handlers for mode-specific interactions
 */
export interface ModeEventHandlers {
    onHover?: (event: Event, element: Element) => void;
    onClick?: (event: Event, element: Element) => void;
    onBackgroundClick?: (event: Event) => void;
    // Add more as needed
}

/**
 * Mode rendering configuration
 */
export interface ModeRenderingConfig {
    /** What content to show in the outer ring */
    outerRingContent: OuterRingContent;
    
    /** What content to show in the inner rings */
    innerRingContent: InnerRingContent;
    
    /** How to display plot beats */
    plotBeatDisplay: PlotBeatDisplay;
    
    /** How to color scenes */
    sceneColoring: SceneColoring;
    
    /** How to display number squares */
    numberSquares: NumberSquareDisplay;
    
    /** Overlay layers to render on top of base timeline */
    overlayLayers: OverlayLayer[];
    
    /** Visual muting targets to de-emphasize */
    visualMuting: VisualMuting[];
}

/**
 * Mode interaction configuration
 */
export interface ModeInteractionConfig {
    /** Hover behavior strategy */
    hoverBehavior: ModeHoverBehavior;
    
    /** Click behavior strategy */
    clickBehavior: ModeClickBehavior;
    
    /** Whether to enable Zero Draft Mode integration */
    enableZeroDraftMode: boolean;
    
    /** How the mode can be exited */
    exitBehavior?: ModeExitBehavior;
    
    /** Custom event handlers for this mode */
    customHandlers?: ModeEventHandlers;
}

/**
 * Mode UI configuration
 */
export interface ModeUIConfig {
    /** Icon for this mode (if used in UI) */
    icon?: string;
    
    /** Tooltip text for toggle button */
    tooltip?: string;
    
    /** Whether this mode appears in the toggle button */
    showInToggleButton: boolean;
    
    /** Order for cycling through modes (1-based) */
    order: number;
}

/**
 * Complete mode definition
 */
export interface ModeDefinition {
    /** Unique mode identifier */
    id: TimelineMode;
    
    /** Human-readable mode name */
    name: string;
    
    /** Mode description */
    description: string;
    
    /** Rendering configuration */
    rendering: ModeRenderingConfig;
    
    /** Interaction configuration */
    interactions: ModeInteractionConfig;
    
    /** UI configuration */
    ui: ModeUIConfig;
    
    /** Called when entering this mode */
    onEnter?: (view: RadialTimelineView) => void | Promise<void>;
    
    /** Called when exiting this mode */
    onExit?: (view: RadialTimelineView) => void | Promise<void>;
}

/**
 * Type guard to check if a string is a valid TimelineMode
 */
export function isTimelineMode(value: string): value is TimelineMode {
    return Object.values(TimelineMode).includes(value as TimelineMode);
}


