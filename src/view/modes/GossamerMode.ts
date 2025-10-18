import { TFile } from 'obsidian';
import { openOrRevealFile } from '../../utils/fileUtils';
import { RadialTimelineView } from '../TimeLineView';

export function setupGossamerMode(view: RadialTimelineView, svg: SVGSVGElement): void {
    let currentGroup: Element | null = null;
    let currentSynopsis: Element | null = null;

    const findSynopsisForScene = (sceneId: string): Element | null => {
        return svg.querySelector(`.rt-scene-info[data-for-scene="${sceneId}"]`);
    };

    const getSceneIdFromGroup = (group: Element): string | null => {
        const pathEl = group.querySelector('.rt-scene-path') as SVGPathElement | null;
        return pathEl?.id || null;
    };

    // 1a. Plot Slice Hover (delegated fallback): Show synopsis, sync dot+spoke
    const plotSliceOver = (e: PointerEvent) => {
        const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Plot"]');
        if (!g) return;
        plotSliceEnter(g as SVGGElement, e);
    };

    // 1b. Plot Slice direct handlers for reliability
    const plotSliceEnter = (g: Element, e: Event) => {
        if (g === currentGroup) return;

        currentGroup = g;
        svg.classList.add('scene-hover');

        const sid = getSceneIdFromGroup(g);
        if (sid) {
            currentSynopsis = findSynopsisForScene(sid);
            if (currentSynopsis) {
                currentSynopsis.classList.add('rt-visible');
                view.plugin.updateSynopsisPosition(currentSynopsis, e as unknown as MouseEvent, svg, sid);
            }
        }

        const encodedPath = g.getAttribute('data-path') || '';
        if (encodedPath) {
            const dot = svg.querySelector(`.rt-gossamer-dot[data-path="${encodedPath}"]`) as SVGCircleElement | null;
            if (dot) {
                dot.classList.add('rt-hover');
                const beatName = dot.getAttribute('data-beat');
                if (beatName) {
                    // Show center dot
                    const centerDot = svg.querySelector(`.rt-gossamer-dot-center[data-beat="${beatName}"]`);
                    if (centerDot) centerDot.classList.add('rt-hover');
                    // Highlight spoke
                    const spoke = svg.querySelector(`.rt-gossamer-spoke[data-beat="${beatName}"]`);
                    if (spoke) spoke.classList.add('rt-gossamer-spoke-hover');
                    // Highlight beat outline
                    const beatOutline = svg.querySelector(`.rt-gossamer-beat-outline[data-beat="${beatName}"]`);
                    if (beatOutline) beatOutline.classList.add('rt-hover');
                    // Highlight all historical dots with matching beat name
                    const historicalDots = svg.querySelectorAll(`.rt-gossamer-dot-historical[data-beat="${beatName}"]`);
                    historicalDots.forEach(hd => hd.classList.add('rt-hover'));
                }
                g.classList.add('rt-gossamer-hover');
            }
        }
    };

    const plotSliceOut = (e: PointerEvent) => {
        if (!currentGroup) return;

        const toEl = e.relatedTarget as Element | null;
        if (toEl && (currentGroup.contains(toEl) ||
                    !!toEl.closest('.rt-gossamer-dot'))) return;

        svg.classList.remove('scene-hover');
        if (currentSynopsis) {
            currentSynopsis.classList.remove('rt-visible');
            currentSynopsis = null;
        }

        const encodedPath = currentGroup.getAttribute('data-path') || '';
        if (encodedPath) {
            const dot = svg.querySelector(`.rt-gossamer-dot[data-path="${encodedPath}"]`) as SVGCircleElement | null;
            if (dot) {
                dot.classList.remove('rt-hover');
                const beatName = dot.getAttribute('data-beat');
                if (beatName) {
                    // Hide center dot
                    const centerDot = svg.querySelector(`.rt-gossamer-dot-center[data-beat="${beatName}"]`);
                    if (centerDot) centerDot.classList.remove('rt-hover');
                    // Remove spoke highlight
                    const spoke = svg.querySelector(`.rt-gossamer-spoke[data-beat="${beatName}"]`);
                    if (spoke) spoke.classList.remove('rt-gossamer-spoke-hover');
                    // Remove beat outline highlight
                    const beatOutline = svg.querySelector(`.rt-gossamer-beat-outline[data-beat="${beatName}"]`);
                    if (beatOutline) beatOutline.classList.remove('rt-hover');
                }
                currentGroup.classList.remove('rt-gossamer-hover');
            }
        }

        currentGroup = null;
    };

    // 2. Gossamer Dot Hover: Show synopsis, sync plot slice+spoke+center dot
    const dotOver = (e: PointerEvent) => {
        const dot = (e.target as Element).closest('.rt-gossamer-dot') as SVGCircleElement | null;
        if (!dot) return;
        
        dot.classList.add('rt-hover');
        const encodedPath = dot.getAttribute('data-path');
        const beatName = dot.getAttribute('data-beat');
        if (!encodedPath) return;
        
        svg.classList.add('scene-hover');
        
        // Show center dot and highlight beat outline
        if (beatName) {
            const centerDot = svg.querySelector(`.rt-gossamer-dot-center[data-beat="${beatName}"]`);
            if (centerDot) centerDot.classList.add('rt-hover');
            const beatOutline = svg.querySelector(`.rt-gossamer-beat-outline[data-beat="${beatName}"]`);
            if (beatOutline) beatOutline.classList.add('rt-hover');
        }
        
        // Find and highlight the plot slice (both have encoded paths now)
        const plotGroup = svg.querySelector(`.rt-scene-group[data-path="${encodedPath}"]`);
        if (plotGroup) {
            currentGroup = plotGroup;
            plotGroup.classList.add('rt-gossamer-hover');
            
            const sid = getSceneIdFromGroup(plotGroup);
            if (sid) {
                currentSynopsis = findSynopsisForScene(sid);
                if (currentSynopsis) {
                    currentSynopsis.classList.add('rt-visible');
                    view.plugin.updateSynopsisPosition(currentSynopsis, e as unknown as MouseEvent, svg, sid);
                }
            }
        }
        
        // Highlight spoke, beat outline, and historical dots
        if (beatName) {
            const spoke = svg.querySelector(`.rt-gossamer-spoke[data-beat="${beatName}"]`);
            if (spoke) {
                spoke.classList.add('rt-gossamer-spoke-hover');
            }
            const beatOutline = svg.querySelector(`.rt-gossamer-beat-outline[data-beat="${beatName}"]`);
            if (beatOutline) {
                beatOutline.classList.add('rt-hover');
            }
            // Highlight all historical dots with matching beat name
            const historicalDots = svg.querySelectorAll(`.rt-gossamer-dot-historical[data-beat="${beatName}"]`);
            historicalDots.forEach(hd => hd.classList.add('rt-hover'));
        }
    };

    const dotOut = (e: PointerEvent) => {
        // Remove hover from all historical dots
        svg.querySelectorAll('.rt-gossamer-dot-historical.rt-hover').forEach(hd => hd.classList.remove('rt-hover'));
        const toEl = e.relatedTarget as Element | null;
        // If moving to a plot slice or another dot, keep highlights
        if (toEl && (toEl.closest('.rt-scene-group[data-item-type="Plot"]') || 
                    toEl.closest('.rt-gossamer-dot'))) return;

        svg.classList.remove('scene-hover');

        if (currentSynopsis) {
            currentSynopsis.classList.remove('rt-visible');
            currentSynopsis = null;
        }

        if (currentGroup) {
            currentGroup.classList.remove('rt-gossamer-hover');
            currentGroup = null;
        }

        // Remove all highlights
        svg.querySelectorAll('.rt-gossamer-spoke-hover').forEach(el => {
            el.classList.remove('rt-gossamer-spoke-hover');
        });
        svg.querySelectorAll('.rt-gossamer-dot.rt-hover').forEach(el => {
            el.classList.remove('rt-hover');
        });
        svg.querySelectorAll('.rt-gossamer-dot-center.rt-hover').forEach(el => {
            el.classList.remove('rt-hover');
        });
        svg.querySelectorAll('.rt-gossamer-beat-outline.rt-hover').forEach(el => {
            el.classList.remove('rt-hover');
        });
    };

    // 3. Click handlers
    const plotSliceClick = async (e: MouseEvent) => {
        const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Plot"]');
        if (!g) return;
        
        e.stopPropagation();
        
        const encodedPath = g.getAttribute('data-path');
        if (!encodedPath) return;
        
        const filePath = decodeURIComponent(encodedPath);
        const file = view.plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await openOrRevealFile(view.plugin.app, file);
        }
    };

    const dotClick = async (e: MouseEvent) => {
        const dot = (e.target as Element).closest('.rt-gossamer-dot');
        if (!dot) return;
        
        e.stopPropagation();
        
        const encodedPath = dot.getAttribute('data-path');
        if (!encodedPath) return;
        
        const path = decodeURIComponent(encodedPath);
        const file = view.plugin.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
            await openOrRevealFile(view.plugin.app, file);
        }
    };

    // 4. Background click to exit Gossamer mode
    const backgroundClick = (e: MouseEvent) => {
        const target = e.target as Element;
        
        if (target.closest('.rt-gossamer-dot') || target.closest('.rt-scene-group[data-item-type="Plot"]')) {
            return;
        }
        
        import('../../GossamerCommands').then(({ toggleGossamerMode }) => {
            toggleGossamerMode(view.plugin);
        });
    };

    // Register via view (so cleanup works consistently)
    view.registerDomEvent(svg as unknown as HTMLElement, 'click', plotSliceClick);
    view.registerDomEvent(svg as unknown as HTMLElement, 'click', dotClick);
    view.registerDomEvent(svg as unknown as HTMLElement, 'click', backgroundClick);
    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerover', plotSliceOver);
    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', plotSliceOut);
    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerover', dotOver);
    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', dotOut);

    // Track for manual cleanup when switching modes
    view.registerGossamerHandler('pointerover::svg', plotSliceOver as EventListener);
    view.registerGossamerHandler('pointerout::svg', plotSliceOut as EventListener);
    view.registerGossamerHandler('pointerover::dot::svg', dotOver as EventListener);
    view.registerGossamerHandler('pointerout::dot::svg', dotOut as EventListener);
    view.registerGossamerHandler('click::plot::svg', plotSliceClick as EventListener);
    view.registerGossamerHandler('click::dot::svg', dotClick as EventListener);
    view.registerGossamerHandler('click::bg::svg', backgroundClick as EventListener);

    // Direct plot-group handlers for reliability
    const plotGroups = svg.querySelectorAll('.rt-scene-group[data-item-type="Plot"]');
    plotGroups.forEach((el) => {
        view.registerDomEvent(el as HTMLElement, 'pointerenter', (ev) => plotSliceEnter(el, ev));
        view.registerDomEvent(el as HTMLElement, 'pointerleave', (ev) => plotSliceOut(ev as PointerEvent));
        view.registerDomEvent(el as HTMLElement, 'click', (ev) => plotSliceClick(ev as MouseEvent));
    });
}


