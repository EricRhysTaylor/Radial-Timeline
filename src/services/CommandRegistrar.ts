/*
 * CommandRegistrar
 * Encapsulates all command+ribbon registration.
 */

import { App, Notice, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import { assembleManuscript, getSceneFilesByOrder, sliceScenesByRange, ManuscriptSceneSelection, updateSceneWordCounts } from '../utils/manuscript';
import { openGossamerScoreEntry, runGossamerAiAnalysis } from '../GossamerCommands';
import { ManageSubplotsModal } from '../modals/ManageSubplotsModal';
import { ManuscriptOptionsModal, ManuscriptModalResult } from '../modals/ManuscriptOptionsModal';
import { PlanetaryTimeModal } from '../modals/PlanetaryTimeModal';
import { BookDesignerModal } from '../modals/BookDesignerModal';
import { TimelineRepairModal } from '../modals/TimelineRepairModal';
import { AuthorProgressModal } from '../modals/AuthorProgressModal';
import { generateSceneContent } from '../utils/sceneGenerator';
import { sanitizeSourcePath, buildInitialSceneFilename, buildInitialBackdropFilename } from '../utils/sceneCreation';
import { DEFAULT_SETTINGS } from '../settings/defaults';
import { ensureManuscriptOutputFolder, ensureOutlineOutputFolder } from '../utils/aiOutput';
import { buildExportFilename, buildOutlineExport, getExportFormatExtension, getTemplateForPreset, getVaultAbsolutePath, resolveTemplatePath, runPandocOnContent, writeTextFile } from '../utils/exportFormats';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';

import { getRuntimeSettings } from '../utils/runtimeEstimator';

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
            id: 'open-radial-timeline-view',
            name: 'Open',
            callback: () => {
                this.plugin.getTimelineService().activateView();
            },
        });

        this.plugin.addCommand({
            id: 'search-timeline',
            name: 'Search timeline',
            callback: () => {
                this.plugin.openSearchPrompt();
            }
        });

        this.plugin.addCommand({
            id: 'clear-search',
            name: 'Clear search',
            callback: () => {
                this.plugin.clearSearch();
            }
        });

        this.plugin.addCommand({
            id: 'create-basic-scene-note',
            name: 'Create basic scene note',
            callback: async () => {
                await this.createSceneNote('base');
            }
        });

        this.plugin.addCommand({
            id: 'create-advanced-scene-note',
            name: 'Create advanced scene note',
            callback: async () => {
                await this.createSceneNote('advanced');
            }
        });

        this.plugin.addCommand({
            id: 'create-backdrop-note',
            name: 'Create backdrop note',
            callback: async () => {
                await this.createBackdropNote();
            }
        });

        this.plugin.addCommand({
            id: 'manage-subplots',
            name: 'Manage subplots',
            callback: () => {
                new ManageSubplotsModal(this.app, this.plugin).open();
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
            id: 'repair-timeline-order',
            name: 'Repair timeline order',
            callback: () => {
                new TimelineRepairModal(this.app, this.plugin).open();
            }
        });

        this.plugin.addCommand({
            id: 'export-manuscript',
            name: 'Manuscript export',
            callback: () => {
                new ManuscriptOptionsModal(this.app, this.plugin, this.handleManuscriptExport.bind(this)).open();
            }
        });

        this.plugin.addCommand({
            id: 'planetary-time-settings',
            name: 'Planetary time calculator',
            callback: () => {
                new PlanetaryTimeModal(this.app, this.plugin).open();
            }
        });

        this.plugin.addCommand({
            id: 'gossamer-score-manager',
            name: 'Gossamer score manager',
            callback: () => {
                openGossamerScoreEntry(this.plugin);
            }
        });

        this.plugin.addCommand({
            id: 'gossamer-analysis',
            name: 'Gossamer analysis',
            callback: () => {
                runGossamerAiAnalysis(this.plugin);
            }
        });

        // APR Command (Sentence case per Obsidian guidelines)
        this.plugin.addCommand({
            id: 'author-progress-report',
            name: 'Author progress report',
            callback: () => {
                new AuthorProgressModal(this.app, this.plugin).open();
            }
        });
    }

    private async handleManuscriptExport(result: ManuscriptModalResult): Promise<void> {
        if (this.requiresPro(result) && !isProfessionalActive(this.plugin)) {
            new Notice('This export configuration requires a Professional license.');
            return;
        }

        try {
            const scenes = await getSceneFilesByOrder(this.app, this.plugin, result.order);
            const selection: ManuscriptSceneSelection = {
                files: scenes.files,
                titles: scenes.titles,
                whenDates: scenes.whenDates,
                sceneNumbers: scenes.sceneNumbers,
                subplots: scenes.subplots,
                synopses: scenes.synopses,
                runtimes: scenes.runtimes,
                wordCounts: scenes.wordCounts,
                sortOrder: scenes.sortOrder
            };

            // Filter by subplot if selected
            let filteredSelection = selection;
            if (result.subplot && result.subplot !== 'All Subplots') {
                const indices = selection.subplots.map((s, i) => s === result.subplot ? i : -1).filter(i => i !== -1);
                filteredSelection = {
                    files: indices.map(i => selection.files[i]),
                    titles: indices.map(i => selection.titles[i]),
                    whenDates: indices.map(i => selection.whenDates[i]),
                    sceneNumbers: indices.map(i => selection.sceneNumbers[i]),
                    subplots: indices.map(i => selection.subplots[i]),
                    synopses: indices.map(i => selection.synopses[i]),
                    runtimes: indices.map(i => selection.runtimes[i]),
                    wordCounts: indices.map(i => selection.wordCounts[i]),
                    sortOrder: selection.sortOrder
                };
            }

            // Slice by range
            const slicedFiles = sliceScenesByRange(filteredSelection.files, result.rangeStart, result.rangeEnd);
            
            // Handle output generation
            if (result.exportType === 'outline') {
                // Get runtime settings for session planning
                const runtimeSettings = getRuntimeSettings(this.plugin.settings);

                // outline export expects ManuscriptSceneSelection
                const slicedSelection = this.sliceSelection(filteredSelection, result.rangeStart, result.rangeEnd);
                const outline = buildOutlineExport(
                    slicedSelection, 
                    result.outlinePreset || 'beat-sheet', 
                    result.includeSynopsis ?? false,
                    runtimeSettings
                );
                const outputFolder = await ensureOutlineOutputFolder(this.plugin);
                const filename = buildExportFilename({
                    exportType: 'outline',
                    order: result.order,
                    subplotFilter: result.subplot,
                    outlinePreset: result.outlinePreset,
                    extension: outline.extension
                });
                const path = `${outputFolder}/${filename}`;
                await this.app.vault.create(path, outline.text);
                new Notice(`Outline exported to ${path}`);
                return;
            }

            // Manuscript assembly
            const assembled = await assembleManuscript(
                slicedFiles, 
                this.app.vault, 
                undefined, 
                false, 
                filteredSelection.sortOrder,
                result.tocMode !== 'none'
            );
            
            // Update word counts if requested
            if (result.updateWordCounts) {
                new Notice('Updating word counts...');
                // assembleManuscript returns { scenes: SceneContent[] } which has word counts
                await updateSceneWordCounts(this.app, slicedFiles, assembled.scenes);
            }

            // Build filename with acronyms
            const extension = getExportFormatExtension(result.outputFormat);
            const filename = buildExportFilename({
                exportType: 'manuscript',
                order: result.order,
                subplotFilter: result.subplot,
                manuscriptPreset: result.manuscriptPreset,
                extension
            });

            if (result.outputFormat === 'markdown') {
                const outputFolder = await ensureManuscriptOutputFolder(this.plugin);
                const path = `${outputFolder}/${filename}`;
                await this.app.vault.create(path, assembled.text);
                new Notice(`Manuscript exported to ${path}`);
            } else {
                // Pandoc export (Pro)
                // We need to write a temp markdown file, then run pandoc
                const outputFolder = await ensureManuscriptOutputFolder(this.plugin); // Normalized relative path
                const absoluteOutputFolder = getVaultAbsolutePath(this.plugin, outputFolder);
                
                // If getVaultAbsolutePath returns null (mobile/sandbox), we can't run Pandoc
                if (!absoluteOutputFolder) {
                    new Notice('Pandoc export not supported in this environment.');
                    return;
                }

                const outputPath = `${absoluteOutputFolder}/${filename}`;
                
                // Resolve template path to absolute path for Pandoc
                let templatePath: string | undefined = undefined;
                if (result.manuscriptPreset) {
                    const templateVaultPath = getTemplateForPreset(this.plugin, result.manuscriptPreset);
                    if (templateVaultPath) {
                        templatePath = resolveTemplatePath(this.plugin, templateVaultPath);
                    }
                }

                new Notice('Running Pandoc...');
                try {
                    await runPandocOnContent(assembled.text, outputPath, {
                        targetFormat: result.outputFormat as 'docx' | 'pdf',
                        templatePath,
                        workingDir: absoluteOutputFolder,
                        pandocPath: this.plugin.settings.pandocPath,
                        enableFallback: this.plugin.settings.pandocEnableFallback,
                        fallbackPath: this.plugin.settings.pandocFallbackPath
                    });
                    new Notice(`Export successful: ${filename}`);
                } catch (e) {
                    const msg = (e as any)?.message || String(e);
                    new Notice(`Pandoc failed: ${msg}`);
                    console.error(e);
                }
            }

        } catch (error) {
            const msg = (error as any)?.message || String(error);
            new Notice('Export failed: ' + msg);
            console.error(error);
        }
    }

    private sliceSelection(selection: ManuscriptSceneSelection, start?: number, end?: number): ManuscriptSceneSelection {
        if (!start && !end) return selection;
        const startIdx = (start || 1) - 1;
        const endIdx = end || selection.files.length;
        
        return {
            files: selection.files.slice(startIdx, endIdx),
            titles: selection.titles.slice(startIdx, endIdx),
            whenDates: selection.whenDates.slice(startIdx, endIdx),
            sceneNumbers: selection.sceneNumbers.slice(startIdx, endIdx),
            subplots: selection.subplots.slice(startIdx, endIdx),
            synopses: selection.synopses.slice(startIdx, endIdx),
            runtimes: selection.runtimes.slice(startIdx, endIdx),
            wordCounts: selection.wordCounts.slice(startIdx, endIdx),
            sortOrder: selection.sortOrder
        };
    }

    private requiresPro(options: ManuscriptModalResult): boolean {
        if (options.exportType === 'outline') return true;
        if (options.outputFormat !== 'markdown') return true;
        if (options.manuscriptPreset && (options.manuscriptPreset === 'screenplay' || options.manuscriptPreset === 'podcast')) return true;
        if (options.outlinePreset && (options.outlinePreset === 'index-cards-csv' || options.outlinePreset === 'index-cards-json')) return true;
        return false;
    }

    /**
     * Create a new scene note with either basic or advanced YAML template.
     */
    private async createSceneNote(type: 'base' | 'advanced'): Promise<void> {
        const sourcePath = this.plugin.settings.sourcePath || '';
        if (!sourcePath) {
            new Notice('Please set a source path in settings first.');
            return;
        }

        try {
            const sanitizedPath = sanitizeSourcePath(sourcePath);
            const filename = buildInitialSceneFilename();
            const folder = this.app.vault.getAbstractFileByPath(sanitizedPath);

            if (!folder) {
                await this.app.vault.createFolder(sanitizedPath);
            }

            const path = `${sanitizedPath}/${filename}`;
            
            // Use basic or advanced template based on type
            const templates = this.plugin.settings.sceneYamlTemplates || DEFAULT_SETTINGS.sceneYamlTemplates;
            const template = type === 'advanced' 
                ? (templates?.advanced || DEFAULT_SETTINGS.sceneYamlTemplates!.advanced)
                : (templates?.base || DEFAULT_SETTINGS.sceneYamlTemplates!.base);
            
            // Generate content with default placeholder values
            const content = generateSceneContent(template, {
                act: 1,
                when: new Date().toISOString().split('T')[0],
                sceneNumber: 1,
                subplots: ['Main Plot'],
                character: 'Hero',
                place: 'Unknown',
                characterList: ['Hero'],
                placeList: ['Unknown']
            });
            
            // Ensure the content has Class: Scene if not already present
            const finalContent = ensureClassScene(content);
            const fileContent = `---\n${finalContent}\n---\n\n`;
            
            const newFile = await this.app.vault.create(path, fileContent);
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(newFile);
            new Notice(`Created ${type === 'advanced' ? 'advanced' : 'basic'} scene note: ${filename}`);
        } catch (error) {
            const msg = (error as any)?.message || String(error);
            new Notice('Failed to create scene note: ' + msg);
        }
    }

    /**
     * Create a new backdrop note.
     */
    private async createBackdropNote(): Promise<void> {
        const sourcePath = this.plugin.settings.sourcePath || '';
        if (!sourcePath) {
            new Notice('Please set a source path in settings first.');
            return;
        }

        try {
            const sanitizedPath = sanitizeSourcePath(sourcePath);
            const filename = buildInitialBackdropFilename();
            const folder = this.app.vault.getAbstractFileByPath(sanitizedPath);

            if (!folder) {
                await this.app.vault.createFolder(sanitizedPath);
            }

            const path = `${sanitizedPath}/${filename}`;
            
            // Use backdrop template
            const template = this.plugin.settings.backdropYamlTemplate 
                || DEFAULT_SETTINGS.backdropYamlTemplate 
                || `Class: Backdrop\nWhen: {{When}}\nEnd: {{End}}\nSynopsis: `;
            
            // Replace placeholders for backdrop
            const today = new Date().toISOString().split('T')[0];
            const content = template
                .replace(/{{When}}/g, today)
                .replace(/{{End}}/g, today);
            
            const fileContent = `---\n${content}\n---\n\n`;
            
            const newFile = await this.app.vault.create(path, fileContent);
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(newFile);
            new Notice(`Created backdrop note: ${filename}`);
        } catch (error) {
            const msg = (error as any)?.message || String(error);
            new Notice('Failed to create backdrop note: ' + msg);
        }
    }

}

function ensureClassScene(template: string): string {
    const lines = template.split('\n');
    const hasClass = lines.some(line => line.trim().startsWith('Class:') || line.trim().startsWith('class:'));
    if (!hasClass) {
        return `Class: Scene\n${template}`;
    }
    return template;
}
