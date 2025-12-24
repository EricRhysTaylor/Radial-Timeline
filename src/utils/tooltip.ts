/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * Unified Tooltip Utility for Radial Timeline
 * 
 * Uses Obsidian's native setTooltip API to provide consistent bubble tooltips
 * with pointers throughout the plugin.
 * 
 * USAGE:
 * 
 * 1. For HTML elements (settings, modals):
 *    import { tooltip } from '../utils/tooltip';
 *    tooltip(element, 'Tooltip text', 'bottom');
 * 
 * 2. For SVG elements (non-blocking approach):
 *    Add data attributes: class="rt-tooltip-target" data-tooltip="text" data-tooltip-placement="bottom"
 *    Then call: setupTooltipsFromDataAttributes(container);
 * 
 * 3. For ButtonComponent (settings):
 *    button.setTooltip('Text') // Use Obsidian's built-in method
 *    // OR for custom placement:
 *    import { tooltipForComponent } from '../utils/tooltip';
 *    tooltipForComponent(button, 'Text', 'left');
 */

import { setTooltip, ButtonComponent, ExtraButtonComponent } from 'obsidian';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

// Store active tooltip anchor for cleanup
let activeTooltipAnchor: HTMLElement | null = null;

/**
 * Apply an Obsidian bubble tooltip to any element (HTML or SVG).
 * For SVG elements, uses a non-blocking delegated approach.
 * 
 * @param element - The target element
 * @param text - Tooltip text to display
 * @param placement - Where to show the tooltip: 'top' | 'bottom' | 'left' | 'right'
 */
export function tooltip(
    element: HTMLElement | SVGElement,
    text: string,
    placement: TooltipPlacement = 'bottom'
): void {
    if (element instanceof HTMLElement) {
        setTooltip(element, text, { placement });
    } else if (element instanceof SVGElement) {
        // For SVG, add data attributes for delegated handling
        addTooltipData(element, text, placement);
    }
}

/**
 * Apply tooltip with custom placement to a ButtonComponent or ExtraButtonComponent.
 * Use this when you need a placement other than Obsidian's default.
 * 
 * @param component - ButtonComponent or ExtraButtonComponent
 * @param text - Tooltip text
 * @param placement - Tooltip placement
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
        // Fallback to default behavior
        component.setTooltip(text);
    }
}

/**
 * Setup delegated tooltip handling for SVG elements.
 * This approach doesn't block mouse events - tooltips appear on hover
 * while clicks and CSS :hover states still work on the SVG elements.
 * 
 * Elements should have:
 * - class="rt-tooltip-target"
 * - data-tooltip="tooltip text"
 * - data-tooltip-placement="top|bottom|left|right" (optional, defaults to bottom)
 * 
 * @param container - The container element (SVG or parent)
 */
export function setupTooltipsFromDataAttributes(container: HTMLElement | SVGElement): void {
    // Find the parent HTML container for positioning
    const parentContainer = container instanceof SVGElement 
        ? container.closest('.radial-timeline-container') as HTMLElement
        : container.querySelector('.radial-timeline-container') as HTMLElement || container;
    
    if (!parentContainer) return;
    
    // Create a single reusable tooltip anchor element
    let tooltipAnchor = parentContainer.querySelector('.rt-svg-tooltip-anchor') as HTMLElement;
    if (!tooltipAnchor) {
        tooltipAnchor = document.createElement('div');
        tooltipAnchor.classList.add('rt-svg-tooltip-anchor');
        tooltipAnchor.style.cssText = `
            position: fixed;
            pointer-events: none;
            width: 1px;
            height: 1px;
            z-index: 9999;
        `;
        document.body.appendChild(tooltipAnchor);
    }
    
    // Track current hovered element
    let currentTarget: Element | null = null;
    let hideTimeout: number | null = null;
    
    const showTooltip = (target: Element, text: string, placement: TooltipPlacement) => {
        if (hideTimeout) {
            window.clearTimeout(hideTimeout);
            hideTimeout = null;
        }
        
        const rect = target.getBoundingClientRect();
        
        // Position the anchor to match the target element's bounding box exactly
        // This ensures the tooltip is anchored to the element, not the cursor
        tooltipAnchor.style.left = `${rect.left}px`; // SAFE: inline style used for dynamic positioning
        tooltipAnchor.style.top = `${rect.top}px`; // SAFE: inline style used for dynamic positioning
        tooltipAnchor.style.width = `${rect.width}px`; // SAFE: inline style used for dynamic positioning
        tooltipAnchor.style.height = `${rect.height}px`; // SAFE: inline style used for dynamic positioning
        
        // Set the tooltip with delay: 0 to show immediately
        // This prevents the tooltip from appearing in the wrong location if the cursor moves
        setTooltip(tooltipAnchor, text, { placement, delay: 0 });
        
        // Trigger tooltip display by dispatching mouseenter
        tooltipAnchor.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        activeTooltipAnchor = tooltipAnchor;
    };
    
    const hideTooltip = () => {
        if (activeTooltipAnchor) {
            activeTooltipAnchor.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
        }
        currentTarget = null;
    };
    
    // Delegated event handlers on the SVG
    const svgElement = container instanceof SVGElement ? container : container.querySelector('svg');
    if (!svgElement) return;
    
    const handleMouseOver = (e: Event) => {
        const target = (e.target as Element).closest('.rt-tooltip-target[data-tooltip]');
        if (target && target !== currentTarget) {
            currentTarget = target;
            const text = target.getAttribute('data-tooltip') || '';
            const placement = (target.getAttribute('data-tooltip-placement') || 'bottom') as TooltipPlacement;
            if (text) {
                showTooltip(target, text, placement);
            }
        }
    };
    
    const handleMouseOut = (e: Event) => {
        const target = (e.target as Element).closest('.rt-tooltip-target[data-tooltip]');
        const relatedTarget = (e as MouseEvent).relatedTarget as Element | null;
        const newTarget = relatedTarget?.closest('.rt-tooltip-target[data-tooltip]');
        
        // Only hide if we're leaving a tooltip target and not entering another one
        if (target && target === currentTarget && newTarget !== target) {
            hideTimeout = window.setTimeout(hideTooltip, 100);
        }
    };
    
    // SAFE: addEventListener used for utility function; elements cleaned up when container is destroyed
    svgElement.addEventListener('mouseover', handleMouseOver);
    svgElement.addEventListener('mouseout', handleMouseOut);
}

/**
 * Convenience: Add tooltip data attributes to an element for later batch setup.
 * Useful when building elements programmatically.
 * 
 * @param element - Target element
 * @param text - Tooltip text
 * @param placement - Tooltip placement
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

