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
        return null;
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
        return null;
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
        created_at: model.created_at,
        type: model.type,
    }));
}

async function fetchGeminiModels(apiKey) {
    if (!apiKey) {
        console.warn('[update-models] GEMINI_API_KEY missing – skipping Gemini fetch.');
        return null;
    }
    const data = await fetchJson(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`
    );
    return (data.models ?? []).map(model => ({
        id: model.name.startsWith('models/') ? model.name.slice(7) : model.name,
        name: model.name,
        displayName: model.displayName,
        description: model.description,
        inputTokenLimit: model.inputTokenLimit,
        outputTokenLimit: model.outputTokenLimit,
    }));
}

async function main() {
    let existingData = {};
    try {
        const fileContent = await fs.readFile(OUTPUT_PATH, 'utf8');
        existingData = JSON.parse(fileContent);
    } catch (err) {
        // Ignore if file doesn't exist or is invalid
    }

    const [anthropic, openai, gemini] = await Promise.all([
        fetchAnthropicModels(process.env.ANTHROPIC_API_KEY),
        fetchOpenAiModels(process.env.OPENAI_API_KEY),
        fetchGeminiModels(process.env.GEMINI_API_KEY),
    ]);

    // Use fetched data if available, otherwise fall back to existing data
    const finalAnthropic = anthropic !== null ? anthropic : (existingData.anthropic || []);
    const finalOpenai = openai !== null ? openai : (existingData.openai || []);
    const finalGemini = gemini !== null ? gemini : (existingData.gemini || []);

    // Sort models latest to oldest
    const sortedAnthropic = finalAnthropic.sort((a, b) => {
        const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return dateB - dateA; // Descending
    });

    const sortedOpenai = finalOpenai.sort((a, b) => {
        return (b.created || 0) - (a.created || 0); // Descending
    });

    // Gemini doesn't expose a created date in this endpoint, so we can't reliably sort by date.
    // We'll rely on the API's order or keep it as is.
    
    const payload = {
        generatedAt: new Date().toISOString(),
        summary: {
            anthropic: sortedAnthropic.length,
            openai: sortedOpenai.length,
            gemini: finalGemini.length,
        },
        anthropic: sortedAnthropic,
        openai: sortedOpenai,
        gemini: finalGemini,
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
