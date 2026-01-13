import { formatNumber } from '../../utils/svg';

/**
 * Render the APR Refresh indicator in the timeline view
 * Positioned above the version indicator (bottom-left corner)
 * Shows pulsing alert when APR needs refresh
 */
export function renderAuthorProgressIndicator(params: {
    needsRefresh: boolean;
    x?: number;
    y?: number;
}): string {
    if (!params.needsRefresh) return '';

    // Position: Above the version indicator (bottom-left)
    // Version is at X=-750 (moved 30px right to prevent clipping), Y=734
    // Place this 50px above version indicator
    const x = params.x ?? -350;
    const y = params.y ?? 684;

    // Alert icon path (triangle with exclamation)
    const alertIcon = `
        <path d="M0 -5 L5 4 L-5 4 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        <line x1="0" y1="-2" x2="0" y2="1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        <circle cx="0" cy="3" r="0.75" fill="currentColor"/>
    `;

    return `
        <g id="apr-refresh-indicator" class="rt-apr-indicator" transform="translate(${formatNumber(x)}, ${formatNumber(y)})">
            <!-- Hit area for click -->
            <rect class="rt-apr-hitarea" x="-60" y="-12" width="120" height="45" rx="6" ry="6"
                fill="white" fill-opacity="0" stroke="none" pointer-events="all" />

            <!-- Text label above icon -->
            <text class="rt-apr-indicator-text rt-apr-label" x="0" y="0" text-anchor="middle" dominant-baseline="middle">
                APR REFRESH
            </text>
            <text class="rt-apr-indicator-text rt-apr-action" x="0" y="0" text-anchor="middle" dominant-baseline="middle">
                OPEN SETTINGS
            </text>

            <!-- Pulsing alert icon below text -->
            <g class="rt-apr-alert-icon" transform="translate(0, 22)">
                <!-- Outer pulse ring -->
                <circle r="14" fill="var(--text-error, #ef4444)" opacity="0.15">
                    <animate attributeName="r" values="14;18;14" dur="1.5s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.15;0.3;0.15" dur="1.5s" repeatCount="indefinite" />
            </circle>
                <!-- Inner solid circle -->
                <circle r="10" fill="var(--text-error, #ef4444)" opacity="0.85" />
                <!-- Alert icon -->
                <g transform="scale(0.9)" stroke="white" fill="white">
                    ${alertIcon}
                </g>
            </g>

            <title>Author Progress Report needs refresh — Click to open Settings</title>
        </g>
    `;
}
