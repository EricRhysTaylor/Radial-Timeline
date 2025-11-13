import type { App, TFile } from 'obsidian';
import type { TimelineItem } from '../types';
import type RadialTimelinePlugin from '../main';
import type { RadialTimelineView } from '../view/TimeLineView';
import { normalizeFrontmatterKeys } from '../utils/frontmatter';
import { isStoryBeat } from '../utils/sceneHelpers';

/**
 * Handles hover interactions between Obsidian file explorer/tab hover and the timeline.
 */
export class HoverHighlighter {
    private currentHoverPath: string | null = null;
    private currentTabHoverPath: string | null = null;
    private lastHighlightedFile: string | null = null;

    constructor(private app: App, private plugin: RadialTimelinePlugin) {}

    register(): void {
        // File explorer hover
        this.plugin.registerDomEvent(document, 'mouseover', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const fileItem = target.closest('.nav-file-title');
            if (!fileItem) return;
            const navFile = fileItem.closest('.nav-file');
            if (!navFile) return;
            const filePath = navFile.getAttribute('data-path');
            if (!filePath) return;
            if (this.currentHoverPath === filePath) return;
            this.currentHoverPath = filePath;
            if (this.isSceneFile(filePath)) {
                this.highlightScene(filePath, true);
            }
        });

        this.plugin.registerDomEvent(document, 'mouseout', (evt: MouseEvent) => {
            const target = evt.target as HTMLElement;
            const fileItem = target.closest('.nav-file-title');
            if (!fileItem) return;
            const navFile = fileItem.closest('.nav-file');
            if (!navFile) return;
            const filePath = navFile.getAttribute('data-path');
            if (!filePath || this.currentHoverPath !== filePath) return;
            this.currentHoverPath = null;
            if (this.isSceneFile(filePath)) {
                this.highlightScene(filePath, false);
            }
        });

        // Tab hover
        this.plugin.registerDomEvent(document, 'mouseover', (evt: MouseEvent) => {
            const tabHeader = (evt.target as HTMLElement).closest('.workspace-tab-header');
            if (!tabHeader) return;
            const tabId = tabHeader.getAttribute('data-tab-id');
            if (!tabId) return;
            const leaf = this.app.workspace.getLeafById(tabId);
            if (!leaf) return;
            const state = leaf.getViewState();
            const filePath = state?.state?.file as string | undefined;
            if (!filePath || state?.type !== 'markdown') return;
            if (this.currentTabHoverPath === filePath) return;
            this.currentTabHoverPath = filePath;
            if (this.isSceneFile(filePath)) {
                this.highlightScene(filePath, true);
            }
        });

        this.plugin.registerDomEvent(document, 'mouseout', (evt: MouseEvent) => {
            const tabHeader = (evt.target as HTMLElement).closest('.workspace-tab-header');
            if (!tabHeader) return;
            const tabId = tabHeader.getAttribute('data-tab-id');
            if (!tabId) return;
            const leaf = this.app.workspace.getLeafById(tabId);
            if (!leaf) return;
            const state = leaf.getViewState();
            const filePath = state?.state?.file as string | undefined;
            if (!filePath || state?.type !== 'markdown' || this.currentTabHoverPath !== filePath) return;
            this.currentTabHoverPath = null;
            if (this.isSceneFile(filePath)) {
                this.highlightScene(filePath, false);
            }
        });

        // File open highlighting
        this.plugin.registerEvent(this.app.workspace.on('file-open', (file) => {
            if (file) {
                if (this.lastHighlightedFile && this.lastHighlightedFile !== file.path) {
                    this.highlightScene(this.lastHighlightedFile, false);
                }
                this.highlightScene(file.path, true);
                this.lastHighlightedFile = file.path;
                if (this.isSceneFile(file.path)) {
                    this.plugin.openScenePaths.add(file.path);
                    this.plugin.refreshTimelineIfNeeded(null);
                }
            } else {
                if (this.lastHighlightedFile) {
                    this.highlightScene(this.lastHighlightedFile, false);
                    this.lastHighlightedFile = null;
                }
            }
        }));
    }

    private highlightScene(filePath: string, isHighlighting: boolean): void {
        this.plugin.highlightSceneInTimeline(filePath, isHighlighting);
    }

    private isSceneFile(filePath: string): boolean {
        const views = this.plugin.getTimelineViews();
        if (views.length === 0) return false;
        for (const view of views) {
            const scenes = (view as any)['sceneData'] || [];
            if (scenes.length > 0) {
                const match = scenes.find((scene: TimelineItem) => scene.path === filePath || scene.path === `/${filePath}` || `/${scene.path}` === filePath);
                if (match) return true;
            } else {
                const container = view.contentEl.querySelector('.radial-timeline-container');
                if (!container) continue;
                const svgElement = container.querySelector('svg') as SVGSVGElement | null;
                if (!svgElement) continue;
                let encodedPath = encodeURIComponent(filePath);
                let sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);
                if (!sceneGroup && filePath.startsWith('/')) {
                    encodedPath = encodeURIComponent(filePath.substring(1));
                    sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);
                } else if (!sceneGroup && !filePath.startsWith('/')) {
                    encodedPath = encodeURIComponent(`/${filePath}`);
                    sceneGroup = svgElement.querySelector(`.scene-group[data-path="${encodedPath}"]`);
                }
                if (sceneGroup) return true;
            }
        }
        return false;
    }
}
