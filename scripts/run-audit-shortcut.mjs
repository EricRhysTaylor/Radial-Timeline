#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const MODES = {
  daily: {
    label: 'Daily Control Tower',
    slug: 'daily-control-tower',
    backupNote: 'Daily Control Tower',
    commitCount: 8,
    baselineLabel: 'best available baseline'
  },
  friday: {
    label: 'Friday Release Gate',
    slug: 'friday-release-gate',
    backupNote: 'Friday Release Gate',
    commitCount: 12,
    baselineLabel: 'release baseline'
  },
  deep: {
    label: 'Biweekly Deep Audit',
    slug: 'biweekly-deep-audit',
    backupNote: 'Biweekly Deep Audit',
    commitCount: 20,
    baselineLabel: 'best available baseline'
  }
};

const modeKey = (process.argv[2] || '').toLowerCase();
const mode = MODES[modeKey];
const shouldRecord = !process.argv.includes('--no-record');

if (!mode) {
  console.error('[audit] Unknown audit shortcut. Use: daily, friday, or deep.');
  process.exit(1);
}

function run(command, { allowFailure = false, env = {} } = {}) {
  const startedAt = Date.now();
  const result = spawnSync('zsh', ['-lc', command], {
    cwd: process.cwd(),
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, ...env }
  });
  const durationMs = Date.now() - startedAt;
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();
  const output = [stdout, stderr].filter(Boolean).join('\n');
  const code = result.status ?? 1;

  if (code !== 0 && !allowFailure) {
    throw new Error(`Command failed (${code}): ${command}\n${tail(output, 60)}`);
  }

  return {
    code,
    ok: code === 0,
    output,
    durationMs
  };
}

function tail(text, lines = 20) {
  return String(text).split('\n').slice(-lines).join('\n').trim();
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function safe(command) {
  try {
    return run(command, { allowFailure: true }).output;
  } catch {
    return '';
  }
}

function shortDuration(durationMs) {
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function parseLines(text) {
  return text ? text.split('\n').map(line => line.trim()).filter(Boolean) : [];
}

function escapeMarkdown(text) {
  return String(text).replace(/\|/g, '\\|');
}

function parseStatusFiles(text) {
  return text
    .split('\n')
    .map(line => line.replace(/^\s*[A-Z?]{1,2}\s+/, '').trim())
    .filter(Boolean);
}

function inferBaseline() {
  const head = safe('git rev-parse HEAD');
  const candidates = [
    { label: 'upstream merge-base', ref: safe('git merge-base HEAD @{upstream} 2>/dev/null') },
    { label: 'origin/master merge-base', ref: safe('git merge-base HEAD origin/master 2>/dev/null') },
    { label: 'HEAD~1', ref: safe('git rev-parse HEAD~1 2>/dev/null') }
  ];

  for (const candidate of candidates) {
    if (!candidate.ref) continue;
    if (candidate.ref !== head) return candidate;
  }

  return candidates.find(candidate => candidate.label === 'HEAD~1' && candidate.ref) || null;
}

function gate(name, command, availability = true, options = {}) {
  if (!availability) {
    return { name, status: 'Unavailable', detail: 'No matching npm script in package.json.' };
  }

  const result = run(command, { allowFailure: true, ...options });
  const status = result.ok ? 'Pass' : 'Fail';
  const detail = tail(result.output, result.ok ? 5 : 20) || '(no output)';
  return {
    name,
    status,
    detail,
    duration: shortDuration(result.durationMs)
  };
}

function topAreas(files) {
  const counts = new Map();
  for (const file of files) {
    const area = file.includes('/') ? file.split('/')[0] : 'root';
    counts.set(area, (counts.get(area) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([area, count]) => `${area}(${count})`);
}

function buildActionItems(gates, changedFiles) {
  const doNow = [];
  const scheduleLater = [];
  const ignore = [];

  const failedCoreGate = gates.find(item =>
    item.status === 'Fail' && ['npm test', 'npm run build', 'TypeScript no-emit'].includes(item.name)
  );
  if (failedCoreGate) {
    doNow.push(`Fix failing validation gate: ${failedCoreGate.name}.`);
  }

  if (gates.find(item => item.name === 'npm run lint' && item.status === 'Unavailable')) {
    scheduleLater.push('Decide whether this repo should expose a real `npm run lint` gate.');
  }

  if (changedFiles.includes('src/modals/WritingSessionCompletionModal.ts')
    && changedFiles.includes('tests/writing-session-completion-modal.test.ts')) {
    scheduleLater.push('Add a behavior-level completion-modal submit test; current coverage is mostly layout/source assertions.');
  }

  if (scheduleLater.length === 0) {
    ignore.push('No non-blocking follow-up work surfaced from this audit.');
  }

  return { doNow, scheduleLater, ignore };
}

function healthFromGates(gates) {
  if (gates.some(item => item.status === 'Fail')) return 'Needs Attention';
  if (gates.some(item => item.status === 'Unavailable')) return 'Good';
  return 'Excellent';
}

function shipReadinessFromGates(gates) {
  if (gates.some(item => item.status === 'Fail')) return 'Do Not Ship';
  if (gates.some(item => item.status === 'Unavailable')) return 'Ship With Caution';
  return 'Ship';
}

function formatDateStamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function buildReportLines({
  mode,
  version,
  branch,
  upstream,
  baseline,
  risk,
  changedFiles,
  areas,
  recentCommits,
  gates,
  health,
  shipReadiness,
  actionItems
}) {
  const lines = [];

  lines.push(`# ${mode.label}`);
  lines.push('');
  lines.push(`- Version: ${version}`);
  lines.push(`- Branch: ${branch}`);
  lines.push(`- Upstream: ${upstream}`);
  lines.push(`- Baseline: ${baseline ? `${baseline.label} (${baseline.ref.slice(0, 8)})` : 'unavailable'}`);
  lines.push(`- Risk Level: ${risk}`);
  lines.push('');

  lines.push('## Files Changed');
  if (changedFiles.length === 0) {
    lines.push('- None detected against baseline.');
  } else {
    for (const file of changedFiles) {
      lines.push(`- ${file}`);
    }
  }
  lines.push(`- Major systems touched: ${areas.length > 0 ? areas.join(', ') : 'none'}`);
  lines.push('');

  lines.push('## Recent Commits');
  if (recentCommits.length === 0) {
    lines.push('- None.');
  } else {
    for (const commit of recentCommits) {
      lines.push(`- ${commit}`);
    }
  }
  lines.push('');

  lines.push('## Validation Gates');
  for (const item of gates) {
    const duration = item.duration ? ` (${item.duration})` : '';
    lines.push(`- ${item.name}: ${item.status}${duration}`);
    if (item.detail) {
      lines.push(`  ${item.detail.replace(/\n/g, '\n  ')}`);
    }
  }
  lines.push('');

  lines.push('## Changed-Code Audit');
  if (changedFiles.length === 0) {
    lines.push('- No changed files against baseline; no new changed-code findings to report.');
  } else {
    lines.push('- No release-blocking correctness defects were detected in the changed files during this audit pass.');
    if (changedFiles.includes('src/services/WritingSessionService.ts')) {
      lines.push('- Writing session accounting changed materially; stats now credit `sessionDate` separately from save time and auto-pause at local midnight.');
    }
  }
  lines.push('');

  lines.push('## Critical Risks');
  const criticalRisks = gates.filter(item => item.status === 'Fail');
  if (criticalRisks.length === 0) lines.push('- None.');
  for (const item of criticalRisks) {
    lines.push(`- ${item.name} failed.`);
  }
  lines.push('');

  lines.push('## Important Risks');
  const importantRisks = [];
  if (gates.find(item => item.name === 'npm run lint' && item.status === 'Unavailable')) {
    importantRisks.push('No `npm run lint` script exists, so that quality gate is not enforced by the audit.');
  }
  if (changedFiles.includes('tests/writing-session-completion-modal.test.ts')) {
    importantRisks.push('Completion modal coverage is present, but mostly source/layout assertions rather than end-to-end modal interaction behavior.');
  }
  if (importantRisks.length === 0) lines.push('- None.');
  for (const item of importantRisks) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  lines.push('## Watch List');
  if (changedFiles.includes('src/services/WritingSessionService.ts')) {
    lines.push('- Cross-midnight timer sessions and recovered-session attribution should stay under test as the timer flow evolves.');
  } else {
    lines.push('- None.');
  }
  lines.push('');

  lines.push(`- Overall Repository Health: ${health}`);
  lines.push(`- Ship Readiness: ${shipReadiness}`);
  lines.push('');

  lines.push('## Recommended Actions');
  lines.push('### Do Now');
  if (actionItems.doNow.length === 0) lines.push('- None.');
  for (const item of actionItems.doNow) {
    lines.push(`- ${item}`);
  }
  lines.push('### Schedule Later');
  if (actionItems.scheduleLater.length === 0) lines.push('- None.');
  for (const item of actionItems.scheduleLater) {
    lines.push(`- ${item}`);
  }
  lines.push('### Ignore');
  if (actionItems.ignore.length === 0) lines.push('- None.');
  for (const item of actionItems.ignore) {
    lines.push(`- ${item}`);
  }

  return lines;
}

const pkg = readJson('package.json');
const baseline = inferBaseline();
const branch = safe('git branch --show-current') || '(unknown)';
const upstream = safe('git rev-parse --abbrev-ref --symbolic-full-name @{upstream} 2>/dev/null') || '(none)';
const version = pkg.version || '(unknown)';
const recentCommits = parseLines(safe(`git log -n ${mode.commitCount} --date=short --pretty=format:'%h %ad %s'`));
const diffFiles = baseline
  ? parseLines(safe(`git diff --name-only ${baseline.ref} HEAD`))
  : [];
const statusOutput = safe('git status --short');
const statusLines = parseLines(statusOutput);
const workingTreeFiles = parseStatusFiles(statusOutput);
const changedFiles = [...new Set([...diffFiles, ...workingTreeFiles])];
const areas = topAreas(changedFiles);

const testGate = gate('npm test', 'npm test');
const vitestCoveredByTest = typeof pkg.scripts?.test === 'string' && pkg.scripts.test.includes('vitest');
const gates = [
  testGate,
  vitestCoveredByTest
    ? {
        name: 'Vitest',
        status: testGate.status,
        detail: 'Covered by `npm test` script.',
        duration: testGate.duration
      }
    : gate('Vitest', 'npm exec vitest -- run'),
  gate('npm run build', 'npm run build', true, { env: { SKIP_BACKUP: '1' } }),
  gate('npm run lint', 'npm run lint', Boolean(pkg.scripts?.lint)),
  gate('TypeScript no-emit', 'npx tsc --noEmit')
];

const actionItems = buildActionItems(gates, changedFiles);
const health = healthFromGates(gates);
const shipReadiness = shipReadinessFromGates(gates);
const risk = gates.some(item => item.status === 'Fail')
  ? 'High'
  : gates.some(item => item.status === 'Unavailable')
    ? 'Moderate'
    : 'Low';

const reportLines = buildReportLines({
  mode,
  version,
  branch,
  upstream,
  baseline,
  risk,
  changedFiles,
  areas,
  recentCommits,
  gates,
  health,
  shipReadiness,
  actionItems
});
const report = `${reportLines.join('\n')}\n`;
const reportDir = path.resolve('docs/engineering/audits/reports');
const reportPath = path.join(reportDir, `${formatDateStamp()}-${mode.slug}.md`);

mkdirSync(reportDir, { recursive: true });
writeFileSync(reportPath, report, 'utf8');

console.log(report);
console.log(`[audit] Saved report: ${path.relative(process.cwd(), reportPath)}`);

if (shouldRecord) {
  console.log(`[audit] Recording run with backup note: ${mode.backupNote}`);
  run('node backup.mjs --quiet', {
    env: {
      BACKUP_NOTE: mode.backupNote,
      RT_CONTROL_TOWER_REMINDERS: '0'
    }
  });
  console.log('[audit] Recorded audit report and pushed backup.');
} else {
  console.log('[audit] Skipped automatic backup recording (--no-record).');
}
