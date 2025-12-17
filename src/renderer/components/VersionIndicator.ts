/*
 * Radial Timeline Plugin for Obsidian — Version Indicator Component
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { formatNumber } from '../../utils/svg';
import {
    MONTH_LABEL_RADIUS,
    SVG_SIZE,
    VERSION_INDICATOR_POS_X,
    VERSION_INDICATOR_POS_Y
} from '../layout/LayoutConstants';

/**
 * Octagon alert icon SVG path (lucide-octagon-alert) - shown when update available
 * Size: 24x24, stroke-width: 1
 */
const BADGE_ALERT_ICON = `
<path d="M12 16h.01"/>
<path d="M12 8v4"/>
<path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>
`;

/**
 * Bug icon SVG path (lucide-bug) - shown when no update, links to bug reporting
 * Size: 24x24, stroke-width: 1
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

/** Approximate font size used for version text (px) — must match styles.css */
const VERSION_TEXT_FONT_SIZE_PX = 20;

/** Average character width ratio for the 04b03b font (roughly monospace) */
const VERSION_TEXT_CHAR_WIDTH_RATIO = 0.62;

/** Minimum inner padding from the SVG/circle edge for the version indicator */
const VERSION_INDICATOR_SAFE_PADDING = 32;

/** Hit area size for the icon (px) — see .rt-version-icon-hitarea */
const ICON_HITAREA_SIZE = 32;

const ICON_HITAREA_HALF_WIDTH = ICON_HITAREA_SIZE / 2;

function estimateTextHalfWidth(text: string): number {
    const trimmed = text.trim();
    const effectiveText = trimmed.length ? trimmed : text;
    const charCount = effectiveText.length || 4;
    const approxCharWidthPx = VERSION_TEXT_FONT_SIZE_PX * VERSION_TEXT_CHAR_WIDTH_RATIO;
    return (charCount * approxCharWidthPx) / 2;
}

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

    const rawVersionText = hasUpdate ? 'NEW RELEASE' : version;
    const versionText = rawVersionText.trim() || rawVersionText;

    const actionText = hasUpdate ? 'Update to Latest Version' : 'Report Bug';

    const versionTextHalfWidth = estimateTextHalfWidth(versionText);
    const actionTextHalfWidth = estimateTextHalfWidth(actionText);
    
    // Ensure we have enough space for the widest text (likely the action text)
    const maxHalfWidth = Math.max(versionTextHalfWidth, actionTextHalfWidth, ICON_HITAREA_HALF_WIDTH);

    const viewboxLeftEdge = -(SVG_SIZE / 2);
    const circleLeftEdge = -MONTH_LABEL_RADIUS;
    const safeCanvasCenterX = viewboxLeftEdge + VERSION_INDICATOR_SAFE_PADDING + maxHalfWidth;
    const safeCircleCenterX = circleLeftEdge + VERSION_INDICATOR_SAFE_PADDING + maxHalfWidth;
    const computedX = Math.max(VERSION_INDICATOR_POS_X, safeCanvasCenterX, safeCircleCenterX);
    const x = formatNumber(computedX);
    const y = formatNumber(VERSION_INDICATOR_POS_Y);

    // Determine update severity
    const severity = hasUpdate ? getUpdateSeverity(version, latestVersion) : 'none';

    // Build classes based on update state and severity
    const groupClasses = ['rt-version-indicator', `rt-update-${severity}`];
    if (hasUpdate) {
        groupClasses.push('rt-has-update');
    }

    // Icon positioned below the version text (centered)
    // Scale is 1.0, so width is 24. Center offset is -12
    const iconScale = 1;
    const iconSize = 24 * iconScale;
    const iconX = -(iconSize / 2);
    const iconY = 10;  // Below the text baseline

    // Choose icon based on update state
    const iconContent = hasUpdate ? BADGE_ALERT_ICON : BUG_ICON;
    const iconClass = hasUpdate ? 'rt-version-alert-icon' : 'rt-version-bug-icon';

    return `
        <g id="version-indicator" class="${groupClasses.join(' ')}" transform="translate(${x}, ${y})">
            <!-- Version text (visible by default) -->
            <text class="rt-version-text rt-version-number" x="0" y="0">
                ${versionText}
            </text>

            <!-- Action text (visible on hover) -->
            <text class="rt-version-text rt-version-action" x="0" y="0">
                ${actionText}
            </text>
            
            <!-- Icon below version: Bug icon (no update) or Alert icon (update available) -->
            <g class="${iconClass}" transform="translate(${formatNumber(iconX)}, ${formatNumber(iconY)}) scale(${iconScale})">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                    ${iconContent}
                </svg>
            </g>
            
            <!-- Invisible hit area for icon click -->
            <rect class="rt-version-icon-hitarea" x="${formatNumber(iconX - 4)}" y="${formatNumber(iconY - 4)}" width="${ICON_HITAREA_SIZE}" height="${ICON_HITAREA_SIZE}" fill="white" fill-opacity="0" stroke="none" pointer-events="all">
            </rect>
        </g>
    `;
}
