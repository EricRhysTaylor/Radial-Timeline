import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

// Adjust if you bundle to a single styles.css
const FILES = [
  "src/styles/rt-ui.css",
  "src/styles/settings.css",
  "src/styles/legacy/apr-legacy.css",
  "styles.css", // optional: if your bundler emits this
].map((p) => path.join(ROOT, p));

const exists = (p) => fs.existsSync(p);
const read = (p) => fs.readFileSync(p, "utf8");

const FAIL = [];
const WARN = [];

function addFail(file, msg, sample) {
  FAIL.push({ file, msg, sample });
}
function addWarn(file, msg, sample) {
  WARN.push({ file, msg, sample });
}

function findAll(re, text) {
  const hits = [];
  let m;
  while ((m = re.exec(text))) hits.push(m);
  return hits;
}

/**
 * Heuristics:
 * - We allow raw colors ONLY in token blocks (lines containing --ert- or --rt- CSS vars)
 * - We require .ert-ui scoping for Obsidian classes usage (setting-item, modal, etc.)
 */
for (const file of FILES.filter(exists)) {
  const css = read(file);

  // 1) !important (fail)
  for (const m of findAll(/!important\b/g, css)) {
    addFail(file, "Found !important (ban).", "!important");
  }

  // 2) Global selectors in UI css (fail) — coarse but effective
  const globalSelectorRe = /(^|\n)\s*(\*|html|body|button|input|select|textarea)\s*\{/g;
  for (const m of findAll(globalSelectorRe, css)) {
    addFail(file, "Global element selector (likely bleed). Scope under .ert-ui.", m[2] + " {");
  }

  // 3) Raw hex colors outside token lines (fail)
  //    (skip lines that define css variables)
  const lines = css.split("\n");
  lines.forEach((line, idx) => {
    const hasHex = /#[0-9a-fA-F]{3,8}\b/.test(line);
    if (!hasHex) return;
    const isVarLine = /--[a-zA-Z0-9-_]+\s*:/.test(line);
    if (!isVarLine) {
      addFail(file, `Raw hex color outside token/var line at L${idx + 1}.`, line.trim());
    }
  });

  // 4) Obsidian class selectors not scoped under .ert-ui (fail)
  //    catches ".setting-item { ... }" etc.
  const obsidianClasses = ["setting-item", "modal", "cm-", "workspace", "markdown", "nav-file"];
  for (const cls of obsidianClasses) {
    const re = new RegExp(`(^|\\n)\\s*\\.${cls}[^,{]*\\{`, "g");
    for (const m of findAll(re, css)) {
      addFail(
        file,
        `Unscoped Obsidian selector ".${cls}…" — must be under ".ert-ui …"`,
        m[0].trim()
      );
    }
  }

  // 5) Legacy prefix usage inside rt-ui.css (fail)
  if (file.endsWith("rt-ui.css")) {
    if (/\.(rt-|rt-apr-)/.test(css)) {
      addFail(file, "Legacy .rt-* selectors detected in rt-ui.css (backslide).", ".rt-*");
    }
  }

  // 6) Token bypass for spacing (warn)
  for (const m of findAll(/\b(padding|margin|gap)\s*:\s*[^;]*\b\d+px\b/g, css)) {
    // ignore zero px
    if (/\b0px\b/.test(m[0])) continue;
    addWarn(file, "Spacing uses literal px (prefer var(--ert-*) tokens).", m[0].trim());
  }

  // 7) Token bypass for shadows (warn)
  for (const m of findAll(/\bbox-shadow\s*:\s*[^;]*\brgba?\(/g, css)) {
    addWarn(file, "Box-shadow uses raw rgba() (prefer theme vars/tokens).", m[0].trim());
  }
}

function print(items, label) {
  if (!items.length) return;
  console.log(`\n${label} (${items.length})`);
  for (const it of items.slice(0, 50)) {
    console.log(`- ${it.file}: ${it.msg}`);
    if (it.sample) console.log(`  ${it.sample}`);
  }
  if (items.length > 50) console.log(`…and ${items.length - 50} more`);
}

print(WARN, "CSS drift warnings");
print(FAIL, "CSS drift failures");

if (FAIL.length) {
  console.error("\n❌ CSS drift gate failed.");
  process.exit(1);
} else {
  console.log("\n✅ CSS drift gate passed.");
}
