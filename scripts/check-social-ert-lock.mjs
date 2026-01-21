import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SOCIAL_RENDER_FILES = [
  "src/settings/sections/AuthorProgressSection.ts",
  "src/settings/sections/CampaignManagerSection.ts",
];

const ALLOWED_PREFIXES = ["rt-settings-tab", "rt-settings-tab-", "rt-settings-social-content"];
const ALLOWED_CLASSES = new Set(["rt-hidden", "rt-settings-tab-content"]);

const clsPatterns = [
  /cls:\s*`([^`]+)`/g,
  /cls:\s*"([^"]+)"/g,
  /cls:\s*'([^']+)'/g,
];

const addClassPattern = /\.(?:addClass|classList\.add)\(([^)]*)\)/g;
const stringPattern = /`([^`]+)`|"([^"]+)"|'([^']+)'/g;

const violations = [];

const isAllowed = (token) => {
  if (ALLOWED_CLASSES.has(token)) return true;
  return ALLOWED_PREFIXES.some((prefix) => token.startsWith(prefix));
};

const extractTokens = (raw) => {
  const cleaned = raw.replace(/\$\{[^}]+\}/g, " ");
  return cleaned.split(/\s+/).map((token) => token.trim()).filter(Boolean);
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
      if (isAllowed(token)) return;
      const line = content.slice(0, index).split("\n").length;
      violations.push({ file: filePath, line, token });
    });
  });
};

SOCIAL_RENDER_FILES.forEach((relativePath) => {
  const filePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  checkContent(relativePath, content);
});

if (violations.length > 0) {
  console.error("❌ Social ERT lock failed. rt-* classes detected:");
  violations.forEach(({ file, line, token }) => {
    console.error(`  ${file}:${line} -> ${token}`);
  });
  process.exit(1);
}

console.log("✅ Social ERT lock passed (no rt-* classes in Social render files).");
