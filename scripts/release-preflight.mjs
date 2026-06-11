#!/usr/bin/env node
import { execSync } from 'node:child_process';

function run(command, description) {
  console.log(`\n[release-preflight] ${description}...`);
  execSync(command, { cwd: process.cwd(), stdio: 'inherit' });
}

function isFriday(date = new Date()) {
  return date.getDay() === 5;
}

function isBiweeklyDeepAuditDue(reference = new Date()) {
  const anchor = new Date(2026, 4, 27, 12, 0, 0, 0);
  if (reference < anchor) return false;
  const intervalMs = 14 * 24 * 60 * 60 * 1000;
  const elapsedIntervals = Math.floor((reference.getTime() - anchor.getTime()) / intervalMs);
  const dueAt = new Date(anchor.getTime() + elapsedIntervals * intervalMs);
  return reference >= dueAt;
}

const now = new Date();
const primaryAudit = isFriday(now) ? 'auditFriday' : 'auditDaily';

run(`npm run ${primaryAudit}`, `Running ${primaryAudit}`);
run('npm run release:i18n', 'Checking i18n release alignment');
run('npm run review:obsidian', 'Running Obsidian review readiness');
run('npm run release:eyeball', 'Printing eyeball checklist');

if (isBiweeklyDeepAuditDue(now)) {
  console.log('\n[release-preflight] Biweekly Deep Audit is due or overdue.');
  console.log('[release-preflight] Optional follow-up: npm run auditDeep');
}

console.log('\n[release-preflight] Complete.');
