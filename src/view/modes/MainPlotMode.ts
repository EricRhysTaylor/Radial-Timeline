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
    // Main Plot mode shows main plot SCENES (not beats)
    // Story beats are removed entirely in this mode
    // No muting needed - only main plot scenes are rendered
    
    // Note: Don't add 'scene-hover' class here - it hides subplot labels!
    // The class should only be added during actual hover events

    // Hover to show synopsis for main plot scenes; click to open
    const findSynopsisForScene = (sceneId: string): Element | null => {
        return svg.querySelector(`.rt-scene-info[data-for-scene="${sceneId}"]`);
    };

    const getSceneIdFromGroup = (group: Element): string | null => {
        const pathEl = group.querySelector('.rt-scene-path') as SVGPathElement | null;
        return pathEl?.id || null;
    };

    // Register handlers for Scene elements (main plot scenes)
    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerover', (e: PointerEvent) => {
        const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
        if (!g) return;
        const sid = getSceneIdFromGroup(g);
        if (!sid) return;
        
        // Add scene-hover class to hide subplot labels during hover
        svg.classList.add('scene-hover');
        
        const syn = findSynopsisForScene(sid);
        if (syn) {
            syn.classList.add('rt-visible');
            (view.plugin as any).updateSynopsisPosition(syn, e as unknown as MouseEvent, svg, sid);
        }
        // Emphasize this scene group
        const pathEl = g.querySelector('.rt-scene-path');
        if (pathEl) (pathEl as Element).classList.add('rt-selected');
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', (e: PointerEvent) => {
        const toEl = e.relatedTarget as Element | null;
        const fromGroup = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
        if (!fromGroup) return;
        if (toEl && fromGroup.contains(toEl)) return;
        
        // Remove scene-hover class to show subplot labels again
        svg.classList.remove('scene-hover');
        
        const sid = getSceneIdFromGroup(fromGroup);
        if (sid) {
            const syn = findSynopsisForScene(sid);
            if (syn) syn.classList.remove('rt-visible');
        }
        const pathEl = fromGroup.querySelector('.rt-scene-path');
        if (pathEl) (pathEl as Element).classList.remove('rt-selected');
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'click', async (e: MouseEvent) => {
        const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
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


