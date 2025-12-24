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
 * For SVG elements, creates invisible HTML overlays positioned over the SVG elements
 * that capture mouse events and show Obsidian tooltips.
 * 
 * Elements should have:
 * - class="rt-tooltip-target"
 * - data-tooltip="tooltip text"
 * - data-tooltip-placement="top|bottom|left|right" (optional, defaults to bottom)
 * 
 * @param container - The container element to search within
 */
export function setupTooltipsFromDataAttributes(container: HTMLElement | SVGElement): void {
    const targets = container.querySelectorAll('.rt-tooltip-target[data-tooltip]');
    
    // Find the SVG's parent container for positioning overlays
    const svgParent = container instanceof SVGElement 
        ? container.closest('.radial-timeline-container') 
        : container.querySelector('.radial-timeline-container');
    
    targets.forEach((target) => {
        const tooltipText = target.getAttribute('data-tooltip');
        const placement = (target.getAttribute('data-tooltip-placement') || 'bottom') as TooltipPlacement;
        
        if (tooltipText) {
            if (target instanceof HTMLElement) {
                setTooltip(target, tooltipText, { placement });
            } else if (target instanceof SVGElement && svgParent) {
                createSvgTooltipOverlay(target, tooltipText, placement, svgParent as HTMLElement);
            }
        }
    });
}

/**
 * Internal: Create an HTML overlay positioned over an SVG element for tooltip support.
 * The overlay captures mouse events and uses Obsidian's native tooltip.
 */
function createSvgTooltipOverlay(
    svgElement: SVGElement, 
    text: string, 
    placement: TooltipPlacement,
    parentContainer: HTMLElement
): void {
    // Get the SVG element for coordinate transformation
    const svgRoot = svgElement.ownerSVGElement;
    if (!svgRoot) return;
    
    // Create overlay container if it doesn't exist
    let overlayContainer = parentContainer.querySelector('.rt-tooltip-overlay-container') as HTMLElement;
    if (!overlayContainer) {
        overlayContainer = document.createElement('div');
        overlayContainer.classList.add('rt-tooltip-overlay-container');
        overlayContainer.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            overflow: hidden;
        `;
        parentContainer.style.position = 'relative'; // SAFE: inline style used for dynamic overlay positioning
        parentContainer.appendChild(overlayContainer);
    }
    
    // Create the tooltip overlay element
    const overlay = document.createElement('div');
    overlay.classList.add('rt-tooltip-overlay');
    overlay.style.cssText = `
        position: absolute;
        pointer-events: all;
        cursor: default;
    `;
    
    // Position the overlay based on the SVG element's bounding box
    const updatePosition = () => {
        const svgRect = svgRoot.getBoundingClientRect();
        const elementRect = svgElement.getBoundingClientRect();
        
        // Calculate position relative to the container
        const containerRect = parentContainer.getBoundingClientRect();
        const left = elementRect.left - containerRect.left;
        const top = elementRect.top - containerRect.top;
        
        overlay.style.left = `${left}px`; // SAFE: inline style used for dynamic positioning
        overlay.style.top = `${top}px`; // SAFE: inline style used for dynamic positioning
        overlay.style.width = `${elementRect.width}px`; // SAFE: inline style used for dynamic positioning
        overlay.style.height = `${elementRect.height}px`; // SAFE: inline style used for dynamic positioning
    };
    
    updatePosition();
    overlayContainer.appendChild(overlay);
    
    // Set the Obsidian tooltip on the overlay
    setTooltip(overlay, text, { placement });
    
    // Update position on scroll/resize (debounced)
    let updateTimeout: number | null = null;
    const debouncedUpdate = () => {
        if (updateTimeout) window.clearTimeout(updateTimeout);
        updateTimeout = window.setTimeout(updatePosition, 50);
    };
    
    // SAFE: addEventListener used for utility function; cleanup handled when container is destroyed
    parentContainer.addEventListener('scroll', debouncedUpdate);
    window.addEventListener('resize', debouncedUpdate);
}

/**
 * Internal: Setup tooltip for SVG elements using hover-triggered overlay.
 * Used for individual SVG tooltip setup (not batch).
 */
function setupSvgTooltip(svgElement: SVGElement, text: string, placement: TooltipPlacement): void {
    // Find the parent container
    const svgRoot = svgElement.ownerSVGElement;
    if (!svgRoot) return;
    
    const parentContainer = svgRoot.closest('.radial-timeline-container') as HTMLElement;
    if (parentContainer) {
        createSvgTooltipOverlay(svgElement, text, placement, parentContainer);
    }
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
