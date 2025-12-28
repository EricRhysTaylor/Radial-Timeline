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
            // Avoid refreshing while an Obsidian modal is open (prevents flicker behind dialogs).
            if (this.isModalOpen()) {
                // Try once shortly after the modal likely closes.
                window.setTimeout(() => {
                    if (!this.isModalOpen()) {
                        this.updateOpenFilesTracking();
                        this.plugin.refreshTimelineIfNeeded(null);
                    }
                }, 200);
                return;
            }

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

    /**
     * Heuristic: detect if any Obsidian modal is currently mounted.
     * This prevents timeline refreshes while a modal is visible, which causes UI flicker.
     * Checks multiple selectors to catch settings modal, plugins modal, and standard modals.
     */
    private isModalOpen(): boolean {
        try {
            // Check for standard modal container with content
            const modalContainer = document.body.querySelector('.modal-container');
            if (modalContainer && modalContainer.childElementCount > 0) return true;
            
            // Check for modal background overlay (present when any modal is open)
            const modalBg = document.body.querySelector('.modal-bg');
            if (modalBg) return true;
            
            // Check for the modal element itself
            const modal = document.body.querySelector('.modal');
            if (modal) return true;
            
            return false;
        } catch {
            return false;
        }
    }
}
