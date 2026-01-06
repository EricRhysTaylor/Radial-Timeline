/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { setIcon } from 'obsidian';
import type { TimelineItem } from '../../types';
import type { PlanetaryProfile, RuntimeContentType } from '../../types/settings';
import { getActivePlanetaryProfile, validatePlanetaryProfile, convertFromEarth, formatElapsedTimePlanetary, formatPlanetaryDateAdaptive } from '../../utils/planetaryTime';
import { parseWhenField, formatElapsedTime } from '../../utils/date';
import { renderElapsedTimeArc } from '../../renderer/components/ChronologueTimeline';
import { parseRuntimeField, formatRuntimeValue } from '../../utils/runtimeEstimator';
import {
    ELAPSED_ARC_RADIUS,
    ELAPSED_TICK_LENGTH,
    SHIFT_BUTTON_POS_X,
    SHIFT_BUTTON_POS_Y,
    RUNTIME_SLIDER_POS_X,
    RUNTIME_SLIDER_POS_Y,
    RUNTIME_SLIDER_WIDTH,
    RUNTIME_SLIDER_HEIGHT
} from '../../renderer/layout/LayoutConstants';

// Scaling applied on click/activation
const BUTTON_ACTIVE_SCALE = 1.2;

export interface ChronologueShiftView {
    registerDomEvent: (
        el: HTMLElement | Window | Document,
        event: string,
        handler: (ev: Event) => void,
        options?: boolean | AddEventListenerOptions
    ) => void;
    register: (cb: () => void) => void;
    plugin: {
        refreshTimelineIfNeeded?: (path: string | null) => void;
        [key: string]: any; // SAFE: any type used for facade extension by downstream plugins
    };
    currentMode: string;
    sceneData?: TimelineItem[]; // Full scene data from view
    [key: string]: any; // SAFE: any type used for additional runtime fields from Obsidian
}

interface SceneGeometryInfo {
    startAngle: number;
    outerRadius: number | null;
    ring: number;
}

// Export function to check if shift mode is active (for use in other modules)
// Export function to check if shift mode is active (for use in other modules)
let globalShiftModeActive = false;
export function isShiftModeActive(): boolean {
    return globalShiftModeActive;
}

// Export function to check if alien mode is active
let globalAlienModeActive = false;
export function isAlienModeActive(): boolean {
    return globalAlienModeActive;
}

// Export function to check if runtime mode is active
let globalRuntimeModeActive = false;
export function isRuntimeModeActive(): boolean {
    return globalRuntimeModeActive;
}

// Store runtime cap percent globally for renderer access
let globalRuntimeCapPercent: number = 100;
export function getRuntimeCapPercent(): number {
    return globalRuntimeCapPercent;
}
export function setRuntimeCapPercent(percent: number): void {
    globalRuntimeCapPercent = percent;
}

/**
 * Reset the global shift/alien/runtime mode state
 * Called when exiting Chronologue mode to ensure clean state
 */
export function resetShiftModeState(): void {
    globalShiftModeActive = false;
    globalAlienModeActive = false;
    globalRuntimeModeActive = false;
    globalRuntimeCapPercent = 100;
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
    let alienModeActive = false;
    let runtimeModeActive = false;
    let selectedScenes: TimelineItem[] = []; // Locked scenes (stay selected)
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

    // Cache scene groups by scene ID for O(1) lookup
    const sceneGroupBySceneId = new Map<string, Element>();
    const sceneSubplotIndexBySceneId = new Map<string, number>();
    const numberSquareBySceneId = new Map<string, SVGElement>();
    const numberTextBySceneId = new Map<string, SVGElement>();

    // Pre-compute and cache all subplot colors to avoid getComputedStyle() calls
    const subplotColors: string[] = [];
    for (let i = 0; i < 16; i++) {
        const varName = `--rt-subplot-colors-${i}`;
        const computed = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        subplotColors[i] = computed || '#EFBDEB';
    }

    // Cache synopsis elements for fast lookup (avoiding querySelectorAll on every hover)
    const allSynopsisElements: Element[] = Array.from(svg.querySelectorAll('.rt-scene-info'));
    const synopsisBySceneId = new Map<string, Element>();
    allSynopsisElements.forEach(synopsis => {
        const sceneId = synopsis.getAttribute('data-for-scene');
        if (sceneId) {
            synopsisBySceneId.set(sceneId, synopsis);
        }
    });

    // Cache scene ID lookups for fast access
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

    // Extract scene start angles from SVG data attributes
    // Each scene group has data-start-angle attribute set during rendering
    const sceneGroups = Array.from(svg.querySelectorAll('.rt-scene-group[data-item-type="Scene"]'));

    sceneGroups.forEach((group) => {
        // Cache scene group by scene ID for fast lookup
        const sceneId = getSceneIdFromGroup(group);
        if (sceneId) {
            sceneGroupBySceneId.set(sceneId, group);

            // Cache subplot index
            const subplotIndexAttr = group.getAttribute('data-subplot-color-index') || group.getAttribute('data-subplot-index');
            if (subplotIndexAttr) {
                const subplotIndex = parseInt(subplotIndexAttr, 10);
                if (!isNaN(subplotIndex)) {
                    sceneSubplotIndexBySceneId.set(sceneId, subplotIndex);
                }
            }

            // Cache number squares and text for this scene
            const square = svg.querySelector(`.rt-number-square[data-scene-id="${sceneId}"]`) as SVGElement | null;
            const text = svg.querySelector(`.rt-number-text[data-scene-id="${sceneId}"]`) as SVGElement | null;
            if (square) numberSquareBySceneId.set(sceneId, square);
            if (text) numberTextBySceneId.set(sceneId, text);
        }

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
    // Create buttons logic (Shift is always created, ALT is conditional)
    const shiftButton = createShiftButton();
    svg.appendChild(shiftButton);

    let altButton: SVGGElement | null = null;
    let rtButton: SVGGElement | null = null;
    let runtimeCapSlider: SVGGElement | null = null;
    // Use saved default from settings, fallback to 100%
    let currentRuntimeCapPercent = view.plugin.settings.runtimeCapDefaultPercent ?? 100;

    // Check if Planetary Time is enabled and active profile is valid
    const activeProfile = getActivePlanetaryProfile(view.plugin.settings);
    const isProfileValid = activeProfile ? validatePlanetaryProfile(activeProfile).ok : false;
    const shouldShowAlt = view.plugin.settings.enablePlanetaryTime && isProfileValid;

    if (shouldShowAlt) {
        altButton = createAltButton();
        svg.appendChild(altButton);
    }

    // Check if any scene has runtime data
    const checkHasRuntimeData = (): boolean => {
        const allScenes = (view as any).sceneData || (view as any).scenes || [];
        return allScenes.some((scene: TimelineItem) => {
            if (scene.itemType === 'Scene' || scene.itemType === 'Backdrop') {
                const runtime = parseRuntimeField(scene.Runtime);
                return runtime !== null && runtime > 0;
            }
            return false;
        });
    };

    const hasRuntimeData = checkHasRuntimeData();

    // Only show runtime button if runtime estimation is enabled
    const shouldShowRuntime = view.plugin.settings?.enableRuntimeEstimation ?? false;
    if (shouldShowRuntime) {
        const runtimeContentType: RuntimeContentType = view.plugin.settings?.runtimeContentType || 'novel';
        rtButton = createRtButton(runtimeContentType, !hasRuntimeData);
        svg.appendChild(rtButton);
    }

    // Calculate max runtime from all scenes for slider labels
    const calculateMaxRuntime = (): number => {
        const allScenes = (view as any).sceneData || (view as any).scenes || [];
        let maxRuntime = 0;
        allScenes.forEach((scene: TimelineItem) => {
            if (scene.itemType === 'Scene' || scene.itemType === 'Backdrop') {
                const runtime = parseRuntimeField(scene.Runtime);
                if (runtime !== null && runtime > maxRuntime) {
                    maxRuntime = runtime;
                }
            }
        });
        return maxRuntime;
    };

    // Create and show/hide runtime cap slider
    const showRuntimeCapSlider = () => {
        if (runtimeCapSlider) return; // Already showing
        
        const maxRuntime = calculateMaxRuntime();
        runtimeCapSlider = createRuntimeCapSlider(maxRuntime, currentRuntimeCapPercent, (newPercent) => {
            currentRuntimeCapPercent = newPercent;
            // Store globally for renderer to access
            setRuntimeCapPercent(newPercent);
            // Refresh timeline to apply new cap
            if (view.plugin.refreshTimelineIfNeeded) {
                view.plugin.refreshTimelineIfNeeded(null);
            }
        });
        svg.appendChild(runtimeCapSlider);
    };

    const hideRuntimeCapSlider = () => {
        if (runtimeCapSlider && runtimeCapSlider.parentNode) {
            runtimeCapSlider.parentNode.removeChild(runtimeCapSlider);
            runtimeCapSlider = null;
        }
    };

    const deactivateRuntimeMode = () => {
        if (!runtimeModeActive || !rtButton) return;
        runtimeModeActive = false;
        globalRuntimeModeActive = false;
        updateRtButtonState(rtButton, false);
        
        // Clean up selections, elapsed arc, and scene highlights
        selectedScenes = [];
        rebuildSelectedPathsSet();
        hoveredScenePath = null;
        elapsedTimeClickCount = 0;
        removeElapsedTimeArc(svg);
        removeSceneHighlights(svg);
        removeShiftModeFromAllScenes(svg);
        svg.classList.remove('rt-global-fade');
        hideRuntimeCapSlider();
        updateDateLabelsForRuntimeMode(false);
        
        svg.removeAttribute('data-shift-mode');
        if (view.plugin.refreshTimelineIfNeeded) {
            view.plugin.refreshTimelineIfNeeded(null);
        }
    };

    // Function to deactivate alien mode
    const deactivateAlienMode = () => {
        if (!altButton && !alienModeActive) return;
        alienModeActive = false;
        globalAlienModeActive = false;
        if (altButton) updateAltButtonState(altButton, false);
        updateDateLabelsForAlienMode(false);
        
        // Clear selected scenes and elapsed time arc (same as shift mode)
        selectedScenes = [];
        rebuildSelectedPathsSet();
        hoveredScenePath = null;
        elapsedTimeClickCount = 0;
        removeElapsedTimeArc(svg);
        removeSceneHighlights(svg);
        removeShiftModeFromAllScenes(svg);
        svg.classList.remove('rt-global-fade');
        
        // Clear data attribute if no other mode is active
        if (!shiftModeActive && !runtimeModeActive) {
            svg.removeAttribute('data-shift-mode');
        }
    };

    const activateShiftMode = (enableAlien: boolean = false) => {
        // Exclusive: turning on Shift disables Runtime
        deactivateRuntimeMode();

        if (!shiftModeActive) {
            shiftModeActive = true;
            globalShiftModeActive = true;
            updateShiftButtonState(shiftButton, true);
        }

        // If Alt/Alien was latched, clicking Shift should replace it
        if (!enableAlien && alienModeActive) {
            deactivateAlienMode();
        }

        // Handle Alien Logic overlap
        if (enableAlien && altButton) {
            if (!alienModeActive) {
                alienModeActive = true;
                globalAlienModeActive = true;
                updateAltButtonState(altButton, true);
            }
        } else {
            // Standard Shift activation (Alien might be on or off, usually off unless locked? 
            // Logic: If we just activate Shift (key/button), should we kill Alien? 
            // If dragging shift, we want normal. If ALT is locked, we want Alien.
            // Let's say explicit Shift activation (key) doesn't force Alien unless Alt is held.
        }

        // Visual Updates
        const modeAttr = alienModeActive ? 'alien' : 'active';
        svg.setAttribute('data-shift-mode', modeAttr);
        
        // Update date labels for alien mode
        if (alienModeActive) {
            updateDateLabelsForAlienMode(true);
        }

        // Make all scenes non-select (gray) - CSS handles this automatically
        applyShiftModeToAllScenes(svg);
        // Hide all synopsis elements in shift mode using cached array
        allSynopsisElements.forEach(syn => {
            if (syn.classList.contains('rt-visible')) {
                syn.classList.remove('rt-visible');
            }
        });

        // Check if there's a currently hovered scene and apply shift styling to it
        const hoveredGroups = svg.querySelectorAll('.rt-scene-group[data-item-type="Scene"]:hover');
        if (hoveredGroups.length > 0) {
            const hoveredGroup = hoveredGroups[0];
            const scenePathEncoded = hoveredGroup.getAttribute('data-path');
            if (scenePathEncoded) {
                hoveredScenePath = scenePathEncoded;
                hoveredGroup.classList.add('rt-shift-hover');
                // Activate matching number square with subplot color
                const sid = getSceneIdFromGroup(hoveredGroup);
                setNumberSquareActiveBySceneId(sid, true, numberSquareBySceneId, numberTextBySceneId, sceneSubplotIndexBySceneId, subplotColors);
            }
        }
    };

    // Function to deactivate shift mode
    const deactivateShiftMode = () => {
        if (shiftModeActive) {
            shiftModeActive = false;
            globalShiftModeActive = false;
            updateShiftButtonState(shiftButton, false);

            // Also kill Alien Mode
            alienModeActive = false;
            globalAlienModeActive = false;
            if (altButton) updateAltButtonState(altButton, false);
            
            // Restore Earth labels
            updateDateLabelsForAlienMode(false);

            selectedScenes = [];
            rebuildSelectedPathsSet(); // Rebuild Set after clearing
            hoveredScenePath = null;
            elapsedTimeClickCount = 0;
            removeElapsedTimeArc(svg);
            removeSceneHighlights(svg);
            removeShiftModeFromAllScenes(svg);
            // Remove shift mode marker (also hides discontinuity markers via CSS)
            svg.removeAttribute('data-shift-mode');
            svg.classList.remove('rt-global-fade');

            // Clear all regular Chronologue hover states (from normal mode)
            // This ensures we return to a clean state with no highlights
            svg.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title, .rt-discontinuity-marker').forEach(el => {
                el.classList.remove('rt-selected', 'rt-non-selected');
            });

            // Hide all synopses
            svg.querySelectorAll('.rt-scene-info.rt-visible').forEach(syn => {
                syn.classList.remove('rt-visible');
            });

            // Remove scene-hover class from SVG if present
            svg.classList.remove('scene-hover');

            // If the cursor is still hovering a scene group, re-trigger standard hover handling
            const hoveredSceneGroup = svg.querySelector('.rt-scene-group[data-item-type="Scene"]:hover');
        }
    };

    // Update all date labels around the chronologue perimeter for alien mode (planetary time)
    const updateDateLabelsForAlienMode = (enableAlien: boolean) => {
        const dateLabels = svg.querySelectorAll('.rt-month-label-outer[data-earth-date]');
        const profile = getActivePlanetaryProfile(view.plugin.settings);

        const includeTimeInLabel = (earthLabel: string): boolean =>
            /(\d{1,2}:\d{2}\s*(am|pm)?|noon|midnight)/i.test(earthLabel);
        const padTime = (value: number): string => String(Math.max(0, value)).padStart(2, '0');

        dateLabels.forEach(label => {
            const textPath = label.querySelector('textPath');
            if (!textPath) return;

            if (enableAlien && profile) {
                const earthDateStr = label.getAttribute('data-earth-date');
                if (!earthDateStr) return;

                // Store original Earth label if not already stored
                if (!label.getAttribute('data-earth-label')) {
                    const tspans = textPath.querySelectorAll('tspan');
                    if (tspans.length > 0) {
                        const lines = Array.from(tspans).map(t => t.textContent || '');
                        label.setAttribute('data-earth-label', lines.join('\n'));
                    } else {
                        label.setAttribute('data-earth-label', textPath.textContent || '');
                    }
                }
                if (!label.getAttribute('data-earth-label-html')) {
                    label.setAttribute('data-earth-label-html', textPath.innerHTML);
                }

                const earthLabel = label.getAttribute('data-earth-label') || '';
                const earthDate = new Date(earthDateStr);
                const conversion = convertFromEarth(earthDate, profile);
                if (conversion) {
                    const monthName = profile.monthNames?.[conversion.localMonthIndex] || String(conversion.localMonthIndex + 1);
                    const isBoundary = label.classList.contains('rt-date-boundary');

                    if (isBoundary) {
                        // Boundary labels keep their multi-line layout
                        // Uses a cleaner adaptive format for boundaries too
                        const alienLines: string[] = [];
                        if (profile.epochLabel) alienLines.push(profile.epochLabel);
                        alienLines.push(`YEAR ${conversion.localYear}`);
                        alienLines.push(`${monthName} ${conversion.localDayOfMonth}`);
                        if (includeTimeInLabel(earthLabel)) {
                            alienLines.push(`${padTime(conversion.localHours)}:${padTime(conversion.localMinutes)}`);
                        }

                        while (textPath.firstChild) textPath.removeChild(textPath.firstChild);
                        alienLines.forEach((line, i) => {
                            const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                            tspan.setAttribute('x', '0');
                            tspan.setAttribute('dy', i === 0 ? '0' : '0.9em');
                            tspan.textContent = line;
                            textPath.appendChild(tspan);
                        });
                    } else {
                        // Regular perimeter ticks use the new adaptive short format
                        const alienText = formatPlanetaryDateAdaptive(conversion, earthLabel);
                        
                        while (textPath.firstChild) textPath.removeChild(textPath.firstChild);
                        textPath.textContent = alienText;
                    }
                }
            } else {
                // Restore Earth label
                const earthLabelHtml = label.getAttribute('data-earth-label-html');
                const earthLabel = label.getAttribute('data-earth-label');
                if (earthLabelHtml) {
                    textPath.innerHTML = earthLabelHtml; // SAFE: innerHTML used for restoring saved SVG tspan structure
                } else if (earthLabel) {
                    while (textPath.firstChild) textPath.removeChild(textPath.firstChild);
                    if (earthLabel.includes('\n')) {
                        earthLabel.split('\n').forEach((line, i) => {
                            const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                            tspan.setAttribute('x', '0');
                            tspan.setAttribute('dy', i === 0 ? '0' : '0.9em');
                            tspan.textContent = line;
                            textPath.appendChild(tspan);
                        });
                    } else {
                        textPath.textContent = earthLabel;
                    }
                }
            }
        });
    };

    // Update date labels for Runtime mode (shows cumulative runtime at each scene position)
    const updateDateLabelsForRuntimeMode = (enableRuntime: boolean) => {
        const dateLabels = svg.querySelectorAll('.rt-month-label-outer');
        const allScenes: TimelineItem[] = (view as any).sceneData || (view as any).scenes || [];
        
        // Build chronologically sorted scene list (matching buildChronologueOuterLabels)
        // and calculate cumulative runtime at each scene index
        const cumulativeRuntimeByIndex = new Map<number, number>();
        let totalRuntimeSeconds = 0;
        
        if (enableRuntime && allScenes.length > 0) {
            // Filter to scenes only (exclude beats and backdrops) and deduplicate
            const seenPaths = new Set<string>();
            const scenesOnly: TimelineItem[] = [];
            allScenes.forEach(s => {
                if (s.itemType === 'Scene') {
                    const key = s.path || `${s.title || ''}::${String(s.when || '')}`;
                    if (!seenPaths.has(key)) {
                        seenPaths.add(key);
                        scenesOnly.push(s);
                    }
                }
            });
            
            // Sort chronologically by When date (same as buildChronologueOuterLabels)
            const sortedScenes = scenesOnly.slice().sort((a, b) => {
                const aWhen = a.when instanceof Date ? a.when : null;
                const bWhen = b.when instanceof Date ? b.when : null;
                if (aWhen && bWhen) return aWhen.getTime() - bWhen.getTime();
                if (!aWhen && bWhen) return -1;
                if (aWhen && !bWhen) return 1;
                return 0;
            });
            
            // Calculate cumulative runtime at end of each scene
            let cumulativeRuntime = 0;
            sortedScenes.forEach((scene, idx) => {
                const runtime = parseRuntimeField(scene.Runtime);
                if (runtime !== null && runtime > 0) {
                    cumulativeRuntime += runtime;
                }
                cumulativeRuntimeByIndex.set(idx, cumulativeRuntime);
            });
            totalRuntimeSeconds = cumulativeRuntime;
        }
        
        const totalRuntimeLabel = formatRuntimeValue(totalRuntimeSeconds);
        
        dateLabels.forEach(label => {
            const textPath = label.querySelector('textPath');
            if (!textPath) return;
            
            const isFirst = label.classList.contains('rt-date-first');
            const isLast = label.classList.contains('rt-date-last');
            const sceneIndexAttr = label.getAttribute('data-scene-index');
            const sceneIndex = sceneIndexAttr !== null ? parseInt(sceneIndexAttr, 10) : null;
            
            if (enableRuntime) {
                // Store original label if not already stored
                if (!label.getAttribute('data-earth-label')) {
                    const tspans = textPath.querySelectorAll('tspan');
                    if (tspans.length > 0) {
                        const lines = Array.from(tspans).map(t => t.textContent || '');
                        label.setAttribute('data-earth-label', lines.join('\n'));
                    } else {
                        label.setAttribute('data-earth-label', textPath.textContent || '');
                    }
                }
                if (!label.getAttribute('data-earth-label-html')) {
                    label.setAttribute('data-earth-label-html', textPath.innerHTML);
                }
                
                if (isFirst) {
                    // First label shows "00:00"
                    while (textPath.firstChild) textPath.removeChild(textPath.firstChild);
                    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                    tspan.setAttribute('x', '0');
                    tspan.setAttribute('dy', '0');
                    tspan.textContent = '00:00';
                    textPath.appendChild(tspan);
                } else if (isLast) {
                    // Last label shows total runtime
                    while (textPath.firstChild) textPath.removeChild(textPath.firstChild);
                    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                    tspan.setAttribute('x', '0');
                    tspan.setAttribute('dy', '0');
                    tspan.textContent = totalRuntimeLabel;
                    textPath.appendChild(tspan);
                } else if (sceneIndex !== null && sceneIndex >= 0) {
                    // Show cumulative runtime BEFORE this scene (tick is at START of scene arc)
                    // For scene N, show sum of runtimes for scenes 0 to N-1
                    const cumulativeBeforeScene = sceneIndex > 0 && cumulativeRuntimeByIndex.has(sceneIndex - 1) 
                        ? cumulativeRuntimeByIndex.get(sceneIndex - 1)! 
                        : 0;
                    const runtimeLabel = formatRuntimeValue(cumulativeBeforeScene);
                    while (textPath.firstChild) textPath.removeChild(textPath.firstChild);
                    const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                    tspan.setAttribute('x', '0');
                    tspan.setAttribute('dy', '0');
                    tspan.textContent = runtimeLabel;
                    textPath.appendChild(tspan);
                } else {
                    // No scene index - hide label (shouldn't happen normally)
                    textPath.setAttribute('data-runtime-hidden', 'true');
                    while (textPath.firstChild) textPath.removeChild(textPath.firstChild);
                }
            } else {
                // Restore Earth label
                const earthLabelHtml = label.getAttribute('data-earth-label-html');
                const earthLabel = label.getAttribute('data-earth-label');
                textPath.removeAttribute('data-runtime-hidden');
                if (earthLabelHtml) {
                    textPath.innerHTML = earthLabelHtml; // SAFE: innerHTML used for restoring saved SVG tspan structure
                } else if (earthLabel) {
                    while (textPath.firstChild) textPath.removeChild(textPath.firstChild);
                    if (earthLabel.includes('\n')) {
                        earthLabel.split('\n').forEach((line, i) => {
                            const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
                            tspan.setAttribute('x', '0');
                            tspan.setAttribute('dy', i === 0 ? '0' : '0.9em');
                            tspan.textContent = line;
                            textPath.appendChild(tspan);
                        });
                    } else {
                        textPath.textContent = earthLabel;
                    }
                }
            }
        });
    };

    const toggleAlienMode = () => {
        if (!altButton) return; // Guard clause

        if (alienModeActive) {
            // Turn OFF Alien Mode
            deactivateAlienMode();
            return;
        }

        // Turn ON Alien Mode (exclusive)
        deactivateRuntimeMode();
        if (shiftModeActive) deactivateShiftMode();
        shiftModeActive = false;
        globalShiftModeActive = false;

        alienModeActive = true;
        globalAlienModeActive = true;
        updateAltButtonState(altButton, true);
        svg.setAttribute('data-shift-mode', 'alien');
        updateDateLabelsForAlienMode(true);
    };

    const toggleRuntimeMode = () => {
        if (!rtButton) return;

        if (runtimeModeActive) {
            // Turn OFF Runtime Mode - use the unified deactivate function
            deactivateRuntimeMode();
            // Reset global runtime cap to default
            setRuntimeCapPercent(100);
        } else {
            // Turn ON Runtime Mode
            // First deactivate any other modes
            if (alienModeActive && altButton) {
                alienModeActive = false;
                globalAlienModeActive = false;
                updateAltButtonState(altButton, false);
                updateDateLabelsForAlienMode(false);
            }
            if (shiftModeActive) {
                shiftModeActive = false;
                globalShiftModeActive = false;
                updateShiftButtonState(shiftButton, false);
                selectedScenes = [];
                rebuildSelectedPathsSet();
                removeElapsedTimeArc(svg);
                removeSceneHighlights(svg);
                removeShiftModeFromAllScenes(svg);
            }
            
            runtimeModeActive = true;
            globalRuntimeModeActive = true;
            updateRtButtonState(rtButton, true);
            svg.setAttribute('data-shift-mode', 'runtime');
            updateDateLabelsForRuntimeMode(true);
            showRuntimeCapSlider();
            // Trigger timeline refresh to switch to Runtime arcs
            if (view.plugin.refreshTimelineIfNeeded) {
                view.plugin.refreshTimelineIfNeeded(null);
            }
        }
    };

    // Register shift button click handler
    view.registerDomEvent(shiftButton as unknown as HTMLElement, 'click', (e: MouseEvent) => {
        e.stopPropagation();
        if (shiftModeActive) {
            deactivateShiftMode();
        } else {
            activateShiftMode(false); // Normal shift
        }
    });

    // Register ALT button click handler
    if (altButton) {
        view.registerDomEvent(altButton as unknown as HTMLElement, 'click', (e: MouseEvent) => {
            e.stopPropagation();
            toggleAlienMode();
        });
    }

    // Register RT button click handler
    if (rtButton) {
        view.registerDomEvent(rtButton as unknown as HTMLElement, 'click', (e: MouseEvent) => {
            e.stopPropagation();
            toggleRuntimeMode();
        });
    }

    let capsLockState = false;
    let pendingCapsLockSync = false;

    const syncShiftModeToCapsLock = (isActive: boolean) => {
        if (capsLockState === isActive) {
            return;
        }
        capsLockState = isActive;
        if (isActive) {
            if (!shiftModeActive) {
                deactivateRuntimeMode();
                activateShiftMode();
            }
        } else {
            if (shiftModeActive) deactivateShiftMode();
        }
    };

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
            deactivateRuntimeMode();
            activateShiftMode(); // Shift only
        } else if (e.key === 'Alt') {
            // Alt key toggles Alien mode (same behavior as clicking the Alt button)
            // This also activates/deactivates Shift mode as needed
            if (altButton) {
                e.preventDefault(); // Prevent browser menu on Alt
                toggleAlienMode();
            }
        } else if (e.key === 'CapsLock') {
            if (e.repeat) {
                return;
            }

            const reportedState = e.getModifierState('CapsLock');
            if (reportedState !== capsLockState) {
                syncShiftModeToCapsLock(reportedState);
                pendingCapsLockSync = false;
            } else {
                // macOS reports the *previous* Caps Lock state on keydown; wait for keyup to sync
                pendingCapsLockSync = true;
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
        } else if (e.key === 'Alt') {
            // Alt key uses toggle behavior (keydown toggles, keyup does nothing)
            // State stays latched until Alt is pressed again or Shift is released
            e.preventDefault(); // Prevent browser menu on Alt
        } else if (e.key === 'CapsLock') {
            const reportedState = e.getModifierState('CapsLock');
            if (pendingCapsLockSync || reportedState !== capsLockState) {
                pendingCapsLockSync = false;
                syncShiftModeToCapsLock(reportedState);
            }
        }
    };

    // SAFE: Document-level listeners cleaned up via view.register() below
    document.addEventListener('keydown', handleKeyDown);
    // SAFE: Cleanup handled by view.register() below
    document.addEventListener('keyup', handleKeyUp);
    view.register(() => {
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);
    });

    // Store cleanup function for mode switching (removes buttons immediately)
    (view as any)._chronologueShiftCleanup = () => {
        // Remove keyboard listeners
        document.removeEventListener('keydown', handleKeyDown);
        document.removeEventListener('keyup', handleKeyUp);

        // Explicitly remove buttons and slider to ensure instant disappearance on mode switch
        if (shiftButton && shiftButton.parentNode) {
            shiftButton.parentNode.removeChild(shiftButton);
        }
        if (altButton && altButton.parentNode) {
            altButton.parentNode.removeChild(altButton);
        }
        if (rtButton && rtButton.parentNode) {
            rtButton.parentNode.removeChild(rtButton);
        }
        if (runtimeCapSlider && runtimeCapSlider.parentNode) {
            runtimeCapSlider.parentNode.removeChild(runtimeCapSlider);
        }
    };

    // Helper function to find scene by path - use view.sceneData if available
    // path parameter is already URL-encoded (from data-path attribute)
    const findSceneByPath = (path: string): TimelineItem | null => {
        // Decode path for comparison with Scene.path (which is decoded)
        const decodedPath = decodeURIComponent(path);

        // First try to find in view.sceneData or view.scenes (full Scene objects)
        const allScenes = (view as any).sceneData || (view as any).scenes;
        if (allScenes && Array.isArray(allScenes)) {
            const scene = allScenes.find((s: TimelineItem) => s.path === decodedPath);
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
        } as TimelineItem;
    };

    // Setup shift mode hover handlers - MUST run before other handlers
    const setupShiftModeHover = () => {
        // Build selected paths Set for O(1) lookups (rebuilt when scenes selected/deselected)
        let selectedPathsSet = new Set<string>();

        const rebuildSelectedPathsSet = () => {
            selectedPathsSet = new Set(selectedScenes.map(s => s.path ? encodeURIComponent(s.path) : '').filter(p => p));
        };

        // Use capture phase to run before other handlers
        // Works for Shift mode, ALT (Alien) mode, and Runtime mode
        view.registerDomEvent(svg as unknown as HTMLElement, 'pointerover', (e: PointerEvent) => {
            if (!shiftModeActive && !alienModeActive && !runtimeModeActive) return;

            const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
            if (!g) return;

            // Stop ALL event handlers (including other listeners on same element)
            e.stopImmediatePropagation();
            e.preventDefault();

            const scenePathEncoded = g.getAttribute('data-path');
            if (!scenePathEncoded) return;

            // Check if this scene is locked - O(1) lookup with Set
            const isLocked = selectedPathsSet.has(scenePathEncoded);

            if (!isLocked) {
                // Add hover class - CSS handles the visual styling
                hoveredScenePath = scenePathEncoded;
                g.classList.add('rt-shift-hover');

                // Activate number square
                const sid = getSceneIdFromGroup(g);
                setNumberSquareActiveBySceneId(sid, true, numberSquareBySceneId, numberTextBySceneId, sceneSubplotIndexBySceneId, subplotColors);
            }
        }, { capture: true }); // Use capture phase

        // Use capture phase for pointerout too
        // Works for Shift mode, ALT (Alien) mode, and Runtime mode
        view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', (e: PointerEvent) => {
            if (!shiftModeActive && !alienModeActive && !runtimeModeActive) return;

            const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
            if (!g) return;

            // Stop ALL event handlers
            e.stopImmediatePropagation();
            e.preventDefault();

            const scenePathEncoded = g.getAttribute('data-path');
            if (!scenePathEncoded) return;

            // Check if this scene is locked - O(1) lookup with Set
            const isLocked = selectedPathsSet.has(scenePathEncoded);

            if (!isLocked) {
                // Remove hover class
                hoveredScenePath = null;
                g.classList.remove('rt-shift-hover');

                // Deactivate number square
                const sid = getSceneIdFromGroup(g);
                setNumberSquareActiveBySceneId(sid, false, numberSquareBySceneId, numberTextBySceneId, sceneSubplotIndexBySceneId, subplotColors);
            }
        }, { capture: true }); // Use capture phase

        // Return function to rebuild Set when selected scenes change
        return rebuildSelectedPathsSet;
    };

    const rebuildSelectedPathsSet = setupShiftModeHover();

    // Export click handler for external use (called from ChronologueMode)
    // Works for Shift mode, ALT (Alien) mode, and Runtime mode
    (view as any).handleShiftModeClick = (e: MouseEvent, sceneGroup: Element) => {
        if (!shiftModeActive && !alienModeActive && !runtimeModeActive) return false;

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
            rebuildSelectedPathsSet(); // Rebuild Set after change
            updateSceneSelection(svg, selectedScenes, numberSquareBySceneId, numberTextBySceneId, sceneSubplotIndexBySceneId, subplotColors);
            if (selectedScenes.length < 2) {
                removeElapsedTimeArc(svg);
            } else {
                const allScenes = (view as any).sceneData || (view as any).scenes || [];
                showElapsedTime(svg, selectedScenes, elapsedTimeClickCount, sceneGeometry, outerRadius, view.plugin.settings, allScenes);
            }
            return true;
        }

        // Add to selected scenes (keep only the 2 most recent)
        selectedScenes.push(scene);
        if (selectedScenes.length > 2) {
            selectedScenes = selectedScenes.slice(-2); // Keep only last 2
        }

        rebuildSelectedPathsSet(); // Rebuild Set after change
        updateSceneSelection(svg, selectedScenes, numberSquareBySceneId, numberTextBySceneId, sceneSubplotIndexBySceneId, subplotColors);

        // If we have 2 scenes, show elapsed time
        if (selectedScenes.length === 2) {
            const allScenes = (view as any).sceneData || (view as any).scenes || [];
            showElapsedTime(svg, selectedScenes, elapsedTimeClickCount, sceneGeometry, outerRadius, view.plugin.settings, allScenes);
        }

        return true; // Indicate we handled the click
    };

    // Register elapsed time text click handler (works for Shift, ALT, and Runtime modes)
    view.registerDomEvent(svg as unknown as HTMLElement, 'click', (e: MouseEvent) => {
        if ((!shiftModeActive && !alienModeActive && !runtimeModeActive) || selectedScenes.length !== 2) return;

        const elapsedTimeLabel = (e.target as Element).closest('.rt-elapsed-time-label');
        if (!elapsedTimeLabel) return;

        e.preventDefault();
        e.stopPropagation();

        elapsedTimeClickCount++;
        const allScenes = (view as any).sceneData || (view as any).scenes || [];
        showElapsedTime(svg, selectedScenes, elapsedTimeClickCount, sceneGeometry, outerRadius, view.plugin.settings, allScenes);
    });

    // =========================================================================
    // STATE RESTORATION: Sync local state with global state after SVG refresh
    // When a refresh replaces the SVG, a new controller is created. We need to
    // restore the UI state (buttons, slider, data attributes) based on global state.
    // =========================================================================
    if (globalRuntimeModeActive && rtButton) {
        runtimeModeActive = true;
        updateRtButtonState(rtButton, true);
        svg.setAttribute('data-shift-mode', 'runtime');
        updateDateLabelsForRuntimeMode(true);
        showRuntimeCapSlider();
    } else if (globalAlienModeActive && altButton) {
        alienModeActive = true;
        shiftModeActive = true; // Alien requires shift to be active
        updateAltButtonState(altButton, true);
        updateShiftButtonState(shiftButton, true);
        svg.setAttribute('data-shift-mode', 'alien');
        updateDateLabelsForAlienMode(true);
    } else if (globalShiftModeActive) {
        shiftModeActive = true;
        updateShiftButtonState(shiftButton, true);
        svg.setAttribute('data-shift-mode', 'active');
    }
}

/**
 * Create the shift button SVG path
 */
function createShiftButtonShape(): string {
    return 'M0 11C0 4.92487 4.92487 0 11 0H67C83.5685 0 97 13.4315 97 30V44C97 50.0751 92.0751 55 86 55H11C4.92487 55 0 50.0751 0 44V11Z';
}

/**
 * Create the shift button element
 */
function createShiftButton(): SVGGElement {
    const button = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    button.setAttribute('class', 'rt-shift-mode-button');
    button.setAttribute('id', 'shift-mode-toggle');

    button.setAttribute('transform', `translate(${SHIFT_BUTTON_POS_X}, ${SHIFT_BUTTON_POS_Y})`);

    // Create path element
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', createShiftButtonShape());
    path.setAttribute('class', 'rt-shift-button-bg');
    path.setAttribute('fill', 'var(--interactive-normal)');
    path.setAttribute('stroke', 'var(--text-normal)');
    path.setAttribute('stroke-width', '2');

    // Create text element with up arrow
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '48.5'); // Center of button (97/2)
    text.setAttribute('y', '45'); // Near bottom like page icons (55 - 12 + 2px offset)
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('class', 'rt-shift-button-text');
    text.textContent = '↑ SHIFT';

    // Add tooltip data attributes for Obsidian setTooltip
    button.classList.add('rt-tooltip-target');
    button.setAttribute('data-tooltip', 'Elapsed scene time comparison & gap visualization');
    button.setAttribute('data-tooltip-placement', 'bottom');

    button.appendChild(path);
    button.appendChild(text);

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
        button.setAttribute('transform', `${baseTransform} scale(${BUTTON_ACTIVE_SCALE})`);
        button.classList.add('rt-shift-mode-active');
    } else {
        // Normal scale when inactive - CSS handles colors
        button.setAttribute('transform', `${baseTransform}`);
        button.classList.remove('rt-shift-mode-active');
    }
}

/**
 * Create the ALT button element (Left of Shift)
 */
function createAltButton(): SVGGElement {
    const button = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    button.setAttribute('class', 'rt-shift-mode-button rt-alt-button');
    button.setAttribute('id', 'alt-mode-toggle');

    // Position to the LEFT of Shift button.
    // Shift is at SHIFT_BUTTON_POS_X.
    // Space 10px.
    // Alt Button Native Width = 43px.
    const posX = SHIFT_BUTTON_POS_X - 10 - 43;
    // Align bottom of Alt button with bottom of Shift button
    // Shift height = 55, Alt height = 46, so offset = 55 - 46 = 9
    const posY = SHIFT_BUTTON_POS_Y + 9;

    button.setAttribute('transform', `translate(${posX}, ${posY})`);

    // Create path element
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', createAltButtonShape()); 
    path.setAttribute('class', 'rt-shift-button-bg');
    path.setAttribute('fill', 'var(--interactive-normal)');
    path.setAttribute('stroke', 'var(--text-normal)');
    path.setAttribute('stroke-width', '2');

    // Create text element
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '21.5'); // Center of 43
    text.setAttribute('y', '36'); // Near bottom like page icons (46 - 12 + 2px offset)
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('class', 'rt-shift-button-text');
    text.textContent = 'ALT';

    // Add tooltip data attributes for Obsidian setTooltip
    button.classList.add('rt-tooltip-target');
    button.setAttribute('data-tooltip', 'Toggle Planetary Calendar');
    button.setAttribute('data-tooltip-placement', 'bottom');

    button.appendChild(path);
    button.appendChild(text);

    return button;
}

/**
 * Create button shape for ALT (43×46)
 */
function createAltButtonShape(): string {
    return 'M42.6961 35.5616C42.6818 41.0016 38.5008 46 31.7718 46L9.73753 46C2.98561 46 0.0473404 38.6061 0.00495911 34.3114C-0.0062027 33.1802 0.00495911 29.0328 0.00495911 27.6455C0.00495911 25.6393 0.412907 19.3215 8.25278 10.1803C16.1106 1.01827 24.0073 0 26.207 2.71215e-06L32.8167 0C39.9299 0 42.6743 5.31298 42.7024 10.1803C42.7133 12.0656 42.7024 33.1802 42.6961 35.5616Z';
}

/**
 * Update ALT button visual state
 */
function updateAltButtonState(button: SVGGElement, active: boolean): void {
    // Button dimensions
    const ALT_WIDTH = 43;
    const ALT_HEIGHT = 46;
    const SHIFT_HEIGHT = 55;
    
    // Calculate base position (same as in createAltButton)
    // Y offset = SHIFT_HEIGHT - ALT_HEIGHT = 9 (bottom-aligned)
    const basePosX = SHIFT_BUTTON_POS_X - 10 - ALT_WIDTH;
    const basePosY = SHIFT_BUTTON_POS_Y + (SHIFT_HEIGHT - ALT_HEIGHT);
    
    if (active) {
        // Scale from top-right edge: offset left by the expansion amount
        const expansionX = ALT_WIDTH * (BUTTON_ACTIVE_SCALE - 1);
        const scaledPosX = basePosX - expansionX;
        
        // Keep bottoms aligned when scaled:
        // Shift scaled bottom = SHIFT_BUTTON_POS_Y + SHIFT_HEIGHT * scale
        // Alt scaled bottom should match, so:
        // scaledPosY + ALT_HEIGHT * scale = SHIFT_BUTTON_POS_Y + SHIFT_HEIGHT * scale
        // scaledPosY = SHIFT_BUTTON_POS_Y + (SHIFT_HEIGHT - ALT_HEIGHT) * scale
        const scaledPosY = SHIFT_BUTTON_POS_Y + (SHIFT_HEIGHT - ALT_HEIGHT) * BUTTON_ACTIVE_SCALE;
        
        button.setAttribute('transform', `translate(${scaledPosX}, ${scaledPosY}) scale(${BUTTON_ACTIVE_SCALE})`);
        button.classList.add('rt-shift-mode-active');
    } else {
        button.setAttribute('transform', `translate(${basePosX}, ${basePosY})`);
        button.classList.remove('rt-shift-mode-active');
    }
}

/**
 * Create the RT (Runtime) icon button element (Right of Shift button)
 * Uses Lucide icons: 'film' for screenplay, 'mic-vocal' for novel/audiobook
 * @param contentType - screenplay or novel
 * @param noData - if true, button shows warning state (no Runtime YAML data found)
 */
function createRtButton(contentType: RuntimeContentType, noData: boolean = false): SVGGElement {
    const button = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    button.setAttribute('class', 'rt-shift-mode-button rt-runtime-button');
    button.setAttribute('id', 'runtime-mode-toggle');

    // Add no-data warning class if needed
    if (noData) {
        button.classList.add('rt-runtime-no-data');
    }

    // Icon button dimensions
    const RT_SIZE = 32; // Square icon container
    const SHIFT_WIDTH = 62;
    const SHIFT_HEIGHT = 55;

    // Position to the RIGHT of Shift button (50px gap) and 15px up (net -15 from center)
    const basePosX = SHIFT_BUTTON_POS_X + SHIFT_WIDTH + 50;
    // Vertically center with shift button, then nudge up 15px
    const basePosY = SHIFT_BUTTON_POS_Y + (SHIFT_HEIGHT - RT_SIZE) / 2 - 15;

    button.setAttribute('transform', `translate(${basePosX}, ${basePosY})`);
    button.setAttribute('data-base-x', String(basePosX));
    button.setAttribute('data-base-y', String(basePosY));

    // Create a circular background
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', String(RT_SIZE / 2));
    circle.setAttribute('cy', String(RT_SIZE / 2));
    circle.setAttribute('r', String(RT_SIZE / 2));
    circle.setAttribute('class', 'rt-runtime-icon-bg');
    
    if (noData) {
        // Warning state: red-tinted background
        circle.setAttribute('fill', 'rgba(200, 60, 60, 0.15)');
        circle.setAttribute('stroke', 'var(--text-error)');
    } else {
        circle.setAttribute('fill', 'var(--background-secondary)');
        circle.setAttribute('stroke', 'var(--text-muted)');
    }
    circle.setAttribute('stroke-width', '1.5');

    // Create foreignObject to embed the Lucide icon
    const foreignObject = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
    foreignObject.setAttribute('x', '0');
    foreignObject.setAttribute('y', '0');
    foreignObject.setAttribute('width', String(RT_SIZE));
    foreignObject.setAttribute('height', String(RT_SIZE));
    foreignObject.setAttribute('class', 'rt-runtime-icon-container');

    // Create the icon wrapper div
    const iconWrapper = document.createElement('div');
    iconWrapper.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
    iconWrapper.className = 'rt-runtime-icon-wrapper';
    iconWrapper.style.cssText = `
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: none;
    `;

    // Use Obsidian's setIcon to add the Lucide icon
    const iconName = contentType === 'screenplay' ? 'film' : 'mic-vocal';
    setIcon(iconWrapper, iconName);

    // Style the icon element
    const iconSvg = iconWrapper.querySelector('svg');
    if (iconSvg) {
        if (noData) {
            // Warning state: red icon
            iconSvg.style.cssText = `
                width: 18px;
                height: 18px;
                stroke: var(--text-error);
                stroke-width: 2;
                fill: none;
            `;
        } else {
            iconSvg.style.cssText = `
                width: 18px;
                height: 18px;
                stroke: var(--text-muted);
                stroke-width: 2;
                fill: none;
            `;
        }
        iconSvg.classList.add('rt-runtime-lucide-icon');
    }

    foreignObject.appendChild(iconWrapper);

    // Add tooltip based on content type and data availability
    let tooltipText: string;
    if (noData) {
        tooltipText = 'No Runtime data found. Run "Estimate Runtime" from Command Palette to seed scene runtimes.';
    } else {
        tooltipText = contentType === 'screenplay' 
            ? 'Toggle Runtime Mode (Screenplay)' 
            : 'Toggle Runtime Mode (Audiobook/Novel)';
    }
    button.classList.add('rt-tooltip-target');
    button.setAttribute('data-tooltip', tooltipText);
    button.setAttribute('data-tooltip-placement', 'bottom');
    button.setAttribute('data-content-type', contentType);

    button.appendChild(circle);
    button.appendChild(foreignObject);

    return button;
}

/**
 * Update RT icon button visual state
 */
function updateRtButtonState(button: SVGGElement, active: boolean): void {
    const RT_SIZE = 32;
    const SHIFT_WIDTH = 62;
    const SHIFT_HEIGHT = 55;

    // Position to the RIGHT of Shift button (50px gap) and 15px up
    const basePosX = SHIFT_BUTTON_POS_X + SHIFT_WIDTH + 50;
    const basePosY = SHIFT_BUTTON_POS_Y + (SHIFT_HEIGHT - RT_SIZE) / 2 - 15;

    if (active) {
        // Scale from center
        const scaledPosX = basePosX - (RT_SIZE * (BUTTON_ACTIVE_SCALE - 1)) / 2;
        const scaledPosY = basePosY - (RT_SIZE * (BUTTON_ACTIVE_SCALE - 1)) / 2;
        
        button.setAttribute('transform', `translate(${scaledPosX}, ${scaledPosY}) scale(${BUTTON_ACTIVE_SCALE})`);
        button.classList.add('rt-shift-mode-active');
        button.classList.add('rt-runtime-mode-active');
    } else {
        button.setAttribute('transform', `translate(${basePosX}, ${basePosY})`);
        button.classList.remove('rt-shift-mode-active');
        button.classList.remove('rt-runtime-mode-active');
    }
}

/**
 * Create the runtime cap slider component
 * 5-division slider showing time values at 0%, 25%, 50%, 75%, 100% of max runtime
 * @param maxRuntimeSeconds - Maximum runtime in seconds from all scenes
 * @param initialPercent - Initial slider position (0-100)
 * @param onCapChange - Callback when cap percentage changes
 */
function createRuntimeCapSlider(
    maxRuntimeSeconds: number,
    initialPercent: number,
    onCapChange: (percent: number) => void
): SVGGElement {
    const slider = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    slider.setAttribute('class', 'rt-runtime-cap-slider');
    slider.setAttribute('transform', `translate(${RUNTIME_SLIDER_POS_X}, ${RUNTIME_SLIDER_POS_Y})`);

    const TRACK_WIDTH = RUNTIME_SLIDER_WIDTH;
    const TRACK_HEIGHT = 4;
    const HANDLE_RADIUS = 8;
    const TICK_HEIGHT = 10;
    const LABEL_Y_OFFSET = 22;
    const NUM_DIVISIONS = 5;
    const DIVISION_SPACING = TRACK_WIDTH / (NUM_DIVISIONS - 1);

    // Background track
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    track.setAttribute('x', '0');
    track.setAttribute('y', String(-TRACK_HEIGHT / 2));
    track.setAttribute('width', String(TRACK_WIDTH));
    track.setAttribute('height', String(TRACK_HEIGHT));
    track.setAttribute('rx', '1.5');
    track.setAttribute('class', 'rt-runtime-cap-track');
    slider.appendChild(track);

    // Division ticks and labels
    const percentValues = [0, 25, 50, 75, 100];
    percentValues.forEach((percent, i) => {
        const x = i * DIVISION_SPACING;
        
        // Tick mark
        const tick = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tick.setAttribute('x1', String(x));
        tick.setAttribute('y1', String(-TICK_HEIGHT / 2));
        tick.setAttribute('x2', String(x));
        tick.setAttribute('y2', String(TICK_HEIGHT / 2));
        tick.setAttribute('class', 'rt-runtime-cap-tick');
        slider.appendChild(tick);

        // Calculate time value for this percentage
        // 0% shows minimum stub (we'll label it as "min")
        // 100% shows max runtime
        let labelText: string;
        if (percent === 0) {
            labelText = 'min';
        } else {
            const seconds = Math.round((percent / 100) * maxRuntimeSeconds);
            labelText = formatRuntimeValue(seconds);
        }

        // Label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', String(x));
        label.setAttribute('y', String(LABEL_Y_OFFSET));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('class', 'rt-runtime-cap-label');
        label.textContent = labelText;
        slider.appendChild(label);
    });

    // Draggable handle
    const handleX = (initialPercent / 100) * TRACK_WIDTH;
    const handle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    handle.setAttribute('cx', String(handleX));
    handle.setAttribute('cy', '0');
    handle.setAttribute('r', String(HANDLE_RADIUS));
    handle.setAttribute('class', 'rt-runtime-cap-handle');
    slider.appendChild(handle);

    // Make handle draggable
    let isDragging = false;
    let sliderRect: DOMRect | null = null;

    const updateHandlePosition = (clientX: number) => {
        if (!sliderRect) return;
        
        // Calculate position relative to slider
        const svgElement = slider.ownerSVGElement;
        if (!svgElement) return;
        
        const point = svgElement.createSVGPoint();
        point.x = clientX;
        point.y = 0;
        
        const ctm = slider.getScreenCTM();
        if (!ctm) return;
        
        const localPoint = point.matrixTransform(ctm.inverse());
        
        // Clamp to track bounds
        const clampedX = Math.max(0, Math.min(TRACK_WIDTH, localPoint.x));
        handle.setAttribute('cx', String(clampedX));
        
        // Snap to nearest division
        const divisionIndex = Math.round(clampedX / DIVISION_SPACING);
        const snappedX = divisionIndex * DIVISION_SPACING;
        const snappedPercent = percentValues[divisionIndex];
        
        // Update handle to snapped position
        handle.setAttribute('cx', String(snappedX));
        
        // Notify callback
        onCapChange(snappedPercent);
    };

    const onPointerDown = (e: PointerEvent) => {
        isDragging = true;
        sliderRect = slider.getBoundingClientRect();
        handle.classList.add('rt-runtime-cap-handle-active');
        (e.target as Element).setPointerCapture(e.pointerId);
        updateHandlePosition(e.clientX);
    };

    const onPointerMove = (e: PointerEvent) => {
        if (!isDragging) return;
        updateHandlePosition(e.clientX);
    };

    const onPointerUp = (e: PointerEvent) => {
        if (!isDragging) return;
        isDragging = false;
        handle.classList.remove('rt-runtime-cap-handle-active');
        (e.target as Element).releasePointerCapture(e.pointerId);
    };

    handle.addEventListener('pointerdown', onPointerDown); // SAFE: SVG element; registerDomEvent not available in this helper scope
    handle.addEventListener('pointermove', onPointerMove); // SAFE: SVG element; registerDomEvent not available in this helper scope
    handle.addEventListener('pointerup', onPointerUp); // SAFE: SVG element; registerDomEvent not available in this helper scope
    handle.addEventListener('pointercancel', onPointerUp); // SAFE: SVG element; registerDomEvent not available in this helper scope

    // Also allow clicking on track to move handle
    track.addEventListener('pointerdown', (e: PointerEvent) => { // SAFE: SVG element; registerDomEvent not available in this helper scope
        sliderRect = slider.getBoundingClientRect();
        updateHandlePosition(e.clientX);
    });

    // Add tooltip
    slider.classList.add('rt-tooltip-target');
    slider.setAttribute('data-tooltip', 'Adjust runtime arc cap (drag or click)');
    slider.setAttribute('data-tooltip-placement', 'bottom');

    return slider;
}

/**
 * Toggle number square and its text for a given sceneId
 * sceneId corresponds to the id of the scene path (e.g. "scene-path-0-2-5")
 */
function setNumberSquareActiveBySceneId(
    sceneId: string | null | undefined,
    active: boolean,
    numberSquareBySceneId: Map<string, SVGElement>,
    numberTextBySceneId: Map<string, SVGElement>,
    sceneSubplotIndexBySceneId: Map<string, number>,
    subplotColors: string[]
): void {
    if (!sceneId) return;

    // Use cached elements instead of querySelector
    const square = numberSquareBySceneId.get(sceneId);
    const text = numberTextBySceneId.get(sceneId);

    if (square) {
        square.classList.toggle('rt-shift-active', active);
        // Set subplot index as data attribute for CSS to use
        if (active) {
            const subplotIndex = sceneSubplotIndexBySceneId.get(sceneId);
            if (subplotIndex !== undefined) {
                const colorIdx = subplotIndex % 16;
                square.setAttribute('data-subplot-idx', colorIdx.toString());
            }
        } else {
            square.removeAttribute('data-subplot-idx');
        }
    }

    if (text) text.classList.toggle('rt-shift-active', active);
}

/**
 * DEPRECATED - removed inline to reduce function call overhead
 */

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
function updateSceneSelection(
    svg: SVGSVGElement,
    selectedScenes: TimelineItem[],
    numberSquareBySceneId: Map<string, SVGElement>,
    numberTextBySceneId: Map<string, SVGElement>,
    sceneSubplotIndexBySceneId: Map<string, number>,
    subplotColors: string[]
): void {
    // Build a Set for O(1) lookup instead of O(n) .some()
    const selectedPaths = new Set(selectedScenes.map(s => s.path ? encodeURIComponent(s.path) : '').filter(p => p));

    // Remove existing locked highlights
    const allSceneGroups = svg.querySelectorAll('.rt-scene-group[data-item-type="Scene"]');
    allSceneGroups.forEach(group => {
        const path = group.querySelector('.rt-scene-path');
        if (path) {
            path.classList.remove('rt-shift-locked', 'rt-shift-selected');
        }
        // Remove hover state if it's now locked - O(1) lookup with Set
        const scenePathEncoded = group.getAttribute('data-path');
        if (scenePathEncoded && selectedPaths.has(scenePathEncoded)) {
            group.classList.remove('rt-shift-hover');
        }
        // Also clear number square active for all, will re-apply for selected below
        const sid = group.querySelector('.rt-scene-path')?.id || null;
        setNumberSquareActiveBySceneId(sid, false, numberSquareBySceneId, numberTextBySceneId, sceneSubplotIndexBySceneId, subplotColors);
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
                setNumberSquareActiveBySceneId((path as SVGElement).id, true, numberSquareBySceneId, numberTextBySceneId, sceneSubplotIndexBySceneId, subplotColors);
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
 * In Runtime mode, calculates cumulative runtime of all scenes between the two selected
 */
function showElapsedTime(
    svg: SVGSVGElement,
    scenes: TimelineItem[],
    clickCount: number,
    sceneGeometry: Map<string, SceneGeometryInfo>,
    defaultOuterRadius: number,
    settings?: { enablePlanetaryTime?: boolean; planetaryProfiles?: PlanetaryProfile[]; activePlanetaryProfileId?: string },
    allScenes?: TimelineItem[]
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

    const parseSceneDate = (scene: TimelineItem): Date | null => {
        if (scene.when instanceof Date) return scene.when;
        if (typeof scene.when === 'string') return parseWhenField(scene.when);
        return null;
    };

    const date1 = parseSceneDate(scene1);
    const date2 = parseSceneDate(scene2);

    if (!date1 || !date2) {
        return;
    }

    // Check if Runtime mode is active
    const isRuntimeMode = svg.getAttribute('data-shift-mode') === 'runtime';
    const isAlienMode = svg.getAttribute('data-shift-mode') === 'alien';
    const profile = settings ? getActivePlanetaryProfile(settings as any) : null;
    
    let elapsedTimeText: string;
    
    if (isRuntimeMode && allScenes) {
        // Calculate cumulative runtime of all scenes between the two selected (inclusive)
        const cumulativeSeconds = calculateCumulativeRuntime(scene1, scene2, allScenes);
        elapsedTimeText = formatRuntimeValue(cumulativeSeconds);
    } else if (isAlienMode && profile) {
        const elapsedMs = Math.abs(date2.getTime() - date1.getTime());
        elapsedTimeText = formatElapsedTimePlanetary(elapsedMs, profile, clickCount);
    } else {
        const elapsedMs = Math.abs(date2.getTime() - date1.getTime());
        elapsedTimeText = formatElapsedTime(elapsedMs, clickCount);
    }

    if (geometry1 && geometry2) {
        const startAngleScene1 = geometry1.startAngle;
        const startAngleScene2 = geometry2.startAngle;

        const firstSceneIsEarlier = date1.getTime() <= date2.getTime();
        let arcStartAngle = firstSceneIsEarlier ? startAngleScene1 : startAngleScene2;
        let arcEndAngle = firstSceneIsEarlier ? startAngleScene2 : startAngleScene1;

        // Calculate the clockwise sweep from start to end
        let normalizedStart = arcStartAngle;
        let normalizedEnd = arcEndAngle;
        if (normalizedEnd < normalizedStart) {
            normalizedEnd += 2 * Math.PI;
        }
        let sweep = normalizedEnd - normalizedStart;
        
        // Always take the SHORTER arc between two scenes
        // If clockwise sweep > π, swap endpoints so the clockwise path is now the short one
        // Keep sweepFlag = 1 (clockwise) so the arc always bulges outward from center
        if (sweep > Math.PI) {
            // Swap angles - clockwise from new start to new end is now the shorter path
            const temp = arcStartAngle;
            arcStartAngle = arcEndAngle;
            arcEndAngle = temp;
            sweep = 2 * Math.PI - sweep;
        }
        const sweepFlag = 1; // Always clockwise so arc curves outward
        const largeArcFlag = 0; // Always small arc since we're taking the shorter path

        const baseOuterRadius = Math.max(
            geometry1.outerRadius ?? defaultOuterRadius,
            geometry2.outerRadius ?? defaultOuterRadius,
            defaultOuterRadius
        );
        const arcRadius = ELAPSED_ARC_RADIUS; // Use absolute radius directly 

        const x1 = arcRadius * Math.cos(arcStartAngle);
        const y1 = arcRadius * Math.sin(arcStartAngle);
        const x2 = arcRadius * Math.cos(arcEndAngle);
        const y2 = arcRadius * Math.sin(arcEndAngle);
        const arcPath = `M ${x1} ${y1} A ${arcRadius} ${arcRadius} 0 ${largeArcFlag} ${sweepFlag} ${x2} ${y2}`;

        const arcGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        arcGroup.setAttribute('class', 'rt-elapsed-time-arc');
        const arcPathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arcPathElement.setAttribute('d', arcPath);
        arcPathElement.setAttribute('class', 'rt-elapsed-arc-path');
        arcGroup.appendChild(arcPathElement);

        // Add endpoint markers to the elapsed time arc (use original scene angles for markers)
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

        addEndpointMarker(startAngleScene1);
        addEndpointMarker(startAngleScene2);

        // Hide chronological ticks that overlap with the endpoint markers
        hideOverlappingTicks(svg, startAngleScene1, startAngleScene2);

        // ═══════════════════════════════════════════════════════════════════
        // ELAPSED TIME ARC LABEL (shows when clicking two scenes to compare)
        // NOT the duration runtime labels - those are in ChronologueTimeline.ts
        // ═══════════════════════════════════════════════════════════════════
        //
        // midpointAngle: Position label at center of the arc between two scenes
        // labelRadius: Distance from center
        //   - INCREASE = further from center (outward, away from arc)
        //   - DECREASE = closer to center (inward, toward arc)
        //   - arcRadius is ~766px, adding 24 puts label outside the arc
        //
        const midpointAngle = normalizeAngle(arcStartAngle + sweep / 2);
        const labelRadius = arcRadius + 24; // 24px outside the elapsed arc
        const labelX = labelRadius * Math.cos(midpointAngle);
        const labelY = labelRadius * Math.sin(midpointAngle);

        const labelGroup = createElapsedTimeLabel(labelX, labelY, elapsedTimeText, midpointAngle);

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

    const labelGroup = createElapsedTimeLabel(labelX, labelY, elapsedTimeText, midpointAngle);

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

function createElapsedTimeLabel(x: number, y: number, value: string, midpointAngle?: number): SVGGElement {
    const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    labelGroup.setAttribute('class', 'rt-elapsed-time-group');

    const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    labelText.setAttribute('y', `${y}`);
    labelText.setAttribute('dominant-baseline', 'middle');
    labelText.setAttribute('fill', 'var(--interactive-accent)');
    labelText.setAttribute('class', 'rt-elapsed-time-label');
    labelText.textContent = value;
    
    // Adjust text-anchor based on angle to prevent clipping at boundaries
    // Angles: -π/2 = top, 0 = right, π/2 = bottom, ±π = left
    let textAnchor = 'middle';
    let adjustedX = x;
    
    if (midpointAngle !== undefined) {
        const normalizedAngle = ((midpointAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
        
        // Right edge (around 0 radians) - anchor to end, shift left
        if (normalizedAngle > 5.5 || normalizedAngle < 0.8) {
            textAnchor = 'end';
            adjustedX = x - 10;
        }
        // Left edge (around π radians) - anchor to start, shift right
        else if (normalizedAngle > 2.4 && normalizedAngle < 3.9) {
            textAnchor = 'start';
            adjustedX = x + 10;
        }
    }
    
    labelText.setAttribute('x', `${adjustedX}`);
    labelText.setAttribute('text-anchor', textAnchor);

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

    // Restore any hidden chronological ticks
    restoreHiddenTicks(svg);
}

/**
 * Hide chronological ticks that overlap with elapsed endpoint markers
 * Uses angle-based matching to identify which ticks to hide
 */
function hideOverlappingTicks(svg: SVGSVGElement, angle1: number, angle2: number): void {
    const ANGLE_TOLERANCE = 0.01; // Radians (~0.6 degrees)

    const ticks = Array.from(svg.querySelectorAll<SVGLineElement>('.rt-chronological-tick'));

    ticks.forEach(tick => {
        // Get the tick's position from its x1, y1 coordinates (start point)
        const x1Str = tick.getAttribute('x1');
        const y1Str = tick.getAttribute('y1');

        if (!x1Str || !y1Str) return;

        const x1 = parseFloat(x1Str);
        const y1 = parseFloat(y1Str);

        // Calculate angle from coordinates
        const tickAngle = Math.atan2(y1, x1);

        // Normalize angles to [-π, π] range for comparison
        const normalizeAngle = (angle: number): number => {
            let normalized = angle;
            while (normalized > Math.PI) normalized -= 2 * Math.PI;
            while (normalized < -Math.PI) normalized += 2 * Math.PI;
            return normalized;
        };

        const normalizedTickAngle = normalizeAngle(tickAngle);
        const normalizedAngle1 = normalizeAngle(angle1);
        const normalizedAngle2 = normalizeAngle(angle2);

        // Check if tick angle matches either of the endpoint angles
        const matchesAngle1 = Math.abs(normalizedTickAngle - normalizedAngle1) < ANGLE_TOLERANCE;
        const matchesAngle2 = Math.abs(normalizedTickAngle - normalizedAngle2) < ANGLE_TOLERANCE;

        if (matchesAngle1 || matchesAngle2) {
            tick.classList.add('rt-tick-hidden');
        }
    });
}

/**
 * Restore all hidden chronological ticks
 */
function restoreHiddenTicks(svg: SVGSVGElement): void {
    const hiddenTicks = Array.from(svg.querySelectorAll<SVGLineElement>('.rt-tick-hidden'));
    hiddenTicks.forEach(tick => tick.classList.remove('rt-tick-hidden'));
}

/**
 * Calculate cumulative runtime of all scenes between two selected scenes (inclusive)
 * Uses manuscript order (order in allScenes array), NOT chronological order.
 * Simply sums all Runtime fields between the two selected scenes regardless of When dates.
 */
function calculateCumulativeRuntime(scene1: TimelineItem, scene2: TimelineItem, allScenes: TimelineItem[]): number {
    // Filter to Scene/Backdrop only and dedupe by path
    const seenPaths = new Set<string>();
    const validScenes = allScenes.filter(s => {
        if (s.itemType !== 'Scene' && s.itemType !== 'Backdrop') return false;
        if (!s.path || seenPaths.has(s.path)) return false;
        seenPaths.add(s.path);
        return true;
    });
    
    // Find indices of the two selected scenes in manuscript order
    let idx1 = -1;
    let idx2 = -1;
    
    for (let i = 0; i < validScenes.length; i++) {
        if (validScenes[i].path === scene1.path && idx1 === -1) {
            idx1 = i;
        }
        if (validScenes[i].path === scene2.path) {
            idx2 = i;
        }
    }
    
    if (idx1 === -1 || idx2 === -1) {
        // Fallback: just sum the two selected scenes
        const r1 = parseRuntimeField(scene1.Runtime) || 0;
        const r2 = parseRuntimeField(scene2.Runtime) || 0;
        return r1 + r2;
    }
    
    // Ensure startIdx <= endIdx
    const startIdx = Math.min(idx1, idx2);
    const endIdx = Math.max(idx1, idx2);
    
    // Sum runtimes from startIdx through endIdx (inclusive)
    let totalSeconds = 0;
    for (let i = startIdx; i <= endIdx; i++) {
        const runtime = parseRuntimeField(validScenes[i].Runtime);
        if (runtime !== null && runtime > 0) {
            totalSeconds += runtime;
        }
    }
    
    return totalSeconds;
}
