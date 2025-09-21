#!/usr/bin/env node
import { execSync } from 'node:child_process';

function run(cmd) {
  return execSync(cmd, { stdio: 'pipe' }).toString().trim();
}

function safeRun(cmd) {
  try { return run(cmd); } catch (e) { return ''; }
}

try {
  // Ensure we are in a git repo
  run('git rev-parse --is-inside-work-tree');

  // Detect branch
  const branch = safeRun('git rev-parse --abbrev-ref HEAD') || 'master';

  // Stage all changes (including new/deleted files)
  safeRun('git add -A');

  // Check if there is anything to commit
  const status = run('git status --porcelain');
  if (!status) {
    console.log('[backup] No changes to commit.');
    process.exit(0);
  }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const msg = `[backup] ${ts}`;

  // Commit
  run(`git commit -m "${msg}"`);
  console.log(`[backup] Committed changes on ${branch}: ${msg}`);

  // Push
  run(`git push origin ${branch}`);
  console.log(`[backup] Pushed to origin/${branch}`);
} catch (err) {
  console.error('[backup] Failed:', err?.message || err);
  process.exit(1);
}


