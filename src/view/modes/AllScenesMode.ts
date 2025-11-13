import { TFile, App } from 'obsidian';
import { openOrRevealFile } from '../../utils/fileUtils';
import type { TimelineItem } from '../../types';
import { handleDominantSubplotSelection } from '../interactions/DominantSubplotHandler';
import { SceneInteractionManager } from '../interactions/SceneInteractionManager';
import { updateSynopsisTitleColor } from '../interactions/SynopsisTitleColorManager';

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
            const file = view.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) return;
            
            // Handle dominant subplot selection for scenes in multiple subplots
            await handleDominantSubplotSelection(view, group, svgElement, scenes);

            if (view.plugin.settings.enableZeroDraftMode) {
                const cache = view.plugin.app.metadataCache.getFileCache(file);
                const fm = (cache && cache.frontmatter) ? (cache.frontmatter as Record<string, unknown>) : {};
                const getFm = (key: string): unknown => {
                    if (!fm) return undefined;
                    const lower = key.toLowerCase();
                    for (const k of Object.keys(fm)) {
                        if (k.toLowerCase() === lower) return (fm as any)[k];
                    }
                    return undefined;
                };
                const stageValue = String(getFm('Publish Stage') ?? 'Zero');
                const statusValue = String(getFm('Status') ?? 'Todo');
                const isStageZero = stageValue.trim().toLowerCase() === 'zero';
                const isStatusComplete = statusValue.trim().toLowerCase() === 'complete';
                if (isStageZero && isStatusComplete) {
                    evt.preventDefault();
                    evt.stopPropagation();
                    const pendingEdits = String(getFm('Pending Edits') ?? '').trim();
                    const sceneTitle = file.basename || 'Scene';
                    const modal = new (require('../../modals/ZeroDraftModal').default)(view.plugin.app, {
                        titleText: `Pending Edits — ${sceneTitle}`,
                        initialText: pendingEdits,
                        onOk: async (nextText: string) => {
                            try {
                                await view.plugin.app.fileManager.processFrontMatter(file, (yaml: Record<string, unknown>) => {
                                    (yaml as Record<string, unknown>)['Pending Edits'] = nextText;
                                });
                            } catch (e) {
                                // SAFE: Notice suppressed here to avoid UI noise; modal informs user on failure
                            }
                        },
                        onOverride: async () => {
                            await openOrRevealFile(view.plugin.app as any, file, false);
                        }
                    });
                    modal.open();
                    return;
                }
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
    const manager = new SceneInteractionManager(view as any, svg);
    manager.setTitleExpansionEnabled(view.plugin.settings.enableSceneTitleAutoExpand ?? true);

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
        // Check SVG data-mode attribute for definitive mode state  
        const svgMode = svg.getAttribute('data-mode');
        if (svgMode === 'gossamer') return;
        
        const toEl = e.relatedTarget as Element | null;
        if (currentGroup && toEl && currentGroup.contains(toEl)) return;
        svg.classList.remove('scene-hover');
        clearSelection();
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointermove', (e: PointerEvent) => {
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

