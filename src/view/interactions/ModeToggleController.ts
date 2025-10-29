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
const POS_Y = -750; // Vertical position (200px from top)

// Base SVG dimensions (source viewBox size)
const ICON_WIDTH = 92; // Base width for SVG path
const ICON_HEIGHT = 126; // Height of icon

// Target visual sizes (scale UP from smaller base to preserve stroke width)
const INACTIVE_VISUAL_WIDTH = 46; // Target size for inactive icons
const ACTIVE_VISUAL_WIDTH = 55; // Target size for active icon (before CSS 1.2x boost)

// Calculate scale factors (scaling UP from base size)
const MIN_SCALE = INACTIVE_VISUAL_WIDTH / ICON_WIDTH; // ~0.5 - inactive icons
const ACTIVE_SCALE = ACTIVE_VISUAL_WIDTH / ICON_WIDTH; // ~0.598 - active icon base

// Visual spacing
const ICON_VISUAL_GAP_INACTIVE = 4; // Gap between non-active icons
const ICON_VISUAL_GAP_ACTIVE = 15; // Gap between active and non-active icons

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
    const spacePerIcon = INACTIVE_VISUAL_WIDTH + ICON_VISUAL_GAP_INACTIVE;
    const totalWidth = MODE_OPTIONS.length * INACTIVE_VISUAL_WIDTH + (MODE_OPTIONS.length - 1) * ICON_VISUAL_GAP_INACTIVE;
    const startX = POS_X - totalWidth / 2 + INACTIVE_VISUAL_WIDTH / 2;
    
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
        
        // Create text element (acronym)
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'rt-mode-acronym-text');
        text.setAttribute('x', String(ICON_WIDTH / 2));
        text.setAttribute('y', String(ICON_HEIGHT - 16));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.textContent = mode.acronym;
        
        // Create number label (1, 2, 3, 4) at top left corner
        const numberLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        numberLabel.setAttribute('class', 'rt-mode-number-label');
        numberLabel.setAttribute('x', '12');
        numberLabel.setAttribute('y', '20');
        numberLabel.setAttribute('text-anchor', 'start');
        numberLabel.setAttribute('dominant-baseline', 'middle');
        numberLabel.textContent = String(index + 1);
        
        optionGroup.appendChild(path);
        optionGroup.appendChild(text);
        optionGroup.appendChild(numberLabel);
        grid.appendChild(optionGroup);
    });
    
    // Add mode title text above the first icon
    const titleText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    titleText.setAttribute('class', 'rt-mode-title-text');
    titleText.setAttribute('x', String(startX));
    titleText.setAttribute('y', String(POS_Y - 30));
    titleText.setAttribute('text-anchor', 'start');
    titleText.setAttribute('dominant-baseline', 'baseline');
    titleText.setAttribute('id', 'mode-title');
    // Set initial text content to first mode
    if (MODE_OPTIONS.length > 0) {
        titleText.textContent = MODE_OPTIONS[0].label;
    }
    
    grid.appendChild(titleText);
    
    return grid;
}

/**
 * Switch to the specified mode
 */
async function switchToMode(view: ModeToggleView, modeId: string, modeSelector: SVGGElement): Promise<void> {
    // Update UI immediately for instant visual feedback
    updateModeSelectorState(modeSelector, modeId);
    
    const modeManager = view.getModeManager?.();
    
    if (modeManager) {
        await modeManager.switchMode(modeId as TimelineMode as any);
    } else {
        // Fallback: try direct refresh first, then debounced
        view.plugin.settings.currentMode = modeId;
        await view.plugin.saveSettings();
        resetGossamerModeState();
        
        // Use direct refresh if available (bypasses 400ms debounce)
        if (typeof (view as any).refreshTimeline === 'function') {
            (view as any).refreshTimeline();
        } else {
            view.plugin.refreshTimelineIfNeeded(null);
        }
    }
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
            x += ACTIVE_VISUAL_WIDTH + ICON_VISUAL_GAP_ACTIVE;
        } else if (i + 1 === activeIndex) {
            // Before active icon, add larger gap
            x += INACTIVE_VISUAL_WIDTH + ICON_VISUAL_GAP_ACTIVE;
        } else {
            // Between inactive icons
            x += INACTIVE_VISUAL_WIDTH + ICON_VISUAL_GAP_INACTIVE;
        }
    }
    
    // Center the group
    const totalWidth = positions[positions.length - 1] + INACTIVE_VISUAL_WIDTH - positions[0];
    const offset = POS_X - (positions[0] + positions[positions.length - 1]) / 2;
    
    MODE_OPTIONS.forEach((mode, index) => {
        const modeElement = modeSelector.querySelector(`[data-mode="${mode.id}"]`);
        if (!modeElement) return;
        
        const bg = modeElement.querySelector('.rt-document-bg') as SVGElement;
        const text = modeElement.querySelector('.rt-mode-acronym-text') as SVGElement;
        const numberLabel = modeElement.querySelector('.rt-mode-number-label') as SVGElement;
        
        const finalX = positions[index] + offset;
        
        if (mode.id === currentMode) {
            modeElement.setAttribute('transform', `translate(${finalX}, ${POS_Y}) scale(${ACTIVE_SCALE})`);
            modeElement.classList.add('rt-mode-current');
            bg.classList.add('rt-active');
            text.classList.add('rt-active');
            if (numberLabel) numberLabel.classList.add('rt-active');
        } else {
            modeElement.setAttribute('transform', `translate(${finalX}, ${POS_Y}) scale(${MIN_SCALE})`);
            modeElement.classList.remove('rt-mode-current');
            bg.classList.remove('rt-active');
            text.classList.remove('rt-active');
            if (numberLabel) numberLabel.classList.remove('rt-active');
        }
    });
    
    // Update mode title text position and content
    const titleText = modeSelector.querySelector('#mode-title') as SVGTextElement;
    if (titleText) {
        if (activeIndex >= 0) {
            titleText.textContent = MODE_OPTIONS[activeIndex].label;
        }
        // Position the title above the first icon (index 0)
        const firstIconX = positions[0] + offset;
        titleText.setAttribute('x', String(firstIconX));
        titleText.setAttribute('y', String(POS_Y - 30));
    }
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
    
    // Register keyboard shortcuts (1, 2, 3, 4)
    const handleKeyPress = async (e: KeyboardEvent) => {
        // Only handle shortcuts when the radial timeline is the active view
        const activeView = (view as any).app?.workspace?.activeLeaf?.view;
        if (activeView !== view) {
            return; // Different view is active, don't intercept
        }
        
        const key = parseInt(e.key);
        if (key >= 1 && key <= 4 && key <= MODE_OPTIONS.length) {
            e.preventDefault();
            const modeId = MODE_OPTIONS[key - 1].id;
            await switchToMode(view, modeId, modeSelector);
        }
    };
    
    // SAFE: Manual cleanup registered in view.onClose() via _modeToggleCleanup
    document.addEventListener('keydown', handleKeyPress);
    
    // Store cleanup function
    (view as any)._modeToggleCleanup = () => {
        document.removeEventListener('keydown', handleKeyPress);
    };
    
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
