import type { App } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { SceneHighlighter } from './SceneHighlighter';

/**
 * Handles hover interactions between Obsidian file explorer/tab hover and the timeline.
 */
export class HoverHighlighter {
    private currentHoverPath: string | null = null;
    private currentTabHoverPath: string | null = null;
    private lastHighlightedFile: string | null = null;

    constructor(
        private app: App,
        private plugin: RadialTimelinePlugin,
        private highlighter: SceneHighlighter
    ) {}

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
            if (this.highlighter.isSceneFile(filePath)) {
                this.highlighter.highlight(filePath, true);
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
            if (this.highlighter.isSceneFile(filePath)) {
                this.highlighter.highlight(filePath, false);
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
            if (this.highlighter.isSceneFile(filePath)) {
                this.highlighter.highlight(filePath, true);
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
            if (this.highlighter.isSceneFile(filePath)) {
                this.highlighter.highlight(filePath, false);
            }
        });

        // File open highlighting
        this.plugin.registerEvent(this.app.workspace.on('file-open', (file) => {
            if (file) {
                if (this.lastHighlightedFile && this.lastHighlightedFile !== file.path) {
                    this.highlighter.highlight(this.lastHighlightedFile, false);
                }
                this.highlighter.highlight(file.path, true);
                this.lastHighlightedFile = file.path;
                if (this.highlighter.isSceneFile(file.path)) {
                    this.plugin.openScenePaths.add(file.path);
                    this.plugin.refreshTimelineIfNeeded(null);
                }
            } else {
                if (this.lastHighlightedFile) {
                    this.highlighter.highlight(this.lastHighlightedFile, false);
                    this.lastHighlightedFile = null;
                }
            }
        }));
    }
}
