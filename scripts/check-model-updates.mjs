#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import process from 'process';
import { fileURLToPath } from 'url';
import {
    buildModelDriftReport,
    computeAliasChanges,
    computeAnthropicNewestChange,
    computeDiff,
    computeTokenLimitChanges,
    createLatestAliasTracking,
    hasProviderDiff,
    parseCanonicalSnapshot,
    parseLatestAliasTracking,
} from './modelSnapshotUtils.mjs';

const MODELS_FILE = path.resolve('scripts/models/latest-models.json');
const LATEST_TRACKING_FILE = path.resolve('scripts/models/latest-aliases.json');
const DRIFT_REPORT_FILE = path.resolve('scripts/models/model-drift-report.json');
const UPDATE_SCRIPT = 'node scripts/update-ai-models.mjs';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function readJson(filePath) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

async function writeJson(filePath, value) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function isSnapshotStale(snapshot, nowMs) {
    if (!snapshot?.generatedAt) return true;
    const generatedAtMs = Date.parse(snapshot.generatedAt);
    if (!Number.isFinite(generatedAtMs)) return true;
    return (nowMs - generatedAtMs) >= ONE_DAY_MS;
}

function runUpdateCommand() {
    try {
        execSync(UPDATE_SCRIPT, { stdio: 'inherit', env: process.env });
        return { ok: true };
    } catch (error) {
        return {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

function buildSummaryMessage(report, reportFilePath) {
    if (report.hasActionableChanges) {
        return `[check-model-updates] Actionable provider drift detected. See ${reportFilePath}.`;
    }
    return '[check-model-updates] No actionable provider drift detected.';
}

export async function runModelUpdateCheck(options = {}) {
    const {
        modelsFile = MODELS_FILE,
        latestTrackingFile = LATEST_TRACKING_FILE,
        driftReportFile = DRIFT_REPORT_FILE,
        quiet = false,
        now = () => Date.now(),
        updateSnapshot = async () => runUpdateCommand(),
        log = console.log,
        warn = console.warn,
    } = options;

    const beforeSnapshot = parseCanonicalSnapshot(await readJson(modelsFile));
    const shouldRefresh = isSnapshotStale(beforeSnapshot, now());

    let refreshResult = { ok: true, skipped: !shouldRefresh };
    if (shouldRefresh) {
        if (!quiet) {
            log('[check-model-updates] Refreshing provider snapshot...');
        }
        refreshResult = await updateSnapshot();
    }

    const afterSnapshot = parseCanonicalSnapshot(await readJson(modelsFile));
    const usableSnapshot = afterSnapshot ?? beforeSnapshot;

    if (!usableSnapshot) {
        const refreshError = refreshResult.ok ? '' : ` (${refreshResult.error})`;
        throw new Error(`Provider snapshot unavailable${refreshError}.`);
    }

    if (shouldRefresh && !refreshResult.ok) {
        warn('[check-model-updates] Snapshot refresh failed; using existing canonical snapshot.');
    }

    const previousTracking = parseLatestAliasTracking(await readJson(latestTrackingFile));
    const nextTracking = createLatestAliasTracking(usableSnapshot);

    const changes = computeDiff(beforeSnapshot?.models || [], usableSnapshot.models);
    const aliasChanges = previousTracking ? computeAliasChanges(previousTracking, nextTracking) : [];
    const anthropicNewestChanged = previousTracking
        ? computeAnthropicNewestChange(previousTracking, nextTracking)
        : null;
    const tokenLimitChanges = previousTracking
        ? computeTokenLimitChanges(previousTracking, nextTracking)
        : [];

    const report = buildModelDriftReport({
        checkedAt: nextTracking.checkedAt,
        beforeSnapshot,
        afterSnapshot: usableSnapshot,
        changes,
        aliasChanges,
        anthropicNewestChanged,
        tokenLimitChanges,
    });

    await writeJson(latestTrackingFile, nextTracking);
    await writeJson(driftReportFile, report);

    const summary = buildSummaryMessage(report, driftReportFile);
    if (!quiet || report.hasActionableChanges || (shouldRefresh && !refreshResult.ok)) {
        log(summary);
    }

    return {
        refreshed: shouldRefresh && refreshResult.ok,
        usedFallbackSnapshot: shouldRefresh && !refreshResult.ok,
        hasActionableChanges: report.hasActionableChanges,
        hasProviderDiff: hasProviderDiff(changes),
        report,
        tracking: nextTracking,
        summary,
    };
}

async function main() {
    const quiet = process.argv.includes('--quiet');
    await runModelUpdateCheck({ quiet });
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && currentFilePath === invokedPath) {
    main().catch(error => {
        console.error(`[check-model-updates] Failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
