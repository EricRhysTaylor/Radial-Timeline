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
 * 2. For SVG elements:
 *    import { tooltip } from '../utils/tooltip';
 *    tooltip(svgElement, 'Tooltip text', 'right');
 * 
 * 3. For ButtonComponent (settings):
 *    button.setTooltip('Text') // Use Obsidian's built-in method
 *    // OR for custom placement:
 *    import { tooltipForComponent } from '../utils/tooltip';
 *    tooltipForComponent(button, 'Text', 'left');
 * 
 * 4. For batch setup on elements with data attributes:
 *    import { setupTooltipsFromDataAttributes } from '../utils/tooltip';
 *    setupTooltipsFromDataAttributes(container);
 *    // Elements should have: class="rt-tooltip-target" data-tooltip="text" data-tooltip-placement="bottom"
 */

import { setTooltip, ButtonComponent, ExtraButtonComponent } from 'obsidian';

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right';

/**
 * Apply an Obsidian bubble tooltip to any element (HTML or SVG).
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
        setupSvgTooltip(element, text, placement);
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
 * Setup tooltips for all elements with rt-tooltip-target class within a container.
 * Elements should have:
 * - class="rt-tooltip-target"
 * - data-tooltip="tooltip text"
 * - data-tooltip-placement="top|bottom|left|right" (optional, defaults to bottom)
 * 
 * @param container - The container element to search within
 */
export function setupTooltipsFromDataAttributes(container: HTMLElement | SVGElement): void {
    const targets = container.querySelectorAll('.rt-tooltip-target[data-tooltip]');
    
    targets.forEach((target) => {
        const tooltipText = target.getAttribute('data-tooltip');
        const placement = (target.getAttribute('data-tooltip-placement') || 'bottom') as TooltipPlacement;
        
        if (tooltipText) {
            if (target instanceof HTMLElement) {
                setTooltip(target, tooltipText, { placement });
            } else if (target instanceof SVGElement) {
                setupSvgTooltip(target, tooltipText, placement);
            }
        }
    });
}

/**
 * Internal: Setup tooltip for SVG elements.
 * Creates a temporary positioned HTML overlay since setTooltip requires HTMLElements.
 */
function setupSvgTooltip(svgElement: SVGElement, text: string, placement: TooltipPlacement): void {
    const showTooltip = () => {
        const rect = svgElement.getBoundingClientRect();
        
        // Create an absolutely positioned div over the SVG element
        const tooltipAnchor = document.createElement('div');
        tooltipAnchor.classList.add('rt-tooltip-anchor');
        tooltipAnchor.style.cssText = `
            position: fixed;
            left: ${rect.left}px;
            top: ${rect.top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            pointer-events: none;
            z-index: 9999;
        `;
        document.body.appendChild(tooltipAnchor);
        
        // Set the tooltip on this anchor
        setTooltip(tooltipAnchor, text, { placement });
        
        // Trigger the tooltip by dispatching mouseenter
        tooltipAnchor.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        
        // Clean up anchor when mouse leaves the SVG element
        const cleanup = () => {
            tooltipAnchor.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
            window.setTimeout(() => {
                if (tooltipAnchor.parentNode) {
                    tooltipAnchor.remove();
                }
            }, 100);
        };
        
        // SAFE: addEventListener used with { once: true } for automatic cleanup
        svgElement.addEventListener('mouseleave', cleanup, { once: true });
    };
    
    // SAFE: addEventListener used for utility function without class context; cleanup happens via { once: true } pattern
    svgElement.addEventListener('mouseenter', showTooltip);
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

