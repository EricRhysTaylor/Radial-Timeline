/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Base Rendering Types
 * 
 * Shared types and interfaces used across all rendering modules.
 */

import type { Scene } from '../../main';

/**
 * Ring geometry information
 */
export interface RingGeometry {
    /** Inner radius of the ring */
    innerRadius: number;
    
    /** Outer radius of the ring */
    outerRadius: number;
    
    /** Ring index (0 = outermost) */
    ringIndex: number;
    
    /** Whether this is the outermost ring */
    isOuterRing: boolean;
}

/**
 * Act geometry information
 */
export interface ActGeometry {
    /** Act index (0-based) */
    actIndex: number;
    
    /** Start angle in radians */
    startAngle: number;
    
    /** End angle in radians */
    endAngle: number;
}

/**
 * Scene position information
 */
export interface ScenePosition {
    /** Scene data */
    scene: Scene;
    
    /** Index within the ring/act cell */
    index: number;
    
    /** Start angle in radians */
    startAngle: number;
    
    /** End angle in radians */
    endAngle: number;
    
    /** Angular size in radians */
    angularSize: number;
}

/**
 * Rendering context - all the information needed to render scenes
 */
export interface RenderingContext {
    /** All scenes to render */
    scenes: Scene[];
    
    /** Ring geometry */
    ring: RingGeometry;
    
    /** Act geometry */
    act: ActGeometry;
    
    /** Subplot name (if applicable) */
    subplot?: string;
    
    /** Master subplot order */
    masterSubplotOrder: string[];
    
    /** Total number of rings */
    numRings: number;
    
    /** Plugin facade for accessing settings and utilities */
    plugin: PluginFacade;
}

/**
 * Plugin facade - minimal interface needed by renderers
 */
export interface PluginFacade {
    settings: {
        currentMode?: string;
        publishStageColors: Record<string, string>;
        enableAiBeats?: boolean;
    };
    openScenePaths: Set<string>;
    darkenColor: (color: string, amount: number) => string;
    lightenColor: (color: string, amount: number) => string;
    lastSceneData?: Scene[];
}

/**
 * Rendering result from a module
 */
export interface RenderingResult {
    /** SVG string to append */
    svg: string;
    
    /** Optional metadata about what was rendered */
    metadata?: {
        sceneCount?: number;
        plotBeatCount?: number;
        hasVoidCells?: boolean;
    };
}

/**
 * Scene grouping by act and subplot
 */
export type ScenesByActAndSubplot = Record<number, Record<string, Scene[]>>;

/**
 * Plot notes grouped by subplot
 */
export type PlotsBySubplot = Map<string, Scene[]>;

