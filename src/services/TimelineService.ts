import { App, TAbstractFile, TFile } from 'obsidian';
import { TIMELINE_VIEW_TYPE } from '../view/TimeLineView';
import { RadialTimelineView } from '../view/TimeLineView';
import { ChangeType } from '../renderer/ChangeDetection';
import type RadialTimelinePlugin from '../main';

/**
 * Render request with priority and change type tracking
 */
interface RenderRequest {
    changeTypes: Set<ChangeType>;
    requestedAt: number;
    priority: number; // Lower = higher priority
}

export class TimelineService {
    private app: App;
    private plugin: RadialTimelinePlugin;
    private refreshTimeout: number | null = null;
    private pendingRequest: RenderRequest | null = null;

    constructor(app: App, plugin: RadialTimelinePlugin) {
        this.app = app;
        this.plugin = plugin;
    }

    getTimelineViews(): RadialTimelineView[] {
        return this.app.workspace
            .getLeavesOfType(TIMELINE_VIEW_TYPE)
            .map(leaf => leaf.view as unknown)
            .filter((v): v is RadialTimelineView => v instanceof RadialTimelineView);
    }

    /**
     * Schedule a render with change type tracking and batching
     * Multiple rapid calls will batch change types together
     */
    scheduleRender(changeTypes: ChangeType[], delayMs = 100): void {
        // Merge with pending request if one exists
        if (this.pendingRequest) {
            changeTypes.forEach(type => this.pendingRequest!.changeTypes.add(type));
        } else {
            this.pendingRequest = {
                changeTypes: new Set(changeTypes),
                requestedAt: Date.now(),
                priority: this.calculatePriority(changeTypes)
            };
        }

        // Clear existing timeout
        if (this.refreshTimeout) {
            window.clearTimeout(this.refreshTimeout);
        }

        // Determine delay based on priority
        const effectiveDelay = this.pendingRequest.priority === 0 ? 0 : delayMs;

        // Schedule render
        this.refreshTimeout = window.setTimeout(() => {
            this.executeScheduledRender();
        }, effectiveDelay);
    }

    /**
     * Calculate priority for change types
     * Lower number = higher priority = shorter delay
     */
    private calculatePriority(changeTypes: ChangeType[]): number {
        // High priority (immediate): Scene data, mode changes, settings
        if (changeTypes.includes(ChangeType.SCENE_DATA) || 
            changeTypes.includes(ChangeType.MODE) ||
            changeTypes.includes(ChangeType.SETTINGS)) {
            return 0;
        }
        
        // Medium priority (short delay): Gossamer
        if (changeTypes.includes(ChangeType.GOSSAMER)) {
            return 1;
        }
        
        // Low priority (normal delay): Search, open files, time
        return 2;
    }

    /**
     * Execute the scheduled render
     */
    private executeScheduledRender(): void {
        if (!this.pendingRequest) return;

        const views = this.getTimelineViews();
        
        // Performance optimization: Only refresh the ACTIVE timeline view
        const activeLeaf = this.app.workspace.getActiveViewOfType(RadialTimelineView);
        if (activeLeaf) {
            activeLeaf.refreshTimeline();
        } else {
            // No active timeline view, refresh the first one found
            const firstView = views[0];
            if (firstView) {
                firstView.refreshTimeline();
            }
        }
        
        // Clear pending request
        this.pendingRequest = null;
        this.refreshTimeout = null;
    }

    /**
     * Legacy method for compatibility
     * @param file - File that triggered the refresh (null = settings change or manual refresh)
     */
    refreshTimelineIfNeeded(file: TAbstractFile | null | undefined, delayMs?: number): void {
        if (file && (!(file instanceof TFile) || file.extension !== 'md')) return;
        
        // Use configured debounce delay from settings (default 10000ms)
        const effectiveDelay = delayMs ?? this.plugin.settings.metadataRefreshDebounceMs ?? 10000;
        
        // If file is null, it's likely a settings change
        if (!file) {
            this.scheduleRender([ChangeType.SETTINGS], effectiveDelay);
            return;
        }
        
        // File changes (YAML edits)
        this.scheduleRender([ChangeType.SCENE_DATA], effectiveDelay);
    }

    /**
     * Cancel any pending render
     */
    cancelPendingRender(): void {
        if (this.refreshTimeout) {
            window.clearTimeout(this.refreshTimeout);
            this.refreshTimeout = null;
        }
        this.pendingRequest = null;
    }
}


