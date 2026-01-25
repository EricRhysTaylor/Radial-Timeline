#!/usr/bin/env node
import { execSync } from 'node:child_process';

function run(cmd, options = {}) {
  return execSync(cmd, { stdio: 'inherit', ...options });
}

function safeRun(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe' });
    return true;
  } catch (e) {
    return false;
  }
}

try {
  // Check if backup is needed (more than 1 hour since last commit)
  const backupNeeded = !safeRun('node check-backup-time.mjs');
  
  // Run the actual build steps
  console.log('\n[build] Running build steps...\n');
  run('node show-scripts.mjs');
  run('node scripts/check-social-ert-lock.mjs');
  run('node scripts/check-inquiry-ert-lock.mjs');
  run('node check-gross-deletions.mjs');
  run('node scripts/bundle-css.mjs'); // Generate CSS before checking it
  run('npx tsc --noEmit');
  run('node code-quality-check.mjs src/main.ts src/styles/settings.css --quiet');
  run('node check-css-duplicates.mjs --quiet');
  run('node esbuild.config.mjs production');
  
  console.log('\n[build] ✅ Build completed successfully\n');
  
  // If backup is needed, run it
  if (backupNeeded) {
    console.log('[build] Running automatic backup...\n');
    run('npm run backup -- "automatic backup after build"');
  }
  
  process.exit(0);
} catch (err) {
  console.error('[build] Build failed:', err?.message || err);
  process.exit(1);
}
