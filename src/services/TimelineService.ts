import { App, TAbstractFile, TFile } from 'obsidian';
import { TIMELINE_VIEW_TYPE } from '../view/TimeLineView';
import { RadialTimelineView } from '../view/TimeLineView';

export class TimelineService {
    private app: App;
    private refreshTimeout: number | null = null;

    constructor(app: App) {
        this.app = app;
    }

    getTimelineViews(): RadialTimelineView[] {
        return this.app.workspace
            .getLeavesOfType(TIMELINE_VIEW_TYPE)
            .map(leaf => leaf.view as unknown)
            .filter((v): v is RadialTimelineView => v instanceof RadialTimelineView);
    }

    refreshTimelineIfNeeded(file: TAbstractFile | null | undefined, delayMs = 400): void {
        if (file && (!(file instanceof TFile) || file.extension !== 'md')) return;
        if (this.refreshTimeout) window.clearTimeout(this.refreshTimeout);
        this.refreshTimeout = window.setTimeout(() => {
            const views = this.getTimelineViews();
            
            // Performance optimization: Only refresh the ACTIVE timeline view
            // If user has multiple timeline panes open, only update the visible one
            const activeLeaf = this.app.workspace.getActiveViewOfType(RadialTimelineView);
            if (activeLeaf) {
                // Only refresh the active view
                activeLeaf.refreshTimeline();
            } else {
                // No active timeline view, refresh the first one found
                // This handles cases where timeline is open but not focused
                const firstView = views[0];
                if (firstView) {
                    firstView.refreshTimeline();
                }
            }
            
            this.refreshTimeout = null;
        }, delayMs);
    }
}


