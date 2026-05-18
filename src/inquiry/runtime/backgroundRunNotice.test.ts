import { describe, expect, it } from 'vitest';
import { resolveBackgroundCompletionNotice, shouldNotifyStillRunning } from './backgroundRunNotice';

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
