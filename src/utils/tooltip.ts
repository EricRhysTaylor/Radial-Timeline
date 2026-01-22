/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Unified Tooltip Utility for Radial Timeline
 * 
 * Provides consistent bubble tooltips throughout the plugin.
 * 
 * STRATEGY:
 * 1. For HTML components (Settings, Modals): Uses Obsidian's native `setTooltip` or `component.setTooltip()`.
 * 2. For SVG elements (Timeline View): Uses a CUSTOM DOM implementation (.rt-tooltip)
 *    because Obsidian's API relies on getBoundingClientRect() which can be flaky with SVG transforms,
 *    and the previous hack of creating anchor elements caused modal focus issues.
 */

import { setTooltip, ButtonComponent, ExtraButtonComponent } from 'obsidian';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

// Singleton tooltip element
let customTooltipEl: HTMLElement | null = null;
let currentTarget: Element | null = null;
let hideTimeout: number | null = null;

/**
 * Apply a tooltip to an element.
 * 
 * @param element - The target element (HTML or SVG)
 * @param text - Tooltip text to display
 * @param placement - Where to show the tooltip
 */
export function tooltip(
    element: HTMLElement | SVGElement,
    text: string,
    placement: TooltipPlacement = 'bottom'
): void {
    if (element instanceof HTMLElement) {
        // Use native Obsidian tooltip for standard HTML UI elements
        setTooltip(element, text, { placement });
    } else if (element instanceof SVGElement) {
        // Use data attributes for SVG delegation (handled by setupTooltipsFromDataAttributes)
        addTooltipData(element, text, placement);
    }
}

/**
 * Apply tooltip to an Obsidian Component (Button, etc.)
 */
export function tooltipForComponent(
    component: ButtonComponent | ExtraButtonComponent,
    text: string,
    placement: TooltipPlacement = 'bottom'
): void {
    // Access the underlying button element
    const buttonEl = (component as unknown as { buttonEl?: HTMLElement }).buttonEl;
    if (buttonEl) {
        setTooltip(buttonEl, text, { placement });
    } else {
        component.setTooltip(text);
    }
}

/**
 * Helper to add data attributes to an element for batch setup.
 */
export function addTooltipData(
    element: HTMLElement | SVGElement,
    text: string,
    placement: TooltipPlacement = 'bottom'
): void {
    element.classList.add('rt-tooltip-target');
    element.setAttribute('data-tooltip', text);
    element.setAttribute('data-tooltip-placement', placement);
}

/**
 * Setup delegated tooltip handling for SVG elements.
 * Uses a single custom .rt-tooltip DOM element for performance and compatibility.
 */
type DomEventRegistrar = (element: HTMLElement, event: string, handler: (ev: Event) => void) => void;

export function setupTooltipsFromDataAttributes(
    container: HTMLElement | SVGElement,
    registerDomEvent: DomEventRegistrar
): void {
    const svgElement = container instanceof SVGElement ? container : container.querySelector('svg');
    if (!svgElement) return;

    // Lazy initialization: singleton is created only when needed (in showCustomTooltip)

    const handleMouseOver = (e: Event) => {
        const target = (e.target as Element).closest('.rt-tooltip-target[data-tooltip]');
        if (target) {
            // Cancel any pending hide immediately when entering a tooltip target
            if (hideTimeout) {
                window.clearTimeout(hideTimeout);
                hideTimeout = null;
            }
            
            // Only update if it's a different target
            if (target !== currentTarget) {
                currentTarget = target;
                const text = target.getAttribute('data-tooltip') || '';
                const placement = (target.getAttribute('data-tooltip-placement') || 'bottom') as TooltipPlacement;
                
                if (text) {
                    showCustomTooltip(target, text, placement);
                }
            }
        }
    };

    const handleMouseOut = (e: Event) => {
        if (!currentTarget) return;
        
        const target = (e.target as Element).closest('.rt-tooltip-target[data-tooltip]');
        const relatedTarget = (e as MouseEvent).relatedTarget as Element | null;
        
        // Check if we moved to another tooltip target
        const newTarget = relatedTarget?.closest('.rt-tooltip-target[data-tooltip]');

        // If moving to another tooltip target, don't hide - mouseover will handle the switch
        if (newTarget) {
            return;
        }

        // Case 1: Normal case - we can identify the source tooltip target
        if (target && target === currentTarget) {
            // Delay hiding to allow moving to tooltip (if interactive) or reducing flicker
            hideTimeout = window.setTimeout(hideCustomTooltip, 100);
            return;
        }
        
        // Case 2: Target couldn't be resolved (e.g., events from foreignObject/HTML content)
        // Check if relatedTarget is still inside currentTarget
        if (!target && currentTarget) {
            const stillInsideCurrentTarget = relatedTarget && currentTarget.contains(relatedTarget);
            if (!stillInsideCurrentTarget) {
                hideTimeout = window.setTimeout(hideCustomTooltip, 100);
                return;
            }
        }
        
        // Case 3: relatedTarget is null (left SVG entirely)
        if (!relatedTarget) {
            hideTimeout = window.setTimeout(hideCustomTooltip, 100);
        }
    };
    
    // Additional mouseleave handler to catch edge cases with foreignObject/HTML content
    // mouseleave doesn't bubble, so it fires when truly leaving the SVG
    const handleMouseLeave = () => {
        if (currentTarget) {
            // Clear any existing timeout before setting new one
            if (hideTimeout) {
                window.clearTimeout(hideTimeout);
            }
            hideTimeout = window.setTimeout(hideCustomTooltip, 100);
        }
    };

    // Hide tooltip on click (button clicks should dismiss tooltip immediately)
    const handleClick = (e: Event) => {
        const target = (e.target as Element).closest('.rt-tooltip-target[data-tooltip]');
        if (target) {
            // Immediately hide tooltip when clicking a tooltip target
            if (hideTimeout) {
                window.clearTimeout(hideTimeout);
                hideTimeout = null;
            }
            hideCustomTooltip();
        }
    };

    // Use Obsidian lifecycle-backed registration for automatic cleanup
    registerDomEvent(svgElement as unknown as HTMLElement, 'mouseover', handleMouseOver);
    registerDomEvent(svgElement as unknown as HTMLElement, 'mouseout', handleMouseOut);
    registerDomEvent(svgElement as unknown as HTMLElement, 'mouseleave', handleMouseLeave);
    registerDomEvent(svgElement as unknown as HTMLElement, 'click', handleClick);
}

/**
 * Clean up global tooltip element.
 * Called from Plugin.onunload()
 */
export function cleanupTooltipAnchors(): void {
    if (customTooltipEl) {
        customTooltipEl.remove();
        customTooltipEl = null;
    }
    currentTarget = null;
    if (hideTimeout) {
        window.clearTimeout(hideTimeout);
        hideTimeout = null;
    }
}

// --- Internal Implementation ---

function ensureCustomTooltip() {
    if (customTooltipEl) return;

    customTooltipEl = document.createElement('div');
    customTooltipEl.classList.add('rt-tooltip');
    document.body.appendChild(customTooltipEl);
}

function updateTooltipWidth(): void {
    if (!customTooltipEl) return;
    customTooltipEl.style.removeProperty('--rt-tooltip-width');
    const rect = customTooltipEl.getBoundingClientRect();
    if (rect.width > 0) {
        customTooltipEl.style.setProperty('--rt-tooltip-width', `${Math.ceil(rect.width)}px`);
    }
}

function showCustomTooltip(target: Element, text: string, placement: TooltipPlacement) {
    if (!customTooltipEl) ensureCustomTooltip();
    if (!customTooltipEl) return;

    // Cancel pending hide
    if (hideTimeout) {
        window.clearTimeout(hideTimeout);
        hideTimeout = null;
    }

    // Update content
    customTooltipEl.setText(text);
    updateTooltipWidth();
    
    // Reset classes
    customTooltipEl.className = 'rt-tooltip'; // reset placement classes
    customTooltipEl.classList.add(`rt-placement-${placement}`);
    
    // Calculate Position
    const rect = target.getBoundingClientRect();
    const tooltipRect = customTooltipEl.getBoundingClientRect(); // May be 0 if hidden, but text is set so it should layout

    // Default: Bottom
    let top = 0;
    let left = 0;

    switch (placement) {
        case 'bottom':
            left = rect.left + (rect.width / 2);
            top = rect.bottom;
            break;
        case 'top':
            left = rect.left + (rect.width / 2);
            top = rect.top - tooltipRect.height;
            break;
        case 'left':
            left = rect.left - tooltipRect.width;
            top = rect.top + (rect.height / 2);
            break;
        case 'right':
            left = rect.right;
            top = rect.top + (rect.height / 2);
            break;
    }

    const offsetX = parseFloat(target.getAttribute('data-tooltip-offset-x') || '0') || 0;
    const offsetY = parseFloat(target.getAttribute('data-tooltip-offset-y') || '0') || 0;

    // Apply coordinates
    // Note: transforms in CSS handle the centering (e.g. translate(-50%, 0))
    // We just set the anchor point.
    customTooltipEl.style.top = `${top + offsetY}px`;
    customTooltipEl.style.left = `${left + offsetX}px`;

    // Show
    customTooltipEl.classList.add('rt-visible');
}

function hideCustomTooltip() {
    if (customTooltipEl) {
        customTooltipEl.classList.remove('rt-visible');
        currentTarget = null;
    }
}
