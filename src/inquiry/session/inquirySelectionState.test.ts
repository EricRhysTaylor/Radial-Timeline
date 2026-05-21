import { describe, it, expect, vi } from 'vitest';
import {
    InquirySelectionState,
    validatePersistedInquiryLens,
    type SelectionSettingsHost,
    type SelectionStateHost,
} from './inquirySelectionState';
import type { InquiryLens } from '../state';

// ─────────────────────────────────────────────────────────────────────────
//  Test fixtures
// ─────────────────────────────────────────────────────────────────────────

type StateFixture = { mode: InquiryLens };

function makeState(initial: InquiryLens = 'flow'): StateFixture {
    return { mode: initial };
}

function makeSettings(initial: unknown = undefined) {
    let stored: unknown = initial;
    const calls: Array<{ kind: 'read' | 'write' | 'save'; value?: unknown }> = [];
    const host: SelectionSettingsHost = {
        getPersistedLastMode: () => {
            calls.push({ kind: 'read' });
            return stored;
        },
        setPersistedLastMode: (mode) => {
            calls.push({ kind: 'write', value: mode });
            stored = mode;
        },
        saveSettings: () => {
            calls.push({ kind: 'save' });
        },
    };
    return { host, calls, get stored() { return stored; } };
}

function makeController(state: StateFixture, settings: SelectionSettingsHost): InquirySelectionState {
    const host: SelectionStateHost = { state };
    return new InquirySelectionState(host, settings);
}

// ─────────────────────────────────────────────────────────────────────────
//  validatePersistedInquiryLens — pure validator
// ─────────────────────────────────────────────────────────────────────────

describe('validatePersistedInquiryLens', () => {
    it("returns 'flow' for 'flow'", () => {
        expect(validatePersistedInquiryLens('flow')).toBe('flow');
    });

    it("returns 'depth' for 'depth'", () => {
        expect(validatePersistedInquiryLens('depth')).toBe('depth');
    });

    it('returns undefined for any other string', () => {
        expect(validatePersistedInquiryLens('focus')).toBeUndefined();
        expect(validatePersistedInquiryLens('')).toBeUndefined();
        expect(validatePersistedInquiryLens('FLOW')).toBeUndefined();
    });

    it('returns undefined for non-string values (defense-in-depth across versions)', () => {
        expect(validatePersistedInquiryLens(undefined)).toBeUndefined();
        expect(validatePersistedInquiryLens(null)).toBeUndefined();
        expect(validatePersistedInquiryLens(0)).toBeUndefined();
        expect(validatePersistedInquiryLens({})).toBeUndefined();
        expect(validatePersistedInquiryLens(['flow'])).toBeUndefined();
    });
});

// ─────────────────────────────────────────────────────────────────────────
//  setActiveLens — user toggle path
// ─────────────────────────────────────────────────────────────────────────

describe('InquirySelectionState.setActiveLens', () => {
    it('writes state.mode FIRST, settings second, save last (order is contract)', () => {
        const state = makeState('flow');
        const settings = makeSettings();
        const c = makeController(state, settings.host);

        c.setActiveLens('depth');

        // State mutated before settings write was observed.
        expect(state.mode).toBe('depth');
        // Settings write and save were called in the right order.
        const kinds = settings.calls.map(call => call.kind);
        expect(kinds).toEqual(['write', 'save']);
        expect(settings.calls[0].value).toBe('depth');
    });

    it('persists the same lens that was written to state (no drift between layers)', () => {
        const state = makeState('flow');
        const settings = makeSettings();
        const c = makeController(state, settings.host);

        c.setActiveLens('depth');

        expect(state.mode).toBe('depth');
        expect(settings.stored).toBe('depth');
    });

    it('triggers save even when the supplied lens equals the current one (guard belongs to caller)', () => {
        // The legacy `setActiveLens` in InquiryView guards with
        // `if (mode === this.state.mode) return;` BEFORE calling into the
        // controller. The controller itself does not guard — its single
        // responsibility is to do the atomic state+settings+save triple.
        const state = makeState('depth');
        const settings = makeSettings();
        const c = makeController(state, settings.host);

        c.setActiveLens('depth');

        expect(settings.calls.map(call => call.kind)).toEqual(['write', 'save']);
    });

    it('does not read from settings during setActiveLens (write-only path)', () => {
        const state = makeState('flow');
        const settings = makeSettings();
        const c = makeController(state, settings.host);

        c.setActiveLens('depth');

        expect(settings.calls.some(call => call.kind === 'read')).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────
//  adoptModeFromResult — session adoption path (state-only)
// ─────────────────────────────────────────────────────────────────────────

describe('InquirySelectionState.adoptModeFromResult', () => {
    it('writes state.mode without touching settings', () => {
        const state = makeState('flow');
        const settings = makeSettings();
        const c = makeController(state, settings.host);

        c.adoptModeFromResult('depth');

        expect(state.mode).toBe('depth');
        expect(settings.calls).toEqual([]);
    });

    it('does NOT persist to inquiryLastMode (user preference must survive session views)', () => {
        // Viewing a saved session in 'depth' must not clobber a user who
        // last chose 'flow'. Critical UX invariant.
        const state = makeState('flow');
        const settings = makeSettings('flow');
        const c = makeController(state, settings.host);

        c.adoptModeFromResult('depth');

        expect(settings.stored).toBe('flow'); // unchanged
        expect(state.mode).toBe('depth');     // session view reflects the session
    });
});

// ─────────────────────────────────────────────────────────────────────────
//  applyPersistedLastModeOr — startup + reset path
// ─────────────────────────────────────────────────────────────────────────

describe('InquirySelectionState.applyPersistedLastModeOr', () => {
    it("adopts persisted 'flow' over the fallback", () => {
        const state = makeState('depth');
        const settings = makeSettings('flow');
        const c = makeController(state, settings.host);

        c.applyPersistedLastModeOr('depth');

        expect(state.mode).toBe('flow');
    });

    it("adopts persisted 'depth' over the fallback", () => {
        const state = makeState('flow');
        const settings = makeSettings('depth');
        const c = makeController(state, settings.host);

        c.applyPersistedLastModeOr('flow');

        expect(state.mode).toBe('depth');
    });

    it('falls back when the persisted value is invalid (validation guard)', () => {
        const state = makeState('depth');
        const settings = makeSettings('arbitrary-string');
        const c = makeController(state, settings.host);

        c.applyPersistedLastModeOr('flow');

        expect(state.mode).toBe('flow');
    });

    it('falls back when the persisted value is undefined', () => {
        const state = makeState('depth');
        const settings = makeSettings(undefined);
        const c = makeController(state, settings.host);

        c.applyPersistedLastModeOr('flow');

        expect(state.mode).toBe('flow');
    });

    it('does not write back to settings (read-only path)', () => {
        const state = makeState('flow');
        const settings = makeSettings('depth');
        const c = makeController(state, settings.host);

        c.applyPersistedLastModeOr('flow');

        const writeCalls = settings.calls.filter(call => call.kind === 'write' || call.kind === 'save');
        expect(writeCalls).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────
//  Ownership boundary — owned vs not-owned
// ─────────────────────────────────────────────────────────────────────────

describe('InquirySelectionState — ownership boundary (Slice 2a scope)', () => {
    it('owns mode only — no method touches scope, activeBookId, targetSceneIds, etc.', () => {
        // Reflective check: the controller's public surface must not
        // expose any method whose name implies it touches Slice 2b/2c
        // fields. Slice 2a is mode-only.
        const state = makeState('flow');
        const settings = makeSettings();
        const c = makeController(state, settings.host);

        const proto = Object.getPrototypeOf(c) as Record<string, unknown>;
        const names = Object.getOwnPropertyNames(proto);

        const forbidden = /(scope|activeBook|targetScene|cache|promptIds|focus|drill)/i;
        const violations = names.filter(name => forbidden.test(name));

        expect(violations).toEqual([]);
    });

    it('exposes no compute/estimate/hover methods (doctrine §5–6)', () => {
        const state = makeState('flow');
        const settings = makeSettings();
        const c = makeController(state, settings.host);

        const proto = Object.getPrototypeOf(c) as Record<string, unknown>;
        const names = Object.getOwnPropertyNames(proto);

        const forbidden = /^(compute|estimate|hover|recompute)/i;
        expect(names.filter(name => forbidden.test(name))).toEqual([]);
    });

    it('public method surface is exactly: setActiveLens, adoptModeFromResult, applyPersistedLastModeOr', () => {
        // Pin the surface so any new method requires an explicit test
        // update — protects against scope creep into Slice 2b without
        // a follow-up audit.
        const state = makeState('flow');
        const settings = makeSettings();
        const c = makeController(state, settings.host);

        const proto = Object.getPrototypeOf(c) as Record<string, unknown>;
        const methods = Object.getOwnPropertyNames(proto).filter(
            n => n !== 'constructor' && typeof (c as unknown as Record<string, unknown>)[n] === 'function'
        );

        expect(methods.sort()).toEqual(['adoptModeFromResult', 'applyPersistedLastModeOr', 'setActiveLens']);
    });
});

// ─────────────────────────────────────────────────────────────────────────
//  Integration shape — settings round-trip via the controller
// ─────────────────────────────────────────────────────────────────────────

describe('InquirySelectionState — round-trip integration', () => {
    it('user toggle → applyPersistedLastModeOr reads back the just-written value', () => {
        // Simulates: setActiveLens → next session opens → applyPersistedLastModeOr
        // The user's choice survives via settings.
        const state = makeState('flow');
        const settings = makeSettings('flow');
        const c = makeController(state, settings.host);

        c.setActiveLens('depth');
        // Simulate "next session opens" by re-applying.
        state.mode = 'flow'; // reset state as if we re-constructed
        c.applyPersistedLastModeOr('flow');

        expect(state.mode).toBe('depth'); // user's last choice restored
    });

    it('session adoption does not clobber the round-trip', () => {
        // Sequence: user toggles to 'depth' → views a 'flow' session →
        // reopens later → must still see 'depth' restored from settings.
        const state = makeState('flow');
        const settings = makeSettings('flow');
        const c = makeController(state, settings.host);

        c.setActiveLens('depth');
        c.adoptModeFromResult('flow');         // session adoption
        // Re-hydrate as if reconstructed.
        state.mode = 'flow';
        c.applyPersistedLastModeOr('flow');

        expect(state.mode).toBe('depth');      // last user choice preserved
        expect(settings.stored).toBe('depth'); // not clobbered by adoptModeFromResult
    });
});

// Compile-time guard: SelectionStateHost.state must stay narrowly typed.
// Widening to a fuller InquiryState shape is Slice 2b/2c work and should
// require an explicit type change here.
type _CompileGuard_HostShape = SelectionStateHost['state'] extends { mode: InquiryLens }
    ? (keyof SelectionStateHost['state'] extends 'mode' ? true : never)
    : never;
const _compileGuard: _CompileGuard_HostShape = true;
void _compileGuard;

// Silence "unused vi" — kept for parity with other test files in case
// future tests need spies.
void vi;
