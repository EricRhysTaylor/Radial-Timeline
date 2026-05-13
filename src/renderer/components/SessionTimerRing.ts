import { formatNumber } from '../../utils/svg';

export interface SessionTimerRingState {
    radius: number;
    strokeWidth: number;
    progress: number;
    paused: boolean;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

export function buildSessionTimerRingState(params: {
    progressRadius: number;
    progressRingWidth: number;
    sessionRingWidth: number;
    elapsedMs: number;
    targetMinutes: number;
    paused?: boolean;
}): SessionTimerRingState | null {
    const targetMs = Math.max(1, params.targetMinutes) * 60000;
    const progress = clamp(params.elapsedMs / targetMs, 0, 1);
    const radius = params.progressRadius;
    return {
        radius,
        strokeWidth: params.sessionRingWidth,
        progress,
        paused: !!params.paused,
    };
}

export function sessionTimerArcPath(radius: number, progress: number): string {
    const clampedProgress = clamp(progress, 0, 1);
    if (clampedProgress <= 0) return '';
    const startAngle = -Math.PI / 2;
    const endAngle = startAngle + (Math.PI * 2 * clampedProgress);
    const x0 = radius * Math.cos(startAngle);
    const y0 = radius * Math.sin(startAngle);
    const x1 = radius * Math.cos(endAngle);
    const y1 = radius * Math.sin(endAngle);
    const largeArc = clampedProgress > 0.5 ? 1 : 0;
    if (clampedProgress >= 0.999) {
        const midAngle = startAngle + Math.PI;
        const xm = radius * Math.cos(midAngle);
        const ym = radius * Math.sin(midAngle);
        return [
            `M ${formatNumber(x0)} ${formatNumber(y0)}`,
            `A ${formatNumber(radius)} ${formatNumber(radius)} 0 1 1 ${formatNumber(xm)} ${formatNumber(ym)}`,
            `A ${formatNumber(radius)} ${formatNumber(radius)} 0 1 1 ${formatNumber(x0)} ${formatNumber(y0)}`
        ].join(' ');
    }
    return [
        `M ${formatNumber(x0)} ${formatNumber(y0)}`,
        `A ${formatNumber(radius)} ${formatNumber(radius)} 0 ${largeArc} 1 ${formatNumber(x1)} ${formatNumber(y1)}`
    ].join(' ');
}

export function renderSessionTimerRing(state: SessionTimerRingState | null): string {
    if (!state) return '';
    const arcPath = sessionTimerArcPath(state.radius, state.progress);
    const progressStep = clamp(Math.round(state.progress * 20) * 5, 0, 100);
    return `
        <g class="ert-timeline-session-ring is-progress-${progressStep}${state.paused ? ' is-paused' : ''}">
            <circle cx="0" cy="0" r="${formatNumber(state.radius)}" class="ert-timeline-session-ring__track" stroke-width="${formatNumber(state.strokeWidth)}" />
            ${arcPath ? `<path d="${arcPath}" class="ert-timeline-session-ring__arc" stroke-width="${formatNumber(state.strokeWidth)}" />` : ''}
        </g>
    `;
}

export function renderSessionTimerRingLayer(state: SessionTimerRingState | null): string {
    const ring = renderSessionTimerRing(state);
    if (!ring.trim()) return '';
    return `
        <g class="ert-timeline-session-ring-layer">
            ${ring}
        </g>
    `;
}
