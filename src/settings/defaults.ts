/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type { RadialTimelineSettings } from '../types';
import { DEFAULT_GEMINI_MODEL_ID } from '../constants/aiDefaults';

export const DEFAULT_SETTINGS: RadialTimelineSettings = {
    sourcePath: '',
    showSourcePathAsTitle: true, // Default: show source path as title of the work
    validFolderPaths: [], // Default empty array for folder path history
    publishStageColors: {
        Zero: '#9E70CF',   // Purple (Stage Zero)
        Author: '#5E85CF', // Blue   (Author)
        House: '#DA7847',  // Orange (House)
        Press: '#6FB971'   // Green  (Press)
    },
    subplotColors: [
        '#EFBDEB', // 0
        '#a35ca7', // 1
        '#6461A0', // 2
        '#314CB6', // 3
        '#0A81D1', // 4
        '#98CE00', // 5
        '#16E0BD', // 6
        '#78C3FB', // 7
        '#273C2C', // 8
        '#A6D8D4', // 9
        '#FF8600', // 10
        '#F9E784', // 11
        '#CEC3C1', // 12
        '#F3D34A', // 13
        '#004777', // 14
        '#8B4513'  // 15 - Brown for Ring 16
    ],
    currentMode: 'narrative', // Default to Narrative mode
    logApiInteractions: true, // Default for new setting
    targetCompletionDate: undefined, // Ensure it's undefined by default
    showCompletionEstimate: true, // Default: show the estimate tick
    openaiApiKey: '', // Default to empty string
    anthropicApiKey: '', // Default empty string
    anthropicModelId: 'claude-sonnet-4-5-20250929', // Default to Sonnet 4.5 (20250929)
    geminiApiKey: '',
    geminiModelId: DEFAULT_GEMINI_MODEL_ID, // Default to Gemini 3 Pro Preview
    defaultAiProvider: 'openai',
    openaiModelId: 'gpt-5.1-chat-latest', // Default to GPT-5.1
    enableAiSceneAnalysis: true,
    showFullTripletAnalysis: true,
    enableZeroDraftMode: false,
    metadataRefreshDebounceMs: 10000,
    discontinuityThreshold: undefined, // Default to auto-calculated (3x median gap or 30 days)
    enableSceneTitleAutoExpand: true, // Default: enabled to maintain current behavior
    enableHoverDebugLogging: false,
    sortByWhenDate: false, // Default: manuscript order (backward compatible)
    chronologueDurationCapSelection: 'auto',
    readabilityScale: 'normal',
    aiContextTemplates: [
        {
            id: "commercial_genre",
            name: "Commercial Genre Fiction (Balanced Depth)",
            prompt: `Act as a developmental editor for a commercial genre novel. Prioritize pacing, clarity, and emotional stakes. Ensure each scene moves the plot or deepens character conflict. Keep prose lean; prefer tension and subtext to exposition. Focus feedback on momentum, scene purpose, and reader engagement.`,
            isBuiltIn: true
        },
        {
            id: "literary",
            name: "Literary / Character-Driven Fiction",
            prompt: `Act as a developmental editor for a literary or character-driven novel. Emphasize emotional resonance, internal conflict, and subtext. Feedback should focus on authenticity of character motivation, narrative voice, and thematic depth. Avoid line-level polish; focus on the psychological realism of each beat.`,
            isBuiltIn: true
        },
        {
            id: "young_adult",
            name: "Young Adult / Coming-of-Age",
            prompt: `Act as a developmental editor for a young adult coming-of-age novel. Focus on pacing, clear emotional arcs, and voice consistency. Ensure stakes feel personal and immediate. Highlight areas where dialogue or internal monologue can better show growth or vulnerability. Keep feedback concise and energetic.`,
            isBuiltIn: true
        },
        {
            id: "science_fiction",
            name: "Epic or Hard Science Fiction / World-Building Focus",
            prompt: `Act as a developmental editor for a science-fiction novel with complex world-building. Balance clarity and immersion; ensure exposition is dramatized through character action or dialogue. Focus feedback on world logic, pacing through discovery, and integrating big ideas without slowing emotional momentum. Prioritize cohesion between technology, society, and theme.`,
            isBuiltIn: true
        },
        {
            id: "thriller",
            name: "Mystery / Thriller / Suspense",
            prompt: `Act as a developmental editor for a mystery or thriller novel. Emphasize pacing, tension, and clarity of motive. Identify where reveals or reversals land too early or too late. Ensure reader curiosity and suspense are sustained through every scene. Keep feedback focused on plot mechanics and emotional rhythm.`,
            isBuiltIn: true
        },
        {
            id: "romance",
            name: "Romance / Emotional-Arc Focused Fiction",
            prompt: `Act as a developmental editor for a romance or emotionally driven narrative. Focus feedback on relationship dynamics, emotional authenticity, and pacing of attraction/conflict/resolution. Ensure internal and external conflicts are intertwined. Highlight where subtext or tension could replace exposition.`,
            isBuiltIn: true
        }
    ],
    activeAiContextTemplateId: 'commercial_genre',
    beatSystem: 'Save The Cat', // Default beat system
    dominantSubplots: {}, // Default: empty map, will use outermost subplot for scenes in multiple subplots
    globalPovMode: 'off',
    lastSeenReleaseNotesVersion: '',
    cachedReleaseNotes: null,
    releaseNotesLastFetched: undefined,
    localBaseUrl: 'http://localhost:11434/v1',
    localModelId: 'llama3',
    localApiKey: '',
    enablePlanetaryTime: false,
    planetaryProfiles: [],
    activePlanetaryProfileId: undefined,
    frontmatterMappings: {},
    enableCustomMetadataMapping: false
};
