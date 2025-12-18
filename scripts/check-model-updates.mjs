#!/usr/bin/env node
/**
 * Checks if it has been more than 24 hours since the last model update check.
 * If so, runs the update script and alerts if new models are found.
 */
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import process from 'process';

const MODELS_FILE = path.resolve('scripts/models/latest-models.json');
const UPDATE_SCRIPT = 'node scripts/update-ai-models.mjs'; 
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

// ANSI colors
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

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
}

main();
