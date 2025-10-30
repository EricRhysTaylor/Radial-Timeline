/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { TFile } from 'obsidian';
import { Scene } from '../../main';
import { setupChronologueShiftController } from '../interactions/ChronologueShiftController';
import { openOrRevealFile } from '../../utils/fileUtils';

export interface ChronologueView {
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
    plugin: {
        app: {
            vault: { getAbstractFileByPath: (path: string) => unknown };
        };
        updateSynopsisPosition: (synopsis: Element, event: MouseEvent, svg: SVGSVGElement, sceneId: string) => void;
    };
    currentMode: string;
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
    
    // Setup shift mode controller
    setupChronologueShiftController(view, svg);
    
    // Standard scene hover interactions
    setupSceneHoverInteractions(view, svg);
    
    // Scene click interactions (for opening files)
    setupSceneClickInteractions(view, svg);
}

/**
 * Setup scene hover interactions for synopsis display
 */
function setupSceneHoverInteractions(view: ChronologueView, svg: SVGSVGElement): void {
    const findSynopsisForScene = (sceneId: string): Element | null => {
        return svg.querySelector(`.rt-scene-info[data-for-scene="${sceneId}"]`);
    };

    const getSceneIdFromGroup = (group: Element): string | null => {
        const pathEl = group.querySelector('.rt-scene-path') as SVGPathElement | null;
        return pathEl?.id || null;
    };

    // Register hover handlers for Scene elements
    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerover', (e: PointerEvent) => {
        const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
        if (!g) return;
        
        const sid = getSceneIdFromGroup(g);
        if (!sid) return;
        
        // Add scene-hover class to hide subplot labels during hover
        svg.classList.add('scene-hover');
        
        const syn = findSynopsisForScene(sid);
        if (syn) {
            syn.classList.add('rt-visible');
            view.plugin.updateSynopsisPosition(syn, e as unknown as MouseEvent, svg, sid);
        }
        
        // Emphasize this scene group
        const pathEl = g.querySelector('.rt-scene-path');
        if (pathEl) pathEl.classList.add('rt-selected');
        
        // Show warning for scenes without When field
        if (g.classList.contains('rt-chronologue-warning')) {
            showWhenFieldWarning(svg, g, e as unknown as MouseEvent);
        }
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', (e: PointerEvent) => {
        const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
        if (!g) return;
        
        const sid = getSceneIdFromGroup(g);
        if (!sid) return;
        
        // Remove scene-hover class
        svg.classList.remove('scene-hover');
        
        const syn = findSynopsisForScene(sid);
        if (syn) {
            syn.classList.remove('rt-visible');
        }
        
        // Remove emphasis
        const pathEl = g.querySelector('.rt-scene-path');
        if (pathEl) pathEl.classList.remove('rt-selected');
        
        // Hide warning
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
        
        e.stopPropagation();
        
        const encodedPath = g.getAttribute('data-path');
        if (!encodedPath) return;
        
        const filePath = decodeURIComponent(encodedPath);
        const file = view.plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await openOrRevealFile((view.plugin as any).app, file);
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
