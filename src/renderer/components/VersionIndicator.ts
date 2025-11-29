/*
 * Radial Timeline Plugin for Obsidian — Version Indicator Component
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { formatNumber } from '../../utils/svg';
import { 
    VERSION_INDICATOR_POS_X, 
    VERSION_INDICATOR_POS_Y,
    VERSION_ALERT_OFFSET_X
} from '../layout/LayoutConstants';

/**
 * Badge alert icon SVG path (lucide-badge-alert)
 * Size: 24x24, stroke-width: 1.5
 */
const BADGE_ALERT_ICON = `
<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/>
<line x1="12" x2="12" y1="8" y2="12"/>
<line x1="12" x2="12.01" y1="16" y2="16"/>
`;

export interface VersionIndicatorOptions {
    version: string;
    hasUpdate: boolean;
    latestVersion?: string;
}

/**
 * Determine update severity based on version comparison
 * Returns: 'major' (red), 'minor' (orange), or 'none' (green)
 */
function getUpdateSeverity(current: string, latest: string | undefined): 'none' | 'minor' | 'major' {
    if (!latest) return 'none';
    
    const parseVersion = (v: string): number[] => {
        return v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    };
    
    const [curMajor] = parseVersion(current);
    const [latMajor] = parseVersion(latest);
    
    // Major version bump (e.g., 4.x.x -> 5.x.x)
    if (latMajor > curMajor) {
        return 'major';
    }
    
    // Any other update (minor or patch)
    return 'minor';
}

/**
 * Render the version indicator SVG element
 * Positioned at the bottom-left corner of the timeline
 */
export function renderVersionIndicator(options: VersionIndicatorOptions): string {
    const { version, hasUpdate, latestVersion } = options;
    
    const x = formatNumber(VERSION_INDICATOR_POS_X);
    const y = formatNumber(VERSION_INDICATOR_POS_Y);
    
    // Determine update severity
    const severity = hasUpdate ? getUpdateSeverity(version, latestVersion) : 'none';
    
    // Build classes based on update state and severity
    const groupClasses = ['rt-version-indicator', `rt-update-${severity}`];
    if (hasUpdate) {
        groupClasses.push('rt-has-update');
    }
    
    // Tooltip text
    const tooltipText = hasUpdate && latestVersion
        ? `Version ${version} • Update available: ${latestVersion}\nClick to open plugin settings`
        : `Version ${version}`;
    
    // Version text with pixel font
    const versionText = version;
    
    // Estimate text width for alert icon positioning (approx 6px per char for pixel font)
    const estimatedTextWidth = versionText.length * 6;
    
    // Alert icon positioned to the right of the version text
    const alertIconX = estimatedTextWidth + VERSION_ALERT_OFFSET_X;
    const alertIconY = -12; // Center vertically relative to text baseline
    
    return `
        <g id="version-indicator" class="${groupClasses.join(' ')}" transform="translate(${x}, ${y})">
            <!-- Version text in 04b03b pixel font -->
            <text class="rt-version-text" x="0" y="0">${versionText}</text>
            
            <!-- Update alert icon (hidden by CSS unless rt-has-update class present) -->
            <g class="rt-version-alert-icon" transform="translate(${formatNumber(alertIconX)}, ${formatNumber(alertIconY)}) scale(0.8)">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    ${BADGE_ALERT_ICON}
                </svg>
            </g>
            
            <!-- Invisible hit area for click -->
            <rect x="-4" y="-20" width="${formatNumber(alertIconX + 30)}" height="28" fill="transparent" pointer-events="all">
                <title>${tooltipText}</title>
            </rect>
        </g>
    `;
}

