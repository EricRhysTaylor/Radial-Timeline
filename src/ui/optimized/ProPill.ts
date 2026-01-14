/**
 * OPTIMIZED: Pro Pill v1 — design-locked reference component.
 * Do not normalize, generalize, or convert to variant-based helpers.
 * Any changes require explicit approval.
 */

import { setIcon } from 'obsidian';

/**
 * Renders the PRO pill exactly as designed.
 * Returns the pill element for placement.
 */
export function renderOptimizedProPill(parent: HTMLElement): HTMLElement {
    const pill = parent.createSpan({ cls: 'rt-optimized-pro-pill' });
    
    // Icon container
    const iconEl = pill.createSpan({ cls: 'rt-optimized-pro-pill__icon' });
    setIcon(iconEl, 'signature');
    
    // Text
    pill.createSpan({ cls: 'rt-optimized-pro-pill__text', text: 'PRO' });
    
    return pill;
}
