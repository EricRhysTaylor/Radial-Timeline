import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RunClockController } from './RunClockController';

describe('RunClockController', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    const makeHost = (initial: boolean) => {
        let should = initial;
        const onTick = vi.fn();
        return {
            host: { shouldTick: () => should, onTick },
            setShould: (v: boolean) => { should = v; },
            onTick
        };
    };

    it('starts ticking once per second when shouldTick is true', () => {
        const { host, onTick } = makeHost(true);
        const c = new RunClockController(host);
        c.reconcile();
        expect(onTick).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(onTick).toHaveBeenCalledTimes(1);
        vi.advanceTimersByTime(3000);
        expect(onTick).toHaveBeenCalledTimes(4);
    });

    it('does not start when shouldTick is false', () => {
        const { host, onTick } = makeHost(false);
        const c = new RunClockController(host);
        c.reconcile();
        vi.advanceTimersByTime(5000);
        expect(onTick).not.toHaveBeenCalled();
    });

    it('stops when shouldTick flips to false on the next reconcile', () => {
        const { host, setShould, onTick } = makeHost(true);
        const c = new RunClockController(host);
        c.reconcile();
        vi.advanceTimersByTime(2000);
        expect(onTick).toHaveBeenCalledTimes(2);
        setShould(false);
        c.reconcile();
        vi.advanceTimersByTime(5000);
        expect(onTick).toHaveBeenCalledTimes(2);
    });

    it('is idempotent: repeated reconcile while running never duplicates the interval', () => {
        const { host, onTick } = makeHost(true);
        const c = new RunClockController(host);
        c.reconcile();
        c.reconcile();
        c.reconcile();
        vi.advanceTimersByTime(3000);
        expect(onTick).toHaveBeenCalledTimes(3);
    });

    it('dispose clears the interval and no tick fires afterward', () => {
        const { host, onTick } = makeHost(true);
        const c = new RunClockController(host);
        c.reconcile();
        vi.advanceTimersByTime(1000);
        expect(onTick).toHaveBeenCalledTimes(1);
        c.dispose();
        vi.advanceTimersByTime(10000);
        expect(onTick).toHaveBeenCalledTimes(1);
    });

    it('dispose is safe to call repeatedly', () => {
        const { host } = makeHost(true);
        const c = new RunClockController(host);
        c.reconcile();
        expect(() => { c.dispose(); c.dispose(); }).not.toThrow();
    });

    it('reconcile after dispose is a no-op (cannot restart)', () => {
        const { host, onTick } = makeHost(true);
        const c = new RunClockController(host);
        c.dispose();
        c.reconcile();
        vi.advanceTimersByTime(5000);
        expect(onTick).not.toHaveBeenCalled();
    });

    it('does not invoke onTick for an already-scheduled callback after dispose', () => {
        const { host, onTick } = makeHost(true);
        const c = new RunClockController(host);
        c.reconcile();
        vi.advanceTimersByTime(999);
        c.dispose();
        vi.advanceTimersByTime(1);
        expect(onTick).not.toHaveBeenCalled();
    });
});
