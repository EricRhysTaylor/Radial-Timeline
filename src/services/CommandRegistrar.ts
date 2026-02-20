/*
 * CommandRegistrar
 * Encapsulates all command+ribbon registration.
 */

import { App, Notice, TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { BookMeta, MatterMeta } from '../types';
import { assembleManuscript, getSceneFilesByOrder, sliceScenesByRange, ManuscriptSceneSelection, updateSceneWordCounts } from '../utils/manuscript';
import { openGossamerScoreEntry, runGossamerAiAnalysis } from '../GossamerCommands';
import { ManageSubplotsModal } from '../modals/ManageSubplotsModal';
import { ManuscriptOptionsModal, ManuscriptModalResult, type ManuscriptExportOutcome } from '../modals/ManuscriptOptionsModal';
import { PlanetaryTimeModal } from '../modals/PlanetaryTimeModal';
import { BookDesignerModal } from '../modals/BookDesignerModal';
import { TimelineRepairModal } from '../modals/TimelineRepairModal';
import { AuthorProgressModal } from '../modals/AuthorProgressModal';
import { generateSceneContent } from '../utils/sceneGenerator';
import { sanitizeSourcePath, buildInitialSceneFilename, buildInitialBackdropFilename } from '../utils/sceneCreation';
import { getTemplateParts } from '../utils/yamlTemplateNormalize';
import { ensureManuscriptOutputFolder, ensureOutlineOutputFolder } from '../utils/aiOutput';
import { buildExportFilename, buildPrecursorFilename, buildOutlineExport, getExportFormatExtension, getLayoutById, getVaultAbsolutePath, resolveTemplatePath, runPandocOnContent, validatePandocLayout } from '../utils/exportFormats';
import { isProfessionalActive } from '../settings/sections/ProfessionalSection';
import { getActiveBookExportContext } from '../utils/exportContext';
import { getActiveBook } from '../utils/books';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import { isPathInFolderScope } from '../utils/pathScope';
import { ensureSceneTemplateFrontmatter } from '../utils/sceneIds';

import { getRuntimeSettings } from '../utils/runtimeEstimator';

export class CommandRegistrar {
    private inquiryRibbonIcon: HTMLElement | null = null;

    constructor(private plugin: RadialTimelinePlugin, private app: App) { }

    registerAll(): void {
        this.registerRibbon();
        this.registerCommands();
    }

    /** Hide or show the Inquiry ribbon icon based on AI enabled state. */
    setInquiryRibbonVisible(visible: boolean): void {
        if (this.inquiryRibbonIcon) {
            this.inquiryRibbonIcon.toggleClass('ert-hidden', !visible);
        }
    }

    private registerRibbon(): void {
        this.plugin.addRibbonIcon('shell', 'Radial timeline', () => {
            this.plugin.getTimelineService().activateView();
        });
        this.inquiryRibbonIcon = this.plugin.addRibbonIcon('waves', 'Inquiry', () => {
            this.plugin.getInquiryService().activateView();
        });
        // Hide Inquiry ribbon if AI is disabled on load
        if (!(this.plugin.settings.enableAiSceneAnalysis ?? true)) {
            this.inquiryRibbonIcon.toggleClass('ert-hidden', true);
        }
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
            id: 'open-inquiry-view',
            name: 'Open Inquiry',
            callback: () => {
                this.plugin.getInquiryService().activateView();
            },
        });
        this.plugin.addCommand({
            id: 'inquiry-omnibus-pass',
            name: 'Inquiry Omnibus Pass',
            callback: async () => {
                await this.plugin.getInquiryService().runOmnibusPass();
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
            id: 'create-screenplay-scene-note',
            name: 'Create screenplay scene note',
            callback: async () => {
                await this.createSceneNote('screenplay');
            }
        });

        this.plugin.addCommand({
            id: 'create-podcast-scene-note',
            name: 'Create podcast scene note',
            callback: async () => {
                await this.createSceneNote('podcast');
            }
        });

        this.plugin.addCommand({
            id: 'create-frontmatter-note',
            name: 'Create front matter note',
            callback: async () => {
                await this.createMatterNote('Frontmatter');
            }
        });

        this.plugin.addCommand({
            id: 'create-backmatter-note',
            name: 'Create back matter note',
            callback: async () => {
                await this.createMatterNote('Backmatter');
            }
        });

        this.plugin.addCommand({
            id: 'create-bookmeta-note',
            name: 'Create BookMeta note',
            callback: async () => {
                await this.createBookMetaNote();
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
            id: 'timeline-order',
            name: 'Timeline order',
            callback: () => {
                new TimelineRepairModal(this.app, this.plugin).open();
            }
        });

        this.plugin.addCommand({
            id: 'manuscript-export',
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

    private async handleManuscriptExport(result: ManuscriptModalResult): Promise<ManuscriptExportOutcome> {
        if (this.requiresPro(result) && !isProfessionalActive(this.plugin)) {
            new Notice('This export configuration requires a Professional license.');
            return {};
        }

        // ── Source-folder guardrail (applies to Markdown and PDF) ───────
        const ctx = getActiveBookExportContext(this.plugin);
        const folder = ctx.sourceFolder.trim();
        if (!folder || !this.app.vault.getAbstractFileByPath(folder)) {
            const activeBook = getActiveBook(this.plugin.settings);
            if (activeBook) {
                console.warn(`[RT Export] Source folder missing or invalid for book "${activeBook.title}" (id=${activeBook.id}), folder="${folder}"`);
            }
            new Notice('Active book has no valid source folder. Open Settings → General → Books.');
            return {};
        }

        try {
            const includeMatter = result.exportType === 'manuscript' && (result.includeMatter ?? false);
            const scenes = await getSceneFilesByOrder(this.app, this.plugin, result.order, undefined, includeMatter);
            const selection: ManuscriptSceneSelection = {
                files: scenes.files,
                titles: scenes.titles,
                whenDates: scenes.whenDates,
                acts: scenes.acts,
                sceneNumbers: scenes.sceneNumbers,
                subplots: scenes.subplots,
                synopses: scenes.synopses,
                runtimes: scenes.runtimes,
                wordCounts: scenes.wordCounts,
                matterMetaByPath: scenes.matterMetaByPath,
                sortOrder: scenes.sortOrder
            };

            let filteredSelection = selection;
            if (result.subplot && result.subplot !== 'All Subplots') {
                const indices = selection.subplots.map((s, i) => s === result.subplot ? i : -1).filter(i => i !== -1);
                filteredSelection = {
                    files: indices.map(i => selection.files[i]),
                    titles: indices.map(i => selection.titles[i]),
                    whenDates: indices.map(i => selection.whenDates[i]),
                    acts: indices.map(i => selection.acts[i]),
                    sceneNumbers: indices.map(i => selection.sceneNumbers[i]),
                    subplots: indices.map(i => selection.subplots[i]),
                    synopses: indices.map(i => selection.synopses[i]),
                    runtimes: indices.map(i => selection.runtimes[i]),
                    wordCounts: indices.map(i => selection.wordCounts[i]),
                    matterMetaByPath: selection.matterMetaByPath,
                    sortOrder: selection.sortOrder
                };
            }

            const slicedFiles = sliceScenesByRange(filteredSelection.files, result.rangeStart, result.rangeEnd);

            // Outline export remains a thin adapter: slice selection and delegate generation.
            if (result.exportType === 'outline') {
                const runtimeSettings = getRuntimeSettings(this.plugin.settings);

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
                return { savedPath: path };
            }

            // Manuscript assembly is centralized in `assembleManuscript`; command layer only wires options.
            const bookMetaResolution = this.resolveBookMetaForExport(folder);
            const statusMessages: string[] = [];
            if (bookMetaResolution.warning) {
                statusMessages.push(bookMetaResolution.warning);
                statusMessages.push('Keep only one BookMeta per book folder to avoid ambiguity.');
            }
            if (!bookMetaResolution.bookMeta && this.selectionRequiresBookMeta(slicedFiles, filteredSelection.matterMetaByPath)) {
                statusMessages.push('No BookMeta note found. Semantic matter pages may render incomplete.');
            }

            if (bookMetaResolution.bookMeta) {
                if (!bookMetaResolution.bookMeta.title) new Notice('Warning: BookMeta is missing "Title"');
                if (bookMetaResolution.bookMeta.rights && !bookMetaResolution.bookMeta.rights.year) new Notice('Warning: BookMeta is missing "Rights: Year"');
            }
            const assembled = await assembleManuscript(
                slicedFiles,
                this.app.vault,
                undefined,
                false,
                filteredSelection.sortOrder,
                result.tocMode !== 'none',
                bookMetaResolution.bookMeta,
                filteredSelection.matterMetaByPath
            );

            if (result.updateWordCounts) {
                new Notice('Updating word counts...');
                await updateSceneWordCounts(this.app, slicedFiles, assembled.scenes);
            }

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
                return { savedPath: path, messages: statusMessages };
            } else {
                // Pandoc execution lives in exportFormats; validate layout/template before invocation.
                if (result.outputFormat !== 'pdf') {
                    throw new Error(`Unsupported manuscript output format: ${result.outputFormat}`);
                }

                const layout = getLayoutById(this.plugin, result.selectedLayoutId);
                if (!layout) {
                    new Notice('No Pandoc layout selected. Configure layouts in Pro settings.');
                    return {};
                }

                const layoutValidation = validatePandocLayout(this.plugin, layout);
                if (!layoutValidation.valid) {
                    new Notice(`Layout "${layout.name}" is invalid: ${layoutValidation.error}`);
                    return {};
                }

                const outputFolder = await ensureManuscriptOutputFolder(this.plugin);
                const absoluteOutputFolder = getVaultAbsolutePath(this.plugin, outputFolder);

                if (!absoluteOutputFolder) {
                    new Notice('Pandoc export not supported in this environment.');
                    return {};
                }

                const precursorName = buildPrecursorFilename(
                    ctx.fileStem,
                    result.manuscriptPreset || 'novel',
                    result.order,
                    result.subplot
                );
                const precursorPath = `${outputFolder}/${precursorName}`;
                try {
                    await this.app.vault.create(precursorPath, assembled.text);
                } catch {
                    const existing = this.app.vault.getAbstractFileByPath(precursorPath);
                    if (existing instanceof TFile) {
                        await this.app.vault.modify(existing, assembled.text);
                    }
                }

                const pandocFilename = buildExportFilename({
                    exportType: 'manuscript',
                    order: result.order,
                    subplotFilter: result.subplot,
                    manuscriptPreset: result.manuscriptPreset,
                    extension,
                    fileStem: ctx.fileStem
                });
                const outputPath = `${absoluteOutputFolder}/${pandocFilename}`;

                const templatePath = resolveTemplatePath(this.plugin, layout.path);
                const renderedVaultPath = `${outputFolder}/${pandocFilename}`;

                new Notice('Running Pandoc...');
                try {
                    await runPandocOnContent(assembled.text, outputPath, {
                        targetFormat: 'pdf',
                        templatePath,
                        workingDir: absoluteOutputFolder,
                        pandocPath: this.plugin.settings.pandocPath,
                        enableFallback: this.plugin.settings.pandocEnableFallback,
                        fallbackPath: this.plugin.settings.pandocFallbackPath
                    });

                    const activeBook = getActiveBook(this.plugin.settings);
                    if (activeBook) {
                        if (!activeBook.lastUsedPandocLayoutByPreset) {
                            activeBook.lastUsedPandocLayoutByPreset = {};
                        }
                        activeBook.lastUsedPandocLayoutByPreset[result.manuscriptPreset || 'novel'] = layout.id;
                    }
                    await this.plugin.saveSettings();

                    new Notice(`Export successful: ${pandocFilename}`);
                    return { savedPath: precursorPath, renderedPath: renderedVaultPath, messages: statusMessages };
                } catch (e) {
                    const msg = (e as any)?.message || String(e);
                    new Notice(`Pandoc failed: ${msg}`);
                    console.error(e);
                    throw e;
                }
            }

        } catch (error) {
            const msg = (error as any)?.message || String(error);
            new Notice('Export failed: ' + msg);
            console.error(error);
            throw error;
        }
        return {};
    }

    private sliceSelection(selection: ManuscriptSceneSelection, start?: number, end?: number): ManuscriptSceneSelection {
        if (!start && !end) return selection;
        const startIdx = (start || 1) - 1;
        const endIdx = end || selection.files.length;

        return {
            files: selection.files.slice(startIdx, endIdx),
            titles: selection.titles.slice(startIdx, endIdx),
            whenDates: selection.whenDates.slice(startIdx, endIdx),
            acts: selection.acts.slice(startIdx, endIdx),
            sceneNumbers: selection.sceneNumbers.slice(startIdx, endIdx),
            subplots: selection.subplots.slice(startIdx, endIdx),
            synopses: selection.synopses.slice(startIdx, endIdx),
            runtimes: selection.runtimes.slice(startIdx, endIdx),
            wordCounts: selection.wordCounts.slice(startIdx, endIdx),
            matterMetaByPath: selection.matterMetaByPath,
            sortOrder: selection.sortOrder
        };
    }

    private parseBookMetaFromFrontmatter(frontmatter: Record<string, unknown>, sourcePath: string): BookMeta {
        const book = frontmatter.Book as Record<string, unknown> | undefined;
        const rights = frontmatter.Rights as Record<string, unknown> | undefined;
        const identifiers = frontmatter.Identifiers as Record<string, unknown> | undefined;
        const publisher = frontmatter.Publisher as Record<string, unknown> | undefined;

        const rawYear = rights?.year;
        const year = typeof rawYear === 'number'
            ? rawYear
            : typeof rawYear === 'string'
                ? Number(rawYear)
                : NaN;

        return {
            title: (book?.title as string) || undefined,
            author: (book?.author as string) || undefined,
            rights: rights ? {
                copyright_holder: (rights.copyright_holder as string) || undefined,
                year: Number.isFinite(year) ? year : undefined
            } : undefined,
            identifiers: identifiers ? {
                isbn_paperback: (identifiers.isbn_paperback as string) || undefined
            } : undefined,
            publisher: publisher ? {
                name: (publisher.name as string) || undefined
            } : undefined,
            sourcePath
        };
    }

    private selectionRequiresBookMeta(files: TFile[], matterMetaByPath?: Map<string, MatterMeta>): boolean {
        for (const file of files) {
            const parsedMeta = matterMetaByPath?.get(file.path);
            if (parsedMeta?.usesBookMeta === true) return true;

            const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
            if (!frontmatter) continue;

            const classRaw = frontmatter.Class ?? frontmatter.class;
            const classValue = typeof classRaw === 'string' ? classRaw.trim().toLowerCase() : '';
            if (classValue !== 'matter' && classValue !== 'frontmatter' && classValue !== 'backmatter') continue;

            const matterBlock = (frontmatter.Matter ?? frontmatter.matter) as Record<string, unknown> | undefined;
            if (matterBlock?.usesBookMeta === true) return true;
        }

        return false;
    }

    private resolveBookMetaForExport(sourceFolder: string): { bookMeta: BookMeta | null; warning?: string } {
        const mappings = this.plugin.settings.enableCustomMetadataMapping
            ? this.plugin.settings.frontmatterMappings
            : undefined;

        const candidates = this.app.vault.getMarkdownFiles()
            .filter(file => isPathInFolderScope(file.path, sourceFolder))
            .map(file => {
                const cache = this.app.metadataCache.getFileCache(file);
                if (!cache?.frontmatter) return null;
                const normalized = normalizeFrontmatterKeys(cache.frontmatter as Record<string, unknown>, mappings);
                if (normalized.Class !== 'BookMeta') return null;
                return {
                    path: file.path,
                    meta: this.parseBookMetaFromFrontmatter(normalized, file.path)
                };
            })
            .filter((entry): entry is { path: string; meta: BookMeta } => !!entry)
            .sort((a, b) => a.path.localeCompare(b.path));

        if (candidates.length === 0) {
            return { bookMeta: this.plugin.getBookMeta() };
        }

        const current = this.plugin.getBookMeta();
        const preferred = current?.sourcePath
            ? candidates.find(candidate => candidate.path === current.sourcePath)
            : undefined;
        const selected = preferred || candidates[0];

        if (candidates.length > 1) {
            return {
                bookMeta: selected.meta,
                warning: `Multiple BookMeta notes found. Using: ${selected.path}`
            };
        }

        return { bookMeta: selected.meta };
    }

    private requiresPro(options: ManuscriptModalResult): boolean {
        if (options.exportType === 'outline') return true;
        if (options.outputFormat !== 'markdown') return true;
        if (options.manuscriptPreset && (options.manuscriptPreset === 'screenplay' || options.manuscriptPreset === 'podcast')) return true;
        if (options.outlinePreset && (options.outlinePreset === 'index-cards-csv' || options.outlinePreset === 'index-cards-json')) return true;
        return false;
    }

    /**
     * Create a new scene note with basic, advanced, screenplay, or podcast template.
     */
    private async createSceneNote(type: 'base' | 'advanced' | 'screenplay' | 'podcast'): Promise<void> {
        const sourcePath = this.plugin.settings.sourcePath || '';
        if (!sourcePath) {
            new Notice('Please set a source path in settings first.');
            return;
        }

        try {
            const sanitizedPath = sanitizeSourcePath(sourcePath);

            const nameMap: Record<string, string> = {
                base: '1 Basic Scene.md',
                advanced: '1 Advanced Scene.md',
                screenplay: 'Screenplay Scene.md',
                podcast: 'Podcast Scene.md'
            };
            const defaultName = nameMap[type] || 'Basic Scene.md';
            const filename = buildInitialSceneFilename(defaultName);
            const folder = this.app.vault.getAbstractFileByPath(sanitizedPath);

            if (!folder) {
                await this.app.vault.createFolder(sanitizedPath);
            }

            const path = `${sanitizedPath}/${filename}`;

            // Use basic or advanced template based on type
            const sceneParts = getTemplateParts('Scene', this.plugin.settings);
            const template = type === 'advanced' ? sceneParts.merged : sceneParts.base;

            // Default placeholder values — screenplay/podcast pre-fill Runtime
            const today = new Date().toISOString().split('T')[0];
            const content = generateSceneContent(template, {
                act: 1,
                when: today,
                sceneNumber: 1,
                subplots: ['Main Plot'],
                character: type === 'podcast' ? 'HOST' : 'Hero',
                place: type === 'screenplay' ? 'INT. LOCATION' : 'Unknown',
                characterList: type === 'podcast' ? ['HOST', 'GUEST'] : ['Hero'],
                placeList: type === 'screenplay' ? ['INT. LOCATION'] : ['Unknown']
            });

            // Ensure the content has structural scene identity and class markers.
            let finalContent = ensureSceneTemplateFrontmatter(content).frontmatter;

            // Pre-fill Runtime for screenplay/podcast
            if (type === 'screenplay') {
                finalContent = finalContent.replace(/^(Runtime:)\s*$/m, '$1 3:00');
            } else if (type === 'podcast') {
                finalContent = finalContent.replace(/^(Runtime:)\s*$/m, '$1 8:00');
            }

            // Build file content: YAML frontmatter + format-specific body scaffold
            let body = '';
            if (type === 'screenplay') {
                body = SCREENPLAY_BODY_SCAFFOLD;
            } else if (type === 'podcast') {
                body = PODCAST_BODY_SCAFFOLD;
            }

            const fileContent = `---\n${finalContent}\n---\n\n${body}`;

            const newFile = await this.app.vault.create(path, fileContent);
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(newFile);

            const labelMap: Record<string, string> = {
                base: 'basic', advanced: 'advanced', screenplay: 'screenplay', podcast: 'podcast'
            };
            new Notice(`Created ${labelMap[type]} scene note: ${filename}`);
        } catch (error) {
            const msg = (error as any)?.message || String(error);
            new Notice('Failed to create scene note: ' + msg);
        }
    }

    /**
     * Create a new front-matter or back-matter note.
     */
    private async createMatterNote(classValue: 'Frontmatter' | 'Backmatter'): Promise<void> {
        const sourcePath = this.plugin.settings.sourcePath || '';
        if (!sourcePath) {
            new Notice('Please set a source path in settings first.');
            return;
        }

        try {
            const sanitizedPath = sanitizeSourcePath(sourcePath);
            const isFront = classValue === 'Frontmatter';
            const defaultPrefix = isFront ? '0.1' : '200.1';
            const defaultLabel = isFront ? 'Front Matter' : 'Back Matter';
            const defaultName = `${defaultPrefix} ${defaultLabel}.md`;
            const filename = buildInitialSceneFilename(defaultName);
            const folder = this.app.vault.getAbstractFileByPath(sanitizedPath);

            if (!folder) {
                await this.app.vault.createFolder(sanitizedPath);
            }

            const filePath = `${sanitizedPath}/${filename}`;
            const yaml = [
                'Class: Matter',
                'Matter:',
                `  side: ${isFront ? 'front' : 'back'}`,
                '  role: other',
                '  usesBookMeta: false',
                '  bodyMode: auto'
            ].join('\n');

            const fileContent = `---\n${yaml}\n---\n\n`;

            const newFile = await this.app.vault.create(filePath, fileContent);
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(newFile);
            new Notice(`Created ${defaultLabel.toLowerCase()} note: ${filename}`);
        } catch (error) {
            const msg = (error as any)?.message || String(error);
            new Notice(`Failed to create ${classValue.toLowerCase()} note: ${msg}`);
        }
    }

    private async createBookMetaNote(): Promise<void> {
        const targetFolder = await this.resolveBookMetaFolder();
        if (targetFolder === null) return;

        try {
            if (targetFolder && !this.app.vault.getAbstractFileByPath(targetFolder)) {
                await this.app.vault.createFolder(targetFolder);
            }

            const filePath = this.buildCopySafeVaultPath(targetFolder, '000 BookMeta.md');
            const currentYear = new Date().getFullYear();
            const yaml = [
                'Class: BookMeta',
                'Book:',
                '  title: "Untitled Manuscript"',
                '  author: "Author Name"',
                'Rights:',
                '  copyright_holder: "Author Name"',
                `  year: ${currentYear}`,
                'Identifiers:',
                '  isbn_paperback: "000-0-00-000000-0"',
                'Publisher:',
                '  name: "Publisher Name"',
                'Production:',
                '  imprint: "Imprint Name"',
                '  edition: "1"',
                '  print_location: "City, Country"'
            ].join('\n');

            const fileContent = `---\n${yaml}\n---\n\n`;
            const newFile = await this.app.vault.create(filePath, fileContent);
            const leaf = this.app.workspace.getLeaf(true);
            await leaf.openFile(newFile);
            new Notice(`Created BookMeta note: ${newFile.name}`);
        } catch (error) {
            const msg = (error as any)?.message || String(error);
            new Notice(`Failed to create BookMeta note: ${msg}`);
        }
    }

    private async resolveBookMetaFolder(): Promise<string | null> {
        const activeSource = getActiveBookExportContext(this.plugin).sourceFolder.trim();
        if (activeSource) {
            return sanitizeSourcePath(activeSource);
        }

        const typed = window.prompt('No active source folder found. Enter folder path for BookMeta note:', this.plugin.settings.sourcePath || '');
        if (typed === null) return null;
        const trimmed = typed.trim();
        if (!trimmed) {
            return '';
        }
        return sanitizeSourcePath(trimmed);
    }

    private buildCopySafeVaultPath(folderPath: string, baseFilename: string): string {
        const extIdx = baseFilename.lastIndexOf('.');
        const stem = extIdx > 0 ? baseFilename.slice(0, extIdx) : baseFilename;
        const ext = extIdx > 0 ? baseFilename.slice(extIdx) : '';
        const join = (name: string): string => folderPath ? `${folderPath}/${name}` : name;

        let attempt = 0;
        let candidateName = baseFilename;
        let candidatePath = join(candidateName);
        while (this.app.vault.getAbstractFileByPath(candidatePath)) {
            attempt += 1;
            candidateName = attempt === 1
                ? `${stem} (copy)${ext}`
                : `${stem} (copy ${attempt})${ext}`;
            candidatePath = join(candidateName);
        }
        return candidatePath;
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

            // Build backdrop template from single source of truth
            const template = getTemplateParts('Backdrop', this.plugin.settings).merged;

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

// ═══════════════════════════════════════════════════════════════════════════════
// BODY SCAFFOLDS — appended after YAML frontmatter for format-specific scenes
// ═══════════════════════════════════════════════════════════════════════════════

const SCREENPLAY_BODY_SCAFFOLD = [
    'INT. LOCATION - DAY',
    '',
    'Action description.',
    '',
    '                    CHARACTER',
    '          Dialogue here.',
    '',
    ''
].join('\n');

const PODCAST_BODY_SCAFFOLD = [
    '[SEGMENT: INTRODUCTION - 0:00]',
    '',
    'HOST: Opening line.',
    '',
    '[SFX: Theme music]',
    '',
    '[SEGMENT: MAIN DISCUSSION - 2:00]',
    '',
    'HOST: Question or transition.',
    '',
    'GUEST: Response.',
    '',
    '[SEGMENT: CLOSING]',
    '',
    'HOST: Closing remarks.',
    '',
    '[END]',
    '',
    ''
].join('\n');
