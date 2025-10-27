import { resetGossamerModeState } from '../../GossamerCommands';
import type { ModeManager } from '../../modes/ModeManager';
import { TimelineMode } from '../../modes/ModeDefinition';

interface ModeToggleView {
    currentMode?: string;
    getModeManager?: () => ModeManager | undefined;
    plugin: {
        settings: { currentMode?: string };
        saveSettings: () => Promise<void>;
        refreshTimelineIfNeeded: (file: unknown) => void;
    };
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
}

const MODE_OPTIONS = [
    { id: 'all-scenes', label: 'All Scenes', acronym: 'ALLS', order: 1 },
    { id: 'main-plot', label: 'Main Plot', acronym: 'MAIN', order: 2 },
    { id: 'chronologue', label: 'Chronologue', acronym: 'CHRO', order: 3 },
    { id: 'gossamer', label: 'Gossamer', acronym: 'GOSS', order: 4 }
] as const;

// Positioning constants (adjustable values)
const POS_X = 658; // Horizontal center position
const POS_Y = -800; // Vertical position (200px from top)
const ICON_VISUAL_WIDTH = 46; // Actual rendered width (92 * 0.5 scale)
const ICON_VISUAL_GAP_INACTIVE = 4; // Gap between non-active icons
const ICON_VISUAL_GAP_ACTIVE = 15; // Gap between active and non-active icons
const ICON_WIDTH = 92; // Base width for SVG path
const ICON_HEIGHT = 126; // Height of icon
const MIN_SCALE = 0.5; // Scale for inactive icons
const ACTIVE_SCALE = 0.6; // Base scale for active icon (before CSS 1.2x)

/**
 * Create SVG path for document shape with folded corner
 * Based on provided SVG with viewBox 0 0 92 126
 */
function createDocumentShape(): string {
    return 'M0.0740741 108.5C0.0740711 118 3.35321 126 18.8532 126H74.3532C85.9532 126 91.0013 112.5 91.0741 105C91.2407 87.8333 91.0741 55.2111 91.0741 48C91.0741 43 87.8224 33.4634 74.3532 17.5C60.8532 1.5 49.8532 0 46.0741 0H17.0741C4.85322 0 0.12237 9 0.0740749 17.5C-0.0925918 46.8333 0.0740765 100.49 0.0740741 108.5Z';
}

/**
 * Create the mode selector grid element
 */
function createModeSelectorGrid(): SVGGElement {
    const grid = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    grid.setAttribute('class', 'rt-mode-selector-grid');
    grid.setAttribute('id', 'mode-selector');
    
    // Initial positioning with inactive gaps (will be adjusted in updateState)
    const spacePerIcon = ICON_VISUAL_WIDTH + ICON_VISUAL_GAP_INACTIVE;
    const totalWidth = MODE_OPTIONS.length * ICON_VISUAL_WIDTH + (MODE_OPTIONS.length - 1) * ICON_VISUAL_GAP_INACTIVE;
    const startX = POS_X - totalWidth / 2 + ICON_VISUAL_WIDTH / 2;
    
    MODE_OPTIONS.forEach((mode, index) => {
        const x = startX + index * spacePerIcon;
        
        // Create mode option group
        const optionGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        optionGroup.setAttribute('class', 'rt-mode-option');
        optionGroup.setAttribute('data-mode', mode.id);
        optionGroup.setAttribute('transform', `translate(${x}, ${POS_Y}) scale(${MIN_SCALE})`);
        
        // Create path element
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'rt-document-bg');
        path.setAttribute('d', createDocumentShape());
        
        // Create text element
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'rt-mode-acronym-text');
        text.setAttribute('x', String(ICON_WIDTH / 2));
        text.setAttribute('y', String(ICON_HEIGHT - 16));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.textContent = mode.acronym;
        
        optionGroup.appendChild(path);
        optionGroup.appendChild(text);
        grid.appendChild(optionGroup);
    });
    
    return grid;
}

/**
 * Switch to the specified mode
 */
async function switchToMode(view: ModeToggleView, modeId: string, modeSelector: SVGGElement): Promise<void> {
    const modeManager = view.getModeManager?.();
    
    if (modeManager) {
        await modeManager.switchMode(modeId as TimelineMode as any);
    } else {
        view.plugin.settings.currentMode = modeId;
        await view.plugin.saveSettings();
        resetGossamerModeState();
        view.plugin.refreshTimelineIfNeeded(null);
    }
    
    updateModeSelectorState(modeSelector, modeId);
}

/**
 * Update the visual state of the mode selector
 */
function updateModeSelectorState(modeSelector: SVGGElement, currentMode: string): void {
    const activeIndex = MODE_OPTIONS.findIndex(m => m.id === currentMode);
    
    // Calculate positions with different gaps
    let x = POS_X;
    const positions: number[] = [];
    
    for (let i = 0; i < MODE_OPTIONS.length; i++) {
        positions.push(x);
        
        if (i === activeIndex) {
            // After active icon, add larger gap
            x += ICON_VISUAL_WIDTH + ICON_VISUAL_GAP_ACTIVE;
        } else if (i + 1 === activeIndex) {
            // Before active icon, add larger gap
            x += ICON_VISUAL_WIDTH + ICON_VISUAL_GAP_ACTIVE;
        } else {
            // Between inactive icons
            x += ICON_VISUAL_WIDTH + ICON_VISUAL_GAP_INACTIVE;
        }
    }
    
    // Center the group
    const totalWidth = positions[positions.length - 1] + ICON_VISUAL_WIDTH - positions[0];
    const offset = POS_X - (positions[0] + positions[positions.length - 1]) / 2;
    
    MODE_OPTIONS.forEach((mode, index) => {
        const modeElement = modeSelector.querySelector(`[data-mode="${mode.id}"]`);
        if (!modeElement) return;
        
        const bg = modeElement.querySelector('.rt-document-bg') as SVGElement;
        const text = modeElement.querySelector('.rt-mode-acronym-text') as SVGElement;
        
        const finalX = positions[index] + offset;
        
        if (mode.id === currentMode) {
            modeElement.setAttribute('transform', `translate(${finalX}, ${POS_Y}) scale(${ACTIVE_SCALE})`);
            modeElement.classList.add('rt-mode-current');
            bg.classList.add('rt-active');
            text.classList.add('rt-active');
        } else {
            modeElement.setAttribute('transform', `translate(${finalX}, ${POS_Y}) scale(${MIN_SCALE})`);
            modeElement.classList.remove('rt-mode-current');
            bg.classList.remove('rt-active');
            text.classList.remove('rt-active');
        }
    });
}

/**
 * Initialize mode selector controls for a view
 */
export function setupModeToggleController(view: ModeToggleView, svg: SVGSVGElement): void {
    
    // Create mode selector grid
    const modeSelector = createModeSelectorGrid();
    svg.appendChild(modeSelector);
    
    // Update initial state
    updateModeSelectorState(modeSelector, view.currentMode || 'all-scenes');
    
    // Register click handlers for each mode option
    MODE_OPTIONS.forEach(mode => {
        const modeElement = modeSelector.querySelector(`[data-mode="${mode.id}"]`);
        if (modeElement) {
            view.registerDomEvent(modeElement as unknown as HTMLElement, 'click', async (e: MouseEvent) => {
                e.stopPropagation();
                await switchToMode(view, mode.id, modeSelector);
            });
        }
    });
    
    // Register hover handlers for visual feedback
    MODE_OPTIONS.forEach(mode => {
        const modeElement = modeSelector.querySelector(`[data-mode="${mode.id}"]`);
        if (modeElement) {
            view.registerDomEvent(modeElement as unknown as HTMLElement, 'mouseenter', (e: MouseEvent) => {
                modeElement.classList.add('rt-mode-hover');
            });
            
            view.registerDomEvent(modeElement as unknown as HTMLElement, 'mouseleave', (e: MouseEvent) => {
                modeElement.classList.remove('rt-mode-hover');
            });
        }
    });
}
