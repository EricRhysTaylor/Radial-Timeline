import { resetGossamerModeState } from '../../GossamerCommands';

interface ModeToggleView {
    plugin: {
        settings: {
            outerRingAllScenes?: boolean;
        };
        saveSettings: () => Promise<void>;
        refreshTimelineIfNeeded: (file: unknown) => void;
    };
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
}

export function setupModeToggleController(view: ModeToggleView, svg: SVGSVGElement): void {
    const modeToggle = svg.querySelector('#mode-toggle') as SVGGElement | null;
    if (!modeToggle) return;

    // Click handler to cycle through modes: All Scenes → Main Plot → All Scenes
    view.registerDomEvent(modeToggle as unknown as HTMLElement, 'click', async (e: MouseEvent) => {
        e.stopPropagation();
        
        const currentMode = view.plugin.settings.outerRingAllScenes ? 'allscenes' : 'mainplot';
        
        // Toggle between All Scenes and Main Plot
        // (Gossamer mode is activated via separate command, not this toggle)
        view.plugin.settings.outerRingAllScenes = !view.plugin.settings.outerRingAllScenes;
        await view.plugin.saveSettings();
        
        // Reset Gossamer mode state so it remembers the new mode correctly
        resetGossamerModeState();
        
        // Update the data attribute and tooltip
        const newMode = view.plugin.settings.outerRingAllScenes ? 'allscenes' : 'mainplot';
        modeToggle.setAttribute('data-current-mode', newMode);
        
        const rect = modeToggle.querySelector('rect');
        const title = modeToggle.querySelector('title');
        if (title) {
            title.textContent = newMode === 'allscenes' ? 'Switch to Main Plot mode' : 'Switch to All Scenes mode';
        }
        
        // Refresh the timeline to show the new mode
        view.plugin.refreshTimelineIfNeeded(null);
    });

    // Add hover effect using CSS class
    view.registerDomEvent(modeToggle as unknown as HTMLElement, 'pointerover', () => {
        modeToggle.classList.add('rt-mode-toggle-hover');
    });

    view.registerDomEvent(modeToggle as unknown as HTMLElement, 'pointerout', () => {
        modeToggle.classList.remove('rt-mode-toggle-hover');
    });
}

