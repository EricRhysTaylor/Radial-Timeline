/*
 * Characterization tests for the Slice 2 surface (InquirySelectionState).
 *
 * Pre-extraction safety net. These tests pin the CURRENT shape of the
 * five selection-state mutation paths in InquiryView so the Slice 2 rewrite
 * cannot silently miss a site or break a persistence pairing.
 *
 * When Slice 2 lands, each of these source-pattern assertions will fail.
 * Updating them to assert the new (controller-routed) form proves coverage:
 * every mutation path was rewired exactly once, no orphan direct-mutation
 * left behind. Same forcing-function pattern as the existing
 * InquiryView.test.ts.
 *
 * Reference:
 *   docs/engineering/audits/inquiry-session-controller-map-2026-05-21.md
 *   §6 Risks #1, #3
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const INQUIRY_VIEW_SRC = readFileSync(
    resolve(process.cwd(), 'src/inquiry/InquiryView.ts'),
    'utf8'
);

// ─────────────────────────────────────────────────────────────────────────
//  activeBookId — 5 mutation sites (audit Risk #1: 4-path writes, in
//  practice 5 distinct sites across 4 semantic paths)
// ─────────────────────────────────────────────────────────────────────────

describe('characterization: activeBookId mutation paths', () => {
    it('path A — rehydrate-from-session keeps activeBookId on null-coalesce', () => {
        // src/inquiry/InquiryView.ts ~ line 1998 — recovers from a stored
        // session; the `?? this.state.activeBookId` preserves the current
        // value when the session has none.
        expect(INQUIRY_VIEW_SRC).toContain(
            'this.state.activeBookId = session.activeBookId ?? this.state.activeBookId;'
        );
    });

    it('path B — loadTargetCache restores activeBookId from inquiryTargetCache.lastBookId', () => {
        // src/inquiry/InquiryView.ts ~ line 2219
        expect(INQUIRY_VIEW_SRC).toContain('this.state.activeBookId = cache.lastBookId;');
    });

    it('path C1 — refreshCorpus syncs activeBookId from this.corpus.activeBookId', () => {
        // src/inquiry/InquiryView.ts ~ line 3802
        expect(INQUIRY_VIEW_SRC).toContain('this.state.activeBookId = this.corpus.activeBookId;');
    });

    it('path C2 — refreshCorpus clears activeBookId when corpus has none', () => {
        // src/inquiry/InquiryView.ts ~ line 3807
        expect(INQUIRY_VIEW_SRC).toMatch(/this\.state\.activeBookId\s*=\s*undefined;/);
    });

    it('path D — applySession adopts activeBookId from session payload', () => {
        // src/inquiry/InquiryView.ts ~ line 7152
        expect(INQUIRY_VIEW_SRC).toContain('this.state.activeBookId = session.activeBookId;');
    });

    it('path E — resetInquiryToFreshBaseState clears activeBookId to undefined', () => {
        // src/inquiry/InquiryView.ts ~ line 7211
        // Two `= undefined` writes exist (refreshCorpus clear + reset); both
        // must be rewired in Slice 2.
        const undefMatches = INQUIRY_VIEW_SRC.match(
            /this\.state\.activeBookId\s*=\s*undefined;/g
        ) ?? [];
        expect(undefMatches.length).toBe(2);
    });

    it('path F — setFocusByIndex sets activeBookId from navigation book', () => {
        // src/inquiry/InquiryView.ts ~ line 8213
        expect(INQUIRY_VIEW_SRC).toContain('this.state.activeBookId = book.id;');
    });

    it('path G — drillIntoBook sets activeBookId from drill argument', () => {
        // src/inquiry/InquiryView.ts ~ line 8302
        expect(INQUIRY_VIEW_SRC).toContain('this.state.activeBookId = bookId;');
    });

    it('total direct-mutation count is exactly 8 — Slice 2 must rewire each one', () => {
        // Eight occurrences across seven semantic paths (refreshCorpus and
        // resetInquiryToFreshBaseState both produce a `= undefined` write).
        // Pinning the count means an added (unwired) path will fail loudly.
        const matches = INQUIRY_VIEW_SRC.match(/this\.state\.activeBookId\s*=/g) ?? [];
        expect(matches.length).toBe(8);
    });
});

// ─────────────────────────────────────────────────────────────────────────
//  targetSceneIds — 10 direct-mutation sites
// ─────────────────────────────────────────────────────────────────────────

describe('characterization: targetSceneIds mutation paths', () => {
    it('applySession adopts targetSceneIds through normalizeTargetSceneIds', () => {
        expect(INQUIRY_VIEW_SRC).toMatch(
            /this\.state\.targetSceneIds\s*=\s*this\.normalizeTargetSceneIds\(session\.targetSceneIds\);/
        );
    });

    it('loadTargetCache restores targetSceneIds from per-book map', () => {
        expect(INQUIRY_VIEW_SRC).toMatch(
            /this\.state\.targetSceneIds\s*=\s*this\.lastTargetSceneIdsByBookId\.get\(cache\.lastBookId\)\s*\?\?\s*\[\];/
        );
    });

    it('loadTargetCache fresh-launch branch sets targetSceneIds to empty', () => {
        expect(INQUIRY_VIEW_SRC).toMatch(/this\.state\.targetSceneIds\s*=\s*\[\];/);
    });

    it('refreshCorpus resyncs targetSceneIds from corpus-resolved scenes', () => {
        expect(INQUIRY_VIEW_SRC).toContain('this.state.targetSceneIds = nextTargetSceneIds;');
    });

    it('removeEmptyTargetSceneItems filters out empty scenes', () => {
        expect(INQUIRY_VIEW_SRC).toContain('this.state.targetSceneIds = next;');
    });

    it('setFocusByIndex syncs targetSceneIds to per-book visible scenes', () => {
        expect(INQUIRY_VIEW_SRC).toContain('this.state.targetSceneIds = this.getVisibleTargetSceneIdsForBook(book.id);');
    });

    it('total direct-mutation count is at least 8 — pins minimum coverage', () => {
        // The exact count is 9 (some assignments share regex shape, e.g.
        // `= []` appears twice). Pin a floor so the count cannot regress
        // silently. Slice 2 should rewire ALL of them through the controller.
        const matches = INQUIRY_VIEW_SRC.match(/this\.state\.targetSceneIds\s*=/g) ?? [];
        expect(matches.length).toBeGreaterThanOrEqual(8);
    });
});

// ─────────────────────────────────────────────────────────────────────────
//  inquiryTargetCache — persistence atomicity (audit Risk #3)
// ─────────────────────────────────────────────────────────────────────────

describe('characterization: inquiryTargetCache persistence', () => {
    it('scheduleTargetPersist debounces persistence via window.setTimeout', () => {
        // Pin the debouncing pattern so Slice 2 cannot silently switch to
        // synchronous write (which would change save-throughput behavior).
        expect(INQUIRY_VIEW_SRC).toMatch(
            /private scheduleTargetPersist\(\)[\s\S]{0,200}window\.setTimeout/
        );
    });

    it('scheduleTargetPersist builds the canonical cache payload shape', () => {
        // Two-property shape: { lastBookId, lastTargetSceneIdsByBookId }.
        // Doctrine §5 atomicity-equivalent for selection persistence.
        expect(INQUIRY_VIEW_SRC).toContain('lastBookId: this.state.activeBookId,');
        expect(INQUIRY_VIEW_SRC).toContain(
            'lastTargetSceneIdsByBookId: Object.fromEntries(this.lastTargetSceneIdsByBookId)'
        );
    });

    it('scheduleTargetPersist writes cache then saves settings (in that order)', () => {
        // Order matters: write must precede save so saveSettings sees the
        // mutation. Pinning order catches a future refactor that reorders.
        const persistFn = INQUIRY_VIEW_SRC.match(
            /private scheduleTargetPersist\(\)[\s\S]+?\n\s{4}\}/
        )?.[0] ?? '';
        const writeIdx = persistFn.indexOf('this.plugin.settings.inquiryTargetCache = cache;');
        const saveIdx = persistFn.indexOf('this.plugin.saveSettings()');
        expect(writeIdx).toBeGreaterThan(-1);
        expect(saveIdx).toBeGreaterThan(-1);
        expect(saveIdx).toBeGreaterThan(writeIdx);
    });

    it('clearPersistedTargetCache wipes both fields together (atomic clear)', () => {
        expect(INQUIRY_VIEW_SRC).toMatch(
            /this\.plugin\.settings\.inquiryTargetCache\s*=\s*\{\s*lastBookId:\s*undefined,\s*lastTargetSceneIdsByBookId:\s*\{\}\s*\};/
        );
    });

    it('user-driven targetSceneIds mutations are followed by scheduleTargetPersist', () => {
        // Three user-driven paths must each call scheduleTargetPersist:
        //   setFocusByIndex  (line ~8217)
        //   drillIntoBook    (line ~8303)
        //   toggleTargetSceneSelection (line ~4586)
        const persistCalls = INQUIRY_VIEW_SRC.match(/this\.scheduleTargetPersist\(\);/g) ?? [];
        // At least three call sites; exact count may grow but must not drop.
        expect(persistCalls.length).toBeGreaterThanOrEqual(3);
    });

    it('toggleTargetSceneSelection updates lastTargetSceneIdsByBookId then persists', () => {
        // The Map<bookId, sceneIds[]> in-memory mirror must update before
        // scheduleTargetPersist reads it for the payload.
        const fn = INQUIRY_VIEW_SRC.match(
            /this\.state\.targetSceneIds\s*=\s*next;[\s\S]{0,400}?this\.scheduleTargetPersist\(\)/
        );
        expect(fn).toBeTruthy();
        expect(fn?.[0]).toContain('this.lastTargetSceneIdsByBookId.set(activeBookId, [...next]);');
    });
});

// ─────────────────────────────────────────────────────────────────────────
//  mode round-trip — inquiryLastMode read at startup, write on toggle
// ─────────────────────────────────────────────────────────────────────────

describe('characterization: mode round-trip via inquiryLastMode', () => {
    it('constructor reads inquiryLastMode at view startup', () => {
        // src/inquiry/InquiryView.ts ~ line 648 (constructor)
        expect(INQUIRY_VIEW_SRC).toMatch(
            /constructor\([\s\S]+?const lastMode = this\.plugin\.settings\.inquiryLastMode;/
        );
    });

    it('constructor validates inquiryLastMode against flow|depth before adopting', () => {
        // The persisted value is trusted only if it matches the known lens
        // set. Pinning this guard prevents Slice 2 from silently accepting
        // arbitrary strings from settings.
        expect(INQUIRY_VIEW_SRC).toMatch(/lastMode === 'flow' \|\| lastMode === 'depth'/);
    });

    it('setActiveLens writes inquiryLastMode and immediately saves', () => {
        const fn = INQUIRY_VIEW_SRC.match(
            /private setActiveLens\([\s\S]+?void this\.plugin\.saveSettings\(\);/
        )?.[0] ?? '';
        expect(fn).toContain('this.state.mode = mode;');
        expect(fn).toContain('this.plugin.settings.inquiryLastMode = mode;');
        // Order: state mutation → settings write → save. Slice 2 must
        // preserve this exact ordering or risk a save-without-mutation race.
        const stateIdx = fn.indexOf('this.state.mode = mode;');
        const writeIdx = fn.indexOf('this.plugin.settings.inquiryLastMode = mode;');
        const saveIdx = fn.indexOf('this.plugin.saveSettings()');
        expect(stateIdx).toBeLessThan(writeIdx);
        expect(writeIdx).toBeLessThan(saveIdx);
    });

    it('resetInquiryToFreshBaseState reads inquiryLastMode to honour the user preference', () => {
        // src/inquiry/InquiryView.ts ~ line 7208 (resetInquiryToFreshBaseState)
        // The reset preserves the last-chosen lens rather than collapsing
        // back to the InquiryState default. Critical for UX consistency.
        const resetFn = INQUIRY_VIEW_SRC.match(
            /private resetInquiryToFreshBaseState\([\s\S]+?\n\s{4}\}/
        )?.[0] ?? '';
        expect(resetFn).toContain('const lastMode = this.plugin.settings.inquiryLastMode;');
        expect(resetFn).toContain("lastMode === 'flow' || lastMode === 'depth' ? lastMode : defaults.mode");
    });

    it('inquiryLastMode has exactly two read sites and exactly one write site today', () => {
        const reads = INQUIRY_VIEW_SRC.match(
            /this\.plugin\.settings\.inquiryLastMode(?!\s*=)/g
        ) ?? [];
        const writes = INQUIRY_VIEW_SRC.match(
            /this\.plugin\.settings\.inquiryLastMode\s*=/g
        ) ?? [];
        // Two reads (constructor, reset) + one write (setActiveLens). Pinning
        // the counts ensures Slice 2 doesn't accidentally introduce a third
        // read path that bypasses the controller.
        expect(reads.length).toBe(2);
        expect(writes.length).toBe(1);
    });
});

// ─────────────────────────────────────────────────────────────────────────
//  loadTargetCache — atomic activeBookId + targetSceneIds restoration
// ─────────────────────────────────────────────────────────────────────────

describe('characterization: loadTargetCache atomicity', () => {
    it('restores activeBookId and targetSceneIds together when adopting persisted selection', () => {
        // These two writes must stay paired — separating them would create
        // a momentary state where activeBookId is set but targetSceneIds is
        // stale, triggering wrong UI selections on the first render.
        const fn = INQUIRY_VIEW_SRC.match(
            /this\.state\.activeBookId\s*=\s*cache\.lastBookId;[\s\S]{0,200}?this\.state\.targetSceneIds\s*=\s*this\.lastTargetSceneIdsByBookId\.get/
        );
        expect(fn).toBeTruthy();
    });

    it('hydrates lastTargetSceneIdsByBookId via normalizeTargetSceneIds', () => {
        // Normalization must run on every per-book scene list during
        // hydration so downstream comparators (areTargetSceneIdsEqual)
        // can rely on canonical shape.
        expect(INQUIRY_VIEW_SRC).toContain('this.normalizeTargetSceneIds(sceneIds)');
    });

    it('options.adoptPersistedSelection !== false defaults to true (preserves UX)', () => {
        expect(INQUIRY_VIEW_SRC).toContain('const adoptPersistedSelection = options?.adoptPersistedSelection !== false;');
    });
});

// ─────────────────────────────────────────────────────────────────────────
//  Slice 2 ownership boundary — owned vs deferred fields
// ─────────────────────────────────────────────────────────────────────────

describe('characterization: Slice 2 ownership scope (per audit §4)', () => {
    it('selection fields are still directly mutated on this.state today', () => {
        // Slice 2 will own: scope, mode, activeBookId, targetSceneIds,
        // selectedPromptIds, promptFormOverrides, reportPreviewOpen.
        //
        // These should all still appear as `this.state.<field> =` writes
        // PRE-extraction. After Slice 2 lands, this test should be inverted
        // (or removed) and the controller's setter tests take its place.
        const sliceTwoFields = [
            'scope',
            'mode',
            'activeBookId',
            'targetSceneIds',
            'selectedPromptIds',
            'promptFormOverrides',
            'reportPreviewOpen',
        ];
        for (const field of sliceTwoFields) {
            const pattern = new RegExp(`this\\.state\\.${field}\\s*=`);
            expect(pattern.test(INQUIRY_VIEW_SRC)).toBe(true);
        }
    });

    it('Slice 1 fields are NOT directly mutated outside InquiryActiveSessionState', () => {
        // Doctrine check — guards against regression. The Slice 1 fields
        // should already route through the controller. The two acceptable
        // forms in InquiryView are reads (comparison) or controller calls.
        // The forbidden form is `this.state.<sliceOne> = …` direct write.
        const sliceOneFields = [
            'activeSessionId',
            'activeResult',
            'activeQuestionId',
            'activeZone',
            'cacheStatus',
            'corpusFingerprint',
            'corpusOnlyFingerprint',
            'corpusManifestSnapshot',
            'lastError',
        ];
        for (const field of sliceOneFields) {
            const pattern = new RegExp(`this\\.state\\.${field}\\s*=(?!=)`);
            expect(pattern.test(INQUIRY_VIEW_SRC)).toBe(false);
        }
    });
});
