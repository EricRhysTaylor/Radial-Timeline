#!/usr/bin/env node
import { execSync } from 'node:child_process';

function getBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { stdio: 'pipe' }).toString().trim();
  } catch {
    return '(no git repo)';
  }
}

const mode = (process.argv[2] || '').toLowerCase();
const branch = getBranch();

console.log(`[info] Current git branch: ${branch}`);

if (mode === 'release' && branch !== 'master') {
  console.log(`[warn] You are about to run a release while on '${branch}'. Releases must be cut from 'master'.`);
  console.log(`[hint] Run: git switch master && git pull`);
}

if (mode === 'backup') {
  console.log(`[note] Backup will commit to 'master'.`);
}


