/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { Scene } from '../../main';
import { parseWhenField, formatElapsedTime } from '../../utils/date';
import { renderElapsedTimeArc } from '../../renderer/components/ChronologueTimeline';

export interface ChronologueShiftView {
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
    plugin: {
        refreshTimelineIfNeeded: (path: string | null) => void;
    };
    currentMode: string;
}

/**
 * Setup Chronologue Shift Mode Controller
 * Handles the shift button and two-scene selection for elapsed time comparison
 */
export function setupChronologueShiftController(view: ChronologueShiftView, svg: SVGSVGElement): void {
    // Only available in Chronologue mode
    if (view.currentMode !== 'chronologue') {
        return;
    }
    
    let shiftModeActive = false;
    let selectedScenes: Scene[] = [];
    let elapsedTimeClickCount = 0;
    
    // Create shift button (top-left quadrant)
    const shiftButton = createShiftButton();
    svg.appendChild(shiftButton);
    
    // Function to activate shift mode
    const activateShiftMode = () => {
        if (!shiftModeActive) {
            shiftModeActive = true;
            updateShiftButtonState(shiftButton, true);
        }
    };
    
    // Function to deactivate shift mode
    const deactivateShiftMode = () => {
        if (shiftModeActive) {
            shiftModeActive = false;
            updateShiftButtonState(shiftButton, false);
            selectedScenes = [];
            elapsedTimeClickCount = 0;
            removeElapsedTimeArc(svg);
            removeSceneHighlights(svg);
        }
    };
    
    // Register shift button click handler
    view.registerDomEvent(shiftButton as unknown as HTMLElement, 'click', (e: MouseEvent) => {
        e.stopPropagation();
        if (shiftModeActive) {
            deactivateShiftMode();
        } else {
            activateShiftMode();
        }
    });
    
    // Keyboard event handlers for Shift and Caps Lock
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Shift' || e.key === 'CapsLock') {
            activateShiftMode();
        }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === 'Shift') {
            deactivateShiftMode();
        }
    };
    
    // Add keyboard listeners - SAFE: Manual cleanup registered in view.onClose() via _chronologueShiftCleanup
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp); // SAFE: Manual cleanup in onClose
    
    // Store cleanup function on view for later removal
    (view as any)._chronologueShiftCleanup = () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
    };
    
    // Register scene click handlers when shift mode is active
    view.registerDomEvent(svg as unknown as HTMLElement, 'click', (e: MouseEvent) => {
        if (!shiftModeActive) return;
        
        const sceneGroup = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
        if (!sceneGroup) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        // Get scene data from the group
        const scenePath = sceneGroup.getAttribute('data-path');
        if (!scenePath) return;
        
        // Find the scene object (this would need to be passed in or retrieved)
        // For now, we'll create a minimal scene object
        const scene = {
            path: scenePath,
            when: new Date(), // Would need to be populated from actual scene data
            title: '',
            subplot: '',
            itemType: 'Scene',
            date: new Date().toISOString() // Add required date field as string
        } as Scene;
        
        // Add to selected scenes (keep only the 2 most recent)
        selectedScenes.push(scene);
        if (selectedScenes.length > 2) {
            selectedScenes = selectedScenes.slice(-2); // Keep only last 2
        }
        
        updateSceneSelection(svg, selectedScenes);
        
        // If we have 2 scenes, show elapsed time
        if (selectedScenes.length === 2) {
            showElapsedTime(svg, selectedScenes, elapsedTimeClickCount);
        }
    });
    
    // Register elapsed time text click handler
    view.registerDomEvent(svg as unknown as HTMLElement, 'click', (e: MouseEvent) => {
        if (!shiftModeActive || selectedScenes.length !== 2) return;
        
        const elapsedTimeLabel = (e.target as Element).closest('.rt-elapsed-time-label');
        if (!elapsedTimeLabel) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        elapsedTimeClickCount++;
        showElapsedTime(svg, selectedScenes, elapsedTimeClickCount);
    });
}

/**
 * Create the shift button SVG path
 */
function createShiftButtonShape(): string {
    return 'M0 11C0 4.92487 4.92487 0 11 0H103C119.569 0 133 13.4315 133 30V57C133 63.0751 128.075 68 122 68H11C4.92487 68 0 63.0751 0 57V11Z';
}

/**
 * Create the shift button element
 */
function createShiftButton(): SVGGElement {
    const button = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    button.setAttribute('class', 'rt-shift-mode-button');
    button.setAttribute('id', 'shift-mode-toggle');
    
    // Position on left side, same y-axis as mode pages
    const POS_Y = -750; // Same as user specified
    const POS_X = -700; // Left side
    const SCALE = 0.6; // Same scale as active mode page
    
    button.setAttribute('transform', `translate(${POS_X}, ${POS_Y}) scale(${SCALE})`);
    
    // Create path element
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', createShiftButtonShape());
    path.setAttribute('class', 'rt-shift-button-bg');
    path.setAttribute('fill', 'var(--interactive-normal)');
    path.setAttribute('stroke', 'var(--text-normal)');
    path.setAttribute('stroke-width', '2');
    
    // Create text element with up arrow
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '66.5'); // Center of button (133/2)
    text.setAttribute('y', '52'); // Near bottom like mode pages
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('class', 'rt-shift-button-text');
    text.setAttribute('fill', 'var(--text-normal)');
    text.textContent = '↑ SHIFT';
    
    // Create title for tooltip
    const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
    title.textContent = 'Toggle Shift Mode for elapsed time comparison';
    
    button.appendChild(path);
    button.appendChild(text);
    button.appendChild(title);
    
    return button;
}

/**
 * Update shift button visual state
 */
function updateShiftButtonState(button: SVGGElement, active: boolean): void {
    const bg = button.querySelector('.rt-shift-button-bg') as SVGElement;
    const text = button.querySelector('.rt-shift-button-text') as SVGElement;
    
    // Get current transform to preserve position
    const currentTransform = button.getAttribute('transform') || '';
    const baseTransform = currentTransform.replace(/scale\([^)]+\)/, '').trim();
    
    if (active) {
        // Scale up when active (like mode pages)
        button.setAttribute('transform', `${baseTransform} scale(0.72)`); // 0.6 * 1.2 = 0.72
        bg.setAttribute('fill', 'var(--interactive-accent)');
        bg.setAttribute('stroke', 'var(--text-normal)');
        text.setAttribute('fill', 'var(--text-on-accent)');
        button.classList.add('rt-shift-mode-active');
    } else {
        // Normal scale when inactive
        button.setAttribute('transform', `${baseTransform} scale(0.6)`);
        bg.setAttribute('fill', 'var(--interactive-normal)');
        bg.setAttribute('stroke', 'var(--text-normal)');
        text.setAttribute('fill', 'var(--text-normal)');
        button.classList.remove('rt-shift-mode-active');
    }
}

/**
 * Update scene selection highlights
 */
function updateSceneSelection(svg: SVGSVGElement, selectedScenes: Scene[]): void {
    // Remove existing highlights
    removeSceneHighlights(svg);
    
    // Add highlights for selected scenes
    selectedScenes.forEach(scene => {
        const sceneGroup = svg.querySelector(`[data-path="${scene.path}"]`);
        if (sceneGroup) {
            const path = sceneGroup.querySelector('.rt-scene-path');
            if (path) {
                path.classList.add('rt-shift-selected');
            }
        }
    });
}

/**
 * Remove scene selection highlights
 */
function removeSceneHighlights(svg: SVGSVGElement): void {
    const highlightedPaths = svg.querySelectorAll('.rt-shift-selected');
    highlightedPaths.forEach(path => {
        path.classList.remove('rt-shift-selected');
    });
}

/**
 * Show elapsed time arc and label between two scenes
 */
function showElapsedTime(svg: SVGSVGElement, scenes: Scene[], clickCount: number): void {
    // Remove existing elapsed time display
    removeElapsedTimeArc(svg);
    
    if (scenes.length !== 2) return;
    
    const [scene1, scene2] = scenes;
    const date1 = parseWhenField(typeof scene1.when === 'string' ? scene1.when : '');
    const date2 = parseWhenField(typeof scene2.when === 'string' ? scene2.when : '');
    
    if (!date1 || !date2) return;
    
    const elapsedMs = Math.abs(date2.getTime() - date1.getTime());
    const elapsedTimeText = formatElapsedTime(elapsedMs, clickCount);
    
    // Get outer radius (would need to be passed in or calculated)
    const outerRadius = 300; // Placeholder - would need actual radius
    
    // Render elapsed time arc
    const elapsedTimeArc = renderElapsedTimeArc(scene1, scene2, outerRadius);
    
    // Create elapsed time label group
    const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    labelGroup.setAttribute('class', 'rt-elapsed-time-group');
    
    // Position label at midpoint of arc
    const midpointAngle = (parseWhenField(typeof scene1.when === 'string' ? scene1.when : '')!.getTime() + parseWhenField(typeof scene2.when === 'string' ? scene2.when : '')!.getTime()) / 2;
    const labelRadius = outerRadius + 30;
    const labelX = labelRadius * Math.cos(midpointAngle);
    const labelY = labelRadius * Math.sin(midpointAngle);
    
    labelGroup.innerHTML = ` // SAFE: innerHTML used for SVG element creation from trusted internal template
        <rect x="${labelX - 40}" y="${labelY - 10}" width="80" height="20" 
              rx="4" fill="var(--background-primary)" 
              stroke="var(--interactive-accent)" stroke-width="1"/>
        <text x="${labelX}" y="${labelY + 3}" 
              text-anchor="middle" dominant-baseline="middle"
              font-family="var(--font-text)" font-size="10" font-weight="600"
              fill="var(--interactive-accent)" class="rt-elapsed-time-label">
            ${elapsedTimeText}
        </text>
    `;
    
    // Add to SVG
    const arcGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    arcGroup.innerHTML = elapsedTimeArc; // SAFE: innerHTML used for SVG arc from trusted renderElapsedTimeArc function
    svg.appendChild(arcGroup);
    svg.appendChild(labelGroup);
}

/**
 * Remove elapsed time arc and label
 */
function removeElapsedTimeArc(svg: SVGSVGElement): void {
    const existingArc = svg.querySelector('.rt-elapsed-time-arc');
    const existingGroup = svg.querySelector('.rt-elapsed-time-group');
    
    if (existingArc) existingArc.remove();
    if (existingGroup) existingGroup.remove();
}
