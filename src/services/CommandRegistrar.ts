/*
 * CommandRegistrar
 * Encapsulates all command+ribbon registration.
 */

import { App, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { assembleManuscript, getSceneFilesByOrder, sliceScenesByRange } from '../utils/manuscript';
import { openGossamerScoreEntry, runGossamerAiAnalysis } from '../GossamerCommands';
import { createTemplateScene } from '../SceneAnalysisCommands';
import { ManageSubplotsModal } from '../modals/ManageSubplotsModal';
import { ManuscriptOptionsModal, ManuscriptModalResult } from '../modals/ManuscriptOptionsModal';
import { PlanetaryTimeModal } from '../modals/PlanetaryTimeModal';
import { BookDesignerModal } from '../modals/BookDesignerModal';

export class CommandRegistrar {
    constructor(private plugin: RadialTimelinePlugin, private app: App) { }

    registerAll(): void {
        this.registerRibbon();
        this.registerCommands();
    }

    private registerRibbon(): void {
        this.plugin.addRibbonIcon('shell', 'Radial timeline', () => {
            this.plugin.getTimelineService().activateView();
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
            id: 'manage-subplots',
            name: 'Manage subplots',
            callback: () => {
                new ManageSubplotsModal(this.app, this.plugin).open();
            }
        });

        this.plugin.addCommand({
            id: 'open-book-designer',
            name: 'Open book designer',
            callback: () => {
                new BookDesignerModal(this.app, this.plugin).open();
            }
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
            callback: () => this.plugin.getTimelineService().activateView()
        });

        this.plugin.addCommand({
            id: 'open-planetary-time-converter',
            name: 'Planetary time converter',
            checkCallback: (checking) => {
                if (!this.plugin.settings.enablePlanetaryTime) return false;
                if (!this.plugin.settings.planetaryProfiles || this.plugin.settings.planetaryProfiles.length === 0) {
                    if (!checking) {
                        new Notice('Add a planetary profile in Settings first.');
                    }
                    return false;
                }
                if (checking) return true;
                new PlanetaryTimeModal(this.app, this.plugin).open();
                return true;
            }
        });
    }

    private getBeatSystemDisplayName(): string {
        const configured = (this.plugin.settings.beatSystem || '').trim();
        if (!configured) return 'Save The Cat';
        return configured;
    }

    private async generateManuscript(): Promise<void> {
        const modal = new ManuscriptOptionsModal(this.app, this.plugin, async (result) => {
            await this.handleManuscriptSubmission(result);
        });
        modal.open();
    }

    private async handleManuscriptSubmission(options: ManuscriptModalResult): Promise<void> {
        try {
            new Notice('Assembling manuscript...');
            const { files, sortOrder } = await getSceneFilesByOrder(this.plugin, options.order, options.subplot);
            if (files.length === 0) {
                new Notice('No scenes found in source path.');
                return;
            }

            // Apply range to all ordering modes
            const orderedFiles = sliceScenesByRange(files, options.rangeStart, options.rangeEnd);

            if (orderedFiles.length === 0) {
                new Notice('Selected range is empty.');
                return;
            }

            const hasCustomRange = options.rangeStart && options.rangeEnd &&
                !(options.rangeStart === 1 && options.rangeEnd === files.length);
            const rangeSuffix = hasCustomRange
                ? ` · Scenes ${options.rangeStart}-${options.rangeEnd}`
                : '';
            
            const subplotSuffix = options.subplot ? ` · ${options.subplot}` : '';
            const sortLabelWithRange = `${sortOrder}${subplotSuffix}${rangeSuffix}`;

            const includeToc = options.tocMode !== 'none';
            const useMarkdownToc = options.tocMode === 'markdown';

            const manuscript = await assembleManuscript(
                orderedFiles,
                this.app.vault,
                undefined,
                useMarkdownToc,
                sortLabelWithRange,
                includeToc
            );

            if (!manuscript.text || manuscript.text.trim().length === 0) {
                new Notice('Manuscript is empty. Check that your scene files have content.');
                return;
            }

            let orderLabel: string;
            switch (options.order) {
                case 'chronological':
                    orderLabel = 'Chronological';
                    break;
                case 'reverse-chronological':
                    orderLabel = 'Reverse Chronological';
                    break;
                case 'reverse-narrative':
                    orderLabel = 'Reverse Narrative';
                    break;
                default:
                    orderLabel = 'Narrative';
            }

            const now = new Date();
            const dateStr = now.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
            const timeDisplayStr = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
            const timeFileStr = timeDisplayStr.replace(/:/g, '.');
            
            const fileSubplotLabel = options.subplot ? ` (${options.subplot})` : '';
            const manuscriptPath = `AI/Manuscript ${orderLabel}${fileSubplotLabel} ${dateStr} ${timeFileStr}.md`;
            try {
                await this.app.vault.createFolder('AI');
            } catch { }
            const existing = this.app.vault.getAbstractFileByPath(manuscriptPath);
            if (existing) {
                new Notice('Warning: Duplicate title. Please wait 1 minute then try again.');
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
