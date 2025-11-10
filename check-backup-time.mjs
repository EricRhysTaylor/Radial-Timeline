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

  // Get the timestamp of the last commit on master branch
  const lastCommitTime = safeRun('git log origin/master -1 --format=%ct');
  
  if (!lastCommitTime) {
    console.log('[backup-check] No commits found on origin/master. Backup recommended.');
    process.exit(1); // Exit code 1 means backup needed
  }

  const lastCommitTimestamp = parseInt(lastCommitTime, 10) * 1000; // Convert to milliseconds
  const now = Date.now();
  const hourInMs = 60 * 60 * 1000;
  const timeSinceLastCommit = now - lastCommitTimestamp;

  if (timeSinceLastCommit > hourInMs) {
    const hoursAgo = Math.floor(timeSinceLastCommit / hourInMs);
    const minutesAgo = Math.floor((timeSinceLastCommit % hourInMs) / (60 * 1000));
    console.log(`[backup-check] Last backup was ${hoursAgo}h ${minutesAgo}m ago. Running backup...`);
    process.exit(1); // Exit code 1 means backup needed
  } else {
    const minutesAgo = Math.floor(timeSinceLastCommit / (60 * 1000));
    console.log(`[backup-check] Last backup was ${minutesAgo}m ago. No backup needed.`);
    process.exit(0); // Exit code 0 means no backup needed
  }
} catch (err) {
  console.error('[backup-check] Failed:', err?.message || err);
  process.exit(0); // Don't fail the build if check fails
}

