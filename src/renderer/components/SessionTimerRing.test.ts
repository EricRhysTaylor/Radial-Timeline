import { describe, expect, it } from 'vitest';
import { PROGRESS_RING_BASE_WIDTH, PROGRESS_RING_RADIUS_OFFSET, SESSION_TIMER_RING_WIDTH } from '../layout/LayoutConstants';
import { renderProgressRingBaseLayer } from '../utils/ProgressRing';
import { buildSessionTimerRingState, renderSessionTimerRing, renderSessionTimerRingLayer, sessionTimerArcPath } from './SessionTimerRing';

describe('SessionTimerRing', () => {
    it('places the session ring on the same radius as the progress ring', () => {
        const state = buildSessionTimerRingState({
            progressRadius: 700,
            progressRingWidth: 8,
            sessionRingWidth: 3,
            elapsedMs: 30 * 60000,
            targetMinutes: 120,
        });

        expect(state?.radius).toBe(700);
        expect(state?.strokeWidth).toBe(3);
        expect(state?.progress).toBe(0.25);
    });

    it('uses the diagnostic session ring width while timer visibility is being verified', () => {
        const lineInnerRadius = 680;
        const progressRadius = lineInnerRadius + PROGRESS_RING_RADIUS_OFFSET;
        const state = buildSessionTimerRingState({
            progressRadius,
            progressRingWidth: PROGRESS_RING_BASE_WIDTH,
            sessionRingWidth: SESSION_TIMER_RING_WIDTH,
            elapsedMs: 30 * 60000,
            targetMinutes: 120,
        });

        expect(state).not.toBeNull();
        expect(state?.radius).toBe(progressRadius);
        expect(SESSION_TIMER_RING_WIDTH).toBe(40);
        expect(state?.strokeWidth).toBe(40);
    });

    it('renders a closed two-arc path at completion', () => {
        const path = sessionTimerArcPath(705.5, 1);

        expect(path.match(/ A /g)?.length).toBe(2);
    });

    it('quantizes timer color state without inline styles', () => {
        const svg = renderSessionTimerRing({
            radius: 705.5,
            strokeWidth: 3,
            progress: 0.51,
            paused: false,
        });

        expect(svg).toContain('is-progress-50');
        expect(svg).not.toContain('style=');
    });

    it('renders as an overlay layer after the progress backing ring', () => {
        const progressLayer = renderProgressRingBaseLayer({
            progressRadius: 693,
            estimateResult: null,
        });
        const timerLayer = renderSessionTimerRingLayer({
            radius: 698.5,
            strokeWidth: SESSION_TIMER_RING_WIDTH,
            progress: 0.5,
            paused: false,
        });
        const svg = `${progressLayer}${timerLayer}`;

        expect(svg.indexOf('class="progress-ring-base"')).toBeGreaterThanOrEqual(0);
        expect(svg.indexOf('class="ert-timeline-session-ring-layer"')).toBeGreaterThan(svg.indexOf('class="progress-ring-base"'));
        expect(timerLayer).not.toContain('style=');
    });
});
