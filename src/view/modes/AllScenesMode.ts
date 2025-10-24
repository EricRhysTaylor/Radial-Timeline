import { TFile } from 'obsidian';
import { openOrRevealFile } from '../../utils/fileUtils';
import { Scene } from '../../main';

export interface AllScenesView {
    currentMode: string;
    plugin: {
        app: {
            vault: { getAbstractFileByPath: (path: string) => unknown };
            metadataCache: { getFileCache: (file: unknown) => { frontmatter?: Record<string, unknown> } | null };
            fileManager: { processFrontMatter: (file: unknown, fn: (yaml: Record<string, unknown>) => void) => Promise<void> };
        };
        settings: Record<string, unknown>;
    };
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
    getSquareGroupForSceneId(svg: SVGSVGElement, sceneId: string): SVGGElement | null;
    setNumberSquareGroupPosition(svg: SVGSVGElement, sceneId: string, x: number, y: number): void;
}

export function setupSceneInteractions(view: AllScenesView, group: Element, svgElement: SVGSVGElement, scenes: Scene[]): void {
    if (view.currentMode !== 'all-scenes') return;

    const path = group.querySelector('.rt-scene-path');
    if (!path) return;

    const encodedPath = group.getAttribute('data-path');
    if (encodedPath && encodedPath !== '') {
        const filePath = decodeURIComponent(encodedPath);
        view.registerDomEvent(path as HTMLElement, 'click', async (evt: MouseEvent) => {
            const file = view.plugin.app.vault.getAbstractFileByPath(filePath);
            if (!(file instanceof TFile)) return;

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

export function setupAllScenesDelegatedHover(view: AllScenesView, container: HTMLElement, scenes: Scene[]): void {
    const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
    if (!svg) return;

    let currentGroup: Element | null = null;
    let currentSynopsis: Element | null = null;
    let currentSceneId: string | null = null;
    let rafId: number | null = null;

    const clearSelection = () => {
        const all = svg.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title');
        all.forEach(el => el.classList.remove('rt-selected'));
        if (view.currentMode !== 'gossamer') {
            all.forEach(el => el.classList.remove('rt-non-selected'));
        }
        if (currentSynopsis) currentSynopsis.classList.remove('rt-visible');
        currentGroup = null; currentSynopsis = null; currentSceneId = null;
    };

    const applySelection = (group: Element, sceneId: string) => {
        const pathEl = group.querySelector('.rt-scene-path');
        if (pathEl) (pathEl as Element).classList.add('rt-selected');
        const numberSquare = svg.querySelector(`.rt-number-square[data-scene-id="${sceneId}"]`);
        if (numberSquare) numberSquare.classList.add('rt-selected');
        const numberText = svg.querySelector(`.rt-number-text[data-scene-id="${sceneId}"]`);
        if (numberText) numberText.classList.add('rt-selected');
        const sceneTitle = group.querySelector('.rt-scene-title');
        if (sceneTitle) sceneTitle.classList.add('rt-selected');

        const related = new Set<Element>();
        const currentPathAttr = group.getAttribute('data-path');
        if (currentPathAttr) {
            const matches = svg.querySelectorAll(`[data-path="${currentPathAttr}"]`);
            matches.forEach(mg => {
                if (mg === group) return;
                const rp = mg.querySelector('.rt-scene-path'); if (rp) related.add(rp);
                const rt = mg.querySelector('.rt-scene-title'); if (rt) related.add(rt);
                const rid = (rp as SVGPathElement | null)?.id;
                if (rid) {
                    const rsq = svg.querySelector(`.rt-number-square[data-scene-id="${rid}"]`); if (rsq) related.add(rsq);
                    const rtx = svg.querySelector(`.rt-number-text[data-scene-id="${rid}"]`); if (rtx) related.add(rtx);
                }
            });
        }
        const all = svg.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title');
        all.forEach(el => {
            if (!el.classList.contains('rt-selected') && !related.has(el)) el.classList.add('rt-non-selected');
        });
    };

    const getSceneIdFromGroup = (group: Element): string | null => {
        const pathEl = group.querySelector('.rt-scene-path') as SVGPathElement | null;
        return pathEl?.id || null;
    };

    const findSynopsisForScene = (sceneId: string): Element | null => {
        return svg.querySelector(`.rt-scene-info[data-for-scene="${sceneId}"]`);
    };

    const onMove = (e: PointerEvent) => {
        if (currentSynopsis && currentSceneId) {
            (view.plugin as any).updateSynopsisPosition(currentSynopsis, e as unknown as MouseEvent, svg, currentSceneId);
        }
        rafId = null;
    };

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerover', (e: PointerEvent) => {
        if (view.currentMode === 'gossamer') return;
        const g = (e.target as Element).closest('.rt-scene-group');
        if (!g || g === currentGroup) return;
        clearSelection();
        const sid = getSceneIdFromGroup(g);
        if (!sid) return;
        svg.classList.add('scene-hover');
        currentGroup = g;
        currentSceneId = sid;
        currentSynopsis = findSynopsisForScene(sid);
        applySelection(g, sid);
        if (currentSynopsis) {
            currentSynopsis.classList.add('rt-visible');
            (view.plugin as any).updateSynopsisPosition(currentSynopsis, e as unknown as MouseEvent, svg, sid);
        }
        const sceneTitle = g.querySelector('.rt-scene-title');
        if (sceneTitle) {
            // Angular redistribution handled in original file; kept there for now.
        }
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', (e: PointerEvent) => {
        if (view.currentMode === 'gossamer') return;
        const toEl = e.relatedTarget as Element | null;
        if (currentGroup && toEl && currentGroup.contains(toEl)) return;
        svg.classList.remove('scene-hover');
        clearSelection();
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointermove', (e: PointerEvent) => {
        if (rafId !== null) return;
        rafId = window.requestAnimationFrame(() => onMove(e));
    });
    
    // Since AllScenesView doesn't expose a register cleanup, rely on pointerout to cancel outstanding RAF
    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', () => {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    });
}


