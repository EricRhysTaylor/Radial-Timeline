/*
 * CommandRegistrar
 * Encapsulates all command+ribbon registration.
 */

import { App, Notice } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { assembleManuscript, getSceneFilesByOrder, sliceScenesByRange } from '../utils/manuscript';
import { openGossamerScoreEntry, runGossamerAiAnalysis } from '../GossamerCommands';
import { ManageSubplotsModal } from '../modals/ManageSubplotsModal';
import { ManuscriptOptionsModal, ManuscriptModalResult } from '../modals/ManuscriptOptionsModal';
import { PlanetaryTimeModal } from '../modals/PlanetaryTimeModal';
import { BookDesignerModal } from '../modals/BookDesignerModal';
import { generateSceneContent } from '../utils/sceneGenerator';
import { sanitizeSourcePath, buildInitialSceneFilename } from '../utils/sceneCreation';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { ensureAiOutputFolder } from '../utils/aiOutput';

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
            id: 'create-scene-note',
            name: 'Create basic scene note',
            callback: () => {
                void this.createSceneTemplateNote();
            }
        });

        this.plugin.addCommand({
            id: 'create-advanced-scene-note',
            name: 'Create advanced scene note',
            callback: () => {
                void this.createAdvancedSceneTemplateNote();
            }
        });

        this.plugin.addCommand({
            id: 'create-backdrop-note',
            name: 'Create backdrop note',
            callback: () => {
                void this.createBackdropTemplateNote();
            }
        });

        this.plugin.addCommand({
            id: 'book-designer',
            name: 'Book designer',
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

    private async createSceneTemplateNote(): Promise<void> {
        try {
            const vault = this.app.vault;
            const sourcePath = sanitizeSourcePath(this.plugin.settings.sourcePath);

            if (sourcePath && !vault.getAbstractFileByPath(sourcePath)) {
                await vault.createFolder(sourcePath);
            }

            const template = ensureClassScene(
                (this.plugin.settings.sceneYamlTemplates?.base
                    ?? DEFAULT_SETTINGS.sceneYamlTemplates?.base
                    ?? '').trim()
            );

            if (!template) {
                new Notice('Basic scene template not found. Set a scene template in Settings.');
                return;
            }

            const today = new Date().toISOString().slice(0, 10);
            const content = generateSceneContent(template, {
                act: 1,
                when: today,
                sceneNumber: 1,
                subplots: ['Main Plot'],
                character: 'Hero',
                place: 'Unknown',
                characterList: ['Hero'],
                placeList: ['Unknown']
            });

            const fileBody = `---\n${content}\n---\n\nWrite your scene here...`;
            const initialPath = buildInitialSceneFilename(sourcePath, '1 Template Scene.md');
            const filePath = this.getAvailableFilePath(initialPath);

            const createdFile = await vault.create(filePath, fileBody);
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(createdFile);
            new Notice(`Template scene created at ${filePath}`);
        } catch (error) {
            console.error('[CreateSceneTemplateNote] Failed to create template scene note:', error);
            new Notice('Failed to create template scene note.');
        }
    }

    private async createAdvancedSceneTemplateNote(): Promise<void> {
        try {
            const vault = this.app.vault;
            const sourcePath = sanitizeSourcePath(this.plugin.settings.sourcePath);

            if (sourcePath && !vault.getAbstractFileByPath(sourcePath)) {
                await vault.createFolder(sourcePath);
            }

            const template = ensureClassScene(
                (this.plugin.settings.sceneYamlTemplates?.advanced
                    ?? DEFAULT_SETTINGS.sceneYamlTemplates?.advanced
                    ?? '').trim()
            );

            if (!template) {
                new Notice('Advanced scene template not found. Enable or configure it in Settings.');
                return;
            }

            const today = new Date().toISOString().slice(0, 10);
            const content = generateSceneContent(template, {
                act: 1,
                when: today,
                sceneNumber: 1,
                subplots: ['Main Plot'],
                character: 'Hero',
                place: 'Unknown',
                characterList: ['Hero'],
                placeList: ['Unknown']
            });

            const fileBody = `---\n${content}\n---\n\nWrite your scene here...`;
            const initialPath = buildInitialSceneFilename(sourcePath, '1 Template Scene (Advanced).md');
            const filePath = this.getAvailableFilePath(initialPath);

            const createdFile = await vault.create(filePath, fileBody);
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(createdFile);
            new Notice(`Advanced template scene created at ${filePath}`);
        } catch (error) {
            console.error('[CreateAdvancedSceneTemplateNote] Failed to create advanced template scene note:', error);
            new Notice('Failed to create advanced template scene note.');
        }
    }

    private async createBackdropTemplateNote(): Promise<void> {
        try {
            const vault = this.app.vault;
            const sourcePath = sanitizeSourcePath(this.plugin.settings.sourcePath);

            if (sourcePath && !vault.getAbstractFileByPath(sourcePath)) {
                await vault.createFolder(sourcePath);
            }

            const template = (this.plugin.settings.backdropYamlTemplate
                ?? DEFAULT_SETTINGS.backdropYamlTemplate
                ?? '').trim();

            if (!template) {
                new Notice('Backdrop template not found. Add one in Settings.');
                return;
            }

            const start = new Date();
            start.setHours(0, 0, 0, 0);
            const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
            const filledTemplate = template
                .replace(/{{When}}/g, this.formatDateTime(start))
                .replace(/{{End}}/g, this.formatDateTime(end));

            const fileBody = `---\n${filledTemplate}\n---\n\nDescribe how this backdrop shapes your scenes.`;
            const filePath = this.getAvailableFilePath(`${sourcePath ? `${sourcePath}/` : ''}Backdrop Template.md`);

            const createdFile = await vault.create(filePath, fileBody);
            const leaf = this.app.workspace.getLeaf('tab');
            await leaf.openFile(createdFile);
            new Notice(`Backdrop template created at ${filePath}`);
        } catch (error) {
            console.error('[CreateBackdropTemplateNote] Failed to create backdrop template note:', error);
            new Notice('Failed to create backdrop template note.');
        }
    }

    private getAvailableFilePath(initialPath: string): string {
        const vault = this.app.vault;
        if (!vault.getAbstractFileByPath(initialPath)) return initialPath;

        const dotIndex = initialPath.lastIndexOf('.');
        const base = dotIndex >= 0 ? initialPath.slice(0, dotIndex) : initialPath;
        const ext = dotIndex >= 0 ? initialPath.slice(dotIndex) : '';

        let counter = 2;
        let candidate = `${base} (${counter})${ext}`;
        while (vault.getAbstractFileByPath(candidate)) {
            counter += 1;
            candidate = `${base} (${counter})${ext}`;
        }
        return candidate;
    }

    private formatDateTime(date: Date): string {
        const pad = (n: number) => n.toString().padStart(2, '0');
        const year = date.getFullYear();
        const month = pad(date.getMonth() + 1);
        const day = pad(date.getDate());
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        // Use ISO-like separator with seconds so Obsidian treats it as datetime
        return `${year}-${month}-${day}T${hours}:${minutes}:00`;
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
            const aiFolderPath = await ensureAiOutputFolder(this.plugin);
            const manuscriptPath = `${aiFolderPath}/Manuscript ${orderLabel}${fileSubplotLabel} ${dateStr} ${timeFileStr}.md`;
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

function ensureClassScene(template: string): string {
    const lines = template.split('\n');
    const classIdx = lines.findIndex(l => /^\s*Class\s*:/i.test(l));
    if (classIdx >= 0) {
        if (!/^\s*Class\s*:\s*Scene\b/i.test(lines[classIdx])) {
            lines[classIdx] = 'Class: Scene';
        }
        return lines.join('\n');
    }
    return ['Class: Scene', ...lines].join('\n');
}
