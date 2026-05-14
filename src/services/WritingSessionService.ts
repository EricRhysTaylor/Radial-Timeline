import type RadialTimelinePlugin from '../main';
import type { TimelineItem } from '../types';
import type {
    ActiveWritingSession,
    WritingSessionMode,
    WritingSessionRecord,
    WritingSessionsSettings
} from '../types/settings';
import { STAGE_ORDER } from '../utils/constants';
import { getActiveBook } from '../utils/books';
import { isCompleteStatus, normalizePublishStage } from '../progress/progressSnapshot';
import { getRuntimeSettings } from '../utils/runtimeEstimator';

const MAX_SESSION_RECORDS = 500;

type Stage = typeof STAGE_ORDER[number];

export interface WritingSessionCompletionInput {
    elapsedMs?: number;
    wordsAdded?: number;
    scenesCompleted?: number;
    pagesEdited?: number;
    note?: string;
}

export interface WritingSessionStartOptions {
    mode?: WritingSessionMode;
    goalMinutes?: number;
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

function activeElapsedMs(session: ActiveWritingSession, at = new Date()): number {
    const elapsedBeforePause = Math.max(0, session.elapsedMsBeforePause || 0);
    if (session.pausedAt) return elapsedBeforePause;
    const resumedAt = Date.parse(session.lastResumedAt);
    if (!Number.isFinite(resumedAt)) return elapsedBeforePause;
    return elapsedBeforePause + Math.max(0, at.getTime() - resumedAt);
}

export function normalizeWritingSessionsSettings(settings: WritingSessionsSettings | undefined): WritingSessionsSettings {
    const records = Array.isArray(settings?.records)
        ? settings.records
            .filter((record): record is WritingSessionRecord => Boolean(record?.id && record.startedAt && record.endedAt))
            .slice(-MAX_SESSION_RECORDS)
        : [];
    const defaultMode = coerceMode(settings?.defaults?.defaultMode);
    const active = settings?.active;
    return {
        defaults: { defaultMode },
        ...(active ? { active: { ...active, mode: coerceMode(active.mode) } } : {}),
        records,
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
    constructor(private plugin: RadialTimelinePlugin) {}

    getSettings(): WritingSessionsSettings {
        const normalized = normalizeWritingSessionsSettings(this.plugin.settings.writingSessions);
        this.plugin.settings.writingSessions = normalized;
        return normalized;
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
        const active: ActiveWritingSession = {
            id: generateSessionId(),
            bookId: book?.id,
            bookTitle: book?.title,
            mode: coerceMode(startOptions.mode ?? settings.defaults.defaultMode),
            startedAt,
            lastResumedAt: startedAt,
            elapsedMsBeforePause: 0,
            goalMinutes: positiveMinutes(startOptions.goalMinutes),
        };
        settings.active = active;
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
            startedAt: active.startedAt,
            endedAt: endedAt.toISOString(),
            elapsedMs: Math.max(0, Math.round(completion.elapsedMs ?? activeElapsedMs(active, endedAt))),
            wordsAdded: positiveInteger(completion.wordsAdded),
            scenesCompleted: positiveInteger(completion.scenesCompleted),
            pagesEdited: positiveInteger(completion.pagesEdited),
            note: completion.note?.trim() || undefined,
            source: 'timer',
        };
        settings.records = [...settings.records, record].slice(-MAX_SESSION_RECORDS);
        settings.active = undefined;
        await this.plugin.saveSettings();
        return record;
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
