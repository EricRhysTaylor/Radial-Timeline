#!/usr/bin/env tsx
/**
 * smoke-model.ts — single end-to-end probe for a provider+model pair.
 *
 * Sends ONE real HTTP request matching what RT's production sanitizer
 * would actually send for this model: parameters that the model's
 * registry profile says are supported are included; parameters marked
 * unsupported are omitted. A 200 means the profile matches reality.
 * A 4xx names a parameter our profile says is OK but the provider
 * rejects — update the profile and re-run.
 *
 * This replaces the "transcribe from the previous model, ship, watch
 * users break" pattern that surfaced when Anthropic Opus 4.7 silently
 * deprecated `temperature`. The provider's response is ground truth.
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
 *   0  provider accepted the profile-driven request (PASS)
 *   1  provider rejected the request — read the error, update the
 *      profile, re-run
 *   2  setup error (missing API key, unsupported provider, etc.)
 */
import process from 'process';
import { getModelRequestProfile } from '../src/ai/registry/modelRequestProfiles';

type Provider = 'anthropic' | 'openai' | 'google';

const COLOR = {
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    green: '\x1b[32m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    reset: '\x1b[0m',
};

function parseArgs(): { provider: Provider; model: string } {
    const args = process.argv.slice(2);
    const get = (flag: string): string | null => {
        const idx = args.indexOf(flag);
        return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
    };
    const provider = get('--provider');
    const model = get('--model');
    if (!provider || !model) {
        console.error(`Usage: npm run smoke-model -- --provider <anthropic|openai|google> --model <model-id>`);
        process.exit(2);
    }
    if (provider !== 'anthropic' && provider !== 'openai' && provider !== 'google') {
        console.error(`${COLOR.red}Unsupported provider: ${provider}${COLOR.reset}`);
        console.error(`Supported: anthropic, openai, google`);
        process.exit(2);
    }
    return { provider, model };
}

interface ProbeResult {
    status: number;
    body: string;
    sentParams: string[];
    omittedParams: string[];
}

/**
 * Anthropic probe: /v1/messages.
 * Includes temperature/top_p only if the profile allows; includes
 * thinking budget only if the profile supports it.
 */
async function smokeAnthropic(model: string, key: string): Promise<ProbeResult> {
    const profile = getModelRequestProfile('anthropic', model);
    const sentParams: string[] = ['model', 'max_tokens', 'system', 'messages'];
    const omittedParams: string[] = [];

    const body: Record<string, unknown> = {
        model,
        max_tokens: 1024,
        system: 'You are a precise narrative analyst. Return a single JSON object exactly matching the schema.',
        messages: [
            { role: 'user', content: 'Return the JSON object {"ok": true} and nothing else.' },
        ],
    };

    if (profile.supportsTemperature) {
        body.temperature = 0.2;
        sentParams.push('temperature');
    } else {
        omittedParams.push('temperature');
    }
    if (profile.supportsTopP) {
        body.top_p = 0.9;
        sentParams.push('top_p');
    } else {
        omittedParams.push('top_p');
    }
    if (profile.supportsThinkingBudget) {
        body.thinking = { type: 'enabled', budget_tokens: 4096 };
        sentParams.push('thinking.budget_tokens');
    } else {
        omittedParams.push('thinking.budget_tokens');
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': key,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.text(), sentParams, omittedParams };
}

/**
 * OpenAI probe: /v1/responses (the preferred endpoint for GPT-5.5+).
 * Sends reasoning_effort only when the profile supports it.
 */
async function smokeOpenAi(model: string, key: string): Promise<ProbeResult> {
    const profile = getModelRequestProfile('openai', model);
    const sentParams: string[] = ['model', 'input', 'max_output_tokens', 'text.format'];
    const omittedParams: string[] = [];

    const body: Record<string, unknown> = {
        model,
        input: [
            { role: 'system', content: [{ type: 'input_text', text: 'You are a precise narrative analyst.' }] },
            { role: 'user', content: [{ type: 'input_text', text: 'Return the JSON object {"ok": true} and nothing else.' }] },
        ],
        max_output_tokens: 1024,
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

    if (profile.supportsTemperature) {
        body.temperature = 0.2;
        sentParams.push('temperature');
    } else {
        omittedParams.push('temperature');
    }
    if (profile.supportsTopP) {
        body.top_p = 0.9;
        sentParams.push('top_p');
    } else {
        omittedParams.push('top_p');
    }
    if (profile.supportsReasoningEffort) {
        body.reasoning = { effort: 'medium' };
        sentParams.push('reasoning.effort');
    } else {
        omittedParams.push('reasoning.effort');
    }

    const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
            'authorization': `Bearer ${key}`,
            'content-type': 'application/json',
        },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.text(), sentParams, omittedParams };
}

/**
 * Google Gemini probe: /v1beta/models/{id}:generateContent.
 * For 2.5+/3.x managed-sampling models the family override marks
 * temperature/topP unsupported; this script honors that.
 */
async function smokeGoogle(model: string, key: string): Promise<ProbeResult> {
    const profile = getModelRequestProfile('google', model);
    const sentParams: string[] = ['contents', 'systemInstruction', 'generationConfig.maxOutputTokens', 'generationConfig.responseSchema'];
    const omittedParams: string[] = [];

    const generationConfig: Record<string, unknown> = {
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
        responseSchema: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok'],
        },
    };

    if (profile.supportsTemperature) {
        generationConfig.temperature = 0.2;
        sentParams.push('generationConfig.temperature');
    } else {
        omittedParams.push('generationConfig.temperature');
    }
    if (profile.supportsTopP) {
        generationConfig.topP = 0.9;
        sentParams.push('generationConfig.topP');
    } else {
        omittedParams.push('generationConfig.topP');
    }

    const body = {
        contents: [
            { role: 'user', parts: [{ text: 'Return the JSON object {"ok": true} and nothing else.' }] },
        ],
        systemInstruction: {
            parts: [{ text: 'You are a precise narrative analyst.' }],
        },
        generationConfig,
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.text(), sentParams, omittedParams };
}

async function main(): Promise<void> {
    const { provider, model } = parseArgs();

    const config = {
        anthropic: { keyVar: 'ANTHROPIC_API_KEY', run: smokeAnthropic },
        openai: { keyVar: 'OPENAI_API_KEY', run: smokeOpenAi },
        google: { keyVar: 'GEMINI_API_KEY', run: smokeGoogle },
    }[provider];

    const key = process.env[config.keyVar];
    if (!key) {
        console.error(`${COLOR.red}Missing env var ${config.keyVar}${COLOR.reset}`);
        console.error(`Set it inline:  ${config.keyVar}='sk-...' npm run smoke-model -- --provider ${provider} --model ${model}`);
        process.exit(2);
    }

    console.log(`${COLOR.dim}Smoke probe: ${COLOR.bold}${provider}/${model}${COLOR.reset}`);
    console.log(`${COLOR.dim}Reading registry profile and building profile-driven request...${COLOR.reset}`);

    let result: ProbeResult;
    try {
        result = await config.run(model, key);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`${COLOR.red}Network or runtime error: ${message}${COLOR.reset}`);
        process.exit(1);
    }

    console.log(`${COLOR.dim}Sent parameters:    ${result.sentParams.join(', ')}${COLOR.reset}`);
    if (result.omittedParams.length > 0) {
        console.log(`${COLOR.dim}Omitted (per profile): ${result.omittedParams.join(', ')}${COLOR.reset}`);
    }
    console.log('');

    const ok = result.status >= 200 && result.status < 300;

    if (ok) {
        console.log(`${COLOR.green}${COLOR.bold}✓ PASS${COLOR.reset} ${COLOR.green}— ${provider}/${model} accepted the profile-driven request (HTTP ${result.status})${COLOR.reset}`);
        console.log(`${COLOR.dim}Profile matches provider reality. Safe to ship.${COLOR.reset}`);
        process.exit(0);
    }

    console.error(`${COLOR.red}${COLOR.bold}✗ FAIL${COLOR.reset} ${COLOR.red}— ${provider}/${model} rejected the request (HTTP ${result.status})${COLOR.reset}\n`);

    let parsedMessage: string = result.body;
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
    console.error(`${COLOR.yellow}Next step:${COLOR.reset} the error names the offending parameter.`);
    console.error(`Update src/ai/registry/modelRequestProfiles.ts to mark that parameter unsupported for ${model},`);
    console.error(`then re-run: npm run smoke-model -- --provider ${provider} --model ${model}`);
    process.exit(1);
}

main().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${COLOR.red}smoke-model crashed: ${message}${COLOR.reset}`);
    process.exit(2);
});
