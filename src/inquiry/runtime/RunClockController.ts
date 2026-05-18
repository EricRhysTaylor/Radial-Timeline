/**
 * Owns the single 1 Hz HUD tick interval and its lifecycle.
 *
 * Scope is intentionally narrow: this controller owns ONLY the interval
 * handle. It does not own elapsed/progress state, DOM nodes, or the HUD
 * render decision — those remain in the view (no shadow view-model).
 *
 * Idempotent by contract: repeated reconcile() never creates duplicate
 * intervals; repeated dispose() is safe; no tick fires after dispose().
 */
export interface RunClockHost {
    /** True when the 1 Hz tick should be running (run active or cache countdown). */
    shouldTick(): boolean;
    /** Invoked once per second while ticking. */
    onTick(): void;
}

export class RunClockController {
    // Global setInterval/clearInterval: identical to window.* in Obsidian's
    // Electron renderer, and patchable by fake timers under the node test env.
    private intervalId: ReturnType<typeof setInterval> | undefined;
    private disposed = false;

    constructor(private readonly host: RunClockHost) {}

    /** Start or stop the tick to match host.shouldTick(). Safe to call repeatedly. */
    reconcile(): void {
        if (this.disposed) return;
        const shouldRun = this.host.shouldTick();
        if (shouldRun && this.intervalId === undefined) {
            this.intervalId = setInterval(() => {
                if (this.disposed) return;
                this.host.onTick();
            }, 1000);
        } else if (!shouldRun && this.intervalId !== undefined) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }

    /** Clear the interval permanently. Safe to call repeatedly; no tick fires afterward. */
    dispose(): void {
        this.disposed = true;
        if (this.intervalId !== undefined) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
    }
}
