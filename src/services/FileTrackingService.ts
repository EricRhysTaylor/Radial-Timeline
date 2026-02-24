import type RadialTimelinePlugin from '../main';
import { TFile, TAbstractFile, MarkdownView } from 'obsidian';

export class FileTrackingService {
    private modalStateObserver?: MutationObserver;
    private modalStateSyncRaf?: number;

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
            this.installModalStateObserver();
            this.plugin.setCSSColorVariables();
            this.updateOpenFilesTracking();
        });

        this.plugin.registerEvent(this.plugin.app.workspace.on('layout-change', () => {
            // Avoid refreshing while a modal or the plugin settings tab is open (prevents flicker).
            if (this.isModalOpen() || this.isSettingsTabOpen()) {
                window.setTimeout(() => {
                    if (!this.isModalOpen() && !this.isSettingsTabOpen()) {
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
                        // Pass null for currentSceneId if not available/relevant here, or fix signature
                        this.plugin.getRendererService().updateProgressAndTicks(v as any, null);
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

    private installModalStateObserver(): void {
        if (this.modalStateObserver || !document.body) return;

        this.syncModalOpenBodyClass();
        this.modalStateObserver = new MutationObserver(() => this.scheduleModalStateSync());
        this.modalStateObserver.observe(document.body, { childList: true, subtree: true });

        this.plugin.register(() => {
            if (this.modalStateObserver) {
                this.modalStateObserver.disconnect();
                this.modalStateObserver = undefined;
            }
            if (this.modalStateSyncRaf) {
                window.cancelAnimationFrame(this.modalStateSyncRaf);
                this.modalStateSyncRaf = undefined;
            }
            document.body.classList.remove('rt-modal-open');
        });
    }

    private scheduleModalStateSync(): void {
        if (this.modalStateSyncRaf) return;
        this.modalStateSyncRaf = window.requestAnimationFrame(() => {
            this.modalStateSyncRaf = undefined;
            this.syncModalOpenBodyClass();
        });
    }

    private syncModalOpenBodyClass(): void {
        if (!document.body) return;
        document.body.classList.toggle('rt-modal-open', this.isModalOpen());
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

    /**
     * Detect if the Radial Timeline settings tab is currently open.
     * Skips layout-change-driven refresh while the user is in settings to avoid panel flicker.
     */
    private isSettingsTabOpen(): boolean {
        try {
            return document.body.querySelector('.ert-settings-root') != null;
        } catch {
            return false;
        }
    }
}
