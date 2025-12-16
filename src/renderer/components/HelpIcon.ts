/*
 * Radial Timeline Plugin for Obsidian — Help Icon Component
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import { formatNumber } from '../../utils/svg';
import {
    HELP_ICON_POS_X,
    HELP_ICON_POS_Y
} from '../layout/LayoutConstants';

const LIFE_BUOY_ICON = `
<circle cx="12" cy="12" r="10"/>
<path d="m4.93 4.93 4.24 4.24"/>
<path d="m14.83 9.17 4.24-4.24"/>
<path d="m14.83 14.83 4.24 4.24"/>
<path d="m9.17 14.83-4.24 4.24"/>
<circle cx="12" cy="12" r="4"/>
`;

/**
 * Render the help icon SVG element
 * Positioned at the bottom-right corner of the timeline
 */
export function renderHelpIcon(): string {
    const x = formatNumber(HELP_ICON_POS_X);
    const y = formatNumber(HELP_ICON_POS_Y);

    const iconSize = 24;
    const iconHalfSize = iconSize / 2;
    
    // Center the icon relative to the position
    // Matches alignment of VersionIndicator icon which is roughly at the same Y level
    const iconX = -iconHalfSize;
    // Align vertically with the version icon (which is at Y + 10 in VersionIndicator)
    // VersionIndicator Y is 734. Its icon is at y=10. So absolute Y ~ 744.
    // If we use HELP_ICON_POS_Y = 734, we should add 10 to match visual weight.
    const iconY = 10 - iconHalfSize; 

    return `
        <g id="help-icon" class="rt-help-icon" transform="translate(${x}, ${y})">
            <g transform="translate(${formatNumber(iconX)}, ${formatNumber(iconY)})">
                 <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-life-buoy-icon lucide-life-buoy">
                    ${LIFE_BUOY_ICON}
                </svg>
            </g>
            <title>Get Help</title>
            
            <!-- Hit area -->
             <rect class="rt-help-icon-hitarea" x="${formatNumber(iconX - 8)}" y="${formatNumber(iconY - 8)}" width="${iconSize + 16}" height="${iconSize + 16}" fill="white" fill-opacity="0" stroke="none" pointer-events="all">
                <title>Get Help</title>
            </rect>
        </g>
    `;
}
