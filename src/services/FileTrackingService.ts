import type RadialTimelinePlugin from '../main';
import { TFile, TAbstractFile } from 'obsidian';

export class FileTrackingService {
    constructor(private plugin: RadialTimelinePlugin) {}

    updateOpenFilesTracking(): void {
        const openFilePaths = new Set<string>();
        this.plugin.app.workspace.iterateAllLeaves((leaf) => {
            const file = (leaf as any).view?.file as TFile | undefined;
            if (file && file.path) openFilePaths.add(file.path);
        });

        let changed = false;
        if (openFilePaths.size !== this.plugin.openScenePaths.size) changed = true;
        else {
            for (const p of openFilePaths) { if (!this.plugin.openScenePaths.has(p)) { changed = true; break; } }
        }
        if (!changed) {
            return;
        }

        this.plugin.openScenePaths = openFilePaths;
        const views = this.plugin.getTimelineViews();
        views.forEach(v => v.refreshTimeline());
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
