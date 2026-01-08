import { formatNumber } from '../../utils/svg';

export function renderAuthorProgressIndicator(params: {
    isStale: boolean;
    x?: number;
    y?: number;
}): string {
    if (!params.isStale) return '';

    // Position: Near bottom-right, perhaps next to version indicator
    // Version is at X=420, Y=400 (approx)
    // Let's place APR alert to the left of it.
    const x = params.x ?? 380;
    const y = params.y ?? 400;

    return `
        <g class="rt-apr-indicator" transform="translate(${formatNumber(x)}, ${formatNumber(y)})" ` +
        `style="cursor: pointer;">` + // SAFE: inline style used for SVG interactivity
        `
            <circle r="12" fill="var(--text-error)" opacity="0.2">
                <animate attributeName="opacity" values="0.2;0.5;0.2" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle r="6" fill="var(--text-error)" />
            <title>Author Progress Report is Stale (Click to Update)</title>
            <!-- Simple Alert Icon -->
            <path d="M0 -3 L0 1 M0 3 L0 3.5" stroke="white" stroke-width="2" />
        </g>
    `;
}
