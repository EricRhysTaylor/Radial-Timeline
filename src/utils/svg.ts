/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */
export function formatNumber(num: number): string {
    if (Math.abs(num) < 0.001) return '0';
    return num.toFixed(3).replace(/\.0+$/, '').replace(/\.$/, '');
}

export function escapeXml(unsafe: string): string {
    return unsafe
        .replace(/&(?!(amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;))/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function createSvgElement(tag: string, attributes: Record<string, string> = {}, classes: string[] = []): SVGElement {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
    if (classes.length > 0) element.classList.add(...classes);
    return element;
}

export function createSvgText(content: string, x: string | number, y: string | number, classes: string[] = []): SVGTextElement {
    const text = createSvgElement('text', { x: x.toString(), y: y.toString() }) as SVGTextElement;
    if (classes.length > 0) text.classList.add(...classes);

    if (content) {
        if (content.includes('<tspan')) {
            const parser = new DOMParser();
            const safeContent = content
                .replace(/&(?!(amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;))/g, '&amp;')
                .replace(/</g, (match, offset) => {
                    return content.substring(offset, offset + 6) === '<tspan'
                        || content.substring(offset, offset + 7) === '</tspan'
                        ? '<'
                        : '&lt;';
                })
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');

            const doc = parser.parseFromString(`<svg><text>${safeContent}</text></svg>`, 'image/svg+xml');
            const parsedText = doc.querySelector('text');
            if (parsedText) {
                while (parsedText.firstChild) {
                    text.appendChild(parsedText.firstChild);
                }
            } else {
                text.textContent = content;
            }
        } else {
            text.textContent = content;
        }
    }

    return text;
}

export function createSvgTspan(content: string, classes: string[] = []): SVGTSpanElement {
    const tspan = createSvgElement('tspan') as SVGTSpanElement;
    if (classes.length > 0) tspan.classList.add(...classes);
    if (content) tspan.textContent = content;
    return tspan;
}

export function createSvgArcPath(startAngle: number, endAngle: number, radius: number, largeArcFlag: number = 0): string {
    const startX = radius * Math.cos(startAngle);
    const startY = radius * Math.sin(startAngle);
    const endX = radius * Math.cos(endAngle);
    const endY = radius * Math.sin(endAngle);

    return `
        M ${startX} ${startY}
        A ${radius} ${radius} 0 ${largeArcFlag} 1 ${endX} ${endY}
    `;
}

export function sanitizeSvgText(text: string): string {
    return (text || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Position and curve the text elements in the SVG
 * @param container The container element with the SVG
 * @param curveFactor Factor to control the curvature
 * @param angleToCenter Angle to the center
 */
export function curveTextElements(container: Element, curveFactor: number, angleToCenter: number): void {
    // Find all text elements inside the container
    const textElements = container.querySelectorAll('text');
    if (!textElements.length) return;

    // Apply the curvature to each text element
    textElements.forEach((textEl) => {
        try {
            // Create a curved path effect for this text
            const pathId = `path-${Math.random().toString(36).substring(2, 9)}`;

            // Create a curved path element
            const pathElement = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            pathElement.setAttribute('id', pathId);
            pathElement.setAttribute('d', `M 0,0 Q ${Math.cos(angleToCenter) * 500},${Math.sin(angleToCenter) * 500 * curveFactor} 1000,0`);

            // Use CSS class instead of inline style
            pathElement.classList.add('svg-path');

            // Add the path to the container before the text
            textEl.parentNode?.insertBefore(pathElement, textEl);

            // Link the text to the path
            textEl.setAttribute('path', `url(#${pathId})`);
            textEl.setAttribute('pathLength', '1');
            textEl.setAttribute('startOffset', '0');
        } catch (error) {
            console.error('Error applying text curvature:', error);
        }
    });
}

/**
 * Process highlighted content from a document fragment into SVG-compatible nodes
 */
export function processHighlightedContent(fragment: DocumentFragment): Node[] {
    // Create a temporary container using Obsidian's createEl or standard DOM
    const container = document.createElement('div');
    container.appendChild(fragment.cloneNode(true));

    // Extract all nodes from the container
    const resultNodes: Node[] = [];

    // Process each child node
    Array.from(container.childNodes).forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
            // For text nodes, create plain text nodes
            if (node.textContent) {
                resultNodes.push(document.createTextNode(node.textContent));
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            // For element nodes (like tspan), create SVG elements
            const element = node as Element;
            if (element.tagName.toLowerCase() === 'tspan') {
                const svgTspan = document.createElementNS("http://www.w3.org/2000/svg", "tspan");

                // Copy attributes
                Array.from(element.attributes).forEach(attr => {
                    svgTspan.setAttribute(attr.name, attr.value);
                });

                svgTspan.textContent = element.textContent;
                resultNodes.push(svgTspan);
            }
        }
    });

    return resultNodes;
}
