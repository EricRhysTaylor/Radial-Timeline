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

const args = new Set(process.argv.slice(2));
const MIGRATION_MODE = args.has("--migration") || process.env.CSS_DRIFT_MODE === "migration";
const WRITE_BASELINE = args.has("--write-baseline") || args.has("--update-baseline");
const BASELINE_PATH = path.join(ROOT, "scripts/css-drift-baseline.json");

const FAIL = [];
const WARN = [];

function addFail(file, msg, sample, rule) {
  FAIL.push({ file, msg, sample, rule });
}
function addWarn(file, msg, sample, rule) {
  WARN.push({ file, msg, sample, rule });
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
    addFail(file, "Found !important (ban).", "!important", "important");
  }

  // 2) Global selectors in UI css (fail) — coarse but effective
  const globalSelectorRe = /(^|\n)\s*(\*|html|body|button|input|select|textarea)\s*\{/g;
  for (const m of findAll(globalSelectorRe, css)) {
    addFail(file, "Global element selector (likely bleed). Scope under .ert-ui.", m[2] + " {", "global-element");
  }

  // 3) Raw hex colors outside token lines (fail in strict, warn in migration)
  //    (skip lines that define css variables)
  const lines = css.split("\n");
  lines.forEach((line, idx) => {
    const hasHex = /#[0-9a-fA-F]{3,8}\b/.test(line);
    if (!hasHex) return;
    const isVarLine = /--[a-zA-Z0-9-_]+\s*:/.test(line);
    if (!isVarLine) {
      const rule = "raw-hex";
      if (MIGRATION_MODE) {
        addWarn(file, `Raw hex color outside token/var line at L${idx + 1}.`, line.trim(), rule);
      } else {
        addFail(file, `Raw hex color outside token/var line at L${idx + 1}.`, line.trim(), rule);
      }
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
        m[0].trim(),
        "unscoped-obsidian"
      );
    }
  }

  // 5) Legacy prefix usage inside rt-ui.css (fail)
  if (file.endsWith("rt-ui.css")) {
    if (/\.(rt-|rt-apr-)/.test(css)) {
      addFail(file, "Legacy .rt-* selectors detected in rt-ui.css (backslide).", ".rt-*", "rt-in-rt-ui");
    }
  }

  // 6) Legacy rt-* selectors outside rt-ui.css (warn in migration)
  if (!file.endsWith("rt-ui.css")) {
    const rtSelectorRe = /(^|\n)\s*[^@{]*\brt-[a-zA-Z0-9_-]+[^,{]*\{/g;
    for (const m of findAll(rtSelectorRe, css)) {
      addWarn(file, "Legacy .rt-* selector (migration warning).", m[0].trim(), "rt-legacy");
    }
  }

  // 7) Token bypass for spacing (warn)
  for (const m of findAll(/\b(padding|margin|gap)\s*:\s*[^;]*\b\d+px\b/g, css)) {
    // ignore zero px
    if (/\b0px\b/.test(m[0])) continue;
    addWarn(file, "Spacing uses literal px (prefer var(--ert-*) tokens).", m[0].trim(), "spacing-px");
  }

  // 8) Token bypass for shadows (warn)
  for (const m of findAll(/\bbox-shadow\s*:\s*[^;]*\brgba?\(/g, css)) {
    addWarn(file, "Box-shadow uses raw rgba() (prefer theme vars/tokens).", m[0].trim(), "shadow-rgba");
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

const warnSummary = WARN.reduce(
  (acc, it) => {
    const rule = it.rule || "unknown";
    acc.total += 1;
    acc.byRule[rule] = (acc.byRule[rule] || 0) + 1;
    return acc;
  },
  { total: 0, byRule: {} }
);

if (WRITE_BASELINE) {
  const payload = {
    totalWarnings: warnSummary.total,
    warningsByRule: warnSummary.byRule,
    updatedAt: new Date().toISOString(),
    migrationMode: MIGRATION_MODE,
  };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2));
  console.log(`\n🧭 Wrote CSS drift baseline to ${BASELINE_PATH}`);
}

if (MIGRATION_MODE && !WRITE_BASELINE) {
  const baseline = exists(BASELINE_PATH) ? JSON.parse(read(BASELINE_PATH)) : null;
  if (!baseline) {
    addFail(
      BASELINE_PATH,
      "Missing drift baseline. Run with --write-baseline to capture the current WARN budget.",
      "baseline missing",
      "warn-budget"
    );
  } else if (warnSummary.total > (baseline.totalWarnings ?? 0)) {
    addFail(
      BASELINE_PATH,
      `WARN budget exceeded: ${warnSummary.total} > ${baseline.totalWarnings}.`,
      "warn budget",
      "warn-budget"
    );
  }
}

if (FAIL.length) {
  console.error("\n❌ CSS drift gate failed.");
  process.exit(1);
} else {
  console.log("\n✅ CSS drift gate passed.");
}
