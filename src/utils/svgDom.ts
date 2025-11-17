/*
 * SVG mounting helpers for rendering serialized markup safely into the DOM.
 */

type CleanupRegistrar = (cleanup: () => void) => void;

export function renderSvgFromString(
    svgContent: string,
    container: HTMLElement,
    registerCleanup: CleanupRegistrar = () => {}
): SVGSVGElement | null {
    try {
        const svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgContent, 'image/svg+xml');
        const parserError = svgDoc.querySelector('parsererror');

        if (parserError) {
            console.error('Error parsing SVG content:', parserError.textContent);
            const fallbackDoc = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`, 'image/svg+xml');
            if (!fallbackDoc.querySelector('parsererror')) {
                const fallbackSvg = fallbackDoc.documentElement;
                while (fallbackSvg.firstChild) {
                    svgElement.appendChild(fallbackSvg.firstChild);
                }
                setCriticalAttributes(svgElement, fallbackSvg.getAttribute('viewBox'));
                container.appendChild(wrapInFragment(svgElement));
                return svgElement;
            }
            return null;
        }

        const sourceSvg = svgDoc.documentElement;
        copyAttributes(sourceSvg, svgElement);
        setCriticalAttributes(svgElement, sourceSvg.getAttribute('viewBox'));

        while (sourceSvg.firstChild) {
            svgElement.appendChild(sourceSvg.firstChild);
        }

        container.appendChild(wrapInFragment(svgElement));
        return svgElement;
    } catch (error) {
        console.error('Error creating SVG element:', error);
        return buildFallbackSvg(svgContent, container, registerCleanup);
    }
}

function wrapInFragment(node: SVGSVGElement): DocumentFragment {
    const fragment = document.createDocumentFragment();
    fragment.appendChild(node);
    return fragment;
}

function copyAttributes(source: Element, target: SVGSVGElement): void {
    Array.from(source.attributes).forEach(attr => {
        if (attr.name !== 'xmlns' && attr.name !== 'class') {
            target.setAttribute(attr.name, attr.value);
        }
    });
    target.classList.add(...Array.from(source.classList));
}

function setCriticalAttributes(svgElement: SVGSVGElement, viewBox: string | null): void {
    svgElement.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgElement.setAttribute('width', '100%');
    svgElement.setAttribute('height', '100%');
    svgElement.setAttribute('viewBox', viewBox || '-800 -800 1600 1600');
    svgElement.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svgElement.setAttribute('class', 'radial-timeline-svg');
}

function buildFallbackSvg(
    svgContent: string,
    container: HTMLElement,
    registerCleanup: CleanupRegistrar
): SVGSVGElement | null {
    try {
        const fallbackSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        setCriticalAttributes(fallbackSvg, null);

        const svgBodyMatch = svgContent.match(/<svg[^>]*>([\s\S]*)<\/svg>/i);
        if (svgBodyMatch && svgBodyMatch[1]) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${svgBodyMatch[1]}</svg>`, 'image/svg+xml');
            if (!doc.querySelector('parsererror')) {
                const svgDoc = doc.documentElement;
                const elementNodes = Array.from(svgDoc.querySelectorAll('*'));

                let pendingRaf: number | null = null;
                const processNodes = (nodes: Element[], startIdx: number, callback: () => void) => {
                    const CHUNK_SIZE = 100;
                    const endIdx = Math.min(startIdx + CHUNK_SIZE, nodes.length);
                    for (let i = startIdx; i < endIdx; i++) {
                        const element = nodes[i];
                        const newElement = document.createElementNS('http://www.w3.org/2000/svg', element.tagName.toLowerCase());
                        Array.from(element.attributes).forEach(attr => newElement.setAttribute(attr.name, attr.value));
                        newElement.textContent = element.textContent;
                        fallbackSvg.appendChild(newElement);
                    }
                    if (endIdx < nodes.length) {
                        pendingRaf = window.requestAnimationFrame(() => {
                            pendingRaf = null;
                            processNodes(nodes, endIdx, callback);
                        });
                    } else {
                        callback();
                    }
                };

                if (elementNodes.length > 100) {
                    const loadingText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    loadingText.setAttribute('x', '0');
                    loadingText.setAttribute('y', '0');
                    loadingText.setAttribute('class', 'loading-message');
                    loadingText.setAttribute('font-size', '24');
                    loadingText.setAttribute('text-anchor', 'middle');
                    loadingText.textContent = 'Loading timeline...';
                    fallbackSvg.appendChild(loadingText);

                    container.appendChild(wrapInFragment(fallbackSvg));

                    registerCleanup(() => {
                        if (pendingRaf !== null) {
                            cancelAnimationFrame(pendingRaf);
                            pendingRaf = null;
                        }
                    });

                    processNodes(elementNodes, 0, () => {
                        loadingText.remove();
                    });
                } else {
                    elementNodes.forEach(element => {
                        const newElement = document.createElementNS('http://www.w3.org/2000/svg', element.tagName.toLowerCase());
                        Array.from(element.attributes).forEach(attr => newElement.setAttribute(attr.name, attr.value));
                        newElement.textContent = element.textContent;
                        fallbackSvg.appendChild(newElement);
                    });
                    container.appendChild(wrapInFragment(fallbackSvg));
                }

                return fallbackSvg;
            }
        }

        container.appendChild(wrapInFragment(fallbackSvg));
        return fallbackSvg;
    } catch (innerError) {
        console.error('All SVG parsing approaches failed:', innerError);
        return null;
    }
}
