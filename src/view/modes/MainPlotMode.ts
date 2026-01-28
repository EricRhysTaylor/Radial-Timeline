import { TFile, App } from 'obsidian';
import { openOrRevealFile } from '../../utils/fileUtils';
import { SceneInteractionManager } from '../interactions/SceneInteractionManager';
import { updateSynopsisTitleColor } from '../interactions/SynopsisTitleColorManager';
import { maybeHandleZeroDraftClick } from '../interactions/ZeroDraftHandler';

interface ViewLike {
    plugin: {
        app: App;
        settings: {
            enableSceneTitleAutoExpand?: boolean;
            enableZeroDraftMode?: boolean;
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

    // Create scene interaction manager for title expansion and styling
    const totalActs = Math.max(3, (view.plugin.settings as any).actCount ?? 3);
    const manager = new SceneInteractionManager(view as any, svg, totalActs);
    manager.setTitleExpansionEnabled(view.plugin.settings.enableSceneTitleAutoExpand ?? true);

    let currentGroup: Element | null = null;
    let currentSceneId: string | null = null;
    let rafId: number | null = null;

    const clearSelection = () => {
        manager.onSceneLeave();
        currentGroup = null;
        currentSceneId = null;
    };

    const getSceneIdFromGroup = (group: Element): string | null => {
        const pathEl = group.querySelector('.rt-scene-path') as SVGPathElement | null;
        return pathEl?.id || null;
    };

    // Register handlers for Scene elements (main plot scenes)
    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerover', (e: PointerEvent) => {
        const g = (e.target as Element).closest('.rt-scene-group[data-item-type="Scene"]');
        if (!g || g === currentGroup) return;
        
        const sid = getSceneIdFromGroup(g);
        if (!sid) return;
        
        // Clear previous selection
        clearSelection();
        
        // Add scene-hover class to hide subplot labels during hover
        svg.classList.add('scene-hover');
        
        currentGroup = g;
        currentSceneId = sid;
        
        // Use manager for hover interactions (handles title expansion and styling)
        // Pass mouse event to position synopsis immediately and prevent flicker
        manager.onSceneHover(g, sid, e as unknown as MouseEvent);
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', (e: PointerEvent) => {
        const toEl = e.relatedTarget as Element | null;
        if (currentGroup && toEl && currentGroup.contains(toEl)) return;
        
        // Remove scene-hover class to show subplot labels again
        svg.classList.remove('scene-hover');
        
        clearSelection();
    });

    view.registerDomEvent(svg as unknown as HTMLElement, 'pointermove', (e: PointerEvent) => {
        if (rafId !== null) return;
        rafId = window.requestAnimationFrame(() => {
            manager.onMouseMove(e as unknown as MouseEvent);
            rafId = null;
        });
    });
    
    // Cleanup on pointerout
    view.registerDomEvent(svg as unknown as HTMLElement, 'pointerout', () => {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
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
            const zeroDraftHandled = await maybeHandleZeroDraftClick({
                app: view.plugin.app,
                file,
                enableZeroDraftMode: view.plugin.settings.enableZeroDraftMode,
                sceneTitle: file.basename || 'Scene',
                onOverrideOpen: async () => openOrRevealFile((view.plugin as any).app, file)
            });
            if (zeroDraftHandled) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            await openOrRevealFile((view.plugin as any).app, file);
        }
    });
}

