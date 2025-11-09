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
import { Scene } from '../main';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import { parseWhenField } from '../utils/date';
import { normalizeBooleanValue } from '../utils/sceneHelpers';

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
    async getSceneData(options?: GetSceneDataOptions): Promise<Scene[]> {
        const filterBeats = options?.filterBeatsBySystem ?? true;

        // Find markdown files in vault that match the filters
        const files = this.app.vault.getMarkdownFiles().filter((file: TFile) => {
            // If sourcePath is empty, include all files, otherwise only include files in the sourcePath
            if (this.settings.sourcePath) {
                return file.path.startsWith(this.settings.sourcePath);
            }
            return true;
        });

        const scenes: Scene[] = [];
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
                
                if (when && !isNaN(when.getTime())) {
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
                        
                        scenes.push({
                            date: when.toISOString().split('T')[0],
                            when: when,
                            path: file.path,
                            title: metadata.Title as string | undefined ?? file.basename,
                            subplot: subplot,
                            act: String(validActNumber),
                            actNumber: validActNumber,
                            pov: metadata.POV as string | undefined,
                            location: metadata.Place as string | undefined,
                            Character: Array.isArray(metadata.Character) ? metadata.Character as string[] : (metadata.Character ? [metadata.Character as string] : undefined),
                            synopsis: metadata.Synopsis as string | undefined,
                            status: metadata.Status as string | string[] | undefined,
                            "Publish Stage": metadata["Publish Stage"] as string | undefined,
                            due: metadata.Due as string | undefined,
                            pendingEdits: metadata["Pending Edits"] as string | undefined,
                            Duration: duration,
                            Book: metadata.Book as string | undefined,
                            "previousSceneAnalysis": metadata["previousSceneAnalysis"] as string | undefined,
                            "currentSceneAnalysis": metadata["currentSceneAnalysis"] as string | undefined,
                            "nextSceneAnalysis": metadata["nextSceneAnalysis"] as string | undefined,
                            itemType: "Scene",
                            "Beats Update": normalizeBooleanValue(beatsUpdate)
                        });
                    }
                }
                } else if (metadata && (metadata.Class === "Plot" || metadata.Class === "Beat")) {
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
        const scenesByDate = new Map<string, Scene[]>();
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
        for (const { file, metadata, validActNumber } of plotsToProcess) {
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
            
            if (when && !isNaN(when.getTime())) {
                const dateKey = when.toISOString().split('T')[0];
                const scenesOnDate = scenesByDate.get(dateKey) || [];
                
                // Determine subplots for the plot/beat
                let targetSubplots: string[] = ["Main Plot"];
                
                if (scenesOnDate.length > 0) {
                    // Use subplots from scenes on this date
                    const uniqueSubplots = new Set<string>();
                    scenesOnDate.forEach(s => {
                        if (s.subplot) uniqueSubplots.add(s.subplot);
                    });
                    if (uniqueSubplots.size > 0) {
                        targetSubplots = Array.from(uniqueSubplots);
                    }
                } else if (metadata.Subplot) {
                    // Use subplot from metadata
                    targetSubplots = Array.isArray(metadata.Subplot)
                        ? metadata.Subplot
                        : [metadata.Subplot];
                }
                
                // Get beat system from metadata or plugin settings
                const beatModel = (metadata["Beat Model"] || this.settings.beatSystem || "") as string;
                
                // Filter by beat system if requested
                if (filterBeats && this.settings.beatSystem) {
                    if (!beatModel || beatModel.toLowerCase() !== this.settings.beatSystem.toLowerCase()) {
                        continue; // Skip beats from other systems
                    }
                }
                
                // Create a beat for each target subplot
                for (const subplot of targetSubplots) {
                    filteredScenes.push({
                        date: dateKey,
                        when: when,
                        path: file.path,
                        title: metadata.Title as string | undefined ?? file.basename,
                        subplot: subplot,
                        act: String(validActNumber),
                        actNumber: validActNumber,
                        synopsis: metadata.Synopsis as string | undefined,
                        Description: metadata.Description as string | undefined,
                        "Beat Model": beatModel,
                        Range: metadata.Range as string | undefined,
                        "Suggest Placement": metadata["Suggest Placement"] as string | undefined,
                        itemType: "Beat"
                    });
                }
            }
        }
        
        return filteredScenes;
    }
    
    /**
     * Apply dominant subplot preferences from settings
     */
    private applyDominantSubplotPreferences(scenes: Scene[]): void {
        if (!this.settings.dominantSubplots) return;
        
        // Group scenes by path
        const scenesByPath = new Map<string, Scene[]>();
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
     * Filter scenes to show only one representation per file
     * (the dominant subplot if set, otherwise all subplots)
     */
    private filterScenesByDominantSubplot(scenes: Scene[]): Scene[] {
        const scenesByPath = new Map<string, Scene[]>();
        
        // Group by path
        scenes.forEach(scene => {
            if (!scene.path) return;
            if (!scenesByPath.has(scene.path)) {
                scenesByPath.set(scene.path, []);
            }
            scenesByPath.get(scene.path)!.push(scene);
        });
        
        const result: Scene[] = [];
        
        scenesByPath.forEach((scenesForPath, path) => {
            if (scenesForPath.length === 1) {
                // Only one subplot - include it
                result.push(scenesForPath[0]);
            } else {
                // Multiple subplots - check for dominant
                const dominant = scenesForPath.find(s => (s as any)._isDominantSubplot);
                if (dominant) {
                    result.push(dominant);
                } else {
                    // No dominant set - include all
                    result.push(...scenesForPath);
                }
            }
        });
        
        return result;
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

