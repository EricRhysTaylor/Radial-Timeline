#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const projectRoot = process.cwd();
const SRC_DIR = path.join(projectRoot, 'src');
const ROOT_FILES = [path.join(projectRoot, 'README.md'), path.join(projectRoot, 'manifest.json')];

/*
 * LIFECYCLE LEAK GUARDS (Obsidian Component Pattern)
 * 
 * Obsidian plugins should use Component lifecycle APIs for automatic cleanup:
 * 
 * 1. this.registerDomEvent(el, 'event', handler) - NOT addEventListener
 * 2. this.registerEvent(workspace.on(...)) - for workspace events
 * 3. this.registerInterval(setInterval(...)) - for timers
 * 4. this.register(() => cleanup()) - for observers, animation frames, etc.
 * 5. fetch with AbortController signal + this.register(() => ctrl.abort())
 * 6. Remove old DOM subtrees before re-render (prevent detached nodes)
 * 7. Use WeakMap for per-element state (prevent strong references)
 * 8. Call library.dispose?.() on unload
 * 
 * See: https://docs.obsidian.md/Reference/TypeScript+API/Component
 */

const checks = [
  {
    id: 'innerHTML',
    description: 'Avoid assigning to innerHTML; construct DOM nodes instead.',
    regex: /\.innerHTML\s*=\s*/,
    allowSafeComment: true,
    severity: 'error',
  },
  {
    id: 'adapter',
    description: 'Prefer the Vault API over the Adapter API.',
    regex: /\bvault\.adapter\b/,
    allowSafeComment: true,
    severity: 'error',
  },
  {
    id: 'fetch',
    description: 'Use requestUrl instead of fetch for network access.',
    regex: /\bfetch\s*\(/,
    allowSafeComment: true,
    severity: 'error',
  },
  {
    id: 'xhr',
    description: 'Use requestUrl instead of XMLHttpRequest.',
    regex: /new\s+XMLHttpRequest\s*\(/,
    allowSafeComment: true,
    severity: 'error',
  },
  {
    id: 'markdown-render-source',
    description: 'When using MarkdownRenderer.render, pass an empty source path when not rendering a file.',
    regex: /MarkdownRenderer\.render\([^,]+,[^,]+,[^,]+,\s*['"][^'"]+['"]/,
    allowSafeComment: true,
    severity: 'error',
  },
  {
    id: 'eval',
    description: 'Avoid eval; never execute arbitrary code.',
    regex: /\beval\s*\(/,
    allowSafeComment: false,
    severity: 'error',
  },
  {
    id: 'new-function',
    description: 'Avoid new Function; never execute arbitrary code.',
    regex: /new\s+Function\s*\(/,
    allowSafeComment: false,
    severity: 'error',
  },
  {
    id: 'node-core-import',
    description: 'Do not import Node core modules in plugin code; use Obsidian APIs instead.',
    // Only meaningful for ESM import statements
    regex: /from\s+['\"](?:fs|path|child_process|os|net|tls|http|https)['\"]/,
    allowSafeComment: true,
    severity: 'error',
  },
  {
    id: 'node-core-require',
    description: 'Do not require Node core modules in plugin code; use Obsidian APIs instead.',
    regex: /require\(\s*['\"](?:fs|path|child_process|os|net|tls|http|https)['\"]\s*\)/,
    allowSafeComment: true,
    severity: 'error',
  },
  {
    id: 'outerHTML',
    description: 'Avoid assigning to outerHTML; construct DOM nodes instead.',
    regex: /\.outerHTML\s*=\s*/,
    allowSafeComment: true,
    severity: 'error',
  },
  {
    id: 'console-log',
    description: 'Avoid console.log/debug in plugin code; use plugin.log and controlled debugging.',
    regex: /console\.(log|debug)\s*\(/,
    allowSafeComment: true,
    severity: 'error',
  },
  {
    id: 'nodejs-timeout-type',
    description: 'Use number for timeout handles, not NodeJS.Timeout.',
    regex: /\bNodeJS\.Timeout\b/,
    allowSafeComment: true,
    severity: 'warn',
  },
  {
    id: 'bare-timeout-call',
    description: 'Use window.setTimeout/window.clearTimeout for timer calls.',
    regex: /(^|[^.])(setTimeout|clearTimeout)\s*\(/m,
    allowSafeComment: true,
    severity: 'warn',
  },
  {
    id: 'secret-openai',
    description: 'Potential OpenAI API key detected (sk-...) — remove from code.',
    regex: /sk-[A-Za-z0-9]{20,}/,
    allowSafeComment: false,
    severity: 'error',
  },
  {
    id: 'secret-anthropic',
    description: 'Potential Anthropic API key detected (sk-ant-...) — remove from code.',
    regex: /sk-ant-[A-Za-z0-9-]{20,}/,
    allowSafeComment: false,
    severity: 'error',
  },
  {
    id: 'secret-google',
    description: 'Potential Google API key detected (AIza...) — remove from code.',
    regex: /AIza[0-9A-Za-z-_]{30,}/,
    allowSafeComment: false,
    severity: 'error',
  },
  {
    id: 'var-declaration',
    description: 'Use const or let instead of var for variable declarations.',
    regex: /\bvar\s+\w+/,
    allowSafeComment: true,
    severity: 'warn',
  },
  {
    id: 'platform-import-check',
    description: 'Platform checks require importing Platform from obsidian.',
    regex: /\bPlatform\.isMobile\b/,
    allowSafeComment: true,
    severity: 'warn',
  },
  {
    id: 'detach-leaves-in-onunload',
    description: 'Do NOT detach leaves in onunload() - Obsidian handles this automatically (antipattern).',
    regex: /detachLeavesOfType/,
    allowSafeComment: false,
    severity: 'error',
  },
  {
    id: 'persistent-view-reference',
    description: 'Do NOT store persistent references to views as properties. Use getLeavesOfType() instead (antipattern).',
    // Match property declarations like: private myView: RadialTimelineView or public view: ItemView
    regex: /(private|public)\s+\w*[Vv]iew\w*:\s*(RadialTimelineView|ItemView|MarkdownView)\s*[;=]/,
    allowSafeComment: true,
    severity: 'error',
  },
  {
    id: 'normalize-path-missing',
    description: 'User-defined paths should use normalizePath() before assignment to settings.',
    // Match path assignments, but exclude normalizePath() calls and safe variable names
    // The lookahead must account for optional whitespace before the value
    regex: /\.settings\.\w*[Pp]ath\s*=\s*(?!normalizePath\(|[a-zA-Z_]*(?:normaliz|valid|clean|safe)[a-zA-Z_]*\s*[;\)])/,
    allowSafeComment: true,
    severity: 'warn',
  },
  // LIFECYCLE LEAK GUARDS: Obsidian Component pattern enforcement
  {
    id: 'raw-addEventListener',
    description: 'Use this.registerDomEvent() instead of addEventListener for automatic cleanup (memory leak).',
    // Match addEventListener calls (will be filtered in runChecks to exclude registerDomEvent contexts)
    regex: /\.addEventListener\s*\(/,
    allowSafeComment: true,
    severity: 'error',
  },
  {
    id: 'fetch-without-signal',
    description: 'Use fetch with {signal} for abortable requests (memory leak).',
    // Match fetch calls without signal parameter
    regex: /\bfetch\s*\([^)]*\)(?!\s*\.|\s*,\s*\{[^}]*signal)/,
    allowSafeComment: true,
    severity: 'warn',
  },
  {
    id: 'observer-without-cleanup',
    description: 'Observers must be disconnected via this.register(() => observer.disconnect()) (memory leak).',
    // Match observer instantiation without register cleanup nearby
    regex: /new\s+(ResizeObserver|MutationObserver|IntersectionObserver)\s*\(/,
    allowSafeComment: true,
    severity: 'warn',
  },
  {
    id: 'animation-frame-without-cleanup',
    description: 'Use this.register(() => cancelAnimationFrame(id)) for animation frames (memory leak).',
    // Match requestAnimationFrame without register cleanup
    regex: /requestAnimationFrame\s*\(/,
    allowSafeComment: true,
    severity: 'warn',
  },
  {
    id: 'interval-without-register',
    description: 'Use this.registerInterval(setInterval(...)) instead of bare setInterval (memory leak).',
    // Match setInterval not wrapped in registerInterval
    regex: /(?<!registerInterval\s*\(\s*)setInterval\s*\(/,
    allowSafeComment: true,
    severity: 'warn',
  },
  {
    id: 'svg-innerHTML-reassignment',
    description: 'Remove old SVG subtree (oldSvg.remove()) before assigning new innerHTML to prevent detached node leaks.',
    // Match innerHTML assignment in SVG context
    regex: /svg[^;]*\.innerHTML\s*=/i,
    allowSafeComment: true,
    severity: 'warn',
  },
];

// Provide human-friendly autofix suggestions
function getSuggestion(issue) {
  const id = issue.id;
  switch (id) {
    case 'innerHTML':
      return "Use element.textContent for text or createElement/appendChild to build nodes.";
    case 'outerHTML':
      return "Rebuild the element via DOM APIs and replace it, rather than assigning outerHTML.";
    case 'fetch':
      return "Replace fetch(...) with requestUrl({ url, method, headers, body }) and import { requestUrl } from 'obsidian'.";
    case 'xhr':
      return "Replace XMLHttpRequest with requestUrl({ ... }) from 'obsidian'.";
    case 'adapter':
      return "Use app.vault APIs (read, create, modify, getAbstractFileByPath) instead of vault.adapter.";
    case 'eval':
    case 'new-function':
      return "Remove dynamic code execution and refactor to static, explicit logic.";
    case 'node-core-import':
    case 'node-core-require':
      return "Avoid Node core in plugin runtime. Move to build scripts or use Obsidian APIs (Vault, Workspace).";
    case 'console-log':
      return "Remove console logs or route through a debug-flagged logger; prefer no logs in production.";
    case 'secret-openai':
    case 'secret-anthropic':
    case 'secret-google':
      return "Remove committed keys, load keys from plugin settings, and rotate the leaked key.";
    case 'markdown-render-source':
      return "Pass '' as the source path to MarkdownRenderer.render when not rendering a file.";
    case 'requestUrl-import':
      return "Add: import { requestUrl } from 'obsidian' in this file.";
    case 'manifest-required':
      return "Add the missing field to manifest.json with correct value.";
    case 'manifest-id-kebab':
      return "Set manifest.id to lowercase kebab-case (e.g., radial-timeline).";
    case 'manifest-id-match':
      return "Align manifest.id with package.json name (choose one and update the other).";
    case 'manifest-minApp':
      return "Add a valid minAppVersion string (e.g., '1.4.0').";
    case 'release-version-match':
      return "Update release/manifest.json version to match manifest.json (rebuild release).";
    case 'pkg-version-match':
      return "Align package.json version with manifest.json (or vice versa).";
    case 'release-artifacts':
      return "Run the build/release pipeline to generate release/main.js and release/styles.css.";
    case 'manifest-parse-fail':
      return "Fix JSON syntax in manifest/package.json and ensure they parse.";
    case 'var-declaration':
      return "Replace 'var' with 'const' (for immutable values) or 'let' (for mutable values).";
    case 'platform-import-check':
      return "Add: import { Platform } from 'obsidian' to use Platform.isMobile.";
    case 'detach-leaves-in-onunload':
      return "Remove detachLeavesOfType from onunload() - Obsidian automatically detaches leaves when plugin unloads.";
    case 'persistent-view-reference':
      return "Remove persistent view property. Instead, use helper methods that call getLeavesOfType() when needed. See: https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines#Avoid+managing+references+to+custom+views";
    case 'normalize-path-missing':
      return "User paths should be normalized: use normalizePath() before assignment, or assign a pre-normalized variable.";
    case 'raw-addEventListener':
      return "Replace element.addEventListener('event', handler) with this.registerDomEvent(element, 'event', handler) for automatic cleanup.";
    case 'fetch-without-signal':
      return "Add AbortController: const ctrl = new AbortController(); this.register(() => ctrl.abort()); fetch(url, { signal: ctrl.signal }).";
    case 'observer-without-cleanup':
      return "Add cleanup: const observer = new ResizeObserver(...); observer.observe(el); this.register(() => observer.disconnect());";
    case 'animation-frame-without-cleanup':
      return "Add cleanup: const rafId = requestAnimationFrame(fn); this.register(() => cancelAnimationFrame(rafId));";
    case 'interval-without-register':
      return "Replace setInterval(...) with this.registerInterval(setInterval(...)) for automatic cleanup.";
    case 'svg-innerHTML-reassignment':
      return "Before innerHTML assignment: if (oldSvg) { oldSvg.remove(); oldSvg = null; } to prevent detached node leaks.";
    default:
      return '';
  }
}

async function collectFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'release' || entry.name === 'scripts') continue;
      files.push(...await collectFiles(full));
    } else if (/\.(ts|js|md|mjs)$/i.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function runChecks(filePath, text) {
  const issues = [];
  const lines = text.split(/\r?\n/);
  for (const check of checks) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const prevLine = i > 0 ? lines[i - 1] : '';
      if (check.allowSafeComment && (/SAFE:/i.test(line) || /SAFE:/i.test(prevLine))) continue;
      
      // Special handling for addEventListener check - skip if part of registerDomEvent call
      if (check.id === 'raw-addEventListener' && check.regex.test(line)) {
        // Skip if line contains registerDomEvent (this is the correct pattern)
        if (/registerDomEvent/.test(line)) continue;
        // Skip if it's in a comment or string about the correct pattern
        if (/\/\/.*addEventListener/.test(line) || /['"].*addEventListener.*['"]/.test(line)) continue;
      }
      
      if (check.regex.test(line)) {
        issues.push({
          file: filePath,
          line: i + 1,
          column: line.indexOf(line.match(check.regex)[0]) + 1,
          message: check.description,
          snippet: line.trim(),
          severity: check.severity || 'error',
          id: check.id,
          suggestion: ''
        });
      }
    }
  }

  // Additional per-file rule: if requestUrl( is used, ensure obsidian import includes it
  if (/\brequestUrl\s*\(/.test(text)) {
    const hasImport = /from\s+['\"]obsidian['\"]/m.test(text) && /\brequestUrl\b/.test(text);
    if (!hasImport) {
      issues.push({
        file: filePath,
        line: 1,
        column: 1,
        message: 'requestUrl used but not imported from obsidian in this file',
        snippet: '',
        severity: 'error',
        id: 'requestUrl-import',
        suggestion: ''
      });
    }
  }
  return issues;
}

(async function main() {
  const files = [...await collectFiles(SRC_DIR), ...ROOT_FILES.filter(async p => {
    try { await fs.access(p); return true; } catch { return false; }
  })];
  const issues = [];
  for (const file of files) {
    let text;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    issues.push(...runChecks(path.relative(projectRoot, file), text));
  }

  // Manifest checks (basic consistency and required fields)
  try {
    const manifestPath = path.join(projectRoot, 'manifest.json');
    const releaseManifestPath = path.join(projectRoot, 'release', 'manifest.json');
    const packagePath = path.join(projectRoot, 'package.json');

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    const pkg = JSON.parse(await fs.readFile(packagePath, 'utf8'));
    let releaseManifest = null;
    try {
      releaseManifest = JSON.parse(await fs.readFile(releaseManifestPath, 'utf8'));
    } catch {}

    const required = ['id', 'name', 'version', 'minAppVersion', 'description', 'author'];
    for (const key of required) {
      if (!(key in manifest)) {
        issues.push({ file: 'manifest.json', line: 1, column: 1, message: `manifest.json missing required field: ${key}`, snippet: '', severity: 'error', id: 'manifest-required', suggestion: '' });
      }
    }
    // id should be kebab-case and match package name (soft check)
    if (pkg && pkg.name && manifest && manifest.id && pkg.name !== manifest.id) {
      issues.push({ file: 'manifest.json', line: 1, column: 1, message: `manifest.id (${manifest.id}) should match package.json name (${pkg.name})`, snippet: '', severity: 'warn', id: 'manifest-id-match', suggestion: '' });
    }
    if (!/^[a-z0-9-]+$/.test(manifest.id)) {
      issues.push({ file: 'manifest.json', line: 1, column: 1, message: `manifest.id should be lowercase kebab-case (a-z0-9-)`, snippet: manifest.id, severity: 'error', id: 'manifest-id-kebab', suggestion: '' });
    }
    // minAppVersion should exist
    if (!manifest.minAppVersion) {
      issues.push({ file: 'manifest.json', line: 1, column: 1, message: 'manifest.minAppVersion is required by Obsidian', snippet: '', severity: 'error', id: 'manifest-minApp', suggestion: '' });
    }
    // release manifest version should match source manifest
    if (releaseManifest && releaseManifest.version !== manifest.version) {
      issues.push({ file: 'release/manifest.json', line: 1, column: 1, message: `release manifest version (${releaseManifest.version}) should match manifest.json (${manifest.version})`, snippet: '', severity: 'error', id: 'release-version-match', suggestion: '' });
    }
    // Package version mismatch is a warning; surface as issue for visibility
    if (pkg && pkg.version && manifest && manifest.version && pkg.version !== manifest.version) {
      issues.push({ file: 'package.json', line: 1, column: 1, message: `package.json version (${pkg.version}) differs from manifest.json version (${manifest.version})`, snippet: '', severity: 'warn', id: 'pkg-version-match', suggestion: '' });
    }

    // Release folder required files (warn only; should not be committed per guidelines)
    const releaseMain = path.join(projectRoot, 'release', 'main.js');
    const releaseCss = path.join(projectRoot, 'release', 'styles.css');
    try { await fs.access(releaseMain); } catch { issues.push({ file: 'release/main.js', line: 1, column: 1, message: 'Missing release/main.js (build artifact)', snippet: '', severity: 'warn', id: 'release-artifacts', suggestion: '' }); }
    try { await fs.access(releaseCss); } catch { issues.push({ file: 'release/styles.css', line: 1, column: 1, message: 'Missing release/styles.css (build artifact)', snippet: '', severity: 'warn', id: 'release-artifacts', suggestion: '' }); }

    // Warn only if files under release/ are currently tracked by git
    try {
      const tracked = execSync('git ls-files -- release', { cwd: projectRoot, stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
      if (tracked) {
        issues.push({ file: 'release/', line: 1, column: 1, message: 'release/ files are tracked in git; remove from repo and .gitignore them', snippet: tracked.split('\n')[0], severity: 'warn', id: 'release-ignored', suggestion: 'Add release/ to .gitignore and run: git rm -r --cached release' });
      }
    } catch {}
  } catch (e) {
    issues.push({ file: 'manifest.json', line: 1, column: 1, message: `Failed to parse/validate manifest/package.json: ${e?.message || e}`, snippet: '', severity: 'error', id: 'manifest-parse-fail', suggestion: '' });
  }

  if (issues.length === 0) {
    console.log('✅ Obsidian compliance checks passed.');
    console.log('📖 See CODE_STANDARDS.md for full guidelines.');
    process.exit(0);
  }

  // Attach suggestions
  for (const issue of issues) {
    if (!issue.suggestion) issue.suggestion = getSuggestion(issue);
  }

  const errors = issues.filter(i => i.severity !== 'warn');
  const warnings = issues.filter(i => i.severity === 'warn');

  if (warnings.length) {
    console.warn('⚠️  Warnings:\n');
    for (const issue of warnings) {
      console.warn(`- ${issue.file}:${issue.line}:${issue.column} — ${issue.message}`);
      if (issue.snippet) console.warn(`  ${issue.snippet}`);
      if (issue.suggestion) console.warn(`  ↳ Suggestion: ${issue.suggestion}`);
    }
    console.warn('');
  }

  if (errors.length) {
    console.error('❌ Errors:\n');
    for (const issue of errors) {
      console.error(`- ${issue.file}:${issue.line}:${issue.column} — ${issue.message}`);
      if (issue.snippet) console.error(`  ${issue.snippet}`);
      if (issue.suggestion) console.error(`  ↳ Suggestion: ${issue.suggestion}`);
    }
    console.error('\n📖 See CODE_STANDARDS.md for detailed guidelines and best practices.');
    process.exit(1);
  } else {
    // Only warnings
    console.log('📖 See CODE_STANDARDS.md for full guidelines.');
    process.exit(0);
  }
})();
