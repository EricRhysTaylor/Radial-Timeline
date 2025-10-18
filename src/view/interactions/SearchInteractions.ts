import { escapeRegExp } from '../../utils/regex';

interface SearchView {
    contentEl: HTMLElement;
    plugin: {
        searchActive: boolean;
        searchTerm: string;
        searchResults: Set<string>;
        clearSearch: () => void;
    };
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
}

export function setupSearchControls(view: SearchView): void {
    const clearSearchBtn = view.contentEl.querySelector('.rt-clear-search-btn');
    if (clearSearchBtn) {
        view.registerDomEvent(clearSearchBtn as HTMLElement, 'click', () => {
            view.plugin.clearSearch();
        });
    }
}

export function addHighlightRectangles(view: SearchView): void {
    if (!view.plugin.searchActive) return;

    const searchTerm = view.plugin.searchTerm;
    const escapedPattern = escapeRegExp(searchTerm);
    const wordBoundaryRegex = new RegExp(`\\b(${escapedPattern})\\b`, 'gi');

    const highlightTspan = (tspan: Element, originalText: string, fillColor?: string | null, useWordBoundary = false) => {
        while (tspan.firstChild) tspan.removeChild(tspan.firstChild);
        if (fillColor) (tspan as Element).setAttribute('fill', fillColor || '');
        const regex = useWordBoundary ? wordBoundaryRegex : new RegExp(`(${escapedPattern})`, 'gi');
        regex.lastIndex = 0;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(originalText)) !== null) {
            if (match.index > lastIndex) {
                tspan.appendChild(document.createTextNode(originalText.substring(lastIndex, match.index)));
            }
            const highlightSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            highlightSpan.setAttribute('class', 'rt-search-term');
            if (fillColor) highlightSpan.setAttribute('fill', fillColor);
            highlightSpan.textContent = match[0];
            tspan.appendChild(highlightSpan);
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < originalText.length) {
            tspan.appendChild(document.createTextNode(originalText.substring(lastIndex)));
        }
    };

    // Subplot tspans
    view.contentEl.querySelectorAll('tspan[data-item-type="subplot"]').forEach((tspan) => {
        const originalText = tspan.textContent || '';
        if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
        const fillColor = tspan.getAttribute('fill');
        const useWordBoundary = !!originalText.match(wordBoundaryRegex);
        highlightTspan(tspan, originalText, fillColor, useWordBoundary);
    });

    // Character tspans
    view.contentEl.querySelectorAll('tspan[data-item-type="character"]').forEach((tspan) => {
        const originalText = tspan.textContent || '';
        if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
        const fillColor = tspan.getAttribute('fill');
        if (fillColor) {
            tspan.classList.add('rt-with-dynamic-fill');
            (tspan as HTMLElement).style.setProperty('--rt-dynamic-fill-color', fillColor);
        }
        highlightTspan(tspan, originalText, fillColor || undefined);
    });

    // Title tspans
    view.contentEl.querySelectorAll('tspan[data-item-type="title"]').forEach((tspan) => {
        const originalText = tspan.textContent || '';
        if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
        while (tspan.firstChild) tspan.removeChild(tspan.firstChild);
        const regex = new RegExp(`(${escapedPattern})`, 'gi');
        regex.lastIndex = 0;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(originalText)) !== null) {
            if (match.index > lastIndex) {
                tspan.appendChild(document.createTextNode(originalText.substring(lastIndex, match.index)));
            }
            const highlightSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            highlightSpan.setAttribute('class', 'rt-search-term');
            highlightSpan.textContent = match[0];
            tspan.appendChild(highlightSpan);
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < originalText.length) {
            tspan.appendChild(document.createTextNode(originalText.substring(lastIndex)));
        }
    });

    // Date tspans
    view.contentEl.querySelectorAll('tspan[data-item-type="date"]').forEach((tspan) => {
        const originalText = tspan.textContent || '';
        if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
        highlightTspan(tspan, originalText);
    });

    // Synopsis text elements (only those without tspan children)
    view.contentEl.querySelectorAll('svg .rt-synopsis-text text').forEach((textEl) => {
        if (textEl.querySelector('tspan')) return;
        const originalText = textEl.textContent || '';
        if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
        const fillColor = (textEl as SVGTextElement).getAttribute('fill') || '';
        while (textEl.firstChild) textEl.removeChild(textEl.firstChild);
        const regex = new RegExp(`(${escapedPattern})`, 'gi');
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(originalText)) !== null) {
            if (match.index > lastIndex) {
                textEl.appendChild(document.createTextNode(originalText.substring(lastIndex, match.index)));
            }
            const highlightSpan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            highlightSpan.setAttribute('class', 'rt-search-term');
            if (fillColor) highlightSpan.setAttribute('fill', fillColor);
            highlightSpan.textContent = match[0];
            textEl.appendChild(highlightSpan);
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < originalText.length) {
            textEl.appendChild(document.createTextNode(originalText.substring(lastIndex)));
        }
    });

    // Unhandled tspans under synopsis
    view.contentEl.querySelectorAll('svg .rt-synopsis-text text tspan:not([data-item-type])').forEach((tspan) => {
        const originalText = tspan.textContent || '';
        if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
        const fillColor = (tspan as SVGTSpanElement).getAttribute('fill') || 'inherit';
        highlightTspan(tspan, originalText, fillColor);
    });

    // Mark search-result classes on scene groups with matched paths
    const allSceneGroups = view.contentEl.querySelectorAll('.rt-scene-group');
    allSceneGroups.forEach((group) => {
        const pathAttr = group.getAttribute('data-path');
        if (pathAttr && view.plugin.searchResults.has(decodeURIComponent(pathAttr))) {
            const numberSquare = group.querySelector('.rt-number-square');
            const numberText = group.querySelector('.rt-number-text');
            if (numberSquare) numberSquare.classList.add('rt-search-result');
            if (numberText) numberText.classList.add('rt-search-result');
        }
    });
}


