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

    const highlightTspan = (tspan: Element, originalText: string, fillColor: string | null) => {
        while (tspan.firstChild) tspan.removeChild(tspan.firstChild);
        
        const regex = new RegExp(`(${escapedPattern})`, 'gi');
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
        highlightTspan(tspan, originalText, fillColor);
    });

    // Character tspans
    view.contentEl.querySelectorAll('tspan[data-item-type="character"]').forEach((tspan) => {
        const originalText = tspan.textContent || '';
        if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
        const fillColor = tspan.getAttribute('fill');
        highlightTspan(tspan, originalText, fillColor);
    });

    // Title tspans
    view.contentEl.querySelectorAll('tspan[data-item-type="title"]').forEach((tspan) => {
        const originalText = tspan.textContent || '';
        if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
        const fillColor = (tspan as SVGTSpanElement).style.getPropertyValue('--rt-dynamic-color') || null;
        highlightTspan(tspan, originalText, fillColor);
    });

    // Date tspans
    view.contentEl.querySelectorAll('tspan[data-item-type="date"]').forEach((tspan) => {
        const originalText = tspan.textContent || '';
        if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
        const fillColor = tspan.getAttribute('fill');
        highlightTspan(tspan, originalText, fillColor);
    });

    // Duration tspans
    view.contentEl.querySelectorAll('tspan[data-item-type="duration"]').forEach((tspan) => {
        const originalText = tspan.textContent || '';
        if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
        const fillColor = tspan.getAttribute('fill');
        highlightTspan(tspan, originalText, fillColor);
    });

    // Synopsis text elements (only those without tspan children)
    view.contentEl.querySelectorAll('svg .rt-synopsis-text text').forEach((textEl) => {
        if (textEl.querySelector('tspan')) return;
        const originalText = textEl.textContent || '';
        if (!originalText || !originalText.match(new RegExp(escapedPattern, 'i'))) return;
        const fillColor = (textEl as SVGTextElement).getAttribute('fill');
        
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
        const fillColor = (tspan as SVGTSpanElement).getAttribute('fill');
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


