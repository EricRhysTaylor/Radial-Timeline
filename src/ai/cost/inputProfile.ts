/*
 * Radial Timeline (tm) Plugin for Obsidian
 * Copyright (c) 2025 Eric Rhys Taylor
 * Licensed under a Source-Available, Non-Commercial License. See LICENSE file for details.
 */

/**
 * InputProfileStore — empirical bias correction for input token estimates.
 *
 * After every successful run we have two numbers:
 *   - estimatedInputTokens: what our tokenizer predicted before sending
 *   - actualInputTokens:    what the provider's usage report billed
 *
 * The ratio (actual / estimated) is the per-model bias of our estimator. If
 * a tokenizer consistently undercounts by 8% (e.g. tiktoken for OpenAI which
 * doesn't model the chat-completion envelope), the rolling median of the
 * ratio will sit near 1.08 and the next estimate gets multiplied through.
 *
 * Mirrors OutputProfileStore so the persistence/loading pattern is identical.
 *
 * Robustness rules:
 *   - Use the median (not mean) — one anomaly cannot poison the correction.
 *   - Require at least MIN_SAMPLES before applying any correction at all.
 *   - Clamp the multiplier to [MIN_MULTIPLIER, MAX_MULTIPLIER] so a buggy
 *     run cannot drive the estimate to absurd values.
 *   - Drop samples where either side is non-finite, zero, or negative.
 */

import type { Plugin } from 'obsidian';
import { normalizePath } from 'obsidian';
import type { AIProviderId, InputTokenEstimateMethod } from '../types';

export interface InputSample {
    provider: AIProviderId;
    modelId: string;
    estimatedInputTokens: number;
    actualInputTokens: number;
    /** Which tokenizer produced the estimate (for diagnostics). */
    method: InputTokenEstimateMethod;
    timestamp: number;
}

interface SerializedProfile {
    version: 1;
    samples: InputSample[];
}

const PROFILE_VERSION = 1;
const PROFILE_FILE_NAME = 'input-profile.json';
const MAX_SAMPLES_PER_MODEL = 50;
const MIN_SAMPLES_FOR_CORRECTION = 5;
const MIN_MULTIPLIER = 0.85;
const MAX_MULTIPLIER = 1.25;

function isValidSample(value: unknown): value is InputSample {
    if (!value || typeof value !== 'object') return false;
    const s = value as Partial<InputSample>;
    return typeof s.provider === 'string'
        && typeof s.modelId === 'string'
        && typeof s.estimatedInputTokens === 'number' && Number.isFinite(s.estimatedInputTokens) && s.estimatedInputTokens > 0
        && typeof s.actualInputTokens === 'number' && Number.isFinite(s.actualInputTokens) && s.actualInputTokens > 0
        && typeof s.method === 'string'
        && typeof s.timestamp === 'number' && Number.isFinite(s.timestamp);
}

function median(sortedValues: number[]): number {
    const n = sortedValues.length;
    if (n === 0) return NaN;
    if (n % 2 === 1) return sortedValues[(n - 1) / 2];
    return (sortedValues[n / 2 - 1] + sortedValues[n / 2]) / 2;
}

function clamp(value: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, value));
}

export class InputProfileStore {
    private samples: InputSample[] = [];
    private loaded = false;
    private loadPromise: Promise<void> | null = null;
    private writePending = false;

    constructor(private readonly plugin: Plugin) {}

    async ensureLoaded(): Promise<void> {
        if (this.loaded) return;
        if (!this.loadPromise) this.loadPromise = this.load();
        await this.loadPromise;
    }

    private async load(): Promise<void> {
        const path = this.getFilePath();
        const adapter = this.plugin.app.vault.adapter;
        try {
            if (await adapter.exists(path)) {
                const raw = await adapter.read(path);
                const parsed = JSON.parse(raw) as SerializedProfile;
                if (parsed?.version === PROFILE_VERSION && Array.isArray(parsed.samples)) {
                    this.samples = parsed.samples.filter(isValidSample);
                }
            }
        } catch {
            this.samples = [];
        }
        this.loaded = true;
    }

    async record(sample: InputSample): Promise<void> {
        await this.ensureLoaded();
        if (!isValidSample(sample)) return;
        this.samples.push(sample);
        this.samples = trimPerModel(this.samples, MAX_SAMPLES_PER_MODEL);
        await this.save();
    }

    /**
     * Return the rolling-median bias multiplier (actual / estimated) for the
     * given model, clamped to [MIN_MULTIPLIER, MAX_MULTIPLIER]. Returns 1.0
     * (identity, no correction) when fewer than MIN_SAMPLES_FOR_CORRECTION
     * samples exist or when the result would be NaN.
     *
     * Multiply a fresh estimate by this to get the bias-corrected value.
     */
    getBiasMultiplier(provider: AIProviderId, modelId: string): number {
        if (!this.loaded) return 1;
        const matching = this.samples.filter(s => s.provider === provider && s.modelId === modelId);
        if (matching.length < MIN_SAMPLES_FOR_CORRECTION) return 1;
        const ratios = matching
            .map(s => s.actualInputTokens / s.estimatedInputTokens)
            .filter(r => Number.isFinite(r) && r > 0)
            .sort((a, b) => a - b);
        if (ratios.length === 0) return 1;
        const m = median(ratios);
        if (!Number.isFinite(m) || m <= 0) return 1;
        return clamp(m, MIN_MULTIPLIER, MAX_MULTIPLIER);
    }

    getSampleCount(provider: AIProviderId, modelId: string): number {
        if (!this.loaded) return 0;
        return this.samples.filter(s => s.provider === provider && s.modelId === modelId).length;
    }

    private getFilePath(): string {
        const configDir = (this.plugin.app.vault as unknown as { configDir?: string }).configDir ?? '.obsidian';
        const pluginId = this.plugin.manifest.id;
        return normalizePath(`${configDir}/plugins/${pluginId}/${PROFILE_FILE_NAME}`);
    }

    private async save(): Promise<void> {
        if (this.writePending) return;
        this.writePending = true;
        try {
            const payload: SerializedProfile = {
                version: PROFILE_VERSION,
                samples: this.samples
            };
            await this.plugin.app.vault.adapter.write(
                this.getFilePath(),
                JSON.stringify(payload)
            );
        } catch {
            // non-fatal — profile will retry on next record
        } finally {
            this.writePending = false;
        }
    }
}

function trimPerModel(samples: InputSample[], limit: number): InputSample[] {
    const kept: InputSample[] = [];
    const counts = new Map<string, number>();
    for (let i = samples.length - 1; i >= 0; i--) {
        const s = samples[i];
        const key = `${s.provider}::${s.modelId}`;
        const count = counts.get(key) ?? 0;
        if (count < limit) {
            kept.unshift(s);
            counts.set(key, count + 1);
        }
    }
    return kept;
}
