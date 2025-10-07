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

  // Build a more descriptive commit message
  const iso = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${iso.getFullYear()}-${pad(iso.getMonth()+1)}-${pad(iso.getDate())} ${pad(iso.getHours())}:${pad(iso.getMinutes())}`;

  const files = run('git diff --cached --name-only').split('\n').filter(Boolean);
  const userNote = (process.argv.slice(2).join(' ') || '').trim() || (process.env.BACKUP_NOTE || '').trim();
  const shortstat = safeRun('git diff --cached --shortstat');
  let insertions = 0, deletions = 0;
  if (shortstat) {
    // Example: " 5 files changed, 42 insertions(+), 7 deletions(-)"
    const ins = shortstat.match(/(\d+) insertions?\(\+\)/);
    const del = shortstat.match(/(\d+) deletions?\(-\)/);
    insertions = ins ? Number(ins[1]) : 0;
    deletions  = del ? Number(del[1]) : 0;
  }

  // Summarize changed areas by top-level folder (or 'root')
  const areaCounts = new Map();
  for (const f of files) {
    const top = f.includes('/') ? f.split('/')[0] : 'root';
    areaCounts.set(top, (areaCounts.get(top) || 0) + 1);
  }
  const sortedAreas = Array.from(areaCounts.entries()).sort((a, b) => b[1] - a[1]);
  const topAreas = sortedAreas.slice(0, 3).map(([name, count]) => `${name}(${count})`).join(', ');

  // Heuristic: choose a category label for the title
  const isImage = (f) => /\.(png|jpe?g|gif|webp|svg)$/i.test(f);
  const isDoc = (f) => /(README\.md|\.mdx?$|^docs\/|wiki\/)/i.test(f);
  const isStyle = (f) => /\.css$/i.test(f);
  const isRelease = (f) => /^release\//.test(f);
  let category = '';
  if (files.length && files.every(isImage)) category = 'screenshots';
  else if (files.length && files.every(isDoc)) category = 'docs';
  else if (files.length && files.every(isStyle)) category = 'styles';
  else if (files.length && files.every(isRelease)) category = 'release';
  else if (files.some(isImage) && !files.some(f => !isImage(f))) category = 'images';

  const titleParts = [`[backup] ${dateStr}`];
  if (category) titleParts.push(category);
  if (topAreas) titleParts.push(topAreas);
  if (!userNote && files.length === 1) {
    const single = files[0];
    titleParts.push(single);
  }
  if (userNote) titleParts.push(userNote);
  titleParts.push(`${files.length} files`);
  if (insertions || deletions) titleParts.push(`+${insertions}/-${deletions}`);
  const title = titleParts.join(' — ');

  // Show a short file list (up to 12) in the body
  const maxList = 12;
  const fileList = files.slice(0, maxList).join(', ');
  const more = files.length > maxList ? `, … (+${files.length - maxList} more)` : '';
  const bodyLines = [
    topAreas ? `Areas: ${topAreas}` : '',
    fileList ? `Files: ${fileList}${more}` : ''
  ].filter(Boolean);
  const body = bodyLines.join('\n');

  // Commit
  run(`git commit -m ${JSON.stringify(title)} ${body ? '-m ' + JSON.stringify(body) : ''}`);
  console.log(`[backup] Committed changes on ${branch}: ${title}`);

  // Push
  run(`git push origin ${branch}`);
  console.log(`[backup] Pushed to origin/${branch}`);
} catch (err) {
  console.error('[backup] Failed:', err?.message || err);
  process.exit(1);
}


