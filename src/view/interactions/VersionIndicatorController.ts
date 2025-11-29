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

    // Find the icon hit area
    const iconHitarea = versionIndicator.querySelector('.rt-version-icon-hitarea') as SVGRectElement | null;
    
    // Handle click on icon area
    if (iconHitarea) {
        view.registerDomEvent(iconHitarea as unknown as HTMLElement, 'click', (ev: Event) => {
            ev.stopPropagation();
            try {
                const versionService = getVersionCheckService();
                if (versionService.isUpdateAvailable()) {
                    // Update available - open Obsidian's settings to community plugins
                    versionService.openUpdateSettings(view.plugin.app);
                } else {
                    // No update - open GitHub issues for bug reporting
                    window.open(BUG_REPORT_URL, '_blank');
                }
            } catch {
                // Fallback: open bug report URL
                window.open(BUG_REPORT_URL, '_blank');
            }
        });
    }

    // Also handle click on the icon group itself
    const bugIcon = versionIndicator.querySelector('.rt-version-bug-icon') as SVGGElement | null;
    const alertIcon = versionIndicator.querySelector('.rt-version-alert-icon') as SVGGElement | null;
    
    if (bugIcon) {
        view.registerDomEvent(bugIcon as unknown as HTMLElement, 'click', (ev: Event) => {
            ev.stopPropagation();
            window.open(BUG_REPORT_URL, '_blank');
        });
    }
    
    if (alertIcon) {
        view.registerDomEvent(alertIcon as unknown as HTMLElement, 'click', (ev: Event) => {
            ev.stopPropagation();
            try {
                const versionService = getVersionCheckService();
                versionService.openUpdateSettings(view.plugin.app);
            } catch {
                // Ignore
            }
        });
    }
    
    // Set cursor to pointer for the icon area
    versionIndicator.style.cursor = 'pointer';
}
