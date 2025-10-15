/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
/**
 * Plot Label Spacing Manager
 * 
 * Handles the post-layout adjustment of plot beat labels to prevent overlaps
 * and insert separators between consecutive labels.
 */

export interface PlotLabelItem {
    textEl: SVGTextElement;
    textPathEl: SVGTextPathElement;
    pathNode: SVGPathElement;
    radius: number;
    sliceStart: number;
    angleSpan: number;
}

export class PlotLabelManager {
    // Configurable spacing constants (in pixels)
    private static readonly SPACE_BEFORE_DASH = 13; // Space between previous label and dash
    private static readonly SPACE_AFTER_DASH = 8;   // Space between dash and next label
    
    /**
     * Adjusts plot label positions to prevent overlaps and adds separators
     */
    static adjustPlotLabels(svgElement: SVGSVGElement): void {
        try {
            const plotTextNodes = Array.from(svgElement.querySelectorAll('text.rt-plot-title')) as SVGTextElement[];
            const items = plotTextNodes.map((textEl) => {
                const tp = textEl.querySelector('textPath') as SVGTextPathElement | null;
                const href = tp?.getAttribute('href') || '';
                const pathId = href.startsWith('#') ? href.slice(1) : href;
                const pathNode = svgElement.querySelector(`[id="${pathId}"]`) as SVGPathElement | null;
                if (!pathNode) return null;
                
                const radius = parseFloat(pathNode.getAttribute('data-radius') || '0');
                const sliceStart = parseFloat(pathNode.getAttribute('data-slice-start') || '0');
                const lengthPx = textEl.getComputedTextLength();
                
                // If text length is 0 (not yet rendered), estimate it based on text content
                let actualLengthPx = lengthPx;
                if (!isFinite(lengthPx) || lengthPx <= 0) {
                    const textContent = textEl.textContent || '';
                    const computedStyle = window.getComputedStyle(textEl);
                    const fontSize = parseFloat(computedStyle.fontSize) || 12;
                    actualLengthPx = textContent.length * fontSize * 0.6; // Rough estimation
                }
                
                if (actualLengthPx <= 0 || radius <= 0) return null;
                
                const angleSpan = actualLengthPx / radius;
                return { textEl, textPathEl: tp!, pathNode, radius, sliceStart, angleSpan };
            }).filter(Boolean) as PlotLabelItem[];

            PlotLabelManager.repositionLabelsWithSeparators(svgElement, items);
        } catch (error) {
            const isDev = typeof process !== 'undefined' && typeof process.env !== 'undefined' && process.env.NODE_ENV === 'development';
            if (isDev) {
                console.warn('Failed to adjust plot labels:', error);
            }
        }
    }

    /**
     * Repositions labels to prevent overlap and inserts " - " separators only when needed
     */
    private static repositionLabelsWithSeparators(svgElement: SVGSVGElement, items: PlotLabelItem[]): void {
        items.sort((a, b) => a.sliceStart - b.sliceStart);
        
        // Remove any existing dash separators and invisible spacers
        svgElement.querySelectorAll('.rt-plot-dash-separator').forEach(el => el.remove());
        svgElement.querySelectorAll('[opacity="0"]').forEach(el => {
            if (el.textContent?.includes('\u2003')) el.remove(); // Remove em-space spacers
        });
        
        let lastEnd = Number.NEGATIVE_INFINITY;
        let lastItem: PlotLabelItem | null = null;
        
        items.forEach((item, idx) => {
            let startAngle = item.sliceStart;
            let needsDash = false;
            
            // Check if this label would overlap with the previous one
            if (lastItem && idx > 0) {
                const wouldOverlap = item.sliceStart < lastEnd;
                
                if (wouldOverlap) {
                    // Labels overlap - reposition and add dash with configurable spacing
                    const spaceBeforeDash = PlotLabelManager.SPACE_BEFORE_DASH / Math.max(1, item.radius);
                    const spaceAfterDash = PlotLabelManager.SPACE_AFTER_DASH / Math.max(1, item.radius);
                    startAngle = lastEnd + spaceBeforeDash + spaceAfterDash;
                    needsDash = true;
                } else {
                    // No overlap - use original position
                    startAngle = item.sliceStart;
                }
            }
            
            const endAngle = startAngle + item.angleSpan;
            
            // Insert " - " separator only if there was overlap
            if (needsDash && lastItem) {
                PlotLabelManager.insertDashSeparator(svgElement, lastItem, item, lastEnd, startAngle);
            }
            
            lastEnd = endAngle;
            lastItem = item;
            
            // Rewrite the path arc to ensure sufficient length for the measured text
            PlotLabelManager.updatePathArc(item, startAngle, endAngle);
        });
        
        // Make all labels visible now that repositioning is complete
        // Remove the positioning class to reveal the labels instantly (no flicker)
        items.forEach(item => {
            item.textEl.classList.remove('rt-plot-title-positioning');
        });
    }

    /**
     * Inserts a " - " separator between two consecutive plot labels with even spacing
     */
    private static insertDashSeparator(
        svgElement: SVGSVGElement, 
        lastItem: PlotLabelItem, 
        currentItem: PlotLabelItem, 
        lastEnd: number, 
        startAngle: number
    ): void {
        // Position dash with configurable clearance from previous label
        const spaceBeforeDash = PlotLabelManager.SPACE_BEFORE_DASH / Math.max(1, currentItem.radius);
        const dashAngle = lastEnd + spaceBeforeDash; // Position dash exactly after clearance space
        const dashX = (currentItem.radius * Math.cos(dashAngle)).toFixed(3);
        const dashY = (currentItem.radius * Math.sin(dashAngle)).toFixed(3);
        const dashRotation = (dashAngle + Math.PI / 2) * 180 / Math.PI;
        
        const dashElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        dashElement.setAttribute('class', 'rt-plot-title rt-plot-dash-separator');
        dashElement.setAttribute('transform', `translate(${dashX}, ${dashY}) rotate(${dashRotation.toFixed(3)})`);
        dashElement.setAttribute('text-anchor', 'middle');
        dashElement.setAttribute('dy', '-3');
        dashElement.textContent = '—'; // Use em-dash as requested
        
        // Insert after the previous plot text element
        lastItem.textEl.parentElement?.appendChild(dashElement);
    }

    /**
     * Updates the SVG path arc for a plot label
     */
    private static updatePathArc(item: PlotLabelItem, startAngle: number, endAngle: number): void {
        const r = item.radius;
        const largeArcFlag = (endAngle - startAngle) > Math.PI ? 1 : 0;
        const sx = (r * Math.cos(startAngle)).toFixed(3);
        const sy = (r * Math.sin(startAngle)).toFixed(3);
        const ex = (r * Math.cos(endAngle)).toFixed(3);
        const ey = (r * Math.sin(endAngle)).toFixed(3);
        const d = `M ${sx} ${sy} A ${r} ${r} 0 ${largeArcFlag} 1 ${ex} ${ey}`;
        
        item.pathNode.setAttribute('d', d);
        // Keep a minimal startOffset for a tiny inset, but don't push beyond the path
        item.textPathEl.setAttribute('startOffset', '2');
    }
}
