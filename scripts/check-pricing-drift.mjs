#!/usr/bin/env node
/**
 * Pricing drift engine for scripts/models/pricing.json.
 *
 * Two independent layers:
 *   1. Cross-check (free, deterministic, always runs): reconciles pricing.json
 *      against the curated registry + provider snapshot — flags curated models
 *      with no price, price entries for models that left the registry, and
 *      promos that are expired/expiring.
 *   2. Claude price lookup (optional, needs ANTHROPIC_API_KEY): asks Claude with
 *      the web_search tool for each model's current published price, diffs it
 *      against pricing.json, and (in --apply mode) writes verified changes and
 *      re-stamps generatedAt.
 *
 * Usage:
 *   node scripts/check-pricing-drift.mjs            # report only (no writes)
 *   node scripts/check-pricing-drift.mjs --check    # report only, exit 1 if actionable
 *   node scripts/check-pricing-drift.mjs --apply     # verify + write pricing.json
 *   node scripts/check-pricing-drift.mjs --no-llm    # skip Claude, cross-check only
 *   node scripts/check-pricing-drift.mjs --json      # print the report as JSON
 */
import fs from 'fs/promises';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const PRICING_FILE = path.resolve('scripts/models/pricing.json');
const REGISTRY_FILE = path.resolve('scripts/models/registry.json');
const SNAPSHOT_FILE = path.resolve('scripts/models/latest-models.json');

const STALE_DAYS = 30;
const PROMO_EXPIRY_WARN_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

// Apply-time guards: a verified price must clear all of these before it is written.
const MIN_PRICE = 0;            // strictly greater-than
const MAX_PRICE = 10000;        // per 1M tokens — anything above is implausible
const MIN_DELTA = 0.0001;       // ignore floating-point noise
const LARGE_SWING_RATIO = 0.5;  // >50% change is flagged (still applied in --apply)

// Only these providers carry a per-token price in pricing.json. Local (ollama)
// and placeholder (none) registry entries are intentionally unpriced.
const PRICED_PROVIDERS = new Set(['openai', 'anthropic', 'google']);

const KEY = entry => `${entry.provider}::${entry.modelId}`;

async function readJson(filePath) {
    try {
        return JSON.parse(await fs.readFile(filePath, 'utf8'));
    } catch {
        return null;
    }
}

function isFiniteNonNeg(value) {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function round4(value) {
    return Math.round(value * 10000) / 10000;
}

/* ---------------------------------------------------------------- cross-check */

function buildCrossCheck(pricing, registry, snapshot, nowMs) {
    const priceEntries = Array.isArray(pricing?.models) ? pricing.models : [];
    const priceKeys = new Set(priceEntries.map(KEY));

    const curatedModels = Array.isArray(registry?.models) ? registry.models : [];
    const curatedKeys = new Map(
        curatedModels
            .filter(m => m && typeof m.id === 'string' && PRICED_PROVIDERS.has(m.provider))
            .map(m => [`${m.provider}::${m.id}`, m]),
    );

    const snapshotKeys = new Set(
        (Array.isArray(snapshot?.models) ? snapshot.models : [])
            .filter(m => m && typeof m.id === 'string' && typeof m.provider === 'string')
            .map(m => `${m.provider}::${m.id}`),
    );

    // Curated models with no price entry — these need pricing added.
    const missingPrices = [];
    for (const [key, model] of curatedKeys) {
        if (!priceKeys.has(key)) {
            missingPrices.push({ provider: model.provider, modelId: model.id, label: model.label || model.id });
        }
    }

    // Price entries whose model is neither curated nor in the live snapshot.
    // (Dated snapshot variants like `-2026-04-23` are expected to be absent from
    // the registry, so only flag when missing from BOTH registry and snapshot.)
    const orphanPrices = [];
    for (const entry of priceEntries) {
        const key = KEY(entry);
        if (!curatedKeys.has(key) && !snapshotKeys.has(entry.modelId)
            && !snapshotKeys.has(`${entry.provider}::${entry.modelId}`)) {
            orphanPrices.push({ provider: entry.provider, modelId: entry.modelId });
        }
    }

    // Promo expiry.
    const promoIssues = [];
    for (const entry of priceEntries) {
        const promo = entry.promo;
        if (!promo || promo.expiresAt === undefined) continue;
        const ts = Date.parse(promo.expiresAt);
        if (!Number.isFinite(ts)) continue;
        const daysLeft = (ts - nowMs) / DAY_MS;
        if (daysLeft < 0) {
            promoIssues.push({ provider: entry.provider, modelId: entry.modelId, label: promo.label, state: 'expired', expiresAt: promo.expiresAt });
        } else if (daysLeft <= PROMO_EXPIRY_WARN_DAYS) {
            promoIssues.push({ provider: entry.provider, modelId: entry.modelId, label: promo.label, state: 'expiring', expiresAt: promo.expiresAt, daysLeft: Math.ceil(daysLeft) });
        }
    }

    return { missingPrices, orphanPrices, promoIssues };
}

/* --------------------------------------------------------------- Claude lookup */

function buildLookupPrompt(entries) {
    const list = entries
        .map(e => `- provider="${e.provider}" modelId="${e.modelId}"`)
        .join('\n');
    return `You are auditing an AI-model pricing table. Use the web_search tool to find the CURRENT official published API price for each model below, from the provider's own pricing/docs page (anthropic.com / platform.claude.com, openai.com / platform.openai.com, ai.google.dev / cloud.google.com). Prefer the provider's own page over aggregators.

For each model report standard-tier (not batch, not long-context) prices per 1 million tokens:
- inputPer1M (number)
- outputPer1M (number)
- cacheReadPer1M (number, or null if the provider does not publish a cache-read price)
- source (the exact URL you took the numbers from)
- confidence ("high" only if a provider-owned page clearly states the number; otherwise "medium" or "low")

Models:
${list}

Respond with ONLY a single fenced \`\`\`json code block containing an array of objects with keys: provider, modelId, inputPer1M, outputPer1M, cacheReadPer1M, source, confidence. No prose outside the code block.`;
}

function extractJsonArray(text) {
    if (typeof text !== 'string') return null;
    const fenced = text.match(/```json\s*([\s\S]*?)```/i) || text.match(/```\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : text;
    const start = candidate.indexOf('[');
    const end = candidate.lastIndexOf(']');
    if (start === -1 || end === -1 || end < start) return null;
    try {
        const parsed = JSON.parse(candidate.slice(start, end + 1));
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

async function callClaude({ apiKey, model, prompt, fetchImpl, maxContinuations = 3 }) {
    const doFetch = fetchImpl || globalThis.fetch;
    if (typeof doFetch !== 'function') throw new Error('fetch is not available in this runtime');

    const messages = [{ role: 'user', content: prompt }];
    let lastText = '';

    for (let i = 0; i <= maxContinuations; i++) {
        const res = await doFetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json',
            },
            body: JSON.stringify({
                model,
                max_tokens: 8000,
                tools: [{ type: 'web_search_20260209', name: 'web_search' }],
                messages,
            }),
        });

        if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 300)}`);
        }

        const data = await res.json();
        const blocks = Array.isArray(data.content) ? data.content : [];
        lastText = blocks.filter(b => b.type === 'text').map(b => b.text).join('\n');

        if (data.stop_reason === 'pause_turn') {
            // Server-side tool loop paused; re-send assistant turn to resume.
            messages.push({ role: 'assistant', content: data.content });
            continue;
        }
        return lastText;
    }
    return lastText;
}

function diffPrices(pricing, lookups) {
    const byKey = new Map((Array.isArray(pricing?.models) ? pricing.models : []).map(e => [KEY(e), e]));
    const drifts = [];

    for (const row of lookups) {
        if (!row || typeof row !== 'object') continue;
        const key = `${row.provider}::${row.modelId}`;
        const entry = byKey.get(key);
        if (!entry) continue;

        const fields = [
            ['inputPer1M', row.inputPer1M],
            ['outputPer1M', row.outputPer1M],
            ['cacheReadPer1M', row.cacheReadPer1M],
        ];
        for (const [field, rawNext] of fields) {
            if (rawNext === null || rawNext === undefined) continue;
            const next = Number(rawNext);
            const current = entry[field];
            if (!isFiniteNonNeg(next) || next <= MIN_PRICE || next > MAX_PRICE) continue;
            if (!isFiniteNonNeg(current)) continue; // don't invent fields that don't exist
            if (Math.abs(next - current) < MIN_DELTA) continue;

            const ratio = current > 0 ? Math.abs(next - current) / current : Infinity;
            drifts.push({
                provider: row.provider,
                modelId: row.modelId,
                field,
                from: current,
                to: round4(next),
                confidence: typeof row.confidence === 'string' ? row.confidence : 'low',
                source: typeof row.source === 'string' ? row.source : null,
                largeSwing: ratio > LARGE_SWING_RATIO,
            });
        }
    }
    return drifts;
}

// A drift is safe to auto-apply only if Claude was confident and cited a source.
function isApplicable(drift) {
    return drift.confidence === 'high'
        && typeof drift.source === 'string'
        && /^https?:\/\//i.test(drift.source);
}

function applyDrifts(pricing, drifts) {
    const byKey = new Map(pricing.models.map(e => [KEY(e), e]));
    const applied = [];

    for (const drift of drifts) {
        if (!isApplicable(drift)) continue;
        const entry = byKey.get(`${drift.provider}::${drift.modelId}`);
        if (!entry) continue;
        entry[drift.field] = drift.to;
        applied.push(drift);

        // Anthropic publishes cache-write as fixed multiples of input price; keep
        // the derived fields coherent whenever input changes (matches the schema
        // the validator expects).
        if (drift.provider === 'anthropic' && drift.field === 'inputPer1M') {
            if (isFiniteNonNeg(entry.cacheWrite5mPer1M)) entry.cacheWrite5mPer1M = round4(drift.to * 1.25);
            if (isFiniteNonNeg(entry.cacheWrite1hPer1M)) entry.cacheWrite1hPer1M = round4(drift.to * 2);
        }
    }
    return applied;
}

/* ------------------------------------------------------------------- runner */

export async function runPricingDriftCheck(options = {}) {
    const {
        pricingFile = PRICING_FILE,
        registryFile = REGISTRY_FILE,
        snapshotFile = SNAPSHOT_FILE,
        apply = false,
        useLlm = true,
        anthropicApiKey = process.env.ANTHROPIC_API_KEY,
        model = process.env.PRICING_WATCH_MODEL || 'claude-sonnet-4-6',
        staleDays = STALE_DAYS,
        reStampMargin = 5, // refresh the freshness stamp this many days before it lapses
        now = () => Date.now(),
        fetchImpl,
        log = () => {},
        warn = console.warn,
    } = options;

    const nowMs = now();
    const pricing = await readJson(pricingFile);
    if (!pricing || !Array.isArray(pricing.models)) {
        throw new Error(`Cannot read pricing models from ${pricingFile}`);
    }
    const registry = await readJson(registryFile);
    const snapshot = await readJson(snapshotFile);

    const generatedAtMs = Date.parse(pricing.generatedAt);
    const ageDays = Number.isFinite(generatedAtMs) ? Math.floor((nowMs - generatedAtMs) / DAY_MS) : null;
    const stale = ageDays === null || ageDays > staleDays;

    const crossCheck = buildCrossCheck(pricing, registry, snapshot, nowMs);

    const result = {
        checkedAt: new Date(nowMs).toISOString(),
        ageDays,
        staleDays,
        stale,
        crossCheck,
        llmRan: false,
        llmError: null,
        priceDrifts: [],
        applied: [],
        reStamped: false,
        wrote: false,
    };

    if (useLlm && anthropicApiKey) {
        try {
            const prompt = buildLookupPrompt(pricing.models.map(e => ({ provider: e.provider, modelId: e.modelId })));
            const text = await callClaude({ apiKey: anthropicApiKey, model, prompt, fetchImpl });
            const lookups = extractJsonArray(text);
            if (!lookups) throw new Error('Could not parse a JSON array from the model response');
            result.llmRan = true;
            result.priceDrifts = diffPrices(pricing, lookups);
        } catch (error) {
            result.llmError = error instanceof Error ? error.message : String(error);
            warn(`[check-pricing-drift] price lookup failed: ${result.llmError}`);
        }
    } else if (useLlm && !anthropicApiKey) {
        result.llmError = 'ANTHROPIC_API_KEY not set; skipped price lookup';
    }

    if (apply) {
        const applied = result.llmRan ? applyDrifts(pricing, result.priceDrifts) : [];
        result.applied = applied;
        // Re-stamp only when the LLM actually verified prices this run — the
        // timestamp asserts "verified fresh as of now", so don't rubber-stamp it
        // when verification was skipped or failed. To avoid a churn commit every
        // night, only re-stamp when a value changed or the freshness clock is
        // about to lapse; an unchanged, still-fresh table needs no rewrite.
        if (result.llmRan) {
            const clockLapsing = ageDays === null || ageDays >= staleDays - reStampMargin;
            if (applied.length > 0 || clockLapsing) {
                pricing.generatedAt = new Date(nowMs).toISOString();
                result.reStamped = true;
            }
        }
        if (applied.length > 0 || result.reStamped) {
            await fs.writeFile(pricingFile, `${JSON.stringify(pricing, null, 2)}\n`, 'utf8');
            result.wrote = true;
        }
    }

    // Actionable = something a human/agent should look at.
    result.actionable = crossCheck.missingPrices.length > 0
        || crossCheck.orphanPrices.length > 0
        || crossCheck.promoIssues.length > 0
        || result.priceDrifts.length > 0
        || (stale && !result.reStamped)
        || Boolean(result.llmError && useLlm);

    return result;
}

/* ---------------------------------------------------------------------- CLI */

async function main() {
    const argv = process.argv.slice(2);
    const apply = argv.includes('--apply');
    const checkOnly = argv.includes('--check');
    const useLlm = !argv.includes('--no-llm');
    const asJson = argv.includes('--json');

    const result = await runPricingDriftCheck({ apply, useLlm, log: console.log });

    if (asJson) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        const c = result.crossCheck;
        console.log(`[check-pricing-drift] age ${result.ageDays}d / ${result.staleDays}d${result.stale ? ' (STALE)' : ''}`);
        if (c.missingPrices.length) console.log(`  ⚠ ${c.missingPrices.length} curated model(s) with no price: ${c.missingPrices.map(m => m.modelId).join(', ')}`);
        if (c.orphanPrices.length) console.log(`  ⚠ ${c.orphanPrices.length} price entr(y/ies) for unknown model(s): ${c.orphanPrices.map(m => m.modelId).join(', ')}`);
        if (c.promoIssues.length) console.log(`  ⚠ ${c.promoIssues.length} promo issue(s): ${c.promoIssues.map(p => `${p.modelId} ${p.state}`).join(', ')}`);
        if (result.llmRan) {
            console.log(`  price drifts detected: ${result.priceDrifts.length}${result.applied.length ? `, applied: ${result.applied.length}` : ''}`);
            for (const d of result.priceDrifts) console.log(`    ${d.modelId}.${d.field}: ${d.from} → ${d.to} (${d.confidence}${d.largeSwing ? ', LARGE' : ''})`);
        } else if (result.llmError) {
            console.log(`  price lookup: ${result.llmError}`);
        }
        if (result.wrote) console.log(`  wrote pricing.json${result.reStamped ? ' (re-stamped generatedAt)' : ''}`);
        if (!result.actionable) console.log('  ✓ no action needed');
    }

    if (checkOnly && result.actionable) process.exitCode = 1;
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && currentFilePath === invokedPath) {
    main().catch(error => {
        console.error(`[check-pricing-drift] Failed: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
    });
}
