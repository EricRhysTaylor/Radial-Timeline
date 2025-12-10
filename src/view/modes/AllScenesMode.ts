import { TFile, App, Notice } from 'obsidian';
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

function getSceneIdFromNumberGroup(group: Element | null): string | null {
    if (!group) return null;
    const rect = group.querySelector<SVGRectElement>('.rt-number-square[data-scene-id]');
    return rect?.dataset.sceneId || null;
}

function cssEscape(value: string): string {
    // Fallback for environments without CSS.escape
    if (typeof (window as any).CSS !== 'undefined' && (window as any).CSS.escape) {
        return (window as any).CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_\-]/g, '\\$&');
}

function splitNumberParts(numText: string | null | undefined): { intPart: number; suffix: string } {
    if (!numText) return { intPart: 0, suffix: '' };
    const trimmed = String(numText).trim();
    const match = trimmed.match(/^(\d+)(\..+)?$/);
    if (!match) return { intPart: 0, suffix: '' };
    return { intPart: Number(match[1]) || 0, suffix: match[2] || '' };
}

async function applySceneNumberUpdates(view: AllScenesView, updates: Array<{ path: string; newNumber: string }>): Promise<void> {
    const { app } = view.plugin;
    for (const update of updates) {
        const file = app.vault.getAbstractFileByPath(update.path);
        if (!(file instanceof TFile)) continue;
        await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
            fm['Scene Number'] = update.newNumber;
            const rawTitle = typeof fm['Title'] === 'string' ? (fm['Title'] as string) : file.basename;
            const hasNumericPrefix = /^\s*\d+(?:\.\d+)?\s+/.test(rawTitle);
            if (hasNumericPrefix) {
                const cleanTitle = rawTitle.replace(/^\s*\d+(?:\.\d+)?\s+/, '').trim();
                fm['Title'] = `${update.newNumber} ${cleanTitle}`.trim();
            }
        });
    }
}

function buildOuterRingOrder(svg: SVGSVGElement): Array<{ sceneId: string; path: string; numberText: string }> {
    const groups = Array.from(svg.querySelectorAll<SVGGElement>('.number-square-group[data-outer-ring="true"]'));
    return groups.map((group) => {
        const sceneId = getSceneIdFromNumberGroup(group) || '';
        const pathEl = sceneId
            ? svg.querySelector<SVGPathElement>(`#${cssEscape(sceneId)}`)
            : null;
        const sceneGroup = pathEl?.closest('.rt-scene-group');
        const encodedPath = sceneGroup?.getAttribute('data-path') || '';
        const path = encodedPath ? decodeURIComponent(encodedPath) : '';
        const numberTextEl = svg.querySelector<SVGTextElement>(`.rt-number-text[data-scene-id="${cssEscape(sceneId)}"]`);
        const numberText = numberTextEl?.textContent?.trim() || '';
        return { sceneId, path, numberText };
    }).filter(entry => entry.sceneId && entry.path);
}

export function setupOuterRingDrag(view: AllScenesView, svg: SVGSVGElement): void {
    if (view.currentMode !== 'narrative') return;
    const outerGroups = Array.from(svg.querySelectorAll<SVGGElement>('.number-square-group[data-outer-ring="true"]'));
    if (!outerGroups.length) return;

    let currentTarget: SVGGElement | null = null;
    let dragging = false;
    let sourceSceneId: string | null = null;

    const clearHighlight = () => {
        if (currentTarget) {
            currentTarget.classList.remove('rt-drop-target');
            const targetId = getSceneIdFromNumberGroup(currentTarget);
            if (targetId) {
                const pathEl = svg.querySelector<SVGPathElement>(`#${cssEscape(targetId)}`);
                pathEl?.classList.remove('rt-drop-target');
            }
            currentTarget = null;
        }
    };

    const setHighlight = (group: SVGGElement | null) => {
        if (!group || group === currentTarget) return;
        clearHighlight();
        currentTarget = group;
        currentTarget.classList.add('rt-drop-target');
        const targetId = getSceneIdFromNumberGroup(group);
        if (targetId) {
            const pathEl = svg.querySelector<SVGPathElement>(`#${cssEscape(targetId)}`);
            pathEl?.classList.add('rt-drop-target');
        }
    };

    const findOuterGroup = (evt: PointerEvent): SVGGElement | null => {
        const direct = (evt.target as Element | null)?.closest('.number-square-group[data-outer-ring="true"]');
        if (direct) return direct as SVGGElement;
        const fromPoint = document.elementFromPoint(evt.clientX, evt.clientY);
        const fallback = fromPoint?.closest('.number-square-group[data-outer-ring="true"]');
        return fallback as SVGGElement | null;
    };

    const finishDrag = async () => {
        dragging = false;
        const targetId = currentTarget ? getSceneIdFromNumberGroup(currentTarget) : null;
        clearHighlight();
        if (!sourceSceneId || !targetId || sourceSceneId === targetId) return;

        const order = buildOuterRingOrder(svg);
        const fromIdx = order.findIndex(o => o.sceneId === sourceSceneId);
        const toIdx = order.findIndex(o => o.sceneId === targetId);
        if (fromIdx === -1 || toIdx === -1) return;

        const reordered = [...order];
        const [moved] = reordered.splice(fromIdx, 1);
        reordered.splice(toIdx, 0, moved);

        const updates: Array<{ path: string; newNumber: string }> = [];
        reordered.forEach((entry, idx) => {
            const { suffix } = splitNumberParts(entry.numberText);
            const nextNumber = `${idx + 1}${suffix}`;
            if (nextNumber !== entry.numberText) {
                updates.push({ path: entry.path, newNumber: nextNumber });
            }
        });

        if (updates.length === 0) return;
        await applySceneNumberUpdates(view, updates);
        new Notice('Scenes reordered', 2000);
        // Force immediate refresh to reflect new numbering
        (view.plugin as any)?.refreshTimelineIfNeeded?.(null, 0);
    };

    const onPointerMove = (evt: PointerEvent) => {
        if (!dragging) return;
        const group = findOuterGroup(evt);
        setHighlight(group);
    };

    const onPointerUp = async () => {
        window.removeEventListener('pointermove', onPointerMove, true);
        window.removeEventListener('pointerup', onPointerUp, true);
        await finishDrag();
        sourceSceneId = null;
    };

    const startDrag = (evt: PointerEvent, group: SVGGElement) => {
        if (evt.button !== 0) return;
        const sceneId = getSceneIdFromNumberGroup(group);
        if (!sceneId) return;
        evt.preventDefault();
        sourceSceneId = sceneId;
        dragging = true;
        setHighlight(group);
        window.addEventListener('pointermove', onPointerMove, true);
        window.addEventListener('pointerup', onPointerUp, true);
    };

    outerGroups.forEach(group => {
        view.registerDomEvent(group as unknown as HTMLElement, 'pointerdown', (evt: PointerEvent) => startDrag(evt, group));
    });
}

