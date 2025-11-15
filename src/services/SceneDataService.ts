/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Scene Data Service
 * 
 * Handles loading, filtering, and processing scene data from vault files.
 * Extracted from the massive getSceneData() method in main.ts (643 lines).
 */

import { App, TFile } from 'obsidian';
import type { TimelineItem } from '../types';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import { parseWhenField } from '../utils/date';
import { normalizeBooleanValue, isStoryBeat } from '../utils/sceneHelpers';
import { stripWikiLinks } from '../utils/text';
import { filterBeatsBySystem } from '../utils/gossamer';

export interface GetSceneDataOptions {
    filterBeatsBySystem?: boolean;
}

export interface RadialTimelineSettings {
    sourcePath: string;
    beatSystem?: string;
    dominantSubplots?: Record<string, string>;
}

export class SceneDataService {
    private app: App;
    private settings: RadialTimelineSettings;
    
    constructor(app: App, settings: RadialTimelineSettings) {
        this.app = app;
        this.settings = settings;
    }
    
    /**
     * Update settings (called when settings change)
     */
    updateSettings(settings: RadialTimelineSettings): void {
        this.settings = settings;
    }
    
    /**
     * Get all scene data from the vault
     */
    async getSceneData(options?: GetSceneDataOptions): Promise<TimelineItem[]> {
        const filterBeats = options?.filterBeatsBySystem ?? true;

        // Find markdown files in vault that match the filters
        const files = this.app.vault.getMarkdownFiles().filter((file: TFile) => {
            // If sourcePath is empty, include all files, otherwise only include files in the sourcePath
            if (this.settings.sourcePath) {
                return file.path.startsWith(this.settings.sourcePath);
            }
            return true;
        });

        const scenes: TimelineItem[] = [];
        const plotsToProcess: Array<{file: TFile, metadata: Record<string, unknown>, validActNumber: number}> = [];
    
        for (const file of files) {
            try {
            const rawMetadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
                const metadata = rawMetadata ? normalizeFrontmatterKeys(rawMetadata) : undefined;
                
                if (metadata && metadata.Class === "Scene") {
                    // Parse the When field using the centralized parser (single source of truth)
                    const whenStr = metadata.When;
                    let when: Date | undefined;
                    if (typeof whenStr === 'string') {
                        const parsed = parseWhenField(whenStr);
                        if (parsed) {
                            when = parsed;
                        }
                    } else if (whenStr instanceof Date) {
                        // Already a Date object
                        when = whenStr;
                    }

                    const hasValidWhen = when instanceof Date && !isNaN(when.getTime());
                    const normalizedWhen = hasValidWhen ? when : undefined;
                    const missingWhen = !hasValidWhen;
                    const isoDate = hasValidWhen && normalizedWhen
                        ? normalizedWhen.toISOString().split('T')[0]
                        : '';

                    // Split subplots if provided, otherwise default to "Main Plot"
                    const subplots = metadata.Subplot
                        ? Array.isArray(metadata.Subplot) 
                            ? metadata.Subplot 
                            : [metadata.Subplot]
                        : ["Main Plot"];
                    
                    // Read actNumber from metadata, default to 1 if missing or empty
                    const actValue = metadata.Act;
                    const actNumber = (actValue !== undefined && actValue !== null && actValue !== '') ? Number(actValue) : 1;
    
                    // Ensure actNumber is a valid number between 1 and 3
                    const validActNumber = (actNumber >= 1 && actNumber <= 3) ? actNumber : 1;
    
                    // Create a scene for each subplot
                    for (const subplot of subplots) {
                        const durationValue = metadata.Duration;
                        const duration = (durationValue !== undefined && durationValue !== null) 
                            ? String(durationValue) 
                            : undefined;
                        
                        const beatsUpdate = metadata["Beats Update"];
                        
                        // Parse Character field and strip Obsidian wiki links [[...]]
                        const rawCharacter = metadata.Character;
                        const characterList = Array.isArray(rawCharacter) 
                            ? (rawCharacter as string[]).map(c => stripWikiLinks(c))
                            : (rawCharacter ? [stripWikiLinks(rawCharacter as string)] : undefined);
                        
                        scenes.push({
                            date: isoDate,
                            when: normalizedWhen,
                            missingWhen,
                            path: file.path,
                            title: metadata.Title as string | undefined ?? file.basename,
                            subplot: subplot,
                            act: String(validActNumber),
                            actNumber: validActNumber,
                            pov: metadata.POV as string | undefined,
                            location: metadata.Place as string | undefined,
                            Character: characterList,
                            synopsis: metadata.Synopsis as string | undefined,
                            status: metadata.Status as string | string[] | undefined,
                            "Publish Stage": metadata["Publish Stage"] as string | undefined,
                            due: metadata.Due as string | undefined,
                            pendingEdits: metadata["Pending Edits"] as string | undefined,
                            Duration: duration,
                            Book: metadata.Book as string | undefined,
                            // AI Scene Analysis fields - handle both string and array formats from YAML
                            "previousSceneAnalysis": Array.isArray(metadata["previousSceneAnalysis"]) 
                                ? (metadata["previousSceneAnalysis"] as string[]).join('\n')
                                : metadata["previousSceneAnalysis"] as string | undefined,
                            "currentSceneAnalysis": Array.isArray(metadata["currentSceneAnalysis"]) 
                                ? (metadata["currentSceneAnalysis"] as string[]).join('\n')
                                : metadata["currentSceneAnalysis"] as string | undefined,
                            "nextSceneAnalysis": Array.isArray(metadata["nextSceneAnalysis"]) 
                                ? (metadata["nextSceneAnalysis"] as string[]).join('\n')
                                : metadata["nextSceneAnalysis"] as string | undefined,
                            itemType: "Scene",
                            "Beats Update": normalizeBooleanValue(beatsUpdate)
                        });
                    }
                } else if (metadata && isStoryBeat(metadata.Class)) {
                    // Defer processing of Plot/Beat items until after all scenes are collected
                    const actValue = metadata.Act;
                    const actNumber = (actValue !== undefined && actValue !== null && actValue !== '') ? Number(actValue) : 1;
                    const validActNumber = (actNumber >= 1 && actNumber <= 3) ? actNumber : 1;
                    plotsToProcess.push({ file, metadata, validActNumber });
                }
            } catch (error) {
                console.error(`Error processing file ${file.path}:`, error);
            }
        }
        
        // Apply dominant subplot preferences before processing beats
        this.applyDominantSubplotPreferences(scenes);
        
        // Filter scenes to show only dominant subplot representation
        const filteredScenes = this.filterScenesByDominantSubplot(scenes);
        
        // Build a map: date -> scenes (only unique file paths)
        const scenesByDate = new Map<string, TimelineItem[]>();
        const processedPaths = new Set<string>();
        
        for (const scene of filteredScenes) {
            const dateKey = scene.date;
            
            // Skip if we've already processed this path for this date
            const pathDateKey = `${scene.path}-${dateKey}`;
            if (processedPaths.has(pathDateKey)) {
                continue;
            }
            processedPaths.add(pathDateKey);
            
            if (!scenesByDate.has(dateKey)) {
                scenesByDate.set(dateKey, []);
            }
            scenesByDate.get(dateKey)!.push(scene);
        }
        
        // Process plot/beat items
        // Filter by Beat Model if requested (use centralized helper - single source of truth)
        let beatsToProcess = plotsToProcess;
        if (filterBeats && this.settings.beatSystem) {
            // Map to objects with "Beat Model" field for filtering
            const beatsWithModel = beatsToProcess.map(p => ({
                original: p,
                "Beat Model": p.metadata["Beat Model"]
            }));
            const filtered = filterBeatsBySystem(beatsWithModel, this.settings.beatSystem);
            beatsToProcess = filtered.map(f => f.original);
        }
        
        for (const { file, metadata, validActNumber } of beatsToProcess) {
            const whenStr = metadata.When;
            let when: Date | undefined;
            
            if (typeof whenStr === 'string') {
                const parsed = parseWhenField(whenStr);
                if (parsed) {
                    when = parsed;
                }
            } else if (whenStr instanceof Date) {
                when = whenStr;
            }
            
            // For beats, When is optional - use manuscript order if not provided
            // Determine date key: if When exists, use it; otherwise use a placeholder for manuscript ordering
            const dateKey = when && !isNaN(when.getTime()) 
                ? when.toISOString().split('T')[0]
                : ''; // Empty string for beats without When (will be ordered by act/filename)
            
            // Get beat system from metadata or plugin settings
            const beatModel = (metadata["Beat Model"] || this.settings.beatSystem || "") as string;
            
            // Beats appear only once in the outermost ring - not duplicated per subplot
            filteredScenes.push({
                date: dateKey,
                when: when,
                path: file.path,
                title: metadata.Title as string | undefined ?? file.basename,
                subplot: "Main Plot", // Beats always use Main Plot for outermost ring
                act: String(validActNumber),
                actNumber: validActNumber,
                synopsis: metadata.Synopsis as string | undefined,
                Description: metadata.Description as string | undefined,
                "Beat Model": beatModel,
                Range: metadata.Range as string | undefined,
                "Suggest Placement": metadata["Suggest Placement"] as string | undefined,
                itemType: "Beat", // Modern standard - renderer should use isBeatNote() helper
                // Include all Gossamer score fields (Gossamer1-30)
                Gossamer1: metadata.Gossamer1 as number | undefined,
                Gossamer2: metadata.Gossamer2 as number | undefined,
                Gossamer3: metadata.Gossamer3 as number | undefined,
                Gossamer4: metadata.Gossamer4 as number | undefined,
                Gossamer5: metadata.Gossamer5 as number | undefined,
                "Publish Stage": metadata["Publish Stage"] as string | undefined
            });
        }
        
        return filteredScenes;
    }
    
    /**
     * Apply dominant subplot preferences from settings
     */
    private applyDominantSubplotPreferences(scenes: TimelineItem[]): void {
        if (!this.settings.dominantSubplots) return;
        
        // Group scenes by path
        const scenesByPath = new Map<string, TimelineItem[]>();
        scenes.forEach(scene => {
            if (!scene.path) return;
            if (!scenesByPath.has(scene.path)) {
                scenesByPath.set(scene.path, []);
            }
            scenesByPath.get(scene.path)!.push(scene);
        });
        
        // For each path with a stored preference, mark the preferred subplot
        Object.entries(this.settings.dominantSubplots).forEach(([path, dominantSubplot]) => {
            const scenesForPath = scenesByPath.get(path);
            if (!scenesForPath || scenesForPath.length <= 1) return;
            
            // Mark scenes matching the dominant subplot
            scenesForPath.forEach(scene => {
                // Store the preference on the scene for later filtering
                (scene as any)._isDominantSubplot = scene.subplot === dominantSubplot;
            });
        });
    }
    
    /**
     * Keep all scenes but mark the dominant subplot for visual coloring
     * (this does NOT filter - all subplot versions are kept for rendering in their respective rings)
     */
    private filterScenesByDominantSubplot(scenes: TimelineItem[]): TimelineItem[] {
        // Don't filter - just return all scenes
        // The _isDominantSubplot flag is already set by applyDominantSubplotPreferences
        // and will be used by the renderer for coloring purposes in narrative/chronologue modes
        return scenes;
    }
    
    /**
     * Check if a file path is a scene file
     */
    isSceneFile(filePath: string): boolean {
        // This method was originally in the plugin
        // It needs to check the file's metadata
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) return false;
        
        const metadata = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!metadata) return false;
        
        return metadata.Class === "Scene";
    }
}
