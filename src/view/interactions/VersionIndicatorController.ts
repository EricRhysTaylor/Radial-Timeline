/*
 * Radial Timeline Plugin for Obsidian — Version Indicator Controller
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type { App } from 'obsidian';
import { getVersionCheckService } from '../../services/VersionCheckService';

/** GitHub issues URL for bug reports with pre-filled template */
const BUG_REPORT_TEMPLATE = `### Bug Description
<!-- Describe the bug clearly and concisely -->


### Steps to Reproduce
1. 
2. 
3. 

### Expected Behavior
<!-- What should have happened? -->


### Actual Behavior
<!-- What actually happened? -->


### Environment
- Obsidian version: 
- Plugin version: 
- Operating system: 

### Additional Context
<!-- Screenshots, error messages, or other relevant info -->
`;

const BUG_REPORT_URL = `https://github.com/EricRhysTaylor/Radial-Timeline/issues/new?labels=bug&title=${encodeURIComponent('[Bug]: ')}&body=${encodeURIComponent(BUG_REPORT_TEMPLATE)}`;

interface VersionIndicatorView {
    plugin: {
        app: App;
    };
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
}

/**
 * Setup click handlers for the version indicator
 * - Bug icon: Opens GitHub issues for bug reporting
 * - Alert icon: Opens Obsidian's community plugins settings for updates
 */
export function setupVersionIndicatorController(view: VersionIndicatorView, svg: SVGSVGElement): void {
    const versionIndicator = svg.querySelector('#version-indicator') as SVGGElement | null;
    if (!versionIndicator) return;

    const hitArea = versionIndicator.querySelector('.rt-version-hitarea') as SVGRectElement | null;

    const handleClick = (ev: Event) => {
        ev.stopPropagation();
        try {
            const versionService = getVersionCheckService();
            if (versionService.isUpdateAvailable()) {
                versionService.openUpdateSettings(view.plugin.app);
            } else {
                window.open(BUG_REPORT_URL, '_blank');
            }
        } catch {
            window.open(BUG_REPORT_URL, '_blank');
        }
    };

    // Prefer the unified hit area; fall back to the whole indicator group
    if (hitArea) {
        view.registerDomEvent(hitArea as unknown as HTMLElement, 'click', handleClick);
    }
    view.registerDomEvent(versionIndicator as unknown as HTMLElement, 'click', handleClick);
    
    // Set cursor to pointer for the entire indicator area
    versionIndicator.style.cursor = 'pointer';
}
