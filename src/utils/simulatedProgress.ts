export interface SimulatedProgressConfig {
    durationMs: number;
    startPercent?: number;
    maxPercent?: number;
    jitter?: number;
}

/**
 * Lightweight helper to simulate a smooth progress animation when the real
 * progress is unknown (e.g., single long API calls). Keeps the bar moving with
 * gentle easing and a small jitter so it never looks frozen.
 */
export class SimulatedProgress {
    private timeoutId: number | null = null;
    private startTime = 0;
    private resolved = false;
    private config: Required<SimulatedProgressConfig> | null = null;
    private readonly onUpdate: (percent: number) => void;

    constructor(onUpdate: (percent: number) => void) {
        this.onUpdate = onUpdate;
    }

    start(config: SimulatedProgressConfig): void {
        this.stop();

        this.config = {
            durationMs: Math.max(1000, config.durationMs),
            startPercent: config.startPercent ?? 6,
            maxPercent: config.maxPercent ?? 92,
            jitter: config.jitter ?? 0.6
        };
        this.resolved = false;
        this.startTime = performance.now();

        this.onUpdate(this.config.startPercent);
        this.tick();
    }

    complete(): void {
        this.resolved = true;
        this.stop();
        this.onUpdate(100);
    }

    fail(): void {
        this.resolved = true;
        this.stop();
        this.onUpdate(0);
    }

    stop(): void {
        if (this.timeoutId !== null) {
            window.clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
        this.config = null;
    }

    private tick = (): void => {
        if (!this.config) return;

        const now = performance.now();
        const elapsed = now - this.startTime;
        const t = Math.min(1, elapsed / this.config.durationMs);

        // Ease-out cubic so the bar slows as it approaches the cap.
        const eased = 1 - Math.pow(1 - t, 3);
        const base = this.config.startPercent +
            (this.config.maxPercent - this.config.startPercent) * eased;

        // Small oscillation keeps the bar feeling alive while waiting.
        const jitter = this.config.jitter * Math.sin(elapsed / 900);
        const percent = Math.max(
            this.config.startPercent,
            Math.min(this.config.maxPercent, base + jitter)
        );

        this.onUpdate(percent);

        if (t < 1 && !this.resolved) {
            this.timeoutId = window.setTimeout(this.tick, 16);
        } else {
            this.timeoutId = null;
        }
    };
}
