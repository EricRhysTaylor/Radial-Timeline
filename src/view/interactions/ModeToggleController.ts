import { resetGossamerModeState } from '../../GossamerCommands';
import type { ModeManager } from '../../modes/ModeManager';

interface ModeToggleView {
    currentMode?: string; // New mode system property
    getModeManager?: () => ModeManager | undefined; // Mode manager accessor
    plugin: {
        settings: {
            currentMode?: string; // New mode system
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
        
        // Try to use ModeManager if available
        const modeManager = view.getModeManager?.();
        
        let newMode: string; // Declare for use in UI update below
        
        if (modeManager) {
            // Use ModeManager for clean mode switching
            await modeManager.toggleToNextMode();
            
            // Update UI to reflect new mode
            const currentMode = modeManager.getCurrentMode();
            newMode = currentMode === 'all-scenes' ? 'allscenes' : 'mainplot';
            modeToggle.setAttribute('data-current-mode', newMode);
            
        } else {
            // Fallback mode switching
            let currentModeValue: string;
            if (view.currentMode) {
                currentModeValue = view.currentMode;
            } else {
                currentModeValue = 'all-scenes'; // Default to all-scenes
            }
            
            // Toggle between All Scenes and Main Plot
            const newModeValue = currentModeValue === 'all-scenes' ? 'main-plot' : 'all-scenes';
            
            // Update new mode system
            if (view.currentMode !== undefined) {
                view.currentMode = newModeValue;
            }
            
            // Update settings
            view.plugin.settings.currentMode = newModeValue;
            await view.plugin.saveSettings();
            
            // Reset Gossamer mode state
            resetGossamerModeState();
            
            // Update the data attribute and tooltip
            newMode = newModeValue === 'all-scenes' ? 'allscenes' : 'mainplot';
            modeToggle.setAttribute('data-current-mode', newMode);
            
            // Refresh timeline
            view.plugin.refreshTimelineIfNeeded(null);
        }
        
        const rect = modeToggle.querySelector('rect');
        const title = modeToggle.querySelector('title');
        if (title) {
            title.textContent = newMode === 'allscenes' ? 'Switch to Main Plot mode' : 'Switch to All Scenes mode';
        }
        
        // Animate mode indicators
        const asText = modeToggle.querySelector('.mode-indicator-as') as SVGTextElement;
        const mpText = modeToggle.querySelector('.mode-indicator-mp') as SVGTextElement;
        
        if (asText && mpText) {
            if (newMode === 'allscenes') {
                // Switching to All Scenes: AS slides in from left, MP slides out to right
                asText.classList.remove('mode-indicator-hidden-left');
                asText.classList.add('mode-indicator-visible');
                mpText.classList.remove('mode-indicator-visible');
                mpText.classList.add('mode-indicator-hidden-right');
            } else {
                // Switching to Main Plot: MP slides in from right, AS slides out to left
                mpText.classList.remove('mode-indicator-hidden-right');
                mpText.classList.add('mode-indicator-visible');
                asText.classList.remove('mode-indicator-visible');
                asText.classList.add('mode-indicator-hidden-left');
            }
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

