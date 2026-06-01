/*
 * Radial Timeline — Writing Session Log Projections
 *
 * Single sanctioned exit point for session data leaving the author's device
 * to any audience. Read `docs/engineering/standards/writing-session-privacy.md`
 * BEFORE changing any function in this file. Privacy guarantees are enforced
 * by `WritingSessionLog.privacy.test.ts` (tracer test).
 *
 * Contract:
 *   - projectPrivate(record):        full row, this device only
 *   - projectFriends(record, opts):  per-session row, sensitive fields stripped
 *   - projectCommunityDaily(rows[]): daily aggregate, NEVER per-session
 *
 * NEVER emitted to friends or community at any tier:
 *   - scenePaths
 *   - scenesCompletedPaths
 *   - note
 *   - raw scene titles
 *
 * Adding a field to WritingSessionRecord requires:
 *   1. Decide its tier (private / opt-in / social).
 *   2. Update this file.
 *   3. Add a tracer string for the field to the privacy test.
 */

import type {
    WritingSessionMode,
    WritingSessionRecord,
    WritingSessionStage,
} from '../types/settings';
import { STAGE_ORDER } from '../utils/constants';

export type SessionLogAudience = 'private' | 'friends' | 'community';

// -- Shared canonical row that survives all rendering ------------------------

/**
 * Canonical "what happened in this session" row, derived from a record.
 * The `private` projection returns this shape verbatim. The `friends`
 * projection strips/reshapes it. Community never produces this — it
 * aggregates to a daily row.
 */
export interface PrivateSessionLogRow {
    audience: 'private';
    id: string;
    endedAt: string;                 // minute precision
    startedAt: string;
    durationMs: number;
    mode: WritingSessionMode;
    stage?: WritingSessionStage;
    bookId?: string;
    bookTitle?: string;
    wordsAdded?: number;
    pagesEdited?: number;
    scenesCompletedCount: number;
    scenesTouchedCount: number;
    /** PRIVATE. Vault paths of touched scenes. */
    scenePaths: string[];
    /** PRIVATE. Vault paths of scenes that completed during the session. */
    scenesCompletedPaths: string[];
    /** PRIVATE. Free-form author note. */
    note?: string;
}

export interface FriendsSessionLogRow {
    audience: 'friends';
    /** Stable id for client-side dedupe. Hashed at upload time server-side; here it is the raw record id, but the friends row is only ever emitted via projectFriends so the boundary is clean. */
    id: string;
    /** Hour precision. */
    date: string;
    durationMin: number;
    mode: WritingSessionMode;
    stage?: WritingSessionStage;
    wordsAdded?: number;
    pagesEdited?: number;
    scenesCompletedCount: number;
    scenesTouchedCount: number;
    /** Present only when the author has opted in for this book. */
    bookTitle?: string;
}

export interface CommunityDailyRow {
    audience: 'community';
    /** Day precision. */
    date: string;
    minutesTotal: number;
    sessionCount: number;
    /** Rounded to nearest 50 to coarsen specificity. */
    wordsAdded: number;
    scenesCompletedByStage: Record<WritingSessionStage, number>;
    /**
     * Mode mix as a fraction of total minutes (0..1). Sums to 1 when
     * minutesTotal > 0, otherwise all zeros.
     */
    modeMix: Record<WritingSessionMode, number>;
}

export interface FriendsProjectionOptions {
    /** Per-book opt-in for emitting bookTitle. False by default. */
    shareBookTitle?: boolean;
}

// -- Time precision (privacy axis, not a binary flag) ------------------------

export function redactTime(iso: string | undefined, audience: SessionLogAudience): string {
    if (!iso) return '';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return '';
    if (audience === 'private') {
        // Minute precision: zero seconds and ms.
        parsed.setUTCSeconds(0, 0);
        return parsed.toISOString();
    }
    if (audience === 'friends') {
        parsed.setUTCMinutes(0, 0, 0);
        return parsed.toISOString();
    }
    // community: day precision (YYYY-MM-DD)
    return parsed.toISOString().slice(0, 10);
}

// -- Projections -------------------------------------------------------------

const ALL_STAGES: WritingSessionStage[] = [...STAGE_ORDER, 'Mixed'];
const ALL_MODES: WritingSessionMode[] = ['drafting', 'revising', 'editing', 'planning'];

function zeroStageCounts(): Record<WritingSessionStage, number> {
    return ALL_STAGES.reduce<Record<WritingSessionStage, number>>((acc, stage) => {
        acc[stage] = 0;
        return acc;
    }, {} as Record<WritingSessionStage, number>);
}

function zeroModeMix(): Record<WritingSessionMode, number> {
    return ALL_MODES.reduce<Record<WritingSessionMode, number>>((acc, mode) => {
        acc[mode] = 0;
        return acc;
    }, {} as Record<WritingSessionMode, number>);
}

function roundToNearest(value: number, step: number): number {
    if (step <= 0) return Math.round(value);
    return Math.round(value / step) * step;
}

export function projectPrivate(record: WritingSessionRecord): PrivateSessionLogRow {
    return {
        audience: 'private',
        id: record.id,
        endedAt: redactTime(record.endedAt, 'private'),
        startedAt: redactTime(record.startedAt, 'private'),
        durationMs: Math.max(0, record.elapsedMs ?? 0),
        mode: record.mode,
        stage: record.stage,
        bookId: record.bookId,
        bookTitle: record.bookTitle,
        wordsAdded: record.wordsAdded,
        pagesEdited: record.pagesEdited,
        scenesCompletedCount: record.scenesCompletedPaths?.length
            ?? record.scenesCompleted
            ?? 0,
        scenesTouchedCount: record.scenePaths?.length ?? 0,
        scenePaths: [...(record.scenePaths ?? [])],
        scenesCompletedPaths: [...(record.scenesCompletedPaths ?? [])],
        note: record.note,
    };
}

export function projectFriends(
    record: WritingSessionRecord,
    options: FriendsProjectionOptions = {},
): FriendsSessionLogRow {
    return {
        audience: 'friends',
        id: record.id,
        date: redactTime(record.endedAt, 'friends'),
        durationMin: Math.max(0, Math.round((record.elapsedMs ?? 0) / 60000)),
        mode: record.mode,
        stage: record.stage,
        wordsAdded: record.wordsAdded,
        pagesEdited: record.pagesEdited,
        scenesCompletedCount: record.scenesCompletedPaths?.length
            ?? record.scenesCompleted
            ?? 0,
        scenesTouchedCount: record.scenePaths?.length ?? 0,
        bookTitle: options.shareBookTitle ? record.bookTitle : undefined,
        // INTENTIONALLY ABSENT: scenePaths, scenesCompletedPaths, note,
        // raw startedAt, raw endedAt, bookId.
    };
}

/**
 * Roll a set of records into a single daily community row. Caller is
 * responsible for grouping by day; this function aggregates one day at a
 * time. NEVER returns per-session detail.
 */
export function projectCommunityDaily(
    date: string,
    records: WritingSessionRecord[],
): CommunityDailyRow {
    const dayPrecision = redactTime(`${date}T00:00:00Z`, 'community');
    const stageCounts = zeroStageCounts();
    const modeMinutes = zeroModeMix();
    let totalMinutes = 0;
    let totalWords = 0;

    for (const record of records) {
        const minutes = Math.max(0, Math.round((record.elapsedMs ?? 0) / 60000));
        totalMinutes += minutes;
        modeMinutes[record.mode] += minutes;
        totalWords += Math.max(0, record.wordsAdded ?? 0);
        const completedCount = record.scenesCompletedPaths?.length
            ?? record.scenesCompleted
            ?? 0;
        if (completedCount > 0 && record.stage) {
            stageCounts[record.stage] += completedCount;
        }
    }

    const modeMix = zeroModeMix();
    if (totalMinutes > 0) {
        for (const mode of ALL_MODES) {
            modeMix[mode] = modeMinutes[mode] / totalMinutes;
        }
    }

    return {
        audience: 'community',
        date: dayPrecision,
        minutesTotal: totalMinutes,
        sessionCount: records.length,
        wordsAdded: roundToNearest(totalWords, 50),
        scenesCompletedByStage: stageCounts,
        modeMix,
    };
}

// -- Window helpers (used by service surfaces) -------------------------------

export interface SessionLogWindow {
    /** Inclusive endDate (YYYY-MM-DD). Defaults to today (caller-supplied). */
    endDate: string;
    /** Number of days back from endDate to include, inclusive. */
    days: number;
}

function dateKey(iso: string | undefined): string {
    if (!iso) return '';
    return iso.slice(0, 10);
}

export function filterRecordsForWindow(
    records: WritingSessionRecord[],
    window: SessionLogWindow,
): WritingSessionRecord[] {
    const end = window.endDate;
    if (!end) return [];
    const endMs = Date.parse(`${end}T23:59:59.999Z`);
    const startMs = endMs - (Math.max(1, window.days) * 24 * 60 * 60 * 1000) + 1;
    if (!Number.isFinite(endMs) || !Number.isFinite(startMs)) return [];
    return records.filter(record => {
        const ended = Date.parse(record.endedAt);
        return Number.isFinite(ended) && ended >= startMs && ended <= endMs;
    });
}

/**
 * Private-audience session log for a window, newest first. The renderer is
 * the only intended consumer.
 */
export function buildPrivateSessionLog(params: {
    records: WritingSessionRecord[];
    window: SessionLogWindow;
    limit?: number;
}): PrivateSessionLogRow[] {
    const filtered = filterRecordsForWindow(params.records, params.window)
        .slice()
        .sort((a, b) => b.endedAt.localeCompare(a.endedAt));
    const sliced = typeof params.limit === 'number' ? filtered.slice(0, params.limit) : filtered;
    return sliced.map(projectPrivate);
}

/**
 * Community-audience daily aggregate log for a window. One row per day with
 * at least one session. NEVER per-session.
 */
export function buildCommunityDailyLog(params: {
    records: WritingSessionRecord[];
    window: SessionLogWindow;
}): CommunityDailyRow[] {
    const filtered = filterRecordsForWindow(params.records, params.window);
    const byDay = new Map<string, WritingSessionRecord[]>();
    for (const record of filtered) {
        const day = dateKey(record.endedAt);
        if (!day) continue;
        const bucket = byDay.get(day);
        if (bucket) bucket.push(record);
        else byDay.set(day, [record]);
    }
    return [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, dayRecords]) => projectCommunityDaily(day, dayRecords));
}
