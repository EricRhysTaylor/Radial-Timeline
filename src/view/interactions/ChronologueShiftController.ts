/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { Scene } from '../../main';
import { parseWhenField, formatElapsedTime } from '../../utils/date';
import { renderElapsedTimeArc } from '../../renderer/components/ChronologueTimeline';

// Base SVG dimensions (source viewBox size)
const SHIFT_BUTTON_BASE_WIDTH = 133; // Base width from SVG path
const SHIFT_BUTTON_BASE_HEIGHT = 68; // Base height from SVG path

// Target visual sizes (scale UP from smaller base to preserve stroke width)
const SHIFT_BUTTON_INACTIVE_WIDTH = 106; // Target width when inactive
const SHIFT_BUTTON_ACTIVE_WIDTH = 128; // Target width when active (20% larger)

// Calculate scale factors (scaling UP from base size)
const SHIFT_BUTTON_BASE_SCALE = SHIFT_BUTTON_INACTIVE_WIDTH / SHIFT_BUTTON_BASE_WIDTH; // ~0.797 - inactive
const SHIFT_BUTTON_ACTIVE_SCALE = SHIFT_BUTTON_ACTIVE_WIDTH / SHIFT_BUTTON_BASE_WIDTH; // ~0.962 - active

// Shift button positioning constants
const SHIFT_BUTTON_POS_Y = -750; // Same y-axis as mode pages
const SHIFT_BUTTON_POS_X = -700; // Left side position

const ELAPSED_ARC_STROKE_WIDTH = 3;
const ELAPSED_ARC_OFFSET = 6; // Offset from the outer sceneradius to position the elapsed time arc between the main arc and the tick marks
const ELAPSED_TICK_LENGTH = 7; // Length of the tick marks (6-8px as specified)

export interface ChronologueShiftView {
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
    plugin: {
        refreshTimelineIfNeeded?: (path: string | null) => void;
        [key: string]: any; // SAFE: any type used for facade extension by downstream plugins
    };
    currentMode: string;
    sceneData?: Scene[]; // Full scene data from view
    [key: string]: any; // SAFE: any type used for additional runtime fields from Obsidian
}

interface SceneGeometryInfo {
    startAngle: number;
    outerRadius: number | null;
    ring: number;
}

// Export function to check if shift mode is active (for use in other modules)
let globalShiftModeActive = false;
export function isShiftModeActive(): boolean {
    return globalShiftModeActive;
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
    let selectedScenes: Scene[] = []; // Locked scenes (stay selected)
    let hoveredScenePath: string | null = null; // Currently hovered scene (encoded path)
    let elapsedTimeClickCount = 0;
    
    // Calculate outerRadius from SVG viewBox or use default
    const viewBox = svg.getAttribute('viewBox');
    let outerRadius = 300; // Default fallback
    if (viewBox) {
        const [, , width, height] = viewBox.split(' ').map(parseFloat);
        const size = Math.min(width, height);
        outerRadius = size / 2 - 50; // Approximate outer radius (adjust margin as needed)
    }
    
    const sceneGeometry = new Map<string, SceneGeometryInfo>(); // Map scene path (encoded) to outer ring geometry
    
    // Extract scene start angles from SVG data attributes
    // Each scene group has data-start-angle attribute set during rendering
    const sceneGroups = Array.from(svg.querySelectorAll('.rt-scene-group[data-item-type="Scene"]'));
    
    sceneGroups.forEach((group) => {
        const scenePath = group.getAttribute('data-path'); // Already URL-encoded
        if (!scenePath) return;

        const ringAttr = group.getAttribute('data-ring');
        const ringIndex = ringAttr ? parseInt(ringAttr, 10) : 0;
        
        const startAngleAttr = group.getAttribute('data-start-angle');
        const outerRadiusAttr = group.getAttribute('data-outer-r');
        const angle = startAngleAttr ? parseFloat(startAngleAttr) : NaN;
        const outerRadiusValue = outerRadiusAttr ? parseFloat(outerRadiusAttr) : NaN;

        if (isNaN(angle)) return;

        const existing = sceneGeometry.get(scenePath);
        if (!existing || ringIndex > existing.ring) {
            sceneGeometry.set(scenePath, {
                startAngle: angle,
                outerRadius: !isNaN(outerRadiusValue) ? outerRadiusValue : existing?.outerRadius ?? null,
                ring: ringIndex
            });
        }
    });
    
    // Create shift button (top-left quadrant)
    const shiftButton = createShiftButton();
    svg.appendChild(shiftButton);
    
    // Function to activate shift mode
    const activateShiftMode = () => {
        if (!shiftModeActive) {
            shiftModeActive = true;
            globalShiftModeActive = true;
            updateShiftButtonState(shiftButton, true);
            // Mark SVG to indicate shift mode is active (also shows discontinuity markers via CSS)
            svg.setAttribute('data-shift-mode', 'active');
            // Make all scenes non-select (gray) - CSS handles this automatically
            applyShiftModeToAllScenes(svg);
            // Hide all synopsis elements in shift mode
            hideAllSynopsis(svg);
        }
    };
    
    // Function to deactivate shift mode
    const deactivateShiftMode = () => {
        if (shiftModeActive) {
            shiftModeActive = false;
            globalShiftModeActive = false;
            updateShiftButtonState(shiftButton, false);
            selectedScenes = [];
            hoveredScenePath = null;
            elapsedTimeClickCount = 0;
            removeElapsedTimeArc(svg);
            removeSceneHighlights(svg);
            removeShiftModeFromAllScenes(svg);
            // Remove shift mode marker (also hides discontinuity markers via CSS)
            svg.removeAttribute('data-shift-mode');
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
    
    // Track previous Caps Lock state to detect toggle
    let previousCapsLockState = false;
    // Initialize by checking current state
    try {
        // Create a test event to check initial state
        const initEvent = new KeyboardEvent('keydown', { key: 'CapsLock' });
        previousCapsLockState = initEvent.getModifierState('CapsLock');
    } catch {
        previousCapsLockState = false;
    }
    
    // Keyboard event handlers for Shift and Caps Lock
    const handleKeyDown = (e: KeyboardEvent) => {
        // Only handle when radial timeline is active and in chronologue mode
        const activeView = (view as any).app?.workspace?.activeLeaf?.view;
        if (activeView !== view || view.currentMode !== 'chronologue') {
            return;
        }
        // If focus is inside an input/textarea/select or a contenteditable element, don't intercept
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl) {
            const tag = activeEl.tagName.toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || activeEl.isContentEditable) {
                return; // Let the input handle the keystroke (typing numbers, shift, etc.)
            }
        }
        
        if (e.key === 'Shift') {
            activateShiftMode();
        } else if (e.key === 'CapsLock') {
            // Read the current CapsLock state directly from the event
            const currentCapsLockState = e.getModifierState('CapsLock');

            // Update stored state to match actual keyboard state
            previousCapsLockState = currentCapsLockState;

            // Ensure shift mode exactly reflects the CapsLock state
            if (currentCapsLockState) {
                if (!shiftModeActive) activateShiftMode();
            } else {
                if (shiftModeActive) deactivateShiftMode();
            }
        }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
        // Only handle when radial timeline is active and in chronologue mode
        const activeView = (view as any).app?.workspace?.activeLeaf?.view;
        if (activeView !== view || view.currentMode !== 'chronologue') {
            return;
        }
        // If focus is inside an input/textarea/select or a contenteditable element, don't intercept
        const activeElUp = document.activeElement as HTMLElement | null;
        if (activeElUp) {
            const tagUp = activeElUp.tagName.toUpperCase();
            if (tagUp === 'INPUT' || tagUp === 'TEXTAREA' || tagUp === 'SELECT' || activeElUp.isContentEditable) {
                return; // Let the input handle keyup
            }
        }
        
        if (e.key === 'Shift') {
            deactivateShiftMode();
        }
        // Note: Caps Lock doesn't fire keyup reliably, so we handle it in keydown
    };
    
    // Add keyboard listeners - SAFE: Manual cleanup registered in view.onClose() via _chronologueShiftCleanup
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp); // SAFE: Manual cleanup in onClose
    
    // Store cleanup function on view for later removal
    (view as any)._chronologueShiftCleanup = () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
    };
    
    // Helper function to find scene by path - use view.sceneData if available
    // path parameter is already URL-encoded (from data-path attribute)
    const findSceneByPath = (path: string): Scene | null => {
        // Decode path for comparison with Scene.path (which is decoded)
        const decodedPath = decodeURIComponent(path);
        
        // First try to find in view.sceneData or view.scenes (full Scene objects)
        const allScenes = (view as any).sceneData || (view as any).scenes;
        if (allScenes && Array.isArray(allScenes)) {
            const scene = allScenes.find((s: Scene) => s.path === decodedPath);
            if (scene) {
                return scene;
            }
        }
        
        // Fallback: verify scene group exists
        const sceneGroup = svg.querySelector(`.rt-scene-group[data-path="${path}"]`);
        if (!sceneGroup) return null;
        
        // If we can't find in sceneData, create minimal scene object
        // This shouldn't normally happen, but provides fallback
        return {
            path: decodedPath,
            when: undefined,
            title: '',
            subplot: '',
            itemType: 'Scene' as const,
        } as Scene;
    };
    
    // Setup shift mode hover handlers - MUST run before other handlers
    const setupShiftModeHover = () => {
        // Use capture phase to run before other handlers
        svg.addEventListener('pointerover', (e: PointerEvent) => {
            if (!shiftModeActive) return;
            
            const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
            if (!g) return;
            
            // Stop event propagation to prevent other handlers from showing synopsis
            e.stopPropagation();
            
            const scenePathEncoded = g.getAttribute('data-path');
            if (!scenePathEncoded) return;
            
            // Hide synopsis immediately
            const sid = g.querySelector('.rt-scene-path')?.id;
            if (sid) {
                const syn = svg.querySelector(`.rt-scene-info[data-for-scene="${sid}"]`);
                if (syn) {
                    syn.classList.remove('rt-visible');
                }
            }
            
            // Also hide all synopsis to be safe
            const allSynopsis = svg.querySelectorAll('.rt-scene-info');
            allSynopsis.forEach(syn => syn.classList.remove('rt-visible'));
            
            // Check if this scene is locked
            const isLocked = selectedScenes.some(s => {
                const encoded = s.path ? encodeURIComponent(s.path) : '';
                return encoded === scenePathEncoded;
            });
            
            if (!isLocked) {
                // Only show hover state if not locked
                hoveredScenePath = scenePathEncoded;
                g.classList.add('rt-shift-hover');
                // Activate matching number square
                const sid = g.querySelector('.rt-scene-path')?.id || null;
                setNumberSquareActiveBySceneId(svg, sid, true);
            }
        }, true); // Use capture phase
        
        // Use capture phase for pointerout too
        svg.addEventListener('pointerout', (e: PointerEvent) => {
            if (!shiftModeActive) return;
            
            const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
            if (!g) return;
            
            // Stop event propagation
            e.stopPropagation();
            
            const scenePathEncoded = g.getAttribute('data-path');
            if (!scenePathEncoded) return;
            
            // Check if this scene is locked
            const isLocked = selectedScenes.some(s => {
                const encoded = s.path ? encodeURIComponent(s.path) : '';
                return encoded === scenePathEncoded;
            });
            
            if (!isLocked) {
                // Remove hover state only if not locked
                hoveredScenePath = null;
                g.classList.remove('rt-shift-hover');
                // Deactivate matching number square
                const sid = g.querySelector('.rt-scene-path')?.id || null;
                setNumberSquareActiveBySceneId(svg, sid, false);
            }
        }, true); // Use capture phase
        
        // Store cleanup
        (view as any)._shiftModeHoverCleanup = () => {
            // Note: We can't easily remove these without tracking the exact handlers
            // They'll be cleaned up when the view is closed
        };
    };
    
    setupShiftModeHover();
    
    // Export click handler for external use (called from ChronologueMode)
    (view as any).handleShiftModeClick = (e: MouseEvent, sceneGroup: Element) => {
        if (!shiftModeActive) return false;
        
        // Prevent default scene opening behavior when in shift mode
        e.preventDefault();
        e.stopPropagation();
        
        // Get scene data from the group (path is already URL-encoded)
        const scenePathEncoded = sceneGroup.getAttribute('data-path');
        if (!scenePathEncoded) return true;
        
        // Find the actual scene object (pass encoded path)
        const scene = findSceneByPath(scenePathEncoded);
        if (!scene) return true;
        
        // Check if this scene is already locked (compare encoded paths)
        const isAlreadyLocked = selectedScenes.some(s => {
            const encoded = s.path ? encodeURIComponent(s.path) : '';
            return encoded === scenePathEncoded;
        });
        
        if (isAlreadyLocked) {
            // If clicking a locked scene, unlock it
            selectedScenes = selectedScenes.filter(s => {
                const encoded = s.path ? encodeURIComponent(s.path) : '';
                return encoded !== scenePathEncoded;
            });
            updateSceneSelection(svg, selectedScenes);
            if (selectedScenes.length < 2) {
                removeElapsedTimeArc(svg);
            } else {
                showElapsedTime(svg, selectedScenes, elapsedTimeClickCount, sceneGeometry, outerRadius);
            }
            return true;
        }
        
        // Add to selected scenes (keep only the 2 most recent)
        selectedScenes.push(scene);
        if (selectedScenes.length > 2) {
            selectedScenes = selectedScenes.slice(-2); // Keep only last 2
        }
        
        updateSceneSelection(svg, selectedScenes);
        
        // If we have 2 scenes, show elapsed time
        if (selectedScenes.length === 2) {
            showElapsedTime(svg, selectedScenes, elapsedTimeClickCount, sceneGeometry, outerRadius);
        }
        
        return true; // Indicate we handled the click
    };
    
    // Register elapsed time text click handler
    view.registerDomEvent(svg as unknown as HTMLElement, 'click', (e: MouseEvent) => {
        if (!shiftModeActive || selectedScenes.length !== 2) return;
        
        const elapsedTimeLabel = (e.target as Element).closest('.rt-elapsed-time-label');
        if (!elapsedTimeLabel) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        elapsedTimeClickCount++;
        showElapsedTime(svg, selectedScenes, elapsedTimeClickCount, sceneGeometry, outerRadius);
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
    
    button.setAttribute('transform', `translate(${SHIFT_BUTTON_POS_X}, ${SHIFT_BUTTON_POS_Y}) scale(${SHIFT_BUTTON_BASE_SCALE})`);
    
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
        // Scale up when active (like mode pages) - CSS handles colors
        button.setAttribute('transform', `${baseTransform} scale(${SHIFT_BUTTON_ACTIVE_SCALE})`);
        button.classList.add('rt-shift-mode-active');
    } else {
        // Normal scale when inactive - CSS handles colors
        button.setAttribute('transform', `${baseTransform} scale(${SHIFT_BUTTON_BASE_SCALE})`);
        button.classList.remove('rt-shift-mode-active');
    }
}

/**
 * Hide all synopsis elements
 */
function hideAllSynopsis(svg: SVGSVGElement): void {
    const allSynopsis = svg.querySelectorAll('.rt-scene-info');
    allSynopsis.forEach(syn => {
        syn.classList.remove('rt-visible');
    });
}

/**
 * Toggle number square and its text for a given sceneId
 * sceneId corresponds to the id of the scene path (e.g. "scene-path-0-2-5")
 */
function setNumberSquareActiveBySceneId(svg: SVGSVGElement, sceneId: string | null | undefined, active: boolean): void {
    if (!sceneId) return;
    const square = svg.querySelector(`.rt-number-square[data-scene-id="${sceneId}"]`);
    const text = svg.querySelector(`.rt-number-text[data-scene-id="${sceneId}"]`);
    if (square) (square as SVGElement).classList.toggle('rt-shift-active', active);
    if (text) (text as SVGElement).classList.toggle('rt-shift-active', active);
}

/**
 * Apply shift mode styling to all scenes (make them non-select/gray)
 */
function applyShiftModeToAllScenes(svg: SVGSVGElement): void {
    // CSS handles the non-select state automatically via [data-shift-mode="active"]
    // Just ensure all shift classes are removed initially
    const allSceneGroups = svg.querySelectorAll('.rt-scene-group[data-item-type="Scene"]');
    allSceneGroups.forEach(group => {
        group.classList.remove('rt-shift-hover');
        const path = group.querySelector('.rt-scene-path');
        if (path) {
            path.classList.remove('rt-shift-locked', 'rt-shift-selected');
        }
    });
}

/**
 * Remove shift mode styling from all scenes
 */
function removeShiftModeFromAllScenes(svg: SVGSVGElement): void {
    const allSceneGroups = svg.querySelectorAll('.rt-scene-group[data-item-type="Scene"]');
    allSceneGroups.forEach(group => {
        group.classList.remove('rt-shift-hover');
        const path = group.querySelector('.rt-scene-path');
        if (path) {
            path.classList.remove('rt-shift-locked', 'rt-shift-selected', 'rt-shift-non-select');
        }
    });
    // Also clear any active number squares/text
    svg.querySelectorAll('.rt-number-square.rt-shift-active').forEach(el => el.classList.remove('rt-shift-active'));
    svg.querySelectorAll('.rt-number-text.rt-shift-active').forEach(el => el.classList.remove('rt-shift-active'));
}

/**
 * Update scene selection highlights (locked scenes stay active)
 */
function updateSceneSelection(svg: SVGSVGElement, selectedScenes: Scene[]): void {
    // Remove existing locked highlights
    const allSceneGroups = svg.querySelectorAll('.rt-scene-group[data-item-type="Scene"]');
    allSceneGroups.forEach(group => {
        const path = group.querySelector('.rt-scene-path');
        if (path) {
            path.classList.remove('rt-shift-locked', 'rt-shift-selected');
        }
        // Remove hover state if it's now locked
        const scenePathEncoded = group.getAttribute('data-path');
        if (scenePathEncoded && selectedScenes.some(s => {
            const encoded = s.path ? encodeURIComponent(s.path) : '';
            return encoded === scenePathEncoded;
        })) {
            group.classList.remove('rt-shift-hover');
        }
        // Also clear number square active for all, will re-apply for selected below
        const sid = group.querySelector('.rt-scene-path')?.id || null;
        setNumberSquareActiveBySceneId(svg, sid, false);
    });
    
    // Add locked state to selected scenes
    selectedScenes.forEach(scene => {
        // Scene.path is decoded, but data-path is encoded
        const encodedPath = scene.path ? encodeURIComponent(scene.path) : '';
        if (!encodedPath) return;
        
        const sceneGroup = svg.querySelector(`.rt-scene-group[data-path="${encodedPath}"]`);
        if (sceneGroup) {
            const path = sceneGroup.querySelector('.rt-scene-path');
            if (path) {
                path.classList.add('rt-shift-locked');
                path.classList.add('rt-shift-selected'); // Legacy compatibility
                // Activate matching number square/text
                setNumberSquareActiveBySceneId(svg, (path as SVGElement).id, true);
            }
            // Remove hover state since it's now locked
            sceneGroup.classList.remove('rt-shift-hover');
        }
    });
}

/**
 * Remove scene selection highlights
 */
function removeSceneHighlights(svg: SVGSVGElement): void {
    const allSceneGroups = svg.querySelectorAll('.rt-scene-group[data-item-type="Scene"]');
    allSceneGroups.forEach(group => {
        const path = group.querySelector('.rt-scene-path');
        if (path) {
            path.classList.remove('rt-shift-selected', 'rt-shift-locked');
        }
        group.classList.remove('rt-shift-hover');
    });
    // Also clear any number square active classes
    svg.querySelectorAll('.rt-number-square.rt-shift-active').forEach(el => el.classList.remove('rt-shift-active'));
    svg.querySelectorAll('.rt-number-text.rt-shift-active').forEach(el => el.classList.remove('rt-shift-active'));
}

/**
 * Show elapsed time arc and label between two scenes
 * Connects the beginning (start angle) of each scene around the perimeter
 */
function showElapsedTime(
    svg: SVGSVGElement,
    scenes: Scene[],
    clickCount: number,
    sceneGeometry: Map<string, SceneGeometryInfo>,
    defaultOuterRadius: number
): void {
    removeElapsedTimeArc(svg);

    if (scenes.length !== 2) {
        return;
    }

    const [scene1, scene2] = scenes;
    const encodedPath1 = encodeURIComponent(scene1.path || '');
    const encodedPath2 = encodeURIComponent(scene2.path || '');
    const geometry1 = sceneGeometry.get(encodedPath1);
    const geometry2 = sceneGeometry.get(encodedPath2);

    const parseSceneDate = (scene: Scene): Date | null => {
        if (scene.when instanceof Date) return scene.when;
        if (typeof scene.when === 'string') return parseWhenField(scene.when);
        return null;
    };

    const date1 = parseSceneDate(scene1);
    const date2 = parseSceneDate(scene2);

    if (!date1 || !date2) {
        return;
    }

    const elapsedMs = Math.abs(date2.getTime() - date1.getTime());
    const elapsedTimeText = formatElapsedTime(elapsedMs, clickCount);

    if (geometry1 && geometry2) {
        const startAngleScene1 = geometry1.startAngle;
        const startAngleScene2 = geometry2.startAngle;

        const firstSceneIsEarlier = date1.getTime() <= date2.getTime();
        const startAngle = firstSceneIsEarlier ? startAngleScene1 : startAngleScene2;
        const endAngle = firstSceneIsEarlier ? startAngleScene2 : startAngleScene1;

        let normalizedStart = startAngle;
        let normalizedEnd = endAngle;
        if (normalizedEnd < normalizedStart) {
            normalizedEnd += 2 * Math.PI;
        }
        const sweep = normalizedEnd - normalizedStart;
        const largeArcFlag = sweep > Math.PI ? 1 : 0;

        const baseOuterRadius = Math.max(
            geometry1.outerRadius ?? defaultOuterRadius,
            geometry2.outerRadius ?? defaultOuterRadius,
            defaultOuterRadius
        );
        const arcRadius = baseOuterRadius + ELAPSED_ARC_OFFSET; 

        const x1 = arcRadius * Math.cos(startAngle);
        const y1 = arcRadius * Math.sin(startAngle);
        const x2 = arcRadius * Math.cos(endAngle);
        const y2 = arcRadius * Math.sin(endAngle);
        const arcPath = `M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;

        const arcGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        arcGroup.setAttribute('class', 'rt-elapsed-time-arc');
        const arcPathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arcPathElement.setAttribute('d', arcPath);
        arcPathElement.setAttribute('class', 'rt-elapsed-arc-path');
        arcGroup.appendChild(arcPathElement);
        
        // Add endpoint markers to the elapsed time arc
        const addEndpointMarker = (angle: number) => {
            const innerRadius = arcRadius;
            const outerRadius = arcRadius + ELAPSED_TICK_LENGTH;
            const innerX = innerRadius * Math.cos(angle);
            const innerY = innerRadius * Math.sin(angle);
            const outerX = outerRadius * Math.cos(angle);
            const outerY = outerRadius * Math.sin(angle);
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            marker.setAttribute('x1', `${innerX}`);
            marker.setAttribute('y1', `${innerY}`);
            marker.setAttribute('x2', `${outerX}`);
            marker.setAttribute('y2', `${outerY}`);
            marker.setAttribute('class', 'rt-elapsed-endpoint-marker');
            arcGroup.appendChild(marker);
        };

        addEndpointMarker(startAngle);
        addEndpointMarker(endAngle);

        const midpointNormalized = normalizedStart + sweep / 2;
        const midpointAngle = normalizeAngle(midpointNormalized);
        const labelRadius = arcRadius + 24; 
        const labelX = labelRadius * Math.cos(midpointAngle);
        const labelY = labelRadius * Math.sin(midpointAngle);

        const labelGroup = createElapsedTimeLabel(labelX, labelY, elapsedTimeText);

        // Append to chronologue layer and move to end (SVG rendering order = z-index)
        const chronologueArcLayer = svg.querySelector<SVGGElement>('.rt-chronologue-timeline-arc');
        if (chronologueArcLayer) {
            chronologueArcLayer.appendChild(arcGroup);
            chronologueArcLayer.appendChild(labelGroup);
            // Move the entire layer to the end of its parent to ensure it renders on top
            const parent = chronologueArcLayer.parentElement;
            if (parent) {
                parent.appendChild(chronologueArcLayer);
            }
        } else {
            svg.appendChild(arcGroup);
            svg.appendChild(labelGroup);
        }
        return;
    }

    // SAFE: renderElapsedTimeArc returns plugin-generated SVG path markup only (no user input)
    const fallbackArc = renderElapsedTimeArc(scene1, scene2, defaultOuterRadius);
    const arcGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    arcGroup.setAttribute('class', 'rt-elapsed-time-arc');
    arcGroup.innerHTML = fallbackArc; // SAFE: innerHTML used for trusted plugin-generated SVG path only

    const midpointTime = (date1.getTime() + date2.getTime()) / 2;
    const earliestTime = Math.min(date1.getTime(), date2.getTime());
    const latestTime = Math.max(date1.getTime(), date2.getTime());
    const timeRange = latestTime - earliestTime;
    const progress = timeRange > 0 ? (midpointTime - earliestTime) / timeRange : 0.5;
    const midpointAngle = -Math.PI / 2 + (progress * 2 * Math.PI);
    const labelRadius = defaultOuterRadius + 30;
    const labelX = labelRadius * Math.cos(midpointAngle);
    const labelY = labelRadius * Math.sin(midpointAngle);

    const labelGroup = createElapsedTimeLabel(labelX, labelY, elapsedTimeText);

    const chronologueArcLayer = svg.querySelector<SVGGElement>('.rt-chronologue-timeline-arc');
    if (chronologueArcLayer) {
        chronologueArcLayer.appendChild(arcGroup);
        chronologueArcLayer.appendChild(labelGroup);
        const parent = chronologueArcLayer.parentElement;
        if (parent) {
            parent.appendChild(chronologueArcLayer);
        }
    } else {
        svg.appendChild(arcGroup);
        svg.appendChild(labelGroup);
    }
}

function createElapsedTimeLabel(x: number, y: number, value: string): SVGGElement {
    const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    labelGroup.setAttribute('class', 'rt-elapsed-time-group');

    const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelText.setAttribute('x', `${x}`);
    labelText.setAttribute('y', `${y}`);
    labelText.setAttribute('text-anchor', 'middle');
    labelText.setAttribute('dominant-baseline', 'middle');
    labelText.setAttribute('fill', 'var(--interactive-accent)');
    labelText.setAttribute('class', 'rt-elapsed-time-label');
    labelText.textContent = value;

    labelGroup.appendChild(labelText);
    return labelGroup;
}

function normalizeAngle(angle: number): number {
    const twoPi = Math.PI * 2;
    let normalized = angle % twoPi;
    if (normalized < 0) {
        normalized += twoPi;
    }
    return normalized;
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
