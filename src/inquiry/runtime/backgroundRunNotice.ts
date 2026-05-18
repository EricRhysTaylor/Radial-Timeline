/**
 * Pure decision logic for background-run notices (Inquiry View closed while a
 * run is still in flight). No Obsidian API — the view owns Notice invocation
 * and the flag; this module only decides *whether* and *which*.
 */

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
