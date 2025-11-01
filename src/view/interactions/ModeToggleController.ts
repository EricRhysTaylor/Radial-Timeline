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

// Base SVG dimensions (source viewBox size - original path coordinates)
const ICON_BASE_WIDTH = 92; // Original width for SVG path
const ICON_BASE_HEIGHT = 126; // Original height of icon

// Target visual sizes (native size - no scaling, prevents stroke distortion)
const INACTIVE_VISUAL_WIDTH = 46; // Native size for inactive icons
const ACTIVE_VISUAL_WIDTH = 55; // Native size for active icon

// Scale factors to convert base coordinates to target sizes
const INACTIVE_SCALE = INACTIVE_VISUAL_WIDTH / ICON_BASE_WIDTH; // ~0.5
const ACTIVE_SCALE = ACTIVE_VISUAL_WIDTH / ICON_BASE_WIDTH; // ~0.598

// Calculated heights from scaled base height
const INACTIVE_VISUAL_HEIGHT = ICON_BASE_HEIGHT * INACTIVE_SCALE; // ~63
const ACTIVE_VISUAL_HEIGHT = ICON_BASE_HEIGHT * ACTIVE_SCALE; // ~75.4

// Visual spacing
const ICON_VISUAL_GAP_INACTIVE = 4; // Gap between non-active icons
const ICON_VISUAL_GAP_ACTIVE = 15; // Gap between active and non-active icons

/**
 * Scale SVG path coordinates to target size
 * @param pathData Original path string
 * @param scale Scale factor to apply
 * @returns Scaled path string
 */
function scalePath(pathData: string, scale: number): string {
    // Parse and scale all numeric values in the path
    return pathData.replace(/([-\d.]+)/g, (match) => {
        const num = parseFloat(match);
        return isNaN(num) ? match : String(num * scale);
    });
}

/**
 * Original SVG path for document shape with folded corner
 * Based on viewBox 0 0 92 126
 */
const ORIGINAL_DOCUMENT_PATH = 'M0.0740741 108.5C0.0740711 118 3.35321 126 18.8532 126H74.3532C85.9532 126 91.0013 112.5 91.0741 105C91.2407 87.8333 91.0741 55.2111 91.0741 48C91.0741 43 87.8224 33.4634 74.3532 17.5C60.8532 1.5 49.8532 0 46.0741 0H17.0741C4.85322 0 0.12237 9 0.0740749 17.5C-0.0925918 46.8333 0.0740765 100.49 0.0740741 108.5Z';

/**
 * Create SVG path for document shape scaled to inactive size (46px width)
 */
function createInactiveDocumentShape(): string {
    return scalePath(ORIGINAL_DOCUMENT_PATH, INACTIVE_SCALE);
}

/**
 * Create SVG path for document shape scaled to active size (55px width)
 */
function createActiveDocumentShape(): string {
    return scalePath(ORIGINAL_DOCUMENT_PATH, ACTIVE_SCALE);
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
        
        // Create outer group for positioning (translate only)
        const optionGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        optionGroup.setAttribute('class', 'rt-mode-option');
        optionGroup.setAttribute('data-mode', mode.id);
        optionGroup.setAttribute('transform', `translate(${x}, ${POS_Y})`);
        
        // Create inner group for hover scaling (CSS transform will apply here)
        const innerGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        innerGroup.setAttribute('class', 'rt-mode-option-content');
        
        // Create path element - scaled to inactive size (native)
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'rt-document-bg');
        path.setAttribute('d', createInactiveDocumentShape());
        
        // Create text element (acronym) - coordinates scaled to inactive size
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', 'rt-mode-acronym-text');
        text.setAttribute('x', String((ICON_BASE_WIDTH / 2) * INACTIVE_SCALE));
        text.setAttribute('y', String((ICON_BASE_HEIGHT - 16) * INACTIVE_SCALE));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.textContent = mode.acronym;
        
        // Create number label (1, 2, 3, 4) at top left corner - coordinates scaled
        const numberLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        numberLabel.setAttribute('class', 'rt-mode-number-label');
        numberLabel.setAttribute('x', String(12 * INACTIVE_SCALE));
        numberLabel.setAttribute('y', String(20 * INACTIVE_SCALE));
        numberLabel.setAttribute('text-anchor', 'start');
        numberLabel.setAttribute('dominant-baseline', 'middle');
        numberLabel.textContent = String(index + 1);
        
        innerGroup.appendChild(path);
        innerGroup.appendChild(text);
        innerGroup.appendChild(numberLabel);
        optionGroup.appendChild(innerGroup);
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
            // Active mode - no scale transform, use native active size path
            modeElement.setAttribute('transform', `translate(${finalX}, ${POS_Y})`);
            modeElement.classList.add('rt-mode-current');
            bg.classList.add('rt-active');
            text.classList.add('rt-active');
            if (numberLabel) numberLabel.classList.add('rt-active');
            
            // Update path to active size (native)
            bg.setAttribute('d', createActiveDocumentShape());
            
            // Update text positions to active size
            text.setAttribute('x', String((ICON_BASE_WIDTH / 2) * ACTIVE_SCALE));
            text.setAttribute('y', String((ICON_BASE_HEIGHT - 16) * ACTIVE_SCALE));
            if (numberLabel) {
                numberLabel.setAttribute('x', String(12 * ACTIVE_SCALE));
                numberLabel.setAttribute('y', String(20 * ACTIVE_SCALE));
            }
        } else {
            // Inactive mode - no scale transform, use native inactive size path
            modeElement.setAttribute('transform', `translate(${finalX}, ${POS_Y})`);
            modeElement.classList.remove('rt-mode-current');
            bg.classList.remove('rt-active');
            text.classList.remove('rt-active');
            if (numberLabel) numberLabel.classList.remove('rt-active');
            
            // Update path to inactive size (native)
            bg.setAttribute('d', createInactiveDocumentShape());
            
            // Update text positions to inactive size
            text.setAttribute('x', String((ICON_BASE_WIDTH / 2) * INACTIVE_SCALE));
            text.setAttribute('y', String((ICON_BASE_HEIGHT - 16) * INACTIVE_SCALE));
            if (numberLabel) {
                numberLabel.setAttribute('x', String(12 * INACTIVE_SCALE));
                numberLabel.setAttribute('y', String(20 * INACTIVE_SCALE));
            }
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
        // If focus is inside an input/textarea/select or a contenteditable element, don't intercept
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl) {
            const tag = activeEl.tagName.toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || activeEl.isContentEditable) {
                return; // Let the input handle the keystroke
            }
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
    
    // Register hover handlers for visual feedback (color changes only, no scaling)
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
