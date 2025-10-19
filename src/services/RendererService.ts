import type { App } from 'obsidian';

export class RendererService {
    private app: App;
    constructor(app: App) { this.app = app; }

    /**
     * Update open-file visual state without full re-render.
     * Adds/removes rt-scene-is-open classes on scene groups and associated number elements.
     */
    updateOpenClasses(container: HTMLElement, openPaths: Set<string>): boolean {
        const svg = container.querySelector('.radial-timeline-svg') as SVGSVGElement | null;
        if (!svg) return false;

        const sceneGroups = Array.from(svg.querySelectorAll('.rt-scene-group')) as Element[];
        sceneGroups.forEach(group => {
            const encPath = group.getAttribute('data-path');
            const path = encPath ? decodeURIComponent(encPath) : '';
            const isOpen: boolean = path !== '' && openPaths.has(path);

            // Toggle group-level open class
            group.classList.toggle('rt-scene-is-open', isOpen);

            const scenePath = group.querySelector('.rt-scene-path');
            const sceneTitle = group.querySelector('.rt-scene-title');
            if (scenePath) scenePath.classList.toggle('rt-scene-is-open', isOpen);
            if (sceneTitle) sceneTitle.classList.toggle('rt-scene-is-open', isOpen);

            const sceneId = (scenePath as SVGPathElement | null)?.id;
            if (sceneId) {
                const numSquare = svg.querySelector(`.rt-number-square[data-scene-id="${sceneId}"]`);
                const numText = svg.querySelector(`.rt-number-text[data-scene-id="${sceneId}"]`);
                if (numSquare) numSquare.classList.toggle('rt-scene-is-open', isOpen);
                if (numText) numText.classList.toggle('rt-scene-is-open', isOpen);
            }
        });

        return true;
    }
}


