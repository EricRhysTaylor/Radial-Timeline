import type RadialTimelinePlugin from '../main';
import { TFile, TAbstractFile, MarkdownView } from 'obsidian';

export class FileTrackingService {
    constructor(private plugin: RadialTimelinePlugin) {}

    updateOpenFilesTracking(): void {
        const previousOpenFiles = new Set(this.plugin.openScenePaths);
        const openFilePaths = new Set<string>();
        const openFilesList: string[] = [];

        const leaves = this.plugin.app.workspace.getLeavesOfType('markdown');
        leaves.forEach(leaf => {
            const view = leaf.view;
            if (view instanceof MarkdownView && view.file) {
                openFilePaths.add(view.file.path);
                openFilesList.push(view.file.path);
            }
        });

        const activeFile = this.plugin.app.workspace.getActiveFile();
        if (activeFile && !openFilesList.includes(activeFile.path)) {
            openFilePaths.add(activeFile.path);
            openFilesList.push(activeFile.path);
        }

        try {
            // @ts-ignore - access workspace layout internals
            const layout = this.plugin.app.workspace.getLayout();
            if (layout && layout.leaves) {
                const leafIds = Object.keys(layout.leaves as Record<string, unknown>);
                leafIds.forEach(id => {
                    // @ts-ignore - layout leaf typing
                    const leafData = layout.leaves[id];
                    if (leafData && leafData.type === 'markdown' && leafData.state && leafData.state.file) {
                        const filePath = leafData.state.file;
                        if (!openFilesList.includes(filePath)) {
                            openFilePaths.add(filePath);
                            openFilesList.push(filePath);
                        }
                    }
                });
            }
        } catch (error) {
            console.error('[Radial Timeline] Error accessing workspace layout:', error);
        }

        let hasChanged = previousOpenFiles.size !== openFilePaths.size;
        if (!hasChanged) {
            for (const path of openFilePaths) {
                if (!previousOpenFiles.has(path)) {
                    hasChanged = true;
                    break;
                }
            }
        }

        if (!hasChanged) return;

        this.plugin.openScenePaths = openFilePaths;
        this.plugin.getTimelineViews().forEach(v => v.refreshTimeline());
    }

    registerWorkspaceListeners(): void {
        this.plugin.app.workspace.onLayoutReady(() => {
            this.plugin.setCSSColorVariables();
            this.updateOpenFilesTracking();
        });

        this.plugin.registerEvent(this.plugin.app.workspace.on('layout-change', () => {
            this.updateOpenFilesTracking();
            this.plugin.refreshTimelineIfNeeded(null);
        }));

        this.plugin.registerEvent(this.plugin.app.vault.on('delete', (file) => this.plugin.refreshTimelineIfNeeded(file)));
        this.plugin.registerEvent(this.plugin.app.vault.on('rename', (file, oldPath) => this.handleFileRename(file, oldPath)));

        this.plugin.registerEvent(this.plugin.app.workspace.on('css-change', () => {
            this.plugin.setCSSColorVariables();
            try {
                const views = this.plugin.getTimelineViews();
                views.forEach(v => {
                    const svg = (v as unknown as { containerEl?: HTMLElement })?.containerEl?.querySelector?.('.radial-timeline-svg');
                    if (svg) {
                        this.plugin.getRendererService().updateProgressAndTicks(v as any);
                        if ((v as any).currentMode === 'gossamer') {
                            this.plugin.getRendererService().updateGossamerLayer(v as any);
                        }
                    }
                });
            } catch {
                this.plugin.refreshTimelineIfNeeded(null);
            }
        }));
    }

    private handleFileRename(file: TAbstractFile, oldPath: string): void {
        if (this.plugin.openScenePaths.has(oldPath)) {
            this.plugin.openScenePaths.delete(oldPath);
            if (file instanceof TFile && this.plugin.isSceneFile(file.path)) {
                this.plugin.openScenePaths.add(file.path);
            }
        }
        this.plugin.refreshTimelineIfNeeded(file);
    }
}
