import { TFile } from 'obsidian';
import type RadialTimelinePlugin from '../main';
import type { TimelineItem } from '../types';
import type {
    ActiveWritingSession,
    WritingSessionMode,
    WritingSessionRecord,
    WritingSessionStage,
    WritingSessionStagePreference,
    WritingSessionsSettings
} from '../types/settings';
import { STAGE_ORDER } from '../utils/constants';
import { getActiveBook } from '../utils/books';
import { isCompleteStatus, normalizePublishStage } from '../progress/progressSnapshot';
import { getRuntimeSettings } from '../utils/runtimeEstimator';
import { normalizeStatus } from '../utils/text';

const MAX_SESSION_RECORDS = 500;

/**
 * Bumped whenever the persisted writing-session data shape changes in a way
 * that future plugin releases or the companion website must migrate. Stamped
 * onto settings and the portable vault export so the author's data stays
 * forward-readable even after they stop using this plugin.
 */
export const WRITING_SESSIONS_SCHEMA_VERSION = 2;

/**
 * If a running session goes this long without a heartbeat it is assumed the
 * app was closed/crashed and the dead time is not real writing time. Elapsed
 * time is frozen at the last heartbeat instead of counting the gap.
 */
const ACTIVE_SESSION_STALE_MS = 5 * 60 * 1000;

/** Minimum spacing between heartbeat writes so we don't save every tick. */
const HEARTBEAT_PERSIST_MS = 30 * 1000;

/**
 * Author-owned, plain-JSON copy of every session, written into the vault so
 * the data is portable, human-visible, survives the 500-record settings cap,
 * and stays with the author if they uninstall the plugin. Local only — never
 * uploaded.
 */
const PORTABLE_LOG_FOLDER = 'Radial Timeline';
const PORTABLE_LOG_PATH = `${PORTABLE_LOG_FOLDER}/Writing Sessions.json`;

type Stage = typeof STAGE_ORDER[number];

export interface WritingSessionCompletionInput {
    elapsedMs?: number;
    wordsAdded?: number;
    scenesCompleted?: number;
    scenePaths?: string[];
    pagesEdited?: number;
    note?: string;
}

export interface WritingSessionStartOptions {
    mode?: WritingSessionMode;
    stage?: WritingSessionStagePreference;
    goalMinutes?: number;
}

export interface WritingSessionSceneSuggestion {
    path: string;
    title?: string;
    stage?: WritingSessionStage;
    status?: string;
    reason: 'active' | 'open' | 'working' | 'modified';
}

export interface SceneCompletionEvent {
    date: string;
    stage: Stage;
    workKind: 'fresh' | 'revision';
    revisionRound: Stage;
    sceneId?: string;
    path?: string;
    title?: string;
    bookId?: string;
    bookTitle?: string;
}

export interface DailyWritingStats {
    date: string;
    minutesLogged: number;
    sessionsCompleted: number;
    wordsDrafted: number;
    sessionCountByMode: Record<WritingSessionMode, number>;
    minutesByMode: Record<WritingSessionMode, number>;
    scenesCompletedByStage: Record<Stage, number>;
    sceneCompletionEvents: SceneCompletionEvent[];
}

export interface DailyWritingSessionProgress {
    date: string;
    dailyTargetMinutes?: number;
    minutesLogged: number;
    sessionsCompleted: number;
    remainingMinutes?: number;
    overGoalMinutes: number;
}

export interface WritingRangeStats {
    startDate: string;
    endDate: string;
    days: number;
    dailyTargetMinutes?: number;
    minutesLogged: number;
    sessionsCompleted: number;
    wordsDrafted: number;
    daysWithSessions: number;
    daysGoalMet: number;
    sessionCountByMode: Record<WritingSessionMode, number>;
    minutesByMode: Record<WritingSessionMode, number>;
    scenesCompletedByStage: Record<Stage, number>;
    freshScenesCompleted: number;
    revisionScenesCompleted: number;
    sceneCompletionEvents: SceneCompletionEvent[];
}

const EMPTY_MODE_COUNTS: Record<WritingSessionMode, number> = {
    drafting: 0,
    revising: 0,
    editing: 0,
    planning: 0,
};

function cloneModeCounts(): Record<WritingSessionMode, number> {
    return { ...EMPTY_MODE_COUNTS };
}

function emptyStageCounts(): Record<Stage, number> {
    return {
        Zero: 0,
        Author: 0,
        House: 0,
        Press: 0,
    };
}

function nowIso(): string {
    return new Date().toISOString();
}

function localDateString(date = new Date()): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string): Date {
    const [yearRaw, monthRaw, dayRaw] = value.split('-');
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    const day = Number(dayRaw);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return new Date();
    }
    return new Date(year, month - 1, day);
}

function addLocalDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function dateRangeSet(endDate: string, days: number): { startDate: string; dates: Set<string> } {
    const safeDays = Math.max(1, Math.round(days));
    const end = parseLocalDate(endDate);
    const start = addLocalDays(end, -(safeDays - 1));
    const dates = new Set<string>();
    for (let index = 0; index < safeDays; index++) {
        dates.add(localDateString(addLocalDays(start, index)));
    }
    return { startDate: localDateString(start), dates };
}

function dateKey(value: string | undefined): string {
    const raw = value ?? '';
    if (raw.includes('T')) {
        const parsed = new Date(raw);
        if (!Number.isNaN(parsed.getTime())) {
            return localDateString(parsed);
        }
    }
    return raw.slice(0, 10);
}

function generateSessionId(): string {
    return `wrs-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function coerceMode(mode: WritingSessionMode | undefined): WritingSessionMode {
    if (mode === 'drafting' || mode === 'revising' || mode === 'editing' || mode === 'planning') {
        return mode;
    }
    return 'drafting';
}

function coerceStage(stage: WritingSessionStage | undefined): WritingSessionStage | undefined {
    if (stage === 'Mixed') return 'Mixed';
    return STAGE_ORDER.find(candidate => candidate === stage);
}

function coerceStagePreference(stage: WritingSessionStagePreference | undefined): WritingSessionStagePreference {
    if (stage === 'auto' || stage === 'Mixed') return stage;
    return STAGE_ORDER.find(candidate => candidate === stage) ?? 'auto';
}

function formatSceneStatus(status: TimelineItem['status']): string | undefined {
    if (Array.isArray(status)) return status.filter(Boolean).join(', ') || undefined;
    return status?.toString().trim() || undefined;
}

function uniquePaths(paths: Array<string | undefined>): string[] {
    return [...new Set(paths.map(path => path?.trim()).filter((path): path is string => Boolean(path)))];
}

function positiveInteger(value: number | undefined): number | undefined {
    if (!Number.isFinite(value)) return undefined;
    const rounded = Math.max(0, Math.round(value ?? 0));
    return rounded > 0 ? rounded : undefined;
}

function positiveMinutes(value: number | undefined): number | undefined {
    if (!Number.isFinite(value)) return undefined;
    const rounded = Math.max(0, Math.round(value ?? 0));
    return rounded > 0 ? rounded : undefined;
}

function coerceWeeklyGoalDays(value: number | undefined): number {
    if (!Number.isFinite(value)) return 7;
    return Math.min(7, Math.max(1, Math.round(value ?? 7)));
}

/**
 * True when a running session's heartbeat is older than the stale threshold,
 * i.e. the app was almost certainly closed/crashed during the gap.
 */
function isActiveSessionStale(session: ActiveWritingSession, at = new Date()): boolean {
    if (session.pausedAt || !session.lastSeenAt) return false;
    const seenAt = Date.parse(session.lastSeenAt);
    if (!Number.isFinite(seenAt)) return false;
    return at.getTime() - seenAt > ACTIVE_SESSION_STALE_MS;
}

function activeElapsedMs(session: ActiveWritingSession, at = new Date()): number {
    const elapsedBeforePause = Math.max(0, session.elapsedMsBeforePause || 0);
    if (session.pausedAt) return elapsedBeforePause;
    const resumedAt = Date.parse(session.lastResumedAt);
    if (!Number.isFinite(resumedAt)) return elapsedBeforePause;
    // Abandoned session: stop counting at the last heartbeat, not `at`, so a
    // forgotten timer left running across an app quit doesn't report hours of
    // phantom writing time.
    const seenAt = session.lastSeenAt ? Date.parse(session.lastSeenAt) : NaN;
    const cutoff = isActiveSessionStale(session, at) && Number.isFinite(seenAt)
        ? seenAt
        : at.getTime();
    return elapsedBeforePause + Math.max(0, cutoff - resumedAt);
}

export function normalizeWritingSessionsSettings(settings: WritingSessionsSettings | undefined): WritingSessionsSettings {
    const records = Array.isArray(settings?.records)
        ? settings.records
            .filter((record): record is WritingSessionRecord => Boolean(record?.id && record.startedAt && record.endedAt))
            .slice(-MAX_SESSION_RECORDS)
        : [];
    const defaultMode = coerceMode(settings?.defaults?.defaultMode);
    const defaultStage = coerceStagePreference(settings?.defaults?.defaultStage);
    const weeklyGoalDays = coerceWeeklyGoalDays(settings?.defaults?.weeklyGoalDays);
    const writingStatsOpen = settings?.defaults?.writingStatsOpen === true;
    const active = settings?.active;
    return {
        schemaVersion: WRITING_SESSIONS_SCHEMA_VERSION,
        defaults: { defaultMode, defaultStage, weeklyGoalDays, writingStatsOpen },
        ...(active ? {
            active: {
                ...active,
                mode: coerceMode(active.mode),
                stage: coerceStage(active.stage),
                stagePreference: coerceStagePreference(active.stagePreference),
                countdownSegmentStartElapsedMs: Number.isFinite(active.countdownSegmentStartElapsedMs)
                    ? Math.max(0, Math.round(active.countdownSegmentStartElapsedMs ?? 0))
                    : undefined,
            }
        } : {}),
        records: records.map(record => ({
            ...record,
            mode: coerceMode(record.mode),
            stage: coerceStage(record.stage),
            stagePreference: coerceStagePreference(record.stagePreference),
            scenePaths: uniquePaths(record.scenePaths ?? []),
        })),
    };
}

export function collectSceneCompletionEvents(scenes: TimelineItem[]): SceneCompletionEvent[] {
    return scenes.flatMap(scene => {
        if (!isCompleteStatus(scene.status) || !scene.due) return [];
        const date = dateKey(scene.due);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
        const stage = normalizePublishStage(scene['Publish Stage']);
        return [{
            date,
            stage,
            workKind: stage === 'Zero' ? 'fresh' : 'revision',
            revisionRound: stage,
            sceneId: scene.sceneId,
            path: scene.path,
            title: scene.title,
            bookId: scene.bookId,
            bookTitle: scene.bookTitle,
        }];
    });
}

export function buildDailyWritingStats(params: {
    date: string;
    sessions: WritingSessionRecord[];
    scenes: TimelineItem[];
}): DailyWritingStats {
    const { date, sessions, scenes } = params;
    const sessionCountByMode = cloneModeCounts();
    const minutesByMode = cloneModeCounts();
    let minutesLogged = 0;
    let wordsDrafted = 0;

    const sessionsForDate = sessions.filter(session => dateKey(session.endedAt) === date);
    sessionsForDate.forEach(session => {
        const mode = coerceMode(session.mode);
        const minutes = Math.round(Math.max(0, session.elapsedMs || 0) / 60000);
        sessionCountByMode[mode] += 1;
        minutesByMode[mode] += minutes;
        minutesLogged += minutes;
        if (mode === 'drafting') {
            wordsDrafted += positiveInteger(session.wordsAdded) ?? 0;
        }
    });

    const scenesCompletedByStage = emptyStageCounts();
    const sceneCompletionEvents = collectSceneCompletionEvents(scenes).filter(event => event.date === date);
    sceneCompletionEvents.forEach(event => {
        scenesCompletedByStage[event.stage] += 1;
    });

    return {
        date,
        minutesLogged,
        sessionsCompleted: sessionsForDate.length,
        wordsDrafted,
        sessionCountByMode,
        minutesByMode,
        scenesCompletedByStage,
        sceneCompletionEvents,
    };
}

export function buildDailyWritingSessionProgress(params: {
    date: string;
    sessions: WritingSessionRecord[];
    dailyTargetMinutes?: number;
}): DailyWritingSessionProgress {
    let minutesLogged = 0;
    let sessionsCompleted = 0;
    params.sessions.forEach(session => {
        if (dateKey(session.endedAt) !== params.date) return;
        sessionsCompleted += 1;
        minutesLogged += Math.round(Math.max(0, session.elapsedMs || 0) / 60000);
    });

    const dailyTargetMinutes = positiveMinutes(params.dailyTargetMinutes);
    const remainingMinutes = dailyTargetMinutes
        ? Math.max(0, dailyTargetMinutes - minutesLogged)
        : undefined;
    const overGoalMinutes = dailyTargetMinutes
        ? Math.max(0, minutesLogged - dailyTargetMinutes)
        : 0;

    return {
        date: params.date,
        dailyTargetMinutes,
        minutesLogged,
        sessionsCompleted,
        remainingMinutes,
        overGoalMinutes,
    };
}

export function buildWritingRangeStats(params: {
    endDate: string;
    days: number;
    sessions: WritingSessionRecord[];
    scenes: TimelineItem[];
    dailyTargetMinutes?: number;
}): WritingRangeStats {
    const safeDays = Math.max(1, Math.round(params.days));
    const { startDate, dates } = dateRangeSet(params.endDate, safeDays);
    const sessionCountByMode = cloneModeCounts();
    const minutesByMode = cloneModeCounts();
    const minutesByDate = new Map<string, number>();
    let minutesLogged = 0;
    let wordsDrafted = 0;
    let sessionsCompleted = 0;

    params.sessions.forEach(session => {
        const sessionDate = dateKey(session.endedAt);
        if (!dates.has(sessionDate)) return;
        const mode = coerceMode(session.mode);
        const minutes = Math.round(Math.max(0, session.elapsedMs || 0) / 60000);
        sessionsCompleted += 1;
        sessionCountByMode[mode] += 1;
        minutesByMode[mode] += minutes;
        minutesLogged += minutes;
        minutesByDate.set(sessionDate, (minutesByDate.get(sessionDate) ?? 0) + minutes);
        if (mode === 'drafting') {
            wordsDrafted += positiveInteger(session.wordsAdded) ?? 0;
        }
    });

    const scenesCompletedByStage = emptyStageCounts();
    let freshScenesCompleted = 0;
    let revisionScenesCompleted = 0;
    const sceneCompletionEvents = collectSceneCompletionEvents(params.scenes).filter(event => dates.has(event.date));
    sceneCompletionEvents.forEach(event => {
        scenesCompletedByStage[event.stage] += 1;
        if (event.workKind === 'fresh') freshScenesCompleted += 1;
        else revisionScenesCompleted += 1;
    });

    const dailyTargetMinutes = positiveMinutes(params.dailyTargetMinutes);
    const daysWithSessions = [...minutesByDate.values()].filter(minutes => minutes > 0).length;
    const daysGoalMet = dailyTargetMinutes
        ? [...minutesByDate.values()].filter(minutes => minutes >= dailyTargetMinutes).length
        : 0;

    return {
        startDate,
        endDate: params.endDate,
        days: safeDays,
        dailyTargetMinutes,
        minutesLogged,
        sessionsCompleted,
        wordsDrafted,
        daysWithSessions,
        daysGoalMet,
        sessionCountByMode,
        minutesByMode,
        scenesCompletedByStage,
        freshScenesCompleted,
        revisionScenesCompleted,
        sceneCompletionEvents,
    };
}

export class WritingSessionService {
    private hydrated = false;
    private lastHeartbeatPersistMs = 0;

    constructor(private plugin: RadialTimelinePlugin) {}

    /**
     * Normalize persisted settings exactly once (at plugin load), then reuse
     * the normalized object. Avoids re-allocating the records array on every
     * read — `getSettings()` is called from a 1-second UI tick.
     */
    async hydrate(): Promise<void> {
        this.hydrated = false;
        this.getSettings();
        await this.reconcileActiveSession();
    }

    getSettings(): WritingSessionsSettings {
        const existing = this.plugin.settings.writingSessions;
        if (this.hydrated && existing) return existing;
        const normalized = normalizeWritingSessionsSettings(existing);
        this.plugin.settings.writingSessions = normalized;
        this.hydrated = true;
        return normalized;
    }

    /**
     * Convert a session abandoned by an app crash/quit into a paused session
     * frozen at its last heartbeat, so the author resumes/stops from real
     * elapsed time instead of hours of dead time. Runs once on load.
     */
    private async reconcileActiveSession(): Promise<void> {
        const settings = this.getSettings();
        const active = settings.active;
        if (!active || active.pausedAt || !isActiveSessionStale(active)) return;
        active.elapsedMsBeforePause = activeElapsedMs(active);
        active.pausedAt = active.lastSeenAt ?? nowIso();
        await this.plugin.saveSettings();
    }

    /**
     * Heartbeat for the running session. Called from the UI tick; persists at
     * most once per HEARTBEAT_PERSIST_MS so a hard quit loses at worst that
     * much unrecorded time (and never counts the dead gap — see activeElapsedMs).
     */
    async markActiveSessionSeen(): Promise<void> {
        const settings = this.getSettings();
        const active = settings.active;
        if (!active || active.pausedAt) return;
        active.lastSeenAt = nowIso();
        const now = Date.now();
        if (now - this.lastHeartbeatPersistMs < HEARTBEAT_PERSIST_MS) return;
        this.lastHeartbeatPersistMs = now;
        await this.plugin.saveSettings();
    }

    getActiveSession(): ActiveWritingSession | undefined {
        return this.getSettings().active;
    }

    getActiveElapsedMs(at = new Date()): number {
        const active = this.getActiveSession();
        return active ? activeElapsedMs(active, at) : 0;
    }

    getDefaultGoalMinutes(): number | undefined {
        return positiveMinutes(getRuntimeSettings(this.plugin.settings).sessionPlanning?.dailyMinutes);
    }

    async setDefaultMode(mode: WritingSessionMode): Promise<void> {
        const settings = this.getSettings();
        settings.defaults.defaultMode = coerceMode(mode);
        await this.plugin.saveSettings();
    }

    async setDefaultStage(stage: WritingSessionStagePreference): Promise<void> {
        const settings = this.getSettings();
        settings.defaults.defaultStage = coerceStagePreference(stage);
        await this.plugin.saveSettings();
    }

    async setWeeklyGoalDays(days: number | undefined): Promise<void> {
        const settings = this.getSettings();
        settings.defaults.weeklyGoalDays = coerceWeeklyGoalDays(days);
        await this.plugin.saveSettings();
    }

    private getOpenScenePaths(): string[] {
        const workspace = this.plugin.app?.workspace;
        const activePath = workspace?.getActiveFile?.()?.path;
        const leaves = workspace?.getLeavesOfType?.('markdown') ?? [];
        const openPaths = leaves.map(leaf => {
            const view = (leaf as { view?: { file?: { path?: string } } }).view;
            return view?.file?.path;
        });
        return uniquePaths([activePath, ...openPaths]);
    }

    private getSceneFileModifiedAt(path: string): number | undefined {
        const file = this.plugin.app?.vault?.getAbstractFileByPath?.(path) as { stat?: { mtime?: number } } | null | undefined;
        const mtime = file?.stat?.mtime;
        return Number.isFinite(mtime) ? mtime : undefined;
    }

    private isSceneInActiveBook(scene: TimelineItem): boolean {
        const book = getActiveBook(this.plugin.settings);
        if (!book) return true;
        if (scene.bookId) return scene.bookId === book.id;
        if (scene.bookTitle) return scene.bookTitle === book.title;
        const sourceFolder = book.sourceFolder;
        return sourceFolder ? Boolean(scene.path?.startsWith(`${sourceFolder}/`) || scene.path === sourceFolder) : true;
    }

    private resolveAutoStage(scenes: TimelineItem[]): WritingSessionStage {
        const scopedScenes = scenes.filter(scene => this.isSceneInActiveBook(scene));
        const workingStages = new Set(scopedScenes
            .filter(scene => normalizeStatus(scene.status) === 'Working')
            .map(scene => normalizePublishStage(scene['Publish Stage'])));
        if (workingStages.size === 1) return [...workingStages][0];
        if (workingStages.size > 1) return 'Mixed';

        const stageWithIncomplete = [...STAGE_ORDER].reverse().find(stage =>
            scopedScenes.some(scene => normalizePublishStage(scene['Publish Stage']) === stage && !isCompleteStatus(scene.status))
        );
        if (stageWithIncomplete) return stageWithIncomplete;

        return [...STAGE_ORDER].reverse().find(stage =>
            scopedScenes.some(scene => normalizePublishStage(scene['Publish Stage']) === stage)
        ) ?? 'Zero';
    }

    private async resolveSessionStage(preference: WritingSessionStagePreference): Promise<WritingSessionStage> {
        if (preference !== 'auto') return coerceStage(preference) ?? 'Zero';
        try {
            return this.resolveAutoStage(await this.plugin.getSceneData());
        } catch {
            return 'Zero';
        }
    }

    async start(options: WritingSessionMode | WritingSessionStartOptions = {}): Promise<ActiveWritingSession> {
        const settings = this.getSettings();
        if (settings.active) {
            throw new Error('A writing session is already active.');
        }
        const startOptions: WritingSessionStartOptions = typeof options === 'string'
            ? { mode: options }
            : options;
        const book = getActiveBook(this.plugin.settings);
        const startedAt = nowIso();
        const stagePreference = coerceStagePreference(startOptions.stage ?? settings.defaults.defaultStage);
        const stage = await this.resolveSessionStage(stagePreference);
        const active: ActiveWritingSession = {
            id: generateSessionId(),
            bookId: book?.id,
            bookTitle: book?.title,
            mode: coerceMode(startOptions.mode ?? settings.defaults.defaultMode),
            stage,
            stagePreference,
            startedAt,
            lastResumedAt: startedAt,
            lastSeenAt: startedAt,
            elapsedMsBeforePause: 0,
            goalMinutes: positiveMinutes(startOptions.goalMinutes),
            countdownSegmentStartElapsedMs: positiveMinutes(startOptions.goalMinutes) ? 0 : undefined,
        };
        settings.active = active;
        this.lastHeartbeatPersistMs = Date.now();
        await this.plugin.saveSettings();
        return active;
    }

    async pause(): Promise<ActiveWritingSession> {
        const settings = this.getSettings();
        const active = settings.active;
        if (!active) throw new Error('No writing session is active.');
        if (active.pausedAt) return active;
        const pausedAt = new Date();
        active.elapsedMsBeforePause = activeElapsedMs(active, pausedAt);
        active.pausedAt = pausedAt.toISOString();
        await this.plugin.saveSettings();
        return active;
    }

    async resume(): Promise<ActiveWritingSession> {
        const settings = this.getSettings();
        const active = settings.active;
        if (!active) throw new Error('No writing session is active.');
        if (!active.pausedAt) return active;
        active.pausedAt = undefined;
        active.lastResumedAt = nowIso();
        active.lastSeenAt = active.lastResumedAt;
        this.lastHeartbeatPersistMs = Date.now();
        await this.plugin.saveSettings();
        return active;
    }

    async continueCountdown(): Promise<ActiveWritingSession> {
        const settings = this.getSettings();
        const active = settings.active;
        if (!active) throw new Error('No writing session is active.');
        if (!active.goalMinutes) throw new Error('Only countdown sessions can be continued.');
        const now = new Date();
        const elapsedBeforeNextSegment = activeElapsedMs(active, now);
        active.elapsedMsBeforePause = elapsedBeforeNextSegment;
        active.countdownSegmentStartElapsedMs = elapsedBeforeNextSegment;
        active.pausedAt = undefined;
        active.lastResumedAt = now.toISOString();
        active.lastSeenAt = active.lastResumedAt;
        this.lastHeartbeatPersistMs = Date.now();
        await this.plugin.saveSettings();
        return active;
    }

    async stop(completion: WritingSessionCompletionInput = {}): Promise<WritingSessionRecord> {
        const settings = this.getSettings();
        const active = settings.active;
        if (!active) throw new Error('No writing session is active.');
        const endedAt = new Date();
        const record: WritingSessionRecord = {
            id: active.id,
            bookId: active.bookId,
            bookTitle: active.bookTitle,
            mode: active.mode,
            stage: active.stage,
            stagePreference: active.stagePreference,
            startedAt: active.startedAt,
            endedAt: endedAt.toISOString(),
            elapsedMs: Math.max(0, Math.round(completion.elapsedMs ?? activeElapsedMs(active, endedAt))),
            wordsAdded: positiveInteger(completion.wordsAdded),
            scenesCompleted: positiveInteger(completion.scenesCompleted),
            scenePaths: uniquePaths(completion.scenePaths ?? []),
            pagesEdited: positiveInteger(completion.pagesEdited),
            note: completion.note?.trim() || undefined,
            source: 'timer',
        };
        const allRecords = [...settings.records, record];
        settings.records = allRecords.slice(-MAX_SESSION_RECORDS);
        settings.active = undefined;
        await this.plugin.saveSettings();
        // Mirror the full history (pre-cap) into the author-owned vault file so
        // records pruned from settings are never permanently lost.
        await this.flushPortableSessionLog(allRecords);
        return record;
    }

    /**
     * Write/refresh the author-owned portable JSON log in the vault. Merges by
     * id with any existing file so the complete history survives the in-settings
     * MAX_SESSION_RECORDS cap and a plugin uninstall. Best-effort: a failure
     * here must never break stopping a session.
     */
    private async flushPortableSessionLog(currentRecords: WritingSessionRecord[]): Promise<void> {
        try {
            const vault = this.plugin.app?.vault;
            if (!vault) return;

            const byId = new Map<string, WritingSessionRecord>();
            const existing = vault.getAbstractFileByPath(PORTABLE_LOG_PATH) as TFile | null;
            if (existing) {
                try {
                    const parsed = JSON.parse(await vault.read(existing)) as { records?: unknown };
                    if (Array.isArray(parsed?.records)) {
                        for (const raw of parsed.records) {
                            const rec = raw as WritingSessionRecord;
                            if (rec?.id && rec.startedAt && rec.endedAt) byId.set(rec.id, rec);
                        }
                    }
                } catch {
                    // Corrupt/hand-edited file — fall back to current records only.
                }
            }
            for (const rec of currentRecords) byId.set(rec.id, rec);

            const merged = [...byId.values()].sort((a, b) => a.endedAt.localeCompare(b.endedAt));
            const payload = `${JSON.stringify({
                schemaVersion: WRITING_SESSIONS_SCHEMA_VERSION,
                generatedBy: 'Radial Timeline',
                generatedAt: nowIso(),
                records: merged,
            }, null, 2)}\n`;

            if (!vault.getAbstractFileByPath(PORTABLE_LOG_FOLDER)) {
                await vault.createFolder(PORTABLE_LOG_FOLDER).catch(() => undefined);
            }
            if (existing) {
                await vault.modify(existing, payload);
            } else {
                await vault.create(PORTABLE_LOG_PATH, payload);
            }
        } catch (error) {
            console.warn('[RT WritingSession] Could not write portable session log:', error);
        }
    }

    async collectTouchedSceneSuggestions(active: ActiveWritingSession | undefined = this.getActiveSession()): Promise<WritingSessionSceneSuggestion[]> {
        if (!active) return [];
        const scenes = await this.plugin.getSceneData();
        const sceneByPath = new Map(scenes
            .filter(scene => Boolean(scene.path) && this.isSceneInActiveBook(scene))
            .map(scene => [scene.path as string, scene]));
        const suggestions = new Map<string, WritingSessionSceneSuggestion>();
        const addSuggestion = (scene: TimelineItem | undefined, reason: WritingSessionSceneSuggestion['reason']) => {
            if (!scene?.path || suggestions.has(scene.path)) return;
            suggestions.set(scene.path, {
                path: scene.path,
                title: scene.title,
                stage: normalizePublishStage(scene['Publish Stage']),
                status: formatSceneStatus(scene.status),
                reason,
            });
        };

        this.getOpenScenePaths().forEach((path, index) => addSuggestion(sceneByPath.get(path), index === 0 ? 'active' : 'open'));

        scenes
            .filter(scene => this.isSceneInActiveBook(scene) && normalizeStatus(scene.status) === 'Working')
            .forEach(scene => addSuggestion(scene, 'working'));

        const startedAt = Date.parse(active.startedAt);
        if (Number.isFinite(startedAt)) {
            scenes
                .filter(scene => scene.path && this.isSceneInActiveBook(scene))
                .forEach(scene => {
                    const modifiedAt = this.getSceneFileModifiedAt(scene.path as string);
                    if (modifiedAt && modifiedAt >= startedAt) addSuggestion(scene, 'modified');
                });
        }

        return [...suggestions.values()].slice(0, 8);
    }

    async discard(): Promise<void> {
        const settings = this.getSettings();
        if (!settings.active) throw new Error('No writing session is active.');
        settings.active = undefined;
        await this.plugin.saveSettings();
    }

    async getDailyStats(date = localDateString()): Promise<DailyWritingStats> {
        const scenes = await this.plugin.getSceneData();
        return buildDailyWritingStats({
            date,
            sessions: this.getSettings().records,
            scenes,
        });
    }

    getDailySessionProgress(date = localDateString()): DailyWritingSessionProgress {
        return buildDailyWritingSessionProgress({
            date,
            sessions: this.getSettings().records,
            dailyTargetMinutes: this.getDefaultGoalMinutes(),
        });
    }

    async getRangeStats(days: number, endDate = localDateString()): Promise<WritingRangeStats> {
        const scenes = await this.plugin.getSceneData();
        return buildWritingRangeStats({
            endDate,
            days,
            sessions: this.getSettings().records,
            scenes,
            dailyTargetMinutes: this.getDefaultGoalMinutes(),
        });
    }
}
