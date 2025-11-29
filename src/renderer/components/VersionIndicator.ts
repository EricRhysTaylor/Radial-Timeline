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
 * Badge alert icon SVG path (lucide-badge-alert) - shown when update available
 * Size: 24x24, stroke-width: 1.5
 */
const BADGE_ALERT_ICON = `
<path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z"/>
<line x1="12" x2="12" y1="8" y2="12"/>
<line x1="12" x2="12.01" y1="16" y2="16"/>
`;

/**
 * Bug icon SVG path (lucide-bug) - shown when no update, links to bug reporting
 * Size: 24x24, stroke-width: 1.5
 */
const BUG_ICON = `
<path d="M12 20v-9"/>
<path d="M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4z"/>
<path d="M14.12 3.88 16 2"/>
<path d="M21 21a4 4 0 0 0-3.81-4"/>
<path d="M21 5a4 4 0 0 1-3.55 3.97"/>
<path d="M22 13h-4"/>
<path d="M3 21a4 4 0 0 1 3.81-4"/>
<path d="M3 5a4 4 0 0 0 3.55 3.97"/>
<path d="M6 13H2"/>
<path d="m8 2 1.88 1.88"/>
<path d="M9 7.13V6a3 3 0 1 1 6 0v1.13"/>
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
 * Shows bug icon when up-to-date, update icon when new version available
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
    
    // Version text with pixel font
    const versionText = version;
    
    // Icon positioned below the version text (centered roughly)
    const iconX = 12; // Offset to roughly center under version text
    const iconY = 6;  // Below the text baseline
    
    // Tooltip for version text area
    const versionTooltip = hasUpdate && latestVersion
        ? `Version ${version} • Update available: ${latestVersion}`
        : `Version ${version}`;
    
    // Tooltip for icon
    const iconTooltip = hasUpdate
        ? `Click to update to ${latestVersion}`
        : 'Please report any bugs you encounter here.';
    
    // Choose icon based on update state
    const iconContent = hasUpdate ? BADGE_ALERT_ICON : BUG_ICON;
    const iconClass = hasUpdate ? 'rt-version-alert-icon' : 'rt-version-bug-icon';
    
    return `
        <g id="version-indicator" class="${groupClasses.join(' ')}" transform="translate(${x}, ${y})">
            <!-- Version text in 04b03b pixel font -->
            <text class="rt-version-text" x="0" y="0">
                ${versionText}
                <title>${versionTooltip}</title>
            </text>
            
            <!-- Icon below version: Bug icon (no update) or Alert icon (update available) -->
            <g class="${iconClass}" transform="translate(${formatNumber(iconX)}, ${formatNumber(iconY)}) scale(0.7)">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    ${iconContent}
                </svg>
                <title>${iconTooltip}</title>
            </g>
            
            <!-- Invisible hit area for icon click -->
            <rect class="rt-version-icon-hitarea" x="${formatNumber(iconX - 4)}" y="${formatNumber(iconY - 4)}" width="26" height="26" fill="transparent" pointer-events="all">
                <title>${iconTooltip}</title>
            </rect>
        </g>
    `;
}

