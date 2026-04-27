import { describe, expect, it, vi, beforeEach } from 'vitest';
import { InputProfileStore, type InputSample } from './inputProfile';

function makePlugin(): { store: Record<string, string>; plugin: never } {
    const store: Record<string, string> = {};
    const adapter = {
        exists: vi.fn(async (path: string) => path in store),
        read: vi.fn(async (path: string) => store[path] ?? ''),
        write: vi.fn(async (path: string, content: string) => { store[path] = content; })
    };
    const plugin = {
        manifest: { id: 'radial-timeline' },
        app: {
            vault: {
                adapter,
                configDir: '.obsidian'
            }
        }
    } as never;
    return { store, plugin };
}

function sample(overrides: Partial<InputSample>): InputSample {
    return {
        provider: 'anthropic',
        modelId: 'claude-sonnet-4-6',
        estimatedInputTokens: 100_000,
        actualInputTokens: 100_000,
        method: 'anthropic_count',
        timestamp: Date.now(),
        ...overrides
    };
}

describe('InputProfileStore', () => {
    let plugin: never;

    beforeEach(() => {
        ({ plugin } = makePlugin());
    });

    it('returns 1.0 (identity) when no samples exist', async () => {
        const profile = new InputProfileStore(plugin);
        await profile.ensureLoaded();
        expect(profile.getBiasMultiplier('anthropic', 'claude-sonnet-4-6')).toBe(1);
    });

    it('returns 1.0 when fewer than the minimum sample count is recorded', async () => {
        const profile = new InputProfileStore(plugin);
        for (let i = 0; i < 4; i++) {
            await profile.record(sample({ estimatedInputTokens: 100_000, actualInputTokens: 110_000 }));
        }
        expect(profile.getBiasMultiplier('anthropic', 'claude-sonnet-4-6')).toBe(1);
    });

    it('computes the median bias once the minimum sample count is reached', async () => {
        const profile = new InputProfileStore(plugin);
        // 5 samples, all with 1.10 ratio → median is 1.10.
        for (let i = 0; i < 5; i++) {
            await profile.record(sample({ estimatedInputTokens: 100_000, actualInputTokens: 110_000 }));
        }
        expect(profile.getBiasMultiplier('anthropic', 'claude-sonnet-4-6')).toBeCloseTo(1.10, 5);
    });

    it('uses median (not mean) so a single outlier does not poison the bias', async () => {
        const profile = new InputProfileStore(plugin);
        // 5 samples at 1.05, one outlier at 5.0 — mean would be ~1.71, median is 1.05.
        for (let i = 0; i < 5; i++) {
            await profile.record(sample({ estimatedInputTokens: 100_000, actualInputTokens: 105_000 }));
        }
        await profile.record(sample({ estimatedInputTokens: 10_000, actualInputTokens: 50_000 }));
        const bias = profile.getBiasMultiplier('anthropic', 'claude-sonnet-4-6');
        expect(bias).toBeLessThan(1.10);
        expect(bias).toBeCloseTo(1.05, 2);
    });

    it('clamps the multiplier to the upper bound (1.25)', async () => {
        const profile = new InputProfileStore(plugin);
        for (let i = 0; i < 5; i++) {
            // 50% over — would be 1.5, must clamp to 1.25.
            await profile.record(sample({ estimatedInputTokens: 100_000, actualInputTokens: 150_000 }));
        }
        expect(profile.getBiasMultiplier('anthropic', 'claude-sonnet-4-6')).toBe(1.25);
    });

    it('clamps the multiplier to the lower bound (0.85)', async () => {
        const profile = new InputProfileStore(plugin);
        for (let i = 0; i < 5; i++) {
            // 50% under — would be 0.5, must clamp to 0.85.
            await profile.record(sample({ estimatedInputTokens: 100_000, actualInputTokens: 50_000 }));
        }
        expect(profile.getBiasMultiplier('anthropic', 'claude-sonnet-4-6')).toBe(0.85);
    });

    it('keeps biases per model — switching models does not mix samples', async () => {
        const profile = new InputProfileStore(plugin);
        for (let i = 0; i < 5; i++) {
            await profile.record(sample({ modelId: 'claude-sonnet-4-6', estimatedInputTokens: 100_000, actualInputTokens: 110_000 }));
        }
        for (let i = 0; i < 5; i++) {
            await profile.record(sample({ modelId: 'claude-opus-4-7', estimatedInputTokens: 100_000, actualInputTokens: 100_000 }));
        }
        expect(profile.getBiasMultiplier('anthropic', 'claude-sonnet-4-6')).toBeCloseTo(1.10, 5);
        expect(profile.getBiasMultiplier('anthropic', 'claude-opus-4-7')).toBeCloseTo(1.0, 5);
    });

    it('rejects samples with non-positive token counts', async () => {
        const profile = new InputProfileStore(plugin);
        await profile.record(sample({ estimatedInputTokens: 0, actualInputTokens: 100 }));
        await profile.record(sample({ estimatedInputTokens: 100, actualInputTokens: 0 }));
        await profile.record(sample({ estimatedInputTokens: -1, actualInputTokens: 100 }));
        expect(profile.getSampleCount('anthropic', 'claude-sonnet-4-6')).toBe(0);
    });

    it('persists samples across reloads', async () => {
        const { plugin: sharedPlugin, store } = makePlugin();
        const first = new InputProfileStore(sharedPlugin);
        for (let i = 0; i < 5; i++) {
            await first.record(sample({ estimatedInputTokens: 100_000, actualInputTokens: 110_000 }));
        }
        // Confirm the profile file was written.
        expect(Object.keys(store).some(k => k.endsWith('input-profile.json'))).toBe(true);

        const second = new InputProfileStore(sharedPlugin);
        await second.ensureLoaded();
        expect(second.getSampleCount('anthropic', 'claude-sonnet-4-6')).toBe(5);
        expect(second.getBiasMultiplier('anthropic', 'claude-sonnet-4-6')).toBeCloseTo(1.10, 5);
    });

    it('caps stored samples per model to prevent unbounded growth', async () => {
        const profile = new InputProfileStore(plugin);
        for (let i = 0; i < 60; i++) {
            await profile.record(sample({ estimatedInputTokens: 100_000, actualInputTokens: 100_000 + i }));
        }
        expect(profile.getSampleCount('anthropic', 'claude-sonnet-4-6')).toBe(50);
    });
});
