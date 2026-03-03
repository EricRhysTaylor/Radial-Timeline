#!/usr/bin/env node
/**
 * CLI helper to add a new provider API feature to both registries.
 *
 * Usage:
 *   node scripts/add-api-feature.mjs \
 *     --provider anthropic \
 *     --name "Feature Name" \
 *     --category capability \
 *     --impact high \
 *     --doc-url "https://docs.anthropic.com/..." \
 *     --relevant gossamer,inquiry \
 *     --notes "Implementation notes here"
 *
 * Optional flags:
 *     --maturity ga          (default: beta)
 *     --complexity medium    (default: medium)
 *     --roi cost             (default: capability)
 *     --priority p1          (default: p2)
 *     --description "..."    (default: derived from name)
 */
import fs from 'fs';
import path from 'path';
import process from 'process';

const CAPABILITIES_FILE = path.resolve('scripts/models/provider-capabilities.json');
const INTEGRATIONS_FILE = path.resolve('scripts/models/plugin-feature-integration.json');

// ── Arg parsing ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = {};
    const tokens = argv.slice(2);
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (token.startsWith('--') && i + 1 < tokens.length) {
            const key = token.slice(2);
            const value = tokens[i + 1];
            if (!value.startsWith('--')) {
                args[key] = value;
                i += 1;
            }
        }
    }
    return args;
}

function slugify(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

function today() {
    return new Date().toISOString().slice(0, 10);
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
    const args = parseArgs(process.argv);

    // Required
    if (!args.provider) {
        console.error('Missing required --provider (anthropic|openai|google|ollama)');
        process.exit(1);
    }
    if (!args.name) {
        console.error('Missing required --name "Feature Name"');
        process.exit(1);
    }

    const provider = args.provider;
    const name = args.name;
    const id = `${provider}-${slugify(name)}`;
    const category = args.category || 'capability';
    const impact = args.impact || 'medium';
    const docUrl = args['doc-url'] || 'TODO';
    const relevant = args.relevant ? args.relevant.split(',').map(s => s.trim()) : [];
    const notes = args.notes || '';
    const maturity = args.maturity || 'beta';
    const complexity = args.complexity || 'medium';
    const roi = args.roi || 'capability';
    const priority = args.priority || 'p2';
    const description = args.description || `${name} for ${provider}. See documentation for details.`;

    // Load existing registries
    let capData;
    let intData;
    try {
        capData = JSON.parse(fs.readFileSync(CAPABILITIES_FILE, 'utf8'));
    } catch (e) {
        console.error(`Failed to load ${CAPABILITIES_FILE}: ${e.message}`);
        process.exit(1);
    }
    try {
        intData = JSON.parse(fs.readFileSync(INTEGRATIONS_FILE, 'utf8'));
    } catch (e) {
        console.error(`Failed to load ${INTEGRATIONS_FILE}: ${e.message}`);
        process.exit(1);
    }

    // Check for duplicates
    if (capData.capabilities.some(c => c.id === id)) {
        console.error(`Capability '${id}' already exists in provider-capabilities.json`);
        process.exit(1);
    }
    if (intData.integrations.some(i => i.id === id)) {
        console.error(`Integration '${id}' already exists in plugin-feature-integration.json`);
        process.exit(1);
    }

    // Create capability entry
    const capEntry = {
        id,
        provider,
        name,
        category,
        description,
        availableSince: 'TODO',
        requiredApiVersion: 'TODO',
        requiredHeaders: {},
        documentationUrl: docUrl,
        maturity,
        implementationComplexity: complexity,
        roiCategory: roi,
        deprecationDate: null
    };

    // Create integration entry
    const intEntry = {
        id,
        relevantPluginFeatures: relevant,
        impactAssessment: impact,
        implementationStatus: 'not_implemented',
        implementationNotes: notes || 'TODO: Add implementation details.',
        sourceFiles: [],
        blockers: [],
        addedToRegistry: today(),
        priority
    };

    // Append to registries
    capData.capabilities.push(capEntry);
    capData.lastUpdated = today();

    intData.integrations.push(intEntry);
    intData.lastUpdated = today();

    // Write back
    fs.writeFileSync(CAPABILITIES_FILE, JSON.stringify(capData, null, 2) + '\n', 'utf8');
    fs.writeFileSync(INTEGRATIONS_FILE, JSON.stringify(intData, null, 2) + '\n', 'utf8');

    console.log(`\n✓ Added '${id}' to both registries.\n`);
    console.log('  provider-capabilities.json:');
    console.log(`    id: ${id}`);
    console.log(`    maturity: ${maturity}`);
    console.log(`    complexity: ${complexity}`);
    console.log(`    roi: ${roi}`);
    console.log('');
    console.log('  plugin-feature-integration.json:');
    console.log(`    impact: ${impact}`);
    console.log(`    status: not_implemented`);
    console.log(`    priority: ${priority}`);
    console.log('');

    // Flag TODO fields
    const todos = [];
    if (capEntry.availableSince === 'TODO') todos.push('availableSince');
    if (capEntry.requiredApiVersion === 'TODO') todos.push('requiredApiVersion');
    if (capEntry.documentationUrl === 'TODO') todos.push('documentationUrl');
    if (intEntry.sourceFiles.length === 0) todos.push('sourceFiles');
    if (intEntry.implementationNotes.includes('TODO')) todos.push('implementationNotes');

    if (todos.length > 0) {
        console.log('  ⚠ Fields needing manual review:');
        todos.forEach(field => console.log(`    - ${field}`));
        console.log('');
    }
}

main();
