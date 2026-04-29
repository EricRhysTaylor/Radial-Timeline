import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TARGET_DIRS = ["src/modals", "src/settings", "src/sceneAnalysis"];
const quiet = process.argv.includes("--quiet");

const clsPatterns = [
  /cls:\s*`([^`]+)`/g,
  /cls:\s*"([^"]+)"/g,
  /cls:\s*'([^']+)'/g,
];

const addClassPattern = /\.(?:addClass|classList\.add|toggleClass|removeClass|hasClass|classList\.remove|classList\.contains)\(([^)]*)\)/g;
const stringPattern = /`([^`]+)`|"([^"]+)"|'([^']+)'/g;
const violations = [];

const extractTokens = (raw) => {
  const cleaned = raw.replace(/\$\{[^}]+\}/g, " ");
  return cleaned.split(/\s+/).map((token) => token.trim()).filter(Boolean);
};

const addViolation = (file, line, token) => {
  violations.push({ file, line, token });
};

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
      const line = content.slice(0, index).split("\n").length;
      addViolation(filePath, line, token);
    });
  });
};

const scanDir = (relativeDir) => {
  const dirPath = path.join(ROOT, relativeDir);
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.forEach((entry) => {
    const relPath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      scanDir(relPath);
      return;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) return;
    const filePath = path.join(ROOT, relPath);
    const content = fs.readFileSync(filePath, "utf8");
    checkContent(relPath, content);
  });
};

TARGET_DIRS.forEach(scanDir);

if (violations.length > 0) {
  console.error("❌ Modal/settings ERT lock failed. rt-* classes detected:");
  violations.forEach(({ file, line, token }) => {
    console.error(`  ${file}:${line} -> ${token}`);
  });
  process.exit(1);
}

if (!quiet) {
  console.log("✅ Modal/settings ERT lock passed (no rt-* classes in modal/settings render files).");
}
