import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runModelUpdateCheck } from '../scripts/check-model-updates.mjs';

const tempDirs: string[] = [];

async function createTempWorkspace() {
    const dir = await mkdtemp(path.join(tmpdir(), 'rt-model-check-'));
    tempDirs.push(dir);
    await mkdir(path.join(dir, 'scripts', 'models'), { recursive: true });
    return dir;
}

async function writeJson(filePath: string, value: unknown) {
    await writeFile(filePath, JSON.stringify(value, null, 2), 'utf8');
}

async function readJson(filePath: string) {
    return JSON.parse(await readFile(filePath, 'utf8'));
}

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(async dir => {
        await import('node:fs/promises').then(fs => fs.rm(dir, { recursive: true, force: true }));
    }));
});

describe('runModelUpdateCheck', () => {
    it('writes latest-aliases and a drift report on a normal successful run', async () => {
        const dir = await createTempWorkspace();
        const modelsFile = path.join(dir, 'scripts', 'models', 'latest-models.json');
        const latestAliasesFile = path.join(dir, 'scripts', 'models', 'latest-aliases.json');
        const driftReportFile = path.join(dir, 'scripts', 'models', 'model-drift-report.json');

        await writeJson(modelsFile, {
            generatedAt: '2026-04-16T00:00:00.000Z',
            models: [
                {
                    provider: 'anthropic',
                    id: 'claude-opus-4-7',
                    label: 'Claude Opus 4.7',
                    createdAt: '2026-04-16T00:00:00.000Z',
                    raw: {},
                },
                {
                    provider: 'google',
                    id: 'gemini-pro-latest',
                    label: 'Gemini Pro Latest',
                    outputTokenLimit: 65536,
                    raw: {},
                },
                {
                    provider: 'google',
                    id: 'gemini-3.1-pro-preview',
                    label: 'Gemini 3.1 Pro Preview',
                    raw: {},
                },
            ],
        });

        const result = await runModelUpdateCheck({
            modelsFile,
            latestTrackingFile: latestAliasesFile,
            driftReportFile,
            quiet: true,
            now: () => Date.parse('2026-04-16T12:00:00.000Z'),
        });

        const latestAliases = await readJson(latestAliasesFile);
        const driftReport = await readJson(driftReportFile);

        expect(result.hasActionableChanges).toBe(false);
        expect(latestAliases.snapshotGeneratedAt).toBe('2026-04-16T00:00:00.000Z');
        expect(latestAliases.anthropic.newestModel.id).toBe('claude-opus-4-7');
        expect(driftReport.mode).toBe('report');
        expect(driftReport.hasActionableChanges).toBe(false);
    });

    it('does not create false positives when refresh fails and the previous snapshot is reused', async () => {
        const dir = await createTempWorkspace();
        const modelsFile = path.join(dir, 'scripts', 'models', 'latest-models.json');
        const latestAliasesFile = path.join(dir, 'scripts', 'models', 'latest-aliases.json');
        const driftReportFile = path.join(dir, 'scripts', 'models', 'model-drift-report.json');

        await writeJson(modelsFile, {
            generatedAt: '2026-04-15T00:00:00.000Z',
            models: [
                {
                    provider: 'anthropic',
                    id: 'claude-opus-4-6',
                    label: 'Claude Opus 4.6',
                    createdAt: '2026-02-04T00:00:00.000Z',
                    raw: {},
                },
            ],
        });

        const result = await runModelUpdateCheck({
            modelsFile,
            latestTrackingFile: latestAliasesFile,
            driftReportFile,
            quiet: true,
            now: () => Date.parse('2026-04-17T12:00:00.000Z'),
            updateSnapshot: async () => ({ ok: false, error: 'network blocked' }),
        });

        expect(result.usedFallbackSnapshot).toBe(true);
        expect(result.hasActionableChanges).toBe(false);
        expect((await readJson(driftReportFile)).hasActionableChanges).toBe(false);
    });

    it('reports actionable drift when a refresh introduces a new Anthropic model', async () => {
        const dir = await createTempWorkspace();
        const modelsFile = path.join(dir, 'scripts', 'models', 'latest-models.json');
        const latestAliasesFile = path.join(dir, 'scripts', 'models', 'latest-aliases.json');
        const driftReportFile = path.join(dir, 'scripts', 'models', 'model-drift-report.json');

        await writeJson(modelsFile, {
            generatedAt: '2026-04-15T00:00:00.000Z',
            models: [
                {
                    provider: 'anthropic',
                    id: 'claude-opus-4-6',
                    label: 'Claude Opus 4.6',
                    createdAt: '2026-02-04T00:00:00.000Z',
                    raw: {},
                },
            ],
        });

        const result = await runModelUpdateCheck({
            modelsFile,
            latestTrackingFile: latestAliasesFile,
            driftReportFile,
            quiet: true,
            now: () => Date.parse('2026-04-17T12:00:00.000Z'),
            updateSnapshot: async () => {
                await writeJson(modelsFile, {
                    generatedAt: '2026-04-17T00:00:00.000Z',
                    models: [
                        {
                            provider: 'anthropic',
                            id: 'claude-opus-4-6',
                            label: 'Claude Opus 4.6',
                            createdAt: '2026-02-04T00:00:00.000Z',
                            raw: {},
                        },
                        {
                            provider: 'anthropic',
                            id: 'claude-opus-4-7',
                            label: 'Claude Opus 4.7',
                            createdAt: '2026-04-16T00:00:00.000Z',
                            raw: {},
                        },
                    ],
                });
                return { ok: true };
            },
        });

        expect(result.hasActionableChanges).toBe(true);
        const driftReport = await readJson(driftReportFile);
        expect(driftReport.changes.anthropic.added).toEqual(['claude-opus-4-7']);
        expect(driftReport.hasActionableChanges).toBe(true);
    });

    it('fails hard when refresh breaks and no usable snapshot exists', async () => {
        const dir = await createTempWorkspace();
        const modelsFile = path.join(dir, 'scripts', 'models', 'latest-models.json');
        const latestAliasesFile = path.join(dir, 'scripts', 'models', 'latest-aliases.json');
        const driftReportFile = path.join(dir, 'scripts', 'models', 'model-drift-report.json');

        await expect(runModelUpdateCheck({
            modelsFile,
            latestTrackingFile: latestAliasesFile,
            driftReportFile,
            quiet: true,
            updateSnapshot: async () => ({ ok: false, error: 'network blocked' }),
        })).rejects.toThrow('Provider snapshot unavailable');
    });
});
