import { TFile } from 'obsidian';
import { openOrRevealFile } from '../../utils/fileUtils';

interface ViewLike {
    plugin: {
        app: {
            vault: { getAbstractFileByPath: (path: string) => unknown };
        };
    };
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
}

export function setupMainPlotMode(view: ViewLike, svg: SVGSVGElement): void {
    // Mute non-plot elements similar to gossamer muting logic
    const allElements = svg.querySelectorAll('.rt-scene-path, .rt-number-square, .rt-number-text, .rt-scene-title');
    allElements.forEach(el => {
        const group = el.closest('.rt-scene-group');
        const itemType = group?.getAttribute('data-item-type');
        if (itemType !== 'Plot') {
            el.classList.add('rt-non-selected');
        } else {
            el.classList.remove('rt-non-selected');
        }
    });

    svg.classList.add('scene-hover');

    // Hover to show synopsis for plot slices; click to open
    const findSynopsisForScene = (sceneId: string): Element | null => {
        return svg.querySelector(`.rt-scene-info[data-for-scene="${sceneId}"]`);
    };

    const getSceneIdFromGroup = (group: Element): string | null => {
        const pathEl = group.querySelector('.rt-scene-path') as SVGPathElement | null;
        return pathEl?.id || null;
    };

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerover', (e: PointerEvent) => {
        const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Plot"]');
        if (!g) return;
        const sid = getSceneIdFromGroup(g);
        if (!sid) return;
        const syn = findSynopsisForScene(sid);
        if (syn) {
            syn.classList.add('rt-visible');
            (view.plugin as any).updateSynopsisPosition(syn, e as unknown as MouseEvent, svg, sid);
        }
        // Emphasize this plot group
        const pathEl = g.querySelector('.rt-scene-path');
        if (pathEl) (pathEl as Element).classList.add('rt-selected');
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', (e: PointerEvent) => {
        const toEl = e.relatedTarget as Element | null;
        const fromGroup = (e.target as Element).closest('.rt-scene-group[data-item-type="Plot"]');
        if (!fromGroup) return;
        if (toEl && fromGroup.contains(toEl)) return;
        const sid = getSceneIdFromGroup(fromGroup);
        if (sid) {
            const syn = findSynopsisForScene(sid);
            if (syn) syn.classList.remove('rt-visible');
        }
        const pathEl = fromGroup.querySelector('.rt-scene-path');
        if (pathEl) (pathEl as Element).classList.remove('rt-selected');
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'click', async (e: MouseEvent) => {
        const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Plot"]');
        if (!g) return;
        e.stopPropagation();
        const encodedPath = g.getAttribute('data-path');
        if (!encodedPath) return;
        const filePath = decodeURIComponent(encodedPath);
        const file = view.plugin.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
            await openOrRevealFile((view.plugin as any).app, file);
        }
    });
}


