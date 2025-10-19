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
            views.forEach(view => view.refreshTimeline());
            this.refreshTimeout = null;
        }, delayMs);
    }
}


