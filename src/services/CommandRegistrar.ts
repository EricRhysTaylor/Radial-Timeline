/*
 * CommandRegistrar
 * Encapsulates all command+ribbon registration.
 */

import { App, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { assembleManuscript } from '../utils/manuscript';
import { openGossamerScoreEntry, runGossamerAiAnalysis } from '../GossamerCommands';
import { createTemplateScene } from '../SceneAnalysisCommands';

export class CommandRegistrar {
    constructor(private plugin: RadialTimelinePlugin, private app: App) { }

    registerAll(): void {
        this.registerRibbon();
        this.registerCommands();
    }

    private registerRibbon(): void {
        this.plugin.addRibbonIcon('shell', 'Radial timeline', () => {
            this.plugin.activateView();
        });
    }

    private registerCommands(): void {
        this.plugin.addCommand({
            id: 'search-timeline',
            name: 'Search timeline',
            callback: () => this.plugin.openSearchPrompt()
        });

        this.plugin.addCommand({
            id: 'clear-timeline-search',
            name: 'Clear search',
            callback: () => this.plugin.clearSearch()
        });

        this.plugin.addCommand({
            id: 'gossamer-enter-scores',
            name: 'Gossamer enter momentum scores',
            callback: async () => {
                try {
                    await openGossamerScoreEntry(this.plugin);
                } catch (e) {
                    new Notice('Failed to open Gossamer score entry.');
                    console.error(e);
                }
            }
        });

        const beatSystemLabel = this.getBeatSystemDisplayName();
        this.plugin.addCommand({
            id: 'gossamer-run-save-the-cat-analysis',
            name: `Gossamer AI evaluation using ${beatSystemLabel} story beats`,
            checkCallback: (checking: boolean) => {
                if (!this.plugin.settings.enableAiSceneAnalysis) return false;
                if (checking) return true;

                (async () => {
                    const currentLabel = this.getBeatSystemDisplayName();
                    try {
                        new Notice(`Gossamer AI evaluation using ${currentLabel} story beats...`);
                        await runGossamerAiAnalysis(this.plugin);
                    } catch (e) {
                        new Notice(`Failed to run ${currentLabel} beat analysis.`);
                        console.error(e);
                    }
                })();
                return true;
            }
        });

        this.plugin.addCommand({
            id: 'gossamer-generate-manuscript',
            name: 'Generate manuscript',
            callback: async () => this.generateManuscript()
        });

        this.plugin.addCommand({
            id: 'create-template-scene',
            name: 'Create template scene note',
            callback: async () => createTemplateScene(this.plugin, this.app.vault)
        });

        this.plugin.addCommand({
            id: 'open-timeline-view',
            name: 'Open',
            callback: () => this.plugin.activateView()
        });
    }

    private getBeatSystemDisplayName(): string {
        const configured = (this.plugin.settings.beatSystem || '').trim();
        if (!configured) return 'Save The Cat';
        return configured;
    }

    private async generateManuscript(): Promise<void> {
        try {
            new Notice('Assembling manuscript...');
            const { getSortedSceneFiles } = await import('../utils/manuscript');
            const { files: sceneFiles, sortOrder } = await getSortedSceneFiles(this.plugin);
            if (sceneFiles.length === 0) {
                new Notice('No scenes found in source path.');
                return;
            }
            const manuscript = await assembleManuscript(sceneFiles, this.app.vault, undefined, true, sortOrder);
            if (!manuscript.text || manuscript.text.trim().length === 0) {
                new Notice('Manuscript is empty. Check that your scene files have content.');
                return;
            }
            const orderLabel = sortOrder?.toLowerCase().startsWith('chrono') ? 'Chronological' : 'Narrative';
            const now = new Date();
            const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            const timeDisplayStr = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
            const timeFileStr = timeDisplayStr.replace(/:/g, '.');
            const manuscriptPath = `AI/Manuscript ${orderLabel} ${dateStr} ${timeFileStr}.md`;
            try {
                await this.app.vault.createFolder('AI');
            } catch { }
            const existing = this.app.vault.getAbstractFileByPath(manuscriptPath);
            if (existing) {
                new Notice(`File ${manuscriptPath} already exists. Try again in a moment.`);
                return;
            }
            const createdFile = await this.app.vault.create(manuscriptPath, manuscript.text);
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(createdFile);
            new Notice(`Manuscript generated: ${manuscript.totalScenes} scenes, ${manuscript.totalWords.toLocaleString()} words. Saved to ${manuscriptPath}`);
        } catch (e) {
            const errorMsg = (e as Error)?.message || 'Unknown error';
            new Notice(`Failed to generate manuscript: ${errorMsg}`);
            console.error(e);
        }
    }

}
