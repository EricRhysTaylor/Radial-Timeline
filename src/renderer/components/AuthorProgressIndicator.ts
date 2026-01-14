import { formatNumber } from '../../utils/svg';
import { VERSION_INDICATOR_POS_X, VERSION_INDICATOR_POS_Y, SVG_SIZE, MONTH_LABEL_RADIUS } from '../layout/LayoutConstants';

// Constants matching VersionIndicator
const VERSION_INDICATOR_SAFE_PADDING = 32;
const ICON_HITAREA_HALF_WIDTH = 16; // Half of 32px icon hit area
const VERSION_TEXT_FONT_SIZE_PX = 20; // Matches milestone/help text

/**
 * Estimate half-width of text for positioning calculations
 * Matches VersionIndicator logic
 */
function estimateTextHalfWidth(text: string): number {
    const charCount = text.length || 4;
    const approxCharWidthPx = VERSION_TEXT_FONT_SIZE_PX * 0.6; // Approximate character width
    return (charCount * approxCharWidthPx) / 2;
}

/**
 * Render the APR Refresh indicator in the timeline view
 * Positioned above the version indicator (bottom-left corner)
 * Shows pulsing alert when APR needs refresh
 * Uses same X position computation as version indicator to ensure alignment
 */
export function renderAuthorProgressIndicator(params: {
    needsRefresh: boolean;
    x?: number;
    y?: number;
}): string {
    if (!params.needsRefresh) return '';

    // Compute X position using same logic as version indicator
    // This ensures APR aligns horizontally with the bug report icon
    const aprText = 'APR REFRESH';
    const aprTextHalfWidth = estimateTextHalfWidth(aprText);
    const maxHalfWidth = Math.max(aprTextHalfWidth, ICON_HITAREA_HALF_WIDTH);
    
    const viewboxLeftEdge = -(SVG_SIZE / 2);
    const circleLeftEdge = -MONTH_LABEL_RADIUS;
    const safeCanvasCenterX = viewboxLeftEdge + VERSION_INDICATOR_SAFE_PADDING + maxHalfWidth;
    const safeCircleCenterX = circleLeftEdge + VERSION_INDICATOR_SAFE_PADDING + maxHalfWidth;
    const computedX = Math.max(VERSION_INDICATOR_POS_X, safeCanvasCenterX, safeCircleCenterX);
    
    const x = params.x ?? computedX;
    const y = params.y ?? 684;

    // Alert icon path (triangle with exclamation) - sized to match bug icon (24px)
    const alertIcon = `
        <path d="M0 -8 L8 6 L-8 6 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>
        <line x1="0" y1="-3" x2="0" y2="2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <circle cx="0" cy="5" r="1" fill="currentColor"/>
    `;

    // Icon size matches bug icon (24px)
    const iconSize = 24;
    const iconY = 10; // Same spacing as bug icon (10px below text baseline)

    return `
        <g id="apr-refresh-indicator" class="rt-apr-indicator" transform="translate(${formatNumber(x)}, ${formatNumber(y)})">
            <!-- Hit area for click -->
            <rect class="rt-apr-hitarea" x="-60" y="-12" width="120" height="50" rx="6" ry="6"
                fill="white" fill-opacity="0" stroke="none" pointer-events="all" />

            <!-- Text label above icon (single text, hover reveal like milestone) -->
            <text class="rt-apr-indicator-text" x="0" y="0" text-anchor="middle" dominant-baseline="baseline">
                ${aprText}
            </text>

            <!-- Pulsing alert icon below text - same size and spacing as bug icon -->
            <g class="rt-apr-alert-icon" transform="translate(0, ${formatNumber(iconY)})">
                <!-- Outer pulse ring - larger to match milestone indicator -->
                <circle r="16" fill="var(--text-error, #ef4444)" opacity="0.15">
                    <animate attributeName="r" values="16;22;16" dur="1.8s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.15;0.35;0.15" dur="1.8s" repeatCount="indefinite" />
                </circle>
                <!-- Inner solid circle - matches milestone indicator size -->
                <circle r="12" fill="var(--text-error, #ef4444)" opacity="0.9" />
                <!-- Alert icon - 24px size to match bug icon -->
                <g transform="translate(-12, -12)" stroke="white" fill="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                        ${alertIcon}
                    </svg>
                </g>
            </g>
        </g>
    `;
}
