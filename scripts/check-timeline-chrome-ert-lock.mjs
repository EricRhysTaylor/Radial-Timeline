import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const POLICY_PATH = path.join(ROOT, "scripts/css-namespace-allowlist.json");
const TARGET_FILE = "src/view/TimeLineView.ts";
const quiet = process.argv.includes("--quiet");

const policy = JSON.parse(fs.readFileSync(POLICY_PATH, "utf8"));
const allowedPrefixes =
  policy?.legacyIslands?.timelineChromeTs?.allowedRtClassPrefixes ?? [];

const clsPatterns = [
  /cls:\s*`([^`]+)`/g,
  /cls:\s*"([^"]+)"/g,
  /cls:\s*'([^']+)'/g,
  /\.className\s*=\s*`([^`]+)`/g,
  /\.className\s*=\s*"([^"]+)"/g,
  /\.className\s*=\s*'([^']+)'/g,
];

const addClassPattern = /\.(?:addClass|classList\.add)\(([^)]*)\)/g;
const stringPattern = /`([^`]+)`|"([^"]+)"|'([^']+)'/g;
const violations = [];

const extractTokens = (raw) => {
  const cleaned = raw.replace(/\$\{[^}]+\}/g, " ");
  return cleaned.split(/\s+/).map((token) => token.trim()).filter(Boolean);
};

const isAllowed = (token) => allowedPrefixes.some((prefix) => token.startsWith(prefix));

const checkContent = (filePath, content) => {
  const matches = [];

  clsPatterns.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(content))) {
      matches.push({ value: match[1], index: match.index });
    }
  });

  let addMatch;
  while ((addMatch = addClassPattern.exec(content))) {
    const args = addMatch[1];
    let strMatch;
    while ((strMatch = stringPattern.exec(args))) {
      const value = strMatch[1] ?? strMatch[2] ?? strMatch[3] ?? "";
      matches.push({ value, index: addMatch.index });
    }
  }

  matches.forEach(({ value, index }) => {
    const tokens = extractTokens(value);
    tokens.forEach((token) => {
      if (!token.startsWith("rt-")) return;
      if (isAllowed(token)) return;
      const line = content.slice(0, index).split("\n").length;
      violations.push({ file: filePath, line, token });
    });
  });
};

const filePath = path.join(ROOT, TARGET_FILE);
if (fs.existsSync(filePath)) {
  const content = fs.readFileSync(filePath, "utf8");
  checkContent(TARGET_FILE, content);
}

if (violations.length > 0) {
  console.error("❌ Timeline chrome ERT lock failed. Unexpected rt-* class creation detected:");
  violations.forEach(({ file, line, token }) => {
    console.error(`  ${file}:${line} -> ${token}`);
  });
  console.error("Use ert-timeline-* for new Timeline view chrome. Only allowlisted legacy rt-* chrome may remain.");
  process.exit(1);
}

if (!quiet) {
  console.log("✅ Timeline chrome ERT lock passed (no unexpected rt-* class creation in TimeLineView.ts).");
}
