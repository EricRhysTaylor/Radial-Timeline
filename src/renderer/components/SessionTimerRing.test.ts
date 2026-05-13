import { describe, expect, it } from 'vitest';
import { buildSessionTimerRingState, renderSessionTimerRing, sessionTimerArcPath } from './SessionTimerRing';

describe('SessionTimerRing', () => {
    it('places the session ring directly outside the progress ring', () => {
        const state = buildSessionTimerRingState({
            progressRadius: 700,
            progressRingWidth: 8,
            sessionRingWidth: 3,
            elapsedMs: 30 * 60000,
            targetMinutes: 120,
        });

        expect(state?.radius).toBe(705.5);
        expect(state?.strokeWidth).toBe(3);
        expect(state?.progress).toBe(0.25);
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
});
