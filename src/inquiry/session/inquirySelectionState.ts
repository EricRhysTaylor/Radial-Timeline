/*
 * Radial Timeline Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

import type { InquiryLens } from '../state';

/**
 * Slice 2a of the InquirySessionController extraction
 * (see docs/engineering/audits/inquiry-session-controller-map-2026-05-21.md).
 *
 * Owns only the `mode` field of `InquiryState` and its round-trip with
 * `plugin.settings.inquiryLastMode`. Subsequent Slice 2 stages will absorb
 * `scope`, `activeBookId`, `targetSceneIds`, and the `inquiryTargetCache`
 * persistence pairing into this same class — but only behind explicit,
 * separate go-aheads. This slice is mode-only.
 *
 * Explicitly NOT owned in 2a:
 *   • scope, activeBookId, targetSceneIds, inquiryTargetCache (Slice 2b/2c)
 *   • run orchestration (Slice 4 — deferred)
 *   • subscriber/event-bus pattern (deferred indefinitely per audit Risk #8)
 *
 * Save-ordering invariant (audit + characterization tests):
 *   setActiveLens writes state.mode FIRST, then settings.inquiryLastMode,
 *   then triggers saveSettings(). Reordering would let saveSettings see a
 *   pre-mutation snapshot or skip the persist entirely on a re-entrant
 *   call. Preserved exactly.
 */

/**
 * Pure validator for the `inquiryLastMode` settings field. Returns the
 * lens if it matches the known set, otherwise `undefined`. Exposed so
 * callers can branch on validity (e.g. constructor adopts only if valid,
 * reset falls back to a default).
 */
export function validatePersistedInquiryLens(value: unknown): InquiryLens | undefined {
    return value === 'flow' || value === 'depth' ? value : undefined;
}

/**
 * Live, mutable host providing the state slot the controller writes to.
 * Mirrors the Slice 1 pattern — controller writes through to the shared
 * `state` object so existing read sites (`this.state.mode === 'depth'`)
 * continue working without rewiring.
 */
export interface SelectionStateHost {
    readonly state: { mode: InquiryLens };
}

/**
 * Thin adapter over the plugin settings layer. The controller never
 * imports `RadialTimelinePlugin` directly — the host supplies closures so
 * the boundary stays minimal (refactor-playbook §8: small host interfaces).
 */
export interface SelectionSettingsHost {
    /** Read the raw persisted value. Type `unknown` because the field can drift across versions. */
    getPersistedLastMode(): unknown;
    /** Write the validated lens back to settings. */
    setPersistedLastMode(mode: InquiryLens): void;
    /**
     * Trigger a save. May return a Promise; callers void-await so the
     * controller is fire-and-forget consistent with the legacy
     * `void this.plugin.saveSettings()` shape.
     */
    saveSettings(): void | Promise<void>;
}

export class InquirySelectionState {
    constructor(
        private readonly host: SelectionStateHost,
        private readonly settings: SelectionSettingsHost
    ) {}

    /**
     * User-initiated lens change. Writes state.mode, then
     * settings.inquiryLastMode, then triggers a save. **Order is part of
     * the contract** — the characterization tests pin
     * state→settings→save.
     */
    setActiveLens(mode: InquiryLens): void {
        this.host.state.mode = mode;
        this.settings.setPersistedLastMode(mode);
        void this.settings.saveSettings();
    }

    /**
     * Adopt a mode from a session result. State-only — does NOT persist
     * to `inquiryLastMode`. A user viewing a saved session in a different
     * lens should not have their "last chosen lens" preference clobbered.
     */
    adoptModeFromResult(mode: InquiryLens): void {
        this.host.state.mode = mode;
    }

    /**
     * Adopt the persisted last-mode if valid, otherwise the supplied
     * fallback. Used by:
     *   • constructor — startup hydration
     *   • resetInquiryToFreshBaseState — preserve user preference across reset
     *
     * Validation guard (`'flow' | 'depth'`) is the audit-pinned invariant.
     */
    applyPersistedLastModeOr(fallback: InquiryLens): void {
        const validated = validatePersistedInquiryLens(this.settings.getPersistedLastMode());
        this.host.state.mode = validated ?? fallback;
    }
}
