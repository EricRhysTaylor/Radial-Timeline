#!/usr/bin/env node
/**
 * Checks if it has been more than 24 hours since the last model update check.
 * If so, runs the update script and alerts if new models are found.
 * Also tracks what "latest" model aliases currently resolve to.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import process from 'process';

const MODELS_FILE = path.resolve('scripts/models/latest-models.json');
const LATEST_TRACKING_FILE = path.resolve('scripts/models/latest-aliases.json');
const UPDATE_SCRIPT = 'node scripts/update-ai-models.mjs'; 
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ANSI colors
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// "Latest" aliases we use in Radial Timeline
const TRACKED_LATEST_ALIASES = {
    openai: ['gpt-5.2-chat-latest', 'gpt-5.1-chat-latest', 'gpt-5-chat-latest'],
    gemini: ['gemini-pro-latest', 'gemini-flash-latest'],
    // Anthropic doesn't have "latest" aliases exposed in the API yet
};

function loadModels() {
    if (!fs.existsSync(MODELS_FILE)) return null;
    try {
        return JSON.parse(fs.readFileSync(MODELS_FILE, 'utf8'));
    } catch (e) {
        return null;
    }
}

function getModelIds(data) {
    const ids = new Set();
    if (data.anthropic) data.anthropic.forEach(m => ids.add(`Anthropic: ${m.id} (${m.display_name || m.id})`));
    if (data.openai) data.openai.forEach(m => ids.add(`OpenAI: ${m.id}`));
    if (data.gemini) data.gemini.forEach(m => ids.add(`Gemini: ${m.id} (${m.displayName || m.name})`));
    return ids;
}

function loadLatestTracking() {
    if (!fs.existsSync(LATEST_TRACKING_FILE)) return null;
    try {
        return JSON.parse(fs.readFileSync(LATEST_TRACKING_FILE, 'utf8'));
    } catch (e) {
        return null;
    }
}

function saveLatestTracking(data) {
    fs.writeFileSync(LATEST_TRACKING_FILE, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * Extracts token limits for key models from the API data
 */
function extractTokenLimits(modelData) {
    const limits = {};
    
    if (modelData.gemini) {
        // Gemini provides outputTokenLimit in API
        const proLatest = modelData.gemini.find(m => m.id === 'gemini-pro-latest');
        const flashLatest = modelData.gemini.find(m => m.id === 'gemini-flash-latest');
        
        if (proLatest?.outputTokenLimit) {
            limits['gemini-pro-latest'] = proLatest.outputTokenLimit;
        }
        if (flashLatest?.outputTokenLimit) {
            limits['gemini-flash-latest'] = flashLatest.outputTokenLimit;
        }
    }
    
    // Anthropic and OpenAI don't expose limits in model list API
    // We track known limits manually in src/constants/tokenLimits.ts
    
    return limits;
}

/**
 * Extracts version info from "latest" aliases by examining
 * the newest non-latest model in each provider's list
 */
function inferLatestVersions(modelData) {
    const versions = {
        checkedAt: new Date().toISOString(),
        tokenLimits: extractTokenLimits(modelData),
        openai: {},
        gemini: {},
        anthropic: {}
    };

    // For OpenAI: find newest model that matches the alias pattern
    if (modelData.openai) {
        for (const alias of TRACKED_LATEST_ALIASES.openai) {
            // e.g., "gpt-5.2-chat-latest" -> look for "gpt-5.2" models
            const prefix = alias.replace('-latest', '').replace('-chat', '');
            const matches = modelData.openai
                .filter(m => m.id.startsWith(prefix) && !m.id.includes('latest'))
                .sort((a, b) => (b.created || 0) - (a.created || 0));
            if (matches.length > 0) {
                versions.openai[alias] = {
                    likelyResolves: matches[0].id,
                    created: matches[0].created ? new Date(matches[0].created * 1000).toISOString() : null
                };
            }
        }
    }

    // For Gemini: find newest model that matches the alias pattern
    if (modelData.gemini) {
        for (const alias of TRACKED_LATEST_ALIASES.gemini) {
            // e.g., "gemini-pro-latest" -> look for "gemini-*-pro" models
            const type = alias.includes('flash') ? 'flash' : 'pro';
            const matches = modelData.gemini
                .filter(m => {
                    const id = m.id.toLowerCase();
                    return id.includes(type) && !id.includes('latest') && !id.includes('lite');
                });
            // Gemini doesn't have created dates, so we'll note all matching models
            if (matches.length > 0) {
                // Try to find the newest by version number
                const sorted = matches.sort((a, b) => {
                    // Extract version numbers like "3" from "gemini-3-pro"
                    const verA = a.id.match(/(\d+\.?\d*)/)?.[1] || '0';
                    const verB = b.id.match(/(\d+\.?\d*)/)?.[1] || '0';
                    return parseFloat(verB) - parseFloat(verA);
                });
                versions.gemini[alias] = {
                    likelyResolves: sorted[0].id,
                    displayName: sorted[0].displayName
                };
            }
        }
    }

    // For Anthropic: track the newest models (no "latest" alias available)
    if (modelData.anthropic && modelData.anthropic.length > 0) {
        const newest = modelData.anthropic[0]; // Already sorted newest first
        versions.anthropic.newestModel = {
            id: newest.id,
            displayName: newest.display_name,
            createdAt: newest.created_at
        };
    }

    return versions;
}

function checkLatestAliasChanges(oldTracking, newTracking) {
    const changes = [];
    
    for (const provider of ['openai', 'gemini']) {
        const oldProviderData = oldTracking?.[provider] || {};
        const newProviderData = newTracking[provider] || {};
        
        for (const alias of Object.keys(newProviderData)) {
            const oldResolves = oldProviderData[alias]?.likelyResolves;
            const newResolves = newProviderData[alias]?.likelyResolves;
            
            if (oldResolves && newResolves && oldResolves !== newResolves) {
                changes.push({
                    provider,
                    alias,
                    from: oldResolves,
                    to: newResolves
                });
            }
        }
    }
    
    // Check if Anthropic's newest model changed
    const oldAnthropic = oldTracking?.anthropic?.newestModel?.id;
    const newAnthropic = newTracking.anthropic?.newestModel?.id;
    if (oldAnthropic && newAnthropic && oldAnthropic !== newAnthropic) {
        changes.push({
            provider: 'anthropic',
            alias: 'newest-model',
            from: oldAnthropic,
            to: newAnthropic
        });
    }
    
    return changes;
}

function checkTokenLimitChanges(oldTracking, newTracking) {
    const changes = [];
    const oldLimits = oldTracking?.tokenLimits || {};
    const newLimits = newTracking.tokenLimits || {};
    
    for (const model of Object.keys(newLimits)) {
        const oldLimit = oldLimits[model];
        const newLimit = newLimits[model];
        
        if (oldLimit && newLimit && oldLimit !== newLimit) {
            changes.push({
                model,
                from: oldLimit,
                to: newLimit
            });
        }
    }
    
    return changes;
}

function main() {
    const oldData = loadModels();
    
    // Check if we need to run
    if (oldData && oldData.generatedAt) {
        const lastRun = new Date(oldData.generatedAt).getTime();
        const timeSince = Date.now() - lastRun;
        
        if (timeSince < ONE_DAY_MS) {
            // Un-comment to see verbose skipping
            // console.log(`[check-model-updates] Skipping check (last checked ${(timeSince / 1000 / 60 / 60).toFixed(1)}h ago).`);
            return;
        }
    }

    console.log('[check-model-updates] Checking for new AI models...');
    
    try {
        // Run the update script
        execSync(UPDATE_SCRIPT, { stdio: 'inherit', env: process.env });
    } catch (e) {
        console.warn('[check-model-updates] Update script failed or finished with error code. Continuing...');
    }

    const newData = loadModels();
    if (!newData) return;

    // If we didn't have old data, everything is "new", but that's initial setup.
    // If we did have old data, compare.
    if (oldData) {
        const oldIds = getModelIds(oldData);
        const newIds = getModelIds(newData);

        const added = [...newIds].filter(id => !oldIds.has(id));

        if (added.length > 0) {
            console.log(`\n${YELLOW}${BOLD}!!! NEW AI MODELS DETECTED !!!${RESET}`);
            console.log(`${YELLOW}The following new models were found in the API update:${RESET}`);
            added.forEach(id => console.log(`- ${id}`));
            console.log(`${YELLOW}Run 'npm run update-models' manually if needed, and update src/data/aiModels.ts.${RESET}\n`);
        } else {
            console.log('[check-model-updates] No new models detected.');
        }
    } else {
        console.log('[check-model-updates] Initial model list generated.');
    }

    // Track "latest" alias changes
    const oldTracking = loadLatestTracking();
    const newTracking = inferLatestVersions(newData);
    
    // Check for changes in what "latest" aliases resolve to
    if (oldTracking) {
        const aliasChanges = checkLatestAliasChanges(oldTracking, newTracking);
        
        if (aliasChanges.length > 0) {
            console.log(`\n${CYAN}${BOLD}!!! "LATEST" ALIAS CHANGES DETECTED !!!${RESET}`);
            console.log(`${CYAN}The following "latest" model aliases now point to different versions:${RESET}`);
            aliasChanges.forEach(change => {
                console.log(`- ${change.provider.toUpperCase()}: ${change.alias}`);
                console.log(`    ${change.from} → ${change.to}`);
            });
            console.log(`${CYAN}Review if this affects your workflows.${RESET}\n`);
        }
        
        // Check for token limit changes
        const tokenChanges = checkTokenLimitChanges(oldTracking, newTracking);
        
        if (tokenChanges.length > 0) {
            console.log(`\n${YELLOW}${BOLD}!!! TOKEN LIMIT CHANGES DETECTED !!!${RESET}`);
            console.log(`${YELLOW}The following models have new output token limits:${RESET}`);
            tokenChanges.forEach(change => {
                console.log(`- ${change.model}: ${change.from.toLocaleString()} → ${change.to.toLocaleString()} tokens`);
            });
            console.log(`${YELLOW}Update src/constants/tokenLimits.ts to take advantage of increased limits.${RESET}\n`);
        }
    }
    
    // Log current "latest" alias status
    console.log(`\n${GREEN}Current "latest" alias mappings:${RESET}`);
    for (const alias of Object.keys(newTracking.openai)) {
        const info = newTracking.openai[alias];
        console.log(`  OpenAI ${alias} → ${info.likelyResolves}`);
    }
    for (const alias of Object.keys(newTracking.gemini)) {
        const info = newTracking.gemini[alias];
        console.log(`  Gemini ${alias} → ${info.likelyResolves} (${info.displayName})`);
    }
    if (newTracking.anthropic.newestModel) {
        const info = newTracking.anthropic.newestModel;
        console.log(`  Anthropic newest → ${info.id} (${info.displayName})`);
    }
    
    // Log token limits from API
    if (Object.keys(newTracking.tokenLimits).length > 0) {
        console.log(`\n${GREEN}Output token limits (from Gemini API):${RESET}`);
        for (const [model, limit] of Object.entries(newTracking.tokenLimits)) {
            console.log(`  ${model}: ${limit.toLocaleString()} tokens`);
        }
    }
    
    // Save tracking data
    saveLatestTracking(newTracking);
}

main();
