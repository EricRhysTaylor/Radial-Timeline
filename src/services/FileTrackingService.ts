import type RadialTimelinePlugin from '../main';
import { TFile } from 'obsidian';

export class FileTrackingService {
    private plugin: RadialTimelinePlugin;

    constructor(plugin: RadialTimelinePlugin) {
        this.plugin = plugin;
    }

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
}


