/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { TFile, App } from 'obsidian';
import { Scene } from '../../main';
import { setupChronologueShiftController, isShiftModeActive } from '../interactions/ChronologueShiftController';
import { openOrRevealFile } from '../../utils/fileUtils';
import { handleDominantSubplotSelection } from '../interactions/DominantSubplotHandler';
import { SceneInteractionManager } from '../interactions/SceneInteractionManager';

export interface ChronologueView {
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
    plugin: {
        refreshTimelineIfNeeded?: (path: string | null) => void;
        app?: App;
        updateSynopsisPosition?: (synopsis: Element, event: MouseEvent, svg: SVGSVGElement, sceneId: string) => void;
        settings: {
            dominantSubplots?: Record<string, string>;
            enableSceneTitleAutoExpand?: boolean;
        };
        saveSettings?: () => Promise<void>;
    };
    currentMode: string;
    sceneData?: Scene[]; // Full scene data from view
    [key: string]: any; // SAFE: any type used for view augmentation by Obsidian/other modules
}

/**
 * Setup Chronologue Mode interactions
 * Handles scene hover/click interactions and integrates with shift mode
 */
export function setupChronologueMode(view: ChronologueView, svg: SVGSVGElement): void {
    // Only setup if in Chronologue mode
    if (view.currentMode !== 'chronologue') {
        return;
    }
    
    // Setup shift mode controller - pass view directly like yesterday
    setupChronologueShiftController(view, svg);
    
    // Standard scene hover interactions (will check shift mode internally)
    setupSceneHoverInteractions(view, svg);
    
    // Scene click interactions (will delegate to shift mode if active)
    setupSceneClickInteractions(view, svg);
}

/**
 * Setup scene hover interactions for synopsis display
 */
function setupSceneHoverInteractions(view: ChronologueView, svg: SVGSVGElement): void {
    // Create scene interaction manager for title expansion
    const manager = new SceneInteractionManager(view as any, svg);
    
    // ALWAYS DISABLE title expansion in Chronologue mode:
    // - Not needed: Chronological order focuses on temporal relationships, not scene titles
    // - Causes layout breaks: If a scene is expanded when entering shift mode, the expanded 
    //   state persists and breaks the layout
    // - User settings toggle is ignored for Chronologue mode
    manager.setTitleExpansionEnabled(false);
    
    const sceneIdCache = new WeakMap<Element, string>();

    const getSceneIdFromGroup = (group: Element): string | null => {
        const cached = sceneIdCache.get(group);
        if (cached) return cached;

        const pathEl = group.querySelector<SVGPathElement>('.rt-scene-path');
        const sceneId = pathEl?.id ?? null;
        if (sceneId) {
            sceneIdCache.set(group, sceneId);
        }
        return sceneId;
    };

    const synopsisBySceneId = new Map<string, Element>();
    svg.querySelectorAll<SVGElement>('.rt-scene-info[data-for-scene]').forEach(synopsis => {
        const sceneId = synopsis.getAttribute('data-for-scene');
        if (sceneId) {
            synopsisBySceneId.set(sceneId, synopsis);
        }
    });

    const numberSquareBySceneId = new Map<string, SVGElement>();
    svg.querySelectorAll<SVGElement>('.rt-number-square[data-scene-id]').forEach(square => {
        const sceneId = square.getAttribute('data-scene-id');
        if (sceneId) {
            numberSquareBySceneId.set(sceneId, square);
        }
    });

    const numberTextBySceneId = new Map<string, SVGElement>();
    svg.querySelectorAll<SVGElement>('.rt-number-text[data-scene-id]').forEach(text => {
        const sceneId = text.getAttribute('data-scene-id');
        if (sceneId) {
            numberTextBySceneId.set(sceneId, text);
        }
    });

    interface SceneElementRefs {
        path: SVGPathElement | null;
        numberSquare: SVGElement | null;
        numberText: SVGElement | null;
        title: SVGTextElement | null;
    }

    const sceneElementRefs = new Map<string, SceneElementRefs>();
    svg.querySelectorAll<SVGGElement>('.rt-scene-group[data-item-type="Scene"]').forEach(group => {
        const sceneId = getSceneIdFromGroup(group);
        if (!sceneId) return;

        const pathEl = group.querySelector<SVGPathElement>('.rt-scene-path');
        const titleEl = group.querySelector<SVGTextElement>('.rt-scene-title');

        sceneElementRefs.set(sceneId, {
            path: pathEl,
            numberSquare: numberSquareBySceneId.get(sceneId) ?? null,
            numberText: numberTextBySceneId.get(sceneId) ?? null,
            title: titleEl ?? null,
        });
    });

    const fadeTargets: SVGElement[] = [];
    const seen = new Set<SVGElement>();
    svg.querySelectorAll<SVGElement>('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title').forEach(el => {
        if (!seen.has(el)) {
            fadeTargets.push(el);
            seen.add(el);
        }
    });

    let currentHoveredSceneId: string | null = null;
    let globalFadeApplied = false;

    const applyGlobalFade = () => {
        if (globalFadeApplied) return;
        fadeTargets.forEach(el => el.classList.add('rt-non-selected'));
        globalFadeApplied = true;
    };

    const clearGlobalFade = () => {
        if (!globalFadeApplied) return;
        fadeTargets.forEach(el => el.classList.remove('rt-non-selected'));
        globalFadeApplied = false;
    };

    const highlightScene = (sceneId: string): void => {
        const refs = sceneElementRefs.get(sceneId);
        if (!refs) return;

        // Highlight the primary scene
        if (refs.path) {
            refs.path.classList.add('rt-selected');
            refs.path.classList.remove('rt-non-selected');
        }
        if (refs.numberSquare) {
            refs.numberSquare.classList.remove('rt-non-selected');
        }
        if (refs.numberText) {
            refs.numberText.classList.remove('rt-non-selected');
        }
        if (refs.title) {
            refs.title.classList.remove('rt-non-selected');
        }

        // Find and highlight all matching scenes in other rings by data-path
        const primaryGroup = refs.path?.closest('.rt-scene-group[data-item-type="Scene"]');
        const currentPathAttr = primaryGroup?.getAttribute('data-path');
        if (currentPathAttr) {
            const matches = svg.querySelectorAll(`.rt-scene-group[data-item-type="Scene"][data-path="${currentPathAttr}"]`);
            matches.forEach(mg => {
                const matchSceneId = getSceneIdFromGroup(mg);
                if (!matchSceneId || matchSceneId === sceneId) return;
                
                const matchRefs = sceneElementRefs.get(matchSceneId);
                if (!matchRefs) return;
                
                if (matchRefs.path) {
                    matchRefs.path.classList.add('rt-selected');
                    matchRefs.path.classList.remove('rt-non-selected');
                }
                if (matchRefs.numberSquare) {
                    matchRefs.numberSquare.classList.remove('rt-non-selected');
                }
                if (matchRefs.numberText) {
                    matchRefs.numberText.classList.remove('rt-non-selected');
                }
                if (matchRefs.title) {
                    matchRefs.title.classList.remove('rt-non-selected');
                }
            });
        }
    };

    const unhighlightScene = (sceneId: string, keepFaded: boolean): void => {
        const refs = sceneElementRefs.get(sceneId);
        if (!refs) return;

        // Unhighlight the primary scene
        if (refs.path) {
            refs.path.classList.remove('rt-selected');
            if (keepFaded) {
                refs.path.classList.add('rt-non-selected');
            } else {
                refs.path.classList.remove('rt-non-selected');
            }
        }

        const toggleFade = (el: SVGElement | null) => {
            if (!el) return;
            if (keepFaded) {
                el.classList.add('rt-non-selected');
            } else {
                el.classList.remove('rt-non-selected');
            }
        };

        toggleFade(refs.numberSquare);
        toggleFade(refs.numberText);
        toggleFade(refs.title);

        // Find and unhighlight all matching scenes in other rings by data-path
        const primaryGroup = refs.path?.closest('.rt-scene-group[data-item-type="Scene"]');
        const currentPathAttr = primaryGroup?.getAttribute('data-path');
        if (currentPathAttr) {
            const matches = svg.querySelectorAll(`.rt-scene-group[data-item-type="Scene"][data-path="${currentPathAttr}"]`);
            matches.forEach(mg => {
                const matchSceneId = getSceneIdFromGroup(mg);
                if (!matchSceneId || matchSceneId === sceneId) return;
                
                const matchRefs = sceneElementRefs.get(matchSceneId);
                if (!matchRefs) return;
                
                if (matchRefs.path) {
                    matchRefs.path.classList.remove('rt-selected');
                    if (keepFaded) {
                        matchRefs.path.classList.add('rt-non-selected');
                    } else {
                        matchRefs.path.classList.remove('rt-non-selected');
                    }
                }
                
                toggleFade(matchRefs.numberSquare);
                toggleFade(matchRefs.numberText);
                toggleFade(matchRefs.title);
            });
        }
    };

    // Register hover handlers for Scene elements
    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerover', (e: PointerEvent) => {
        // Suspend hover synopsis reveal when shift mode is active
        if (isShiftModeActive()) {
            return;
        }
        
        const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
        if (!g) return;
        
        const sid = sceneIdCache.get(g) ?? getSceneIdFromGroup(g);
        if (!sid) return;

        if (currentHoveredSceneId === sid) {
            const syn = synopsisBySceneId.get(sid);
            if (syn) {
                syn.classList.add('rt-visible');
                view.plugin.updateSynopsisPosition?.(syn, e as unknown as MouseEvent, svg, sid);
            }
            if (g.classList.contains('rt-chronologue-warning')) {
                showWhenFieldWarning(svg, g, e as unknown as MouseEvent);
            } else {
                hideWhenFieldWarning(svg);
            }
            return;
        }

        const previousSceneId = currentHoveredSceneId;
        applyGlobalFade();
        currentHoveredSceneId = sid;

        if (previousSceneId) {
            const previousSynopsis = synopsisBySceneId.get(previousSceneId);
            if (previousSynopsis) {
                previousSynopsis.classList.remove('rt-visible');
            }
            unhighlightScene(previousSceneId, true);
        }

        // Add scene-hover class to hide subplot labels during hover
        svg.classList.add('scene-hover');
        
        const syn = synopsisBySceneId.get(sid);
        if (syn) {
            // Calculate position BEFORE making visible to prevent flicker in wrong location
            view.plugin.updateSynopsisPosition?.(syn, e as unknown as MouseEvent, svg, sid);
            syn.classList.add('rt-visible');
        }
        
        highlightScene(sid);
        
        // Use manager for scene title expansion
        manager.onSceneHover(g, sid);
        
        // Show warning for scenes without When field
        if (g.classList.contains('rt-chronologue-warning')) {
            showWhenFieldWarning(svg, g, e as unknown as MouseEvent);
        } else {
            hideWhenFieldWarning(svg);
        }
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', (e: PointerEvent) => {
        const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
        if (!g) return;
        
        const sid = sceneIdCache.get(g) ?? getSceneIdFromGroup(g);
        if (!sid) return;

        const related = e.relatedTarget as Element | null;

        // Always cleanup manager state (angles, etc.) even when moving to another scene
        manager.onSceneLeave();

        // If moving to another scene, allow the other handler to take over without clearing shared state
        if (related?.closest('.rt-scene-group[data-item-type="Scene"]')) {
            return;
        }

        const syn = synopsisBySceneId.get(sid);
        if (syn) {
            syn.classList.remove('rt-visible');
        }

        if (currentHoveredSceneId) {
            unhighlightScene(currentHoveredSceneId, false);
            currentHoveredSceneId = null;
        }

        // Remove scene-hover class and restore default styling
        svg.classList.remove('scene-hover');
        clearGlobalFade();
        hideWhenFieldWarning(svg);
    });
}

/**
 * Setup scene click interactions for opening files
 */
function setupSceneClickInteractions(view: ChronologueView, svg: SVGSVGElement): void {
    view.registerDomEvent(svg as unknown as HTMLElement, 'click', async (e: MouseEvent) => {
        const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
        if (!g) return;
        
        // When shift mode is active, delegate to shift controller
        if (isShiftModeActive()) {
            const handled = (view as any).handleShiftModeClick?.(e, g);
            if (handled) {
                return; // Shift mode handled the click
            }
        }
        
        // Handle dominant subplot selection for scenes in multiple subplots
        const scenes = view.sceneData || (view as any).scenes || [];
        if (scenes.length > 0) {
            await handleDominantSubplotSelection(view, g, svg, scenes);
        }
        
        // Normal behavior: open scene file
        e.stopPropagation();
        
        const encodedPath = g.getAttribute('data-path');
        if (!encodedPath) return;
        
        const filePath = decodeURIComponent(encodedPath);
        if (view.plugin.app) {
            const file = view.plugin.app.vault.getAbstractFileByPath(filePath);
            if (file instanceof TFile) {
                await openOrRevealFile((view.plugin as any).app, file);
            }
        }
    });
}

/**
 * Show warning tooltip for scenes without When field
 */
function showWhenFieldWarning(svg: SVGSVGElement, sceneGroup: Element, event: MouseEvent): void {
    // Remove existing warning
    hideWhenFieldWarning(svg);
    
    // Create warning tooltip
    const warning = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    warning.setAttribute('class', 'rt-when-field-warning');
    
    const x = event.clientX;
    const y = event.clientY;
    
    warning.innerHTML = ` // SAFE: innerHTML used for SVG element creation from trusted internal template
        <rect x="${x - 60}" y="${y - 30}" width="120" height="20" 
              rx="4" fill="var(--background-primary)" 
              stroke="var(--text-error)" stroke-width="1"/>
        <text x="${x}" y="${y - 15}" 
              text-anchor="middle" dominant-baseline="middle"
              font-family="var(--font-text)" font-size="10" font-weight="600"
              fill="var(--text-error)">
            Missing When field
        </text>
    `;
    
    svg.appendChild(warning);
}

/**
 * Hide warning tooltip
 */
function hideWhenFieldWarning(svg: SVGSVGElement): void {
    const existingWarning = svg.querySelector('.rt-when-field-warning');
    if (existingWarning) {
        existingWarning.remove();
    }
}
