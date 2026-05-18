/**
 * Pure decision logic for background-run notices (Inquiry View closed while a
 * run is still in flight). No Obsidian API — the view owns Notice invocation
 * and the flag; this module only decides *whether* and *which*.
 */

/** Plugin pub/sub event fired when a backgrounded run reaches its terminal point. */
export const BACKGROUND_RUN_COMPLETED_EVENT = 'inquiry:background-run-completed';

export interface BackgroundRunCompletedDetail {
    sessionKey: string;
    isError: boolean;
    /** Set true by the first listener that auto-rehydrates, so the emitter
     *  skips the "reopen" notice and no second listener double-handles. */
    handled: boolean;
}

/** Show the "still running" notice on close iff a run is currently active. */
export const shouldNotifyStillRunning = (runActive: boolean): boolean => runActive;

export type BackgroundCompletionNotice = 'none' | 'complete' | 'error';

/**
 * Decide the completion notice when a run reaches its terminal point.
 * Only fires when the run continued past a view close. `isError` is null when
 * the terminal result is unknown (e.g. setup threw before a result existed) —
 * in that case nothing is shown rather than guessing.
 */
export const resolveBackgroundCompletionNotice = (
    runContinuedAfterClose: boolean,
    isError: boolean | null
): BackgroundCompletionNotice => {
    if (!runContinuedAfterClose) return 'none';
    if (isError === null) return 'none';
    return isError ? 'error' : 'complete';
};

export interface AutoRehydrateInputs {
    /** This view instance is itself mid-run. */
    isRunning: boolean;
    /** This view owns an in-flight run token (non-zero). */
    activeRunToken: number;
    /** Session currently shown in this view (null/undefined if none). */
    currentSessionId: string | null | undefined;
    /** Completed background session key from the event. */
    eventSessionKey: string;
    /** The completed session exists in the store. */
    sessionExists: boolean;
    /** View is in its pristine post-open state (no user inquiry config yet). */
    pristine: boolean;
    /** Another listener already handled this completion event. */
    alreadyHandled: boolean;
}

/**
 * Decide whether a reopened, idle, pristine Inquiry View should auto-rehydrate
 * a background run that completed while it was closed. Error results DO
 * rehydrate (the author should see the error UI, not an idle screen) — error
 * state is intentionally not a gate here. Never clobbers an in-progress view.
 */
export const shouldAutoRehydrateReopenedView = (i: AutoRehydrateInputs): boolean => {
    if (i.alreadyHandled) return false;
    if (i.isRunning) return false;
    if (i.activeRunToken !== 0) return false;
    if (!i.pristine) return false;
    if (!i.sessionExists) return false;
    if (!i.eventSessionKey) return false;
    if (i.currentSessionId === i.eventSessionKey) return false;
    return true;
};
