import { TFile, App } from 'obsidian';
import { openOrRevealFile } from '../../utils/fileUtils';
import type { TimelineItem } from '../../types';
import { handleDominantSubplotSelection } from '../interactions/DominantSubplotHandler';
import { SceneInteractionManager } from '../interactions/SceneInteractionManager';
import { updateSynopsisTitleColor } from '../interactions/SynopsisTitleColorManager';
import { OuterRingDragController, isDragInProgress, isDragInteractionActive, wasRecentlyHandledByDrag } from '../interactions/OuterRingDragController';
import { maybeHandleZeroDraftClick } from '../interactions/ZeroDraftHandler';

export interface AllScenesView {
    currentMode: string;
    plugin: {
        app: App;
        settings: {
            enableZeroDraftMode?: boolean;
            dominantSubplots?: Record<string, string>;
            enableSceneTitleAutoExpand?: boolean;
        } & Record<string, unknown>;
        saveSettings?: () => Promise<void>;
    };
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
    getSquareGroupForSceneId(svg: SVGSVGElement, sceneId: string): SVGGElement | null;
    setNumberSquareGroupPosition(svg: SVGSVGElement, sceneId: string, x: number, y: number): void;
}

export function setupSceneInteractions(view: AllScenesView, group: Element, svgElement: SVGSVGElement, scenes: TimelineItem[]): void {
    if (view.currentMode !== 'narrative') return;

    const path = group.querySelector('.rt-scene-path');
    if (!path) return;

    const encodedPath = group.getAttribute('data-path');
    if (encodedPath && encodedPath !== '') {
        const filePath = decodeURIComponent(encodedPath);
        view.registerDomEvent(path as HTMLElement, 'click', async (evt: MouseEvent) => {
            // Skip if drag controller is handling this interaction
            // The drag controller handles click-to-open for quick clicks and drag operations
            if (isDragInProgress() || wasRecentlyHandledByDrag()) return;
            
            const file = view.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) return;
            
            // Handle dominant subplot selection for scenes in multiple subplots
            await handleDominantSubplotSelection(view, group, svgElement, scenes);

            const zeroDraftHandled = await maybeHandleZeroDraftClick({
                app: view.plugin.app,
                file,
                enableZeroDraftMode: view.plugin.settings.enableZeroDraftMode,
                sceneTitle: file.basename || 'Scene',
                onOverrideOpen: async () => openOrRevealFile(view.plugin.app as any, file, false)
            });
            if (zeroDraftHandled) {
                evt.preventDefault();
                evt.stopPropagation();
                return;
            }

            await openOrRevealFile(view.plugin.app as any, file, false);
        });

        view.registerDomEvent(group as HTMLElement, 'mouseenter', () => {
            const itemType = group.getAttribute('data-item-type');
            if (view.currentMode === 'gossamer' && itemType !== 'Beat') return;
        });
        view.registerDomEvent(group as HTMLElement, 'mouseleave', () => {
            const itemType = group.getAttribute('data-item-type');
            if (view.currentMode === 'gossamer' && itemType !== 'Beat') return;
        });
    }
}

export function setupAllScenesDelegatedHover(view: AllScenesView, container: HTMLElement, scenes: TimelineItem[]): void {
    const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
    if (!svg) return;
    
    // Create scene interaction manager
    // Prefer SVG's declared act count for accurate hover redistribution; fall back to settings.
    const svgActsAttr = svg.getAttribute('data-num-acts');
    const svgActs = svgActsAttr ? parseInt(svgActsAttr, 10) : NaN;
    const totalActs = Number.isFinite(svgActs) && svgActs >= 3
        ? svgActs
        : Math.max(3, (view.plugin.settings as any).actCount ?? 3);
    const manager = new SceneInteractionManager(view as any, svg, totalActs);
    // Keep manager enabled in this mode and read the user setting live at hover-time.
    // This allows toggling auto-expand without reopening the timeline view.
    manager.setTitleExpansionEnabled(true);

    let currentGroup: Element | null = null;
    let currentSceneId: string | null = null;
    let rafId: number | null = null;

    const clearSelection = () => {
        manager.onSceneLeave();
        currentGroup = null;
        currentSceneId = null;
    };

    const getSceneIdFromGroup = (group: Element): string | null => {
        const pathEl = group.querySelector('.rt-scene-path') as SVGPathElement | null;
        return pathEl?.id || null;
    };

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerover', (e: PointerEvent) => {
        if (isDragInteractionActive()) {
            if (currentGroup) {
                svg.classList.remove('scene-hover');
                clearSelection();
            }
            return;
        }

        // Check SVG data-mode attribute for definitive mode state
        const svgMode = svg.getAttribute('data-mode');
        if (svgMode === 'gossamer') return;
        
        const g = (e.target as Element).closest('.rt-scene-group');
        if (!g || g === currentGroup) return;
        clearSelection();
        const sid = getSceneIdFromGroup(g);
        if (!sid) return;
        svg.classList.add('scene-hover');
        currentGroup = g;
        currentSceneId = sid;
        
        // Use manager for hover interactions - pass mouse event to position synopsis immediately
        manager.onSceneHover(g, sid, e as unknown as MouseEvent);
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', (e: PointerEvent) => {
        if (isDragInteractionActive()) {
            if (currentGroup) {
                svg.classList.remove('scene-hover');
                clearSelection();
            }
            return;
        }

        // Check SVG data-mode attribute for definitive mode state  
        const svgMode = svg.getAttribute('data-mode');
        if (svgMode === 'gossamer') return;
        
        const toEl = e.relatedTarget as Element | null;
        if (currentGroup && toEl && currentGroup.contains(toEl)) return;
        svg.classList.remove('scene-hover');
        clearSelection();
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointermove', (e: PointerEvent) => {
        if (isDragInteractionActive()) {
            if (currentGroup) {
                svg.classList.remove('scene-hover');
                clearSelection();
            }
            return;
        }

        if (rafId !== null) return;
        rafId = window.requestAnimationFrame(() => {
            manager.onMouseMove(e as unknown as MouseEvent);
            rafId = null;
        });
    });
    
    // Cleanup on pointerout
    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', () => {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    });
}

export function setupOuterRingDrag(view: AllScenesView, svg: SVGSVGElement): void {
    const controller = new OuterRingDragController(view as any, svg, {
        onRefresh: () => {
            // Use direct refresh (bypasses debounce) for immediate update after drag operations
            if (typeof (view as any).refreshTimeline === 'function') {
                (view as any).refreshTimeline();
            } else {
                (view.plugin as any)?.refreshTimelineIfNeeded?.(null);
            }
        },
        enableDebug: (view.plugin.settings as any)?.enableHoverDebugLogging,
        mode: view.currentMode,
    });
    controller.attach();
}
