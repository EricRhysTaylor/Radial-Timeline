/*
 * Radial Timeline Plugin for Obsidian — Version Indicator Controller
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type { App } from 'obsidian';
import { getVersionCheckService } from '../../services/VersionCheckService';

interface VersionIndicatorView {
    plugin: {
        app: App;
    };
    registerDomEvent: (el: HTMLElement, event: string, handler: (ev: Event) => void) => void;
}

/**
 * Setup click handler for the version indicator
 * When clicked (and update is available), opens Obsidian's community plugins settings
 */
export function setupVersionIndicatorController(view: VersionIndicatorView, svg: SVGSVGElement): void {
    const versionIndicator = svg.querySelector('#version-indicator') as SVGGElement | null;
    if (!versionIndicator) return;

    // Handle click on version indicator
    view.registerDomEvent(versionIndicator as unknown as HTMLElement, 'click', () => {
        try {
            const versionService = getVersionCheckService();
            if (versionService.isUpdateAvailable()) {
                // Open Obsidian's settings to community plugins
                versionService.openUpdateSettings(view.plugin.app);
            }
        } catch {
            // Version service not available
        }
    });

    // Handle pointer events for better UX
    view.registerDomEvent(versionIndicator as unknown as HTMLElement, 'pointerenter', () => {
        try {
            const versionService = getVersionCheckService();
            if (versionService.isUpdateAvailable()) {
                versionIndicator.style.cursor = 'pointer';
            }
        } catch {
            // Ignore
        }
    });
}

