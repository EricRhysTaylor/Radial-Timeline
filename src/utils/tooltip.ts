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

const TOOLTIP_ATTR = 'data-tooltip';
const TOOLTIP_PLACEMENT_ATTR = 'data-tooltip-placement';
const TOOLTIP_ANCHOR_ATTR = 'data-tooltip-anchor';
const TOOLTIP_OFFSET_X_ATTR = 'data-tooltip-offset-x';
const TOOLTIP_OFFSET_Y_ATTR = 'data-tooltip-offset-y';
const RT_TOOLTIP_ATTR = 'data-rt-tooltip';
const RT_TOOLTIP_PLACEMENT_ATTR = 'data-rt-tooltip-placement';
const RT_TOOLTIP_ANCHOR_ATTR = 'data-rt-tooltip-anchor';
const RT_TOOLTIP_OFFSET_X_ATTR = 'data-rt-tooltip-offset-x';
const RT_TOOLTIP_OFFSET_Y_ATTR = 'data-rt-tooltip-offset-y';

// Singleton tooltip element
let customTooltipEl: HTMLElement | null = null;
let currentTarget: Element | null = null;
let hideTimeout: number | null = null;

function readAttr(target: Element, rtAttr: string, fallbackAttr: string): string {
    return target.getAttribute(rtAttr) || target.getAttribute(fallbackAttr) || '';
}

function getTooltipText(target: Element): string {
    return readAttr(target, RT_TOOLTIP_ATTR, TOOLTIP_ATTR);
}

function getTooltipPlacement(target: Element): TooltipPlacement {
    const raw = readAttr(target, RT_TOOLTIP_PLACEMENT_ATTR, TOOLTIP_PLACEMENT_ATTR);
    return (raw || 'bottom') as TooltipPlacement;
}

function getTooltipAnchor(target: Element): string {
    return readAttr(target, RT_TOOLTIP_ANCHOR_ATTR, TOOLTIP_ANCHOR_ATTR);
}

function getTooltipOffset(target: Element): { x: number; y: number } {
    const offsetX = parseFloat(readAttr(target, RT_TOOLTIP_OFFSET_X_ATTR, TOOLTIP_OFFSET_X_ATTR) || '0') || 0;
    const offsetY = parseFloat(readAttr(target, RT_TOOLTIP_OFFSET_Y_ATTR, TOOLTIP_OFFSET_Y_ATTR) || '0') || 0;
    return { x: offsetX, y: offsetY };
}

function resolveTooltipTarget(start: EventTarget | null): Element | null {
    if (!(start instanceof Element)) return null;
    const target = start.closest(`[${RT_TOOLTIP_ATTR}], [${TOOLTIP_ATTR}], .rt-tooltip-target`);
    if (!target) return null;
    return getTooltipText(target) ? target : null;
}

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
    if (element instanceof SVGElement) {
        // Avoid Obsidian native tooltip interception on SVG nodes.
        element.classList.remove('rt-tooltip-target');
        element.setAttribute(RT_TOOLTIP_ATTR, text);
        element.setAttribute(RT_TOOLTIP_PLACEMENT_ATTR, placement);
        element.removeAttribute(TOOLTIP_ATTR);
        element.removeAttribute(TOOLTIP_PLACEMENT_ATTR);
        return;
    }
    element.classList.add('rt-tooltip-target');
    element.setAttribute(TOOLTIP_ATTR, text);
    element.setAttribute(TOOLTIP_PLACEMENT_ATTR, placement);
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
        const target = resolveTooltipTarget(e.target);
        if (target) {
            // Cancel any pending hide immediately when entering a tooltip target
            if (hideTimeout) {
                window.clearTimeout(hideTimeout);
                hideTimeout = null;
            }
            
            // Only update if it's a different target
            if (target !== currentTarget) {
                currentTarget = target;
                const text = getTooltipText(target);
                const placement = getTooltipPlacement(target);
                const anchor = getTooltipAnchor(target);
                
                if (text) {
                    const mouseEvent = e as MouseEvent;
                    const anchorPoint = anchor === 'cursor'
                        ? { x: mouseEvent.clientX, y: mouseEvent.clientY }
                        : undefined;
                    showCustomTooltip(target, text, placement, anchorPoint);
                }
            }
        }
    };

    const handleMouseOut = (e: Event) => {
        if (!currentTarget) return;

        const target = resolveTooltipTarget(e.target);
        const relatedTarget = (e as MouseEvent).relatedTarget as Element | null;

        // Check if we moved to another tooltip target
        const newTarget = resolveTooltipTarget(relatedTarget);

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
        const target = resolveTooltipTarget(e.target);
        if (target) {
            // Immediately hide tooltip when clicking a tooltip target
            if (hideTimeout) {
                window.clearTimeout(hideTimeout);
                hideTimeout = null;
            }
            hideCustomTooltip();
        }
    };

    const handleMouseMove = (e: Event) => {
        if (!currentTarget || !customTooltipEl) return;
        const anchor = getTooltipAnchor(currentTarget);
        if (anchor !== 'cursor') return;
        const placement = getTooltipPlacement(currentTarget);
        const mouseEvent = e as MouseEvent;
        updateTooltipPosition(currentTarget, placement, { x: mouseEvent.clientX, y: mouseEvent.clientY });
    };

    // Use Obsidian lifecycle-backed registration for automatic cleanup
    registerDomEvent(svgElement as unknown as HTMLElement, 'mouseover', handleMouseOver);
    registerDomEvent(svgElement as unknown as HTMLElement, 'mouseout', handleMouseOut);
    registerDomEvent(svgElement as unknown as HTMLElement, 'mouseleave', handleMouseLeave);
    registerDomEvent(svgElement as unknown as HTMLElement, 'click', handleClick);
    registerDomEvent(svgElement as unknown as HTMLElement, 'mousemove', handleMouseMove);
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
    const naturalWidth = customTooltipEl.getBoundingClientRect().width;
    const naturalHeight = customTooltipEl.getBoundingClientRect().height;

    if (naturalWidth <= 0) return;

    // Single line — just lock width as-is
    if (naturalHeight <= 20) {
        customTooltipEl.style.setProperty('--rt-tooltip-width', `${Math.ceil(naturalWidth)}px`);
        return;
    }

    // Multi-line: binary-search for the narrowest width that keeps the same line count.
    // This produces balanced-looking lines with a tight-fitting box.
    let lo = naturalWidth * 0.5;
    let hi = naturalWidth;

    while (hi - lo > 1) {
        const mid = (lo + hi) / 2;
        customTooltipEl.style.setProperty('--rt-tooltip-width', `${mid}px`);
        if (customTooltipEl.getBoundingClientRect().height > naturalHeight) {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    customTooltipEl.style.setProperty('--rt-tooltip-width', `${Math.ceil(hi)}px`);
}

type TooltipAnchorPoint = { x: number; y: number };

function updateTooltipPosition(target: Element, placement: TooltipPlacement, anchorPoint?: TooltipAnchorPoint) {
    if (!customTooltipEl) return;

    const tooltipRect = customTooltipEl.getBoundingClientRect();
    let top = 0;
    let left = 0;

    if (anchorPoint) {
        switch (placement) {
            case 'bottom':
                left = anchorPoint.x;
                top = anchorPoint.y;
                break;
            case 'top':
                left = anchorPoint.x;
                top = anchorPoint.y - tooltipRect.height;
                break;
            case 'left':
                left = anchorPoint.x - tooltipRect.width;
                top = anchorPoint.y;
                break;
            case 'right':
                left = anchorPoint.x;
                top = anchorPoint.y;
                break;
        }
    } else {
        const rect = target.getBoundingClientRect();
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
    }

    const offset = getTooltipOffset(target);

    customTooltipEl.style.top = `${top + offset.y}px`;
    customTooltipEl.style.left = `${left + offset.x}px`;
}

function showCustomTooltip(
    target: Element,
    text: string,
    placement: TooltipPlacement,
    anchorPoint?: TooltipAnchorPoint
) {
    if (!customTooltipEl) ensureCustomTooltip();
    if (!customTooltipEl) return;

    // Cancel pending hide
    if (hideTimeout) {
        window.clearTimeout(hideTimeout);
        hideTimeout = null;
    }

    // Update content
    customTooltipEl.setText(text);
    
    // Reset classes and position before measuring to avoid shrink-to-fit from the previous location.
    customTooltipEl.className = 'rt-tooltip'; // reset placement classes
    customTooltipEl.style.left = '0px';
    customTooltipEl.style.top = '0px';
    updateTooltipWidth();

    customTooltipEl.classList.add(`rt-placement-${placement}`);
    
    updateTooltipPosition(target, placement, anchorPoint);

    // Show
    customTooltipEl.classList.add('rt-visible');
}

function hideCustomTooltip() {
    if (customTooltipEl) {
        customTooltipEl.classList.remove('rt-visible');
        currentTarget = null;
    }
}
