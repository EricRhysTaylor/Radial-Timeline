#!/usr/bin/env node
/**
 * Fetches the latest model metadata from Anthropic, OpenAI, and Gemini
 * and writes a JSON file that can be used to refresh src/data/aiModels.ts.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... OPENAI_API_KEY=... GEMINI_API_KEY=... npm run update-models
 */
import fs from 'fs/promises';
import path from 'path';
import process from 'process';

const OUTPUT_PATH = path.resolve('scripts/models/latest-models.json');

async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    if (!response.ok) {
        const text = await response.text();
        throw new Error(`${url} failed (${response.status}): ${text}`);
    }
    return response.json();
}

async function fetchOpenAiModels(apiKey) {
    if (!apiKey) {
        console.warn('[update-models] OPENAI_API_KEY missing – skipping OpenAI fetch.');
        return [];
    }
    const data = await fetchJson('https://api.openai.com/v1/models', {
        headers: {
            Authorization: `Bearer ${apiKey}`,
        },
    });
    return (data.data ?? []).map(model => ({
        id: model.id,
        owned_by: model.owned_by,
        created: model.created,
    }));
}

async function fetchAnthropicModels(apiKey) {
    if (!apiKey) {
        console.warn('[update-models] ANTHROPIC_API_KEY missing – skipping Anthropic fetch.');
        return [];
    }
    const data = await fetchJson('https://api.anthropic.com/v1/models', {
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
    });
    return (data.data ?? []).map(model => ({
        id: model.id,
        display_name: model.display_name,
        updated_at: model.updated_at,
        type: model.type,
    }));
}

async function fetchGeminiModels(apiKey) {
    if (!apiKey) {
        console.warn('[update-models] GEMINI_API_KEY missing – skipping Gemini fetch.');
        return [];
    }
    const data = await fetchJson(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    return (data.models ?? []).map(model => ({
        name: model.name,
        displayName: model.displayName,
        description: model.description,
        inputTokenLimit: model.inputTokenLimit,
        outputTokenLimit: model.outputTokenLimit,
    }));
}

async function main() {
    const [anthropic, openai, gemini] = await Promise.all([
        fetchAnthropicModels(process.env.ANTHROPIC_API_KEY),
        fetchOpenAiModels(process.env.OPENAI_API_KEY),
        fetchGeminiModels(process.env.GEMINI_API_KEY),
    ]);

    const payload = {
        generatedAt: new Date().toISOString(),
        summary: {
            anthropic: anthropic.length,
            openai: openai.length,
            gemini: gemini.length,
        },
        anthropic,
        openai,
        gemini,
    };

    await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
    await fs.writeFile(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`[update-models] Wrote ${OUTPUT_PATH}`);
    console.log(
        'Review this file and then copy any preferred models into src/data/aiModels.ts (or your curated JSON).'
    );
}

main().catch(error => {
    console.error('[update-models] Failed:', error);
    process.exitCode = 1;
});
