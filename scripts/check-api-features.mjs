#!/usr/bin/env node
/**
 * Provider API Feature Audit Script (v2)
 *
 * Loads provider-capabilities.json and plugin-feature-integration.json,
 * validates schemas, scans source files for implementation markers,
 * verifies implementation evidence, cross-references claimed status
 * against reality, scores and ranks gaps, and produces a
 * decision-ready gap analysis report.
 *
 * Runs every build (no network calls). Purely local analysis.
 *
 * Usage:
 *   node scripts/check-api-features.mjs              (standard audit)
 *   node scripts/check-api-features.mjs --issues      (also generate GitHub issue stubs)
 *   node scripts/check-api-features.mjs --strict      (fail on violations — use in CI)
 *   node scripts/check-api-features.mjs --quiet       (suppress console, write report only)
 */
import fs from 'fs';
import path from 'path';
import process from 'process';

// ── Paths ──────────────────────────────────────────────────────────────────────

const CAPABILITIES_FILE = path.resolve('scripts/models/provider-capabilities.json');
const INTEGRATIONS_FILE = path.resolve('scripts/models/plugin-feature-integration.json');
const AUDIT_REPORT_FILE = path.resolve('scripts/models/feature-audit.json');
const ISSUES_DIR = path.resolve('.github/issues');

// ── ANSI colors ────────────────────────────────────────────────────────────────

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const WHITE = '\x1b[37m';

// ── Allowed enum values ────────────────────────────────────────────────────────

const ALLOWED_MATURITY = new Set(['experimental', 'beta', 'preview', 'ga', 'deprecated', 'removed']);
const ALLOWED_COMPLEXITY = new Set(['low', 'medium', 'high', 'architectural']);
const ALLOWED_ROI = new Set(['cost', 'quality', 'latency', 'capability', 'developer-experience']);
const ALLOWED_CATEGORY = new Set(['cost-optimization', 'capability', 'quality', 'performance', 'developer-experience', 'deprecation', 'protocol']);
const ALLOWED_STATUS = new Set(['not_implemented', 'partial', 'complete', 'not_applicable', 'deferred']);
const ALLOWED_PRIORITY = new Set(['p0', 'p1', 'p2', 'p3']);
const ALLOWED_IMPACT = new Set(['high', 'medium', 'low', 'none']);

// ── CLI flags ──────────────────────────────────────────────────────────────────

const doGenerateIssues = process.argv.includes('--issues');
const strictMode = process.argv.includes('--strict');
const quietMode = process.argv.includes('--quiet');

function log(msg = '') {
    if (!quietMode) console.log(msg);
}

// ── Load registries ────────────────────────────────────────────────────────────

function loadJson(filePath) {
    if (!fs.existsSync(filePath)) return null;
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        console.error(`[api-features] Failed to parse ${path.basename(filePath)}: ${e.message}`);
        return null;
    }
}

// ── Schema validation ──────────────────────────────────────────────────────────

function validateCapabilities(data) {
    const errors = [];
    const warnings = [];
    if (!data || (data.schemaVersion !== 1 && data.schemaVersion !== 2)) {
        errors.push('provider-capabilities.json: missing or invalid schemaVersion');
        return { errors, warnings };
    }
    if (!Array.isArray(data.capabilities)) {
        errors.push('provider-capabilities.json: capabilities must be an array');
        return { errors, warnings };
    }
    const ids = new Set();
    for (const cap of data.capabilities) {
        if (!cap.id) { errors.push('Capability missing id'); continue; }
        if (ids.has(cap.id)) errors.push(`${cap.id}: duplicate capability id`);
        ids.add(cap.id);
        if (!cap.provider) errors.push(`${cap.id}: missing provider`);
        if (!cap.name) errors.push(`${cap.id}: missing name`);
        if (cap.category && !ALLOWED_CATEGORY.has(cap.category)) {
            errors.push(`${cap.id}: invalid category '${cap.category}'`);
        }
        if (cap.maturity && !ALLOWED_MATURITY.has(cap.maturity)) {
            errors.push(`${cap.id}: invalid maturity '${cap.maturity}'`);
        }
        if (cap.implementationComplexity && !ALLOWED_COMPLEXITY.has(cap.implementationComplexity)) {
            errors.push(`${cap.id}: invalid implementationComplexity '${cap.implementationComplexity}'`);
        }
        if (cap.roiCategory && !ALLOWED_ROI.has(cap.roiCategory)) {
            errors.push(`${cap.id}: invalid roiCategory '${cap.roiCategory}'`);
        }
        // Provider reality guardrails
        if (!cap.availableSince || cap.availableSince === 'TODO') {
            warnings.push(`${cap.id}: missing availableSince (required for provider reality)`);
        }
        if (!cap.documentationUrl || cap.documentationUrl === 'TODO') {
            warnings.push(`${cap.id}: missing documentationUrl (required for provider reality)`);
        }
        if (cap.requiredApiVersion === undefined) {
            warnings.push(`${cap.id}: missing requiredApiVersion (use null with note if not versioned)`);
        }
    }
    return { errors, warnings };
}

function validateIntegrations(data, capabilityIds) {
    const errors = [];
    const warnings = [];
    if (!data || (data.schemaVersion !== 1 && data.schemaVersion !== 2)) {
        errors.push('plugin-feature-integration.json: missing or invalid schemaVersion');
        return { errors, warnings };
    }
    if (!Array.isArray(data.integrations)) {
        errors.push('plugin-feature-integration.json: integrations must be an array');
        return { errors, warnings };
    }
    const ids = new Set();
    for (const int of data.integrations) {
        if (!int.id) { errors.push('Integration missing id'); continue; }
        if (ids.has(int.id)) errors.push(`${int.id}: duplicate integration id`);
        ids.add(int.id);
        if (!capabilityIds.has(int.id)) {
            errors.push(`${int.id}: no matching capability in provider-capabilities.json`);
        }
        if (int.implementationStatus && !ALLOWED_STATUS.has(int.implementationStatus)) {
            errors.push(`${int.id}: invalid implementationStatus '${int.implementationStatus}'`);
        }
        if (int.priority && !ALLOWED_PRIORITY.has(int.priority)) {
            errors.push(`${int.id}: invalid priority '${int.priority}'`);
        }
        if (int.impactAssessment && !ALLOWED_IMPACT.has(int.impactAssessment)) {
            errors.push(`${int.id}: invalid impactAssessment '${int.impactAssessment}'`);
        }
    }
    // Orphaned capabilities
    for (const capId of capabilityIds) {
        if (!ids.has(capId)) {
            errors.push(`${capId}: capability exists but has no integration entry`);
        }
    }
    return { errors, warnings };
}

// ── Implementation evidence verification ──────────────────────────────────────

function verifyEvidence(integrations) {
    const failures = [];
    for (const int of integrations) {
        if (int.implementationStatus !== 'complete') continue;
        const patterns = int.implementationEvidence;
        if (!patterns || patterns.length === 0) {
            failures.push({
                id: int.id,
                reason: '"complete" status with no implementationEvidence patterns'
            });
            continue;
        }
        // Check evidence patterns against source files
        const sources = int.sourceFiles || [];
        for (const pattern of patterns) {
            let found = false;
            for (const srcFile of sources) {
                const fullPath = path.resolve(srcFile);
                if (!fs.existsSync(fullPath)) continue;
                const content = fs.readFileSync(fullPath, 'utf8');
                try {
                    if (new RegExp(pattern).test(content)) {
                        found = true;
                        break;
                    }
                } catch {
                    failures.push({
                        id: int.id,
                        reason: `invalid regex pattern: ${pattern}`
                    });
                    found = true; // don't double-report
                    break;
                }
            }
            if (!found) {
                failures.push({
                    id: int.id,
                    reason: `evidence pattern not found in source: /${pattern}/`
                });
            }
        }
    }
    return failures;
}

// ── Source scanning ────────────────────────────────────────────────────────────

function readSourceFile(relativePath) {
    const fullPath = path.resolve(relativePath);
    if (!fs.existsSync(fullPath)) return null;
    return fs.readFileSync(fullPath, 'utf8');
}

function scanSources() {
    const findings = [];

    // ── Anthropic API ──
    const anthropicSrc = readSourceFile('src/api/anthropicApi.ts');
    if (anthropicSrc) {
        if (anthropicSrc.includes('requestBody.system = systemPrompt') ||
            (anthropicSrc.includes('system?: string') && !anthropicSrc.includes('system?: Array'))) {
            findings.push({
                file: 'anthropicApi.ts',
                finding: 'system prompt is plain string (blocks prompt caching)',
                relatedFeatures: ['anthropic-system-content-blocks', 'anthropic-prompt-caching']
            });
        }
        if (!anthropicSrc.includes('anthropic-beta')) {
            findings.push({
                file: 'anthropicApi.ts',
                finding: 'no anthropic-beta headers configured',
                relatedFeatures: ['anthropic-prompt-caching', 'anthropic-extended-thinking']
            });
        }
        const versionMatch = anthropicSrc.match(/apiVersion\s*=\s*'([^']+)'/);
        if (versionMatch) {
            findings.push({
                file: 'anthropicApi.ts',
                finding: `anthropic-version header: ${versionMatch[1]}`,
                relatedFeatures: []
            });
        }
        const hasTemperature = anthropicSrc.includes('temperature') &&
            (anthropicSrc.includes('body.temperature') || anthropicSrc.includes('requestBody.temperature'));
        if (!hasTemperature) {
            findings.push({
                file: 'anthropicApi.ts',
                finding: 'temperature/topP not in request body',
                relatedFeatures: ['anthropic-temperature-topP']
            });
        }
    }

    // ── OpenAI API ──
    const openaiSrc = readSourceFile('src/api/openaiApi.ts');
    if (openaiSrc) {
        if (openaiSrc.includes('${systemPrompt}\\n\\n${userPrompt}') ||
            openaiSrc.includes('`${systemPrompt}\\n\\n${userPrompt}`')) {
            findings.push({
                file: 'openaiApi.ts',
                finding: 'system+user concatenated into single message (defeats auto-caching)',
                relatedFeatures: ['openai-automatic-prompt-caching', 'openai-reasoning-model-system-role']
            });
        }
    }

    // ── Gemini API ──
    const geminiSrc = readSourceFile('src/api/geminiApi.ts');
    if (geminiSrc) {
        const hasCreateFunction = geminiSrc.includes('export async function createGeminiCache');
        if (hasCreateFunction) {
            const callerCount = countCallersInSrc('createGeminiCache', 'src/api/geminiApi.ts');
            findings.push({
                file: 'geminiApi.ts',
                finding: `createGeminiCache() has ${callerCount} callers in src/`,
                relatedFeatures: ['gemini-context-caching']
            });
        }
    }

    return findings;
}

function countCallersInSrc(functionName, definitionFile) {
    const srcDir = path.resolve('src');
    if (!fs.existsSync(srcDir)) return 0;
    let count = 0;
    walkDir(srcDir, (filePath) => {
        if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) return;
        if (path.resolve(filePath) === path.resolve(definitionFile)) return;
        const content = fs.readFileSync(filePath, 'utf8');
        const importMatch = content.match(new RegExp(`import.*${functionName}`, 'g'));
        if (importMatch) count += importMatch.length;
    });
    return count;
}

function walkDir(dir, callback) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            walkDir(fullPath, callback);
        } else {
            callback(fullPath);
        }
    }
}

// ── Priority scoring ──────────────────────────────────────────────────────────

const IMPACT_SCORE = { high: 3, medium: 2, low: 1, none: 0 };
const ROI_SCORE = { cost: 2, quality: 1, latency: 1, capability: 1, 'developer-experience': 0 };
const MATURITY_SCORE = { ga: 2, preview: 1, beta: 1, experimental: 0, deprecated: 0, removed: 0 };
const COMPLEXITY_PENALTY = { architectural: 2, high: 1, medium: 0, low: 0 };

function computeScore(cap, int) {
    const impact = IMPACT_SCORE[int.impactAssessment] ?? 0;
    const roi = ROI_SCORE[cap.roiCategory] ?? 0;
    const maturity = MATURITY_SCORE[cap.maturity] ?? 0;
    const penalty = COMPLEXITY_PENALTY[cap.implementationComplexity] ?? 0;
    return impact + roi + maturity - penalty;
}

function payoffClass(cap) {
    const category = cap.roiCategory;
    if (category === 'cost') return 'Cost';
    if (category === 'quality') return 'Quality';
    if (category === 'latency') return 'Latency';
    if (category === 'capability') return 'Capability';
    return 'DX';
}

// ── Analytics ──────────────────────────────────────────────────────────────────

function buildAnalytics(capabilities, integrations) {
    const capMap = new Map(capabilities.map(c => [c.id, c]));
    const intMap = new Map(integrations.map(i => [i.id, i]));

    // Provider summaries
    const providers = ['anthropic', 'openai', 'google'];
    const providerSummaries = {};
    for (const provider of providers) {
        const providerCaps = capabilities.filter(c => c.provider === provider);
        const total = providerCaps.length;
        const implemented = providerCaps.filter(c => {
            const int = intMap.get(c.id);
            return int && int.implementationStatus === 'complete';
        }).length;
        const highImpactGaps = providerCaps.filter(c => {
            const int = intMap.get(c.id);
            return int && int.impactAssessment === 'high' &&
                int.implementationStatus !== 'complete';
        }).length;
        providerSummaries[provider] = { total, implemented, highImpactGaps };
    }

    // All actionable gaps (not complete, not not_applicable, not deferred)
    const actionableGaps = integrations
        .filter(i => i.implementationStatus === 'not_implemented' || i.implementationStatus === 'partial')
        .map(i => {
            const cap = capMap.get(i.id);
            if (!cap) return null;
            const score = computeScore(cap, i);
            return {
                id: i.id,
                name: cap.name,
                description: cap.description,
                provider: cap.provider,
                priority: i.priority,
                score,
                payoff: payoffClass(cap),
                complexity: cap.implementationComplexity,
                maturity: cap.maturity,
                roiCategory: cap.roiCategory,
                relevantPluginFeatures: i.relevantPluginFeatures,
                implementationNotes: i.implementationNotes,
                sourceFiles: i.sourceFiles,
                targetRelease: i.targetRelease,
                owner: i.owner
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

    // Top 5 next actions
    const top5 = actionableGaps.slice(0, 5).map(gap => {
        // Extract the first actionable sentence from implementation notes
        const notes = gap.implementationNotes || '';
        const actionHint = notes.split('.').find(s =>
            /needs|must|fix|separate|restructure|wire|add|change|replace|implement/i.test(s)
        )?.trim() || notes.split('.')[0]?.trim() || 'See implementation notes';
        const primaryFile = gap.sourceFiles?.[0] || 'TBD';
        return { ...gap, actionHint, primaryFile };
    });

    // High impact gaps
    const highImpactGaps = actionableGaps.filter(g => {
        const int = intMap.get(g.id);
        return int && int.impactAssessment === 'high';
    });

    // Cost optimization opportunities
    const costOpportunities = actionableGaps.filter(g => g.roiCategory === 'cost');

    // Beta/preview features not implemented
    const betaFeatures = actionableGaps.filter(g =>
        g.maturity === 'beta' || g.maturity === 'preview'
    );

    // GA features missing implementation (exclude architectural)
    const gaGaps = actionableGaps.filter(g =>
        g.maturity === 'ga' && g.complexity !== 'architectural'
    );

    return { providerSummaries, actionableGaps, top5, highImpactGaps, costOpportunities, betaFeatures, gaGaps };
}

// ── Console output ─────────────────────────────────────────────────────────────

function printReport(analytics, sourceFindings, validationErrors, validationWarnings, evidenceFailures) {
    const now = new Date().toISOString().slice(0, 10);
    log(`\n${BOLD}[api-features] Provider API Feature Audit (${now})${RESET}\n`);

    // Validation errors
    if (validationErrors.length > 0) {
        log(`${RED}  VALIDATION ERRORS:${RESET}`);
        validationErrors.forEach(e => log(`  ${RED}x${RESET} ${e}`));
        log('');
    }

    // Validation warnings (strict mode)
    if (validationWarnings.length > 0 && strictMode) {
        log(`${YELLOW}  PROVIDER REALITY WARNINGS:${RESET}`);
        validationWarnings.forEach(w => log(`  ${YELLOW}?${RESET} ${w}`));
        log('');
    }

    // Evidence failures
    if (evidenceFailures.length > 0) {
        log(`${RED}  EVIDENCE FAILURES:${RESET}`);
        evidenceFailures.forEach(f => log(`  ${RED}x${RESET} ${f.id}: ${f.reason}`));
        log('');
    }

    // Provider summaries
    const providerNames = { anthropic: 'Anthropic', openai: 'OpenAI', google: 'Google' };
    for (const [key, label] of Object.entries(providerNames)) {
        const summary = analytics.providerSummaries[key];
        if (!summary) continue;
        const pct = summary.total > 0 ? Math.round((summary.implemented / summary.total) * 100) : 0;
        const gapNote = summary.highImpactGaps > 0
            ? ` — ${summary.highImpactGaps} high-impact gap${summary.highImpactGaps > 1 ? 's' : ''}`
            : '';
        const color = pct >= 80 ? GREEN : pct >= 40 ? YELLOW : RED;
        log(`  ${label.padEnd(12)} ${color}${summary.implemented}/${summary.total} implemented (${pct}%)${RESET}${gapNote}`);
    }
    log('');

    // ── TOP 5 NEXT ACTIONS (decision-ready) ──
    if (analytics.top5.length > 0) {
        log(`${WHITE}${BOLD}  TOP 5 NEXT ACTIONS:${RESET}`);
        analytics.top5.forEach((action, i) => {
            const num = `${i + 1}.`;
            log(`  ${GREEN}${num}${RESET} ${action.id} ${DIM}(score: ${action.score}, ${action.payoff})${RESET}`);
            log(`     ${action.actionHint}`);
            log(`     ${DIM}${action.primaryFile}${RESET}`);
        });
        log('');
    }

    // High impact gaps
    if (analytics.highImpactGaps.length > 0) {
        log(`${RED}  HIGH IMPACT GAPS:${RESET}`);
        analytics.highImpactGaps.forEach(gap => {
            const features = gap.relevantPluginFeatures?.join(', ') || '';
            const prio = gap.priority ? ` [${gap.priority}]` : '';
            log(`  ${RED}!${RESET} ${gap.id} — ${gap.description.slice(0, 60)}${features ? ` (${features})` : ''}${prio}`);
        });
        log('');
    }

    // Cost optimization opportunities
    if (analytics.costOpportunities.length > 0) {
        log(`${YELLOW}  COST OPTIMIZATION OPPORTUNITIES:${RESET}`);
        analytics.costOpportunities.forEach(op => {
            log(`  ${YELLOW}$${RESET} ${op.id} — ${op.maturity}, ${op.complexity} complexity`);
        });
        log('');
    }

    // Beta/preview features
    if (analytics.betaFeatures.length > 0) {
        log(`${CYAN}  BETA/PREVIEW FEATURES NOT YET IMPLEMENTED:${RESET}`);
        analytics.betaFeatures.forEach(f => {
            log(`  ${CYAN}~${RESET} ${f.id} — ${f.maturity}, ${f.complexity} complexity`);
        });
        log('');
    }

    // GA features missing (non-architectural)
    if (analytics.gaGaps.length > 0) {
        log(`${DIM}  GA FEATURES MISSING IMPLEMENTATION:${RESET}`);
        analytics.gaGaps.forEach(g => {
            const prio = g.priority ? ` [${g.priority}]` : '';
            log(`  ${DIM}-${RESET} ${g.id} — ${g.maturity || 'ga'}, ${g.complexity} complexity${prio}`);
        });
        log('');
    }

    // Source code findings
    if (sourceFindings.length > 0) {
        log(`${DIM}  SOURCE CODE FINDINGS:${RESET}`);
        sourceFindings.forEach(f => {
            log(`  ${DIM}-${RESET} ${f.file}: ${f.finding}`);
        });
        log('');
    }
}

// ── Issue generation ───────────────────────────────────────────────────────────

function generateIssueStubs(highImpactGaps, capMap, intMap) {
    if (!fs.existsSync(ISSUES_DIR)) {
        fs.mkdirSync(ISSUES_DIR, { recursive: true });
    }

    let generated = 0;
    for (const gap of highImpactGaps) {
        const cap = capMap.get(gap.id);
        const int = intMap.get(gap.id);
        if (!cap || !int) continue;
        if (int.implementationStatus !== 'not_implemented') continue;

        const filename = `feature-${gap.id}.md`;
        const filePath = path.join(ISSUES_DIR, filename);

        // Skip if already exists
        if (fs.existsSync(filePath)) continue;

        const features = (int.relevantPluginFeatures || []).map(f => `- ${f}`).join('\n');
        const sources = (int.sourceFiles || []).map(f => `- \`${f}\``).join('\n');
        const blockers = (int.blockers || []).length > 0
            ? int.blockers.map(b => `- ${b}`).join('\n')
            : 'None';

        // Build evidence patterns for DoD
        const evidencePatterns = (int.implementationEvidence || []).length > 0
            ? int.implementationEvidence.map(p => `- [ ] Evidence pattern matches: \`/${p}/\``).join('\n')
            : '- [ ] Add implementationEvidence patterns to registry';

        // Build required headers DoD items
        const headerItems = Object.entries(cap.requiredHeaders || {})
            .map(([k, v]) => `- [ ] Header \`${k}: ${v}\` sent in requests`)
            .join('\n');

        const content = `---
title: "Implement ${cap.name} (${cap.provider})"
labels: ai-feature, ${cap.provider}, ${int.priority || 'p2'}
---

## Feature: ${cap.name}

**Provider:** ${cap.provider}
**Category:** ${cap.category}
**Maturity:** ${cap.maturity}
**ROI Category:** ${cap.roiCategory}
**Implementation Complexity:** ${cap.implementationComplexity}
**Priority Score:** ${gap.score}

## Description

${cap.description}

## Documentation

${cap.documentationUrl}

## Relevant Plugin Features

${features || 'None specified'}

## Implementation Notes

${int.implementationNotes || 'No notes yet.'}

## Source Files

${sources || 'None identified'}

## Blockers

${blockers}

## Definition of Done

### Request Shape
- [ ] API request body matches provider documentation
${headerItems ? `\n### Headers\n${headerItems}` : ''}

### Tests
- [ ] Unit test covering request construction
- [ ] Integration test verifying response parsing

### Audit Evidence
${evidencePatterns}
- [ ] \`implementationStatus\` set to \`"complete"\` in plugin-feature-integration.json
- [ ] \`node scripts/check-api-features.mjs --strict\` passes

### Obsidian Compatibility
- [ ] Works with \`requestUrl()\` (no browser-only APIs)
- [ ] Fallback behavior if feature unavailable (older API version, rate limit, mobile)
`;
        fs.writeFileSync(filePath, content, 'utf8');
        generated += 1;
        log(`  ${GREEN}+${RESET} Generated issue stub: ${filename}`);
    }

    if (generated > 0) {
        log(`\n  ${GREEN}Generated ${generated} issue stub(s) in .github/issues/${RESET}\n`);
    }
}

// ── Report file ────────────────────────────────────────────────────────────────

function writeAuditReport(analytics, sourceFindings, validationErrors, validationWarnings, evidenceFailures) {
    const report = {
        generatedAt: new Date().toISOString(),
        validationErrors,
        validationWarnings,
        evidenceFailures,
        providerSummaries: analytics.providerSummaries,
        top5: analytics.top5,
        highImpactGaps: analytics.highImpactGaps,
        costOpportunities: analytics.costOpportunities,
        betaFeatures: analytics.betaFeatures,
        gaGaps: analytics.gaGaps,
        sourceFindings
    };

    const dir = path.dirname(AUDIT_REPORT_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(AUDIT_REPORT_FILE, JSON.stringify(report, null, 2), 'utf8');
}

// ── Main ───────────────────────────────────────────────────────────────────────

function main() {
    const capData = loadJson(CAPABILITIES_FILE);
    const intData = loadJson(INTEGRATIONS_FILE);

    if (!capData) {
        console.error('[api-features] Missing provider-capabilities.json — skipping audit.');
        return;
    }
    if (!intData) {
        console.error('[api-features] Missing plugin-feature-integration.json — skipping audit.');
        return;
    }

    // Validate
    const capResult = validateCapabilities(capData);
    const capabilityIds = new Set((capData.capabilities || []).map(c => c.id));
    const intResult = validateIntegrations(intData, capabilityIds);
    const validationErrors = [...capResult.errors, ...intResult.errors];
    const validationWarnings = [...capResult.warnings, ...intResult.warnings];

    // Evidence verification
    const evidenceFailures = verifyEvidence(intData.integrations || []);

    // Source scan
    const sourceFindings = scanSources();

    // Analytics
    const analytics = buildAnalytics(capData.capabilities || [], intData.integrations || []);

    // Console output
    printReport(analytics, sourceFindings, validationErrors, validationWarnings, evidenceFailures);

    // Write report
    writeAuditReport(analytics, sourceFindings, validationErrors, validationWarnings, evidenceFailures);

    // Issue generation
    if (doGenerateIssues) {
        const capMap = new Map((capData.capabilities || []).map(c => [c.id, c]));
        const intMap = new Map((intData.integrations || []).map(i => [i.id, i]));
        generateIssueStubs(analytics.highImpactGaps, capMap, intMap);
    }

    // Strict mode: exit with error if violations found
    if (strictMode) {
        const strictFailures = [];
        if (validationErrors.length > 0) strictFailures.push(`${validationErrors.length} validation error(s)`);
        if (validationWarnings.length > 0) strictFailures.push(`${validationWarnings.length} provider reality warning(s)`);
        if (evidenceFailures.length > 0) strictFailures.push(`${evidenceFailures.length} evidence failure(s)`);

        if (strictFailures.length > 0) {
            console.error(`[api-features] --strict: ${strictFailures.join(', ')}`);
            process.exit(1);
        }
    }
}

main();
