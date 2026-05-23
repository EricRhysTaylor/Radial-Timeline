#!/usr/bin/env node
/**
 * smoke-model.mjs — single end-to-end probe for a provider+model pair.
 *
 * Sends ONE real HTTP request including every request parameter RT
 * actually uses against the provider. The provider's response tells the
 * truth: a 200 means the model accepts our full parameter set; a 4xx
 * with a clear error names the parameter that needs to be marked
 * unsupported in modelRequestProfiles.ts.
 *
 * This replaces the "guess from docs, ship, watch users break" pattern
 * that surfaced when Anthropic Opus 4.7 silently deprecated `temperature`
 * for that model. The Anthropic API reference is still the canonical
 * source for which parameters are supposed to be accepted — read it
 * first, update modelRequestProfiles.ts, then run this smoke to verify
 * the docs match reality.
 *
 * Usage:
 *   npm run smoke-model -- --provider anthropic --model claude-opus-4-7
 *   npm run smoke-model -- --provider openai    --model gpt-5.5
 *   npm run smoke-model -- --provider google    --model gemini-3.5-flash
 *
 * API keys are read from env vars:
 *   ANTHROPIC_API_KEY   — for provider anthropic
 *   OPENAI_API_KEY      — for provider openai
 *   GEMINI_API_KEY      — for provider google
 *
 * Exit codes:
 *   0  provider accepted every parameter (smoke passes)
 *   1  provider rejected one or more parameters — read the error,
 *      update the profile, re-run
 *   2  setup error (missing API key, unsupported provider, etc.)
 */
import process from 'process';

const COLOR = {
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    reset: '\x1b[0m',
};

function parseArgs() {
    const args = process.argv.slice(2);
    const get = (flag) => {
        const idx = args.indexOf(flag);
        return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
    };
    const provider = get('--provider');
    const model = get('--model');
    if (!provider || !model) {
        console.error(`Usage: npm run smoke-model -- --provider <anthropic|openai|google> --model <model-id>`);
        process.exit(2);
    }
    return { provider, model };
}

/**
 * Anthropic probe: hits /v1/messages with our standard Inquiry-shaped
 * parameter set including temperature, top_p, and thinking budget.
 * If any parameter is rejected, the JSON error body names it.
 */
async function smokeAnthropic(model, key) {
    const body = {
        model,
        max_tokens: 1024,
        system: 'You are a precise narrative analyst. Return a single JSON object exactly matching the schema.',
        messages: [
            { role: 'user', content: 'Return the JSON object {"ok": true} and nothing else.' }
        ],
        // The full parameter kit RT uses for Inquiry/Gossamer.
        temperature: 0.2,
        top_p: 0.9,
        thinking: { type: 'enabled', budget_tokens: 4096 },
    };
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.text(), sent: body };
}

/**
 * OpenAI probe: hits the Responses API (the preferredOpenAiEndpoint for
 * GPT-5.5+) with reasoning_effort, JSON schema, and our standard system
 * + user prompt shape.
 */
async function smokeOpenAi(model, key) {
    const body = {
        model,
        input: [
            { role: 'system', content: [{ type: 'input_text', text: 'You are a precise narrative analyst.' }] },
            { role: 'user', content: [{ type: 'input_text', text: 'Return the JSON object {"ok": true} and nothing else.' }] },
        ],
        max_output_tokens: 1024,
        reasoning: { effort: 'medium' },
        text: {
            format: {
                type: 'json_schema',
                name: 'smoke_response',
                strict: true,
                schema: {
                    type: 'object',
                    properties: { ok: { type: 'boolean' } },
                    required: ['ok'],
                    additionalProperties: false,
                },
            },
        },
    };
    const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            'authorization': `Bearer ${key}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.text(), sent: body };
}

/**
 * Google Gemini probe: hits generateContent with temperature/topP (which
 * 2.5+ thinking models reject — RT strips these via the family override,
 * so a smoke against a thinking model that sends them is EXPECTED to
 * fail; the failure tells us to verify the profile override is wired).
 */
async function smokeGoogle(model, key) {
    const body = {
        contents: [
            { role: 'user', parts: [{ text: 'Return the JSON object {"ok": true} and nothing else.' }] },
        ],
        systemInstruction: {
            parts: [{ text: 'You are a precise narrative analyst.' }],
        },
        generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.2,
            topP: 0.9,
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'object',
                properties: { ok: { type: 'boolean' } },
                required: ['ok'],
            },
        },
    };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.text(), sent: body };
}

async function main() {
    const { provider, model } = parseArgs();

    const probes = {
        anthropic: { keyVar: 'ANTHROPIC_API_KEY', run: smokeAnthropic },
        openai: { keyVar: 'OPENAI_API_KEY', run: smokeOpenAi },
        google: { keyVar: 'GEMINI_API_KEY', run: smokeGoogle },
    };

    const config = probes[provider];
    if (!config) {
        console.error(`${COLOR.red}Unsupported provider: ${provider}${COLOR.reset}`);
        console.error(`Supported: anthropic, openai, google`);
        process.exit(2);
    }

    const key = process.env[config.keyVar];
    if (!key) {
        console.error(`${COLOR.red}Missing env var ${config.keyVar}${COLOR.reset}`);
        process.exit(2);
    }

    console.log(`${COLOR.dim}Smoke probe: ${COLOR.bold}${provider}/${model}${COLOR.reset}`);
    console.log(`${COLOR.dim}Sending full RT parameter kit...${COLOR.reset}`);

    let result;
    try {
        result = await config.run(model, key);
    } catch (err) {
        console.error(`${COLOR.red}Network or runtime error: ${err.message}${COLOR.reset}`);
        process.exit(1);
    }

    const ok = result.status >= 200 && result.status < 300;

    if (ok) {
        console.log(`${COLOR.green}✓ PASS — ${provider}/${model} accepted every parameter (HTTP ${result.status})${COLOR.reset}`);
        console.log(`${COLOR.dim}Sent parameters: ${Object.keys(result.sent).join(', ')}${COLOR.reset}`);
        process.exit(0);
    }

    console.error(`${COLOR.red}✗ FAIL — ${provider}/${model} rejected the request (HTTP ${result.status})${COLOR.reset}\n`);

    // Try to parse the error body for a readable message.
    let parsedMessage = result.body;
    try {
        const parsed = JSON.parse(result.body);
        if (parsed?.error?.message) parsedMessage = parsed.error.message;
        else if (parsed?.error) parsedMessage = JSON.stringify(parsed.error, null, 2);
        else parsedMessage = JSON.stringify(parsed, null, 2);
    } catch {
        // raw text body — already assigned
    }

    console.error(`${COLOR.bold}Provider response:${COLOR.reset}`);
    console.error(parsedMessage);
    console.error('');
    console.error(`${COLOR.yellow}Next step:${COLOR.reset} read the error above. It names the offending parameter.`);
    console.error(`Update src/ai/registry/modelRequestProfiles.ts to mark that parameter unsupported for ${model},`);
    console.error(`then re-run: npm run smoke-model -- --provider ${provider} --model ${model}`);
    process.exit(1);
}

main().catch(err => {
    console.error(`${COLOR.red}smoke-model crashed: ${err.message}${COLOR.reset}`);
    process.exit(2);
});
