import { describe, expect, it } from 'vitest';
import {
    type AutoRehydrateInputs,
    resolveBackgroundCompletionNotice,
    shouldAutoRehydrateReopenedView,
    shouldNotifyStillRunning
} from './backgroundRunNotice';

describe('shouldNotifyStillRunning', () => {
    it('notifies only when a run is active at close', () => {
        expect(shouldNotifyStillRunning(true)).toBe(true);
        expect(shouldNotifyStillRunning(false)).toBe(false);
    });
});

describe('resolveBackgroundCompletionNotice', () => {
    it('returns none when the run did not continue past a close', () => {
        expect(resolveBackgroundCompletionNotice(false, false)).toBe('none');
        expect(resolveBackgroundCompletionNotice(false, true)).toBe('none');
        expect(resolveBackgroundCompletionNotice(false, null)).toBe('none');
    });

    it('returns complete for a successful background run', () => {
        expect(resolveBackgroundCompletionNotice(true, false)).toBe('complete');
    });

    it('returns error for a failed background run (never a false complete)', () => {
        expect(resolveBackgroundCompletionNotice(true, true)).toBe('error');
    });

    it('returns none when the terminal result is unknown', () => {
        expect(resolveBackgroundCompletionNotice(true, null)).toBe('none');
    });
});

describe('shouldAutoRehydrateReopenedView', () => {
    const base: AutoRehydrateInputs = {
        isRunning: false,
        activeRunToken: 0,
        currentSessionId: null,
        eventSessionKey: 'sess_1',
        sessionExists: true,
        pristine: true,
        alreadyHandled: false
    };

    it('rehydrates a pristine, idle, never-shown session (incl. error results)', () => {
        expect(shouldAutoRehydrateReopenedView(base)).toBe(true);
    });

    it('does not rehydrate when another listener already handled it', () => {
        expect(shouldAutoRehydrateReopenedView({ ...base, alreadyHandled: true })).toBe(false);
    });

    it('does not clobber a running view or one owning a run token', () => {
        expect(shouldAutoRehydrateReopenedView({ ...base, isRunning: true })).toBe(false);
        expect(shouldAutoRehydrateReopenedView({ ...base, activeRunToken: 7 })).toBe(false);
    });

    it('does not clobber a non-pristine (user-configured) view', () => {
        expect(shouldAutoRehydrateReopenedView({ ...base, pristine: false })).toBe(false);
    });

    it('skips when the session is absent, key empty, or already shown', () => {
        expect(shouldAutoRehydrateReopenedView({ ...base, sessionExists: false })).toBe(false);
        expect(shouldAutoRehydrateReopenedView({ ...base, eventSessionKey: '' })).toBe(false);
        expect(shouldAutoRehydrateReopenedView({ ...base, currentSessionId: 'sess_1' })).toBe(false);
    });
});
